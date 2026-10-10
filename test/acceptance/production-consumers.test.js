import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setupAssets } from '../support/assets.js';
import { copyFixture } from '../support/fixtures.js';
import { makeReceipt } from '../support/receipts.js';
import { buildSnapshot, snapshotAssetIds } from '../../core/view/snapshot.js';
import { viewEntity } from '../../core/view/entity-view.js';
import { readAssetFile } from '../../core/view/asset-file.js';
import { checkExport, exportWork } from '../../core/export/export-work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { sha256 } from '../../core/util/hash.js';

test('managed attachments appear in snapshots and exports; nullable paths and changed bytes stay explicit', async () => {
  const s = await setupAssets();
  let asset = await s.add();
  asset = s.ok(await s.asset({ op: 'attach', id: asset.id, expectedRev: asset.rev, nodeIds: ['toy-scene'] })).asset;
  let snapshot = await buildSnapshot(s.root, { packs: s.packs });
  assert.deepEqual(snapshot.nodes['toy-scene'].assets.attached.map((a) => [a.id, a.hasFile]), [[asset.id, false]]);
  assert.deepEqual(snapshotAssetIds(snapshot), []);
  await assert.rejects(checkExport({ root: s.root }), { code: 'ASSET_FILE_UNAVAILABLE' });
  asset = await s.approve(await s.review(await s.put(asset)));
  snapshot = await buildSnapshot(s.root, { packs: s.packs });
  assert.deepEqual(snapshotAssetIds(snapshot), [asset.id]);
  assert.equal(snapshot.nodes['toy-scene'].assets.attached[0].approved, true);
  const out = await exportWork({ root: s.root, output: join(s.base, 'export') });
  const manifest = JSON.parse(await readFile(join(out.output, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.assets.map((a) => a.id), [asset.id]);
  assert.match(await readFile(join(out.output, 'index.html'), 'utf8'), /<figure><img/);
  await writeFile(join(s.root, 'assets', asset.output.file), 'changed synthetic bytes');
  await assert.rejects(readAssetFile(s.root, asset.id), { code: 'ASSET_FILE_UNAVAILABLE' });
  await assert.rejects(checkExport({ root: s.root }), { code: 'ASSET_FILE_UNAVAILABLE' });
  snapshot = await buildSnapshot(s.root, { packs: s.packs });
  assert.equal(snapshot.nodes['toy-scene'].assets.attached[0].hasFile, false);
});

test('viewer hides receipt-linked events until final publication and preserves scalar legacy events', async () => {
  const root = await copyFixture('serial-2level');
  const events = openLedger(root, 'events'), receipts = openLedger(root, 'receipts');
  await events.append({ type: 'event', eventId: 'legacy-scalar', entityId: 'hana', nodeId: 'ep-001', kind: 'state', data: 'synthetic scalar' });
  const event = { eventId: 'prepared', entityId: 'hana', kind: 'state', data: 7 };
  const receipt = makeReceipt({ nodeId: 'ep-001', text: 'synthetic', pipeline: { digest: sha256('synthetic pipeline'), steps: [{ id: 'check', kind: 'check' }] }, events: [event] });
  await receipts.append({ type: 'receipt', ...receipt });
  await events.append({ type: 'event', ...event, nodeId: receipt.nodeId, receiptId: receipt.receiptId });
  assert.deepEqual((await viewEntity(root, 'hana')).events.map((e) => e.data), ['synthetic scalar']);
  await receipts.append({ type: 'commit', receiptId: receipt.receiptId, nodeId: receipt.nodeId, committedHash: receipt.draftHash });
  assert.deepEqual((await viewEntity(root, 'hana')).events.map((e) => e.data), ['synthetic scalar', 7]);
});
