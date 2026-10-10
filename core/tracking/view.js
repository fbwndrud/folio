import { id, invalid } from './schema.js';
import { coverageFor } from './coverage.js';

export function trackingView(work) {
  return { plan: work.tracking.plan, subjects: work.tracking.subjects, observations: work.tracking.observations,
    coverage: coverageFor(work), historyCount: work.tracking.records.length };
}

/** 선택한 종류의 정본 순서에 대한 경계 있는 읽기. */
export function trackingQuery(work, input) {
  for (const key of ['subjectId', 'criterionId', 'nodeId']) if (input[key] !== undefined) id(input[key], key);
  const type = input.type ?? 'history';
  const limit = input.limit ?? 50;
  const cursor = input.cursor ?? '0';
  if (!['entities', 'observations', 'evidence', 'history'].includes(type)
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 200 || typeof cursor !== 'string' || !/^(0|[1-9][0-9]*)$/.test(cursor)
    || !Number.isSafeInteger(Number(cursor))) throw invalid('invalid query type, cursor or limit');
  const observations = work.tracking.observations.filter((entry) => (!input.subjectId || entry.subjectId === input.subjectId)
    && (!input.criterionId || entry.criterionId === input.criterionId) && (!input.nodeId || entry.evidence.nodeId === input.nodeId));
  const sources = {
    history: () => work.tracking.records.filter((record) =>
      (!input.subjectId || record.subjects?.some((s) => s.id === input.subjectId) || record.observations?.some((o) => o.subjectId === input.subjectId))
      && (!input.criterionId || record.plan?.criteria.some((c) => c.id === input.criterionId) || record.criteria?.some((c) => c.id === input.criterionId)
        || record.checked?.includes(input.criterionId) || record.observations?.some((o) => o.criterionId === input.criterionId))
      && (!input.nodeId || record.nodeId === input.nodeId || record.subjects?.some((s) => s.evidence.nodeId === input.nodeId))),
    entities: () => [...work.entities.values()].filter((entity) => (!input.subjectId || entity.id === input.subjectId)
      && (!input.criterionId || work.tracking.plan?.criteria.some((c) => c.id === input.criterionId && c.subjectKinds.includes(entity.kind)))
      && (!input.nodeId || entity.evidence?.nodeId === input.nodeId || observations.some((o) => o.subjectId === entity.id))),
    observations: () => observations,
    evidence: () => [
      ...sources.entities().filter((entity) => entity.evidence && (!input.nodeId || entity.evidence.nodeId === input.nodeId))
        .map(({ id, kind, name, evidence }) => ({ origin: 'subject', subjectId: id, kind, name, evidence })),
      ...observations.map((observation) => ({ origin: 'observation', ...observation })),
    ],
  };
  const entries = sources[type]();
  const offset = Number(cursor);
  if (offset > entries.length) throw invalid('cursor is outside the query result');
  return { type, entries: entries.slice(offset, offset + limit), nextCursor: offset + limit < entries.length ? String(offset + limit) : null };
}
