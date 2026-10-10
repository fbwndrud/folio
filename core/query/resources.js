import { withWorkspaceStateTransaction } from '../publications/state.js';
import { assertResourceId, assertRevisionId } from '../resources/schema.js';
import { copy, fail } from '../operations/objects.js';
import { assertProjectionCheckpoint } from '../projections/manifest.js';
import { readResourceQuery } from './resource-read.js';
export async function queryResources(root, input) {
  input = copy(input);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((k) => !['resourceId', 'selector', 'freshness'].includes(k))) fail('RESOURCE_QUERY_INVALID', 'unsupported query fields');
  const { resourceId, selector = { type: 'current' }, freshness = 'requireCurrent' } = input;
  if (resourceId !== undefined) assertResourceId(resourceId);
  const selectors = { current: ['type'], atRevision: ['type', 'revisionId'], atCheckpoint: ['type', 'checkpoint'] };
  const keys = Object.hasOwn(selectors, selector?.type) ? selectors[selector.type] : null;
  if (!keys || Object.keys(selector).some((k) => !keys.includes(k)) || !['requireCurrent', 'allowStale'].includes(freshness)) fail('RESOURCE_QUERY_INVALID', 'unsupported selector or freshness');
  if (selector.type === 'atRevision') assertRevisionId(selector.revisionId);
  if (selector.type === 'atCheckpoint') assertProjectionCheckpoint(selector.checkpoint);
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    const result = await readResourceQuery(root, { resourceId, selector, freshness }, state);
    if (!result) fail('PROJECTION_NOT_CURRENT', 'no matching metadata generation; refresh explicitly');
    return result;
  });
}
