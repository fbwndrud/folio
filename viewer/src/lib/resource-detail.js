import { ApiError } from './api.js';

/** Never treat the singular first entry as the revision's only evidence. */
export async function loadResourceDetail(api, id) {
  const data = await api.get('/api/resources');
  const detail = await api.get(`/api/resources/${encodeURIComponent(id)}`);
  const latest = api.static ? data : await api.get('/api/resources');
  const first = data.entries.find((entry) => entry.revisionId === id);
  if (JSON.stringify(data) !== JSON.stringify(latest) || !first || JSON.stringify(first) !== JSON.stringify(detail.entry)) {
    throw new ApiError(409, 'RESOURCE_VIEW_CHANGED', 'Resource evidence changed between list and preview reads');
  }
  return { data, detail };
}
