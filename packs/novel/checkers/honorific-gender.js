import { KO_HONORIFIC_SEED, lookupHonorific } from '../lexicons/honorifics.js';

/**
 * 호칭과 성별(novel.honorific-gender). 성별을 함의하는 호칭('도련님', '언니')이 불리는 인물의 성별과 어긋나면 지적한다.
 * vibelore engine/src/continuity/lexicon-scan.js(scanLexicon)·character.js(effectiveIntrinsic) 의 뜻을 옮김.
 * - 가리킨 호칭(address 사건, vibelore Mode A): 받는 인물이 정해져 있으니 HONORIFIC_GENDER_MISMATCH.
 * - 원고 훑기(vibelore Mode B): 누구를 부르는지 모르니 HONORIFIC_GENDER_SUSPECT 로만 알린다. address 사건이 가리킨 호칭은 훑지 않는다.
 * - 성별은 엔티티 data.gender 를 앞 사건(state, data.gender)이 읽는 순서로 덮는다. 이 원고가 성별을 바꾸면 바뀌기 전·후 모두 맞다고 본다.
 * - 실험 검사라 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다.
 */
export const HONORIFIC_GENDER_DEFAULTS = Object.freeze({
  /** 원고 훑기를 할지. */
  proseScan: true,
  /** 원고 훑기에서 뺄 호칭. '그'는 지시어("그 날")와 구별되지 않는다. */
  proseSkipTerms: Object.freeze(['그']),
});

const GENDERS = ['male', 'female'];
const GENDER_WORD = { male: '남성', female: '여성' };
const BOUNDARY_HEAD = '(?:^|[^\\uac00-\\ud7a3a-zA-Z0-9])';
const BOUNDARY_TAIL = '(?=[^\\uac00-\\ud7a3a-zA-Z0-9]|$)';
const QUOTE_RADIUS = 10;

/** 설정값이 올바른지 확인. 잘못되면 CONFIG_INVALID 지적 하나 반환. */
function validateConfig(config) {
  if (!config) return null;
  const bad = [];
  const allowed = new Set(['proseScan', 'proseSkipTerms']);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) bad.push(key);
  }
  if (typeof config.proseScan !== 'undefined' && typeof config.proseScan !== 'boolean') bad.push('proseScan');
  if (typeof config.proseSkipTerms !== 'undefined') {
    if (!Array.isArray(config.proseSkipTerms) || !config.proseSkipTerms.every((t) => typeof t === 'string')) {
      bad.push('proseSkipTerms');
    }
  }
  if (bad.length === 0) return null;
  return [{
    code: 'HONORIFIC_GENDER_CONFIG_INVALID',
    message: `설정이 잘못됐다: ${bad.join(', ')}`,
  }];
}

/**
 * @param {{ draft?: string, priorEvents?: any[], draftEvents?: any[], work?: { entities: Map<string, any> } }} ctx
 * @param {{ proseScan?: boolean, proseSkipTerms?: readonly string[] }} [config]
 */
export function honorificGender(ctx, config = HONORIFIC_GENDER_DEFAULTS) {
  const error = validateConfig(config);
  if (error) return error;
  const options = { ...HONORIFIC_GENDER_DEFAULTS, ...(config ?? {}) };
  const draft = typeof ctx.draft === 'string' ? ctx.draft.normalize('NFC') : '';
  const entities = ctx.work?.entities ?? new Map();
  const draftEvents = ctx.draftEvents ?? [];
  const gendersOf = genderReader(entities, ctx.priorEvents ?? [], draftEvents);
  const addresses = draftEvents.filter((e) => e?.kind === 'address' && typeof e.data?.term === 'string');
  const findings = [...attributed(addresses, gendersOf, entities, draft)];
  if (options.proseScan === false || !draft) return findings;
  const skip = new Set([...(options.proseSkipTerms ?? []), ...addresses.map((e) => e.data.term.trim().normalize('NFC'))]);
  return [...findings, ...proseScan(draft, entities, gendersOf, skip)];
}

/** 엔티티 id → 이 원고에서 맞다고 볼 성별 집합(앞 사건으로 접은 값 + 이 원고가 정한 값). vibelore effectiveIntrinsic. */
function genderReader(entities, priorEvents, draftEvents) {
  const genderOfEvent = (e) => (e?.kind === 'state' && e.data?.gender !== undefined ? normGender(e.data.gender) : undefined);
  return (id) => {
    let current = normGender(entities.get(id)?.data?.gender);
    for (const event of priorEvents) {
      const g = event?.entityId === id ? genderOfEvent(event) : undefined;
      if (g !== undefined) current = g;
    }
    const set = new Set(current ? [current] : []);
    for (const event of draftEvents) {
      const g = event?.entityId === id ? genderOfEvent(event) : undefined;
      if (g) set.add(g);
    }
    return set;
  };
}

function normGender(value) {
  const g = typeof value === 'string' ? value.trim().toLowerCase() : null;
  return GENDERS.includes(g) ? g : null;
}

/** 가리킨 호칭(vibelore Mode A, GENDER_HONORIFIC_MISMATCH). */
function attributed(addresses, gendersOf, entities, draft) {
  const out = [];
  const seen = new Set();
  for (const event of addresses) {
    const term = event.data.term.trim().normalize('NFC');
    const implied = lookupHonorific(term)?.genderImplication;
    const genders = gendersOf(event.entityId);
    if (!implied || genders.size === 0 || genders.has(implied)) continue;
    const quote = [event.quote, term].find((q) => quotedIn(q, draft));
    const key = `${event.entityId}\0${term}\0${quote ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      code: 'HONORIFIC_GENDER_MISMATCH', entityId: event.entityId, ...(quote ? { quote } : {}),
      message: `${labelOf(entities, event.entityId)}: 호칭 '${term}'은(는) ${GENDER_WORD[implied]}을 부르는 말인데 이 인물은 ${[...genders].map((g) => GENDER_WORD[g]).join('/')}이다`,
    });
  }
  return out;
}

/** 원고 훑기(vibelore Mode B). 원고에 이름이 나온 인물만 후보로 보고, 호칭에 맞는 후보가 있으면 넘어간다. */
function proseScan(draft, entities, gendersOf, skip) {
  const candidates = [...entities.values()]
    .filter((e) => e?.kind === 'character' && namesOf(e).some((name) => draft.includes(name)))
    .map((e) => ({ id: e.id, genders: gendersOf(e.id) }))
    .filter((c) => c.genders.size > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (candidates.length === 0) return [];
  const out = [];
  for (const entry of KO_HONORIFIC_SEED) {
    const implied = entry.genderImplication;
    if (!implied || skip.has(entry.term)) continue;
    if (candidates.some((c) => c.genders.has(implied))) continue;
    const at = firstOccurrence(draft, entry.term);
    if (at < 0) continue;
    const ids = candidates.map((c) => c.id);
    const quote = snippet(draft, at, entry.term.length);
    out.push({
      code: 'HONORIFIC_GENDER_SUSPECT', ...(ids.length === 1 ? { entityId: ids[0] } : {}), ...(quote ? { quote } : {}),
      message: `호칭 '${entry.term}'은(는) ${GENDER_WORD[implied]}을 부르는 말인데 원고에 나온 인물(${ids.map((id) => labelOf(entities, id)).join(', ')}) 중 맞는 성별이 없다(누구를 부르는지 추정)`,
    });
  }
  return out;
}

/** 경계(한글 음절·영숫자가 아닌 곳)로 둘러싸인 첫 위치. 없으면 -1. vibelore findOccurrences. */
function firstOccurrence(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${BOUNDARY_HEAD}(${escaped})${BOUNDARY_TAIL}`).exec(text);
  return match ? match.index + match[0].lastIndexOf(match[1]) : -1;
}

/** 원고에 그대로 있는 앞뒤 몇 글자(한 줄 안). */
function snippet(text, start, length) {
  const lineStart = text.lastIndexOf('\n', start) + 1;
  const lineEnd = text.indexOf('\n', start + length);
  const from = Math.max(lineStart, start - QUOTE_RADIUS);
  const to = Math.min(lineEnd < 0 ? text.length : lineEnd, start + length + QUOTE_RADIUS);
  const quote = text.slice(from, to).trim();
  return quote.length >= 2 ? quote : null;
}

function namesOf(entity) {
  return [entity.name, ...(Array.isArray(entity.aliases) ? entity.aliases : [])]
    .filter((n) => typeof n === 'string' && n.trim().length > 0).map((n) => n.normalize('NFC'));
}

function labelOf(entities, id) {
  const name = entities.get(id)?.name;
  return name ? `${name}(${id})` : String(id);
}

function quotedIn(quote, draft) {
  return typeof quote === 'string' && quote.trim().length >= 2 && draft.includes(quote.normalize('NFC'));
}
