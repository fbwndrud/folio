import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { withWorkLock } from '../../core/run/work-lock.js';
import { TREE_DIR } from '../../core/store/tree.js';
import { workStatus } from '../../core/status.js';
import { fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { bodyOf, committedWith, editYaml, rechecksOf } from '../support/recheck.js';

const RECHECK = { node: 'next-recheck', mode: 'recheck' };
const status = (root) => workStatus(root, { packs: fakePacks() });
const enableAll = (root) => editYaml(root, (config) => { config.checks = {}; });

test('a backfill run checks the committed text with a newly enabled check and never changes it', async () => {
  const { root, makeRunner } = await committedWith({ checks: { 'fake.critic': { mode: 'off' } } });
  const before = await bodyOf(root, 'stairwell');
  await enableAll(root);
  const extract = await makeRunner().run(RECHECK);
  assert.deepEqual([label(extract), extract.nodeId, extract.requests[0].payload.draft], ['model:extract', 'stairwell', before]);
  const first = (await driveToEnd(makeRunner, createFakeHost(), { from: extract, until: (o) => label(o) === 'model:critic' })).at(-1);
  assert.equal(first.nodeId, 'stairwell');
  assert.equal(first.requests[0].payload.mode, 'recheck');
  assert.equal(first.requests[0].payload.draft, before);
  const trail = await driveToEnd(makeRunner, createFakeHost(), { from: first, until: (o) => o.status === 'done' });
  const done = trail.at(-1);
  assert.deepEqual([done.status, done.mode, done.nodeId], ['done', 'recheck', 'stairwell']);
  assert.equal(await bodyOf(root, 'stairwell'), before);
  const [recheck] = await rechecksOf(root);
  const { applied } = await openWorkspace(root, { packs: fakePacks() });
  assert.deepEqual([recheck.recheckId, recheck.runId, recheck.committedHash.startsWith('sha256:')], [done.recheckId, done.runId, true]);
  assert.deepEqual(recheck.appliedChecks, applied.leaf);
  assert.deepEqual(recheck.steps.map((s) => s.id), ['facts', 'critic']);
  const decisions = (await openLedger(root, 'decisions').readAll()).filter((r) => r.runId === done.runId);
  assert.deepEqual(decisions.map((r) => [r.type, r.stepId, r.draftHash === recheck.committedHash]), [['check_result', 'facts', true], ['check_result', 'critic', true]]);
  const s = await status(root);
  assert.deepEqual([s.recheck, s.stale, s.flagged, s.activeRun], [[], [], [], null]);
  assert.deepEqual(await makeRunner().run(RECHECK), { status: 'idle' });
});

test('a hard finding on committed text flags the node; it cannot be approved and the text is left alone', async () => {
  const { root, makeRunner } = await committedWith({ fixture: 'serial-2level', seed: true, node: 'ep-004', checks: { 'fake.dead-on-stage': { mode: 'off' } } });
  const before = await bodyOf(root, 'ep-004');
  await enableAll(root);
  assert.deepEqual((await status(root)).recheck.find((r) => r.nodeId === 'ep-004').checks, ['fake.dead-on-stage']);
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'ep-004', mode: 'recheck' }, until: (o) => o.status === 'needs_user' });
  const flagged = trail.at(-1);
  assert.deepEqual([flagged.question.kind, flagged.question.canApprove, flagged.question.blocking.map((f) => f.code)], ['flagged', false, ['DEAD_ON_STAGE']]);
  await assert.rejects(makeRunner().decide({ runId: flagged.runId, action: 'approve', reason: '괜찮다' }), { code: 'RUN_NOT_AWAITING_USER' });
  assert.equal(await bodyOf(root, 'ep-004'), before);
  const s = await status(root);
  assert.deepEqual(s.flagged.map((f) => [f.nodeId, f.findings.map((x) => x.code)]), [['ep-004', ['DEAD_ON_STAGE']]]);
  assert.ok(!s.recheck.some((r) => r.nodeId === 'ep-004'), 'the check was applied, so no backfill is pending');
  assert.equal(s.activeRun, null, 'a flagged recheck does not hold the one open run');
  assert.equal((await rechecksOf(root)).at(-1).hard, 1);
});

test('a block finding on committed text can be acknowledged with a reason; revision is not offered', async () => {
  const draft = '그는 갑자기 나타났다.';
  const { root, makeRunner } = await committedWith({ drafts: { stairwell: draft }, checks: { 'no-suddenly': { words: ['갑자기'], severity: 'block', mode: 'off' } } });
  await editYaml(root, (config) => { config.checks = { 'no-suddenly': { words: ['갑자기'], severity: 'block' } }; });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: RECHECK, until: (o) => o.status === 'needs_user' });
  const asked = trail.at(-1);
  assert.deepEqual([asked.question.kind, asked.question.canApprove, asked.question.blocking.map((f) => f.code)], ['flagged', true, ['USER_PATTERN']]);
  assert.equal((await status(root)).activeRun.runId, asked.runId);
  await assert.rejects(makeRunner().decide({ runId: asked.runId, action: 'approve' }), { code: 'OVERRIDE_REASON_REQUIRED' });
  await assert.rejects(makeRunner().decide({ runId: asked.runId, action: 'request_revision', feedback: '고쳐줘' }), { code: 'REVISION_UNAVAILABLE' });
  const done = await makeRunner().decide({ runId: asked.runId, action: 'approve', reason: '의도한 표현' });
  assert.deepEqual([done.status, done.mode], ['done', 'recheck']);
  const [recheck] = await rechecksOf(root);
  assert.deepEqual(recheck.overridden.map((f) => [f.checkId, f.code, f.source, f.overrideReason]), [['no-suddenly', 'USER_PATTERN', 'user', '의도한 표현']]);
  assert.ok((await openLedger(root, 'decisions').readAll()).some((r) => r.type === 'override' && r.runId === asked.runId));
  assert.equal(await bodyOf(root, 'stairwell'), draft);
  assert.deepEqual((await status(root)).flagged, []);
});

test('recheck runs share the one-open-run rule and the work lock', async () => {
  const { root, makeRunner } = await committedWith({ checks: { 'fake.critic': { mode: 'off' } } });
  await enableAll(root);
  const open = await makeRunner().run(RECHECK);
  await assert.rejects(makeRunner().run({ node: 'rooftop-scene' }), { code: 'RUN_IN_PROGRESS' });
  await assert.rejects(makeRunner().run({ node: 'stairwell' }), { code: 'RUN_IN_PROGRESS' });
  assert.deepEqual(await makeRunner().run({ node: 'next' }), open);
  assert.deepEqual(await makeRunner().run(RECHECK), open);
  await assert.rejects(withWorkLock(root, () => makeRunner().run(RECHECK)), { code: 'WORK_LOCK_REENTRANT' });
  const other = await committedWith({ checks: { 'fake.critic': { mode: 'off' } } });
  await enableAll(other.root);
  const normal = await other.makeRunner().run({ node: 'rooftop-scene' });
  assert.equal(normal.status, 'needs_model');
  await assert.rejects(other.makeRunner().run({ node: 'stairwell', mode: 'recheck' }), { code: 'RUN_IN_PROGRESS' });
  await assert.rejects(other.makeRunner().run(RECHECK), { code: 'RUN_IN_PROGRESS' });
});

test('a recheck needs committed, unedited text and a known mode', async () => {
  const { root, makeRunner } = await committedWith({ checks: { 'fake.critic': { mode: 'off' } } });
  await enableAll(root);
  await assert.rejects(makeRunner().run({ node: 'rooftop-scene', mode: 'recheck' }), { code: 'RECHECK_NOT_COMMITTED' });
  await assert.rejects(makeRunner().run({ node: 'stairwell', mode: 'rewrite' }), { code: 'RUN_MODE_INVALID' });
  await assert.rejects(makeRunner().run({ node: 'next-recheck' }), { code: 'RUN_MODE_INVALID' });
  const node = (await openWork(root)).tree.nodes.get('stairwell');
  const path = join(root, TREE_DIR, node.path);
  await writeFile(path, (await readFile(path, 'utf8')).replace(node.body, `${node.body} 손으로 고침`));
  await assert.rejects(makeRunner().run({ node: 'stairwell', mode: 'recheck' }), (e) => e.code === 'RECHECK_TEXT_DRIFTED' && /mode: 'recommit'/.test(e.message));
  assert.deepEqual(await rechecksOf(root), []);
});
