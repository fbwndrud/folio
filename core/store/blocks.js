import { fencedLines } from '../util/fences.js';

const ANCHOR = /\{#([A-Za-z0-9][\w-]*)\}/g;
const REF = /\[\[block:([A-Za-z0-9][\w-]*)\]\]/g;

/** 앵커와 블록 참조 모양. core/blocks/syntax.js 가 같은 모양을 쓴다(matchAll·replace 만 쓴다 — lastIndex 를 남기지 않는다). */
export { ANCHOR as BLOCK_ANCHOR, REF as BLOCK_REF };

/** 본문 속 그림·표·수식·각주 앵커와 그것을 가리키는 참조. */
export function parseBlocks(body) {
  const fenced = fencedLines(body);
  const anchors = [];
  const refs = [];
  String(body).split('\n').forEach((text, index) => {
    // 코드 블록 안의 앵커·참조는 읽지 않는다.
    if (fenced.has(index + 1)) return;
    for (const match of text.matchAll(ANCHOR)) anchors.push({ id: match[1], line: index + 1 });
    for (const match of text.matchAll(REF)) refs.push({ target: match[1], line: index + 1 });
  });
  return { anchors, refs };
}

/** 앵커 id는 작품 전체에서 하나. 깨진 참조와 중복 앵커는 문제로 돌려준다(오류로 막지 않음). */
export function validateBlocks(tree) {
  const anchors = new Map();
  const problems = [];
  const parsed = [...tree.nodes.values()].map((node) => ({ node, ...parseBlocks(node.body) }));
  for (const { node, anchors: found } of parsed) {
    for (const anchor of found) {
      if (anchors.has(anchor.id)) problems.push({ code: 'BLOCK_DUPLICATE', nodeId: node.id, id: anchor.id, line: anchor.line });
      else anchors.set(anchor.id, { nodeId: node.id, line: anchor.line });
    }
  }
  const refs = [];
  for (const { node, refs: found } of parsed) {
    for (const ref of found) {
      const valid = anchors.has(ref.target);
      refs.push({ nodeId: node.id, target: ref.target, line: ref.line, valid });
      if (!valid) problems.push({ code: 'BLOCK_REF_BROKEN', nodeId: node.id, target: ref.target, line: ref.line });
    }
  }
  return { anchors, refs, problems };
}
