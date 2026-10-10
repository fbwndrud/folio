import { numbersIn } from '../../sources/checkers/claims.js';
import { kindOf, withoutMarks } from './marks.js';

/**
 * 숫자 대조(variants.numbers-kept). 숫자 읽기는 sources 팩과 같다(아라비아 숫자, 천 단위 쉼표, 1.50 = 1.5). 블록 표시 속 숫자는 세지 않는다.
 * 원본의 숫자가 판본에 없으면 NUMBER_OMITTED(요약은 보지 않는다), 원본에 없는 숫자가 판본에 있으면 NUMBER_ADDED.
 * @param {{ original?: string, draft?: string, variant?: { kind?: string } }} ctx
 */
export function numbersKept(ctx) {
  const kind = kindOf(ctx);
  if (!kind) return [];
  const before = numbersIn(withoutMarks(ctx.original));
  const after = numbersIn(withoutMarks(ctx.draft));
  const findings = [];
  const omitted = kind === 'summary' ? [] : before.filter((n) => !after.includes(n));
  const added = after.filter((n) => !before.includes(n));
  if (omitted.length) findings.push({ code: 'NUMBER_OMITTED', numbers: omitted, message: `원본의 ${omitted.join(', ')}이(가) 판본에 없다` });
  if (added.length) findings.push({ code: 'NUMBER_ADDED', numbers: added, message: `${added.join(', ')}은(는) 원본에 없는 숫자다` });
  return findings;
}
