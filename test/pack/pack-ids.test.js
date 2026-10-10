import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePacks, assertUniqueAcrossPacks } from '../../core/pack/registry.js';
import { validatePack } from '../../core/pack/validate.js';
import { resolveChecks } from '../../core/checks/check-set.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { fakePack } from '../support/fake-pack.js';

const codes = (pack) => validatePack(pack).map((e) => e.code);
const one = (pack) => new Map([[pack.name, pack]]);
const extraCheck = (id) => ({ ...fakePack, checks: [...fakePack.checks, { id, tier: 'model', stage: 'critic', severity: 'advisory' }] });

test('pack check ids and check set ids carry the pack name as prefix', () => {
  assert.deepEqual(codes(fakePack), []);
  assert.deepEqual(codes(extraCheck('critic2')), ['PACK_CHECK_ID_PREFIX']);
  assert.deepEqual(codes(extraCheck('novel.critic')), ['PACK_CHECK_ID_PREFIX']);
  assert.deepEqual(codes(extraCheck('fake.')), ['PACK_CHECK_ID_PREFIX']);
  assert.deepEqual(codes({ ...fakePack, checkSets: { ...fakePack.checkSets, basic2: { checks: [] } } }), ['PACK_CHECK_SET_ID_PREFIX']);
  assert.throws(() => resolvePacks(['fake'], one(extraCheck('critic2'))), (e) => e.code === 'PACK_CHECK_ID_PREFIX' && e.details.errors[0].checkId === 'critic2');
});

test('core. stays reserved and is reported before the prefix rule', () => {
  assert.deepEqual(codes(extraCheck('core.promise-order')), ['PACK_CHECK_ID_RESERVED']);
});

test('a pack cannot repeat a check id or name a default set it does not have', () => {
  assert.deepEqual(codes({ ...fakePack, checks: [...fakePack.checks, fakePack.checks[0]] }), ['PACK_CHECK_ID_DUPLICATE']);
  assert.deepEqual(codes({ ...fakePack, defaultCheckSets: ['fake.nope'] }), ['PACK_DEFAULT_SET_UNKNOWN']);
});

test('pack names are lowercase identifiers and core is reserved', () => {
  assert.deepEqual(codes({ ...fakePack, name: 'Fake' }), ['PACK_NAME_INVALID']);
  assert.ok(codes({ ...fakePack, name: 'core' }).includes('PACK_NAME_RESERVED'));
});

test('the same check or set id from two packs is refused instead of silently overwritten', () => {
  const a = { name: 'a', checks: [{ id: 'a.x' }], checkSets: { 'a.s': { checks: [] } } };
  const b = { name: 'b', checks: [{ id: 'a.x' }], checkSets: {} };
  assert.throws(() => assertUniqueAcrossPacks([a, b]), (e) => e.code === 'PACK_CHECK_ID_DUPLICATE' && e.details.checkId === 'a.x' && e.details.packs.join() === 'a,b');
  const c = { name: 'c', checks: [], checkSets: { 'a.s': { checks: [] } } };
  assert.throws(() => assertUniqueAcrossPacks([a, c]), (e) => e.code === 'PACK_CHECK_SET_DUPLICATE' && e.details.set === 'a.s');
});

test('a work cannot list a pack twice, and a pack must be registered under its own name', () => {
  assert.throws(() => resolvePacks(['fake', 'fake'], one(fakePack)), { code: 'PACK_DUPLICATE' });
  assert.throws(() => resolvePacks(['other'], new Map([['other', fakePack]])), { code: 'PACK_NAME_MISMATCH' });
});

test('resolveChecks reports duplicate ids in the registry it was handed instead of overwriting', () => {
  const config = validateWorkConfig({ levels: [{ name: 'scene', leaf: true }], packs: ['fake'], checkSets: [] }).config;
  const critic = fakePack.checks.find((c) => c.id === 'fake.critic');
  const registry = { checks: [critic, { ...critic, severity: 'block' }], checkSets: {}, defaultCheckSets: [], packs: [fakePack] };
  assert.deepEqual(resolveChecks({ registry, config }).errors.map((e) => [e.code, e.checkId]), [['CHECK_ID_DUPLICATE', 'fake.critic']]);
});
