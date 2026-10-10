import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, snapshotAssetIds, SNAPSHOT_VERSION } from '../../core/view/snapshot.js';
import { viewNode } from '../../core/view/node-view.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

test('a snapshot holds every screen with the same shapes as the API, and turns stage toggles off', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level');
  const snap = await buildSnapshot(root, { packs: fakePacks() });
  assert.equal(snap.version, SNAPSHOT_VERSION);
  assert.deepEqual(Object.keys(snap.nodes), snap.work.nodes.map((n) => n.id));
  assert.deepEqual(snap.nodes['ep-001'], await viewNode(root, 'ep-001'));
  assert.deepEqual(Object.keys(snap.entities), ['doyun', 'hana', 'locked-door']);
  assert.deepEqual([snap.work.features.viewerToggles, snap.stages.toggles], [false, false]);
  assert.equal(snap.receiptNodes['ep-001'].receipt, null);
  assert.equal(snap.promises.promises[0].entityId, 'locked-door');
  assert.deepEqual(snap.sources.sources, []);
  assert.deepEqual(snap.sourceDetails, {});
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
});

test('screens that cannot open are left empty, pictures are collected, and the export feature can be turned off', async () => {
  const root = await copyFixture('novel-3level');
  const snap = await buildSnapshot(root, { packs: fakePacks() });
  assert.deepEqual([snap.stages, snap.checkSets, snap.work.status.ok], [null, null, false]);
  assert.deepEqual(snapshotAssetIds(snap), ['img-rooftop']);
  await editYaml(root, (config) => { config.features = { viewerExport: false }; });
  await assert.rejects(buildSnapshot(root, { packs: fakePacks() }), { code: 'FEATURE_DISABLED' });
});
