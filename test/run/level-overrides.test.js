import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { addNode } from '../../core/structure/ops.js';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { levelOf } from '../../core/run/level-pipeline.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { workStatus } from '../../core/status.js';
import { stagesByTier } from '../../core/checks/user-check-draft.js';
import { copyFixture, emptyTreeCopy, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { editYaml, rechecksOf } from '../support/recheck.js';

const receiptsOf = async (root) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt');
const untilUser = (o) => o.status === 'needs_user';

test('a book plan is auto-approved by a level override while chapter and scene plans still ask the author', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root, { overrides: { levels: { book: { approve: { mode: 'auto' } } } } });
  await addNode(root, await openWork(root), { level: 'book', id: 'b1', title: '1권' });
  const host = createFakeHost({ children: { b1: [{ id: 'b1-c1', title: '가' }], 'b1-c1': [{ id: 'b1-c1-s1' }] } });
  const asked = [];
  const trail = await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, {
    user: (o) => { asked.push(`${o.nodeId}:${o.question.kind}`); return { action: 'approve' }; },
  });
  assert.equal(trail.at(-1).status, 'idle');
  assert.deepEqual(asked, ['b1-c1:approve', 'b1-c1-s1:approve']);
  const ws = await openWorkspace(root, { packs: fakePacks() });
  const receipts = await receiptsOf(root);
  const digestOf = (id) => receipts.find((r) => r.nodeId === id).pipelineDigest;
  assert.equal(digestOf('b1'), ws.pipelines.byLevel.book.digest);
  assert.equal(digestOf('b1-c1'), ws.pipelines.byLevel.chapter.digest);
  assert.equal(digestOf('b1-c1-s1'), ws.pipelines.byLevel.scene.digest);
  assert.equal(receipts.find((r) => r.nodeId === 'b1').steps.find((s) => s.id === 'approve').status, 'auto');
});

test('changing one level override re-plans only the runs at that level', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const mk = () => createRunner({ root, packs: fakePacks() });
  const gate = (await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: untilUser })).at(-1);
  await editYaml(root, (c) => { c.overrides = { levels: { chapter: { approve: { mode: 'auto' } } } }; });
  assert.equal((await mk().decide({ runId: gate.runId, action: 'approve' })).status, 'done', 'a chapter-only change leaves the scene run in sync');
  const gate2 = (await driveToEnd(mk, createFakeHost(), { start: { node: 'market' }, until: untilUser })).at(-1);
  await editYaml(root, (c) => { c.overrides = { levels: { chapter: { approve: { mode: 'auto' } }, scene: { critic: { mode: 'off', reason: '속도' } } } }; });
  assert.equal(label(await mk().decide({ runId: gate2.runId, action: 'approve' })), 'model:extract');
});

test('a level override cannot switch off a locked step: the work does not open', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { levels: { scene: { facts: { mode: 'off' } } } } });
  await assert.rejects(createRunner({ root, packs: fakePacks() }).run({ node: 'stairwell' }),
    (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'LOCKED_STEP_OVERRIDE' && x.level === 'scene'));
});

test('backfill and recheck runs follow the level pipeline', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' }, levels: { scene: { critic: { mode: 'off', reason: '속도' } } } } });
  const mk = () => createRunner({ root, packs: fakePacks() });
  await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const receipt = (await receiptsOf(root)).at(-1);
  assert.equal(receipt.steps.find((s) => s.id === 'critic').status, 'skipped');
  const status = () => workStatus(root, { packs: fakePacks() });
  assert.deepEqual((await status()).recheck, []);
  await editYaml(root, (c) => { c.overrides = { approve: { mode: 'auto' } }; });
  assert.deepEqual((await status()).recheck, [{ nodeId: 'stairwell', checks: ['fake.critic'] }]);
  const done = (await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell', mode: 'recheck' }, until: (o) => o.status === 'done' })).at(-1);
  assert.equal(done.mode, 'recheck');
  assert.equal((await rechecksOf(root)).at(-1).pipelineDigest, (await openWorkspace(root, { packs: fakePacks() })).pipelines.byLevel.scene.digest);
  assert.deepEqual((await status()).recheck, []);
});

test('user check stages come from every level pipeline', () => {
  const stages = stagesByTier({
    leaf: { steps: [{ kind: 'check', tier: 'model', stage: 'critic' }] }, branch: { steps: [] },
    byLevel: { chapter: { steps: [{ kind: 'check', tier: 'model', id: 'tone' }] } },
  });
  assert.deepEqual(stages.model, ['critic', 'tone']);
});

test('a run file whose level was hand-edited is refused, never committed under the other level pipeline', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { levels: { book: { approve: { mode: 'auto' } } } } });
  const mk = () => createRunner({ root, packs: fakePacks() });
  const gate = (await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: untilUser })).at(-1);
  const file = createRunStore(root).pathOf(gate.runId);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.level, 'scene');
  await writeFile(file, `${JSON.stringify({ ...saved, level: 'book' }, null, 2)}\n`);
  const refused = (e) => e.code === 'RUN_LEVEL_MISMATCH'
    && e.details.runId === gate.runId && e.details.nodeId === 'stairwell' && e.details.runLevel === 'book' && e.details.nodeLevel === 'scene';
  await assert.rejects(mk().run({ node: 'stairwell' }), refused);
  await assert.rejects(mk().decide({ runId: gate.runId, action: 'approve' }), refused);
  assert.equal((await receiptsOf(root)).filter((r) => r.nodeId === 'stairwell').length, 0);
});

test('a run file whose node kind was hand-edited is refused', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const mk = () => createRunner({ root, packs: fakePacks() });
  const gate = (await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: untilUser })).at(-1);
  const file = createRunStore(root).pathOf(gate.runId);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, `${JSON.stringify({ ...saved, level: undefined, nodeKind: 'branch' }, null, 2)}\n`);
  await assert.rejects(mk().run({ node: 'stairwell' }),
    (e) => e.code === 'RUN_KIND_MISMATCH' && e.details.runKind === 'branch' && e.details.nodeKind === 'leaf');
});

test('an old run file without level takes the level of its node', () => {
  const ctx = { work: { tree: { nodes: new Map([['n', { id: 'n', level: 'scene', kind: 'leaf' }]]) } } };
  assert.equal(levelOf(ctx, { runId: 'r', nodeId: 'n' }), 'scene');
  assert.equal(levelOf(ctx, { runId: 'r', nodeId: 'gone', level: 'chapter' }), 'chapter');
});

test('a mismatched run can still be abandoned with skip, which runs no step, and the work moves on', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { levels: { book: { approve: { mode: 'auto' } } } } });
  const mk = () => createRunner({ root, packs: fakePacks() });
  const gate = (await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: untilUser })).at(-1);
  // 노드 머리말의 level 을 바꾸면 작품 자체가 열리지 않으므로(LEVEL_KIND_MISMATCH) 실행 파일 쪽을 어긋나게 한다.
  const file = createRunStore(root).pathOf(gate.runId);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, `${JSON.stringify({ ...saved, level: 'book' }, null, 2)}\n`);
  await assert.rejects(mk().decide({ runId: gate.runId, action: 'approve' }),
    (e) => e.code === 'RUN_LEVEL_MISMATCH' && /decide skip/.test(e.details.hint));
  await assert.rejects(mk().run({ node: 'market' }), (e) => e.code === 'RUN_IN_PROGRESS');
  const decisionsBefore = (await openLedger(root, 'decisions').readAll()).length;
  const skipped = await mk().decide({ runId: gate.runId, action: 'skip', reason: '실행 파일이 어긋남' });
  assert.equal(skipped.status, 'skipped');
  const after = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(after.state, 'abandoned');
  assert.equal(after.cursor, saved.cursor);
  assert.deepEqual(after.results, saved.results);
  const decisions = (await openLedger(root, 'decisions').readAll()).slice(decisionsBefore);
  assert.deepEqual(decisions.map((d) => [d.type, d.action, d.runId]), [['approval', 'skip', gate.runId]]);
  assert.equal((await receiptsOf(root)).length, 0);
  const next = await mk().run({ node: 'market' });
  assert.equal(next.nodeId, 'market');
});

test('a kind-mismatched run carries a hint and can be abandoned with skip', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const mk = () => createRunner({ root, packs: fakePacks() });
  const gate = (await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: untilUser })).at(-1);
  const file = createRunStore(root).pathOf(gate.runId);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, `${JSON.stringify({ ...saved, nodeKind: 'branch' }, null, 2)}\n`);
  await assert.rejects(mk().decide({ runId: gate.runId, action: 'request_revision', feedback: '다시' }),
    (e) => e.code === 'RUN_KIND_MISMATCH' && /decide skip/.test(e.details.hint));
  assert.equal((await mk().decide({ runId: gate.runId, action: 'skip', reason: '어긋남' })).status, 'skipped');
});

for (const state of ['awaiting_model', 'active']) {
  test(`a mismatched run left ${state} can be abandoned with skip, and the work moves on`, async () => {
    const root = await copyFixture('novel-3level');
    await useFakePack(root);
    const mk = () => createRunner({ root, packs: fakePacks() });
    const asked = await mk().run({ node: 'stairwell' });
    assert.equal(label(asked), 'model:plan');
    const file = createRunStore(root).pathOf(asked.runId);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    const forged = state === 'active' ? { ...saved, level: 'book', state, pending: null } : { ...saved, level: 'book' };
    await writeFile(file, `${JSON.stringify(forged, null, 2)}\n`);
    if (state === 'awaiting_model') {
      await assert.rejects(mk().resume({ runId: asked.runId, answers: createFakeHost().answer(asked) }),
        (e) => e.code === 'RUN_LEVEL_MISMATCH' && /decide skip/.test(e.details.hint));
    }
    const skipped = await mk().decide({ runId: asked.runId, action: 'skip', reason: '실행 파일이 어긋남' });
    assert.equal(skipped.status, 'skipped');
    const after = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(after.state, 'abandoned');
    assert.equal(after.pending, null);
    assert.deepEqual(after.issued ?? {}, {});
    const decisions = await openLedger(root, 'decisions').readAll();
    assert.deepEqual(decisions.map((d) => [d.type, d.action, d.runId]), [['approval', 'skip', asked.runId]]);
    assert.equal((await receiptsOf(root)).length, 0);
    const next = await mk().run({ node: 'market' });
    assert.equal(next.nodeId, 'market');
  });
}

test('a run that is not mismatched still needs a question to be skipped', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const mk = () => createRunner({ root, packs: fakePacks() });
  const asked = await mk().run({ node: 'stairwell' });
  await assert.rejects(mk().decide({ runId: asked.runId, action: 'skip', reason: 'x' }), { code: 'RUN_NOT_AWAITING_USER' });
});
