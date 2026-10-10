import { canonicalJson, sha256 } from '../util/hash.js';

/**
 * decisions 기록장: 영수증에 들어갈 판정(검사 결과·사용자 승인·사용자 넘김)을 엔진이 만든 그 순간 남긴다.
 * 커밋은 영수증을 이 기록과 대조한다(commit-locks.js assertDecisionsMatch). 실행 파일만 고쳐서는 판정을 바꿀 수 없다.
 */
export const DECISIONS_LEDGER = 'decisions';
export const DECISION_ACTIONS = ['approve', 'request_revision', 'skip'];

const digestOf = (value) => sha256(canonicalJson(value));

function defined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

const projectCheck = (check) => defined({
  checkId: check?.checkId, status: check?.status, source: check?.source, findings: check?.findings, unsupported: check?.unsupported, reviewer: check?.reviewer,
});

/**
 * check 단계가 영수증에 들어가는 모양 — 정본은 여기 하나다.
 * buildReceipt(영수증 만들기), 실행기(기록), commit(대조)가 모두 이 함수를 쓴다.
 * result 는 run.results[stepId] 이거나 영수증의 단계 항목이다.
 */
export function checkStepEntry(stepId, result) {
  return defined({
    id: stepId, kind: 'check', status: result?.status ?? 'not_run', reason: result?.reason, source: result?.source,
    draftHash: result?.draftHash ?? null, checks: (result?.checks ?? []).map(projectCheck),
  });
}

export const checkStepDigest = (entry) => digestOf(entry);

/** 검사가 본 범위(scope.refs)의 digest. 영수증 refs 와 같아야 한다 — 다른 범위에서 낸 검사 결과는 쓸 수 없다. */
export const refsDigest = (refs) => digestOf(refs ?? null);

/** 판본 검사는 같은 본문으로 원본을 다시 커밋해도 구분되도록 원본 영수증 ID까지 기록한다. main 기록 모양은 유지한다. */
export function checkResultRecord({ runId, nodeId, stepId, draftHash, entry, refs, variant = undefined, original = undefined }) {
  return { type: 'check_result', runId, nodeId, stepId, draftHash, refsDigest: refsDigest(refs), digest: checkStepDigest(entry),
    ...(variant === undefined ? {} : { variant, original }) };
}

/**
 * approval 의 digest 는 감사용이다(feedback/reason 까지 묶어 둔다). 영수증에는 feedback 이 없어 커밋 때 다시 계산할 수 없으므로,
 * 커밋 대조는 action·draftHash·seq(검사 결과보다 뒤, 그 단계의 가장 최근 결정)로 한다.
 */
export function approvalRecord({ runId, nodeId, stepId, draftHash, action, feedback = '', reason = '' }) {
  return { type: 'approval', runId, nodeId, stepId, draftHash, action, digest: digestOf({ action, feedback, reason, stepId, draftHash }) };
}

/** 넘김은 checkId + code + quote + 이유 + 출처로 가린다(같은 지적인가는 sameFinding 과 같은 기준). */
export const overrideDigest = (override) => digestOf({
  checkId: override?.checkId ?? null, code: override?.code ?? null, quote: override?.quote ?? null,
  reason: override?.overrideReason ?? null, source: override?.source ?? null,
});

export function overrideRecord({ runId, nodeId, stepId, draftHash, override }) {
  return { type: 'override', runId, nodeId, stepId, draftHash, digest: overrideDigest(override) };
}
