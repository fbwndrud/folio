/**
 * 의도한 차이 표. 판정 비교에서 vibelore 와 Folio 가 일부러 다르게 내는 곳과 그 까닭.
 * - advisory-start·core-refusal 은 코드 규칙이다: vibelore 가 이 코드를 hard 로 내면 어느 사례든 적용한다.
 * - folio-stricter·not-ported·folded 는 사례별로 손으로 적는다. 생성 스크립트가 실제 판정과 대조해 낡은 줄을 거부한다.
 */
export const ADVISORY_START_REASON = 'advisory 로 시작함';

/** vibelore hard 인데 Folio 는 같은 뜻을 새 실험 검사(advisory)로 내는 코드. */
export const ADVISORY_START_CODES = Object.freeze([
  'LEDGER_UPDATE_AFTER_DESTROY', 'LEDGER_RESTORE_NOTE_REQUIRED', 'GENDER_HONORIFIC_MISMATCH', 'POV_VIOLATION', 'QUALITY_GATE_LENGTH',
  'METADATA_LEAK', 'WEBNOVEL_SOFT_LINEBREAKS', 'WEBNOVEL_DIALOGUE_NOT_ISOLATED', 'WEBNOVEL_DIALOGUE_BURIED',
  'SENSITIVE_PROFANITY', 'SENSITIVE_SEXUAL_EXPLICIT', 'SENSITIVE_SEXUAL_SUGGESTIVE', 'SENSITIVE_VIOLENCE_GRAPHIC',
  'SENSITIVE_DRUG_SUBSTANCE', 'SENSITIVE_SELF_HARM',
]);

/** vibelore hard 인데 Folio 는 검사 전에 코어가 추출 답을 거절하는 코드. */
export const CORE_REFUSALS = Object.freeze({
  'INTRINSIC_VIOLATION:structural': {
    code: 'EVENT_INVALID',
    reason: '모르는 엔티티의 사건은 코어 추출(parseEvents)이 EVENT_INVALID 로 거절하고 다시 묻는다. 검사까지 가지 않는다.',
  },
});

/** Folio 와 vibelore 가 둘 다 hard 로 내는 코드(대응표로 비교한다). */
export const SHARED_HARD_CODES = Object.freeze(['DEAD_CHARACTER_ON_STAGE', 'INTRINSIC_VIOLATION:llm']);

/** 사례별 차이. */
export const CASE_DIFFS = Object.freeze({
  'resolved-before-plant': [{
    kind: 'folio-stricter', code: 'PROMISE_RESOLVED_BEFORE_PLANT',
    reason: '심지 않은 약속의 해소는 코어 잠금(core.promise-order, hard)이다. vibelore 는 모르는 hook id 로 보고 soft LEDGER_UNKNOWN_ID 만 낸다.',
  }],
  'destroyed-updated': [{
    kind: 'folded', code: 'DESTROYED_ENTITY_MENTION',
    reason: 'Folio 는 파괴된 것 하나에 가장 구체적인 지적 하나만 낸다. 갱신(DESTROYED_UPDATED)이 있으면 언급(DESTROYED_MENTIONED)은 따로 내지 않는다.',
  }],
  'unknown-character': [{
    kind: 'not-ported', code: 'GENDER_HONORIFIC_MISMATCH',
    reason: 'vibelore Mode B 는 대명사 "그"(남성 함의)를 호칭으로 세어 여성 인물이 있으면 soft 로 낸다. Folio 는 관형사 "그 이름"과 가를 수 없어 기본값(proseSkipTerms: [그])으로 건너뛴다.',
  }],
});

/**
 * vibelore 판정 → 이 사례의 의도한 차이 목록.
 * @param {string} id
 * @param {{ hard: Array<{ code: string }>, soft: string[] }} verdicts
 * @returns {{ diffs: Array<{ kind: string, code: string, reason: string, source?: string }>, errors: string[] }}
 */
export function intendedDiffsFor(id, verdicts) {
  const diffs = [];
  const errors = [];
  for (const code of [...new Set(verdicts.hard.map((h) => h.code))].sort()) {
    if (ADVISORY_START_CODES.includes(code)) diffs.push({ kind: 'advisory-start', code, reason: ADVISORY_START_REASON });
    else if (Object.hasOwn(CORE_REFUSALS, code)) diffs.push({ kind: 'core-refusal', code: CORE_REFUSALS[code].code, source: code, reason: CORE_REFUSALS[code].reason });
    else if (!SHARED_HARD_CODES.includes(code)) errors.push(`${id}: vibelore hard ${code} has no rule (shared, advisory-start or core-refusal)`);
  }
  for (const diff of CASE_DIFFS[id] ?? []) {
    if ((diff.kind === 'not-ported' || diff.kind === 'folded') && !verdicts.soft.includes(diff.code)) {
      errors.push(`${id}: ${diff.kind} ${diff.code} is not in the vibelore soft list (stale table row)`);
    }
    diffs.push({ ...diff });
  }
  return { diffs, errors };
}
