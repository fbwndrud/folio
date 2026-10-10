import { PROMISE_KIND } from '../../../core/promise.js';

/**
 * 근거 없는 약속 해소(novel.promise-evidence). 이 원고가 약속(떡밥)을 갚았다고(promise.resolved) 적으면서
 * 원고에서 그 장면을 인용하지 않으면 지적한다.
 * vibelore engine/src/continuity/ledger.js(reviewLedgerOps, HOOK_PAID_WITHOUT_EVIDENCE) 의 뜻을 옮김.
 * - 인용은 공백을 한 칸으로 줄여 비교하고, 다듬은 뒤 코드 포인트 minQuote(기본 8) 이상이어야 한다.
 * - vibelore 는 근거 없는 해소를 advanced 로 낮춰 저장했다. Folio 검사는 사건을 고치지 않고 알리기만 한다.
 * - 실험 검사라 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다.
 */
export const PROMISE_EVIDENCE_DEFAULTS = Object.freeze({ minQuote: 8 });

const squash = (text) => String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** 설정값이 올바른지 확인. 잘못되면 CONFIG_INVALID 지적 하나 반환. */
function validateConfig(config) {
  if (!config) return null;
  const bad = [];
  const allowed = new Set(['minQuote']);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) bad.push(key);
  }
  if (typeof config.minQuote !== 'undefined' && (!Number.isInteger(config.minQuote) || config.minQuote <= 0)) {
    bad.push('minQuote');
  }
  if (bad.length === 0) return null;
  return [{
    code: 'PROMISE_EVIDENCE_CONFIG_INVALID',
    message: `설정이 잘못됐다: ${bad.join(', ')}`,
  }];
}

/**
 * @param {{ draft?: string, draftEvents?: any[], work?: { entities: Map<string, any> } }} ctx
 * @param {{ minQuote?: number }} [config]
 */
export function promiseEvidence(ctx, config = PROMISE_EVIDENCE_DEFAULTS) {
  const error = validateConfig(config);
  if (error) return error;
  const minQuote = config?.minQuote ?? PROMISE_EVIDENCE_DEFAULTS.minQuote;
  const entities = ctx.work?.entities ?? new Map();
  const text = squash(ctx.draft);
  const findings = [];
  for (const event of ctx.draftEvents ?? []) {
    if (event?.kind !== 'promise.resolved') continue;
    const entity = entities.get(event.entityId);
    if (entity && entity.kind !== PROMISE_KIND) continue;
    const evidence = typeof event.quote === 'string' ? squash(event.quote) : '';
    if ([...evidence].length >= minQuote && text.includes(evidence)) continue;
    const label = entity?.name ? `${entity.name}(${event.entityId})` : event.entityId;
    // vibelore: HOOK_PAID_WITHOUT_EVIDENCE
    findings.push({
      code: 'PROMISE_RESOLVED_WITHOUT_EVIDENCE', entityId: event.entityId,
      message: `${label}: 약속을 갚았다고 적었지만 원고에서 ${minQuote}자 이상 그대로 인용한 근거가 없다`,
    });
  }
  return findings;
}
