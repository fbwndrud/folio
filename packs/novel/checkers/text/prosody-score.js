/**
 * 운율 점수(0~100) — 네 축의 평균. 형태소 분석 없이 휴리스틱으로 잰다(한국어 전용).
 *   1. 문장 길이 분산(변동계수 CV/0.6)       2. 종결어미 다양성(Simpson, 한국어 천장 0.30)
 *   3. 같은 어미 연속 벌점(0.75 이하 만점, 0.95 이상 0점)   4. 체언/용언 균형(0.5 에 가까울수록 100)
 * vibelore engine/src/continuity/prosody-scan.js(runProsodyScan) 의 뜻을 옮김. 눈금 상수는 한국어 재캘리브레이션(#253) 값 그대로다.
 */
import { splitSentences } from './style-prose.js';

const KOREAN_CLUSTER_RATIO_FLOOR = 0.75;
const KOREAN_CLUSTER_RATIO_CEILING = 0.95;
const KOREAN_SIMPSON_CEILING = 0.3;
const KNOWN_ENDINGS = ['습니다', '니다', '어요', '아요', '해요', '에요', '예요', '네요', '지요'];

/** 문장 끝 종결어미 — 따옴표·부호를 떼고 알려진 여러 음절 어미가 있으면 그것, 아니면 마지막 한 글자. */
function endingOf(sentence) {
  let end = sentence.length;
  while (end > 0 && /["'.!?…。\s]/u.test(sentence[end - 1])) end--;
  const stripped = sentence.slice(0, end);
  if (stripped.length === 0) return '∅';
  return KNOWN_ENDINGS.find((k) => stripped.endsWith(k)) ?? stripped.slice(-1);
}

function lengthVarianceScore(sentences) {
  if (sentences.length < 2) return 0;
  const lengths = sentences.map((s) => s.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 0;
  const stddev = Math.sqrt(lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / lengths.length);
  return Math.min(100, Math.round((stddev / mean / 0.6) * 100));
}

function endingDiversityScore(endings) {
  if (endings.length === 0) return 0;
  const counts = new Map();
  for (const e of endings) counts.set(e, (counts.get(e) ?? 0) + 1);
  let sumSq = 0;
  for (const c of counts.values()) sumSq += (c / endings.length) ** 2;
  return Math.round(Math.min(100, ((1 - sumSq) / KOREAN_SIMPSON_CEILING) * 100));
}

function endingClusterScore(endings) {
  if (endings.length < 2) return 100;
  let runs = 0;
  for (let i = 1; i < endings.length; i++) if (endings[i] === endings[i - 1]) runs++;
  const ratio = runs / (endings.length - 1);
  if (ratio <= KOREAN_CLUSTER_RATIO_FLOOR) return 100;
  if (ratio >= KOREAN_CLUSTER_RATIO_CEILING) return 0;
  const span = KOREAN_CLUSTER_RATIO_CEILING - KOREAN_CLUSTER_RATIO_FLOOR;
  return Math.round(((KOREAN_CLUSTER_RATIO_CEILING - ratio) / span) * 100);
}

/** 한글 어절마다 둘째 글자 이후에 조사 흔적(은는이가을를의도만)·용언 흔적(다어해았었겠)이 있는지 센다. */
function nounVerbBalanceScore(text) {
  if (text.length < 50) return 50;
  let nouns = 0;
  let verbs = 0;
  for (const [word] of text.matchAll(/[가-힣]+/gu)) {
    const suffix = word.slice(1);
    if (/[은는이가을를의도만]/u.test(suffix)) nouns++;
    if (/[다어해았었겠]/u.test(suffix)) verbs++;
  }
  if (nouns + verbs === 0) return 50;
  return Math.round(Math.max(0, 100 - Math.abs(nouns / (nouns + verbs) - 0.5) * 200));
}

/**
 * @param {string} text
 * @returns {{ score: number, breakdown: { sentenceLengthVariance: number, endingDiversity: number, endingClusterPenalty: number, nounVerbBalance: number } }}
 */
export function prosodyScore(text) {
  const sentences = splitSentences(text);
  const endings = sentences.map(endingOf);
  const breakdown = {
    sentenceLengthVariance: lengthVarianceScore(sentences),
    endingDiversity: endingDiversityScore(endings),
    endingClusterPenalty: endingClusterScore(endings),
    nounVerbBalance: nounVerbBalanceScore(text),
  };
  const sum = breakdown.sentenceLengthVariance + breakdown.endingDiversity + breakdown.endingClusterPenalty + breakdown.nounVerbBalance;
  return { score: Math.round(sum / 4), breakdown };
}
