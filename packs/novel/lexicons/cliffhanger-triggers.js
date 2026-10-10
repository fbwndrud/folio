/**
 * 절단신공(회차 끝 당김) 표지 — 마지막 문단에서 찾는 의문문 종결·미완 사건·반전 표지.
 * vibelore engine/src/continuity/cliffhanger-detector.js:16-59 CLIFFHANGER_TRIGGERS 를 그대로 옮김(같은 저자, Apache-2.0).
 * patternSource 는 RegExp 원문이다(검사기가 'm' 플래그로 만든다).
 */
export const CLIFFHANGER_TRIGGERS = Object.freeze([
  // === interrogative endings (의문문 종결) ===
  Object.freeze({ patternSource: '\\?\\s*$', kind: 'interrogative' }),
  Object.freeze({ patternSource: '(?:인가|이었나|일까|었을까|것일까|것인가)[\\.\\?!]?\\s*$', kind: 'interrogative' }),
  Object.freeze({ patternSource: '(?:할까|할까\\?|싶었다\\?)[\\.\\?!]?\\s*$', kind: 'interrogative' }),
  Object.freeze({ patternSource: '뭐였더라[\\.\\?!]?\\s*$', kind: 'interrogative' }),
  Object.freeze({ patternSource: '무엇이었을까[\\.\\?!]?\\s*$', kind: 'interrogative' }),
  Object.freeze({ patternSource: '누구였을까[\\.\\?!]?\\s*$', kind: 'interrogative' }),
  Object.freeze({ patternSource: '어떻게\\s*될까[\\.\\?!]?\\s*$', kind: 'interrogative' }),
  Object.freeze({ patternSource: '어떻게\\s*되는\\s*것일까[\\.\\?!]?\\s*$', kind: 'interrogative' }),
  // === unfinished-event (미완 사건 표지) ===
  Object.freeze({ patternSource: '려는\\s*순간', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '하려던\\s*찰나', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '할\\s*그\\s*때', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '려고\\s*했지만', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '다음\\s*순간', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '그\\s*순간', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '그러나\\s*다음\\s*순간', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '바로\\s*그때', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '그\\s*직후', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '미처\\s*\\S+기도\\s*전에', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '할\\s*사이도\\s*없이', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '채\\s*\\S+하지\\s*못하고', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '다\\s*말고', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '말이\\s*끝나기도\\s*전에', kind: 'unfinished-event' }),
  Object.freeze({ patternSource: '려는\\s*찰나', kind: 'unfinished-event' }),
  // === reversal (반전 trigger) ===
  Object.freeze({ patternSource: '하지만', kind: 'reversal' }),
  Object.freeze({ patternSource: '그러나', kind: 'reversal' }),
  Object.freeze({ patternSource: '그런데', kind: 'reversal' }),
  Object.freeze({ patternSource: '한데', kind: 'reversal' }),
  Object.freeze({ patternSource: '그럼에도\\s*불구하고', kind: 'reversal' }),
  Object.freeze({ patternSource: '다만', kind: 'reversal' }),
  Object.freeze({ patternSource: '반전', kind: 'reversal' }),
  Object.freeze({ patternSource: '예상치\\s*못한', kind: 'reversal' }),
  Object.freeze({ patternSource: '뜻밖에도', kind: 'reversal' }),
  Object.freeze({ patternSource: '뜻밖의', kind: 'reversal' }),
  Object.freeze({ patternSource: '그가\\s*모르는\\s*사이', kind: 'reversal' }),
  Object.freeze({ patternSource: '그러나\\s*그것은\\s*시작에\\s*불과했다', kind: 'reversal' }),
  Object.freeze({ patternSource: '이것이\\s*끝이\\s*아니었다', kind: 'reversal' }),
  Object.freeze({ patternSource: '진짜는\\s*따로\\s*있었다', kind: 'reversal' }),
  Object.freeze({ patternSource: '는\\s*줄도\\s*모르고', kind: 'reversal' }),
  Object.freeze({ patternSource: '알\\s*리가\\s*없었다', kind: 'reversal' }),
]);
