import { definedBeforeUse } from './defined-before-use.js';
import { prerequisiteOrder } from './prerequisite-order.js';
import { termConsistency } from './term-consistency.js';
import { crossRefs } from './cross-refs.js';
import { nodeLinks } from './links.js';

/** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. */
export const KNOWLEDGE_CHECKERS = Object.freeze({
  'defined-before-use': definedBeforeUse, 'prerequisite-order': prerequisiteOrder, 'term-consistency': termConsistency, 'cross-refs': crossRefs, links: nodeLinks,
});
