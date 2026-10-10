import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { startOperation, submitResult } from '../../core/operations/requests.js';
import { recordReview, decidePublication } from '../../core/operations/publications.js';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'folio-operation-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root); const ids = {};
  for (const [kind, value] of [['a', 'synthetic'], ['profile', { version: 1, scope: ['a'], maxInputBytes: 2000 }], ['pipeline', { version: 1, steps: [{ id: 'draft', capability: 'transform' }] }], ['policy', { version: 1, scope: ['a'], allowedActions: ['create-candidate', 'publish'] }]]) {
    const rev = await store.propose({ resourceId: kind, kind: kind === 'a' ? 'document' : kind, owned: { bytes: typeof value === 'string' ? value : JSON.stringify(value), mediaType: kind === 'a' ? 'text/plain' : 'application/json' } });
    ids[kind] = rev.revisionId;
    await store.decideSource({ revisionId: rev.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
  }
  const snapshot = await prepareInput(root, { revisionIds: [ids.a], profileRevisionId: ids.profile, pipelineRevisionId: ids.pipeline, policyRevisionId: ids.policy });
  const request = await startOperation(root, { inputSnapshotId: snapshot.inputSnapshotId, idempotencyKey: 'one', actor: 'user' });
  const outputs = [];
  for (const [resourceId, bytes, mediaType] of [['text', 'synthetic output', 'text/plain'], ['json', '{"synthetic":true}', 'application/json']]) outputs.push(await store.propose({ resourceId, kind: 'result', owned: { bytes, mediaType } }));
  const submission = { ...request, inputSnapshotId: snapshot.inputSnapshotId, resultRevisionIds: outputs.map((r) => r.revisionId), reportedTrace: { steps: ['draft'] } };
  return { root, store, ids, snapshot, request, outputs, submission };
}
test('exact request, multi output, hard review and append-only publication', async (t) => {
  const f = await fixture(t);
  await assert.rejects(submitResult(f.root, { ...f.submission, requestId: 'wrong' }), { code: 'REQUEST_MISMATCH' });
  await submitResult(f.root, f.submission);
  const review = { operationId: f.request.operationId, outputHashes: f.outputs.map((r) => r.contentHash), reviewer: 'host', findings: [{ severity: 'hard', message: 'synthetic hard' }] };
  const receiptId = await recordReview(f.root, review);
  const decision = { operationId: review.operationId, receiptId, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint, action: 'approve', actor: 'user' };
  await assert.rejects(decidePublication(f.root, decision), { code: 'APPROVE_BLOCKED_BY_HARD' });
  const clean = await recordReview(f.root, { ...review, findings: [{ severity: 'soft', message: 'synthetic soft' }] });
  const publication = await decidePublication(f.root, { ...decision, receiptId: clean });
  assert.equal(publication.selfReview, true);
  assert.equal(publication.resultRevisionIds.length, 2);
  assert.deepEqual(await decidePublication(f.root, { ...decision, receiptId: clean }), publication);
  await assert.rejects(submitResult(f.root, { ...f.submission, reportedTrace: {} }), { code: 'LATE_RESULT' });
});
test('immutable caller input, idempotency conflict, stale receipts and competing checkpoint', async (t) => {
  const f = await fixture(t);
  await assert.rejects(startOperation(f.root, { inputSnapshotId: f.snapshot.inputSnapshotId, idempotencyKey: 'one', actor: 'host' }), { code: 'IDEMPOTENCY_CONFLICT' });
  const pending = submitResult(f.root, f.submission); f.submission.resultRevisionIds.length = 0;
  const result = await pending;
  assert.equal(result.trace.cost, 'unknown');
  const review = { operationId: f.request.operationId, outputHashes: result.outputs.map((r) => r.contentHash), findings: [], reviewer: 'host' };
  const receiptId = await recordReview(f.root, review);
  await assert.rejects(submitResult(f.root, { ...f.submission, resultRevisionIds: [f.outputs[0].revisionId] }), { code: 'LATE_RESULT' });
  const second = await startOperation(f.root, { inputSnapshotId: f.snapshot.inputSnapshotId, idempotencyKey: 'two', actor: 'user' });
  await submitResult(f.root, { ...f.submission, ...second, resultRevisionIds: result.resultRevisionIds });
  await assert.rejects(decidePublication(f.root, { operationId: second.operationId, receiptId, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint, action: 'approve', actor: 'user' }), { code: 'REVIEW_MISMATCH' });
  const decision = { operationId: f.request.operationId, receiptId, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint, action: 'approve', actor: 'user' };
  const next = await f.store.propose({ resourceId: 'a', kind: 'document', parents: [f.ids.a], owned: { bytes: 'synthetic B', mediaType: 'text/plain' } });
  await f.store.decideSource({ revisionId: next.revisionId, expectedSelectionRevision: (await f.store.readSourceSelection('a')).selectionRevision, action: { actor: 'user', type: 'select' } });
  await assert.rejects(decidePublication(f.root, decision), { code: 'WORKSPACE_CHECKPOINT_CONFLICT' });
});
async function killAt(root, decision, phase) {
  const { spawn } = await import('node:child_process');
  const moduleUrl = new URL('../../core/operations/publications.js', import.meta.url).href;
  const source = `import {decidePublication} from ${JSON.stringify(moduleUrl)}; await decidePublication(${JSON.stringify(root)},${JSON.stringify(decision)},{${phase}:()=>process.kill(process.pid,'SIGKILL')});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.on('data', (data) => { stderr += data; });
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (_code, signal) => { try { assert.equal(signal, 'SIGKILL', stderr); resolve(); } catch (error) { reject(error); } }); });
}
test('real process death before/after marker, revoked pending recovery and historical replay', async (t) => {
  const { issueGrant, revokeGrant } = await import('../../core/policy/grants.js');
  for (const phase of ['beforeMarker', 'afterMarker']) {
    const f = await fixture(t);
    const grant = await issueGrant(f.root, { grantId: 'grant', policyRevisionId: f.ids.policy, profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, actor: 'host', actions: ['create-candidate', 'publish'], resourceIds: ['a'], expiresAt: Date.now() + 60000, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint, authority: { actor: 'user', attested: true } });
    const request = await startOperation(f.root, { inputSnapshotId: f.snapshot.inputSnapshotId, idempotencyKey: phase, actor: 'host', grantId: grant.grantId });
    const result = await submitResult(f.root, { ...f.submission, ...request });
    const receiptId = await recordReview(f.root, { operationId: request.operationId, outputHashes: result.outputs.map((r) => r.contentHash), reviewer: 'host', findings: [] });
    const decision = { operationId: request.operationId, receiptId, action: 'approve', actor: 'host', grantId: grant.grantId, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint };
    await killAt(f.root, decision, phase);
    assert.equal((await readWorkspaceState(f.root)).publications.length, phase === 'afterMarker' ? 1 : 0);
    await revokeGrant(f.root, { grantId: grant.grantId, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint, authority: { actor: 'user', attested: true } });
    if (phase === 'afterMarker') assert.equal((await decidePublication(f.root, decision)).operationId, request.operationId);
    else {
      await assert.rejects(decidePublication(f.root, { ...decision, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint }), { code: 'POLICY_DENIED' });
      await assert.rejects(submitResult(f.root, { ...f.submission, ...request }), { code: 'POLICY_DENIED' });
      assert.equal((await readWorkspaceState(f.root)).publications.length, 0);
    }
  }
});
test('new publication rejects changed pinned policy, bytes and disabled safeguards', async (t) => {
  const f = await fixture(t); const result = await submitResult(f.root, f.submission);
  await assert.rejects(recordReview(f.root, { operationId: f.request.operationId, outputHashes: ['wrong'], reviewer: 'host', findings: [] }), { code: 'REVIEW_MISMATCH' });
  const receiptId = await recordReview(f.root, { operationId: f.request.operationId, outputHashes: result.outputs.map((r) => r.contentHash), reviewer: 'user', findings: [] });
  const policy = await f.store.propose({ resourceId: 'policy', kind: 'policy', parents: [f.ids.policy], owned: { bytes: JSON.stringify({ version: 1, scope: ['a'], allowedActions: ['publish'] }), mediaType: 'application/json' } });
  await f.store.decideSource({ revisionId: policy.revisionId, expectedSelectionRevision: (await f.store.readSourceSelection('policy')).selectionRevision, action: { actor: 'user', type: 'select' } });
  await assert.rejects(decidePublication(f.root, { operationId: f.request.operationId, receiptId, action: 'approve', actor: 'user', expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint }), { code: 'POLICY_DENIED' });
});
test('fixed review flags, output byte corruption and rejected decision history', async (t) => {
  const f = await fixture(t); const result = await submitResult(f.root, f.submission);
  const review = { operationId: f.request.operationId, outputHashes: result.outputs.map((r) => r.contentHash), reviewer: 'host', findings: [] };
  await assert.rejects(recordReview(f.root, { ...review, selfReview: false }), { code: 'REVIEW_INVALID' });
  const receiptId = await recordReview(f.root, review);
  const decision = { operationId: f.request.operationId, receiptId, action: 'reject', actor: 'user', expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint };
  const { readFile, writeFile } = await import('node:fs/promises');
  const path = join(f.root, '.folio', 'resources', 'content', f.outputs[0].contentHash.slice(7) + '.bin');
  const bytes = await readFile(path); await writeFile(path, 'synthetic corruption');
  await assert.rejects(decidePublication(f.root, decision), { code: 'RESOURCE_INTEGRITY_FAILURE' });
  await writeFile(path, bytes);
  assert.equal((await decidePublication(f.root, decision)).action, 'reject');
  await assert.rejects(decidePublication(f.root, { ...decision, action: 'approve' }), { code: 'PUBLICATION_CONFLICT' });
});
test('same operation key recovers after actual process death during temporary request writes', async (t) => {
  const { spawn } = await import('node:child_process');
  const { readdir, readFile, writeFile } = await import('node:fs/promises');
  const { withImmutableWriteFault } = await import('../../core/resources/immutable-write-fault.js');
  const { sha256, canonicalJson } = await import('../../core/util/hash.js');
  const f = await fixture(t);
  for (const phase of ['partial', 'complete']) {
    const input = {inputSnapshotId:f.snapshot.inputSnapshotId, idempotencyKey:`interrupted-${phase}`, actor:'user'};
    const program = `
      import {startOperation} from ${JSON.stringify(new URL('../../core/operations/requests.js', import.meta.url).href)};
      import {withImmutableWriteFault} from ${JSON.stringify(new URL('../../core/resources/immutable-write-fault.js', import.meta.url).href)};
      import {writeFile} from 'node:fs/promises';
      await withImmutableWriteFault(async (path, bytes, options) => {
        await writeFile(path, path.includes('/requests/') && ${JSON.stringify(phase)} === 'partial' ? bytes.subarray(0, 4) : bytes, options);
        if (path.includes('/requests/')) process.kill(process.pid, 'SIGKILL');
      }, () => startOperation(${JSON.stringify(f.root)}, ${JSON.stringify(input)}));`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', program]);
    let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk; });
    await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (_code, signal) => { try { assert.equal(signal, 'SIGKILL', stderr); resolve(); } catch (error) { reject(error); } }); });
    const dir = join(f.root, '.folio', 'operations', 'requests');
    const operationId = sha256(canonicalJson({idempotencyKey:input.idempotencyKey}));
    await assert.rejects(readFile(join(dir, operationId.slice(7)+'.json')), {code:'ENOENT'});
    assert.ok((await readdir(dir)).some((name) => name.startsWith('.immutable-')));
    const retried = await startOperation(f.root, input); assert.equal(retried.operationId, operationId);
    assert.deepEqual(await startOperation(f.root, input), retried);
    const { readOperation } = await import('../../core/operations/requests.js');
    assert.equal((await readOperation(f.root, operationId)).idempotencyKey, input.idempotencyKey);
  }
  const input = {inputSnapshotId:f.snapshot.inputSnapshotId, idempotencyKey:'disk-full', actor:'user'};
  await assert.rejects(withImmutableWriteFault(async (path, bytes, options) => {
    await writeFile(path, bytes.subarray(0, 4), options); throw Object.assign(new Error('synthetic disk full'), {code:'ENOSPC'});
  }, () => startOperation(f.root, input)), {code:'ENOSPC'});
  assert.deepEqual(await startOperation(f.root, input), await startOperation(f.root, input));
});
