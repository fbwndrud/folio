import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isPlainObject } from '../../core/util/plain.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { parseYaml } from '../../core/util/yaml.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { viewStages } from '../../core/view/stages-view.js';
import { setStageMode } from '../../core/view/stage-toggle.js';
import { readAssets } from '../../core/store/assets.js';
import { readSources } from '../../core/store/sources.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';

const LEVELS = 'levels:\n  - name: arc\n  - name: episode\n    leaf: true\n';
const codes = (text) => validateWorkConfig(parseYaml(text)).errors.map((e) => e.code);

test('isPlainObject takes plain maps only: not arrays, null, Map, Set, Date or bytes', () => {
  for (const yes of [{}, { a: 1 }, Object.create(null), JSON.parse('{"a":{"b":1}}'), parseYaml('a: 1')]) assert.equal(isPlainObject(yes), true);
  for (const no of [null, undefined, 1, 'x', [], new Map(), new Set(), new Date(0), new Uint8Array(1), parseYaml('a: !!omap [ { b: 1 } ]').a]) assert.equal(isPlainObject(no), false, String(no));
});

test('YAML tags that make a Map, Set or Date are refused with a code in work.yaml maps, not silently read as empty', () => {
  assert.deepEqual(codes(`%YAML 1.1\n---\n${LEVELS}features: !!omap\n  - viewer: false\n`), ['FEATURES_INVALID']);
  assert.deepEqual(codes(`${LEVELS}features: !!set\n  ? viewer\n`), ['FEATURES_INVALID']);
  assert.deepEqual(codes(`${LEVELS}checks: !!omap\n  - x: { mode: off }\n`), ['CHECKS_INVALID']);
  assert.deepEqual(codes(`${LEVELS}options: !!omap\n  - includeAllHardChecks: true\n`), ['OPTIONS_INVALID']);
  assert.deepEqual(codes(`${LEVELS}order:\n  default: linear\n  levels: !!omap\n    - episode: none\n`), ['ORDER_MODE_INVALID']);
  assert.deepEqual(codes(`${LEVELS}userCheckSets:\n  mine: !!omap\n    - checks: [x]\n`), ['USER_CHECK_SET_INVALID']);
  assert.deepEqual(codes(`${LEVELS}features:\n  viewer: false\n`), [], 'a plain map still works');
});

test('an !!omap under overrides.levels makes the work refuse to open instead of ignoring the override', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const path = join(root, 'work.yaml');
  const text = (await readFile(path, 'utf8')).replace('overrides: {}\n', 'overrides:\n  levels: !!omap\n    - episode:\n        critic: { mode: off }\n');
  assert.match(text, /!!omap/);
  await writeFile(path, text);
  await assert.rejects(openWorkspace(root, { packs: fakePacks() }), (error) => error.code === 'CONFIG_INVALID' && error.details.errors.some((e) => e.code === 'OVERRIDE_LEVELS_INVALID'));
});

test('an !!omap step patch under overrides is refused instead of silently ignored', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const path = join(root, 'work.yaml');
  const text = (await readFile(path, 'utf8')).replace('overrides: {}\n', 'overrides:\n  critic: !!omap\n    - mode: off\n');
  assert.match(text, /!!omap/);
  await writeFile(path, text);
  await assert.rejects(openWorkspace(root, { packs: fakePacks() }), (error) => error.code === 'CONFIG_INVALID' && error.details.errors.some((e) => e.code === 'STEP_PATCH_INVALID'));
});

test('an !!omap step patch under overrides.levels.<레벨> is refused instead of silently ignored', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const path = join(root, 'work.yaml');
  const text = (await readFile(path, 'utf8')).replace('overrides: {}\n', 'overrides:\n  levels:\n    episode:\n      critic: !!omap\n        - mode: off\n');
  assert.match(text, /!!omap/);
  await writeFile(path, text);
  await assert.rejects(openWorkspace(root, { packs: fakePacks() }), (error) => error.code === 'CONFIG_INVALID' && error.details.errors.some((e) => e.code === 'STEP_PATCH_INVALID'));
});

test('an !!omap or a bare list for an asset brief is treated as no brief, not walked as one for entities/text', async () => {
  const root = await copyFixture('novel-3level');
  await writeFile(join(root, 'assets', 'img-omap.yaml'), 'id: img-omap\nbrief: !!omap\n  - entities: [mara]\n');
  await writeFile(join(root, 'assets', 'img-list.yaml'), 'id: img-list\nbrief:\n  - mara\n');
  const { assets, errors } = await readAssets(root, { hashFiles: false });
  assert.deepEqual(errors, []);
  for (const id of ['img-omap', 'img-list']) {
    assert.deepEqual(assets.get(id).brief, {});
    assert.deepEqual(assets.get(id).entities, []);
  }
});

test('a source meta whose top level is an !!omap is refused as SOURCE_META_INVALID, not read as empty', async () => {
  const root = await copyFixture('knowledge-book');
  await writeFile(join(root, 'sources', 'bad.yaml'), '!!omap\n- id: bad\n- file: cell-notes.txt\n');
  const { errors } = await readSources(root);
  assert.ok(errors.some((e) => e.code === 'SOURCE_META_INVALID' && e.path === 'sources/bad.yaml'), JSON.stringify(errors));
});

test('in a %YAML 1.1 work.yaml the viewer toggle is refused as CONFIG_INVALID and nothing is written (it no longer answers success)', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const path = join(root, 'work.yaml');
  await writeFile(path, `%YAML 1.1\n---\n${await readFile(path, 'utf8')}`);
  const before = await readFile(path, 'utf8');
  const { digest } = await viewStages(root, { packs: fakePacks() });
  await assert.rejects(setStageMode(root, { packs: fakePacks() }, { level: 'episode', stepId: 'critic', mode: 'off', baseDigest: digest }), { code: 'CONFIG_INVALID' });
  assert.equal(await readFile(path, 'utf8'), before);
});
