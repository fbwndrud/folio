/** 정의 전 사용을 보는 엔티티 종류. example(예제)은 정의 대상이 아니다. */
export const TERM_KINDS = Object.freeze(['concept', 'term']);
export const DEFINED = 'term.defined';

const nfc = (text) => text.normalize('NFC');

/**
 * 검사 ctx 의 작품 엔티티. 코어 검사 실행(core/run/steps/check.js checkContext)은 늘 work 를 넣는다.
 * work 가 없으면 조용히 통과하지 않고 던진다 — 코어가 CHECK_CRASHED(status error, block·hard 선언이면 그 등급)로 알린다
 * (N1 미룬 minor: work 없는 ctx 가 block 으로 올린 검사에서도 passed 가 되던 것).
 * @param {{ work?: { entities?: unknown } }} ctx
 * @returns {Map<string, any>}
 */
export function workEntities(ctx) {
  const entities = ctx?.work?.entities;
  if (!(entities instanceof Map)) throw new TypeError('knowledge checkers need ctx.work.entities (the core check context)');
  return entities;
}

/** 인용은 다듬은 길이 2 이상이고 원고(NFC)에 그대로 있어야 한다(코어 인용 규칙·소설 dead-on-stage 와 같은 기준). */
export function quotedInDraft(quote, draft) {
  if (typeof quote !== 'string' || quote.trim().length < 2) return false;
  return typeof draft === 'string' && nfc(draft).includes(nfc(quote));
}

/** 엔티티의 이름과 별칭(다듬고, 빈 값 제외). 공백만 있는 별칭이 아무 인용과나 맞지 않게 트림한다. */
export const namesOf = (entity) => [entity?.name, ...(Array.isArray(entity?.aliases) ? entity.aliases : [])]
  .map((name) => (typeof name === 'string' ? name.trim() : name))
  .filter((name) => typeof name === 'string' && name.length > 0);

/** 인용 안에 그 엔티티의 이름이나 별칭이 있는가(NFC). 다른 문장을 인용해 정의를 흉내 내지 못하게 하는 조건의 일부일 뿐이다. */
export const quoteNames = (quote, entity) => namesOf(entity).some((name) => nfc(quote).includes(nfc(name)));

/**
 * 인용(다듬은 뒤)에서 그 엔티티의 이름·별칭을 모두 지우고 남는 글자.
 * 이름 자체만 인용하거나 이름에 조사 하나만 붙여 인용해 정의를 흉내 내지 못하게 한다.
 */
const quoteWithoutNames = (quote, entity) => namesOf(entity).reduce((text, name) => text.split(nfc(name)).join(''), nfc(quote.trim()));

/**
 * 인용에서 이름·별칭을 모두 지우고도 공백이 아닌 글자가 2개 이상 남는가.
 * 한계: 결정론 검사라 "정의 문장"과 "이름이 든 사용 문장·다른 용어의 정의 문장"을 뜻으로 구별하지 못한다.
 * 이 함수는 이름 자체·이름+조사 하나만 인용한 가장 값싼 위조만 막는다.
 */
export const quoteHasSubstance = (quote, entity) => quoteWithoutNames(quote, entity).replace(/\s+/gu, '').length >= 2;

/**
 * 이 원고의 인용 있는 정의: kind 가 term.defined 이고, 인용이 원고에 그대로 있고, 인용에 그 엔티티 이름·별칭이 있고,
 * 이름·별칭을 지우고도 공백 아닌 글자가 2개 이상 남는 사건.
 * 한계: 결정론 검사라 정의 문장과, 이름이 든 사용 문장이나 다른 용어의 정의 문장을 뜻으로 구별하지 못한다. 여기서 막는 것은
 * 인용 없음·원고에 없는 인용·이름 자체만 인용·이름+조사 하나만 인용처럼 값싼 위조뿐이다.
 * 반환: Map<entityId, 원고(NFC) 안 인용 첫 위치>. 같은 엔티티를 여러 번 정의하면 가장 앞 위치.
 * @param {{ draft?: string, draftEvents?: any[], work?: { entities: Map<string, any> } }} ctx
 */
export function draftDefinitions(ctx) {
  const entities = ctx.work?.entities ?? new Map();
  const draft = typeof ctx.draft === 'string' ? nfc(ctx.draft) : '';
  const out = new Map();
  for (const event of ctx.draftEvents ?? []) {
    if (event?.kind !== DEFINED || !quotedInDraft(event.quote, draft)) continue;
    const entity = entities.get(event.entityId);
    if (!entity || !quoteNames(event.quote, entity) || !quoteHasSubstance(event.quote, entity)) continue;
    const at = draft.indexOf(nfc(event.quote));
    if (!out.has(event.entityId) || at < out.get(event.entityId)) out.set(event.entityId, at);
  }
  return out;
}

/** 앞 노드에서 정의된 엔티티 id. 기록장의 사건은 커밋(영수증)을 거쳤으므로 그대로 인정한다. */
export const priorDefinitions = (ctx) => new Set((ctx.priorEvents ?? []).filter((e) => e?.kind === DEFINED).map((e) => e.entityId));

/**
 * 엔티티의 선수 개념 id 목록(문자열만, 중복 없이).
 * core/scope/scope.js 의 같은 이름 함수와 "어떤 id 를 센다"는 기준이 같아야 한다
 * (코어는 팩을 import 할 수 없어 따로 둔 것뿐이다 — 하나를 고치면 다른 쪽도 맞춘다).
 */
export const prerequisitesOf = (entity) => [...new Set((Array.isArray(entity?.data?.prerequisites) ? entity.data.prerequisites : [])
  .filter((id) => typeof id === 'string' && id.length > 0))];
