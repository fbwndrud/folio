import { TIME_SKIP_MARKERS } from '../lexicons/time-skip-markers.js';
import { proseOf } from './text/serial-prose.js';

/**
 * 시간 도약 없음(novel.time-skip). 원고 어디에도 시간 도약 표지("다음 날", "며칠 후", "어느덧" 등)가 없으면 알린다.
 * 한 회차가 한 호흡으로 늘어졌을 수 있다는 참고 신호다.
 * vibelore engine/src/continuity/gap-skip-detector.js:61-84 detectGapSkip(NO_TIME_SKIP) 의 뜻을 옮김.
 * - 표지는 마지막 문단만이 아니라 원고 전체에서 찾는다(vibelore 와 같다).
 * - 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다. 설정은 없다.
 * @param {{ draft?: string }} ctx
 */
export function timeSkip(ctx) {
  const prose = proseOf(ctx);
  if (prose.trim().length === 0) return [];
  if (TIME_SKIP_MARKERS.some((marker) => new RegExp(marker.patternSource).test(prose))) return [];
  return [{
    code: 'NO_TIME_SKIP',
    message: '시간 도약 표지("다음 날", "며칠 후", "어느덧" 등)가 하나도 없다. 회차가 한 호흡으로 늘어졌는지 살핀다',
  }];
}
