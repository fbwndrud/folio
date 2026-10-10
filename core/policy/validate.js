import { FolioError } from '../errors.js';
import { canonicalJson } from '../util/hash.js';
import { assertResourceId } from '../resources/schema.js';

export const POLICY_ACTIONS = Object.freeze(['create-candidate', 'publish', 'select-source', 'issue-grant', 'revoke-grant']);
export const DELEGATED_ACTIONS = Object.freeze(['create-candidate', 'publish']);
export function failPolicy(message) { throw new FolioError('POLICY_INVALID', message); }
export function validateScope(scope) {
  if (!Array.isArray(scope) || !scope.length || new Set(scope).size !== scope.length) failPolicy('nonempty unique resource scope required');
  for (const id of scope) assertResourceId(id);
}
export function validatePolicy(policy) {
  if (!policy || policy.version !== 1 || Object.keys(policy).some((key) => !['version', 'mode', 'scope', 'allowedActions', 'expiresAt', 'maxInputBytes'].includes(key))) failPolicy('unsupported policy fields; fixed safeguards cannot be configured');
  if (!['Balanced', 'Strict'].includes(policy.mode ?? 'Balanced')) failPolicy('unsupported mode');
  validateScope(policy.scope);
  if (!Array.isArray(policy.allowedActions) || !policy.allowedActions.length || new Set(policy.allowedActions).size !== policy.allowedActions.length || policy.allowedActions.some((action) => !POLICY_ACTIONS.includes(action))) failPolicy('unsupported action');
  for (const key of ['expiresAt', 'maxInputBytes']) if (policy[key] !== undefined && (!Number.isSafeInteger(policy[key]) || policy[key] < 1)) failPolicy('invalid expiry or byte budget');
  return policy;
}
/** Local caller assertions are not authentication. Documents never create grants. */
export function authorize(policy, { actor, action, resourceIds, now, grantState, policyRevisionId, profileRevisionId, pipelineRevisionId, definitionHashes }) {
  validatePolicy(policy);
  const denied = () => { throw new FolioError('POLICY_DENIED', 'action requires current in-scope authority'); };
  if (!['user', 'host'].includes(actor) || !Number.isSafeInteger(now) || now < 0 || !Array.isArray(resourceIds) || !resourceIds.length || resourceIds.some((id) => !policy.scope.includes(id)) || !policy.allowedActions.includes(action) || (policy.expiresAt !== undefined && now >= policy.expiresAt)) denied();
  if (actor === 'user') return true;
  if (!DELEGATED_ACTIONS.includes(action)) denied();
  if (grantState !== undefined) {
    if (!grantState || grantState.revoked !== false || grantState.actor !== actor || !grantState.actions?.includes(action) || resourceIds.some((id) => !grantState.resourceIds?.includes(id)) || !Number.isSafeInteger(grantState.expiresAt) || now >= grantState.expiresAt || !policyRevisionId || grantState.policyRevisionId !== policyRevisionId) denied();
    if (!profileRevisionId || !pipelineRevisionId || grantState.profileRevisionId !== profileRevisionId || grantState.pipelineRevisionId !== pipelineRevisionId) denied();
    if (!grantState.definitionHashes || !definitionHashes || canonicalJson(grantState.definitionHashes) !== canonicalJson(definitionHashes)) denied();
    return true;
  }
  if (action === 'create-candidate' && (policy.mode ?? 'Balanced') === 'Balanced') return true;
  denied();
}
