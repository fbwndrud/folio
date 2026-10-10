import { canonicalJson, sha256 } from '../util/hash.js';
import { normalizePlan, normalizedPlanContent } from './plan.js';
import { normalizeSubject } from './subject-schema.js';
import { assertJson, fields, HASH, invalid } from './schema.js';
import { legacyEntitiesFor } from './definition-changes.js';

export const proposalDigest = (proposal) => sha256(canonicalJson(proposal));

export function normalizeProposal(input, { nodeIds = [], legacyEntities = null, subjects = [], nodes = null, evidence = true } = {}) {
  assertJson(input);
  fields(input, ['expectedRev', 'baseVersion', 'mode', 'plan', 'subjects'], 'proposal');
  if (input.expectedRev !== null && !HASH.test(input.expectedRev)) throw invalid('expectedRev requires null or a plan hash');
  if (!Number.isSafeInteger(input.baseVersion) || input.baseVersion < 0 || !['replacement', 'addition'].includes(input.mode)) throw invalid('invalid proposal version or mode');
  const plan = normalizePlan(input.plan, { nodeIds });
  if (plan.version !== input.baseVersion + 1 || !Array.isArray(input.subjects)) throw invalid('invalid proposal plan version or subjects');
  const normalizedSubjects = [];
  for (const subject of input.subjects) fields(subject, ['id', 'kind', 'name', 'aliases', 'body', 'data', 'evidence', 'rev'], 'subject');
  for (const subject of input.subjects) {
    if (normalizedSubjects.some((prior) => prior.id === subject.id)) throw invalid('duplicate subject change');
    const previous = subjects.find((prior) => prior.id === subject.id);
    const retainedEvidence = previous && canonicalJson(previous.evidence) === canonicalJson(subject.evidence);
    normalizedSubjects.push(normalizeSubject(subject, { subjectKinds: plan.subjectKinds, legacyEntities,
      subjects: [...subjects.filter((prior) => !input.subjects.some((s) => s.id === prior.id)), ...normalizedSubjects], ...(evidence && !retainedEvidence ? { nodes } : {}) }));
  }
  return { expectedRev: input.expectedRev, baseVersion: input.baseVersion, mode: input.mode, plan, subjects: normalizedSubjects };
}

export function buildProposal(work, input) {
  const current = work.tracking.plan;
  let declaration; let subjects = []; let mode = 'replacement';
  if (input.plan !== undefined) declaration = input.plan;
  else {
    fields(input.changes, ['subjects', 'criteria', 'plan'], 'changes');
    subjects = input.changes.subjects ?? [];
    const criteria = input.changes.criteria ?? [];
    if (!Array.isArray(subjects) || !Array.isArray(criteria)) throw invalid('changes subjects and criteria require arrays');
    for (const criterion of criteria) fields(criterion, ['id', 'title', 'instruction', 'subjectKinds', 'valueType', 'behavior', 'appliesTo', 'expectedValue'], 'criterion');
    if (input.changes.plan !== undefined) {
      if (criteria.length) throw invalid('replacement plan cannot also add criteria');
      declaration = input.changes.plan;
    } else {
      if (!current || (!subjects.length && !criteria.length)) throw invalid('additions require an active plan and nonempty changes');
      if (criteria.some((entry) => current.criteria.some((old) => old.id === entry.id))) throw invalid('criterion additions cannot reuse existing IDs');
      const content = normalizedPlanContent(current);
      declaration = { ...content, criteria: [...content.criteria, ...criteria],
        subjectKinds: [...new Set([...content.subjectKinds, ...criteria.flatMap((entry) => entry.subjectKinds ?? [])])] };
      mode = 'addition';
    }
  }
  return normalizeProposal({ expectedRev: input.expectedRev, baseVersion: current?.version ?? 0, mode,
    plan: { ...declaration, version: (current?.version ?? 0) + 1 }, subjects }, {
    nodeIds: [...work.tree.nodes.keys()], nodes: work.discoveryNodes ?? work.tree.nodes, legacyEntities: legacyEntitiesFor(work), subjects: work.tracking.subjects,
  });
}

export function proposalImpact(proposal, work) {
  const previous = work.tracking.plan;
  return { addedCriteria: proposal.plan.criteria.filter((c) => !previous?.criteria.some((p) => p.id === c.id)).map((c) => c.id),
    removedCriteria: (previous?.criteria ?? []).filter((c) => !proposal.plan.criteria.some((p) => p.id === c.id)).map((c) => c.id),
    subjects: proposal.subjects.map((s) => s.id), affectedNodeIds: [...work.tree.nodes.values()].filter((n) => n.status === 'committed').map((n) => n.id) };
}
