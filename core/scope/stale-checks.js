import { canonicalJson } from '../util/hash.js';
import { variantOf } from '../variants/model.js';

/**
 * 커밋 뒤에 켜거나 바꾼 검사(되채우기 대상)를 찾는다. 표시만 하고 고치지 않는다.
 * 영수증의 appliedChecks 가 기준이고, 같은 커밋 원고에 대한 더 뒤의 재검사(recheck) 기록이 있으면 그것이 기준을 새로 한다.
 */

/** 이 커밋 뒤, 같은 판본·같은 원고(committedHash)에 대한 가장 최근 재검사 기록. 다른 판본의 재검사는 이 커밋을 풀지 않는다(N6). */
export function latestRecheck(records, commit) {
  let latest = null;
  for (const record of records) {
    if (record.type !== 'recheck' || record.nodeId !== commit.nodeId || variantOf(record) !== variantOf(commit)) continue;
    if (record.committedHash !== commit.committedHash || record.seq <= commit.seq) continue;
    latest = record;
  }
  return latest;
}

/**
 * 지금 켜진 검사 중 적용 기록에 없거나 digest 가 다른 것. 영수증에 appliedChecks 가 없으면(옛 영수증) 판단하지 않는다.
 * @param {{ applied: { checkId: string, digest: string }[], had: { checkId: string, digest: string }[]|undefined }} input
 */
export function checkReasons({ applied, had }) {
  if (!Array.isArray(had) || !Array.isArray(applied)) return [];
  const before = new Map(had.map((a) => [a.checkId, a.digest]));
  return applied.filter((a) => before.get(a.checkId) !== a.digest)
    .map((a) => ({ kind: 'check', id: a.checkId, was: before.get(a.checkId) ?? null, now: a.digest }));
}

/** 노드의 지금 순서: 레벨의 순서 방식과, 앞뒤 판정에 드는지(ordered). */
export function nodeOrder(work, nodeId) {
  const position = work.positions.get(nodeId);
  return { mode: position?.orderMode ?? null, ordered: Boolean(position?.ordered),
    ...(position?.unorderedBy === 'branching' ? { unorderedBy: 'branching' } : {}) };
}

/**
 * 커밋(또는 재검사) 때와 앞뒤 판정 여부(ordered)가 달라졌으면 이유를 돌려준다. 검사의 해당 여부를 바꾸는 것은 ordered 뿐이라
 * 순서 방식만 바뀌고 판정 밖인 노드(앞뒤 부록, 게임북)는 표시하지 않는다. 옛 영수증(order 없음)은 판단하지 않는다.
 */
export function orderReason({ work, nodeId, had }) {
  if (!had || typeof had !== 'object') return null;
  const now = nodeOrder(work, nodeId);
  return !orderChanged(had, now) ? null : { kind: 'order', id: nodeId, was: had, now };
}

/**
 * 커밋(또는 재검사) 때와 occurrenceScope 가 달라졌으면 이유를 돌려준다. 옛 기록(features 없음)은 끈 것으로 본다.
 * 재검사로 풀린다(범위를 새로 모아 다시 검사하므로).
 */
export function featureReason({ work, had, nodeId = null }) {
  const was = Boolean(had?.occurrenceScope);
  const now = Boolean(work.config.features.occurrenceScope);
  if (was !== now) return { kind: 'feature', id: 'occurrenceScope', was, now };
  if (work.positions.get(nodeId)?.unorderedBy !== 'branching' && had?.branching === undefined) return null;
  const prior = Boolean(had?.branching), current = Boolean(work.config.features.branching);
  return prior === current ? null : { kind: 'feature', id: 'branching', was: prior, now: current };
}

/**
 * 가지 영수증의 자식 목록(structure)이 지금과 다르면 이유를 돌려준다(추가·이동·묶기).
 * 재검사로는 풀리지 않는다 — 돌아보기는 자식이 모두 끝난 뒤 가지를 다시 돌려야 한다. 옛 영수증(structure 없음)은 판단하지 않는다.
 */
export function structureReason({ work, nodeId, had }) {
  if (!had || !Array.isArray(had.children)) return null;
  const node = work.tree.nodes.get(nodeId);
  const now = node?.kind === 'branch' ? [...node.children] : [];
  return canonicalJson(had.children) === canonicalJson(now) ? null : { kind: 'structure', id: nodeId, was: had.children, now };
}

/** branching의 유효 방식은 상속한 경우에도 비교한다. 이전 linear/none의 의미는 그대로다. */
export function orderChanged(had, now) {
  if (had.ordered !== now.ordered) return true;
  const mode = (value) => value.unorderedBy ?? (value.mode === 'branching' ? 'branching' : null);
  return (mode(had) === 'branching' || mode(now) === 'branching') && mode(had) !== mode(now);
}
export function receiptFeatures(work, nodeId, isMain = true) {
  return { occurrenceScope: Boolean(work.config.features.occurrenceScope),
    ...(isMain && work.positions.get(nodeId)?.unorderedBy === 'branching' ? { branching: Boolean(work.config.features.branching) } : {}) };
}
