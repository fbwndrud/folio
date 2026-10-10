import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { withWorkLock } from '../../core/run/work-lock.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, seedEvents, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { fakePack } from '../support/fake-pack.js';

async function setup({ fixture = 'novel-3level', seed = false, checks, overrides } = {}) {
  const root = await copyFixture(fixture);
  if (seed) await seedEvents(root, fixture);
  await useFakePack(root, { checks, overrides });
  return { root, makeRunner: (extra = {}) => createRunner({ root, packs: fakePacks(), ...extra }) };
}
const untilDone = (o) => o.status === 'done';
const untilUser = (o) => o.status === 'needs_user';
const records = async (root) => openLedger(root, 'receipts').readAll();
const commitsOf = async (root) => (await records(root)).filter((r) => r.type === 'commit');
const receiptsOf = async (root) => (await records(root)).filter((r) => r.type === 'receipt');
const editRun = async (root, runId, fn) => {
  const path = createRunStore(root).pathOf(runId);
  const run = JSON.parse(await readFile(path, 'utf8'));
  fn(run);
  await writeFile(path, JSON.stringify(run));
};
const editYaml = async (root, fn) => {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  fn(config);
  await writeFile(path, stringifyYaml(config));
};
const SUDDENLY = { 'no-suddenly': { words: ['갑자기'], severity: 'block' } };

test('a block finding from a check placed after the gate needs a reasoned override before commit', async () => {
  const { root, makeRunner } = await setup({ checks: { 'no-x': { rule: 'no X', severity: 'block' } }, overrides: { critic: { after: 'approve' } } });
  const host = createFakeHost({ drafts: { stairwell: '그는 X를 했다.' }, critic: () => [{ checkId: 'no-x', code: 'X', message: 'X used', quote: '그는 X를 했다' }] });
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: (o) => untilUser(o) && o.question.kind === 'blocked' });
  const blocked = trail.at(-1);
  assert.deepEqual([blocked.question.stepId, blocked.question.canApprove, blocked.question.blocking.map((f) => f.code)], ['commit', true, ['X']]);
  await assert.rejects(makeRunner().decide({ runId: blocked.runId, action: 'approve' }), { code: 'OVERRIDE_REASON_REQUIRED' });
  const done = await makeRunner().decide({ runId: blocked.runId, action: 'approve', reason: '의도한 표현' });
  assert.equal(done.status, 'done');
  const [receipt] = await receiptsOf(root);
  assert.deepEqual(receipt.overridden.map((f) => [f.checkId, f.code, f.source, f.overrideReason]), [['no-x', 'X', 'user', '의도한 표현']]);
});

test('a custom late check step cannot slip a block finding past the user', async () => {
  const { root, makeRunner } = await setup({
    checks: { 'no-suddenly': { words: ['갑자기'], severity: 'block', stage: 'late' } },
    overrides: { late: { kind: 'check', tier: 'deterministic', after: 'approve' } },
  });
  const host = createFakeHost({ drafts: { stairwell: '그는 갑자기 나타났다.' } });
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: (o) => untilUser(o) && o.question.kind === 'blocked' });
  assert.deepEqual(trail.at(-1).question.blocking.map((f) => f.code), ['USER_PATTERN']);
  assert.deepEqual(await commitsOf(root), []);
});

test('the gate question lists current blocking findings and a hard one can never be approved at commit', async () => {
  const { root, makeRunner } = await setup({ fixture: 'serial-2level', seed: true, overrides: { revise: { after: 'plan' } } });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'ep-004' }, until: (o) => untilUser(o) && o.question.kind === 'blocked' });
  const gate = trail.find((o) => untilUser(o) && o.question.kind === 'approve');
  assert.deepEqual(gate.question.blocking.map((f) => f.code), ['DEAD_ON_STAGE']);
  const blocked = trail.at(-1);
  assert.deepEqual([blocked.question.stepId, blocked.question.canApprove], ['commit', false]);
  await assert.rejects(makeRunner().decide({ runId: blocked.runId, action: 'approve', reason: '괜찮다' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  assert.deepEqual(await commitsOf(root), []);
});

test('[final-3] work.yaml cannot demote a hard check, nor switch it off under includeAllHardChecks, so serial ep-004 still cannot commit', async () => {
  const strict = async (root) => editYaml(root, (config) => { config.options = { includeAllHardChecks: true }; });
  const attempts = [
    [{ checks: { 'fake.dead-on-stage': { severity: 'advisory' } } }, 'HARD_CHECK_SEVERITY_LOCKED', false],
    [{ checks: { 'fake.dead-on-stage': { severity: 'advisory' } } }, 'HARD_CHECK_SEVERITY_LOCKED', true],
    [{ checks: { 'fake.dead-on-stage': { mode: 'off' } } }, 'HARD_CHECK_OVERRIDE', true],
  ];
  for (const [attempt, code, includeAll] of attempts) {
    const { root, makeRunner } = await setup({ fixture: 'serial-2level', seed: true, overrides: { approve: { mode: 'auto' } }, ...attempt });
    if (includeAll) await strict(root);
    await assert.rejects(makeRunner().run({ node: 'ep-004' }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === code));
    assert.deepEqual(await commitsOf(root), []);
  }
  const hardCritic = { ...fakePack, checks: fakePack.checks.map((c) => (c.id === 'fake.critic' ? { ...c, severity: 'hard' } : c)) };
  const { root } = await setup({ fixture: 'serial-2level', seed: true, overrides: { critic: { mode: 'off', reason: '빠르게' } } });
  await strict(root);
  await assert.rejects(createRunner({ root, packs: new Map([['fake', hardCritic]]) }).run({ node: 'ep-004' }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'HARD_CHECK_OVERRIDE' && x.stepId === 'critic'));
  assert.deepEqual(await commitsOf(root), []);
});

test('a tampered canApprove flag cannot approve a hard conflict', async () => {
  const { root, makeRunner } = await setup({ fixture: 'serial-2level', seed: true });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'ep-004' }, until: untilUser });
  const { runId } = trail.at(-1);
  await editRun(root, runId, (run) => { run.pending.question.canApprove = true; });
  await assert.rejects(makeRunner().decide({ runId, action: 'approve', reason: 'x' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  assert.deepEqual(await commitsOf(root), []);
});

test('hard findings stripped from the run file are found again by the final deterministic re-check', async () => {
  const { root, makeRunner } = await setup({ fixture: 'serial-2level', seed: true });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'ep-004' }, until: untilUser });
  const { runId } = trail.at(-1);
  await editRun(root, runId, (run) => {
    run.pending.question.canApprove = true;
    run.pending.question.blocking = [];
    for (const result of Object.values(run.results)) for (const check of result.checks ?? []) { check.findings = []; check.status = 'passed'; }
    run.results.facts.status = 'passed';
  });
  const outcome = await makeRunner().decide({ runId, action: 'approve', reason: 'x' });
  assert.deepEqual([outcome.status, outcome.question.kind, outcome.question.canApprove], ['needs_user', 'blocked', false]);
  assert.deepEqual(outcome.question.blocking.map((f) => f.code), ['DEAD_ON_STAGE']);
  const run = await createRunStore(root).load(runId);
  assert.deepEqual([run.state, run.receipt, run.history.at(-1).event], ['awaiting_user', null, 'commit_refused']);
  assert.deepEqual(await records(root), []);
  assert.equal((await makeRunner().decide({ runId, action: 'skip', reason: '재검토' })).status, 'skipped');
});

test('a refused commit is not stuck: the run re-checks instead of staying in committing', async () => {
  const { root, makeRunner } = await setup();
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: untilUser });
  const { runId } = trail.at(-1);
  await editRun(root, runId, (run) => { run.outputs.draft = '몰래 바꾼 원고'; });
  await assert.rejects(makeRunner().decide({ runId, action: 'approve' }), { code: 'LOCK_HASH_MISMATCH' });
  const run = await createRunStore(root).load(runId);
  assert.deepEqual([run.state, run.receipt, run.history.at(-1)?.event, run.history.at(-1)?.code], ['active', null, 'commit_refused', 'LOCK_HASH_MISMATCH']);
  const next = await makeRunner().run({ node: 'next' });
  assert.equal(label(next), 'model:extract');
  const rest = await driveToEnd(makeRunner, createFakeHost(), { from: next, until: untilDone });
  assert.deepEqual(rest.map(label), ['model:extract', 'model:critic', 'user:approve', 'done']);
  assert.equal((await openWork(root)).tree.nodes.get('stairwell').body, '몰래 바꾼 원고', 'the new text was checked and approved again');
});

test('an unrecorded committing receipt without a durable baseline is refused and can be skipped', async () => {
  const { root, makeRunner } = await setup();
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: untilUser });
  const { runId } = trail.at(-1);
  // 사용자는 실제로 승인했다(decisions 에 기록됨). 실행 파일 저장 전에 죽은 뒤, 실행 파일에 가짜 영수증이 끼어든다.
  const crashAfterApproval = { afterDecision: (r) => { if (r.type === 'approval') throw new Error('crash'); } };
  await assert.rejects(makeRunner({ hooks: crashAfterApproval }).decide({ runId, action: 'approve' }), /crash/);
  await editRun(root, runId, (run) => {
    run.state = 'committing'; run.pending = null; run.cursor = 7;
    run.approval = { stepId: 'approve', draftHash: run.draftHash };
    run.results.approve = { status: 'approved', source: 'user' };
    run.receipt = { receiptId: 'rcpt-forged', hard: 0 };
  });
  await assert.rejects(makeRunner().run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
  assert.deepEqual(await receiptsOf(root), []);
  assert.equal((await makeRunner().decide({ runId, action: 'skip', reason: '기준 기록이 없는 실행 폐기' })).status, 'skipped');
});

test('a crash after the receipt is recorded still resumes the same commit', async () => {
  const { root, makeRunner } = await setup({ overrides: { approve: { mode: 'auto' } } });
  const crashing = () => makeRunner({ hooks: { afterBodyWrite: () => { throw new Error('crash'); } } });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'critic' });
  const last = trail.at(-1);
  await assert.rejects(crashing().resume({ runId: last.runId, answers: createFakeHost().answer(last) }), /crash/);
  assert.equal((await createRunStore(root).load(last.runId)).state, 'committing');
  assert.equal((await makeRunner().run({ node: 'next' })).status, 'done');
  assert.deepEqual((await records(root)).map((r) => r.type), ['receipt', 'commit']);
});

test('concurrent decisions and runs are serialised', async () => {
  const { root, makeRunner } = await setup();
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: untilUser });
  const { runId } = trail.at(-1);
  const results = await Promise.allSettled([makeRunner().decide({ runId, action: 'approve' }), makeRunner().decide({ runId, action: 'approve' })]);
  assert.deepEqual(results.map((r) => (r.status === 'fulfilled' ? r.value.status : r.reason.code)).sort(), ['RUN_NOT_AWAITING_USER', 'done']);
  assert.equal((await commitsOf(root)).length, 1);

  const other = await setup();
  const runs = await Promise.allSettled([other.makeRunner().run({ node: 'stairwell' }), other.makeRunner().run({ node: 'market' })]);
  assert.deepEqual(runs.map((r) => (r.status === 'fulfilled' ? r.value.status : r.reason.code)).sort(), ['RUN_IN_PROGRESS', 'needs_model']);
});

test('a live cross-process lock refuses even when old, and a dead one is taken over', async () => {
  const { root, makeRunner } = await setup();
  const dir = join(root, '.folio', 'runs');
  await mkdir(dir, { recursive: true });
  const lock = join(dir, '.lock');
  await writeFile(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  await assert.rejects(makeRunner().run({ node: 'stairwell' }), { code: 'WORK_LOCKED' });
  const deadPid = spawnSync(process.execPath, ['-e', '']).pid;
  await writeFile(lock, JSON.stringify({ pid: deadPid, at: new Date().toISOString() }));
  assert.equal((await makeRunner().run({ node: 'stairwell' })).status, 'needs_model');
  await writeFile(lock, JSON.stringify({ pid: process.pid, at: new Date(Date.now() - 11 * 60 * 1000).toISOString() }));
  await assert.rejects(makeRunner().run({ node: 'next' }), { code: 'WORK_LOCKED' });
  await writeFile(lock, JSON.stringify({ pid: deadPid, at: new Date(Date.now() - 11 * 60 * 1000).toISOString() }));
  assert.equal((await makeRunner().run({ node: 'next' })).status, 'needs_model');
  await assert.rejects(readFile(lock, 'utf8'), { code: 'ENOENT' }, 'the lock is released after each call');
});

test('adding a check after the check step forces a re-check', async () => {
  const { root, makeRunner } = await setup();
  const host = createFakeHost({ drafts: { stairwell: '그는 갑자기 나타났다.' }, revisions: { stairwell: '그는 천천히 나타났다.' } });
  const trail = await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: untilUser });
  await editYaml(root, (config) => { config.checks = SUDDENLY; });
  const next = await makeRunner().decide({ runId: trail.at(-1).runId, action: 'approve' });
  assert.equal(label(next), 'model:extract');
  await driveToEnd(makeRunner, host, { from: next, until: untilDone });
  assert.ok(host.calls.some((c) => c.purpose === 'revise'));
  const [receipt] = await receiptsOf(root);
  assert.ok(receipt.steps.find((s) => s.id === 'facts').checks.some((c) => c.checkId === 'no-suddenly'));
});

test('a corrupt run file is reported, not fatal', async () => {
  const { root, makeRunner } = await setup();
  const first = await makeRunner().run({ node: 'stairwell' });
  await writeFile(join(root, '.folio', 'runs', 'run-broken.json'), '{ not json');
  const list = await createRunStore(root).list();
  assert.deepEqual(list.map((r) => r.error ?? r.runId), [first.runId, 'RUN_FILE_CORRUPT']);
  assert.equal(list[1].runId, 'run-broken');
  assert.deepEqual(await makeRunner().run({ node: 'next' }), first);
});

test('extraction gives up after three unreadable answers', async () => {
  const { makeRunner } = await setup();
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'extract' });
  let outcome = trail.at(-1);
  for (let i = 0; i < 2; i += 1) {
    outcome = await makeRunner().resume({ runId: outcome.runId, answers: { [outcome.requests[0].requestId]: 'not json' } });
    assert.equal(label(outcome), 'model:extract');
  }
  outcome = await makeRunner().resume({ runId: outcome.runId, answers: { [outcome.requests[0].requestId]: 'not json' } });
  assert.deepEqual([outcome.status, outcome.question.kind, outcome.question.code, outcome.question.canApprove], ['needs_user', 'blocked', 'EXTRACT_FAILED', false]);
  await assert.rejects(makeRunner().decide({ runId: outcome.runId, action: 'approve', reason: 'x' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
});

test('re-entering the work lock from inside a locked call fails fast instead of hanging', async () => {
  const { root, makeRunner } = await setup({ overrides: { approve: { mode: 'auto' } } });
  await assert.rejects(withWorkLock(root, () => withWorkLock(root, () => 'inner')), { code: 'WORK_LOCK_REENTRANT' });
  const reentering = () => makeRunner({ hooks: { afterBodyWrite: () => makeRunner().run({ node: 'next' }) } });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'critic' });
  const last = trail.at(-1);
  await assert.rejects(reentering().resume({ runId: last.runId, answers: createFakeHost().answer(last) }), { code: 'WORK_LOCK_REENTRANT' });
  assert.equal((await makeRunner().run({ node: 'next' })).status, 'done');
});

test('the check digest ignores check order and branch-only checks but sees changed words', async () => {
  const { root, makeRunner } = await setup({ checks: { a: { words: ['없는말1'], severity: 'block' }, b: { words: ['없는말2'], severity: 'block' } } });
  const host = createFakeHost();
  const first = (await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: untilUser })).at(-1);
  await editYaml(root, (config) => {
    config.checks = { b: config.checks.b, a: config.checks.a, c: { rule: 'x', severity: 'advisory', stage: 'fit' } };
  });
  assert.equal((await makeRunner().decide({ runId: first.runId, action: 'approve' })).status, 'done');
  const second = (await driveToEnd(makeRunner, host, { start: { node: 'market' }, until: untilUser })).at(-1);
  await editYaml(root, (config) => { config.checks.a.words = ['없는말3']; });
  assert.equal(label(await makeRunner().decide({ runId: second.runId, action: 'approve' })), 'model:extract');
});

test('an override does not cover a new block finding with the same code but another quote', async () => {
  const { root, makeRunner } = await setup({ checks: { r: { rule: 'no bad', severity: 'block' } } });
  let calls = 0;
  const host = createFakeHost({
    drafts: { stairwell: '마라가 왔다. A문장. B문장.' },
    critic: () => (calls++ < 4 ? [{ checkId: 'r', code: 'BAD', message: 'A', quote: 'A문장' }] : [{ checkId: 'r', code: 'BAD', message: 'B', quote: 'B문장' }]),
  });
  const blocked = (await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: untilUser })).at(-1);
  const mara = join(root, 'entities/character/mara.md');
  await writeFile(mara, `${await readFile(mara, 'utf8')}x\n`);
  const next = await makeRunner().decide({ runId: blocked.runId, action: 'approve', reason: 'A는 의도' });
  const rest = await driveToEnd(makeRunner, host, { from: next, until: (o) => untilUser(o) || untilDone(o) });
  assert.deepEqual([label(rest.at(-1)), rest.at(-1).question.blocking.map((f) => f.quote)], ['user:blocked', ['B문장']]);
  assert.deepEqual(await commitsOf(root), []);
});

test('a recorded receipt refused for a changed pipeline explains how to finish', async () => {
  const { root, makeRunner } = await setup({ overrides: { approve: { mode: 'auto' } } });
  const crashing = () => makeRunner({ hooks: { afterBodyWrite: () => { throw new Error('crash'); } } });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'critic' });
  const last = trail.at(-1);
  await assert.rejects(crashing().resume({ runId: last.runId, answers: createFakeHost().answer(last) }), /crash/);
  const yaml = await readFile(join(root, 'work.yaml'), 'utf8');
  await editYaml(root, (config) => { config.overrides.critic = { prompt: 'harsher' }; });
  await assert.rejects(makeRunner().run({ node: 'next' }), (error) => error.code === 'LOCK_PIPELINE_MISMATCH'
    && error.details.hint === 'work.yaml or a pack changed after the receipt was recorded; restore work.yaml to finish this commit, or abandon this run with folio decide skip');
  await writeFile(join(root, 'work.yaml'), yaml);
  assert.equal((await makeRunner().run({ node: 'next' })).status, 'done');
});
