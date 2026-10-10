import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLedger } from '../../core/ledger/ledger.js';
import { createRunStore } from '../../core/run/run-store.js';
import { prepareTracking } from '../../core/tracking/candidates.js';
import { snapshotDigest } from '../../core/tracking/semantic.js';
import { coverageSetup, TEXT } from '../support/tracking-coverage.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { useFakePack } from '../support/fixtures.js';
import { sha256 } from '../../core/util/hash.js';

test('full candidate refs reject subject tampering even when observation snapshot is identical', async () => {
  const s = await coverageSetup(); await useFakePack(s.root);
  const evidence = { nodeId: 'rooftop-scene', textHash: sha256(TEXT), quote: '파란 열쇠' };
  const host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => ({ events: [], tracking: {
    planRev: p.tracking.plan.rev, discoveries: { subjects: [{ id: 'key', kind: 'object', name: '숨은 물건', aliases: [], body: '합성 정의', data: {}, evidence }], criteria: [] },
    observations: [], checked: ['owner'],
  } }) } });
  const gate = (await driveToEnd(s.make, host, { start: { node: 'rooftop-scene' }, until: (o) => o.status === 'needs_user' })).at(-1);
  const store = createRunStore(s.root); const run = await store.load(gate.runId); const original = run.outputs.tracking;
  assert.ok(run.results.facts.refs.some((ref) => ref.kind === 'tracking_candidate' && ref.rev === original.batchDigest));
  const changed = prepareTracking(await s.work(), run, { planRev: original.basePlanRev,
    discoveries: { subjects: original.subjects.map((subject) => ({ ...subject, body: '바뀐 합성 정의' })), criteria: [] }, observations: [], checked: ['owner'] },
  { nodeId: run.nodeId, text: TEXT });
  assert.equal(snapshotDigest(changed), snapshotDigest(original));
  assert.notEqual(changed.batchDigest, original.batchDigest);
  const before = await Promise.all(['receipts', 'tracking'].map((name) => openLedger(s.root, name).readAll()));
  run.outputs.tracking = { ...changed, draftHash: run.draftHash }; await store.save(run);
  const outcome = await s.make().decide({ runId: run.runId, action: 'approve' });
  assert.equal(outcome.status, 'needs_model');
  assert.equal(outcome.requests[0].payload.produces, 'events');
  assert.ok((await store.load(run.runId)).history.some((entry) => entry.event === 'refs_changed'));
  assert.equal((await s.work()).entities.has('key'), false);
  assert.deepEqual(await Promise.all(['receipts', 'tracking'].map((name) => openLedger(s.root, name).readAll())), before);
});

test('partial modern ref envelopes cannot downgrade to legacy candidate binding', async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene');
  const { assertTrackingIntegrity } = await import('../../core/tracking/integrity.js');
  const records = await openLedger(s.root, 'receipts').readAll();
  const forged = records.map((record) => record.type !== 'receipt' ? record : { ...record,
    refs: record.refs.filter((ref) => ref.kind !== 'tracking_catalog').map((ref) => ref.kind === 'tracking_candidate'
      ? { ...ref, rev: sha256('forged candidate') } : ref.kind === 'tracking_snapshot' ? { ...ref, rev: record.trackingBatch.batchDigest } : ref) });
  await assert.rejects(assertTrackingIntegrity(s.root, { receiptRecords: forged }), { code: 'LOCK_TRACKING_INTEGRITY' });
});
