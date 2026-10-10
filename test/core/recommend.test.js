import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { describeCheckSets, recommendCheckSets, recommendForNode } from '../../core/checks/recommend.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';

const registry = () => resolvePacks(['fake'], fakePacks());
const config = (patch = {}) => validateWorkConfig({ levels: [{ name: 'chapter' }, { name: 'scene', leaf: true }], packs: ['fake'], ...patch }).config;
const setIds = (list) => list.map((r) => r.setId);

test('describeCheckSets lists pack and user sets with checks, selected and default flags', () => {
  const cfg = config({ checkSets: ['fake.empty', 'mine'], userCheckSets: { mine: { title: '내 세트', checks: ['fake.critic'] } } });
  const before = structuredClone(cfg);
  const all = describeCheckSets(registry(), cfg);
  assert.deepEqual(cfg, before, 'describing never changes config');
  const byId = Object.fromEntries(all.map((s) => [s.id, s]));
  assert.deepEqual(Object.keys(byId).sort(), ['fake.basic', 'fake.empty', 'fake.matter', 'fake.plans', 'fake.scenes', 'fake.textbook', 'mine']);
  assert.deepEqual([byId['fake.basic'].origin, byId['fake.basic'].default, byId['fake.basic'].selected, byId['fake.basic'].title], ['pack', true, false, '기본 검사']);
  assert.deepEqual([byId['fake.empty'].selected, byId['fake.empty'].default], [true, false]);
  assert.deepEqual([byId.mine.origin, byId.mine.selected, byId.mine.checks, byId.mine.title], ['user', true, ['fake.critic'], '내 세트']);
  assert.equal(describeCheckSets(registry(), config()).find((s) => s.id === 'fake.basic').selected, true, 'defaults are selected without a checkSets key');
});

test('recommendCheckSets explains work-level picks by default, work kind and level', () => {
  const recs = recommendCheckSets({ registry: registry(), config: config({ checkSets: [] }), workKind: 'novel' });
  assert.deepEqual(setIds(recs), ['fake.basic', 'fake.scenes']);
  assert.deepEqual(recs[0].reasons, [{ kind: 'default' }, { kind: 'workKind', value: 'novel' }]);
  assert.deepEqual(recs[1].reasons, [{ kind: 'workKind', value: 'novel' }, { kind: 'level', value: 'scene' }]);
  assert.equal(recs[0].selected, false);
  const textbook = recommendCheckSets({
    registry: registry(), config: validateWorkConfig({ levels: [{ name: 'part' }, { name: 'section', leaf: true }], packs: ['fake'] }).config, workKind: 'textbook',
  });
  assert.deepEqual(textbook.map((r) => [r.setId, r.selected, r.reasons.map((x) => x.kind)]), [
    ['fake.basic', true, ['default']], ['fake.textbook', false, ['workKind', 'level']],
  ]);
});

test('recommendForNode picks sets by level, role and leaf/branch position', async () => {
  const root = await copyFixture('knowledge-book');
  await useFakePack(root);
  const work = await openWork(root);
  const input = { registry: registry(), config: work.config, work };
  const section = recommendForNode({ ...input, nodeId: 'atp-section' });
  assert.deepEqual([section.level, section.role, section.position], ['section', 'body', 'leaf']);
  assert.deepEqual(section.sets.map((s) => [s.setId, s.reasons.map((r) => `${r.kind}:${r.value}`)]), [['fake.textbook', ['level:section']]]);
  assert.deepEqual(setIds(recommendForNode({ ...input, nodeId: 'part-basics' }).sets), ['fake.plans']);
  const preface = recommendForNode({ ...input, nodeId: 'preface' });
  assert.deepEqual(preface.sets.map((s) => [s.setId, s.reasons]), [
    ['fake.matter', [{ kind: 'role', value: 'front' }]], ['fake.textbook', [{ kind: 'level', value: 'section' }]],
  ]);
  assert.throws(() => recommendForNode({ ...input, nodeId: 'ghost' }), { code: 'NODE_NOT_FOUND' });
});
