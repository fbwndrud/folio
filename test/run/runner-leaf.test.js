import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { findStale } from '../../core/scope/stale.js';
import { copyFixture, seedEvents, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { fakePack } from '../support/fake-pack.js';

async function setup({ fixture = 'novel-3level', seed = false, checks, overrides } = {}) {
  const root = await copyFixture(fixture);
  if (seed) await seedEvents(root, fixture);
  await useFakePack(root, { checks, overrides });
  return { root, makeRunner: () => createRunner({ root, packs: fakePacks() }) };
}
const untilDone = (o) => o.status === 'done';
const receiptsOf = async (root) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt');
const stepStatus = (receipt) => Object.fromEntries(receipt.steps.map((s) => [s.id, s.status]));

test('a leaf runs plan, draft, extract, facts, critic, approval and commit', async () => {
  const { root, makeRunner } = await setup();
  const text = '준호는 계단참에서 마라를 기다렸다.\n';
  const host = createFakeHost({ drafts: { stairwell: text } });
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: untilDone });
  assert.deepEqual(trail.map(label), ['model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve', 'done']);
  const node = (await openWork(root)).tree.nodes.get('stairwell');
  assert.deepEqual([node.body, node.status], [text, 'committed']);
  const [receipt] = await receiptsOf(root);
  assert.deepEqual(stepStatus(receipt), { plan: 'passed', draft: 'passed', extract: 'passed', facts: 'passed', critic: 'passed', revise: 'not_needed', approve: 'approved' });
  assert.deepEqual(receipt.refs.map((r) => `${r.kind}:${r.id}`), ['node:the-fall', 'node:book-one', 'entity:junho', 'entity:mara', 'asset:img-rooftop']);
  assert.deepEqual(receipt.steps.find((s) => s.id === 'critic').checks[0].reviewer, { sameHost: true, independent: false });
  assert.equal((await createRunStore(root).list())[0].state, 'done');
});

test('critic can be skipped with a reason and approval automated', async () => {
  const { root, makeRunner } = await setup({ overrides: { critic: { mode: 'off', reason: '초고 속도 우선' }, approve: { mode: 'auto' } } });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: untilDone });
  assert.deepEqual(trail.map(label), ['model:plan', 'model:draft', 'model:extract', 'done']);
  const [receipt] = await receiptsOf(root);
  const critic = receipt.steps.find((s) => s.id === 'critic');
  assert.deepEqual([critic.status, critic.reason, critic.source], ['skipped', '초고 속도 우선', 'work.yaml#overrides.critic']);
  assert.deepEqual(receipt.steps.find((s) => s.id === 'approve').status, 'auto');
});

test('soft findings are shown to the user and never auto-revised', async () => {
  const { root, makeRunner } = await setup();
  const host = createFakeHost({ critic: () => [{ checkId: 'fake.critic', code: 'PACE', message: '전개가 느리다' }] });
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: untilDone });
  const question = trail.find((o) => o.status === 'needs_user').question;
  assert.deepEqual(question.advisories.map((f) => f.code), ['PACE']);
  assert.ok(!host.calls.some((c) => c.purpose === 'revise'));
  assert.deepEqual((await receiptsOf(root))[0].advisories.map((f) => f.code), ['PACE']);
});

test('a user block check triggers a minimal revision that sees only blocking findings', async () => {
  const { root, makeRunner } = await setup({ checks: { 'no-suddenly': { words: ['갑자기'], severity: 'block' } } });
  const host = createFakeHost({
    drafts: { stairwell: '그는 갑자기 나타났다.' },
    revisions: { stairwell: '그는 천천히 나타났다.' },
    critic: () => [{ checkId: 'fake.critic', code: 'PACE', message: '느리다' }],
  });
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: untilDone });
  assert.deepEqual(trail.map(label), ['model:plan', 'model:draft', 'model:extract', 'model:critic', 'model:revise', 'model:extract', 'model:critic', 'user:approve', 'done']);
  const revise = host.calls.find((c) => c.purpose === 'revise');
  assert.deepEqual(revise.payload.blocking.map((f) => f.code), ['USER_PATTERN']);
  assert.equal(revise.payload.advisories, undefined);
  const [receipt] = await receiptsOf(root);
  assert.deepEqual([receipt.attempts, stepStatus(receipt).facts, stepStatus(receipt).revise], [1, 'passed', 'passed']);
});

test('a user block that survives three revisions can be overridden with a reason', async () => {
  const { root, makeRunner } = await setup({ checks: { 'no-suddenly': { words: ['갑자기'], severity: 'block' } } });
  const host = createFakeHost({ drafts: { stairwell: '그는 갑자기 나타났다.' } });
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user' });
  const blocked = trail.at(-1);
  assert.deepEqual([blocked.question.kind, blocked.question.canApprove], ['blocked', true]);
  assert.equal(host.calls.filter((c) => c.purpose === 'revise').length, 3);
  await assert.rejects(makeRunner().decide({ runId: blocked.runId, action: 'approve' }), { code: 'OVERRIDE_REASON_REQUIRED' });
  const done = await makeRunner().decide({ runId: blocked.runId, action: 'approve', reason: '의도한 표현' });
  assert.equal(done.status, 'done');
  const [receipt] = await receiptsOf(root);
  assert.deepEqual([receipt.hard, stepStatus(receipt).revise, receipt.overridden[0].code, receipt.overridden[0].overrideReason], [0, 'overridden', 'USER_PATTERN', '의도한 표현']);
});

test('hard conflicts cannot be approved and are never committed', async () => {
  const { root, makeRunner } = await setup({ fixture: 'serial-2level', seed: true });
  const host = createFakeHost();
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'ep-004' }, until: (o) => o.status === 'needs_user' });
  const blocked = trail.at(-1);
  assert.deepEqual([blocked.question.kind, blocked.question.canApprove], ['blocked', false]);
  assert.deepEqual(host.calls.find((c) => c.purpose === 'revise').payload.blocking.map((f) => f.code), ['DEAD_ON_STAGE']);
  await assert.rejects(makeRunner().decide({ runId: blocked.runId, action: 'approve', reason: '괜찮다' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  await assert.rejects(makeRunner().decide({ runId: blocked.runId, action: 'skip' }), { code: 'SKIP_REASON_REQUIRED' });
  const skipped = await makeRunner().decide({ runId: blocked.runId, action: 'skip', reason: '설정 재검토' });
  assert.equal(skipped.status, 'skipped');
  assert.deepEqual((await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit'), []);
});

test('user rules need a verbatim quote to count', async () => {
  const { makeRunner } = await setup({ checks: { 'no-honorifics': { source: 'checks/no-honorifics.md', severity: 'block' } } });
  const host = createFakeHost({ critic: () => [{ checkId: 'no-honorifics', code: 'HONORIFIC', message: '존댓말', quote: '원고에 없는 문장' }] });
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: untilDone });
  assert.ok(!trail.map(label).includes('model:revise'));
  const critic = host.calls.find((c) => c.stepId === 'critic');
  assert.match(critic.payload.checks.find((c) => c.checkId === 'no-honorifics').instructionText, /존댓말/);
});

test('[final-2] a hard model finding whose quote is not in the draft is recorded as unsupported and neither revises nor blocks', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const pack = { ...fakePack, checks: fakePack.checks.map((c) => (c.id === 'fake.critic' ? { ...c, severity: 'hard', requireQuote: true } : c)) };
  const host = createFakeHost({ critic: () => [{ checkId: 'fake.critic', code: 'X', message: 'm', quote: 'not in the draft at all' }] });
  const trail = await driveToEnd(() => createRunner({ root, packs: new Map([['fake', pack]]) }), host, { start: { node: 'stairwell' }, until: (o) => o.status !== 'needs_model' });
  assert.equal(trail.at(-1).status, 'done');
  assert.ok(host.calls.some((c) => c.stepId === 'critic'));
  assert.ok(!host.calls.some((c) => c.purpose === 'revise'));
  const [receipt] = await receiptsOf(root);
  const critic = receipt.steps.find((s) => s.id === 'critic').checks.find((c) => c.checkId === 'fake.critic');
  assert.deepEqual(critic.unsupported.map((f) => [f.code, f.severity]), [['X', 'hard']]);
  assert.deepEqual(critic.findings, []);
  assert.equal(receipt.hard, 0);
});

test('a model claiming independence is still labelled a same-host review', async () => {
  const { root, makeRunner } = await setup();
  await driveToEnd(makeRunner, createFakeHost({ reviewer: { sameHost: false, independent: true } }), { start: { node: 'stairwell' }, until: untilDone });
  const [receipt] = await receiptsOf(root);
  assert.deepEqual(receipt.steps.find((s) => s.id === 'critic').checks[0].reviewer, { sameHost: true, independent: false });
});

test('answers must match the pending requests exactly', async () => {
  const { makeRunner } = await setup();
  const first = await makeRunner().run({ node: 'stairwell' });
  const [request] = first.requests;
  await assert.rejects(makeRunner().resume({ runId: first.runId, answers: {} }), { code: 'ANSWERS_INCOMPLETE' });
  await assert.rejects(makeRunner().resume({ runId: first.runId, answers: { [request.requestId]: 'p', 'req-ghost': 'x' } }), { code: 'ANSWER_UNKNOWN_REQUEST' });
  await assert.rejects(makeRunner().decide({ runId: first.runId, action: 'approve' }), { code: 'RUN_NOT_AWAITING_USER' });
  await assert.rejects(makeRunner().run({ node: 'market' }), { code: 'RUN_IN_PROGRESS' });
  assert.deepEqual(await makeRunner().run({ node: 'next' }), first);
  const second = await makeRunner().resume({ runId: first.runId, answers: { [request.requestId]: '계획' } });
  await assert.rejects(makeRunner().resume({ runId: first.runId, answers: { [request.requestId]: '계획' } }), { code: 'ANSWERS_INCOMPLETE' });
  assert.equal(second.requests[0].stepId, 'draft');
});

test('tampering with the checked draft in the run file cannot reach a commit', async () => {
  const { root, makeRunner } = await setup();
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user' });
  const { runId } = trail.at(-1);
  const path = createRunStore(root).pathOf(runId);
  const run = JSON.parse(await readFile(path, 'utf8'));
  run.outputs.draft = '검사 뒤에 몰래 바꾼 원고';
  await writeFile(path, JSON.stringify(run));
  const scene = join(root, 'tree/01-book-one/01-the-fall/02-stairwell.md');
  const before = await readFile(scene, 'utf8');
  await assert.rejects(makeRunner().decide({ runId, action: 'approve' }), { code: 'LOCK_HASH_MISMATCH' });
  assert.equal(await readFile(scene, 'utf8'), before);
  assert.deepEqual(await openLedger(root, 'receipts').readAll(), []);
});

test('an entity edit between check and commit forces a re-check and a fresh approval', async () => {
  const { root, makeRunner } = await setup();
  const host = createFakeHost({ drafts: { stairwell: '마라가 계단을 올랐다.' } });
  const first = await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user' });
  const mara = join(root, 'entities/character/mara.md');
  await writeFile(mara, `${await readFile(mara, 'utf8')}새 설정.\n`);
  const next = await makeRunner().decide({ runId: first.at(-1).runId, action: 'approve' });
  assert.equal(label(next), 'model:extract');
  const rest = await driveToEnd(makeRunner, host, { from: next, until: untilDone });
  assert.deepEqual(rest.map(label), ['model:extract', 'model:critic', 'user:approve', 'done']);
  const stale = findStale({
    work: await openWork(root),
    receiptRecords: await openLedger(root, 'receipts').readAll(),
    events: activeEvents(await openLedger(root, 'events').readAll()),
  });
  assert.deepEqual(stale, [], 'the receipt must reference the edited entity, not the old one');
});

test('a tampered ledger stops the runner', async () => {
  const { root, makeRunner } = await setup({ overrides: { approve: { mode: 'auto' } } });
  await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: untilDone });
  const path = openLedger(root, 'receipts').path;
  const lines = (await readFile(path, 'utf8')).trim().split('\n');
  lines[0] = lines[0].replace('"stairwell"', '"market"');
  await writeFile(path, `${lines.join('\n')}\n`);
  await assert.rejects(makeRunner().run({ node: 'next' }), { code: 'LEDGER_TAMPERED' });
});
