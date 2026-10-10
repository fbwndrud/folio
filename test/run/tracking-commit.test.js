import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../../core/run/runner.js';
import { updateNode } from '../../core/store/tree.js';
import { readTracking } from '../../core/tracking/records.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { createRunStore } from '../../core/run/run-store.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { trackingPlan, trackingCriterion, appendPlan } from '../support/tracking.js';
import { editYaml } from '../support/recheck.js';

const TEXT = '파란 열쇠는 문 옆에 있다.';
async function setup({ withOccurrence = false } = {}) {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  await appendPlan(root, normalizePlan(trackingPlan({ delegation: { addSubjects: true, addCriteria: true, addObservations: true } })));
  const evidence = { nodeId: 'stairwell', textHash: sha256(TEXT), quote: '파란 열쇠' };
  const host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => ({ events: [], ...(withOccurrence ? { occurrences: [{ entityId: 'key', kind: 'appearance', quote: '파란 열쇠' }] } : {}), tracking: {
    planRev: p.tracking.plan.rev, discoveries: {
      subjects: [{ id: 'key', kind: 'clue', name: '파란 열쇠', aliases: [], body: '', data: {}, evidence }],
      criteria: [trackingCriterion({ id: 'location', subjectKinds: ['clue'] })],
    }, observations: [{ subjectId: 'key', criterionId: 'location', value: '문', basis: 'explicit', evidence }], checked: ['owner', 'location'],
  } }) } });
  const make = (hooks = {}) => createRunner({ root, packs: fakePacks(), hooks });
  const gate = (await driveToEnd(make, host, { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user' })).at(-1);
  return { root, make, gate };
}

for (const boundary of ['afterReceiptWrite', 'afterBodyWrite', 'afterEventsWrite', 'afterTrackingWrite', 'afterCommitWrite']) {
  test(`tracking commit recovers exactly once after ${boundary}`, async () => {
    const { root, make, gate } = await setup();
    await assert.rejects(make({ [boundary]() { throw Error('synthetic crash'); } }).decide({ runId: gate.runId, action: 'approve' }), /synthetic crash/);
    const before = await openWork(root);
    assert.equal(before.tracking.observations.length, boundary === 'afterCommitWrite' ? 1 : 0);
    assert.equal(before.entities.has('key'), boundary === 'afterCommitWrite');
    const done = await make().run({ node: 'stairwell' });
    assert.equal(done.status, 'done');
    const work = await openWork(root);
    const records = await openLedger(root, 'tracking').readAll();
    assert.equal(records.filter((r) => r.type === 'tracking_batch').length, 1);
    assert.equal(work.tracking.observations.length, 1);
    assert.equal(work.entities.get('key').kind, 'clue');
    const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt');
    assert.equal(work.tracking.plan.rev, receipt.trackingBatch.effectivePlanRev);
    assert.equal(receipt.trackingBatch.observations.length, 1);
    assert.equal(receipt.trackingBatch.receiptId, receipt.receiptId);
    assert.equal((await createRunStore(root).load(gate.runId)).state, 'done');
  });
}

test('recorded receipt controls recovery even if the cached candidate is deleted', async () => {
  const { root, make, gate } = await setup();
  await assert.rejects(make({ afterTrackingWrite() { throw Error('crash'); } }).decide({ runId: gate.runId, action: 'approve' }), /crash/);
  const store = createRunStore(root); const run = await store.load(gate.runId);
  delete run.outputs.tracking; run.receipt = { receiptId: 'forged' }; await store.save(run);
  assert.equal((await make().run({ node: 'stairwell' })).status, 'done');
  assert.equal((await openWork(root)).tracking.observations.length, 1);
});

test('same-hash legacy recommit excludes the old snapshot but retains declared discoveries', async () => {
  const { root, make, gate } = await setup();
  assert.equal((await make().decide({ runId: gate.runId, action: 'approve' })).status, 'done');
  await editYaml(root, (c) => { c.features = { tracking: false }; });
  const host = createFakeHost({ drafts: { '*': TEXT } });
  await driveToEnd(make, host, { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const work = await openWork(root);
  assert.equal(work.tracking.observations.length, 0);
  assert.equal(work.entities.has('key'), true);
  assert.equal(work.tracking.plan.criteria.some((c) => c.id === 'location'), true);
});

test('unrelated grant changes refuse immutable receipt recovery and allow abandoning the run', async () => {
  const { root, make, gate } = await setup();
  await assert.rejects(make({ afterTrackingWrite() { throw Error('crash'); } }).decide({ runId: gate.runId, action: 'approve' }), /crash/);
  const plan = (await openWork(root)).tracking.plan;
  const { grantId: _grant, ...content } = plan;
  await appendPlan(root, { ...content, version: 2 });
  await assert.rejects(make().run({ node: 'stairwell' }), { code: 'LOCK_TRACKING_PLAN_CHANGED' });
  assert.equal((await make().decide({ runId: gate.runId, action: 'skip', reason: '계획 변경' })).status, 'skipped');
  assert.equal((await openWork(root)).tracking.observations.length, 0);
});

test('legitimate historical fixed observations survive a later user value decision', async () => {
  const root = await copyFixture('novel-3level'); await useFakePack(root);
  await appendPlan(root, normalizePlan(trackingPlan({ criteria: [trackingCriterion({ behavior: 'fixed', expectedValue: '문' })],
    delegation: { addSubjects: true, addObservations: true } })));
  const evidence = { nodeId: 'stairwell', textHash: sha256(TEXT), quote: '파란 열쇠' };
  const host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => ({ events: [], tracking: { planRev: p.tracking.plan.rev,
    discoveries: { subjects: [{ id: 'key', kind: 'object', name: '열쇠', aliases: [], body: '', data: {}, evidence }], criteria: [] },
    observations: [{ subjectId: 'key', criterionId: 'owner', value: '문', basis: 'explicit', evidence }], checked: ['owner'] } }) } });
  const make = () => createRunner({ root, packs: fakePacks() });
  await driveToEnd(make, host, { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const { grantId: _grant, ...content } = (await openWork(root)).tracking.plan;
  await appendPlan(root, normalizePlan({ ...content, version: 2, criteria: content.criteria.map((c) => ({ ...c, expectedValue: '밖' })) }));
  const work = await openWork(root);
  assert.deepEqual(work.tracking.observations, []);
  assert.equal(work.tracking.batches[0].observations[0].value, '문');
  assert.deepEqual(work.tracking.batches[0].observations[0].evidence, evidence);
});

test('subject-only batches can later refer to earlier committed subjects under the same plan rev', async () => {
  const root = await copyFixture('novel-3level'); await useFakePack(root);
  await appendPlan(root, normalizePlan(trackingPlan({ delegation: { addSubjects: true, addObservations: true } })));
  const make = () => createRunner({ root, packs: fakePacks() });
  let first = true;
  const host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => {
    const evidence = { nodeId: p.node.id, textHash: sha256(TEXT), quote: '파란 열쇠' };
    const subjects = first ? [{ id: 'key', kind: 'object', name: '열쇠', aliases: [], body: '', data: {}, evidence }] : [];
    return { events: [], tracking: { planRev: p.tracking.plan.rev, discoveries: { subjects, criteria: [] },
      observations: [{ subjectId: 'key', criterionId: 'owner', value: '문', basis: 'explicit', evidence }], checked: ['owner'] } };
  } } });
  await driveToEnd(make, host, { start: { node: 'stairwell' }, until: (o) => o.status === 'done' }); first = false;
  await driveToEnd(make, host, { start: { node: 'rooftop-scene' }, until: (o) => o.status === 'done' });
  assert.equal((await openWork(root)).tracking.observations.length, 2);
});

for (const crash of [false, true]) test(`explicit occurrences of new managed subjects survive tracking commit (crash=${crash})`, async () => {
  const { root, make, gate } = await setup({ withOccurrence: true });
  if (crash) {
    await assert.rejects(make({ afterCommitWrite() { throw Error('crash'); } }).decide({ runId: gate.runId, action: 'approve' }), /crash/);
    assert.equal((await make().run({ node: 'stairwell' })).status, 'done');
  } else assert.equal((await make().decide({ runId: gate.runId, action: 'approve' })).status, 'done');
  const occurrences = await openLedger(root, 'occurrences').readAll();
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].items[0].entityId, 'key');
  assert.equal((await createRunStore(root).load(gate.runId)).history.some((r) => r.event === 'occurrences_not_recorded'), false);
});

test('hand editing excludes current observations without damaging historical batches or discoveries', async () => {
  const { root, make, gate } = await setup();
  await make().decide({ runId: gate.runId, action: 'approve' });
  const before = await openWork(root);
  await updateNode(root, before.tree.nodes.get('stairwell'), { body: '새 합성 원문으로 손편집했다.' });
  const work = await openWork(root);
  assert.equal(work.tracking.observations.length, 0);
  assert.equal((await readTracking(root)).observations.length, 0);
  assert.equal(work.tracking.batches.length, 1);
  assert.equal(work.entities.get('key').rev, before.entities.get('key').rev);
  assert.equal(work.tracking.plan.rev, before.tracking.plan.rev);
});

test('a feature-off legacy receipt cannot be reused to supersede a tracked node with a forged marker', async () => {
  const { root, make, gate } = await setup();
  await make().decide({ runId: gate.runId, action: 'approve' });
  await editYaml(root, (config) => { config.features = { tracking: false }; });
  await driveToEnd(make, createFakeHost({ drafts: { '*': TEXT } }), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const receipt = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt').at(-1);
  assert.equal(receipt.trackingBatch, undefined);
  await openLedger(root, 'receipts').append({ type: 'commit', receiptId: receipt.receiptId,
    nodeId: receipt.nodeId, committedHash: 'sha256:' + '0'.repeat(64) });
  await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});
