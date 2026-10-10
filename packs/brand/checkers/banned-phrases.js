/** 설정 목록에서 빈 값이 아닌 문자열만 NFC 로 받는다. */
const phrasesOf = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.normalize('NFC')) : []);

/** text 속 needle 의 시작 위치 전부. */
function positionsOf(text, needle) {
  const found = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) found.push(at);
  return found;
}

/** 허용 표현(예: 최고경영자)이 덮는 글자 범위. */
const allowedSpans = (text, allow) => allow.flatMap((phrase) => positionsOf(text, phrase).map((start) => [start, start + phrase.length]));

/** 반각(0-9)·전각(０-９) 숫자. */
const DIGIT = /[0-9０-９]/;

/**
 * 금지 표현(brand.banned-phrases). 사용자 검사의 words 와 같은 방식이다: 원고(NFC)에 그 표현이 그대로 있으면 표현마다 한 번 알린다.
 * 목록은 pack.yaml config.words(과장·단정 표현 기본 목록), 허용 표현은 config.allow 다. 허용 표현 안에 든 자리는 세지 않는다.
 * 표현의 첫 글자가 숫자(전각 포함)이면, 바로 앞 글자도 숫자일 때는 세지 않는다(예: `11위` 속의 `1위`).
 * 작품마다 다른 목록은 work.yaml checks.brand.banned-phrases.config(words·allow, 통째로 바꿈)나 사용자 검사(words·pattern)로 준다.
 * 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ draft?: unknown }} ctx
 * @param {{ words?: unknown, allow?: unknown }} [config]
 */
export function bannedPhrases(ctx, config = {}) {
  const draft = typeof ctx?.draft === 'string' ? ctx.draft.normalize('NFC') : '';
  const spans = allowedSpans(draft, phrasesOf(config.allow));
  const findings = [];
  for (const phrase of new Set(phrasesOf(config.words))) {
    const count = positionsOf(draft, phrase)
      .filter((start) => !(DIGIT.test(phrase[0]) && start > 0 && DIGIT.test(draft[start - 1])))
      .filter((start) => !spans.some(([from, to]) => start >= from && start + phrase.length <= to)).length;
    if (count === 0) continue;
    findings.push({ code: 'BANNED_PHRASE', quote: phrase, count, message: `금지 표현 "${phrase}"(${count}번): 근거 없이 쓰면 과장·단정이 된다` });
  }
  return findings;
}
