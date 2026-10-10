import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { assertTrackingIntegrity } from '../../core/tracking/integrity.js';
import { readTracking } from '../../core/tracking/records.js';
import { appendTrackingBatch } from '../../core/tracking/commit.js';
import { createRunner } from '../../core/run/runner.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { trackingPlan, appendPlan } from '../support/tracking.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { editYaml } from '../support/recheck.js';

async function committed() {
  const root = await copyFixture('novel-3level'); await useFakePack(root);
  await appendPlan(root, normalizePlan(trackingPlan({ delegation: { addObservations: true } })));
  const make = () => createRunner({ root, packs: fakePacks() });
  await driveToEnd(make, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const records = await openLedger(root, 'receipts').readAll();
  return { root, receipt: records.find((r) => r.type === 'receipt') };
}

test('prepared batch requires an immutable matching receipt; exact resume appends nothing', async () => {
  const { root, receipt } = await committed();
  const before = await openLedger(root, 'tracking').readAll();
  await appendTrackingBatch(root, receipt.trackingBatch);
  assert.deepEqual(await openLedger(root, 'tracking').readAll(), before);
  await assert.rejects(appendTrackingBatch(root, { ...receipt.trackingBatch, runId: 'run-forged' }), { code: 'LOCK_TRACKING_INTEGRITY' });
});

test('deleting the entire tracking ledger is rejected even with feature off', async () => {
  const { root } = await committed();
  await editYaml(root, (c) => { c.features = { tracking: false }; });
  await rm(join(root, '.folio/ledger/tracking.jsonl')); await rm(join(root, '.folio/ledger/tracking.head'));
  await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});

test('a forged commit marker without a matching receipt fails closed', async () => {
  const { root } = await committed();
  await openLedger(root, 'receipts').append({ type: 'commit', receiptId: 'rcpt-forged', nodeId: 'stairwell', committedHash: 'sha256:' + '0'.repeat(64) });
  await assert.rejects(readTracking(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});

test('a matching-hash marker with a wrong receipt batch digest fails closed', async () => {
  const { root, receipt } = await committed();
  await openLedger(root, 'receipts').append({ type: 'commit', receiptId: receipt.receiptId, nodeId: receipt.nodeId,
    committedHash: receipt.draftHash, trackingBatchDigest: 'sha256:' + '0'.repeat(64) });
  await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});

for (const name of ['events', 'tracking']) for (const suffix of ['jsonl', 'head']) {
  test(`${name} ledger refuses symlink ${suffix} for read and append`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'folio-link-')); const outside = await mkdtemp(join(tmpdir(), 'folio-outside-'));
    await mkdir(join(root, '.folio/ledger'), { recursive: true });
    await symlink(join(outside, 'state'), join(root, `.folio/ledger/${name}.${suffix}`));
    await assert.rejects(openLedger(root, name).readAll(), { code: 'MANAGED_PATH_UNSAFE' });
    await assert.rejects(openLedger(root, name).append({ type: 'synthetic' }), { code: 'MANAGED_PATH_UNSAFE' });
    assert.deepEqual(await readdir(outside), []);
  });
}

for (const state of ['.folio', '.folio/runs', '.folio/ledger']) {
  test(`work lock refuses ${state} symlink before writing outside`, async () => {
    const root = await copyFixture('novel-3level'); const outside = await mkdtemp(join(tmpdir(), 'folio-outside-'));
    if (state !== '.folio') await mkdir(join(root, '.folio'), { recursive: true });
    await symlink(outside, join(root, state));
    await assert.rejects(createRunner({ root, packs: fakePacks() }).run({ node: 'stairwell' }), { code: 'MANAGED_PATH_UNSAFE' });
    assert.deepEqual(await readdir(outside), []);
  });
}

test('an ordinary OS alias outside the selected root does not become Folio state', async () => {
  const root = await copyFixture('novel-3level'); const alias = await mkdtemp(join(tmpdir(), 'folio-alias-'));
  await symlink(root, join(alias, 'work'));
  const ledger = openLedger(join(alias, 'work'), 'events');
  await ledger.append({ type: 'synthetic' });
  assert.equal((await ledger.readAll()).length, 1);
});

test('a missing prepared batch cannot be hidden behind its final commit', async () => {
  const { root } = await committed();
  const plans = (await openLedger(root, 'tracking').readAll()).filter((r) => r.type === 'tracking_plan');
  await rm(join(root, '.folio/ledger/tracking.jsonl')); await rm(join(root, '.folio/ledger/tracking.head'));
  for (const { seq: _seq, prev: _prev, hash: _hash, ...plan } of plans) await openLedger(root, 'tracking').append(plan);
  await editYaml(root, (c) => { c.features = { tracking: false }; });
  await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});

test('a prepared batch whose canonical receipt was deleted is never accepted', async () => {
  const { root } = await committed();
  await rm(join(root, '.folio/ledger/receipts.jsonl')); await rm(join(root, '.folio/ledger/receipts.head'));
  await assert.rejects(readTracking(root), { code: 'LOCK_TRACKING_INTEGRITY' });
});

async function legacyCommitted(withPlan = false) {
  const root = await copyFixture('novel-3level'); await useFakePack(root);
  const make = () => createRunner({ root, packs: fakePacks() });
  await driveToEnd(make, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt');
  assert.equal(receipt.trackingBatch, undefined);
  if (withPlan) {
    await appendPlan(root, normalizePlan(trackingPlan()));
    await driveToEnd(make, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  }
  return { root, receipt };
}

for (const withPlan of [false, true]) for (const violation of ['node', 'hash', 'duplicate']) {
  test(`legacy receipt rejects ${violation} commit marker (plan=${withPlan})`, async () => {
    const { root, receipt } = await legacyCommitted(withPlan);
    await openLedger(root, 'receipts').append({ type: 'commit', receiptId: receipt.receiptId,
      nodeId: violation === 'node' ? 'rooftop-scene' : receipt.nodeId,
      committedHash: violation === 'hash' ? 'sha256:' + '0'.repeat(64) : receipt.draftHash });
    await assert.rejects(assertTrackingIntegrity(root), { code: 'LOCK_TRACKING_INTEGRITY' });
    await assert.rejects(openWork(root), { code: 'LOCK_TRACKING_INTEGRITY' });
  });
}

test('valid no-plan legacy commits remain readable without a tracking batch', async () => {
  const { root } = await legacyCommitted();
  await assertTrackingIntegrity(root);
  const work = await openWork(root);
  assert.equal(work.tree.nodes.get('stairwell').status, 'committed');
  assert.equal(work.tracking.plan, null);
});
