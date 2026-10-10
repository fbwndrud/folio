import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunStore } from '../../core/run/run-store.js';
import { recordRecheck } from '../../core/run/recheck-commit.js';
import { createRunner } from '../../core/run/runner.js';
import { fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { bodyOf, committedWith, editYaml, rechecksOf } from '../support/recheck.js';

const RECHECK = { node: 'next-recheck', mode: 'recheck' };
const strip = ({ type: _t, seq: _s, at: _a, prev: _p, hash: _h, ...body }) => body;
const editRun = async (root, runId, fn) => {
  const path = createRunStore(root).pathOf(runId);
  const run = JSON.parse(await readFile(path, 'utf8'));
  fn(run);
  await writeFile(path, JSON.stringify(run));
};

async function recorded() {
  const { root, makeRunner } = await committedWith({ checks: { 'fake.critic': { mode: 'off' } } });
  await editYaml(root, (config) => { config.checks = {}; });
  await driveToEnd(makeRunner, createFakeHost(), { start: RECHECK, until: (o) => o.status === 'done' });
  const [record] = await rechecksOf(root);
  const { work, pipelines } = await openWorkspace(root, { packs: fakePacks() });
  const ledgers = { receipts: openLedger(root, 'receipts'), decisions: openLedger(root, 'decisions') };
  const write = (patch) => recordRecheck({ work, ledgers, pipeline: pipelines.leaf, record: { ...strip(record), ...patch } });
  return { root, record: strip(record), write };
}

test('recordRecheck is idempotent for its run and refuses a second record from the same run', async () => {
  const { root, write } = await recorded();
  assert.equal((await write({})).alreadyRecorded, true);
  await assert.rejects(write({ recheckId: 'rchk-again' }), { code: 'LOCK_RUN_ALREADY_COMMITTED' });
  assert.equal((await rechecksOf(root)).length, 1);
});

test('recordRecheck refuses records the engine did not decide, or that do not describe the committed text', async () => {
  const { root, record, write } = await recorded();
  const facts = record.steps.find((s) => s.id === 'facts');
  const hardFacts = { ...facts, checks: [...facts.checks.slice(1), { ...facts.checks[0], status: 'failed', findings: [{ checkId: facts.checks[0].checkId, severity: 'hard', code: 'X', message: 'x' }] }] };
  const cases = [
    [{ runId: 'run-forged', recheckId: 'rchk-forged' }, 'LOCK_DECISION_MISMATCH'],
    [{ runId: 'run-forged2', recheckId: 'rchk-f2', receiptId: 'rcpt-older' }, 'LOCK_RECHECK_STALE'],
    [{ runId: 'run-forged2b', recheckId: 'rchk-f2b', committedHash: `sha256:${'0'.repeat(64)}` }, 'LOCK_RECEIPT_INVALID'],
    [{ runId: 'run-forged3', recheckId: 'rchk-f3', type: 'recheck' }, 'LOCK_RECEIPT_INVALID'],
    [{ runId: 'run-forged4', recheckId: 'rchk-f4', steps: record.steps.slice(1) }, 'LOCK_STEP_MISSING'],
    [{ runId: 'run-forged5', recheckId: 'rchk-f5', steps: record.steps.map((s) => (s.id === 'facts' ? hardFacts : s)) }, 'LOCK_RECEIPT_INVALID'],
    [{ runId: 'run-forged8', recheckId: 'rchk-f8', order: { mode: 'none', ordered: false } }, 'LOCK_RECEIPT_INVALID'],
    [{ runId: 'run-forged9', recheckId: 'rchk-f9', order: undefined }, 'LOCK_RECEIPT_INVALID'],
    [{ runId: 'run-forged6', recheckId: 'rchk-f6', appliedChecks: record.appliedChecks.slice(1) }, 'LOCK_RECEIPT_INVALID'],
    [{ runId: 'run-forged7', recheckId: 'rchk-f7', steps: record.steps.map((s) => ({ ...s, checks: s.checks.map((c) => ({ ...c, reviewer: { sameHost: true, independent: true } })) })) }, 'LOCK_RECEIPT_INVALID'],
  ];
  for (const [patch, code] of cases) await assert.rejects(write(patch), { code }, JSON.stringify(Object.keys(patch)));
  assert.equal((await rechecksOf(root)).length, 1);
});

test('findings stripped from a recheck run file are caught by the decisions ledger and the check runs again', async () => {
  const { root, makeRunner } = await committedWith({ fixture: 'serial-2level', seed: true, node: 'ep-004', checks: { 'fake.dead-on-stage': { mode: 'off' } } });
  const before = await bodyOf(root, 'ep-004');
  await editYaml(root, (config) => { config.checks = {}; });
  const first = (await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'ep-004', mode: 'recheck' }, until: (o) => label(o) === 'model:critic' })).at(-1);
  assert.equal(label(first), 'model:critic');
  await editRun(root, first.runId, (run) => {
    for (const check of run.results.facts.checks) { check.findings = []; check.status = 'passed'; }
    run.results.facts.status = 'passed';
  });
  await assert.rejects(makeRunner().resume({ runId: first.runId, answers: createFakeHost().answer(first) }), { code: 'LOCK_DECISION_MISMATCH' });
  assert.deepEqual(await rechecksOf(root), []);
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'next' }, until: (o) => o.status === 'needs_user' });
  assert.deepEqual([trail.at(-1).question.kind, trail.at(-1).question.canApprove, trail.at(-1).question.blocking.map((f) => f.code)], ['flagged', false, ['DEAD_ON_STAGE']]);
  assert.equal(await bodyOf(root, 'ep-004'), before);
});

test('a recheck that died after its record was written finishes with that record on the next call', async () => {
  const { root, record } = await recorded();
  await editRun(root, record.runId, (run) => { run.state = 'active'; run.cursor = 3; run.results = {}; });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const again = await makeRunner().run({ node: 'next' });
  assert.deepEqual([again.status, again.recheckId, again.runId], ['done', record.recheckId, record.runId]);
  assert.equal((await rechecksOf(root)).length, 1);
});
