import { FolioError } from '../errors.js';
import { validatePolicy, validateScope } from '../policy/validate.js';
function invalid(message) { throw new FolioError('INPUT_INVALID', message); }
export function validateDefinition(kind, value) {
  if (kind === 'policy') return validatePolicy(value);
  if (!value || value.version !== 1) invalid('definition version required');
  if (kind === 'profile') {
    if (Object.keys(value).some((key) => !['version', 'scope', 'maxInputBytes'].includes(key)) || !Number.isSafeInteger(value.maxInputBytes) || value.maxInputBytes < 1) invalid('invalid profile byte budget');
    validateScope(value.scope);
  } else {
    if (Object.keys(value).some((key) => !['version', 'steps'].includes(key)) || !Array.isArray(value.steps) || !value.steps.length) invalid('pipeline steps required');
    const ids = new Set();
    for (const step of value.steps) {
      if (!step || Object.keys(step).some((key) => !['id', 'capability'].includes(key)) || typeof step.id !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(step.id) || ids.has(step.id) || !['transform', 'analyze'].includes(step.capability)) invalid('unsupported pipeline capability or duplicate step');
      ids.add(step.id);
    }
  }
  return value;
}
