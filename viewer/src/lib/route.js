/** 해시 주소 ↔ 화면. #/read/<노드>, #/entity/<엔티티>, #/receipts, #/receipt/<노드>, #/stages, #/graph, #/promises, #/checks, #/sources, #/source/<자료>, #/blocks, #/resources, #/resource/<revision>. 그 밖은 home. */
const SCREENS = { read: true, entity: true, receipt: true, source: true, resource: true };

/**
 * @param {string} hash location.hash
 * @returns {{ screen: string, id: string|null }}
 */
export function parseRoute(hash) {
  const parts = String(hash ?? '').split('?')[0].replace(/^#\/?/, '').split('/');
  const [screen, raw] = parts;
  if (['examples', 'changes', 'review', 'publish', 'receipts', 'stages', 'graph', 'promises', 'checks', 'sources', 'blocks', 'resources'].includes(screen)) return { screen, id: null };
  if (SCREENS[screen] && raw && parts.length === 2) {
    try {
      const observation = new URLSearchParams(String(hash).split('?')[1] ?? '').get('observation');
      return { screen, id: decodeURIComponent(raw), ...(/^sha256:[a-f0-9]{64}$/.test(observation ?? '') ? { observation } : {}) };
    } catch { return { screen: 'home', id: null }; }
  }
  return { screen: 'home', id: null };
}

/** @param {string} screen @param {string|null} [id] */
export const hrefFor = (screen, id = null) => (id === null ? `#/${screen}` : `#/${screen}/${encodeURIComponent(id)}`);
