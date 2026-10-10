import { authorize } from '../policy/validate.js';
import { fail } from './objects.js';
export function checkAuthority(manifest, state, actor, grantId, action) {
  const selection = manifest.selections.find((s) => s.revisionId === manifest.policyRevisionId);
  if (state.sourceSelections[selection.resourceId]?.revisionId !== manifest.policyRevisionId) fail('POLICY_DENIED', 'current policy differs from pinned policy');
  return authorize(manifest.definitions.policy.value, { actor, action, resourceIds: manifest.scope, now: Date.now(), grantState: grantId === undefined ? undefined : state.grants[grantId] ?? null,
    policyRevisionId: manifest.policyRevisionId, profileRevisionId: manifest.profileRevisionId, pipelineRevisionId: manifest.pipelineRevisionId,
    definitionHashes: { profile: manifest.definitions.profile.definitionHash, pipeline: manifest.definitions.pipeline.definitionHash } });
}
