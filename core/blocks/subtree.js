import { FolioError } from '../errors.js';

/**
 * 노드 하나와 그 자손 id(Set). nodeId 가 없으면(undefined·null) null — 작품 전체다.
 * 없는 노드면 NODE_NOT_FOUND. 블록·참고문헌·색인 조회를 가지 하나로 좁힐 때 쓴다.
 * @param {{ nodes: Map<string, { children: string[] }> }} tree
 * @param {string|null|undefined} nodeId
 * @returns {Set<string>|null}
 */
export function subtreeOf(tree, nodeId) {
  if (nodeId === undefined || nodeId === null) return null;
  if (typeof nodeId !== 'string' || !tree.nodes.has(nodeId)) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
  const ids = new Set();
  const walk = (id) => { ids.add(id); for (const child of tree.nodes.get(id).children) walk(child); };
  walk(nodeId);
  return ids;
}
