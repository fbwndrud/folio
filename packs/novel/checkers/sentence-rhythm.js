/**
 * 문장 리듬(novel.sentence-rhythm). 문장 길이(글자 수)의 표준편차가 너무 작으면 단조(SENTENCE_MONOTONY),
 * 너무 크면 불안정(SENTENCE_CHAOS)으로 알린다. 문장이 minSentences 개보다 적으면 보지 않는다.
 * vibelore engine/src/continuity/sentence-stats.js(scanSentenceStats) 의 뜻을 옮김.
 * - 문장 나누기는 언어를 가리지 않지만 기준값(6·30)은 한국어 웹소설 분포(평균 20~40자, 편차 10~20)에 맞춘 것이다.
 * - 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다.
 */
import { draftText, invalidNumber, splitSentences, withDefaults } from './text/style-prose.js';

export const SENTENCE_RHYTHM_DEFAULTS = Object.freeze({ minSentences: 10, monotonyMax: 6, chaosMin: 30 });

/** 문장 길이 평균과 (모집단) 표준편차. */
function lengthStats(sentences) {
  const lengths = sentences.map((s) => s.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / lengths.length;
  return { mean, stdev: Math.sqrt(variance) };
}

/**
 * @param {{ draft?: string }} ctx
 * @param {Partial<typeof SENTENCE_RHYTHM_DEFAULTS>} [config]
 */
export function sentenceRhythm(ctx, config = SENTENCE_RHYTHM_DEFAULTS) {
  const cfg = withDefaults(SENTENCE_RHYTHM_DEFAULTS, config);
  const invalid = invalidNumber(cfg, ['minSentences', 'monotonyMax', 'chaosMin']);
  if (invalid) return [invalid];
  const sentences = splitSentences(draftText(ctx));
  if (sentences.length === 0 || sentences.length < cfg.minSentences) return [];
  const { mean, stdev } = lengthStats(sentences);
  const tail = `평균 ${mean.toFixed(1)}자, 문장 ${sentences.length}개`;
  if (stdev < cfg.monotonyMax) {
    return [{ code: 'SENTENCE_MONOTONY', message: `문장 길이 표준편차 ${stdev.toFixed(2)} < ${cfg.monotonyMax}: 문장 길이가 거의 같아 리듬이 단조롭다(${tail})` }];
  }
  if (stdev > cfg.chaosMin) {
    return [{ code: 'SENTENCE_CHAOS', message: `문장 길이 표준편차 ${stdev.toFixed(2)} > ${cfg.chaosMin}: 문장 길이가 들쭉날쭉해 리듬이 불안정하다(${tail})` }];
  }
  return [];
}
