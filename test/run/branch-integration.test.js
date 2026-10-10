import test from 'node:test';
import assert from 'node:assert/strict';
import { gatherScope, entityRevAt } from '../../core/scope/scope.js';
import { currentRev, findStale } from '../../core/scope/stale.js';
import { pendingRechecks } from '../../core/scope/rechecks.js';
import { nodeOrder, orderReason, receiptFeatures } from '../../core/scope/stale-checks.js';
import { validateReceipt } from '../../core/ledger/receipts.js';
import { applicability } from '../../core/checks/run-checks.js';
import { sameFinding, assertOrderMatches } from '../../core/run/commit-locks.js';
import { basePayload } from '../../core/run/payload.js';
import { FEATURES, readFeatures } from '../../core/work/features.js';
import { branchWork, branchEvidence } from '../support/branching.js';
function fixture() {
  const work = branchWork({ a: { entry: true, to: ['b', 'c'] }, b: { to: ['z'] }, c: { to: ['z'] }, z: { ending: true } });
  work.config = { ...work.config, levels: [{ name: 'scene', leaf: true }] };
  work.entities.set('hero', { id: 'hero', kind: 'character', name: '주인공', aliases: [], body: '', rev: 'entity-rev', data: {} });
  work.tree.nodes.get('z').entities = ['hero'];
  return { work, ...branchEvidence(work, { b: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' } }] }) };
}
test('분기 범위·payload·entity refs를 분리하고 main 영수증을 전달한다', () => {
  const ctx = fixture(), scope = gatherScope({ ...ctx, nodeId: 'z', draftText: '주인공' });
  assert.equal(scope.ordered, false); assert.deepEqual(scope.priorEvents, []); assert.deepEqual(scope.linkedEvents, []);
  assert.equal(scope.branching.paths[0].events.length, 1); assert.ok(scope.refs.some((r) => r.kind === 'branching'));
  for (const ref of scope.refs) assert.equal(currentRev({ ...ctx, ref, nodeId: 'z' }), ref.rev);
  const payload = basePayload(ctx, { nodeId: 'z', mode: 'write', outputs: { draft: '주인공' } }, { id: 'draft' }, scope);
  assert.equal(payload.branching.paths.length, 2); assert.deepEqual(payload.priorEvents, []);
  const first = entityRevAt({ ...ctx, entityId: 'hero', nodeId: 'z' });
  ctx.events[0].data.vital = 'alive'; ctx.receiptRecords.find((r) => r.receiptId === 'r-b' && r.type === 'receipt').events[0].data.vital = 'alive';
  assert.notEqual(entityRevAt({ ...ctx, entityId: 'hero', nodeId: 'z' }), first);
});
test('경로 refs 변화가 stale·재검사 대상이며 새 분기 재검사 refs로 풀린다', () => {
  const ctx = fixture(), scope = gatherScope({ ...ctx, nodeId: 'z', draftText: '주인공' });
  const receipt = ctx.receiptRecords.find((r) => r.type === 'receipt' && r.nodeId === 'z');
  receipt.refs = scope.refs; receipt.features = receiptFeatures(ctx.work, 'z'); receipt.order = nodeOrder(ctx.work, 'z');
  ctx.receiptRecords.forEach((r, i) => { r.seq = i + 1; });
  ctx.work.tree.nodes.get('a').links = [{ to: 'b', kind: 'choice' }];
  const stale = findStale(ctx).filter((s) => s.nodeId === 'z'); assert.equal(stale.length, 1); assert.equal(pendingRechecks(stale).length, 1);
  const fresh = gatherScope({ ...ctx, nodeId: 'z', draftText: '주인공' });
  const commit = ctx.receiptRecords.find((r) => r.type === 'commit' && r.nodeId === 'z');
  ctx.receiptRecords.push({ type: 'recheck', nodeId: 'z', committedHash: commit.committedHash, seq: 99, refs: fresh.refs, features: receipt.features, order: receipt.order });
  assert.ok(!findStale(ctx).some((s) => s.nodeId === 'z'));
});
test('none와 branching 전환·부모에서 상속한 전환은 유효 순서로 감지한다', () => {
  const { work } = fixture(), had = nodeOrder(work, 'z');
  work.positions.get('z').orderMode = 'linear'; work.positions.get('z').unorderedBy = 'none';
  assert.ok(orderReason({ work, nodeId: 'z', had })); assert.throws(() => assertOrderMatches(work, { nodeId: 'z', order: had }), { code: 'LOCK_RECEIPT_INVALID' });
});
test('판본 문맥은 분기 검사에 해당하지 않으며 경로 넘김은 다른 경로를 덮지 않는다', () => {
  assert.equal(applicability({ requiresOrder: 'branching' }, { unorderedBy: 'branching' }), 'not_applicable');
  assert.equal(applicability({ requiresOrder: 'branching' }, { branching: { applicable: true } }), 'applicable');
  const f = { checkId: 'gamebook.path-facts', code: 'DEAD_ON_STAGE', pathId: 'left', entityId: 'hero' };
  assert.equal(sameFinding(f, { ...f, pathId: 'right' }), false); assert.equal(sameFinding(f, { ...f, entityId: 'other' }), false);
  assert.equal(sameFinding({ checkId: 'old', code: 'X' }, { checkId: 'old', code: 'X' }), true);
});
test('기능 부모·선택적 영수증 feature의 이전 호환성을 유지한다', () => {
  const errors = [], f = readFeatures({ links: false }, errors); assert.equal(f.branching, false); assert.deepEqual(errors, []); assert.equal(FEATURES.branching, true);
  const { work, receiptRecords } = fixture(), record = receiptRecords[0], { type: _type, ...receipt } = record;
  receipt.features = { occurrenceScope: false, branching: true }; assert.deepEqual(validateReceipt(receipt), []);
  receipt.features.branching = 'yes'; assert.ok(validateReceipt(receipt).some((p) => p.code === 'FEATURES_INVALID'));
  receipt.features = { occurrenceScope: false }; assert.deepEqual(validateReceipt(receipt), []);
  work.positions.get('z').unorderedBy = 'none'; assert.deepEqual(receiptFeatures(work, 'z'), { occurrenceScope: false });
});

test('latest same-commit branching recheck refs become the baseline across feature and order transitions', () => {
  const addRecheck = (ctx, { refs, seq, nodeId = 'z' }) => {
    const commit = ctx.receiptRecords.find((r) => r.type === 'commit' && r.nodeId === nodeId);
    ctx.receiptRecords.push({ type: 'recheck', nodeId, committedHash: commit.committedHash, seq, refs,
      features: receiptFeatures(ctx.work, nodeId), order: nodeOrder(ctx.work, nodeId) });
  };
  const editTopology = (ctx, target) => { ctx.work.tree.nodes.get('a').links = [{ to: target, kind: 'choice' }]; };
  const staleKinds = (ctx) => findStale(ctx).find((s) => s.nodeId === 'z')?.reasons.map((r) => r.kind) ?? [];

  const offToOn = fixture(); offToOn.work.config.features.branching = false;
  const receipt = offToOn.receiptRecords.find((r) => r.type === 'receipt' && r.nodeId === 'z');
  receipt.refs = gatherScope({ ...offToOn, nodeId: 'z' }).refs;
  receipt.order = nodeOrder(offToOn.work, 'z'); receipt.features = receiptFeatures(offToOn.work, 'z');
  offToOn.work.config.features.branching = true;
  const enabledRefs = gatherScope({ ...offToOn, nodeId: 'z' }).refs;
  addRecheck(offToOn, { refs: enabledRefs, seq: 99 });
  assert.deepEqual(staleKinds(offToOn), []);
  editTopology(offToOn, 'b');
  assert.ok(staleKinds(offToOn).some((kind) => ['branching', 'branch-graph'].includes(kind)));

  offToOn.work.config.features.branching = false;
  const disabledRefs = gatherScope({ ...offToOn, nodeId: 'z' }).refs;
  addRecheck(offToOn, { refs: disabledRefs, seq: 100 });
  assert.deepEqual(staleKinds(offToOn), []);
  editTopology(offToOn, 'c');
  assert.deepEqual(staleKinds(offToOn), []);

  const noneToBranching = fixture();
  noneToBranching.work.positions.get('z').unorderedBy = 'none';
  noneToBranching.work.positions.get('z').orderMode = 'none';
  const noneReceipt = noneToBranching.receiptRecords.find((r) => r.type === 'receipt' && r.nodeId === 'z');
  noneReceipt.refs = gatherScope({ ...noneToBranching, nodeId: 'z' }).refs;
  noneReceipt.order = nodeOrder(noneToBranching.work, 'z'); noneReceipt.features = receiptFeatures(noneToBranching.work, 'z');
  noneToBranching.work.positions.get('z').unorderedBy = 'branching';
  noneToBranching.work.positions.get('z').orderMode = 'branching';
  const branchRefs = gatherScope({ ...noneToBranching, nodeId: 'z' }).refs;
  addRecheck(noneToBranching, { refs: branchRefs, seq: 99 });
  assert.deepEqual(staleKinds(noneToBranching), []);
  editTopology(noneToBranching, 'b');
  assert.ok(staleKinds(noneToBranching).some((kind) => ['branching', 'branch-graph'].includes(kind)));
});
