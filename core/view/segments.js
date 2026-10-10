import { fencedRanges, inRanges } from '../util/fences.js';
import { parseNodeMarks } from '../blocks/syntax.js';

const ASSET = /!\[\[asset:([A-Za-z0-9][\w-]*)\]\]/g;

/** @typedef {{ text: string } | { text: string, entityId: string } | { asset: string } | { text: string, anchor: string } | { text: string, blockRef: string } | { text: string, footnoteRef: string } | { text: string, citation: string }} Segment */

/**
 * 본문을 읽기 화면 조각으로 나눈다: 글, 엔티티 이름(누르면 정의로 간다), 본문 속 그림(![[asset:id]]),
 * 블록 앵커({#id})와 블록 참조([[block:id]]), 각주 참조([^id]), 자료 인용([[source:id]]). 위치는 core/blocks/syntax.js parseNodeMarks 가 준다.
 * 이름·별칭은 긴 말부터 겹치지 않게 잡는다(core/index/scan.js scanMentions 와 같은 규칙). 코드 블록 안은 글 그대로 둔다.
 * 조각의 글을 이어 붙이면(그림 조각은 원래 표기로) 본문과 한 글자도 다르지 않다.
 * @param {string} body
 * @param {Iterable<{ id: string, name: string, aliases?: string[] }>} entities
 * @returns {Segment[]}
 */
export function bodySegments(body, entities) {
  const text = String(body);
  const fenced = fencedRanges(text);
  const taken = new Uint8Array(text.length);
  /** @type {Array<{ start: number, end: number, entityId?: string, asset?: string, anchor?: string, blockRef?: string, footnoteRef?: string, citation?: string }>} */
  const marks = [];
  const claim = (start, end, mark) => {
    if (inRanges(fenced, start, end) || taken.subarray(start, end).some((v) => v === 1)) return false;
    taken.fill(1, start, end);
    marks.push({ start, end, ...mark });
    return true;
  };
  for (const match of text.matchAll(ASSET)) claim(match.index, match.index + match[0].length, { asset: match[1] });
  const found = parseNodeMarks(text);
  for (const m of found.anchors) claim(m.start, m.end, { anchor: m.id });
  for (const m of found.refs) claim(m.start, m.end, { blockRef: m.target });
  for (const m of found.footnoteRefs) claim(m.start, m.end, { footnoteRef: m.id });
  for (const m of found.citations) claim(m.start, m.end, { citation: m.sourceId });
  const terms = [];
  for (const entity of entities) {
    for (const term of [entity.name, ...(entity.aliases ?? [])]) if (term) terms.push({ term, id: entity.id });
  }
  terms.sort((a, b) => b.term.length - a.term.length || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  for (const { term, id } of terms) {
    let at = text.indexOf(term);
    while (at !== -1) {
      const claimed = claim(at, at + term.length, { entityId: id });
      at = text.indexOf(term, claimed ? at + term.length : at + 1);
    }
  }
  marks.sort((a, b) => a.start - b.start);
  /** @type {Segment[]} */
  const segments = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) segments.push({ text: text.slice(cursor, mark.start) });
    const piece = text.slice(mark.start, mark.end);
    if (mark.asset !== undefined) segments.push({ asset: mark.asset });
    else if (mark.anchor !== undefined) segments.push({ text: piece, anchor: mark.anchor });
    else if (mark.blockRef !== undefined) segments.push({ text: piece, blockRef: mark.blockRef });
    else if (mark.footnoteRef !== undefined) segments.push({ text: piece, footnoteRef: mark.footnoteRef });
    else if (mark.citation !== undefined) segments.push({ text: piece, citation: mark.citation });
    else segments.push({ text: piece, entityId: mark.entityId });
    cursor = mark.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
