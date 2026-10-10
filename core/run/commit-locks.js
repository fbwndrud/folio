import { FolioError } from '../errors.js';
import { pipelineDigest } from '../pipeline/define.js';
import { HASH_OPTIONAL_STATUSES } from '../ledger/receipts.js';
import { checkStepDigest, checkStepEntry, overrideDigest, refsDigest } from '../ledger/decisions.js';
import { canonicalJson } from '../util/hash.js';
import { nodeOrder, orderChanged } from '../scope/stale-checks.js';
import { assertPipelineVariant } from '../variants/locks.js';
import { MAIN, variantOf } from '../variants/model.js';

const LOCKED_OK = { generate: ['passed'], check: ['passed', 'failed', 'not_applicable'], gate: ['approved', 'auto'] };

/**
 * check 단계의 draftHash가 실제 초안과 같은지 본다.
 * 잠긴 단계는 상태와 상관없이 항상 같아야 한다.
 * 잠기지 않은 단계가 skipped/not_applicable이면(초안을 보지 않았을 수 있으니) 비워도 되지만, 값이 있다면 여전히 같아야 한다.
 */
function checkHashOk(step, entry, receipt) {
  const exemptWhenEmpty = !step.locked && HASH_OPTIONAL_STATUSES.includes(entry.status);
  if (exemptWhenEmpty && (entry.draftHash === null || entry.draftHash === undefined)) return true;
  return entry.draftHash === receipt.draftHash;
}

/**
 * 파이프라인과 영수증이 정말로 같은 실행을 가리키는지 본다.
 * digest는 pipeline.steps로 다시 계산해서 조작된 pipeline 객체를 잡는다.
 * 각 단계는 정확히 한 번, 정본 kind로 등장해야 하며 check 단계는 draftHash가 실제 초안과 같아야 한다.
 */
export function assertPipelineMatch({ pipeline, receipt }) {
  const digest = pipelineDigest(pipeline.steps, pipeline.packDigest ?? null);
  if (digest !== pipeline.digest || receipt.pipelineDigest !== pipeline.digest) {
    throw new FolioError('LOCK_PIPELINE_MISMATCH', 'the receipt was issued under a different pipeline');
  }
  assertPipelineVariant({ pipeline, receipt });

  const nonCommitSteps = pipeline.steps.filter((s) => s.kind !== 'commit');
  const pipelineIds = new Set(nonCommitSteps.map((s) => s.id));
  const seenIds = new Set();
  for (const entry of receipt.steps) {
    if (!pipelineIds.has(entry.id) || seenIds.has(entry.id)) {
      throw new FolioError('LOCK_RECEIPT_INVALID', `receipt step ${entry.id} does not match the pipeline`, {
        problems: [{ code: 'STEP_ID_UNKNOWN', stepId: entry.id }],
      });
    }
    seenIds.add(entry.id);
  }

  for (const step of nonCommitSteps) {
    const entry = receipt.steps.find((s) => s.id === step.id);
    if (!entry || entry.kind !== step.kind) {
      throw new FolioError('LOCK_STEP_MISSING', `step ${step.id} did not run as declared`, { stepId: step.id });
    }
    if (step.kind === 'check' && !checkHashOk(step, entry, receipt)) {
      throw new FolioError('LOCK_HASH_MISMATCH', `check step ${step.id} was run against different text`, { stepId: step.id });
    }
    if (step.locked && !(LOCKED_OK[step.kind] ?? []).includes(entry.status)) {
      throw new FolioError('LOCK_STEP_MISSING', `locked step ${step.id} did not run`, { stepId: step.id });
    }
  }
}

/**
 * 판정에 쓰이는 지적을 영수증 어디에 있든(검사 결과·재정의·권고) 모은다. hard 잠금은 이것으로 센다.
 * unsupported(인용이 초안에 없는 requireQuote 지적)는 판정에 쓰지 않는다는 규칙이라 넣지 않는다.
 * 그런 지적은 영수증에 기록으로만 남는다.
 */
export function receiptVerdictFindings(receipt) {
  const stepFindings = receipt.steps.flatMap((s) => (s.checks ?? []).flatMap((c) => c.findings ?? []));
  return [...stepFindings, ...(receipt.overridden ?? []), ...(receipt.advisories ?? [])];
}

/** 같은 지적인가: checkId + code + quote(없으면 null). 같은 code 라도 다른 인용이면 다른 지적이다. */
export const sameFinding = (a, b) => a?.checkId === b?.checkId && a?.code === b?.code && (a?.quote ?? null) === (b?.quote ?? null)
  && (a?.pathId ?? null) === (b?.pathId ?? null) && (a?.entityId ?? null) === (b?.entityId ?? null);
/** 사용자가 이유를 달아 넘긴 지적인가. 출처가 user이고 이유가 비어 있지 않아야 한다. */
export const userOverrideCovers = (overridden, finding) => (overridden ?? []).some((o) => o?.source === 'user'
  && typeof o.overrideReason === 'string' && o.overrideReason.trim() !== '' && sameFinding(o, finding));

/** 막는(block) 지적은 전부 사용자가 이유와 함께 넘긴 것이어야 커밋할 수 있다. */
export function assertBlocksResolved(receipt) {
  const open = receipt.steps.flatMap((s) => (s.checks ?? []).flatMap((c) => c.findings ?? []))
    .filter((f) => f?.severity === 'block' && !userOverrideCovers(receipt.overridden, f));
  if (open.length) throw new FolioError('LOCK_BLOCK_UNRESOLVED', 'block findings need a user override with a reason', { findings: open });
}

const PREDATES_HINT = 'this run predates decision records; abandon it and run the node again';

/** 게이트가 설정상 가져야 하는 상태. 영수증(실행 파일에서 온 값)이 아니라 파이프라인에서 정한다. */
const gateStatusFor = (step) => (step.mode === 'off' ? 'skipped' : step.mode === 'auto' ? 'auto' : 'approved');
/** 사람의 결정이 필요한 단계(승인 게이트, 사용자가 넘긴 단계). */
const needsUserDecision = (step, entry) => (step.kind === 'gate' && gateStatusFor(step) === 'approved')
  || entry.status === 'approved' || entry.status === 'overridden' || entry.source === 'user';

/**
 * 영수증의 판정이 decisions 기록장(엔진이 판정한 순간 남긴 기록)과 같은지 본다. 설정으로 끌 수 없다.
 * - check 단계: 그 단계의 가장 최근 check_result 가 이 원고(draftHash)에 대한 것이고 digest 가 영수증 항목과 같아야 한다.
 *   영수증 항목은 정본 모양(checkStepEntry) 그대로여야 한다 — 덧붙인 필드도 불일치다.
 * - 게이트: 상태는 설정(mode)이 정한 것이어야 하고(approved/auto/skipped), 사람 승인 게이트와 사용자가 넘긴 단계는
 *   그 단계의 가장 최근 결정이 같은 원고에 대한 approve 이고 그 앞 검사 결과들보다 뒤에 있어야 한다. skip 기록이 있는 실행은 거부한다.
 * - check 결과는 범위(refsDigest)가 영수증 refs 와 같아야 한다. 판본은 검사 때의 판본 id·원본 커밋 영수증도 같아야 한다.
 * - receipt.overridden 의 각 항목: 같은 원고에 대한 override 기록이 있어야 한다.
 * @param {{ records: object[]|null, pipeline: { steps: object[] }, receipt: object }} options
 */
export function assertDecisionsMatch({ records, pipeline, receipt }) {
  const mine = Array.isArray(records) ? records.filter((r) => r.runId === receipt.runId && r.nodeId === receipt.nodeId) : [];
  const fail = (stepId, kind) => new FolioError('LOCK_DECISION_MISMATCH', `${kind} for ${stepId ?? 'the receipt'} does not match the decisions ledger`, {
    stepId, kind, ...(mine.length === 0 ? { hint: PREDATES_HINT } : {}),
  });
  if (!Array.isArray(records)) throw fail(null, 'ledger');
  const latestCheck = new Map();
  const latestDecision = new Map();
  for (const record of mine) {
    if (record.type === 'check_result') latestCheck.set(record.stepId, record);
    if (record.type === 'approval') latestDecision.set(record.stepId, record);
  }
  // 건너뛴(skip) 실행은 끝난 실행이다. 실행 파일을 되살려도 그 전에 남긴 승인은 쓸 수 없다.
  if (mine.some((r) => r.type === 'approval' && r.action === 'skip')) throw fail(null, 'approval');
  const scopeDigest = refsDigest(receipt.refs);
  let checkedUpTo = 0;
  for (const step of pipeline.steps) {
    if (step.kind === 'commit') continue;
    const entry = receipt.steps.find((s) => s.id === step.id);
    if (step.kind === 'check') {
      const record = latestCheck.get(step.id);
      const projected = checkStepEntry(step.id, entry);
      if (!record || record.draftHash !== receipt.draftHash || canonicalJson(projected) !== canonicalJson(entry)
        || record.digest !== checkStepDigest(projected)) throw fail(step.id, 'check_result');
      if (record.refsDigest !== scopeDigest) throw fail(step.id, 'refs');
      if (variantOf(receipt) !== MAIN && (record.variant !== receipt.variant
        || canonicalJson(record.original ?? null) !== canonicalJson(receipt.original))) throw fail(step.id, 'variant_scope');
      checkedUpTo = Math.max(checkedUpTo, record.seq);
    } else {
      if (step.kind === 'gate' && entry.status !== gateStatusFor(step)) throw fail(step.id, 'approval');
      if (!needsUserDecision(step, entry)) continue;
      // 그 단계의 가장 최근 결정이 이 원고에 대한 approve 이고, 앞 검사 결과보다 뒤여야 한다.
      const last = latestDecision.get(step.id);
      if (!last || last.action !== 'approve' || last.draftHash !== receipt.draftHash || last.seq <= checkedUpTo) throw fail(step.id, 'approval');
    }
  }
  // 넘김은 일부러 같은 실행 안의 재검사를 넘어 살아남는다(같은 원고라면 사용자의 결정은 그대로다).
  // runId + draftHash + checkId + code + quote + 이유 + 출처로 묶이므로 다른 실행·다른 원고·다른 지적에는 쓰이지 않는다.
  for (const override of receipt.overridden ?? []) {
    const digest = overrideDigest(override);
    if (!mine.some((r) => r.type === 'override' && r.draftHash === receipt.draftHash && r.digest === digest)) throw fail(override?.checkId ?? null, 'override');
  }
}

/** appliedChecks 가 있으면 검사 단계 항목에서 실제로 적용된(skipped·error 가 아닌) 검사 id 와 정확히 같아야 한다. */
export function assertAppliedChecks(record) {
  if (record.appliedChecks === undefined) return;
  const ran = new Set(record.steps.filter((s) => s.kind === 'check')
    .flatMap((s) => (s.checks ?? []).filter((c) => c.status !== 'skipped' && c.status !== 'error').map((c) => c.checkId)));
  const listed = record.appliedChecks.map((a) => a.checkId);
  if (listed.length !== new Set(listed).size || listed.length !== ran.size || !listed.every((id) => ran.has(id))) {
    throw new FolioError('LOCK_RECEIPT_INVALID', 'appliedChecks does not match the checks the steps ran', { problems: [{ code: 'APPLIED_CHECKS_MISMATCH' }] });
  }
}

/** order 가 있으면 지금 노드 순서와 같아야 한다(다른 순서에서 낸 판정으로 순서 표시를 숨길 수 없다). */
export function assertOrderMatches(work, record) {
  if (record.order === undefined) return;
  const now = nodeOrder(work, record.nodeId);
  if (record.order?.mode !== now.mode || orderChanged(record.order, now)) {
    throw new FolioError('LOCK_RECEIPT_INVALID', 'the recorded order is not the node order now', { problems: [{ code: 'ORDER_MISMATCH' }] });
  }
}

/** structure 가 있으면(가지 영수증) 지금 자식 목록과 같아야 한다 — 다른 자식들을 보고 한 돌아보기로 커밋할 수 없다. */
export function assertStructureMatches(work, record) {
  if (record.structure === undefined) return;
  const node = work.tree.nodes.get(record.nodeId);
  const now = node?.kind === 'branch' ? node.children : null;
  if (!now || canonicalJson(record.structure?.children ?? null) !== canonicalJson(now)) {
    throw new FolioError('LOCK_RECEIPT_INVALID', 'the recorded children are not the children now', { problems: [{ code: 'STRUCTURE_MISMATCH' }] });
  }
}

/**
 * 기록장에 아직 없는 가지 영수증은 structure 를 들고 와야 한다 — 빼는 것으로 자식 대조를 건너뛸 수 없다.
 * 실행기는 가지 영수증에 늘 structure 를 넣는다. 없어도 되는 것은 이 필드 전에 기록돼 커밋 도중 멈춘 옛 영수증뿐이다
 * (그 영수증은 commitNode 가 기록장의 것과 글자 그대로 같은지 따로 본다).
 */
export function assertStructurePresent(work, record, { recorded }) {
  if (recorded || record.structure !== undefined) return;
  if (work.tree.nodes.get(record.nodeId)?.kind !== 'branch') return;
  throw new FolioError('LOCK_RECEIPT_INVALID', 'a branch receipt must record its children', { problems: [{ code: 'STRUCTURE_MISSING' }] });
}
