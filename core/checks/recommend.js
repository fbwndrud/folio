import { FolioError } from '../errors.js';
import { BUILTIN_CHECKS } from './builtin.js';
import { allCheckSets, chosenSetIds } from './check-set.js';

/**
 * 검사 세트 설명과 추천. 순수 함수이며 설정을 바꾸지 않는다 — 무엇을 켤지는 사용자가 고른다.
 * 세트 메타데이터: { title, description, recommendedFor?: { kinds?, levels?, roles?, positions? } }.
 */
const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);

function recommendedFor(set) {
  const raw = set?.recommendedFor ?? {};
  return { kinds: list(raw.kinds), levels: list(raw.levels), roles: list(raw.roles), positions: list(raw.positions) };
}

/**
 * 세트마다: 골랐는지, 기본인지, 이 작품에서 알 수 없는 멤버(missing — 작품 packs 에 없는 팩의 검사 등).
 * 알려진 검사 = 실린 팩의 검사 + 코어 검사 + work.yaml checks 의 사용자 검사. resolveChecks 가 CHECK_UNKNOWN 으로 거부할 멤버와 같다.
 */
function entries(registry, config) {
  const { sets } = allCheckSets(registry, config);
  const chosen = new Set(chosenSetIds(registry, config));
  const defaults = new Set(registry.defaultCheckSets ?? []);
  const known = new Set([...(registry.checks ?? []).map((c) => c.id), ...BUILTIN_CHECKS.map((c) => c.id), ...Object.keys(config.checks ?? {})]);
  return Object.entries(sets).map(([id, set]) => ({
    id, set, selected: chosen.has(id), isDefault: defaults.has(id), missing: (set.checks ?? []).filter((checkId) => !known.has(checkId)),
  }));
}

/** 모든 세트(팩 + 사용자)와 그 검사, 골랐는지, 기본 세트인지, 이 작품에서 알 수 없는 검사(missingChecks — 고르면 CONFIG_INVALID). */
export function describeCheckSets(registry, config) {
  return entries(registry, config).map(({ id, set, selected, isDefault, missing }) => ({
    id, origin: set.origin === 'user' ? 'user' : 'pack', title: set.title ?? id, description: set.description ?? '',
    checks: [...(set.checks ?? [])], selected, default: isDefault, recommendedFor: recommendedFor(set), missingChecks: missing,
  }));
}

/**
 * 작품 단위 추천: 기본 세트, 작품 종류, 작품에 있는 레벨. 이유가 하나라도 있는 세트만 돌려준다.
 * 이 작품에서 알 수 없는 검사가 든 세트는 추천하지 않는다 — 고르면 CONFIG_INVALID(CHECK_UNKNOWN)가 된다(N5 인계 H4).
 */
export function recommendCheckSets({ registry, config, workKind = null }) {
  const levelNames = config.levels.map((level) => level.name);
  const out = [];
  for (const { id, set, selected, isDefault, missing } of entries(registry, config)) {
    if (missing.length) continue;
    const rf = recommendedFor(set);
    const reasons = [];
    if (isDefault) reasons.push({ kind: 'default' });
    if (workKind && rf.kinds.includes(workKind)) reasons.push({ kind: 'workKind', value: workKind });
    for (const level of levelNames) if (rf.levels.includes(level)) reasons.push({ kind: 'level', value: level });
    if (reasons.length) out.push({ setId: id, title: set.title ?? id, description: set.description ?? '', selected, reasons });
  }
  return out;
}

/**
 * 노드 단위 추천: 레벨 / 역할(front·body·back) / 위치(leaf·branch). 세트가 적은 조건이 모두 맞아야 하고,
 * 노드 조건(levels·roles·positions)을 하나도 적지 않은 세트는 노드 추천에 나오지 않는다. 알 수 없는 검사가 든 세트도 나오지 않는다.
 */
export function recommendForNode({ registry, config, work, nodeId }) {
  const node = work.tree.nodes.get(nodeId);
  if (!node) throw new FolioError('NODE_NOT_FOUND', nodeId);
  const facts = [['levels', 'level', node.level], ['roles', 'role', node.role], ['positions', 'position', node.kind]];
  const sets = [];
  for (const { id, set, selected, missing } of entries(registry, config)) {
    if (missing.length) continue;
    const rf = recommendedFor(set);
    const asked = facts.filter(([field]) => rf[field].length > 0);
    if (!asked.length || !asked.every(([field, , value]) => rf[field].includes(value))) continue;
    sets.push({ setId: id, title: set.title ?? id, selected, reasons: asked.map(([, kind, value]) => ({ kind, value })) });
  }
  return { nodeId, level: node.level, role: node.role, position: node.kind, sets };
}
