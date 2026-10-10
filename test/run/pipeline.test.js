import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePipeline } from '../../core/pipeline/define.js';
import { resolvePipelines, customStepChecks } from '../../core/pipeline/resolve.js';
import { BUILTIN_CHECKS } from '../../core/checks/builtin.js';
import { fakePack } from '../support/fake-pack.js';
import { parseYaml } from '../../core/util/yaml.js';

const leaf = (overrides) => resolvePipeline(fakePack.pipelines.leaf, overrides);
const codes = (result) => result.errors.map((e) => e.code);

test('the default leaf pipeline locks commit, facts and everything facts needs', () => {
  const { steps, errors, digest } = leaf({});
  assert.deepEqual(errors, []);
  assert.deepEqual(steps.map((s) => s.id), ['plan', 'draft', 'extract', 'facts', 'critic', 'revise', 'approve', 'commit']);
  assert.deepEqual(steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  assert.match(digest, /^sha256:/);
  assert.notEqual(leaf({ critic: { mode: 'off' } }).digest, digest);
});

test('adjustable steps can be switched off with a reason, auto-approved or tuned', () => {
  const { steps, errors } = leaf({ critic: { mode: 'off', reason: '초고 속도 우선' }, approve: { mode: 'auto' }, revise: { max: 2 } });
  assert.deepEqual(errors, []);
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  assert.deepEqual([byId.critic.mode, byId.critic.reason, byId.critic.source], ['off', '초고 속도 우선', 'work.yaml#overrides.critic']);
  assert.equal(byId.approve.mode, 'auto');
  assert.equal(byId.revise.loop.max, 2);
});

test('a new check step can be added after an existing one', () => {
  const { steps, errors } = leaf({ tone: { after: 'critic', kind: 'check', tier: 'model', prompt: 'checks/tone.md' } });
  assert.deepEqual(errors, []);
  assert.deepEqual(steps.map((s) => s.id).slice(4, 6), ['critic', 'tone']);
  assert.deepEqual([steps[5].custom, steps[5].stage, steps[5].locked], [true, 'tone', false]);
});

const lockedAttempts = {
  'facts off': { facts: { mode: 'off', reason: 'x' } },
  'extract off': { extract: { mode: 'off' } },
  'draft off': { draft: { mode: 'off' } },
  'commit off': { commit: { mode: 'off' } },
  'facts moved': { facts: { after: 'critic' } },
  'facts unlocked': { facts: { locked: false } },
};
for (const [label, overrides] of Object.entries(lockedAttempts)) {
  test(`locked step override is refused: ${label}`, () => {
    assert.deepEqual(codes(leaf(overrides)), ['LOCKED_STEP_OVERRIDE']);
  });
}

const otherErrors = [
  [{ critic: { mode: 'auto' } }, 'STEP_MODE_INVALID'],
  [{ revise: { max: 5 } }, 'LOOP_MAX_EXCEEDED'],
  [{ critic: { max: 2 } }, 'STEP_FIELD_IMMUTABLE'],
  [{ critic: { kind: 'gate' } }, 'STEP_FIELD_IMMUTABLE'],
  [{ critic: { after: 'commit' } }, 'COMMIT_MUST_BE_LAST'],
  [{ critic: { after: 'ghost' } }, 'STEP_AFTER_UNKNOWN'],
  [{ extra: { after: 'critic', kind: 'commit' } }, 'STEP_KIND_INVALID'],
  [{ extra: { after: 'critic', kind: 'check', tier: 'magic' } }, 'STEP_TIER_INVALID'],
];
for (const [overrides, code] of otherErrors) {
  test(`reports ${code}`, () => {
    assert.ok(codes(leaf(overrides)).includes(code), JSON.stringify(leaf(overrides).errors));
  });
}

test('resolvePipelines applies overrides where the step exists and reports strays once', () => {
  const checks = [...BUILTIN_CHECKS, ...fakePack.checks];
  const ok = resolvePipelines({ primary: fakePack, overrides: { critic: { mode: 'off' }, fit: { mode: 'off' } }, checks });
  assert.deepEqual(ok.errors, []);
  const stray = resolvePipelines({ primary: fakePack, overrides: { ghost: { mode: 'off' }, commit: { mode: 'off' } }, checks });
  assert.deepEqual(stray.errors.map((e) => e.code).sort(), ['LOCKED_STEP_OVERRIDE', 'STEP_UNKNOWN']);
});

test('checks must live in a stage of matching tier, and locked checks in a locked step', () => {
  const run = (check) => resolvePipelines({ primary: fakePack, overrides: {}, checks: [check] }).errors.map((e) => e.code);
  assert.deepEqual(run({ id: 'a', tier: 'model', stage: 'facts' }), ['CHECK_TIER_MISMATCH']);
  assert.deepEqual(run({ id: 'b', tier: 'model', stage: 'nowhere' }), ['CHECK_STAGE_MISSING']);
  assert.deepEqual(run({ id: 'c', tier: 'model', stage: 'critic', locked: true }), ['LOCKED_CHECK_UNGUARDED']);
});

test('a check step hosting a hard check cannot be switched off when includeAllHardChecks is on', () => {
  const hard = { id: 'fake.hard-critic', tier: 'model', stage: 'critic', severity: 'hard' };
  const strict = { includeAllHardChecks: true };
  const off = resolvePipelines({ primary: fakePack, overrides: { critic: { mode: 'off', reason: 'r' } }, checks: [hard], ...strict });
  assert.deepEqual(off.errors.map((e) => [e.code, e.checkId, e.stepId]), [['HARD_CHECK_OVERRIDE', 'fake.hard-critic', 'critic']]);
  const soft = resolvePipelines({ primary: fakePack, overrides: { critic: { mode: 'off', reason: 'r' } }, checks: [{ ...hard, severity: 'block' }], ...strict });
  assert.deepEqual(soft.errors, []);
  const moved = resolvePipelines({ primary: fakePack, overrides: { critic: { after: 'approve' } }, checks: [hard], ...strict });
  assert.deepEqual(moved.errors, []);
  // 옵션이 꺼져 있으면(기본) hard 검사가 든 단계를 끄는 것은 사용자의 선택이다.
  assert.deepEqual(resolvePipelines({ primary: fakePack, overrides: { critic: { mode: 'off', reason: 'r' } }, checks: [hard] }).errors, []);
});

test('custom model check steps bring their own advisory check', () => {
  const pipelines = resolvePipelines({ primary: fakePack, overrides: { tone: { after: 'critic', kind: 'check', tier: 'model', prompt: 'checks/tone.md' } }, checks: [] });
  assert.deepEqual(customStepChecks(pipelines).map((c) => [c.id, c.stage, c.severity, c.instructionSource, c.requireQuote]), [
    ['tone', 'tone', 'advisory', 'checks/tone.md', true],
  ]);
});

test('a custom step id reached through YAML __proto__ pollution is refused', () => {
  const overrides = parseYaml('__proto__:\n  after: critic\n  kind: check\n  tier: model\n');
  assert.ok(Object.prototype.hasOwnProperty.call(overrides, '__proto__'));
  assert.deepEqual(codes(leaf(overrides)), ['STEP_ID_INVALID']);
});

test('a custom step id that shadows Object.prototype is refused', () => {
  assert.deepEqual(codes(leaf({ constructor: { after: 'critic', kind: 'check', tier: 'model' } })), ['STEP_ID_INVALID']);
});

test('a custom step mode must be a real mode', () => {
  assert.deepEqual(codes(leaf({ tone: { after: 'critic', kind: 'check', tier: 'model', mode: 'banana' } })), ['STEP_MODE_INVALID']);
});

test('a custom check step cannot be auto-approved', () => {
  assert.deepEqual(codes(leaf({ tone: { after: 'critic', kind: 'check', tier: 'model', mode: 'auto' } })), ['STEP_MODE_INVALID']);
});

test('a custom step cannot be kind generate', () => {
  assert.deepEqual(codes(leaf({ tone: { after: 'critic', kind: 'generate' } })), ['STEP_KIND_INVALID']);
});

test('a custom step cannot carry unsupported fields', () => {
  assert.deepEqual(codes(leaf({ tone: { after: 'critic', kind: 'check', tier: 'model', stage: 'somewhere' } })), ['STEP_FIELD_IMMUTABLE']);
});

test('an array patch on an existing step is refused', () => {
  assert.deepEqual(codes(leaf({ critic: [] })), ['STEP_PATCH_INVALID']);
});

test('a non-string prompt on a custom step is refused', () => {
  assert.deepEqual(codes(leaf({ tone: { after: 'critic', kind: 'check', tier: 'model', prompt: 5 } })), ['STEP_PATCH_INVALID']);
});
