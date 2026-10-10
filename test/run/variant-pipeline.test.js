import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { openWorkspace } from '../../core/run/workspace.js';
import { checksDigestFor, pipelineFor, runMismatch } from '../../core/run/level-pipeline.js';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { fakePack } from '../support/fake-pack.js';
import { fakePacks } from '../support/fixtures.js';
import { EN, patchWork, variantWork } from '../support/variant-work.js';

const ids = (pipeline) => pipeline.steps.map((s) => [s.id, s.kind, s.locked]);

test('every declared variant gets the core variant pipeline; only commit is locked', async () => {
  const root = await variantWork();
  const ctx = await openWorkspace(root, { packs: fakePacks() });
  assert.deepEqual(ids(ctx.pipelines.variants.en), [
    ['draft', 'generate', false], ['variant-checks', 'check', false], ['variant-review', 'check', false],
    ['revise', 'generate', false], ['approve', 'gate', false], ['commit', 'commit', true],
  ]);
  assert.equal(ctx.pipelines.variants.en.variant, 'en');
  assert.equal(typeof ctx.checksDigest.variants.en, 'string');
  assert.deepEqual(ctx.applied.variants.en, []);
});

test('the variant pipeline digest is bound to the variant: same steps, other variant id → other digest; main digests do not move', async () => {
  const plain = await variantWork({ variants: [] });
  const one = await variantWork();
  const two = await variantWork({ variants: [EN, { ...EN, id: 'en-us' }] });
  const before = await openWorkspace(plain, { packs: fakePacks() });
  const a = await openWorkspace(one, { packs: fakePacks() });
  const b = await openWorkspace(two, { packs: fakePacks() });
  assert.notEqual(b.pipelines.variants.en.digest, b.pipelines.variants['en-us'].digest);
  assert.equal(a.pipelines.variants.en.digest, b.pipelines.variants.en.digest);
  assert.notEqual(a.pipelines.variants.en.digest, a.pipelines.leaf.digest);
  assert.deepEqual([a.pipelines.leaf.digest, a.pipelines.branch.digest, a.checksDigest.leaf], [before.pipelines.leaf.digest, before.pipelines.branch.digest, before.checksDigest.leaf]);
});

test('variants[].steps patches existing variant steps only; the commit lock and new steps are refused', async () => {
  const auto = await variantWork({ variants: [{ ...EN, steps: { approve: { mode: 'auto' }, 'variant-review': { mode: 'off', reason: '속도' } } }] });
  const ctx = await openWorkspace(auto, { packs: fakePacks() });
  assert.deepEqual(ctx.pipelines.variants.en.steps.filter((s) => s.mode !== 'on').map((s) => [s.id, s.mode]), [['variant-review', 'off'], ['approve', 'auto']]);
  const codes = async (steps) => openWorkspace(await variantWork({ variants: [{ ...EN, steps }] }), { packs: fakePacks() })
    .then(() => [], (error) => error.details.errors.map((e) => [e.code, e.variant]));
  assert.deepEqual(await codes({ commit: { mode: 'off' } }), [['LOCKED_STEP_OVERRIDE', 'en']]);
  assert.deepEqual(await codes({ tone: { kind: 'check', tier: 'model', after: 'draft' } }), [['VARIANT_STEP_UNKNOWN', 'en']]);
  assert.deepEqual(await codes({ approve: { mode: 'later' } }), [['STEP_MODE_INVALID', 'en']]);
});

test('pipelineFor follows the run variant; an undeclared variant is VARIANT_UNKNOWN and counts as a mismatch (skip only)', async () => {
  const root = await variantWork();
  const ctx = await openWorkspace(root, { packs: fakePacks() });
  const run = { runId: 'run-x', nodeId: 'ep-001', level: 'episode', nodeKind: 'leaf' };
  assert.equal(pipelineFor(ctx, { ...run, variant: 'en' }), ctx.pipelines.variants.en);
  assert.equal(checksDigestFor(ctx, { ...run, variant: 'en' }), ctx.checksDigest.variants.en);
  assert.equal(pipelineFor(ctx, run), ctx.pipelines.byLevel.episode, 'a run file without a variant key is main');
  for (const forged of ['fr', 'constructor', 5]) {
    assert.throws(() => pipelineFor(ctx, { ...run, variant: forged }), { code: 'VARIANT_UNKNOWN' });
    assert.equal(runMismatch(ctx, { ...run, variant: forged })?.code, 'VARIANT_UNKNOWN');
  }
  assert.equal(runMismatch(ctx, { ...run, variant: 'en' }), null);
});

test('a pack check on a variant stage has a home even when the work declares no variant', async () => {
  const root = await variantWork({ variants: [] });
  const check = { id: 'fake.variant-structure', tier: 'deterministic', stage: 'variant-checks', severity: 'advisory', origin: 'pack', run: () => [] };
  const pack = { ...fakePack, checks: [...fakePack.checks, check], checkSets: { ...fakePack.checkSets, 'fake.basic': { ...fakePack.checkSets['fake.basic'], checks: [...fakePack.checkSets['fake.basic'].checks, check.id] } } };
  const ctx = await openWorkspace(root, { packs: new Map([['fake', pack]]) });
  assert.ok(ctx.checks.some((c) => c.id === check.id));
  await patchWork(root, { variants: ['main', EN] });
  const withEn = await openWorkspace(root, { packs: new Map([['fake', pack]]) });
  assert.deepEqual(withEn.applied.variants.en.map((a) => a.checkId), [check.id]);
  assert.deepEqual(withEn.applied.leaf.map((a) => a.checkId).includes(check.id), false, 'a variant check never runs on main');
});

test('strict hard check placement rejects an off variant stage but keeps advisory and non-strict choices', async () => {
  const makePack = (severity) => {
    const check = { id: 'fake.variant-hard', tier: 'deterministic', stage: 'variant-checks', severity, origin: 'pack', run: () => [] };
    return new Map([['fake', { ...fakePack, checks: [...fakePack.checks, check], checkSets: {
      ...fakePack.checkSets,
      'fake.basic': { ...fakePack.checkSets['fake.basic'], checks: [...fakePack.checkSets['fake.basic'].checks, check.id] },
    } }]]);
  };
  const root = await variantWork({ variants: [{ ...EN, steps: { 'variant-checks': { mode: 'off', reason: 'manual review' } } }] });
  await patchWork(root, { options: { includeAllHardChecks: true } });
  await assert.rejects(openWorkspace(root, { packs: makePack('hard') }),
    (error) => error.code === 'CONFIG_INVALID' && error.details.errors.some((item) => item.code === 'HARD_CHECK_OVERRIDE' && item.checkId === 'fake.variant-hard'));
  assert.deepEqual((await openWorkspace(root, { packs: makePack('advisory') })).applied.variants.en, []);
  await patchWork(root, { options: { includeAllHardChecks: false } });
  assert.deepEqual((await openWorkspace(root, { packs: makePack('hard') })).applied.variants.en, []);
});

test('an uncoercible JSON variant is a mismatch and its saved run can be skipped', async () => {
  const root = await variantWork();
  const packs = fakePacks();
  const ctx = await openWorkspace(root, { packs });
  const variant = { toString: null, valueOf: null };
  const run = { runId: 'bad-variant', nodeId: 'ep-001', level: 'episode', nodeKind: 'leaf', variant };
  for (const choose of [pipelineFor, checksDigestFor]) {
    assert.throws(() => choose(ctx, run), { code: 'VARIANT_UNKNOWN' });
  }
  assert.equal(runMismatch(ctx, run)?.code, 'VARIANT_UNKNOWN');

  const runner = () => createRunner({ root, packs });
  const asked = await runner().run({ node: 'ep-001' });
  assert.equal(asked.status, 'needs_model');
  const file = createRunStore(root).pathOf(asked.runId);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, `${JSON.stringify({ ...saved, variant }, null, 2)}\n`);
  assert.equal((await runner().decide({ runId: asked.runId, action: 'skip', reason: 'invalid variant' })).status, 'skipped');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).state, 'abandoned');
});
