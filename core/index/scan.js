import { fencedRanges, maskRanges } from '../util/fences.js';

/**
 * 이름·별칭 정확 일치로 등장 후보를 센다. 긴 말부터 가리고 세서 "마라 언니"가 "마라"로 두 번 세지지 않는다.
 * 호스트가 제출한 등장 위치(core/occurrences)가 이것을 보강한다. 코드 블록 안은 세지 않는다.
 */
export function scanMentions(text, entities) {
  const terms = [];
  for (const entity of entities) {
    for (const term of [entity.name, ...(entity.aliases ?? [])]) if (term) terms.push({ term, id: entity.id });
  }
  terms.sort((a, b) => b.term.length - a.term.length || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  let masked = maskRanges(String(text), fencedRanges(text));
  const counts = new Map();
  for (const { term, id } of terms) {
    let at = masked.indexOf(term);
    while (at !== -1) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      masked = masked.slice(0, at) + '\u0000'.repeat(term.length) + masked.slice(at + term.length);
      at = masked.indexOf(term, at + term.length);
    }
  }
  return counts;
}
