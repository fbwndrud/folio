import { sha256 } from '../util/hash.js';
import { checkPlanFor } from './sync.js';
import { checksDigestFor, pipelineFor } from './level-pipeline.js';
import { isRecheck, RECHECK_MODE } from './recheck-plan.js';
import { isRecommit, RECOMMIT_MODE } from './recommit-plan.js';
import { variantOf } from '../variants/model.js';

/** 보통 실행 하나. 가지에 자식이 있으면 자식에서 거꾸로 계획을 뽑는다(derive). 시작 때 본문 hash 를 fileHash 로 적는다(C0 손수정 점검). */
export function newRun(ctx, node, { newId, now }) {
  const at = now();
  const ref = { nodeId: node.id, level: node.level, nodeKind: node.kind };
  const pipeline = pipelineFor(ctx, ref);
  return {
    runId: newId('run'), nodeId: node.id, variant: 'main', nodeKind: node.kind, level: node.level,
    mode: node.kind === 'branch' && node.children.length > 0 ? 'derive' : 'open',
    pipelineDigest: pipeline.digest, checksDigest: checksDigestFor(ctx, ref), featuresDigest: ctx.featuresDigest, trackingStateDigest: ctx.trackingStateDigest, cursor: 0, state: 'active',
    outputs: {}, draftHash: null, fileHash: sha256(node.body), results: {}, attempts: 0, retries: {}, inbox: {}, pending: null,
    approval: null, overridden: [], receipt: null, checkPlan: checkPlanFor(ctx, pipeline), deactivated: [], createdAt: at, updatedAt: at, history: [],
  };
}

/**
 * 열린 실행이 이 요청과 같은 것인가: 'next' 는 같은 판본의 실행을 이어가고, 그 밖에는 같은 노드·같은 종류(보통/재검사/다시 커밋)여야 한다.
 * variant 를 주지 않은 요청(main)은 판본 실행을 이어가지 않는다 — 다른 판본의 실행을 제 것으로 잡지 않는다(N6).
 */
export const sameRequest = (open, node, mode, variant = 'main') => variantOf(open) === variant
  && (open.mode === 'tracking-backfill') === (mode === 'tracking-backfill')
  && (node === 'next' || (isRecheck(open) === (mode === RECHECK_MODE) && isRecommit(open) === (mode === RECOMMIT_MODE)
    && (node === open.nodeId || node === 'next-recheck')));
