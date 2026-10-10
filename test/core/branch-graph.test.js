import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBranchGraph } from '../../core/branching/graph.js';
import { pathsTo, BRANCH_LIMITS } from '../../core/branching/paths.js';
import { branchWork } from '../support/branching.js';

test('선택 순서·폴더 순서는 경로 id와 그래프 rev를 바꾸지 않는다', () => {
  const work = branchWork({ a: { entry: true, to: ['c', 'b'] }, b: { to: ['z'] }, c: { to: ['z'] }, z: { ending: true } });
  const graph = buildBranchGraph(work), first = pathsTo(graph, 'z');
  assert.deepEqual(first.paths.map((p) => p.nodeIds), [['a', 'b'], ['a', 'c']]);
  work.tree.nodes = new Map([...work.tree.nodes].reverse()); work.tree.nodes.get('a').links.reverse();
  assert.equal(buildBranchGraph(work).rev, graph.rev);
  assert.deepEqual(pathsTo(buildBranchGraph(work), 'z'), first);
});
test('명시 진입·끝, 깨진 대상·중복·자기 선택·비잎 표시를 진단한다', () => {
  const work = branchWork({ a: { entry: true, to: ['a', 'missing', 'b', 'b'] }, b: { ending: true, to: ['a'] }, orphan: {}, parent: { kind: 'branch' } });
  const graph = buildBranchGraph(work);
  for (const code of ['BRANCH_SELF_CHOICE', 'BRANCH_TARGET_INVALID', 'BRANCH_CHOICE_DUPLICATE', 'BRANCH_ENDING_HAS_CHOICES', 'BRANCH_METADATA_INVALID']) assert.ok(graph.problems.some((p) => p.code === code), code);
  assert.ok(!graph.reached.includes('orphan')); assert.deepEqual(graph.edges.b, []);
});
test('front/back 조상·다른 순서 노드·가지로의 선택을 제외한다', () => {
  const work = branchWork({ a: { entry: true, to: ['b', 'c', 'p'] }, b: { parentId: 'p' }, c: {}, p: { kind: 'branch', role: 'front' } });
  work.positions.get('c').unorderedBy = 'none';
  assert.deepEqual(buildBranchGraph(work).vertices, ['a']);
});
test('종료 탈출 가능한 관련 순환만 경로 완료를 떨어뜨린다', () => {
  const graph = buildBranchGraph(branchWork({ a: { entry: true, to: ['b'] }, b: { to: ['a', 'z'] }, z: { ending: true }, x: { to: ['y'] }, y: { to: ['x'] } }));
  assert.equal(pathsTo(graph, 'z').complete, false);
  assert.ok(graph.problems.some((p) => p.code === 'BRANCH_CYCLE' && p.canEnd));
  const independent = buildBranchGraph(branchWork({ a: { entry: true, to: ['z'] }, z: { ending: true }, x: { to: ['y'] }, y: { to: ['x'] } }));
  assert.equal(pathsTo(independent, 'z').complete, true);
});
test('경로 상한과 깊이 상한은 절단을 알리고 전체 도달성을 유지한다', () => {
  const spec = { start: { entry: true, to: ['l0', 'r0'] }, end: { ending: true } };
  for (let i = 0; i < 9; i++) for (const side of ['l', 'r']) spec[`${side}${i}`] = { to: i === 8 ? ['end'] : [`l${i + 1}`, `r${i + 1}`] };
  const graph = buildBranchGraph(branchWork(spec)), paths = pathsTo(graph, 'end');
  assert.equal(paths.paths.length, BRANCH_LIMITS.paths); assert.equal(paths.complete, false); assert.ok(graph.reached.includes('end'));
  const long = {}; for (let i = 0; i < 515; i++) long[`n${String(i).padStart(4, '0')}`] = { entry: i === 0, ending: i === 514, to: i === 514 ? [] : [`n${String(i + 1).padStart(4, '0')}`] };
  assert.equal(pathsTo(buildBranchGraph(branchWork(long)), 'n0514').complete, false);
});

test('정점·이동·진단 상한은 고정되어 있고 초과는 명시한다', () => {
  assert.deepEqual(BRANCH_LIMITS, { nodes: 5000, edges: 20000, paths: 256, depth: 512, states: 100000, events: 20000, bytes: 2097152, problems: 200 });
  const spec = {}; for (let i = 0; i < 5001; i++) spec[`n${String(i).padStart(5, '0')}`] = { entry: i === 0, ending: i === 5000 };
  const graph = buildBranchGraph(branchWork(spec)); assert.equal(graph.vertices.length, 5000); assert.equal(graph.truncated, true);
  const work = branchWork({ a: { entry: true, to: Array.from({ length: 20001 }, () => 'z') }, z: { ending: true } });
  const edges = buildBranchGraph(work); assert.equal(edges.truncated, true); assert.ok(edges.problems.length <= 200);
  assert.ok(edges.problems.some((p) => p.code === 'BRANCH_ANALYSIS_INCOMPLETE' && p.limit === 'problems'));
});
