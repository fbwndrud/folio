import { SENSITIVE_LEXICON } from '../lexicons/sensitive.js';
import { configInvalid, quoteIn, withQuote } from './text/serial-prose.js';

/**
 * 민감 표현(novel.sensitive). 원고에 민감 표현 사전(욕설·성 표현·폭력 묘사·약물·자해 등)의 어휘가 나오면 범주별 코드로 알린다.
 * vibelore engine/src/continuity/sensitive-lexicon.js:35-76 scanSensitive(SENSITIVE_<CATEGORY>) 의 뜻을 옮김.
 * - config.mode: 'adult'(기본, 성인 기준) | 'youth'(청소년 보호 기준 — 암시적 성 표현까지 본다).
 *   모드별 사전 등급이 'allow' 인 어휘는 건너뛴다(vibelore 와 같다). 나머지는 모두 참고(advisory)다 —
 *   vibelore 의 youth 모드는 hard 등급을 냈지만 여기서는 막지 않는다(의도한 차이, 지적에 severity 를 적지 않는다).
 * - notFollowedBy 문맥 가드: 어휘 바로 뒤(공백 허용)가 제외 접미인 등장만 있으면 세지 않는다("보지 않았다" 등 활용형 오탐 방지).
 * - 코드는 SENSITIVE_ + 범주 대문자(하이픈은 밑줄). 어휘 하나당 지적 하나, 두 글자 이상 어휘는 인용(quote)한다(코어 인용 규칙).
 * - 설정이 잘못되면 SENSITIVE_CONFIG_INVALID 하나만 낸다.
 */
export const SENSITIVE_DEFAULTS = Object.freeze({ mode: 'adult' });

const MODES = Object.freeze(['adult', 'youth']);

/**
 * @param {{ draft?: string }} ctx
 * @param {{ mode?: string }} [config]
 */
export function sensitive(ctx, config = SENSITIVE_DEFAULTS) {
  const { mode } = { ...SENSITIVE_DEFAULTS, ...config };
  if (!MODES.includes(mode)) return [configInvalid('SENSITIVE_CONFIG_INVALID', 'mode', mode, MODES)];
  const prose = typeof ctx?.draft === 'string' ? ctx.draft : '';
  if (prose.length === 0) return [];

  const findings = [];
  for (const entry of SENSITIVE_LEXICON) {
    if (!prose.includes(entry.term)) continue;
    if (entry.notFollowedBy && !hasUnguardedOccurrence(prose, entry.term, entry.notFollowedBy)) continue;
    const grade = mode === 'youth' ? entry.youthSeverity : entry.adultSeverity;
    if (grade === 'allow') continue;
    findings.push(withQuote({
      code: `SENSITIVE_${entry.category.toUpperCase().replace(/-/g, '_')}`,
      message: `민감 표현 "${entry.term}"(${entry.category}) — ${mode === 'youth' ? '청소년' : '성인'} 기준. 연재처 기준에 맞는지 살핀다`,
    }, quoteIn(prose, entry.term)));
  }
  return findings;
}

/** 어휘 등장 중 바로 뒤(공백 허용)가 제외 접미가 아닌 등장이 하나라도 있는가. */
function hasUnguardedOccurrence(prose, term, notFollowedBy) {
  for (let at = prose.indexOf(term); at !== -1; at = prose.indexOf(term, at + term.length)) {
    const rest = prose.slice(at + term.length).replace(/^\s+/, '');
    if (!notFollowedBy.some((suffix) => rest.startsWith(suffix))) return true;
  }
  return false;
}
