import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { workStatus } from '../../core/status.js';
import { viewOutline } from '../../core/view/outline.js';
import { viewReceiptList, viewNodeReceipts } from '../../core/view/receipt-view.js';
import { buildSnapshot } from '../../core/view/snapshot.js';
import { fakePacks } from '../support/fixtures.js';
import { commitMain, putVariantFile, variantWork } from '../support/variant-work.js';

async function mainDrift(root) {
  const packs = fakePacks();
  const outline = await viewOutline(root, { packs });
  const list = await viewReceiptList(root, { packs });
  const node = await viewNodeReceipts(root, { packs }, 'ep-001');
  const snapshot = await buildSnapshot(root, { packs });
  return {
    outline: outline.status.drift,
    list: list.nodes.find((item) => item.nodeId === 'ep-001').drift,
    node: node.drift,
    snapshotOutline: snapshot.work.status.drift,
    snapshotList: snapshot.receipts.nodes.find((item) => item.nodeId === 'ep-001').drift,
    snapshotNode: snapshot.receiptNodes['ep-001'].drift,
  };
}

test('main viewer projections exclude an open variant edit but still show a real original edit', async () => {
  const root = await variantWork();
  try {
    await commitMain(root, 'ep-001', 'Synthetic main text.\n');
    const mainPath = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
    const original = await readFile(mainPath, 'utf8');
    const open = await createRunner({ root, packs: fakePacks() }).run({ node: 'ep-001', variant: 'en' });
    assert.equal(open.status, 'needs_model');
    await putVariantFile(root, 'en', 'ep-001.md', 'Synthetic translator edit.\n');

    assert.equal(await readFile(mainPath, 'utf8'), original);
    assert.deepEqual((await workStatus(root, { packs: fakePacks() })).drift, [
      { nodeId: 'ep-001', code: 'CHANGED_DURING_RUN', runId: open.runId, variant: 'en' },
    ]);
    assert.deepEqual(await mainDrift(root), {
      outline: [], list: null, node: null, snapshotOutline: [], snapshotList: null, snapshotNode: null,
    });

    await writeFile(mainPath, `${original}Synthetic original hand edit.\n`);
    const sharedDrift = (await workStatus(root, { packs: fakePacks() })).drift;
    assert.equal(sharedDrift.length, 2);
    const [mainWarning, variantWarning] = sharedDrift;
    assert.deepEqual([mainWarning.nodeId, mainWarning.code, mainWarning.variant, mainWarning.recommit],
      ['ep-001', 'HAND_EDITED', undefined, true]);
    assert.notEqual(mainWarning.actual, mainWarning.expected);
    assert.deepEqual(variantWarning,
      { nodeId: 'ep-001', code: 'CHANGED_DURING_RUN', runId: open.runId, variant: 'en' });
    assert.deepEqual(await mainDrift(root), {
      outline: [{ nodeId: 'ep-001', code: 'HAND_EDITED' }],
      list: 'HAND_EDITED', node: mainWarning,
      snapshotOutline: [{ nodeId: 'ep-001', code: 'HAND_EDITED' }],
      snapshotList: 'HAND_EDITED', snapshotNode: mainWarning,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
