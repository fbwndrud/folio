import { canonicalJson } from '../util/hash.js';
import { normalizeSubject } from './subject-schema.js';
import { invalid } from './schema.js';
import { normalizedPlanContent } from './plan.js';

const same = (left, right) => canonicalJson(left) === canonicalJson(right);
// fixed의 사용자 확정 값은 기준의 의미·형태·범위와 분리한다.
const criterionIdentity = ({ expectedValue: _expectedValue, ...definition }) => definition;

export function assertAdditivePlan(previous, next) {
  if (!previous) throw invalid('additions require an approved plan');
  const { criteria: oldCriteria, subjectKinds: oldKinds, ...oldRest } = normalizedPlanContent(previous);
  const { criteria: newCriteria, subjectKinds: newKinds, ...newRest } = normalizedPlanContent(next);
  if (!same(oldRest, newRest) || oldKinds.some((kind) => !newKinds.includes(kind))) throw invalid('additions cannot replace plan content');
  for (const criterion of oldCriteria) {
    if (!same(criterion, newCriteria.find((entry) => entry.id === criterion.id))) throw invalid('additions cannot change or remove existing criteria');
  }
  const added = newCriteria.filter((entry) => !oldCriteria.some((old) => old.id === entry.id));
  if (newKinds.some((kind) => !oldKinds.includes(kind) && !added.some((criterion) => criterion.subjectKinds.includes(kind)))) throw invalid('new subject kinds require an added criterion');
  return added;
}

export const legacyEntitiesFor = (work) => new Map([...work.entities].filter(([, entity]) => !entity.managed));

export function assertCriterionIdentity(definitions, next, source, previous) {
  for (const criterion of next.criteria) {
    if (source === 'host' && definitions.has(criterion.id) && !previous?.criteria.some((entry) => entry.id === criterion.id)) throw invalid('host cannot reactivate retired criteria');
    if (definitions.has(criterion.id) && !same(criterionIdentity(definitions.get(criterion.id)), criterionIdentity(criterion))) throw invalid('stable criterion ID cannot change meaning, type or scope');
  }
}

export function applySubjectDefinitions(subjects, next, changes, legacyEntities, source) {
  if (!Array.isArray(changes)) throw invalid('subjects require an array');
  const result = new Map(subjects);
  const changedIds = new Set();
  for (const input of changes) {
    if (changedIds.has(input.id)) throw invalid('duplicate subject change');
    changedIds.add(input.id);
    const subject = normalizeSubject(input, { subjectKinds: next.subjectKinds, subjects: [...result.values()], legacyEntities });
    if (!same(subject, input)) throw invalid('recorded subject must match normalized definition');
    const previous = subjects.get(subject.id);
    if (previous) {
      if (source === 'host') throw invalid('host cannot update existing subjects');
      const identity = ({ name: _name, aliases: _aliases, rev: _rev, ...rest }) => rest;
      if (!same(identity(previous), identity(subject))) throw invalid('same subject ID can only change display name and aliases');
    }
    result.set(subject.id, subject);
  }
  return result;
}

/** 제안은 승인·위임 기록을 만들지 않고 선언의 연속성만 검사한다. */
export function validateProposedDefinitions(work, proposal) {
  const definitions = new Map([...work.tracking.records.flatMap((record) => record.plan?.criteria ?? []),
    ...(work.tracking.batches ?? []).flatMap((batch) => batch.criteria)].map((criterion) => [criterion.id, criterion]));
  assertCriterionIdentity(definitions, proposal.plan, 'proposal', work.tracking.plan);
  applySubjectDefinitions(new Map(work.tracking.subjects.map((subject) => [subject.id, subject])), proposal.plan, proposal.subjects, legacyEntitiesFor(work), 'proposal');
}
