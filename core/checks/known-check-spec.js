import { isPlainObject } from '../util/plain.js';
import { takesWorkConfig } from '../pack/check-config.js';

/** work.yaml checks.<알려진 팩·코어 검사 id> 에 적을 수 있는 필드. 그 밖(words, locked, title 등)은 CHECK_FIELD_UNKNOWN. */
export const KNOWN_CHECK_FIELDS = Object.freeze(['mode', 'severity', 'config']);
const MODES = ['on', 'off'];
const MAX_DEPTH = 8;

/** JSON 으로 옮길 수 있는 값인가(문자열·유한수·불리언·null·배열·평범한 지도). YAML 태그가 만든 Date·Map 등은 아니다. */
function jsonLike(value, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => jsonLike(item, depth + 1));
  return isPlainObject(value) && Object.values(value).every((item) => jsonLike(item, depth + 1));
}

/**
 * checks.<id>.config 가 받을 수 있는 값인지. 오류 목록을 돌려준다(없으면 빈 목록).
 * - features.checkConfig 가 꺼져 있으면 CHECK_CONFIG_DISABLED
 * - 팩이 config 를 선언하지 않았거나 설정을 검사기에 넘기지 않는 검사(모델 검사 등)는 CHECK_CONFIG_UNSUPPORTED
 * - 지도가 아니거나 JSON 값이 아니면 CHECK_CONFIG_INVALID, 팩 config 에 없는 키는 CHECK_CONFIG_KEY_UNKNOWN
 * 값의 뜻(목표가 양의 정수인지 등)은 검사기가 본다(*_CONFIG_INVALID 지적).
 */
function configErrors(id, config, existing, features) {
  if (features?.checkConfig === false) return [{ code: 'CHECK_CONFIG_DISABLED', checkId: id }];
  if (!takesWorkConfig(existing)) return [{ code: 'CHECK_CONFIG_UNSUPPORTED', checkId: id }];
  if (!isPlainObject(config) || !jsonLike(config)) return [{ code: 'CHECK_CONFIG_INVALID', checkId: id }];
  return Object.keys(config).filter((key) => !Object.hasOwn(existing.config, key))
    .map((key) => ({ code: 'CHECK_CONFIG_KEY_UNKNOWN', checkId: id, key: key.slice(0, 100) }));
}

/**
 * work.yaml checks.<id> 한 줄(이미 알려진 팩 검사)의 모양을 본다. 잠금·hard 판단은 부르는 쪽(check-set.js)이 한다.
 * - 값이 없으면(null) 켜기다(예전과 같다). 지도가 아니면 CHECK_SPEC_INVALID.
 * - 필드는 KNOWN_CHECK_FIELDS 만, mode 는 on·off 만(CHECK_MODE_INVALID).
 * - config 는 configErrors 를 지나야 한다.
 * @returns {{ spec: { mode?: string, severity?: string, config?: Record<string, any> } | null, errors: Array<Record<string, unknown>> }}
 */
export function readKnownCheckSpec({ id, spec, existing, features }) {
  if (spec === null || spec === undefined) return { spec: {}, errors: [] };
  if (!isPlainObject(spec)) return { spec: null, errors: [{ code: 'CHECK_SPEC_INVALID', checkId: id }] };
  /** @type {Array<Record<string, unknown>>} */
  const errors = Object.keys(spec).filter((field) => !KNOWN_CHECK_FIELDS.includes(field))
    .map((field) => ({ code: 'CHECK_FIELD_UNKNOWN', checkId: id, field: field.slice(0, 100) }));
  if (spec.mode !== undefined && !MODES.includes(spec.mode)) errors.push({ code: 'CHECK_MODE_INVALID', checkId: id });
  // hard 검사의 config 는 check-set.js 가 HARD_CHECK_CONFIG_LOCKED 로 먼저 막는다 — 여기서는 hard 가 아닐 때만 본다.
  if (spec.config !== undefined && existing.severity !== 'hard') errors.push(...configErrors(id, spec.config, existing, features));
  return errors.length ? { spec: null, errors } : { spec, errors };
}
