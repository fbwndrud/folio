import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { addNode, wrapNodes } from '../../core/structure/ops.js';
import { pickNext } from '../../core/run/next.js';
import { createRunner } from '../../core/run/runner.js';
import { copyFixture, emptyTreeCopy, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const doneOrder = (trail) => trail.filter((o) => o.status === 'done').map((o) => o.nodeId);
const receiptFor = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
const statusOf = (receipt, id) => receipt.steps.find((s) => s.id === id);

test('pickNext descends into unfinished branches and returns finished ones', async () => {
  const root = await copyFixture('novel-3level');
  let work = await openWork(root);
  assert.equal(pickNext(work, []).id, 'rooftop-scene');
  assert.equal(pickNext(work, [], [{ nodeId: 'rooftop-scene', state: 'abandoned', createdAt: '1' }]).id, 'stairwell');
  for (const id of ['rooftop-scene', 'stairwell']) await updateNode(root, work.tree.nodes.get(id), { data: { status: 'committed' } });
  work = await openWork(root);
  // 끝남 = 앞머리 committed + 커밋 기록. 앞머리만 바꾼 노드는 끝나지 않았다(예전엔 앞머리만 봤다).
  assert.equal(pickNext(work, []).id, 'rooftop-scene');
  const commits = ['rooftop-scene', 'stairwell'].map((nodeId) => ({ type: 'commit', nodeId, receiptId: `r-${nodeId}` }));
  assert.equal(pickNext(work, commits).id, 'the-fall');
  const empty = await emptyTreeCopy('novel-3level');
  await addNode(empty, await openWork(empty), { level: 'book', id: 'b1' });
  assert.equal(pickNext(await openWork(empty), []).id, 'b1');
});

test('top-down: a book plans its chapters, waits for them, then reviews and commits', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  await addNode(root, await openWork(root), { level: 'book', id: 'b1', title: '1권' });
  const host = createFakeHost({ children: { b1: [{ id: 'b1-c1', title: '가' }], 'b1-c1': [{ id: 'b1-c1-s1' }, { id: 'b1-c1-s2' }] } });
  const trail = await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host);
  assert.equal(trail.at(-1).status, 'idle');
  assert.deepEqual(doneOrder(trail), ['b1-c1-s1', 'b1-c1-s2', 'b1-c1', 'b1']);
  assert.deepEqual(trail.slice(0, 2).map(label), ['model:plan', 'user:approve']);
  const work = await openWork(root);
  for (const node of work.tree.nodes.values()) assert.equal(node.status, 'committed', node.id);
  assert.equal(work.tree.nodes.get('b1').body, '1권 계획');
  const book = await receiptFor(root, 'b1');
  assert.deepEqual(['fit', 'children', 'review'].map((id) => statusOf(book, id).status), ['not_applicable', 'passed', 'passed']);
  assert.equal(statusOf(await receiptFor(root, 'b1-c1'), 'fit').status, 'passed');
  const review = host.calls.find((c) => c.stepId === 'review' && c.nodeId === 'b1');
  assert.deepEqual(review.payload.children.map((c) => c.status), ['committed']);
});

test('bottom-up: scenes first, then wrap, then plans derived from the children', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  for (const id of ['s1', 's2']) await addNode(root, await openWork(root), { level: 'scene', id, title: id });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const host = createFakeHost();
  assert.deepEqual(doneOrder(await driveToEnd(makeRunner, host)), ['s1', 's2']);
  await wrapNodes(root, await openWork(root), { nodeIds: ['s1', 's2'], level: 'chapter', id: 'c1' });
  assert.deepEqual(doneOrder(await driveToEnd(makeRunner, host)), ['c1']);
  const chapter = await receiptFor(root, 'c1');
  assert.deepEqual(statusOf(chapter, 'children'), { id: 'children', kind: 'generate', status: 'skipped', reason: 'children already exist', source: 'core' });
  const plan = host.calls.find((c) => c.nodeId === 'c1' && c.stepId === 'plan');
  assert.equal(plan.payload.mode, 'derive');
  assert.deepEqual(plan.payload.children.map((c) => c.body), ['s1 본문', 's2 본문']);
  assert.deepEqual(await makeRunner().run({ node: 'next' }), { status: 'idle' });
});

test('a planned branch cannot be closed before its children finish', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  await addNode(root, await openWork(root), { level: 'book', id: 'b1' });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const host = createFakeHost({ children: { b1: [{ id: 'b1-c1' }] } });
  const trail = await driveToEnd(makeRunner, host, { until: (o) => o.status === 'needs_user' && o.nodeId === 'b1-c1' });
  await makeRunner().decide({ runId: trail.at(-1).runId, action: 'skip', reason: '나중에' });
  await assert.rejects(makeRunner().run({ node: 'b1' }), { code: 'CHILDREN_PENDING' });
  assert.deepEqual(await makeRunner().run({ node: 'next' }), { status: 'idle' });
});

test('child ids from the model are validated before any file is written', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  await addNode(root, await openWork(root), { level: 'book', id: 'b1' });
  const bad = [[{ id: '../escape' }], [{ id: 'b1' }]];
  let n = 0;
  const host = createFakeHost({ children: { b1: () => bad[n++] ?? [{ id: 'b1-c1' }] } });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const trail = await driveToEnd(makeRunner, host, { until: (o) => o.status === 'needs_model' && o.nodeId === 'b1-c1' });
  const retries = host.calls.filter((c) => c.stepId === 'children').map((c) => c.payload.retryReason ?? null);
  assert.deepEqual(retries, [null, 'CHILD_ID_INVALID:../escape', 'CHILD_ID_INVALID:b1']);
  assert.equal(trail.at(-1).nodeId, 'b1-c1');
  assert.deepEqual((await openWork(root)).tree.nodes.get('b1').children, ['b1-c1']);
});

test('three unreadable child plans stop at a blocked question and create nothing', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  await addNode(root, await openWork(root), { level: 'book', id: 'b1' });
  const bad = [[{ id: 'dup' }, { id: 'dup' }], [], [{ id: 'Bad Id' }]];
  let n = 0;
  const host = createFakeHost({ children: { b1: () => bad[n++] } });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const trail = await driveToEnd(makeRunner, host, { until: (o) => o.status === 'needs_user' && o.question.kind === 'blocked' });
  const { question } = trail.at(-1);
  assert.deepEqual([question.code, question.canApprove], ['CHILDREN_FAILED', false]);
  await assert.rejects(makeRunner().decide({ runId: trail.at(-1).runId, action: 'approve', reason: 'x' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  assert.deepEqual((await openWork(root)).tree.nodes.get('b1').children, []);
});

test('the children step is idempotent when the process dies after fixing the ids', async () => {
  const { createRunStore } = await import('../../core/run/run-store.js');
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  await addNode(root, await openWork(root), { level: 'book', id: 'b1' });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const host = createFakeHost({ children: { b1: [{ id: 'b1-c1' }, { id: 'b1-c2' }], 'b1-c1': [{ id: 'b1-c1-s1' }], 'b1-c2': [{ id: 'b1-c2-s1' }] } });
  const trail = await driveToEnd(makeRunner, host, { until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'children' });
  // 죽은 척: 자식 id 는 실행 파일에 고정됐고, 자식 하나만 만들어진 채 멈춤
  const runs = createRunStore(root);
  const run = await runs.load(trail.at(-1).runId);
  Object.assign(run, { pending: null, inbox: {}, state: 'active', outputs: { ...run.outputs, children: [{ id: 'b1-c1', title: '', brief: null }, { id: 'b1-c2', title: '', brief: null }] } });
  await runs.save(run);
  await addNode(root, await openWork(root), { parentId: 'b1', level: 'chapter', id: 'b1-c1' });
  const rest = await driveToEnd(makeRunner, host, { from: await makeRunner().run({ node: 'next' }) });
  assert.equal(rest.at(-1).status, 'idle');
  const work = await openWork(root);
  assert.deepEqual(work.tree.nodes.get('b1').children, ['b1-c1', 'b1-c2']);
  // 고정된 id 로 이어갔으니 자식 계획을 다시 묻지 않는다
  assert.equal(host.calls.filter((c) => c.stepId === 'children' && c.nodeId === 'b1').length, 0);
  for (const node of work.tree.nodes.values()) assert.equal(node.status, 'committed', node.id);
});
