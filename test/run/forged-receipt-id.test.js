import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { resolvePipeline } from '../../core/pipeline/define.js';
import { commitNode } from '../../core/run/commit.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { fakePack } from '../support/fake-pack.js';

// 실행 파일은 믿지 않는다. 실행 파일의 receiptId 가 다른 노드·실행의 영수증을 가리켜도 그 영수증을 이 실행의 것으로 보지 않는다.
const commitsOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit' && r.nodeId === nodeId);

test('a run file pointing its receiptId at another node\'s recorded receipt does not make the run skippable', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const mk = (extra = {}) => createRunner({ root, packs: fakePacks(), ...extra });
  for (const node of ['rooftop-scene', 'stairwell', 'the-fall']) {
    assert.equal((await driveToEnd(mk, createFakeHost(), { start: { node }, until: (o) => o.status === 'done' })).at(-1).status, 'done');
  }
  const chapterReceipt = (await commitsOf(root, 'the-fall'))[0].receiptId;
  const trail = await driveToEnd(mk, createFakeHost(), { start: { node: 'post-office' }, until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'critic' });
  const last = trail.at(-1);
  await assert.rejects(mk({ hooks: { afterBodyWrite: () => { throw new Error('crash'); } } }).resume({ runId: last.runId, answers: createFakeHost().answer(last) }), /crash/);
  const file = createRunStore(root).pathOf(last.runId);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, `${JSON.stringify({ ...saved, receipt: { ...saved.receipt, receiptId: chapterReceipt } }, null, 2)}\n`);
  // 장(chapter) 영수증은 장면 파이프라인과 어긋나지만, 이 실행의 영수증이 아니므로 skip 사유가 되지 않는다.
  await assert.rejects(mk().decide({ runId: last.runId, action: 'skip', reason: '위조' }), { code: 'RUN_NOT_AWAITING_USER' });
  assert.equal((await createRunStore(root).load(last.runId)).state, 'committing');
});

test('commitNode refuses a receipt whose id already has a commit record for another node', async () => {
  const root = await copyFixture('novel-3level');
  const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
  const pipeline = resolvePipeline(fakePack.pipelines.leaf, {});
  const commit = async (receipt, text) => {
    await recordDecisions(ledgers.decisions, receipt);
    return commitNode({ root, work: await openWork(root), ledgers, pipeline, receipt, text, resume: true });
  };
  await commit(makeReceipt({ nodeId: 'stairwell', text: '계단참', pipeline, receiptId: 'rcpt-a', runId: 'run-a' }), '계단참');
  const before = await ledgers.receipts.readAll();
  const forged = makeReceipt({ nodeId: 'rooftop-scene', text: '옥상', pipeline, receiptId: 'rcpt-a', runId: 'run-b' });
  await assert.rejects(commit(forged, '옥상'), { code: 'LOCK_RECEIPT_MISMATCH' });
  assert.deepEqual(await ledgers.receipts.readAll(), before);
  assert.notEqual((await openWork(root)).tree.nodes.get('rooftop-scene').status, 'committed');
});
