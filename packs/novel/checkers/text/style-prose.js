/**
 * 문체 검사기(novel.style 묶음)가 함께 쓰는 원고 다루기 도구.
 * 원고 꺼내기, 문장 나누기, 어절 세기, 부분 문자열 세기, 설정 합치기, 잘못된 설정 알리기.
 * 문장·어절 기준은 vibelore engine/src/continuity/{sentence-stats,quality-scan,style-scan}.js 와 같다.
 */

/** 원고 문자열(없으면 빈 문자열). NFC 로 맞추고 줄바꿈은 \n 으로 맞춘다. */
export const draftText = (ctx) => (typeof ctx?.draft === 'string' ? ctx.draft.normalize('NFC').replace(/\r\n/g, '\n') : '');

/** 문장 나누기 — 종결부호(. ! ? 。 …) 뒤 공백, 또는 줄바꿈. 따옴표 안 대사도 한 문장으로 센다. */
export const splitSentences = (text) => text.split(/(?<=[.!?。…])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);

/** 공백으로 나눈 어절 수. */
export const countWords = (text) => text.split(/\s+/).filter((w) => w.length > 0).length;

/** text 에서 term 이 겹치지 않게 나온 횟수. */
export function countOccurrences(text, term) {
  if (!term) return 0;
  let count = 0;
  for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + term.length)) count++;
  return count;
}

/** 설정은 기본값 위에 덮는다(빠진 키는 기본값). */
export const withDefaults = (defaults, config) => ({ ...defaults, ...(config && typeof config === 'object' ? config : {}) });

/**
 * 잘못된 설정값 지적. 검사는 이 지적 하나만 내고 멈춘다(모르는 값을 조용히 기본값으로 바꾸지 않는다).
 * @param {string} key
 * @param {unknown} value
 * @param {string} expected
 */
export const configInvalid = (key, value, expected) => ({
  code: 'CONFIG_INVALID',
  message: `설정 ${key} 값 ${JSON.stringify(value)}을(를) 쓸 수 없다. ${expected}`,
});

/**
 * keys 중 유한한 수가 아닌 첫 설정값의 지적(모두 수면 null).
 * @param {Record<string, unknown>} config
 * @param {string[]} keys
 */
export function invalidNumber(config, keys) {
  const bad = keys.find((key) => typeof config[key] !== 'number' || !Number.isFinite(config[key]));
  return bad === undefined ? null : configInvalid(bad, config[bad], '수(number)여야 한다');
}

/** 비율을 백분율 문자열로(소수 digits 자리). */
export const percent = (ratio, digits = 0) => `${(ratio * 100).toFixed(digits)}%`;
