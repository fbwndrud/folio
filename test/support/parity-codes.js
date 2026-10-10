/**
 * 판정 비교(M5 D10 A)의 코드 대응표. 원래 엔진의 코드 → Folio 검사 id·코드.
 * - code: 원래 엔진이 이 코드를 hard 로 냈을 때 Folio 가 내야 하는 코드(hard 비교에 쓴다).
 * - alt: 같은 뜻으로 인정하는 다른 Folio 코드(soft 비교에서만 쓴다). 예: 한 코드가 Folio 에서 둘로 갈라진 경우.
 * - entity: false 면 Folio 지적에 entityId 가 없다(모델 검사 지적은 checkId·code·quote 만 남는다). hard 비교에서 entityId 를 null 로 본다.
 * 원래 엔진이 한 코드를 두 출처로 내면(INTRINSIC_VIOLATION) 생성 스크립트가 `코드:출처` 로 갈라 적는다.
 * 이 파일에는 원래 엔진의 이름을 적지 않는다(격리 테스트가 본다).
 */
const to = (checkId, code, alt = [], entity = true) => Object.freeze({ checkId, code, alt: Object.freeze(alt), entity });
const also = (checkId, code) => Object.freeze({ checkId, code });

export const PARITY_CODES = Object.freeze({
  // 사실(잠금 hard 는 dead-on-stage·fixed-facts 뿐)
  DEAD_CHARACTER_ON_STAGE: to('novel.dead-on-stage', 'DEAD_ON_STAGE'),
  'INTRINSIC_VIOLATION:llm': to('novel.fixed-facts', 'FIXED_FACT_CONFLICT', [], false),
  GENDER_HONORIFIC_MISMATCH: to('novel.honorific-gender', 'HONORIFIC_GENDER_MISMATCH', [also('novel.honorific-gender', 'HONORIFIC_GENDER_SUSPECT')]),
  CAST_MANIFEST_MISMATCH: to('novel.honorific-gender', 'HONORIFIC_GENDER_SUSPECT'),
  LEDGER_UPDATE_AFTER_DESTROY: to('novel.destroyed-object', 'DESTROYED_UPDATED'),
  LEDGER_RESTORE_NOTE_REQUIRED: to('novel.destroyed-object', 'RESTORE_NOTE_MISSING'),
  DESTROYED_ENTITY_MENTION: to('novel.destroyed-object', 'DESTROYED_MENTIONED', [also('novel.destroyed-object', 'DESTROYED_ON_STAGE')]),
  LEDGER_INVALID_STATUS: to('novel.destroyed-object', 'EXISTS_UNKNOWN'),
  METADATA_LEAK: to('novel.metadata-leak', 'METADATA_LEAK'),
  // 약속
  HOOK_PAID_WITHOUT_EVIDENCE: to('novel.promise-evidence', 'PROMISE_RESOLVED_WITHOUT_EVIDENCE'),
  LEDGER_CLOSED_HOOK_EVENT: to('novel.promise-flow', 'PROMISE_EVENT_AFTER_CLOSE', [also('core.promise-order', 'PROMISE_RESOLVED_AFTER_CLOSE')]),
  LEDGER_UNKNOWN_ID: to('novel.promise-flow', 'PROMISE_MENTIONED_BEFORE_PLANT', [
    also('core.promise-order', 'PROMISE_RESOLVED_BEFORE_PLANT'), also('core.promise-order', 'PROMISE_MOVED_BEFORE_PLANT'),
  ]),
  HOOK_STALE: to('novel.promise-dormant', 'PROMISE_DORMANT'),
  // 연재
  CLIFFHANGER_MISSING: to('novel.cliffhanger', 'CLIFFHANGER_MISSING'),
  NO_TIME_SKIP: to('novel.time-skip', 'NO_TIME_SKIP'),
  WEBNOVEL_SOFT_LINEBREAKS: to('novel.webnovel-format', 'WEBNOVEL_SOFT_LINEBREAKS'),
  WEBNOVEL_DENSE_PARAGRAPH: to('novel.webnovel-format', 'WEBNOVEL_DENSE_PARAGRAPH'),
  WEBNOVEL_LONG_PARAGRAPH_RUN: to('novel.webnovel-format', 'WEBNOVEL_LONG_PARAGRAPH_RUN'),
  WEBNOVEL_DIALOGUE_NOT_ISOLATED: to('novel.webnovel-format', 'WEBNOVEL_DIALOGUE_NOT_ISOLATED'),
  WEBNOVEL_DIALOGUE_BURIED: to('novel.webnovel-format', 'WEBNOVEL_DIALOGUE_BURIED'),
  WEBNOVEL_CHOPPY_BREAKS: to('novel.webnovel-format', 'WEBNOVEL_CHOPPY_BREAKS'),
  WEBNOVEL_FRAGMENTED_RHYTHM: to('novel.webnovel-format', 'WEBNOVEL_FRAGMENTED_RHYTHM'),
  QUALITY_GATE_LENGTH: to('novel.length', 'LENGTH_SHORT'),
  INFO_RESTATED: to('novel.info-restate', 'INFO_RESTATED'),
  SENSITIVE_PROFANITY: to('novel.sensitive', 'SENSITIVE_PROFANITY'),
  SENSITIVE_SEXUAL_EXPLICIT: to('novel.sensitive', 'SENSITIVE_SEXUAL_EXPLICIT'),
  SENSITIVE_SEXUAL_SUGGESTIVE: to('novel.sensitive', 'SENSITIVE_SEXUAL_SUGGESTIVE'),
  SENSITIVE_VIOLENCE_GRAPHIC: to('novel.sensitive', 'SENSITIVE_VIOLENCE_GRAPHIC'),
  SENSITIVE_DRUG_SUBSTANCE: to('novel.sensitive', 'SENSITIVE_DRUG_SUBSTANCE'),
  SENSITIVE_SELF_HARM: to('novel.sensitive', 'SENSITIVE_SELF_HARM'),
  // 문체
  SENTENCE_MONOTONY: to('novel.sentence-rhythm', 'SENTENCE_MONOTONY'),
  SENTENCE_CHAOS: to('novel.sentence-rhythm', 'SENTENCE_CHAOS'),
  QUALITY_GATE_PROSODY: to('novel.prosody', 'PROSODY_LOW'),
  SHOW_NOT_TELL_LOW: to('novel.show-dont-tell', 'SHOW_NOT_TELL_LOW'),
  EMOTION_OVERTELL: to('novel.show-dont-tell', 'EMOTION_OVERTELL'),
  ONOMATOPOEIA_OVERUSE: to('novel.show-dont-tell', 'ONOMATOPOEIA_OVERUSE'),
  SIMILE_TOO_SPARSE: to('novel.show-dont-tell', 'SIMILE_TOO_SPARSE'),
  SIMILE_OVERUSE: to('novel.show-dont-tell', 'SIMILE_OVERUSE'),
  LEXICAL_FATIGUE: to('novel.cliche', 'LEXICAL_FATIGUE'),
  CLICHE_DENSITY: to('novel.cliche', 'CLICHE_DENSITY'),
  DIALOGUE_TAG_MONOTONY: to('novel.dialogue-tags', 'DIALOGUE_TAG_MONOTONY'),
  DIALOGUE_RATIO_OFF: to('novel.dialogue-ratio', 'DIALOGUE_RATIO_OFF'),
  POV_VIOLATION: to('novel.pov', 'POV_VIOLATION'),
  STYLE_ANCHOR_DRIFT: to('novel.style-drift', 'STYLE_ANCHOR_DRIFT'),
});

/** 원래 엔진 코드의 Folio 대응. 없으면 null. 프로토타입 키('toString' 등)는 대응이 없다. */
export const parityCode = (sourceCode) => (Object.hasOwn(PARITY_CODES, sourceCode) ? PARITY_CODES[sourceCode] : null);

/** 의도한 차이의 종류. 이 밖의 종류는 기대 파일이 잘못된 것이다. */
export const INTENDED_DIFF_KINDS = Object.freeze([
  'advisory-start', // 원래 엔진은 hard, Folio 는 같은 뜻을 advisory 로 시작한다(코드는 원래 엔진 코드).
  'folio-stricter', // Folio 만 hard 로 막는다(코드는 Folio 코드).
  'core-refusal', // Folio 는 검사까지 가지 않고 코어가 추출 답을 거절한다(code 는 Folio 거절 코드, source 는 원래 엔진 코드).
  'not-ported', // 원래 엔진 soft 코드를 Folio 가 내지 않는다(코드는 원래 엔진 코드).
  'folded', // Folio 가 같은 엔티티의 더 구체적인 지적 하나로 합쳐 따로 내지 않는다(코드는 원래 엔진 코드).
]);

/** 판정 비교에서 soft 대조를 건너뛰는 종류. */
export const SOFT_EXEMPT_KINDS = Object.freeze(['not-ported', 'folded']);

/** Folio 커밋 잠금 거절 코드(core/run/commit.js·commit-guard.js 의 FolioError 코드). 원래 엔진의 영수증 거절과 짝을 맞춘다. */
export const FOLIO_LOCK_CODES = Object.freeze(['LOCK_NO_RECEIPT', 'LOCK_HASH_MISMATCH', 'LOCK_HARD_VIOLATION', 'LOCK_RECEIPT_CONSUMED']);

/** 코어가 추출 답을 거절할 때의 코드 접두(core/run/steps/generate.js parseEvents). */
export const FOLIO_REFUSAL_CODES = Object.freeze(['EVENT_INVALID']);
