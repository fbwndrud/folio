import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openWork } from '../../core/store/work.js';
import { normalizePlan } from '../../core/tracking/plan.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { trackingPlan, trackingCriterion, appendPlan } from '../support/tracking.js';
import { editYaml } from '../support/recheck.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { canonicalJson } from '../../core/util/hash.js';
import { fakePack } from '../support/fake-pack.js';

const TEXT = '파란 열쇠는 문 옆에 있다.';
const at = (stepId) => (out) => out.status === 'needs_model' && out.requests[0].stepId === stepId;
const evidence = { nodeId: 'stairwell', textHash: sha256(TEXT), quote: '파란 열쇠' };
const answer = (payload, extra = {}) => ({ events: [], tracking: { planRev: payload.tracking.plan.rev,
  discoveries: { subjects: [], criteria: [] }, observations: [], checked: ['owner'], ...extra } });
const discovery = { id: 'key', kind: 'object', name: '파란 열쇠', aliases: [], body: '합성 물건', data: { color: 'blue' }, evidence };
async function setup({ plan = true, enabled = true } = {}) {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  if (plan) await appendPlan(root, normalizePlan(trackingPlan({ delegation: { addSubjects: true, addCriteria: true, addObservations: true } })));
  if (!enabled) await editYaml(root, (config) => { config.features = { tracking: false }; });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (payload) => payload.tracking ? answer(payload) : { events: [] } } });
  return { root, makeRunner, host };
}
const reach = async (setup, stepId) => (await driveToEnd(setup.makeRunner, setup.host, { start: { node: 'stairwell' }, until: at(stepId) })).at(-1);

test('old no-plan host and feature false preserve the old extract envelope and can commit', async () => {
  for (const options of [{ plan: false }, { enabled: false }]) {
    const s = await setup(options);
    const trail = await driveToEnd(s.makeRunner, s.host, { start: { node: 'stairwell' }, until: (out) => out.status === 'done' });
    assert.equal(trail.at(-1).status, 'done');
    assert.equal(Object.hasOwn(s.host.calls.find((call) => call.stepId === 'extract').payload, 'tracking'), false);
  }
});

test('effective tracking requires tracking and checked; failed answers never become candidates', async () => {
  for (const incomplete of [{ events: [] }, (p) => { const a = answer(p); delete a.tracking.checked; return a; }]) {
    const s = await setup(); s.host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': incomplete } });
    const asked = await reach(s, 'extract');
    assert.equal(asked.requests[0].payload.tracking.plan.planId, 'main');
    const retry = await s.makeRunner().resume({ runId: asked.runId, answers: s.host.answer(asked) });
    assert.equal(at('extract')(retry), true);
    assert.equal((await createRunStore(s.root).load(asked.runId)).outputs.tracking, undefined);
  }
});

test('discoveries validate events against virtual definitions and expose full data in review with bound refs', async () => {
  const s = await setup();
  s.host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => ({ ...answer(p, {
    discoveries: { subjects: [discovery], criteria: [] }, observations: [{ subjectId: 'key', criterionId: 'owner', value: '문', basis: 'explicit', evidence }],
  }), events: [{ entityId: 'key', kind: 'state', quote: '파란 열쇠' }] }) } });
  const review = await reach(s, 'critic');
  const payload = review.requests[0].payload;
  assert.equal(payload.entities.find((e) => e.id === 'key').data.color, 'blue');
  assert.equal(payload.tracking.candidate.observations.length, 1);
  const run = await createRunStore(s.root).load(review.runId);
  assert.ok(run.results.facts.refs.some((ref) => ref.kind === 'tracking_candidate' && ref.rev === run.outputs.tracking.batchDigest));
  assert.equal((await openWork(s.root)).entities.has('key'), false);
});

test('draft revision abandons provisional definitions and extracts against the new hash', async () => {
  const s = await setup(); s.host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => answer(p, { discoveries: { subjects: [discovery], criteria: [] } }) }, revisions: { '*': '새 합성 본문' } });
  const gate = (await driveToEnd(s.makeRunner, s.host, { start: { node: 'stairwell' }, until: (out) => out.status === 'needs_user' })).at(-1);
  const revision = await s.makeRunner().decide({ runId: gate.runId, action: 'request_revision', feedback: '다시 쓴다' });
  const extract = await s.makeRunner().resume({ runId: revision.runId, answers: s.host.answer(revision) });
  assert.equal(at('extract')(extract), true);
  assert.equal((await createRunStore(s.root).load(extract.runId)).outputs.tracking, undefined);
  assert.equal((await openWork(s.root)).entities.has('key'), false);
});

test('same-content plan grant renewal drops the old answer and preserves the draft for fresh extraction', async () => {
  const s = await setup(); const review = await reach(s, 'critic');
  const plan = (await openWork(s.root)).tracking.plan;
  const { grantId: _grant, ...content } = plan;
  await appendPlan(s.root, { ...content, version: 2 });
  await assert.rejects(s.makeRunner().resume({ runId: review.runId, answers: s.host.answer(review) }), { code: 'ANSWER_STALE' });
  const extract = await s.makeRunner().run({ node: 'stairwell' });
  assert.equal(at('extract')(extract), true);
  assert.equal(extract.requests[0].payload.draft, TEXT);
  assert.equal(extract.requests[0].payload.tracking.plan.version, 2);
});

test('a changed or deleted candidate after model review is rejected before approval is recorded', async () => {
  for (const tamper of [(run) => { run.outputs.tracking.checked = []; }, (run) => { delete run.outputs.tracking; }]) {
    const s = await setup();
    const gate = (await driveToEnd(s.makeRunner, s.host, { start: { node: 'stairwell' }, until: (out) => out.status === 'needs_user' })).at(-1);
    const store = createRunStore(s.root); const run = await store.load(gate.runId);
    tamper(run); await store.save(run);
    await assert.rejects(s.makeRunner().decide({ runId: gate.runId, action: 'approve' }), { code: 'LOCK_TRACKING_CANDIDATE_INVALID' });
    assert.equal((await openLedger(s.root, 'decisions').readAll()).some((entry) => entry.type === 'approval' && entry.runId === gate.runId), false);
  }
});

test('provisional metadata is preserved in the receipt and committed batch', async () => {
  const s = await setup(); const gate = (await driveToEnd(s.makeRunner, s.host, { start: { node: 'stairwell' }, until: (out) => out.status === 'needs_user' })).at(-1);
  assert.equal((await s.makeRunner().decide({ runId: gate.runId, action: 'approve' })).status, 'done');
  assert.equal((await openWork(s.root)).tracking.batches.length, 1);
});

test('feature disabled after extraction discards provisional IDs and re-extracts legacy events', async () => {
  const s = await setup(); s.host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => ({ ...answer(p, {
    discoveries: { subjects: [discovery], criteria: [] },
  }), events: [{ entityId: 'key', kind: 'state' }] }) } });
  const review = await reach(s, 'critic');
  await editYaml(s.root, (config) => { config.features = { tracking: false }; });
  await assert.rejects(s.makeRunner().resume({ runId: review.runId, answers: s.host.answer(review) }), { code: 'ANSWER_STALE' });
  const extract = await s.makeRunner().run({ node: 'stairwell' });
  assert.equal(at('extract')(extract), true);
  assert.equal(Object.hasOwn(extract.requests[0].payload, 'tracking'), false);
  const run = await createRunStore(s.root).load(review.runId);
  assert.equal(run.outputs.tracking, undefined);
  assert.equal(run.outputs.events, undefined);
  const retry = await s.makeRunner().resume({ runId: run.runId, answers: { [extract.requests[0].requestId]: { events: [{ entityId: 'key', kind: 'state' }] } } });
  assert.equal(retry.requests[0].payload.retryReason, 'EVENT_INVALID:key');
});

test('recheck with a new plan does not demand tracking or manufacture coverage from an old host answer', async () => {
  const s = await setup({ plan: false });
  await driveToEnd(s.makeRunner, s.host, { start: { node: 'stairwell' }, until: (out) => out.status === 'done' });
  await appendPlan(s.root, normalizePlan(trackingPlan()));
  const old = createFakeHost({ events: { '*': { events: [], tracking: { discoveries: { subjects: [discovery] } } } } });
  const trail = await driveToEnd(s.makeRunner, old, { start: { node: 'stairwell', mode: 'recheck' }, until: (out) => out.status === 'done' });
  const run = await createRunStore(s.root).load(trail.at(-1).runId);
  assert.equal(Object.hasOwn(old.calls.find((call) => call.stepId === 'extract').payload, 'tracking'), false);
  assert.equal(old.calls.find((call) => call.stepId === 'critic').payload.tracking.plan.planId, 'main');
  assert.equal(run.outputs.tracking, undefined);
  assert.equal((await openWork(s.root)).entities.has('key'), false);
  assert.equal((await openLedger(s.root, 'tracking').readAll()).length, 1);
});

test('bounded tracking catalog reports its actual size without copying all declarations', async () => {
  const s = await setup();
  await mkdir(`${s.root}/entities/object`);
  for (let i = 0; i < 105; i += 1) {
    const entity = { id: `item-${i}`, kind: 'object', name: `합성물건${i}`, aliases: [], data: { color: 'blue' }, body: '' };
    await writeFile(`${s.root}/entities/object/item-${i}.md`, `---\nid: ${entity.id}\nkind: object\nname: ${entity.name}\naliases: []\ncolor: blue\n---\n`);
  }
  const extract = await reach(s, 'extract');
  const catalog = extract.requests[0].payload.tracking.catalog;
  assert.equal(catalog.entries.length, 100);
  assert.equal(catalog.total, 105);
  assert.equal(catalog.incomplete, true);
  assert.deepEqual(Object.keys(catalog.entries[0]).sort(), ['id', 'kind', 'name']);
});

test('no-plan extract payload keeps its pre-tracking digest projection', async () => {
  const s = await setup({ plan: false }); const extract = await reach(s, 'extract');
  const payload = extract.requests[0].payload;
  assert.equal(Object.hasOwn(payload, 'tracking'), false);
  assert.ok(payload.entities.every((entity) => !Object.hasOwn(entity, 'data')));
  const run = await createRunStore(s.root).load(extract.runId);
  assert.equal(run.issued.extract.digest, 'sha256:4950e0d1bc0a9dd60f361a93db8f54443785dc2f320d90453cf521e2a195ad0a');
});

test('even a checked-empty candidate needs no observation permission and binds check decision provenance', async () => {
  const s = await setup({ plan: false });
  await appendPlan(s.root, normalizePlan(trackingPlan()));
  s.host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => answer(p, { checked: [] }) } });
  const review = await reach(s, 'critic');
  const run = await createRunStore(s.root).load(review.runId);
  assert.deepEqual(run.outputs.tracking.requiredPermissions, []);
  assert.deepEqual(run.outputs.tracking.checked, []);
  const decision = (await openLedger(s.root, 'decisions').readAll()).find((entry) => entry.type === 'check_result' && entry.stepId === 'facts');
  assert.equal(decision.refsDigest, sha256(canonicalJson(run.results.facts.refs)));
});

test('deterministic checks and final commit guard read the same provisional definitions', async () => {
  const s = await setup(); const seen = [];
  const custom = { ...fakePack, checks: [...fakePack.checks, { id: 'fake.virtual', tier: 'deterministic', stage: 'facts', severity: 'hard', origin: 'pack',
    run: (ctx) => { seen.push(ctx.work.entities.get('key')?.data.color); return []; } }], defaultCheckSets: ['fake.virtual'],
    checkSets: { 'fake.virtual': { title: '가상 대상', description: '합성 검증', checks: ['fake.virtual', 'fake.critic'] } } };
  await useFakePack(s.root, { checkSets: ['fake.virtual'] });
  s.makeRunner = () => createRunner({ root: s.root, packs: new Map([['fake', custom]]) });
  s.host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => answer(p, { discoveries: { subjects: [discovery], criteria: [] } }) } });
  const gate = (await driveToEnd(s.makeRunner, s.host, { start: { node: 'stairwell' }, until: (out) => out.status === 'needs_user' })).at(-1);
  assert.equal((await s.makeRunner().decide({ runId: gate.runId, action: 'approve' })).status, 'done');
  assert.deepEqual(seen, ['blue', 'blue']);
});

test('observations include unseen subjects, perspectives and entity relation values in relevant definitions', async () => {
  const s = await setup({ plan: false });
  await appendPlan(s.root, normalizePlan(trackingPlan({ criteria: [trackingCriterion({ valueType: 'entity-list', behavior: 'relation' })],
    delegation: { addSubjects: true, addObservations: true } })));
  s.host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => answer(p, {
    discoveries: { subjects: [{ ...discovery, name: '숨은 물건' }], criteria: [] },
    observations: [{ subjectId: 'key', criterionId: 'owner', value: ['junho'], basis: 'attributed', perspectiveId: 'mara', evidence }],
  }) } });
  const review = await reach(s, 'critic');
  const definitions = review.requests[0].payload.entities;
  for (const id of ['key', 'junho', 'mara']) assert.ok(definitions.some((entry) => entry.id === id && entry.data), id);
});

test('candidate added criteria bind the same semantic plan revision in model payload and check refs', async () => {
  const s = await setup();
  s.host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => answer(p, {
    discoveries: { subjects: [], criteria: [trackingCriterion({ id: 'location', title: '위치' })] }, checked: ['owner', 'location'],
  }) } });
  const review = await reach(s, 'critic');
  const run = await createRunStore(s.root).load(review.runId);
  assert.notEqual(run.outputs.tracking.basePlanRev, run.outputs.tracking.effectivePlanRev);
  const ref = run.results.facts.refs.find((entry) => entry.kind === 'tracking_plan');
  assert.equal(ref.rev, run.outputs.tracking.effectivePlanRev);
  assert.equal(ref.rev, review.requests[0].payload.tracking.plan.rev);
});

test('semantic plan replacement invalidates the old extraction and preserves generated text', async () => {
  const s = await setup(); await reach(s, 'critic');
  const plan = (await openWork(s.root)).tracking.plan;
  const { grantId: _grant, ...content } = plan;
  await appendPlan(s.root, normalizePlan({ ...content, version: 2, purpose: '합성물의 이동을 추적한다' }));
  const extract = await s.makeRunner().run({ node: 'stairwell' });
  assert.equal(at('extract')(extract), true);
  assert.equal(extract.requests[0].payload.draft, TEXT);
  assert.notEqual(extract.requests[0].payload.tracking.plan.rev, plan.rev);
  assert.equal((await createRunStore(s.root).load(extract.runId)).outputs.tracking, undefined);
});

test('skipping a reviewed draft abandons all provisional metadata', async () => {
  const s = await setup(); s.host = createFakeHost({ drafts: { '*': TEXT }, events: { '*': (p) => answer(p, { discoveries: { subjects: [discovery], criteria: [] } }) } });
  const gate = (await driveToEnd(s.makeRunner, s.host, { start: { node: 'stairwell' }, until: (out) => out.status === 'needs_user' })).at(-1);
  assert.equal((await s.makeRunner().decide({ runId: gate.runId, action: 'skip', reason: '합성 초안을 폐기한다' })).status, 'skipped');
  const work = await openWork(s.root);
  assert.equal(work.entities.has('key'), false);
  assert.deepEqual(work.tracking.observations, []);
  assert.equal(work.tracking.plan.criteria.length, 1);
});
