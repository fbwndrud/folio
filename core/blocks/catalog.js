import { markedNodes, numberAnchors } from './numbering.js';
import { numberFootnotes } from './footnotes.js';
import { subtreeOf } from './subtree.js';

/**
 * 블록 목록(N3 계약, core/index/query.js 가 이름을 고정해 내보낸다). 파일에서 바로 계산한다 — index.db·작업 잠금 없이.
 * - blocks: 주인 앵커를 읽는 순서로. { id, kind, number, label, nodeId, line, caption, refs: [{ nodeId, line }] }.
 *   refs 는 작품 어디서든 그 블록을 가리키는 참조다(범위를 좁혀도 전부).
 * - refs: 범위 안 블록 참조. { nodeId, line, target, valid, label }(label 은 대상의 번호 이름, 없으면 null).
 * - footnotes: 범위 안 노드의 각주(core/blocks/footnotes.js). citations: 범위 안 자료 인용 { nodeId, line, sourceId, valid }.
 * - problems: BLOCK_DUPLICATE·BLOCK_REF_BROKEN(M1 validateBlocks), FOOTNOTE_*, SOURCE_CITATION_BROKEN. 읽는 순서 → 줄 → 코드 순.
 * nodeId 를 주면 그 노드와 자손만(없는 노드는 NODE_NOT_FOUND). 번호는 늘 작품 전체 기준이다.
 * @param {any} work openWork 결과
 * @param {{ nodeId?: string }} [options]
 */
export function blockCatalog(work, { nodeId } = {}) {
  const inScope = subtreeOf(work.tree, nodeId);
  const nodes = markedNodes(work);
  const numbers = numberAnchors(work, nodes);
  const order = new Map(nodes.map(({ node }, index) => [node.id, index]));
  const refsTo = new Map();
  for (const { node, marks } of nodes) {
    for (const ref of marks.refs) {
      if (!refsTo.has(ref.target)) refsTo.set(ref.target, []);
      refsTo.get(ref.target).push({ nodeId: node.id, line: ref.line });
    }
  }
  const out = { blocks: [], refs: [], footnotes: [], citations: [], problems: [] };
  for (const { node, marks, owned } of nodes) {
    if (inScope && !inScope.has(node.id)) continue;
    for (const anchor of owned) {
      const numbered = numbers.get(anchor.id);
      out.blocks.push({
        id: anchor.id, kind: numbered?.kind ?? null, number: numbered?.number ?? null, label: numbered?.label ?? null,
        nodeId: node.id, line: anchor.line, caption: anchor.caption, refs: refsTo.get(anchor.id) ?? [],
      });
    }
    for (const ref of marks.refs) {
      out.refs.push({ nodeId: node.id, line: ref.line, target: ref.target, valid: work.blocks.anchors.has(ref.target), label: numbers.get(ref.target)?.label ?? null });
    }
    const notes = numberFootnotes(node.id, marks);
    out.footnotes.push(...notes.footnotes);
    out.problems.push(...notes.problems);
    for (const citation of marks.citations) {
      const valid = work.sources.has(citation.sourceId);
      out.citations.push({ nodeId: node.id, line: citation.line, sourceId: citation.sourceId, valid });
      if (!valid) out.problems.push({ code: 'SOURCE_CITATION_BROKEN', nodeId: node.id, sourceId: citation.sourceId, line: citation.line });
    }
  }
  out.problems.push(...work.blocks.problems.filter((problem) => !inScope || inScope.has(problem.nodeId)));
  out.problems.sort((a, b) => order.get(a.nodeId) - order.get(b.nodeId) || a.line - b.line || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return out;
}

/** folio_status 의 blocks: { problems, total }(주인 앵커 수). blocks 기능이 꺼지면 null. */
export function blocksStatus(work) {
  if (!work.config.features.blocks) return null;
  const { blocks, problems } = blockCatalog(work);
  return { problems, total: blocks.length };
}
