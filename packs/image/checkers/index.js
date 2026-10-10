import { assetRefs } from './asset-refs.js';
import { dialogueInText } from './dialogue-in-text.js';
import { entitiesInNode } from './entities-in-node.js';
import { referencesPresent } from './references-present.js';
import { showConflict } from './show-conflict.js';

/** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. */
export const IMAGE_CHECKERS = Object.freeze({
  'asset-refs': assetRefs, 'dialogue-in-text': dialogueInText, 'entities-in-node': entitiesInNode,
  'references-present': referencesPresent, 'show-conflict': showConflict,
});
