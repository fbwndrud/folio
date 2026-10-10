import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readVibelore, VIBELORE_LIMITS } from '../../core/import/read-source.js';
import { tempDir } from '../support/fixtures.js';
import { treeHashes, VIBELORE_FIXTURE, vibeloreCopy } from '../support/import-source.js';

const code = (promise) => promise.then(() => 'ok', (e) => e.code);
const posix = { skip: process.platform === 'win32' ? 'links and FIFOs are POSIX-only' : false };

test('readVibelore reads only the known places and names, and never changes the source', async () => {
  const before = await treeHashes(VIBELORE_FIXTURE);
  const beforeMtime = await stat(join(VIBELORE_FIXTURE, 'chapters', '001.md'));
  const read = await readVibelore(VIBELORE_FIXTURE);
  assert.deepEqual(read.chapters.map((c) => [c.number, c.path]), [[1, 'chapters/001.md'], [2, 'chapters/002.md'], [3, 'chapters/003.md'], [4, 'chapters/004.md']]);
  assert.match(read.chapters[0].sha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(read.characters.map((c) => c.path), ['characters/c1.md', 'characters/c2.md']);
  assert.deepEqual(read.world.map((c) => c.path), ['world/setting.md']);
  assert.deepEqual(read.arcs.map((a) => [a.number, a.json.status]), [[1, 'rejected'], [2, 'active']]);
  assert.deepEqual(read.receipts.map((r) => [r.chapter, r.path]), [[1, '.vibelore/check-receipts/check-0001aaaa.json'], [2, '.vibelore/check-receipts/check-0002bbbb.json']]);
  assert.deepEqual(Object.keys(read.receipts[0]), ['path', 'sha256', 'chapter'], 'the verdict is never read into the import');
  assert.deepEqual(read.pictures.map((p) => [p.episode, p.path]), [[1, 'webtoon/episodes/1-wt-aaaa1111/episode.svg'], [1, 'webtoon/episodes/1-wt-bbbb2222/episode.svg']]);
  assert.deepEqual(read.warnings, []);
  assert.deepEqual(await treeHashes(VIBELORE_FIXTURE), before);
  assert.equal((await stat(join(VIBELORE_FIXTURE, 'chapters', '001.md'))).mtimeMs, beforeMtime.mtimeMs);
});

test('readVibelore refuses a relative, missing, linked or chapterless source', async () => {
  assert.equal(await code(readVibelore('relative/source')), 'IMPORT_FROM_INVALID');
  assert.equal(await code(readVibelore(join(await tempDir(), 'nope'))), 'IMPORT_FROM_INVALID');
  const empty = await tempDir('folio-vibelore-empty-');
  await mkdir(join(empty, 'chapters'));
  assert.equal(await code(readVibelore(empty)), 'IMPORT_FROM_EMPTY');
  if (process.platform !== 'win32') {
    const link = join(await tempDir(), 'link');
    await symlink(VIBELORE_FIXTURE, link);
    assert.equal(await code(readVibelore(link)), 'IMPORT_FROM_INVALID');
  }
});

test('links, FIFOs, odd names and oversized files inside the source are skipped with a warning, never followed', posix, async () => {
  const source = await vibeloreCopy();
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'secret.md'), '---\nchapter: 9\n---\n작품 밖 비밀\n');
  await rm(join(source, 'chapters', '002.md'));
  await symlink(join(outside, 'secret.md'), join(source, 'chapters', '002.md'));
  await rm(join(source, 'characters'), { recursive: true });
  await mkdir(join(outside, 'people'));
  await writeFile(join(outside, 'people', 'x.md'), '---\nid: x\nname: 밖\n---\n');
  await symlink(join(outside, 'people'), join(source, 'characters'));
  execFileSync('mkfifo', [join(source, 'chapters', '005.md')]);
  await writeFile(join(source, 'chapters', '006.md'), 'x'.repeat(VIBELORE_LIMITS.text + 1));
  await writeFile(join(source, 'chapters', 'notes.md'), '이름 규칙 밖');
  const svg = join(source, 'webtoon', 'episodes', '1-wt-bbbb2222', 'episode.svg');
  await rm(svg);
  await symlink(join(outside, 'secret.md'), svg);
  const read = await readVibelore(source);
  assert.deepEqual(read.chapters.map((c) => c.number), [1, 3, 4]);
  assert.deepEqual(read.characters, []);
  assert.deepEqual(read.pictures.map((p) => p.path), ['webtoon/episodes/1-wt-aaaa1111/episode.svg']);
  assert.deepEqual(read.warnings.map((w) => [w.code, w.path, w.reason ?? null]), [
    ['IMPORT_ENTRY_SKIPPED', 'chapters/002.md', 'link'],
    ['IMPORT_ENTRY_SKIPPED', 'chapters/005.md', 'not a file'],
    ['IMPORT_FILE_TOO_LARGE', 'chapters/006.md', null],
    ['IMPORT_ENTRY_SKIPPED', 'chapters/notes.md', 'name'],
    ['IMPORT_ENTRY_SKIPPED', 'characters', 'link'],
    ['IMPORT_ENTRY_SKIPPED', 'webtoon/episodes/1-wt-bbbb2222/episode.svg', 'link'],
  ]);
  assert.ok(!JSON.stringify(read.chapters).includes('비밀'));
});
