import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { addNode } from '../../core/structure/ops.js';
import { createRunner } from '../../core/run/runner.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, emptyTreeCopy, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const leafWith = (fn) => new Map([['fake', { ...fakePack, pipelines: { ...fakePack.pipelines, leaf: fakePack.pipelines.leaf.map(fn) } }]]);

test('M2.5-1 core decides the locks: a pack that unlocks commit or facts, or cuts facts off its events, does not open', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const cases = [
    [leafWith((s) => (s.id === 'commit' ? { ...s, locked: false } : s)), 'PACK_LOCK_MISMATCH'],
    [leafWith((s) => (s.id === 'facts' ? { ...s, locked: false } : s)), 'PACK_LOCK_MISMATCH'],
    [leafWith((s) => (s.id === 'facts' ? { ...s, requires: [] } : s)), 'PACK_FACTS_REQUIRES_EVENTS'],
  ];
  for (const [packs, code] of cases) await assert.rejects(createRunner({ root, packs }).run({ node: 'stairwell' }), { code });
  assert.deepEqual(await openLedger(root, 'receipts').readAll(), []);
  assert.deepEqual(await openLedger(root, 'decisions').readAll(), []);
});

test('M2.5-2 pack ids carry the pack prefix and never collide', () => {
  const stray = { ...fakePack, checks: [...fakePack.checks, { id: 'critic', tier: 'model', stage: 'critic', severity: 'advisory' }] };
  assert.throws(() => resolvePacks(['fake'], new Map([['fake', stray]])), { code: 'PACK_CHECK_ID_PREFIX' });
  assert.throws(() => resolvePacks(['fake', 'fake'], fakePacks()), { code: 'PACK_DUPLICATE' });
});

test('M2.5-3 pack content is part of the pipeline digest: an open run checks again after it changes', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const gate = (await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost(), {
    start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user',
  })).at(-1);
  const changed = new Map([['fake', { ...fakePack, checks: fakePack.checks.map((c) => (c.id === 'fake.critic' ? { ...c, instruction: 'Review harder.' } : c)) }]]);
  assert.equal(label(await createRunner({ root, packs: changed }).decide({ runId: gate.runId, action: 'approve' })), 'model:extract');
  assert.deepEqual((await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit'), []);
});

test('M2.5-4 per-level steps: only the book plan is auto-approved and each receipt carries its level digest', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root, { overrides: { levels: { book: { approve: { mode: 'auto' } } } } });
  await addNode(root, await openWork(root), { level: 'book', id: 'b1', title: '1권' });
  const asked = [];
  const host = createFakeHost({ children: { b1: [{ id: 'b1-c1' }], 'b1-c1': [{ id: 'b1-c1-s1' }] } });
  await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, { user: (o) => { asked.push(o.nodeId); return { action: 'approve' }; } });
  assert.deepEqual(asked, ['b1-c1', 'b1-c1-s1']);
  const { pipelines } = await openWorkspace(root, { packs: fakePacks() });
  const receipts = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt');
  const levelOfNode = { b1: 'book', 'b1-c1': 'chapter', 'b1-c1-s1': 'scene' };
  for (const receipt of receipts) assert.equal(receipt.pipelineDigest, pipelines.byLevel[levelOfNode[receipt.nodeId]].digest, receipt.nodeId);
  assert.equal(receipts.length, 3);
});

test('M2.5-5 lock rules hold at every level', async () => {
  const root = await copyFixture('novel-3level');
  for (const [level, stepId] of [['scene', 'facts'], ['scene', 'extract'], ['scene', 'draft'], ['book', 'commit'], ['chapter', 'commit']]) {
    await useFakePack(root, { overrides: { levels: { [level]: { [stepId]: { mode: 'off' } } } } });
    await assert.rejects(openWorkspace(root, { packs: fakePacks() }),
      (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'LOCKED_STEP_OVERRIDE' && x.level === level && x.stepId === stepId), `${level}.${stepId}`);
  }
});
