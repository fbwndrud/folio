import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initWork } from '../../core/work/init.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { parseYaml } from '../../core/util/yaml.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { tempDir } from '../support/fixtures.js';
import { fakePack } from '../support/fake-pack.js';

test('initWork creates a work from a pack preset and it opens', async () => {
  const available = await loadBuiltinPacks();
  const root = join(await tempDir('folio-init-'), '유리 등대');
  const out = await initWork(root, { title: '유리 등대', packs: ['novel'], preset: 'serial', available });
  assert.equal(out.created, true);
  const yaml = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  assert.deepEqual(yaml, {
    title: '유리 등대', levels: [{ name: 'arc', children: [1, 60] }, { name: 'episode', leaf: true }], packs: ['novel'], checkSets: ['novel.basic', 'novel.serial'],
  });
  for (const dir of ['tree', 'entities', 'checks']) assert.ok((await stat(join(root, dir))).isDirectory(), dir);
  const ws = await openWorkspace(root, { packs: available });
  assert.equal(ws.work.tree.nodes.size, 0);
});

test('initWork never overwrites an existing work', async () => {
  const available = await loadBuiltinPacks();
  const root = await tempDir('folio-init-');
  await writeFile(join(root, 'work.yaml'), 'title: 원래 작품\n');
  const out = await initWork(root, { title: '새 작품', packs: ['novel'], preset: 'serial', available });
  assert.deepEqual(out, { created: false, root });
  assert.equal(await readFile(join(root, 'work.yaml'), 'utf8'), 'title: 원래 작품\n');
});

test('initWork refuses unknown presets and packs before writing anything', async () => {
  const available = await loadBuiltinPacks();
  const root = join(await tempDir('folio-init-'), 'w');
  await assert.rejects(initWork(root, { title: 't', packs: ['novel'], preset: 'epic', available }),
    (e) => e.code === 'PRESET_UNKNOWN' && e.details.presets.join() === 'serial,novel,scene,picturebook,fairytale');
  await assert.rejects(initWork(root, { title: 't', packs: ['novel'], preset: null, available }), { code: 'PRESET_REQUIRED' });
  await assert.rejects(initWork(root, { title: 't', packs: ['poetry'], preset: 'serial', available }), { code: 'PACK_UNKNOWN' });
  await assert.rejects(initWork(root, { title: 't', packs: [], preset: 'serial', available }), { code: 'PACK_REQUIRED' });
  await assert.rejects(stat(root), { code: 'ENOENT' });
});

test('concurrent initWork on the same new root creates exactly once', async () => {
  const available = await loadBuiltinPacks();
  const root = join(await tempDir('folio-init-'), 'race');
  const [a, b] = await Promise.all([
    initWork(root, { title: 'A', packs: ['novel'], preset: 'serial', available }),
    initWork(root, { title: 'B', packs: ['novel'], preset: 'serial', available }),
  ]);
  const created = [a, b].filter((out) => out.created);
  assert.equal(created.length, 1);
  const yaml = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  assert.equal(yaml.title, created[0].config.title);
});

test('initWork refuses when root is a file, not a folder', async () => {
  const available = await loadBuiltinPacks();
  const dir = await tempDir('folio-init-');
  const root = join(dir, 'not-a-folder');
  await writeFile(root, 'x');
  await assert.rejects(initWork(root, { title: 't', packs: ['novel'], preset: 'serial', available }),
    (e) => e.code === 'WORK_ROOT_INVALID' && e.details.root === root);
});

test('initWork removes the work.yaml it just created when the new work does not open, so a retry is not told created:false', async () => {
  const broken = { ...fakePack, presets: { broken: { levels: [{ name: 'scene', leaf: true }], checkSets: ['fake.missing'] } } };
  const available = new Map([['fake', broken]]);
  const root = join(await tempDir('folio-init-'), 'broken');
  const failed = await initWork(root, { title: 't', packs: ['fake'], preset: 'broken', available }).catch((error) => error);
  assert.ok(failed instanceof Error && failed.code, 'openWorkspace fails');
  await assert.rejects(stat(join(root, 'work.yaml')), { code: 'ENOENT' });
  const again = await initWork(root, { title: 't', packs: ['fake'], preset: 'broken', available }).catch((error) => error);
  assert.equal(again.code, failed.code);
});
