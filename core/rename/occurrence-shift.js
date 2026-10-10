import { CONTEXT_CHARS } from '../occurrences/anchor.js';

/**
 * @typedef {{ entityId: string, kind: string, quote: string, before?: string, after?: string,
 *   status: string, start: number|null }} ShiftInput
 * @typedef {{ entityId: string, kind: string, quote: string, before: string, after: string, carried?: boolean }} ShiftedItem
 */

/**
 * 옮길 수 없어 그대로 옮기는 항목(항상 원래 인용문 그대로). carried: true 를 달아, 다시 대조했을 때 우연히
 * 새 글의 엉뚱한 곳에 맞더라도 살아나지 않고 항상 stale(CARRIED)로 읽히게 한다(Ruling F-3). 다시 제출하면 대체된다.
 */
const carryAsIs = (item) => ({ entityId: item.entityId, kind: item.kind, quote: item.quote, before: item.before ?? '', after: item.after ?? '', carried: true });

/**
 * 표면 하나의 등장 위치 기록을 이름 바꾸기가 적용된 새 글에 맞춰 옮긴다(설계 §15, Ruling C2-1/C2-2).
 *
 * 라이브 항목(located/relocated)은 알려진 시작 위치를 그 앞에 적용된 변경들의 길이 차이만큼 옮긴다 —
 * 다시 검색하지 않는다(문맥 증거 규칙을 지킨다: 새 글에 우연히 같은 글자가 있어도 엉뚱한 곳을 짚지 않는다).
 * 어떤 변경이 인용문 경계 안에 통째로 들어있으면 그 부분만 quote 안에서 다시 쓴다(여러 개면 뒤에서부터).
 * 변경이 인용문 경계에 걸쳐 있으면(부분 겹침) 옮길 수 없다.
 *
 * stale이던 항목과 옮길 수 없는 항목은 원래 값 그대로 새 기록에 실린다 — 아무것도 조용히 사라지지 않는다
 * (Ruling C2-2). carried: true 가 붙어 다시 대조하면 항상 stale(CARRIED)로 나오고, 호스트가 다시 제출하는 계기가 된다.
 *
 * @param {{ items: ShiftInput[], starts: number[], oldName: string, newName: string, newText: string }} args
 * @returns {{ items: ShiftedItem[], carried: Array<{ entityId: string, quote: string }> }}
 */
export function shiftOccurrenceItems({ items, starts, oldName, newName, newText }) {
  const oldLen = oldName.length;
  const delta = newName.length - oldLen;
  const changes = [...starts].sort((a, b) => a - b).map((start) => ({ start, end: start + oldLen }));

  /** @type {ShiftedItem[]} */
  const out = [];
  /** @type {Array<{ entityId: string, quote: string }>} */
  const carried = [];

  for (const item of items) {
    if (item.status === 'stale' || item.start === null) {
      out.push(carryAsIs(item));
      carried.push({ entityId: item.entityId, quote: item.quote });
      continue;
    }
    const qStart = item.start;
    const qEnd = qStart + item.quote.length;
    let shift = 0;
    let unshiftable = false;
    const inside = [];
    for (const c of changes) {
      if (c.end <= qStart) { shift += delta; continue; }
      if (c.start >= qEnd) continue;
      if (c.start >= qStart && c.end <= qEnd) { inside.push(c); continue; }
      unshiftable = true;
    }
    if (unshiftable) {
      out.push(carryAsIs(item));
      carried.push({ entityId: item.entityId, quote: item.quote });
      continue;
    }
    let quote = item.quote;
    for (const c of [...inside].sort((a, b) => b.start - a.start)) {
      const rel = c.start - qStart;
      quote = quote.slice(0, rel) + newName + quote.slice(rel + oldLen);
    }
    const newStart = qStart + shift;
    out.push({
      entityId: item.entityId, kind: item.kind, quote,
      before: newText.slice(Math.max(0, newStart - CONTEXT_CHARS), newStart),
      after: newText.slice(newStart + quote.length, newStart + quote.length + CONTEXT_CHARS),
    });
  }
  return { items: out, carried };
}
