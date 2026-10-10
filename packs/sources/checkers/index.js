import { claimSupported } from './claim-supported.js';
import { numbersMatch } from './numbers-match.js';
import { lowReliability } from './low-reliability.js';

/** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. */
export const SOURCES_CHECKERS = Object.freeze({
  'claim-supported': claimSupported, 'numbers-match': numbersMatch, 'low-reliability': lowReliability,
});
