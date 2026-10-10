import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { lastCommits } from '../ledger/receipts.js';
import { preorder } from '../store/tree.js';
import { assertFeature } from '../work/features.js';
import { MAIN, isVariantRun, variantLabel, variantOf } from '../variants/model.js';
import { originalOf, variantTextOf } from '../variants/original.js';
import { checkPlanFor } from './sync.js';
import { checksDigestFor, pipelineFor } from './level-pipeline.js';
import { receiptRecorded } from './steps/common.js';

/**
 * 판본 실행 요청(folio_run variant)을 받을 수 있는가: variants 기능이 켜져 있고, work.yaml 에 선언한 main 밖 판본이며, 보통 실행이다.
 * 판본의 재검사·다시 커밋은 N6 에 없다(VARIANT_MODE_UNSUPPORTED) — 원본이 바뀌면 판본을 다시 돌린다.
 */
export function assertVariantRequest(ctx, variant, mode) {
  assertFeature(ctx.work.config, 'variants');
  assertVariantDeclaration(ctx, variant, mode);
}

/** 잠긴 열린 실행도 요청의 선언과 모드는 확인한다. 기능 문은 기록된 영수증 여부로 따로 판단한다. */
export function assertVariantDeclaration(ctx, variant, mode) {
  if (typeof variant !== 'string' || variant === MAIN || !ctx.work.config.variants.includes(variant)) {
    const label = variantLabel(variant);
    throw new FolioError('VARIANT_UNKNOWN', `variant ${label} is not declared in work.yaml`, { variant: label });
  }
  if (mode !== 'normal') throw new FolioError('VARIANT_MODE_UNSUPPORTED', `${mode} runs are for the original only`, { mode, hint: 'run the variant again with mode normal' });
}

/** 판본을 시작할 수 있는 노드인가: 잎이고, 원본이 커밋 그대로다. */
export function assertVariantStartable(ctx, node) {
  if (node.kind !== 'leaf') throw new FolioError('VARIANT_LEAF_ONLY', `${node.id} is a ${node.level} branch; variants are for leaf text`, { nodeId: node.id });
  const found = originalOf(ctx, node.id);
  if (found.error) {
    throw new FolioError(found.error, `${node.id}: a variant starts from the committed original`, {
      nodeId: node.id, hint: found.error === 'VARIANT_ORIGINAL_DRIFTED' ? 'recommit or restore the original first' : 'commit the original first',
    });
  }
}

/** 다음 판본 노드: 읽는 순서로 첫 잎 중 원본이 커밋 그대로이고 이 판본 커밋이 없는 것. 마지막 판본 실행을 버린(abandoned) 노드는 건너뛴다. */
export function pickNextVariant(ctx, variant, runs) {
  const done = lastCommits(ctx.receiptRecords, variant);
  const latest = new Map();
  for (const run of runs) if (variantOf(run) === variant) latest.set(run.nodeId, run);
  for (const id of preorder(ctx.work.tree)) {
    const node = ctx.work.tree.nodes.get(id);
    if (node.kind !== 'leaf' || done.has(id) || latest.get(id)?.state === 'abandoned') continue;
    if (!originalOf(ctx, id).error) return node;
  }
  return null;
}

/**
 * 판본 실행 하나. original 은 시작 때 본 원본 커밋이다(진행 점검용 — 영수증의 original 은 커밋 때 기록장에서 다시 정한다).
 * fileHash 는 지금 판본 파일 본문(없으면 빈 글)의 hash 다 — 실행 도중 번역가가 판본 파일을 손으로 고치면 커밋이 덮지 않는다(C0 와 같은 점검).
 */
export function newVariantRun(ctx, node, variant, { newId, now }) {
  const at = now();
  const ref = { nodeId: node.id, level: node.level, nodeKind: node.kind, variant };
  const pipeline = pipelineFor(ctx, ref);
  const found = originalOf(ctx, node.id);
  return {
    runId: newId('run'), nodeId: node.id, variant, nodeKind: node.kind, level: node.level, mode: 'open',
    original: found.error ? null : found.original,
    pipelineDigest: pipeline.digest, checksDigest: checksDigestFor(ctx, ref), featuresDigest: ctx.featuresDigest, cursor: 0, state: 'active',
    outputs: {}, draftHash: null, fileHash: sha256(variantTextOf(ctx.work, variant, node.id)?.body ?? ''), results: {}, attempts: 0, retries: {}, inbox: {}, pending: null,
    approval: null, overridden: [], receipt: null, checkPlan: checkPlanFor(ctx, pipeline), deactivated: [], createdAt: at, updatedAt: at, history: [],
  };
}

/** 판본 실행이 잠긴 상태(committing + 기록장에 영수증)인가. 이때는 기능 끄기·원본 점검을 건너뛰고 잠금대로 끝맺는다(커밋 잠금이 따로 원본을 본다). */
export const variantLocked = (ctx, run) => isVariantRun(run) && run.state === 'committing' && receiptRecorded(ctx.receiptRecords, run);

/** 실행이 본 원본이 그 뒤 바뀌었는가(원본을 다시 커밋했거나 손으로 고침). */
export function originalChanged(ctx, run) {
  const found = originalOf(ctx, run.nodeId);
  return Boolean(found.error) || found.original.receiptId !== run.original?.receiptId || found.original.committedHash !== run.original?.committedHash;
}

/** 원본이 바뀌었을 때 내는 질문: 승인 불가, 고쳐 쓰기 불가, 건너뛰기만. 판본은 새 원본으로 다시 돌린다. */
export function originalChangedQuestion(run, step) {
  return {
    kind: 'blocked', code: 'VARIANT_ORIGINAL_CHANGED', stepId: step.id, draft: run.outputs.draft ?? '', advisories: [], canApprove: false,
    blocking: [{
      checkId: 'variant', severity: 'hard', code: 'VARIANT_ORIGINAL_CHANGED',
      message: 'the original of this variant changed while the run was open; skip this run, then run the variant again from the new original',
    }],
  };
}
