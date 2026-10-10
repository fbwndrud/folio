import { resolveQuote } from './anchor.js';
import { MAX_ITEMS, OCCURRENCE_KINDS } from './records.js';

const clip = (value) => String(value).slice(0, 100);

/**
 * 제출 항목을 본문과 대조한다. 엔티티가 있고, 종류가 appearance|mention 이고, 인용문이 본문에 한 곳으로 정해져야 한다.
 * 인용문에 이름이 없어도 된다(대명사·호칭). 같은 엔티티·같은 위치는 한 번만 받는다. 문맥은 엔진이 자른 것으로 바꾼다.
 */
export function validateItems(work, text, items) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return { items: [], errors: [{ index: null, code: 'OCCURRENCES_SHAPE_INVALID' }] };
  const errors = [];
  const accepted = [];
  const seen = new Map(); // key(entityId@위치) -> accepted 안의 자리
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push({ index, code: 'OCCURRENCE_INVALID' }); continue; }
    if (typeof item.entityId !== 'string' || !work.entities.has(item.entityId)) { errors.push({ index, code: 'OCCURRENCE_ENTITY_UNKNOWN', entityId: clip(item.entityId) }); continue; }
    if (!OCCURRENCE_KINDS.includes(item.kind)) { errors.push({ index, code: 'OCCURRENCE_KIND_INVALID', entityId: item.entityId }); continue; }
    const found = resolveQuote(text, item);
    if (found.ok === false) { errors.push({ index, code: found.code, entityId: item.entityId, ...(found.count !== undefined ? { count: found.count } : {}) }); continue; }
    const key = `${item.entityId}@${found.start}`;
    const record = { entityId: item.entityId, kind: item.kind, quote: item.quote, before: found.before, after: found.after };
    if (seen.has(key)) {
      // 같은 엔티티·같은 위치가 두 번 오면 앞뒤 순서와 상관없이 appearance 가 이긴다(Ruling B3-1) — 등장 검사(예: 사망 등장)가 mention 뒤에 놓인다고 놓치면 안 된다.
      const at = seen.get(key);
      if (record.kind === 'appearance' && accepted[at].kind === 'mention') accepted[at] = record;
      continue;
    }
    seen.set(key, accepted.length);
    accepted.push(record);
  }
  return { items: accepted, errors };
}
