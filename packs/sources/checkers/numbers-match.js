import { claimsOf, numbersIn } from './claims.js';

/**
 * 숫자·연도 대조(sources.numbers-match). 주장 인용의 숫자·연도 가운데 그 주장에 연결된 자료 인용 어디에도 없는 것을 알린다.
 * 한 주장의 연결 전체를 합쳐 본다(자료 둘에 나눠 있으면 인정). 근거 없는 주장은 sources.claim-supported 몫이라 건너뛴다.
 * 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ claims?: unknown }} ctx
 */
export function numbersMatch(ctx) {
  const findings = [];
  for (const claim of claimsOf(ctx)) {
    if (claim.sources.length === 0) continue;
    const backed = new Set(claim.sources.flatMap((link) => numbersIn(link?.quote)));
    const missing = numbersIn(claim.quote).filter((n) => !backed.has(n));
    if (missing.length === 0) continue;
    findings.push({
      code: 'NUMBER_NOT_IN_SOURCE', quote: claim.quote, numbers: missing,
      message: `"${claim.quote}": ${missing.join(', ')}이(가) 연결된 자료 인용에 없다`,
    });
  }
  return findings;
}
