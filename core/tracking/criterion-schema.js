import { assertJson, fields, id, invalid, normalizeValue, strings, text } from './schema.js';

export const VALUE_TYPES = ['text', 'number', 'boolean', 'entity', 'entity-list'];
export const BEHAVIORS = ['fixed', 'state', 'relation', 'note'];

export function normalizeCriterion(input, { nodeIds = [] } = {}) {
  assertJson(input);
  fields(input, ['id', 'title', 'instruction', 'subjectKinds', 'valueType', 'behavior', 'appliesTo', 'expectedValue'], 'criterion');
  if (!VALUE_TYPES.includes(input.valueType) || !BEHAVIORS.includes(input.behavior)) throw invalid('criterion requires a known valueType and behavior');
  const appliesTo = input.appliesTo === 'all' ? 'all' : strings(input.appliesTo, 'criterion.appliesTo', { ids: true, nonempty: true });
  if (appliesTo !== 'all' && appliesTo.some((nodeId) => !nodeIds.includes(nodeId))) throw invalid('criterion.appliesTo references an unknown node');
  const criterion = {
    id: id(input.id, 'criterion.id'), title: text(input.title, 'criterion.title', 200),
    instruction: text(input.instruction, 'criterion.instruction'), subjectKinds: strings(input.subjectKinds, 'criterion.subjectKinds', { nonempty: true }),
    valueType: input.valueType, behavior: input.behavior, appliesTo,
  };
  if (input.behavior === 'fixed') {
    if (!Object.hasOwn(input, 'expectedValue')) throw invalid('fixed criterion requires expectedValue');
    return { ...criterion, expectedValue: normalizeValue(input.expectedValue, input.valueType, 'criterion.expectedValue') };
  }
  if (Object.hasOwn(input, 'expectedValue')) throw invalid('expectedValue belongs only to fixed criteria');
  return criterion;
}
