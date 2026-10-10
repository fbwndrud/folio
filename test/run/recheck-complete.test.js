import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { commitNode } from '../../core/run/commit.js';
import { workStatus } from '../../core/status.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { committedWith, editYaml, rechecksOf, receiptRecordsOf } from '../support/recheck.js';
import { createRunner } from '../../core/run/runner.js';

const RECHECK = { node: 'next-recheck', mode: 'recheck' };
const status = (root) => workStatus(root, { packs: fakePacks() });
const unanswered = (o) => ({ [o.requests[0].requestId]: JSON.stringify({ checked: [], findings: [] }) });

test('a recheck whose model check was not answered is not recorded; it asks again and gives up to the user after three tries', async () => {
  const { root, makeRunner } = await committedWith({ checks: { 'fake.critic': { mode: 'off' } } });
  await editYaml(root, (c) => { c.checks = {}; });
  let out = (await driveToEnd(makeRunner, createFakeHost(), { start: RECHECK, until: (o) => label(o) === 'model:critic' })).at(-1);
  for (let i = 0; i < 2; i += 1) {
    out = await makeRunner().resume({ runId: out.runId, answers: unanswered(out) });
    assert.equal(label(out), 'model:critic', `try ${i + 2}`);
  }
  out = await makeRunner().resume({ runId: out.runId, answers: unanswered(out) });
  assert.deepEqual([out.status, out.question?.code, out.question?.canApprove], ['needs_user', 'RECHECK_INCOMPLETE', false]);
  assert.deepEqual(await rechecksOf(root), []);
  assert.deepEqual((await status(root)).recheck, [{ nodeId: 'stairwell', checks: ['fake.critic'] }]);
});

test('a normal run whose advisory check errored commits, but the check is not counted as applied', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const host = createFakeHost();
  const mk = () => createRunner({ root, packs: fakePacks() });
  let out = await mk().run({ node: 'stairwell' });
  while (out.status === 'needs_model') {
    const answers = out.requests[0].stepId === 'critic' ? unanswered(out) : host.answer(out);
    out = await mk().resume({ runId: out.runId, answers });
  }
  assert.equal(out.status, 'done');
  const receipt = (await receiptRecordsOf(root)).filter((r) => r.type === 'receipt').at(-1);
  assert.equal(receipt.steps.find((s) => s.id === 'critic').checks[0].status, 'error');
  assert.ok(!receipt.appliedChecks.some((a) => a.checkId === 'fake.critic'));
  assert.deepEqual((await status(root)).recheck, [{ nodeId: 'stairwell', checks: ['fake.critic'] }]);
});

test('a recheck extracts appearances from the committed text, so a dead character on stage is found', async () => {
  const host = { events: { 'ep-005': { events: [], appearances: ['doyun'] } } };
  const { root, makeRunner } = await committedWith({ fixture: 'serial-2level', seed: true, node: 'ep-005', checks: { 'fake.dead-on-stage': { mode: 'off' } }, host });
  await editYaml(root, (c) => { c.checks = {}; });
  const trail = await driveToEnd(makeRunner, createFakeHost(host), { start: { node: 'ep-005', mode: 'recheck' }, until: (o) => o.status === 'needs_user' || o.status === 'done' });
  assert.equal(label(trail[0]), 'model:extract');
  const last = trail.at(-1);
  assert.deepEqual([last.status, last.question?.kind, last.question?.blocking.map((f) => f.code)], ['needs_user', 'flagged', ['DEAD_ON_STAGE']]);
  const decisions = (await openLedger(root, 'decisions').readAll()).filter((r) => r.runId === last.runId);
  assert.ok(decisions.some((r) => r.type === 'check_result' && r.stepId === 'facts'));
});

test('a committed node whose receipt predates appliedChecks/order is listed for backfill as unknown, and a recheck clears it', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const { pipelines } = await openWorkspace(root, { packs: fakePacks() });
  const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
  const text = '준호는 기다렸다.\n';
  const receipt = makeReceipt({ nodeId: 'stairwell', text, pipeline: pipelines.leaf });
  await recordDecisions(ledgers.decisions, receipt);
  await commitNode({ root, work: await openWork(root), ledgers, pipeline: pipelines.leaf, receipt, text });
  assert.deepEqual((await status(root)).recheck, [{ nodeId: 'stairwell', checks: [], reason: 'unknown' }]);
  const done = (await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost(), { start: RECHECK, until: (o) => o.status === 'done' })).at(-1);
  assert.deepEqual([done.status, done.nodeId], ['done', 'stairwell']);
  assert.deepEqual((await status(root)).recheck, []);
});
