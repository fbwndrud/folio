import { isPlainObject } from '../util/plain.js';
import { MAIN, VARIANT_ID, VARIANT_KINDS } from './model.js';

const FIELDS = ['id', 'kind', 'lang', 'steps'];
const LANG_MAX = 35;

/**
 * work.yaml variants: [main, { id, kind, lang?, steps? }, ...]. main 은 늘 첫 자리에 있다(적지 않아도).
 * 문자열 항목은 main 만 된다 — 다른 판본은 종류(kind)가 있어야 해서 지도로 적는다(문자열은 예전처럼 VARIANT_UNSUPPORTED).
 * steps 는 판본 파이프라인 덮어쓰기(core/variants/pipeline.js 가 검사한다). 오류는 errors 에 넣고 던지지 않는다.
 * @param {unknown} input
 * @param {Array<Record<string, unknown>>} errors
 */
export function readVariantDecls(input, errors) {
  const ids = [MAIN];
  /** @type {Record<string, { id: string, kind: string, lang: string|null, steps: Record<string, any> }>} */
  const specs = {};
  if (input === undefined) return { ids, specs };
  if (!Array.isArray(input)) { errors.push({ code: 'VARIANTS_INVALID' }); return { ids, specs }; }
  for (const entry of input) {
    if (entry === MAIN) continue;
    if (typeof entry === 'string') { errors.push({ code: 'VARIANT_UNSUPPORTED', variant: entry, hint: 'declare a variant as a map: { id, kind: translation|revision|summary, lang? }' }); continue; }
    if (!isPlainObject(entry)) { errors.push({ code: 'VARIANTS_INVALID' }); continue; }
    const unknown = Object.keys(entry).filter((key) => !FIELDS.includes(key));
    if (unknown.length) errors.push({ code: 'VARIANT_FIELD_UNKNOWN', fields: unknown });
    const { id, kind, lang, steps } = entry;
    if (typeof id !== 'string' || id === MAIN || !VARIANT_ID.test(id)) { errors.push({ code: 'VARIANT_ID_INVALID', variant: typeof id === 'string' ? id.slice(0, 60) : null }); continue; }
    if (Object.hasOwn(specs, id)) { errors.push({ code: 'VARIANT_DUPLICATE', variant: id }); continue; }
    if (!VARIANT_KINDS.includes(kind)) errors.push({ code: 'VARIANT_KIND_INVALID', variant: id });
    if (lang !== undefined && (typeof lang !== 'string' || !lang.trim() || lang.length > LANG_MAX)) errors.push({ code: 'VARIANT_LANG_INVALID', variant: id });
    if (steps !== undefined && !isPlainObject(steps)) errors.push({ code: 'VARIANT_STEPS_INVALID', variant: id });
    ids.push(id);
    specs[id] = { id, kind, lang: typeof lang === 'string' ? lang : null, steps: isPlainObject(steps) ? structuredClone(steps) : {} };
  }
  return { ids, specs };
}
