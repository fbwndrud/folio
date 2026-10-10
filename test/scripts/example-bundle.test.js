import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { buildExampleCollection } from '../../scripts/example-bundle.js';
import { collectFiles, includeWorkFile } from '../../scripts/example-files.js';
import { startExamplePreview } from '../../scripts/example-preview.mjs';
import { crc32 } from '../../core/export/zip.js';
import { sha256 } from '../../core/util/hash.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { inspectWork } from '../../core/diagnostics/work.js';
import { exportFixture, sourceSnapshot } from '../support/export-work.js';
import { seedEvents, tempDir } from '../support/fixtures.js';

function unzip(bytes) {
  const files = new Map(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8), size = bytes.readUInt32LE(offset + 18);
    const length = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const path = bytes.subarray(offset + 30, offset + 30 + length).toString();
    const start = offset + 30 + length + extra, packed = bytes.subarray(start, start + size);
    const raw = method === 0 ? packed : inflateRawSync(packed);
    assert.equal(crc32(raw), bytes.readUInt32LE(offset + 14));
    files.set(path, raw); offset = start + size;
  }
  return files;
}
const example = (root, approval = 'pending') => ({ id: 'synthetic', title: '합성 예시', description: 'Synthetic only', approval, root });

test('downloaded bundle preserves original records, moves safely and exposes previews only', async (t) => {
  const { root, output } = await exportFixture(t);
  await seedEvents(root, 'gamebook');
  await mkdir(join(root, '.folio', 'runs'), { recursive: true });
  await writeFile(join(root, '.folio', 'runs', '.lock-gate.sqlite'), 'synthetic cache');
  const before = await sourceSnapshot(root);
  const result = await buildExampleCollection({ examples: [{ ...example(root), contentLicense: 'CC0-1.0' }], output: output('release') });
  assert.equal(result.published, false);
  const zip = await readFile(join(result.output, result.examples[0].filename));
  assert.equal(sha256(zip), result.examples[0].hash);
  const files = unzip(zip), bundle = JSON.parse(files.get('synthetic/manifest.json'));
  assert.equal(bundle.contentLicense, 'CC0-1.0');
  assert.match(files.get('synthetic/licenses/CC0-1.0.txt').toString(), /CC0 1.0 Universal/);
  assert.match(files.get('synthetic/studio/THIRD-PARTY-NOTICES.txt').toString(), /Eclipse Public License/);
  assert.match(files.get('synthetic/README.md').toString(), /제3자 인용/);
  assert.equal(bundle.approval, 'pending'); assert.equal(bundle.originalRecordsUnchanged, true);
  assert.ok(![...files.keys()].some(path => /\.sqlite|transcript|index\.db/.test(path)));
  for (const entry of bundle.files) assert.equal(sha256(files.get(`synthetic/${entry.path}`)), entry.hash, entry.path);
  for (const [path, bytes] of await collectFiles(root, includeWorkFile)) assert.deepEqual(files.get(`synthetic/work/${path}`), bytes, path);
  assert.deepEqual(await sourceSnapshot(root), before, 'source must remain unchanged');
  const moved = await tempDir('folio-downloaded-example-');
  for (const [path, bytes] of files) {
    const destination = join(moved, path); await mkdir(join(destination, '..'), { recursive: true }); await writeFile(destination, bytes);
  }
  const inspection = await inspectWork(join(moved, 'synthetic', 'work'), { packs: await loadBuiltinPacks() });
  assert.equal(inspection.ok, true);
  assert.match(files.get('synthetic/web/index.html').toString(), /author approval pending/);
  assert.match(unzip(files.get('synthetic/epub/book.epub')).get('OEBPS/book.xhtml').toString(), /author approval pending/);
  assert.match(files.get('synthetic/studio/index.html').toString(), /folio-example/);
  const preview = await startExamplePreview(join(moved, 'synthetic')); t.after(() => preview.close());
  assert.equal((await fetch(preview.url)).status, 200);
  const web = await fetch(`${preview.url}web/index.html`); assert.equal(web.status, 200);
  const imagePath = [...files.keys()].find(path => path.startsWith('synthetic/web/images/') && path.endsWith('.svg'));
  assert.ok(imagePath);
  const image = await fetch(`${preview.url}${imagePath.slice('synthetic/'.length)}`); assert.equal(image.status, 200);
  assert.equal((await fetch(`${preview.url}work/work.yaml`)).status, 404);
  assert.equal((await fetch(`${preview.url}api/work`)).status, 404);
  assert.equal((await fetch(`${preview.url}web/index.html`, { method: 'POST' })).status, 405);
  await symlink(join(root, 'work.yaml'), join(moved, 'synthetic', 'web', 'escape.html'));
  assert.equal((await fetch(`${preview.url}web/escape.html`)).status, 404);
  const gallery = await startExamplePreview(result.output); t.after(() => gallery.close());
  const download = await fetch(`${gallery.url}${result.examples[0].filename}`);
  assert.equal(download.headers.get('content-type'), 'application/zip');
  assert.equal(sha256(Buffer.from(await download.arrayBuffer())), result.examples[0].hash);
  assert.equal((await fetch(`${gallery.url}examples/synthetic/work/work.yaml`)).status, 404);
});

test('unsafe source, leaked location and invalid approval fail without rewriting or partial output', async (t) => {
  const { root, output } = await exportFixture(t);
  const secret = join(root, 'sources', 'leak.txt'); await writeFile(secret, '/Users/private-author/work/notes');
  const before = await sourceSnapshot(root);
  await assert.rejects(buildExampleCollection({ examples: [example(root)], output: output('leak') }), /Private host/);
  assert.deepEqual(await sourceSnapshot(root), before);
  await assert.rejects(readFile(join(output('leak'), 'catalog.json')), { code: 'ENOENT' });
  await rm(secret);
  const tx = join(root, '.folio', 'tx'); await mkdir(tx, { recursive: true });
  await writeFile(join(tx, 'journal.json'), '{broken synthetic recovery journal');
  await assert.rejects(buildExampleCollection({ examples: [example(root)], output: output('interrupted') }), /inspection/);
  assert.equal(await readFile(join(tx, 'journal.json'), 'utf8'), '{broken synthetic recovery journal');
  await rm(tx, { recursive: true }); await symlink(join(root, 'work.yaml'), secret);
  await assert.rejects(buildExampleCollection({ examples: [example(root)], output: output('link') }), /inspection/);
  await assert.rejects(buildExampleCollection({ examples: [example(root, 'approved')], output: output('invalid') }), /approval status/);
  await assert.rejects(buildExampleCollection({ examples: [example(root)], output: root }), /separate/);
});

test('an existing output is preserved and cannot be overwritten by a failed build', async (t) => {
  const { root, output } = await exportFixture(t); const folder = output('existing');
  await mkdir(folder); await writeFile(join(folder, 'author.txt'), 'Keep me');
  await assert.rejects(buildExampleCollection({ examples: [example(root)], output: folder }), { code: 'EEXIST' });
  assert.equal(await readFile(join(folder, 'author.txt'), 'utf8'), 'Keep me');
});
