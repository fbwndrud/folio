import { hrefFor } from './route.js';

export const CHANGE_LABELS = {
  entity: 'Setting changed', node: 'Referenced manuscript changed', original: 'Original manuscript changed',
  manuscript: 'Manuscript edited', asset: 'Image changed', source: 'Source changed',
  source_link: 'Source quote no longer verified',
  tracking_plan: 'Tracking rules changed', tracking_catalog: 'Tracked subjects changed',
  tracking_snapshot: 'Recorded information changed', check: 'Check changed', structure: 'Contents changed',
  order: 'Reading order changed', feature: 'Review scope changed', evidence: 'Evidence needs relinking',
};
export function changeTitle(reason) {
  if (reason.kind === 'tracking_plan') return 'Tracking rules for this work';
  if (reason.kind === 'tracking_catalog') return 'Tracked subjects for this work';
  return reason.title || reason.id;
}
export function changeLink(reason, nodeId = null) {
  if (reason.kind === 'entity') return hrefFor('entity', reason.id);
  if (['source', 'source_link'].includes(reason.kind)) return hrefFor('source', reason.id);
  if (['node', 'original', 'manuscript', 'tracking_snapshot', 'structure', 'order', 'evidence'].includes(reason.kind)) return hrefFor('read', reason.id);
  if (reason.kind === 'check' || reason.kind === 'feature') return hrefFor('checks');
  if (reason.kind.startsWith('tracking_')) return hrefFor('review');
  return nodeId ? hrefFor('read', nodeId) : hrefFor('receipts');
}
export function filteredImpacts(view, search, kind) {
  const query = search.trim().toLocaleLowerCase();
  return view.sections.filter((s) => (!kind || s.reasons.some((r) => r.kind === kind))
    && (!query || `${s.title} ${s.nodeId} ${s.reasons.map((r) => `${r.title} ${r.id}`).join(' ')}`.toLocaleLowerCase().includes(query)));
}
