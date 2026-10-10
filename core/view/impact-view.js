import { sha256 } from '../util/hash.js';
import { MAIN, variantOf } from '../variants/model.js';
import { lastCommits } from '../ledger/receipts.js';
import { coverageFor } from '../tracking/coverage.js';
import { writingReadContext } from './read-context.js';
import { assertWritingCheckpoint } from './writing-checkpoint.js';
import { withResourceViewCheckpoint } from './resource-checkpoint.js';
import { viewResources } from './resources.js';

function reasonTitle(work, reason) {
  if (reason.kind === 'entity') return work.entities.get(reason.id)?.name || reason.id;
  if (['node', 'original', 'manuscript', 'tracking_snapshot', 'structure', 'order'].includes(reason.kind)) return work.tree.nodes.get(reason.id)?.title || reason.id;
  if (['source', 'source_link'].includes(reason.kind)) return work.sources.get(reason.id)?.title || reason.id;
  return reason.id;
}

/** Recorded dependencies only. Never infer absence of semantic impact from an empty list. */
export function impactReadView(context, resources = null) {
  const { work, status, receipts, checkpoint } = context;
  const available = Boolean(status && receipts.ledger.ok && Object.values(status.ledger).every((l) => l.ok));
  const base = { available, checkpoint, resourceFreshness: resources?.freshness ?? 'unknown',
    resourceCheckpoint: resources?.checkpoint ?? null, currentResourceCheckpoint: resources?.currentCheckpoint ?? null,
    unavailableReason: available ? null : 'review-status-unavailable' };
  if (!available) return { ...base, changes: [], sections: [], unreviewed: [], pendingTracking: [], variants: [], evidenceAvailable: false };
  const byNode = new Map();
  const section = (id) => {
    if (!byNode.has(id)) byNode.set(id, { nodeId: id, title: work.tree.nodes.get(id)?.title || id,
      present: work.tree.nodes.has(id), reasons: [], mustFix: [], newChecksPending: false });
    return byNode.get(id);
  };
  for (const entry of status.stale) section(entry.nodeId).reasons.push(...entry.reasons);
  for (const entry of status.drift.filter((d) => variantOf(d) === MAIN)) section(entry.nodeId).reasons.push({
    kind: 'manuscript', id: entry.nodeId, code: entry.code, was: entry.expected ?? null, now: entry.actual ?? null });
  for (const entry of status.recheck) section(entry.nodeId).newChecksPending = true;
  for (const entry of status.flagged) section(entry.nodeId).mustFix.push(...entry.findings);
  const evidenceAvailable = Boolean(context.evidence?.ledger?.ok);
  if (evidenceAvailable) for (const claim of context.evidence.states ?? []) {
    if (claim.status === 'stale') section(claim.nodeId).reasons.push({ kind: 'evidence', id: claim.nodeId, quote: claim.quote,
      was: null, now: null, code: 'EVIDENCE_RELINK_NEEDED' });
    for (const link of claim.sources.filter((s) => !s.verified)) section(claim.nodeId).reasons.push({
      kind: 'source_link', id: link.sourceId, quote: link.quote, was: null, now: null, code: 'SOURCE_QUOTE_UNVERIFIED' });
  }
  const changes = new Map();
  for (const entry of byNode.values()) {
    entry.reasons = entry.reasons.map((r) => ({ kind: r.kind, id: r.id, title: reasonTitle(work, r),
      was: r.was ?? null, now: r.now ?? null, ...(r.code ? { code: r.code } : {}), ...(r.quote ? { quote: r.quote } : {}) }));
    for (const reason of entry.reasons) {
      const key = `${reason.kind}:${reason.id}`;
      if (!changes.has(key)) changes.set(key, { key, kind: reason.kind, id: reason.id, title: reason.title, affected: [] });
      changes.get(key).affected.push({ nodeId: entry.nodeId, title: entry.title, was: reason.was, now: reason.now });
    }
  }
  const commits = lastCommits(receipts.records);
  const ordinal = (id) => work.positions.get(id)?.ordinal ?? Infinity;
  return { ...base, evidenceAvailable, changes: [...changes.values()],
    sections: [...byNode.values()].sort((a, b) => ordinal(a.nodeId) - ordinal(b.nodeId)),
    unreviewed: [...work.tree.nodes.values()].filter((n) => n.kind === 'leaf' && !commits.has(n.id)).map((n) => ({ nodeId: n.id, title: n.title || n.id })),
    pendingTracking: coverageFor(work).filter((c) => c.state !== 'complete'),
    variants: Object.entries(status.variants ?? {}).map(([id, v]) => ({ id, stale: v.stale.map((s) => s.nodeId),
      edited: v.drift.map((d) => d.nodeId), missing: v.missing })),
    contentHash: sha256(JSON.stringify([...work.tree.nodes].map(([id, n]) => [id, sha256(n.body)]))) };
}

export async function viewImpact(root, { packs }) {
  return withResourceViewCheckpoint(root, async () => {
    const context = await writingReadContext(root, packs);
    const resources = await viewResources(root);
    const result = impactReadView(context, resources);
    await assertWritingCheckpoint(root, context.checkpoint);
    return result;
  });
}
