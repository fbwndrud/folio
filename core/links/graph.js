import { FolioError } from '../errors.js';
import { preorder } from '../store/tree.js';
import { subtreeOf } from '../blocks/subtree.js';

/**
 * 노드 연결 표(정본 §04 "트리 밖 노드 연결 표"). 저장 정본은 노드 앞머리 links 다(M1 core/store/tree.js readLinks).
 * 이 파일은 그것을 읽기만 한다 — index.db 도 작업 잠금도 쓰지 않는다. 링크 모양({ to, kind, label })은 바꾸지 않는다.
 * - 링크 한 줄: { from, to, kind, label, index, valid }. index 는 from 노드 links 안의 차례(0부터), valid 는 to 노드가 작품에 있는가.
 * - 문제: LINK_BROKEN(없는 노드를 가리킴), LINK_SELF(자기 자신을 가리킴). 작품 열기를 막지 않고 알리기만 한다.
 */

/** @param {any} work @param {any} node */
const entriesOf = (work, node) => node.links.map((link, index) => ({
  from: node.id, to: link.to, kind: link.kind, label: link.label, index, valid: work.tree.nodes.has(link.to),
}));

/** @param {{ from: string, to: string, kind: string, index: number, valid: boolean }} link */
function problemOf(link) {
  if (!link.valid) return { code: 'LINK_BROKEN', nodeId: link.from, to: link.to, kind: link.kind, index: link.index };
  if (link.to === link.from) return { code: 'LINK_SELF', nodeId: link.from, to: link.to, kind: link.kind, index: link.index };
  return null;
}

function nodeOf(work, nodeId) {
  const node = typeof nodeId === 'string' ? work.tree.nodes.get(nodeId) : undefined;
  if (!node) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
  return node;
}

/** 한 노드가 가리키는 링크(적은 차례). 없는 노드면 NODE_NOT_FOUND. */
export function linksFrom(work, nodeId) {
  return entriesOf(work, nodeOf(work, nodeId));
}

/** 한 노드를 가리키는 링크(다른 노드에서 온 것만, 읽는 순서 → 적은 차례). 없는 노드면 NODE_NOT_FOUND. */
export function linksTo(work, nodeId) {
  nodeOf(work, nodeId);
  return preorder(work.tree).flatMap((id) => entriesOf(work, work.tree.nodes.get(id)).filter((link) => link.to === nodeId && link.from !== nodeId));
}

/**
 * 연결 표(N4 계약 — core/index/query.js 가 이름을 고정해 내보낸다).
 * - links: 범위 안 노드의 링크(읽는 순서 → 적은 차례).
 * - backlinks: 범위 안 노드를 가리키는 링크(범위 밖에서 온 것 포함, 자기 링크·깨진 링크 제외). 대상의 읽는 순서 → 출발 노드의 읽는 순서 → 적은 차례.
 * - problems: 범위 안 링크의 LINK_BROKEN·LINK_SELF(links 와 같은 차례).
 * nodeId 를 주면 그 노드와 자손만(없는 노드는 NODE_NOT_FOUND).
 * @param {any} work openWork 결과
 * @param {{ nodeId?: string }} [options]
 */
export function linkTable(work, { nodeId } = {}) {
  const inScope = subtreeOf(work.tree, nodeId);
  const order = preorder(work.tree);
  const rank = new Map(order.map((id, index) => [id, index]));
  const all = order.flatMap((id) => entriesOf(work, work.tree.nodes.get(id)));
  const links = all.filter((link) => !inScope || inScope.has(link.from));
  const backlinks = all.filter((link) => link.valid && link.to !== link.from && (!inScope || inScope.has(link.to)))
    .sort((a, b) => rank.get(a.to) - rank.get(b.to) || rank.get(a.from) - rank.get(b.from) || a.index - b.index);
  return { links, backlinks, problems: links.map(problemOf).filter(Boolean) };
}

/** 순서 없는(none) 노드의 앞쪽 범위가 모을 노드: 이 노드가 가리키는 있는 노드(한 단계, 자기 자신 제외, 처음 적은 차례로 한 번씩). */
export function linkedNodeIds(work, nodeId) {
  const node = work.tree.nodes.get(nodeId);
  if (!node) return [];
  return [...new Set(node.links.map((link) => link.to).filter((to) => to !== nodeId && work.tree.nodes.has(to)))];
}

/** folio_status 의 links: { problems, total }(링크 수). links 기능이 꺼지면 null. */
export function linksStatus(work) {
  if (!work.config.features.links) return null;
  const { links, problems } = linkTable(work);
  return { problems, total: links.length };
}
