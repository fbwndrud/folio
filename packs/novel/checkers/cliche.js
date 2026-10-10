/**
 * 상투 표현(novel.cliche). 상투 구절 사전의 구절이 repeatMin 번 이상 나오면 구절마다 LEXICAL_FATIGUE,
 * 사전 구절 전체 횟수 / 어절 수 가 densityMax 를 넘으면 CLICHE_DENSITY 를 한 번 알린다. 금지어 검사가 아니라 반복 신호다.
 * vibelore engine/src/continuity/style-scan.js(scanStyle) 와 style-lexicon.js 의 뜻을 옮김.
 * - genre 가 null 이면 한국어 공통 목록만 본다. 장르를 고르면 그 장르 목록(공통 + 전용)을 본다.
 *   영어·중국어 목록을 쓰는 장르(litrpg, xianxia 등)는 한국어 원고에서 공통 구절이 거의 안 걸린다 — vibelore 표 그대로다.
 * - 모르는 장르는 CONFIG_INVALID 하나로 알리고 멈춘다(vibelore 는 빈 목록으로 조용히 넘어갔다).
 */
import { GENERIC_CLICHES, GENRE_CLICHES } from '../lexicons/style-cliches.js';
import { configInvalid, countOccurrences, countWords, draftText, invalidNumber, percent, withDefaults } from './text/style-prose.js';

export const CLICHE_DEFAULTS = Object.freeze({ genre: null, repeatMin: 3, densityMax: 0.01 });

/**
 * @param {{ draft?: string }} ctx
 * @param {Partial<typeof CLICHE_DEFAULTS>} [config]
 */
export function cliche(ctx, config = CLICHE_DEFAULTS) {
  const cfg = withDefaults(CLICHE_DEFAULTS, config);
  const { genre } = cfg;
  if (genre !== null && (typeof genre !== 'string' || !Object.hasOwn(GENRE_CLICHES, genre))) {
    return [configInvalid('genre', genre, `null 또는 ${Object.keys(GENRE_CLICHES).join(' | ')} 중 하나로 정한다`)];
  }
  const invalid = invalidNumber(cfg, ['repeatMin', 'densityMax']);
  if (invalid) return [invalid];
  const text = draftText(ctx);
  if (text.length === 0) return [];
  const phrases = genre === null ? GENERIC_CLICHES : GENRE_CLICHES[genre];
  const label = genre ?? '공통';
  const findings = [];
  let total = 0;
  for (const phrase of phrases) {
    const count = countOccurrences(text, phrase);
    total += count;
    if (count > 0 && count >= cfg.repeatMin) {
      findings.push({ code: 'LEXICAL_FATIGUE', quote: phrase, message: `상투 구절 "${phrase}"이(가) ${count}번 나온다(목록: ${label})` });
    }
  }
  const words = countWords(text);
  if (words > 0 && total / words > cfg.densityMax) {
    findings.push({ code: 'CLICHE_DENSITY', message: `상투 구절 밀도 ${percent(total / words, 2)}(${total}번 / 어절 ${words}, 목록: ${label})` });
  }
  return findings;
}
