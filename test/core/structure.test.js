import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { compareNodes } from '../../core/store/position.js';
import { addNode, wrapNodes, moveNode } from '../../core/structure/ops.js';
import { copyFixture, emptyTreeCopy } from '../support/fixtures.js';

async function scenes(root, ids) {
  for (const id of ids) await addNode(root, await openWork(root), { level: 'scene', id, title: id });
  return openWork(root);
}

test('addNode creates branches and leaves in order and renumbers siblings', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await addNode(root, await openWork(root), { level: 'book', id: 'b1', title: '1권' });
  await addNode(root, await openWork(root), { level: 'book', id: 'b0', title: '0권', index: 0 });
  await addNode(root, await openWork(root), { parentId: 'b1', level: 'chapter', id: 'c1' });
  await addNode(root, await openWork(root), { parentId: 'c1', level: 'scene', id: 's1', brief: '짧은 계획' });
  const work = await openWork(root);
  assert.deepEqual(work.tree.rootIds, ['b0', 'b1']);
  assert.equal(work.tree.nodes.get('b1').path, '02-b1/_node.md');
  const s1 = work.tree.nodes.get('s1');
  assert.deepEqual([s1.kind, s1.path, s1.status, s1.data.brief], ['leaf', '02-b1/01-c1/01-s1.md', 'draft', '짧은 계획']);
});

test('addNode refuses bad ids, duplicates, wrong depth and leaf parents', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await addNode(root, await openWork(root), { level: 'book', id: 'b1' });
  await addNode(root, await openWork(root), { parentId: 'b1', level: 'chapter', id: 'c1' });
  await addNode(root, await openWork(root), { parentId: 'c1', level: 'scene', id: 's1' });
  const work = await openWork(root);
  const tries = [
    [{ level: 'book', id: 'Bad Id' }, 'NODE_ID_INVALID'],
    [{ level: 'book', id: 'b1' }, 'DUPLICATE_ID'],
    [{ parentId: 'b1', level: 'book', id: 'bx' }, 'LEVEL_ORDER_INVALID'],
    [{ parentId: 's1', level: 'scene', id: 'sx' }, 'STRUCTURE_PARENT_NOT_BRANCH'],
    [{ level: 'ghost', id: 'gx' }, 'LEVEL_UNKNOWN'],
  ];
  for (const [input, code] of tries) await assert.rejects(addNode(root, work, input), { code });
});

test('wrapNodes groups neighbouring scenes under a new chapter, then a book', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await scenes(root, ['s1', 's2', 's3', 's4']);
  await wrapNodes(root, await openWork(root), { nodeIds: ['s1', 's2'], level: 'chapter', id: 'c1', title: '첫 장' });
  await wrapNodes(root, await openWork(root), { nodeIds: ['c1'], level: 'book', id: 'b1' });
  const work = await openWork(root);
  assert.deepEqual(work.tree.rootIds, ['b1', 's3', 's4']);
  assert.deepEqual(work.tree.nodes.get('c1').children, ['s1', 's2']);
  assert.equal(work.tree.nodes.get('s2').path, '01-b1/01-c1/02-s2.md');
  assert.equal(compareNodes(work.positions, 's2', 's3'), 'before');
  assert.equal(work.tree.nodes.get('c1').title, '첫 장');
});

test('wrapNodes refuses gaps, mixed parents and wrong levels', async () => {
  const root = await emptyTreeCopy('novel-3level');
  let work = await scenes(root, ['s1', 's2', 's3']);
  await assert.rejects(wrapNodes(root, work, { nodeIds: ['s1', 's3'], level: 'chapter', id: 'cx' }), { code: 'STRUCTURE_NOT_CONTIGUOUS' });
  await assert.rejects(wrapNodes(root, work, { nodeIds: ['s1'], level: 'scene', id: 'cx' }), { code: 'LEVEL_KIND_MISMATCH' });
  await wrapNodes(root, work, { nodeIds: ['s1'], level: 'chapter', id: 'c1' });
  work = await openWork(root);
  await assert.rejects(wrapNodes(root, work, { nodeIds: ['s1', 's2'], level: 'chapter', id: 'cy' }), { code: 'STRUCTURE_NOT_SIBLINGS' });
  await assert.rejects(wrapNodes(root, work, { nodeIds: ['c1'], level: 'chapter', id: 'cz' }), { code: 'LEVEL_ORDER_INVALID' });
});

test('moveNode keeps ids and bodies and refuses cycles', async () => {
  const root = await copyFixture('novel-3level');
  const body = (await openWork(root)).tree.nodes.get('market').body;
  await moveNode(root, await openWork(root), { nodeId: 'market', parentId: 'the-fall', index: 0 });
  const work = await openWork(root);
  assert.deepEqual(work.tree.nodes.get('the-fall').children, ['market', 'rooftop-scene', 'stairwell']);
  assert.equal(work.tree.nodes.get('market').path, '01-book-one/01-the-fall/01-market.md');
  assert.equal(work.tree.nodes.get('market').body, body);
  assert.equal(work.tree.nodes.get('funeral').path, '02-book-two/01-after/01-funeral.md');
  await assert.rejects(moveNode(root, work, { nodeId: 'book-one', parentId: 'the-fall' }), { code: 'STRUCTURE_CYCLE' });
});

test('a temp entry left by a crash keeps its node and gets its name back on the next renumber', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await scenes(root, ['s1']);
  const { rename } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await rename(join(root, 'tree', '01-s1.md'), join(root, 'tree', '~add-s1.md'));
  let work = await openWork(root);
  assert.deepEqual(work.tree.rootIds, ['s1']);
  await addNode(root, work, { level: 'scene', id: 's2' });
  work = await openWork(root);
  assert.deepEqual([work.tree.nodes.get('s1').path, work.tree.nodes.get('s2').path], ['01-s1.md', '02-s2.md']);
});

test('structure ops refuse unsafe ids before touching the disk', async () => {
  const root = await emptyTreeCopy('novel-3level');
  const work = await scenes(root, ['s1']);
  for (const id of ['../x', 'a/b', '', 'X']) {
    await assert.rejects(addNode(root, work, { level: 'scene', id }), { code: 'NODE_ID_INVALID' });
    await assert.rejects(wrapNodes(root, work, { nodeIds: ['s1'], level: 'chapter', id }), { code: 'NODE_ID_INVALID' });
  }
  assert.deepEqual((await openWork(root)).tree.rootIds, ['s1']);
});

test('an op given a stale work refuses instead of overwriting a newer entry', async () => {
  const { updateNode } = await import('../../core/store/tree.js');
  const root = await emptyTreeCopy('novel-3level');
  await scenes(root, ['a']);
  const stale = await openWork(root);
  await addNode(root, stale, { level: 'scene', id: 'c' });
  const fresh = await openWork(root);
  await updateNode(root, fresh.tree.nodes.get('c'), { data: { status: 'committed' }, body: '소중한 본문' });
  await assert.rejects(addNode(root, stale, { level: 'scene', id: 'c' }), { code: 'STRUCTURE_STALE' });
  await assert.rejects(addNode(root, stale, { level: 'scene', id: 'd', index: 0 }), { code: 'STRUCTURE_STALE' });
  await assert.rejects(wrapNodes(root, stale, { nodeIds: ['a'], level: 'chapter', id: 'c1' }), { code: 'STRUCTURE_STALE' });
  await assert.rejects(moveNode(root, stale, { nodeId: 'a', index: 1 }), { code: 'STRUCTURE_STALE' });
  const work = await openWork(root);
  assert.deepEqual(work.tree.rootIds, ['a', 'c']);
  assert.deepEqual([work.tree.nodes.get('c').body, work.tree.nodes.get('c').status], ['소중한 본문', 'committed']);
});

test('renames never replace an existing entry', async () => {
  const { safeRename } = await import('../../core/structure/fs-guard.js');
  const { writeFile, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const root = await emptyTreeCopy('novel-3level');
  await writeFile(join(root, 'tree', 'x.txt'), 'x');
  await writeFile(join(root, 'tree', 'y.txt'), 'y');
  await assert.rejects(safeRename(join(root, 'tree', 'x.txt'), join(root, 'tree', 'y.txt')), { code: 'STRUCTURE_TARGET_EXISTS' });
  assert.deepEqual([await readFile(join(root, 'tree', 'x.txt'), 'utf8'), await readFile(join(root, 'tree', 'y.txt'), 'utf8')], ['x', 'y']);
});
