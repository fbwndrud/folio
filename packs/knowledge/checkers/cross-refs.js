import { parseNodeMarks } from '../../../core/blocks/syntax.js';
import { numberFootnotes } from '../../../core/blocks/footnotes.js';
import { workEntities } from './definitions.js';

/** 각주 문제 → 원고에 그대로 있는 표시 글. */
const FOOTNOTE_QUOTES = Object.freeze({
  FOOTNOTE_UNDEFINED: (id) => `[^${id}]`,
  FOOTNOTE_UNUSED: (id) => `[^${id}]:`,
  FOOTNOTE_DUPLICATE: (id) => `[^${id}]:`,
});
const FOOTNOTE_MESSAGES = Object.freeze({
  FOOTNOTE_UNDEFINED: (id) => `각주 [^${id}]의 정의([^${id}]: 글)가 이 원고에 없다`,
  FOOTNOTE_UNUSED: (id) => `각주 정의 [^${id}]를 부르는 곳이 이 원고에 없다`,
  FOOTNOTE_DUPLICATE: (id) => `각주 [^${id}]를 두 번 이상 정의했다 — 앞의 것만 쓴다`,
});

/**
 * 상호 참조 유효성(knowledge.cross-refs, N3). 이 원고의 블록 참조·앵커·각주·자료 인용이 가리키는 것이 있는지 본다.
 * - 원고가 이 노드 본문을 대신한다: 앵커는 다른 노드 본문(ctx.work)과 이 원고에서 찾는다. 이 노드의 옛 본문은 보지 않는다.
 * - BLOCK_REF_BROKEN: `[[block:id]]`가 가리키는 앵커가 어디에도 없다. BLOCK_DUPLICATE: 원고의 앵커 id 가 다른 노드에 이미 있거나 원고 안에서 겹친다.
 * - FOOTNOTE_UNDEFINED·FOOTNOTE_UNUSED·FOOTNOTE_DUPLICATE: 원고 안 각주(core/blocks/footnotes.js 와 같은 규칙).
 * - SOURCE_CITATION_BROKEN: `[[source:id]]`가 sources/ 에 없는 자료를 가리킨다.
 * - quote 는 원고에 그대로 있는 표시 글이다. 같은 코드·같은 인용은 한 번만 알리고 횟수를 메시지에 적는다. 코드 블록 안은 보지 않는다.
 * - 순서와 무관하다(뒤 절의 그림을 미리 가리켜도 된다 — requiresOrder 없음).
 * - 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다. ctx.work 가 없으면 던진다(workEntities).
 * @param {{ draft?: string, node?: { id: string }, nodeId?: string, work?: any }} ctx
 */
export function crossRefs(ctx) {
  workEntities(ctx);
  const { work } = ctx;
  const nodeId = ctx.node?.id ?? ctx.nodeId ?? null;
  const marks = parseNodeMarks(typeof ctx.draft === 'string' ? ctx.draft : '');
  const elsewhere = new Set();
  for (const node of work.tree.nodes.values()) {
    if (node.id !== nodeId) for (const anchor of parseNodeMarks(node.body).anchors) elsewhere.add(anchor.id);
  }
  const found = new Map();
  const add = (code, quote, target, message) => {
    const key = `${code}\u0000${quote}`;
    if (found.has(key)) found.get(key).times += 1;
    else found.set(key, { code, quote, target, message, times: 1 });
  };
  const here = new Set();
  for (const anchor of marks.anchors) {
    if (elsewhere.has(anchor.id) || here.has(anchor.id)) add('BLOCK_DUPLICATE', `{#${anchor.id}}`, anchor.id, `앵커 {#${anchor.id}}의 id 가 이미 있다 — 블록 id 는 작품 전체에서 하나다`);
    here.add(anchor.id);
  }
  for (const ref of marks.refs) {
    if (!elsewhere.has(ref.target) && !here.has(ref.target)) add('BLOCK_REF_BROKEN', `[[block:${ref.target}]]`, ref.target, `[[block:${ref.target}]]가 가리키는 앵커 {#${ref.target}}가 작품에 없다`);
  }
  for (const problem of numberFootnotes(nodeId, marks).problems) {
    add(problem.code, FOOTNOTE_QUOTES[problem.code](problem.id), problem.id, FOOTNOTE_MESSAGES[problem.code](problem.id));
  }
  for (const citation of marks.citations) {
    if (!work.sources.has(citation.sourceId)) add('SOURCE_CITATION_BROKEN', `[[source:${citation.sourceId}]]`, citation.sourceId, `[[source:${citation.sourceId}]]가 가리키는 자료가 sources/ 에 없다`);
  }
  return [...found.values()].map(({ code, quote, target, message, times }) => ({ code, quote, target, message: times > 1 ? `${message} (${times}번)` : message }));
}
