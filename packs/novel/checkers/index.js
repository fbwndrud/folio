import { deadOnStage } from './dead-on-stage.js';
import { destroyedObject } from './destroyed-object.js';
import { honorificGender } from './honorific-gender.js';
import { metadataLeak } from './metadata-leak.js';
import { promiseEvidence } from './promise-evidence.js';
import { promiseFlow } from './promise-flow.js';
import { promiseDormant } from './promise-dormant.js';
import { cliffhanger } from './cliffhanger.js';
import { timeSkip } from './time-skip.js';
import { lengthShort } from './length.js';
import { infoRestate } from './info-restate.js';
import { sensitive } from './sensitive.js';
import { webnovelFormat } from './webnovel-format.js';
import { sentenceRhythm } from './sentence-rhythm.js';
import { prosody } from './prosody.js';
import { showDontTell } from './show-dont-tell.js';
import { cliche } from './cliche.js';
import { dialogueTags } from './dialogue-tags.js';
import { dialogueRatio } from './dialogue-ratio.js';
import { pov } from './pov.js';
import { styleDrift } from './style-drift.js';

/** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. 끝에만 추가한다. */
export const NOVEL_CHECKERS = Object.freeze({
  'dead-on-stage': deadOnStage,
  'destroyed-object': destroyedObject,
  'honorific-gender': honorificGender,
  'metadata-leak': metadataLeak,
  'promise-evidence': promiseEvidence,
  'promise-flow': promiseFlow,
  'promise-dormant': promiseDormant,
  'cliffhanger': cliffhanger,
  'time-skip': timeSkip,
  'length': lengthShort,
  'info-restate': infoRestate,
  'sensitive': sensitive,
  'webnovel-format': webnovelFormat,
  'sentence-rhythm': sentenceRhythm,
  'prosody': prosody,
  'show-dont-tell': showDontTell,
  'cliche': cliche,
  'dialogue-tags': dialogueTags,
  'dialogue-ratio': dialogueRatio,
  'pov': pov,
  'style-drift': styleDrift,
});
