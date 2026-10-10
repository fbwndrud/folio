import { MAIN, variantOf } from '../variants/model.js';

export const RECEIPT_VERSION = 1;
export const STEP_STATUSES = ['passed', 'failed', 'skipped', 'auto', 'approved', 'not_needed', 'not_applicable', 'overridden', 'error'];
export const FINDING_SEVERITIES = ['hard', 'block', 'warning', 'advisory'];
export const HASH = /^sha256:[0-9a-f]{64}$/;
/** 실제로 초안을 조사한 것으로 간주되는 상태. draftHash가 없으면 형식부터 걸린다. */
const HASH_REQUIRED_STATUSES = new Set(['passed', 'failed']);
/** 이 상태는 검사가 초안을 보지 않았다는 뜻이라 draftHash를 비워도 된다(단, 값이 있다면 맞아야 한다).
 * 잠긴 단계는 이 상태여도 hash를 요구한다 — 그건 pipeline을 아는 commit-locks.js의 몫이다. */
export const HASH_OPTIONAL_STATUSES = ['skipped', 'not_applicable'];
/** 기록장이 스스로 붙이는 필드. 영수증이 이 이름을 들고 오면 기록장 메타데이터를 흉내낼 수 있어 거부한다. */
export const RESERVED_RECEIPT_FIELDS = ['type', 'seq', 'at', 'prev', 'hash'];
/** 사건도 마찬가지: 노드/영수증/기록장 메타데이터는 커밋이 붙이지, 영수증이 들고 올 수 없다. */
const RESERVED_EVENT_FIELDS = ['type', 'supersedes', 'nodeId', 'receiptId', 'seq', 'prev', 'hash', 'at'];

/** @typedef {{ checkId: string, severity: 'hard'|'block'|'warning'|'advisory', code: string, message: string, quote?: string, nodeId?: string }} Finding */
/** @typedef {{ checkId: string, status: string, findings: Finding[], reviewer?: { sameHost: boolean, independent: boolean }, unsupported?: Finding[] }} CheckResult */
/** @typedef {{ id: string, kind: string, status: string, reason?: string, source?: string, draftHash?: string|null, checks?: CheckResult[] }} ReceiptStep */
/**
 * @typedef {{ receiptVersion: number, receiptId: string, runId: string, nodeId: string, variant: string, level: string,
 *   draftHash: string, pipelineDigest: string, steps: ReceiptStep[], refs: {kind: string, id: string, rev: string|null}[],
 *   hard: number, advisories: Finding[], overridden: Finding[], attempts: number, events: object[], trackingBatch?: any }} Receipt
 */

export const isBlocking = (finding) => finding?.severity === 'hard' || finding?.severity === 'block';

export function pushFindingSeverityProblems(findings, push, extra) {
  for (const finding of findings ?? []) {
    if (!FINDING_SEVERITIES.includes(finding?.severity)) push('FINDING_SEVERITY_INVALID', extra);
  }
}

/** 단계 항목 규칙(영수증과 재검사 기록이 함께 쓴다). draftHash 는 검사한 원고의 hash. */
export function pushStepProblems(steps, draftHash, push) {
  for (const step of steps ?? []) {
    if (!step || typeof step !== 'object') { push('STEP_INVALID'); continue; }
    if (step.status === 'not_run') push('STEP_NOT_RUN', { stepId: step.id });
    else if (!STEP_STATUSES.includes(step.status)) push('STEP_STATUS_INVALID', { stepId: step.id });
    if (step.status === 'skipped' && (typeof step.reason !== 'string' || typeof step.source !== 'string')) {
      push('STEP_SKIP_REASON_MISSING', { stepId: step.id });
    }
    // draftHash를 들고 온 단계는 종류에 상관없이 그 값이 실제 영수증 draftHash와 같아야 한다.
    if (step.draftHash !== undefined && step.draftHash !== null) {
      if (step.draftHash !== draftHash) push('CHECK_HASH_MISMATCH', { stepId: step.id });
    } else if (step.kind === 'check' && HASH_REQUIRED_STATUSES.has(step.status)) {
      // passed/failed는 초안을 실제로 봤다는 뜻이라 draftHash를 비워둘 수 없다.
      // skipped/not_applicable(HASH_OPTIONAL_STATUSES)는 초안을 보지 않았을 수 있어 비워도 된다 — 잠금 여부는 commit-locks.js가 가른다.
      push('CHECK_HASH_MISMATCH', { stepId: step.id });
    }
    for (const check of step.checks ?? []) {
      if (check.reviewer?.independent === true) push('SELF_REVIEW_MISLABELED', { stepId: step.id, checkId: check.checkId });
      pushFindingSeverityProblems(check.findings, push, { stepId: step.id, checkId: check.checkId });
      pushFindingSeverityProblems(check.unsupported, push, { stepId: step.id, checkId: check.checkId });
    }
  }
}

/** appliedChecks(선택): [{ checkId, digest }]. 옛 영수증에는 없다. */
export function pushAppliedChecksProblems(applied, push) {
  if (applied === undefined) return;
  if (!Array.isArray(applied) || !applied.every((a) => typeof a?.checkId === 'string' && HASH.test(a?.digest ?? ''))) push('APPLIED_CHECKS_INVALID');
}

/** order(선택): { mode, ordered }. 옛 영수증에는 없다. */
export function pushOrderProblems(order, push) {
  if (order === undefined) return;
  if (!order || typeof order !== 'object' || (order.mode !== null && typeof order.mode !== 'string') || typeof order.ordered !== 'boolean'
    || (order.unorderedBy !== undefined && order.unorderedBy !== null && !['none', 'branching', 'role'].includes(order.unorderedBy))) push('ORDER_INVALID');
}

/** structure(선택, 가지 영수증): { children: string[] }. 옛 영수증·잎 영수증에는 없다. */
export function pushStructureProblems(structure, push) {
  if (structure === undefined) return;
  if (!structure || typeof structure !== 'object' || !Array.isArray(structure.children) || !structure.children.every((id) => typeof id === 'string')) push('STRUCTURE_INVALID');
}

/** features(선택): { occurrenceScope: boolean }. 옛 영수증에는 없다(끈 것으로 본다). */
export function pushFeaturesProblems(features, push) {
  if (features === undefined) return;
  const ok = features && typeof features === 'object' && !Array.isArray(features)
    && typeof features.occurrenceScope === 'boolean' && Object.keys(features).every((key) => ['occurrenceScope', 'branching'].includes(key))
    && (features.branching === undefined || typeof features.branching === 'boolean');
  if (!ok) push('FEATURES_INVALID');
}

/** original(판본 영수증만): 이 판본을 검사할 때 본 원본(main) 커밋 { receiptId, committedHash }. */
function pushOriginalProblems(original, push) {
  if (original === undefined) { push('ORIGINAL_MISSING'); return; }
  if (!original || typeof original !== 'object' || typeof original.receiptId !== 'string' || !original.receiptId || !HASH.test(original.committedHash ?? '')
    || Object.keys(original).some((key) => key !== 'receiptId' && key !== 'committedHash')) push('ORIGINAL_INVALID');
}

/**
 * 판본(N6): variant 는 문자열이고 variants(이 작품이 선언한 판본 id, 기본은 main 하나)에 있어야 한다.
 * main 영수증은 original 을 들 수 없다. 판본 영수증은 original 이 있어야 하고 사건(events)·자식 목록(structure)을 들 수 없다 —
 * 판본 커밋은 이야기 사실(사건 기록장)을 바꾸지 않는다.
 */
function pushVariantProblems(receipt, variants, push) {
  const { variant } = receipt;
  if (typeof variant !== 'string' || !variants.includes(variant)) { push('VARIANT_UNSUPPORTED', { variant: typeof variant === 'string' ? variant.slice(0, 60) : null }); return; }
  if (variant === MAIN) {
    if (receipt.original !== undefined) push('ORIGINAL_ON_MAIN');
    return;
  }
  pushOriginalProblems(receipt.original, push);
  if (!Array.isArray(receipt.events) || receipt.events.length) push('VARIANT_EVENTS_FORBIDDEN');
  if (receipt.structure !== undefined) push('VARIANT_STRUCTURE_FORBIDDEN');
  if (receipt.trackingBatch !== undefined) push('VARIANT_TRACKING_FORBIDDEN');
}

/**
 * 잠금 규칙 중 영수증 형식에 걸린 것을 검사한다. 빈 배열이면 유효.
 * variants: 받을 판본 id(작품 work.yaml 의 variants). 주지 않으면 main 만 받는다.
 * @param {any} receipt
 * @param {{ variants?: string[] }} [options]
 */
export function validateReceipt(receipt, { variants = [MAIN] } = {}) {
  if (!receipt || typeof receipt !== 'object') return [{ code: 'RECEIPT_MISSING' }];
  const errors = [];
  const push = (code, extra = {}) => errors.push({ code, ...extra });
  for (const field of RESERVED_RECEIPT_FIELDS) {
    if (field in receipt) push('RECEIPT_FIELD_RESERVED', { field });
  }
  for (const field of ['receiptId', 'runId', 'nodeId', 'level', 'pipelineDigest']) {
    if (typeof receipt[field] !== 'string' || !receipt[field]) push('RECEIPT_FIELD_MISSING', { field });
  }
  if (!Number.isInteger(receipt.hard) || receipt.hard < 0) push('RECEIPT_FIELD_MISSING', { field: 'hard' });
  if (!Array.isArray(receipt.refs)) push('RECEIPT_FIELD_MISSING', { field: 'refs' });
  pushVariantProblems(receipt, variants, push);
  if (!HASH.test(receipt.draftHash ?? '')) push('DRAFT_HASH_INVALID');
  if (!Array.isArray(receipt.steps) || receipt.steps.length === 0) push('RECEIPT_STEPS_MISSING');
  pushStepProblems(receipt.steps, receipt.draftHash, push);
  pushAppliedChecksProblems(receipt.appliedChecks, push);
  pushOrderProblems(receipt.order, push);
  pushStructureProblems(receipt.structure, push);
  pushFeaturesProblems(receipt.features, push);
  pushFindingSeverityProblems(receipt.overridden, push, { field: 'overridden' });
  pushFindingSeverityProblems(receipt.advisories, push, { field: 'advisories' });
  for (const event of receipt.events ?? []) {
    if (!event || typeof event !== 'object') { push('EVENT_INVALID'); continue; }
    for (const field of RESERVED_EVENT_FIELDS) {
      if (field in event) push('EVENT_FIELD_RESERVED', { field, eventId: event.eventId });
    }
  }
  return errors;
}

/**
 * 노드마다 마지막 커밋 기록. 한 판본의 커밋만 본다(기본 main) — 판본 커밋이 원본 커밋을 가리지 않는다(N6).
 * variant 키가 없는 옛 커밋 기록은 main 이다.
 * @param {any[]} records
 * @param {string} [variant]
 */
export function lastCommits(records, variant = MAIN) {
  const commits = new Map();
  for (const record of records) if (record.type === 'commit' && variantOf(record) === variant) commits.set(record.nodeId, record);
  return commits;
}

export function receiptsById(records) {
  return new Map(records.filter((record) => record.type === 'receipt').map((record) => [record.receiptId, record]));
}
