import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { assertDelegation } from './authority.js';
import { legacyEntitiesFor } from './definition-changes.js';
import { normalizeCriterion } from './criterion-schema.js';
import { normalizePlan, normalizedPlanContent } from './plan.js';
import { normalizeSubject } from './subject-schema.js';
import { criterionAppliesTo, normalizeObservation } from './observation-schema.js';
import { mergeManagedSubjects } from './subjects.js';
import { assertJson, fields, HASH, id, invalid, strings } from './schema.js';

/** 확정 재생과 후보가 공유할 선언 접기. 버전·위치·시각은 실효 rev에 들어가지 않는다. */
export function planWithCriteria(plan, criteria, nodeIds) {
  const content = normalizedPlanContent(plan);
  return { ...normalizePlan({ ...content, version: plan.version, criteria: [...content.criteria, ...criteria],
    subjectKinds: [...new Set([...content.subjectKinds, ...criteria.flatMap((entry) => entry.subjectKinds)])] }, { nodeIds }), grantId: plan.grantId };
}

/** staging과 운영 메타데이터를 제외하고 검토할 선언·관찰·명시 확인·활성 위임을 묶는다. */
export function trackingCandidateDigest(candidate) {
  const { basePlanRev, effectivePlanRev, subjects, criteria, observations, checked, grantId } = candidate;
  return sha256(canonicalJson({ basePlanRev, effectivePlanRev, subjects, criteria, observations, checked, grantId }));
}

function additions(work, answer, nodeId, text) {
  const plan = work.tracking.plan;
  const historyIds = new Set([...(work.tracking.records ?? []).flatMap((record) => record.plan?.criteria ?? []),
    ...(work.tracking.batches ?? []).flatMap((batch) => batch.criteria),
    ...plan.criteria].map((entry) => entry.id));
  const criteria = [];
  for (const input of answer.discoveries.criteria) {
    const criterion = normalizeCriterion(input, { nodeIds: [...work.tree.nodes.keys()] });
    if (historyIds.has(criterion.id)) throw invalid('criterion discovery cannot reuse a declared ID');
    if (criterion.behavior === 'fixed') throw new FolioError('TRACKING_FIXED_CRITERION_REQUIRES_DECISION', 'fixed criterion discovery requires a separate user plan decision');
    historyIds.add(criterion.id);
    criteria.push(criterion);
  }
  const effectivePlan = planWithCriteria(plan, criteria, [...work.tree.nodes.keys()]);
  const subjects = [];
  const known = new Set([...work.entities.keys(), ...work.tracking.subjects.map((subject) => subject.id)]);
  for (const input of answer.discoveries.subjects) {
    fields(input, ['id', 'kind', 'name', 'aliases', 'body', 'data', 'evidence', 'rev'], 'subject');
    if (known.has(input.id)) throw new FolioError('TRACKING_ENTITY_COLLISION', `subject ID already exists: ${input.id}`);
    const subject = normalizeSubject(input, { subjectKinds: effectivePlan.subjectKinds, legacyEntities: legacyEntitiesFor(work),
      subjects: [...work.tracking.subjects, ...subjects], nodeId, text });
    known.add(subject.id);
    subjects.push(subject);
  }
  return { criteria, subjects, effectivePlan };
}

/** 추출은 정본 쓰기를 하지 않는다. 보충의 부족 권한은 실제 metadata 결정 단계로만 넘긴다. */
export function prepareTracking(work, _run, answer, { nodeId, text, mode = 'normal' }) {
  assertJson(answer);
  fields(answer, ['planRev', 'discoveries', 'observations', 'checked'], 'tracking answer');
  fields(answer.discoveries, ['subjects', 'criteria'], 'discoveries');
  if (!Array.isArray(answer.discoveries.subjects) || !Array.isArray(answer.discoveries.criteria) || !Array.isArray(answer.observations)) throw invalid('tracking discoveries and observations require arrays');
  id(nodeId, 'nodeId');
  if (!['normal', 'tracking-backfill'].includes(mode) || typeof text !== 'string' || !work.tree.nodes.has(nodeId) || !HASH.test(answer.planRev) || !work.tracking.plan) throw invalid('tracking requires an active plan, known node, text and supported mode');
  const plan = work.tracking.plan;
  if (answer.planRev !== plan.rev) throw new FolioError('TRACKING_REV_STALE', 'tracking answer uses an outdated plan');
  const { criteria, subjects, effectivePlan } = additions(work, answer, nodeId, text);
  const entities = new Map(work.entities);
  for (const subject of subjects) entities.set(subject.id, { ...subject, managed: true, path: null, storage: 'tracking' });
  const observations = answer.observations.map((input) => normalizeObservation(input, { entities, criteria: effectivePlan.criteria, nodeId, text }));
  const checked = strings(answer.checked, 'checked', { ids: true });
  if (checked.some((criterionId) => !effectivePlan.criteria.some((criterion) => criterion.id === criterionId && criterionAppliesTo(criterion, nodeId)))) throw invalid('checked requires current applicable criterion IDs');
  const requiredPermissions = [...(subjects.length ? ['addSubjects'] : []), ...(criteria.length ? ['addCriteria'] : []),
    ...(observations.length ? ['addObservations'] : []), ...(mode === 'tracking-backfill' ? ['backfill'] : [])];
  const missingPermissions = requiredPermissions.filter((action) => {
    try { assertDelegation(plan, action, plan.grantId); return false; }
    catch (error) { if (error.code !== 'TRACKING_DELEGATION_REQUIRED') throw error; return true; }
  });
  if (mode === 'normal' && missingPermissions.length) assertDelegation(plan, missingPermissions[0], plan.grantId);
  const candidate = JSON.parse(canonicalJson({ basePlanRev: plan.rev, effectivePlanRev: effectivePlan.rev,
    subjects, criteria, observations, checked, grantId: plan.grantId }));
  return { ...candidate, batchDigest: trackingCandidateDigest(candidate), requiredPermissions, missingPermissions,
    staged: missingPermissions.length > 0 };
}

/** 모델 검토와 결정론 검사에만 사용하는 실행 내 투영. 정본이나 다른 실행에 후보를 노출하지 않는다. */
export function virtualTrackingWork(work, candidate) {
  const plan = planWithCriteria(work.tracking.plan, candidate.criteria, [...work.tree.nodes.keys()]);
  const subjects = [...work.tracking.subjects, ...candidate.subjects];
  const subjectKinds = [...new Set([...plan.subjectKinds, ...subjects.map((subject) => subject.kind)])];
  const entities = mergeManagedSubjects(legacyEntitiesFor(work), subjects, subjectKinds);
  return { ...work, entities, tracking: { ...work.tracking, plan, subjects,
    observations: [...work.tracking.observations, ...candidate.observations] } };
}
