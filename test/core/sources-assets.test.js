import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { readSources, writeSourceMeta, addSourceFile } from '../../core/store/sources.js';
import { readAssets, writeAssetMeta, assetRefsInBody } from '../../core/store/assets.js';
import { fixturePath, copyFixture, tempDir } from '../support/fixtures.js';

test('sources load metadata and hash the untouched original', async () => {
  const { sources, errors } = await readSources(fixturePath('knowledge-book'));
  assert.deepEqual(errors, []);
  const notes = sources.get('cell-notes');
  assert.equal(notes.reliability, 'medium');
  assert.equal(notes.spans[0].id, 's1');
  assert.match(notes.rev, /^sha256:/);
  const target = await tempDir();
  await writeSourceMeta(target, notes);
  assert.equal(await readFile(join(target, notes.path), 'utf8'), await readFile(join(fixturePath('knowledge-book'), notes.path), 'utf8'));
});

test('source originals are never overwritten and must exist', async () => {
  const root = await copyFixture('knowledge-book');
  await assert.rejects(addSourceFile(root, 'cell-notes.txt', Buffer.from('changed')), { code: 'SOURCE_IMMUTABLE' });
  await addSourceFile(root, 'new.txt', Buffer.from('fresh'));
  assert.equal(await readFile(join(root, 'sources/new.txt'), 'utf8'), 'fresh');
  await rm(join(root, 'sources/cell-notes.txt'));
  assert.deepEqual((await readSources(root)).errors.map((e) => e.code), ['SOURCE_FILE_MISSING']);
});

test('a symlinked sources/ is reported invalid, not read through or written through', async () => {
  const root = await copyFixture('knowledge-book');
  const outside = await tempDir('folio-n2-sources-symlink-');
  await rm(join(root, 'sources'), { recursive: true, force: true });
  await symlink(outside, join(root, 'sources'));
  const { sources, errors } = await readSources(root);
  assert.deepEqual([errors, sources.size], [[{ code: 'SOURCES_DIR_INVALID' }], 0]);
  await assert.rejects(addSourceFile(root, 'escape.txt', Buffer.from('leaked')), { code: 'SOURCES_DIR_INVALID' });
  await assert.rejects(writeSourceMeta(root, { id: 'escape', meta: {} }), { code: 'SOURCES_DIR_INVALID' });
  assert.deepEqual(await readdir(outside), []);
});

test('writeSourceMeta rejects a path-traversal id and an unsafe explicit path', async () => {
  const target = await tempDir();
  await assert.rejects(
    writeSourceMeta(target, { id: '../evil', meta: {} }),
    { code: 'ID_INVALID' },
  );
  await assert.rejects(
    writeSourceMeta(target, { id: 'ok', path: '../evil.yaml', meta: {} }),
    { code: 'PATH_INVALID' },
  );
  await assert.rejects(access(join(dirname(target), 'evil.yaml')), { code: 'ENOENT' });
});

test('writeSourceMeta only accepts a path of the form sources/<name>.yaml, name following the source-name rule', async () => {
  const target = await tempDir();
  await writeSourceMeta(target, { id: 'ok', path: 'sources/ok.yaml', meta: { id: 'ok' } });
  assert.equal(await readFile(join(target, 'sources/ok.yaml'), 'utf8'), 'id: ok\n');
  for (const path of ['checks/ok.yaml', 'sources/Ok.yaml', 'sources/ok.yml', 'sources/../ok.yaml', 'sources/ok', 'sources/.yaml']) {
    await assert.rejects(writeSourceMeta(target, { id: 'ok', path, meta: {} }), { code: 'PATH_INVALID' }, path);
  }
});

test('assets load briefs and inline references', async () => {
  const { assets, errors } = await readAssets(fixturePath('novel-3level'));
  assert.deepEqual(errors, []);
  const image = assets.get('img-rooftop');
  assert.deepEqual(image.brief.mustShow, ['난간에 기댄 마라']);
  assert.deepEqual(image.entities, ['mara', 'rooftop']);
  assert.deepEqual(assetRefsInBody('a ![[asset:img-rooftop]] b ![[asset:x-2]]'), ['img-rooftop', 'x-2']);
  const target = await tempDir();
  await writeAssetMeta(target, image);
  assert.equal(await readFile(join(target, image.path), 'utf8'), await readFile(join(fixturePath('novel-3level'), image.path), 'utf8'));
});

test('a missing image file is a warning, not an error', async () => {
  const root = await copyFixture('novel-3level');
  await rm(join(root, 'assets/img-rooftop.svg'));
  const { errors, warnings } = await readAssets(root);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings.map((w) => w.code), ['ASSET_FILE_MISSING']);
});

test('writeAssetMeta rejects a path-traversal id and an unsafe explicit path', async () => {
  const target = await tempDir();
  await assert.rejects(
    writeAssetMeta(target, { id: '../evil', meta: {} }),
    { code: 'ID_INVALID' },
  );
  await assert.rejects(
    writeAssetMeta(target, { id: 'ok', path: '../evil.yaml', meta: {} }),
    { code: 'PATH_INVALID' },
  );
  await assert.rejects(access(join(dirname(target), 'evil.yaml')), { code: 'ENOENT' });
});
