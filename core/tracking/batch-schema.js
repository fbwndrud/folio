import { canonicalJson } from '../util/hash.js';
import { planWithCriteria, trackingCandidateDigest } from './candidates.js';
import { assertDelegation } from './authority.js';
import { normalizeCriterion } from './criterion-schema.js';
import { normalizeSubject } from './subject-schema.js';
import { normalizeObservation, criterionAppliesTo } from './observation-schema.js';
import { assertJson, fields, HASH, id, invalid, strings } from './schema.js';

export const BATCH_FIELDS = ['receiptId', 'runId', 'nodeId', 'committedHash', 'basePlanVersion', 'baseTrackingSeq', 'basePlanRev', 'effectivePlanRev',
  'subjects', 'criteria', 'observations', 'checked', 'batchDigest', 'grantId', 'requiredPermissions', 'missingPermissions', 'staged', 'draftHash'];
export const recordBody = ({ type: _type, seq: _seq, at: _at, prev: _prev, hash: _hash, ...body }) => body;
export const sameTracking = (left, right) => canonicalJson(left) === canonicalJson(right);

/** 기록장 위치와 분리된 batch 봉투. 과거 원문은 evidence hash로 보존한다. */
export function assertBatchShape(batch) {
  const backfill = batch.mode === 'tracking-backfill';
  assertJson(batch); fields(batch, backfill ? [...BATCH_FIELDS, 'mode', 'commitReceiptId', 'authority'] : BATCH_FIELDS, 'tracking batch');
  if (backfill) id(batch.commitReceiptId, 'commitReceiptId');
  for (const field of ['receiptId', 'runId', 'nodeId', 'grantId']) id(batch[field], field);
  for (const field of ['committedHash', 'basePlanRev', 'effectivePlanRev', 'batchDigest', 'draftHash']) {
    if (!HASH.test(batch[field])) throw invalid(`invalid batch ${field}`);
  }
  if (batch.committedHash !== batch.draftHash || !Number.isSafeInteger(batch.basePlanVersion) || batch.basePlanVersion < 1 || !Number.isSafeInteger(batch.baseTrackingSeq) || batch.baseTrackingSeq < 1
    || !Array.isArray(batch.subjects) || !Array.isArray(batch.criteria) || !Array.isArray(batch.observations)
    || (backfill ? typeof batch.staged !== 'boolean' || !Array.isArray(batch.missingPermissions) : batch.staged !== false || !sameTracking(batch.missingPermissions, []))) throw invalid('invalid batch envelope');
  strings(batch.checked, 'checked', { ids: true });
  if (trackingCandidateDigest(batch) !== batch.batchDigest) throw invalid('tracking batch digest mismatch');
  for (const entry of [...batch.subjects, ...batch.observations]) {
    if (entry?.evidence?.nodeId !== batch.nodeId || entry.evidence.textHash !== batch.committedHash) throw invalid('batch evidence does not bind its committed body');
  }
}

/** 원래 활성 계획에서 검사한다. 오늘의 fixed 값으로 정당한 과거 관찰을 재판정하지 않는다. */
export function validateHistoricalBatch(batch, { plan, subjects, records, nodeIds = [], legacyEntities = new Map() }) {
  assertBatchShape(batch);
  if (!plan || batch.basePlanRev !== plan.rev || batch.basePlanVersion !== plan.version || batch.grantId !== plan.grantId) throw invalid('tracking batch historical base mismatch');
  const declared = new Set(records.flatMap((r) => r.plan?.criteria ?? r.criteria ?? []).map((c) => c.id));
  const criteria = batch.criteria.map((entry) => {
    const normalized = normalizeCriterion(entry, { nodeIds });
    if (declared.has(entry.id) || entry.behavior === 'fixed') throw invalid('batch cannot redefine criteria or add fixed criteria');
    declared.add(entry.id); return normalized;
  });
  const next = planWithCriteria(plan, criteria, nodeIds);
  const known = new Map(legacyEntities);
  for (const entry of subjects) known.set(entry.id, entry);
  const added = [];
  for (const entry of batch.subjects) {
    if (known.has(entry.id)) throw invalid('batch subject ID already exists');
    const normalized = normalizeSubject(entry, { subjectKinds: next.subjectKinds, legacyEntities, subjects: [...subjects, ...added] });
    added.push(normalized); known.set(entry.id, normalized);
  }
  const observations = batch.observations.map((entry) => normalizeObservation(entry, { entities: known, criteria: next.criteria, nodeId: batch.nodeId, text: undefined }));
  if (batch.checked.some((criterionId) => !next.criteria.some((c) => c.id === criterionId && criterionAppliesTo(c, batch.nodeId)))) throw invalid('batch checked contains an inapplicable criterion');
  if (batch.mode === 'tracking-backfill' && next.criteria.some((c) => criterionAppliesTo(c, batch.nodeId) && !batch.checked.includes(c.id))) throw invalid('backfill batch must check all applicable criteria');
  const permissions = [...(added.length ? ['addSubjects'] : []), ...(criteria.length ? ['addCriteria'] : []), ...(observations.length ? ['addObservations'] : []), ...(batch.mode === 'tracking-backfill' ? ['backfill'] : [])];
  const missing = permissions.filter((action) => {
    try { assertDelegation(plan, action, batch.grantId); return false; } catch (error) { if (error.code !== 'TRACKING_DELEGATION_REQUIRED') throw error; return true; }
  });
  if (batch.mode !== 'tracking-backfill' && missing.length) assertDelegation(plan, missing[0], batch.grantId);
  if (!sameTracking(batch.missingPermissions, missing) || batch.staged !== Boolean(missing.length)) throw invalid('historical batch permissions differ');
  if (!sameTracking(batch.subjects, added) || !sameTracking(batch.criteria, criteria) || !sameTracking(batch.observations, observations)
    || !sameTracking(batch.requiredPermissions, permissions) || next.rev !== batch.effectivePlanRev) throw invalid('batch differs from normalized historical candidate');
  return { plan: next, subjects: [...subjects, ...added] };
}
