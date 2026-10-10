import { claimsOf, reliabilityOf, sourceIdsOf } from './claims.js';

/**
 * 자료 신뢰도(sources.reliability). 연결된 자료가 모두 신뢰도 낮음(reliability: low)인 주장을 알린다.
 * 신뢰도를 적지 않았거나 다른 값인 자료가 하나라도 있으면 알리지 않는다. 근거 없는 주장은 sources.claim-supported 몫이다.
 * 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ claims?: unknown, work?: any }} ctx
 */
export function lowReliability(ctx) {
  const findings = [];
  for (const claim of claimsOf(ctx)) {
    const ids = sourceIdsOf(claim);
    if (ids.length === 0 || !ids.every((id) => reliabilityOf(ctx, id) === 'low')) continue;
    findings.push({
      code: 'LOW_RELIABILITY_ONLY', quote: claim.quote, sources: ids,
      message: `"${claim.quote}": 신뢰도 낮은(low) 자료(${ids.join(', ')})에만 기댄 주장이다`,
    });
  }
  return findings;
}
