/** Only reading, section review and publication are edition scoped. */
export function editionPath(path, variant = 'main') {
  if (!path || variant === 'main') return path;
  if (typeof variant !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(variant)) throw new Error('Invalid reading edition');
  if (!/^\/api\/(?:nodes\/[^/]+|receipts\/[^/]+|publication(?:\/(?:web|epub))?)$/.test(path)) return path;
  return `/api/variants/${encodeURIComponent(variant)}/${path.slice('/api/'.length)}`;
}
