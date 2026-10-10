import { openWork } from '../store/work.js';
import { trackingQuery } from '../tracking/view.js';
import { coverageFor } from '../tracking/coverage.js';
import { sha256 } from '../util/hash.js';

/** Same active observations as the public MCP query. No history is revived for a changed draft. */
export function trackingReadView(work, subjectId = null) {
  const plan = work.tracking.plan;
  const coverage = coverageFor(work);
  const observations = [];
  let cursor = '0';
  do {
    const page = trackingQuery(work, { type: 'observations', limit: 200, cursor, ...(subjectId ? { subjectId } : {}) });
    observations.push(...page.entries); cursor = page.nextCursor;
  } while (cursor !== null);
  const sources = Object.fromEntries([...work.tree.nodes].map(([id, node]) => [id, {
    title: node.title || id, contentHash: sha256(node.body), ordinal: work.positions.get(id)?.ordinal ?? null,
    ordered: work.positions.get(id)?.ordered ?? false,
  }]));
  const receipts = new Map(work.tracking.receiptRecords.map((r) => [r.receiptId, r]));
  const entries = observations.map((o) => {
    const source = sources[o.evidence.nodeId];
    const checked = coverage.find((c) => c.nodeId === o.evidence.nodeId && c.criterionId === o.criterionId);
    const receipt = receipts.get(o.receiptId);
    return { ...o, observationId: sha256(JSON.stringify(o)), sourceTitle: source?.title ?? o.evidence.nodeId, ordinal: source?.ordinal ?? null,
      ordered: source?.ordered ?? false,
      sourceState: source?.contentHash !== o.evidence.textHash ? 'drifted' : checked?.state ?? 'unknown',
      selfReview: (receipt?.steps ?? []).some((s) => s.reviewer?.sameHost || s.checks?.some((c) => c.reviewer?.sameHost)) };
  }).sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity));
  return { plan: plan ? { rev: plan.rev, purpose: plan.purpose, criteria: plan.criteria } : null,
    subjects: [...work.entities.values()].map(({ id, kind, name }) => ({ id, kind, name })),
    observations: entries, coverage, sources,
    unrecordedSections: [...work.tree.nodes.values()].filter((n) => n.kind === 'leaf' && !coverage.some((c) => c.nodeId === n.id)).map((n) => n.id),
    checkpoint: sha256(JSON.stringify({ plan: plan?.rev ?? null, sources, coverage, entries })) };
}

export async function viewTracking(root) { return trackingReadView(await openWork(root)); }
