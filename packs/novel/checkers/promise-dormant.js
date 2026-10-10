import { DEFAULT_SPANS, HORIZON_SPANS, dormantPromises } from '../../../core/promise.js';

/**
 * 잠든 약속(novel.promise-dormant). 갚지 않은 약속(떡밥)이 읽는 순서로 오래 움직이지 않았으면 알린다.
 * vibelore src/tools/memory-index.js(STALE_AFTER, hookDebt)·src/core/prompt-sections.js(DORMANT_AFTER) 의 뜻을 옮김.
 * - 거리는 회차 뺄셈 대신 읽는 순서의 본문 잎 수다(core/promise.js leafDistance). 이 원고의 사건까지 넣어 센다.
 * - 기한(data.horizon)별 거리, 없으면 핵심 약속(data.core) 8·그 밖 10. 미뤄 둔(parked) 약속은 10 에서 PROMISE_PARKED_LONG.
 * - 언급(promise.mentioned)은 움직임이 아니다. 해소·닫힌 약속은 알리지 않는다.
 * - 실험 검사라 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다.
 */
export const PROMISE_DORMANT_DEFAULTS = Object.freeze({ spans: HORIZON_SPANS, defaults: DEFAULT_SPANS });

/** 설정값이 올바른지 확인. 잘못되면 CONFIG_INVALID 지적 하나 반환. */
function validateConfig(config) {
  if (!config) return null;
  const bad = [];
  const allowed = new Set(['spans', 'defaults']);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) bad.push(key);
  }
  if (typeof config.spans !== 'undefined') {
    if (!isPlainObject(config.spans)) {
      bad.push('spans');
    } else {
      for (const [k, v] of Object.entries(config.spans)) {
        if (!Number.isInteger(v) || v <= 0) bad.push(`spans.${k}`);
      }
    }
  }
  if (typeof config.defaults !== 'undefined') {
    if (!isPlainObject(config.defaults)) {
      bad.push('defaults');
    } else {
      const defaultsAllowed = new Set(['core', 'other', 'parked']);
      for (const [k, v] of Object.entries(config.defaults)) {
        if (!defaultsAllowed.has(k)) bad.push(`defaults.${k}`);
        else if (!Number.isInteger(v) || v <= 0) bad.push(`defaults.${k}`);
      }
    }
  }
  if (bad.length === 0) return null;
  return [{
    code: 'PROMISE_DORMANT_CONFIG_INVALID',
    message: `설정이 잘못됐다: ${bad.join(', ')}`,
  }];
}

/** 프로토타입 없는 순수 객체인지. */
function isPlainObject(obj) {
  return obj !== null && typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype;
}

/**
 * @param {{ nodeId?: string, priorEvents?: any[], draftEvents?: any[], work?: any }} ctx
 * @param {{ spans?: Record<string, number>, defaults?: Partial<{ core: number, other: number, parked: number }> }} [config]
 */
export function promiseDormant(ctx, config = PROMISE_DORMANT_DEFAULTS) {
  const error = validateConfig(config);
  if (error) return error;
  const work = ctx.work;
  if (!ctx.nodeId || !work?.tree?.nodes || !work.positions || !work.entities) return [];
  const spans = { ...HORIZON_SPANS, ...(config?.spans ?? {}) };
  const defaults = { ...DEFAULT_SPANS, ...(config?.defaults ?? {}) };
  const events = [...(ctx.priorEvents ?? []), ...(ctx.draftEvents ?? []).map((e) => ({ ...e, nodeId: e.nodeId ?? ctx.nodeId }))];
  return dormantPromises({ work, events, atNodeId: ctx.nodeId, spans, defaults }).map((item) => {
    const entity = work.entities.get(item.entityId);
    const label = entity?.name ? `${entity.name}(${item.entityId})` : item.entityId;
    const parked = item.code === 'PROMISE_PARKED_LONG';
    const message = parked
      ? `${label}: 미뤄 둔 약속이 읽는 순서로 ${item.distance}칸째 움직이지 않는다(기준 ${item.span}칸, 마지막 ${item.lastMovedAt}). 다시 꺼내거나 닫는다`
      : `${label}: 갚지 않은 약속이 읽는 순서로 ${item.distance}칸째 움직이지 않는다(기준 ${item.span}칸, 마지막 ${item.lastMovedAt}). 진행·해소·미룸 중 하나를 정한다`;
    return { code: item.code, entityId: item.entityId, message };
  });
}
