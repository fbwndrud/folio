# N7 분기·게임북 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선택 경로를 분리하고 검증된 main 사건만 전달하는 게임북을 제공한다.

**Architecture:** core/branching의 순수 그래프·반복 없는 탐색·영수증 결속을 branchScope 인터페이스로 묶는다. 기존 scope/payload/refs는 별도 branching 문맥을 추가하고 gamebook 첫 팩은 의미 판정을 소유한다. 기존 순차/none와 판본 경로를 보존한다.

**Tech Stack:** Node ^22.13.0 || ^24.0.0 || ^26.0.0, ESM JavaScript/checkJs, 기존 YAML 로더, node:test. 시험·실행은 Node 24.

**Spec:** docs/plans/2026-10-02-n7-branching-design.md; docs/plans/2026-10-02-n7-branching-rulings.md

## Global Constraints

- 테스트 데이터는 합성 fixture만. 실제 작품·생성 결과물을 커밋하지 않는다.
- 모듈 하나에 책임 하나. 파일이 300줄을 넘으면 나눈다. runner.js는 250줄 이하.
- core/는 모델·네트워크를 부르지 않는다. core/packs 런타임 dynamic import 금지.
- hash 일치, 영수증, hard 차단, 추가만 되는 기록장, 자기검토 표기, soft 비자동수정 잠금은 설정으로 끌 수 없다.
- 소통·주석·안내는 한국어, 코드 식별자는 영어. /path/to/vibelore는 읽기 전용이며 실제 작품을 읽지 않는다.
- root 런타임 의존성을 늘리지 않는다. 원래 checkout /path/to/folio를 수정하지 않는다.
- 정점 5000, 이동 20000, 대상 경로 256, 깊이 512, 탐색 상태 100000, 반환 사건 20000, 직렬화 경로 2097152바이트. 그래프 진단·검사 지적 200개.
- 반복 방문 상태 해석은 범위 밖. 관련 순환을 지나는 경로는 사실 완료가 아니다. 미검증 경로의 확정 사실 지적 금지.
- 판본은 N6 전용 scope/payload와 원본 결속을 유지한다. main 사건/영수증만 분기 사건 근거다.
- 사용자 ‘이후 다음 작업들도 끝까지 진행해’에 따라 구현·검토·J4 로컬 main 통합까지 진행한다. 원격 배포하지 않는다.

## 판정과 호환 비용

정본 외부 아티팩트는 접근할 수 없다. 승인된 로컬 설계와 로드맵을 근거로 한다. 분기 검사가 처음 생긴 과거 branching 영수증은 재검사 대상일 수 있다. RUN_FEATURES에 branching 추가로 열린 실행은 한 번 검사부터 다시 돌 수 있다. 직접 순차/none 영수증에는 branching feature를 강제하지 않는다.

branching ref는 관련 도달 경로와 앞 노드 main 커밋/현재 hash/검증 여부를 묶고, branch-graph ref는 전체 구조 진단을 묶는다. 사건 데이터는 엔티티 ref에 경로별로 넣어 무관한 엔티티 사건을 전파하지 않는다. 전체 구조 ref 때문에 무관한 choice 편집도 구조 재검사를 부른다. 같은 본문 분기 재검사는 최신 refs를 기준으로 stale을 해소한다. 기존 linear/none 영수증의 refs 기준은 바꾸지 않는다.

넘김은 기존 checkId/code/quote에 선택적 pathId/entityId를 추가한다. 필드가 없는 과거 지적은 기존 의미 그대로다. 심각도·기록장·이유 있는 작가 넘김 잠금은 유지한다. 게임북 가지 fit/review에 독립적인 실험 참고 모델 검사 두 개를 제공한다.

## 실행과 검토

아래 패치는 전체 코드다. Task 1→2→3 순서로 적용한다. tests/support는 시험 단계에 포함한다. 각 task의 test diff를 먼저 적용하고 RED 명령을 실행한 뒤 implementation diff를 적용한다. RED가 기존 목록 기대값 때문에 실패하는 경우도 명시된 기대 실패다. GREEN·자가 검토 뒤 지정 파일만 커밋한다. 시험 복사본의 코드를 가져오지 않고 아래 정본 패치를 사용한다.

각 태스크는 새 구현자 한 명과 독립 spec/quality 검토 한 번을 거친다. 동시에 구현자 둘을 실행하지 않는다. 최종 전체 검토 한 번, 필요 시 최종 수정 한 번과 범위 재검토 한 번. 기존 잠금 회귀는 전체 검사로 확인한다. 검토자는 구현자가 이미 실행한 동일 검사를 재실행하지 않는다.

---
### Task 1: 순수 그래프·경로·사건 결속

**Files:**
- Create: `core/branching/evidence.js`
- Create: `core/branching/graph.js`
- Create: `core/branching/paths.js`
- Create: `core/branching/scope.js`
- Create: `test/core/branch-graph.test.js`
- Create: `test/core/branch-scope.test.js`
- Create: `test/support/branching.js`

**Interfaces:**
- Consumes: work.tree.nodes/positions/features; events는 activeEvents main 투영, receiptRecords는 검증된 기록장 자료.
- Produces: buildBranchGraph(work) → vertices/edges/reverse/entries/endings/reached/canEnd/cycles/problems/truncated/rev; pathsTo(graph,nodeId) → paths/relevant/complete/problems; branchScope({work,events,receiptRecords=[],nodeId}) → applicable 또는 graph/paths/complete/problems/rev/limits. 각 path는 pathId/entry/nodeIds/events/complete.

- [ ] **Step 1: Write the failing tests.** 다음 전체 test 패치를 임시 파일에 저장해 `git apply`로 적용한다.

```diff
diff --git a/test/core/branch-graph.test.js b/test/core/branch-graph.test.js
new file mode 100644
--- /dev/null
+++ b/test/core/branch-graph.test.js
@@ -0,0 +1,48 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { buildBranchGraph } from '../../core/branching/graph.js';
+import { pathsTo, BRANCH_LIMITS } from '../../core/branching/paths.js';
+import { branchWork } from '../support/branching.js';
+
+test('선택 순서·폴더 순서는 경로 id와 그래프 rev를 바꾸지 않는다', () => {
+  const work = branchWork({ a: { entry: true, to: ['c', 'b'] }, b: { to: ['z'] }, c: { to: ['z'] }, z: { ending: true } });
+  const graph = buildBranchGraph(work), first = pathsTo(graph, 'z');
+  assert.deepEqual(first.paths.map((p) => p.nodeIds), [['a', 'b'], ['a', 'c']]);
+  work.tree.nodes = new Map([...work.tree.nodes].reverse()); work.tree.nodes.get('a').links.reverse();
+  assert.equal(buildBranchGraph(work).rev, graph.rev);
+  assert.deepEqual(pathsTo(buildBranchGraph(work), 'z'), first);
+});
+test('명시 진입·끝, 깨진 대상·중복·자기 선택·비잎 표시를 진단한다', () => {
+  const work = branchWork({ a: { entry: true, to: ['a', 'missing', 'b', 'b'] }, b: { ending: true, to: ['a'] }, orphan: {}, parent: { kind: 'branch' } });
+  const graph = buildBranchGraph(work);
+  for (const code of ['BRANCH_SELF_CHOICE', 'BRANCH_TARGET_INVALID', 'BRANCH_CHOICE_DUPLICATE', 'BRANCH_ENDING_HAS_CHOICES', 'BRANCH_METADATA_INVALID']) assert.ok(graph.problems.some((p) => p.code === code), code);
+  assert.ok(!graph.reached.includes('orphan')); assert.deepEqual(graph.edges.b, []);
+});
+test('front/back 조상·다른 순서 노드·가지로의 선택을 제외한다', () => {
+  const work = branchWork({ a: { entry: true, to: ['b', 'c', 'p'] }, b: { parentId: 'p' }, c: {}, p: { kind: 'branch', role: 'front' } });
+  work.positions.get('c').unorderedBy = 'none';
+  assert.deepEqual(buildBranchGraph(work).vertices, ['a']);
+});
+test('종료 탈출 가능한 관련 순환만 경로 완료를 떨어뜨린다', () => {
+  const graph = buildBranchGraph(branchWork({ a: { entry: true, to: ['b'] }, b: { to: ['a', 'z'] }, z: { ending: true }, x: { to: ['y'] }, y: { to: ['x'] } }));
+  assert.equal(pathsTo(graph, 'z').complete, false);
+  assert.ok(graph.problems.some((p) => p.code === 'BRANCH_CYCLE' && p.canEnd));
+  const independent = buildBranchGraph(branchWork({ a: { entry: true, to: ['z'] }, z: { ending: true }, x: { to: ['y'] }, y: { to: ['x'] } }));
+  assert.equal(pathsTo(independent, 'z').complete, true);
+});
+test('경로 상한과 깊이 상한은 절단을 알리고 전체 도달성을 유지한다', () => {
+  const spec = { start: { entry: true, to: ['l0', 'r0'] }, end: { ending: true } };
+  for (let i = 0; i < 9; i++) for (const side of ['l', 'r']) spec[`${side}${i}`] = { to: i === 8 ? ['end'] : [`l${i + 1}`, `r${i + 1}`] };
+  const graph = buildBranchGraph(branchWork(spec)), paths = pathsTo(graph, 'end');
+  assert.equal(paths.paths.length, BRANCH_LIMITS.paths); assert.equal(paths.complete, false); assert.ok(graph.reached.includes('end'));
+  const long = {}; for (let i = 0; i < 515; i++) long[`n${String(i).padStart(4, '0')}`] = { entry: i === 0, ending: i === 514, to: i === 514 ? [] : [`n${String(i + 1).padStart(4, '0')}`] };
+  assert.equal(pathsTo(buildBranchGraph(branchWork(long)), 'n0514').complete, false);
+});
+
+test('정점·이동·진단 상한은 고정되어 있고 초과는 명시한다', () => {
+  assert.deepEqual(BRANCH_LIMITS, { nodes: 5000, edges: 20000, paths: 256, depth: 512, states: 100000, events: 20000, bytes: 2097152, problems: 200 });
+  const spec = {}; for (let i = 0; i < 5001; i++) spec[`n${String(i).padStart(5, '0')}`] = { entry: i === 0, ending: i === 5000 };
+  const graph = buildBranchGraph(branchWork(spec)); assert.equal(graph.vertices.length, 5000); assert.equal(graph.truncated, true);
+  const work = branchWork({ a: { entry: true, to: Array.from({ length: 20001 }, () => 'z') }, z: { ending: true } });
+  const edges = buildBranchGraph(work); assert.equal(edges.truncated, true); assert.ok(edges.problems.length <= 200);
+});
diff --git a/test/core/branch-scope.test.js b/test/core/branch-scope.test.js
new file mode 100644
--- /dev/null
+++ b/test/core/branch-scope.test.js
@@ -0,0 +1,47 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { branchScope } from '../../core/branching/scope.js';
+import { branchWork, branchEvidence } from '../support/branching.js';
+const fixture = () => branchWork({ a: { entry: true, to: ['b', 'c'] }, b: { to: ['z'] }, c: { to: ['z'] }, z: { ending: true }, other: {} });
+test('사건을 경로별로 유지하며 대상·무관한 노드·판본 사건은 제외한다', () => {
+  const work = fixture(), evidence = branchEvidence(work, { b: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' } }], z: [{ entityId: 'hero', kind: 'state', data: { vital: 'alive' } }] });
+  evidence.events.push({ eventId: 'variant', nodeId: 'c', receiptId: 'v-c', variant: 'en', entityId: 'hero', kind: 'state', data: { vital: 'dead' } });
+  const scope = branchScope({ work, ...evidence, nodeId: 'z' });
+  assert.equal(scope.complete, true); assert.equal(scope.paths[0].events.length, 1); assert.equal(scope.paths[1].events.length, 0);
+  assert.ok(scope.paths.every((p) => !p.events.some((e) => e.nodeId === 'z')));
+});
+test('본문 손수정·import·빠진 사건·다른 영수증 사건은 신뢰하지 않는다', () => {
+  for (const alter of [({ work }) => { work.tree.nodes.get('b').body += '수정'; }, ({ work }) => { work.tree.nodes.get('b').status = 'imported'; }, ({ events }) => { events.length = 0; }, ({ events }) => { events[0].receiptId = 'wrong'; }]) {
+    const work = fixture(), evidence = branchEvidence(work, { b: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' } }] }); alter({ work, ...evidence });
+    const scope = branchScope({ work, ...evidence, nodeId: 'z' });
+    assert.equal(scope.complete, false); assert.equal(scope.paths[0].complete, false); assert.equal(scope.paths[1].complete, true);
+    assert.ok(scope.problems.some((p) => p.code === 'BRANCH_EVENTS_UNVERIFIED'));
+  }
+});
+test('무관한 연결 변화는 경로 rev와 전체 구조 rev를 구분한다', () => {
+  const work = fixture(), evidence = branchEvidence(work), first = branchScope({ work, ...evidence, nodeId: 'z' });
+  work.tree.nodes.get('other').links.push({ to: 'a', kind: 'choice' });
+  const second = branchScope({ work, ...evidence, nodeId: 'z' });
+  assert.equal(first.rev, second.rev); assert.notEqual(first.graph.rev, second.graph.rev);
+});
+test('기능 끄기와 비분기 대상은 해당 없음이다', () => {
+  const work = fixture(); work.config.features.branching = false;
+  assert.equal(branchScope({ work, events: [], receiptRecords: [], nodeId: 'z' }).applicable, false);
+});
+test('반환 사건과 문맥 바이트 상한은 전체 완료로 표시하지 않는다', () => {
+  const work = fixture(), evidence = branchEvidence(work, { a: [{ entityId: 'hero', kind: 'state', data: { payload: 'x'.repeat(2100000) } }] });
+  const scope = branchScope({ work, ...evidence, nodeId: 'z' });
+  assert.equal(scope.complete, false); assert.ok(Buffer.byteLength(JSON.stringify(scope.paths)) <= 2 * 1024 * 1024);
+  assert.ok(scope.problems.some((p) => p.code === 'BRANCH_ANALYSIS_INCOMPLETE'));
+});
+
+test('관련 순환을 지나는 경로는 사실 완료가 아니다', () => {
+  const work = branchWork({ a: { entry: true, to: ['b'] }, b: { to: ['a', 'z'] }, z: { ending: true } });
+  const scope = branchScope({ work, ...branchEvidence(work), nodeId: 'z' });
+  assert.equal(scope.paths[0].complete, false);
+});
+test('전체 반환 사건 20000개 한도를 넘으면 미완료다', () => {
+  const work = fixture(), events = Array.from({ length: 20001 }, (_, i) => ({ entityId: 'hero', kind: 'state', data: { i } }));
+  const scope = branchScope({ work, ...branchEvidence(work, { a: events }), nodeId: 'z' });
+  assert.equal(scope.complete, false); assert.ok(scope.paths.flatMap((p) => p.events).length <= 20000);
+});
diff --git a/test/support/branching.js b/test/support/branching.js
new file mode 100644
--- /dev/null
+++ b/test/support/branching.js
@@ -0,0 +1,23 @@
+import { sha256 } from '../../core/util/hash.js';
+export function branchWork(spec) {
+  const nodes = new Map(Object.entries(spec).map(([id, data]) => [id, {
+    id, kind: 'leaf', role: 'body', level: 'scene', status: 'committed', parentId: null,
+    body: `${id} 합성 원고`, children: [], entities: [], assets: [], links: (data.to ?? []).map((to) => ({ to, kind: 'choice', label: '' })),
+    data: { branching: { entry: Boolean(data.entry), ending: Boolean(data.ending) } }, ...data,
+  }]));
+  return { tree: { nodes }, config: { features: { branching: true, links: true } },
+    positions: new Map([...nodes.keys()].map((id, ordinal) => [id, { unorderedBy: 'branching', ordered: false, orderMode: 'branching', ordinal }])),
+    entities: new Map(), assets: new Map(), sources: new Map() };
+}
+export function branchEvidence(work, byNode = {}) {
+  const records = [], events = [];
+  for (const node of work.tree.nodes.values()) {
+    const receiptId = `r-${node.id}`, draftHash = sha256(node.body);
+    const declared = (byNode[node.id] ?? []).map((e, i) => ({ eventId: `${node.id}-${i}`, ...e }));
+    records.push({ type: 'receipt', receiptId, runId: `run-${node.id}`, nodeId: node.id, variant: 'main', level: 'scene',
+      pipelineDigest: sha256('pipeline'), draftHash, steps: [{ id: 'facts', kind: 'check', status: 'passed', draftHash }], refs: [], hard: 0, events: declared });
+    records.push({ type: 'commit', nodeId: node.id, receiptId, variant: 'main', committedHash: draftHash });
+    events.push(...declared.map((e, i) => ({ ...e, type: 'event', nodeId: node.id, receiptId, seq: i + 1 })));
+  }
+  return { receiptRecords: records, events };
+}
```

- [ ] **Step 2: Run RED.** Node 24 경로를 PATH 앞에 둔다.

```bash
node --test test/core/branch-graph.test.js test/core/branch-scope.test.js
```

Expected: FAIL (새 모듈/인터페이스가 없거나 새 기능·순서·팩 목록이 이전 기대값과 다름).

- [ ] **Step 3: Apply the complete implementation.** 다음 전체 패치를 임시 파일에 저장해 `git apply`로 적용한다.

```diff
diff --git a/core/branching/evidence.js b/core/branching/evidence.js
new file mode 100644
--- /dev/null
+++ b/core/branching/evidence.js
@@ -0,0 +1,29 @@
+import { lastCommits, receiptsById, RESERVED_RECEIPT_FIELDS, validateReceipt } from '../ledger/receipts.js';
+import { MAIN, variantOf } from '../variants/model.js';
+import { canonicalJson, sha256 } from '../util/hash.js';
+const EVENT_META = new Set(['type', 'nodeId', 'receiptId', 'seq', 'at', 'prev', 'hash', 'supersedes']);
+const plainEvent = (event) => Object.fromEntries(Object.entries(event).filter(([key]) => !EVENT_META.has(key)));
+/** 기록장 I/O는 호출자가 한다. 현재 main 커밋·원고·영수증의 사건을 정확히 결속한다. */
+export function branchEvidence(work, events, receiptRecords) {
+  const commits = lastCommits(receiptRecords), receipts = receiptsById(receiptRecords), byNode = new Map();
+  for (const event of events) {
+    if (event.type !== 'event' || variantOf(event) !== MAIN) continue;
+    if (!byNode.has(event.nodeId)) byNode.set(event.nodeId, []);
+    byNode.get(event.nodeId).push(event);
+  }
+  const cache = new Map();
+  return (id) => {
+    if (cache.has(id)) return cache.get(id);
+    const node = work.tree.nodes.get(id), commit = commits.get(id), record = receipts.get(commit?.receiptId);
+    const receipt = record && Object.fromEntries(Object.entries(record).filter(([key]) => !RESERVED_RECEIPT_FIELDS.includes(key)));
+    const own = (byNode.get(id) ?? []).filter((e) => e.receiptId === commit?.receiptId).sort((a, b) => a.seq - b.seq);
+    let verified = Boolean(node?.status === 'committed' && commit && receipt && variantOf(receipt) === MAIN && receipt.nodeId === id
+      && receipt.draftHash === commit.committedHash && sha256(node.body) === commit.committedHash && receipt.hard === 0 && Array.isArray(receipt.events));
+    if (verified) {
+      try { verified = validateReceipt(receipt).length === 0 && canonicalJson(own.map(plainEvent)) === canonicalJson(receipt.events); }
+      catch { verified = false; }
+    }
+    const result = { verified, events: verified ? own : [], binding: [id, commit?.receiptId ?? null, commit?.committedHash ?? null, node ? sha256(node.body) : null, verified] };
+    cache.set(id, result); return result;
+  };
+}
diff --git a/core/branching/graph.js b/core/branching/graph.js
new file mode 100644
--- /dev/null
+++ b/core/branching/graph.js
@@ -0,0 +1,58 @@
+import { canonicalJson, sha256 } from '../util/hash.js';
+import { isPlainObject } from '../util/plain.js';
+import { BRANCH_LIMITS, components, reach, reverseEdges } from './paths.js';
+/** 본문 잎만 독자의 이동 정점이다. front/back 조상 아래는 제외한다. */
+export function isBranchLeaf(work, nodeId) {
+  const node = work.tree.nodes.get(nodeId);
+  if (!node || node.kind !== 'leaf' || node.role !== 'body' || work.positions.get(nodeId)?.unorderedBy !== 'branching') return false;
+  const seen = new Set([nodeId]); let parentId = node.parentId;
+  while (parentId) {
+    if (seen.has(parentId)) return false; seen.add(parentId);
+    const parent = work.tree.nodes.get(parentId); if (!parent || parent.role !== 'body') return false;
+    parentId = parent.parentId;
+  }
+  return true;
+}
+export function buildBranchGraph(work) {
+  const problems = [], candidates = [], entries = [], endings = [];
+  let truncated = false, examined = 0;
+  const problem = (value) => {
+    if (problems.length < BRANCH_LIMITS.problems) problems.push(value);
+    else { truncated = true; problems[BRANCH_LIMITS.problems - 1] = { code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'problems' }; }
+  };
+  for (const node of work.tree.nodes.values()) {
+    if (node.data?.branching !== undefined && !isBranchLeaf(work, node.id)) problem({ code: 'BRANCH_METADATA_INVALID', nodeId: node.id });
+    if (isBranchLeaf(work, node.id)) candidates.push(node.id);
+  }
+  candidates.sort();
+  if (candidates.length > BRANCH_LIMITS.nodes) { truncated = true; problem({ code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'nodes' }); }
+  const vertices = candidates.slice(0, BRANCH_LIMITS.nodes), valid = new Set(vertices);
+  const edges = Object.fromEntries(vertices.map((id) => [id, []]));
+  for (const id of vertices) {
+    const node = work.tree.nodes.get(id), meta = node.data?.branching;
+    const metadataOk = meta === undefined || (isPlainObject(meta) && Object.keys(meta).every((key) => ['entry', 'ending'].includes(key) && typeof meta[key] === 'boolean'));
+    if (!metadataOk) problem({ code: 'BRANCH_METADATA_INVALID', nodeId: id });
+    if (metadataOk && meta?.entry === true) entries.push(id);
+    if (metadataOk && meta?.ending === true) endings.push(id);
+    const choices = (node.links ?? []).filter((l) => l.kind === 'choice');
+    if (endings.includes(id) && choices.length) problem({ code: 'BRANCH_ENDING_HAS_CHOICES', nodeId: id });
+    const seen = new Set();
+    for (const link of choices) {
+      if (++examined > BRANCH_LIMITS.edges) { truncated = true; problem({ code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'edges' }); break; }
+      if (!valid.has(link.to)) { problem({ code: 'BRANCH_TARGET_INVALID', nodeId: id, to: link.to }); continue; }
+      if (link.to === id) problem({ code: 'BRANCH_SELF_CHOICE', nodeId: id });
+      if (seen.has(link.to)) { problem({ code: 'BRANCH_CHOICE_DUPLICATE', nodeId: id, to: link.to }); continue; }
+      seen.add(link.to); if (!endings.includes(id)) edges[id].push(link.to);
+    }
+    edges[id].sort();
+  }
+  if (!entries.length) problem({ code: 'BRANCH_ENTRY_MISSING' });
+  const reverse = reverseEdges(vertices, edges), reached = [...reach(entries, edges)].sort(), canEnd = [...reach(endings, reverse)].sort();
+  const cycles = components(vertices, edges, reverse);
+  for (const nodeIds of cycles) problem({ code: 'BRANCH_CYCLE', nodeIds, canEnd: nodeIds.some((id) => canEnd.includes(id)) });
+  const stableProblems = problems.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
+  const rev = sha256(canonicalJson({ vertices, edges, entries, endings, problems: stableProblems, truncated }));
+  return { vertices, edges, entries, endings, reached, canEnd, cycles, reverse, problems: stableProblems, truncated, rev };
+}
+/** 모델과 검사기에 공개할 요약. 내부 역방향 인덱스는 숨긴다. */
+export const graphView = ({ vertices, edges, entries, endings, reached, canEnd, problems, truncated, rev }) => ({ vertices, edges, entries, endings, reached, canEnd, problems, truncated, rev });
diff --git a/core/branching/paths.js b/core/branching/paths.js
new file mode 100644
--- /dev/null
+++ b/core/branching/paths.js
@@ -0,0 +1,68 @@
+import { canonicalJson, sha256 } from '../util/hash.js';
+export const BRANCH_LIMITS = Object.freeze({ nodes: 5000, edges: 20000, paths: 256, depth: 512, states: 100000, events: 20000, bytes: 2 * 1024 * 1024, problems: 200 });
+/** 순환을 허용하는 선형 도달성. 폴더 차례와 무관하다. */
+export function reach(seeds, edges) {
+  const seen = new Set(seeds), queue = [...seeds];
+  for (let i = 0; i < queue.length; i++) for (const id of edges[queue[i]] ?? []) if (!seen.has(id)) { seen.add(id); queue.push(id); }
+  return seen;
+}
+export function reverseEdges(vertices, edges) {
+  const reverse = Object.fromEntries(vertices.map((id) => [id, []]));
+  for (const id of vertices) for (const to of edges[id] ?? []) reverse[to].push(id);
+  for (const list of Object.values(reverse)) list.sort();
+  return reverse;
+}
+/** 재귀 없는 Kosaraju. 상태 의미를 결합하지 않고 그래프 순환만 찾는다. */
+export function components(vertices, edges, reverse) {
+  const seen = new Set(), finished = [];
+  for (const seed of vertices) {
+    if (seen.has(seed)) continue;
+    seen.add(seed); const stack = [{ id: seed, next: 0 }];
+    while (stack.length) {
+      const frame = stack.at(-1), targets = edges[frame.id];
+      if (frame.next === targets.length) { finished.push(frame.id); stack.pop(); continue; }
+      const id = targets[frame.next++]; if (seen.has(id)) continue;
+      seen.add(id); stack.push({ id, next: 0 });
+    }
+  }
+  const assigned = new Set(), groups = [];
+  for (const seed of finished.reverse()) {
+    if (assigned.has(seed)) continue;
+    const group = [], stack = [seed]; assigned.add(seed);
+    while (stack.length) {
+      const id = stack.pop(); group.push(id);
+      for (const previous of reverse[id]) if (!assigned.has(previous)) { assigned.add(previous); stack.push(previous); }
+    }
+    group.sort(); groups.push(group);
+  }
+  return groups.filter((g) => g.length > 1 || edges[g[0]].includes(g[0])).sort((a, b) => a[0].localeCompare(b[0]));
+}
+/** 진입→대상 직전의 단순 경로. 대기 상태마다 경로 복사본을 만들지 않는다. */
+export function pathsTo(graph, nodeId) {
+  const ancestors = reach([nodeId], graph.reverse), relevant = new Set([...ancestors].filter((id) => graph.reached.includes(id)));
+  const problems = [], paths = [];
+  let complete = !graph.truncated, states = 0;
+  for (const cycle of graph.cycles) if (cycle.some((id) => relevant.has(id))) { complete = false; problems.push({ code: 'BRANCH_CYCLE', nodeIds: cycle }); }
+  const cut = (limit) => { complete = false; if (!problems.some((p) => p.limit === limit)) problems.push({ code: 'BRANCH_ANALYSIS_INCOMPLETE', limit }); };
+  outer: for (const entry of graph.entries.filter((id) => relevant.has(id))) {
+    const route = [entry], visiting = new Set(route), stack = [{ id: entry, next: 0 }];
+    while (stack.length) {
+      if (++states > BRANCH_LIMITS.states) { cut('states'); break outer; }
+      const frame = stack.at(-1);
+      if (frame.id === nodeId) {
+        if (paths.length >= BRANCH_LIMITS.paths) { cut('paths'); break outer; }
+        const nodeIds = route.slice(0, -1);
+        paths.push({ pathId: sha256(canonicalJson(route)), entry, nodeIds });
+        stack.pop(); visiting.delete(route.pop()); continue;
+      }
+      const targets = graph.edges[frame.id] ?? [];
+      if (frame.next === targets.length) { stack.pop(); visiting.delete(route.pop()); continue; }
+      const id = targets[frame.next++];
+      if (!relevant.has(id) || visiting.has(id)) continue;
+      if (route.length >= BRANCH_LIMITS.depth) { cut('depth'); continue; }
+      route.push(id); visiting.add(id); stack.push({ id, next: 0 });
+    }
+  }
+  if (!paths.length) { complete = false; problems.push({ code: graph.entries.length ? 'BRANCH_TARGET_UNREACHED' : 'BRANCH_ENTRY_MISSING', nodeId }); }
+  return { paths, relevant: [...relevant].sort(), complete, problems };
+}
diff --git a/core/branching/scope.js b/core/branching/scope.js
new file mode 100644
--- /dev/null
+++ b/core/branching/scope.js
@@ -0,0 +1,35 @@
+import { canonicalJson, sha256 } from '../util/hash.js';
+import { buildBranchGraph, graphView, isBranchLeaf } from './graph.js';
+import { BRANCH_LIMITS, pathsTo } from './paths.js';
+import { branchEvidence } from './evidence.js';
+/** 선택 경로별 사건. 코어는 생사·파괴 같은 사건의 뜻을 해석하지 않는다. */
+export function branchScope({ work, events, receiptRecords = [], nodeId }) {
+  if (!work.config.features.branching || !isBranchLeaf(work, nodeId)) return { applicable: false };
+  const graph = buildBranchGraph(work), found = pathsTo(graph, nodeId), evidence = branchEvidence(work, events, receiptRecords);
+  /** @type {any[]} */
+  const problems = [...found.problems], paths = [], bindings = found.relevant.filter((id) => id !== nodeId).map((id) => evidence(id).binding);
+  let complete = found.complete, count = 0, bytes = 2;
+  for (const path of found.paths) {
+    const collected = [], missing = []; let limited = false, eventBytes = 0;
+    for (const id of path.nodeIds) {
+      const data = evidence(id);
+      if (!data.verified) missing.push(id);
+      if (count + data.events.length > BRANCH_LIMITS.events) { limited = true; break; }
+      for (const event of data.events) {
+        if (bytes + eventBytes + Buffer.byteLength(canonicalJson(event)) + 1024 > BRANCH_LIMITS.bytes) { limited = true; break; }
+        collected.push(event); count++; eventBytes += Buffer.byteLength(canonicalJson(event)) + 1;
+      }
+      if (limited) break;
+    }
+    const full = { ...path, events: collected, complete: !missing.length && !limited && !graph.truncated && !graph.cycles.some((c) => c.some((id) => id === nodeId || path.nodeIds.includes(id))) };
+    if (bytes + Buffer.byteLength(canonicalJson(full)) + 1 > BRANCH_LIMITS.bytes) { limited = true; full.events = []; full.complete = false; }
+    bytes += Buffer.byteLength(canonicalJson(full)) + 1;
+    if (missing.length) problems.push({ code: 'BRANCH_EVENTS_UNVERIFIED', pathId: path.pathId, nodeIds: missing });
+    if (limited) problems.push({ code: 'BRANCH_ANALYSIS_INCOMPLETE', pathId: path.pathId, limit: 'events-or-bytes' });
+    if (!full.complete) complete = false;
+    paths.push(full);
+  }
+  const topology = found.relevant.map((id) => [id, graph.edges[id].filter((to) => found.relevant.includes(to)), graph.entries.includes(id), graph.endings.includes(id)]);
+  const rev = sha256(canonicalJson({ topology, bindings, complete, problems }));
+  return { applicable: true, graph: graphView(graph), paths, complete, problems, rev, limits: BRANCH_LIMITS };
+}
```

- [ ] **Step 4: Run GREEN and validate.**

```bash
node --test test/core/branch-graph.test.js test/core/branch-scope.test.js
npm run lint
npm run typecheck
```

Expected: PASS. 생성한 파일이 300줄 이하인지, 다른 태스크·판본·기존 잠금 범위를 덧고치지 않았는지 자가 검토한다.

- [ ] **Step 5: Commit and report.**

```bash
git add core/branching/evidence.js core/branching/graph.js core/branching/paths.js core/branching/scope.js test/core/branch-graph.test.js test/core/branch-scope.test.js test/support/branching.js
git commit -m "feat: add verified branching path scope"
```

보고 파일에는 RED/GREEN 명령과 결과, 바뀐 파일, 커밋, 자가 검토·우려를 기록한다.

### Task 2: 실행 범위·참고 버전·순서·넘김 잠금 통합

**Files:**
- Modify: `core/checks/run-checks.js`
- Modify: `core/ledger/receipts.js`
- Modify: `core/pack/validate.js`
- Modify: `core/pack/yaml-schema.js`
- Modify: `core/run/commit-locks.js`
- Modify: `core/run/payload.js`
- Modify: `core/run/receipt-builder.js`
- Modify: `core/run/steps/recheck-step.js`
- Modify: `core/run/sync.js`
- Modify: `core/scope/rechecks.js`
- Modify: `core/scope/scope.js`
- Modify: `core/scope/stale-checks.js`
- Modify: `core/scope/stale.js`
- Modify: `core/work/features.js`
- Modify: `test/core/features.test.js`
- Create: `test/run/branch-integration.test.js`
- Modify: `test/run/order-none-checks.test.js`
- Modify: `test/run/order-stale.test.js`
- Modify: `test/run/scope-linked.test.js`
- Modify: `test/server/feature-toggles.test.js`

**Interfaces:**
- Consumes: Task 1 branchScope/buildBranchGraph/graphView. 기존 gatherScope/entityRevAt/currentRev/receipt 빌더·재검사·기록장·검사 실행기.
- Produces: gatherScope와 entityRevAt는 선택적 receiptRecords를 받는다. scope.branching은 applicable일 때만 생기며 paths 사건은 기존 엔티티 범위로 거른다. currentRev도 receiptRecords를 받는다. nodeOrder는 branching일 때 선택적 unorderedBy, orderChanged(had,now), receiptFeatures(work,nodeId,isMain=true). branching/branch-graph ref와 선택적 features.branching; requiresOrder branching.

- [ ] **Step 1: Write the failing tests.** 다음 전체 test 패치를 임시 파일에 저장해 `git apply`로 적용한다.

```diff
diff --git a/test/core/features.test.js b/test/core/features.test.js
--- a/test/core/features.test.js
+++ b/test/core/features.test.js
@@ -17,7 +17,7 @@
   assert.deepEqual(config.features, {
     occurrences: true, occurrencesInExtract: true, occurrenceScope: false, rename: true, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
     viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true, viewerExport: true,
-    images: true, imageReferences: true, imageReview: true, variants: true,
+    images: true, imageReferences: true, imageReview: true, variants: true, branching: true,
   });
   assert.deepEqual(config.features, FEATURES);
   assert.ok(Object.isFrozen(FEATURES));
@@ -35,7 +35,7 @@
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false } }).config.features,
     { occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
       viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true, viewerExport: true,
-      images: true, imageReferences: true, imageReview: true, variants: true });
+      images: true, imageReferences: true, imageReview: true, variants: true, branching: true });
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false, rename: true } }).errors,
     [{ code: 'FEATURE_REQUIRES', feature: 'rename', requires: 'occurrences' }]);
   const detail = validateWorkConfig({ ...base, features: { occurrences: false, occurrencesInExtract: false, rename: false } }).errors;
@@ -118,12 +118,12 @@

 test('N4 features: links and linkScope are on by default and appended after termIndex; linkScope follows links and changes the run digest', () => {
   const keys = Object.keys(FEATURES);
-  assert.deepEqual(keys.slice(-7), ['links', 'linkScope', 'viewerExport', 'images', 'imageReferences', 'imageReview', 'variants']);
+  assert.deepEqual(keys.slice(keys.indexOf('links'), keys.indexOf('links') + 7), ['links', 'linkScope', 'viewerExport', 'images', 'imageReferences', 'imageReview', 'variants']);
   assert.equal(keys.indexOf('links'), keys.indexOf('termIndex') + 1);
   assert.deepEqual([FEATURES.links, FEATURES.linkScope, FEATURE_PARENTS.links, FEATURE_PARENTS.linkScope], [true, true, undefined, 'links']);
-  assert.deepEqual([RUN_FEATURES.includes('links'), RUN_FEATURES.at(-1)], [false, 'linkScope']);
+  assert.deepEqual([RUN_FEATURES.includes('links'), RUN_FEATURES.at(-2)], [false, 'linkScope']);
   const eff = (features) => validateWorkConfig({ ...base, features });
-  assert.deepEqual(eff({ links: false }).config.features, { ...FEATURES, links: false, linkScope: false });
+  assert.deepEqual(eff({ links: false }).config.features, { ...FEATURES, links: false, linkScope: false, branching: false });
   assert.deepEqual(eff({ links: false }).errors, []);
   assert.deepEqual(eff({ links: false, linkScope: true }).errors, [{ code: 'FEATURE_REQUIRES', feature: 'linkScope', requires: 'links' }]);
   const d = (f) => featuresDigest({ ...FEATURES, ...f });
@@ -142,7 +142,7 @@

 test('M7a features: images, imageReferences and imageReview are on by default and appended before variants; the two children follow images; none changes the node run digest', () => {
   const keys = Object.keys(FEATURES);
-  assert.deepEqual(keys.slice(-5), ['viewerExport', 'images', 'imageReferences', 'imageReview', 'variants']);
+  assert.deepEqual(keys.slice(keys.indexOf('viewerExport'), keys.indexOf('viewerExport') + 5), ['viewerExport', 'images', 'imageReferences', 'imageReview', 'variants']);
   assert.deepEqual([FEATURES.images, FEATURES.imageReferences, FEATURES.imageReview], [true, true, true]);
   assert.deepEqual([FEATURE_PARENTS.images, FEATURE_PARENTS.imageReferences, FEATURE_PARENTS.imageReview], [undefined, 'images', 'images']);
   const eff = (features) => validateWorkConfig({ ...base, features });
@@ -158,7 +158,7 @@

 test('N6 feature: variants is on by default, appended after imageReview, without a parent and outside the run digest', () => {
   const keys = Object.keys(FEATURES);
-  assert.deepEqual(keys.slice(-1), ['variants']);
+  assert.deepEqual(keys.slice(keys.indexOf('variants'), keys.indexOf('variants') + 1), ['variants']);
   assert.equal(keys.indexOf('variants'), keys.indexOf('imageReview') + 1);
   assert.deepEqual([FEATURES.variants, FEATURE_PARENTS.variants, RUN_FEATURES.includes('variants')], [true, undefined, false]);
   assert.equal(featuresDigest({ ...FEATURES, variants: false }), featuresDigest(FEATURES));
diff --git a/test/run/branch-integration.test.js b/test/run/branch-integration.test.js
new file mode 100644
--- /dev/null
+++ b/test/run/branch-integration.test.js
@@ -0,0 +1,62 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { gatherScope, entityRevAt } from '../../core/scope/scope.js';
+import { currentRev, findStale } from '../../core/scope/stale.js';
+import { pendingRechecks } from '../../core/scope/rechecks.js';
+import { nodeOrder, orderReason, receiptFeatures } from '../../core/scope/stale-checks.js';
+import { validateReceipt } from '../../core/ledger/receipts.js';
+import { applicability } from '../../core/checks/run-checks.js';
+import { sameFinding, assertOrderMatches } from '../../core/run/commit-locks.js';
+import { basePayload } from '../../core/run/payload.js';
+import { FEATURES, readFeatures } from '../../core/work/features.js';
+import { branchWork, branchEvidence } from '../support/branching.js';
+function fixture() {
+  const work = branchWork({ a: { entry: true, to: ['b', 'c'] }, b: { to: ['z'] }, c: { to: ['z'] }, z: { ending: true } });
+  work.config = { ...work.config, levels: [{ name: 'scene', leaf: true }] };
+  work.entities.set('hero', { id: 'hero', kind: 'character', name: '주인공', aliases: [], body: '', rev: 'entity-rev', data: {} });
+  work.tree.nodes.get('z').entities = ['hero'];
+  return { work, ...branchEvidence(work, { b: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' } }] }) };
+}
+test('분기 범위·payload·entity refs를 분리하고 main 영수증을 전달한다', () => {
+  const ctx = fixture(), scope = gatherScope({ ...ctx, nodeId: 'z', draftText: '주인공' });
+  assert.equal(scope.ordered, false); assert.deepEqual(scope.priorEvents, []); assert.deepEqual(scope.linkedEvents, []);
+  assert.equal(scope.branching.paths[0].events.length, 1); assert.ok(scope.refs.some((r) => r.kind === 'branching'));
+  for (const ref of scope.refs) assert.equal(currentRev({ ...ctx, ref, nodeId: 'z' }), ref.rev);
+  const payload = basePayload(ctx, { nodeId: 'z', mode: 'write', outputs: { draft: '주인공' } }, { id: 'draft' }, scope);
+  assert.equal(payload.branching.paths.length, 2); assert.deepEqual(payload.priorEvents, []);
+  const first = entityRevAt({ ...ctx, entityId: 'hero', nodeId: 'z' });
+  ctx.events[0].data.vital = 'alive'; ctx.receiptRecords.find((r) => r.receiptId === 'r-b' && r.type === 'receipt').events[0].data.vital = 'alive';
+  assert.notEqual(entityRevAt({ ...ctx, entityId: 'hero', nodeId: 'z' }), first);
+});
+test('경로 refs 변화가 stale·재검사 대상이며 새 분기 재검사 refs로 풀린다', () => {
+  const ctx = fixture(), scope = gatherScope({ ...ctx, nodeId: 'z', draftText: '주인공' });
+  const receipt = ctx.receiptRecords.find((r) => r.type === 'receipt' && r.nodeId === 'z');
+  receipt.refs = scope.refs; receipt.features = receiptFeatures(ctx.work, 'z'); receipt.order = nodeOrder(ctx.work, 'z');
+  ctx.receiptRecords.forEach((r, i) => { r.seq = i + 1; });
+  ctx.work.tree.nodes.get('a').links = [{ to: 'b', kind: 'choice' }];
+  const stale = findStale(ctx).filter((s) => s.nodeId === 'z'); assert.equal(stale.length, 1); assert.equal(pendingRechecks(stale).length, 1);
+  const fresh = gatherScope({ ...ctx, nodeId: 'z', draftText: '주인공' });
+  const commit = ctx.receiptRecords.find((r) => r.type === 'commit' && r.nodeId === 'z');
+  ctx.receiptRecords.push({ type: 'recheck', nodeId: 'z', committedHash: commit.committedHash, seq: 99, refs: fresh.refs, features: receipt.features, order: receipt.order });
+  assert.ok(!findStale(ctx).some((s) => s.nodeId === 'z'));
+});
+test('none와 branching 전환·부모에서 상속한 전환은 유효 순서로 감지한다', () => {
+  const { work } = fixture(), had = nodeOrder(work, 'z');
+  work.positions.get('z').orderMode = 'linear'; work.positions.get('z').unorderedBy = 'none';
+  assert.ok(orderReason({ work, nodeId: 'z', had })); assert.throws(() => assertOrderMatches(work, { nodeId: 'z', order: had }), { code: 'LOCK_RECEIPT_INVALID' });
+});
+test('판본 문맥은 분기 검사에 해당하지 않으며 경로 넘김은 다른 경로를 덮지 않는다', () => {
+  assert.equal(applicability({ requiresOrder: 'branching' }, { unorderedBy: 'branching' }), 'not_applicable');
+  assert.equal(applicability({ requiresOrder: 'branching' }, { branching: { applicable: true } }), 'applicable');
+  const f = { checkId: 'gamebook.path-facts', code: 'DEAD_ON_STAGE', pathId: 'left', entityId: 'hero' };
+  assert.equal(sameFinding(f, { ...f, pathId: 'right' }), false); assert.equal(sameFinding(f, { ...f, entityId: 'other' }), false);
+  assert.equal(sameFinding({ checkId: 'old', code: 'X' }, { checkId: 'old', code: 'X' }), true);
+});
+test('기능 부모·선택적 영수증 feature의 이전 호환성을 유지한다', () => {
+  const errors = [], f = readFeatures({ links: false }, errors); assert.equal(f.branching, false); assert.deepEqual(errors, []); assert.equal(FEATURES.branching, true);
+  const { work, receiptRecords } = fixture(), record = receiptRecords[0], { type: _type, ...receipt } = record;
+  receipt.features = { occurrenceScope: false, branching: true }; assert.deepEqual(validateReceipt(receipt), []);
+  receipt.features.branching = 'yes'; assert.ok(validateReceipt(receipt).some((p) => p.code === 'FEATURES_INVALID'));
+  receipt.features = { occurrenceScope: false }; assert.deepEqual(validateReceipt(receipt), []);
+  work.positions.get('z').unorderedBy = 'none'; assert.deepEqual(receiptFeatures(work, 'z'), { occurrenceScope: false });
+});
diff --git a/test/run/order-none-checks.test.js b/test/run/order-none-checks.test.js
--- a/test/run/order-none-checks.test.js
+++ b/test/run/order-none-checks.test.js
@@ -16,9 +16,9 @@

 const spec = (requiresOrder) => ({ name: 'demo', checks: { 'demo.x': { tier: 'deterministic', stage: 'facts', severity: 'advisory', run: 'x', requiresOrder } } });

-test('pack.yaml requiresOrder takes linear or none; anything else is PACK_FIELD_INVALID', () => {
-  for (const value of ['linear', 'none', undefined]) assert.deepEqual(readPackSpec(spec(value)).errors, [], String(value));
-  for (const value of ['branching', 'NONE', 'None', ' none', '', true, ['none'], null]) {
+test('pack.yaml requiresOrder takes linear, none or branching; anything else is PACK_FIELD_INVALID', () => {
+  for (const value of ['linear', 'none', 'branching', undefined]) assert.deepEqual(readPackSpec(spec(value)).errors, [], String(value));
+  for (const value of ['NONE', 'None', ' none', '', true, ['none'], null]) {
     assert.deepEqual(readPackSpec(spec(value)).errors, [{ code: 'PACK_FIELD_INVALID', path: 'checks.demo.x.requiresOrder' }], String(value));
   }
 });
diff --git a/test/run/order-stale.test.js b/test/run/order-stale.test.js
--- a/test/run/order-stale.test.js
+++ b/test/run/order-stale.test.js
@@ -49,9 +49,9 @@
   assert.deepEqual(orderReasons(await staleOf(root)).map(([id]) => id), ['atp-section']);
   const leaf = await firstLeaf('gamebook');
   const game = await committedWith({ fixture: 'gamebook', node: leaf });
-  assert.deepEqual((await receiptOf(game.root, leaf)).order, { mode: 'branching', ordered: false });
+  assert.deepEqual((await receiptOf(game.root, leaf)).order, { mode: 'branching', ordered: false, unorderedBy: 'branching' });
   await editYaml(game.root, (config) => { config.order = 'none'; });
-  assert.deepEqual(orderReasons(await staleOf(game.root)), []);
+  assert.deepEqual(orderReasons(await staleOf(game.root)).map(([id]) => id), [leaf]);
 });

 test('an order switch while a run is open re-plans the checks, so the receipt order is the order the checks saw', async () => {
diff --git a/test/run/scope-linked.test.js b/test/run/scope-linked.test.js
--- a/test/run/scope-linked.test.js
+++ b/test/run/scope-linked.test.js
@@ -88,7 +88,7 @@
   events: eventsBefore({ events, positions: work.positions, nodeId }).events.filter((e) => e.entityId === entityId).map((e) => [e.eventId, e.kind, e.data ?? null]),
 }));

-test('a linear work keeps the same entity revs whether linkScope is on or off, and every rev equals the pre-N4 formula; branching and front/back nodes too', async () => {
+test('a linear work keeps the same entity revs whether linkScope is on or off, and every rev equals the pre-N4 formula; front/back nodes too; branching with its feature off', async () => {
   const root = await copyFixture('novel-3level');
   await seedEvents(root, 'novel-3level');
   await addLinks(root, '02-book-two/01-after/01-funeral.md', ['last-night']);
@@ -105,6 +105,7 @@
   const bookEvents = [{ type: 'event', eventId: 'x', seq: 1, nodeId: 'membranes', entityId: 'membrane', kind: 'term.defined' }];
   const works = [[work, events], [await openWork(game), activeEvents(await openLedger(game, 'events').readAll())], [await openWork(book), bookEvents]];
   for (const [w, evs] of works) {
+    w.config.features.branching = false;
     for (const nodeId of w.tree.nodes.keys()) {
       for (const entityId of w.entities.keys()) assert.equal(entityRevAt({ work: w, events: evs, entityId, nodeId }), preN4Rev(w, evs, entityId, nodeId), `${nodeId}/${entityId}`);
     }
diff --git a/test/server/feature-toggles.test.js b/test/server/feature-toggles.test.js
--- a/test/server/feature-toggles.test.js
+++ b/test/server/feature-toggles.test.js
@@ -29,7 +29,7 @@
   assert.deepEqual(values, {
     occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true,
     promiseScope: true, viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true, viewerExport: true,
-    images: true, imageReferences: true, imageReview: true, variants: true,
+    images: true, imageReferences: true, imageReview: true, variants: true, branching: true,
   });
   const renamed = await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' });
   assert.equal(code(renamed), 'FEATURE_DISABLED');
```

- [ ] **Step 2: Run RED.** Node 24 경로를 PATH 앞에 둔다.

```bash
node --test test/run/branch-integration.test.js test/core/features.test.js test/run/order-stale.test.js test/run/order-none-checks.test.js test/run/scope-linked.test.js test/server/feature-toggles.test.js
```

Expected: FAIL (새 모듈/인터페이스가 없거나 새 기능·순서·팩 목록이 이전 기대값과 다름).

- [ ] **Step 3: Apply the complete implementation.** 다음 전체 패치를 임시 파일에 저장해 `git apply`로 적용한다.

```diff
diff --git a/core/checks/run-checks.js b/core/checks/run-checks.js
--- a/core/checks/run-checks.js
+++ b/core/checks/run-checks.js
@@ -11,6 +11,7 @@
 export function applicability(check, ctx) {
   if (check.requiresOrder === 'linear' && !ctx.ordered) return 'not_applicable';
   if (check.requiresOrder === 'none' && ctx.unorderedBy !== 'none') return 'not_applicable';
+  if (check.requiresOrder === 'branching' && !ctx.branching?.applicable) return 'not_applicable';
   if (check.requiresParentPlan && !ctx.parentPlan) return 'not_applicable';
   return 'applicable';
 }
diff --git a/core/ledger/receipts.js b/core/ledger/receipts.js
--- a/core/ledger/receipts.js
+++ b/core/ledger/receipts.js
@@ -65,7 +65,8 @@
 /** order(선택): { mode, ordered }. 옛 영수증에는 없다. */
 export function pushOrderProblems(order, push) {
   if (order === undefined) return;
-  if (!order || typeof order !== 'object' || (order.mode !== null && typeof order.mode !== 'string') || typeof order.ordered !== 'boolean') push('ORDER_INVALID');
+  if (!order || typeof order !== 'object' || (order.mode !== null && typeof order.mode !== 'string') || typeof order.ordered !== 'boolean'
+    || (order.unorderedBy !== undefined && order.unorderedBy !== null && !['none', 'branching', 'role'].includes(order.unorderedBy))) push('ORDER_INVALID');
 }

 /** structure(선택, 가지 영수증): { children: string[] }. 옛 영수증·잎 영수증에는 없다. */
@@ -78,7 +79,8 @@
 export function pushFeaturesProblems(features, push) {
   if (features === undefined) return;
   const ok = features && typeof features === 'object' && !Array.isArray(features)
-    && typeof features.occurrenceScope === 'boolean' && Object.keys(features).every((key) => key === 'occurrenceScope');
+    && typeof features.occurrenceScope === 'boolean' && Object.keys(features).every((key) => ['occurrenceScope', 'branching'].includes(key))
+    && (features.branching === undefined || typeof features.branching === 'boolean');
   if (!ok) push('FEATURES_INVALID');
 }

diff --git a/core/pack/validate.js b/core/pack/validate.js
--- a/core/pack/validate.js
+++ b/core/pack/validate.js
@@ -75,7 +75,9 @@
 export function validatePack(pack) {
   const ids = idErrors(pack);
   if (ids.some((e) => e.code === 'PACK_NAME_INVALID')) return ids;
-  return [...ids, ...pipelineErrors(pack)];
+  const orders = (pack.checks ?? []).filter((c) => c.requiresOrder !== undefined && !['linear', 'none', 'branching'].includes(c.requiresOrder))
+    .map((c) => ({ code: 'PACK_REQUIRES_ORDER_INVALID', checkId: c.id }));
+  return [...ids, ...pipelineErrors(pack), ...orders];
 }

 /**
diff --git a/core/pack/yaml-schema.js b/core/pack/yaml-schema.js
--- a/core/pack/yaml-schema.js
+++ b/core/pack/yaml-schema.js
@@ -14,7 +14,7 @@
 const RECOMMEND = ['kinds', 'levels', 'roles', 'positions'];
 const PRESET = ['title', 'description', 'levels', 'order', 'checkSets'];
 /** requiresOrder 값: linear(읽는 순서 안에서만), none(순서 없는 노드에서만, N4). branching 은 N7 이 더한다. */
-const REQUIRES_ORDER = ['linear', 'none'];
+const REQUIRES_ORDER = ['linear', 'none', 'branching'];
 const STEP_ID = /^[a-z][a-z0-9-]*$/;
 /** 세트·검사·프리셋 id: 점으로 이은 소문자 조각. __proto__ 같은 이름은 데이터로도 받지 않는다. */
 const SAFE_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;
diff --git a/core/run/commit-locks.js b/core/run/commit-locks.js
--- a/core/run/commit-locks.js
+++ b/core/run/commit-locks.js
@@ -3,7 +3,7 @@
 import { HASH_OPTIONAL_STATUSES } from '../ledger/receipts.js';
 import { checkStepDigest, checkStepEntry, overrideDigest, refsDigest } from '../ledger/decisions.js';
 import { canonicalJson } from '../util/hash.js';
-import { nodeOrder } from '../scope/stale-checks.js';
+import { nodeOrder, orderChanged } from '../scope/stale-checks.js';
 import { assertPipelineVariant } from '../variants/locks.js';
 import { MAIN, variantOf } from '../variants/model.js';

@@ -69,7 +69,8 @@
 }

 /** 같은 지적인가: checkId + code + quote(없으면 null). 같은 code 라도 다른 인용이면 다른 지적이다. */
-export const sameFinding = (a, b) => a?.checkId === b?.checkId && a?.code === b?.code && (a?.quote ?? null) === (b?.quote ?? null);
+export const sameFinding = (a, b) => a?.checkId === b?.checkId && a?.code === b?.code && (a?.quote ?? null) === (b?.quote ?? null)
+  && (a?.pathId ?? null) === (b?.pathId ?? null) && (a?.entityId ?? null) === (b?.entityId ?? null);
 /** 사용자가 이유를 달아 넘긴 지적인가. 출처가 user이고 이유가 비어 있지 않아야 한다. */
 export const userOverrideCovers = (overridden, finding) => (overridden ?? []).some((o) => o?.source === 'user'
   && typeof o.overrideReason === 'string' && o.overrideReason.trim() !== '' && sameFinding(o, finding));
@@ -158,7 +159,7 @@
 export function assertOrderMatches(work, record) {
   if (record.order === undefined) return;
   const now = nodeOrder(work, record.nodeId);
-  if (record.order?.mode !== now.mode || record.order?.ordered !== now.ordered) {
+  if (record.order?.mode !== now.mode || orderChanged(record.order, now)) {
     throw new FolioError('LOCK_RECEIPT_INVALID', 'the recorded order is not the node order now', { problems: [{ code: 'ORDER_MISMATCH' }] });
   }
 }
diff --git a/core/run/payload.js b/core/run/payload.js
--- a/core/run/payload.js
+++ b/core/run/payload.js
@@ -13,7 +13,7 @@
   const draftText = run.outputs.draft ?? '';
   const extracted = run.outputs.events ?? null;
   return gatherScope({
-    work: ctx.work, events: ctx.events, nodeId: run.nodeId, draftText, extracted, marks: ctx.marks ?? null,
+    work: ctx.work, events: ctx.events, receiptRecords: ctx.receiptRecords ?? [], nodeId: run.nodeId, draftText, extracted, marks: ctx.marks ?? null,
     claims: claimsFor({ work: ctx.work, records: ctx.evidenceRecords ?? null, nodeId: run.nodeId, draft: draftText, extracted }),
     scopeFields: ctx.registry?.scopeFields ?? [],
   });
@@ -44,6 +44,7 @@
       return { id, kind: entity.kind, name: entity.name, aliases: entity.aliases, body: entity.body };
     }),
     priorEvents: scope.priorEvents.map(eventView),
+    ...branchPayload(scope),
     // 순서 없는 노드(N4)의 연결된 노드 사건. 있을 때만 싣는다 — 없는 노드의 요청(과 그 digest)은 N4 전과 같다.
     ...(scope.linkedEvents.length ? { linkedEvents: scope.linkedEvents.map(eventView) } : {}),
     sources: work.config.features.sources ? scope.sources.map(sourceView) : [],
@@ -69,3 +70,11 @@
   const raw = rawPackPayload(ctx, run, step, extra);
   return { payload: dressPayload(ctx, run, step, raw), digestPayload: raw };
 }
+
+/** 분기 전용 자료는 판본 범위에 없으므로 있을 때만 공개한다. */
+function branchPayload(scope) {
+  return {
+    ...(scope.branching?.applicable ? { branching: { ...scope.branching, paths: scope.branching.paths.map((p) => ({ ...p, events: p.events.map(eventView) })) } } : {}),
+    ...(scope.branchGraph ? { branchGraph: scope.branchGraph } : {}),
+  };
+}
diff --git a/core/run/receipt-builder.js b/core/run/receipt-builder.js
--- a/core/run/receipt-builder.js
+++ b/core/run/receipt-builder.js
@@ -1,6 +1,6 @@
 import { RECEIPT_VERSION, isBlocking } from '../ledger/receipts.js';
 import { checkStepEntry } from '../ledger/decisions.js';
-import { nodeOrder } from '../scope/stale-checks.js';
+import { nodeOrder, receiptFeatures } from '../scope/stale-checks.js';
 import { appliedFromEntries } from '../checks/applied.js';
 import { MAIN, variantOf } from '../variants/model.js';

@@ -36,7 +36,7 @@
     refs,
     appliedChecks: checks && pipeline ? appliedFromEntries(checks, pipeline, entries) : undefined,
     order: nodeOrder(work, run.nodeId),
-    features: { occurrenceScope: Boolean(work.config.features.occurrenceScope) },
+    features: receiptFeatures(work, run.nodeId, isMain),
     // 가지는 커밋 때의 자식 목록을 남긴다. 나중에 자식이 더해지거나 옮겨지면 "다시 확인 필요"(structure)가 된다.
     ...(isMain && node.kind === 'branch' ? { structure: { children: [...node.children] } } : {}),
     hard: findings.filter((f) => f.severity === 'hard').length,
diff --git a/core/run/steps/recheck-step.js b/core/run/steps/recheck-step.js
--- a/core/run/steps/recheck-step.js
+++ b/core/run/steps/recheck-step.js
@@ -4,7 +4,7 @@
 import { isBlocking } from '../../ledger/receipts.js';
 import { recheckOfRun } from '../../ledger/recheck.js';
 import { recordRecheck } from '../recheck-commit.js';
-import { nodeOrder } from '../../scope/stale-checks.js';
+import { nodeOrder, receiptFeatures } from '../../scope/stale-checks.js';
 import { scopeFor } from '../payload.js';
 import { isLockError } from '../refuse.js';
 import { awaitUser, advisoriesOf, invalidateFrom, unresolvedBlocking, MAX_ANSWER_TRIES } from './common.js';
@@ -34,7 +34,7 @@
   return {
     recheckId: newId('rchk'), runId: run.runId, nodeId: run.nodeId, variant: run.variant, level: ctx.work.tree.nodes.get(run.nodeId).level,
     receiptId: run.receiptId, committedHash: run.draftHash, pipelineDigest: pipeline.digest, appliedChecks: appliedFromEntries(ctx.checks, pipeline, entries),
-    order: nodeOrder(ctx.work, run.nodeId), features: { occurrenceScope: Boolean(ctx.work.config.features.occurrenceScope) },
+    order: nodeOrder(ctx.work, run.nodeId), features: receiptFeatures(ctx.work, run.nodeId),
     steps: entries, refs, hard: hardOf(findings).length, advisories: findings.filter((f) => !isBlocking(f)), overridden: run.overridden ?? [],
   };
 }
diff --git a/core/run/sync.js b/core/run/sync.js
--- a/core/run/sync.js
+++ b/core/run/sync.js
@@ -1,6 +1,6 @@
 import { activeChecks } from '../checks/applied.js';
 import { invalidateFrom, recheckStart, receiptRecorded } from './steps/common.js';
-import { nodeOrder } from '../scope/stale-checks.js';
+import { nodeOrder, orderChanged } from '../scope/stale-checks.js';
 import { checksDigestFor, pipelineFor } from './level-pipeline.js';

 /** 실행이 따르는 검사 계획: 이 파이프라인에서 지금 켜진 검사 id 와 그 검사가 도는 단계(stage). */
@@ -21,7 +21,7 @@
 /** 실행이 만들어진(또는 마지막으로 맞춘) 설정과 지금 설정이 다른가: 레벨 파이프라인·검사 digest, 앞뒤 판정 여부, 실행에 걸리는 기능(featuresDigest). */
 export function outOfSync(run, ctx) {
   const order = nodeOrder(ctx.work, run.nodeId);
-  const sameOrder = !run.order || run.order.ordered === order.ordered;
+  const sameOrder = !run.order || !orderChanged(run.order, order);
   const sameFeatures = run.featuresDigest === undefined || run.featuresDigest === ctx.featuresDigest;
   return !(run.pipelineDigest === pipelineFor(ctx, run).digest && run.checksDigest === checksDigestFor(ctx, run) && sameOrder && sameFeatures);
 }
diff --git a/core/scope/rechecks.js b/core/scope/rechecks.js
--- a/core/scope/rechecks.js
+++ b/core/scope/rechecks.js
@@ -12,9 +12,10 @@
     const order = reasons.find((r) => r.kind === 'order');
     const feature = reasons.find((r) => r.kind === 'feature');
     const unknown = reasons.some((r) => r.kind === 'unknown');
-    if (checks.length || order || feature || unknown) {
+    const branching = reasons.some((r) => ['branching', 'branch-graph'].includes(r.kind));
+    if (checks.length || order || feature || unknown || branching) {
       out.push({
-        nodeId, checks,
+        nodeId, checks, ...(branching ? { reason: 'branching' } : {}),
         ...(order ? { order: { was: order.was, now: order.now } } : {}),
         ...(feature ? { feature: { id: feature.id, was: feature.was, now: feature.now } } : {}),
         ...(unknown ? { reason: 'unknown' } : {}),
diff --git a/core/scope/scope.js b/core/scope/scope.js
--- a/core/scope/scope.js
+++ b/core/scope/scope.js
@@ -5,6 +5,8 @@
 import { scanMentions } from '../index/scan.js';
 import { canonicalJson, sha256 } from '../util/hash.js';
 import { PROMISE_KIND } from '../promise.js';
+import { branchScope } from '../branching/scope.js';
+import { buildBranchGraph, graphView } from '../branching/graph.js';
 import { linkedScope } from './linked.js';

 const uniqueSorted = (ids) => [...new Set(ids)].sort();
@@ -24,12 +26,14 @@
  * 순서 없는(none) 노드는 연결된 노드의 그 엔티티 사건(linkedScope)도 넣는다 — 있을 때만 키를 더해, 연결 사건이 없는 노드의 값은 N4 전과 같다.
  * 연결 사건은 eventId 차례로 넣는다. none 노드의 읽는 순서 번호는 폴더 배치일 뿐이라, 폴더 순서만 바꿔도 stale 이 되지 않게 한다.
  */
-export function entityRevAt({ work, events, entityId, nodeId }) {
+export function entityRevAt({ work, events, entityId, nodeId, receiptRecords = [], branching = undefined }) {
   const before = eventsBefore({ events, positions: work.positions, nodeId });
   const relevant = before.events.filter((e) => e.entityId === entityId).map(eventKey);
   const linked = linkedScope({ work, events, nodeId }).events.filter((e) => e.entityId === entityId).map(eventKey)
     .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
-  return sha256(canonicalJson({ file: work.entities.get(entityId)?.rev ?? null, events: relevant, ...(linked.length ? { linked } : {}) }));
+  const branch = branching ?? branchScope({ work, events, receiptRecords, nodeId });
+  const paths = branch.applicable ? branch.paths.map((p) => [p.pathId, p.complete, p.events.filter((e) => e.entityId === entityId).map(eventKey)]) : null;
+  return sha256(canonicalJson({ ...(paths ? { paths } : {}), file: work.entities.get(entityId)?.rev ?? null, events: relevant, ...(linked.length ? { linked } : {}) }));
 }

 /**
@@ -37,12 +41,12 @@
  * 트리 이웃이 아니라 엔티티가 기준이다(계획서 §10).
  * @param {{ work: object, events: object[], nodeId: string, draftText?: string, extracted?: object|null,
  *   marks?: { surface: { kind: string, id: string }, entityId: string }[]|null,
- *   claims?: Array<{ quote: string, sources: Array<{ sourceId: string, quote: string }> }>, scopeFields?: readonly string[] }} input
+ *   claims?: Array<{ quote: string, sources: Array<{ sourceId: string, quote: string }> }>, scopeFields?: readonly string[], receiptRecords?: object[] }} input
  *   marks: occurrenceScope 기능이 켜졌을 때 liveMarks(...) 결과. 범위를 더하기만 한다(null이면 기능 꺼짐).
  *   claims: 이 원고의 주장(core/evidence/scope.js claimsFor). 연결한 자료를 범위(sources·refs)에 더하고 검사 ctx 로 그대로 간다.
  *   scopeFields: 팩이 켠 범위 필드(레지스트리 scopeFields, N4). 빈 목록(기본)이면 선수 개념을 읽지 않는다.
  */
-export function gatherScope({ work, events, nodeId, draftText = '', extracted = null, marks = null, claims = [], scopeFields = [] }) {
+export function gatherScope({ work, events, nodeId, draftText = '', extracted = null, marks = null, claims = [], scopeFields = [], receiptRecords = [] }) {
   const node = work.tree.nodes.get(nodeId);
   if (!node) throw new FolioError('NODE_NOT_FOUND', nodeId);
   const known = (id) => work.entities.has(id);
@@ -86,9 +90,14 @@
   const listed = (n) => (Array.isArray(n.data.sources) ? n.data.sources.filter((id) => typeof id === 'string') : []);
   const sourceIds = [...new Set([...listed(node), ...ancestors.flatMap(listed), ...claims.flatMap((c) => c.sources.map((l) => l.sourceId))])];
   const sources = sourceIds.filter((id) => work.sources.has(id)).map((id) => work.sources.get(id));
+  const branching = branchScope({ work, events, receiptRecords, nodeId });
+  const branchGraph = work.config.features.branching && node.kind === 'branch' && work.positions.get(nodeId)?.unorderedBy === 'branching'
+    ? graphView(buildBranchGraph(work)) : null;
   const refs = [
+    ...(branching.applicable ? [{ kind: 'branching', id: nodeId, rev: branching.rev }, { kind: 'branch-graph', id: nodeId, rev: branching.graph.rev }] : []),
+    ...(branchGraph ? [{ kind: 'branch-graph', id: nodeId, rev: branchGraph.rev }] : []),
     ...upperPlans.map((p) => ({ kind: 'node', id: p.nodeId, rev: p.rev })),
-    ...scopedIds.map((id) => ({ kind: 'entity', id, rev: entityRevAt({ work, events, entityId: id, nodeId }) })),
+    ...scopedIds.map((id) => ({ kind: 'entity', id, rev: entityRevAt({ work, events, entityId: id, nodeId, receiptRecords, branching }) })),
     ...assets.map((a) => ({ kind: 'asset', id: a.id, rev: a.rev })),
     ...sources.map((s) => ({ kind: 'source', id: s.id, rev: s.rev })),
   ];
@@ -96,6 +105,8 @@
   return {
     nodeId, ordered: before.applicable, unorderedBy: work.positions.get(nodeId)?.unorderedBy ?? null,
     appearances, entityIds, prerequisiteIds, priorEvents, linkedNodeIds: [...linked.nodeIds], linkedEvents, upperPlans,
+    ...(branching.applicable ? { branching: { ...branching, paths: branching.paths.map((p) => ({ ...p, events: p.events.filter((e) => inScope.has(e.entityId)) })) } } : {}),
+    ...(branchGraph ? { branchGraph } : {}),
     parentPlan: parent?.text ?? null, upperMentions, assets, sources, claims, refs,
   };
 }
diff --git a/core/scope/stale-checks.js b/core/scope/stale-checks.js
--- a/core/scope/stale-checks.js
+++ b/core/scope/stale-checks.js
@@ -31,7 +31,8 @@
 /** 노드의 지금 순서: 레벨의 순서 방식과, 앞뒤 판정에 드는지(ordered). */
 export function nodeOrder(work, nodeId) {
   const position = work.positions.get(nodeId);
-  return { mode: position?.orderMode ?? null, ordered: Boolean(position?.ordered) };
+  return { mode: position?.orderMode ?? null, ordered: Boolean(position?.ordered),
+    ...(position?.unorderedBy === 'branching' ? { unorderedBy: 'branching' } : {}) };
 }

 /**
@@ -41,17 +42,20 @@
 export function orderReason({ work, nodeId, had }) {
   if (!had || typeof had !== 'object') return null;
   const now = nodeOrder(work, nodeId);
-  return had.ordered === now.ordered ? null : { kind: 'order', id: nodeId, was: had, now };
+  return !orderChanged(had, now) ? null : { kind: 'order', id: nodeId, was: had, now };
 }

 /**
  * 커밋(또는 재검사) 때와 occurrenceScope 가 달라졌으면 이유를 돌려준다. 옛 기록(features 없음)은 끈 것으로 본다.
  * 재검사로 풀린다(범위를 새로 모아 다시 검사하므로).
  */
-export function featureReason({ work, had }) {
+export function featureReason({ work, had, nodeId = null }) {
   const was = Boolean(had?.occurrenceScope);
   const now = Boolean(work.config.features.occurrenceScope);
-  return was === now ? null : { kind: 'feature', id: 'occurrenceScope', was, now };
+  if (was !== now) return { kind: 'feature', id: 'occurrenceScope', was, now };
+  if (work.positions.get(nodeId)?.unorderedBy !== 'branching' && had?.branching === undefined) return null;
+  const prior = Boolean(had?.branching), current = Boolean(work.config.features.branching);
+  return prior === current ? null : { kind: 'feature', id: 'branching', was: prior, now: current };
 }

 /**
@@ -64,3 +68,14 @@
   const now = node?.kind === 'branch' ? [...node.children] : [];
   return canonicalJson(had.children) === canonicalJson(now) ? null : { kind: 'structure', id: nodeId, was: had.children, now };
 }
+
+/** branching의 유효 방식은 상속한 경우에도 비교한다. 이전 linear/none의 의미는 그대로다. */
+export function orderChanged(had, now) {
+  if (had.ordered !== now.ordered) return true;
+  const mode = (value) => value.unorderedBy ?? (value.mode === 'branching' ? 'branching' : null);
+  return (mode(had) === 'branching' || mode(now) === 'branching') && mode(had) !== mode(now);
+}
+export function receiptFeatures(work, nodeId, isMain = true) {
+  return { occurrenceScope: Boolean(work.config.features.occurrenceScope),
+    ...(isMain && work.positions.get(nodeId)?.unorderedBy === 'branching' ? { branching: Boolean(work.config.features.branching) } : {}) };
+}
diff --git a/core/scope/stale.js b/core/scope/stale.js
--- a/core/scope/stale.js
+++ b/core/scope/stale.js
@@ -1,3 +1,5 @@
+import { branchScope } from '../branching/scope.js';
+import { buildBranchGraph } from '../branching/graph.js';
 import { sha256 } from '../util/hash.js';
 import { lastCommits, receiptsById } from '../ledger/receipts.js';
 import { entityRevAt } from './scope.js';
@@ -7,12 +9,14 @@
  * 참고 버전의 지금 값. original(판본이 본 원본 원고, N6)은 노드 본문 hash 로, terms 는 그 판본 용어 대응표의 rev(없으면 null)로 본다.
  * 모르는 종류는 null 이다.
  */
-export function currentRev({ work, events, ref, nodeId }) {
+export function currentRev({ work, events, ref, nodeId, receiptRecords = [] }) {
   switch (ref.kind) {
     case 'node':
     case 'original': { const node = work.tree.nodes.get(ref.id); return node && node.body.trim() ? sha256(node.body) : null; }
     case 'terms': return work.variants?.get(ref.id)?.terms.rev ?? null;
-    case 'entity': return work.entities.has(ref.id) ? entityRevAt({ work, events, entityId: ref.id, nodeId }) : null;
+    case 'branching': return branchScope({ work, events, receiptRecords, nodeId: ref.id }).rev ?? null;
+    case 'branch-graph': return work.config.features.branching ? buildBranchGraph(work).rev : null;
+    case 'entity': return work.entities.has(ref.id) ? entityRevAt({ work, events, entityId: ref.id, nodeId, receiptRecords }) : null;
     case 'asset': return work.assets.get(ref.id)?.rev ?? null;
     case 'source': return work.sources.get(ref.id)?.rev ?? null;
     default: return null;
@@ -31,17 +35,19 @@
     const receipt = receipts.get(commit.receiptId);
     if (!receipt || !work.tree.nodes.has(nodeId)) continue;
     const reasons = [];
-    for (const ref of receipt.refs ?? []) {
-      const now = currentRev({ work, events, ref, nodeId });
+    const recheck = latestRecheck(receiptRecords, commit);
+    const branchingReceipt = (receipt.refs ?? []).some((r) => ['branching', 'branch-graph'].includes(r.kind));
+    const refs = branchingReceipt ? (recheck?.refs ?? receipt.refs) : receipt.refs;
+    for (const ref of refs ?? []) {
+      const now = currentRev({ work, events, ref, nodeId, receiptRecords });
       if (now !== ref.rev) reasons.push({ ...ref, was: ref.rev, now });
     }
-    const recheck = latestRecheck(receiptRecords, commit);
     const node = work.tree.nodes.get(nodeId);
     const appliedNow = applied ? (applied.byLevel?.[node.level] ?? applied[node.kind]) : null;
     if (appliedNow) reasons.push(...checkReasons({ applied: appliedNow, had: recheck?.appliedChecks ?? receipt.appliedChecks }));
     const order = orderReason({ work, nodeId, had: recheck?.order ?? receipt.order });
     if (order) reasons.push(order);
-    const feature = featureReason({ work, had: recheck?.features ?? receipt.features });
+    const feature = featureReason({ work, nodeId, had: recheck?.features ?? receipt.features });
     if (feature) reasons.push(feature);
     // 구조(자식 목록)는 재검사 기록이 아니라 커밋 영수증과 견준다 — 재검사로는 풀리지 않는다.
     const structure = structureReason({ work, nodeId, had: receipt.structure });
diff --git a/core/work/features.js b/core/work/features.js
--- a/core/work/features.js
+++ b/core/work/features.js
@@ -54,16 +54,17 @@
   imageReferences: true,
   imageReview: true,
   variants: true,
+  branching: true,
 });

 /** 켜려면 부모 기능도 켜져 있어야 하는 기능. 부모가 꺼지면 (명시적으로 true 가 아닌 한) 저절로 꺼진다. */
 export const FEATURE_PARENTS = Object.freeze({
   occurrencesInExtract: 'occurrences', occurrenceScope: 'occurrences', rename: 'occurrences', evidenceInExtract: 'evidence',
-  viewerToggles: 'viewer', linkScope: 'links', viewerExport: 'viewer', imageReferences: 'images', imageReview: 'images',
+  branching: 'links', viewerToggles: 'viewer', linkScope: 'links', viewerExport: 'viewer', imageReferences: 'images', imageReview: 'images',
 });

 /** 실행이 묻는 것·검사 범위를 바꾸는 기능. 이것이 바뀌면 열린 실행은 검사부터 다시 돈다. */
-export const RUN_FEATURES = Object.freeze(['occurrencesInExtract', 'occurrenceScope', 'sources', 'evidence', 'evidenceInExtract', 'promiseScope', 'linkScope']);
+export const RUN_FEATURES = Object.freeze(['occurrencesInExtract', 'occurrenceScope', 'sources', 'evidence', 'evidenceInExtract', 'promiseScope', 'linkScope', 'branching']);

 /**
  * features: 알려진 불리언만. 빠진 것은 기본값.
```

- [ ] **Step 4: Run GREEN and validate.**

```bash
node --test test/run/branch-integration.test.js test/core/features.test.js test/run/order-stale.test.js test/run/order-none-checks.test.js test/run/scope-linked.test.js test/server/feature-toggles.test.js
npm run lint
npm run typecheck
```

Expected: PASS. 생성한 파일이 300줄 이하인지, 다른 태스크·판본·기존 잠금 범위를 덧고치지 않았는지 자가 검토한다.

- [ ] **Step 5: Commit and report.**

```bash
git add core/checks/run-checks.js core/ledger/receipts.js core/pack/validate.js core/pack/yaml-schema.js core/run/commit-locks.js core/run/payload.js core/run/receipt-builder.js core/run/steps/recheck-step.js core/run/sync.js core/scope/rechecks.js core/scope/scope.js core/scope/stale-checks.js core/scope/stale.js core/work/features.js test/core/features.test.js test/run/branch-integration.test.js test/run/order-none-checks.test.js test/run/order-stale.test.js test/run/scope-linked.test.js test/server/feature-toggles.test.js
git commit -m "feat: bind branching context to run and receipt locks"
```

보고 파일에는 RED/GREEN 명령과 결과, 바뀐 파일, 커밋, 자가 검토·우려를 기록한다.

### Task 3: 게임북 첫 팩·합성 수용·호스트 안내

**Files:**
- Create: `docs/gamebook.md`
- Create: `packs/gamebook/checkers/facts.js`
- Create: `packs/gamebook/checkers/index.js`
- Create: `packs/gamebook/checkers/structure.js`
- Create: `packs/gamebook/checks/critic.md`
- Create: `packs/gamebook/checks/parent-fit.md`
- Create: `packs/gamebook/checks/structure-review.md`
- Create: `packs/gamebook/index.js`
- Create: `packs/gamebook/pack.yaml`
- Create: `packs/gamebook/prompts/branch-plan.md`
- Create: `packs/gamebook/prompts/children.md`
- Create: `packs/gamebook/prompts/draft.md`
- Create: `packs/gamebook/prompts/extract.md`
- Create: `packs/gamebook/prompts/leaf-plan.md`
- Create: `packs/gamebook/prompts/revise-plan.md`
- Create: `packs/gamebook/prompts/revise.md`
- Modify: `packs/index.js`
- Modify: `skill/folio/SKILL.md`
- Create: `skill/folio/references/gamebook.md`
- Modify: `test/acceptance/n5.test.js`
- Create: `test/acceptance/n7.test.js`
- Create: `test/fixtures/gamebook-n7/entities/character/hero.md`
- Create: `test/fixtures/gamebook-n7/tree/01-paths/01-a.md`
- Create: `test/fixtures/gamebook-n7/tree/01-paths/02-b.md`
- Create: `test/fixtures/gamebook-n7/tree/01-paths/03-c.md`
- Create: `test/fixtures/gamebook-n7/tree/01-paths/04-z.md`
- Create: `test/fixtures/gamebook-n7/tree/01-paths/_node.md`
- Create: `test/fixtures/gamebook-n7/work.yaml`
- Create: `test/pack/gamebook.test.js`
- Modify: `test/pack/knowledge-pack.test.js`
- Modify: `test/pack/novel-pack.test.js`
- Modify: `test/pack/sources-pack.test.js`
- Create: `test/run/gamebook-acceptance.test.js`
- Modify: `test/server/knowledge-init.test.js`

**Interfaces:**
- Consumes: Task 1 graph/paths와 Task 2 scope.branching/branchGraph/applicability/refs. 기존 loadYamlPack·withCheckConfig·기본 pipeline locked 단계.
- Produces: loadGamebookPack(); GAMEBOOK_CHECKERS[path-facts/dead-ends/unreachable/paths]; gamebook 첫 팩과 gamebook 프리셋·gamebook.basic. 새로운 gamebook-n7 fixture; docs/gamebook.md와 skill/folio/references/gamebook.md. 기존 6팩 뒤 gamebook 추가.

- [ ] **Step 1: Write the failing tests.** 다음 전체 test 패치를 임시 파일에 저장해 `git apply`로 적용한다.

```diff
diff --git a/test/acceptance/n5.test.js b/test/acceptance/n5.test.js
--- a/test/acceptance/n5.test.js
+++ b/test/acceptance/n5.test.js
@@ -64,7 +64,7 @@
   assert.deepEqual([made.created, made.config.packs, made.config.checkSets], [true, ['knowledge', 'sources', 'brand'], ['knowledge.basic']]);
   const listing = await folio.call('folio_init', { root: join(await tempDir('folio-n5-'), 'x'), title: 'x', preset: 'company', packs: ['knowledge', 'brand'] });
   assert.equal(listing.error.code, 'PRESET_UNKNOWN');
-  assert.deepEqual(Object.keys(listing.error.details.packPresets), ['novel', 'knowledge']);
+  assert.deepEqual(Object.keys(listing.error.details.packPresets), ['novel', 'knowledge', 'gamebook']);
   const config = await ok(folio.call('folio_config', { root, workKind: 'company' }));
   assert.deepEqual(config.checkSets.filter((s) => s.id.startsWith('brand.')).map((s) => [s.id, s.selected, s.default]), [['brand.voice', false, false], ['brand.figures', false, false]]);
   const brandReasons = config.recommended.filter((r) => r.setId.startsWith('brand.')).map((r) => [r.setId, r.selected, r.reasons]);
diff --git a/test/acceptance/n7.test.js b/test/acceptance/n7.test.js
new file mode 100644
--- /dev/null
+++ b/test/acceptance/n7.test.js
@@ -0,0 +1,39 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { join } from 'node:path';
+import { connectFolio } from '../support/mcp-client.js';
+import { copyFixture, tempDir } from '../support/fixtures.js';
+import { createFakeHost } from '../support/fake-host.js';
+import { openLedger } from '../../core/ledger/ledger.js';
+import { updateNode } from '../../core/store/tree.js';
+import { openWork } from '../../core/store/work.js';
+const ok = async (promise) => { const out = await promise; assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
+
+test('N7 MCP 게임북 초기화와 모델 질문·승인·커밋은 기존 잠금 경로를 쓴다', async (t) => {
+  const folio = await connectFolio(); t.after(() => folio.close());
+  const newRoot = join(await tempDir('folio-n7-init-'), 'work');
+  const made = await ok(folio.call('folio_init', { root: newRoot, title: '합성 게임북', preset: 'gamebook', packs: ['gamebook'] }));
+  assert.equal(made.config.order, 'branching'); assert.deepEqual(made.config.checkSets, ['gamebook.basic']);
+  const root = await copyFixture('gamebook-n7'), host = createFakeHost();
+  let out = await ok(folio.call('folio_run', { root, node: 'a' }));
+  const requests = [];
+  for (let i = 0; i < 40 && out.status !== 'done'; i++) {
+    if (out.status === 'needs_model') { requests.push(...out.requests); out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: host.answer(out) })); }
+    else if (out.status === 'needs_user') out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
+    else throw new Error(`unexpected ${out.status}`);
+  }
+  assert.equal(out.status, 'done'); assert.ok(requests.some((r) => r.payload.branching?.applicable));
+  const records = await openLedger(root, 'receipts').readAll(); assert.ok(records.some((r) => r.type === 'commit' && r.nodeId === 'a'));
+});
+test('승인 직전 선택이 바뀌면 기존 검사·승인으로 커밋하지 않는다', async (t) => {
+  const folio = await connectFolio(); t.after(() => folio.close());
+  const root = await copyFixture('gamebook-n7'), host = createFakeHost();
+  let out = await ok(folio.call('folio_run', { root, node: 'a' }));
+  for (let i = 0; i < 30 && out.status === 'needs_model'; i++) out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: host.answer(out) }));
+  assert.equal(out.status, 'needs_user');
+  const work = await openWork(root), node = work.tree.nodes.get('a');
+  await updateNode(root, node, { data: { links: [{ to: 'b', kind: 'choice', label: '합성 변경' }] } });
+  const next = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
+  assert.notEqual(next.status, 'done');
+  assert.ok(!(await openLedger(root, 'receipts').readAll()).some((r) => r.type === 'commit'));
+});
diff --git a/test/pack/gamebook.test.js b/test/pack/gamebook.test.js
new file mode 100644
--- /dev/null
+++ b/test/pack/gamebook.test.js
@@ -0,0 +1,44 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { loadGamebookPack } from '../../packs/gamebook/index.js';
+import { pathFacts } from '../../packs/gamebook/checkers/facts.js';
+import { deadEnds, unreachable, paths } from '../../packs/gamebook/checkers/structure.js';
+import { branchScope } from '../../core/branching/scope.js';
+import { loadBuiltinPacks } from '../../packs/index.js';
+import { branchWork, branchEvidence } from '../support/branching.js';
+const setup = () => {
+  const work = branchWork({ a: { entry: true, to: ['b', 'c'] }, b: { to: ['z'] }, c: { to: ['z'] }, z: { ending: true }, lost: {} });
+  return { work, ...branchEvidence(work, { b: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' } }, { entityId: 'key', kind: 'state', data: { exists: 'destroyed' } }] }) };
+};
+test('첫 gamebook 팩과 프리셋·잠금 단계·실험 참고 세트를 제공한다', async () => {
+  const pack = await loadGamebookPack(); assert.equal(pack.presets.gamebook.order, 'branching');
+  assert.deepEqual(pack.pipelines.leaf.map((s) => s.id), ['plan', 'draft', 'extract', 'facts', 'critic', 'revise', 'approve', 'commit']);
+  assert.ok(pack.checks.every((c) => c.experimental && c.severity === 'advisory'));
+  assert.equal((await loadBuiltinPacks()).has('gamebook'), true);
+});
+test('왼쪽 경로의 죽음·파괴는 오른쪽에 새지 않는다', () => {
+  const ctx = setup(), branching = branchScope({ ...ctx, nodeId: 'z' });
+  const findings = pathFacts({ branching, appearances: ['hero', 'key'], draftEvents: [], draft: '주인공과 열쇠' });
+  assert.deepEqual(findings.map((f) => f.code), ['DEAD_ON_STAGE', 'DESTROYED_ON_STAGE']);
+  assert.ok(findings.every((f) => f.nodeIds.includes('b') && !f.nodeIds.includes('c')));
+});
+test('인용 없는 되살림·복구는 경로 상태를 지우지 않고 NFC 인용은 인정한다', () => {
+  const ctx = setup(), branching = branchScope({ ...ctx, nodeId: 'z' });
+  const draftEvents = [{ entityId: 'hero', kind: 'state', data: { vital: 'alive' }, quote: '없음' }, { entityId: 'key', kind: 'state', data: { exists: 'restored' } }];
+  assert.ok(pathFacts({ branching, appearances: ['hero', 'key'], draftEvents, draft: '되살림 복구' }).some((f) => f.code === 'DEAD_ON_STAGE'));
+  draftEvents[0].quote = '되살림'; draftEvents[1].quote = '복구';
+  assert.deepEqual(pathFacts({ branching, appearances: ['hero', 'key'], draftEvents, draft: '되살림 복구' }), []);
+});
+test('미검증 경로는 확정 사실 지적을 내지 않는다', () => {
+  const ctx = setup(); ctx.work.tree.nodes.get('b').status = 'imported';
+  const branching = branchScope({ ...ctx, nodeId: 'z' });
+  assert.deepEqual(pathFacts({ branching, appearances: ['hero'], draftEvents: [], draft: '주인공' }), []);
+  assert.ok(paths({ branching }).some((f) => f.code === 'BRANCH_EVENTS_UNVERIFIED'));
+});
+test('막다른 도달 장면·도달 불가·진입점 누락을 구분한다', () => {
+  const ctx = setup(); ctx.work.tree.nodes.get('c').links = [];
+  let branching = branchScope({ ...ctx, nodeId: 'z' });
+  assert.ok(deadEnds({ branching }).some((f) => f.nodeId === 'c')); assert.ok(unreachable({ branching }).some((f) => f.nodeId === 'lost'));
+  ctx.work.tree.nodes.get('a').data.branching.entry = false; branching = branchScope({ ...ctx, nodeId: 'z' });
+  assert.deepEqual(unreachable({ branching }), []); assert.ok(paths({ branching }).some((f) => f.code === 'BRANCH_ENTRY_MISSING'));
+});
diff --git a/test/pack/knowledge-pack.test.js b/test/pack/knowledge-pack.test.js
--- a/test/pack/knowledge-pack.test.js
+++ b/test/pack/knowledge-pack.test.js
@@ -30,7 +30,7 @@

 test('the knowledge pack loads with three presets, three sets and advisory experimental deterministic checks', async () => {
   const packs = await loadBuiltinPacks();
-  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants']);
+  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants', 'gamebook']);
   const pack = packs.get('knowledge');
   assert.deepEqual(Object.keys(pack.presets), ['textbook', 'history', 'guide', 'sourcebook', 'reference']);
   assert.deepEqual(Object.values(pack.presets).map((p) => [p.levels.map((l) => l.name), p.checkSets]), [
diff --git a/test/pack/novel-pack.test.js b/test/pack/novel-pack.test.js
--- a/test/pack/novel-pack.test.js
+++ b/test/pack/novel-pack.test.js
@@ -12,7 +12,7 @@

 test('the novel pack loads and opens the serial fixture with its sets and the core locks', async () => {
   const packs = await loadBuiltinPacks();
-  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants']);
+  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants', 'gamebook']);
   const novel = packs.get('novel');
   assert.deepEqual(Object.keys(novel.presets), ['serial', 'novel', 'scene']);
   assert.deepEqual(novel.defaultCheckSets, ['novel.basic']);
diff --git a/test/pack/sources-pack.test.js b/test/pack/sources-pack.test.js
--- a/test/pack/sources-pack.test.js
+++ b/test/pack/sources-pack.test.js
@@ -35,7 +35,7 @@

 test('the sources pack is a second pack: checks and sets only, advisory experimental checks, no default sets, no locks', async () => {
   const packs = await loadBuiltinPacks();
-  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants']);
+  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants', 'gamebook']);
   const pack = packs.get('sources');
   assert.deepEqual([pack.pipelines, pack.presets, pack.prompts, pack.defaultCheckSets], [undefined, {}, {}, []]);
   assert.deepEqual(Object.fromEntries(Object.entries(pack.checkSets).map(([id, set]) => [id, set.checks])), {
diff --git a/test/run/gamebook-acceptance.test.js b/test/run/gamebook-acceptance.test.js
new file mode 100644
--- /dev/null
+++ b/test/run/gamebook-acceptance.test.js
@@ -0,0 +1,35 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { copyFixture } from '../support/fixtures.js';
+import { createFakeHost, driveToEnd } from '../support/fake-host.js';
+import { loadBuiltinPacks } from '../../packs/index.js';
+import { createRunner } from '../../core/run/runner.js';
+import { openLedger } from '../../core/ledger/ledger.js';
+import { activeEvents } from '../../core/ledger/events.js';
+import { openWorkspace } from '../../core/run/workspace.js';
+import { scopeFor } from '../../core/run/payload.js';
+import { editYaml } from '../support/recheck.js';
+import { workStatus } from '../../core/status.js';
+
+test('main 경로 사건 분리·참고 지적·자기검토·토글·재검사를 실제 실행기로 검증한다', async () => {
+  const root = await copyFixture('gamebook-n7'), packs = await loadBuiltinPacks(), makeRunner = () => createRunner({ root, packs });
+  const host = createFakeHost({ drafts: { '*': '주인공이 합성 문을 연다.' }, events: {
+    a: { events: [] }, b: { events: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' }, quote: '주인공' }] }, c: { events: [] }, z: { events: [], appearances: ['hero'] },
+  } });
+  for (const node of ['a', 'b', 'c', 'z']) {
+    const trail = await driveToEnd(makeRunner, host, { start: { node }, until: (o) => o.status === 'done' });
+    assert.equal(trail.at(-1).status, 'done');
+  }
+  const records = await openLedger(root, 'receipts').readAll(), receipt = records.findLast((r) => r.type === 'receipt' && r.nodeId === 'z');
+  assert.equal(receipt.hard, 0); assert.ok(receipt.advisories.some((f) => f.code === 'DEAD_ON_STAGE' && f.nodeIds.includes('b') && !f.nodeIds.includes('c')));
+  assert.ok(receipt.refs.some((r) => r.kind === 'branching'));
+  assert.deepEqual(receipt.steps.find((s) => s.id === 'critic').checks[0].reviewer, { sameHost: true, independent: false });
+  assert.ok(receipt.steps.find((s) => s.id === 'facts').checks.some((c) => c.checkId === 'core.promise-order' && c.status === 'not_applicable'));
+  assert.ok(!host.calls.some((c) => c.purpose === 'revise'));
+  const context = { ...await openWorkspace(root, { packs }), receiptRecords: records, events: activeEvents(await openLedger(root, 'events').readAll()) }, scope = scopeFor(context, { nodeId: 'z', outputs: { draft: '주인공', events: { appearances: ['hero'] } } });
+  assert.equal(scope.branching.paths.length, 2); assert.equal(scope.branching.paths[1].events.length, 0);
+  await editYaml(root, (config) => { config.features = { branching: false }; });
+  assert.ok((await workStatus(root, { packs })).stale.some((s) => s.nodeId === 'z'));
+  const trail = await driveToEnd(makeRunner, host, { start: { node: 'z', mode: 'recheck' }, until: (o) => o.status === 'done' });
+  assert.equal(trail.at(-1).status, 'done');
+});
diff --git a/test/server/knowledge-init.test.js b/test/server/knowledge-init.test.js
--- a/test/server/knowledge-init.test.js
+++ b/test/server/knowledge-init.test.js
@@ -27,6 +27,6 @@
   const out = await tools.call('folio_init', { root, title: 't', preset: 'textbook' });
   assert.equal(out.error.code, 'PRESET_UNKNOWN');
   assert.deepEqual(out.error.details.presets, ['serial', 'novel', 'scene']);
-  assert.deepEqual(out.error.details.packPresets, { novel: ['serial', 'novel', 'scene'], knowledge: ['textbook', 'history', 'guide', 'sourcebook', 'reference'] });
+  assert.deepEqual(out.error.details.packPresets, { novel: ['serial', 'novel', 'scene'], knowledge: ['textbook', 'history', 'guide', 'sourcebook', 'reference'], gamebook: ['gamebook'] });
   assert.match(TOOLS.find((t) => t.name === 'folio_init').description, /textbook, history, guide/);
 });
```

- [ ] **Step 2: Run RED.** Node 24 경로를 PATH 앞에 둔다.

```bash
node --test test/pack/gamebook.test.js test/run/gamebook-acceptance.test.js test/acceptance/n7.test.js test/pack/knowledge-pack.test.js test/pack/novel-pack.test.js test/pack/sources-pack.test.js test/server/knowledge-init.test.js test/acceptance/n5.test.js
```

Expected: FAIL (새 모듈/인터페이스가 없거나 새 기능·순서·팩 목록이 이전 기대값과 다름).

- [ ] **Step 3: Apply the complete implementation.** 다음 전체 패치를 임시 파일에 저장해 `git apply`로 적용한다.

```diff
diff --git a/docs/gamebook.md b/docs/gamebook.md
new file mode 100644
--- /dev/null
+++ b/docs/gamebook.md
@@ -0,0 +1,9 @@
+# 선택 경로 작품
+
+첫 팩 `gamebook`, 프리셋 `gamebook`은 chapter → scene과 `order: branching`, `gamebook.basic`을 제공한다. 본문 잎 앞머리 `branching: { entry: true, ending: false }`와 `links: [{ to: id, kind: choice, label: 선택 }]`를 작가가 적는다. 진입점과 종료점을 명시해야 하며 종료점에서 나가는 선택은 모순이다. 가지나 front/back 아래 장면은 선택 정점이 아니다.
+
+경로 사건은 현재 main 커밋·영수증·본문 hash·활성 사건이 일치하는 앞 장면에서만 온다. 가져오기·손수정 장면은 미검증이다. 경로를 합치지 않는다. 순환은 반복 상태를 완전히 해석하지 못하므로 미완료로 남긴다. 정점 5,000, 이동 20,000, 경로 256, 깊이 512, 탐색 상태 100,000, 반환 사건 20,000, 경로 문맥 2MiB, 그래프 진단·검사 지적 200개 상한이다.
+
+새 검사들은 실험적인 참고 의견이다. 참고 의견으로 자동 수정하지 않는다. 경로 사실은 생사 `vital: dead/alive`, 존재 `exists: destroyed/restored`를 경로마다 따로 본다. 대상 원고의 되살림·복구는 2자 이상 NFC 원고 인용이 필요하다. 지적 넘김은 경로와 엔티티를 구분한다.
+
+`features.branching`은 기본 true이고 `links`가 부모다. 기능을 끄면 경로 검사는 해당 없음이며 잠금은 유지된다. 판본은 원본 결속과 전용 범위를 유지하고 main 경로 사건을 모으지 않는다. 연결 변경은 참고 버전을 바꾸며 분기 재검사로 최신 문맥을 확인한다. 구조 검사는 전체 그래프 ref를 보므로 무관한 선택 변경도 재확인이 필요할 수 있다. 순차/none의 기존 참고 버전 의미는 유지된다.
diff --git a/packs/gamebook/checkers/facts.js b/packs/gamebook/checkers/facts.js
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/checkers/facts.js
@@ -0,0 +1,44 @@
+const supported = (quote, draft) => typeof quote === 'string' && quote.trim().length >= 2 && String(draft).normalize('NFC').includes(quote.normalize('NFC'));
+const valueOf = (value) => typeof value === 'string' ? value.trim().toLowerCase() : value;
+/** 최신 사실을 각 경로에서 따로 접는다. 미완료 경로의 생사·존재를 확정하지 않는다. */
+export function pathFacts(ctx) {
+  const findings = [];
+  for (const path of ctx.branching?.paths ?? []) {
+    if (!path.complete) continue;
+    const states = new Map();
+    const add = (code, entityId, message) => findings.push({ code, entityId, message, pathId: path.pathId, entry: path.entry, nodeIds: path.nodeIds });
+    for (const event of path.events) {
+      if (event.kind !== 'state') continue;
+      const state = states.get(event.entityId) ?? {};
+      for (const [field, values] of Object.entries({ vital: ['dead', 'alive'], exists: ['destroyed', 'restored'] })) {
+        const value = valueOf(event.data?.[field]);
+        if (value === undefined) continue;
+        if (!values.includes(value)) { add('BRANCH_STATE_UNKNOWN', event.entityId, `${field}의 알 수 없는 상태`); continue; }
+        state[field] = value;
+      }
+      states.set(event.entityId, state);
+    }
+    for (const event of ctx.draftEvents ?? []) {
+      if (event.kind !== 'state') continue;
+      const state = states.get(event.entityId) ?? {};
+      if (valueOf(event.data?.vital) === 'alive') {
+        if (supported(event.quote, ctx.draft)) state.vital = 'alive';
+        else add('REVIVAL_NOTE_MISSING', event.entityId, '되살림 인용이 원고에 없다');
+      }
+      if (valueOf(event.data?.exists) === 'restored') {
+        if (supported(event.quote, ctx.draft)) state.exists = 'restored';
+        else add('RESTORE_NOTE_MISSING', event.entityId, '복구 인용이 원고에 없다');
+      }
+      states.set(event.entityId, state);
+    }
+    for (const id of ctx.appearances ?? []) {
+      const state = states.get(id);
+      if (state?.vital === 'dead') add('DEAD_ON_STAGE', id, '이 경로에서 죽은 인물이 등장한다');
+      if (state?.exists === 'destroyed') add('DESTROYED_ON_STAGE', id, '이 경로에서 파괴된 것이 등장한다');
+    }
+    for (const event of ctx.draftEvents ?? []) if (states.get(event.entityId)?.exists === 'destroyed') add('DESTROYED_UPDATED', event.entityId, '이 경로에서 파괴된 것의 사건이 있다');
+  }
+  const unique = [...new Map(findings.map((f) => [`${f.pathId}:${f.entityId}:${f.code}`, f])).values()];
+  if (unique.length <= 200) return unique;
+  return [...unique.slice(0, 199), { code: 'BRANCH_ANALYSIS_INCOMPLETE', message: '경로 사실 지적이 200개 한도를 넘었다' }];
+}
diff --git a/packs/gamebook/checkers/index.js b/packs/gamebook/checkers/index.js
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/checkers/index.js
@@ -0,0 +1,3 @@
+import { pathFacts } from './facts.js';
+import { deadEnds, unreachable, paths } from './structure.js';
+export const GAMEBOOK_CHECKERS = { 'path-facts': pathFacts, 'dead-ends': deadEnds, unreachable, paths };
diff --git a/packs/gamebook/checkers/structure.js b/packs/gamebook/checkers/structure.js
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/checkers/structure.js
@@ -0,0 +1,23 @@
+const graphOf = (ctx) => ctx.branching?.graph ?? ctx.branchGraph;
+const finding = (problem) => ({ ...problem, message: `${problem.code}: ${problem.nodeId ?? problem.nodeIds?.join(', ') ?? problem.limit ?? '분기 자료'}` });
+const capped = (items) => items.length <= 200 ? items : [...items.slice(0, 199), finding({ code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'findings' })];
+export function deadEnds(ctx) {
+  const graph = graphOf(ctx); if (!graph || graph.truncated || !graph.entries.length) return [];
+  return capped(graph.reached.filter((id) => !graph.endings.includes(id) && (!graph.edges[id].length || !graph.canEnd.includes(id)))
+    .map((nodeId) => finding({ code: graph.edges[nodeId].length ? 'BRANCH_NO_ENDING' : 'BRANCH_DEAD_END', nodeId })));
+}
+export function unreachable(ctx) {
+  const graph = graphOf(ctx); if (!graph || graph.truncated || !graph.entries.length) return [];
+  return capped(graph.vertices.filter((id) => !graph.reached.includes(id)).map((nodeId) => finding({ code: 'BRANCH_UNREACHABLE', nodeId })));
+}
+export function paths(ctx) {
+  const graph = graphOf(ctx);
+  const all = [...(graph?.problems ?? []), ...(ctx.branching?.problems ?? [])];
+  const unique = new Map();
+  for (const p of all) {
+    const key = JSON.stringify([p.code, p.nodeId ?? null, p.nodeIds ?? null, p.pathId ?? null, p.limit ?? null, p.to ?? null]);
+    if (!unique.has(key)) unique.set(key, finding(p));
+  }
+  if (ctx.branching?.complete === false && !all.some((p) => p.code === 'BRANCH_ANALYSIS_INCOMPLETE')) unique.set('incomplete', finding({ code: 'BRANCH_ANALYSIS_INCOMPLETE' }));
+  return capped([...unique.values()]);
+}
diff --git a/packs/gamebook/checks/critic.md b/packs/gamebook/checks/critic.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/checks/critic.md
@@ -0,0 +1 @@
+선택의 동기와 서로 구분되는 결과, 장면 몰입을 검토한다. branching.paths를 경로별로 읽는다. 불완전 자료로 확정 사실을 추정하지 않는다.
diff --git a/packs/gamebook/checks/parent-fit.md b/packs/gamebook/checks/parent-fit.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/checks/parent-fit.md
@@ -0,0 +1 @@
+장 계획이 윗계획과 어울리는지 검토한다. 서로 양립할 수 없는 선택을 하나의 사건 흐름으로 합치지 않는다.
diff --git a/packs/gamebook/checks/structure-review.md b/packs/gamebook/checks/structure-review.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/checks/structure-review.md
@@ -0,0 +1 @@
+branchGraph와 끝난 자식의 장면을 보고 선택 구조와 장 계획 이행을 검토한다. 경로별 사건 검사는 잎에서 한다. 연결과 앞머리를 자동 수정하지 않는다.
diff --git a/packs/gamebook/index.js b/packs/gamebook/index.js
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/index.js
@@ -0,0 +1,6 @@
+import { loadYamlPack } from '../../core/pack/yaml-pack.js';
+import { withCheckConfig } from '../../core/pack/check-config.js';
+import { GAMEBOOK_CHECKERS } from './checkers/index.js';
+export const loadGamebookPack = async () => withCheckConfig(await loadYamlPack(import.meta.dirname, {
+  name: 'gamebook', checkers: GAMEBOOK_CHECKERS, modules: ['checkers/index.js', 'checkers/facts.js', 'checkers/structure.js'],
+}));
diff --git a/packs/gamebook/pack.yaml b/packs/gamebook/pack.yaml
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/pack.yaml
@@ -0,0 +1,107 @@
+name: gamebook
+version: 1
+title: 게임북
+description: 명시적인 진입과 선택 경로를 가진 게임북. 경로별 사건은 합치지 않는다.
+presets:
+  gamebook:
+    title: 게임북
+    description: 장 계획 아래 선택 장면을 쓴다.
+    levels:
+      - { name: chapter, children: [1, 40] }
+      - { name: scene, leaf: true }
+    order: branching
+    checkSets: [gamebook.basic]
+pipelines:
+  leaf:
+    - { id: plan, kind: generate, produces: plan }
+    - { id: draft, kind: generate, produces: draft }
+    - { id: extract, kind: generate, produces: events, requires: [draft] }
+    - { id: facts, kind: check, tier: deterministic, stage: facts, requires: [extract] }
+    - { id: critic, kind: check, tier: model, stage: critic }
+    - { id: revise, kind: generate, produces: draft, loop: { until: [facts], max: 3 } }
+    - { id: approve, kind: gate }
+    - { id: commit, kind: commit }
+  branch:
+    - { id: plan, kind: generate, produces: plan }
+    - { id: fit, kind: check, tier: model, stage: fit }
+    - { id: revise, kind: generate, produces: draft, loop: { until: [fit], max: 3 } }
+    - { id: approve, kind: gate }
+    - { id: children, kind: generate, produces: children }
+    - { id: review, kind: check, tier: model, stage: review }
+    - { id: commit, kind: commit }
+prompts:
+  leaf.plan: prompts/leaf-plan.md
+  leaf.draft: prompts/draft.md
+  leaf.extract: prompts/extract.md
+  leaf.revise: prompts/revise.md
+  branch.plan: prompts/branch-plan.md
+  branch.revise: prompts/revise-plan.md
+  branch.children: prompts/children.md
+checks:
+  gamebook.dead-ends:
+    title: 막다른 분기
+    description: 선택 경로를 분리해 자료와 구조를 확인한다.
+    tier: deterministic
+    stage: facts
+    severity: advisory
+    experimental: true
+    requiresOrder: branching
+    run: dead-ends
+  gamebook.unreachable:
+    title: 도달 불가 장면
+    description: 선택 경로를 분리해 자료와 구조를 확인한다.
+    tier: deterministic
+    stage: facts
+    severity: advisory
+    experimental: true
+    requiresOrder: branching
+    run: unreachable
+  gamebook.paths:
+    title: 분기 자료 검증
+    description: 선택 경로를 분리해 자료와 구조를 확인한다.
+    tier: deterministic
+    stage: facts
+    severity: advisory
+    experimental: true
+    requiresOrder: branching
+    run: paths
+  gamebook.path-facts:
+    title: 경로별 사실
+    description: 선택 경로를 분리해 자료와 구조를 확인한다.
+    tier: deterministic
+    stage: facts
+    severity: advisory
+    experimental: true
+    requiresOrder: branching
+    run: path-facts
+  gamebook.critic:
+    title: 선택 장면 검토
+    description: 선택 동기와 장면 또는 장 계획을 검토한다.
+    tier: model
+    stage: critic
+    severity: advisory
+    experimental: true
+    instruction: checks/critic.md
+  gamebook.parent-fit:
+    title: 윗계획 맞춤
+    description: 선택 동기와 장면 또는 장 계획을 검토한다.
+    tier: model
+    stage: fit
+    severity: advisory
+    experimental: true
+    instruction: checks/parent-fit.md
+  gamebook.structure-review:
+    title: 전체 선택 구조 검토
+    description: 선택 동기와 장면 또는 장 계획을 검토한다.
+    tier: model
+    stage: review
+    severity: advisory
+    experimental: true
+    instruction: checks/structure-review.md
+checkSets:
+  gamebook.basic:
+    title: 게임북 기본
+    description: 경로별 사실과 선택 구조를 검토한다.
+    checks: [gamebook.dead-ends, gamebook.unreachable, gamebook.paths, gamebook.path-facts, gamebook.critic, gamebook.parent-fit, gamebook.structure-review]
+    recommendedFor: { kinds: [gamebook] }
+defaultCheckSets: [gamebook.basic]
diff --git a/packs/gamebook/prompts/branch-plan.md b/packs/gamebook/prompts/branch-plan.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/prompts/branch-plan.md
@@ -0,0 +1,9 @@
+이 묶음(장)의 계획을 쓴다.
+
+- 윗계획(upperPlans)이 있으면 그 약속을 지킨다.
+- 이미 있는 자식(children)이 있으면 그 흐름을 존중한다.
+- 열 줄 안쪽: 시작 상태, 큰 사건, 끝 상태, 심을 약속과 거둘 약속.
+
+계획 글만 답한다.
+
+선택 경로의 사건은 서로 합치지 않는다. complete가 false이거나 경로 자료가 미검증이면 한계를 명시한다. links·branching 앞머리는 작가가 적으며 원고에 포함하지 않는다.
diff --git a/packs/gamebook/prompts/children.md b/packs/gamebook/prompts/children.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/prompts/children.md
@@ -0,0 +1,10 @@
+계획(plan)을 자식 노드(childLevel)로 나눈다. JSON 하나로만 답한다.
+
+```json
+{ "children": [ { "id": "ep-1", "title": "1화", "brief": "한 줄 요약" } ] }
+```
+
+- 개수는 childLevel.range 안이어야 한다.
+- `id`는 소문자·숫자·하이픈. 이미 있는 id를 쓰지 않는다. 비워 두면 엔진이 만든다.
+
+선택 경로의 사건은 서로 합치지 않는다. complete가 false이거나 경로 자료가 미검증이면 한계를 명시한다. links·branching 앞머리는 작가가 적으며 원고에 포함하지 않는다.
diff --git a/packs/gamebook/prompts/draft.md b/packs/gamebook/prompts/draft.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/prompts/draft.md
@@ -0,0 +1,7 @@
+계획(plan)대로 이 노드의 원고를 쓴다.
+
+- 엔티티 설정(entities)의 고정 사실을 지킨다.
+- 앞 노드의 사건(branching.paths의 경로별 사건)과 어긋나지 않게 쓴다.
+- 원고 본문만 답한다. 제목·설명·머리말을 붙이지 않는다.
+
+선택 경로의 사건은 서로 합치지 않는다. complete가 false이거나 경로 자료가 미검증이면 한계를 명시한다. links·branching 앞머리는 작가가 적으며 원고에 포함하지 않는다.
diff --git a/packs/gamebook/prompts/extract.md b/packs/gamebook/prompts/extract.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/prompts/extract.md
@@ -0,0 +1,30 @@
+원고(draft)에서 사건과 등장을 뽑아 JSON 하나로만 답한다.
+
+```json
+{
+  "events": [
+    { "entityId": "doyun", "kind": "state", "data": { "vital": "dead" }, "quote": "원고 속 문장 그대로" },
+    { "entityId": "hana", "kind": "address", "data": { "term": "아가씨" }, "quote": "원고 속 문장 그대로" }
+  ],
+  "appearances": ["doyun"],
+  "mentions": ["hana"],
+  "occurrences": [{ "entityId": "doyun", "kind": "appearance", "quote": "원고 속 짧은 인용" }]
+}
+```
+
+- `entityId`는 entities 목록의 id만 쓴다. 없는 인물은 적지 않는다.
+- `kind`:
+  - `state` — 생사·상태 변화. `data.vital`은 `dead` 또는 `alive`. 물건·장소가 부서지거나 사라지면 `data.exists: destroyed`, 되돌아오면 `data.exists: restored`. 인물의 성별이 바뀌면 `data.gender`.
+  - `address` — 누가 이 인물을 성별이 드러나는 호칭(도련님, 아가씨, 형, 누나 등)으로 불렀다. `entityId`는 불린 인물, `data.term`은 호칭 그대로.
+  - `promise.planted` · `promise.advanced` · `promise.misdirected` · `promise.resolved` · `promise.closed` · `promise.parked` · `promise.reopened` — 약속(떡밥)의 단계. `promise.mentioned` — 약속을 지나가며 언급만 함(단계는 그대로).
+  - 약속을 갚았으면(`promise.resolved`) 갚은 장면을 8자 이상 `quote`로 적는다.
+- `state`(생사·존재) 사건과 `address` 사건에는 `quote`를 반드시 적는다. 인용 없는 되살림(`alive`)·되돌림(`restored`)은 인정되지 않는다.
+- `quote`를 적으면 원고에 그대로 있는 문장이어야 한다.
+- `appearances`는 장면에 직접 나오는 인물, `mentions`는 이름만 나오는 인물이다.
+- 사건이 없으면 `"events": []`.
+- 요청의 `occurrences.wanted`가 true면 `occurrences`에 등장 위치를 적는다. 없으면 적지 않는다.
+  - `kind`는 `appearance`(장면에 직접 나옴) 또는 `mention`(이름·회상으로만 나옴).
+  - `quote`는 원고에 그대로 있는 짧은 인용이다. 대명사·호칭("그녀는", "선장")도 된다. 같은 인용이 원고에 여러 번 있으면 `before`(바로 앞 글) 또는 `after`(바로 뒤 글)를 더해 한 곳을 가리킨다.
+  - 틀린 인용이 하나라도 있으면 다시 묻는다.
+
+선택 경로의 사건은 서로 합치지 않는다. complete가 false이거나 경로 자료가 미검증이면 한계를 명시한다. links·branching 앞머리는 작가가 적으며 원고에 포함하지 않는다.
diff --git a/packs/gamebook/prompts/leaf-plan.md b/packs/gamebook/prompts/leaf-plan.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/prompts/leaf-plan.md
@@ -0,0 +1,9 @@
+이 노드(선택 장면)의 짧은 계획을 쓴다.
+
+- 윗계획(upperPlans)이 약속한 것 가운데 이 노드가 맡을 것을 고른다.
+- 등장할 인물과 그들의 지금 상태(branching.paths의 경로별 사건)를 확인한다. 죽은 인물은 되살리는 사건 없이 등장시키지 않는다.
+- 다섯 줄 안쪽: 무엇이 일어나는지, 누가 나오는지, 끝에서 무엇이 바뀌는지.
+
+계획 글만 답한다.
+
+선택 경로의 사건은 서로 합치지 않는다. complete가 false이거나 경로 자료가 미검증이면 한계를 명시한다. links·branching 앞머리는 작가가 적으며 원고에 포함하지 않는다.
diff --git a/packs/gamebook/prompts/revise-plan.md b/packs/gamebook/prompts/revise-plan.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/prompts/revise-plan.md
@@ -0,0 +1,8 @@
+이 묶음(장)의 계획을 고친다.
+
+- blocking에 있는 지적만 고친다. 참고 의견(advisory)은 이 단계의 사유가 아니다.
+- feedback이 있으면 작가의 요청이다. 그것을 따른다.
+- 윗계획(upperPlans)의 약속과 이미 있는 자식(children)의 흐름은 지킨다.
+- 나머지는 그대로 둔다. 고친 계획 글 전체만 답한다.
+
+선택 경로의 사건은 서로 합치지 않는다. complete가 false이거나 경로 자료가 미검증이면 한계를 명시한다. links·branching 앞머리는 작가가 적으며 원고에 포함하지 않는다.
diff --git a/packs/gamebook/prompts/revise.md b/packs/gamebook/prompts/revise.md
new file mode 100644
--- /dev/null
+++ b/packs/gamebook/prompts/revise.md
@@ -0,0 +1,7 @@
+원고(draft)를 고친다.
+
+- blocking에 있는 지적만 고친다. 참고 의견(advisory)은 이 단계의 사유가 아니다.
+- feedback이 있으면 작가의 요청이다. 그것을 따른다.
+- 나머지는 그대로 둔다. 고친 원고 전체만 답한다.
+
+선택 경로의 사건은 서로 합치지 않는다. complete가 false이거나 경로 자료가 미검증이면 한계를 명시한다. links·branching 앞머리는 작가가 적으며 원고에 포함하지 않는다.
diff --git a/packs/index.js b/packs/index.js
--- a/packs/index.js
+++ b/packs/index.js
@@ -3,10 +3,11 @@
 import { loadSourcesPack } from './sources/index.js';
 import { loadBrandPack } from './brand/index.js';
 import { loadImagePack } from './image/index.js';
+import { loadGamebookPack } from './gamebook/index.js';
 import { loadVariantsPack } from './variants/index.js';

 /** 내장 팩(이름 → Pack). work.yaml 의 packs 가 이 이름을 가리킨다. sources·brand·image·variants 는 둘째 팩으로만 쓴다(단계가 없다). */
 export async function loadBuiltinPacks() {
-  const packs = [await loadNovelPack(), await loadKnowledgePack(), await loadSourcesPack(), await loadBrandPack(), await loadImagePack(), await loadVariantsPack()];
+  const packs = [await loadNovelPack(), await loadKnowledgePack(), await loadSourcesPack(), await loadBrandPack(), await loadImagePack(), await loadVariantsPack(), await loadGamebookPack()];
   return new Map(packs.map((pack) => [pack.name, pack]));
 }
diff --git a/skill/folio/SKILL.md b/skill/folio/SKILL.md
--- a/skill/folio/SKILL.md
+++ b/skill/folio/SKILL.md
@@ -1,6 +1,6 @@
 ---
 name: folio
-description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재·장편·단편·교재·역사서·안내서)을 쓴다. 새 작품 만들기, 다음 노드 쓰기, 계획 승인, 원고 커밋, 구조 바꾸기, 검사 설정, 그림 만들기·검토, vibelore 작품 가져오기, 판본 만들기(번역·개정·요약), 판본 상태 확인에 쓴다. 예: "새 연재 시작하자", "다음 화 써줘", "그림 한 장 만들어줘", "옛 연재 가져와", "번역 판본 만들어줘".
+description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재·장편·단편·교재·역사서·안내서)을 쓴다. 새 작품 만들기, 다음 노드 쓰기, 계획 승인, 원고 커밋, 구조 바꾸기, 검사 설정, 그림 만들기·검토, vibelore 작품 가져오기, 판본 만들기(번역·개정·요약), 판본 상태 확인, 선택 경로 게임북 작성에 쓴다. 예: "새 연재 시작하자", "다음 화 써줘", "그림 한 장 만들어줘", "옛 연재 가져와", "번역 판본 만들어줘".
 ---

 # folio — 작품 쓰기
@@ -105,3 +105,7 @@
 - `folio_view` 오류와 화면 안 오류: [references/viewer.md](references/viewer.md)의 "오류일 때".
 - `folio_image` 오류와 그림 잠금 오류: [references/image.md](references/image.md)의 "오류일 때".
 - `VARIANT_*`, `LOCK_ORIGINAL_CHANGED`: [references/variants.md](references/variants.md)의 "오류일 때".
+
+## 선택 경로 게임북
+
+게임북을 만들거나 분기 경로 요청을 받으면 [게임북 안내](references/gamebook.md)를 읽는다. `packs: ['gamebook']`, `preset: gamebook`으로 시작한다. 선택 연결과 진입·끝 표시는 작가가 앞머리에 적는다.
diff --git a/skill/folio/references/gamebook.md b/skill/folio/references/gamebook.md
new file mode 100644
--- /dev/null
+++ b/skill/folio/references/gamebook.md
@@ -0,0 +1,5 @@
+# 게임북 호스트 안내
+
+`branching.paths`를 각각 별도 경로로 읽는다. `priorEvents`는 분기에서 비어 있다. 경로별 `complete`가 false이면 사건의 근거 또는 탐색이 불완전하다는 뜻이다. 가져온 장면과 손수정 장면은 정상 사건 자료로 간주하지 않는다. 지적의 `pathId`, `entry`, `nodeIds`, `entityId`로 문제 경로를 작가에게 보여 준다.
+
+branchGraph는 장 계획 검토의 전체 구조 요약이다. 경로 사실은 잎에서 검사한다. 참고 지적은 자동 수정 사유가 아니며 넘김은 작가의 이유 있는 결정으로만 전한다. 판본 요청은 전용 원본·용어 문맥으로 처리한다.
diff --git a/test/fixtures/gamebook-n7/entities/character/hero.md b/test/fixtures/gamebook-n7/entities/character/hero.md
new file mode 100644
--- /dev/null
+++ b/test/fixtures/gamebook-n7/entities/character/hero.md
@@ -0,0 +1,7 @@
+---
+id: hero
+kind: character
+name: 주인공
+aliases: []
+---
+합성 인물.
diff --git a/test/fixtures/gamebook-n7/tree/01-paths/01-a.md b/test/fixtures/gamebook-n7/tree/01-paths/01-a.md
new file mode 100644
--- /dev/null
+++ b/test/fixtures/gamebook-n7/tree/01-paths/01-a.md
@@ -0,0 +1,10 @@
+---
+id: a
+level: scene
+title: 합성 a
+branching: { entry: true, ending: false }
+links:
+  - { to: b, kind: choice, label: 합성 선택 }
+  - { to: c, kind: choice, label: 합성 선택 }
+---
+합성 장면 원고.
diff --git a/test/fixtures/gamebook-n7/tree/01-paths/02-b.md b/test/fixtures/gamebook-n7/tree/01-paths/02-b.md
new file mode 100644
--- /dev/null
+++ b/test/fixtures/gamebook-n7/tree/01-paths/02-b.md
@@ -0,0 +1,9 @@
+---
+id: b
+level: scene
+title: 합성 b
+branching: { entry: false, ending: false }
+links:
+  - { to: z, kind: choice, label: 합성 선택 }
+---
+합성 장면 원고.
diff --git a/test/fixtures/gamebook-n7/tree/01-paths/03-c.md b/test/fixtures/gamebook-n7/tree/01-paths/03-c.md
new file mode 100644
--- /dev/null
+++ b/test/fixtures/gamebook-n7/tree/01-paths/03-c.md
@@ -0,0 +1,9 @@
+---
+id: c
+level: scene
+title: 합성 c
+branching: { entry: false, ending: false }
+links:
+  - { to: z, kind: choice, label: 합성 선택 }
+---
+합성 장면 원고.
diff --git a/test/fixtures/gamebook-n7/tree/01-paths/04-z.md b/test/fixtures/gamebook-n7/tree/01-paths/04-z.md
new file mode 100644
--- /dev/null
+++ b/test/fixtures/gamebook-n7/tree/01-paths/04-z.md
@@ -0,0 +1,8 @@
+---
+id: z
+level: scene
+title: 합성 z
+branching: { entry: false, ending: true }
+links: []
+---
+합성 장면 원고.
diff --git a/test/fixtures/gamebook-n7/tree/01-paths/_node.md b/test/fixtures/gamebook-n7/tree/01-paths/_node.md
new file mode 100644
--- /dev/null
+++ b/test/fixtures/gamebook-n7/tree/01-paths/_node.md
@@ -0,0 +1,6 @@
+---
+id: paths
+level: chapter
+title: 합성 경로
+---
+왼쪽과 오른쪽이 합류한다.
diff --git a/test/fixtures/gamebook-n7/work.yaml b/test/fixtures/gamebook-n7/work.yaml
new file mode 100644
--- /dev/null
+++ b/test/fixtures/gamebook-n7/work.yaml
@@ -0,0 +1,7 @@
+title: 합성 선택 실험
+levels:
+  - { name: chapter, children: [1, 40] }
+  - { name: scene, leaf: true }
+order: branching
+packs: [gamebook]
+checkSets: [gamebook.basic]
```

- [ ] **Step 4: Run GREEN and validate.**

```bash
node --test test/pack/gamebook.test.js test/run/gamebook-acceptance.test.js test/acceptance/n7.test.js test/pack/knowledge-pack.test.js test/pack/novel-pack.test.js test/pack/sources-pack.test.js test/server/knowledge-init.test.js test/acceptance/n5.test.js
npm run lint
npm run typecheck
npm test
```

Expected: PASS. 생성한 파일이 300줄 이하인지, 다른 태스크·판본·기존 잠금 범위를 덧고치지 않았는지 자가 검토한다.

- [ ] **Step 5: Commit and report.**

```bash
git add docs/gamebook.md packs/gamebook/checkers/facts.js packs/gamebook/checkers/index.js packs/gamebook/checkers/structure.js packs/gamebook/checks/critic.md packs/gamebook/checks/parent-fit.md packs/gamebook/checks/structure-review.md packs/gamebook/index.js packs/gamebook/pack.yaml packs/gamebook/prompts/branch-plan.md packs/gamebook/prompts/children.md packs/gamebook/prompts/draft.md packs/gamebook/prompts/extract.md packs/gamebook/prompts/leaf-plan.md packs/gamebook/prompts/revise-plan.md packs/gamebook/prompts/revise.md packs/index.js skill/folio/SKILL.md skill/folio/references/gamebook.md test/acceptance/n5.test.js test/acceptance/n7.test.js test/fixtures/gamebook-n7/entities/character/hero.md test/fixtures/gamebook-n7/tree/01-paths/01-a.md test/fixtures/gamebook-n7/tree/01-paths/02-b.md test/fixtures/gamebook-n7/tree/01-paths/03-c.md test/fixtures/gamebook-n7/tree/01-paths/04-z.md test/fixtures/gamebook-n7/tree/01-paths/_node.md test/fixtures/gamebook-n7/work.yaml test/pack/gamebook.test.js test/pack/knowledge-pack.test.js test/pack/novel-pack.test.js test/pack/sources-pack.test.js test/run/gamebook-acceptance.test.js test/server/knowledge-init.test.js
git commit -m "feat: add gamebook pack and branching acceptance"
```

보고 파일에는 RED/GREEN 명령과 결과, 바뀐 파일, 커밋, 자가 검토·우려를 기록한다.

## Task 3 추가 수용 검증 — 2026-10-02

독립 검토의 cross-task 확인 항목을 닫기 위해 다음 합성 테스트도 Task 3에 포함한다. 상위 none↔branching 전환, 변경된 질문의 옛 답 거부, 기록된 committing의 토글·선택지 변경 이후 멱등 복구를 실제 실행기로 검증한다. 기존 잠금 검사를 바꾸지 않는다. 별도 일반 복사본 시험에서 2/2 통과했다.

추가 파일 test/run/gamebook-recovery.test.js의 전체 패치:

```diff
diff --git a/test/run/gamebook-recovery.test.js b/test/run/gamebook-recovery.test.js
new file mode 100644
--- /dev/null
+++ b/test/run/gamebook-recovery.test.js
@@ -0,0 +1,55 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { copyFixture } from '../support/fixtures.js';
+import { createFakeHost, driveToEnd } from '../support/fake-host.js';
+import { editYaml } from '../support/recheck.js';
+import { loadBuiltinPacks } from '../../packs/index.js';
+import { createRunner } from '../../core/run/runner.js';
+import { createRunStore } from '../../core/run/run-store.js';
+import { openLedger } from '../../core/ledger/ledger.js';
+import { openWork } from '../../core/store/work.js';
+import { updateNode } from '../../core/store/tree.js';
+import { workStatus } from '../../core/status.js';
+
+const done = (outcome) => outcome.status === 'done';
+
+test('상위 none→branching 전환은 옛 답을 버리고 실효 순서를 재검사한다', async () => {
+  const root = await copyFixture('gamebook-n7'), packs = await loadBuiltinPacks();
+  await editYaml(root, (config) => { config.order = { default: 'linear', levels: { chapter: 'none', scene: 'linear' } }; });
+  const makeRunner = () => createRunner({ root, packs }), host = createFakeHost();
+  const waiting = (await driveToEnd(makeRunner, host, { start: { node: 'a' }, until: (o) => o.status === 'needs_model' && o.requests[0].purpose === 'check' })).at(-1);
+  const answers = host.answer(waiting);
+  await editYaml(root, (config) => { config.order.levels.chapter = 'branching'; });
+  await assert.rejects(makeRunner().resume({ runId: waiting.runId, answers }), { code: 'ANSWER_STALE' });
+  const resumed = await makeRunner().run({ node: 'a' });
+  assert.equal((await driveToEnd(makeRunner, host, { from: resumed, until: done })).at(-1).status, 'done');
+  const records = await openLedger(root, 'receipts').readAll(), receipt = records.findLast((r) => r.type === 'receipt');
+  assert.deepEqual(receipt.order, { mode: 'linear', ordered: false, unorderedBy: 'branching' });
+  assert.ok(receipt.refs.some((r) => r.kind === 'branching'));
+  await editYaml(root, (config) => { config.order.levels.chapter = 'none'; });
+  assert.ok((await workStatus(root, { packs })).stale.some((r) => r.nodeId === 'a' && r.reasons.some((reason) => reason.kind === 'order')));
+  assert.equal((await driveToEnd(makeRunner, host, { start: { node: 'a', mode: 'recheck' }, until: done })).at(-1).status, 'done');
+  const recheck = (await openLedger(root, 'receipts').readAll()).findLast((r) => r.type === 'recheck');
+  assert.deepEqual(recheck.order, { mode: 'linear', ordered: false });
+});
+
+test('기록된 분기 영수증의 중단 커밋은 토글·선택지 변경 뒤에도 중복 없이 복구한다', async () => {
+  const root = await copyFixture('gamebook-n7'), packs = await loadBuiltinPacks(), host = createFakeHost();
+  await assert.rejects(driveToEnd(() => createRunner({ root, packs, hooks: { afterBodyWrite() { throw new Error('interrupted'); } } }), host,
+    { start: { node: 'a' }, until: done }), /interrupted/);
+  const run = (await createRunStore(root).list()).find((r) => r.nodeId === 'a');
+  assert.equal(run.state, 'committing');
+  const before = await openLedger(root, 'receipts').readAll();
+  assert.equal(before.filter((r) => r.type === 'receipt').length, 1);
+  assert.equal(before.filter((r) => r.type === 'commit').length, 0);
+  await editYaml(root, (config) => { config.features = { branching: false }; });
+  const work = await openWork(root);
+  await updateNode(root, work.tree.nodes.get('a'), { data: { links: [{ kind: 'choice', to: 'z' }] } });
+  const callsBefore = host.calls.length;
+  assert.equal((await createRunner({ root, packs }).run({ node: 'a' })).status, 'done');
+  assert.equal(host.calls.length, callsBefore);
+  const after = await openLedger(root, 'receipts').readAll();
+  assert.deepEqual(after.slice(0, before.length), before);
+  assert.equal(after.filter((r) => r.type === 'receipt').length, 1);
+  assert.equal(after.filter((r) => r.type === 'commit' && r.receiptId === run.receipt.receiptId).length, 1);
+});
```

위 파일을 GREEN 명령에 추가하고 같은 Task 3 커밋에 포함한다.

## 최종 검토와 J4 통합

Task 3 전체 검사 결과와 태스크 검토 보고를 최종 검토자에게 전달한다. 최신 사용자 지시로 로컬 main 통합이 승인됐다. 독립 최종 검토의 load-bearing 미해결 문제를 통합하지 않는다. main은 /path/to/folio-integration에 있으며 원래 checkout은 건드리지 않는다. ff-only 병합 뒤 main에서 npm run check를 실행한다. 판정·결과 문서와 로드맵을 갱신하고 무시된 SDD 증거를 main의 별도 이름 폴더에 보존한 뒤 관리 worktree를 보관한다.

## 계획 자기 검토·시험 증거

각 설계 요건은 Task 1 그래프/근거/상한, Task 2 범위/전파/순서/영수증/판본, Task 3 팩/모델검토/수용/안내에 대응한다. public 함수 이름과 optional receiptRecords의 생산·소비가 일치한다. 모든 코드 단계는 실제 패치이며 미정 코드나 외부 복사본 의존이 없다. 합성 trial의 전체 검사와 추가 MCP·상한 시험은 판정 기록에 정확한 결과를 남긴 뒤 구현자를 띄운다.
