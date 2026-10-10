import { fencedLines } from '../util/fences.js';
import { BLOCK_ANCHOR, BLOCK_REF } from '../store/blocks.js';

/**
 * 번호를 매기는 블록 종류: 앵커 id 의 앞머리(첫 '-' 앞) → 이름. 그 밖의 앵커({#intro})는 이름만 있는 앵커다(번호 없음, 참조는 된다).
 * 얼린 목록이다 — 종류를 더할 때는 끝에만 더한다.
 */
export const BLOCK_KINDS = Object.freeze({ fig: '그림', tbl: '표', eq: '식' });

const ID = '[A-Za-z0-9][\\w-]*';
/** 줄머리(공백 세 칸까지)의 각주 정의 `[^id]: 글`. GFM 과 같은 모양이고 한 줄짜리만 읽는다(CRLF 의 \r·U+2028 도 줄 안 글로 받는다). */
const FOOTNOTE_DEF = new RegExp(`^ {0,3}\\[\\^(${ID})\\]:[ \\t]*([\\s\\S]*)$`);
const FOOTNOTE_REF = new RegExp(`\\[\\^(${ID})\\]`, 'g');
/** 본문 속 자료 인용 `[[source:id]]`. 가리키는 자료는 sources/ 설명서의 id 다. */
const CITATION = new RegExp(`\\[\\[source:(${ID})\\]\\]`, 'g');
const CAPTION_MAX = 200;

/** 앵커 id 의 번호 종류(fig·tbl·eq). 알려진 앞머리가 아니면 null. */
export function blockKind(id) {
  const prefix = String(id).split('-')[0];
  return Object.hasOwn(BLOCK_KINDS, prefix) ? prefix : null;
}

/** 앵커가 있는 줄에서 앵커를 뺀 글(공백 하나로 모음, 200자까지). 그림·표 제목 자리다. */
const captionOf = (text) => text.replace(BLOCK_ANCHOR, ' ').replace(/\s+/g, ' ').trim().slice(0, CAPTION_MAX);

/**
 * 노드 본문 하나의 블록 표시를 모두 읽는다. 줄 번호는 1부터다. 코드 블록(울타리) 안은 읽지 않는다(core/store/blocks.js 와 같은 규칙).
 * - anchors: `{#id}` — kind(번호 종류 또는 null), caption(그 줄의 글).
 * - refs: `[[block:id]]`.
 * - footnoteRefs: `[^id]`(각주 정의 줄의 머리는 참조가 아니다), footnotes: 줄머리 `[^id]: 글`.
 * - citations: `[[source:id]]`.
 * 모든 항목에 start·end: 본문 안 글자 위치 [start, end)(표시 글 자체. 각주 정의는 `[^id]:`부터 줄 끝까지) — 뷰어가 본문 조각을 나눌 때 쓴다.
 * 순서는 줄, 같은 줄에서는 나온 순서다. 검사·번호 매기기는 이 결과만 본다.
 * @param {string} body
 */
export function parseNodeMarks(body) {
  const fenced = fencedLines(body);
  const out = { anchors: [], refs: [], footnoteRefs: [], footnotes: [], citations: [] };
  let offset = 0;
  String(body).split('\n').forEach((text, index) => {
    const line = index + 1;
    const at = offset;
    offset += text.length + 1;
    if (fenced.has(line)) return;
    const span = (match, base = at) => ({ start: base + match.index, end: base + match.index + match[0].length });
    for (const match of text.matchAll(BLOCK_ANCHOR)) out.anchors.push({ id: match[1], line, kind: blockKind(match[1]), caption: captionOf(text), ...span(match) });
    for (const match of text.matchAll(BLOCK_REF)) out.refs.push({ target: match[1], line, ...span(match) });
    const definition = FOOTNOTE_DEF.exec(text);
    if (definition) out.footnotes.push({ id: definition[1], line, text: definition[2].trim(), start: at + text.indexOf('[^'), end: at + text.length });
    const rest = definition ? definition[2] : text;
    for (const match of rest.matchAll(FOOTNOTE_REF)) out.footnoteRefs.push({ id: match[1], line, ...span(match, at + text.length - rest.length) });
    for (const match of text.matchAll(CITATION)) out.citations.push({ sourceId: match[1], line, ...span(match) });
  });
  return out;
}
