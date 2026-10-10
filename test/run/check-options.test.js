import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkConfig } from '../../core/work/config.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { resolveChecks } from '../../core/checks/check-set.js';
import { resolvePipelines } from '../../core/pipeline/resolve.js';
import { fakePack, fakePacks } from '../support/fake-pack.js';

const LEVELS = [{ name: 'chapter' }, { name: 'scene', leaf: true }];
const config = (patch = {}) => validateWorkConfig({ levels: LEVELS, packs: ['fake'], ...patch }).config;
const resolve = (patch) => resolveChecks({ registry: resolvePacks(['fake'], fakePacks()), config: config(patch) });
const ids = (result) => result.checks.map((c) => c.id).sort();
const HARD = ['fake.dead-on-stage', 'fake.defined-before-use'];

test('options.includeAllHardChecks defaults to false and must be a boolean', () => {
  assert.deepEqual(config().options, { includeAllHardChecks: false });
  assert.deepEqual(config({ options: { includeAllHardChecks: true } }).options, { includeAllHardChecks: true });
  const codes = (options) => validateWorkConfig({ levels: LEVELS, options }).errors.map((e) => e.code);
  assert.deepEqual(codes('yes'), ['OPTIONS_INVALID']);
  assert.deepEqual(codes({ includeAllHardChecks: 'yes' }), ['OPTION_INVALID']);
  assert.deepEqual(codes({ surprise: true }), ['OPTION_UNKNOWN']);
});

test('without includeAllHardChecks only the chosen sets run (plus the locked core check)', () => {
  const result = resolve({ checkSets: ['fake.empty'] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(ids(result), ['core.promise-order']);
});

test('with includeAllHardChecks every known hard check is selected whatever the sets', () => {
  for (const checkSets of [['fake.empty'], []]) {
    const result = resolve({ checkSets, options: { includeAllHardChecks: true } });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(ids(result), ['core.promise-order', ...HARD]);
  }
});

test('a hard pack check can be switched off with mode: off, unless includeAllHardChecks is on', () => {
  const off = resolve({ checkSets: ['fake.basic'], checks: { 'fake.dead-on-stage': { mode: 'off' } } });
  assert.deepEqual(off.errors, []);
  assert.ok(!ids(off).includes('fake.dead-on-stage'));
  const refused = resolve({ checkSets: ['fake.basic'], options: { includeAllHardChecks: true }, checks: { 'fake.dead-on-stage': { mode: 'off' } } });
  assert.deepEqual(refused.errors.map((e) => [e.code, e.checkId]), [['HARD_CHECK_OVERRIDE', 'fake.dead-on-stage']]);
  assert.ok(ids(refused).includes('fake.dead-on-stage'));
});

test('a hard check can be enabled on its own from work.yaml checks', () => {
  const result = resolve({ checkSets: ['fake.empty'], checks: { 'fake.dead-on-stage': {} } });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(ids(result), ['core.promise-order', 'fake.dead-on-stage']);
});

test('a running hard check keeps its severity: any severity from work.yaml is refused', () => {
  for (const options of [{ includeAllHardChecks: false }, { includeAllHardChecks: true }]) {
    for (const spec of [{ severity: 'advisory' }, { severity: 'block' }, { mode: 'off', severity: 'advisory' }]) {
      const result = resolve({ checkSets: ['fake.basic'], options, checks: { 'fake.dead-on-stage': spec } });
      assert.deepEqual(result.errors.map((e) => [e.code, e.checkId]), [['HARD_CHECK_SEVERITY_LOCKED', 'fake.dead-on-stage']], JSON.stringify(spec));
      const check = result.checks.find((c) => c.id === 'fake.dead-on-stage');
      assert.equal(check.severity, 'hard');
      assert.equal(check.severityOverride, undefined);
    }
  }
});

test('the locked core check still cannot be switched off or softened in either option', () => {
  for (const options of [{ includeAllHardChecks: false }, { includeAllHardChecks: true }]) {
    for (const spec of [{ mode: 'off' }, { severity: 'advisory' }]) {
      const result = resolve({ options, checks: { 'core.promise-order': spec } });
      assert.deepEqual(result.errors.map((e) => e.code), ['LOCKED_CHECK_OVERRIDE']);
      assert.equal(result.checks.find((c) => c.id === 'core.promise-order').locked, true);
    }
  }
});

test('switching off the step that hosts a hard pack check is the user\'s choice unless includeAllHardChecks is on', () => {
  const hard = { id: 'fake.hard-critic', tier: 'model', stage: 'critic', severity: 'hard' };
  const overrides = { critic: { mode: 'off', reason: 'r' } };
  assert.deepEqual(resolvePipelines({ primary: fakePack, overrides, checks: [hard] }).errors, []);
  const strict = resolvePipelines({ primary: fakePack, overrides, checks: [hard], includeAllHardChecks: true });
  assert.deepEqual(strict.errors.map((e) => [e.code, e.checkId, e.stepId]), [['HARD_CHECK_OVERRIDE', 'fake.hard-critic', 'critic']]);
  const locked = resolvePipelines({ primary: fakePack, overrides: { facts: { mode: 'off' } }, checks: [] });
  assert.deepEqual(locked.errors.map((e) => e.code), ['LOCKED_STEP_OVERRIDE']);
});

test('without a checkSets key the pack default sets are used; an explicit empty list means none', () => {
  assert.equal(config().checkSets, null);
  assert.deepEqual(resolvePacks(['fake'], fakePacks()).defaultCheckSets, ['fake.basic']);
  const byDefault = resolve({});
  assert.deepEqual(byDefault.errors, []);
  assert.deepEqual(ids(byDefault), ids(resolve({ checkSets: ['fake.basic'] })));
  assert.deepEqual(ids(resolve({ checkSets: [] })), ['core.promise-order']);
});

test('user check sets group pack and user checks and can be selected', () => {
  const result = resolve({
    checkSets: ['mine'],
    userCheckSets: { mine: { title: '내 세트', checks: ['fake.critic', 'no-suddenly'] } },
    checks: { 'no-suddenly': { words: ['갑자기'] } },
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(ids(result), ['core.promise-order', 'fake.critic', 'no-suddenly']);
});

test('user check set ids cannot take core or pack prefixes and members must exist', () => {
  const codes = (userCheckSets, checkSets = []) => resolve({ checkSets, userCheckSets }).errors.map((e) => e.code);
  assert.deepEqual(codes({ 'core.x': { checks: [] } }), ['USER_CHECK_SET_ID_RESERVED']);
  assert.deepEqual(codes({ 'fake.mine': { checks: [] } }), ['USER_CHECK_SET_ID_RESERVED']);
  assert.deepEqual(codes({ mine: { checks: ['ghost'] } }, ['mine']), ['CHECK_UNKNOWN']);
  const shape = (userCheckSets) => validateWorkConfig({ levels: LEVELS, userCheckSets }).errors.map((e) => e.code);
  assert.deepEqual(shape([]), ['USER_CHECK_SETS_INVALID']);
  assert.deepEqual(shape({ mine: { checks: 'fake.critic' } }), ['USER_CHECK_SET_INVALID']);
  assert.deepEqual(shape({ mine: { checks: [], title: 3 } }), ['USER_CHECK_SET_INVALID']);
});

test('an undeclared user check id cannot take core or pack prefixes; a declared one still overrides', () => {
  const codes = (checks) => resolve({ checkSets: [], checks }).errors.map((e) => [e.code, e.checkId]);
  assert.deepEqual(codes({ 'core.x': { words: ['a'] } }), [['USER_CHECK_ID_RESERVED', 'core.x']]);
  assert.deepEqual(codes({ 'fake.mine': { words: ['a'] } }), [['USER_CHECK_ID_RESERVED', 'fake.mine']]);
  // fake.critic is already declared by the pack, so it is an override, not a new (reserved-looking) user check.
  const override = resolve({ checkSets: ['fake.empty'], checks: { 'fake.critic': { severity: 'block' } } });
  assert.deepEqual(override.errors, []);
});

test('a user check that belongs to a user set runs only when one of its sets is selected; others run unless off', () => {
  const base = { userCheckSets: { mine: { checks: ['no-suddenly'] }, also: { checks: ['no-suddenly'] } }, checks: { 'no-suddenly': { words: ['갑자기'] }, loose: { words: ['문득'] } } };
  assert.deepEqual(ids(resolve({ ...base, checkSets: [] })), ['core.promise-order', 'loose']);
  assert.deepEqual(ids(resolve({ ...base, checkSets: ['also'] })), ['core.promise-order', 'loose', 'no-suddenly']);
  const off = resolve({ ...base, checkSets: ['mine'], checks: { ...base.checks, 'no-suddenly': { words: ['갑자기'], mode: 'off' }, loose: { words: ['문득'], mode: 'off' } } });
  assert.deepEqual(ids(off), ['core.promise-order']);
});
