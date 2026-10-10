import { configInvalid, linesOf, paragraphsOf, proseOf, quoteIn, withQuote } from './text/serial-prose.js';
import { SUPPORTED_QUOTE_RE, rhythmFindings } from './text/serial-webnovel-rhythm.js';

/**
 * 웹소설 모바일 문단 형식(novel.webnovel-format). 모바일 화면에서 읽기 힘든 문단 모양을 알린다.
 * vibelore src/tools/webnovel-format.js:1-170 scanWebnovelFormat 과
 * engine/src/generators/text/chapter-validation.js:422-460 scanBlockingFormat 의 뜻을 옮김.
 * - WEBNOVEL_SOFT_LINEBREAKS: 빈 줄 없는 줄바꿈이 20개 이상이거나 여러 줄 문단이 12개 이상(모든 모드).
 * - WEBNOVEL_DIALOGUE_NOT_ISOLATED(strict): 따옴표 대사가 제 문단에 홀로 있지 않다.
 * - WEBNOVEL_DIALOGUE_BURIED(relaxed): 대사와 100자 넘는 서술이 한 줄에 붙어 있다.
 * - WEBNOVEL_DENSE_PARAGRAPH / LONG_PARAGRAPH_RUN / CHOPPY_BREAKS / FRAGMENTED_RHYTHM: 한국어 호흡 검사(natural 이 아닐 때).
 * - config.dialogueBreakMode: 'strict'(기본) | 'relaxed' | 'natural'(대사 분리·호흡 검사를 하지 않는다).
 * - vibelore 에서는 SOFT_LINEBREAKS·DIALOGUE_* 가 FORMAT 정책으로 커밋을 막았지만 여기서는 모두 참고(advisory)다(의도한 차이).
 *   Folio 소설 팩은 한국어 작품이므로 vibelore 의 한국어 가족(koreanDefault) 규칙을 그대로 쓴다.
 * - 지적에 severity 를 적지 않는다.
 */
export const WEBNOVEL_FORMAT_DEFAULTS = Object.freeze({ dialogueBreakMode: 'strict' });

const MODES = Object.freeze(['strict', 'relaxed', 'natural']);
const QUOTES_RE = /["“][^"”]+["”]|「[^」]+」|『[^』]+』/g;
const UNSUPPORTED_DIALOGUE_RE = /[—–―«»]/;

/**
 * @param {{ draft?: string }} ctx
 * @param {{ dialogueBreakMode?: string }} [config]
 */
export function webnovelFormat(ctx, config = WEBNOVEL_FORMAT_DEFAULTS) {
  const { dialogueBreakMode } = { ...WEBNOVEL_FORMAT_DEFAULTS, ...config };
  if (!MODES.includes(dialogueBreakMode)) {
    return [configInvalid('WEBNOVEL_CONFIG_INVALID', 'dialogueBreakMode', dialogueBreakMode, MODES)];
  }
  const text = proseOf(ctx);
  const paragraphs = paragraphsOf(text);
  const findings = [];
  const softLineBreaks = softLineBreakFinding(paragraphs);
  if (softLineBreaks) findings.push(softLineBreaks);
  if (dialogueBreakMode === 'natural') return findings;
  // natural 이 아니면 한국어 호흡 검사와 대사 분리를 한다. 지적 순서는 vibelore 와 같다.
  const rhythm = rhythmFindings(paragraphs);
  findings.push(...rhythm.density);
  if (!unsupportedDialogueOnly(text)) {
    const dialogue = dialogueFinding(paragraphs, dialogueBreakMode === 'relaxed', ctx.draft);
    if (dialogue) findings.push(dialogue);
  }
  findings.push(...rhythm.breaks);
  return findings;
}

/** 빈 줄 없는 일반 줄바꿈이 문단 안에 너무 많이 남았는가. */
function softLineBreakFinding(paragraphs) {
  const multiLine = paragraphs.filter((paragraph) => linesOf(paragraph).length > 1);
  const breaks = multiLine.reduce((total, paragraph) => total + Math.max(0, linesOf(paragraph).length - 1), 0);
  if (breaks < 20 && multiLine.length < 12) return null;
  return {
    code: 'WEBNOVEL_SOFT_LINEBREAKS',
    message: `빈 줄 없는 일반 줄바꿈 ${breaks}개가 ${multiLine.length}개 문단 안에 남아 있다. 일반 산문 문단 내부는 공백으로 잇고 문단 경계는 빈 줄로 구분한다`,
  };
}

/** 대사 분리. strict 는 따옴표 대사가 홀로 문단이어야 하고, relaxed 는 대사 밖 서술이 100자를 넘으면 걸린다. 여러 줄 문단은 보지 않는다. */
function dialogueFinding(paragraphs, relaxed, draft) {
  const mixed = paragraphs.filter((paragraph) => {
    const lines = linesOf(paragraph);
    if (lines.length !== 1) return false;
    const line = lines[0];
    const quotes = line.match(QUOTES_RE) ?? [];
    if (!quotes.length) return false;
    if (!relaxed) return quotes.length !== 1 || paragraph.trim() !== quotes[0].trim();
    const outside = quotes.reduce((rest, quote) => rest.replace(quote, ''), line).trim();
    return outside.length > 100;
  });
  if (!mixed.length) return null;
  const finding = relaxed
    ? { code: 'WEBNOVEL_DIALOGUE_BURIED', message: `대사와 100자 넘는 서술이 한 줄에 붙은 문단 ${mixed.length}개. 대사를 독립 호흡으로 분리한다` }
    : { code: 'WEBNOVEL_DIALOGUE_NOT_ISOLATED', message: `따옴표 대사가 독립 문단이 아닌 곳 ${mixed.length}개. 각 인용 대사의 앞뒤를 빈 줄로 분리한다` };
  return withQuote(finding, quoteIn(draft, mixed[0]));
}

/** 줄표·겹화살괄호 대사만 있고 따옴표 대사가 없으면 대사 분리 검사를 하지 않는다(따옴표 파서가 읽을 수 없는 관례). */
function unsupportedDialogueOnly(text) {
  return UNSUPPORTED_DIALOGUE_RE.test(text) && !SUPPORTED_QUOTE_RE.test(text);
}
