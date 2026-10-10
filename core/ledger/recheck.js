import { HASH, RESERVED_RECEIPT_FIELDS, pushAppliedChecksProblems, pushFeaturesProblems, pushFindingSeverityProblems, pushOrderProblems, pushStepProblems } from './receipts.js';

/**
 * receipts 기록장의 재검사(recheck) 기록: 커밋된 원고를 검사 단계만 다시 돌린 결과. 원고는 바뀌지 않는다.
 * @typedef {{ recheckId: string, runId: string, nodeId: string, variant: string, level: string, receiptId: string,
 *   committedHash: string, pipelineDigest: string, appliedChecks: { checkId: string, digest: string }[],
 *   order: { mode: string, ordered: boolean }, steps: object[], refs: object[], hard: number, advisories: object[], overridden: object[] }} Recheck
 */
export const RECHECK_TYPE = 'recheck';

/** 영수증과 같은 형식 규칙(예약 필드, 단계 항목, 지적 등급, 자기검토 표기). 빈 배열이면 유효. */
export function validateRecheck(record) {
  if (!record || typeof record !== 'object') return [{ code: 'RECHECK_MISSING' }];
  const errors = [];
  const push = (code, extra = {}) => errors.push({ code, ...extra });
  for (const field of RESERVED_RECEIPT_FIELDS) if (field in record) push('RECEIPT_FIELD_RESERVED', { field });
  for (const field of ['recheckId', 'runId', 'nodeId', 'level', 'receiptId', 'pipelineDigest']) {
    if (typeof record[field] !== 'string' || !record[field]) push('RECEIPT_FIELD_MISSING', { field });
  }
  if (record.variant !== 'main') push('VARIANT_UNSUPPORTED', { variant: record.variant });
  if (!HASH.test(record.committedHash ?? '')) push('DRAFT_HASH_INVALID');
  if (!Number.isInteger(record.hard) || record.hard < 0) push('RECEIPT_FIELD_MISSING', { field: 'hard' });
  for (const field of ['refs', 'steps', 'overridden', 'advisories']) if (!Array.isArray(record[field])) push('RECEIPT_FIELD_MISSING', { field });
  if (!Array.isArray(record.appliedChecks)) push('RECEIPT_FIELD_MISSING', { field: 'appliedChecks' });
  pushAppliedChecksProblems(record.appliedChecks, push);
  if (record.order === undefined) push('RECEIPT_FIELD_MISSING', { field: 'order' });
  pushOrderProblems(record.order, push);
  for (const step of record.steps ?? []) if (step?.kind !== 'check') push('RECHECK_STEP_NOT_CHECK', { stepId: step?.id });
  pushStepProblems(record.steps, record.committedHash, push);
  pushFindingSeverityProblems(record.overridden, push, { field: 'overridden' });
  pushFindingSeverityProblems(record.advisories, push, { field: 'advisories' });
  pushFeaturesProblems(record.features, push);
  return errors;
}

/** 이 실행이 남긴 재검사 기록(한 실행에 하나). */
export const recheckOfRun = (records, runId) => records.find((r) => r.type === RECHECK_TYPE && r.runId === runId) ?? null;
