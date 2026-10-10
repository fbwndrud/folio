import { FolioError } from '../errors.js';
import { ID } from '../store/ids.js';

export const HASH = /^sha256:[a-f0-9]{64}$/;
export const invalid = (message) => new FolioError('TRACKING_INPUT_INVALID', message);
export const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** JSON 외의 실행 가능 값, getter, 순환 참조와 조용한 값 소실을 거부한다. */
export function assertJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) throw invalid('tracking requires ordinary JSON arrays');
  if ((!object(value) && !Array.isArray(value)) || ancestors.has(value)) throw invalid('tracking requires finite, acyclic JSON values');
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !property.enumerable || !Object.hasOwn(property, 'value')) throw invalid('tracking does not accept accessors or hidden values');
    assertJson(property.value, ancestors);
  }
  if (Array.isArray(value) && (Object.keys(value).length !== value.length
    || Object.keys(value).some((key, index) => key !== String(index)))) throw invalid('tracking requires dense JSON arrays');
  ancestors.delete(value);
}

export function fields(value, allowed, label) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw invalid(`${label} contains unknown fields or is not an object`);
}
export function text(value, label, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid(`${label} requires meaningful text of at most ${max} characters`);
  return value.trim();
}
export function id(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw invalid(`${label} requires a stable ID`);
  return value;
}
export function strings(value, label, { ids = false, nonempty = false } = {}) {
  if (!Array.isArray(value) || (nonempty && !value.length)) throw invalid(`${label} requires an array`);
  const result = value.map((item) => ids ? id(item, label) : text(item, label, 200));
  if (new Set(result).size !== result.length) throw invalid(`${label} must be unique`);
  return result;
}

export function normalizeValue(value, valueType, label = 'value') {
  assertJson(value);
  if (valueType === 'text' && typeof value === 'string') return value;
  if (valueType === 'number' && typeof value === 'number' && Number.isFinite(value)) return value;
  if (valueType === 'boolean' && typeof value === 'boolean') return value;
  if (valueType === 'entity') return id(value, label);
  if (valueType === 'entity-list') return strings(value, label, { ids: true });
  throw invalid(`${label} does not match ${valueType}`);
}
