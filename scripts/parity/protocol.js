import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 쓰기 절차 대응표(protocol.json). vibelore 원본에서 표지 문자열을 찾아 줄 번호를 적는다.
 * 표지 하나라도 없으면 오류다(원본이 바뀌었으면 표를 다시 맞춰야 한다).
 * - 'awaiting_draft_approval' 은 처음 나오는 곳이 PARKED_STAGES 집합 정의라 단계가 아니다.
 *   그래서 실제 전이 `transition(store, workflow, 'awaiting_draft_approval'` 를 표지로 쓴다.
 * - mandatory_validation 한 단계가 Folio 의 extract·facts 두 단계에 해당한다(같은 표지를 두 번 적는다).
 * - 영수증 거절 넷은 commit.js 의 한 조건식(같은 줄)에 모여 있다. 커밋 영수증이 아예 없을 때는 MISSING_VALIDATION_RECEIPT 다.
 */
const WORKFLOW = 'src/tools/workflow.js';
const COMMIT = 'src/tools/commit.js';

export const STEP_MARKERS = Object.freeze([
  { vibelore: 'chapter_plan', file: WORKFLOW, marker: "operation: 'chapter_plan'", folio: 'plan' },
  { vibelore: 'draft', file: WORKFLOW, marker: "?? 'draft'", folio: 'draft' },
  { vibelore: 'mandatory_validation (extract)', file: WORKFLOW, marker: "operation: 'mandatory_validation'", folio: 'extract' },
  { vibelore: 'mandatory_validation (facts)', file: WORKFLOW, marker: "operation: 'mandatory_validation'", folio: 'facts' },
  { vibelore: 'check_and_reviews', file: WORKFLOW, marker: "operation: 'check_and_reviews'", folio: 'critic' },
  { vibelore: 'revise', file: WORKFLOW, marker: "operation: 'revise'", folio: 'revise' },
  { vibelore: 'awaiting_draft_approval', file: WORKFLOW, marker: "transition(store, workflow, 'awaiting_draft_approval'", folio: 'approve' },
  { vibelore: 'commit (receipt consumed)', file: WORKFLOW, marker: 'receipt.consumedAt = now()', folio: 'commit' },
]);

export const REFUSAL_MARKERS = Object.freeze([
  { case: 'no_receipt', file: COMMIT, marker: 'MISSING_VALIDATION_RECEIPT', folio: 'LOCK_NO_RECEIPT' },
  { case: 'hash_changed', file: COMMIT, marker: 'receipt.proseHash !== hash', folio: 'LOCK_HASH_MISMATCH' },
  { case: 'hard_violation', file: COMMIT, marker: "receipt.verdict !== 'passed'", folio: 'LOCK_HARD_VIOLATION' },
  { case: 'receipt_consumed', file: COMMIT, marker: 'receipt.consumedAt', folio: 'LOCK_RECEIPT_CONSUMED' },
]);

/** 표지가 처음 나오는 줄(1부터). 없으면 null. */
export function lineOf(text, marker) {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line.includes(marker));
  return index === -1 ? null : index + 1;
}

/** @returns {{ steps: object[], refusals: object[], missing: string[] }} */
export function buildProtocol(root) {
  const cache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, readFileSync(join(root, file), 'utf8'));
    return cache.get(file);
  };
  const missing = [];
  const locate = (entry) => {
    const line = lineOf(read(entry.file), entry.marker);
    if (line === null) missing.push(`${entry.file}: ${entry.marker}`);
    return line;
  };
  const steps = STEP_MARKERS.map((s) => ({ vibelore: s.vibelore, file: s.file, line: locate(s), marker: s.marker, folio: s.folio }));
  const refusals = REFUSAL_MARKERS.map((r) => ({ case: r.case, file: r.file, line: locate(r), marker: r.marker, folio: r.folio }));
  return { steps, refusals, missing };
}
