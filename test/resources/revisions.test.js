import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';

test('empty workspace preserves generic candidates without selecting them', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-resource-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const input = { kind: 'document', owned: { bytes: Buffer.from('합성 자료 A'), mediaType: 'text/plain' } };
  const a = await store.propose({ ...input, resourceId: 'alpha' });
  const b = await store.propose({ ...input, resourceId: 'beta' });
  assert.notEqual(a.resourceId, b.resourceId);
  assert.equal(a.contentHash, b.contentHash);
  assert.deepEqual(await store.readContent(a.revisionId), input.owned.bytes);
  assert.equal(await store.readSourceSelection('alpha'), null);
  const next = await store.propose({ ...input, resourceId: 'alpha', parents: [a.revisionId] });
  assert.notEqual(next.revisionId, a.revisionId);
  const external = await store.propose({ resourceId: 'remote', kind: 'reference', external: { uri: 'https://example.invalid/synthetic', reportedRevision: 'v1' } });
  assert.equal(external.storageStatus, 'external_unobserved');
  await assert.rejects(store.readContent(external.revisionId), { code: 'RESOURCE_CONTENT_UNAVAILABLE' });
});

test('source choice uses marker versions, rejects stale ABA and binds checkpoints', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-resource-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const a = await store.propose({ resourceId: 'alpha', kind: 'document', owned: { bytes: 'synthetic', mediaType: 'text/plain' } });
  const first = await store.decideSource({ revisionId: a.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
  assert.equal((await store.readSourceSelection('alpha')).revisionId, a.revisionId);
  const removed = await store.decideSource({ revisionId: a.revisionId, expectedSelectionRevision: first.selectionRevision, action: { type: 'deselect', actor: 'user', reason: 'synthetic removal' } });
  assert.equal(removed.revisionId, null);
  await assert.rejects(store.decideSource({ revisionId: a.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } }), { code: 'SOURCE_SELECTION_CONFLICT' });
  const again = await store.decideSource({ revisionId: a.revisionId, expectedSelectionRevision: removed.selectionRevision, action: { type: 'select', actor: 'user' } });
  assert.notEqual(again.selectionRevision, first.selectionRevision);
  const { readWorkspaceState } = await import('../../core/publications/state.js');
  const old = await readWorkspaceState(root, { checkpoint: first.checkpoint });
  assert.equal(old.sourceSelections.alpha.selectionRevision, first.selectionRevision);
  assert.equal(old.markers.length, 1);
});

test('invalid proposals, corrupted bytes and missing snapshots fail closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-resource-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const input = { resourceId: 'safe', kind: 'document', owned: { bytes: '{}', mediaType: 'application/json' } };
  await assert.rejects(store.propose({ ...input, resourceId: '../escape' }), { code: 'RESOURCE_ID_INVALID' });
  await assert.rejects(store.propose({ ...input, revisionId: 'invented' }), { code: 'RESOURCE_RESERVED_KEY' });
  await assert.rejects(store.propose({ ...input, owned: { ...input.owned, bytes: '{' } }), { code: 'RESOURCE_CONTENT_INVALID' });
  await assert.rejects(store.propose({ ...input, owned: { ...input.owned, bytes: Buffer.alloc(8 * 1024 * 1024 + 1) } }), { code: 'RESOURCE_TOO_LARGE' });
  const a = await store.propose(input);
  const b = await store.propose({ ...input, resourceId: 'other' });
  await assert.rejects(store.propose({ ...input, parents: [b.revisionId] }), { code: 'RESOURCE_PARENT_INVALID' });
  await assert.rejects(store.propose({ ...input, parents: [`sha256:${'0'.repeat(64)}`] }), { code: 'RESOURCE_OBJECT_MISSING' });
  await assert.rejects(store.decideSource({ revisionId: a.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'host' } }), { code: 'SOURCE_DECISION_INVALID' });
  const { writeFile, unlink } = await import('node:fs/promises');
  const path = join(root, '.folio', 'resources', 'content', a.contentHash.slice(7) + '.bin');
  await writeFile(path, 'changed');
  await assert.rejects(store.readContent(a.revisionId), { code: 'RESOURCE_INTEGRITY_FAILURE' });
  await assert.rejects(store.propose(input), { code: 'RESOURCE_INTEGRITY_FAILURE' });
  await assert.rejects(store.decideSource({ revisionId: a.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } }), { code: 'RESOURCE_INTEGRITY_FAILURE' });
  await unlink(path);
  await assert.rejects(store.readRevision(a.revisionId), { code: 'RESOURCE_OBJECT_MISSING' });
});

test('symlinks, corrupt metadata and invalid checkpoints cannot be used', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-resource-'));
  const outside = await mkdtemp(join(tmpdir(), 'folio-resource-outside-'));
  t.after(() => Promise.all([root, outside].map((dir) => rm(dir, { recursive: true, force: true }))));
  const { mkdir, symlink, unlink, writeFile } = await import('node:fs/promises');
  await mkdir(join(root, '.folio'));
  await symlink(outside, join(root, '.folio', 'resources'));
  const store = createResourceStore(root);
  const input = { resourceId: 'safe', kind: 'document', owned: { bytes: 'synthetic', mediaType: 'text/plain' } };
  await assert.rejects(store.propose(input), { code: 'MANAGED_PATH_UNSAFE' });
  await unlink(join(root, '.folio', 'resources'));
  const revision = await store.propose(input);
  await writeFile(join(root, '.folio', 'resources', 'revisions', revision.revisionId.slice(7) + '.json'), '{}');
  await assert.rejects(store.readRevision(revision.revisionId), { code: 'RESOURCE_INTEGRITY_FAILURE' });
  const { readWorkspaceState } = await import('../../core/publications/state.js');
  await assert.rejects(readWorkspaceState(root, { checkpoint: { seq: 1, hash: 'invented' } }), { code: 'WORKSPACE_CHECKPOINT_INVALID' });
});

test('shared marker transaction preserves sequence and expires append capability', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-resource-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { appendStateMarker, readWorkspaceState, withWorkspaceStateTransaction } = await import('../../core/publications/state.js');
  let escaped;
  const first = await withWorkspaceStateTransaction(root, async ({ state, append }) => {
    escaped = append;
    return append({ kind: 'grant-issued', payload: { grantId: 'synthetic' }, expectedCheckpoint: state.checkpoint });
  });
  await assert.rejects(escaped({ kind: 'grant-revoked', payload: { grantId: 'synthetic' } }), { code: 'WORKSPACE_TRANSACTION_CLOSED' });
  await assert.rejects(appendStateMarker(root, { kind: 'grant-revoked', payload: { grantId: 'synthetic' }, expectedCheckpoint: { seq: 0, hash: 'genesis' } }), { code: 'WORKSPACE_CHECKPOINT_CONFLICT' });
  const second = await appendStateMarker(root, { kind: 'grant-revoked', payload: { grantId: 'synthetic' }, expectedCheckpoint: first });
  assert.equal(second.seq, 2);
  assert.equal((await readWorkspaceState(root)).grants.synthetic.revoked, true);
  const { withWorkLock } = await import('../../core/run/work-lock.js');
  await assert.rejects(withWorkLock(root, () => appendStateMarker(root, { kind: 'grant-issued', payload: {} })), { code: 'WORK_LOCK_REENTRANT' });
});

test('source decisions snapshot user action before asynchronous work', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-resource-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const revision = await store.propose({ resourceId: 'safe', kind: 'document', owned: { bytes: 'synthetic', mediaType: 'text/plain' } });
  const action = { type: 'select', actor: 'user', reason: 'synthetic original decision' };
  const pending = store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action });
  action.actor = 'host';
  action.type = 'deselect';
  delete action.reason;
  const selected = await pending;
  assert.equal(selected.revisionId, revision.revisionId);
  assert.deepEqual(selected.action, { type: 'select', actor: 'user', reason: 'synthetic original decision' });
  assert.deepEqual((await store.readSourceSelection('safe')).action, selected.action);
});

test('source decision validates the same action values it records', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-resource-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const revision = await store.propose({ resourceId: 'safe', kind: 'document', owned: { bytes: 'synthetic', mediaType: 'text/plain' } });
  let reads = 0;
  const action = { type: 'select', get actor() { reads += 1; return reads === 1 ? 'user' : 'host'; } };
  const selected = await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action });
  assert.equal(selected.action.actor, 'user');
  assert.equal((await store.readSourceSelection('safe')).action.actor, 'user');
});
