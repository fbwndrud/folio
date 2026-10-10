import { lastCommits } from '../ledger/receipts.js';
import { sha256 } from '../util/hash.js';
import { criterionAppliesTo } from './observation-schema.js';
import { activeTrackingSnapshots } from './snapshots.js';
import { batchCriteria, criterionDigest } from './semantic.js';
import { trackingCatalog } from './catalog.js';

/** 명시 checked와 현재 원고·기준·대상 catalog가 맞을 때만 완료로 표시한다. */
export function coverageFor(work) {
  const tracking = work.tracking;
  if (!tracking?.plan) return [];
  const receipts = tracking.receiptRecords ?? [];
  const catalogDigest = trackingCatalog(work).rev;
  const active = new Map(activeTrackingSnapshots(tracking.batches, receipts, work.tree.nodes).map((batch) => [batch.nodeId, batch]));
  const out = [];
  for (const [nodeId, commit] of lastCommits(receipts)) {
    const node = work.tree.nodes.get(nodeId);
    if (!node) continue;
    const snapshot = active.get(nodeId);
    const failures = receipts.filter((r) => r.type === 'tracking-backfill' && r.nodeId === nodeId && r.commitReceiptId === commit.receiptId
      && r.committedHash === commit.committedHash && r.hard > 0);
    const receipt = receipts.find((r) => r.receiptId === snapshot?.receiptId && ['receipt', 'tracking-backfill'].includes(r.type));
    const failure = failures.at(-1);
    const latest = failure && failure.seq > (receipt?.seq ?? 0) ? failure : receipt;
    const batch = latest?.trackingBatch;
    const historical = new Map(batch ? batchCriteria(tracking, batch).map((criterion) => [criterion.id, criterionDigest(criterion)]) : []);
    for (const criterion of tracking.plan.criteria.filter((entry) => criterionAppliesTo(entry, nodeId))) {
      const semantic = criterionDigest(criterion);
      const currentCriterion = historical.get(criterion.id) === semantic && batch?.checked.includes(criterion.id);
      const currentCatalog = latest?.refs?.some((ref) => ref.kind === 'tracking_catalog' && ref.id === 'main' && ref.rev === catalogDigest);
      const state = sha256(node.body) !== commit.committedHash ? 'drifted'
        : currentCriterion && latest.hard > 0 ? 'blocked' : currentCriterion && currentCatalog && snapshot ? 'complete' : 'pending';
      out.push({ nodeId, committedHash: commit.committedHash, criterionId: criterion.id, criterionDigest: semantic, catalogDigest, state,
        ...(latest ? { receiptId: latest.receiptId } : {}) });
    }
  }
  return out.sort((a, b) => (work.positions.get(a.nodeId)?.ordinal ?? 0) - (work.positions.get(b.nodeId)?.ordinal ?? 0));
}
