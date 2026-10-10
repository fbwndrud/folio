import { bannedPhrases } from './banned-phrases.js';
import { figureUnits } from './figure-units.js';

/** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. */
export const BRAND_CHECKERS = Object.freeze({
  'banned-phrases': bannedPhrases, 'figure-units': figureUnits,
});
