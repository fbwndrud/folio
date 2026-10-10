import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createImageRunner } from '../../core/image/runner.js';
import { createImageRunStore } from '../../core/image/run-store.js';
import { illustratedWork, createImageHost, answerUntil } from '../support/image-work.js';

const configError = (code, checkId) => (error) => error.code === 'CONFIG_INVALID'
  && error.details.errors.some((e) => e.code === code && e.checkId === checkId);

for (const stage of ['image-precheck', 'image-review']) {
  for (const selection of ['strict', 'explicit']) {
    for (const features of [{}, { imageReview: false }, { imageReferences: false }, { images: false }]) {
      test(`selected hard ${stage} refuses unsupported configuration: ${selection} ${JSON.stringify(features)}`, async () => {
        const packs = await loadBuiltinPacks();
        packs.set('guard', { name: 'guard', checks: [{ id: 'guard.check', stage,
          tier: stage === 'image-precheck' ? 'deterministic' : 'model', severity: 'hard', instruction: 'Block', run: () => [] }], checkSets: {} });
        const root = await illustratedWork((c) => ({ ...c, packs: [...c.packs, 'guard'], features,
          options: { ...c.options, includeAllHardChecks: selection === 'strict' },
          checks: { ...c.checks, ...(selection === 'explicit' ? { 'guard.check': { mode: 'on' } } : {}) } }));
        await assert.rejects(openWorkspace(root, { packs }), configError('IMAGE_HARD_CHECK_UNSUPPORTED', 'guard.check'));
        await assert.rejects(createImageRunner({ root, packs }).start({ assetId: 'hard-blocked' }), configError('IMAGE_HARD_CHECK_UNSUPPORTED', 'guard.check'));
      });
    }
  }
}

test('unselected non-strict hard image check stays off, ordinary advisory review-off can commit', async () => {
  const packs = await loadBuiltinPacks();
  packs.set('guard', { name: 'guard', checks: [{ id: 'guard.review', stage: 'image-review', tier: 'model', severity: 'hard', instruction: 'Block' }], checkSets: {} });
  const root = await illustratedWork((c) => ({ ...c, packs: [...c.packs, 'guard'], features: { imageReview: false } }));
  const host = await createImageHost();
  const runner = createImageRunner({ root, packs });
  const question = await answerUntil(runner, host, await runner.start({ assetId: 'advisory-off' }));
  assert.equal((await runner.decide({ runId: question.runId, action: 'approve' })).status, 'done');
  assert.deepEqual(host.calls.map((c) => c.purpose), ['image_brief', 'image_generate']);
});

for (const spec of [{ words: ['문'] }, { pattern: '잠긴 문' }]) {
  test(`user precheck examines real brief text: ${JSON.stringify(spec)}`, async () => {
    const root = await illustratedWork((c) => ({ ...c, checks: { ...c.checks,
      'user.pre': { ...spec, stage: 'image-precheck', severity: 'block' } } }));
    const runner = createImageRunner({ root, packs: await loadBuiltinPacks() });
    const host = await createImageHost();
    const question = await answerUntil(runner, host, await runner.start({ assetId: 'text-blocked' }));
    assert.equal(question.question.kind, 'image_precheck');
    const check = (await createImageRunStore(root).load(question.runId)).results.precheck.checks.find((c) => c.checkId === 'user.pre');
    assert.equal(check.status, 'failed');
    assert.equal(check.findings[0].severity, 'block');
    assert.ok(question.question.brief.mustShow.some((text) => text.includes(check.findings[0].quote)));
    assert.deepEqual(host.calls.map((c) => c.purpose), ['image_brief']);
  });
}

for (const spec of [{ rule: 'Check the brief', stage: 'image-precheck' }, { words: ['문'], stage: 'image-review' }]) {
  test(`image stage rejects incompatible user tier: ${spec.stage}`, async () => {
    const root = await illustratedWork((c) => ({ ...c, checks: { ...c.checks, 'user.wrong': spec } }));
    await assert.rejects(openWorkspace(root, { packs: await loadBuiltinPacks() }), configError('CHECK_TIER_MISMATCH', 'user.wrong'));
  });
}

for (const stage of ['image-precheck', 'image-review']) {
  test(`custom node step cannot inject a derived check into reserved image stage: ${stage}`, async () => {
    const root = await illustratedWork((c) => ({ ...c, overrides: { ...c.overrides,
      [stage]: { kind: 'check', tier: stage === 'image-precheck' ? 'model' : 'deterministic', after: 'facts', prompt: 'checks/custom.md' } } }));
    await mkdir(join(root, 'checks'), { recursive: true });
    await writeFile(join(root, 'checks/custom.md'), 'Synthetic rule');
    await assert.rejects(openWorkspace(root, { packs: await loadBuiltinPacks() }), (error) => error.code === 'CONFIG_INVALID'
      && error.details.errors.some((e) => e.code === 'CUSTOM_STEP_CONFLICT' && e.stepId === stage));
  });
}
