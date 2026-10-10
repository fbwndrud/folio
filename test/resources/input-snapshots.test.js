import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';
test('input seals selected original and definitions independently of later candidates', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-input-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  async function selected(resourceId, kind, value) {
    const rev = await store.propose({ resourceId, kind, owned: { bytes: typeof value === 'string' ? value : JSON.stringify(value), mediaType: kind === 'document' ? 'text/plain' : 'application/json' } });
    await store.decideSource({ revisionId: rev.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } }); return rev;
  }
  const a = await selected('a', 'document', 'synthetic A');
  const profile = await selected('profile', 'profile', { version: 1, scope: ['a'], maxInputBytes: 1000 });
  const pipeline = await selected('pipeline', 'pipeline', { version: 1, steps: [{ id: 'draft', capability: 'transform' }] });
  const policy = await selected('policy', 'policy', { version: 1, scope: ['a'], allowedActions: ['create-candidate', 'publish'] });
  const input = { revisionIds: [a.revisionId], profileRevisionId: profile.revisionId, pipelineRevisionId: pipeline.revisionId, policyRevisionId: policy.revisionId };
  const pending = prepareInput(root, input); input.revisionIds.length = 0; const snapshot = await pending;
  const b = await store.propose({ resourceId: 'a', kind: 'document', parents: [a.revisionId], owned: { bytes: 'synthetic B', mediaType: 'text/plain' } });
  const old = await store.readSourceSelection('a');
  await store.decideSource({ revisionId: b.revisionId, expectedSelectionRevision: old.selectionRevision, action: { type: 'select', actor: 'user' } });
  assert.equal((await verifyInput(root, snapshot.inputSnapshotId)).manifest.revisionIds[0], a.revisionId);
  await assert.rejects(prepareInput(root, { ...input, revisionIds: [a.revisionId], profileRevisionId: a.revisionId }), { code: 'INPUT_INVALID' });
});
test('external references, budgets, unsupported definitions and corruption fail closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-input-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  async function select(input) {
    const revision = await store.propose(input); const old = await store.readSourceSelection(revision.resourceId);
    await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: old?.selectionRevision ?? null, action: { type: 'select', actor: 'user' } }); return revision.revisionId;
  }
  async function definition(resourceId, value) { return select({ resourceId, kind: resourceId, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } }); }
  const profileRevisionId = await definition('profile', { version: 1, scope: ['remote', 'a'], maxInputBytes: 1000 });
  const pipelineRevisionId = await definition('pipeline', { version: 1, steps: [{ id: 'draft', capability: 'transform' }] });
  const policyRevisionId = await definition('policy', { version: 1, scope: ['remote', 'a'], allowedActions: ['publish'] });
  const remote = await select({ resourceId: 'remote', kind: 'reference', external: { uri: 'https://example.invalid/synthetic' } });
  const input = { revisionIds: [remote], profileRevisionId, pipelineRevisionId, policyRevisionId };
  await assert.rejects(prepareInput(root, input), { code: 'INPUT_INVALID' });
  const snapshot = await prepareInput(root, { ...input, externalMode: 'reference-only' });
  const reference = (await verifyInput(root, snapshot.inputSnapshotId)).manifest;
  assert.equal(reference.resources[0].observation, 'reference-only');
  assert.equal(reference.resources[0].byteLength, null);
  assert.equal(reference.totalBytes, Object.values(reference.definitions).reduce((total, definition) => total + definition.byteLength, 0));
  assert.equal(reference.byteBudgetComplete, false);
  const a = await select({ resourceId: 'a', kind: 'document', owned: { bytes: 'x'.repeat(1001), mediaType: 'text/plain' } });
  await assert.rejects(prepareInput(root, { ...input, revisionIds: [a] }), { code: 'INPUT_INVALID' });
  const badPipeline = await definition('pipeline', { version: 1, steps: [{ id: 'draft', capability: 'network-fetch' }] });
  await assert.rejects(prepareInput(root, { ...input, pipelineRevisionId: badPipeline, externalMode: 'reference-only' }), { code: 'INPUT_INVALID' });
  assert.equal((await verifyInput(root, snapshot.inputSnapshotId)).manifest.pipelineRevisionId, pipelineRevisionId);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(root, '.folio', 'resources', 'inputs', snapshot.inputSnapshotId.slice(7) + '.json'), '{}');
  await assert.rejects(verifyInput(root, snapshot.inputSnapshotId), { code: 'INPUT_INVALID' });
});
test('sealed owned bytes and definition bytes are revalidated', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-input-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root); const revisions = {};
  for (const [resourceId, kind, value] of [['a', 'document', 'synthetic'], ['profile', 'profile', { version: 1, scope: ['a'], maxInputBytes: 1000 }], ['pipeline', 'pipeline', { version: 1, steps: [{ id: 'draft', capability: 'analyze' }] }], ['policy', 'policy', { version: 1, scope: ['a'], allowedActions: ['publish'] }]]) {
    revisions[resourceId] = await store.propose({ resourceId, kind, owned: { bytes: typeof value === 'string' ? value : JSON.stringify(value), mediaType: kind === 'document' ? 'text/plain' : 'application/json' } });
    await store.decideSource({ revisionId: revisions[resourceId].revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
  }
  const snapshot = await prepareInput(root, { revisionIds: [revisions.a.revisionId], profileRevisionId: revisions.profile.revisionId, pipelineRevisionId: revisions.pipeline.revisionId, policyRevisionId: revisions.policy.revisionId });
  const { readFile, writeFile } = await import('node:fs/promises');
  for (const kind of ['a', 'profile', 'pipeline', 'policy']) {
    const path = join(root, '.folio', 'resources', 'content', revisions[kind].contentHash.slice(7) + '.bin');
    const original = await readFile(path); await writeFile(path, 'corrupted');
    await assert.rejects(verifyInput(root, snapshot.inputSnapshotId), { code: 'RESOURCE_INTEGRITY_FAILURE' });
    await writeFile(path, original);
  }
});

test('definition bytes alone exhaust the complete sealed input budget', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-input-budget-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root); const ids = {};
  for (const [kind, value] of [['profile', { version: 1, scope: ['remote'], maxInputBytes: 4 }], ['pipeline', { version: 1, steps: [{ id: 'draft', capability: 'transform' }] }], ['policy', { version: 1, scope: ['remote'], allowedActions: ['publish'] }]]) {
    const revision = await store.propose({ resourceId: kind, kind, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
    ids[kind + 'RevisionId'] = revision.revisionId;
    await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
  }
  const remote = await store.propose({ resourceId: 'remote', kind: 'reference', external: { uri: 'https://example.invalid/synthetic' } });
  await store.decideSource({ revisionId: remote.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
  await assert.rejects(prepareInput(root, { ...ids, revisionIds: [remote.revisionId], externalMode: 'reference-only' }), { code: 'INPUT_INVALID' });
});
