import { preorder } from '../store/tree.js';
import { BLOCK_KINDS, parseNodeMarks } from './syntax.js';

/** 번호 무리 레벨: 잎 바로 위 레벨(교재의 장). 레벨이 하나뿐이면 null — 작품 전체를 한 줄로 센다. */
export const numberingLevel = (config) => (config.levels.length >= 2 ? config.levels.at(-2).name : null);

/**
 * 읽는 순서(트리 전위)로 노드마다 블록 표시를 읽는다. owned 는 그 노드가 주인인 앵커다:
 * 작품 전체에서 id 가 처음 나온 곳(core/store/blocks.js validateBlocks 의 anchors, M1 규칙)만 주인이고, 겹친 앵커의 뒤 정의는 빠진다.
 * @param {{ tree: any, blocks: { anchors: Map<string, { nodeId: string, line: number }> } }} work
 */
export function markedNodes(work) {
  const seen = new Set();
  return preorder(work.tree).map((id) => {
    const node = work.tree.nodes.get(id);
    const marks = parseNodeMarks(node.body);
    const owned = marks.anchors.filter((anchor) => {
      const owner = work.blocks.anchors.get(anchor.id);
      if (!owner || owner.nodeId !== id || owner.line !== anchor.line || seen.has(anchor.id)) return false;
      seen.add(anchor.id);
      return true;
    });
    return { node, marks, owned };
  });
}

/**
 * 블록 번호(투영). 저장하지 않고 파일에서 언제든 다시 만든다. 앵커 id 는 번호와 상관없다.
 * - 종류(fig·tbl·eq)마다 따로 센다. 이름만 있는 앵커는 번호가 없다.
 * - 무리: 잎 바로 위 레벨의 본문(role: body) 노드. 무리 번호는 그 레벨 본문 노드의 읽는 순서 차례(부가 바뀌어도 이어 센다).
 *   블록은 자기 또는 조상 중 무리 노드를 찾아 "무리.n"(예: 1.2). 무리 밖(서문·부록, 레벨 하나짜리 작품)은 종류마다 따로 "n".
 * @param {{ config: { levels: Array<{ name: string }> }, tree: { nodes: Map<string, any> } }} work
 * @param {ReturnType<typeof markedNodes>} nodes
 * @returns {Map<string, { kind: string, number: string, label: string }>} 앵커 id → 번호
 */
export function numberAnchors(work, nodes) {
  const level = numberingLevel(work.config);
  const groups = new Map();
  if (level) for (const { node } of nodes) if (node.level === level && node.role === 'body') groups.set(node.id, groups.size + 1);
  const groupOf = (node) => {
    for (let at = node; at; at = at.parentId ? work.tree.nodes.get(at.parentId) : null) if (groups.has(at.id)) return at.id;
    return null;
  };
  const counters = new Map();
  const out = new Map();
  for (const { node, owned } of nodes) {
    const group = groupOf(node);
    for (const anchor of owned) {
      if (anchor.kind === null) continue;
      const key = `${group ?? ''}\u0000${anchor.kind}`;
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      const number = group ? `${groups.get(group)}.${n}` : String(n);
      out.set(anchor.id, { kind: anchor.kind, number, label: `${BLOCK_KINDS[anchor.kind]} ${number}` });
    }
  }
  return out;
}
