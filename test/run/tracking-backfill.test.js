import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { sha256 } from '../../core/util/hash.js';
import { fakePacks, copyFixture, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { committedWith, editYaml } from '../support/recheck.js';
import { trackingPlan, appendPlan } from '../support/tracking.js';

const TEXT = '파란 열쇠는 문 옆에 있다.';
const NODE = 'stairwell';
const start = { node: NODE, mode: 'tracking-backfill' };
async function setup({ grant = true, empty = false, hooks = {} } = {}) {
  const { root } = await committedWith({ drafts: { '*': TEXT } });
  await appendPlan(root, normalizePlan(trackingPlan({ delegation: grant ? { addSubjects: true, addObservations: true, backfill: true } : {} })));
  const evidence = { nodeId: NODE, textHash: sha256(TEXT), quote: '파란 열쇠' };
  const host = createFakeHost({ events: { '*': (p) => ({ events: [], tracking: {
    planRev: p.tracking.plan.rev, discoveries: { subjects: empty ? [] : [{ id: 'key', kind: 'object', name: '열쇠', aliases: [], body: '', data: {}, evidence }], criteria: [] },
    observations: empty ? [] : [{ subjectId: 'key', criterionId: 'owner', value: '문', basis: 'explicit', evidence }], checked: ['owner'],
  } }) } });
  const make = (extra = {}) => createRunner({ root, packs: fakePacks(), hooks: { ...hooks, ...extra } });
  return { root, host, make };
}
const receipts = async (root) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'tracking-backfill');
const finish = async (make, host, from = null) => (await driveToEnd(make, host, { start, from, until: (o) => ['done', 'flagged'].includes(o.status) || o.status === 'needs_user' && o.question.kind === 'flagged' })).at(-1);
const bytes = async (root, name) => readFile(join(root, '.folio', 'ledger', `${name}.jsonl`), 'utf8').catch((e) => e.code === 'ENOENT' ? null : Promise.reject(e));

test('backfill requires a committed target and explicit node', async () => {
  const root = await copyFixture('novel-3level'); await useFakePack(root);
  await appendPlan(root, normalizePlan(trackingPlan()));
  const runner = createRunner({ root, packs: fakePacks() });
  await assert.rejects(runner.run(start), { code: 'TRACKING_NOT_COMMITTED' });
  await assert.rejects(runner.run({ mode: 'tracking-backfill' }), { code: 'RUN_MODE_INVALID' });
});

test('backfill dispatch reconnects without generating or rewriting prose and preserves legacy ledgers', async () => {
  const { root, host, make } = await setup();
  const before = await Promise.all(['events', 'occurrences', 'evidence'].map((name) => bytes(root, name)));
  const outcome = await make().run(start);
  assert.equal(outcome.status, 'needs_model');
  assert.equal(outcome.requests[0].payload.node.body, TEXT);
  assert.equal(outcome.requests[0].payload.produces, 'events');
  await assert.rejects(make().run({ node: NODE }), { code: 'RUN_IN_PROGRESS' });
  assert.deepEqual(await make().run(start), outcome);
  const done = await finish(make, host, outcome);
  assert.equal(done.mode, 'tracking-backfill');
  assert.equal((await openWork(root)).tree.nodes.get(NODE).body, TEXT);
  assert.deepEqual(await Promise.all(['events', 'occurrences', 'evidence'].map((name) => bytes(root, name))), before);
  assert.equal((await openWork(root)).tracking.observations.length, 1);
  assert.equal(host.calls.some((c) => c.purpose === 'revise' || ['plan', 'draft'].includes(c.payload.produces)), false);
  const receipt = (await receipts(root))[0];
  const commit = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit').at(-1);
  assert.equal(receipt.commitReceiptId, commit.receiptId);
  assert.equal(receipt.trackingBatch.authority.source, 'host');
});

test('missing grants require actual metadata approval and revision re-extracts only', async () => {
  const { root, host, make } = await setup({ grant: false });
  const gate = (await driveToEnd(make, host, { start, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.equal(gate.question.kind, 'tracking_metadata');
  const revised = await make().decide({ runId: gate.runId, action: 'request_revision', feedback: '관찰을 다시 확인' });
  assert.equal(revised.requests[0].payload.produces, 'events');
  assert.equal(revised.requests[0].payload.feedback, '관찰을 다시 확인');
  assert.equal(revised.requests[0].payload.node.body, TEXT);
  const next = (await driveToEnd(make, host, { from: revised, until: (o) => o.status === 'needs_user' })).at(-1);
  const done = await make().decide({ runId: next.runId, action: 'approve' });
  assert.equal(done.status, 'done');
  const receipt = (await receipts(root))[0];
  const authority = receipt.trackingBatch.authority;
  const decision = (await openLedger(root, 'decisions').readAll()).find((r) => r.decisionId === authority.decisionId);
  assert.equal(authority.source, 'user'); assert.equal(decision.source, 'user'); assert.equal(decision.action, 'approve');
  assert.equal(decision.batchDigest, receipt.batchDigest);
  assert.equal((await openWork(root)).tracking.plan.delegation.backfill, false);
  const stored = await createRunStore(root).load(done.runId);
  assert.equal(stored.outputs.tracking.staged, true);
  assert.equal(Object.hasOwn(stored.outputs.tracking, 'authority'), false);
});

for (const boundary of ['afterReceiptWrite', 'afterTrackingWrite']) test(`backfill recovers durable records after ${boundary}, including feature off`, async () => {
  const { root, host, make } = await setup();
  await assert.rejects(finish(() => make({ [boundary]() { throw Error('synthetic crash'); } }), host), /synthetic crash/);
  assert.equal((await openWork(root)).tracking.observations.length, boundary === 'afterTrackingWrite' ? 1 : 0);
  const store = createRunStore(root); const run = (await store.list()).find((r) => r.mode === start.mode);
  delete run.outputs.tracking; run.receipt = { receiptId: 'forged' }; await store.save(run);
  await editYaml(root, (c) => { c.features = { tracking: false }; });
  assert.equal((await make().run(start)).status, 'done');
  assert.equal((await receipts(root)).length, 1);
  assert.equal((await openWork(root)).tracking.observations.length, 1);
  await assert.rejects(make().run(start), { code: 'FEATURE_DISABLED' });
});

test('same committed text and criteria reuse receipt and batch; checked-empty is durable', async () => {
  const { root, host, make } = await setup({ empty: true });
  const first = await finish(make, host); const second = await finish(make, host);
  assert.equal(second.receiptId, first.receiptId);
  assert.equal((await receipts(root)).length, 1);
  const work = await openWork(root);
  assert.equal(work.tracking.batches.length, 1);
  assert.deepEqual(work.tracking.batches[0].checked, ['owner']);
  assert.deepEqual(work.tracking.observations, []);
});

for (const boundary of ['start', 'resume', 'write']) test(`backfill refuses original hash drift at ${boundary}`, async () => {
  const { root, host, make } = await setup({ grant: false });
  const initial = boundary === 'start' ? null : await make().run(start);
  const gate = boundary === 'write' ? (await driveToEnd(make, host, { from: initial, until: (o) => o.status === 'needs_user' })).at(-1) : null;
  const work = await openWork(root); await updateNode(root, work.tree.nodes.get(NODE), { body: '손수정한 합성 원문' });
  const action = boundary === 'start' ? make().run(start) : boundary === 'resume' ? make().resume({ runId: initial.runId, answers: host.answer(initial) }) : make().decide({ runId: gate.runId, action: 'approve' });
  await assert.rejects(action, { code: 'TRACKING_TEXT_DRIFTED' });
  assert.equal((await receipts(root)).length, 0);
});

test('unreadable extraction stops at MAX_ANSWER_TRIES without activation', async () => {
  const { root, make } = await setup();
  let outcome = await make().run(start);
  for (let attempt = 0; attempt < 3; attempt += 1) outcome = await make().resume({ runId: outcome.runId,
    answers: Object.fromEntries(outcome.requests.map((r) => [r.requestId, 'invalid-json'])) });
  assert.equal(outcome.status, 'needs_user'); assert.equal(outcome.question.kind, 'blocked');
  assert.equal(outcome.question.canApprove, false);
  await assert.rejects(make().decide({ runId: outcome.runId, action: 'approve' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  assert.equal((await receipts(root)).length, 0);
});

test('plan changes reject pending answers and re-extract under the current plan', async () => {
  const { root, host, make } = await setup(); const outcome = await make().run(start);
  const { grantId: _grant, ...plan } = (await openWork(root)).tracking.plan;
  await appendPlan(root, { ...plan, version: 2 });
  await assert.rejects(make().resume({ runId: outcome.runId, answers: host.answer(outcome) }), { code: 'ANSWER_STALE' });
  const next = await make().run(start); assert.notEqual(next.requests[0].requestId, outcome.requests[0].requestId);
  assert.equal(next.requests[0].payload.tracking.plan.version, 2);
});

test('recorded backfill refuses unrelated grant recovery and permits skip', async () => {
  const { root, host, make } = await setup();
  await assert.rejects(finish(() => make({ afterReceiptWrite() { throw Error('crash'); } }), host), /crash/);
  const { grantId: _grant, ...plan } = (await openWork(root)).tracking.plan;
  await appendPlan(root, { ...plan, version: 2 });
  await assert.rejects(make().run(start), { code: 'LOCK_TRACKING_PLAN_CHANGED' });
  const run = (await createRunStore(root).list()).find((r) => r.mode === start.mode);
  assert.equal((await make().decide({ runId: run.runId, action: 'skip', reason: '별도 계획 변경' })).status, 'skipped');
  assert.equal((await openWork(root)).tracking.observations.length, 0);
});

test('backfill receipt without a candidate is rejected even with tracking disabled', async () => {
  const { root, host, make } = await setup(); await finish(make, host);
  const receipt = (await receipts(root))[0];
  const { seq: _seq, hash: _hash, prev: _prev, at: _at, trackingBatch: _batch, ...forged } = receipt;
  await openLedger(root, 'receipts').append({ ...forged, receiptId: 'missing-candidate', runId: 'run-missing-candidate' });
  await editYaml(root, (c) => { c.features = { tracking: false }; });
  await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});

test('receipt+batch activation cannot be forged by reusing a metadata decision', async () => {
  const { root, host, make } = await setup({ grant: false }); await finish(make, host);
  const receipt = (await receipts(root))[0];
  const { seq: _seq, hash: _hash, prev: _prev, at: _at, ...forged } = receipt;
  const next = { ...forged, receiptId: 'forged-user', runId: 'run-forged-user', trackingBatch: {
    ...forged.trackingBatch, receiptId: 'forged-user', runId: 'run-forged-user', authority: { ...forged.trackingBatch.authority, decisionId: 'nonexistent' },
  } };
  await openLedger(root, 'receipts').append(next);
  await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});

test('hard findings store a failed receipt without activating a batch; advisory never revises', async () => {
  for (const severity of ['hard', 'advisory']) {
    const { root, host } = await setup({ empty: true }); const packs = fakePacks();
    const pack = structuredClone({ ...packs.get('fake'), checks: [] });
    pack.checks = packs.get('fake').checks.map((c) => c.id === 'fake.critic' ? { ...c, severity } : c);
    packs.set('fake', pack);
    const make = () => createRunner({ root, packs });
    const findingHost = createFakeHost({ events: { '*': (p) => ({ events: [], tracking: { planRev: p.tracking.plan.rev,
      discoveries: { subjects: [], criteria: [] }, observations: [], checked: ['owner'] } }) },
      critic: () => [{ checkId: 'fake.critic', code: 'SYNTHETIC', message: '합성 검토 결과' }] });
    const done = await finish(make, findingHost);
    assert.equal(done.status, severity === 'hard' ? 'needs_user' : 'done');
    if (severity === 'hard') { assert.equal(done.question.kind, 'flagged'); assert.equal(done.question.canApprove, false); assert.equal(done.question.hard, 1); }
    const receipt = (await receipts(root))[0];
    assert.equal(receipt.hard, severity === 'hard' ? 1 : 0);
    assert.equal((await openWork(root)).tracking.batches.length, severity === 'hard' ? 0 : 1);
    assert.equal((await openWork(root)).tree.nodes.get(NODE).body, TEXT);
    assert.equal(findingHost.calls.some((c) => c.purpose === 'revise'), false);
    assert.equal(host.calls.length, 0);
  }
});

test('missing checked and invalid evidence never activate tracking observations', async () => {
  for (const invalid of ['checked', 'quote']) {
    const { root, make, host } = await setup(); let outcome = await make().run(start);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const answers = host.answer(outcome); const answer = JSON.parse(Object.values(answers)[0]);
      if (invalid === 'checked') answer.tracking.checked = [];
      else answer.tracking.discoveries.subjects[0].evidence.quote = '원문에 없는 인용';
      outcome = await make().resume({ runId: outcome.runId, answers: { [outcome.requests[0].requestId]: answer } });
    }
    assert.equal(outcome.question.kind, 'blocked'); assert.equal((await receipts(root)).length, 0);
  }
});

test('latest backfill replaces the prose snapshot and same-hash recommit excludes old backfill', async () => {
  const { root, host, make } = await setup(); await finish(make, host);
  const empty = createFakeHost(); await finish(make, empty);
  const work = await openWork(root);
  assert.equal(work.tracking.observations.length, 0); assert.equal(work.tracking.batches.length, 2);
  await editYaml(root, (c) => { c.features = { tracking: false }; });
  await driveToEnd(make, createFakeHost({ drafts: { '*': TEXT } }), { start: { node: NODE }, until: (o) => o.status === 'done' });
  assert.equal((await openWork(root)).tracking.observations.length, 0);
  assert.equal((await openWork(root)).entities.has('key'), true);
});

test('skipping a prepared user-authorized receipt preserves its historical decision integrity', async () => {
  const { root, host, make } = await setup({ grant: false });
  const gate = (await driveToEnd(make, host, { start, until: (o) => o.status === 'needs_user' })).at(-1);
  await assert.rejects(make({ afterReceiptWrite() { throw Error('crash'); } }).decide({ runId: gate.runId, action: 'approve' }), /crash/);
  const { grantId: _grant, ...plan } = (await openWork(root)).tracking.plan; await appendPlan(root, { ...plan, version: 2 });
  await assert.rejects(make().run(start), { code: 'LOCK_TRACKING_PLAN_CHANGED' });
  await make().decide({ runId: gate.runId, action: 'skip', reason: '계획 변경' });
  assert.equal((await openWork(root)).tracking.observations.length, 0);
  assert.equal((await receipts(root)).length, 1);
});

test('normal receipts cannot smuggle a backfill batch to bypass metadata authority', async () => {
  const { root, host, make } = await setup({ grant: false }); await finish(make, host);
  const receipt = (await receipts(root))[0];
  const { seq: _seq, hash: _hash, prev: _prev, at: _at, ...body } = receipt;
  await openLedger(root, 'receipts').append({ ...body, type: 'receipt', receiptId: 'smuggled', runId: 'run-smuggled',
    trackingBatch: { ...body.trackingBatch, receiptId: 'smuggled', runId: 'run-smuggled', authority: { source: 'user', decisionId: 'fake' } } });
  await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});

test('own activated criterion additions recover against original base without rediscovery', async () => {
  const { root, make } = await setup({ hooks: { afterTrackingWrite() { throw Error('crash'); } } });
  const host = createFakeHost({ events: { '*': (p) => ({ events: [], tracking: {
    planRev: p.tracking.plan.rev, discoveries: { subjects: [], criteria: [{ id: 'empty-check', title: '추가 확인', instruction: '추가 항목을 확인한다',
      subjectKinds: ['object'], valueType: 'boolean', behavior: 'note', appliesTo: 'all' }] }, observations: [], checked: ['owner', 'empty-check'],
  } }) } });
  const { grantId: _grant, ...plan } = (await openWork(root)).tracking.plan;
  await appendPlan(root, normalizePlan({ ...plan, version: 2, delegation: { ...plan.delegation, addCriteria: true } }));
  await assert.rejects(finish(make, host), /crash/);
  assert.equal((await openWork(root)).tracking.plan.criteria.length, 2);
  const recover = () => createRunner({ root, packs: fakePacks() });
  assert.equal((await recover().run(start)).status, 'done');
  assert.equal((await receipts(root)).length, 1);
  assert.equal((await openWork(root)).tracking.batches.length, 1);
});

test('malformed model checks stop after three attempts without a successful receipt', async () => {
  const { root, host, make } = await setup(); let outcome = await make().run(start);
  outcome = await make().resume({ runId: outcome.runId, answers: host.answer(outcome) });
  for (let attempt = 0; attempt < 3; attempt += 1) outcome = await make().resume({ runId: outcome.runId,
    answers: Object.fromEntries(outcome.requests.map((r) => [r.requestId, '{}'])) });
  assert.equal(outcome.question.kind, 'blocked'); assert.equal((await receipts(root)).length, 0);
});

test('discovered applicable criteria must also be explicitly checked', async () => {
  const { root, make } = await setup();
  const { grantId: _grant, ...plan } = (await openWork(root)).tracking.plan;
  await appendPlan(root, normalizePlan({ ...plan, version: 2, delegation: { ...plan.delegation, addCriteria: true } }));
  const host = createFakeHost({ events: { '*': (p) => ({ events: [], tracking: { planRev: p.tracking.plan.rev, discoveries: { subjects: [],
    criteria: [{ id: 'new-check', title: '새 확인', instruction: '새 확인을 수행한다', subjectKinds: ['object'], valueType: 'text', behavior: 'note', appliesTo: 'all' }] },
    observations: [], checked: ['owner'] } }) } });
  let outcome = await make().run(start);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(outcome.status, 'needs_model'); assert.equal(outcome.requests[0].payload.produces, 'events');
    outcome = await make().resume({ runId: outcome.runId, answers: host.answer(outcome) });
  }
  assert.equal(outcome.status, 'needs_user'); assert.equal(outcome.question.kind, 'blocked');
  assert.equal((await receipts(root)).length, 0);
});

test('backfill authority cannot hide hard findings in advisory fields', async () => {
  const { root, host, make } = await setup({ empty: true }); await finish(make, host);
  const receipt = (await receipts(root))[0];
  const { seq: _seq, hash: _hash, prev: _prev, at: _at, ...body } = receipt;
  await openLedger(root, 'receipts').append({ ...body, receiptId: 'hidden-hard', trackingBatch: { ...body.trackingBatch, receiptId: 'hidden-hard' },
    advisories: [{ checkId: 'fake.critic', severity: 'hard', code: 'HIDDEN', message: '숨겨진 hard' }] });
  await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});
