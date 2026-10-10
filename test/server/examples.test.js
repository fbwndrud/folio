import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runExamples } from '../../examples/run.js';
import { tempDir } from '../support/fixtures.js';

test('the example CLI runs through an aliased entry path and verifies a committed story', { skip: process.platform === 'win32' }, async () => {
  const dir = await tempDir('folio-example-alias-');
  const alias = join(dir, 'example.mjs');
  await symlink(join(import.meta.dirname, '..', '..', 'examples', 'run.js'), alias);
  const result = spawnSync(process.execPath, [alias, 'story', '--verify'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.verified, true);
  assert.equal(output.outputsRetained, false);
  assert.deepEqual(output.results[0].committed, ['mailbox']);
});

test('the example refuses an existing output directory without changing its contents', async () => {
  const out = await tempDir('folio-example-existing-');
  const sentinel = join(out, 'author.txt');
  await writeFile(sentinel, '작가가 보존할 내용');
  await assert.rejects(runExamples({ out }), { code: 'EEXIST' });
  assert.equal(await readFile(sentinel, 'utf8'), '작가가 보존할 내용');
});
