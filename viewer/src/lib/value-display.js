import { readable } from './labels.js';

const LABELS = {
  resourceId: 'Resource', revisionId: 'Version', contentHash: 'Content fingerprint',
  operationId: 'Operation', executionId: 'Execution', observationId: 'Record',
  sourceRevisionId: 'Source version', sourceRevisionIds: 'Source versions',
  selectionRevision: 'Selection version', checkpoint: 'Recorded source checkpoint', currentCheckpoint: 'Current source checkpoint',
  freshness: 'List freshness', storageStatus: 'Content storage', mediaType: 'File type',
  byteLength: 'File size in bytes', createdAt: 'Created', at: 'Recorded at',
  role: 'Role', selfReview: 'Reviewed by the same host', reviewRequired: 'Review needed',
  returnedRevisionIds: 'Versions included', resourceIds: 'Resources included',
  missing: 'Missing resources', unknown: 'Unobserved resources', layers: 'Search methods',
  was: 'Previously recorded', now: 'Current', perspectiveId: 'Whose view', timeLabel: 'Story time', pathLabel: 'Story path',
  nodeId: 'Section', entityId: 'Definition', receiptId: 'Review record', runId: 'Work session',
  draftHash: 'Manuscript fingerprint', pipelineDigest: 'Writing steps fingerprint',
  before: 'Before', after: 'After', ordered: 'Has a reading order', kind: 'Type',
};
export function fieldLabel(key, systemLabels = false) { return (systemLabels ? LABELS[key] : null) ?? readable(String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2')); }
export function scalarText(value, t = (message) => message) {
  if (value === null || value === undefined) return t('Not recorded');
  if (typeof value === 'boolean') return t(value ? 'Yes' : 'No');
  if (value === '') return t('Empty text');
  return String(value);
}
/** Plain searchable summary; structured values are presented as labelled entries, never serialized JSON. */
export function valueText(value, t = (message) => message) {
  if (Array.isArray(value)) return value.length ? value.map((item) => valueText(item, t)).join(' · ') : t('No items');
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? entries.map(([key, item]) => `${fieldLabel(key)}: ${valueText(item, t)}`).join(' · ') : t('No recorded fields');
  }
  return scalarText(value, t);
}
