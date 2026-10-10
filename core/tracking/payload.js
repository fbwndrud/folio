import { normalizedPlanContent } from './plan.js';
import { criterionAppliesTo } from './observation-schema.js';
import { coverageFor } from './coverage.js';
import { catalogRef, trackingCatalog } from './catalog.js';
import { snapshotDigest, currentBatchSnapshot } from './semantic.js';
import { activeTrackingSnapshots } from './snapshots.js';
import { trackingCandidateFor, trackingEffective, trackingWorkFor } from './extract.js';

export const TRACKING_CATALOG_LIMIT = 100;

function observationIds(work, observation) {
  const criterion = work.tracking.plan.criteria.find((entry) => entry.id === observation.criterionId);
  const values = criterion?.valueType === 'entity' ? [observation.value]
    : criterion?.valueType === 'entity-list' && Array.isArray(observation.value) ? observation.value : [];
  return [observation.subjectId, observation.perspectiveId, ...values].filter((id) => work.entities.has(id));
}

/** 원문에 이름이 없어도 관찰의 대상·관점·관계 값은 관련 정의에 포함한다. */
export function relevantTrackingObservations(work, node, entityIds) {
  const relevant = new Set(entityIds);
  return work.tracking.observations.filter((entry) => entry.evidence.nodeId === node.id || observationIds(work, entry).some((id) => relevant.has(id)));
}

export function trackingEntityIds(work, node, entityIds) {
  if (!trackingEffective(work)) return [];
  return [...new Set(relevantTrackingObservations(work, node, entityIds).flatMap((entry) => observationIds(work, entry)))];
}

/** 계획과 검토한 후보의 refs는 검사 결정 기록에도 그대로 들어간다. */
export function trackingRefs(work, run, node, entityIds = []) {
  if (!trackingEffective(work) && !run.outputs.tracking) return [];
  const candidate = trackingCandidateFor(work, run);
  const virtual = trackingWorkFor(work, run);
  const related = new Set(relevantTrackingObservations(work, node, entityIds).map((entry) => entry.evidence.nodeId));
  // 빈 원천의 미래 대상·관점·관계 값은 알 수 없다. 알려진 관련 대상이 있으면
  // 모든 유효 checked 원천을 보수적으로 결속해 첫 관찰 추가·삭제도 감지한다.
  const snapshots = activeTrackingSnapshots(work.tracking.batches, work.tracking.receiptRecords ?? [], work.tree.nodes)
    .map((batch) => currentBatchSnapshot(work.tracking, batch))
    .filter((batch) => related.has(batch.nodeId) || entityIds.length > 0 && batch.checked.length > 0 || batch.nodeId === node.id && !candidate)
    .map((batch) => ({ kind: 'tracking_snapshot', id: batch.nodeId, rev: snapshotDigest(batch) }));
  return [{ kind: 'tracking_plan', id: virtual.tracking.plan.planId, rev: virtual.tracking.plan.rev }, catalogRef(virtual),
    ...snapshots.filter((ref) => !candidate || ref.id !== node.id),
    ...(candidate ? [{ kind: 'tracking_candidate', id: node.id, rev: candidate.batchDigest },
      { kind: 'tracking_snapshot', id: node.id, rev: snapshotDigest(candidate) }] : [])];
}

/** 전체 선언 대신 작은 ID/이름 목록과 이 노드 관련 관찰을 보낸다. */
export function trackingPayload(work, run, node, entityIds = []) {
  if (!trackingEffective(work)) return null;
  const candidate = trackingCandidateFor(work, run);
  const virtual = trackingWorkFor(work, run);
  const plan = virtual.tracking.plan;
  const { entries: entities } = trackingCatalog(virtual);
  const observations = relevantTrackingObservations(virtual, node, entityIds);
  const criteria = plan.criteria.filter((entry) => criterionAppliesTo(entry, node.id));
  return {
    draftHash: run.draftHash,
    plan: { ...normalizedPlanContent(plan), rev: plan.rev, version: plan.version, grantId: plan.grantId },
    catalog: { entries: entities.slice(0, TRACKING_CATALOG_LIMIT).map(({ id, kind, name }) => ({ id, kind, name })), total: entities.length,
      limit: TRACKING_CATALOG_LIMIT, incomplete: entities.length > TRACKING_CATALOG_LIMIT },
    observations, pendingRanges: coverageFor(work).filter((entry) => entry.state !== 'complete'), pendingCoverage: criteria.filter((entry) => !candidate?.checked.includes(entry.id)).map((entry) => entry.id),
    candidate: candidate ? { ...candidate, draftHash: run.draftHash } : null,
  };
}
