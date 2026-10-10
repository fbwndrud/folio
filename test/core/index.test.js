import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { rebuildIndex, indexPath } from '../../core/index/rebuild.js';
import { openIndex, dumpIndex, nodesInReadingOrder, usagesOf, eventsFor, compareInIndex } from '../../core/index/query.js';
import { scanMentions } from '../../core/index/scan.js';
import { FIXTURES, copyFixture, seedEvents } from '../support/fixtures.js';

async function snapshot(root) {
  const db = openIndex(root);
  try {
    const entityIds = dumpIndex(db).entities.map((e) => e.id);
    return {
      dump: dumpIndex(db),
      order: nodesInReadingOrder(db),
      usages: Object.fromEntries(entityIds.map((id) => [id, usagesOf(db, id)])),
      events: Object.fromEntries(entityIds.map((id) => [id, eventsFor(db, id)])),
    };
  } finally { db.close(); }
}

test('scanMentions prefers longer aliases and never double counts', () => {
  const entities = [{ id: 'mara', name: '마라', aliases: ['마라 언니'] }, { id: 'junho', name: '준호', aliases: [] }];
  const counts = scanMentions('마라 언니와 준호, 그리고 마라.', entities);
  assert.deepEqual(Object.fromEntries(counts), { mara: 2, junho: 1 });
});

test('the index answers reading order, usages, events and comparisons', async () => {
  const root = await copyFixture('novel-3level');
  await seedEvents(root, 'novel-3level');
  const { counts } = await rebuildIndex(root);
  assert.equal(counts.nodes, 11);
  assert.equal(counts.events, 3);
  const db = openIndex(root);
  try {
    assert.deepEqual(nodesInReadingOrder(db).slice(0, 3), ['book-one', 'the-fall', 'rooftop-scene']);
    const maraSurfaces = usagesOf(db, 'mara').map((u) => `${u.surfaceKind}:${u.surfaceId}:${u.origin}`);
    assert.deepEqual(dumpIndex(db).assets.map(({ id, path, storage }) => ({ id, path, storage })),
      [{ id: 'img-rooftop', path: 'assets/img-rooftop.yaml', storage: 'file' }]);
    for (const expected of ['node:book-one:scan', 'node:rooftop-scene:declared', 'node:stairwell:scan', 'node:funeral:scan', 'asset:img-rooftop:declared']) {
      assert.ok(maraSurfaces.includes(expected), `${expected} missing from ${maraSurfaces}`);
    }
    assert.ok(!maraSurfaces.includes('node:market:scan'));
    assert.deepEqual(eventsFor(db, 'red-letter').map((e) => e.kind), ['promise.resolved', 'promise.planted']);
    assert.equal(compareInIndex(db, 'rooftop-scene', 'funeral'), 'before');
  } finally { db.close(); }
});

test('links and block references are projected', async () => {
  const game = await copyFixture('gamebook');
  await rebuildIndex(game);
  const book = await copyFixture('knowledge-book');
  await rebuildIndex(book);
  const g = openIndex(game);
  const k = openIndex(book);
  try {
    assert.equal(dumpIndex(g).links.length, 4);
    assert.ok(dumpIndex(g).links.every((l) => l.valid === 1));
    assert.deepEqual(dumpIndex(k).block_refs.filter((r) => r.valid === 0).map((r) => r.target), ['fig-9-9']);
    assert.equal(compareInIndex(k, 'preface', 'membranes'), 'not_applicable');
  } finally { g.close(); k.close(); }
});

for (const name of FIXTURES) {
  test(`deleting index.db and rebuilding gives identical results (${name})`, async () => {
    const root = await copyFixture(name);
    await seedEvents(root, name);
    await rebuildIndex(root);
    const first = await snapshot(root);
    await rm(indexPath(root));
    await rebuildIndex(root);
    assert.deepEqual(await snapshot(root), first);
  });
}

test('a corrupted index.db is simply replaced', async () => {
  const root = await copyFixture('serial-2level');
  await rebuildIndex(root);
  await writeFile(indexPath(root), 'not a database');
  await rebuildIndex(root);
  const db = openIndex(root);
  try { assert.equal(nodesInReadingOrder(db).length, 8); } finally { db.close(); }
});
