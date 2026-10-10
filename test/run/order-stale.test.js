import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWorkspace } from '../../core/run/workspace.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { findStale } from '../../core/scope/stale.js';
import { workStatus } from '../../core/status.js';
import { createRunner } from '../../core/run/runner.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { committedWith, editYaml } from '../support/recheck.js';

const staleOf = async (root) => {
  const { work, applied } = await openWorkspace(root, { packs: fakePacks() });
  return findStale({ work, applied, receiptRecords: await openLedger(root, 'receipts').readAll(), events: activeEvents(await openLedger(root, 'events').readAll()) });
};
const orderReasons = (stale) => stale.map((s) => [s.nodeId, s.reasons.filter((r) => r.kind === 'order')]).filter(([, r]) => r.length);
const LINEAR = { mode: 'linear', ordered: true };
const NONE = { mode: 'none', ordered: false };
const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);

test('receipts record the node order, and switching the order marks committed body nodes stale until switched back', async () => {
  const { root } = await committedWith();
  assert.deepEqual((await receiptOf(root, 'stairwell')).order, LINEAR);
  await editYaml(root, (config) => { config.order = 'none'; });
  assert.deepEqual(orderReasons(await staleOf(root)), [['stairwell', [{ kind: 'order', id: 'stairwell', was: LINEAR, now: NONE }]]]);
  assert.deepEqual((await workStatus(root, { packs: fakePacks() })).recheck, [{ nodeId: 'stairwell', checks: [], order: { was: LINEAR, now: NONE } }]);
  await editYaml(root, (config) => { config.order = 'linear'; });
  assert.deepEqual(await staleOf(root), []);
});

test('a recheck run clears order staleness', async () => {
  const { root, makeRunner } = await committedWith();
  await editYaml(root, (config) => { config.order = 'none'; });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'next-recheck', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.deepEqual([trail.at(-1).status, trail.at(-1).nodeId], ['done', 'stairwell']);
  const recheck = (await openLedger(root, 'receipts').readAll()).at(-1);
  assert.deepEqual([recheck.type, recheck.order], ['recheck', NONE]);
  assert.deepEqual(await staleOf(root), []);
});

test('front and back matter and gamebook nodes are not marked by an order switch', async () => {
  const root = await copyFixture('knowledge-book');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  for (const node of ['preface', 'atp-section']) await driveToEnd(makeRunner, createFakeHost(), { start: { node }, until: (o) => o.status === 'done' });
  await editYaml(root, (config) => { config.order = 'none'; });
  assert.deepEqual(orderReasons(await staleOf(root)).map(([id]) => id), ['atp-section']);
  const leaf = await firstLeaf('gamebook');
  const game = await committedWith({ fixture: 'gamebook', node: leaf });
  assert.deepEqual((await receiptOf(game.root, leaf)).order, { mode: 'branching', ordered: false, unorderedBy: 'branching' });
  await editYaml(game.root, (config) => { config.order = 'none'; });
  assert.deepEqual(orderReasons(await staleOf(game.root)).map(([id]) => id), [leaf]);
});

test('an order switch while a run is open re-plans the checks, so the receipt order is the order the checks saw', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const first = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => label(o) === 'model:critic' });
  await editYaml(root, (config) => { config.order = 'none'; });
  await assert.rejects(makeRunner().resume({ runId: first.at(-1).runId, answers: createFakeHost().answer(first.at(-1)) }), { code: 'ANSWER_STALE' });
  const rest = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'next' }, until: (o) => o.status === 'done' });
  assert.ok(rest.map(label).includes('model:extract'), rest.map(label).join());
  const receipt = await receiptOf(root, 'stairwell');
  assert.deepEqual(receipt.order, NONE);
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.equal(facts.checks.find((c) => c.checkId === 'core.promise-order').status, 'not_applicable');
});

async function firstLeaf(fixture) {
  const work = await openWork(await copyFixture(fixture));
  return [...work.tree.nodes.values()].find((n) => n.kind === 'leaf' && n.role === 'body').id;
}
