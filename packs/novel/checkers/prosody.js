/**
 * 운율(novel.prosody). 운율 점수(문장 길이 분산·종결어미 다양성·같은 어미 연속·체언/용언 균형의 평균, 0~100)가
 * 강도 단계의 기준보다 낮으면 PROSODY_LOW 로 알린다. 한국어 전용(종결어미·조사 휴리스틱).
 * vibelore engine/src/continuity/prosody-scan.js(runProsodyScan) 와 quality-gate.js(PROSODY_LEVELS) 의 뜻을 옮김.
 * - 강도는 이름으로만 고른다: loose 45 · normal 55(기본) · strict 70. 숫자를 직접 받지 않는다(vibelore 와 같은 이유 — 표본이 좁다).
 * - 모르는 강도 이름은 CONFIG_INVALID 하나로 알리고 멈춘다(조용히 기본값으로 떨어지지 않는다).
 * - 빈 원고는 보지 않는다.
 */
import { prosodyScore } from './text/prosody-score.js';
import { configInvalid, draftText, withDefaults } from './text/style-prose.js';

export const PROSODY_LEVELS = Object.freeze({ loose: 45, normal: 55, strict: 70 });
export const PROSODY_DEFAULTS = Object.freeze({ level: 'normal' });

const AXIS_NAMES = Object.freeze({
  sentenceLengthVariance: '문장 길이 분산',
  endingDiversity: '종결어미 다양성',
  endingClusterPenalty: '같은 어미 연속',
  nounVerbBalance: '체언/용언 균형',
});

/**
 * @param {{ draft?: string }} ctx
 * @param {Partial<typeof PROSODY_DEFAULTS>} [config]
 */
export function prosody(ctx, config = PROSODY_DEFAULTS) {
  const { level } = withDefaults(PROSODY_DEFAULTS, config);
  if (typeof level !== 'string' || !Object.hasOwn(PROSODY_LEVELS, level)) {
    return [configInvalid('level', level, `${Object.keys(PROSODY_LEVELS).join(' | ')} 중 하나로 정한다`)];
  }
  const text = draftText(ctx);
  if (text.trim().length === 0) return [];
  const threshold = PROSODY_LEVELS[level];
  const { score, breakdown } = prosodyScore(text);
  if (score >= threshold) return [];
  const axes = Object.entries(breakdown).map(([key, value]) => `${AXIS_NAMES[key]} ${value}`).join(', ');
  return [{ code: 'PROSODY_LOW', message: `운율 점수 ${score}점이 기준 ${threshold}점(${level})보다 낮다(${axes})` }];
}
