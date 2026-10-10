import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { lastCommits } from '../ledger/receipts.js';
import { findStale } from '../scope/stale.js';
import { pendingRechecks } from '../scope/rechecks.js';
import { checkPlanFor } from './sync.js';
import { checksDigestFor, pipelineFor } from './level-pipeline.js';

export const RECHECK_MODE = 'recheck';
/** 재검사 실행의 마지막 단계: 결과를 기록하고(원고는 그대로) 끝낸다. */
export const RECHECK_STEP = Object.freeze({ id: 'recheck', kind: 'recheck', mode: 'on', requires: [], locked: true });

/**
 * 재검사 실행이 도는 단계: 사건 추출(커밋된 원고에서 등장·사건을 다시 뽑는다 — 보통 실행과 같은 범위) + 검사 단계
 * + 기록 단계. 원고를 만들거나 고치는 단계, 게이트, 커밋은 없다.
 */
export const recheckSteps = (pipeline) => [
  ...pipeline.steps.filter((s) => s.kind === 'check' || (s.kind === 'generate' && s.produces === 'events')), RECHECK_STEP,
];
export const isRecheck = (run) => run?.mode === RECHECK_MODE;

/** 되채우기가 남은 노드 중 읽는 순서로 첫 번째. 같은 커밋 원고에 대해 사용자가 건너뛴 재검사는 다시 고르지 않는다. */
export function pickNextRecheck(ctx, runs) {
  const commits = lastCommits(ctx.receiptRecords);
  const stale = findStale({ work: ctx.work, receiptRecords: ctx.receiptRecords, events: ctx.events, applied: ctx.applied });
  for (const { nodeId } of pendingRechecks(stale)) {
    const last = runs.filter((r) => isRecheck(r) && r.nodeId === nodeId).at(-1);
    if (last?.state === 'abandoned' && last.draftHash === commits.get(nodeId)?.committedHash) continue;
    return ctx.work.tree.nodes.get(nodeId);
  }
  return null;
}

/** 커밋된 노드의 사건(이 노드의 유효한 사건)을 추출 결과 모양으로. 검사가 이 원고의 사건으로 본다. */
function committedEvents(ctx, nodeId, draftHash) {
  const events = ctx.events.filter((e) => e.nodeId === nodeId)
    .map((e) => ({ entityId: e.entityId, kind: e.kind, ...(e.data !== undefined ? { data: e.data } : {}), ...(e.quote ? { quote: e.quote } : {}) }));
  return { events, appearances: [], mentions: [], occurrences: [], submittedOccurrences: false, draftHash };
}

/**
 * 커밋된 원고를 그대로 두고 검사 단계만 다시 도는 실행. 원고가 커밋된 것이 아니거나(손수정 포함) 커밋이 없으면 거부한다.
 */
export function newRecheckRun(ctx, node, { newId, now }) {
  const commit = lastCommits(ctx.receiptRecords).get(node.id);
  if (!commit) throw new FolioError('RECHECK_NOT_COMMITTED', `${node.id} has no commit to recheck`);
  const draftHash = sha256(node.body);
  if (draftHash !== commit.committedHash) {
    // 손수정된 원고는 재검사할 수 없다. recommit 이 켜져 있으면 지금 본문을 검사해 다시 커밋하는 길을 알려 준다.
    const next = ctx.work.config.features?.recommit ? "use folio_run with mode: 'recommit' to check and commit the current text" : 'run it again instead';
    throw new FolioError('RECHECK_TEXT_DRIFTED', `${node.id} differs from its committed text; ${next}`, { nodeId: node.id });
  }
  const at = now();
  const ref = { nodeId: node.id, level: node.level, nodeKind: node.kind };
  const pipeline = pipelineFor(ctx, ref);
  return {
    runId: newId('run'), nodeId: node.id, variant: 'main', nodeKind: node.kind, level: node.level, mode: RECHECK_MODE,
    receiptId: commit.receiptId, pipelineDigest: pipeline.digest, checksDigest: checksDigestFor(ctx, ref), featuresDigest: ctx.featuresDigest, trackingStateDigest: ctx.trackingStateDigest,
    cursor: 0, state: 'active', draftHash, results: {}, attempts: 0, retries: {}, inbox: {}, pending: null,
    outputs: { draft: node.body, ...(node.kind === 'branch' ? { plan: node.body } : {}), events: committedEvents(ctx, node.id, draftHash) },
    approval: null, overridden: [], receipt: null, checkPlan: checkPlanFor(ctx, pipeline), deactivated: [],
    createdAt: at, updatedAt: at, history: [],
  };
}
