import { isDeepStrictEqual } from 'node:util';

const TYPES = {
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: Array.isArray,
  string: (v) => typeof v === 'string',
  integer: Number.isInteger,
  boolean: (v) => typeof v === 'boolean',
  null: (v) => v === null,
};

/**
 * 도구 입력을 도구 정의의 JSON Schema(부분)로 검사한다. SDK 의 zod 를 쓰지 않으려고 직접 만든다.
 * 지원: type, properties, required, additionalProperties, enum, const, pattern, items,
 * 길이·범위, allOf/anyOf/oneOf/not, if/then/else, boolean schema. default는 설명이며 값을 넣지 않는다.
 * @returns {Array<{ path: string, message: string }>} 빈 배열이면 통과
 */
export function validateInput(schema, value, path = '$') {
  const errors = [];
  const push = (message, at = path) => errors.push({ path: at, message });
  if (schema === true) return errors;
  if (schema === false) { push('is not allowed'); return errors; }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type && !types.some((type) => TYPES[type]?.(value))) { push(`must be ${types.join(' or ')}`); return errors; }

  if (schema.enum && !schema.enum.some((item) => isDeepStrictEqual(item, value))) push(`must be one of ${schema.enum.join(', ')}`);
  if (Object.hasOwn(schema, 'const') && !isDeepStrictEqual(value, schema.const)) push(`must equal ${JSON.stringify(schema.const)}`);
  const matches = (child) => validateInput(child, value, path).length === 0;
  for (const child of schema.allOf ?? []) errors.push(...validateInput(child, value, path));
  if (schema.anyOf && !schema.anyOf.some(matches)) push('must match an allowed shape');
  if (schema.oneOf && schema.oneOf.filter(matches).length !== 1) push('must match exactly one allowed shape');
  if (schema.not !== undefined && matches(schema.not)) push('matches a forbidden shape');
  if (schema.if !== undefined) {
    const branch = matches(schema.if) ? schema.then : schema.else;
    if (branch !== undefined) errors.push(...validateInput(branch, value, path));
  }
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern, 'u').test(value)) push('has an invalid format');
  if (typeof value === 'string' && (schema.minLength !== undefined || schema.maxLength !== undefined)) {
    // JSON Schema의 글자 수는 UTF-16 코드 단위가 아니라 유니코드 코드 포인트다.
    let length = 0;
    for (const _character of value) length += 1;
    if (schema.minLength !== undefined && length < schema.minLength) push(`must have at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && length > schema.maxLength) push(`must have at most ${schema.maxLength} characters`);
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) push(`must be >= ${schema.minimum}`);
  if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) push(`must be <= ${schema.maximum}`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) push(`must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) push(`must have at most ${schema.maxItems} items`);
    if (schema.items !== undefined) value.forEach((item, i) => errors.push(...validateInput(schema.items, item, `${path}[${i}]`)));
  }
  if (TYPES.object(value)) {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) push('is required', `${path}.${key}`);
    for (const [key, item] of Object.entries(value)) {
      const at = `${path}.${key}`;
      if (schema.properties && Object.hasOwn(schema.properties, key)) errors.push(...validateInput(schema.properties[key], item, at));
      else if (schema.additionalProperties === false) push('is not allowed', at);
      else if (TYPES.object(schema.additionalProperties)) errors.push(...validateInput(schema.additionalProperties, item, at));
    }
  }
  return errors;
}
