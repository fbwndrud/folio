import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { addNode, wrapNodes } from '../../core/structure/ops.js';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { emptyTreeCopy, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';

const doneOrder = (trail) => trail.filter((o) => o.status === 'done').map((o) => o.nodeId);
const runnerFor = (root) => () => createRunner({ root, packs: fakePacks() });

async function bookWork() {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  await addNode(root, await openWork(root), { level: 'book', id: 'b1' });
  return root;
}

test('a wrapped branch with a draft child cannot be run until that child is committed', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  for (const id of ['s1', 's2']) await addNode(root, await openWork(root), { level: 'scene', id });
  const makeRunner = runnerFor(root);
  const host = createFakeHost();
  assert.deepEqual(doneOrder(await driveToEnd(makeRunner, host, { until: (o) => o.status === 'done' })), ['s1']);
  await wrapNodes(root, await openWork(root), { nodeIds: ['s1', 's2'], level: 'chapter', id: 'c1' });
  await assert.rejects(makeRunner().run({ node: 'c1' }), { code: 'CHILDREN_PENDING' });
  assert.equal((await openWork(root)).tree.nodes.get('c1').status, 'draft');
  assert.deepEqual(doneOrder(await driveToEnd(makeRunner, host)), ['s2', 'c1']);
});

test('a draft child added while a derived branch runs parks the branch until it is committed', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  await addNode(root, await openWork(root), { level: 'scene', id: 's1' });
  const makeRunner = runnerFor(root);
  const host = createFakeHost();
  await driveToEnd(makeRunner, host);
  await wrapNodes(root, await openWork(root), { nodeIds: ['s1'], level: 'chapter', id: 'c1' });
  const trail = await driveToEnd(makeRunner, host, { until: (o) => o.status === 'needs_model' && o.nodeId === 'c1' });
  await addNode(root, await openWork(root), { parentId: 'c1', level: 'scene', id: 's3' });
  const rest = await driveToEnd(makeRunner, host, { from: trail.at(-1) });
  assert.deepEqual(doneOrder(rest), ['s3', 'c1']);
  const review = host.calls.filter((c) => c.stepId === 'review' && c.nodeId === 'c1');
  assert.deepEqual(review.at(-1).payload.children.map((c) => c.status), ['committed', 'committed']);
});

test('a child plan outside the level range is asked again', async () => {
  const root = await bookWork();
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `k${i}` }));
  const host = createFakeHost({ children: { b1: (p) => (p.retryReason ? [{ id: 'b1-c1' }] : many) } });
  await driveToEnd(runnerFor(root), host, { until: (o) => o.status === 'needs_model' && o.nodeId === 'b1-c1' });
  const reasons = host.calls.filter((c) => c.stepId === 'children').map((c) => c.payload.retryReason ?? null);
  assert.deepEqual(reasons, [null, 'CHILDREN_COUNT_OUT_OF_RANGE:40 not in [1, 5]']);
  assert.deepEqual((await openWork(root)).tree.nodes.get('b1').children, ['b1-c1']);
});

test('a fixed child id taken elsewhere before creation is dropped and asked again', async () => {
  const root = await bookWork();
  const makeRunner = runnerFor(root);
  const host = createFakeHost({ children: { b1: (p) => (p.retryReason ? [{ id: 'b1-c3' }] : [{ id: 'b1-c1' }, { id: 'b1-c2' }]) } });
  const trail = await driveToEnd(makeRunner, host, { until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'children' });
  const runs = createRunStore(root);
  const run = await runs.load(trail.at(-1).runId);
  Object.assign(run, { pending: null, inbox: {}, state: 'active', outputs: { ...run.outputs, children: [{ id: 'b1-c1', title: '', brief: null }, { id: 'b1-c2', title: '', brief: null }] } });
  await runs.save(run);
  await addNode(root, await openWork(root), { parentId: 'b1', level: 'chapter', id: 'b1-c1' });
  await addNode(root, await openWork(root), { level: 'chapter', id: 'b1-c2' });
  const outcome = await makeRunner().run({ node: 'next' });
  assert.equal(outcome.requests[0].payload.retryReason, 'CHILD_ID_CONFLICT:b1-c2');
  await driveToEnd(makeRunner, host, { from: outcome, until: (o) => o.status === 'needs_model' && o.nodeId !== 'b1' });
  const work = await openWork(root);
  assert.deepEqual(work.tree.nodes.get('b1').children, ['b1-c1', 'b1-c3']);
  assert.equal(work.tree.nodes.get('b1-c2').parentId, null);
});

test('conflicts that keep coming stop at a blocked question', async () => {
  const root = await bookWork();
  const makeRunner = runnerFor(root);
  const host = createFakeHost({ children: { b1: [{ id: 'b1-c1' }] } });
  let outcome = (await driveToEnd(makeRunner, host, { until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'children' })).at(-1);
  const runs = createRunStore(root);
  for (let i = 0; i < 3; i += 1) {
    const run = await runs.load(outcome.runId);
    const id = `taken-${i}`;
    Object.assign(run, { pending: null, inbox: {}, state: 'active', outputs: { ...run.outputs, children: [{ id, title: '', brief: null }] } });
    await runs.save(run);
    await addNode(root, await openWork(root), { level: 'chapter', id });
    outcome = await makeRunner().run({ node: 'next' });
  }
  assert.deepEqual([outcome.status, outcome.question.code, outcome.question.canApprove], ['needs_user', 'CHILDREN_FAILED', false]);
  assert.deepEqual((await openWork(root)).tree.nodes.get('b1').children, []);
});
