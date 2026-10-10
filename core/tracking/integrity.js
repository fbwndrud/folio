import { snapshotDigest } from './semantic.js';
import { HASH } from './schema.js';
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { assertBackfillDecisions, assertBackfillActivationAllowed } from './backfill-record.js';
import { lastCommits } from '../ledger/receipts.js';
import { validateReceipt } from '../ledger/receipts.js';
import { assertBatchShape, recordBody, sameTracking } from './batch-schema.js';

const fail = (message) => { throw new FolioError('LOCK_TRACKING_INTEGRITY', message); };

/** 설정과 무관하게 영수증·준비 batch·최종 commit의 연결을 검사한다. */
export async function assertTrackingIntegrity(root, /** @type {{receiptRecords?: object[], trackingRecords?: object[]}} */ { receiptRecords, trackingRecords } = {}) {
  receiptRecords ??= await openLedger(root, 'receipts').readAll();
  trackingRecords ??= await openLedger(root, 'tracking').readAll();
  const receipts = new Map();
  const batches = new Map();
  const decisionRecords = receiptRecords.some((r) => r.type === 'tracking-backfill') ? await openLedger(root, 'decisions').readAll() : [];
  for (const receipt of receiptRecords.filter((r) => ['receipt', 'tracking-backfill'].includes(r.type))) {
    if (!receipt.trackingBatch) { if (receipt.type === 'tracking-backfill') fail('backfill receipt missing tracking batch'); continue; }
    if (receipts.has(receipt.receiptId)) fail('duplicate tracking receipt');
    const backfill = receipt.type === 'tracking-backfill';
    if (!backfill && receipt.trackingBatch.mode !== undefined) fail('normal receipt cannot authorize a backfill batch');
    if (backfill) {
      try { assertBackfillDecisions(recordBody(receipt), decisionRecords); } catch (error) { fail(error.message); }
      const prose = lastCommits(receiptRecords.filter((r) => r.seq < receipt.seq)).get(receipt.nodeId);
      if (!prose || prose.receiptId !== receipt.commitReceiptId || prose.committedHash !== receipt.committedHash) fail('backfill does not bind its current prose receipt');
    } else if (validateReceipt(recordBody(receipt)).length) fail('tracking receipt is invalid');
    try { assertBatchShape(receipt.trackingBatch); } catch (error) { fail(error.message); }
    const batch = receipt.trackingBatch;
    if (batch.receiptId !== receipt.receiptId || batch.runId !== receipt.runId || batch.nodeId !== receipt.nodeId
      || batch.committedHash !== receipt.draftHash || !backfill && receipt.hard !== 0) fail('tracking receipt identity mismatch');
    const planRefs = receipt.refs?.filter((r) => r.kind === 'tracking_plan');
    const snapshotRefs = receipt.refs?.filter((r) => r.kind === 'tracking_snapshot');
    const candidateRefs = receipt.refs?.filter((r) => r.kind === 'tracking_candidate') ?? [];
    const catalogRefs = receipt.refs?.filter((r) => r.kind === 'tracking_catalog') ?? [];
    const modern = Boolean(catalogRefs.length || candidateRefs.length);
    if (modern && (!sameTracking(candidateRefs, [{ kind: 'tracking_candidate', id: batch.nodeId, rev: batch.batchDigest }])
      || catalogRefs.length !== 1 || catalogRefs[0].id !== 'main' || !HASH.test(catalogRefs[0].rev))) fail('tracking candidate or catalog refs are invalid');
    if (!sameTracking(planRefs, [{ kind: 'tracking_plan', id: 'main', rev: batch.effectivePlanRev }])
      || !snapshotRefs?.some((r) => r.id === batch.nodeId && r.rev === (modern ? snapshotDigest(batch) : batch.batchDigest))) fail('tracking receipt refs do not bind its candidate');
    receipts.set(receipt.receiptId, receipt);
  }
  for (const record of trackingRecords.filter((r) => r.type === 'tracking_batch')) {
    const batch = recordBody(record);
    const receipt = receipts.get(batch.receiptId);
    if (batches.has(batch.receiptId) || !receipt || receipt.hard !== 0 || !sameTracking(receipt.trackingBatch, batch)) fail('tracking batch differs from its immutable receipt');
    if (receipt.type === 'tracking-backfill') {
      try { assertBackfillActivationAllowed(receipt, decisionRecords, { existing: true }); } catch (error) { fail(error.message); }
    }
    batches.set(batch.receiptId, batch);
  }
  const committed = new Set();
  const latest = new Map();
  for (const marker of receiptRecords.filter((r) => r.type === 'commit')) {
    const receipt = receipts.get(marker.receiptId);
    const allReceipt = receiptRecords.find((r) => r.type === 'receipt' && r.receiptId === marker.receiptId);
    if (!allReceipt && (trackingRecords.length || marker.trackingBatchDigest)) fail('commit marker has no receipt');
    if (allReceipt && (marker.nodeId !== allReceipt.nodeId || marker.committedHash !== allReceipt.draftHash)) fail('commit marker does not match its receipt');
    const previous = latest.get(marker.nodeId);
    if (allReceipt && (committed.has(marker.receiptId) || previous?.seq > allReceipt.seq)) fail('commit marker reused or superseded');
    if (allReceipt) latest.set(marker.nodeId, allReceipt);
    committed.add(marker.receiptId);
    if (!receipt && !marker.trackingBatchDigest) continue;
    if (!receipt || !batches.has(marker.receiptId) || marker.nodeId !== receipt.nodeId || marker.committedHash !== receipt.draftHash
      || marker.trackingBatchDigest !== receipt.trackingBatch.batchDigest) fail('commit marker does not match its receipt and prepared batch');
  }
  return { receiptRecords, trackingRecords, receipts, batches };
}
