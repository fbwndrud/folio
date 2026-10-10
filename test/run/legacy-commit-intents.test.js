import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertNoUnresolvedLegacyCommitIntent } from '../../core/run/legacy-commit-intents.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openWork } from '../../core/store/work.js';
import { updateNode, nodeFilePath } from '../../core/store/tree.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { driveToEnd, createFakeHost } from '../support/fake-host.js';

async function setup(hook = 'afterPreparedCommitIntentWrite') {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  await assert.rejects(driveToEnd(() => createRunner({ root, packs: fakePacks(), hooks: { [hook]: () => { throw new Error('crash'); } } }),
    createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' }), /crash/);
  const [intent] = await openLedger(root, 'commit-intents').readAll();
  // 합성 임시 저장소를 d31313e의 실제 runId 없는 schema로 만든다.
  await rm(join(root, '.folio', 'ledger', 'commit-intents.jsonl'));
  await rm(join(root, '.folio', 'ledger', 'commit-intents.head'));
  const legacy = Object.fromEntries(['receiptId', 'receiptDigest', 'path', 'beforeHash', 'afterHash'].map((k) => [k, intent[k]]));
  await openLedger(root, 'commit-intents').append({ type: 'commit-intent', ...legacy });
  const [run] = await createRunStore(root).list();
  return { root, run, runner: (hooks = {}) => createRunner({ root, packs: fakePacks(), hooks }) };
}

for (const edit of ['body', 'header']) {
  test(`unresolved true legacy intent preserves ${edit} edit and releases only on reasoned skip`, async () => {
    const { root, run, runner } = await setup();
    assert.equal(run.state, 'active');
    assert.equal(run.receipt, null);
    const node = (await openWork(root)).tree.nodes.get('stairwell');
    await updateNode(root, node, edit === 'body' ? { body: 'human legacy edit' } : { data: { title: 'human legacy header' } });
    const bytes = await readFile(nodeFilePath(root, node));
    const prefix = await openLedger(root, 'commit-intents').readAll();
    for (let i = 0; i < 2; i += 1) {
      await assert.rejects(runner().run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
      assert.deepEqual(await readFile(nodeFilePath(root, node)), bytes);
      assert.deepEqual(await openLedger(root, 'commit-intents').readAll(), prefix);
      assert.deepEqual(await openLedger(root, 'receipts').readAll(), []);
    }
    await assert.rejects(runner().decide({ runId: run.runId, action: 'skip' }));
    assert.equal((await runner().decide({ runId: run.runId, action: 'skip', reason: 'abandon legacy candidate' })).status, 'skipped');
    const after = await openLedger(root, 'commit-intents').readAll();
    assert.deepEqual(after.slice(0, prefix.length), prefix);
    assert.equal(after.at(-1).type, 'commit-intent-abandoned');
    assert.equal(after.at(-1).receiptId, prefix[0].receiptId);
    assert.deepEqual(await readFile(nodeFilePath(root, node)), bytes);
    assert.equal((await runner().run({ node: 'stairwell' })).status, 'needs_model');
  });
}

for (const hook of ['afterDecision', 'afterLegacyIntentAbandonWrite']) {
  test(`legacy skip interrupted at ${hook} retries without duplicate release`, async () => {
    const { root, run, runner } = await setup();
    const die = () => { throw new Error('crash'); };
    await assert.rejects(runner({ [hook]: die }).decide({ runId: run.runId, action: 'skip', reason: 'release legacy' }), /crash/);
    const decisionsBeforeRetry = await openLedger(root, 'decisions').readAll();
    assert.equal((await runner().decide({ runId: run.runId, action: 'skip', reason: 'release legacy' })).status, 'skipped');
    assert.deepEqual(await openLedger(root, 'decisions').readAll(), decisionsBeforeRetry);
    const records = await openLedger(root, 'commit-intents').readAll();
    assert.equal(records.filter((r) => r.type === 'commit-intent-abandoned').length, 1);
    const marker = records.at(-1);
    const decision = (await openLedger(root, 'decisions').readAll()).find((r) => r.hash === marker.decisionHash);
    assert.equal(decision.action, 'skip');
    assert.equal(decision.seq, marker.decisionSeq);
    assert.equal(decision.runId, marker.runId);
  });
}

test('completed true legacy intent permits a new run', async () => {
  const { root, runner } = await setup('afterCommitWrite');
  assert.equal((await runner().run({ node: 'stairwell' })).status, 'done');
  const trail = await driveToEnd(() => runner(), createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  assert.equal((await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit').length, 2);
});

test('unresolved legacy intent does not block another target', async () => {
  const { root } = await setup();
  const node = (await openWork(root)).tree.nodes.get('rooftop-scene');
  await assertNoUnresolvedLegacyCommitIntent(root, { path: node.path, nodeId: node.id });
});

test('legacy receipt without final commit marker remains unresolved', async () => {
  const { root, runner } = await setup('afterReceiptWrite');
  const node = (await openWork(root)).tree.nodes.get('stairwell');
  await updateNode(root, node, { body: 'human legacy receipt edit' });
  await assert.rejects(runner().run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
  assert.equal((await openWork(root)).tree.nodes.get('stairwell').body, 'human legacy receipt edit');
});

test('an abandonment marker without actual matching decision does not release a legacy intent', async () => {
  const { root, run, runner } = await setup();
  const [intent] = await openLedger(root, 'commit-intents').readAll();
  await openLedger(root, 'commit-intents').append({ type: 'commit-intent-abandoned', receiptId: intent.receiptId,
    intentHash: intent.hash, path: intent.path, nodeId: 'stairwell', runId: run.runId,
    decisionHash: 'fabricated', decisionSeq: 1, reason: 'fabricated reason', feedback: '' });
  await assert.rejects(runner().run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
});
