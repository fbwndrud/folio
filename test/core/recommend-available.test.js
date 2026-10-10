import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCheckSets, recommendCheckSets, recommendForNode } from '../../core/checks/recommend.js';
import { resolveChecks } from '../../core/checks/check-set.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { loadBuiltinPacks } from '../../packs/index.js';

const packs = await loadBuiltinPacks();
const setup = (names, patch = {}) => {
  const { config, errors } = validateWorkConfig({ levels: [{ name: 'doc' }, { name: 'section', leaf: true }], packs: names, checkSets: [], ...patch });
  assert.deepEqual(errors, []);
  return { registry: resolvePacks(names, packs), config };
};
const ids = (recs) => recs.map((r) => r.setId);

test('C0 (N5 H4): a set naming checks this work does not have is not recommended, and describe says which are missing', () => {
  const without = setup(['knowledge', 'brand']);
  assert.deepEqual(ids(recommendCheckSets({ ...without, workKind: 'company' })).filter((id) => id.startsWith('brand.')), ['brand.voice']);
  const figures = describeCheckSets(without.registry, without.config).find((s) => s.id === 'brand.figures');
  assert.deepEqual(figures.missingChecks, ['sources.claim-supported', 'sources.numbers-match']);
  const picked = resolveChecks({ ...without, config: { ...without.config, checkSets: ['brand.figures'] } });
  assert.deepEqual([...new Set(picked.errors.map((e) => e.code))], ['CHECK_UNKNOWN'], 'the refusal the recommendation now avoids');
  const withSources = setup(['knowledge', 'sources', 'brand']);
  assert.deepEqual(ids(recommendCheckSets({ ...withSources, workKind: 'company' })).filter((id) => id.startsWith('brand.')), ['brand.voice', 'brand.figures']);
  assert.deepEqual(describeCheckSets(withSources.registry, withSources.config).find((s) => s.id === 'brand.figures').missingChecks, []);
});

test('C0: user checks named in work.yaml count as known; a user set naming an unknown check is left out of node recommendations too', () => {
  const work = setup(['knowledge'], {
    checks: { 'my-words': { words: ['금지'] } },
    userCheckSets: { mine: { checks: ['my-words'] }, broken: { checks: ['ghost-check'] } },
  });
  const described = Object.fromEntries(describeCheckSets(work.registry, work.config).map((s) => [s.id, s.missingChecks]));
  assert.deepEqual([described.mine, described.broken], [[], ['ghost-check']]);
  const tree = { nodes: new Map([['s1', { id: 's1', level: 'section', role: 'body', kind: 'leaf' }]]) };
  const registry = { ...work.registry, checkSets: { ...work.registry.checkSets, 'x.node': { title: 'x', checks: ['ghost'], recommendedFor: { levels: ['section'] } } } };
  assert.ok(!recommendForNode({ registry, config: work.config, work: { tree }, nodeId: 's1' }).sets.some((s) => s.setId === 'x.node'));
});
