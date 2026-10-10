import { createHash } from 'node:crypto';

/** @param {string|Uint8Array} value */
export function sha256(value) {
  const input = typeof value === 'string' || value instanceof Uint8Array ? value : String(value);
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

/** 키를 정렬한 JSON. 해시의 입력으로만 쓴다. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export const shortRev = (hash) => String(hash).replace(/^sha256:/, '').slice(0, 12);
