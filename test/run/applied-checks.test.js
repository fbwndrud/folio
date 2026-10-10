import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { findStale } from '../../core/scope/stale.js';
import { workStatus } from '../../core/status.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { openWork } from '../../core/store/work.js';
import { resolvePipeline } from '../../core/pipeline/define.js';
import { commitNode } from '../../core/run/commit.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { fakePack } from '../support/fake-pack.js';

async function setup(checks = {}) {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { checks, overrides: { approve: { mode: 'auto' } } });
  return { root, makeRunner: () => createRunner({ root, packs: fakePacks() }) };
}
const editYaml = async (root, fn) => {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  fn(config);
  await writeFile(path, stringifyYaml(config));
};
const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
const staleOf = async (root) => {
  const { work, applied } = await openWorkspace(root, { packs: fakePacks() });
  return findStale({ work, applied, receiptRecords: await openLedger(root, 'receipts').readAll(), events: activeEvents(await openLedger(root, 'events').readAll()) });
};
const commit = (root, makeRunner, node = 'stairwell') => driveToEnd(makeRunner, createFakeHost(), { start: { node }, until: (o) => o.status === 'done' });

test('a receipt records which checks were applied, with the digest of each check', async () => {
  const { root, makeRunner } = await setup();
  await commit(root, makeRunner);
  const receipt = await receiptOf(root, 'stairwell');
  const { applied } = await openWorkspace(root, { packs: fakePacks() });
  assert.deepEqual(receipt.appliedChecks, applied.leaf);
  assert.deepEqual(receipt.appliedChecks.map((a) => a.checkId), ['core.promise-order', 'fake.critic', 'fake.dead-on-stage', 'fake.defined-before-use']);
  for (const entry of receipt.appliedChecks) assert.match(entry.digest, /^sha256:[0-9a-f]{64}$/);
});

test('a check switched off while a run is open is recorded as skipped by work.yaml, not as passed', async () => {
  const { root, makeRunner } = await setup();
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => label(o) === 'model:critic' });
  await editYaml(root, (config) => { config.checks = { 'fake.critic': { mode: 'off' } }; });
  await assert.rejects(makeRunner().resume({ runId: trail.at(-1).runId, answers: createFakeHost().answer(trail.at(-1)) }), { code: 'ANSWER_STALE' });
  const rest = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'next' }, until: (o) => o.status === 'done' });
  assert.equal(rest.at(-1).status, 'done');
  const receipt = await receiptOf(root, 'stairwell');
  const critic = receipt.steps.find((s) => s.id === 'critic');
  assert.deepEqual(critic.checks, [{ checkId: 'fake.critic', status: 'skipped', source: 'work.yaml', findings: [] }]);
  assert.notEqual(critic.status, 'passed');
  assert.ok(!receipt.appliedChecks.some((a) => a.checkId === 'fake.critic'));
});

test('switching a check on marks committed nodes that never ran it; a changed check marks them again', async () => {
  const { root, makeRunner } = await setup({ 'fake.critic': { mode: 'off' } });
  await commit(root, makeRunner);
  assert.deepEqual(await staleOf(root), []);
  await editYaml(root, (config) => { config.checks = {}; });
  const { applied } = await openWorkspace(root, { packs: fakePacks() });
  const critic = applied.leaf.find((a) => a.checkId === 'fake.critic');
  assert.deepEqual(await staleOf(root), [{ nodeId: 'stairwell', reasons: [{ kind: 'check', id: 'fake.critic', was: null, now: critic.digest }] }]);
  const status = await workStatus(root, { packs: fakePacks() });
  assert.deepEqual(status.recheck, [{ nodeId: 'stairwell', checks: ['fake.critic'] }]);
  assert.deepEqual(status.flagged, []);
  await editYaml(root, (config) => { config.checks = { 'fake.critic': { mode: 'off' } }; });
  assert.deepEqual(await staleOf(root), [], 'switching a check off needs no backfill');
});

test('a check whose definition changed marks nodes checked with the old definition', async () => {
  const { root, makeRunner } = await setup();
  await commit(root, makeRunner);
  const before = (await receiptOf(root, 'stairwell')).appliedChecks.find((a) => a.checkId === 'fake.critic').digest;
  await editYaml(root, (config) => { config.checks = { 'fake.critic': { severity: 'block' } }; });
  const [entry] = await staleOf(root);
  assert.deepEqual(entry.reasons.map((r) => [r.kind, r.id, r.was]), [['check', 'fake.critic', before]]);
  assert.notEqual(entry.reasons[0].now, before);
});

test('a receipt whose appliedChecks does not match the checks its steps ran is refused at commit', async () => {
  const root = await copyFixture('novel-3level');
  const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
  const pipeline = resolvePipeline(fakePack.pipelines.leaf, {});
  const text = '준호는 기다렸다.\n';
  const digest = `sha256:${'a'.repeat(64)}`;
  const receipt = makeReceipt({ nodeId: 'stairwell', text, pipeline });
  receipt.steps.find((s) => s.id === 'facts').checks = [{ checkId: 'core.promise-order', status: 'passed', findings: [] }];
  for (const applied of [[{ checkId: 'fake.critic', digest }], [], [{ checkId: 'core.promise-order', digest }, { checkId: 'core.promise-order', digest }]]) {
    const forged = { ...receipt, appliedChecks: applied };
    await assert.rejects(commitNode({ root, work: await openWork(root), ledgers, pipeline, receipt: forged, text }),
      (e) => e.code === 'LOCK_RECEIPT_INVALID' && e.details.problems.some((p) => p.code === 'APPLIED_CHECKS_MISMATCH'), JSON.stringify(applied));
  }
  const shape = { ...receipt, appliedChecks: [{ checkId: 'core.promise-order', digest: 'nope' }] };
  await assert.rejects(commitNode({ root, work: await openWork(root), ledgers, pipeline, receipt: shape, text }),
    (e) => e.code === 'LOCK_RECEIPT_INVALID' && e.details.problems.some((p) => p.code === 'APPLIED_CHECKS_INVALID'));
  const wrongOrder = { ...receipt, appliedChecks: [{ checkId: 'core.promise-order', digest }], order: { mode: 'none', ordered: false } };
  await assert.rejects(commitNode({ root, work: await openWork(root), ledgers, pipeline, receipt: wrongOrder, text }),
    (e) => e.code === 'LOCK_RECEIPT_INVALID' && e.details.problems.some((p) => p.code === 'ORDER_MISMATCH'));
  const honest = { ...receipt, appliedChecks: [{ checkId: 'core.promise-order', digest }], order: { mode: 'linear', ordered: true } };
  await recordDecisions(ledgers.decisions, honest);
  assert.equal((await commitNode({ root, work: await openWork(root), ledgers, pipeline, receipt: honest, text })).nodeId, 'stairwell');
});
