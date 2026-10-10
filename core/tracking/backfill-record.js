import { FolioError } from '../errors.js';
import { validateReceipt, isBlocking } from '../ledger/receipts.js';
import { assertDecisionsMatch, assertBlocksResolved, assertAppliedChecks } from '../run/commit-locks.js';
import { refsDigest } from '../ledger/decisions.js';
import { HASH, fields, id } from './schema.js';
import { sameTracking } from './batch-schema.js';

export const BACKFILL_TYPE = 'tracking-backfill';
export const backfillOfRun = (records, run) => records.find((r) => r.type === BACKFILL_TYPE && r.runId === run.runId && r.nodeId === run.nodeId) ?? null;
const fail = (message) => { throw new FolioError('LOCK_TRACKING_INTEGRITY', message); };

/** 영수증은 검사 결과와 원고 확정에 묶고 별도 사용자 결정을 흉내내지 못하게 한다. */
export function validateBackfillRecord(record) {
  const errors = validateReceipt(record);
  if (!HASH.test(record.committedHash) || record.draftHash !== record.committedHash || !HASH.test(record.planRev)
    || !HASH.test(record.batchDigest) || typeof record.commitReceiptId !== 'string' || !record.commitReceiptId
    || !Number.isSafeInteger(record.decisionBoundary) || record.decisionBoundary < 1 || !record.trackingBatch || (record.events ?? []).length) errors.push({ code: 'BACKFILL_BINDING_INVALID' });
  return errors;
}

/** 실제 결정은 strict 추출 후보 밖에 저장한다. 일회 승인으로 장기 위임을 바꾸지 않는다. */
export function assertBackfillDecisions(receipt, records) {
  if (validateBackfillRecord(receipt).length) fail('invalid backfill receipt');
  if (!records.some((r) => r.seq === receipt.decisionBoundary)) fail('backfill decisions history missing');
  records = records.filter((r) => r.seq <= receipt.decisionBoundary);
  const batch = receipt.trackingBatch;
  if (batch.mode !== BACKFILL_TYPE || batch.commitReceiptId !== receipt.commitReceiptId || batch.effectivePlanRev !== receipt.planRev
    || batch.batchDigest !== receipt.batchDigest) fail('backfill receipt binding differs');
  const findings = receipt.steps.flatMap((s) => (s.checks ?? []).flatMap((c) => c.findings ?? []));
  if (receipt.hard !== findings.filter((f) => f.severity === 'hard').length || receipt.steps.some((s) => s.kind !== 'check')
    || findings.some((f) => !['hard', 'block', 'warning', 'advisory'].includes(f.severity))) fail('backfill checks differ');
  if (receipt.steps.some((s) => (s.checks ?? []).some((c) => c.status === 'error'))) fail('backfill checks incomplete');
  assertDecisionsMatch({ records, pipeline: { steps: receipt.steps }, receipt });
  assertAppliedChecks(receipt);
  if (!sameTracking(receipt.advisories, findings.filter((f) => !isBlocking(f)))) fail('backfill advisories differ');
  if (receipt.overridden.some((f) => f.severity !== 'block' || f.source !== 'user' || !f.overrideReason?.trim())) fail('backfill overrides require user block decisions');
  if (receipt.hard > 0) { if (batch.authority !== null) fail('failed backfill cannot carry activation authority'); return; }
  assertBlocksResolved(receipt);
  const authority = batch.authority;
  if (!authority || !['user', 'host'].includes(authority.source)) fail('backfill requires authority');
  if (authority.source === 'host') {
    fields(authority, ['source', 'grantId'], 'backfill authority');
    if (authority.grantId !== batch.grantId || batch.staged || batch.missingPermissions.length) fail('backfill exceeds host delegation');
    return;
  }
  fields(authority, ['source', 'decisionId', 'decisionSeq', 'decisionHash'], 'backfill authority'); id(authority.decisionId, 'decisionId');
  const mine = records.filter((r) => r.type === 'tracking_metadata_decision' && r.runId === receipt.runId && r.nodeId === receipt.nodeId);
  const decision = mine.find((r) => r.decisionId === authority.decisionId);
  const last = mine.at(-1);
  const checks = records.filter((r) => r.type === 'check_result' && r.runId === receipt.runId && r.nodeId === receipt.nodeId);
  if (!decision || decision !== last || decision.source !== 'user' || decision.action !== 'approve' || decision.seq !== authority.decisionSeq
    || decision.hash !== authority.decisionHash || decision.committedHash !== receipt.committedHash || decision.commitReceiptId !== receipt.commitReceiptId
    || decision.planRev !== receipt.planRev || decision.batchDigest !== receipt.batchDigest || decision.refsDigest !== refsDigest(receipt.refs)
    || checks.some((r) => r.seq >= decision.seq)) fail('backfill does not match actual metadata approval');
}

/** 역사 승인과 별개로 실제 취소는 같은 실행의 새로운 활성화를 금지한다. */
export function assertBackfillActivationAllowed(run, records, { existing = false } = {}) {
  if (records.some((r) => r.type === 'tracking_metadata_decision' && r.source === 'user' && r.action === 'skip'
    && r.runId === run.runId && r.nodeId === run.nodeId
    && (!existing || r.preparedReceiptId !== run.receiptId || r.batchActivated !== true))) {
    throw new FolioError('LOCK_TRACKING_BACKFILL_CANCELLED', 'the user cancelled this backfill run');
  }
}
