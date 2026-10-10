import { FolioError } from '../errors.js';
import { validateDefinition } from '../resources/definitions.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { assertResourceId } from '../resources/schema.js';
import { createResourceStore } from '../resources/revisions.js';
import { readWorkspaceState, withWorkspaceStateTransaction } from '../publications/state.js';
import { DELEGATED_ACTIONS, validatePolicy } from './validate.js';
function invalid(message) { throw new FolioError('GRANT_INVALID', message); }
function copy(value) { try { return JSON.parse(canonicalJson(value)); } catch { invalid('JSON grant required'); } }
function authority(value) { if (value?.actor !== 'user' || value.attested !== true || Object.keys(value).some((key) => !['actor', 'attested'].includes(key))) invalid('explicit caller-attested human authority required'); }
export async function issueGrant(root, input) {
  input = copy(input);
  authority(input.authority); assertResourceId(input.grantId);
  if (Object.keys(input).some((key) => !['grantId', 'policyRevisionId', 'actor', 'actions', 'resourceIds', 'expiresAt', 'expectedCheckpoint', 'authority', 'profileRevisionId', 'pipelineRevisionId'].includes(key)) || input.actor !== 'host' || !Array.isArray(input.actions) || !input.actions.length || new Set(input.actions).size !== input.actions.length || input.actions.some((action) => !DELEGATED_ACTIONS.includes(action)) || !Number.isSafeInteger(input.expiresAt) || input.expiresAt < 1 || !input.expectedCheckpoint) invalid('invalid delegated scope or expiry');
  return withWorkspaceStateTransaction(root, async ({ state, append }) => {
    if (state.grants[input.grantId]) invalid('grant IDs cannot be reused');
    const store = createResourceStore(root);
    const revision = await store.readRevision(input.policyRevisionId);
    if (revision.kind !== 'policy' || revision.mediaType !== 'application/json' || state.sourceSelections[revision.resourceId]?.revisionId !== revision.revisionId) invalid('current selected owned policy required');
    const policy = validatePolicy(JSON.parse((await store.readContent(revision.revisionId)).toString('utf8')));
    if (!Array.isArray(input.resourceIds) || !input.resourceIds.length || new Set(input.resourceIds).size !== input.resourceIds.length || input.resourceIds.some((id) => !policy.scope.includes(id)) || input.actions.some((action) => !policy.allowedActions.includes(action)) || (policy.expiresAt !== undefined && input.expiresAt > policy.expiresAt)) invalid('grant exceeds policy');
    const definitionHashes = {};
    for (const kind of ['profile', 'pipeline']) {
      const definition = await store.readRevision(input[kind + 'RevisionId']);
      if (definition.kind !== kind || definition.mediaType !== 'application/json' || definition.storageStatus !== 'owned_snapshot' || state.sourceSelections[definition.resourceId]?.revisionId !== definition.revisionId) invalid('selected owned definition required');
      const value = validateDefinition(kind, JSON.parse((await store.readContent(definition.revisionId)).toString('utf8')));
      if (kind === 'profile' && input.resourceIds.some((id) => !value.scope.includes(id))) invalid('grant exceeds profile scope');
      definitionHashes[kind] = sha256(canonicalJson(value));
    }
    const { expectedCheckpoint, ...fields } = input;
    const payload = { ...fields, definitionHashes };
    const checkpoint = await append({ kind: 'grant-issued', payload, expectedCheckpoint });
    return { ...payload, revoked: false, checkpoint };
  });
}
export async function revokeGrant(root, input) {
  input = copy(input); authority(input.authority); assertResourceId(input.grantId);
  if (!input.expectedCheckpoint || Object.keys(input).some((key) => !['grantId', 'expectedCheckpoint', 'authority'].includes(key))) invalid('checkpoint required');
  return withWorkspaceStateTransaction(root, async ({ state, append }) => {
    if (!state.grants[input.grantId] || state.grants[input.grantId].revoked) invalid('active grant required');
    const { expectedCheckpoint, ...payload } = input;
    const checkpoint = await append({ kind: 'grant-revoked', payload, expectedCheckpoint });
    return { ...state.grants[input.grantId], revoked: true, revocation: payload, checkpoint };
  });
}
export async function resolveGrant(root, grantId) { assertResourceId(grantId); return (await readWorkspaceState(root)).grants[grantId] ?? null; }
