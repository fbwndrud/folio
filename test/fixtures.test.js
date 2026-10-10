import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const FIXTURES = ['novel-3level', 'serial-2level', 'knowledge-book', 'gamebook'];

async function* markdown(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* markdown(path);
    else if (entry.name.endsWith('.md')) yield path;
  }
}

for (const name of FIXTURES) {
  test(`fixture ${name} has a work.yaml, a tree and unique node ids`, async () => {
    const root = join('test/fixtures', name);
    assert.ok((await stat(join(root, 'work.yaml'))).isFile());
    const ids = [];
    for await (const file of markdown(join(root, 'tree'))) {
      const text = await readFile(file, 'utf8');
      assert.ok(text.startsWith('---\n'), `${file} has no frontmatter`);
      const id = /\nid: ([^\n]+)\n/.exec(`\n${text}`)?.[1];
      assert.ok(id, `${file} has no id`);
      ids.push(id);
    }
    assert.ok(ids.length >= 6, `${name} has only ${ids.length} nodes`);
    assert.equal(new Set(ids).size, ids.length, `${name} has duplicate ids`);
    assert.ok((await stat(join('test/fixtures/seeds', `${name}.events.yaml`))).isFile());
  });
}
