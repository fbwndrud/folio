import { canonicalJson } from '../util/hash.js';
import { resolvePipeline } from './define.js';
import { mergeOverrides, splitOverrides } from './levels.js';
import { IMAGE_STAGE_NAMES, IMAGE_STAGE_TIERS } from '../image/stages.js';

const stageOf = (step) => step.stage ?? step.id;
const unique = (pipelines) => [...new Set(pipelines.filter(Boolean))];

function dedupe(errors) {
  const seen = new Set();
  return errors.filter((error) => { const key = canonicalJson(error); if (seen.has(key)) return false; seen.add(key); return true; });
}

const strays = (patches, result, extra = {}) => Object.entries(patches)
  .filter(([id]) => !result.matched.has(id))
  .map(([id, patch]) => ({ code: patch?.kind ? 'STEP_AFTER_UNKNOWN' : 'STEP_UNKNOWN', stepId: id, ...extra }));

/**
 * 새 단계 id 가 primary 팩의 leaf·branch 원래 단계 id 와 겹치면 새 단계 취급을 거부한다.
 * 그림 전용 stage 이름도 예약한다. 겹치면 customStepChecks 파생 검사가 검증 뒤 다른 실행기로 샌다.
 */
const builtinConflicts = (result, builtinIds) => result.steps
  .filter((s) => s.custom && (builtinIds.has(s.id) || IMAGE_STAGE_NAMES.includes(s.id)))
  .map((s) => ({ code: 'CUSTOM_STEP_CONFLICT', stepId: s.id }));

/** result 의 정본 오류 + builtin id 충돌. 이 둘을 합쳐야 레벨과 kind 기본값을 공정하게 비교할 수 있다. */
const allErrors = (result, builtinIds) => [...result.errors, ...builtinConflicts(result, builtinIds)];

/**
 * 레벨마다 파이프라인. 레벨 덮어쓰기가 없으면 그 종류(leaf/branch)의 전체 파이프라인 객체를 그대로 쓴다.
 * 레벨 파이프라인의 오류는, 그 종류의 전체 파이프라인(레벨 덮어쓰기 없이)이 이미 낸 오류와 같은 것(level 무시하고 비교)만 빼고
 * 전부 level 을 붙여 알린다 — 레벨 덮어쓰기가 다른 단계(예: REQUIRES_ORDER 의 상대 단계)에서 오류를 일으킬 수 있어서다.
 */
function levelPipelines({ primary, levels, split, kinds, packDigest, errors, builtinIds }) {
  const byLevel = {};
  for (const level of levels) {
    const kind = level.leaf ? 'leaf' : 'branch';
    if (!Object.hasOwn(split.perLevel, level.name)) { byLevel[level.name] = kinds[kind]; continue; }
    const patches = split.perLevel[level.name];
    const result = resolvePipeline(primary.pipelines[kind], mergeOverrides(split.global, patches), { packDigest });
    const base = new Set(allErrors(kinds[kind], builtinIds).map((e) => canonicalJson(e)));
    const own = allErrors(result, builtinIds).filter((e) => !base.has(canonicalJson(e)));
    errors.push(...own.map((e) => ({ ...e, level: level.name })), ...strays(patches, result, { level: level.name }));
    byLevel[level.name] = result;
  }
  return byLevel;
}

/** 같은 id 의 새 단계는 어느 레벨에서든 모양(종류·tier·prompt)이 같아야 한다 — 검사 id 가 단계 id 라서다. */
function customConflicts(pipelines, errors) {
  const seen = new Map();
  for (const step of pipelines.flatMap((p) => p.steps).filter((s) => s.custom)) {
    const shape = canonicalJson({ kind: step.kind, tier: step.tier ?? null, prompt: step.prompt ?? null });
    if (seen.has(step.id) && seen.get(step.id) !== shape) errors.push({ code: 'CUSTOM_STEP_CONFLICT', stepId: step.id });
    seen.set(step.id, shape);
  }
}

/** 모든 검사가 들어갈 단계가 있는지(그림 실행 stage 의 검사는 빼고), 잠긴 검사는 맨 아래 칸의 모든 파이프라인에서 잠긴 단계에 있는지 본다. */
function checkPlacement({ checks, all, leafish, includeAllHardChecks, errors }) {
  const checkSteps = all.flatMap((p) => p.steps).filter((s) => s.kind === 'check');
  for (const check of checks) {
    // 그림 실행 stage(M7a)의 검사는 노드 파이프라인에 자리가 없다 — 그림 실행(core/image)이 돌린다.
    if (IMAGE_STAGE_NAMES.includes(check.stage)) {
      if (check.tier !== IMAGE_STAGE_TIERS[check.stage]) errors.push({ code: 'CHECK_TIER_MISMATCH', checkId: check.id, stage: check.stage });
      // 선택된 그림 hard 검사는 아직 지원하지 않는다. 기능 토글·적용 조건으로 검사가 사라지는 설정을 허용하지 않는다.
      if (check.severity === 'hard' || check.locked) errors.push({ code: 'IMAGE_HARD_CHECK_UNSUPPORTED', checkId: check.id, stage: check.stage });
      continue;
    }
    const homes = checkSteps.filter((s) => stageOf(s) === check.stage);
    if (!homes.length) errors.push({ code: 'CHECK_STAGE_MISSING', checkId: check.id, stage: check.stage });
    else if (homes.some((s) => s.tier !== check.tier)) errors.push({ code: 'CHECK_TIER_MISMATCH', checkId: check.id, stage: check.stage });
    if (includeAllHardChecks && check.severity === 'hard') {
      for (const step of homes.filter((s) => s.mode === 'off')) errors.push({ code: 'HARD_CHECK_OVERRIDE', checkId: check.id, stepId: step.id });
    }
    if (check.locked && !leafish.every((p) => p.steps.some((s) => s.kind === 'check' && s.locked && stageOf(s) === check.stage))) {
      errors.push({ code: 'LOCKED_CHECK_UNGUARDED', checkId: check.id });
    }
  }
}

/**
 * leaf/branch 파이프라인(전체 덮어쓰기)과 레벨별 파이프라인(전체 + overrides.levels.<레벨>)을 만든다.
 * hard 검사가 든 단계를 끄는 것은 사용자의 선택이다. 다만 includeAllHardChecks 를 켠 작품에서는 어느 레벨에서든 거부한다(HARD_CHECK_OVERRIDE).
 * 잠금 단계는 어느 레벨에서도 끌 수 없다(LOCKED_STEP_OVERRIDE).
 * homes: 검사를 둘 자리로만 보는 다른 파이프라인(판본 파이프라인, N6). 이 결과에는 들지 않는다.
 */
export function resolvePipelines({ primary, overrides, checks, levels = [], includeAllHardChecks = false, packDigest = null, homes = [] }) {
  const split = splitOverrides(overrides, levels.map((l) => l.name));
  /** @type {Array<{ code: string, [key: string]: unknown }>} */
  const errors = [...split.errors];
  const builtinIds = new Set([...primary.pipelines.leaf, ...primary.pipelines.branch].map((s) => s.id));
  const leaf = resolvePipeline(primary.pipelines.leaf, split.global, { packDigest });
  const branch = resolvePipeline(primary.pipelines.branch, split.global, { packDigest });
  errors.push(...allErrors(leaf, builtinIds), ...allErrors(branch, builtinIds));
  for (const [id, patch] of Object.entries(split.global)) {
    if (!leaf.matched.has(id) && !branch.matched.has(id)) errors.push({ code: patch?.kind ? 'STEP_AFTER_UNKNOWN' : 'STEP_UNKNOWN', stepId: id });
  }
  const byLevel = levelPipelines({ primary, levels, split, kinds: { leaf, branch }, packDigest, errors, builtinIds });
  const all = unique([leaf, branch, ...Object.values(byLevel)]);
  const leafish = unique([leaf, ...levels.filter((l) => l.leaf).map((l) => byLevel[l.name])]);
  customConflicts(all, errors);
  checkPlacement({ checks, all: [...all, ...homes], leafish, includeAllHardChecks, errors });
  return { leaf, branch, byLevel, errors: dedupe(errors) };
}

/**
 * work.yaml 로 추가한 검사 단계(prompt 파일 지정)는 같은 이름의 참고 의견 검사를 하나 갖는다. 모든 레벨을 본다.
 * id 가 어느 파이프라인에서든 원래(custom 아닌) 단계와 겹치면 파생하지 않는다 — CUSTOM_STEP_CONFLICT 로 이미 거부된 설정이
 * 다른 칸의 진짜 단계에 사용자 검사를 새게 하는 일은 없어야 한다.
 */
export function customStepChecks({ leaf, branch, byLevel = {} }) {
  const pipelines = unique([leaf, branch, ...Object.values(byLevel)]);
  const nonCustomIds = new Set(pipelines.flatMap((p) => p.steps.filter((s) => !s.custom).map((s) => s.id)));
  const seen = new Set();
  const checks = [];
  for (const step of pipelines.flatMap((p) => p.steps)) {
    if (!step.custom || step.kind !== 'check' || !step.prompt || seen.has(step.id) || nonCustomIds.has(step.id)) continue;
    seen.add(step.id);
    checks.push({
      id: step.id, tier: step.tier, stage: step.id, severity: 'advisory', experimental: true, origin: 'user',
      requireQuote: step.tier === 'model', instruction: null, instructionSource: step.prompt,
      ...(step.tier === 'deterministic' ? { run: () => [] } : {}),
    });
  }
  return checks;
}
