import { isPlainObject } from '../util/plain.js';

export const USER_SEVERITIES = ['advisory', 'block'];

function patternFindings(draft, words, regex) {
  const findings = [];
  for (const word of words) if (draft.includes(word)) findings.push({ code: 'USER_PATTERN', message: `금지 표현 "${word}"`, quote: word });
  if (regex) for (const match of draft.matchAll(regex)) findings.push({ code: 'USER_PATTERN', message: `패턴 /${regex.source}/`, quote: match[0] });
  return findings;
}

/**
 * work.yaml checks 의 사용자 검사 하나를 검사 정의로 바꾼다.
 * 새 검사는 experimental 이고 기본 심각도는 참고 의견이다(계획서 §12).
 */
export function userCheck(id, spec) {
  if (!isPlainObject(spec)) return { error: { code: 'USER_CHECK_INVALID', checkId: id } };
  const severity = spec.severity ?? 'advisory';
  if (!USER_SEVERITIES.includes(severity)) return { error: { code: 'USER_CHECK_SEVERITY_INVALID', checkId: id, severity } };
  const base = { id, severity, experimental: true, origin: 'user', config: spec };
  if (Array.isArray(spec.words) || typeof spec.pattern === 'string') {
    let regex = null;
    try { regex = spec.pattern ? new RegExp(spec.pattern, 'gu') : null; }
    catch { return { error: { code: 'USER_CHECK_PATTERN_INVALID', checkId: id } }; }
    const words = (spec.words ?? []).filter((word) => typeof word === 'string' && word);
    return { check: { ...base, tier: 'deterministic', stage: spec.stage ?? 'facts', run: (ctx) => patternFindings(ctx.draft ?? '', words, regex) } };
  }
  if (typeof spec.rule === 'string' || typeof spec.source === 'string' || typeof spec.samples === 'string') {
    return {
      check: {
        ...base, tier: 'model', stage: spec.stage ?? 'critic', requireQuote: true,
        instruction: spec.rule ?? null, instructionSource: spec.source ?? null, samplesSource: spec.samples ?? null, samples: null,
      },
    };
  }
  return { error: { code: 'USER_CHECK_INVALID', checkId: id } };
}
