import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { readTree, writeTree } from '../../core/store/tree.js';
import { readEntities, writeEntity } from '../../core/store/entities.js';
import { compareNodes } from '../../core/store/position.js';
import { rebuildIndex, indexPath } from '../../core/index/rebuild.js';
import { openIndex, dumpIndex } from '../../core/index/query.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { detectDrift } from '../../core/store/drift.js';
import { sha256 } from '../../core/util/hash.js';
import { FIXTURES, fixturePath, copyFixture, seedEvents, tempDir } from '../support/fixtures.js';

test('M1-1: all four fixtures round-trip through read and write', async () => {
  for (const name of FIXTURES) {
    const tree = await readTree(fixturePath(name));
    const { entities } = await readEntities(fixturePath(name));
    const target = await tempDir();
    await writeTree(target, tree);
    for (const entity of entities.values()) await writeEntity(target, entity);
    for (const node of tree.nodes.values()) {
      assert.equal(await readFile(join(target, 'tree', node.path), 'utf8'), await readFile(join(fixturePath(name), 'tree', node.path), 'utf8'), `${name}:${node.path}`);
    }
    assert.deepEqual([...(await readTree(target)).nodes.values()], [...tree.nodes.values()], name);
  }
});

test('M1-2: nodes on different branches and levels compare correctly', async () => {
  const novel = await openWork(fixturePath('novel-3level'));
  assert.equal(compareNodes(novel.positions, 'last-night', 'funeral'), 'before');
  assert.equal(compareNodes(novel.positions, 'book-two', 'stairwell'), 'after');
  assert.equal(compareNodes(novel.positions, 'the-letter', 'rooftop-scene'), 'after');
  const book = await openWork(fixturePath('knowledge-book'));
  assert.equal(compareNodes(book.positions, 'membranes', 'tissues'), 'before');
  assert.equal(compareNodes(book.positions, 'glossary', 'tissues'), 'not_applicable');
  const game = await openWork(fixturePath('gamebook'));
  assert.equal(compareNodes(game.positions, 'gate', 'ending-key'), 'not_applicable');
});

test('M1-3: index.db rebuilt from scratch answers identically', async () => {
  for (const name of FIXTURES) {
    const root = await copyFixture(name);
    await seedEvents(root, name);
    await rebuildIndex(root);
    const read = () => { const db = openIndex(root); try { return dumpIndex(db); } finally { db.close(); } };
    const before = read();
    await rm(indexPath(root));
    await rebuildIndex(root);
    assert.deepEqual(read(), before, name);
  }
});

test('M1-4: a hand edit to committed text is detected', async () => {
  const root = await copyFixture('serial-2level');
  const work = await openWork(root);
  const ledger = openLedger(root, 'receipts');
  await ledger.append({ type: 'commit', receiptId: 'seed', nodeId: 'ep-003', variant: 'main', committedHash: sha256(work.tree.nodes.get('ep-003').body) });
  const path = join(root, 'tree/01-arc-awakening/03-ep-003.md');
  await writeFile(path, `${await readFile(path, 'utf8')}손으로 덧붙인 줄.\n`);
  assert.deepEqual(detectDrift(await openWork(root), await ledger.readAll()).map((d) => d.nodeId), ['ep-003']);
});
