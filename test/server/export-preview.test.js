import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startExportPreview, exportDirectory } from '../../server/view/export-preview.js';
import { EXPORT_MARKER } from '../../server/view/export.js';
import { fixturePath, tempDir, trackTempDir } from '../support/fixtures.js';

async function exported() {
  const root = await tempDir('folio-export-preview-');
  await writeFile(join(root, EXPORT_MARKER), 'made by the folio viewer export; synthetic fixture\n');
  await writeFile(join(root, 'index.html'), '<!doctype html><html><body>Synthetic viewer export</body></html>');
  await mkdir(join(root, 'assets'));
  return root;
}
const raw = (server, path, headers = {}) => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: server.port, path, headers }, (res) => {
    let text = ''; res.on('data', (chunk) => { text += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, text }));
  });
  req.on('error', reject); req.end();
});
const waitClosed = (server) => new Promise((resolve, reject) => {
  const guard = setTimeout(() => reject(Error('preview did not close')), 5000);
  server.closed.then(() => { clearTimeout(guard); resolve(); });
});

test('preview requires a regular recognized export marker and a regular index', async () => {
  const root = await tempDir();
  await assert.rejects(exportDirectory(root), { code: 'VIEWER_EXPORT_INVALID' });
  await writeFile(join(root, EXPORT_MARKER), 'unrecognized');
  await writeFile(join(root, 'index.html'), '<html>not an export</html>');
  await assert.rejects(exportDirectory(root), { code: 'VIEWER_EXPORT_INVALID' });
  const good = await exported();
  assert.equal(await exportDirectory(good), await import('node:fs/promises').then((fs) => fs.realpath(good)));
});

test('preview is loopback-only, has page CSP and rejects foreign Hosts, APIs and writes', async () => {
  const server = await startExportPreview(await exported());
  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await fetch(server.url);
    assert.equal(page.status, 200); assert.match(await page.text(), /Synthetic viewer export/);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal((await raw(server, '/', { host: 'foreign.example' })).status, 421);
    assert.equal((await fetch(new URL('api/work', server.url))).status, 404);
    assert.equal((await fetch(server.url, { method: 'POST', body: '{}' })).status, 405);
    const head = await fetch(server.url, { method: 'HEAD' });
    assert.equal(await head.text(), ''); assert.notEqual(head.headers.get('content-length'), '0');
  } finally { await server.close(); }
});

test('static images are served intact; links, traversal and non-export files are blocked', async () => {
  const root = await exported();
  const image = Buffer.from('synthetic raster fixture');
  for (const ext of ['jpg', 'jpeg', 'webp', 'gif', 'png']) await writeFile(join(root, 'assets', `picture.${ext}`), image);
  await symlink(fixturePath('viewer-dist/app.js'), join(root, 'assets', 'linked.js'));
  const server = await startExportPreview(root);
  try {
    for (const [ext, mime] of [['jpg', 'jpeg'], ['jpeg', 'jpeg'], ['webp', 'webp'], ['gif', 'gif'], ['png', 'png']]) {
      const res = await fetch(new URL(`assets/picture.${ext}`, server.url));
      assert.equal(res.headers.get('content-type'), `image/${mime}`);
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), image);
    }
    for (const path of ['/assets/linked.js', '/..%2fpackage.json', '/assets%5cpicture.jpg', '/work.yaml', '/.folio-export']) assert.equal((await raw(server, path)).status, 404, path);
    assert.equal(await readFile(join(root, EXPORT_MARKER), 'utf8'), 'made by the folio viewer export; synthetic fixture\n');
  } finally { await server.close(); }
});

test('idle preview closes and close remains idempotent', async () => {
  const server = await startExportPreview(await exported(), { idleMs: 30 });
  await waitClosed(server); await server.close(); await server.close();
  await assert.rejects(fetch(server.url));
});

test('replacing the selected export folder with a link does not expose another directory', async () => {
  const root = await exported();
  const server = await startExportPreview(root);
  try {
    const moved = trackTempDir(`${root}-moved`);
    await rename(root, moved);
    await symlink(fixturePath('viewer-dist'), root, 'dir');
    const res = await fetch(server.url);
    assert.equal(res.status, 400); assert.equal((await res.json()).error.code, 'VIEWER_EXPORT_INVALID');
  } finally { await server.close(); }
});
