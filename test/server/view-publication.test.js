import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { startViewServer } from '../../server/view/http-server.js';
import { viewPublication, downloadPublication } from '../../core/view/publication-view.js';
import { bundlePublication } from '../../core/export/export-work.js';
import { exportFixture, sourceSnapshot, CLOCK } from '../support/export-work.js';
import { copyFixture, fixturePath, fakePacks } from '../support/fixtures.js';

function unzip(bytes) {
  const files = new Map(); let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const method = bytes.readUInt16LE(at + 8), size = bytes.readUInt32LE(at + 18), length = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + length).toString(); const start = at + 30 + length + extra;
    const packed = bytes.subarray(start, start + size); files.set(name, method ? inflateRawSync(packed) : packed); at = start + size;
  }
  return files;
}
test('viewer publication downloads complete bounded Web ZIP and EPUB without output paths or source writes', async (t) => {
  const f = await exportFixture(t), before = await sourceSnapshot(f.root);
  const server = await startViewServer({ root: f.root, packs: fakePacks(), distDir: fixturePath('viewer-dist') }); t.after(() => server.close());
  const call = (path, options = {}) => fetch(new URL(path, server.url), { ...options, headers: { 'x-folio-token': server.token, ...options.headers } });
  const summary = await (await call('/api/publication')).json(); assert.equal(summary.nodes, 4); assert.equal(summary.assets, 1);
  for (const format of ['web', 'epub']) {
    const response = await call(`/api/publication/${format}`); assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), format === 'web' ? 'application/zip' : 'application/epub+zip');
    const files = unzip(Buffer.from(await response.arrayBuffer()));
    assert.ok(files.has(format === 'web' ? 'index.html' : 'OEBPS/book.xhtml'));
    if (format === 'web') assert.ok(files.has('manifest.json') && files.has('images/image-0.svg'));
  }
  assert.equal((await fetch(new URL('/api/publication/epub', server.url))).status, 401);
  assert.equal((await call('/api/publication/pdf')).status, 404);
  assert.equal((await call('/api/publication/epub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 405);
  assert.deepEqual(await sourceSnapshot(f.root), before);
});
test('hierarchical publication preserves group titles, body order and every nav target, excluding parent planning prose', async (t) => {
  const root = await copyFixture('novel-3level');
  const { openWork } = await import('../../core/store/work.js');
  const { rm } = await import('node:fs/promises'); t.after(() => rm(root, { recursive: true, force: true }));
  const work = await openWork(root), before = await sourceSnapshot(root);
  const { files, manifest } = await bundlePublication({ root, format: 'epub', now: CLOCK });
  const bookFiles = unzip(files.get('book.epub')), book = bookFiles.get('OEBPS/book.xhtml').toString(), nav = bookFiles.get('OEBPS/nav.xhtml').toString();
  assert.equal(manifest.contents[0].kind, 'group'); assert.ok(nav.includes('<ol><li>'));
  for (const [, id] of nav.matchAll(/href="book.xhtml#([^"]+)"/g)) assert.ok(book.includes(`id="${id}"`), id);
  const nonleaf = [...work.tree.nodes.values()].filter((n) => n.kind !== 'leaf');
  for (const node of nonleaf) { assert.ok(book.includes(node.title)); if (node.body.trim()) assert.ok(!book.includes(node.body.trim())); }
  for (const entry of manifest.nodes) assert.equal(entry.bodyHash, (await import('../../core/util/hash.js')).sha256(work.tree.nodes.get(entry.id).body));
  const web = unzip((await downloadPublication(root, 'web')).bytes).get('index.html').toString();
  for (const [, id] of web.matchAll(/href="#(group-[^"]+)"/g)) assert.ok(web.includes(`id="${id}"`));
  assert.deepEqual(await sourceSnapshot(root), before); assert.ok((await viewPublication(root)).contents.length);
});
