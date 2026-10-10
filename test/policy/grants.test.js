import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize, validatePolicy } from '../../core/policy/validate.js';
import { issueGrant, revokeGrant, resolveGrant } from '../../core/policy/grants.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
const policy = { version: 1, scope: ['a'], allowedActions: ['create-candidate', 'publish'] };
test('balanced candidates and important decisions enforce scope and current grants', () => {
  assert.equal(authorize(policy, { actor: 'host', action: 'create-candidate', resourceIds: ['a'], now: 1 }), true);
  assert.throws(() => authorize(policy, { actor: 'host', action: 'publish', resourceIds: ['a'], now: 1, grantState: { revoked: true } }), { code: 'POLICY_DENIED' });
  assert.throws(() => validatePolicy({ ...policy, hardBlocking: false }), { code: 'POLICY_INVALID' });
  assert.throws(() => validatePolicy({ ...policy, mode: 'Autonomous' }), { code: 'POLICY_INVALID' });
});
test('grant lifecycle is caller-attested and append-only', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-grants-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const revision = await store.propose({ resourceId: 'policy', kind: 'policy', owned: { bytes: JSON.stringify(policy), mediaType: 'application/json' } });
  const selected = await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
  const definitions = {};
  for (const [kind, value] of [['profile', { version: 1, scope: ['a'], maxInputBytes: 100 }], ['pipeline', { version: 1, steps: [{ id: 'draft', capability: 'transform' }] }]]) {
    const revision = await store.propose({ resourceId: kind, kind, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
    const marker = await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
    selected.checkpoint = marker.checkpoint; definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  const input = { ...definitions, grantId: 'g', policyRevisionId: revision.revisionId, actor: 'host', actions: ['publish'], resourceIds: ['a'], expiresAt: 100, expectedCheckpoint: selected.checkpoint, authority: { actor: 'user', attested: true } };
  const pending = issueGrant(root, input); input.actions[0] = 'unknown';
  const grant = await pending;
  assert.equal(authorize(policy, { actor: 'host', action: 'publish', resourceIds: ['a'], now: 1, ...definitions, grantState: grant, definitionHashes: grant.definitionHashes, policyRevisionId: revision.revisionId }), true);
  await revokeGrant(root, { grantId: 'g', expectedCheckpoint: grant.checkpoint, authority: { actor: 'user', attested: true } });
  const revoked = await resolveGrant(root, 'g');
  assert.equal(revoked.revoked, true);
  assert.throws(() => authorize(policy, { actor: 'host', action: 'publish', resourceIds: ['a'], now: 1, grantState: revoked, policyRevisionId: revision.revisionId }), { code: 'POLICY_DENIED' });
  await assert.rejects(issueGrant(root, { ...input, actions: ['publish'] }), { code: 'GRANT_INVALID' });
});
test('strict, expiry, scope, policy revision and document commands cannot elevate authority', () => {
  const grant = { revoked: false, actor: 'host', actions: ['publish', 'select-source'], resourceIds: ['a'], expiresAt: 10, policyRevisionId: 'p', profileRevisionId: 'profile-original', pipelineRevisionId: 'pipeline-original', definitionHashes: { profile: 'p', pipeline: 'q' } };
  const request = { actor: 'host', action: 'publish', resourceIds: ['a'], now: 1, grantState: grant, profileRevisionId: grant.profileRevisionId, pipelineRevisionId: grant.pipelineRevisionId, definitionHashes: grant.definitionHashes, policyRevisionId: 'p' };
  assert.equal(authorize(policy, request), true);
  for (const change of [{ definitionHashes: { profile: 'changed', pipeline: 'q' } }, { now: 10 }, { resourceIds: ['b'] }, { policyRevisionId: 'changed' }, { grantState: { ...grant, revoked: true } }, { grantState: { command: 'publish', actor: 'user' } }]) assert.throws(() => authorize(policy, { ...request, ...change }), { code: 'POLICY_DENIED' });
  assert.throws(() => authorize({ ...policy, mode: 'Strict' }, { actor: 'host', action: 'create-candidate', resourceIds: ['a'], now: 1 }), { code: 'POLICY_DENIED' });
  assert.throws(() => authorize({ ...policy, allowedActions: ['select-source'] }, { ...request, action: 'select-source' }), { code: 'POLICY_DENIED' });
  for (const key of ['hashVerification', 'receiptRequired', 'hardBlocking', 'selfReview', 'appendOnly', 'softAutoFix']) assert.throws(() => validatePolicy({ ...policy, [key]: false }), { code: 'POLICY_INVALID' });
});

test('grant rejects same JSON with different bytes, revision lineage or resource identity', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-grant-identity-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root); const revisions = {};
  const values = { policy, profile: { version: 1, scope: ['a'], maxInputBytes: 1000 }, pipeline: { version: 1, steps: [{ id: 'draft', capability: 'transform' }] } };
  let checkpoint;
  for (const kind of Object.keys(values)) {
    revisions[kind] = await store.propose({ resourceId: kind, kind, owned: { bytes: JSON.stringify(values[kind]), mediaType: 'application/json' } });
    checkpoint = (await store.decideSource({ revisionId: revisions[kind].revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } })).checkpoint;
  }
  const grant = await issueGrant(root, { grantId: 'exact', policyRevisionId: revisions.policy.revisionId, profileRevisionId: revisions.profile.revisionId, pipelineRevisionId: revisions.pipeline.revisionId, actor: 'host', actions: ['publish'], resourceIds: ['a'], expiresAt: 100, expectedCheckpoint: checkpoint, authority: { actor: 'user', attested: true } });
  const request = { actor: 'host', action: 'publish', resourceIds: ['a'], now: 1, grantState: grant, definitionHashes: grant.definitionHashes, policyRevisionId: grant.policyRevisionId, profileRevisionId: grant.profileRevisionId, pipelineRevisionId: grant.pipelineRevisionId };
  assert.equal(authorize(policy, request), true);
  for (const kind of ['profile', 'pipeline']) {
    for (const variant of [{ resourceId: kind, bytes: JSON.stringify(values[kind], null, 2) }, { resourceId: kind + '-other', bytes: JSON.stringify(values[kind]) }, { resourceId: kind, bytes: JSON.stringify(values[kind]), parents: [revisions[kind].revisionId] }]) {
      const alternative = await store.propose({ resourceId: variant.resourceId, kind, parents: variant.parents, owned: { bytes: variant.bytes, mediaType: 'application/json' } });
      assert.notEqual(alternative.revisionId, revisions[kind].revisionId);
      assert.throws(() => authorize(policy, { ...request, [kind + 'RevisionId']: alternative.revisionId }), { code: 'POLICY_DENIED' });
    }
    assert.throws(() => authorize(policy, { ...request, [kind + 'RevisionId']: undefined }), { code: 'POLICY_DENIED' });
  }
});
