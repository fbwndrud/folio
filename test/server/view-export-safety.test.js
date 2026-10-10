import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { exportViewer } from '../../server/view/export.js';
import { setupAssets, syntheticSvg } from '../support/assets.js';
import { copyFixture, fakePacks, fixturePath } from '../support/fixtures.js';

const distDir = fixturePath('viewer-dist');
const dataOf = (html) => JSON.parse(html.match(/id="folio-data">(.*?)<\/script>/s)[1]);
function intercept(t, name, replacement) {
  const original = fs[name];
  fs[name] = (...args) => replacement(original, ...args);
  syncBuiltinESMExports();
  t.after(() => { fs[name] = original; syncBuiltinESMExports(); });
}

test('export keeps approved bytes when the same image ID is replaced after snapshot', async (t) => {
  const f = await setupAssets();
  let a = await f.approve(await f.review(await f.put(await f.add())));
  a = f.ok(await f.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: ['toy-scene'] })).asset;
  let replaced = false;
  intercept(t, 'readFile', async (read, path, ...args) => {
    const bytes = await read(path, ...args);
    if (!replaced && path === join(distDir, 'app.js')) {
      replaced = true; await writeFile(f.source, syntheticSvg('red')); a = await f.put(a);
    }
    return bytes;
  });
  await exportViewer({ root: f.root, packs: f.packs, distDir });
  const data = dataOf(await readFile(join(f.root, 'exports/viewer/index.html'), 'utf8'));
  assert.equal(replaced, true); assert.equal(a.approved, false);
  assert.equal(data.nodes['toy-scene'].assets.attached[0].approved, true);
  assert.equal(Buffer.from(data.assetFiles[a.id].split(',')[1], 'base64').toString(), syntheticSvg());
});

test('export refuses missing or corrupt declared files but allows explicit no-file placeholders', async () => {
  const f = await setupAssets(); const a = await f.put(await f.add());
  f.ok(await f.asset({ op: 'attach', id: a.id, expectedRev: a.rev, nodeIds: ['toy-scene'] }));
  await writeFile(join(f.root, 'assets', a.output.file), 'corrupt');
  await assert.rejects(exportViewer({ root: f.root, packs: f.packs, distDir }), { code: 'ASSET_FILE_UNAVAILABLE' });
  const root = await copyFixture('novel-3level');
  await rm(join(root, 'assets/img-rooftop.svg'));
  await assert.rejects(exportViewer({ root, packs: fakePacks(), distDir }), { code: 'ASSET_FILE_UNAVAILABLE' });
  await writeFile(join(root, 'assets/img-rooftop.yaml'), 'id: img-rooftop\nfile: null\n');
  assert.equal((await exportViewer({ root, packs: fakePacks(), distDir })).assets, 0);
});

test('failed final rename preserves the previous export', async (t) => {
  const root = await copyFixture('novel-3level'); const options = { root, packs: fakePacks(), distDir };
  await exportViewer(options); const target = join(root, 'exports/viewer');
  await writeFile(join(target, 'previous.txt'), 'previous review');
  intercept(t, 'rename', async (rename, from, to) => {
    if (to === target && from.endsWith('.tmp')) throw new Error('synthetic rename failure');
    return rename(from, to);
  });
  await assert.rejects(exportViewer(options), /synthetic rename failure/);
  assert.equal(await readFile(join(target, 'previous.txt'), 'utf8'), 'previous review');
});

test('a target created during copying is not overwritten, and concurrent exports are rejected', async (t) => {
  const root = await copyFixture('novel-3level'); const options = { root, packs: fakePacks(), distDir };
  let injected = false;
  intercept(t, 'readFile', async (read, path, ...args) => {
    const bytes = await read(path, ...args);
    if (!injected && path === join(distDir, 'app.js')) {
      injected = true;
      await assert.rejects(exportViewer(options), { code: 'EXPORT_BUSY' });
      await mkdir(join(root, 'exports/viewer'));
    }
    return bytes;
  });
  await assert.rejects(exportViewer(options), { code: 'EXPORT_TARGET_CHANGED' });
  assert.deepEqual(await readdir(join(root, 'exports/viewer')), []);
});

test('legacy in-place mutation is rejected against the snapshot fingerprint', async (t) => {
  const root = await copyFixture('novel-3level'); let changed = false;
  intercept(t, 'readFile', async (read, path, ...args) => {
    const bytes = await read(path, ...args);
    if (!changed && path === join(distDir, 'app.js')) {
      changed = true; await writeFile(join(root, 'assets/img-rooftop.svg'), syntheticSvg('red'));
    }
    return bytes;
  });
  await assert.rejects(exportViewer({ root, packs: fakePacks(), distDir }), { code: 'ASSET_FILE_UNAVAILABLE' });
  assert.equal(changed, true);
});

test('an occupied recovery target is preserved and the old export has an explicit backup path', async (t) => {
  const root = await copyFixture('novel-3level'); const options = { root, packs: fakePacks(), distDir };
  await exportViewer(options); const target = join(root, 'exports/viewer');
  await writeFile(join(target, 'previous.txt'), 'previous review');
  intercept(t, 'rename', async (rename, from, to) => {
    if (to === target && from.endsWith('.tmp')) {
      await mkdir(target); await writeFile(join(target, 'author.txt'), 'author content');
      throw new Error('synthetic replacement failure');
    }
    return rename(from, to);
  });
  let recovery;
  await assert.rejects(exportViewer(options), (error) => {
    assert.equal(error.code, 'EXPORT_RECOVERY_REQUIRED'); recovery = error.details.backup; return true;
  });
  assert.equal(await readFile(join(recovery, 'previous.txt'), 'utf8'), 'previous review');
  assert.equal(await readFile(join(target, 'author.txt'), 'utf8'), 'author content');
});

test('a regular file at the export target is refused without reading through it', async () => {
  const root = await copyFixture('novel-3level');
  await mkdir(join(root, 'exports'));
  await writeFile(join(root, 'exports/viewer'), 'author file');
  await assert.rejects(exportViewer({ root, packs: fakePacks(), distDir }), { code: 'EXPORT_DIR_NOT_OURS' });
  assert.equal(await readFile(join(root, 'exports/viewer'), 'utf8'), 'author file');
});
