import { fencedRanges, inRanges } from '../util/fences.js';

/** 저장하는 앞뒤 문맥 길이(글자). */
export const CONTEXT_CHARS = 30;
export const MAX_QUOTE = 500;

/**
 * 코드 블록 밖에서 인용문이 시작하는 위치들.
 * @param {string} text
 * @param {string} quote
 * @returns {number[]}
 */
export function matchesOf(text, quote) {
  if (typeof quote !== 'string' || quote === '') return [];
  const source = String(text);
  const ranges = fencedRanges(source);
  const out = [];
  let at = source.indexOf(quote);
  while (at !== -1) {
    if (!inRanges(ranges, at, at + quote.length)) out.push(at);
    at = source.indexOf(quote, at + 1);
  }
  return out;
}

const contextAt = (text, start, quote) => ({
  before: text.slice(Math.max(0, start - CONTEXT_CHARS), start),
  after: text.slice(start + quote.length, start + quote.length + CONTEXT_CHARS),
});
const optionalString = (value) => value === undefined || typeof value === 'string';

/** @typedef {{ quote: any, before?: any, after?: any }} QuoteSubmission */
/** @typedef {{ ok: true, start: number, before: string, after: string }} QuoteFound */
/** @typedef {{ ok: false, code: string, count?: number }} QuoteRefused */
/** @typedef {QuoteFound | QuoteRefused} QuoteResolution */

/**
 * 제출된 인용문을 본문에서 한 곳으로 정한다. 앞뒤 문맥을 주면 그것으로 좁힌다.
 * 문맥은 엔진이 본문에서 다시 잘라 돌려준다(호스트가 준 문맥을 그대로 저장하지 않는다).
 * @param {string} text
 * @param {QuoteSubmission} submission
 * @returns {QuoteResolution}
 */
export function resolveQuote(text, { quote, before, after }) {
  if (typeof text !== 'string' || typeof quote !== 'string' || quote === '' || quote.length > MAX_QUOTE
    || !optionalString(before) || !optionalString(after)) {
    return { ok: false, code: 'OCCURRENCE_QUOTE_INVALID' };
  }
  const source = text;
  let found = matchesOf(source, quote);
  if (!found.length) return { ok: false, code: 'OCCURRENCE_QUOTE_NOT_FOUND' };
  if (before !== undefined || after !== undefined) {
    found = found.filter((start) => (before === undefined || source.slice(0, start).endsWith(before))
      && (after === undefined || source.slice(start + quote.length).startsWith(after)));
    if (!found.length) return { ok: false, code: 'OCCURRENCE_CONTEXT_MISMATCH' };
  }
  if (found.length > 1) return { ok: false, code: 'OCCURRENCE_AMBIGUOUS', count: found.length };
  return { ok: true, start: found[0], ...contextAt(source, found[0], quote) };
}

function commonSuffix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}
function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

/** @typedef {{ quote: any, before?: any, after?: any }} StoredOccurrence */
/** @typedef {{ status: 'located'|'relocated', start: number }} ReanchorFound */
/** @typedef {{ status: 'stale', start: null, reason: 'QUOTE_MISSING'|'AMBIGUOUS'|'WEAK_CONTEXT'|'INVALID' }} ReanchorStale */
/** @typedef {ReanchorFound | ReanchorStale} ReanchorResult */

/**
 * 바뀐 본문에서 저장된 인용문 + 앞뒤 문맥으로 다시 찾는다(설계 §15). 추측해서 엉뚱한 곳을 가리키지 않는다.
 *
 * 후보 위치마다 앞 문맥이 "온전한지"(beforeFull), 뒤 문맥이 "온전한지"(afterFull)를 따진다. 저장된 문맥의 길이가
 * `CONTEXT_CHARS`와 같으면(다 채워졌으면) 끝나는지/시작하는지(`endsWith`/`startsWith`)로 본다. 저장된 문맥이
 * `CONTEXT_CHARS`보다 짧으면 — 빈 문맥을 포함해 — 그때는 본문 경계(앞 문맥이면 처음, 뒤 문맥이면 끝)에 붙어서
 * 더 자를 게 없었다는 뜻이므로, 지금 후보의 앞(또는 뒤) 글 전체가 그 저장값과 정확히 같아야만 온전하다고 본다
 * (짧은 문맥은 증거가 얇아서 `endsWith`/`startsWith`만으로는 다른 글도 우연히 맞아떨어지기 쉽다 — 빈 문맥은
 * "원래도 없었다"는 뜻이지 "아무 문맥이나 맞다"는 뜻이 아니며, 이 정확히-같음 규칙의 특수한 경우일 뿐이다).
 * 점수는 지금까지처럼 (앞 문맥이 맞는 꼬리 길이 + 뒤 문맥이 맞는 머리 길이)다.
 *
 * 앞뒤 중 한쪽이라도 온전한 후보들 가운데 점수가 가장 높은 곳이 하나면 그곳을 받는다 — 양쪽 다 온전하면 located,
 * 한쪽만 온전하면 relocated. 그 후보들 중 최고 점수가 여럿이면 stale(AMBIGUOUS). 온전한 쪽이 하나도 없는 후보만
 * 있으면 stale(WEAK_CONTEXT) — 점수만 보고 짐작하지 않는다. 인용문 자체를 못 찾으면 stale(QUOTE_MISSING).
 * 본문·인용문·문맥이 올바른 타입(문자열)이 아니거나 인용문이 빈 문자열이면 stale(INVALID) — 아무것도 짐작하지 않는다.
 * @param {string} text
 * @param {StoredOccurrence} [occurrence]
 * @returns {ReanchorResult}
 */
export function reanchor(text, occurrence) {
  const given = occurrence && typeof occurrence === 'object' ? occurrence : {};
  const { quote, before, after } = given;
  if (typeof text !== 'string' || typeof quote !== 'string' || quote === '' || !optionalString(before) || !optionalString(after)) {
    return { status: 'stale', start: null, reason: 'INVALID' };
  }
  const source = text;
  const storedBefore = before ?? '';
  const storedAfter = after ?? '';
  const found = matchesOf(source, quote);
  if (!found.length) return { status: 'stale', start: null, reason: 'QUOTE_MISSING' };
  const scored = found.map((start) => {
    const beforeText = source.slice(0, start);
    const afterText = source.slice(start + quote.length);
    const beforeFull = storedBefore.length < CONTEXT_CHARS ? beforeText === storedBefore : beforeText.endsWith(storedBefore);
    const afterFull = storedAfter.length < CONTEXT_CHARS ? afterText === storedAfter : afterText.startsWith(storedAfter);
    const score = commonSuffix(beforeText, storedBefore) + commonPrefix(afterText, storedAfter);
    return { start, score, beforeFull, afterFull };
  });
  const candidates = scored.filter((s) => s.beforeFull || s.afterFull);
  if (!candidates.length) return { status: 'stale', start: null, reason: 'WEAK_CONTEXT' };
  let best = -Infinity;
  for (const candidate of candidates) if (candidate.score > best) best = candidate.score;
  const top = candidates.filter((candidate) => candidate.score === best);
  if (top.length > 1) return { status: 'stale', start: null, reason: 'AMBIGUOUS' };
  return { status: top[0].beforeFull && top[0].afterFull ? 'located' : 'relocated', start: top[0].start };
}
