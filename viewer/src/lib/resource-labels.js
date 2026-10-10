import { readable } from './labels.js';

export const resourceTitle = (entry) => entry.title || readable(entry.resourceId) || 'Untitled resource';
export const resourceKind = (entry) => readable(entry.kind) || 'Resource';
export const resourceRole = (entry) => entry.role === 'output' ? 'Approved result'
  : entry.selectionCurrent === false ? 'Previously selected source' : 'Selected source';
export const resourceStatus = (entry) => entry.reviewRequired ? 'Review needed'
  : entry.storageStatus === 'external_unobserved' ? 'External content not observed'
    : entry.role === 'output' ? 'Reviewed and approved' : entry.selectionCurrent === false ? 'Historical selection' : 'Current selection';

/** Completeness refers to the verified metadata list, never to external truth. */
export function resourceListStatus(data) {
  if (data.unavailableReason === 'not-indexed') return 'Not indexed';
  if (data.freshness === 'stale') return 'Older list';
  if (data.coverage?.missing?.length) return 'Partial list';
  if (data.freshness === 'unknown' || data.coverage?.unknown?.length) return 'Some content is unknown';
  return 'Complete list';
}

export function resourceGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.revisionId)) groups.set(entry.revisionId, []);
    groups.get(entry.revisionId).push(entry);
  }
  return [...groups.values()];
}
