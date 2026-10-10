import { FolioError } from '../../core/errors.js';
import { copy } from '../../core/operations/objects.js';
export const ID = { type: 'string', minLength: 1 };
export const CHECKPOINT = { type: 'object', additionalProperties: false, required: ['seq', 'hash'], properties: { seq: { type: 'integer', minimum: 0 }, hash: ID } };
export const AUTHORITY = { type: 'object', additionalProperties: false, required: ['actor', 'attested'], properties: { actor: { type: 'string', enum: ['user'] }, attested: { type: 'boolean', enum: [true] } } };
export const ids = { type: 'array', minItems: 1, items: ID };
export const actor = { type: 'string', enum: ['user', 'host'] };
export function definition(name, description, ops, properties) {
  return { name, description, inputSchema: { type: 'object', additionalProperties: false, required: ['root', 'op'], properties: {
    root: { ...ID, description: '사용자가 고른 작업 폴더의 절대 경로' }, op: { type: 'string', enum: ops }, ...properties,
  } } };
}
export function argsFor(input, rules) {
  const args = copy(input); const { op, ...values } = args; const rule = rules[op];
  if (!args || typeof args !== 'object' || Array.isArray(args) || !rule || Object.keys(values).some((k) => !rule.allowed.includes(k)) || rule.required.some((k) => !Object.hasOwn(values, k))) throw new FolioError('TOOL_INPUT_INVALID', 'operation fields missing or unsupported');
  return { op, values };
}
export const rule = (required, optional = []) => ({ required, allowed: [...required, ...optional] });
