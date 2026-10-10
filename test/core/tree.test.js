import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rename, rm, writeFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { readTree, writeTree, preorder, ancestorsOf } from '../../core/store/tree.js';
import { validateTreeLevels } from '../../core/store/tree-levels.js';
import { loadWorkConfig } from '../../core/work/config.js';
import { FIXTURES, fixturePath, copyFixture, tempDir } from '../support/fixtures.js';

async function mdFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) out.push(relative(dir, join(entry.parentPath, entry.name)));
  }
  return out.sort();
}

test('readTree builds nested nodes with stable ids, kinds and parents', async () => {
  const tree = await readTree(fixturePath('novel-3level'));
  assert.deepEqual(tree.errors, []);
  assert.deepEqual(tree.rootIds, ['book-one', 'book-two']);
  assert.deepEqual(tree.nodes.get('book-one').children, ['the-fall', 'the-letter']);
  const scene = tree.nodes.get('rooftop-scene');
  assert.equal(scene.kind, 'leaf');
  assert.equal(scene.parentId, 'the-fall');
  assert.equal(scene.path, '01-book-one/01-the-fall/01-rooftop.md');
  assert.equal(scene.role, 'body');
  assert.equal(scene.status, 'draft');
  assert.deepEqual(scene.entities, ['mara', 'rooftop']);
  assert.deepEqual(scene.assets, ['img-rooftop']);
  assert.equal(tree.nodes.get('the-fall').kind, 'branch');
  assert.equal(tree.nodes.get('the-fall').path, '01-book-one/01-the-fall/_node.md');
  assert.deepEqual(preorder(tree), [
    'book-one', 'the-fall', 'rooftop-scene', 'stairwell', 'the-letter', 'post-office', 'last-night',
    'book-two', 'after', 'funeral', 'market',
  ]);
  assert.deepEqual(ancestorsOf(tree, 'funeral').map((n) => n.id), ['after', 'book-two']);
});

test('gamebook links are read as a table of choices', async () => {
  const tree = await readTree(fixturePath('gamebook'));
  assert.deepEqual(tree.nodes.get('gate').links, [
    { to: 'left-path', kind: 'choice', label: '왼쪽 길' },
    { to: 'right-path', kind: 'choice', label: '오른쪽 길' },
  ]);
});

test('renaming a folder keeps the node id', async () => {
  const root = await copyFixture('novel-3level');
  await rename(join(root, 'tree/01-book-one/01-the-fall'), join(root, 'tree/01-book-one/01-renamed'));
  const tree = await readTree(root);
  assert.equal(tree.nodes.get('the-fall').path, '01-book-one/01-renamed/_node.md');
  assert.equal(tree.nodes.get('rooftop-scene').parentId, 'the-fall');
});

test('duplicate ids, missing _node.md and bad links are errors', async () => {
  const root = await tempDir('folio-tree-');
  await mkdir(join(root, 'tree/01-empty'), { recursive: true });
  await writeFile(join(root, 'tree/02-a.md'), '---\nid: a\nlevel: scene\n---\nx\n');
  await writeFile(join(root, 'tree/03-a.md'), '---\nid: a\nlevel: scene\n---\ny\n');
  await writeFile(join(root, 'tree/04-b.md'), '---\nid: b\nlevel: scene\nlinks:\n  - kind: choice\n---\nz\n');
  const codes = (await readTree(root)).errors.map((e) => e.code).sort();
  assert.deepEqual(codes, ['DUPLICATE_ID', 'LINK_INVALID', 'NODE_FILE_MISSING']);
});

for (const name of FIXTURES) {
  test(`round trip of ${name} is identical in model and bytes`, async () => {
    const source = fixturePath(name);
    const first = await readTree(source);
    assert.deepEqual(first.errors, []);
    const target = await tempDir(`folio-rt-${name}-`);
    await writeTree(target, first);
    const second = await readTree(target);
    assert.deepEqual([...second.nodes.values()], [...first.nodes.values()]);
    const files = await mdFiles(join(source, 'tree'));
    assert.deepEqual(await mdFiles(join(target, 'tree')), files);
    for (const file of files) {
      assert.equal(await readFile(join(target, 'tree', file), 'utf8'), await readFile(join(source, 'tree', file), 'utf8'), file);
    }
  });
}

test('validateTreeLevels accepts every fixture', async () => {
  for (const name of FIXTURES) {
    const { config } = await loadWorkConfig(fixturePath(name));
    assert.deepEqual(validateTreeLevels(await readTree(fixturePath(name)), config).errors, [], name);
  }
});

test('validateTreeLevels reports kind and depth mistakes', async () => {
  const root = await copyFixture('novel-3level');
  const { config } = await loadWorkConfig(root);
  await writeFile(join(root, 'tree/02-book-two/03-loose.md'), '---\nid: loose\nlevel: chapter\n---\nx\n');
  await mkdir(join(root, 'tree/02-book-two/04-deep'));
  await writeFile(join(root, 'tree/02-book-two/04-deep/_node.md'), '---\nid: deep\nlevel: book\n---\nx\n');
  await writeFile(join(root, 'tree/03-ghost.md'), '---\nid: ghost\nlevel: ghost\n---\nx\n');
  await rm(join(root, 'tree/02-book-two/01-after'), { recursive: true });
  const { errors, warnings } = validateTreeLevels(await readTree(root), config);
  assert.deepEqual(errors.map((e) => `${e.code}:${e.id}`).sort(), [
    'LEVEL_KIND_MISMATCH:loose', 'LEVEL_ORDER_INVALID:deep', 'LEVEL_UNKNOWN:ghost',
  ]);
  assert.deepEqual(warnings, []);
});
