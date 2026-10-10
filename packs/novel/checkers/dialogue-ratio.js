/**
 * 대사 비율(novel.dialogue-ratio). 빈 줄 아닌 줄 가운데 대사 줄(내용의 절반 이상이 짝 맞은 따옴표 안)의 비율이
 * 허용 범위 [min, max] 밖이면 DIALOGUE_RATIO_OFF 로 알린다. 줄이 minLines 개보다 적으면 보지 않는다.
 * vibelore engine/src/continuity/dialogue-ratio.js(scanDialogueRatio) 와 genre-profile.js(DIALOGUE_RATIO_RANGE) 의 뜻을 옮김.
 * - 범위: config.range 가 있으면 그것, 없고 genre 가 있으면 장르 표, 둘 다 없으면 'other' 장르 범위 [0.15, 0.5]
 *   (vibelore 가 장르를 모를 때 쓰는 기본 장르가 other 다 — src/tools/story-profile.js).
 * - 따옴표(" “” ' 「」 『』)로 판단하므로 언어를 가리지 않는다. 장르 표의 값은 한국 웹소설 기준이다.
 * - 모르는 장르나 잘못된 범위는 CONFIG_INVALID 하나로 알리고 멈춘다.
 */
import { configInvalid, draftText, invalidNumber, percent, withDefaults } from './text/style-prose.js';

/** 장르별 대사 비율 범위(vibelore DIALOGUE_RATIO_RANGE 그대로). */
export const DIALOGUE_RATIO_RANGES = Object.freeze({
  'streaming-litrpg': [0.15, 0.45], 'regression-hunter': [0.2, 0.45], 'villainess-isekai': [0.3, 0.55],
  'academy-fantasy': [0.25, 0.5], 'noble-clan-regression': [0.2, 0.45], 'banishment-revenge': [0.15, 0.4],
  'mystery-thriller': [0.2, 0.5], action: [0.1, 0.35], comedy: [0.35, 0.65], historical: [0.15, 0.4],
  litrpg: [0.15, 0.4], progression: [0.15, 0.4], 'system-apocalypse': [0.15, 0.4], 'tower-climber': [0.15, 0.4],
  isekai: [0.2, 0.5], cultivation: [0.1, 0.35], xianxia: [0.1, 0.35], xuanhuan: [0.1, 0.35],
  'dungeon-core': [0.1, 0.35], romantasy: [0.3, 0.6], 'sci-fi': [0.2, 0.45], horror: [0.1, 0.35],
  cozy: [0.3, 0.55], urban: [0.2, 0.5], other: [0.15, 0.5],
});

export const DIALOGUE_RATIO_DEFAULTS = Object.freeze({ genre: null, range: null, minLines: 6 });

const FALLBACK_GENRE = 'other';
const QUOTE_PAIRS = [['"', '"'], ['“', '”'], ["'", "'"], ['「', '」'], ['『', '』']];

/** 줄에서 짝 맞은 따옴표 안(따옴표 포함) 글자 수. 같은 글자 짝은 번갈아, 다른 글자 짝은 깊이로 본다. */
function quotedChars(line) {
  let inside = 0;
  for (const [open, close] of QUOTE_PAIRS) {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === open && (open !== close || depth === 0)) {
        if (depth === 0) start = i;
        depth++;
      } else if (line[i] === close && depth > 0) {
        depth--;
        if (depth === 0) inside += i - start + 1;
      }
    }
  }
  return inside;
}

const isDialogueLine = (line) => quotedChars(line) / line.length >= 0.5;

const validRange = (range) => Array.isArray(range) && range.length === 2
  && range.every((n) => typeof n === 'number' && Number.isFinite(n)) && 0 <= range[0] && range[0] <= range[1] && range[1] <= 1;

/** 설정에서 범위를 고른다. 잘못된 설정이면 { error }. */
function rangeFor({ genre, range }) {
  if (range !== null && range !== undefined) {
    return validRange(range) ? { range } : { error: configInvalid('range', range, '0 이상 1 이하의 [하한, 상한] 두 수로 정한다') };
  }
  if (genre === null || genre === undefined) return { range: DIALOGUE_RATIO_RANGES[FALLBACK_GENRE] };
  if (typeof genre === 'string' && Object.hasOwn(DIALOGUE_RATIO_RANGES, genre)) return { range: DIALOGUE_RATIO_RANGES[genre] };
  return { error: configInvalid('genre', genre, `null 또는 ${Object.keys(DIALOGUE_RATIO_RANGES).join(' | ')} 중 하나로 정한다`) };
}

/**
 * @param {{ draft?: string }} ctx
 * @param {Partial<{ genre: string | null, range: [number, number] | null, minLines: number }>} [config]
 */
export function dialogueRatio(ctx, config = DIALOGUE_RATIO_DEFAULTS) {
  const cfg = withDefaults(DIALOGUE_RATIO_DEFAULTS, config);
  const { range, error } = rangeFor(cfg);
  if (error) return [error];
  const invalid = invalidNumber(cfg, ['minLines']);
  if (invalid) return [invalid];
  const lines = draftText(ctx).split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0 || lines.length < cfg.minLines) return [];
  const dialogue = lines.filter(isDialogueLine).length;
  const ratio = dialogue / lines.length;
  const [min, max] = range;
  const tail = `줄 ${lines.length}개 중 대사 ${dialogue}줄, 범위 ${percent(min)}~${percent(max)}`;
  if (ratio < min) return [{ code: 'DIALOGUE_RATIO_OFF', message: `대사 비율 ${percent(ratio)}이(가) 하한 ${percent(min)}보다 낮다(${tail})` }];
  if (ratio > max) return [{ code: 'DIALOGUE_RATIO_OFF', message: `대사 비율 ${percent(ratio)}이(가) 상한 ${percent(max)}보다 높다(${tail})` }];
  return [];
}
