import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { lastCommits } from '../ledger/receipts.js';
import { assertFeature } from '../work/features.js';
import { checkPlanFor } from './sync.js';
import { checksDigestFor, pipelineFor } from './level-pipeline.js';
import { receiptRecorded } from './steps/common.js';

export const RECOMMIT_MODE = 'recommit';
export const isRecommit = (run) => run?.mode === RECOMMIT_MODE;

/**
 * 다시 커밋이 필요한 노드인가: 커밋 기록이 있는데 지금 본문이 커밋 원고와 다르거나(손수정·이름 바꾸기),
 * 앞머리만 committed 이고 커밋 기록이 없는 노드, 가져온(imported) 노드. 그 밖(커밋 안 된 노드, 바뀌지 않은 노드)은 보통 실행으로 돈다.
 * 자식 없는 가지는(구조가 온전하지 않다) 다시 커밋 대상이 아니다 — 자식 단계가 자식 검사를 건너뛸 길을 만들지 않는다.
 */
export function assertRecommitNeeded(ctx, node) {
  assertFeature(ctx.work.config, 'recommit');
  const commit = lastCommits(ctx.receiptRecords).get(node.id);
  const drifted = commit ? sha256(node.body) !== commit.committedHash : node.status === 'committed' || node.status === 'imported';
  if (!drifted) throw new FolioError('RECOMMIT_NOT_NEEDED', `${node.id} has no changed committed text; use a normal run`, { nodeId: node.id });
  if (!node.body.trim()) throw new FolioError('RECOMMIT_EMPTY', `${node.id} has no text to commit`, { nodeId: node.id });
  if (node.kind === 'branch' && node.children.length === 0) {
    throw new FolioError('RECOMMIT_NO_CHILDREN', `${node.id} is a branch with no children`, { nodeId: node.id });
  }
}

/**
 * 지금 파일 본문을 원고로 삼는 실행. 파이프라인은 보통 실행과 같다 — 원고(가지는 계획)를 모델에 묻지 않고 파일에서 채울 뿐이다.
 * 추출·검사·수정 루프·게이트·커밋·영수증·판정 대조·hash 잠금은 그대로다.
 * baseHash: 커밋 기록의 hash(옛 글) 또는 null(커밋 기록 없이 committed 로 남은 노드).
 */
export function newRecommitRun(ctx, node, { newId, now }) {
  const at = now();
  const ref = { nodeId: node.id, level: node.level, nodeKind: node.kind };
  const pipeline = pipelineFor(ctx, ref);
  const commit = lastCommits(ctx.receiptRecords).get(node.id);
  return {
    runId: newId('run'), nodeId: node.id, variant: 'main', nodeKind: node.kind, level: node.level, mode: RECOMMIT_MODE,
    pipelineDigest: pipeline.digest, checksDigest: checksDigestFor(ctx, ref), featuresDigest: ctx.featuresDigest, trackingStateDigest: ctx.trackingStateDigest,
    cursor: 0, state: 'active',
    outputs: { draft: node.body, ...(node.kind === 'branch' ? { plan: node.body } : {}) }, draftHash: sha256(node.body),
    fileHash: sha256(node.body), baseHash: commit?.committedHash ?? null, results: {}, attempts: 0, retries: {}, inbox: {}, pending: null,
    approval: null, overridden: [], receipt: null, checkPlan: checkPlanFor(ctx, pipeline), deactivated: [], createdAt: at, updatedAt: at, history: [],
  };
}

/**
 * 다시 커밋 실행이 잠긴 상태(committing 이고 기록장에 영수증이 이미 들어감)인가.
 * 이때만 기능 끄기·파일 재변경 점검을 건너뛰고 그대로 끝맺는다 — 이미 검사한 글로 커밋을 시작했으니
 * 잠금(커밋 원고 hash = 검사 원고 hash)이 끝맺음을 요구한다. 그 앞(영수증 없음)에는 이 예외가 걸리지 않는다.
 */
export function recommitLocked(ctx, run) {
  return isRecommit(run) && run.state === 'committing' && receiptRecorded(ctx.receiptRecords, run);
}

/** 다시 커밋 도중 파일이 또 바뀌었을 때 내는 질문: 승인 불가, 건너뛰기만. */
export function recommitTextChangedQuestion(run, step) {
  return {
    kind: 'blocked', code: 'RECOMMIT_TEXT_CHANGED', stepId: step.id, draft: run.outputs.draft ?? '', advisories: [], canApprove: false,
    blocking: [{ checkId: 'recommit', severity: 'hard', code: 'RECOMMIT_TEXT_CHANGED', message: 'the file changed during this recommit run; skip it and run recommit again' }],
  };
}
