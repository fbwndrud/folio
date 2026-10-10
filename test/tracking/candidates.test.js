import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareTracking, virtualTrackingWork } from '../../core/tracking/candidates.js';
import { normalizePlan, normalizedPlanContent } from '../../core/tracking/plan.js';
import { normalizeSubject } from '../../core/tracking/subject-schema.js';
import { buildProposal, normalizeProposal } from '../../core/tracking/proposals.js';
import { sha256 } from '../../core/util/hash.js';
import { trackingPlan, trackingCriterion } from '../support/tracking.js';

const text = '합성 열쇠는 파랑이다. 합성 주인은 민이다.';
const evidence = (quote = '열쇠') => ({ nodeId: 'scene', textHash: sha256(text), quote });
const subject = (overrides = {}) => ({ id: 'key', kind: 'object', name: '합성 열쇠', aliases: [], body: '', data: {}, evidence: evidence(), ...overrides });
const workFor = (overrides = {}) => {
  const plan = { ...normalizePlan(trackingPlan({ delegation: { addSubjects: true, addCriteria: true, addObservations: true, backfill: true }, ...overrides }), { nodeIds: ['scene', 'other'] }), grantId: 'decision-1' };
  return { entities: new Map([['person', { id: 'person', kind: 'person', name: '합성 민', aliases: ['합성 별칭'], body: '', data: {} }]]),
    tree: { nodes: new Map([['scene', { id: 'scene' }], ['other', { id: 'other' }]]) }, tracking: { plan, subjects: [], observations: [], records: [], batches: [] } };
};
const answerFor = (work, overrides = {}) => ({ planRev: work.tracking.plan.rev, discoveries: { subjects: [subject()], criteria: [] },
  observations: [{ subjectId: 'key', criterionId: 'owner', value: '민', basis: 'explicit', evidence: evidence('주인') }], checked: ['owner'], ...overrides });
const prepare = (work, answer = answerFor(work), options = {}) => prepareTracking(work, {}, answer, { nodeId: 'scene', text, ...options });
const invalid = { code: 'TRACKING_INPUT_INVALID' };

test('candidate is pure and rejected drafts do not leak; managed rev is stable', () => {
  const work = workFor();
  const before = structuredClone(work);
  const candidate = prepare(work);
  assert.deepEqual(work, before);
  assert.equal(candidate.basePlanRev, candidate.effectivePlanRev);
  assert.deepEqual(candidate.checked, ['owner']);
  const virtual = virtualTrackingWork(work, candidate);
  assert.equal(virtual.entities.get('key').managed, true);
  assert.equal(virtual.entities.get('key').path, null);
  assert.equal(virtual.entities.get('key').storage, 'tracking');
  assert.equal(candidate.subjects[0].rev, normalizeSubject(subject(), { subjectKinds: ['object'] }).rev);
  assert.equal(work.entities.has('key'), false);
  assert.equal(virtualTrackingWork(work, prepare(work, answerFor(work, { discoveries: { subjects: [], criteria: [] }, observations: [] }))).entities.has('key'), false);
});

test('candidate criteria allow declared arbitrary kinds and effective rev equals canonical plan normalization', () => {
  const work = workFor();
  const criterion = trackingCriterion({ id: 'temperature', subjectKinds: ['recipe-stage'], valueType: 'number' });
  const answer = answerFor(work, { discoveries: { subjects: [subject({ kind: 'recipe-stage' })], criteria: [criterion] },
    observations: [{ subjectId: 'key', criterionId: 'temperature', value: 18, basis: 'explicit', evidence: evidence() }], checked: ['temperature'] });
  const candidate = prepare(work, answer);
  const final = normalizePlan({ ...normalizedPlanContent(work.tracking.plan), subjectKinds: ['object', 'recipe-stage'], criteria: [...work.tracking.plan.criteria, criterion], version: 98 }, { nodeIds: ['scene', 'other'] });
  assert.equal(candidate.effectivePlanRev, final.rev);
  assert.equal(virtualTrackingWork(work, candidate).tracking.plan.rev, final.rev);
});

test('collisions across legacy and managed IDs/names/aliases reject without autoload', () => {
  const work = workFor();
  for (const s of [subject({ id: 'person' }), subject({ name: '합성 민' }), subject({ aliases: ['합성 별칭'] })]) {
    assert.throws(() => prepare(work, answerFor(work, { discoveries: { subjects: [s], criteria: [] } })), { code: 'TRACKING_ENTITY_COLLISION' });
  }
  for (const subjects of [[subject(), subject()], [subject(), subject({ id: 'second' })]]) {
    assert.throws(() => prepare(work, answerFor(work, { discoveries: { subjects, criteria: [] } })), { code: 'TRACKING_ENTITY_COLLISION' });
  }
  const candidate = prepare(work);
  const canonical = virtualTrackingWork(work, candidate);
  assert.throws(() => prepare(canonical), { code: 'TRACKING_ENTITY_COLLISION' });
  assert.throws(() => prepare(work, answerFor(work, { discoveries: { subjects: [subject({ kind: 'undeclared' })], criteria: [] } })), invalid);
});

test('observations validate known subjects, criteria, applicable kinds and references atomically', () => {
  for (const observation of [
    { subjectId: 'missing' }, { criterionId: 'missing' }, { subjectId: 'person' }, { perspectiveId: 'missing', basis: 'attributed' },
    { basis: 'attributed' }, { basis: 'belief' }, { value: 3 }, { imageId: 'invented' },
  ]) {
    const work = workFor(); const answer = answerFor(work);
    answer.observations.push({ ...answer.observations[0], ...observation });
    assert.throws(() => prepare(work, answer), invalid);
    assert.equal(work.entities.has('key'), false);
  }
  const work = workFor({ criteria: [trackingCriterion({ appliesTo: ['other'] })] });
  assert.throws(() => prepare(work), invalid);
  for (const checked of [['missing'], ['owner', 'owner'], 'owner']) assert.throws(() => prepare(workFor(), answerFor(workFor(), { checked })), invalid);
});

test('entity and entity-list values require known entity IDs; attributed perspectives persist', () => {
  for (const valueType of ['entity', 'entity-list']) {
    const work = workFor({ criteria: [trackingCriterion({ valueType })] });
    const answer = answerFor(work);
    answer.observations[0] = { ...answer.observations[0], value: valueType === 'entity' ? 'person' : ['person', 'key'], basis: 'attributed', perspectiveId: 'person', timeLabel: '전날', pathLabel: '주장' };
    const candidate = prepare(work, answer);
    assert.equal(candidate.observations[0].basis, 'attributed');
    assert.equal(candidate.observations[0].perspectiveId, 'person');
    answer.observations[0].value = valueType === 'entity' ? 'missing' : ['person', 'missing'];
    assert.throws(() => prepare(work, answer), invalid);
    answer.observations[0].value = valueType === 'entity' ? ['person'] : 'person';
    assert.throws(() => prepare(work, answer), invalid);
  }
});

test('observation and discovery evidence reject wrong hash/node, missing, ambiguous or oversized quotes', () => {
  for (const changes of [{ nodeId: 'other' }, { textHash: sha256('wrong') }, { quote: '없는 것' }, { quote: '' }, { quote: '가'.repeat(501) }, { before: 'wrong' }]) {
    const work = workFor(); const answer = answerFor(work);
    answer.observations[0].evidence = { ...evidence(), ...changes };
    assert.throws(() => prepare(work, answer), invalid);
    answer.observations = []; answer.discoveries.subjects[0].evidence = { ...evidence(), ...changes };
    assert.throws(() => prepare(work, answer), invalid);
  }
  const work = workFor(); const repeated = '앞 열쇠 뒤 열쇠 끝';
  const answer = answerFor(work, { observations: [] });
  answer.discoveries.subjects[0].evidence = { nodeId: 'scene', textHash: sha256(repeated), quote: '열쇠' };
  assert.throws(() => prepare(work, answer, { text: repeated }), invalid);
  answer.discoveries.subjects[0].evidence.before = '앞 ';
  assert.equal(prepare(work, answer, { text: repeated }).subjects.length, 1);
  const long = '가'.repeat(500);
  answer.discoveries.subjects[0].evidence = { nodeId: 'scene', textHash: sha256(long), quote: long };
  assert.equal(prepare(work, answer, { text: long }).subjects.length, 1);
});

test('fixed explicit mismatch is an unconditional lock; attributed and inferred remain distinct', () => {
  const work = workFor({ criteria: [trackingCriterion({ behavior: 'fixed', expectedValue: '파랑' })] });
  const answer = answerFor(work);
  for (const mode of ['normal', 'tracking-backfill']) assert.throws(() => prepare(work, answer, { mode }), { code: 'TRACKING_FIXED_VALUE_CONFLICT' });
  for (const basis of ['attributed', 'inferred']) {
    answer.observations[0] = { ...answer.observations[0], basis, ...(basis === 'attributed' ? { perspectiveId: 'person' } : {}) };
    assert.equal(prepare(work, answer).observations[0].basis, basis);
  }
  const fixed = trackingCriterion({ id: 'color', behavior: 'fixed', expectedValue: '파랑' });
  answer.discoveries.criteria = [fixed];
  assert.throws(() => prepare(work, answer), { code: 'TRACKING_FIXED_CRITERION_REQUIRES_DECISION' });
  assert.throws(() => prepare(work, answer, { mode: 'tracking-backfill' }), { code: 'TRACKING_FIXED_CRITERION_REQUIRES_DECISION' });
});

test('normal requires each distinct grant; backfill stages missing permissions without creating authority', () => {
  for (const action of ['addSubjects', 'addCriteria', 'addObservations']) {
    const work = workFor({ delegation: { addSubjects: true, addCriteria: true, addObservations: true, [action]: false } });
    const answer = answerFor(work);
    answer.discoveries.criteria = [trackingCriterion({ id: 'location' })];
    assert.throws(() => prepare(work, answer), { code: 'TRACKING_DELEGATION_REQUIRED' });
  }
  const denied = workFor({ delegation: {} });
  const staged = prepare(denied, answerFor(denied), { mode: 'tracking-backfill' });
  assert.equal(staged.staged, true);
  assert.deepEqual(staged.requiredPermissions, ['addSubjects', 'addObservations', 'backfill']);
  assert.deepEqual(staged.missingPermissions, staged.requiredPermissions);
  assert.equal(staged.grantId, denied.tracking.plan.grantId);
  assert.equal(Object.hasOwn(staged, 'source'), false);
  const empty = prepare(denied, answerFor(denied, { discoveries: { subjects: [], criteria: [] }, observations: [] }), { mode: 'tracking-backfill' });
  assert.deepEqual(empty.requiredPermissions, ['backfill']);
  assert.deepEqual(empty.checked, ['owner']);
});

test('snapshot digest excludes operational metadata and staging and binds every semantic component', () => {
  const work = workFor(); const first = prepare(work);
  work.tracking.plan.version += 1;
  assert.equal(first.batchDigest, prepareTracking(work, { at: 'later', runId: 'later' }, answerFor(work), { nodeId: 'scene', text }).batchDigest);
  assert.equal(first.batchDigest, prepare(work, answerFor(work), { mode: 'tracking-backfill' }).batchDigest);
  for (const changes of [{ checked: [] }, { observations: [] }, { discoveries: { subjects: [subject({ data: { color: 'blue' } })], criteria: [] } }]) {
    assert.notEqual(first.batchDigest, prepare(work, answerFor(work, changes)).batchDigest);
  }
  work.tracking.plan.grantId = 'decision-2';
  assert.notEqual(first.batchDigest, prepare(work).batchDigest);
});

test('malformed envelopes, stale plans, repeated criteria and proposal null items have stable errors', () => {
  const work = workFor();
  for (const answer of [null, {}, answerFor(work, { extra: true }), answerFor(work, { observations: [null] }), answerFor(work, { discoveries: { subjects: [null], criteria: [] } }), answerFor(work, { discoveries: { subjects: [], criteria: [null] } }), answerFor(work, { discoveries: { subjects: [], criteria: [trackingCriterion()] } })]) assert.throws(() => prepare(work, answer), invalid);
  assert.throws(() => prepare(work, answerFor(work, { planRev: sha256('stale') })), { code: 'TRACKING_REV_STALE' });
  assert.throws(() => prepare(work, answerFor(work), { mode: 'invented' }), invalid);
  assert.throws(() => buildProposal(work, { expectedRev: work.tracking.plan.rev, changes: { criteria: [null] } }), invalid);
  assert.throws(() => normalizeProposal({ expectedRev: work.tracking.plan.rev, baseVersion: 1, mode: 'addition', plan: { ...normalizedPlanContent(work.tracking.plan), version: 2 }, subjects: [subject(), null] }, { nodeIds: ['scene', 'other'] }), invalid);
});
