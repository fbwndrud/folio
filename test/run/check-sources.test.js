import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWorkspace } from '../../core/run/workspace.js';
import { buildModelCheckRequest } from '../../core/checks/run-checks.js';
import { stagesByTier, validateUserCheckDraft } from '../../core/checks/user-check-draft.js';
import { copyFixture, tempDir, useFakePack, fakePacks } from '../support/fixtures.js';

async function workWith(checks) {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { checks });
  return root;
}
const open = (root) => openWorkspace(root, { packs: fakePacks() });
const codesOf = async (root) => open(root).then(() => [], (e) => e.details.errors.map((x) => x.code));

test('a user check reads its rule from checks/ and its samples from a checks/ folder', async () => {
  const root = await workWith({ tone: { source: 'checks/no-honorifics.md', samples: 'checks/tone-samples' } });
  await mkdir(join(root, 'checks/tone-samples'));
  await writeFile(join(root, 'checks/tone-samples/b.md'), '둘째 예시');
  await writeFile(join(root, 'checks/tone-samples/a.md'), '첫째 예시');
  const { checks } = await open(root);
  const tone = checks.find((c) => c.id === 'tone');
  assert.ok(tone.instructionText.length > 0);
  assert.deepEqual(tone.samples, [{ name: 'a.md', text: '첫째 예시' }, { name: 'b.md', text: '둘째 예시' }]);
  assert.deepEqual(buildModelCheckRequest([tone], { draft: 'x' }).checks[0].samples, tone.samples);
});

test('check sources outside checks/ are refused, including symlink escapes', async () => {
  for (const spec of [{ source: 'work.yaml' }, { source: '../outside.md' }, { samples: 'entities' }, { source: 'checks/../work.yaml' }]) {
    assert.deepEqual(await codesOf(await workWith({ bad: spec })), ['CHECK_SOURCE_INVALID'], JSON.stringify(spec));
  }
  const root = await workWith({ bad: { source: 'checks/escape.md' } });
  const outside = join(await tempDir(), 'secret.md');
  await writeFile(outside, 'secret');
  await symlink(outside, join(root, 'checks/escape.md'));
  assert.deepEqual(await codesOf(root), ['CHECK_SOURCE_INVALID']);
  assert.deepEqual(await codesOf(await workWith({ gone: { source: 'checks/missing.md' } })), ['USER_CHECK_SOURCE_MISSING']);
  assert.deepEqual(await codesOf(await workWith({ gone: { samples: 'checks/nothing-here' } })), ['USER_CHECK_SOURCE_MISSING']);
});

test('validateUserCheckDraft normalises an AI draft: experimental, advisory by default, quotes required', () => {
  const rule = validateUserCheckDraft({ id: 'no-cliche', rule: '상투적인 비유를 찾는다.', experimental: false, requireQuote: false });
  assert.deepEqual(rule.errors, []);
  assert.deepEqual(rule.spec, { rule: '상투적인 비유를 찾는다.', severity: 'advisory', experimental: true, requireQuote: true });
  assert.equal(rule.kind, 'model');
  const words = validateUserCheckDraft({ words: ['갑자기'], pattern: '문득+', severity: 'block' });
  assert.deepEqual([words.errors, words.kind, words.spec.severity, words.spec.experimental], [[], 'pattern', 'block', true]);
});

test('validateUserCheckDraft refuses what a draft may not do', () => {
  const codes = (spec) => validateUserCheckDraft(spec).errors.map((e) => e.code);
  assert.deepEqual(codes({ rule: 'x', severity: 'hard' }), ['USER_CHECK_SEVERITY_INVALID']);
  assert.deepEqual(codes({ pattern: '(' }), ['USER_CHECK_PATTERN_INVALID']);
  assert.deepEqual(codes({}), ['USER_CHECK_INVALID']);
  assert.deepEqual(codes({ rule: 'x', words: ['y'] }), ['USER_CHECK_KIND_AMBIGUOUS']);
  assert.deepEqual(codes({ id: 'core.promise-order', rule: 'x' }), ['USER_CHECK_ID_INVALID']);
  assert.deepEqual(codes({ id: 'Bad Id', rule: 'x' }), ['USER_CHECK_ID_INVALID']);
  assert.deepEqual(codes({ rule: 'x', locked: true }), ['USER_CHECK_FIELD_UNKNOWN']);
  assert.deepEqual(codes({ source: '../x.md' }), ['CHECK_SOURCE_INVALID']);
  assert.deepEqual(codes({ words: [3] }), ['USER_CHECK_INVALID']);
  assert.deepEqual(codes(null), ['USER_CHECK_INVALID']);
});

test('validateUserCheckDraft only accepts a stage that exists for the check tier', () => {
  const codes = (spec, options) => validateUserCheckDraft(spec, options).errors.map((e) => e.code);
  assert.deepEqual(codes({ words: ['x'], stage: 'critic' }), ['USER_CHECK_STAGE_INVALID']);
  assert.deepEqual(codes({ rule: 'x', stage: 'facts' }), ['USER_CHECK_STAGE_INVALID']);
  assert.deepEqual(codes({ rule: 'x', stage: 'critic' }), []);
  assert.deepEqual(codes({ words: ['x'], stage: 'facts' }), []);
  assert.deepEqual(codes({ rule: 'x', stage: 3 }), ['USER_CHECK_STAGE_INVALID']);
  const stages = stagesByTier({ leaf: { steps: [{ kind: 'check', tier: 'model', stage: 'critic' }, { kind: 'check', tier: 'model', id: 'tone' }] }, branch: { steps: [] } });
  assert.deepEqual(stages, { deterministic: [], model: ['critic', 'tone'] });
  assert.deepEqual(codes({ rule: 'x', stage: 'tone' }, { stages }), []);
  assert.deepEqual(codes({ words: ['x'], stage: 'facts' }, { stages }), ['USER_CHECK_STAGE_INVALID']);
});
