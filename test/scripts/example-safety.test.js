import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { buildExampleCollection } from '../../scripts/example-bundle.js';
import { assertShareable } from '../../scripts/example-files.js';
import { exportFixture, sourceSnapshot } from '../support/export-work.js';

const example = (root) => ({ id: 'synthetic', title: 'Fixture', description: 'Synthetic only', approval: 'pending', root });

test('encoded private paths and credentials fail without exposing their contents', () => {
  const inputs = [
    JSON.stringify({ path: String.raw`C:\Users\private-author\private-work` }),
    JSON.stringify({ path: 'file:///tmp/private-author/work' }),
    JSON.stringify({ token: 'hf_' + 'a'.repeat(30) }),
    '{"path":"\\u002fUsers\\u002fprivate-author\\u002fwork"}',
    JSON.stringify({ path: '/tmp/private-author/source/work.yaml' }),
  ];
  for (const input of inputs) {
    assert.throws(() => assertShareable(Buffer.from(input), 'synthetic.json', ['/tmp/private-author/source']),
      error => /Private host/.test(error.message) && !/private-author|hf_/.test(error.message));
  }
  assertShareable(Buffer.from('{"image":"assets/page.svg"}'), 'synthetic.json');
});

test('an output parent symlink into a source is rejected before any source changes', async (t) => {
  const { root, output } = await exportFixture(t);
  const alias = output('redirect');
  await symlink(root, alias, 'dir');
  const before = await sourceSnapshot(root);
  await assert.rejects(buildExampleCollection({ examples: [example(root)], output: join(alias, 'release') }), /separate/);
  assert.deepEqual(await sourceSnapshot(root), before);
  await assert.rejects(access(join(root, 'release')), { code: 'ENOENT' });
});

test('a failed build preserves files another process adds to its output', async (t) => {
  const { root, output } = await exportFixture(t);
  const target = output('partial');
  const build = buildExampleCollection({ examples: [example(root)], output: target, distDir: output('missing-dist') });
  const failure = assert.rejects(build, /partial output preserved/);
  let found = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await access(target).then(() => true, () => false)) { found = true; break; }
    await setTimeout(2);
  }
  assert.equal(found, true);
  await writeFile(join(target, 'author-note.txt'), 'Do not delete this');
  await failure;
  assert.equal(await readFile(join(target, 'author-note.txt'), 'utf8'), 'Do not delete this');
  await assert.rejects(access(join(target, 'catalog.json')), { code: 'ENOENT' });
});

test('an arbitrary source folder path is rejected from bundle content', async (t) => {
  const { root, output } = await exportFixture(t);
  await mkdir(join(root, 'sources'), { recursive: true });
  await writeFile(join(root, 'sources', 'private.json'), JSON.stringify({ path: join(root, 'work.yaml') }));
  const before = await sourceSnapshot(root);
  await assert.rejects(buildExampleCollection({ examples: [example(root)], output: output('private') }), /Private host/);
  assert.deepEqual(await sourceSnapshot(root), before);
});
