import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, realpath, rename, rm, stat, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readVibelore, VIBELORE_LIMITS } from '../../core/import/read-source.js';
import { mapVibelore } from '../../core/import/map-source.js';
import { readFileSafe, verifyPath } from '../../core/import/source-safety.js';
import { tempDir } from '../support/fixtures.js';
import { vibeloreCopy } from '../support/import-source.js';

const code = (promise) => promise.then(() => 'ok', (error) => error.code);
const posix = { skip: process.platform === 'win32' ? 'POSIX links only' : false };

test('the root link cannot be hidden behind a trailing separator or dot', posix, async () => {
  const source = await vibeloreCopy();
  const link = join(await tempDir(), 'source-link');
  await symlink(source, link);
  assert.equal(await code(readVibelore(`${link}/`)), 'IMPORT_FROM_INVALID');
  assert.equal(await code(readVibelore(`${link}/.`)), 'IMPORT_FROM_INVALID');
});

test('intermediate links never expose arcs or pictures from outside', posix, async () => {
  const source = await vibeloreCopy();
  const outside = await tempDir();
  await mkdir(join(outside, 'arcs'));
  await writeFile(join(outside, 'arcs', '99.json'), '{"title":"EXTERNAL_ARC"}');
  await rm(join(source, '.vibelore'), { recursive: true });
  await symlink(outside, join(source, '.vibelore'));
  await mkdir(join(outside, 'episodes', '1-wt-outside'), { recursive: true });
  await writeFile(join(outside, 'episodes', '1-wt-outside', 'episode.svg'), '<svg>EXTERNAL_PICTURE</svg>');
  await rm(join(source, 'webtoon'), { recursive: true });
  await symlink(outside, join(source, 'webtoon'));
  const read = await readVibelore(source);
  assert.deepEqual(read.arcs, []);
  assert.deepEqual(read.pictures, []);
  assert.ok(read.warnings.some((warning) => warning.path === '.vibelore' && warning.reason === 'link'));
  assert.ok(read.warnings.some((warning) => warning.path === 'webtoon' && warning.reason === 'link'));
  assert.ok(!JSON.stringify(read).includes('EXTERNAL_'));
});

test('a parent replaced after its first inspection is rejected before file open', posix, async () => {
  const source = await realpath(await vibeloreCopy());
  const outside = await tempDir();
  await writeFile(join(outside, '001.md'), 'EXTERNAL_AFTER_SWAP');
  const root = await lstat(source);
  const state = /** @type {any} */ ({
    from: source, warnings: [], files: 0, entries: 0, bytes: 0,
    fileExhausted: false, scanExhausted: false,
    identities: new Map([['', `${root.dev}:${root.ino}:${root.mode & 0o170000}`]]),
  });
  assert.ok(await verifyPath(state, 'chapters', 'directory'));
  await rename(join(source, 'chapters'), join(source, 'old-chapters'));
  await symlink(outside, join(source, 'chapters'));
  assert.equal(await readFileSafe(state, 'chapters/001.md', VIBELORE_LIMITS.text), null);
  assert.ok(state.warnings.some((warning) => warning.path === 'chapters' && warning.reason === 'link'));
});

test('the file count ends additional file reads with one warning', async () => {
  const source = await realpath(await vibeloreCopy());
  const root = await lstat(source);
  const state = /** @type {any} */ ({
    from: source, warnings: [], files: VIBELORE_LIMITS.files, entries: 0, bytes: 0,
    fileExhausted: false, scanExhausted: false,
    identities: new Map([['', `${root.dev}:${root.ino}:${root.mode & 0o170000}`]]),
  });
  assert.equal(await readFileSafe(state, 'chapters/001.md', VIBELORE_LIMITS.text), null);
  assert.equal(state.fileExhausted, true);
  assert.deepEqual(state.warnings.map((warning) => warning.code), ['IMPORT_TOO_MANY_FILES']);
});

test('all retained source bytes share one budget; overflow fails reading', async () => {
  const source = await vibeloreCopy();
  for (let index = 0; index < 4; index += 1) {
    const dir = join(source, 'webtoon', 'episodes', `1-wt-extra${index}`);
    await mkdir(dir);
    await writeFile(join(dir, 'episode.svg'), '');
    await truncate(join(dir, 'episode.svg'), VIBELORE_LIMITS.svg);
  }
  assert.equal(await code(readVibelore(source)), 'IMPORT_SOURCE_TOO_LARGE');
  assert.equal(VIBELORE_LIMITS.totalBytes, 64 * 1024 * 1024);
});

test('directory entries and warning details have independent budgets', async () => {
  const source = await vibeloreCopy();
  const chapters = join(source, 'chapters');
  for (let index = 0; index < 10_100; index += 1) {
    await writeFile(join(chapters, `ignored-${String(index).padStart(5, '0')}.txt`), '');
  }
  const mtime = (await stat(join(chapters, '001.md'))).mtimeMs;
  const read = await readVibelore(source);
  assert.ok(read.warnings.length <= VIBELORE_LIMITS.warnings);
  assert.ok(read.warnings.some((warning) => warning.code === 'IMPORT_TOO_MANY_ENTRIES'));
  assert.ok(read.warnings.some((warning) => warning.code === 'IMPORT_WARNINGS_TRUNCATED'));
  const mapped = mapVibelore({ ...read, chapters: read.chapters.map((chapter, index) => index === 0
    ? { ...chapter, text: '---\nchapter: [\n---\n합성 본문\n' } : chapter) });
  assert.equal(mapped.warnings.length, VIBELORE_LIMITS.warnings);
  assert.deepEqual(mapped.warnings, read.warnings, '매핑 경고는 읽기 단계에서 찬 예산을 늘리지 않는다');
  assert.equal(VIBELORE_LIMITS.entries, 10_000);
  assert.equal((await stat(join(chapters, '001.md'))).mtimeMs, mtime);
});
