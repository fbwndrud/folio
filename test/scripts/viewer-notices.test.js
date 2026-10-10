import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bundledNotices, viewerNotices, NOTICES_FILE } from '../../scripts/viewer-notices.js';
import { staticFile } from '../../server/view/static.js';
import { startExamplePreview } from '../../scripts/example-preview.mjs';
import { buildExampleCollection } from '../../scripts/example-bundle.js';
import { exportFixture } from '../support/export-work.js';
import { tempDir } from '../support/fixtures.js';

async function dependency(root, name, version = '1.0.0', license = true) {
  const directory = join(root, 'node_modules', name);
  await mkdir(join(directory, 'lib'), { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version, license: 'MIT', repository: 'https://github.com/example/synthetic.git' }));
  if (license) await writeFile(join(directory, 'LICENSE'), `Synthetic license for ${name}`);
  await writeFile(join(directory, 'NOTICE.md'), `Synthetic copyright for ${name}`);
  return join(directory, 'lib', 'index.js');
}
const chunks = (...ids) => ({ 'app.js': { type: 'chunk', modules: Object.fromEntries(ids.map(id => [id, {}])) },
  'style.css': { type: 'asset', source: 'synthetic css' } });

test('notices include full selected licenses, nested packages and notices; exclude unbundled dependencies', async () => {
  const root = await tempDir();
  const used = await dependency(root, 'used');
  await dependency(root, 'unused');
  const nested = await dependency(join(root, 'node_modules', 'used'), '@scope/nested');
  const bundle = chunks(used, nested, `\0${used}?commonjs-proxy`, join(root, 'src', 'app.js'));
  const text = await bundledNotices(bundle);
  assert.match(text, /used@1\.0\.0/);
  assert.match(text, /@scope\/nested@1\.0\.0/);
  assert.match(text, /Synthetic license for used/);
  assert.match(text, /Synthetic copyright for used/);
  assert.match(text, /https:\/\/registry\.npmjs\.org\/used\/-\/used-1\.0\.0\.tgz/);
  assert.match(text, /https:\/\/github\.com\/example\/synthetic/);
  assert.doesNotMatch(text, /unused/);
  assert.equal(text.split('used@1.0.0').length, 2, 'deduplicate multiple bundled modules from the same package');
  const emitted = [];
  await viewerNotices().generateBundle.call({ emitFile: file => emitted.push(file) }, {}, bundle);
  assert.equal(emitted[0].fileName, NOTICES_FILE);
  assert.equal(emitted[0].source, text);
});

test('missing full licenses fail the build instead of silently omitting obligations', async () => {
  const root = await tempDir(), used = await dependency(root, 'unlicensed', '1.0.0', false);
  await assert.rejects(bundledNotices(chunks(used)), /Missing full license/);
});

test('ELK source versions are pinned and an unverified upgrade fails', async () => {
  const root = await tempDir(), used = await dependency(root, 'elkjs', '0.12.0');
  const text = await bundledNotices(chunks(used));
  assert.match(text, /under EPL-2\.0/);
  assert.match(text, /kieler\/elkjs\/tree\/ff5771d7165445c42c408bb8a090c8035272218c/);
  assert.match(text, /eclipse-elk\/elk\/tree\/323312916048544e4e594eab3303cdb0d01e2929/);
  await dependency(root, 'elkjs', '0.13.0');
  await assert.rejects(bundledNotices(chunks(used)), /Update and verify ELK source availability/);
});

test('notice text is served by both viewers without widening traversal or link access', async (t) => {
  const root = await tempDir(), studio = join(root, 'studio');
  await mkdir(studio); await writeFile(join(root, 'manifest.json'), '{"version":1}');
  await writeFile(join(studio, NOTICES_FILE), 'Synthetic complete license');
  await writeFile(join(root, 'private.txt'), 'Not for preview');
  const file = await staticFile(studio, `/${NOTICES_FILE}`);
  assert.equal(file.type, 'text/plain; charset=utf-8');
  assert.equal(file.bytes.toString(), 'Synthetic complete license');
  await assert.rejects(staticFile(studio, '/..%2fprivate.txt'), { code: 'STATIC_NOT_FOUND' });
  await symlink(join(root, 'private.txt'), join(studio, 'linked.txt'));
  await assert.rejects(staticFile(studio, '/linked.txt'), { code: 'STATIC_NOT_FOUND' });
  const preview = await startExamplePreview(root); t.after(() => preview.close());
  const response = await fetch(`${preview.url}studio/${NOTICES_FILE}`);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await response.text(), 'Synthetic complete license');
  assert.equal((await fetch(`${preview.url}private.txt`)).status, 404);
  assert.equal((await fetch(`${preview.url}studio/linked.txt`)).status, 404);
  assert.equal(await readFile(join(root, 'private.txt'), 'utf8'), 'Not for preview');
});

test('complete notice bytes travel into the standalone Studio and example manifest', async (t) => {
  const { root, output } = await exportFixture(t), dist = await tempDir();
  const text = 'Synthetic full license and source availability notice';
  await writeFile(join(dist, 'index.html'), '<html><body>synthetic</body></html>');
  await writeFile(join(dist, NOTICES_FILE), text);
  const result = await buildExampleCollection({ examples: [{ id: 'synthetic', title: 'Synthetic',
    description: 'Synthetic license transport test', root, approval: 'pending' }], output: output('notices'), distDir: dist });
  const bundle = join(result.output, 'examples', 'synthetic');
  assert.equal(await readFile(join(bundle, 'studio', NOTICES_FILE), 'utf8'), text);
  const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
  assert.ok(manifest.files.some(file => file.path === `studio/${NOTICES_FILE}`));
  const preview = await startExamplePreview(bundle); t.after(() => preview.close());
  assert.equal(await fetch(`${preview.url}studio/${NOTICES_FILE}`).then(response => response.text()), text);
});
