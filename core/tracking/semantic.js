import { canonicalJson, sha256 } from '../util/hash.js';

const digest = (value) => sha256(canonicalJson(value));
const sorted = (values) => [...values].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));

/** 순서·운영 포인터가 아닌 기준 선언의 의미를 대조한다. */
export function criterionDigest(criterion) {
  return digest({ ...criterion, subjectKinds: sorted(criterion.subjectKinds),
    appliesTo: Array.isArray(criterion.appliesTo) ? sorted(criterion.appliesTo) : criterion.appliesTo });
}

/** 관찰의 provenance 운영 포인터는 snapshot 변화로 세지 않는다. */
export function snapshotDigest(snapshot) {
  const observations = snapshot.observations.map(({ subjectId, criterionId, value, basis, perspectiveId, timeLabel, pathLabel, evidence }) => ({
    subjectId, criterionId, value, basis, ...(perspectiveId === undefined ? {} : { perspectiveId }),
    ...(timeLabel === undefined ? {} : { timeLabel }), ...(pathLabel === undefined ? {} : { pathLabel }), evidence,
  }));
  return digest({ observations: sorted(observations), checked: [...new Set(snapshot.checked)].sort() });
}

/** base 위치 이전의 마지막 계획과 추가 기준은 당시 검사한 선언이다. */
export function batchCriteria(tracking, batch) {
  let criteria = [];
  for (const record of tracking.records) {
    if (record.seq > batch.baseTrackingSeq) break;
    if (record.type === 'tracking_plan') criteria = record.plan.criteria;
    else if (record.type === 'tracking_batch' && tracking.batches.some((b) => b.receiptId === record.receiptId)) criteria = [...criteria, ...record.criteria];
  }
  return [...criteria, ...batch.criteria];
}

export function currentBatchSnapshot(tracking, batch) {
  const historical = new Map(batchCriteria(tracking, batch).map((criterion) => [criterion.id, criterionDigest(criterion)]));
  const valid = new Set(tracking.plan?.criteria.filter((criterion) => historical.get(criterion.id) === criterionDigest(criterion)).map((criterion) => criterion.id));
  return { ...batch, checked: batch.checked.filter((id) => valid.has(id)), observations: batch.observations.filter((entry) => valid.has(entry.criterionId)) };
}
