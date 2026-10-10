import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveChecks } from '../../core/checks/check-set.js';
import { checkDigest } from '../../core/checks/applied.js';
import { runDeterministicChecks } from '../../core/checks/run-checks.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { describeConfig } from '../../server/tools/config.js';
import { copyFixture } from '../support/fixtures.js';

const packs = await loadBuiltinPacks();
const LEVELS = [{ name: 'arc' }, { name: 'episode', leaf: true }];

/** 팩과 work.yaml checks(·features)로 검사를 푼다. 설정 형식 오류가 없어야 한다. */
function resolve(checks, { names = ['novel'], features } = {}) {
  const { config, errors } = validateWorkConfig({ levels: LEVELS, packs: names, checkSets: [], checks, ...(features ? { features } : {}) });
  assert.deepEqual(errors, []);
  return resolveChecks({ registry: resolvePacks(names, packs), config });
}
const byId = (resolved, id) => resolved.checks.find((c) => c.id === id);
const codes = (resolved) => resolved.errors.map((e) => e.code);
const run = (check, draft) => runDeterministicChecks([check], { nodeId: 'ep-001', ordered: true, draft, draftEvents: [], priorEvents: [] })[0];

test('C0: checks.<pack check>.config reaches the checker over the pack config, and turns the check on', () => {
  const plain = resolve({});
  assert.equal(byId(plain, 'novel.length'), undefined, 'not in any chosen set');
  const tuned = resolve({ 'novel.length': { config: { target: 50 } } });
  assert.deepEqual(codes(tuned), []);
  const check = byId(tuned, 'novel.length');
  assert.deepEqual(check.config, { target: 50, unit: 'graphemes' });
  assert.deepEqual(run(check, '짧은 원고.').findings.map((f) => [f.code, f.severity]), [['LENGTH_SHORT', 'advisory']]);
  assert.deepEqual(run(check, '가'.repeat(60)).findings, []);
  const pack = packs.get('novel').checks.find((c) => c.id === 'novel.length');
  assert.deepEqual(pack.config, { target: null, unit: 'graphemes' }, 'the pack check is not changed');
  assert.notEqual(checkDigest(check), checkDigest(pack), 'the config is part of the check digest');
});

test('C0: nested config maps merge key by key; lists are replaced; severity and config go together', () => {
  const dormant = byId(resolve({ 'novel.promise-dormant': { config: { spans: { next: 3 } } } }), 'novel.promise-dormant');
  assert.deepEqual(dormant.config.spans, { next: 3, soon: 5, arc: 10, long: 16, finale: 24 });
  assert.deepEqual(dormant.config.defaults, { core: 8, other: 10, parked: 10 });
  const both = byId(resolve({ 'novel.length': { severity: 'block', config: { target: 50, unit: 'chars' } } }), 'novel.length');
  assert.equal(both.severityOverride, 'block');
  assert.deepEqual(run(both, '짧다').findings.map((f) => [f.code, f.severity]), [['LENGTH_SHORT', 'block']]);
  const brand = resolve({ 'brand.banned-phrases': { config: { words: ['경쟁사A'] } } }, { names: ['knowledge', 'brand'] });
  assert.deepEqual(codes(brand), []);
  const banned = byId(brand, 'brand.banned-phrases');
  assert.deepEqual(banned.config.words, ['경쟁사A']);
  assert.ok(banned.config.allow.includes('최고경영자'), 'keys the work did not give keep the pack value');
  assert.deepEqual(run(banned, '업계 최고라는 경쟁사A 보다 낫다.').findings.map((f) => f.quote), ['경쟁사A']);
});

test('C0: fields a pack check does not take are refused with a code, never silently ignored', () => {
  const brand = (spec) => codes(resolve({ 'brand.banned-phrases': spec }, { names: ['knowledge', 'brand'] }));
  assert.deepEqual(brand({ words: ['경쟁사A'] }), ['CHECK_FIELD_UNKNOWN']);
  assert.deepEqual(brand({ locked: false }), ['CHECK_FIELD_UNKNOWN']);
  assert.deepEqual(brand({ mode: 'maybe' }), ['CHECK_MODE_INVALID']);
  assert.deepEqual(brand({ config: { nope: 1 } }), ['CHECK_CONFIG_KEY_UNKNOWN']);
  assert.deepEqual(brand({ config: ['x'] }), ['CHECK_CONFIG_INVALID']);
  assert.deepEqual(brand({ config: { words: [new Date(0)] } }), ['CHECK_CONFIG_INVALID']);
  assert.deepEqual(brand(false), ['CHECK_SPEC_INVALID']);
  assert.deepEqual(brand(null), [], 'an empty entry still just turns the check on');
  assert.deepEqual(brand({ mode: 'on' }), []);
  const flow = resolve({ 'novel.promise-flow': { config: { minQuote: 2 } } });
  assert.deepEqual(codes(flow), ['CHECK_CONFIG_UNSUPPORTED'], 'a check without pack config takes none');
  assert.deepEqual(codes(resolve({ 'novel.critic': { config: {} } })), ['CHECK_CONFIG_UNSUPPORTED'], 'model checks take none');
});

test('C0: locked and hard checks never get weaker through config; the checkConfig feature turns work config off', () => {
  assert.deepEqual(codes(resolve({ 'core.promise-order': { config: {} } })), ['LOCKED_CHECK_OVERRIDE']);
  assert.deepEqual(codes(resolve({ 'novel.dead-on-stage': { config: {} } })), ['HARD_CHECK_CONFIG_LOCKED']);
  assert.deepEqual(codes(resolve({ 'novel.dead-on-stage': { mode: 'off', config: {} } })), ['HARD_CHECK_CONFIG_LOCKED']);
  assert.deepEqual(codes(resolve({ 'novel.dead-on-stage': { words: [] } })), ['CHECK_FIELD_UNKNOWN']);
  const off = resolve({ 'novel.length': { config: { target: 50 } } }, { features: { checkConfig: false } });
  assert.deepEqual(codes(off), ['CHECK_CONFIG_DISABLED']);
  assert.deepEqual(codes(resolve({ 'novel.length': { severity: 'block' } }, { features: { checkConfig: false } })), [], 'without config the line still works');
  const promiseOrder = byId(resolve({}), 'core.promise-order');
  assert.equal(promiseOrder.locked, true);
});

test('C0: a work.yaml config changes the checks digest, opens through openWorkspace, and folio_config shows the effective config', async () => {
  const root = await copyFixture('serial-2level');
  const path = join(root, 'work.yaml');
  const before = await openWorkspace(root, { packs });
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, checks: { 'novel.length': { config: { target: 1200 } } } }));
  const after = await openWorkspace(root, { packs });
  assert.notEqual(after.checksDigest.byLevel.episode, before.checksDigest.byLevel.episode);
  const shown = (await describeConfig(root, { packs })).checks;
  assert.deepEqual(shown.find((c) => c.id === 'novel.length').config, { target: 1200, unit: 'graphemes' });
  assert.equal(shown.find((c) => c.id === 'core.promise-order').config, null);
  await writeFile(path, stringifyYaml({ ...config, checks: { 'novel.length': { config: { goal: 1200 } } } }));
  await assert.rejects(openWorkspace(root, { packs }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors[0].code === 'CHECK_CONFIG_KEY_UNKNOWN');
});
