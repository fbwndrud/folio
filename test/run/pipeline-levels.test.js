import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePipelines, customStepChecks } from '../../core/pipeline/resolve.js';
import { mergeOverrides, splitOverrides } from '../../core/pipeline/levels.js';
import { BUILTIN_CHECKS } from '../../core/checks/builtin.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { parseYaml } from '../../core/util/yaml.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';

const levels = validateWorkConfig({ levels: [{ name: 'book' }, { name: 'chapter' }, { name: 'scene', leaf: true }], packs: ['fake'] }).config.levels;
const resolve = (overrides, extra = {}) => resolvePipelines({ primary: fakePack, overrides, checks: [...BUILTIN_CHECKS, ...fakePack.checks], levels, ...extra });
const codes = (overrides) => resolve(overrides).errors.map((e) => [e.code, e.level ?? null]);
const step = (pipeline, id) => pipeline.steps.find((s) => s.id === id);

test('without level overrides every level shares its kind pipeline', () => {
  const r = resolve({ critic: { mode: 'off' } });
  assert.deepEqual(r.errors, []);
  assert.equal(r.byLevel.scene, r.leaf);
  assert.equal(r.byLevel.book, r.branch);
  assert.equal(r.byLevel.chapter, r.branch);
});

test('a level override sits on top of the global overrides for that level only', () => {
  const r = resolve({ critic: { mode: 'off', reason: '속도' }, levels: { book: { approve: { mode: 'auto' } }, scene: { critic: { mode: 'on' } } } });
  assert.deepEqual(r.errors, []);
  assert.equal(step(r.byLevel.book, 'approve').mode, 'auto');
  assert.equal(step(r.byLevel.chapter, 'approve').mode, 'on');
  assert.equal(r.byLevel.chapter, r.branch);
  assert.equal(step(r.leaf, 'critic').mode, 'off');
  assert.equal(step(r.byLevel.scene, 'critic').mode, 'on');
  assert.notEqual(r.byLevel.book.digest, r.byLevel.chapter.digest);
  assert.notEqual(r.byLevel.scene.digest, r.leaf.digest);
});

test('a level can add its own custom check step; the step brings its advisory check once', () => {
  const r = resolve({ levels: { chapter: { tone: { after: 'fit', kind: 'check', tier: 'model', prompt: 'checks/tone.md' } } } });
  assert.deepEqual(r.errors, []);
  assert.ok(step(r.byLevel.chapter, 'tone'));
  assert.equal(step(r.byLevel.book, 'tone'), undefined);
  assert.deepEqual(customStepChecks(r).map((c) => [c.id, c.stage]), [['tone', 'tone']]);
  const clash = resolve({ levels: {
    book: { tone: { after: 'fit', kind: 'check', tier: 'model', prompt: 'checks/a.md' } },
    chapter: { tone: { after: 'fit', kind: 'check', tier: 'model', prompt: 'checks/b.md' } },
  } });
  assert.deepEqual(clash.errors.map((e) => e.code), ['CUSTOM_STEP_CONFLICT']);
});

test('lock rules are the same at every level', () => {
  assert.deepEqual(codes({ levels: { scene: { facts: { mode: 'off' } } } }), [['LOCKED_STEP_OVERRIDE', 'scene']]);
  assert.deepEqual(codes({ levels: { book: { commit: { mode: 'off' } } } }), [['LOCKED_STEP_OVERRIDE', 'book']]);
  assert.deepEqual(codes({ levels: { scene: { extract: { after: 'critic' } } } }), [['LOCKED_STEP_OVERRIDE', 'scene']]);
});

test('unknown levels, bad shapes and stray steps are reported with their level', () => {
  assert.deepEqual(codes({ levels: { volume: { approve: { mode: 'auto' } } } }), [['OVERRIDE_LEVEL_UNKNOWN', 'volume']]);
  assert.deepEqual(codes({ levels: [] }), [['OVERRIDE_LEVELS_INVALID', null]]);
  assert.deepEqual(codes({ levels: { book: 'auto' } }), [['OVERRIDE_LEVELS_INVALID', 'book']]);
  assert.deepEqual(codes({ levels: { book: { ghost: { mode: 'off' } } } }), [['STEP_UNKNOWN', 'book']]);
  assert.deepEqual(codes({ levels: { scene: { fit: { mode: 'off' } } } }), [['STEP_UNKNOWN', 'scene']]);
});

test('includeAllHardChecks also forbids switching off a hard check step at one level', () => {
  const hard = { id: 'fake.hard-critic', tier: 'model', stage: 'critic', severity: 'hard' };
  const r = resolvePipelines({ primary: fakePack, overrides: { levels: { scene: { critic: { mode: 'off', reason: 'r' } } } }, checks: [hard], levels, includeAllHardChecks: true });
  assert.deepEqual(r.errors.map((e) => [e.code, e.stepId]), [['HARD_CHECK_OVERRIDE', 'critic']]);
});

test('splitting and merging keep __proto__ keys as plain data', () => {
  const overrides = parseYaml('levels:\n  book:\n    __proto__:\n      mode: off\n');
  const split = splitOverrides(overrides, ['book']);
  assert.deepEqual(split.errors, []);
  const merged = mergeOverrides(split.global, split.perLevel.book);
  assert.ok(Object.prototype.hasOwnProperty.call(merged, '__proto__'));
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
});

test('a level patch that breaks another step\'s requires order is still reported, even off the patched step', () => {
  // critic 이 plan 을 requires 하도록 손본 팩. scene 에서 plan 을 critic 뒤로 옮기면 REQUIRES_ORDER 는
  // stepId: 'critic' 로 나온다(patch 는 'plan' 에 걸렸다) — patches 키만 보던 예전 필터는 이걸 놓쳤다.
  const pack = { ...fakePack, pipelines: { ...fakePack.pipelines, leaf: fakePack.pipelines.leaf.map((s) => (s.id === 'critic' ? { ...s, requires: ['plan'] } : s)) } };
  const withPack = (overrides) => resolvePipelines({ primary: pack, overrides, checks: [...BUILTIN_CHECKS, ...fakePack.checks], levels });
  const global = withPack({ plan: { after: 'critic' } });
  assert.ok(global.errors.some((e) => e.code === 'REQUIRES_ORDER'));
  const level = withPack({ levels: { scene: { plan: { after: 'critic' } } } });
  assert.deepEqual(level.errors.map((e) => [e.code, e.level]), [['REQUIRES_ORDER', 'scene']]);
});

test('a level cannot add a custom step whose id belongs to the other kind\'s pipeline', () => {
  const r = resolve({ levels: { scene: { fit: { after: 'draft', kind: 'check', tier: 'model', prompt: 'checks/fit.md' } } } });
  assert.deepEqual(r.errors.map((e) => [e.code, e.level, e.stepId]), [['CUSTOM_STEP_CONFLICT', 'scene', 'fit']]);
  // 거부된 설정이어도 customStepChecks 는 branch 의 진짜 fit 단계로 사용자 검사를 새게 하지 않는다.
  assert.deepEqual(customStepChecks(r), []);
  const globalClash = resolve({ fit: { after: 'draft', kind: 'check', tier: 'model', prompt: 'checks/fit.md' } });
  assert.ok(globalClash.errors.some((e) => e.code === 'CUSTOM_STEP_CONFLICT' && e.stepId === 'fit' && e.level === undefined));
});

test('a level named "constructor" is a plain level: shares its kind pipeline when it has no override', () => {
  const ctorLevels = validateWorkConfig({ levels: [{ name: 'constructor' }, { name: 'scene', leaf: true }], packs: ['fake'] }).config.levels;
  const r = resolvePipelines({ primary: fakePack, overrides: {}, checks: [...BUILTIN_CHECKS, ...fakePack.checks], levels: ctorLevels });
  assert.deepEqual(r.errors, []);
  assert.equal(r.byLevel.constructor, r.branch);
});

test('the workspace keeps pipelines, check digests and applied checks per level', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { levels: { book: { approve: { mode: 'auto' } } } } });
  const ws = await openWorkspace(root, { packs: fakePacks() });
  assert.deepEqual(Object.keys(ws.pipelines.byLevel), ['book', 'chapter', 'scene']);
  assert.notEqual(ws.pipelines.byLevel.book.digest, ws.pipelines.byLevel.chapter.digest);
  assert.equal(ws.pipelines.byLevel.chapter, ws.pipelines.branch);
  assert.equal(ws.checksDigest.byLevel.scene, ws.checksDigest.leaf);
  assert.deepEqual(ws.applied.byLevel.scene, ws.applied.leaf);
});
