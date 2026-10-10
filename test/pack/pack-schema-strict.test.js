import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPackSpec } from '../../core/pack/yaml-schema.js';
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { initWork } from '../../core/work/init.js';
import { stringifyYaml } from '../../core/util/yaml.js';
import { fakePacks, tempDir } from '../support/fixtures.js';

const LEAF = [
  { id: 'plan', kind: 'generate', produces: 'plan' },
  { id: 'draft', kind: 'generate', produces: 'draft' },
  { id: 'extract', kind: 'generate', produces: 'events', requires: ['draft'] },
  { id: 'facts', kind: 'check', tier: 'deterministic', stage: 'facts', requires: ['extract'] },
  { id: 'critic', kind: 'check', tier: 'model', stage: 'critic' },
  { id: 'commit', kind: 'commit' },
];
const BRANCH = [{ id: 'plan', kind: 'generate', produces: 'plan' }, { id: 'commit', kind: 'commit' }];
const BASE = {
  name: 'demo',
  pipelines: { leaf: LEAF, branch: BRANCH },
  presets: { scene: { title: '장면', levels: [{ name: 'scene', leaf: true }] } },
  checks: { 'demo.nobody': { tier: 'deterministic', stage: 'facts', severity: 'advisory', run: 'nobody' } },
  checkSets: { 'demo.basic': { checks: ['demo.nobody'] } },
};
const edit = (fn) => { const raw = structuredClone(BASE); fn(raw); return raw; };
const errorsOf = (raw) => readPackSpec(raw).errors.map((e) => [e.code, e.path]);

test('M3 C3: the base spec is clean, so every case below isolates one rule', () => {
  assert.deepEqual(errorsOf(BASE), []);
});

test('N2 minor: presets on a pack without pipelines are refused at load (a second pack cannot be the first pack)', () => {
  assert.deepEqual(errorsOf(edit((raw) => { delete raw.pipelines; })), [['PACK_FIELD_INVALID', 'presets']]);
  // 단계도 프리셋도 없는 둘째 팩은 그대로 받는다(sources 팩 모양).
  assert.deepEqual(errorsOf(edit((raw) => { delete raw.pipelines; delete raw.presets; })), []);
});

test('M3 C3: a model check on the locked facts stage is refused at load, not only at resolve', () => {
  const raw = edit((r) => { r.checks['demo.judge'] = { tier: 'model', stage: 'facts', severity: 'advisory', instruction: 'checks/judge.md' }; });
  assert.deepEqual(errorsOf(raw), [['PACK_FIELD_INVALID', 'checks.demo.judge.stage']]);
});

test('M3 C3: a set cannot hold a core check or an own-prefixed check the pack does not define; other packs are left to resolve', () => {
  assert.deepEqual(errorsOf(edit((r) => { r.checkSets['demo.basic'].checks.push('core.promise-order'); })), [['PACK_FIELD_INVALID', 'checkSets.demo.basic.checks']]);
  assert.deepEqual(errorsOf(edit((r) => { r.checkSets['demo.basic'].checks.push('demo.missing'); })), [['PACK_FIELD_INVALID', 'checkSets.demo.basic.checks']]);
  assert.deepEqual(errorsOf(edit((r) => { r.checkSets['demo.basic'].checks.push('other.thing'); })), []);
});

test('M3 C3: preset levels and order follow the work.yaml rules, and titles must be strings', () => {
  const levels = (list) => errorsOf(edit((r) => { r.presets.scene.levels = list; }));
  assert.deepEqual(levels([{ name: 'scene', leaf: true }, { name: 'beat', leaf: true }]), [['PACK_FIELD_INVALID', 'presets.scene.levels']]);
  assert.deepEqual(levels([{ name: 'Scene' }]), [['PACK_FIELD_INVALID', 'presets.scene.levels']]);
  assert.deepEqual(levels([{ name: 'arc', children: [5, 1] }, { name: 'ep', leaf: true }]), [['PACK_FIELD_INVALID', 'presets.scene.levels']]);
  assert.deepEqual(errorsOf(edit((r) => { r.presets.scene.order = 'sideways'; })), [['PACK_FIELD_INVALID', 'presets.scene.order']]);
  assert.deepEqual(errorsOf(edit((r) => { r.title = 7; r.presets.scene.title = ['x']; r.checks['demo.nobody'].description = {}; })), [
    ['PACK_FIELD_INVALID', 'title'], ['PACK_FIELD_INVALID', 'checks.demo.nobody.description'], ['PACK_FIELD_INVALID', 'presets.scene.title'],
  ]);
});

test('M3 C3: core pack rule errors point at their own pack.yaml place instead of all saying "pipelines"', async () => {
  const load = async (raw) => {
    const dir = await tempDir('folio-pack-');
    await writeFile(join(dir, 'pack.yaml'), stringifyYaml(raw));
    try { await loadYamlPack(dir, { checkers: { nobody: () => [] } }); } catch (error) { return error.details.errors.map((e) => [e.code, e.path]); }
    throw new Error('expected a refusal');
  };
  assert.deepEqual(await load(edit((r) => { r.pipelines.leaf = LEAF.filter((s) => s.id !== 'facts'); })),
    [['PACK_LOCKED_STAGE_MISSING', 'pipelines.leaf']]);
  assert.deepEqual(await load(edit((r) => { r.checks = { nobody: r.checks['demo.nobody'] }; r.checkSets = {}; })),
    [['PACK_CHECK_ID_PREFIX', 'checks.nobody']]);
  assert.deepEqual(await load(edit((r) => { r.defaultCheckSets = ['demo.none']; })), [['PACK_DEFAULT_SET_UNKNOWN', 'defaultCheckSets']]);
  assert.deepEqual(await load(edit((r) => { r.pipelines.leaf = LEAF.map((s) => (s.id === 'commit' ? { ...s, mode: 'off' } : s)); })),
    [['PACK_LOCKED_STEP_MODE', 'pipelines.leaf.commit']]);
});

test('N2 minor: initWork lists presets only from packs that can be the first pack (with pipelines)', async () => {
  const available = fakePacks();
  const fake = available.get('fake');
  available.set('fake', { ...fake, presets: { scene: { levels: [{ name: 'scene', leaf: true }] } } });
  const { pipelines: _none, ...second } = { ...fake, name: 'extra', checks: [], checkSets: {}, defaultCheckSets: [], presets: { odd: { levels: [{ name: 'scene', leaf: true }] } } };
  available.set('extra', second);
  await assert.rejects(initWork(await tempDir(), { title: 't', packs: ['fake'], available }),
    (e) => e.code === 'PRESET_REQUIRED' && JSON.stringify(e.details.packPresets) === JSON.stringify({ fake: ['scene'] }));
});
