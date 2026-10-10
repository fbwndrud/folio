import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { detectDrift } from '../../core/store/drift.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture } from '../support/fixtures.js';

async function commitAsIs(root, nodeId) {
  const work = await openWork(root);
  const ledger = openLedger(root, 'receipts');
  await ledger.append({ type: 'commit', receiptId: `seed-${nodeId}`, nodeId, variant: 'main', committedHash: sha256(work.tree.nodes.get(nodeId).body) });
  return ledger;
}

test('an untouched committed node shows no drift', async () => {
  const root = await copyFixture('novel-3level');
  const ledger = await commitAsIs(root, 'rooftop-scene');
  assert.deepEqual(detectDrift(await openWork(root), await ledger.readAll()), []);
});

test('editing the body by hand is detected; editing the title is not', async () => {
  const root = await copyFixture('novel-3level');
  const ledger = await commitAsIs(root, 'rooftop-scene');
  const path = join(root, 'tree/01-book-one/01-the-fall/01-rooftop.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('title: 옥상', 'title: 옥상 위'));
  assert.deepEqual(detectDrift(await openWork(root), await ledger.readAll()), []);
  await writeFile(path, (await readFile(path, 'utf8')).replace('난간에', '벽에'));
  const drift = detectDrift(await openWork(root), await ledger.readAll());
  assert.deepEqual(drift.map((d) => [d.nodeId, d.code]), [['rooftop-scene', 'HAND_EDITED']]);
});

test('a committed node whose file disappeared is reported', async () => {
  const root = await copyFixture('novel-3level');
  const ledger = await commitAsIs(root, 'market');
  await rm(join(root, 'tree/02-book-two/01-after/02-market.md'));
  assert.deepEqual(detectDrift(await openWork(root), await ledger.readAll()).map((d) => d.code), ['NODE_MISSING']);
});
