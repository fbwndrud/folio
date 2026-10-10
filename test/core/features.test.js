import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateWorkConfig } from '../../core/work/config.js';
import { FEATURES, FEATURE_PARENTS, RUN_FEATURES, assertFeature, featuresDigest } from '../../core/work/features.js';
import { initWork } from '../../core/work/init.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { copyFixture, fakePacks, tempDir, useFakePack } from '../support/fixtures.js';
import { parseYaml } from '../../core/util/yaml.js';

const base = { levels: [{ name: 'scene', leaf: true }] };

test('features default to the documented values and every key is always present', () => {
  const { config, errors } = validateWorkConfig(base);
  assert.deepEqual(errors, []);
  assert.deepEqual(config.features, {
    occurrences: true, occurrencesInExtract: true, occurrenceScope: false, rename: true, recommit: true, sources: true, evidence: true, evidenceInExtract: true, assets: true, tracking: true, promiseScope: true,
    viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true, viewerExport: true,
    images: true, imageReferences: true, imageReview: true, variants: true, branching: true, layout: true, export: true,
  });
  assert.deepEqual(config.features, FEATURES);
  assert.ok(Object.isFrozen(FEATURES));
});

test('features accept known booleans and reject unknown keys, non-booleans and explicitly-on orphaned children', () => {
  assert.equal(validateWorkConfig({ ...base, features: { occurrenceScope: true } }).config.features.occurrenceScope, true);
  const codes = (features) => validateWorkConfig({ ...base, features }).errors.map((e) => e.code);
  assert.deepEqual(codes('yes'), ['FEATURES_INVALID']);
  assert.deepEqual(codes({ teleport: true }), ['FEATURE_UNKNOWN']);
  assert.deepEqual(codes({ rename: 'on' }), ['FEATURE_INVALID']);
  assert.deepEqual(codes({ __proto__: { rename: false } }), []);
  // F-2: 부모만 끄면 자식은 저절로 꺼진다(오류 아님). 명시적으로 true 인 자식만 FEATURE_REQUIRES.
  assert.deepEqual(codes({ occurrences: false }), []);
  assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false } }).config.features,
    { occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true, assets: true, tracking: true, promiseScope: true,
      viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true, viewerExport: true,
      images: true, imageReferences: true, imageReview: true, variants: true, branching: true, layout: true, export: true });
  assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false, rename: true } }).errors,
    [{ code: 'FEATURE_REQUIRES', feature: 'rename', requires: 'occurrences' }]);
  const detail = validateWorkConfig({ ...base, features: { occurrences: false, occurrencesInExtract: false, rename: false } }).errors;
  assert.deepEqual(detail, []);
  assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false, occurrencesInExtract: false, occurrenceScope: true, rename: false } }).errors,
    [{ code: 'FEATURE_REQUIRES', feature: 'occurrenceScope', requires: 'occurrences' }]);
});

test('featuresDigest covers only the features that change what a run asks or checks', () => {
  const d = (f) => featuresDigest({ ...FEATURES, ...f });
  assert.equal(d({ rename: false }), d({}));
  assert.equal(d({ recommit: false }), d({}));
  assert.notEqual(d({ occurrenceScope: true }), d({}));
  assert.notEqual(d({ occurrencesInExtract: false }), d({}));
  assert.notEqual(d({ promiseScope: false }), d({}));
  // F-2: digest 는 유효한 값으로 만든다 — 부모만 끈 것과 자식까지 끈 것은 같은 digest.
  const eff = (features) => featuresDigest(validateWorkConfig({ ...base, features }).config.features);
  assert.equal(eff({ occurrences: false }), eff({ occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false }));
  assert.notEqual(eff({ occurrences: false }), eff({}));
});

test('assertFeature refuses a feature that is off with a hint, and passes one that is on', () => {
  const { config } = validateWorkConfig({ ...base, features: { recommit: false } });
  assert.doesNotThrow(() => assertFeature(config, 'rename'));
  assert.throws(() => assertFeature(config, 'recommit'), (e) => e.code === 'FEATURE_DISABLED' && e.details.feature === 'recommit' && /features\.recommit/.test(e.details.hint));
});

test('the workspace carries the features digest, and initWork writes chosen features', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const ws = await openWorkspace(root, { packs: fakePacks() });
  assert.equal(ws.featuresDigest, featuresDigest(FEATURES));
  const dir = join(await tempDir(), 'new');
  await initWork(dir, { title: 't', packs: ['fake'], preset: 'scene', available: fakePresetPacks(), features: { occurrenceScope: true } });
  assert.deepEqual(parseYaml(await readFile(join(dir, 'work.yaml'), 'utf8')).features, { occurrenceScope: true });
  await assert.rejects(initWork(join(await tempDir(), 'bad'), { title: 't', packs: ['fake'], preset: 'scene', available: fakePresetPacks(), features: { nope: true } }), { code: 'CONFIG_INVALID' });
});

test('N2 features: evidenceInExtract follows evidence, and sources, evidence and evidenceInExtract all change what a run asks', () => {
  const eff = (features) => validateWorkConfig({ ...base, features });
  assert.deepEqual(eff({ evidence: false }).config.features, { ...FEATURES, evidence: false, evidenceInExtract: false });
  assert.deepEqual(eff({ evidence: false }).errors, []);
  assert.deepEqual(eff({ evidence: false, evidenceInExtract: true, assets: true }).errors, [{ code: 'FEATURE_REQUIRES', feature: 'evidenceInExtract', requires: 'evidence' }]);
  const d = (f) => featuresDigest({ ...FEATURES, ...f });
  for (const key of ['sources', 'evidence', 'evidenceInExtract']) assert.notEqual(d({ [key]: false }), d({}), key);
});

test('M6 features: viewerToggles follows viewer, and neither changes what a run asks or checks', () => {
  const eff = (features) => validateWorkConfig({ ...base, features });
  assert.deepEqual(eff({ viewer: false }).config.features, { ...FEATURES, viewer: false, viewerToggles: false, viewerExport: false });
  assert.deepEqual(eff({ viewer: false }).errors, []);
  assert.deepEqual(eff({ viewer: false, viewerToggles: true }).errors, [{ code: 'FEATURE_REQUIRES', feature: 'viewerToggles', requires: 'viewer' }]);
  assert.deepEqual(eff({ viewerToggles: false }).config.features, { ...FEATURES, viewerToggles: false });
  const d = (f) => featuresDigest({ ...FEATURES, ...f });
  assert.deepEqual(eff({ viewer: false, viewerExport: true }).errors, [{ code: 'FEATURE_REQUIRES', feature: 'viewerExport', requires: 'viewer' }]);
  for (const key of ['viewer', 'viewerToggles', 'viewerExport']) assert.equal(d({ [key]: false }), d({}), key);
});

test('C0 feature: checkConfig is on by default, has no parent, and does not change the run digest (the config itself is in the checks digest)', () => {
  assert.equal(FEATURES.checkConfig, true);
  assert.equal(Object.keys(FEATURES).indexOf('checkConfig'), Object.keys(FEATURES).indexOf('viewerToggles') + 1);
  assert.deepEqual(validateWorkConfig({ ...base, features: { checkConfig: false } }).errors, []);
  const d = (f) => featuresDigest({ ...FEATURES, ...f });
  assert.equal(d({ checkConfig: false }), d({}));
});

test('N3 features: blocks, bibliography and termIndex are on by default, appended after checkConfig, without parents and outside the run digest', () => {
  const keys = Object.keys(FEATURES);
  assert.deepEqual(keys.slice(keys.indexOf('blocks'), keys.indexOf('blocks') + 3), ['blocks', 'bibliography', 'termIndex']);
  assert.equal(Object.keys(FEATURES).indexOf('blocks'), Object.keys(FEATURES).indexOf('checkConfig') + 1);
  const d = (f) => featuresDigest({ ...FEATURES, ...f });
  for (const key of ['blocks', 'bibliography', 'termIndex']) {
    assert.equal(FEATURES[key], true, key);
    assert.equal(FEATURE_PARENTS[key], undefined, key);
    assert.ok(!RUN_FEATURES.includes(key), key);
    assert.equal(d({ [key]: false }), d({}), key);
    assert.deepEqual(validateWorkConfig({ ...base, features: { [key]: false } }).errors, [], key);
  }
});

test('N4 features: links and linkScope are on by default and appended after termIndex; linkScope follows links and changes the run digest', () => {
  const keys = Object.keys(FEATURES);
  assert.deepEqual(keys.slice(keys.indexOf('links'), keys.indexOf('links') + 7), ['links', 'linkScope', 'viewerExport', 'images', 'imageReferences', 'imageReview', 'variants']);
  assert.equal(keys.indexOf('links'), keys.indexOf('termIndex') + 1);
  assert.deepEqual([FEATURES.links, FEATURES.linkScope, FEATURE_PARENTS.links, FEATURE_PARENTS.linkScope], [true, true, undefined, 'links']);
  assert.deepEqual([RUN_FEATURES.includes('links'), RUN_FEATURES.at(-2)], [false, 'linkScope']);
  const eff = (features) => validateWorkConfig({ ...base, features });
  assert.deepEqual(eff({ links: false }).config.features, { ...FEATURES, links: false, linkScope: false, branching: false });
  assert.deepEqual(eff({ links: false }).errors, []);
  assert.deepEqual(eff({ links: false, linkScope: true }).errors, [{ code: 'FEATURE_REQUIRES', feature: 'linkScope', requires: 'links' }]);
  const d = (f) => featuresDigest({ ...FEATURES, ...f });
  assert.notEqual(d({ linkScope: false }), d({}));
  assert.equal(d({ links: false }), d({}));
  assert.notEqual(featuresDigest(eff({ links: false }).config.features), featuresDigest(eff({}).config.features));
});

/** 가짜 팩에 프리셋 하나를 더한 것(initWork 는 프리셋이 필요하다). */
function fakePresetPacks() {
  const packs = fakePacks();
  const fake = packs.get('fake');
  packs.set('fake', { ...fake, presets: { scene: { title: '장면', levels: [{ name: 'scene', leaf: true }], checkSets: ['fake.basic'] } } });
  return packs;
}

test('tracking affects the feature digest only when an approved plan is present', () => {
  const on = { ...FEATURES, tracking: true };
  const off = { ...FEATURES, tracking: false };
  const { tracking: _tracking, ...legacy } = on;
  assert.equal(featuresDigest(on), featuresDigest(legacy));
  assert.equal(featuresDigest(off), featuresDigest(legacy));
  assert.notEqual(featuresDigest(on, true), featuresDigest(off, true));
});

test('M7a features: images, imageReferences and imageReview are on by default and appended before variants; the two children follow images; none changes the node run digest', () => {
  const keys = Object.keys(FEATURES);
  assert.deepEqual(keys.slice(keys.indexOf('viewerExport'), keys.indexOf('viewerExport') + 5), ['viewerExport', 'images', 'imageReferences', 'imageReview', 'variants']);
  assert.deepEqual([FEATURES.images, FEATURES.imageReferences, FEATURES.imageReview], [true, true, true]);
  assert.deepEqual([FEATURE_PARENTS.images, FEATURE_PARENTS.imageReferences, FEATURE_PARENTS.imageReview], [undefined, 'images', 'images']);
  const eff = (features) => validateWorkConfig({ ...base, features });
  assert.deepEqual(eff({ images: false }).config.features, { ...FEATURES, images: false, imageReferences: false, imageReview: false });
  assert.deepEqual(eff({ images: false }).errors, []);
  assert.deepEqual(eff({ images: false, imageReview: true }).errors, [{ code: 'FEATURE_REQUIRES', feature: 'imageReview', requires: 'images' }]);
  const d = (f) => featuresDigest({ ...FEATURES, ...f });
  for (const key of ['images', 'imageReferences', 'imageReview']) {
    assert.ok(!RUN_FEATURES.includes(key), key);
    assert.equal(d({ [key]: false }), d({}), key);
  }
});

test('N6 feature: variants is on by default, appended after imageReview, without a parent and outside the run digest', () => {
  const keys = Object.keys(FEATURES);
  assert.deepEqual(keys.slice(keys.indexOf('variants'), keys.indexOf('variants') + 1), ['variants']);
  assert.equal(keys.indexOf('variants'), keys.indexOf('imageReview') + 1);
  assert.deepEqual([FEATURES.variants, FEATURE_PARENTS.variants, RUN_FEATURES.includes('variants')], [true, undefined, false]);
  assert.equal(featuresDigest({ ...FEATURES, variants: false }), featuresDigest(FEATURES));
  assert.deepEqual(validateWorkConfig({ ...base, features: { variants: false } }).errors, []);
});
