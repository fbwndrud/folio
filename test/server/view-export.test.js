import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { embedSnapshot, exportViewer, EXPORT_DIR } from '../../server/view/export.js';
import { startViewServer } from '../../server/view/http-server.js';
import { copyFixture, fakePacks, fixturePath, tempDir } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

const DIST = fixturePath('viewer-dist');
const dataOf = (html) => JSON.parse(/<script type="application\/json" id="folio-data">(.*)<\/script>/.exec(html)[1]);

test('the snapshot is embedded as inert JSON that no text can break out of', () => {
  const html = embedSnapshot('<html><body><div></div></body></html>', { text: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(html, /<\/script><script>alert/);
  assert.deepEqual(dataOf(html), { text: '</script><script>alert(1)</script>' });
  assert.throws(() => embedSnapshot('<html></html>', {}), { code: 'VIEWER_BUILD_INVALID' });
});

test('replacement tokens in prose round trip through embedded JSON', () => {
  const template = '<html><head><title>Folio</title></head><body><div>before</div></body></html>';
  for (const token of ['$&', '$`', "$'", '$$']) {
    const snapshot = { title: `제목 ${token}`, text: `본문 앞 ${token} 뒤 </script>` };
    const html = embedSnapshot(template, snapshot);
    assert.deepEqual(dataOf(html), snapshot, token);
    assert.doesNotMatch(html, /<\/script><script>/);
  }
});

test('export writes the built screens, the embedded snapshot and the pictures into exports/viewer, and replaces its own last export', async () => {
  const root = await copyFixture('novel-3level');
  const out = await exportViewer({ root, packs: fakePacks(), distDir: DIST });
  assert.deepEqual(out, { dir: EXPORT_DIR, files: 2, assets: 1 });
  const dir = join(root, EXPORT_DIR);
  assert.deepEqual((await readdir(dir)).sort(), ['.folio-export', 'app.js', 'index.html']);
  const data = dataOf(await readFile(join(dir, 'index.html'), 'utf8'));
  assert.deepEqual([data.version, data.work.title], [1, '붉은 편지']);
  assert.match(data.assetFiles['img-rooftop'], /^data:image\/svg\+xml;base64,/);
  assert.deepEqual(Buffer.from(data.assetFiles['img-rooftop'].split(',')[1], 'base64'), await readFile(join(root, 'assets', 'img-rooftop.svg')));
  await writeFile(join(dir, 'stale.txt'), 'old');
  await exportViewer({ root, packs: fakePacks(), distDir: DIST });
  assert.equal((await readdir(dir)).includes('stale.txt'), false);
  assert.deepEqual((await readdir(join(root, 'exports'))).filter((name) => name.endsWith('.tmp')), []);
});

test('script-bearing SVG stays on an opaque data URL while a raster is copied as a file', async () => {
  const root = await copyFixture('novel-3level');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>document.documentElement.dataset.test = "safe"</script></svg>');
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  await writeFile(join(root, 'assets', 'img-rooftop.svg'), svg);
  await writeFile(join(root, 'assets', 'img-pixel.png'), png);
  await writeFile(join(root, 'assets', 'img-pixel.yaml'), 'id: img-pixel\nfile: img-pixel.png\n');
  const nodePath = join(root, 'tree', '01-book-one', '01-the-fall', '01-rooftop.md');
  const node = await readFile(nodePath, 'utf8');
  await writeFile(nodePath, node.replace('  - img-rooftop', '  - img-rooftop\n  - img-pixel'));

  const out = await exportViewer({ root, packs: fakePacks(), distDir: DIST });
  assert.deepEqual(out, { dir: EXPORT_DIR, files: 3, assets: 2 });
  const dir = join(root, EXPORT_DIR);
  const data = dataOf(await readFile(join(dir, 'index.html'), 'utf8'));
  assert.match(data.assetFiles['img-rooftop'], /^data:image\/svg\+xml;base64,/);
  assert.deepEqual(Buffer.from(data.assetFiles['img-rooftop'].split(',')[1], 'base64'), svg);
  await assert.rejects(stat(join(dir, 'assets', 'img-rooftop.svg')), { code: 'ENOENT' });
  assert.equal(data.assetFiles['img-pixel'], 'assets/img-pixel.png');
  assert.deepEqual(await readFile(join(dir, 'assets', 'img-pixel.png')), png);
});

test('export never overwrites what the viewer did not make, never follows a linked exports folder, and needs a build and the feature', async () => {
  const mine = await copyFixture('novel-3level');
  await mkdir(join(mine, 'exports', 'viewer'), { recursive: true });
  await writeFile(join(mine, 'exports', 'viewer', 'notes.md'), '작가 메모');
  await assert.rejects(exportViewer({ root: mine, packs: fakePacks(), distDir: DIST }), { code: 'EXPORT_DIR_NOT_OURS' });
  assert.equal(await readFile(join(mine, 'exports', 'viewer', 'notes.md'), 'utf8'), '작가 메모');
  const linked = await copyFixture('novel-3level');
  await symlink(await tempDir('folio-elsewhere-'), join(linked, 'exports'));
  await assert.rejects(exportViewer({ root: linked, packs: fakePacks(), distDir: DIST }), { code: 'EXPORT_DIR_INVALID' });
  const bare = await copyFixture('novel-3level');
  await assert.rejects(exportViewer({ root: bare, packs: fakePacks(), distDir: await tempDir('folio-nodist-') }), (e) => e.code === 'VIEWER_NOT_BUILT' && /viewer run build/.test(e.details.hint));
  await editYaml(bare, (config) => { config.features = { viewerExport: false }; });
  await assert.rejects(exportViewer({ root: bare, packs: fakePacks(), distDir: DIST }), { code: 'FEATURE_DISABLED' });
});

test('POST /api/export runs the export with the server root', async () => {
  const root = await copyFixture('novel-3level');
  const server = await startViewServer({ root, packs: fakePacks(), distDir: DIST, onError: () => {} });
  try {
    const res = await fetch(new URL('/api/export', server.url), { method: 'POST', headers: { 'x-folio-token': server.token, 'content-type': 'application/json' }, body: '{}' });
    assert.deepEqual([res.status, (await res.json()).dir], [200, EXPORT_DIR]);
    const again = await fetch(new URL('/api/export', server.url), { headers: { 'x-folio-token': server.token } });
    assert.equal(again.status, 405);
  } finally { await server.close(); }
});
