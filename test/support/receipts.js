import { sha256 } from '../../core/util/hash.js';
import { approvalRecord, checkResultRecord, checkStepEntry, overrideRecord } from '../../core/ledger/decisions.js';

/** 모든 단계가 통과한 영수증. 우회 테스트는 이것을 망가뜨려 쓴다. */
/** runId 를 주지 않으면 영수증마다 제 실행이 있는 것으로 본다(한 실행은 한 번만 커밋한다). */
export function makeReceipt({ nodeId, text, pipeline, level = 'scene', receiptId = 'rcpt-test', runId = `run-${receiptId}`, events = [] }) {
  const draftHash = sha256(text);
  const steps = pipeline.steps.filter((s) => s.kind !== 'commit').map((s) => {
    if (s.kind === 'check') return { id: s.id, kind: s.kind, status: 'passed', draftHash, checks: [] };
    if (s.kind === 'gate') return { id: s.id, kind: s.kind, status: 'approved', source: 'user' };
    if (s.loop) return { id: s.id, kind: s.kind, status: 'not_needed' };
    return { id: s.id, kind: s.kind, status: 'passed' };
  });
  return {
    receiptVersion: 1, receiptId, runId, nodeId, variant: 'main', level, draftHash,
    pipelineDigest: pipeline.digest, steps, refs: [], hard: 0, advisories: [], overridden: [], attempts: 0, events,
  };
}

/**
 * 영수증의 판정을 엔진이 하듯 decisions 기록장에 남긴다(commitNode 를 직접 부르는 테스트용).
 * only: 기록할 check 단계 id(주면 승인은 남기지 않는다). approvalsFirst: 승인을 검사 결과보다 먼저 남긴다.
 */
export async function recordDecisions(ledger, receipt, { only, approvalsFirst = false } = {}) {
  const base = { runId: receipt.runId, nodeId: receipt.nodeId, draftHash: receipt.draftHash };
  const checks = receipt.steps.filter((s) => s.kind === 'check' && (!only || only.includes(s.id)))
    .map((s) => checkResultRecord({ ...base, stepId: s.id, entry: checkStepEntry(s.id, s), refs: receipt.refs }));
  const approvals = only ? [] : receipt.steps.filter((s) => s.status === 'approved' || s.status === 'overridden')
    .map((s) => approvalRecord({ ...base, stepId: s.id, action: 'approve' }));
  // 넘김은 엔진처럼 결정한 단계(사용자가 넘긴 단계, 없으면 커밋 단계)에 남긴다.
  const overrideStep = receipt.steps.find((s) => s.status === 'overridden')?.id ?? 'commit';
  const overrides = (receipt.overridden ?? []).map((override) => overrideRecord({ ...base, stepId: overrideStep, override }));
  for (const record of approvalsFirst ? [...approvals, ...checks, ...overrides] : [...checks, ...approvals, ...overrides]) await ledger.append(record);
}
