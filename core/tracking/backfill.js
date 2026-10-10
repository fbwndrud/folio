import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { lastCommits } from '../ledger/receipts.js';
import { checkStepEntry } from '../ledger/decisions.js';
import { appliedFromEntries } from '../checks/applied.js';
import { nodeOrder } from '../scope/stale-checks.js';
import { isBlocking } from '../ledger/receipts.js';
import { trackingCandidateFor } from './extract.js';
import { assertBatchShape } from './batch-schema.js';
import { BACKFILL_TYPE } from './backfill-record.js';

/** 시작·접수·기록 모두 최신 확정과 실제 현재 본문을 확인한다. */
export function assertBackfillText(ctx, run) {
  const commit = lastCommits(ctx.receiptRecords).get(run.nodeId);
  if (!commit) throw new FolioError('TRACKING_NOT_COMMITTED', run.nodeId);
  const hash = sha256(ctx.work.tree.nodes.get(run.nodeId)?.body ?? '');
  if (hash !== (run.committedHash ?? commit.committedHash) || commit.committedHash !== hash
    || run.commitReceiptId && run.commitReceiptId !== commit.receiptId) throw new FolioError('TRACKING_TEXT_DRIFTED', run.nodeId);
  return commit;
}

/** 기록된 영수증 복구는 원래 base 또는 자신의 활성화된 추가만 허용한다. */
export function assertBackfillBase(work, receipt) {
  const batch = receipt.trackingBatch; const current = work.tracking.plan;
  const own = work.tracking.batches.some((b) => b.receiptId === receipt.receiptId);
  if (!current || current.version !== batch.basePlanVersion || current.grantId !== batch.grantId
    || current.rev !== batch.basePlanRev && !(own && current.rev === batch.effectivePlanRev)) {
    throw new FolioError('LOCK_TRACKING_PLAN_CHANGED', 'backfill plan or grant changed after receipt');
  }
}

/** 검사를 마친 strict 후보와 실제 결정 참조를 별도 봉투에서 결합한다. */
export function buildBackfillRecord({ ctx, run, steps, pipeline, refs, env, hard }) {
  trackingCandidateFor(ctx.work, run);
  const entries = steps.filter((s) => s.kind === 'check').map((s) => checkStepEntry(s.id, run.results[s.id]));
  const findings = entries.flatMap((e) => e.checks.flatMap((c) => c.findings));
  const receiptId = env.newId('trcpt');
  const trackingBatch = { ...run.outputs.tracking, receiptId, runId: run.runId, nodeId: run.nodeId, mode: BACKFILL_TYPE,
    committedHash: run.committedHash, commitReceiptId: run.commitReceiptId, basePlanVersion: ctx.work.tracking.plan.version,
    baseTrackingSeq: ctx.work.tracking.records.at(-1).seq, authority: hard ? null : run.trackingAuthority ?? { source: 'host', grantId: ctx.work.tracking.plan.grantId } };
  assertBatchShape(trackingBatch);
  return { receiptVersion: 1, receiptId, runId: run.runId, nodeId: run.nodeId, level: run.level, variant: 'main',
    draftHash: run.committedHash, committedHash: run.committedHash, commitReceiptId: run.commitReceiptId,
    planRev: trackingBatch.effectivePlanRev, batchDigest: trackingBatch.batchDigest, trackingBatch, pipelineDigest: pipeline.digest,
    steps: entries, refs, appliedChecks: appliedFromEntries(ctx.checks, pipeline, entries), order: nodeOrder(ctx.work, run.nodeId),
    hard, advisories: findings.filter((f) => !isBlocking(f)), overridden: run.overridden ?? [], attempts: run.attempts, events: [] };
}
