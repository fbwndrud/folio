import { blocksKept } from './blocks-kept.js';
import { numbersKept } from './numbers-kept.js';
import { paragraphCount } from './paragraphs.js';
import { termsUsed } from './terms.js';

/** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. */
export const VARIANTS_CHECKERS = Object.freeze({
  'blocks-kept': blocksKept, 'numbers-kept': numbersKept, paragraphs: paragraphCount, terms: termsUsed,
});
