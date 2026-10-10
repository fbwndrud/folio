/**
 * 보여주기와 말하기(novel.show-dont-tell). 감정 동사·직유 표지·의성어/의태어 사전으로 원고를 세어 취향 신호를 알린다.
 *   - SHOW_NOT_TELL_LOW: 감정 동사가 minEmotions 번 이상인데 직유/감정 비율이 ratioMin 보다 낮다(감정을 말로만 한다).
 *   - EMOTION_OVERTELL: 1인칭 표지와 감정 동사가 같은 문장에 있는 문장 수 / 어절 수 가 overtellDensityMax 를 넘는다.
 *   - ONOMATOPOEIA_OVERUSE: 의성어·의태어 수 / 어절 수 가 onomatopoeiaDensityMax 를 넘는다.
 *   - SIMILE_TOO_SPARSE / SIMILE_OVERUSE: 직유 표지 수 / 어절 수 가 simileDensityMin 보다 낮다 / simileDensityMax 보다 높다.
 * vibelore engine/src/continuity/quality-scan.js(scanQuality) 의 뜻을 옮김. 사전·1인칭 표지·기준값이 모두 한국어 전용이다.
 * - 셈은 부분 문자열(겹치지 않게)·정규식 일치 그대로다. 짧은 사전어(예: "쿵", "내")는 다른 낱말 안에서도 세진다 — vibelore 와 같다.
 */
import { EMOTION_VERBS } from '../lexicons/emotion-verbs.js';
import { ONOMATOPOEIA_MIMETIC } from '../lexicons/onomatopoeia-mimetic.js';
import { ONOMATOPOEIA_SOUND } from '../lexicons/onomatopoeia-sound.js';
import { SIMILE_PATTERNS } from '../lexicons/simile-markers.js';
import { countOccurrences, countWords, draftText, invalidNumber, percent, splitSentences, withDefaults } from './text/style-prose.js';

export const SHOW_DONT_TELL_DEFAULTS = Object.freeze({
  minEmotions: 3,
  ratioMin: 0.3,
  overtellDensityMax: 0.02,
  onomatopoeiaDensityMax: 0.03,
  simileDensityMin: 0.002,
  simileDensityMax: 0.04,
});

const FIRST_PERSON_MARKERS = Object.freeze(['나는', '내가', '나의', '나를', '내']);
const ONOMATOPOEIA = Object.freeze([...ONOMATOPOEIA_SOUND, ...ONOMATOPOEIA_MIMETIC].map((entry) => entry.word));

const countAll = (text, terms) => terms.reduce((sum, term) => sum + countOccurrences(text, term), 0);
const countMatches = (text, patterns) => patterns.reduce((sum, re) => sum + (text.match(re)?.length ?? 0), 0);

/** 1인칭 표지와 감정 동사가 함께 있는 문장 수. */
const overtellSentences = (text) => splitSentences(text)
  .filter((s) => FIRST_PERSON_MARKERS.some((m) => s.includes(m)) && EMOTION_VERBS.some((v) => s.includes(v))).length;

/**
 * @param {{ draft?: string }} ctx
 * @param {Partial<typeof SHOW_DONT_TELL_DEFAULTS>} [config]
 */
export function showDontTell(ctx, config = SHOW_DONT_TELL_DEFAULTS) {
  const cfg = withDefaults(SHOW_DONT_TELL_DEFAULTS, config);
  const invalid = invalidNumber(cfg, Object.keys(SHOW_DONT_TELL_DEFAULTS));
  if (invalid) return [invalid];
  const text = draftText(ctx);
  const words = countWords(text);
  if (words === 0) return [];
  const emotions = countAll(text, EMOTION_VERBS);
  const onomatopoeia = countAll(text, ONOMATOPOEIA);
  const similes = countMatches(text, SIMILE_PATTERNS);
  const findings = [];

  if (emotions >= cfg.minEmotions && similes / emotions < cfg.ratioMin) {
    findings.push({
      code: 'SHOW_NOT_TELL_LOW',
      message: `감정을 직접 말하는 동사 ${emotions}번에 비해 직유 표지는 ${similes}번뿐이다(비율 ${(similes / emotions).toFixed(2)} < ${cfg.ratioMin}). 감정을 행동·감각으로 보여 줄 자리를 찾는다`,
    });
  }
  const overtell = overtellSentences(text);
  if (overtell / words > cfg.overtellDensityMax) {
    findings.push({ code: 'EMOTION_OVERTELL', message: `1인칭 화자가 감정을 직접 말하는 문장이 많다(${overtell}문장, 어절 대비 ${percent(overtell / words, 2)})` });
  }
  if (onomatopoeia / words > cfg.onomatopoeiaDensityMax) {
    findings.push({ code: 'ONOMATOPOEIA_OVERUSE', message: `의성어·의태어가 많다(${onomatopoeia}번, 어절 대비 ${percent(onomatopoeia / words, 2)})` });
  }
  const simileDensity = similes / words;
  if (simileDensity < cfg.simileDensityMin) {
    findings.push({ code: 'SIMILE_TOO_SPARSE', message: `직유·은유가 드물다(${similes}번, 어절 대비 ${percent(simileDensity, 3)})` });
  } else if (simileDensity > cfg.simileDensityMax) {
    findings.push({ code: 'SIMILE_OVERUSE', message: `직유·은유가 많다(${similes}번, 어절 대비 ${percent(simileDensity, 2)})` });
  }
  return findings;
}
