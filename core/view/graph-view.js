import { openWork } from '../store/work.js';
import { preorder } from '../store/tree.js';
import { scanMentions } from '../index/scan.js';
import { linkTable } from '../links/graph.js';

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 관계도: 엔티티와 노드의 연결. 노드 본문에서 이름·별칭을 센 수(scanMentions, index.db 와 같은 규칙)와
 * 앞머리 entities 선언을 잇는다. 연결이 하나도 없는 노드는 빼고, 엔티티는 모두 싣는다. links 는 노드 사이 연결(links 기능이 꺼지면 null, 켜져 있으면 연결의 끝점 노드도 싣는다). 색은 뷰어가 종류(kind)별로 정한다.
 * @param {string} root
 */
export async function viewGraph(root) {
  const work = await openWork(root);
  const all = [...work.entities.values()];
  const edges = [];
  const linked = new Set();
  for (const id of preorder(work.tree)) {
    const node = work.tree.nodes.get(id);
    const counts = scanMentions(node.body, all);
    const targets = new Set([...counts.keys(), ...node.entities.filter((e) => work.entities.has(e))]);
    for (const entityId of [...targets].sort(byName)) {
      edges.push({ id: `${id}->${entityId}`, source: `node:${id}`, target: `entity:${entityId}`, weight: counts.get(entityId) ?? 0, declared: node.entities.includes(entityId) });
      linked.add(id);
    }
  }
  const links = work.config.features.links
    ? linkTable(work).links.filter((link) => link.valid).map((link) => ({ from: link.from, to: link.to, kind: link.kind, label: link.label, index: link.index }))
    : null;
  // 노드 연결을 그리려면 양 끝 노드도 있어야 한다: links 가 켜져 있으면 연결의 끝점도 노드에 넣는다(읽는 순서, 중복 없음).
  for (const link of links ?? []) { linked.add(link.from); linked.add(link.to); }
  return {
    kinds: [...new Set(all.map((e) => e.kind))].sort(byName),
    nodes: preorder(work.tree).filter((id) => linked.has(id)).map((id) => {
      const node = work.tree.nodes.get(id);
      return { id: `node:${id}`, refId: id, label: node.title || id, level: node.level, ordinal: work.positions.get(id).ordinal };
    }),
    entities: all.map((e) => ({ id: `entity:${e.id}`, refId: e.id, label: e.name, kind: e.kind })),
    edges,
    links,
  };
}
