import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { copyFixture, seedEvents, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { committedWith, editYaml, receiptRecordsOf, rechecksOf } from '../support/recheck.js';

const at = (stepId) => (o) => o.status === 'needs_model' && o.requests[0].stepId === stepId;
const oldAnswer = (o) => JSON.stringify({ checked: o.requests[0].payload.checks.map((c) => c.checkId), findings: [] });
const instructions = (o) => o.requests[0].payload.checks.map((c) => c.instruction);
const editRun = async (root, runId, fn) => {
  const path = createRunStore(root).pathOf(runId);
  const run = JSON.parse(await readFile(path, 'utf8'));
  fn(run);
  await writeFile(path, JSON.stringify(run));
};

test('an answer given before a check changed is not used for the changed check (recheck run)', async () => {
  const { root, makeRunner } = await committedWith({ checks: { 'fake.critic': { mode: 'off' }, mine: { rule: 'OLD rule', stage: 'critic', mode: 'off' } } });
  await editYaml(root, (c) => { c.checks = { mine: { rule: 'OLD rule', stage: 'critic' } }; });
  const asked = (await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'next-recheck', mode: 'recheck' }, until: at('critic') })).at(-1);
  await editYaml(root, (c) => { c.checks = { mine: { rule: 'NEW rule', stage: 'critic', severity: 'block' } }; });
  await assert.rejects(makeRunner().resume({ runId: asked.runId, answers: { [asked.requests[0].requestId]: oldAnswer(asked) } }), { code: 'ANSWER_STALE' });
  const again = (await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'next' }, until: at('critic') })).at(-1);
  assert.ok(instructions(again).includes('NEW rule'));
  assert.deepEqual(await rechecksOf(root), []);
});

test('an answer given before a check changed is not used for the changed check (branch run)', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { checks: { mine: { rule: 'OLD', stage: 'fit' } }, overrides: { approve: { mode: 'auto' } } });
  const mk = () => createRunner({ root, packs: fakePacks() });
  const asked = (await driveToEnd(mk, createFakeHost(), { start: { node: 'next' }, until: at('fit') })).at(-1);
  await editYaml(root, (c) => { c.checks = { mine: { rule: 'NEW', stage: 'fit', severity: 'block' } }; });
  await assert.rejects(mk().resume({ runId: asked.runId, answers: { [asked.requests[0].requestId]: oldAnswer(asked) } }), { code: 'ANSWER_STALE' });
  const out = await mk().run({ node: 'next' });
  assert.equal(label(out), 'model:fit');
  assert.ok(instructions(out).includes('NEW'));
});

test('an inbox answer bound to a different request id is dropped and the step asks again', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const mk = () => createRunner({ root, packs: fakePacks() });
  const asked = (await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: at('critic') })).at(-1);
  await editRun(root, asked.runId, (run) => { run.pending.requests[0].requestId = 'req-forged'; });
  const out = await mk().resume({ runId: asked.runId, answers: { 'req-forged': oldAnswer(asked) } });
  assert.equal(label(out), 'model:critic');
  assert.notEqual(out.requests[0].requestId, 'req-forged');
});

test('switching off the check that blocks an open run takes effect on the next call; while on it still cannot be approved', async () => {
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const mk = () => createRunner({ root, packs: fakePacks() });
  const blocked = (await driveToEnd(mk, createFakeHost(), { start: { node: 'ep-004' }, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.deepEqual(blocked.question.blocking.map((f) => f.code), ['DEAD_ON_STAGE']);
  await assert.rejects(mk().decide({ runId: blocked.runId, action: 'approve', reason: 'x' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  await editYaml(root, (c) => { c.checks = { 'fake.dead-on-stage': { mode: 'off' } }; });
  const next = await mk().run({ node: 'next' });
  assert.notEqual(label(next), 'user:blocked');
  const done = (await driveToEnd(mk, createFakeHost(), { from: next, until: (o) => o.status === 'done' })).at(-1);
  assert.equal(done.status, 'done');
  const receipt = (await receiptRecordsOf(root)).filter((r) => r.type === 'receipt').at(-1);
  const dead = receipt.steps.find((s) => s.id === 'facts').checks.find((c) => c.checkId === 'fake.dead-on-stage');
  assert.deepEqual([dead.status, dead.source], ['skipped', 'work.yaml']);
});

test('a decision on a question made under changed settings is not applied; the run re-plans instead', async () => {
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  await useFakePack(root);
  const mk = () => createRunner({ root, packs: fakePacks() });
  const gate = (await driveToEnd(mk, createFakeHost(), { start: { node: 'ep-005' }, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.equal(gate.question.kind, 'approve');
  await editYaml(root, (c) => { c.checks = { 'fake.critic': { mode: 'off' } }; });
  const out = await mk().decide({ runId: gate.runId, action: 'approve' });
  assert.notEqual(out.status, 'done');
  assert.deepEqual((await receiptRecordsOf(root)).filter((r) => r.type === 'commit'), []);
  const approvals = (await openLedger(root, 'decisions').readAll()).filter((r) => r.runId === gate.runId && r.type === 'approval');
  assert.deepEqual(approvals, [], 'the stale question was not decided');
});
