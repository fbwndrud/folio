import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addSource, MAX_SOURCE_BYTES } from '../../core/sources/add.js';
import { readSources } from '../../core/store/sources.js';
import { sha256 } from '../../core/util/hash.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, tempDir } from '../support/fixtures.js';

const TEXT = '2020년 조사에서 성인의 세포는 약 37조 개로 추정됐다.\n';
const code = (promise) => promise.then(() => 'ok', (e) => e.code);

test('addSource copies a text into sources/<id>.txt once, writes the description, and never overwrites', async () => {
  const root = await copyFixture('knowledge-book');
  const out = await addSource(root, { id: 'census', title: '세포 수 조사', date: '2020', reliability: 'low', spans: [{ id: 'n1', quote: '약 37조 개로 추정됐다' }], text: TEXT });
  assert.deepEqual(out, {
    source: { id: 'census', title: '세포 수 조사', file: 'census.txt', date: '2020', reliability: 'low', spans: [{ id: 'n1', quote: '약 37조 개로 추정됐다' }] }, read: null,
  });
  assert.equal(await readFile(join(root, 'sources', 'census.txt'), 'utf8'), TEXT);
  const { sources, errors } = await readSources(root);
  assert.deepEqual([errors, sources.get('census').text, sources.get('census').reliability], [[], TEXT, 'low']);
  assert.equal(await code(addSource(root, { id: 'census', text: '다른 글' })), 'SOURCE_EXISTS');
  assert.equal(await code(addSource(root, { id: 'cell-notes', text: '다른 글' })), 'SOURCE_EXISTS');
  assert.equal(await readFile(join(root, 'sources', 'census.txt'), 'utf8'), TEXT);
  await writeFile(join(root, 'sources', 'orphan.txt'), '설명서 없는 원본');
  assert.equal(await code(addSource(root, { id: 'orphan', text: '새 글' })), 'SOURCE_IMMUTABLE');
  assert.equal(await readFile(join(root, 'sources', 'orphan.txt'), 'utf8'), '설명서 없는 원본');
  const before = await readdir(join(root, 'sources'));
  for (const [input, want] of [
    [{ id: 'bad-span', text: TEXT, spans: [{ id: 's1', quote: '없는 문장이다' }] }, 'SOURCE_SPAN_NOT_FOUND'],
    [{ id: 'dup-span', text: TEXT, spans: [{ id: 's1', quote: '약 37조' }, { id: 's1', quote: '성인의 세포' }] }, 'SOURCE_SPANS_INVALID'],
    [{ id: 'both', text: TEXT, path: '/tmp/x.txt' }, 'SOURCE_INPUT_INVALID'],
    [{ id: 'none' }, 'SOURCE_INPUT_INVALID'],
    [{ id: 'shout', text: TEXT, reliability: 'LOW' }, 'SOURCE_INPUT_INVALID'],
    [{ id: '../escape', text: TEXT }, 'ID_INVALID'], [{ id: 'a/b', text: TEXT }, 'ID_INVALID'], [{ id: '.hidden', text: TEXT }, 'ID_INVALID'],
  ]) assert.equal(await code(addSource(root, input)), want, JSON.stringify(input));
  assert.deepEqual(await readdir(join(root, 'sources')), before);
});

test('addSource reads one local file by absolute path, says what it read, and refuses links, folders, relative paths and huge files', async () => {
  const root = await copyFixture('knowledge-book');
  const outside = await tempDir('folio-n2-files-');
  const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff]);
  await writeFile(join(outside, 'Report.PDF'), pdf);
  const out = await addSource(root, { id: 'report', path: join(outside, 'Report.PDF'), spans: [{ id: 'p1', quote: '1905년에 처음 관찰했다.' }] });
  assert.deepEqual(out.read, { path: join(outside, 'Report.PDF'), bytes: pdf.length, sha256: sha256(pdf) });
  assert.equal(out.source.file, 'report.pdf');
  assert.deepEqual(await readFile(join(root, 'sources', 'report.pdf')), pdf);
  assert.equal((await readSources(root)).sources.get('report').text, null);
  await writeFile(join(outside, 'notes.tar.gz'), 'x');
  assert.equal((await addSource(root, { id: 'archive', path: join(outside, 'notes.tar.gz') })).source.file, 'archive.gz');
  await writeFile(join(outside, 'odd.weird-ext!'), 'x');
  assert.equal((await addSource(root, { id: 'odd', path: join(outside, 'odd.weird-ext!') })).source.file, 'odd.bin');
  await mkdir(join(outside, 'folder'));
  await writeFile(join(outside, 'big.txt'), Buffer.alloc(MAX_SOURCE_BYTES + 1, 0x61));
  const refusals = [['relative/x.txt', 'SOURCE_PATH_INVALID'], [join(outside, 'folder'), 'SOURCE_PATH_INVALID'], [join(outside, 'missing.txt'), 'SOURCE_PATH_INVALID'], [join(outside, 'big.txt'), 'SOURCE_TOO_LARGE']];
  if (process.platform !== 'win32') {
    await symlink(join(outside, 'Report.PDF'), join(outside, 'link.pdf'));
    refusals.push([join(outside, 'link.pdf'), 'SOURCE_PATH_INVALID']);
  }
  for (const [path, want] of refusals) assert.equal(await code(addSource(root, { id: 'refused', path })), want, path);
  assert.deepEqual((await readdir(join(root, 'sources'))).filter((name) => name.startsWith('refused')), []);
});

test('addSource refuses to write anything when sources/ is a symlink (it never follows sources/ itself out of the work)', async () => {
  const root = await copyFixture('knowledge-book');
  const outside = await tempDir('folio-n2-sources-dir-');
  await rm(join(root, 'sources'), { recursive: true, force: true });
  await symlink(outside, join(root, 'sources'));
  assert.equal(await code(addSource(root, { id: 'escape', text: 'leaked text' })), 'SOURCES_DIR_INVALID');
  assert.deepEqual(await readdir(outside), []);
  const { sources, errors } = await readSources(root);
  assert.deepEqual([errors, sources.size], [[{ code: 'SOURCES_DIR_INVALID' }], 0]);
});

test('addSource treats a .yaml source path as not allowed — it would collide with the description file name', async () => {
  const root = await copyFixture('knowledge-book');
  const outside = await tempDir('folio-n2-yaml-ext-');
  await writeFile(join(outside, 'weird.yaml'), 'title: not a description\n');
  const out = await addSource(root, { id: 'confusable', path: join(outside, 'weird.yaml') });
  assert.equal(out.source.file, 'confusable.bin');
  const { sources, errors } = await readSources(root);
  assert.deepEqual(errors, []);
  assert.equal(sources.get('confusable').file, 'confusable.bin');
  assert.deepEqual(parseYaml(await readFile(join(root, 'sources', 'confusable.yaml'), 'utf8')), { id: 'confusable', title: '', file: 'confusable.bin', spans: [] });
});

test('addSource surfaces a wx EEXIST on the original (a dangling symlink already at the copy name) as SOURCE_EXISTS, not INTERNAL_ERROR', async () => {
  const root = await copyFixture('knowledge-book');
  await symlink(join(root, 'sources', 'missing-target.txt'), join(root, 'sources', 'dangling.txt'));
  assert.equal(await code(addSource(root, { id: 'dangling', text: TEXT })), 'SOURCE_EXISTS');
  assert.equal((await readSources(root)).sources.has('dangling'), false);
});

test('addSource surfaces a wx EEXIST on the description (a dangling symlink already at <id>.yaml) as SOURCE_EXISTS, and cleans up the original it just wrote', async () => {
  const root = await copyFixture('knowledge-book');
  await symlink(join(root, 'sources', 'missing-target.yaml'), join(root, 'sources', 'ghost-meta.yaml'));
  assert.equal(await code(addSource(root, { id: 'ghost-meta', text: TEXT })), 'SOURCE_EXISTS');
  assert.equal((await readdir(join(root, 'sources'))).includes('ghost-meta.txt'), false);
});

test('addSource refuses a text source over the size cap, same code as an oversized path', async () => {
  const root = await copyFixture('knowledge-book');
  const before = await readdir(join(root, 'sources'));
  const huge = 'x'.repeat(MAX_SOURCE_BYTES + 1);
  assert.equal(await code(addSource(root, { id: 'huge-text', text: huge })), 'SOURCE_TOO_LARGE');
  assert.deepEqual(await readdir(join(root, 'sources')), before);
});

test('addSource is refused when the sources feature is off', async () => {
  const root = await copyFixture('knowledge-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features: { sources: false } }));
  const error = await addSource(root, { id: 'census', text: TEXT }).catch((e) => e);
  assert.deepEqual([error.code, error.details.feature], ['FEATURE_DISABLED', 'sources']);
});
