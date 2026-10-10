import test from 'node:test';
import assert from 'node:assert/strict';
import { branchScope } from '../../core/branching/scope.js';
import { branchWork, branchEvidence } from '../support/branching.js';
const fixture = () => branchWork({ a: { entry: true, to: ['b', 'c'] }, b: { to: ['z'] }, c: { to: ['z'] }, z: { ending: true }, other: {} });
test('사건을 경로별로 유지하며 대상·무관한 노드·판본 사건은 제외한다', () => {
  const work = fixture(), evidence = branchEvidence(work, { b: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' } }], z: [{ entityId: 'hero', kind: 'state', data: { vital: 'alive' } }] });
  evidence.events.push({ eventId: 'variant', nodeId: 'c', receiptId: 'v-c', variant: 'en', entityId: 'hero', kind: 'state', data: { vital: 'dead' } });
  const scope = branchScope({ work, ...evidence, nodeId: 'z' });
  assert.equal(scope.complete, true); assert.equal(scope.paths[0].events.length, 1); assert.equal(scope.paths[1].events.length, 0);
  assert.ok(scope.paths.every((p) => !p.events.some((e) => e.nodeId === 'z')));
});
test('본문 손수정·import·빠진 사건·다른 영수증 사건은 신뢰하지 않는다', () => {
  for (const alter of [({ work }) => { work.tree.nodes.get('b').body += '수정'; }, ({ work }) => { work.tree.nodes.get('b').status = 'imported'; }, ({ events }) => { events.length = 0; }, ({ events }) => { events[0].receiptId = 'wrong'; }]) {
    const work = fixture(), evidence = branchEvidence(work, { b: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' } }] }); alter({ work, ...evidence });
    const scope = branchScope({ work, ...evidence, nodeId: 'z' });
    assert.equal(scope.complete, false); assert.equal(scope.paths[0].complete, false); assert.equal(scope.paths[1].complete, true);
    assert.ok(scope.problems.some((p) => p.code === 'BRANCH_EVENTS_UNVERIFIED'));
  }
});
test('무관한 연결 변화는 경로 rev와 전체 구조 rev를 구분한다', () => {
  const work = fixture(), evidence = branchEvidence(work), first = branchScope({ work, ...evidence, nodeId: 'z' });
  work.tree.nodes.get('other').links.push({ to: 'a', kind: 'choice' });
  const second = branchScope({ work, ...evidence, nodeId: 'z' });
  assert.equal(first.rev, second.rev); assert.notEqual(first.graph.rev, second.graph.rev);
});
test('기능 끄기와 비분기 대상은 해당 없음이다', () => {
  const work = fixture(); work.config.features.branching = false;
  assert.equal(branchScope({ work, events: [], receiptRecords: [], nodeId: 'z' }).applicable, false);
});
test('반환 사건과 문맥 바이트 상한은 전체 완료로 표시하지 않는다', () => {
  const work = fixture(), evidence = branchEvidence(work, { a: [{ entityId: 'hero', kind: 'state', data: { payload: 'x'.repeat(2100000) } }] });
  const scope = branchScope({ work, ...evidence, nodeId: 'z' });
  assert.equal(scope.complete, false); assert.ok(Buffer.byteLength(JSON.stringify(scope.paths)) <= 2 * 1024 * 1024);
  assert.ok(scope.problems.some((p) => p.code === 'BRANCH_ANALYSIS_INCOMPLETE'));
});

test('관련 순환을 지나는 경로는 사실 완료가 아니다', () => {
  const work = branchWork({ a: { entry: true, to: ['b'] }, b: { to: ['a', 'z'] }, z: { ending: true } });
  const scope = branchScope({ work, ...branchEvidence(work), nodeId: 'z' });
  assert.equal(scope.paths[0].complete, false);
});
test('전체 반환 사건 20000개 한도를 넘으면 미완료다', () => {
  const work = fixture(), events = Array.from({ length: 20001 }, (_, i) => ({ entityId: 'hero', kind: 'state', data: { i } }));
  const scope = branchScope({ work, ...branchEvidence(work, { a: events }), nodeId: 'z' });
  assert.equal(scope.complete, false); assert.ok(scope.paths.flatMap((p) => p.events).length <= 20000);
});

test('경로 메타데이터까지 포함한 최종 문맥이 2 MiB를 넘지 않는다', () => {
  const spec = {}, sharedId = (i) => `shared-${String(i).padStart(3, '0')}-${'x'.repeat(60)}`;
  for (let i = 0; i < 120; i++) {
    const entry = `entry-${String(i).padStart(3, '0')}`;
    spec[entry] = { entry: true, to: [sharedId(0)] };
  }
  for (let i = 0; i < 300; i++) {
    const id = sharedId(i);
    spec[id] = { to: [i === 299 ? 'target' : sharedId(i + 1)] };
  }
  spec.target = { ending: true };
  const work = branchWork(spec), scope = branchScope({ work, ...branchEvidence(work), nodeId: 'target' });
  assert.ok(scope.paths.length < 120);
  assert.ok(Buffer.byteLength(JSON.stringify(scope.paths)) <= 2 * 1024 * 1024);
  assert.equal(scope.complete, false);
  assert.ok(scope.problems.some((p) => p.code === 'BRANCH_ANALYSIS_INCOMPLETE' && p.limit === 'bytes'));
});

test('경로별 진단 200개 초과는 마지막 절단 진단 하나로 제한한다', () => {
  const spec = { target: { ending: true } };
  for (let i = 0; i < 256; i++) {
    const id = `entry-${String(i).padStart(3, '0')}`;
    spec[id] = { entry: true, to: ['target'] };
  }
  const work = branchWork(spec), scope = branchScope({ work, events: [], receiptRecords: [], nodeId: 'target' });
  assert.equal(scope.problems.length, 200);
  assert.deepEqual(scope.problems.at(-1), { code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'problems' });
  assert.equal(scope.complete, false);
});
