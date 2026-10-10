import { copy, fail } from './objects.js';
export function normalizeTrace(reportedTrace = {}) {
  const reported = copy(reportedTrace);
  if (!reported || typeof reported !== 'object' || Array.isArray(reported)) fail('TRACE_INVALID', 'reported trace must be object');
  return { observation: 'host-reported', reported, cost: reported.cost ?? 'unknown', unavailableFields: ['modelInternalReasoning', ...(reported.cost == null ? ['cost'] : [])] };
}
