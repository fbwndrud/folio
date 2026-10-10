import { sha256 } from '../util/hash.js';
import { lastCommits } from '../ledger/receipts.js';

/** 같은 hash 재확정도 원래 receipt와 다르면 옛 관찰을 되살리지 않는다. */
export function activeTrackingSnapshots(batches, receiptRecords, nodes = null) {
  const latest = lastCommits(receiptRecords);
  const active = batches.filter((batch) => {
    const commit = latest.get(batch.nodeId);
    return commit?.receiptId === (batch.commitReceiptId ?? batch.receiptId) && commit?.committedHash === batch.committedHash
      && (!nodes || nodes.has(batch.nodeId) && sha256(nodes.get(batch.nodeId).body) === batch.committedHash);
  });
  const snapshots = new Map();
  for (const batch of active) snapshots.set(batch.nodeId, batch);
  return [...snapshots.values()];
}
