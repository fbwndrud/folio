import { trackingBatchFor } from '../tracking/commit.js';
import { RECEIPT_VERSION, isBlocking } from '../ledger/receipts.js';
import { checkStepEntry } from '../ledger/decisions.js';
import { nodeOrder, receiptFeatures } from '../scope/stale-checks.js';
import { appliedFromEntries } from '../checks/applied.js';
import { MAIN, variantOf } from '../variants/model.js';

/**
 * 실행 상태에서 영수증을 만든다. 건너뛴 단계도 이유·출처와 함께 남는다.
 * appliedChecks: 이 원고에 적용한 검사와 그 정의 digest(나중에 켠 검사의 되채우기 판단에 쓴다). error 결과는 빠진다.
 * 판본(N6): original(커밋 때 기록장이 말하는 원본 커밋, 부르는 쪽이 정한다)을 싣고, 사건·자식 목록은 싣지 않는다.
 */
export function buildReceipt({ run, steps, work, refs, newId, checks, pipeline, original = null }) {
  const node = work.tree.nodes.get(run.nodeId);
  const isMain = variantOf(run) === MAIN;
  const entries = steps.filter((s) => s.kind !== 'commit').map((step) => {
    const result = run.results[step.id];
    // check 단계의 모양은 decisions 기록과 같은 정본 함수가 정한다.
    if (step.kind === 'check') return checkStepEntry(step.id, result);
    const entry = { id: step.id, kind: step.kind, status: result?.status ?? 'not_run' };
    if (result?.reason !== undefined) entry.reason = result.reason;
    if (result?.source !== undefined) entry.source = result.source;
    return entry;
  });
  const findings = entries.flatMap((e) => (e.checks ?? []).flatMap((c) => c.findings ?? []));
  const receiptId = newId('rcpt');
  const trackingBatch = trackingBatchFor({ ...run, trackingBasePlanVersion: work.tracking?.plan?.version, trackingBaseTrackingSeq: work.tracking?.records.at(-1)?.seq ?? 0 }, receiptId);
  return {
    ...(trackingBatch ? { trackingBatch } : {}),
    receiptVersion: RECEIPT_VERSION,
    receiptId,
    runId: run.runId,
    nodeId: run.nodeId,
    variant: run.variant,
    ...(isMain ? {} : { original }),
    level: node.level,
    draftHash: run.draftHash,
    pipelineDigest: run.pipelineDigest,
    steps: entries,
    refs,
    appliedChecks: checks && pipeline ? appliedFromEntries(checks, pipeline, entries) : undefined,
    order: nodeOrder(work, run.nodeId),
    features: receiptFeatures(work, run.nodeId, isMain),
    // 가지는 커밋 때의 자식 목록을 남긴다. 나중에 자식이 더해지거나 옮겨지면 "다시 확인 필요"(structure)가 된다.
    ...(isMain && node.kind === 'branch' ? { structure: { children: [...node.children] } } : {}),
    hard: findings.filter((f) => f.severity === 'hard').length,
    advisories: findings.filter((f) => !isBlocking(f)),
    overridden: run.overridden ?? [],
    attempts: run.attempts,
    // 이벤트를 먼저 펼치고 eventId를 나중에 덮어써서, 모델 출력이 자기 eventId를 고를 수 없게 한다.
    events: isMain ? (run.outputs.events?.events ?? []).map((event) => ({ ...event, eventId: newId('ev') })) : [],
  };
}
