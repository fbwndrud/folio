/** 약속(떡밥, "뒤에서 설명", 학습 목표)은 엔티티이고 단계 변화는 사건으로 쌓인다. */
export const PROMISE_KIND = 'promise';
/** 단계. 끝에만 추가한다(reopened: 닫힌 약속을 다시 연다 — vibelore hook reopened). */
export const PROMISE_STAGES = ['planted', 'advanced', 'misdirected', 'resolved', 'closed', 'parked', 'reopened'];
/** 지나가는 언급. 단계가 아니다 — foldPromise(잠금)는 보지 않고, 움직임으로도 세지 않는다(vibelore hook mentioned). */
export const PROMISE_MENTION = 'promise.mentioned';
const PREFIX = 'promise.';
/** 아직 갚지 않은 약속의 단계. 휴면 판정 대상이다. parked 는 따로 센다. */
const ACTIVE_STAGES = ['planted', 'advanced', 'misdirected', 'reopened'];

/** 기한별 휴면 거리(읽는 순서의 본문 잎 수). vibelore memory-index STALE_AFTER 와 같은 값이다. */
export const HORIZON_SPANS = Object.freeze({ next: 2, soon: 5, arc: 10, long: 16, finale: 24 });
/** 기한이 없을 때: 핵심 약속(data.core: true) 8, 그 밖 10. 미뤄 둔(parked) 약속은 10(vibelore DORMANT_AFTER). */
export const DEFAULT_SPANS = Object.freeze({ core: 8, other: 10, parked: 10 });

export function promiseStageOf(event) {
  if (typeof event?.kind !== 'string' || !event.kind.startsWith(PREFIX)) return null;
  const stage = event.kind.slice(PREFIX.length);
  return PROMISE_STAGES.includes(stage) ? stage : null;
}

/**
 * 약속 단계 한 걸음. foldPromise(잠금 core.promise-order), promiseMovement(휴면), novel.promise-flow 가 모두 이것 하나로 읽는다.
 * - 심기 전(null)에는 planted 만 단계를 바꾼다.
 * - 닫힌(closed) 뒤에는 reopened 만 단계를 바꾼다. 다른 단계 사건은 약속을 움직이지 않는다(닫힌 채 남는다).
 * - 그 밖에는 새 단계로 간다. 단계가 아닌 사건(next 가 null, 예: promise.mentioned)은 아무것도 바꾸지 않는다.
 * @param {string|null} stage 지금 단계
 * @param {string|null} next 사건의 단계(promiseStageOf)
 * @returns {{ stage: string|null, moved: boolean }} 사건 뒤 단계, 그 사건이 약속을 움직였는지
 */
export function stepPromise(stage, next) {
  if (next === null) return { stage, moved: false };
  if (stage === null) return next === 'planted' ? { stage: next, moved: true } : { stage, moved: false };
  if (stage === 'closed' && next !== 'reopened') return { stage, moved: false };
  return { stage: next, moved: true };
}

/**
 * 읽는 순서로 정렬된 한 약속의 사건을 접는다(잠금 core.promise-order 가 쓴다).
 * - 심기 전 단계 사건: hard(PROMISE_RESOLVED_BEFORE_PLANT, PROMISE_MOVED_BEFORE_PLANT).
 * - 닫힌 약속의 해소: warning(PROMISE_RESOLVED_AFTER_CLOSE). 닫힌 뒤 다른 사건(advanced 등)은 stepPromise 대로 약속을 다시 열지 않으므로,
 *   closed → advanced → resolved 도 이 경고를 낸다(C0: 예전에는 advanced 가 약속을 다시 열어 경고가 빠졌다). hard 판정은 예전과 같다.
 */
export function foldPromise(eventsInOrder) {
  let stage = null;
  const history = [];
  const problems = [];
  for (const event of eventsInOrder) {
    const next = promiseStageOf(event);
    if (!next) continue;
    const at = { nodeId: event.nodeId, eventId: event.eventId };
    if (stage === null && next !== 'planted') {
      problems.push({ code: next === 'resolved' ? 'PROMISE_RESOLVED_BEFORE_PLANT' : 'PROMISE_MOVED_BEFORE_PLANT', severity: 'hard', ...at });
    } else if (stage === 'closed' && next === 'resolved') {
      problems.push({ code: 'PROMISE_RESOLVED_AFTER_CLOSE', severity: 'warning', ...at });
    }
    stage = stepPromise(stage, next).stage;
    history.push({ stage: next, ...at });
  }
  return { stage, history, problems };
}

/**
 * 한 약속의 지금 단계, 심은 노드, 마지막으로 움직인 노드. 사건은 읽는 순서로 정렬돼 있어야 한다.
 * stepPromise 가 움직였다고 한 사건만 움직임이다: 언급(promise.mentioned)은 움직임이 아니고("지나가는 언급은 움직임이 아니다", vibelore ledger),
 * 심기 전 사건과 닫힌 뒤 reopened 가 아닌 사건도 약속을 움직이지 않는다.
 * @returns {{ stage: string|null, plantedAt: string|null, lastMovedAt: string|null }}
 */
export function promiseMovement(eventsInOrder) {
  let stage = null;
  let plantedAt = null;
  let lastMovedAt = null;
  for (const event of eventsInOrder) {
    const step = stepPromise(stage, promiseStageOf(event));
    if (!step.moved) continue;
    if (stage === null) plantedAt = event.nodeId;
    stage = step.stage;
    lastMovedAt = event.nodeId;
  }
  return { stage, plantedAt, lastMovedAt };
}

/**
 * 읽는 순서에서 from 뒤부터 to 까지(to 포함) 앞뒤 판정되는 본문 잎의 수. 회차 뺄셈(현재 화 - 마지막 화)을 대신한다.
 * 어느 쪽이든 앞뒤 판정이 안 되면(순서 없음·부록) null.
 * @param {{ tree: { nodes: Map<string, any> }, positions: Map<string, { ordinal: number, ordered: boolean }> }} work
 */
export function leafDistance(work, fromId, toId) {
  const from = work.positions.get(fromId);
  const to = work.positions.get(toId);
  if (!from?.ordered || !to?.ordered) return null;
  let count = 0;
  for (const [id, position] of work.positions) {
    if (!position.ordered || position.ordinal <= from.ordinal || position.ordinal > to.ordinal) continue;
    if (work.tree.nodes.get(id)?.kind === 'leaf') count += 1;
  }
  return count;
}

/**
 * 약속 엔티티의 휴면 거리. data.horizon 이 알려진 값이면 그 값, 아니면 핵심 여부로.
 * @param {any} entity
 * @param {Record<string, number>} [spans]
 * @param {{ core: number, other: number, parked: number }} [defaults]
 */
export function spanFor(entity, spans = HORIZON_SPANS, defaults = DEFAULT_SPANS) {
  const horizon = typeof entity?.data?.horizon === 'string' ? entity.data.horizon.trim().toLowerCase() : null;
  if (horizon && Object.hasOwn(spans, horizon)) return spans[horizon];
  return entity?.data?.core === true ? defaults.core : defaults.other;
}

/**
 * atNodeId 시점에 오래 움직이지 않은 약속(순수 함수). 사건은 atNodeId 까지(이 노드의 사건 포함) 읽는 순서로 정렬돼 있어야 한다.
 * - 갚지 않은 약속(planted·advanced·misdirected·reopened): 마지막 움직임에서 거리 ≥ 기한 거리 → PROMISE_DORMANT
 * - 미뤄 둔 약속(parked): 거리 ≥ parked 거리 → PROMISE_PARKED_LONG
 * 해소·닫힌 약속, 심지 않은 약속, 앞뒤 판정이 안 되는 노드는 건너뛴다.
 * @param {{ work: { tree: any, positions: Map<string, any>, entities: Map<string, any> }, events: any[], atNodeId: string,
 *   spans?: Record<string, number>, defaults?: { core: number, other: number, parked: number } }} input
 * @returns {Array<{ entityId: string, code: string, stage: string, lastMovedAt: string, distance: number, span: number }>}
 */
export function dormantPromises({ work, events, atNodeId, spans = HORIZON_SPANS, defaults = DEFAULT_SPANS }) {
  const byEntity = new Map();
  for (const event of events) {
    if (work.entities.get(event.entityId)?.kind !== PROMISE_KIND) continue;
    if (!byEntity.has(event.entityId)) byEntity.set(event.entityId, []);
    byEntity.get(event.entityId).push(event);
  }
  const out = [];
  for (const [entityId, list] of [...byEntity].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const { stage, lastMovedAt } = promiseMovement(list);
    if (!stage || !lastMovedAt) continue;
    const parked = stage === 'parked';
    if (!parked && !ACTIVE_STAGES.includes(stage)) continue;
    const distance = leafDistance(work, lastMovedAt, atNodeId);
    if (distance === null) continue;
    const span = parked ? defaults.parked : spanFor(work.entities.get(entityId), spans, defaults);
    if (distance >= span) out.push({ entityId, code: parked ? 'PROMISE_PARKED_LONG' : 'PROMISE_DORMANT', stage, lastMovedAt, distance, span });
  }
  return out;
}
