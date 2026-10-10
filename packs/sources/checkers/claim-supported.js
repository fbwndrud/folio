import { claimsOf } from './claims.js';

/**
 * 근거 있는 주장(sources.claim-supported). 추출된 주장 가운데 확인된 근거(지금 자료에 인용이 있는 연결)가 하나도 없는 것을 알린다.
 * 주장으로 표시하지 않은 문장(추출 답이 빼먹은 주장)은 모델 검사 sources.claims-found 가 본다.
 * 등급은 pack.yaml(advisory)과 작가 설정(severityOverride)이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ claims?: unknown }} ctx
 */
export function claimSupported(ctx) {
  return claimsOf(ctx).filter((claim) => claim.sources.length === 0).map((claim) => ({
    code: 'CLAIM_UNSUPPORTED', quote: claim.quote, message: `"${claim.quote}": 확인된 근거(자료 인용)가 없는 주장이다`,
  }));
}
