import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { workStatus } from '../../core/status.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { readTracking } from '../../core/tracking/records.js';
import { appendTrackingBatch } from '../../core/tracking/commit.js';
import { coverageFor } from '../../core/tracking/coverage.js';
import { sha256 } from '../../core/util/hash.js';
import { fakePacks } from '../support/fixtures.js';
import { committedWith } from '../support/recheck.js';
import { trackingPlan, appendPlan } from '../support/tracking.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { coverageSetup } from '../support/tracking-coverage.js';

const TEXT = '파란 열쇠는 문 옆에 있다.';
const NODE = 'stairwell';
const start = { node: NODE, mode: 'tracking-backfill' };
async function setup({ grant = true } = {}) {
  const { root } = await committedWith({ drafts: { '*': TEXT } });
  await appendPlan(root, normalizePlan(trackingPlan({ delegation: grant ? { addSubjects: true, addObservations: true, backfill: true } : {} })));
  const make = (hooks = {}) => createRunner({ root, packs: fakePacks(), hooks });
  const hostFor = (value, discover = false) => createFakeHost({ events: { '*': (p) => {
    const evidence = { nodeId: NODE, textHash: sha256(TEXT), quote: '파란 열쇠' };
    return { events: [], tracking: { planRev: p.tracking.plan.rev,
      discoveries: { subjects: discover ? [{ id: 'key', kind: 'object', name: '열쇠', aliases: [], body: '', data: {}, evidence }] : [], criteria: [] },
      observations: [{ subjectId: 'key', criterionId: 'owner', value, basis: 'explicit', evidence }], checked: ['owner'] } };
  } } });
  const finish = async (host, hooks = {}) => (await driveToEnd(() => make(hooks), host, { start, until: (o) => o.status === 'done' })).at(-1);
  return { root, make, hostFor, finish };
}

test('A to B to A publishes a new current snapshot instead of reusing historical A', async () => {
  const { root, hostFor, finish } = await setup();
  await finish(hostFor('최초', true));
  const firstA = await finish(hostFor('문'));
  await finish(hostFor('복도'));
  const secondA = await finish(hostFor('문'));
  assert.notEqual(secondA.receiptId, firstA.receiptId);
  const work = await openWork(root);
  assert.deepEqual(work.tracking.observations.map((o) => o.value), ['문']);
  assert.equal(work.tracking.batches.length, 4);
  assert.equal((await finish(hostFor('문'))).receiptId, secondA.receiptId);
  assert.equal((await openWork(root)).tracking.batches.length, 4);
});

test('success after an intervening hard failure records a fresh receipt and clears blocked coverage', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene');
  const packs = fakePacks(); const pack = packs.get('fake');
  packs.set('fake', { ...pack, checks: pack.checks.map((check) => check.id === 'fake.critic' ? { ...check, severity: 'hard' } : check) });
  const make = () => createRunner({ root: s.root, packs });
  const run = async (hard = false) => (await driveToEnd(make, createFakeHost({
    critic: () => hard ? [{ checkId: 'fake.critic', code: 'SYNTHETIC', message: '합성 hard 실패' }] : [],
  }), { start: { node: 'rooftop-scene', mode: 'tracking-backfill' },
    until: (outcome) => outcome.status === 'done' || outcome.question?.kind === 'flagged' })).at(-1);
  const first = await run(); assert.equal(first.status, 'done');
  assert.equal((await run()).receiptId, first.receiptId);
  const failed = await run(true); assert.equal(failed.status, 'needs_user');
  assert.deepEqual(coverageFor(await s.work()).map((entry) => entry.state), ['blocked']);
  const retried = await run(); assert.equal(retried.status, 'done');
  assert.notEqual(retried.receiptId, first.receiptId);
  assert.deepEqual(coverageFor(await s.work()).map((entry) => entry.state), ['complete']);
  assert.deepEqual((await workStatus(s.root, { packs })).backfillPending, []);
  assert.equal((await run()).receiptId, retried.receiptId);
  const receipts = (await openLedger(s.root, 'receipts').readAll()).filter((record) => record.type === 'tracking-backfill');
  assert.deepEqual(receipts.map((record) => record.hard), [0, 1, 0]);
  assert.equal((await s.work()).tracking.batches.length, 3);
});

async function cancelledPrepared() {
  const setupResult = await setup({ grant: false });
  const { root, make, hostFor } = setupResult; const host = hostFor('문', true);
  const gate = (await driveToEnd(() => make(), host, { start, until: (o) => o.status === 'needs_user' })).at(-1);
  await assert.rejects(make({ afterReceiptWrite() { throw Error('synthetic crash'); } }).decide({ runId: gate.runId, action: 'approve' }), /synthetic crash/);
  const store = createRunStore(root); const beforeSkip = await store.load(gate.runId);
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'tracking-backfill');
  assert.equal((await make().decide({ runId: gate.runId, action: 'skip', reason: '기록 반영 취소' })).status, 'skipped');
  assert.equal((await openWork(root)).tracking.batches.length, 0);
  return { ...setupResult, store, beforeSkip, receipt };
}

test('durable skip blocks receipt-only recovery after an old run cache is restored', async () => {
  const { root, make, store, beforeSkip } = await cancelledPrepared();
  await store.save(beforeSkip);
  await assert.rejects(make().run(start), { code: 'LOCK_TRACKING_BACKFILL_CANCELLED' });
  assert.equal((await openWork(root)).tracking.batches.length, 0);
  assert.equal((await openWork(root)).tracking.observations.length, 0);
});

test('direct append cannot activate a prepared receipt after its durable skip', async () => {
  const { root, receipt } = await cancelledPrepared();
  const skip = (await openLedger(root, 'decisions').readAll()).filter((r) => r.type === 'tracking_metadata_decision').at(-1);
  assert.equal(skip.preparedReceiptId, receipt.receiptId); assert.equal(skip.batchActivated, false);
  await assert.rejects(appendTrackingBatch(root, receipt.trackingBatch), { code: 'LOCK_TRACKING_BACKFILL_CANCELLED' });
  assert.equal((await openWork(root)).tracking.batches.length, 0);
});

test('a skip after activation preserves the historical batch and its idempotent append', async () => {
  const { root, make, hostFor, finish } = await setup();
  await assert.rejects(finish(hostFor('문', true), { afterTrackingWrite() { throw Error('synthetic crash'); } }), /synthetic crash/);
  const store = createRunStore(root); const run = (await store.list()).find((r) => r.mode === start.mode);
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'tracking-backfill');
  await make().decide({ runId: run.runId, action: 'skip', reason: '후속 실행 종료' });
  const skip = (await openLedger(root, 'decisions').readAll()).filter((r) => r.type === 'tracking_metadata_decision').at(-1);
  assert.equal(skip.preparedReceiptId, receipt.receiptId); assert.equal(skip.batchActivated, true);
  const before = await openLedger(root, 'tracking').readAll();
  await appendTrackingBatch(root, receipt.trackingBatch);
  assert.deepEqual(await openLedger(root, 'tracking').readAll(), before);
  assert.deepEqual((await openWork(root)).tracking.observations.map((o) => o.value), ['문']);
});

test('replay rejects a raw matching batch injected after cancellation of a prepared receipt', async () => {
  const { root, receipt } = await cancelledPrepared();
  await openLedger(root, 'tracking').append({ type: 'tracking_batch', ...receipt.trackingBatch });
  await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
  await assert.rejects(readTracking(root), { code: 'LOCK_TRACKING_INTEGRITY' });
  const status = await workStatus(root, { packs: fakePacks() });
  assert.equal(status.ledger.tracking.ok, false);
  assert.equal(status.next, null); assert.equal(status.activeRun, null);
});

test('skip before any receipt also prevents activation after restoring the old cache', async () => {
  const { root, make } = await setup();
  const waiting = await make().run(start); const store = createRunStore(root); const cached = await store.load(waiting.runId);
  await make().decide({ runId: waiting.runId, action: 'skip', reason: '보충 요청 취소' });
  const skip = (await openLedger(root, 'decisions').readAll()).filter((r) => r.type === 'tracking_metadata_decision').at(-1);
  assert.equal(skip.preparedReceiptId, null); assert.equal(skip.batchActivated, false);
  await store.save(cached);
  await assert.rejects(make().run(start), { code: 'LOCK_TRACKING_BACKFILL_CANCELLED' });
  assert.equal((await openWork(root)).tracking.batches.length, 0);
});
