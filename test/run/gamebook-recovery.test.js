import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFixture } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { editYaml } from '../support/recheck.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { workStatus } from '../../core/status.js';

const done = (outcome) => outcome.status === 'done';

test('상위 none→branching 전환은 옛 답을 버리고 실효 순서를 재검사한다', async () => {
  const root = await copyFixture('gamebook-n7'), packs = await loadBuiltinPacks();
  await editYaml(root, (config) => { config.order = { default: 'linear', levels: { chapter: 'none', scene: 'linear' } }; });
  const makeRunner = () => createRunner({ root, packs }), host = createFakeHost();
  const waiting = (await driveToEnd(makeRunner, host, { start: { node: 'a' }, until: (o) => o.status === 'needs_model' && o.requests[0].purpose === 'check' })).at(-1);
  const answers = host.answer(waiting);
  await editYaml(root, (config) => { config.order.levels.chapter = 'branching'; });
  await assert.rejects(makeRunner().resume({ runId: waiting.runId, answers }), { code: 'ANSWER_STALE' });
  const resumed = await makeRunner().run({ node: 'a' });
  assert.equal((await driveToEnd(makeRunner, host, { from: resumed, until: done })).at(-1).status, 'done');
  const records = await openLedger(root, 'receipts').readAll(), receipt = records.findLast((r) => r.type === 'receipt');
  assert.deepEqual(receipt.order, { mode: 'linear', ordered: false, unorderedBy: 'branching' });
  assert.ok(receipt.refs.some((r) => r.kind === 'branching'));
  await editYaml(root, (config) => { config.order.levels.chapter = 'none'; });
  assert.ok((await workStatus(root, { packs })).stale.some((r) => r.nodeId === 'a' && r.reasons.some((reason) => reason.kind === 'order')));
  assert.equal((await driveToEnd(makeRunner, host, { start: { node: 'a', mode: 'recheck' }, until: done })).at(-1).status, 'done');
  const recheck = (await openLedger(root, 'receipts').readAll()).findLast((r) => r.type === 'recheck');
  assert.deepEqual(recheck.order, { mode: 'linear', ordered: false });
});

test('기록된 분기 영수증은 토글 변경 뒤 복구하되 손수정된 선택지는 덮지 않는다', async () => {
  const root = await copyFixture('gamebook-n7'), packs = await loadBuiltinPacks(), host = createFakeHost();
  await assert.rejects(driveToEnd(() => createRunner({ root, packs, hooks: { afterBodyWrite() { throw new Error('interrupted'); } } }), host,
    { start: { node: 'a' }, until: done }), /interrupted/);
  const run = (await createRunStore(root).list()).find((r) => r.nodeId === 'a');
  assert.equal(run.state, 'committing');
  const before = await openLedger(root, 'receipts').readAll();
  assert.equal(before.filter((r) => r.type === 'receipt').length, 1);
  assert.equal(before.filter((r) => r.type === 'commit').length, 0);
  await editYaml(root, (config) => { config.features = { branching: false }; });
  const work = await openWork(root);
  const originalLinks = work.tree.nodes.get('a').data.links;
  await updateNode(root, work.tree.nodes.get('a'), { data: { links: [{ kind: 'choice', to: 'z' }] } });
  await assert.rejects(createRunner({ root, packs }).run({ node: 'a' }), { code: 'COMMIT_TARGET_CONFLICT' });
  assert.deepEqual((await openWork(root)).tree.nodes.get('a').data.links, [{ kind: 'choice', to: 'z' }]);
  // Restoring the exact approved bytes permits idempotent completion with the original receipt.
  await updateNode(root, (await openWork(root)).tree.nodes.get('a'), { data: { links: originalLinks } });
  const callsBefore = host.calls.length;
  assert.equal((await createRunner({ root, packs }).run({ node: 'a' })).status, 'done');
  assert.equal(host.calls.length, callsBefore);
  const after = await openLedger(root, 'receipts').readAll();
  assert.deepEqual(after.slice(0, before.length), before);
  assert.equal(after.filter((r) => r.type === 'receipt').length, 1);
  assert.equal(after.filter((r) => r.type === 'commit' && r.receiptId === run.receipt.receiptId).length, 1);
});
