import { fencedRanges, maskRanges } from '../util/fences.js';
import { CONTEXT_CHARS } from './anchor.js';
import { surfaceFields } from './surfaces.js';
import { occurrenceStates } from './state.js';

/**
 * 제출을 돕는 후보(설계 §15의 mention-scan): 표면의 이름·별칭 정확 일치. 긴 말부터 가려서 두 번 세지 않는다.
 * 후보일 뿐 기록이 아니다 — 대명사·호칭은 호스트가 직접 찾아 낸다. 이미 같은 자리에 기록된 등장이 있으면 recorded.
 */
export function candidatesFor(work, records, surface) {
  const fields = surfaceFields(work, surface.kind, surface.id);
  if (!fields) return [];
  const terms = [];
  for (const entity of work.entities.values()) for (const term of [entity.name, ...entity.aliases]) if (term) terms.push({ term, entityId: entity.id });
  terms.sort((a, b) => b.term.length - a.term.length || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  const recorded = occurrenceStates(work, records)
    .filter((s) => s.status !== 'stale' && s.surface.kind === surface.kind && s.surface.id === surface.id);
  const out = [];
  for (const [field, text] of fields) {
    let masked = maskRanges(text, fencedRanges(text));
    for (const { term, entityId } of terms) {
      let at = masked.indexOf(term);
      while (at !== -1) {
        out.push({
          entityId, field, quote: term, start: at,
          before: text.slice(Math.max(0, at - CONTEXT_CHARS), at), after: text.slice(at + term.length, at + term.length + CONTEXT_CHARS),
          recorded: recorded.some((s) => s.surface.field === field && s.entityId === entityId && s.start <= at && at < s.start + s.quote.length),
        });
        masked = masked.slice(0, at) + '\u0000'.repeat(term.length) + masked.slice(at + term.length);
        at = masked.indexOf(term, at + term.length);
      }
    }
  }
  return out.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : a.start - b.start));
}
