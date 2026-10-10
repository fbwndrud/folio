/**
 * 발화 동사 단조(novel.dialogue-tags). 원고의 발화 동사(말했다·외쳤다·속삭였다…)를 세어 "말했다"가
 * 전체의 monotonyRatio 를 넘으면 DIALOGUE_TAG_MONOTONY 로 알린다. 발화 동사가 minTags 번보다 적으면 보지 않는다.
 * vibelore engine/src/continuity/dialogue-marker-variety.js(scanDialogueMarkerVariety) 의 뜻을 옮김. 한국어 전용.
 * - 셈은 동사마다 부분 문자열(겹치지 않게)이다. "거듭 말했다"·"꼬집어 말했다"는 그 동사와 "말했다" 둘 다에 세진다 — vibelore 와 같다.
 */
import { countOccurrences, draftText, invalidNumber, percent, withDefaults } from './text/style-prose.js';

/** 과거형 서술의 발화 동사(vibelore KO_SPEECH_TAGS 그대로). */
export const SPEECH_TAGS = Object.freeze([
  '말했다', '대답했다', '답했다', '물었다', '되물었다', '외쳤다', '소리쳤다',
  '속삭였다', '중얼거렸다', '읊조렸다', '내뱉었다', '뱉었다', '쏘아붙였다',
  '쏘아댔다', '받아쳤다', '되받아쳤다', '되받았다', '비웃었다', '웃었다',
  '비아냥거렸다', '으르렁거렸다', '으름장을 놓았다', '협박했다', '경고했다',
  '타일렀다', '달랬다', '꾸짖었다', '나무랐다', '꾸중했다', '호통쳤다',
  '신음했다', '한탄했다', '탄식했다', '한숨지었다',
  '울먹였다', '흐느꼈다', '훌쩍였다', '울었다', '웅얼거렸다', '얼버무렸다',
  '말끝을 흐렸다', '입을 열었다', '입을 다물었다', '말꼬리를 잡았다',
  '말을 잘랐다', '말을 끊었다', '말을 이었다', '덧붙였다', '거듭 말했다',
  '단언했다', '주장했다', '강조했다', '인정했다', '시인했다', '부정했다',
  '항변했다', '변명했다', '사과했다', '용서를 빌었다', '간청했다', '애원했다',
  '명령했다', '지시했다', '권유했다', '제안했다', '청했다', '부탁했다',
  '맞장구쳤다', '맞받았다', '응수했다', '대꾸했다', '응대했다', '읊었다',
  '내질렀다', '뇌까렸다', '뇌었다', '꼬집어 말했다',
]);

export const DIALOGUE_TAGS_DEFAULTS = Object.freeze({ monotonyRatio: 0.8, minTags: 5 });

const SAID = '말했다';

/**
 * @param {{ draft?: string }} ctx
 * @param {Partial<typeof DIALOGUE_TAGS_DEFAULTS>} [config]
 */
export function dialogueTags(ctx, config = DIALOGUE_TAGS_DEFAULTS) {
  const cfg = withDefaults(DIALOGUE_TAGS_DEFAULTS, config);
  const invalid = invalidNumber(cfg, ['monotonyRatio', 'minTags']);
  if (invalid) return [invalid];
  const text = draftText(ctx);
  let total = 0;
  let said = 0;
  for (const tag of SPEECH_TAGS) {
    const count = countOccurrences(text, tag);
    total += count;
    if (tag === SAID) said += count;
  }
  if (total === 0 || total < cfg.minTags) return [];
  const ratio = said / total;
  if (ratio <= cfg.monotonyRatio) return [];
  return [{
    code: 'DIALOGUE_TAG_MONOTONY', quote: SAID,
    message: `발화 동사가 "말했다"에 몰렸다: ${said}/${total}(${percent(ratio)}) > ${percent(cfg.monotonyRatio)}. 외쳤다·속삭였다·중얼거렸다처럼 바꾸거나 동사 없이 대사만 둔다`,
  }];
}
