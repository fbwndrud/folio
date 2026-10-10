import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan, planRevision } from '../../core/tracking/plan.js';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readTracking } from '../../core/tracking/records.js';
import { assertDelegation } from '../../core/tracking/authority.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { appendPlan, trackingCriterion, trackingPlan } from '../support/tracking.js';

test('declared plans support arbitrary mystery, cookbook and picturebook kinds and default denied delegation', () => {
  for (const kind of ['object', 'ingredient', 'illustration-motif']) {
    const plan = normalizePlan(trackingPlan({ subjectKinds: [kind], criteria: [trackingCriterion({ subjectKinds: [kind] })] }));
    assert.equal(plan.planId, 'main');
    assert.equal(plan.version, 1);
    assert.deepEqual(plan.delegation, { addSubjects: false, addCriteria: false, addObservations: false, backfill: false });
    assert.equal(planRevision(plan), planRevision({ ...plan, version: 99, rev: 'ignored' }));
    assert.equal(planRevision(plan), planRevision({ ...plan, at: '2026-10-07', seq: 42, prev: 'genesis', hash: 'metadata', grantId: 'decision' }));
    assert.notEqual(planRevision(plan), planRevision({ ...plan, audience: '전문가' }));
  }
});

test('plan schema rejects unknown fields, duplicate stable IDs and invalid node scopes', () => {
  for (const input of [
    trackingPlan({ secret: 'ignored' }), trackingPlan({ planId: 'other' }), trackingPlan({ purpose: ' ' }),
    trackingPlan({ version: 0 }), trackingPlan({ version: null }), trackingPlan({ delegation: null }), trackingPlan({ subjectKinds: ['object', 'object'] }),
    trackingPlan({ criteria: [trackingCriterion(), trackingCriterion()] }),
    trackingPlan({ criteria: [trackingCriterion({ subjectKinds: ['undeclared'] })] }),
    trackingPlan({ criteria: [trackingCriterion({ command: 'execute' })] }),
    trackingPlan({ criteria: [trackingCriterion({ appliesTo: ['missing'] })] }),
    trackingPlan({ delegation: { unknown: true } }), trackingPlan({ delegation: { backfill: 'yes' } }),
    trackingPlan({ grantId: 'self-certified' }),
  ]) assert.throws(() => normalizePlan(input), { code: 'TRACKING_INPUT_INVALID' });
  const input = trackingPlan({ criteria: [trackingCriterion({ appliesTo: ['scene-one'] })] });
  assert.deepEqual(normalizePlan(input, { nodeIds: ['scene-one'] }).criteria[0].appliesTo, ['scene-one']);
});

test('fixed expected values follow common value types and only fixed criteria declare them', () => {
  for (const [valueType, expectedValue] of [['text', 'red'], ['number', 0], ['boolean', false], ['entity', 'person-one'], ['entity-list', ['person-one', 'person-two']]]) {
    const criterion = trackingCriterion({ valueType, behavior: 'fixed', expectedValue });
    assert.deepEqual(normalizePlan(trackingPlan({ criteria: [criterion] })).criteria[0].expectedValue, expectedValue);
  }
  for (const criterion of [trackingCriterion({ behavior: 'fixed' }), trackingCriterion({ expectedValue: 'wrong' }),
    trackingCriterion({ behavior: 'fixed', valueType: 'number', expectedValue: '1' }),
    trackingCriterion({ behavior: 'fixed', valueType: 'entity-list', expectedValue: ['same', 'same'] })]) {
    assert.throws(() => normalizePlan(trackingPlan({ criteria: [criterion] })), { code: 'TRACKING_INPUT_INVALID' });
  }
});

test('interview keeps meaningful original answers and contributes to revision', () => {
  const interview = { summary: '작가는 단서의 소유 관계를 중요하게 본다.', answers: [{ question: '무엇을 추적할까요?', answer: '  열쇠와 그 소유자가 중요합니다.\n' }] };
  const plan = normalizePlan(trackingPlan({ interview }));
  assert.deepEqual(plan.interview, interview);
  assert.notEqual(plan.rev, normalizePlan(trackingPlan()).rev);
  for (const change of [{ summary: ' ', answers: interview.answers }, { ...interview, answers: [] }, { ...interview, answers: [{ question: '왜?', answer: ' ' }] }]) {
    assert.throws(() => normalizePlan(trackingPlan({ interview: change })), { code: 'TRACKING_INPUT_INVALID' });
  }
});

test('executable and non-JSON values are rejected without invoking accessors', () => {
  let called = false;
  const getter = trackingPlan();
  Object.defineProperty(getter, 'purpose', { enumerable: true, get() { called = true; return 'secret'; } });
  const cycle = trackingPlan(); cycle.interview = cycle;
  for (const input of [getter, cycle, trackingPlan({ purpose: () => 'execute' }), trackingPlan({ priorities: [undefined] }),
    trackingPlan({ version: Infinity }), trackingPlan({ audience: new Date() }), trackingPlan({ priorities: Array(1) })]) {
    assert.throws(() => normalizePlan(input), { code: 'TRACKING_INPUT_INVALID' });
  }
  assert.equal(called, false);
});

test('old work projects empty tracking without creating a ledger or other files', async () => {
  const root = await tempDir();
  assert.deepEqual(await readTracking(root), { plan: null, records: [], receiptRecords: [], subjects: [], observations: [], batches: [] });
  assert.deepEqual(await readdir(root), []);
  const workRoot = await copyFixture('serial-2level');
  const work = await openWork(workRoot);
  assert.equal(work.tracking.plan, null);
  assert.deepEqual(work.tracking.records, []);
  await assert.rejects(readFile(join(workRoot, '.folio', 'ledger', 'tracking.jsonl')), { code: 'ENOENT' });
});

test('user approval grants separate permissions and survives reconnect; a fake grant never authorizes', async () => {
  const root = await tempDir();
  const plan = normalizePlan(trackingPlan({ delegation: { addCriteria: true, addObservations: true } }));
  assert.throws(() => assertDelegation({ ...plan, delegation: { addSubjects: true } }, 'addSubjects', 'fake'));
  await appendPlan(root, plan);
  const first = await readTracking(root);
  assert.equal(first.plan.grantId, 'decision-1');
  assert.doesNotThrow(() => assertDelegation(first.plan, 'addCriteria', 'decision-1'));
  assert.throws(() => assertDelegation(first.plan, 'addSubjects', 'decision-1'), { code: 'TRACKING_DELEGATION_REQUIRED' });
  assert.throws(() => assertDelegation(first.plan, 'addCriteria', 'fake'), { code: 'TRACKING_DELEGATION_REQUIRED' });
  assert.throws(() => assertDelegation(first.plan, 'approve', 'decision-1'), { code: 'TRACKING_DELEGATION_REQUIRED' });
  assert.deepEqual(await readTracking(root), first);
});

test('host criteria additions retain prior user authority and cannot change existing criterion semantics', async () => {
  const root = await tempDir();
  const base = normalizePlan(trackingPlan({ delegation: { addCriteria: true } }));
  await appendPlan(root, base);
  const next = normalizePlan(trackingPlan({ version: 2, delegation: base.delegation, criteria: [trackingCriterion(), trackingCriterion({ id: 'location', title: '위치', instruction: '물건의 위치를 기록한다' })] }));
  await appendPlan(root, next, { source: 'host', grantId: 'decision-1' });
  const tracking = await readTracking(root);
  assert.equal(tracking.plan.version, 2);
  assert.equal(tracking.plan.grantId, 'decision-1');
  assert.deepEqual(tracking.plan.criteria.map((entry) => entry.id), ['owner', 'location']);
  assert.equal(tracking.records.length, 2);
});

test('new user decision can revoke permission while history and semantic revisions remain stable', async () => {
  const root = await tempDir();
  const first = normalizePlan(trackingPlan({ delegation: { backfill: true } }));
  await appendPlan(root, first);
  await appendPlan(root, normalizePlan(trackingPlan({ version: 2 })));
  const tracking = await readTracking(root);
  assert.equal(tracking.plan.grantId, 'decision-2');
  assert.throws(() => assertDelegation(tracking.plan, 'backfill', 'decision-1'), { code: 'TRACKING_DELEGATION_REQUIRED' });
  assert.throws(() => assertDelegation(tracking.plan, 'backfill', 'decision-2'), { code: 'TRACKING_DELEGATION_REQUIRED' });
  assert.equal(tracking.records[0].plan.rev, first.rev);
});

test('malformed or unauthorized tracking records fail closed even with a valid ledger hash', async () => {
  const base = normalizePlan(trackingPlan({ delegation: { addCriteria: true } }));
  const modified = normalizePlan(trackingPlan({ version: 2, delegation: base.delegation, criteria: [trackingCriterion({ valueType: 'number' })] }));
  const fixed = normalizePlan(trackingPlan({ version: 2, delegation: base.delegation, criteria: [trackingCriterion(), trackingCriterion({ id: 'fixed', behavior: 'fixed', expectedValue: 'blue' })] }));
  const added = normalizePlan(trackingPlan({ version: 2, delegation: base.delegation, criteria: [trackingCriterion(), trackingCriterion({ id: 'new' })] }));
  for (const [initial, plan, overrides] of [
    [false, base, { source: 'host' }], [true, added, { source: 'host', grantId: 'fake' }],
    [true, added, { source: 'host', grantId: 'decision-1', plan: { ...added, delegation: { ...added.delegation, backfill: true } } }],
    [true, added, { source: 'host', grantId: 'decision-1', plan: normalizePlan(trackingPlan({ version: 2, delegation: {}, criteria: added.criteria })) }],
    [true, added, { source: 'host', grantId: 'decision-1', plan: normalizePlan(trackingPlan({ version: 2, delegation: base.delegation, purpose: '목적 변경', criteria: added.criteria })) }],
    [true, modified, {}], [true, fixed, { source: 'host', grantId: 'decision-1' }],
    [true, base, { proposalId: 'duplicate' }], [false, base, { source: 'synthetic' }],
    [false, base, { proposalDigest: 'fake' }], [false, base, { plan: { ...base, rev: 'fake' } }],
    [false, base, { extra: 'ignored' }], [false, base, { grantId: null }],
    [true, added, { grantId: 'decision-1' }],
  ]) {
    const root = await tempDir();
    if (initial) await appendPlan(root, base);
    await appendPlan(root, plan, overrides);
    await assert.rejects(readTracking(root), { code: 'TRACKING_RECORD_INVALID' });
  }
  for (const type of ['tracking_unknown']) {
    const root = await tempDir();
    await openLedger(root, 'tracking').append({ type });
    await assert.rejects(readTracking(root), { code: 'TRACKING_RECORD_INVALID' });
  }
  const malformedBatchRoot = await tempDir();
  await openLedger(malformedBatchRoot, 'tracking').append({ type: 'tracking_batch' });
  await assert.rejects(readTracking(malformedBatchRoot), { code: 'LOCK_TRACKING_INTEGRITY' });
});

test('retired criterion IDs cannot be reused with a changed meaning', async () => {
  const root = await tempDir();
  await appendPlan(root, normalizePlan(trackingPlan()));
  await appendPlan(root, normalizePlan(trackingPlan({ version: 2, criteria: [] })));
  await appendPlan(root, normalizePlan(trackingPlan({ version: 3, criteria: [trackingCriterion({ instruction: '의미를 바꾼다' })] })));
  await assert.rejects(readTracking(root), { code: 'TRACKING_RECORD_INVALID' });
});

test('append-only replay detects modified ledger bytes and truncation through recorded heads', async () => {
  for (const truncate of [false, true]) {
    const root = await tempDir();
    await appendPlan(root, normalizePlan(trackingPlan()));
    const path = join(root, '.folio', 'ledger', 'tracking.jsonl');
    const content = await readFile(path, 'utf8');
    await writeFile(path, truncate ? '' : content.replace('초보 독자', '다른 독자'));
    await assert.rejects(readTracking(root), { code: 'LEDGER_TAMPERED' });
  }
});


test('only a new user decision may update the expected value of an existing fixed criterion', async () => {
  const original = normalizePlan(trackingPlan({ delegation: { addCriteria: true }, criteria: [trackingCriterion({ behavior: 'fixed', expectedValue: 'blue' })] }));
  const updated = normalizePlan(trackingPlan({ version: 2, delegation: original.delegation, criteria: [trackingCriterion({ behavior: 'fixed', expectedValue: 'red' })] }));
  assert.notEqual(updated.rev, original.rev);
  const root = await tempDir();
  await appendPlan(root, original);
  await appendPlan(root, updated);
  const tracking = await readTracking(root);
  assert.equal(tracking.plan.criteria[0].expectedValue, 'red');
  assert.equal(tracking.records[0].plan.criteria[0].expectedValue, 'blue');
  assert.equal(tracking.plan.grantId, 'decision-2');
  const hostRoot = await tempDir();
  await appendPlan(hostRoot, original);
  await appendPlan(hostRoot, updated, { source: 'host', grantId: 'decision-1' });
  await assert.rejects(readTracking(hostRoot), { code: 'TRACKING_RECORD_INVALID' });
});

test('host cannot reactivate a criterion explicitly retired by a user decision', async () => {
  const root = await tempDir();
  const delegation = { addCriteria: true };
  await appendPlan(root, normalizePlan(trackingPlan({ delegation })));
  await appendPlan(root, normalizePlan(trackingPlan({ version: 2, criteria: [], delegation })));
  await appendPlan(root, normalizePlan(trackingPlan({ version: 3, delegation })), { source: 'host', grantId: 'decision-2' });
  await assert.rejects(readTracking(root), { code: 'TRACKING_RECORD_INVALID' });
});

test('array subclasses are rejected before inherited callbacks or iterators run', () => {
  for (const field of ['priorities', 'criteria']) {
    let called = false;
    class ExecutableArray extends Array {
      map(fn, context) { called = true; return super.map(fn, context); }
      [Symbol.iterator]() { called = true; return super[Symbol.iterator](); }
    }
    const value = new ExecutableArray(field === 'priorities' ? '열쇠' : trackingCriterion());
    assert.throws(() => normalizePlan(trackingPlan({ [field]: value })), { code: 'TRACKING_INPUT_INVALID' });
    assert.equal(called, false, `${field} must be rejected before executing inherited methods`);
  }
});

test('arrays with custom prototypes are rejected before inherited callbacks or iterators run', () => {
  for (const field of ['priorities', 'criteria']) {
    let called = false;
    const prototype = Object.create(Array.prototype);
    prototype.map = function (fn, context) { called = true; return Array.prototype.map.call(this, fn, context); };
    prototype[Symbol.iterator] = function () { called = true; return Array.prototype[Symbol.iterator].call(this); };
    const value = Object.setPrototypeOf([field === 'priorities' ? '열쇠' : trackingCriterion()], prototype);
    assert.throws(() => normalizePlan(trackingPlan({ [field]: value })), { code: 'TRACKING_INPUT_INVALID' });
    assert.equal(called, false, `${field} must be rejected before executing inherited methods`);
  }
});
