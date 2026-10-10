/**
 * 검사 ctx 의 주장(코어 core/evidence/scope.js 가 만든 것: 연결은 지금 자료로 확인된 것만). 모양이 틀린 원소는 건너뛴다 —
 * 검사기가 던지면 CHECK_CRASHED 가 되어 block 으로 올린 작품이 멈춘다.
 * @param {{ claims?: unknown }} ctx
 * @returns {Array<{ quote: string, sources: any[] }>}
 */
export const claimsOf = (ctx) => (Array.isArray(ctx?.claims) ? ctx.claims : [])
  .filter((claim) => claim && typeof claim.quote === 'string' && Array.isArray(claim.sources));

/** 주장이 연결한 자료 id(한 번씩, 처음 나온 순서). */
export const sourceIdsOf = (claim) => [...new Set(claim.sources.map((link) => link?.sourceId).filter((id) => typeof id === 'string'))];

/** 자료 설명서의 신뢰도(다듬고 소문자로). 자료가 없거나 적지 않았으면 null. */
export function reliabilityOf(ctx, sourceId) {
  const value = ctx?.work?.sources?.get?.(sourceId)?.reliability;
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

/** 전각 숫자·쉼표·마침표만 반각으로 바꾼다. NFKC 는 쓰지 않는다 — ㎡·²·① 같은 기호가 숫자가 되면 오탐이 난다(N2 미룬 minor). */
const toHalfWidth = (text) => text.replace(/[０-９，．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

/** 앞의 0을 떼고(07 → 7) 소수점 뒤 끝 0을 뗀다(1.50 → 1.5, 2.0 → 2). */
const canonical = (part) => {
  const trimmed = part.replace(/^0+(?=\d)/, '');
  return trimmed.includes('.') ? trimmed.replace(/0+$/, '').replace(/\.$/, '') : trimmed;
};

/**
 * 글에서 읽은 숫자 한 덩어리를 값 목록으로 바꾼다.
 * 천 단위 쉼표(1,000 → 1000)는 뺀다. 그 밖의 쉼표는 나열로 보고 나눈다(1,2,3 → 1, 2, 3).
 * 마침표가 둘 이상이면 날짜·판 번호로 보고 나눈다(2026.09.30 → 2026, 9, 30).
 */
function valuesOf(raw) {
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) return [canonical(raw.replace(/,/g, ''))];
  return raw.split(',').flatMap((piece) => ((piece.match(/\./g) ?? []).length > 1 ? piece.split('.') : [piece])).filter(Boolean).map(canonical);
}

/**
 * 글 속 아라비아 숫자(연도 포함)의 값과 그 덩어리가 끝나는 곳(단위를 읽을 자리). 나온 순서대로, 겹쳐도 모두.
 * 문자열이 아니면 빈 목록이다. 한글 숫자(삼십칠조)는 읽지 않는다(N2 결정 11).
 * @param {unknown} text
 * @returns {Array<{ value: string, end: number }>}
 */
export function numberMatches(text) {
  if (typeof text !== 'string') return [];
  const half = toHalfWidth(text);
  return [...half.matchAll(/\d+(?:[.,]\d+)*/g)].flatMap((match) => {
    const end = (match.index ?? 0) + match[0].length;
    return valuesOf(match[0]).map((value) => ({ value, end }));
  });
}

/**
 * 글 속 아라비아 숫자 값을 한 번씩, 나온 순서로. 전각 숫자(２０２６)는 반각으로 읽는다.
 * @param {unknown} text
 */
export const numbersIn = (text) => [...new Set(numberMatches(text).map((match) => match.value))];
