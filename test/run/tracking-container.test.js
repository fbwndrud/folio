import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../../core/run/runner.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { openWork } from '../../core/store/work.js';
import { coverageFor } from '../../core/tracking/coverage.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { appendPlan, trackingPlan } from '../support/tracking.js';

test('tracking allows a chapter to finalize after its scenes without inventing a prose batch', async () => {
  const root = await copyFixture('novel-3level'); await useFakePack(root);
  await appendPlan(root, normalizePlan(trackingPlan()));
  const make = () => createRunner({ root, packs: fakePacks() });
  const host = createFakeHost();
  for (const node of ['rooftop-scene', 'stairwell', 'the-fall']) {
    const trail = await driveToEnd(make, host, { start: { node }, until: (o) => o.status === 'done' });
    assert.equal(trail.at(-1).status, 'done');
  }
  const work = await openWork(root);
  assert.equal(work.tree.nodes.get('the-fall').status, 'committed');
  assert.ok(coverageFor(work).some((entry) => entry.nodeId === 'the-fall' && entry.state === 'pending'));
  assert.equal(host.calls.some((call) => call.nodeId === 'the-fall' && call.payload.produces === 'events'), false);
  await driveToEnd(make, host, { start: { node: 'the-fall', mode: 'tracking-backfill' }, until: (o) => o.status === 'done' });
  assert.ok(coverageFor(await openWork(root)).some((entry) => entry.nodeId === 'the-fall' && entry.state === 'complete'));
  assert.ok(coverageFor(work).some((entry) => entry.nodeId === 'stairwell' && entry.state === 'complete'));
});

test('group exception does not permit a leaf without a batch or an unbound candidate snapshot', async () => {
  const { assertTrackingCommit } = await import('../../core/tracking/commit.js');
  const root = await copyFixture('novel-3level'); await useFakePack(root);
  await appendPlan(root, normalizePlan(trackingPlan()));
  const work = await openWork(root);
  for (const receipt of [
    { nodeId: 'stairwell', refs: [] },
    { nodeId: 'the-fall', refs: [{ kind: 'tracking_snapshot', id: 'the-fall' }] },
  ]) {
    await assert.rejects(assertTrackingCommit({ root, work, receipt, text: '', recorded: false }), { code: 'LOCK_TRACKING_INTEGRITY' });
  }
});
