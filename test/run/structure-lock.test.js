import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { validateReceipt } from '../../core/ledger/receipts.js';
import { resolvePipeline } from '../../core/pipeline/define.js';
import { withWorkLock } from '../../core/run/work-lock.js';
import { createRunner } from '../../core/run/runner.js';
import { commitNode } from '../../core/run/commit.js';
import { workStatus } from '../../core/status.js';
import { assertStructureMatches } from '../../core/run/commit-locks.js';
import { changeStructure } from '../../core/structure/locked.js';
import { copyFixture, emptyTreeCopy, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { fakePack } from '../support/fake-pack.js';

test('structure changes refuse while a run is open and name the run', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const first = await createRunner({ root, packs: fakePacks() }).run({ node: 'stairwell' });
  assert.equal(first.status, 'needs_model');
  await assert.rejects(changeStructure(root, { op: 'add', parentId: 'the-fall', level: 'scene', id: 'new-scene' }),
    (e) => e.code === 'STRUCTURE_RUN_OPEN' && e.details.runId === first.runId && e.details.nodeId === 'stairwell');
  assert.equal((await openWork(root)).tree.nodes.has('new-scene'), false);
});

test('structure changes wait for the work lock and return the new outline', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  /** @type {() => void} */
  let release = () => {};
  const held = withWorkLock(root, () => new Promise((done) => { release = done; }));
  let settled = false;
  const change = changeStructure(root, { op: 'add', parentId: 'the-fall', level: 'scene', id: 'new-scene', title: '새 장면' })
    .finally(() => { settled = true; });
  // 잠금이 없다면 이 사이에 끝났을 것이다. 잠금이 있으면 기다리는 동안 트리도 그대로다.
  await new Promise((done) => setTimeout(done, 50));
  assert.equal(settled, false, 'waits for the work lock');
  assert.equal((await openWork(root)).tree.nodes.has('new-scene'), false, 'the tree is untouched while the lock is held');
  release();
  await held;
  const result = await change;
  assert.equal(result.op, 'add');
  const added = result.outline.find((n) => n.id === 'new-scene');
  assert.deepEqual(added, { id: 'new-scene', level: 'scene', kind: 'leaf', status: 'draft', title: '새 장면', parentId: 'the-fall' });
});

test('unknown operations are refused, including prototype names', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  for (const op of ['delete', '__proto__', 'constructor']) await assert.rejects(changeStructure(root, { op }), { code: 'STRUCTURE_OP_UNKNOWN' }, op);
});

test('adding a child under a committed branch marks the branch stale; a receipt with other children does not commit', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  for (const id of ['s1', 's2']) await changeStructure(root, { op: 'add', level: 'scene', id, title: id });
  const mk = () => createRunner({ root, packs: fakePacks() });
  await driveToEnd(mk, createFakeHost());
  await changeStructure(root, { op: 'wrap', nodeIds: ['s1', 's2'], level: 'chapter', id: 'c1' });
  await driveToEnd(mk, createFakeHost());
  const receipt = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === 'c1').at(-1);
  assert.deepEqual(receipt.structure, { children: ['s1', 's2'] });
  const status = () => workStatus(root, { packs: fakePacks() });
  assert.ok(!(await status()).stale.some((s) => s.nodeId === 'c1'));
  await changeStructure(root, { op: 'add', parentId: 'c1', level: 'scene', id: 's3' });
  const now = await status();
  const stale = now.stale.find((s) => s.nodeId === 'c1');
  assert.deepEqual(stale.reasons.filter((r) => r.kind === 'structure'), [{ kind: 'structure', id: 'c1', was: ['s1', 's2'], now: ['s1', 's2', 's3'] }]);
  assert.ok(!now.recheck.some((r) => r.nodeId === 'c1'), 'a recheck cannot resolve a structure change; the branch is run again');
  const work = await openWork(root);
  assert.throws(() => assertStructureMatches(work, { nodeId: 'c1', structure: { children: ['s1', 's2'] } }),
    (e) => e.code === 'LOCK_RECEIPT_INVALID' && e.details.problems[0].code === 'STRUCTURE_MISMATCH');
  assert.doesNotThrow(() => assertStructureMatches(work, { nodeId: 'c1', structure: { children: ['s1', 's2', 's3'] } }));
  assert.doesNotThrow(() => assertStructureMatches(work, { nodeId: 'c1' }));
  const { type: _t, seq: _s, at: _a, prev: _p, hash: _h, ...plain } = receipt;
  assert.deepEqual(validateReceipt({ ...plain, structure: { children: [1] } }).map((p) => p.code), ['STRUCTURE_INVALID']);
});

test('a new branch receipt must carry the children it was reviewed with', async () => {
  const root = await copyFixture('novel-3level');
  const pipeline = resolvePipeline(fakePack.pipelines.branch, {});
  const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
  const text = '추락 장의 계획.\n';
  const commit = async (receipt) => {
    await recordDecisions(ledgers.decisions, receipt);
    return commitNode({ root, work: await openWork(root), ledgers, pipeline, receipt, text });
  };
  const base = { nodeId: 'the-fall', level: 'chapter', text, pipeline };
  // structure 를 빼면 자식 대조를 건너뛸 수 있을 것 같지만, 기록장에 없는 새 가지 영수증은 structure 가 있어야 한다.
  await assert.rejects(commit(makeReceipt({ ...base, receiptId: 'rcpt-bare' })),
    (e) => e.code === 'LOCK_RECEIPT_INVALID' && e.details.problems[0].code === 'STRUCTURE_MISSING');
  await assert.rejects(commit({ ...makeReceipt({ ...base, receiptId: 'rcpt-other' }), structure: { children: ['stairwell'] } }),
    (e) => e.code === 'LOCK_RECEIPT_INVALID' && e.details.problems[0].code === 'STRUCTURE_MISMATCH');
  // 잎 노드의 영수증이 structure 를 들고 오면 틀린 것이다.
  const leafPipeline = resolvePipeline(fakePack.pipelines.leaf, {});
  const leaf = { ...makeReceipt({ nodeId: 'stairwell', text, pipeline: leafPipeline, receiptId: 'rcpt-leaf' }), structure: { children: [] } };
  await recordDecisions(ledgers.decisions, leaf);
  await assert.rejects(commitNode({ root, work: await openWork(root), ledgers, pipeline: leafPipeline, receipt: leaf, text }),
    (e) => e.code === 'LOCK_RECEIPT_INVALID' && e.details.problems[0].code === 'STRUCTURE_MISMATCH');
  const children = (await openWork(root)).tree.nodes.get('the-fall').children;
  const result = await commit({ ...makeReceipt({ ...base, receiptId: 'rcpt-ok' }), structure: { children: [...children] } });
  assert.equal(result.nodeId, 'the-fall');
});
