import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { rebuildIndex } from '../../core/index/rebuild.js';
import { openIndex, dumpIndex } from '../../core/index/query.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { copyFixture, seedEvents } from '../support/fixtures.js';

function dump(root) { const db = openIndex(root); try { return dumpIndex(db); } finally { db.close(); } }
async function healthy() { const root = await copyFixture('novel-3level'); await seedEvents(root, 'novel-3level'); await rebuildIndex(root); return root; }

test('beforePublish failure preserves the healthy index', async () => {
  const root = await healthy(); const before = dump(root);
  await assert.rejects(rebuildIndex(root, { hooks: { beforePublish() { throw Error('fault'); } } }), /fault/);
  assert.deepEqual(dump(root), before);
  assert.ok(!(await readdir(join(root, '.folio'))).some((name) => name.startsWith('index-candidate-')));
});

test('duplicate event insertion failure preserves the healthy index', async () => {
  const root = await healthy(); const before = dump(root);
  const ledger = openLedger(root, 'events'); const [event] = await ledger.readAll();
  await ledger.append(event);
  await assert.rejects(rebuildIndex(root), /UNIQUE/);
  assert.deepEqual(dump(root), before);
});

test('source changes during build reject publication', async () => {
  const root = await healthy(); const before = dump(root);
  const nodePath = join(root, 'tree', before.nodes[0].path);
  await assert.rejects(rebuildIndex(root, { hooks: { async beforePublish() {
    await writeFile(nodePath, `${await readFile(nodePath, 'utf8')}\nsynthetic changed body\n`);
  } } }), { code: 'INDEX_INPUT_CHANGED' });
  assert.deepEqual(dump(root), before);
});

test('an open reader retains its generation after publication', async () => {
  const root = await healthy(); const reader = openIndex(root); const before = dumpIndex(reader);
  try {
    await openLedger(root, 'events').append({ type: 'event', eventId: 'new', nodeId: 'book-one', entityId: 'mara', kind: 'synthetic', data: {} });
    await rebuildIndex(root);
    assert.deepEqual(dumpIndex(reader), before);
    assert.equal(dump(root).events.length, before.events.length + 1);
  } finally { reader.close(); }
});

test('simulated replacement failure preserves the healthy index', async () => {
  const root = await healthy(); const before = dump(root);
  await assert.rejects(rebuildIndex(root, { hooks: { beforeReplace() { throw Object.assign(Error('replacement denied'), { code: 'EPERM' }); } } }), { code: 'EPERM' });
  assert.deepEqual(dump(root), before);
});
