import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { validateReceipt } from '../../core/ledger/receipts.js';
import { addNode, wrapNodes } from '../../core/structure/ops.js';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { commitNode } from '../../core/run/commit.js';
import { workStatus } from '../../core/status.js';
import { copyFixture, emptyTreeCopy, seedEvents, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { runChild, wasKilled } from '../support/crash.js';

const TOP = { 'novel-3level': 'book', 'knowledge-book': 'part' };
const runnerFor = (root, extra = {}) => () => createRunner({ root, packs: fakePacks(), ...extra });
const commits = async (root) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit');
const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
const twoEach = (p) => [{ id: `${p.node.id}-1`, title: '가' }, { id: `${p.node.id}-2`, title: '나' }];

async function topDown(name, script = {}) {
  const root = await emptyTreeCopy(name);
  await useFakePack(root);
  for (const id of ['t1', 't2']) await addNode(root, await openWork(root), { level: TOP[name], id, title: id });
  const host = createFakeHost({ children: { '*': twoEach }, ...script });
  const trail = await driveToEnd(runnerFor(root), host);
  return { root, host, trail };
}

for (const name of ['novel-3level', 'knowledge-book']) {
  test(`M2-1a top-down runs ${name} to the end`, async () => {
    const { root, trail } = await topDown(name);
    assert.equal(trail.at(-1).status, 'idle');
    const work = await openWork(root);
    assert.equal(work.tree.nodes.size, 14);
    for (const node of work.tree.nodes.values()) assert.equal(node.status, 'committed', node.id);
    const done = await commits(root);
    assert.equal(done.length, 14);
    assert.equal(new Set(done.map((c) => c.nodeId)).size, 14);
    assert.equal(trail.find((o) => o.status === 'needs_user').nodeId, 't1');
    for (const r of (await openLedger(root, 'receipts').readAll()).filter((x) => x.type === 'receipt')) {
      const { type: _t, seq: _s, at: _a, prev: _p, hash: _h, ...receipt } = r;
      assert.deepEqual(validateReceipt(receipt), [], r.nodeId);
    }
    assert.deepEqual(await openLedger(root, 'receipts').verify(), { ok: true });
  });

  test(`M2-1b bottom-up runs ${name} to the end`, async () => {
    const root = await emptyTreeCopy(name);
    await useFakePack(root);
    const [top, mid, leaf] = (await openWork(root)).config.levels.map((l) => l.name);
    for (const id of ['s1', 's2', 's3', 's4']) await addNode(root, await openWork(root), { level: leaf, id, title: id });
    const host = createFakeHost();
    await driveToEnd(runnerFor(root), host);
    await wrapNodes(root, await openWork(root), { nodeIds: ['s1', 's2'], level: mid, id: 'm1' });
    await wrapNodes(root, await openWork(root), { nodeIds: ['s3', 's4'], level: mid, id: 'm2' });
    await wrapNodes(root, await openWork(root), { nodeIds: ['m1', 'm2'], level: top, id: 't1' });
    const trail = await driveToEnd(runnerFor(root), host);
    assert.deepEqual(trail.filter((o) => o.status === 'done').map((o) => o.nodeId), ['m1', 'm2', 't1']);
    for (const node of (await openWork(root)).tree.nodes.values()) assert.equal(node.status, 'committed', node.id);
    for (const id of ['m1', 'm2', 't1']) {
      assert.equal((await receiptOf(root, id)).steps.find((s) => s.id === 'children').reason, 'children already exist');
    }
  });
}

test('M2-2 every lock bypass attempt fails', async (t) => {
  await t.test('locked steps and checks cannot be switched off, moved or unlocked', async () => {
    const attempts = [
      [{ overrides: { facts: { mode: 'off', reason: '빨리' } } }, 'LOCKED_STEP_OVERRIDE'],
      [{ overrides: { extract: { mode: 'off' } } }, 'LOCKED_STEP_OVERRIDE'],
      [{ overrides: { draft: { mode: 'off' } } }, 'LOCKED_STEP_OVERRIDE'],
      [{ overrides: { commit: { mode: 'off' } } }, 'LOCKED_STEP_OVERRIDE'],
      [{ overrides: { facts: { after: 'critic' } } }, 'LOCKED_STEP_OVERRIDE'],
      [{ overrides: { facts: { locked: false } } }, 'LOCKED_STEP_OVERRIDE'],
      [{ checks: { 'core.promise-order': { mode: 'off' } } }, 'LOCKED_CHECK_OVERRIDE'],
      [{ checks: { 'core.promise-order': { severity: 'advisory' } } }, 'LOCKED_CHECK_OVERRIDE'],
      [{ overrides: { revise: { max: 10 } } }, 'LOOP_MAX_EXCEEDED'],
    ];
    for (const [config, code] of attempts) {
      const root = await copyFixture('novel-3level');
      await useFakePack(root, config);
      await assert.rejects(openWorkspace(root, { packs: fakePacks() }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === code), code);
    }
  });

  await t.test('commits without a receipt, with a changed text, a missing locked step, a hard conflict or a reused receipt fail', async () => {
    const root = await copyFixture('novel-3level');
    await useFakePack(root);
    const { work, pipelines } = await openWorkspace(root, { packs: fakePacks() });
    const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
    const bare = (receipt, text) => commitNode({ root, work, ledgers, pipeline: pipelines.leaf, receipt, text });
    const commit = async (receipt, text) => { if (receipt) await recordDecisions(ledgers.decisions, receipt); return bare(receipt, text); };
    const good = () => makeReceipt({ nodeId: 'market', text: '검사한 원고', pipeline: pipelines.leaf });
    await assert.rejects(bare(good(), '검사한 원고'), { code: 'LOCK_DECISION_MISMATCH' }, 'a receipt whose verdicts were never recorded');
    await assert.rejects(commit(null, '검사한 원고'), { code: 'LOCK_NO_RECEIPT' });
    await assert.rejects(commit(good(), '검사 뒤 바꾼 원고'), { code: 'LOCK_HASH_MISMATCH' });
    const noFacts = good(); noFacts.steps = noFacts.steps.filter((s) => s.id !== 'facts');
    await assert.rejects(commit(noFacts, '검사한 원고'), { code: 'LOCK_STEP_MISSING' });
    const hard = good(); hard.hard = 1;
    await assert.rejects(commit(hard, '검사한 원고'), { code: 'LOCK_HARD_VIOLATION' });
    const labelled = good(); labelled.steps.find((s) => s.id === 'critic').checks = [{ checkId: 'fake.critic', status: 'passed', findings: [], reviewer: { sameHost: true, independent: true } }];
    await assert.rejects(commit(labelled, '검사한 원고'), { code: 'LOCK_RECEIPT_INVALID' });
    const once = good();
    await commit(once, '검사한 원고');
    await assert.rejects(commit(once, '검사한 원고'), { code: 'LOCK_RECEIPT_CONSUMED' });
  });

  await t.test('changing the checked draft inside the run file cannot be committed', async () => {
    const root = await copyFixture('novel-3level');
    await useFakePack(root);
    const trail = await driveToEnd(runnerFor(root), createFakeHost(), { until: (o) => o.status === 'needs_user' });
    const path = createRunStore(root).pathOf(trail.at(-1).runId);
    const run = JSON.parse(await readFile(path, 'utf8'));
    run.outputs.draft += ' 몰래 덧붙임';
    await writeFile(path, JSON.stringify(run));
    await assert.rejects(runnerFor(root)().decide({ runId: run.runId, action: 'approve' }), { code: 'LOCK_HASH_MISMATCH' });
    assert.deepEqual(await commits(root), []);
  });

  await t.test('hard conflicts cannot be approved; soft findings never trigger a revision', async () => {
    const root = await copyFixture('serial-2level');
    await seedEvents(root, 'serial-2level');
    await useFakePack(root);
    const host = createFakeHost({ critic: () => [{ checkId: 'fake.critic', code: 'SOFT', message: '참고' }] });
    const blocked = (await driveToEnd(runnerFor(root), host, { start: { node: 'ep-004' }, until: (o) => o.status === 'needs_user' })).at(-1);
    assert.equal(blocked.question.canApprove, false);
    await assert.rejects(runnerFor(root)().decide({ runId: blocked.runId, action: 'approve', reason: '무시' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
    const revises = host.calls.filter((c) => c.purpose === 'revise');
    assert.ok(revises.length > 0, 'the hard conflict must have been sent for revision');
    assert.ok(host.calls.some((c) => c.stepId === 'critic'), 'the soft finding must actually have been raised');
    for (const call of revises) {
      assert.deepEqual(call.payload.blocking.map((f) => f.severity), ['hard']);
      assert.equal(JSON.stringify(call.payload).includes('SOFT'), false);
    }

    const softRoot = await copyFixture('novel-3level');
    await useFakePack(softRoot, { overrides: { approve: { mode: 'auto' } } });
    const softHost = createFakeHost({ critic: () => [{ checkId: 'fake.critic', code: 'SOFT', message: '참고' }] });
    const softTrail = await driveToEnd(runnerFor(softRoot), softHost, { until: (o) => o.status === 'done' });
    assert.equal(softTrail.at(-1).status, 'done');
    assert.ok(softHost.calls.some((c) => c.stepId === 'critic'));
    assert.equal(softHost.calls.filter((c) => c.purpose === 'revise').length, 0);
    assert.equal(softTrail.some((o) => o.status === 'needs_model' && o.requests.some((r) => r.purpose === 'revise')), false);
    const softReceipt = (await openLedger(softRoot, 'receipts').readAll()).find((r) => r.type === 'receipt');
    assert.deepEqual(softReceipt.advisories.map((f) => f.code), ['SOFT']);
  });

  await t.test('an edited ledger is refused', async () => {
    const root = await copyFixture('novel-3level');
    await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
    await driveToEnd(runnerFor(root), createFakeHost(), { until: (o) => o.status === 'done' });
    const path = openLedger(root, 'events').path;
    await writeFile(path, `${JSON.stringify({ type: 'event', seq: 1, prev: 'genesis', hash: 'x' })}\n`);
    await assert.rejects(runnerFor(root)().run({ node: 'next' }), { code: 'LEDGER_TAMPERED' });
  });
});

test('M2-3 runs resume after the process is killed', async () => {
  const waiting = await copyFixture('novel-3level');
  await useFakePack(waiting);
  const first = runChild(waiting, 'kill-after-first-request');
  assert.ok(wasKilled(first), `${first.signal} ${first.status} ${first.stderr}`);
  assert.deepEqual(await runnerFor(waiting)().run({ node: 'next' }), JSON.parse(first.stdout));
  const committing = await copyFixture('novel-3level');
  await useFakePack(committing);
  const second = runChild(committing, 'kill-during-commit');
  assert.ok(wasKilled(second), `${second.signal} ${second.status} ${second.stderr}`);
  assert.equal((await runnerFor(committing)().run({ node: 'next' })).status, 'done');
  assert.equal((await commits(committing)).length, 1);
  const receipts = (await openLedger(committing, 'receipts').readAll()).filter((r) => r.type === 'receipt');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].nodeId, (await commits(committing))[0].nodeId);
});

test('M2-4 fixing an event in book one marks book-two scenes using that character as needing a re-check', async () => {
  const drafts = {
    't1-1-1': '마라가 옥상에 섰다.', 't1-1-2': '준호가 기다렸다.', 't1-2-1': '마라가 편지를 읽었다.', 't1-2-2': '시장이 붐볐다.',
    't2-1-1': '준호는 마라를 떠올렸다.', 't2-1-2': '비가 왔다.', 't2-2-1': '마라의 편지가 도착했다.', 't2-2-2': '끝.',
  };
  const alive = { events: [{ entityId: 'mara', kind: 'state', data: { vital: 'alive' } }] };
  const { root } = await topDown('novel-3level', { drafts, events: { 't1-1-1': alive } });
  assert.deepEqual((await workStatus(root, { packs: fakePacks() })).stale, []);
  const dead = { events: [{ entityId: 'mara', kind: 'state', data: { vital: 'dead' } }] };
  await driveToEnd(runnerFor(root), createFakeHost({ drafts, events: { 't1-1-1': dead } }), { start: { node: 't1-1-1' }, until: (o) => o.status === 'done' });
  const status = await workStatus(root, { packs: fakePacks() });
  assert.deepEqual(status.stale.map((s) => s.nodeId), ['t1-2-1', 't2-1-1', 't2-2-1']);
  for (const entry of status.stale) assert.deepEqual(entry.reasons.map((r) => `${r.kind}:${r.id}`), ['entity:mara']);
  assert.equal((await openWork(root)).tree.nodes.get('t2-1-1').body, drafts['t2-1-1']);
});

test('M2-5 a gamebook runs to the end with order checks recorded as not applicable', async () => {
  const root = await copyFixture('gamebook');
  await seedEvents(root, 'gamebook');
  await useFakePack(root);
  const trail = await driveToEnd(runnerFor(root), createFakeHost());
  assert.equal(trail.at(-1).status, 'idle');
  for (const node of (await openWork(root)).tree.nodes.values()) assert.equal(node.status, 'committed', node.id);
  const facts = (await receiptOf(root, 'gate')).steps.find((s) => s.id === 'facts');
  assert.equal(facts.status, 'not_applicable');
  assert.deepEqual(facts.checks.map((c) => [c.checkId, c.status]).sort(), [
    ['core.promise-order', 'not_applicable'], ['fake.dead-on-stage', 'not_applicable'], ['fake.defined-before-use', 'not_applicable'],
  ]);
});

test('M2-6 appendix nodes skip order checks; body nodes keep them', async () => {
  const root = await copyFixture('knowledge-book');
  await seedEvents(root, 'knowledge-book');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const host = createFakeHost({
    events: {
      'atp-section': { events: [{ entityId: 'energy-detail', kind: 'promise.resolved' }] },
      membranes: { events: [{ entityId: 'atp', kind: 'term.used' }] },
    },
  });
  const one = (node, until = (o) => o.status === 'done') => driveToEnd(runnerFor(root), host, { start: { node }, until });
  await one('glossary');
  const glossary = (await receiptOf(root, 'glossary')).steps.find((s) => s.id === 'facts');
  assert.equal(glossary.status, 'not_applicable');
  await one('atp-section');
  const body = (await receiptOf(root, 'atp-section')).steps.find((s) => s.id === 'facts');
  assert.equal(body.checks.find((c) => c.checkId === 'core.promise-order').status, 'passed');
  const blocked = (await one('membranes', (o) => o.status === 'needs_user')).at(-1);
  assert.deepEqual(blocked.question.blocking.map((f) => f.code), ['USED_BEFORE_DEFINED']);
  assert.equal(blocked.question.canApprove, false);
});
