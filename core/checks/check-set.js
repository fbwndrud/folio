import { BUILTIN_CHECKS } from './builtin.js';
import { userCheck, USER_SEVERITIES } from './user-checks.js';
import { resolveUserCheckSets } from './user-check-sets.js';
import { readKnownCheckSpec } from './known-check-spec.js';
import { bindCheckConfig } from '../pack/check-config.js';

/** 고른 세트 id: work.yaml checkSets, 키가 없으면(null) 팩 기본 세트. */
export const chosenSetIds = (registry, config) => config.checkSets ?? registry.defaultCheckSets ?? [];

/** 아직 알려지지 않은(새 사용자) 검사 id 는 core. 이나 실린 팩 이름. 으로 시작할 수 없다. 이미 알려진 id 는 덮어쓰기라 여기 걸리지 않는다. */
const reservedCheckId = (id, registry) => id.startsWith('core.') || (registry.packs ?? []).some((pack) => id.startsWith(`${pack.name}.`));

/** 팩 세트 + 사용자 세트(사용자 세트는 id 규칙을 통과한 것만). */
export function allCheckSets(registry, config) {
  const user = resolveUserCheckSets({ registry, config });
  return { sets: { ...registry.checkSets, ...user.sets }, errors: user.errors };
}

/**
 * 이미 있는(팩·코어) 검사에 work.yaml checks 한 줄을 적용한다.
 * 잠금 검사는 무엇을 적어도 거부하고, 모양(필드·mode·config)이 틀리면 거부한다(조용히 무시하지 않는다 — C0).
 * config 는 hard 가 아닌, 설정을 받는 팩 검사만 받는다. hard 검사는 설정으로도 약해지지 않는다(HARD_CHECK_CONFIG_LOCKED).
 */
function applyToKnown({ id, spec: raw, existing, selected, includeAllHard, errors, features }) {
  if (existing.locked) { errors.push({ code: 'LOCKED_CHECK_OVERRIDE', checkId: id }); return; }
  if (existing.severity === 'hard' && raw?.config !== undefined) { errors.push({ code: 'HARD_CHECK_CONFIG_LOCKED', checkId: id }); return; }
  const read = readKnownCheckSpec({ id, spec: raw, existing, features });
  if (!read.spec) { errors.push(...read.errors); return; }
  const spec = read.spec;
  if (existing.severity === 'hard') {
    // hard 검사가 도는 동안 그 지적은 hard 다 — 등급을 조용히 낮출 수 없다. 끄려면 mode: off 로 분명히 끈다.
    if (spec.severity !== undefined) { errors.push({ code: 'HARD_CHECK_SEVERITY_LOCKED', checkId: id }); return; }
    if (spec.mode === 'off') {
      // includeAllHardChecks 를 켠 작품은 hard 검사를 어떤 길로도 끌 수 없다.
      if (includeAllHard) errors.push({ code: 'HARD_CHECK_OVERRIDE', checkId: id });
      else selected.delete(id);
      return;
    }
    selected.set(id, existing);
    return;
  }
  if (spec.mode === 'off') { selected.delete(id); return; }
  if (spec.severity !== undefined && !USER_SEVERITIES.includes(spec.severity)) {
    errors.push({ code: 'USER_CHECK_SEVERITY_INVALID', checkId: id, severity: spec.severity });
    return;
  }
  const configured = spec.config !== undefined ? bindCheckConfig(existing, spec.config) : existing;
  selected.set(id, spec.severity ? { ...configured, severityOverride: spec.severity } : configured);
}

/**
 * 코어 내장 검사 + (옵션) 알려진 모든 hard 검사 + 고른 검사 세트 + work.yaml checks 를 합친다.
 * 코어 잠금 검사는 무엇을 고르든 항상 들어가고 끌 수 없다.
 * work.yaml checks 의 사용자 검사:
 * - userCheckSets 의 어느 세트에 들어 있으면, 그 세트 중 하나를 checkSets 로 골랐을 때만 돈다.
 * - 어느 사용자 세트에도 없으면 `mode: off` 가 아닌 한 돈다.
 */
export function resolveChecks({ registry, config }) {
  // 받은 레지스트리에 같은 id 가 둘이면 덮지 않고 알린다(resolvePacks 를 거친 레지스트리에서는 생기지 않는다).
  const known = new Map();
  const duplicates = [];
  for (const check of registry.checks) {
    if (known.has(check.id)) duplicates.push({ code: 'CHECK_ID_DUPLICATE', checkId: check.id });
    else known.set(check.id, check);
  }
  for (const check of BUILTIN_CHECKS) known.set(check.id, check);
  const { sets, errors } = allCheckSets(registry, config);
  errors.push(...duplicates);
  const includeAllHard = config.options?.includeAllHardChecks === true;
  const selected = new Map(BUILTIN_CHECKS.map((check) => [check.id, check]));
  if (includeAllHard) for (const check of known.values()) if (check.severity === 'hard') selected.set(check.id, check);
  const userIds = new Set(Object.keys(config.checks ?? {}).filter((id) => !known.has(id)));
  const inUserSet = new Set(Object.values(sets).filter((set) => set.origin === 'user').flatMap((set) => set.checks));
  const chosenMembers = new Set();
  for (const setName of chosenSetIds(registry, config)) {
    // Object.hasOwn: setName 이 'constructor'·'__proto__' 같은 프로토타입 속성이면 sets[setName] 이 그걸 집어 크래시로 이어진다.
    const set = Object.hasOwn(sets, setName) ? sets[setName] : undefined;
    if (!set) { errors.push({ code: 'CHECK_SET_UNKNOWN', set: setName }); continue; }
    for (const id of set.checks) {
      chosenMembers.add(id);
      const check = known.get(id);
      if (check) selected.set(id, check);
      else if (!userIds.has(id)) errors.push({ code: 'CHECK_UNKNOWN', checkId: id, set: setName });
    }
  }
  for (const [id, spec] of Object.entries(config.checks ?? {})) {
    const existing = known.get(id);
    if (existing) { applyToKnown({ id, spec, existing, selected, includeAllHard, errors, features: config.features }); continue; }
    if (reservedCheckId(id, registry)) { errors.push({ code: 'USER_CHECK_ID_RESERVED', checkId: id }); continue; }
    if (spec?.mode === 'off') continue;
    // 사용자 세트에 든 사용자 검사는 그 세트 중 하나를 골랐을 때만 돈다.
    if (inUserSet.has(id) && !chosenMembers.has(id)) continue;
    const made = userCheck(id, spec);
    if (made.error) errors.push(made.error);
    else selected.set(id, made.check);
  }
  // 방어적 이중 잠금: 위 단계들이 어떻게 꼬여도 코어 내장 잠금 검사는 항상 진짜 객체로 남는다.
  for (const check of BUILTIN_CHECKS) selected.set(check.id, check);
  return { checks: [...selected.values()], errors };
}
