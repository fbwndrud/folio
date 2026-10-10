import { parseNodeMarks } from '../../../core/blocks/syntax.js';

/** 블록 표시를 종류:id 낱말로 센다(같은 표시가 여러 번이면 그만큼). */
export function markCounts(text) {
  const marks = parseNodeMarks(String(text ?? ''));
  const tokens = [
    ...marks.anchors.map((m) => `anchor:${m.id}`), ...marks.refs.map((m) => `ref:${m.target}`),
    ...marks.footnoteRefs.map((m) => `footnote:${m.id}`), ...marks.footnotes.map((m) => `note:${m.id}`),
    ...marks.citations.map((m) => `source:${m.sourceId}`),
  ];
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

/** 블록 표시를 지운 글 — 숫자를 셀 때 앵커 id(fig-3-2)·각주 번호를 숫자로 읽지 않게. */
export const withoutMarks = (text) => String(text ?? '').replace(/\{#[^}\n]*\}|\[\[[^\]\n]*\]\]|\[\^[^\]\n]*\]/g, ' ');

/** 판본 종류. 검사 ctx 에 없으면(판본 실행이 아님) null — 검사는 아무것도 내지 않는다. */
export const kindOf = (ctx) => (typeof ctx?.variant?.kind === 'string' && typeof ctx?.original === 'string' ? ctx.variant.kind : null);
