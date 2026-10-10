import { kindOf, markCounts } from './marks.js';

/**
 * 블록 표시 대조(variants.blocks-kept). 원본의 앵커 {#id}·참조 [[block:id]]·각주 [^id]·자료 인용 [[source:id]]를 판본과 견준다.
 * 판본에 모자라면 BLOCK_OMITTED(요약은 줄이는 것이라 보지 않는다), 원본보다 많으면 BLOCK_ADDED. 등급은 pack.yaml(advisory)과 작가 설정이 정한다.
 * @param {{ original?: string, draft?: string, variant?: { kind?: string } }} ctx
 */
export function blocksKept(ctx) {
  const kind = kindOf(ctx);
  if (!kind) return [];
  const before = markCounts(ctx.original);
  const after = markCounts(ctx.draft);
  const findings = [];
  for (const token of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const was = before.get(token) ?? 0;
    const now = after.get(token) ?? 0;
    if (now < was && kind !== 'summary') findings.push({ code: 'BLOCK_OMITTED', mark: token, message: `${token}: 원본 ${was}번, 판본 ${now}번` });
    if (now > was) findings.push({ code: 'BLOCK_ADDED', mark: token, message: `${token}: 원본 ${was}번, 판본 ${now}번` });
  }
  return findings;
}
