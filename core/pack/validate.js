import { LOCKED_STAGES, coreLockedIds, requiredClosure, stageOfStep } from '../pipeline/define.js';

export const NODE_KINDS = ['leaf', 'branch'];

/** 맨 아래 칸: 잠긴 코어 stage 를 결정론 check 단계가 맡고, 그 단계는 사건 추출을, 추출은 원고를 (거슬러) 요구해야 한다. */
function leafErrors(steps) {
  const errors = [];
  const byId = new Map(steps.map((s) => [s.id, s]));
  const producer = (ids, produces) => [...ids].map((id) => byId.get(id)).find((s) => s?.kind === 'generate' && s.produces === produces);
  for (const stage of LOCKED_STAGES) {
    const host = steps.find((s) => s.kind === 'check' && stageOfStep(s) === stage);
    if (!host) { errors.push({ code: 'PACK_LOCKED_STAGE_MISSING', kind: 'leaf', stage }); continue; }
    if (host.tier !== 'deterministic') { errors.push({ code: 'PACK_LOCKED_STAGE_TIER', kind: 'leaf', stage, stepId: host.id }); continue; }
    const events = producer(requiredClosure(byId, [host.id]), 'events');
    if (!events) { errors.push({ code: 'PACK_FACTS_REQUIRES_EVENTS', kind: 'leaf', stepId: host.id }); continue; }
    if (!producer(requiredClosure(byId, [events.id]), 'draft')) errors.push({ code: 'PACK_EVENTS_REQUIRES_DRAFT', kind: 'leaf', stepId: events.id });
  }
  return errors;
}

/**
 * 팩 단계 정의가 코어 잠금 규칙과 맞는지 본다. 잠금은 코어가 정한다(commit, 잠긴 코어 검사가 도는 단계, 그 둘이 요구하는 단계).
 * 팩의 locked 표시는 믿지 않는다 — 적었다면 코어 계산과 같아야 하고, 다르면 PACK_LOCK_MISMATCH.
 * pipelines 가 없는 팩(검사만 주는 팩)은 여기서 통과한다. 첫 팩인지는 resolvePacks 가 본다.
 */
export function pipelineErrors(pack) {
  if (pack.pipelines === undefined) return [];
  const errors = [];
  for (const kind of NODE_KINDS) {
    const steps = pack.pipelines?.[kind];
    if (!Array.isArray(steps) || steps.length === 0 || !steps.every((s) => s && typeof s === 'object' && typeof s.id === 'string')) {
      errors.push({ code: 'PACK_PIPELINE_MISSING', kind });
      continue;
    }
    const locked = coreLockedIds(steps);
    for (const step of steps) {
      if (step.id === 'levels') errors.push({ code: 'PACK_STEP_ID_RESERVED', kind, stepId: step.id });
      if (step.locked !== undefined && step.locked !== locked.has(step.id)) {
        errors.push({ code: 'PACK_LOCK_MISMATCH', kind, stepId: step.id, declared: step.locked, core: locked.has(step.id) });
      }
      // 잠긴 단계를 기본값으로 꺼 두면 잠긴 코어 검사가 빠진다. 적었다면 'on' 이어야 한다.
      if (locked.has(step.id) && step.mode !== undefined && step.mode !== 'on') {
        errors.push({ code: 'PACK_LOCKED_STEP_MODE', kind, stepId: step.id, mode: step.mode });
      }
    }
    if (kind === 'leaf') errors.push(...leafErrors(steps));
  }
  return errors;
}

const PACK_NAME = /^[a-z][a-z0-9-]*$/;
const hasPrefix = (id, prefix) => typeof id === 'string' && id.startsWith(prefix) && id.length > prefix.length;

/** 팩 이름, 검사 id·세트 id 접두어(<팩이름>.), 팩 안 중복, 기본 세트 존재. core. 은 코어 몫이다. */
function idErrors(pack) {
  const errors = [];
  if (typeof pack.name !== 'string' || !PACK_NAME.test(pack.name)) return [{ code: 'PACK_NAME_INVALID', name: pack.name }];
  if (pack.name === 'core') errors.push({ code: 'PACK_NAME_RESERVED', name: pack.name });
  const prefix = `${pack.name}.`;
  const seen = new Set();
  for (const check of pack.checks ?? []) {
    const id = check?.id;
    if (typeof id === 'string' && id.startsWith('core.')) { errors.push({ code: 'PACK_CHECK_ID_RESERVED', checkId: id }); continue; }
    if (!hasPrefix(id, prefix)) errors.push({ code: 'PACK_CHECK_ID_PREFIX', checkId: id, prefix });
    if (seen.has(id)) errors.push({ code: 'PACK_CHECK_ID_DUPLICATE', checkId: id });
    seen.add(id);
  }
  const sets = pack.checkSets ?? {};
  for (const setId of Object.keys(sets)) if (!hasPrefix(setId, prefix)) errors.push({ code: 'PACK_CHECK_SET_ID_PREFIX', set: setId, prefix });
  for (const setId of pack.defaultCheckSets ?? []) if (!Object.hasOwn(sets, setId)) errors.push({ code: 'PACK_DEFAULT_SET_UNKNOWN', set: setId });
  return errors;
}

/** 팩 하나를 코어 규칙으로 검증한다. 빈 배열이면 유효. 이름이 틀리면 그것만 알린다(접두어를 셀 수 없다). */
export function validatePack(pack) {
  const ids = idErrors(pack);
  if (ids.some((e) => e.code === 'PACK_NAME_INVALID')) return ids;
  const orders = (pack.checks ?? []).filter((c) => c.requiresOrder !== undefined && !['linear', 'none', 'branching'].includes(c.requiresOrder))
    .map((c) => ({ code: 'PACK_REQUIRES_ORDER_INVALID', checkId: c.id }));
  return [...ids, ...pipelineErrors(pack), ...orders];
}

/**
 * 코어 팩 규칙 오류가 가리키는 pack.yaml 자리(M3 C3: 전에는 모두 'pipelines'였다).
 * 검사 → checks.<id>, 세트 → checkSets.<id>, 기본 세트 → defaultCheckSets, 단계 → pipelines.<kind>.<stepId>, 이름 → name.
 * @param {{ code: string, [key: string]: unknown }} error
 */
export function packErrorPath(error) {
  if (error.code === 'PACK_DEFAULT_SET_UNKNOWN') return 'defaultCheckSets';
  if (typeof error.checkId === 'string') return `checks.${error.checkId}`;
  if (typeof error.set === 'string') return `checkSets.${error.set}`;
  if (error.code === 'PACK_NAME_INVALID' || error.code === 'PACK_NAME_RESERVED') return 'name';
  if (typeof error.kind === 'string') return typeof error.stepId === 'string' ? `pipelines.${error.kind}.${error.stepId}` : `pipelines.${error.kind}`;
  return 'pipelines';
}
