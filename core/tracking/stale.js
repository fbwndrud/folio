import { sha256 } from '../util/hash.js';
import { assertBlocksResolved, receiptVerdictFindings } from '../run/commit-locks.js';
import { lastCommits, receiptsById } from '../ledger/receipts.js';
import { validateRecheck } from '../ledger/recheck.js';
import { recordBody } from './batch-schema.js';
import { activeTrackingSnapshots } from './snapshots.js';
import { currentBatchSnapshot, snapshotDigest } from './semantic.js';
import { trackingCatalog } from './catalog.js';

export const isTrackingRef = (ref) => ['tracking_plan', 'tracking_snapshot', 'tracking_catalog', 'tracking_candidate'].includes(ref.kind);

function successful(record) {
  if (record.hard !== 0 || receiptVerdictFindings(record).some((finding) => finding.severity === 'hard')
    || record.steps.some((step) => (step.checks ?? []).some((check) => check.status === 'error'))) return false;
  try { assertBlocksResolved(record); return true; } catch { return false; }
}

/** 유효한 같은 확정 원고의 성공 재검사만 tracking refs 기준을 새로 한다. */
export function trackingStale(work, receiptRecords, node) {
  const commit = lastCommits(receiptRecords).get(node.id);
  if (!commit) return [];
  const receipt = receiptsById(receiptRecords).get(commit.receiptId);
  if (!receipt) return [];
  const recheck = receiptRecords.filter((record) => record.type === 'recheck' && record.nodeId === node.id
    && record.receiptId === commit.receiptId && record.committedHash === commit.committedHash && record.seq > commit.seq
    && !validateRecheck(recordBody(record)).length && successful(record)
    && record.refs.some((ref) => ref.kind === 'tracking_plan')).at(-1);
  const active = activeTrackingSnapshots(work.tracking.batches, receiptRecords, work.tree.nodes);
  const own = active.find((batch) => batch.nodeId === node.id && batch.mode === 'tracking-backfill');
  const backfill = own && receiptRecords.find((record) => record.type === 'tracking-backfill' && record.receiptId === own.receiptId && successful(record));
  const currentText = sha256(node.body) === commit.committedHash;
  const reviewed = currentText ? [backfill, recheck].filter(Boolean).sort((a, b) => b.seq - a.seq)[0] : null;
  const refs = (reviewed ?? receipt).refs ?? [];
  const snapshots = new Map(active
    .map((batch) => [batch.nodeId, snapshotDigest(currentBatchSnapshot(work.tracking, batch))]));
  const revisions = { tracking_plan: (ref) => ref.id === 'main' ? work.tracking.plan?.rev ?? null : null,
    tracking_catalog: (ref) => ref.id === 'main' ? trackingCatalog(work).rev : null,
    tracking_snapshot: (ref) => snapshots.get(ref.id) ?? null };
  return refs.filter((ref) => Object.hasOwn(revisions, ref.kind)).flatMap((ref) => {
    const now = revisions[ref.kind](ref);
    return now === ref.rev ? [] : [{ ...ref, was: ref.rev, now }];
  });
}
