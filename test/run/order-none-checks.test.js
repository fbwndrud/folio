import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPackSpec } from '../../core/pack/yaml-schema.js';
import { applicability, runDeterministicChecks } from '../../core/checks/run-checks.js';
import { PROMISE_ORDER_CHECK } from '../../core/checks/builtin.js';
import { gatherScope } from '../../core/scope/scope.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { createRunner } from '../../core/run/runner.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const spec = (requiresOrder) => ({ name: 'demo', checks: { 'demo.x': { tier: 'deterministic', stage: 'facts', severity: 'advisory', run: 'x', requiresOrder } } });

test('pack.yaml requiresOrder takes linear, none or branching; anything else is PACK_FIELD_INVALID', () => {
  for (const value of ['linear', 'none', 'branching', undefined]) assert.deepEqual(readPackSpec(spec(value)).errors, [], String(value));
  for (const value of ['NONE', 'None', ' none', '', true, ['none'], null]) {
    assert.deepEqual(readPackSpec(spec(value)).errors, [{ code: 'PACK_FIELD_INVALID', path: 'checks.demo.x.requiresOrder' }], String(value));
  }
});

test('requiresOrder none applies only where the node is unordered by none; linear only where it is ordered', () => {
  const none = { requiresOrder: 'none' };
  const linear = { requiresOrder: 'linear' };
  const at = (ordered, unorderedBy) => ({ ordered, unorderedBy });
  assert.equal(applicability(none, at(false, 'none')), 'applicable');
  for (const ctx of [at(false, 'branching'), at(false, 'role'), at(true, null), {}]) assert.equal(applicability(none, ctx), 'not_applicable', JSON.stringify(ctx));
  for (const ctx of [at(false, 'none'), at(false, 'branching'), at(false, 'role'), {}]) assert.equal(applicability(linear, ctx), 'not_applicable', JSON.stringify(ctx));
  assert.equal(applicability(linear, at(true, null)), 'applicable');
  assert.ok(Object.isFrozen(PROMISE_ORDER_CHECK));
  assert.deepEqual([PROMISE_ORDER_CHECK.requiresOrder, PROMISE_ORDER_CHECK.severity, PROMISE_ORDER_CHECK.locked], ['linear', 'hard', true]);
});

/** reference-book 복사본에 약속 엔티티 하나와 연결된 노드(mitochondria)의 심기 사건을 넣는다. */
async function referenceWithPromise() {
  const root = await copyFixture('reference-book');
  await mkdir(join(root, 'entities', 'promise'), { recursive: true });
  await writeFile(join(root, 'entities', 'promise', 'later.md'), '---\nid: later\nkind: promise\nname: 뒤에서\n---\n');
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  await ledger.append({ type: 'event', eventId: 'seed-1', nodeId: 'mitochondria', entityId: 'later', kind: 'promise.planted' });
  await ledger.append({ type: 'event', eventId: 'seed-2', nodeId: 'mitochondria', entityId: 'atp', kind: 'term.defined' });
  return root;
}

const ctxFor = async (root, nodeId, draft, draftEvents) => {
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const scope = gatherScope({ work, events, nodeId, draftText: draft });
  return { ...scope, work, node: work.tree.nodes.get(nodeId), draft, draftEvents: draftEvents.map((e, i) => ({ ...e, eventId: `draft-${i + 1}`, nodeId })) };
};

test('core.promise-order stays not applicable on a none entry even when a linked node planted the promise', async () => {
  const root = await referenceWithPromise();
  const ctx = await ctxFor(root, 'atp-entry', '뒤에서 말한 ATP를 이제 설명한다.', [{ entityId: 'later', kind: 'promise.resolved' }]);
  assert.deepEqual(ctx.linkedEvents.map((e) => `${e.nodeId}:${e.entityId}:${e.kind}`), ['mitochondria:later:promise.planted', 'mitochondria:atp:term.defined']);
  assert.deepEqual(ctx.priorEvents, []);
  assert.deepEqual(runDeterministicChecks([PROMISE_ORDER_CHECK], ctx), [{ checkId: 'core.promise-order', status: 'not_applicable', findings: [] }]);
});

test('a linear node linking to the later node that plants a promise still fails core.promise-order: links never count as earlier', async () => {
  const root = await copyFixture('novel-3level');
  await seedEvents(root, 'novel-3level');
  const file = join(root, 'tree', '01-book-one', '01-the-fall', '02-stairwell.md');
  await writeFile(file, (await readFile(file, 'utf8')).replace(/^---\n/, '---\nlinks:\n  - to: post-office\n'));
  const ctx = await ctxFor(root, 'stairwell', '붉은 편지의 주인을 밝혔다.', [{ entityId: 'red-letter', kind: 'promise.resolved' }]);
  assert.deepEqual([ctx.ordered, ctx.linkedEvents], [true, []]);
  const [result] = runDeterministicChecks([PROMISE_ORDER_CHECK], ctx);
  assert.deepEqual([result.status, result.findings.map((f) => [f.code, f.severity])], ['failed', [['PROMISE_RESOLVED_BEFORE_PLANT', 'hard']]]);
});

/** 가짜 팩 + 순서 없는 노드에서만 도는 검사(연결 사건을 알린다)와 어디서나 도는 hard 검사. */
function packsWithOrderChecks() {
  const linkedSeen = {
    id: 'fake.linked-seen', tier: 'deterministic', stage: 'facts', severity: 'advisory', requiresOrder: 'none', origin: 'pack',
    run: (ctx) => ctx.linkedEvents.map((e) => ({ code: 'LINKED_SEEN', message: `${e.nodeId}:${e.entityId}` })),
  };
  const noGhost = {
    id: 'fake.no-ghost', tier: 'deterministic', stage: 'facts', severity: 'hard', origin: 'pack',
    run: (ctx) => (String(ctx.draft).includes('유령') ? [{ code: 'GHOST', message: 'ghost in the draft', quote: '유령' }] : []),
  };
  const basic = fakePack.checkSets['fake.basic'];
  const pack = {
    ...fakePack, checks: [...fakePack.checks, linkedSeen, noGhost],
    checkSets: { ...fakePack.checkSets, 'fake.basic': { ...basic, checks: [...basic.checks, 'fake.linked-seen', 'fake.no-ghost'] } },
  };
  return new Map([['fake', pack]]);
}

test('on a none entry the receipt keeps order checks not applicable, runs the none-only check, and a hard check still blocks', async () => {
  const root = await referenceWithPromise();
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const packs = packsWithOrderChecks();
  const makeRunner = () => createRunner({ root, packs });
  const host = createFakeHost({ drafts: { 'atp-entry': 'ATP 항목.', cell: '유령 같은 세포.' } });
  await driveToEnd(makeRunner, host, { start: { node: 'atp-entry' }, until: (o) => o.status === 'done' });
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'atp-entry');
  assert.deepEqual(receipt.order, { mode: 'none', ordered: false });
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.deepEqual(facts.checks.map((c) => [c.checkId, c.status, c.findings.map((f) => f.message)]).sort(), [
    ['core.promise-order', 'not_applicable', []], ['fake.dead-on-stage', 'not_applicable', []], ['fake.defined-before-use', 'not_applicable', []],
    ['fake.linked-seen', 'passed', ['mitochondria:later', 'mitochondria:atp']], ['fake.no-ghost', 'passed', []],
  ]);
  const blocked = (await driveToEnd(makeRunner, host, { start: { node: 'cell' }, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.equal(label(blocked), 'user:blocked');
  assert.deepEqual([blocked.question.canApprove, blocked.question.blocking.map((f) => [f.code, f.severity])], [false, [['GHOST', 'hard']]]);
});

test('on a linear node the none-only check is not applicable', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const packs = packsWithOrderChecks();
  await driveToEnd(() => createRunner({ root, packs }), createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'stairwell');
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.deepEqual(facts.checks.filter((c) => c.checkId === 'fake.linked-seen' || c.checkId === 'core.promise-order').map((c) => [c.checkId, c.status]).sort(),
    [['core.promise-order', 'passed'], ['fake.linked-seen', 'not_applicable']]);
});
