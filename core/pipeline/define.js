import { canonicalJson, sha256 } from '../util/hash.js';
import { BUILTIN_CHECKS } from '../checks/builtin.js';
import { isPlainObject } from '../util/plain.js';

export const STEP_KINDS = ['generate', 'check', 'gate', 'commit'];
export const STEP_MODES = ['on', 'off', 'auto'];
export const CHECK_TIERS = ['deterministic', 'model'];
export const MAX_LOOP = 3;
const SOURCE = 'work.yaml#overrides';
const PATCHABLE = ['mode', 'reason', 'max', 'after', 'prompt'];
const CUSTOM_KINDS = ['check', 'gate'];
const CUSTOM_FIELDS = ['kind', 'tier', 'after', 'prompt', 'mode'];
const STEP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
/** 잠긴 코어 검사가 도는 stage. 이 stage 를 가진 check 단계는 코어가 잠근다(팩 표시와 무관). */
export const LOCKED_STAGES = Object.freeze([...new Set(BUILTIN_CHECKS.filter((c) => c.locked).map((c) => String(c.stage)))]);
/** work.yaml 로 새로 만들 수 없는 단계 id: 잠긴 stage 이름과 레벨별 덮어쓰기 자리(levels). */
export const RESERVED_STEP_IDS = Object.freeze([...LOCKED_STAGES, 'levels']);
/** 단계의 stage. 적지 않았으면 id. */
export const stageOfStep = (step) => step?.stage ?? step?.id;

/** 코어 잠금의 씨앗: commit 단계, 잠긴 코어 검사가 도는 check 단계. */
export const isCoreLockSeed = (step) => step?.kind === 'commit' || (step?.kind === 'check' && LOCKED_STAGES.includes(stageOfStep(step)));

/** startIds 에서 requires 를 거슬러 닿는 단계 id. 시작 단계 자신은 (다시 요구되지 않는 한) 빼고. byId: id → 단계. */
export function requiredClosure(byId, startIds) {
  const out = new Set();
  const queue = startIds.flatMap((id) => byId.get(id)?.requires ?? []);
  while (queue.length) {
    const next = queue.pop();
    if (out.has(next)) continue;
    out.add(next);
    queue.push(...(byId.get(next)?.requires ?? []));
  }
  return out;
}

/** 씨앗 + 씨앗이 (거슬러) requires 하는 단계. 팩의 locked 표시는 보지 않는다. */
export function coreLockedIds(steps) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const seeds = steps.filter(isCoreLockSeed).map((s) => s.id);
  return new Set([...seeds, ...requiredClosure(byId, seeds)]);
}

/** 새 단계 id가 안전한 식별자인지 본다: 소문자 규칙 + Object.prototype 이름이 아닐 것. */
function isValidCustomId(id) {
  return typeof id === 'string' && STEP_ID_PATTERN.test(id) && !(id in Object.prototype);
}

/** patch 가 배열이 아닌 순수 객체이고, prompt/reason 이 있다면 문자열인지 본다. */
function validPatchShape(patch, id, errors) {
  if (!isPlainObject(patch)) {
    errors.push({ code: 'STEP_PATCH_INVALID', stepId: id });
    return false;
  }
  if (patch.prompt !== undefined && typeof patch.prompt !== 'string') {
    errors.push({ code: 'STEP_PATCH_INVALID', stepId: id, field: 'prompt' });
    return false;
  }
  if (patch.reason !== undefined && typeof patch.reason !== 'string') {
    errors.push({ code: 'STEP_PATCH_INVALID', stepId: id, field: 'reason' });
    return false;
  }
  return true;
}

/** 잠금은 코어가 계산한다. 팩이 적은 locked 는 덮어쓴다(검증은 core/pack/validate.js). */
function markLocked(steps) {
  const locked = coreLockedIds(steps);
  for (const step of steps) step.locked = locked.has(step.id);
}

function moveAfter(steps, step, targetId, errors) {
  const target = steps.find((s) => s.id === targetId);
  if (!target) { errors.push({ code: 'STEP_AFTER_UNKNOWN', stepId: step.id, after: targetId }); return; }
  steps.splice(steps.indexOf(step), 1);
  steps.splice(steps.indexOf(target) + 1, 0, step);
}

function addCustom(steps, id, patch, errors) {
  if (RESERVED_STEP_IDS.includes(id)) { errors.push({ code: 'STEP_ID_RESERVED', stepId: id }); return; }
  if (!isValidCustomId(id)) { errors.push({ code: 'STEP_ID_INVALID', stepId: id }); return; }
  if (!validPatchShape(patch, id, errors)) return;
  for (const field of Object.keys(patch)) {
    if (!CUSTOM_FIELDS.includes(field)) errors.push({ code: 'STEP_FIELD_IMMUTABLE', stepId: id, field });
  }
  if (!CUSTOM_KINDS.includes(patch.kind)) { errors.push({ code: 'STEP_KIND_INVALID', stepId: id }); return; }
  if (patch.kind === 'check' && !CHECK_TIERS.includes(patch.tier)) { errors.push({ code: 'STEP_TIER_INVALID', stepId: id }); return; }
  if (patch.mode !== undefined && (!STEP_MODES.includes(patch.mode) || (patch.mode === 'auto' && patch.kind !== 'gate'))) {
    errors.push({ code: 'STEP_MODE_INVALID', stepId: id, mode: patch.mode });
    return;
  }
  const at = steps.findIndex((s) => s.id === patch.after);
  steps.splice(at + 1, 0, {
    id, kind: patch.kind, tier: patch.tier, stage: id, prompt: patch.prompt ?? null, mode: patch.mode ?? 'on',
    requires: [], locked: false, custom: true, source: `${SOURCE}.${id}`,
  });
}

function applyPatch(steps, step, patch, errors) {
  const id = step.id;
  if (step.locked) {
    const fields = isPlainObject(patch) ? Object.keys(patch) : [];
    errors.push({ code: 'LOCKED_STEP_OVERRIDE', stepId: id, fields });
    return;
  }
  if (!validPatchShape(patch, id, errors)) return;
  for (const field of Object.keys(patch)) {
    if (!PATCHABLE.includes(field)) errors.push({ code: 'STEP_FIELD_IMMUTABLE', stepId: id, field });
  }
  step.source = `${SOURCE}.${id}`;
  if (patch.mode !== undefined) {
    if (!STEP_MODES.includes(patch.mode) || (patch.mode === 'auto' && step.kind !== 'gate')) {
      errors.push({ code: 'STEP_MODE_INVALID', stepId: id, mode: patch.mode });
    } else {
      step.mode = patch.mode;
      step.reason = typeof patch.reason === 'string' ? patch.reason : '';
    }
  }
  if (patch.max !== undefined) {
    if (!step.loop) errors.push({ code: 'STEP_FIELD_IMMUTABLE', stepId: id, field: 'max' });
    else if (!Number.isInteger(patch.max) || patch.max < 0 || patch.max > MAX_LOOP) errors.push({ code: 'LOOP_MAX_EXCEEDED', stepId: id, max: patch.max });
    else step.loop = { ...step.loop, max: patch.max };
  }
  if (patch.prompt !== undefined) step.prompt = patch.prompt;
  if (patch.after !== undefined) moveAfter(steps, step, patch.after, errors);
}

function checkInvariants(steps, lockedOrder, errors) {
  const ids = new Set();
  for (const step of steps) {
    if (ids.has(step.id)) errors.push({ code: 'STEP_ID_DUPLICATE', stepId: step.id });
    ids.add(step.id);
    if (!STEP_KINDS.includes(step.kind)) errors.push({ code: 'STEP_KIND_INVALID', stepId: step.id });
  }
  if (steps.filter((s) => s.kind === 'commit').length !== 1 || steps.at(-1)?.kind !== 'commit') errors.push({ code: 'COMMIT_MUST_BE_LAST' });
  const index = new Map(steps.map((s, i) => [s.id, i]));
  for (const step of steps) {
    for (const dep of step.requires) if (!(index.get(dep) < index.get(step.id))) errors.push({ code: 'REQUIRES_ORDER', stepId: step.id, requires: dep });
  }
  if (steps.filter((s) => s.locked).map((s) => s.id).join() !== lockedOrder.join()) errors.push({ code: 'LOCKED_ORDER_CHANGED' });
}

/**
 * 파이프라인의 정본 다이제스트. commitNode 가 받은 pipeline.steps 로 다시 계산해 조작을 막는다.
 * packDigest(팩 내용)가 있으면 함께 묶는다 — 팩 파일(프롬프트·검사 글·검사기)이 바뀌면 다른 파이프라인이다.
 */
export function pipelineDigest(steps, packDigest = null) {
  const projected = steps.map(({ id, kind, tier, stage, produces, mode, locked, loop, requires, prompt }) => ({ id, kind, tier, stage, produces, mode, locked, loop, requires, prompt }));
  return sha256(canonicalJson(packDigest ? { packs: packDigest, steps: projected } : projected));
}

/** 팩 기본 단계 + work.yaml overrides. 잠금 단계는 어떤 필드도 바꿀 수 없다. */
export function resolvePipeline(base, overrides = {}, { packDigest = null } = {}) {
  const errors = [];
  const steps = base.map((step) => ({ mode: 'on', ...structuredClone(step), requires: [...(step.requires ?? [])] }));
  markLocked(steps);
  const lockedOrder = steps.filter((s) => s.locked).map((s) => s.id);
  const matched = new Set();
  for (const [id, patch] of Object.entries(overrides)) {
    const step = steps.find((s) => s.id === id);
    if (step) { matched.add(id); applyPatch(steps, step, patch, errors); continue; }
    if (patch?.kind && patch?.after && steps.some((s) => s.id === patch.after)) { matched.add(id); addCustom(steps, id, patch, errors); }
  }
  checkInvariants(steps, lockedOrder, errors);
  const digest = pipelineDigest(steps, packDigest);
  return { steps, errors, matched, digest, packDigest };
}
