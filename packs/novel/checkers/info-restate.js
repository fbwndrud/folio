/**
 * 설정 되풀이(novel.info-restate). 세계 설정 사실(엔티티 data.facts)에서 뽑은 명사구가 한 원고에 3번 이상 나오면 알린다.
 * 같은 설정을 독자에게 거듭 설명하고 있을 수 있다는 참고 신호다.
 * vibelore engine/src/continuity/info-restate-detector.js:15-81 scanInfoRestate(INFO_RESTATED) 의 뜻을 옮김.
 * - 명사구 뽑기는 형태소 분석 없이 거칠다: 공백·문장부호로 나눈 토큰의 끝 조사를 떼고, 불용어를 버린 뒤,
 *   이어진 토큰 1~4개를 붙여 4자 이상인 것을 쓴다(vibelore 와 같다).
 * - vibelore 의 Foundation.worldFacts[].statement 대신 작품 모든 엔티티의 data.facts(문자열 배열)를 쓴다.
 *   지적에는 그 명사구를 처음 낸 엔티티의 id 를 붙이고, 명사구를 인용(quote)한다(원고에 그대로 있다).
 * - 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다. 설정은 없다.
 */
const RESTATE_THRESHOLD = 3;
const PHRASE_MIN_LENGTH = 4;
const PHRASE_MAX_TOKENS = 4;
const KO_STOPWORDS = new Set([
  '이', '그', '저', '것', '수', '등', '및', '의', '를', '을', '에', '에서',
  '와', '과', '도', '는', '은', '이다', '있다', '되다', '하다', '한', '한다',
  '그리고', '하지만', '그러나', '또한', '또', '뿐', '만', '까지', '부터',
]);
const KO_PARTICLES = /(은|는|이|가|을|를|에|에서|와|과|로|으로|도|만|부터|까지|의|에게|께|한테|이여|이라|이라고)$/;
const TOKEN_SPLIT = /[\s,.!?;:()[\]{}「」『』"']+/;

/**
 * @param {{ draft?: string, work?: { entities?: Map<string, any> } }} ctx
 */
export function infoRestate(ctx) {
  const prose = typeof ctx?.draft === 'string' ? ctx.draft : '';
  if (prose.length === 0) return [];
  const phrases = phrasesOf([...(ctx.work?.entities?.values() ?? [])]);
  const findings = [];
  for (const [phrase, entityId] of phrases) {
    const count = countOccurrences(prose, phrase);
    if (count < RESTATE_THRESHOLD) continue;
    findings.push({
      code: 'INFO_RESTATED', entityId, quote: phrase,
      message: `설정 명사구 "${phrase}"이(가) ${count}번 나온다(${RESTATE_THRESHOLD}번 이상). 같은 설정을 거듭 설명하는지 살핀다`,
    });
  }
  return findings;
}

/** 엔티티들의 data.facts 에서 뽑은 명사구 → 처음 낸 엔티티 id. 문자열이 아닌 사실은 건너뛴다. */
function phrasesOf(entities) {
  const out = new Map();
  for (const entity of entities) {
    const facts = Array.isArray(entity?.data?.facts) ? entity.data.facts : [];
    for (const fact of facts) {
      if (typeof fact !== 'string' || !fact) continue;
      for (const phrase of extractPhrases(fact)) if (!out.has(phrase)) out.set(phrase, entity.id);
    }
  }
  return out;
}

/** 한 문장에서 1~4 토큰 n-gram 중 PHRASE_MIN_LENGTH 자 이상인 것. */
function extractPhrases(statement) {
  const tokens = statement.split(TOKEN_SPLIT)
    .map((token) => token.replace(KO_PARTICLES, ''))
    .filter((token) => token.length > 0 && !KO_STOPWORDS.has(token));
  const out = [];
  for (let n = 1; n <= PHRASE_MAX_TOKENS && n <= tokens.length; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const slice = tokens.slice(i, i + n).join(' ');
      if (slice.length >= PHRASE_MIN_LENGTH) out.push(slice);
    }
  }
  return out;
}

/** 겹치지 않게 앞에서부터 센 등장 횟수. */
function countOccurrences(prose, term) {
  let count = 0;
  for (let at = prose.indexOf(term); at !== -1; at = prose.indexOf(term, at + term.length)) count++;
  return count;
}
