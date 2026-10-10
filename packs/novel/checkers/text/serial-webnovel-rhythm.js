/**
 * 웹소설 모바일 호흡 검사(novel.webnovel-format 의 한국어 호흡 부분). 과밀 문단, 긴 문단 연속, 너무 잘게 끊긴 문단,
 * 조각난 짧은 서술을 센다. vibelore src/tools/webnovel-format.js:80-149 scanWebnovelFormat 의 뜻을 옮김(문턱값 그대로).
 */

/** 따옴표 대사(큰따옴표·겹낫표·낫표). */
export const SUPPORTED_QUOTE_RE = /["“][^"”]+["”]|「[^」]+」|『[^』]+』/s;

/** 문장 끝 표지(마침표류 뒤 닫는 따옴표 허용, 다음이 공백이나 끝). */
const sentenceCount = (text) => (text.match(/[.!?。…](?:["'”’」』])?(?=\s|$)/g) ?? []).length;
const containsDialogue = (paragraph) => SUPPORTED_QUOTE_RE.test(paragraph);
/** [시스템 알림] 【상태창】 처럼 괄호로 감싼 문단. */
const systemNotice = (paragraph) => /^\s*[[【].*[\]】]\s*$/s.test(paragraph);
const fragment = (paragraph) => paragraph.length <= 40 && sentenceCount(paragraph) <= 1;

/**
 * @param {string[]} paragraphs 다듬은 문단들
 * @returns {{ density: object[], breaks: object[] }} density = DENSE_PARAGRAPH·LONG_PARAGRAPH_RUN, breaks = CHOPPY_BREAKS·FRAGMENTED_RHYTHM
 */
export function rhythmFindings(paragraphs) {
  return { density: [denseFinding(paragraphs), longRunFinding(paragraphs)].filter(Boolean),
    breaks: [choppyFinding(paragraphs), fragmentedFinding(paragraphs)].filter(Boolean) };
}

/** 650자 초과, 또는 420자 초과이면서 6문장 이상인 문단. */
function denseFinding(paragraphs) {
  const dense = paragraphs.flatMap((paragraph, index) => {
    const sentences = sentenceCount(paragraph);
    return paragraph.length > 650 || (paragraph.length > 420 && sentences >= 6)
      ? [{ index: index + 1, chars: paragraph.length, sentences }]
      : [];
  });
  if (!dense.length) return null;
  const listed = dense.slice(0, 4).map((item) => `${item.index}번 ${item.chars}자/${item.sentences}문장`).join(', ');
  return { code: 'WEBNOVEL_DENSE_PARAGRAPH', message: `모바일 독서에 과밀한 문단 ${dense.length}개: ${listed}` };
}

/** 300자 이상 문단이 3개 이상 이어진다. */
function longRunFinding(paragraphs) {
  let longest = 0;
  let run = 0;
  for (const paragraph of paragraphs) {
    run = paragraph.length >= 300 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  if (longest < 3) return null;
  return { code: 'WEBNOVEL_LONG_PARAGRAPH_RUN', message: `300자 이상 문단이 ${longest}개 연속되어 모바일 호흡이 막힌다` };
}

/** 문단이 12개 이상이고 그중 18자 이하 문단이 70% 이상. */
function choppyFinding(paragraphs) {
  if (paragraphs.length < 12) return null;
  const veryShort = paragraphs.filter((paragraph) => paragraph.length <= 18).length;
  if (veryShort / paragraphs.length < 0.7) return null;
  return { code: 'WEBNOVEL_CHOPPY_BREAKS', message: `18자 이하 문단이 ${veryShort}/${paragraphs.length}개로 많아 문장이 카드처럼 잘게 끊긴다` };
}

/** 서술 문단 16개 이상, 짧은 서술(40자 이하·1문장 이하) 비율 65% 이상, 6개 이상 연속. 대사·시스템 알림은 연속을 끊는다. */
function fragmentedFinding(paragraphs) {
  let longest = 0;
  let run = 0;
  for (const paragraph of paragraphs) {
    if (containsDialogue(paragraph) || systemNotice(paragraph)) { run = 0; continue; }
    run = fragment(paragraph) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const narrative = paragraphs.filter((paragraph) => !containsDialogue(paragraph) && !systemNotice(paragraph));
  const fragmented = narrative.filter(fragment).length;
  if (narrative.length < 16 || fragmented / narrative.length < 0.65 || longest < 6) return null;
  return {
    code: 'WEBNOVEL_FRAGMENTED_RHYTHM',
    message: `짧은 서술 문단이 ${fragmented}/${narrative.length}개이고 ${longest}개 연속된다. 원인·반응·결과가 한 박자인 곳은 문단을 묶어 호흡을 회복할 수 있다`,
  };
}
