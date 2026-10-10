/**
 * 연재 검사기(novel.serial 묶음)가 함께 쓰는 원고 다루기 도구.
 * 문단 나누기, 원고에 그대로 있는 인용만 남기기, 잘못된 설정값 알리기.
 */

/** 원고 문자열(없으면 빈 문자열). 줄바꿈은 \n 으로 맞춘다. */
export const proseOf = (ctx) => (typeof ctx?.draft === 'string' ? ctx.draft.replace(/\r\n/g, '\n') : '');

/** 빈 줄로 나눈 문단(앞뒤 공백을 떼고 빈 문단은 버린다). vibelore 와 같은 기준(`\n\s*\n`). */
export const paragraphsOf = (text) => text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);

/** 문단 안의 빈 줄 아닌 줄들. */
export const linesOf = (paragraph) => paragraph.split('\n').filter((line) => line.trim());

/**
 * 인용은 다듬은 길이 2 이상이고 원고에 그대로 있어야 한다(코어 인용 규칙). 아니면 undefined.
 * @param {string} draft
 * @param {string} text
 */
export function quoteIn(draft, text) {
  if (typeof text !== 'string' || text.trim().length < 2) return undefined;
  return typeof draft === 'string' && draft.includes(text) ? text : undefined;
}

/** quote 가 있을 때만 붙인 지적. */
export const withQuote = (finding, quote) => (quote === undefined ? finding : { ...finding, quote });

/**
 * 설정값이 허용 목록에 없을 때의 지적. 검사는 이 지적 하나만 내고 멈춘다(모르는 값으로 추측해 돌리지 않는다).
 * @param {string} code
 * @param {string} key
 * @param {unknown} value
 * @param {readonly string[]} allowed
 */
export function configInvalid(code, key, value, allowed) {
  return {
    code,
    message: `설정 ${key} 값 "${String(value)}"을(를) 알 수 없다. ${allowed.join(' | ')} 중 하나로 정한다`,
  };
}
