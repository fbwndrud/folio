import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { resolvePipeline } from '../../core/pipeline/define.js';
import { commitNode } from '../../core/run/commit.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { fakePack } from '../support/fake-pack.js';
import { runChild, wasKilled } from '../support/crash.js';

async function setup() {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  return { root, makeRunner: () => createRunner({ root, packs: fakePacks() }) };
}
const commitsOf = async (root) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit');
const decisionsOf = async (root) => openLedger(root, 'decisions').readAll();
const bodyOf = async (root, id) => (await openWork(root)).tree.nodes.get(id).body;
const editRun = async (root, runId, fn) => {
  const path = createRunStore(root).pathOf(runId);
  const run = JSON.parse(await readFile(path, 'utf8'));
  fn(run);
  await writeFile(path, JSON.stringify(run));
};
const atGate = async (makeRunner, host) => (await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user' })).at(-1);

test('check results and approvals are recorded in the decisions ledger as the run makes them', async () => {
  const { root, makeRunner } = await setup();
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const { runId } = trail.at(-1);
  const records = (await decisionsOf(root)).filter((r) => r.runId === runId);
  assert.deepEqual(records.map((r) => [r.type, r.stepId, r.action ?? null]), [['check_result', 'facts', null], ['check_result', 'critic', null], ['approval', 'approve', 'approve']]);
  assert.ok(records.every((r) => r.nodeId === 'stairwell' && /^sha256:/.test(r.digest) && /^sha256:/.test(r.draftHash)));
});

test('[T4] an approval forged in the run file is refused at commit', async () => {
  const { root, makeRunner } = await setup();
  const gate = await atGate(makeRunner, createFakeHost());
  const before = await bodyOf(root, 'stairwell');
  await editRun(root, gate.runId, (r) => { r.approval = { stepId: 'approve', draftHash: r.draftHash }; r.state = 'active'; r.pending = null; });
  await assert.rejects(makeRunner().run({ node: 'next' }), (e) => e.code === 'LOCK_DECISION_MISMATCH' && e.details.stepId === 'approve' && e.details.kind === 'approval');
  assert.deepEqual(await commitsOf(root), []);
  assert.equal(await bodyOf(root, 'stairwell'), before);
});

test('a gate relabelled as auto or skipped in the run file still needs a recorded approval', async () => {
  for (const forged of [{ status: 'auto', source: 'pack' }, { status: 'skipped', reason: 'r', source: 'pack' }]) {
    const { root, makeRunner } = await setup();
    const gate = await atGate(makeRunner, createFakeHost());
    await editRun(root, gate.runId, (r) => { r.results.approve = forged; r.cursor = 7; r.state = 'active'; r.pending = null; });
    await assert.rejects(makeRunner().run({ node: 'next' }), (e) => e.code === 'LOCK_DECISION_MISMATCH' && e.details.stepId === 'approve', forged.status);
    assert.deepEqual(await commitsOf(root), []);
  }
});

test('[T1] a draft swapped in the run file with every hash made consistent is refused at commit', async () => {
  const { root, makeRunner } = await setup();
  const gate = await atGate(makeRunner, createFakeHost({ drafts: { stairwell: '준호가 기다렸다.' } }));
  const before = await bodyOf(root, 'stairwell');
  const evil = '준호가 기다렸다. (검사 안 된 문장)';
  await editRun(root, gate.runId, (r) => {
    r.outputs.draft = evil;
    r.draftHash = sha256(evil);
    for (const result of Object.values(r.results)) if (result.draftHash) result.draftHash = sha256(evil);
    if (r.outputs.events) r.outputs.events.draftHash = sha256(evil);
  });
  await assert.rejects(makeRunner().decide({ runId: gate.runId, action: 'approve' }), (e) => e.code === 'LOCK_DECISION_MISMATCH' && e.details.kind === 'check_result');
  assert.deepEqual(await commitsOf(root), []);
  assert.equal(await bodyOf(root, 'stairwell'), before);
});

test('a finding deleted from the run file after the check is refused at commit', async () => {
  const { root, makeRunner } = await setup();
  const host = createFakeHost({ critic: () => [{ checkId: 'fake.critic', code: 'SOFT', message: '참고' }] });
  const gate = await atGate(makeRunner, host);
  assert.deepEqual(gate.question.advisories.map((f) => f.code), ['SOFT']);
  await editRun(root, gate.runId, (r) => { for (const c of r.results.critic.checks) c.findings = []; });
  await assert.rejects(makeRunner().decide({ runId: gate.runId, action: 'approve' }), (e) => e.code === 'LOCK_DECISION_MISMATCH' && e.details.stepId === 'critic');
  assert.deepEqual(await commitsOf(root), []);
});

test('a hand-edited decisions ledger is reported as tampered and nothing commits', async () => {
  const { root, makeRunner } = await setup();
  const gate = await atGate(makeRunner, createFakeHost());
  const ledger = openLedger(root, 'decisions');
  const lines = (await readFile(ledger.path, 'utf8')).split('\n');
  lines[0] = lines[0].replace(/"digest":"sha256:[0-9a-f]{4}/, '"digest":"sha256:0000');
  await writeFile(ledger.path, lines.join('\n'));
  assert.equal((await ledger.verify()).ok, false);
  await assert.rejects(makeRunner().decide({ runId: gate.runId, action: 'approve' }), { code: 'LEDGER_TAMPERED' });
  assert.deepEqual(await commitsOf(root), []);
});

for (const scenario of ['kill-after-check-record', 'kill-after-approval-record']) {
  test(`a run killed between a decision record and the run save (${scenario}) finishes and commits exactly once`, async () => {
    const { root, makeRunner } = await setup();
    const child = runChild(root, scenario);
    assert.ok(wasKilled(child), `${child.signal} ${child.status} ${child.stderr}`);
    const [run] = await createRunStore(root).list();
    assert.notEqual(run.state, 'done');
    const trail = await driveToEnd(makeRunner, createFakeHost(), { until: (o) => o.status === 'done' });
    assert.equal(trail.at(-1).nodeId, run.nodeId);
    assert.deepEqual((await commitsOf(root)).map((c) => c.nodeId), [run.nodeId]);
    assert.deepEqual(await openLedger(root, 'decisions').verify(), { ok: true });
  });
}

// commitNode 를 직접 부를 때: 영수증의 모든 판정은 decisions 기록장과 맞아야 한다.
const pipeline = resolvePipeline(fakePack.pipelines.leaf, {});
async function direct() {
  const root = await copyFixture('novel-3level');
  const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
  const commit = async (receipt, text, extra = {}) => commitNode({ root, work: await openWork(root), ledgers, pipeline, receipt, text, ...extra });
  return { root, ledgers, commit };
}
const mismatch = (kind) => (e) => e.code === 'LOCK_DECISION_MISMATCH' && e.details.kind === kind;

test('a well-formed receipt with no recorded decisions is refused', async () => {
  const { ledgers, commit } = await direct();
  await assert.rejects(commit(makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline }), 'x'), mismatch('check_result'));
  await assert.rejects(commitNode({ root: '/nowhere', work: null, ledgers: { receipts: ledgers.receipts, events: ledgers.events }, pipeline, receipt: makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline }), text: 'x' }), { code: 'LOCK_DECISION_MISMATCH' });
  assert.deepEqual(await ledgers.receipts.readAll(), []);
});

test('check results must be the latest record for the step and match the receipt exactly', async () => {
  const { ledgers, commit } = await direct();
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  await recordDecisions(ledgers.decisions, receipt);
  const other = makeReceipt({ nodeId: 'stairwell', text: 'y', pipeline });
  await recordDecisions(ledgers.decisions, other, { only: ['facts'] });
  await assert.rejects(commit(receipt, 'x'), mismatch('check_result'), 'a later result for another draft wins');
  const tampered = makeReceipt({ nodeId: 'stairwell', text: 'y', pipeline });
  await recordDecisions(ledgers.decisions, tampered);
  tampered.steps.find((s) => s.id === 'critic').checks = [{ checkId: 'fake.critic', status: 'passed', findings: [] }];
  await assert.rejects(commit(tampered, 'y'), mismatch('check_result'));
  assert.deepEqual(await ledgers.receipts.readAll(), []);
});

test('an approval must match the draft and come after the check results it approved', async () => {
  const { ledgers, commit } = await direct();
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  await recordDecisions(ledgers.decisions, receipt, { approvalsFirst: true });
  await assert.rejects(commit(receipt, 'x'), mismatch('approval'));
  await ledgers.decisions.append({ type: 'approval', runId: receipt.runId, nodeId: 'stairwell', stepId: 'approve', draftHash: sha256('other'), action: 'approve', digest: sha256('d') });
  await assert.rejects(commit(receipt, 'x'), mismatch('approval'));
  await ledgers.decisions.append({ type: 'approval', runId: receipt.runId, nodeId: 'stairwell', stepId: 'approve', draftHash: receipt.draftHash, action: 'request_revision', digest: sha256('d') });
  await assert.rejects(commit(receipt, 'x'), mismatch('approval'));
  await ledgers.decisions.append({ type: 'approval', runId: receipt.runId, nodeId: 'stairwell', stepId: 'approve', draftHash: receipt.draftHash, action: 'approve', digest: sha256('d') });
  await commit(receipt, 'x');
});

test('every user override in the receipt needs a matching override record', async () => {
  const { ledgers, commit } = await direct();
  const finding = { checkId: 'no-x', severity: 'block', code: 'X', message: 'X used' };
  const receipt = makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline });
  const critic = receipt.steps.find((s) => s.id === 'critic');
  Object.assign(critic, { status: 'failed', checks: [{ checkId: 'no-x', status: 'failed', findings: [finding] }] });
  await recordDecisions(ledgers.decisions, receipt);
  receipt.overridden = [{ ...finding, overrideReason: '의도', source: 'user' }];
  await assert.rejects(commit(receipt, 'x'), mismatch('override'));
  await recordDecisions(ledgers.decisions, { ...receipt, overridden: [{ ...finding, overrideReason: '다른 이유', source: 'user' }] }, { only: [] });
  await assert.rejects(commit(receipt, 'x'), mismatch('override'));
  await recordDecisions(ledgers.decisions, receipt, { only: [] });
  await commit(receipt, 'x');
});

test('a run commits at most once; the same receipt still resumes idempotently', async () => {
  const { ledgers, commit } = await direct();
  const first = makeReceipt({ nodeId: 'stairwell', text: 'a', pipeline, receiptId: 'r1', runId: 'run-one' });
  await recordDecisions(ledgers.decisions, first);
  await commit(first, 'a');
  assert.equal((await commit(first, 'a', { resume: true })).alreadyCommitted, true);
  const second = makeReceipt({ nodeId: 'stairwell', text: 'b', pipeline, receiptId: 'r2', runId: 'run-one' });
  await recordDecisions(ledgers.decisions, second);
  await assert.rejects(commit(second, 'b'), (e) => e.code === 'LOCK_RUN_ALREADY_COMMITTED' && e.details.receiptId === 'r1');
});

test('a run with no decision records at all gets a hint to start over', async () => {
  const { commit } = await direct();
  await assert.rejects(commit(makeReceipt({ nodeId: 'stairwell', text: 'x', pipeline }), 'x'), (e) => e.code === 'LOCK_DECISION_MISMATCH' && /predates decision records/.test(e.details.hint));
});
