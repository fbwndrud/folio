import { proseOf } from './text/serial-prose.js';

/**
 * 분량 부족(novel.length). 원고 분량이 목표의 85%(내림, 최소 1)보다 적으면 알린다.
 * vibelore engine/src/core/length-measure.js:191-236 countLength 와 src/core/validation-gate.js:270-294 lengthCoverage,
 * src/tools/check-contract.js:99 QUALITY_GATE_LENGTH 의 뜻을 옮김.
 * - config.target: 목표 분량(양의 정수). null 이면 목표가 없으므로 아무것도 내지 않는다(기본).
 * - config.unit: 'graphemes'(기본, 사람이 보는 글자 수 — Intl.Segmenter grapheme) | 'chars'(UTF-16 코드 단위,
 *   vibelore legacyCodeUnits). 공백·문장부호도 센다. vibelore 의 'words' 단위와 실행 환경 고정(pin) 검증은 옮기지 않았다.
 * - 원고가 없으면(문자열이 아니면) 잴 것이 없으므로 조용히 넘어간다. 빈 원고는 0으로 잰다.
 * - 원고는 앞뒤 공백만 떼고 잰다(vibelore publishedProse 의 생성 표지 제거는 Folio 원고에 없다).
 * - vibelore 에서는 hard(QUALITY_GATE_LENGTH)였지만 여기서는 참고(advisory, LENGTH_SHORT)다. 지적에 severity 를 적지 않는다.
 * - 설정이 잘못되면(target 이 양의 정수가 아니거나 unit 을 모르면) LENGTH_CONFIG_INVALID 하나만 낸다.
 */
export const LENGTH_DEFAULTS = Object.freeze({ target: null, unit: 'graphemes' });

const UNITS = Object.freeze({ graphemes: '자', chars: ' 코드 단위' });

/**
 * @param {{ draft?: string }} ctx
 * @param {{ target?: number | null, unit?: string }} [config]
 */
export function lengthShort(ctx, config = LENGTH_DEFAULTS) {
  const { target, unit } = { ...LENGTH_DEFAULTS, ...config };
  if (target === null || target === undefined) return [];
  if (!Number.isInteger(target) || target <= 0 || !Object.hasOwn(UNITS, unit)) return [configInvalidFinding(target, unit)];
  if (typeof ctx?.draft !== 'string') return [];

  const min = Math.max(1, Math.floor(target * 0.85));
  const actual = countLength(proseOf(ctx).trim(), unit);
  if (actual >= min) return [];
  return [{
    code: 'LENGTH_SHORT',
    message: `분량이 ${actual}${UNITS[unit]}로 목표 ${target}${UNITS[unit]}의 85%(${min}${UNITS[unit]})에 못 미친다`,
  }];
}

/**
 * text 의 길이를 unit 으로 잰다.
 * @param {string} text
 * @param {string} unit 'graphemes' | 'chars'
 */
export function countLength(text, unit) {
  if (unit === 'chars') return text.length;
  let count = 0;
  for (const _ of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)) count += 1;
  return count;
}

function configInvalidFinding(target, unit) {
  const problems = [];
  if (!Number.isInteger(target) || target <= 0) problems.push(`target "${String(target)}"은(는) 양의 정수여야 한다`);
  if (!Object.hasOwn(UNITS, unit)) problems.push(`unit "${String(unit)}"을(를) 알 수 없다(${Object.keys(UNITS).join(' | ')})`);
  return { code: 'LENGTH_CONFIG_INVALID', message: `분량 설정이 올바르지 않다: ${problems.join(', ')}` };
}
