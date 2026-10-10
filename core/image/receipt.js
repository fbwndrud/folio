import { FINDING_SEVERITIES, HASH, RESERVED_RECEIPT_FIELDS, STEP_STATUSES, isBlocking } from '../ledger/receipts.js';
import { IMAGE_STEPS } from './steps.js';

export const ASSET_RECEIPT_VERSION = 1;
/** 그림 검토는 언제나 같은 호스트의 자기검토다. 영수증은 이것만 적을 수 있다(잠금: 자기검토 표기). */
export const SAME_HOST = Object.freeze({ sameHost: true, independent: false });
/** 영수증에 오르는 단계(커밋 자신은 빼고). */
export const RECEIPT_STEP_IDS = Object.freeze(IMAGE_STEPS.filter((s) => s.kind !== 'commit').map((s) => s.id));

const findingsOf = (step) => (step?.checks ?? []).flatMap((c) => c.findings ?? []);

/**
 * 그림 실행 → 그림 영수증. 단계 항목은 실행의 결과 그대로이고(기록장 image_result 와 digest 로 맞물린다), 그 밖은 실행이 아니라
 * 결과에서 다시 계산한다: hard 수, 넘긴 막는 지적(overridden), 참고 의견(advisories). 검토자는 늘 SAME_HOST 다.
 * @param {any} run
 * @param {{ receiptId: string }} options
 */
export function buildAssetReceipt(run, { receiptId }) {
  const steps = RECEIPT_STEP_IDS.map((id) => ({ id, kind: IMAGE_STEPS.find((s) => s.id === id)?.kind, ...structuredClone(run.results[id] ?? { status: 'not_run' }) }));
  const all = steps.flatMap(findingsOf);
  return {
    receiptVersion: ASSET_RECEIPT_VERSION, receiptId, runId: run.runId, assetId: run.assetId, nodeId: run.nodeId ?? null,
    file: `${run.assetId}${run.image.name.slice(run.image.name.lastIndexOf('.'))}`, mediaType: run.image.type, model: run.image.model,
    briefHash: run.briefHash, fileHash: run.image.hash, specDigest: run.specDigest,
    references: (run.references ?? []).flatMap((entry) => entry.assets.map((a) => a.assetId)).filter((id, i, list) => list.indexOf(id) === i),
    steps, hard: all.filter((f) => f.severity === 'hard').length,
    overridden: all.filter((f) => f.severity === 'block'), advisories: all.filter((f) => !isBlocking(f)), reviewer: { ...SAME_HOST },
  };
}

/**
 * 그림 영수증의 형식 잠금. 빈 배열이면 유효.
 * - 기록장 예약 필드 금지, 필수 필드·hash 모양, 단계는 정해진 다섯이 정해진 차례로.
 * - 건너뛴 단계는 이유와 출처, 실제로 본 단계(점검·검토·승인)는 그 설명서·그림 hash 가 영수증 hash 와 같아야 한다.
 * - 검토자는 SAME_HOST 만. 어느 검사 결과든 independent: true 면 SELF_REVIEW_MISLABELED.
 * @param {any} receipt
 */
export function validateAssetReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return [{ code: 'RECEIPT_MISSING' }];
  const errors = [];
  const push = (code, extra = {}) => errors.push({ code, ...extra });
  for (const field of RESERVED_RECEIPT_FIELDS) if (field in receipt) push('RECEIPT_FIELD_RESERVED', { field });
  for (const field of ['receiptId', 'runId', 'assetId', 'file', 'specDigest']) if (typeof receipt[field] !== 'string' || !receipt[field]) push('RECEIPT_FIELD_MISSING', { field });
  for (const field of ['briefHash', 'fileHash']) if (!HASH.test(receipt[field] ?? '')) push('RECEIPT_HASH_INVALID', { field });
  if (!Number.isInteger(receipt.hard) || receipt.hard < 0) push('RECEIPT_FIELD_MISSING', { field: 'hard' });
  if (receipt.reviewer?.sameHost !== true || receipt.reviewer?.independent !== false) push('SELF_REVIEW_MISLABELED', { field: 'reviewer' });
  const steps = Array.isArray(receipt.steps) ? receipt.steps : [];
  if (steps.map((s) => s?.id).join() !== RECEIPT_STEP_IDS.join()) push('RECEIPT_STEPS_INVALID');
  for (const step of steps) {
    if (!STEP_STATUSES.includes(step?.status)) { push('STEP_STATUS_INVALID', { stepId: step?.id }); continue; }
    if (step.status === 'skipped' && (typeof step.reason !== 'string' || !step.reason.trim() || typeof step.source !== 'string' || !step.source.trim())) push('STEP_SKIP_REASON_MISSING', { stepId: step.id });
    if ('briefHash' in step && step.briefHash !== receipt.briefHash) push('CHECK_HASH_MISMATCH', { stepId: step.id });
    if ('imageHash' in step && step.imageHash !== receipt.fileHash) push('CHECK_HASH_MISMATCH', { stepId: step.id });
    for (const check of step.checks ?? []) {
      if (check?.reviewer?.independent === true) push('SELF_REVIEW_MISLABELED', { stepId: step.id, checkId: check.checkId });
      for (const finding of [...(check?.findings ?? []), ...(check?.unsupported ?? [])]) {
        if (!FINDING_SEVERITIES.includes(finding?.severity)) push('FINDING_SEVERITY_INVALID', { stepId: step.id, checkId: check.checkId });
      }
    }
  }
  const byId = new Map(steps.map((s) => [s?.id, s]));
  if (!('briefHash' in (byId.get('precheck') ?? {}))) push('CHECK_HASH_MISMATCH', { stepId: 'precheck' });
  if (!('imageHash' in (byId.get('generate') ?? {}))) push('CHECK_HASH_MISMATCH', { stepId: 'generate' });
  if (!('imageHash' in (byId.get('review') ?? {}))) push('CHECK_HASH_MISMATCH', { stepId: 'review' });
  if (!('briefHash' in (byId.get('approve') ?? {}))) push('CHECK_HASH_MISMATCH', { stepId: 'approve' });
  if (byId.get('approve')?.status !== 'approved' || byId.get('approve')?.imageHash !== receipt.fileHash) push('APPROVAL_MISSING');
  return errors;
}
