import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkConfig } from '../../core/work/config.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { resolveChecks } from '../../core/checks/check-set.js';
import { BUILTIN_CHECKS } from '../../core/checks/builtin.js';
import { fakePack, fakePacks } from '../support/fake-pack.js';

const config = (patch = {}) => validateWorkConfig({
  levels: [{ name: 'chapter' }, { name: 'scene', leaf: true }], packs: ['fake'], checkSets: ['fake.basic'], ...patch,
}).config;
const resolve = (patch) => resolveChecks({ registry: resolvePacks(config(patch).packs, fakePacks()), config: config(patch) });
const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c]));

test('resolvePacks uses the first pack as primary and rejects unknown packs', () => {
  const registry = resolvePacks(['fake'], fakePacks());
  assert.equal(registry.primary.name, 'fake');
  assert.ok(registry.checks.some((c) => c.id === 'fake.critic'));
  assert.throws(() => resolvePacks([], fakePacks()), { code: 'PACK_REQUIRED' });
  assert.throws(() => resolvePacks(['novel'], fakePacks()), { code: 'PACK_UNKNOWN' });
});

test('selected sets plus the locked core checks', () => {
  const { checks, errors } = resolve();
  assert.deepEqual(errors, []);
  assert.deepEqual(checks.map((c) => c.id).sort(), [
    'core.promise-order', 'fake.critic', 'fake.dead-on-stage', 'fake.defined-before-use', 'fake.parent-fit', 'fake.promise-kept',
  ]);
  assert.equal(byId(checks)['core.promise-order'].locked, true);
});

test('an empty set still keeps the core checks; pack hard checks join only with includeAllHardChecks', () => {
  const hardAndCore = ['core.promise-order', 'fake.dead-on-stage', 'fake.defined-before-use'];
  for (const checkSets of [['fake.empty'], []]) {
    const plain = resolve({ checkSets });
    assert.deepEqual(plain.errors, [], JSON.stringify(checkSets));
    assert.deepEqual(plain.checks.map((c) => c.id).sort(), ['core.promise-order'], JSON.stringify(checkSets));
    assert.equal(byId(plain.checks)['core.promise-order'].locked, true);
    const { checks, errors } = resolve({ checkSets, options: { includeAllHardChecks: true } });
    assert.deepEqual(errors, [], JSON.stringify(checkSets));
    assert.deepEqual(checks.map((c) => c.id).sort(), hardAndCore, JSON.stringify(checkSets));
    assert.equal(byId(checks)['core.promise-order'].locked, true);
    for (const id of hardAndCore.slice(1)) assert.equal(byId(checks)[id].severity, 'hard');
  }
});

test('pack checks can be turned off or raised to block', () => {
  const { checks, errors } = resolve({ checks: { 'fake.critic': { mode: 'off' }, 'fake.promise-kept': { severity: 'block' } } });
  assert.deepEqual(errors, []);
  assert.equal(byId(checks)['fake.critic'], undefined);
  assert.equal(byId(checks)['fake.promise-kept'].severityOverride, 'block');
});

test('locked checks cannot be turned off or softened', () => {
  for (const spec of [{ mode: 'off' }, { severity: 'advisory' }]) {
    assert.deepEqual(resolve({ checks: { 'core.promise-order': spec } }).errors.map((e) => e.code), ['LOCKED_CHECK_OVERRIDE']);
  }
});

test('hard pack checks cannot be given any severity; mode: off is refused only with includeAllHardChecks', () => {
  for (const id of ['fake.dead-on-stage', 'fake.defined-before-use']) {
    for (const spec of [{ severity: 'advisory' }, { severity: 'block' }, { mode: 'off', severity: 'advisory' }]) {
      const { checks, errors } = resolve({ checks: { [id]: spec } });
      assert.deepEqual(errors.map((e) => [e.code, e.checkId]), [['HARD_CHECK_SEVERITY_LOCKED', id]], JSON.stringify(spec));
      assert.equal(byId(checks)[id].severity, 'hard');
      assert.equal(byId(checks)[id].severityOverride, undefined);
    }
    const strict = resolve({ options: { includeAllHardChecks: true }, checks: { [id]: { mode: 'off' } } });
    assert.deepEqual(strict.errors.map((e) => [e.code, e.checkId]), [['HARD_CHECK_OVERRIDE', id]]);
    assert.equal(byId(strict.checks)[id].severity, 'hard');
    const off = resolve({ checks: { [id]: { mode: 'off' } } });
    assert.deepEqual(off.errors, []);
    assert.equal(byId(off.checks)[id], undefined);
  }
  assert.deepEqual(resolve({ checks: { 'core.promise-order': { mode: 'off' } } }).errors.map((e) => e.code), ['LOCKED_CHECK_OVERRIDE']);
});

test('a user word check is deterministic, experimental and advisory by default', () => {
  const check = byId(resolve({ checks: { 'no-suddenly': { words: ['갑자기'] } } }).checks)['no-suddenly'];
  assert.deepEqual([check.tier, check.stage, check.severity, check.experimental, check.origin], ['deterministic', 'facts', 'advisory', true, 'user']);
  assert.deepEqual(check.run({ draft: '그는 갑자기 웃었다.' }).map((f) => [f.code, f.quote]), [['USER_PATTERN', '갑자기']]);
});

test('a user rule is a model check that must quote the draft', () => {
  const check = byId(resolve({ checks: { 'no-honorifics': { source: 'checks/no-honorifics.md', severity: 'block' } } }).checks)['no-honorifics'];
  assert.deepEqual([check.tier, check.stage, check.severity, check.requireQuote, check.instructionSource], ['model', 'critic', 'block', true, 'checks/no-honorifics.md']);
});

const invalid = [
  [{ checks: { x: { words: ['a'], severity: 'loud' } } }, 'USER_CHECK_SEVERITY_INVALID'],
  [{ checks: { y: {} } }, 'USER_CHECK_INVALID'],
  [{ checks: { z: { pattern: '(' } } }, 'USER_CHECK_PATTERN_INVALID'],
  [{ checkSets: ['ghost.set'] }, 'CHECK_SET_UNKNOWN'],
  [{ checks: { 'fake.critic': { severity: 'hard' } } }, 'USER_CHECK_SEVERITY_INVALID'],
];
for (const [patch, code] of invalid) {
  test(`reports ${code}`, () => {
    assert.ok(resolve(patch).errors.some((e) => e.code === code), JSON.stringify(resolve(patch).errors));
  });
}

test('a checkSets entry named after an Object prototype property is unknown, not a crash', () => {
  for (const set of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.deepEqual(resolve({ checkSets: [set] }).errors.map((e) => e.code), ['CHECK_SET_UNKNOWN'], set);
  }
});

test('a set naming a missing check is reported', () => {
  const pack = { ...fakePack, checkSets: { 'fake.broken': { checks: ['nope'] } }, defaultCheckSets: [] };
  const cfg = config({ checkSets: ['fake.broken'] });
  assert.deepEqual(resolveChecks({ registry: resolvePacks(['fake'], new Map([['fake', pack]])), config: cfg }).errors.map((e) => e.code), ['CHECK_UNKNOWN']);
});

test('a pack cannot declare a check id reserved for core', () => {
  const pack = { ...fakePack, checks: [...fakePack.checks, { id: 'core.promise-order', tier: 'deterministic', stage: 'facts', severity: 'advisory' }] };
  assert.throws(() => resolvePacks(['fake'], new Map([['fake', pack]])), { code: 'PACK_CHECK_ID_RESERVED' });
});

test('a pack check cannot claim origin core', () => {
  const pack = { ...fakePack, checks: [{ id: 'fake.spoofed', tier: 'deterministic', stage: 'facts', severity: 'advisory', origin: 'core' }] };
  const registry = resolvePacks(['fake'], new Map([['fake', pack]]));
  assert.equal(registry.checks.find((c) => c.id === 'fake.spoofed').origin, 'pack');
});

test('a hand-built registry that shadows the locked id still yields the real builtin, and off is rejected', () => {
  const shadow = { id: 'core.promise-order', tier: 'deterministic', stage: 'facts', severity: 'advisory', origin: 'pack' };
  const registry = { primary: fakePack, packs: [fakePack], checks: [shadow], checkSets: { empty: { checks: [] } } };
  const cfg = config({ checkSets: ['empty'], checks: { 'core.promise-order': { mode: 'off' } } });
  const { checks, errors } = resolveChecks({ registry, config: cfg });
  assert.deepEqual(errors.map((e) => e.code), ['LOCKED_CHECK_OVERRIDE']);
  const found = byId(checks)['core.promise-order'];
  assert.equal(found.locked, true);
  assert.equal(found, BUILTIN_CHECKS[0]);
});

test('core.promise-order flags a payoff before the plant inside this draft', () => {
  const [check] = BUILTIN_CHECKS;
  const work = { entities: new Map([['red-letter', { id: 'red-letter', kind: 'promise' }]]) };
  const findings = check.run({
    work, nodeId: 'n2', priorEvents: [],
    draftEvents: [{ eventId: 'draft-1', nodeId: 'n2', entityId: 'red-letter', kind: 'promise.resolved' }],
  });
  assert.deepEqual(findings.map((f) => [f.code, f.severity]), [['PROMISE_RESOLVED_BEFORE_PLANT', 'hard']]);
  const ok = check.run({
    work, nodeId: 'n2',
    priorEvents: [{ eventId: 'e1', nodeId: 'n1', entityId: 'red-letter', kind: 'promise.planted' }],
    draftEvents: [{ eventId: 'draft-1', nodeId: 'n2', entityId: 'red-letter', kind: 'promise.resolved' }],
  });
  assert.deepEqual(ok, []);
});
