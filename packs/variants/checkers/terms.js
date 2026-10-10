import { kindOf } from './marks.js';

/**
 * 용어 대응표(variants.terms). 대응 쌍은 판본 폴더 terms.yaml(코어가 ctx.terms 로 넘긴다).
 * - 번역: 원본에 원어(from)가 있는데 판본에 대응어(to)가 없으면 TERM_NOT_USED, 판본에 원어가 남아 있으면 TERM_LEFT.
 * - 개정·요약: 판본에 원어가 있고 대응어가 없으면 TERM_INCONSISTENT(대응표는 to 를 쓰라고 한다).
 * 대응어가 원어를 품으면(예: 마라 → 마라 언니) 원어가 남은 것으로 치지 않는다.
 * @param {{ original?: string, draft?: string, variant?: { kind?: string }, terms?: { from: string, to: string }[] }} ctx
 */
export function termsUsed(ctx) {
  const kind = kindOf(ctx);
  if (!kind || !Array.isArray(ctx.terms)) return [];
  const draft = String(ctx.draft ?? '');
  const findings = [];
  for (const { from, to } of ctx.terms) {
    const left = draft.includes(from) && !to.includes(from);
    if (kind === 'translation') {
      if (ctx.original.includes(from) && !draft.includes(to)) findings.push({ code: 'TERM_NOT_USED', term: from, message: `${from} → ${to}: 판본에 ${to}이(가) 없다` });
      if (left) findings.push({ code: 'TERM_LEFT', term: from, quote: from, message: `${from}이(가) 옮기지 않은 채 남았다(${to})` });
    } else if (left && !draft.includes(to)) {
      findings.push({ code: 'TERM_INCONSISTENT', term: from, quote: from, message: `대응표는 ${from} 대신 ${to}을(를) 쓴다` });
    }
  }
  return findings;
}
