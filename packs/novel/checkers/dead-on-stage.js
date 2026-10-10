/**
 * 죽은 인물 등장(vibelore DEAD_CHARACTER_ON_STAGE 의 뜻을 옮김).
 * 앞 노드의 state 사건으로 죽은(vital: dead) 엔티티가 이 노드에 등장하면 지적한다.
 * 뒤에 되살아났거나(vital: alive) 이 원고가 되살리면 지적하지 않는다. 등급(hard)은 pack.yaml 이 정한다.
 * - 지적의 severity 는 선언 등급을 낮추기만 한다(코어 stamp). VITAL_UNKNOWN 의 block 은 hard 를 낮춘 값이다.
 * - 이 원고의 되살림은 원고에 그대로 있는 인용(quote)이 있어야 인정한다. 인용 없는 추출 한 줄로 hard 검사가 꺼지면 안 된다.
 * - vital 값은 앞뒤 공백을 떼고 소문자로 본다. dead/alive 가 아닌 값은 뜻을 모르므로 VITAL_UNKNOWN(block)으로 작가에게 묻는다.
 * @param {{ priorEvents?: any[], draftEvents?: any[], appearances?: string[], draft?: string }} ctx
 */
export function deadOnStage(ctx) {
  const appearances = ctx.appearances ?? [];
  const draftEvents = ctx.draftEvents ?? [];
  const inScope = new Set([...appearances, ...draftEvents.filter(isVitalEvent).map((e) => e.entityId)]);
  const findings = [];
  const unknown = new Set();
  const flagUnknown = (event, raw) => {
    const key = `${event.entityId}\0${raw}`;
    if (unknown.has(key)) return;
    unknown.add(key);
    findings.push({
      code: 'VITAL_UNKNOWN', severity: 'block', entityId: event.entityId, quote: raw,
      message: `${event.entityId}: 생사 값 "${raw}"을(를) 알 수 없다(dead 또는 alive). 작가가 정해야 한다`,
    });
  };

  const dead = new Set();
  for (const event of ctx.priorEvents ?? []) {
    const vital = vitalOf(event);
    if (vital === null) continue;
    if (vital === 'dead') dead.add(event.entityId);
    else if (vital === 'alive') dead.delete(event.entityId);
    else if (inScope.has(event.entityId)) flagUnknown(event, rawVital(event));
  }
  const revived = new Set();
  for (const event of draftEvents) {
    const vital = vitalOf(event);
    if (vital === null) continue;
    if (vital === 'alive') { if (quotedInDraft(event.quote, ctx.draft)) revived.add(event.entityId); }
    else if (vital !== 'dead') flagUnknown(event, rawVital(event));
  }
  const onStage = appearances.filter((id) => dead.has(id) && !revived.has(id))
    .map((id) => ({ code: 'DEAD_ON_STAGE', message: `${id}: 앞에서 죽은 인물이 되살아나는 사건 없이 등장한다`, entityId: id }));
  return [...onStage, ...findings];
}

/** vital 을 적은 state 사건인가. */
function isVitalEvent(event) {
  return event?.kind === 'state' && event.data != null && event.data.vital !== undefined;
}

const rawVital = (event) => String(event.data.vital);

/** state 사건의 vital 값(다듬고 소문자). vital 이 없는 사건은 null. */
function vitalOf(event) {
  return isVitalEvent(event) ? rawVital(event).trim().toLowerCase() : null;
}

/** 인용은 다듬은 길이 2 이상이고 원고(NFC)에 그대로 있어야 한다(코어 인용 규칙과 같은 기준). */
function quotedInDraft(quote, draft) {
  if (typeof quote !== 'string' || quote.trim().length < 2) return false;
  return typeof draft === 'string' && draft.normalize('NFC').includes(quote.normalize('NFC'));
}
