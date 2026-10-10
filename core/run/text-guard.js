import { sha256 } from '../util/hash.js';
import { OPEN_STATES } from './run-store.js';
import { receiptRecorded } from './steps/common.js';
import { isRecommit, recommitTextChangedQuestion } from './recommit-plan.js';
import { isVariantRun, variantOf } from '../variants/model.js';

/**
 * 엔진이 노드 파일 본문을 쓰기 직전(커밋, 가지의 자식 단계): 이 실행이 본 뒤로 작가가 파일을 손으로 고쳤는가.
 * - 실행은 시작할 때(보통·다시 커밋 모두) 본문 hash 를 fileHash 로 적고, 엔진이 본문을 쓸 때마다(자식 단계) 새로 적는다.
 * - 지금 본문이 엔진이 쓰려는 글(run.outputs.draft)과 같으면 잃을 것이 없으므로 바뀐 것으로 치지 않는다(쓰다 죽은 뒤 이어가기 포함).
 * - fileHash 가 없는 실행(C0 전에 연 실행)은 보지 않는다.
 * - 판본 실행(N6)은 노드 파일이 아니라 그 판본 파일(variants/<id>/<노드>.md, 없으면 빈 글)을 본다.
 * 이것이 참이면 러너는 쓰지 않고 멈춘다(승인 불가, 건너뛰기만) — 작가 글이 조용히 덮이지 않는다(M5 판정 기록 인계).
 * @param {{ tree: { nodes: Map<string, any> }, variants?: Map<string, any> }} work
 * @param {any} run
 */
export function nodeTextChanged(work, run) {
  if (typeof run?.fileHash !== 'string') return false;
  const node = work.tree.nodes.get(run.nodeId);
  if (!node) return true;
  const body = isVariantRun(run) ? (work.variants?.get(variantOf(run))?.texts.get(run.nodeId)?.body ?? '') : node.body;
  return sha256(body) !== run.fileHash && body !== run.outputs?.draft;
}

/** 이미 잠긴 커밋(committing + 기록장에 영수증) — 잠금(커밋 원고 hash = 검사 원고 hash)대로 끝맺어야 하므로 이 점검을 건너뛴다. */
export const commitLocked = (ctx, run) => run.state === 'committing' && receiptRecorded(ctx.receiptRecords, run);

/** 엔진이 이 단계에서 노드 본문을 쓰는가: 커밋, 가지의 자식 단계(계획을 본문에 쓴다). */
export const writesNodeBody = (step) => step?.kind === 'commit' || (step?.kind === 'generate' && step.produces === 'children');

/** 파일이 바뀌었을 때 내는 질문: 승인 불가, 건너뛰기만. 다시 커밋 실행은 예전 질문(RECOMMIT_TEXT_CHANGED)을 그대로 낸다. */
export function textChangedQuestion(run, step) {
  if (isRecommit(run)) return recommitTextChangedQuestion(run, step);
  return {
    kind: 'blocked', code: 'NODE_TEXT_CHANGED', stepId: step.id, draft: run.outputs.draft ?? '', advisories: [], canApprove: false,
    blocking: [{
      checkId: 'commit', severity: 'hard', code: 'NODE_TEXT_CHANGED',
      message: 'the node file was edited by hand while this run was open; the engine will not overwrite it — skip this run (the file keeps the edit), then run the node again',
    }],
  };
}

/**
 * folio_status 공통 drift 에 싣는 줄: 열린 실행의 파일이 실행 도중 손으로 바뀌었다. 판본 실행은 variant 로 구분한다.
 * 이미 잠긴 커밋(commitLocked)은 넣지 않는다 — 그 실행은 별도 immutable intent 검사에서 바이트 충돌을 보고하므로,
 * "커밋이 멈춰 skip 을 기다린다"는 뜻의 CHANGED_DURING_RUN 을 내면 거짓 안내가 된다(fix round 1, M5 공격 리뷰).
 * 판본 기능이 꺼지면 본문을 읽지 않으므로 열린 판본의 변경 여부도 투영하지 않는다. 쓰기 직전 보호는 그대로 둔다.
 */
export function runTextDrift(work, run, receiptRecords) {
  if (!run || !OPEN_STATES.has(run.state) || commitLocked({ receiptRecords }, run)
    || (isVariantRun(run) && !work.config.features.variants) || !nodeTextChanged(work, run)) return [];
  return [{ nodeId: run.nodeId, code: 'CHANGED_DURING_RUN', runId: run.runId, ...(isVariantRun(run) ? { variant: run.variant } : {}) }];
}
