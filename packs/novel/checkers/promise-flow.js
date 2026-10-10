import { PROMISE_KIND, PROMISE_MENTION, promiseStageOf, stepPromise } from '../../../core/promise.js';

/**
 * 약속 흐름(novel.promise-flow). 이 원고가 닫힌 약속을 다시 쓰거나, 심지 않은 약속을 언급하면 알린다.
 * vibelore engine/src/continuity/ledger.js(LEDGER_CLOSED_HOOK_EVENT·약속의 LEDGER_UNKNOWN_ID) 의 뜻을 옮김.
 * - 앞 사건과 이 원고의 사건을 읽는 순서로 접되, 지적은 이 원고의 사건에만 한다.
 * - 닫힌(closed) 약속은 reopened 로만 다시 열린다. 닫힌 뒤의 다른 사건은 약속을 움직이지 않는다(vibelore 와 같다).
 *   단계 읽기는 코어 stepPromise 하나다 — core.promise-order(foldPromise)·잠든 약속과 같은 규칙이다(C0).
 * - 닫힌 뒤 resolved 는 core.promise-order 가 이미 경고하므로 여기서 다시 알리지 않는다.
 * - 심기 전 단계 사건은 core.promise-order 가 막는다. 여기서는 언급(promise.mentioned)만 본다.
 * - 실험 검사라 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ draft?: string, priorEvents?: any[], draftEvents?: any[], work?: { entities: Map<string, any> } }} ctx
 */
export function promiseFlow(ctx) {
  const entities = ctx.work?.entities ?? new Map();
  const draftEvents = (ctx.draftEvents ?? []).filter((e) => isPromiseEvent(e, entities));
  const touched = [...new Set(draftEvents.map((e) => e.entityId))].sort();
  const draft = typeof ctx.draft === 'string' ? ctx.draft.normalize('NFC') : '';
  const findings = [];
  for (const id of touched) {
    let stage = null;
    for (const event of (ctx.priorEvents ?? []).filter((e) => e?.entityId === id && isPromiseEvent(e, entities))) stage = stepPromise(stage, promiseStageOf(event)).stage;
    for (const event of draftEvents.filter((e) => e.entityId === id)) {
      const next = promiseStageOf(event);
      const what = next ?? 'mentioned';
      const quote = typeof event.quote === 'string' && event.quote.trim().length >= 2 && draft.includes(event.quote.normalize('NFC')) ? event.quote : null;
      const label = entities.get(id)?.name ? `${entities.get(id).name}(${id})` : id;
      if (stage === 'closed' && next !== 'reopened' && next !== 'resolved') {
        // vibelore: LEDGER_CLOSED_HOOK_EVENT
        findings.push({ code: 'PROMISE_EVENT_AFTER_CLOSE', entityId: id, ...(quote ? { quote } : {}), message: `${label}: 닫힌 약속에 다시 사건(${what})이 생긴다. 다시 열려면 reopened 를 적는다` });
      } else if (stage === null && event.kind === PROMISE_MENTION) {
        // vibelore: LEDGER_UNKNOWN_ID(심지 않은 약속)
        findings.push({ code: 'PROMISE_MENTIONED_BEFORE_PLANT', entityId: id, ...(quote ? { quote } : {}), message: `${label}: 심지(planted) 않은 약속을 언급한다` });
      }
      stage = stepPromise(stage, next).stage;
    }
  }
  return findings;
}

/** 약속 엔티티의 단계 사건이거나 언급인가. 알려진 엔티티가 약속이 아니면 제외한다. */
function isPromiseEvent(event, entities) {
  if (!event || (promiseStageOf(event) === null && event.kind !== PROMISE_MENTION)) return false;
  const entity = entities.get(event.entityId);
  return !entity || entity.kind === PROMISE_KIND;
}
