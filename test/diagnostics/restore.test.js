import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { viewResources } from '../../core/view/resources.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { setupAssets, syntheticSvg } from '../support/assets.js';
import { approvedFixture } from '../support/view-resources.js';
import { tempDir } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { connectFolio } from '../support/mcp-client.js';
import { snapshotFiles, unchangedInspection } from '../support/diagnostics.js';

for (const writing of [true, false]) test(`stopped ${writing ? 'writing' : 'Resource-only'} work restores in a new folder and reconnects with history intact`, async () => {
  const assetWork = writing ? await setupAssets() : null;
  const root = assetWork?.root ?? await tempDir('folio-restore-resources-');
  let imageHistory;
  if (assetWork) {
    const asset = await assetWork.approve(await assetWork.review(await assetWork.put(await assetWork.add())));
    await writeFile(assetWork.source, syntheticSvg('red'));
    await assetWork.approve(await assetWork.review(await assetWork.put(asset)));
    imageHistory = (await assetWork.get()).history;
    await driveToEnd(() => createRunner({ root, packs: assetWork.packs }), createFakeHost(), { until: (o) => o.status === 'done' });
  }
  const resources = await approvedFixture(root);
  await buildMetadataProjection(root);
  const oldCheckpoint = (await readWorkspaceState(root)).checkpoint;
  await resources.select(await resources.propose('source', 'synthetic second selected source'), resources.selected.selectionRevision);
  await buildMetadataProjection(root);
  // Close the real host/server before copying; direct synthetic setup has no live writers.
  const prior = await connectFolio();
  const read = await prior.call('folio_resources', { root, op: 'read', revisionId: resources.output.revisionId });
  assert.equal(read.ok, true);
  await prior.close();
  const original = await snapshotFiles(root);
  const base = await tempDir('folio-restore-new-');
  const restored = join(base, 'restored');
  await cp(root, restored, { recursive: true, force: false, errorOnExist: true });
  assert.deepEqual(await snapshotFiles(restored), original);
  assert.equal((await unchangedInspection(restored, assetWork?.packs)).ok, true);
  const stateBefore = await readWorkspaceState(restored);
  assert.deepEqual(stateBefore, await readWorkspaceState(root));
  const entries = await viewResources(restored);
  const output = entries.entries.find((e) => e.revisionId === resources.output.revisionId);
  assert.equal(output.receiptId, resources.receiptId);
  assert.equal(output.selfReview, true);
  assert.equal(output.reviewRequired, true);
  assert.deepEqual(output.findings.map((f) => f.severity), ['soft']);
  const receipts = await openLedger(restored, 'receipts').readAll();
  if (writing) assert.ok(receipts.some((r) => r.type === 'commit'));
  const approvedRecords = original.filter((e) => /^\.folio\/ledger\/|^tree\/|^assets\//.test(e.path));
  for (let reconnect = 0; reconnect < 2; reconnect += 1) {
    const host = await connectFolio();
    try {
      const query = await host.call('folio_resource_query', { root: restored, op: 'query', selector: { type: 'atCheckpoint', checkpoint: oldCheckpoint }, freshness: 'allowStale' });
      assert.equal(query.ok, true, JSON.stringify(query));
      assert.equal(query.result.entries.find((e) => e.resourceId === 'source').revisionId, resources.source.revisionId);
      assert.equal(query.result.entries.find((e) => e.resourceId === 'output').receiptId, resources.receiptId);
      if (writing) {
        const status = await host.call('folio_status', { root: restored });
        assert.equal(status.ok, true, JSON.stringify(status));
        const asset = await host.call('folio_assets', { root: restored, op: 'get', id: 'toy-image' });
        assert.equal(asset.ok, true, JSON.stringify(asset));
        assert.deepEqual(asset.result.history, imageHistory);
        assert.equal(asset.result.asset.approved, true);
        assert.equal(asset.result.asset.review.reviewer.independent, false);
      }
    } finally { await host.close(); }
  }
  assert.deepEqual(await readWorkspaceState(restored), stateBefore);
  assert.deepEqual(await openLedger(restored, 'receipts').readAll(), receipts);
  assert.deepEqual((await snapshotFiles(restored)).filter((e) => /^\.folio\/ledger\/|^tree\/|^assets\//.test(e.path)), approvedRecords);
  assert.deepEqual(await snapshotFiles(root), original);
});
