import { canonicalJson, sha256 } from '../util/hash.js';
import { normalizeCriterion } from './criterion-schema.js';
import { assertJson, fields, invalid, strings, text } from './schema.js';

export const DELEGATION_ACTIONS = ['addSubjects', 'addCriteria', 'addObservations', 'backfill'];

function interview(input) {
  fields(input, ['summary', 'answers'], 'interview');
  if (!Array.isArray(input.answers) || !input.answers.length) throw invalid('interview requires answers');
  return {
    summary: text(input.summary, 'interview.summary'),
    answers: input.answers.map((entry) => {
      fields(entry, ['question', 'answer'], 'interview answer');
      text(entry.question, 'interview.question'); text(entry.answer, 'interview.answer');
      return { question: entry.question, answer: entry.answer };
    }),
  };
}

export function normalizePlan(input, { nodeIds = [] } = {}) {
  assertJson(input);
  fields(input, ['planId', 'version', 'rev', 'purpose', 'audience', 'priorities', 'subjectKinds', 'criteria', 'delegation', 'interview'], 'plan');
  if (input.planId !== 'main') throw invalid('planId must be main');
  const version = input.version === undefined ? 1 : input.version;
  if (!Number.isSafeInteger(version) || version < 1) throw invalid('plan.version must be a positive integer');
  const delegation = input.delegation === undefined ? {} : input.delegation;
  fields(delegation, DELEGATION_ACTIONS, 'delegation');
  if (Object.values(delegation).some((value) => typeof value !== 'boolean')) throw invalid('delegation requires boolean flags');
  if (!Array.isArray(input.criteria)) throw invalid('plan.criteria requires an array');
  const criteria = input.criteria.map((entry) => normalizeCriterion(entry, { nodeIds }));
  if (new Set(criteria.map((entry) => entry.id)).size !== criteria.length) throw invalid('criterion IDs must be unique');
  const subjectKinds = strings(input.subjectKinds, 'plan.subjectKinds', { nonempty: true });
  if (criteria.some((entry) => entry.subjectKinds.some((kind) => !subjectKinds.includes(kind)))) throw invalid('criterion references an undeclared subject kind');
  const content = {
    planId: 'main', purpose: text(input.purpose, 'plan.purpose'), audience: text(input.audience, 'plan.audience'),
    priorities: strings(input.priorities, 'plan.priorities'), subjectKinds, criteria,
    delegation: Object.fromEntries(DELEGATION_ACTIONS.map((action) => [action, delegation[action] ?? false])),
    ...(Object.hasOwn(input, 'interview') ? { interview: interview(input.interview) } : {}),
  };
  return { ...content, version, rev: sha256(canonicalJson(content)) };
}

/** 재생 메타데이터를 제외한 실효 선언 내용만 hash에 포함한다. */
export function normalizedPlanContent(plan) {
  assertJson(plan);
  const { version: _v, rev: _r, grantId: _g, at: _a, seq: _s, prev: _p, hash: _h, ...content } = plan;
  const nodeIds = [...new Set((content.criteria ?? []).flatMap((criterion) => Array.isArray(criterion.appliesTo) ? criterion.appliesTo : []))];
  const { version: _version, rev: _rev, ...normalized } = normalizePlan(content, { nodeIds });
  return normalized;
}
export const planRevision = (plan) => sha256(canonicalJson(normalizedPlanContent(plan)));
