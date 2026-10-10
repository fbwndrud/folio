import { valueText } from './value-display.js';
import { hrefFor } from './route.js';

export const BASIS_LABELS = { explicit: 'Stated in text', attributed: 'Attributed belief', inferred: 'Inference' };
export const COVERAGE_LABELS = { complete: 'Checked by host', pending: 'Review needed', drifted: 'Edited since review', blocked: 'Must fix', unknown: 'Status unavailable' };
export function observationValue(entry, view, t) {
  const criterion = view.plan?.criteria.find((c) => c.id === entry.criterionId);
  const name = (id) => view.subjects.find((s) => s.id === id)?.name ?? id;
  if (criterion?.valueType === 'entity') return name(entry.value);
  if (criterion?.valueType === 'entity-list') return entry.value.map(name).join(', ');
  return valueText(entry.value, t);
}
export const evidenceHref = (entry) => `${hrefFor('read', entry.evidence.nodeId)}?observation=${encodeURIComponent(entry.observationId)}`;
export function observationsThrough(view, subjectId, nodeId) {
  const source = view.sources[nodeId];
  if (!source?.ordered || source.ordinal === null) return null;
  return view.observations.filter((o) => o.subjectId === subjectId && o.ordered && o.ordinal !== null && o.ordinal <= source.ordinal);
}
/** Latest recorded position per perspective/path. Explicit time labels remain separate, not inferred chronological order. */
export function latestRecorded(entries, criteria) {
  const groups = new Map();
  for (const entry of entries) {
    const criterion = criteria.find((c) => c.id === entry.criterionId);
    const key = JSON.stringify([entry.criterionId, entry.basis, entry.perspectiveId ?? null, entry.pathLabel ?? null, entry.timeLabel ?? null]);
    if (criterion?.behavior === 'note' || entry.timeLabel) { groups.set(entry.observationId, [entry]); continue; }
    const previous = groups.get(key);
    if (!previous || previous[0].ordinal < entry.ordinal) groups.set(key, [entry]);
    else if (previous[0].ordinal === entry.ordinal) previous.push(entry);
  }
  return [...groups.values()].flat();
}
export function trackingCoverage(view, nodeIds = null) {
  const rows = view.coverage.filter((c) => !nodeIds || nodeIds.includes(c.nodeId));
  return { total: rows.length, complete: rows.filter((c) => c.state === 'complete').length,
    missing: view.unrecordedSections.filter((id) => !nodeIds || nodeIds.includes(id)).length };
}
export function sectionInGroup(nodes, sectionId, groupId) {
  if (!groupId) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let node = byId.get(sectionId); const visited = new Set();
  while (node && !visited.has(node.id)) { if (node.id === groupId) return true; visited.add(node.id); node = byId.get(node.parentId); }
  return false;
}
