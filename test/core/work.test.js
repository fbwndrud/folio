import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { FIXTURES, fixturePath, copyFixture } from '../support/fixtures.js';

for (const name of FIXTURES) {
  test(`openWork loads ${name}`, async () => {
    const work = await openWork(fixturePath(name));
    assert.equal(work.positions.size, work.tree.nodes.size);
    assert.ok(work.entities.size >= 2);
  });
}

test('openWork keeps block problems as data, not errors', async () => {
  const work = await openWork(fixturePath('knowledge-book'));
  assert.equal(work.blocks.problems.length, 1);
  assert.equal(work.sources.size, 1);
});

test('openWork rejects a broken work with every error listed', async () => {
  const root = await copyFixture('novel-3level');
  await writeFile(join(root, 'tree/02-book-two/01-after/03-dup.md'), '---\nid: market\nlevel: scene\n---\nx\n');
  await assert.rejects(openWork(root), (error) => error.code === 'WORK_INVALID' && error.details.errors.some((e) => e.code === 'DUPLICATE_ID'));
});

test('openWork reads a checkout whose files all use CRLF (Windows autocrlf) and keeps bodies as stored', async () => {
  const lf = await openWork(fixturePath('novel-3level'));
  const root = await copyFixture('novel-3level');
  const files = (await readdir(root, { recursive: true })).filter((f) => /\.(md|ya?ml)$/.test(f));
  assert.ok(files.length > 3);
  for (const file of files) {
    const path = join(root, file);
    await writeFile(path, (await readFile(path, 'utf8')).replace(/\n/g, '\r\n'));
  }
  const crlf = await openWork(root);
  assert.deepEqual([...crlf.tree.nodes.keys()], [...lf.tree.nodes.keys()]);
  assert.deepEqual([...crlf.entities.keys()], [...lf.entities.keys()]);
  for (const [id, node] of lf.tree.nodes) {
    const other = crlf.tree.nodes.get(id);
    assert.equal(other.body, node.body.replace(/\n/g, '\r\n'));
    assert.equal(other.level, node.level);
    assert.equal(other.status, node.status);
  }
});
