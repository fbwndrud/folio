import { MAIN, variantOf } from '../variants/model.js';
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { openWork } from '../store/work.js';
import { publishedEvents } from '../ledger/event-visibility.js';
import { entityRevAt } from '../scope/scope.js';
import { virtualTrackingWork } from './candidates.js';
import { sha256 } from '../util/hash.js';
import { prepareTracking } from './candidates.js';
import { assertBatchShape, recordBody, sameTracking } from './batch-schema.js';
import { assertTrackingIntegrity } from './integrity.js';
import { assertBackfillActivationAllowed } from './backfill-record.js';
import { readTracking } from './records.js';
import { legacyEntitiesFor } from './definition-changes.js';

/** 후보 전체를 한 원고 확정에 묶는다. 승인 출처는 기존 grant 그대로다. */
export function trackingBatchFor(run, receiptId) {
  const candidate = run.outputs.tracking;
  if (!candidate) return null;
  const batch = { ...candidate, receiptId, runId: run.runId, nodeId: run.nodeId,
    committedHash: run.draftHash, basePlanVersion: run.trackingBasePlanVersion, baseTrackingSeq: run.trackingBaseTrackingSeq };
  assertBatchShape(batch); return batch;
}

/** 같은 receipt의 다른 내용은 거부하며 완전 일치만 재개한다. */
export async function appendTrackingBatch(root, batch) {
  assertBatchShape(batch);
  const { trackingRecords } = await assertTrackingIntegrity(root);
  await readTracking(root);
  const existing = trackingRecords.find((r) => r.type === 'tracking_batch' && r.receiptId === batch.receiptId);
  if (existing) {
    if (!sameTracking(recordBody(existing), batch)) throw new FolioError('LOCK_TRACKING_INTEGRITY', 'receipt ID reused for a different tracking batch');
    return existing;
  }
  const receipts = await openLedger(root, 'receipts').readAll();
  const receipt = receipts.find((r) => ['receipt', 'tracking-backfill'].includes(r.type) && r.receiptId === batch.receiptId);
  if (!receipt || !sameTracking(receipt.trackingBatch, batch)) throw new FolioError('LOCK_TRACKING_INTEGRITY', 'batch has no matching receipt');
  if (batch.mode === 'tracking-backfill') assertBackfillActivationAllowed(receipt, await openLedger(root, 'decisions').readAll());
  return openLedger(root, 'tracking').append({ type: 'tracking_batch', ...batch });
}

/** 새 확정은 지금 정본, 기록된 복구는 원래 불변 계획으로 검사한다. */
export async function assertTrackingCommit({ root, work, receipt, text, recorded }) {
  if (variantOf(receipt) !== MAIN) {
    if (receipt.trackingBatch || receipt.refs.some((r) => r.kind.startsWith('tracking_'))) throw new FolioError('LOCK_TRACKING_INTEGRITY', 'editions cannot publish original tracking observations');
    return;
  }
  if (!recorded && receipt.trackingBatch) work = await openWork(root);
  const tracking = await readTracking(root, { nodeIds: [...work.tree.nodes.keys()], legacyEntities: legacyEntitiesFor(work) });
  const batch = receipt.trackingBatch;
  if (!recorded && batch) await assertTrackingIntegrity(root, { receiptRecords: [...await openLedger(root, 'receipts').readAll(), { ...receipt, type: 'receipt' }], trackingRecords: tracking.records });
  if (!batch) {
    // Group pipelines finalize plans without an extraction step. Leaf prose still requires its checked batch.
    if (!recorded && work.tree.nodes.get(receipt.nodeId)?.kind !== 'branch' && tracking.plan && work.config.features.tracking !== false) throw new FolioError('LOCK_TRACKING_INTEGRITY', 'active tracking commit requires a receipt batch');
    if (receipt.refs.some((r) => r.kind === 'tracking_snapshot' && r.id === receipt.nodeId)) throw new FolioError('LOCK_TRACKING_INTEGRITY', 'candidate snapshot requires a full receipt batch');
    return;
  }
  assertBatchShape(batch);
  if (batch.committedHash !== sha256(text)) throw new FolioError('LOCK_HASH_MISMATCH', 'tracking batch does not match the committed text');
  const current = tracking.plan;
  const own = tracking.batches.some((entry) => entry.receiptId === receipt.receiptId)
    && current?.rev === batch.effectivePlanRev && current?.version === batch.basePlanVersion && current?.grantId === batch.grantId;
  if (!current || !(current.rev === batch.basePlanRev && current.version === batch.basePlanVersion && current.grantId === batch.grantId) && !(recorded && own)) {
    throw new FolioError('LOCK_TRACKING_PLAN_CHANGED', 'tracking plan or grant changed after this receipt');
  }
  if (recorded) return; // readTracking이 모든 영수증의 원래 역사 base를 검증했다.
  const entities = new Map(legacyEntitiesFor(work));
  for (const subject of tracking.subjects) entities.set(subject.id, { ...subject, managed: true });
  const authoritative = { ...work, tracking, entities };
  const normalized = prepareTracking(authoritative, {}, { planRev: batch.basePlanRev, discoveries: { subjects: batch.subjects, criteria: batch.criteria },
    observations: batch.observations, checked: batch.checked }, { nodeId: receipt.nodeId, text });
  const expected = { ...normalized, draftHash: receipt.draftHash, receiptId: receipt.receiptId, runId: receipt.runId, nodeId: receipt.nodeId,
    committedHash: receipt.draftHash, basePlanVersion: current.version, baseTrackingSeq: tracking.records.at(-1)?.seq ?? 0 };
  if (!sameTracking(expected, batch)) throw new FolioError('LOCK_TRACKING_INTEGRITY', 'receipt tracking candidate changed');
  const virtual = virtualTrackingWork(authoritative, normalized);
  const receiptRecords = await openLedger(root, 'receipts').readAll();
  const events = publishedEvents({ eventRecords: await openLedger(root, 'events').readAll(), receiptRecords, legacyMode: true });
  for (const ref of receipt.refs) {
    const rev = ref.kind === 'entity' ? entityRevAt({ work: virtual, events, entityId: ref.id, nodeId: receipt.nodeId, receiptRecords })
      : ref.kind === 'node' ? sha256(work.tree.nodes.get(ref.id)?.body ?? '')
      : ref.kind === 'asset' ? work.assets.get(ref.id)?.rev : ref.kind === 'source' ? work.sources.get(ref.id)?.rev : ref.rev;
    if (ref.rev !== rev) throw new FolioError('LOCK_TRACKING_REFS_CHANGED', 'a checked reference changed before commit');
  }
}
