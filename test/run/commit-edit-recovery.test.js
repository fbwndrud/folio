import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeFilePath, updateNode } from '../../core/store/tree.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { runChild, wasKilled } from '../support/crash.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';

for (const hook of ['afterReceiptWrite', 'afterBodyWrite', 'afterCommitIntentWrite', 'afterCommittingRunWrite', 'afterPreparedCommitIntentWrite']) {
  for (const edit of ['body', 'header']) {
    test(`recovery preserves ${edit} edits after ${hook}, then permits reasoned skip`, async () => {
      const root = await copyFixture('novel-3level');
      await useFakePack(root);
      const makeRunner = () => createRunner({ root, packs: fakePacks(), hooks: { [hook]: () => { throw new Error('crash'); } } });
      await assert.rejects(driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' }), /crash/);
      if (hook === 'afterPreparedCommitIntentWrite') {
        const [cache] = await createRunStore(root).list();
        assert.equal(cache.state, 'active');
        assert.equal(cache.receipt, null);
      }
      const originalReceiptId = (await openLedger(root, 'commit-intents').readAll())[0].receiptId;
      const node = (await openWork(root)).tree.nodes.get('stairwell');
      await updateNode(root, node, edit === 'body' ? { body: 'human edit after crash' } : { data: { title: 'human header edit' } });
      const path = nodeFilePath(root, node);
      const bytes = await readFile(path);
      const runner = createRunner({ root, packs: fakePacks() });
      await assert.rejects(runner.run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
      assert.deepEqual(await readFile(path), bytes);
      const [preservedRun] = await createRunStore(root).list();
      assert.equal(preservedRun.receipt.receiptId, originalReceiptId);
      await assert.rejects(runner.run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
      assert.equal((await createRunStore(root).load(preservedRun.runId)).receipt.receiptId, preservedRun.receipt.receiptId);
      if (edit === 'body') assert.equal((await openWork(root)).tree.nodes.get('stairwell').body, 'human edit after crash');
      const [run] = await createRunStore(root).list();
      const intentsBeforeSkip = await openLedger(root, 'commit-intents').readAll();
      assert.equal(intentsBeforeSkip.length, 1);
      const receipts = await openLedger(root, 'receipts').readAll();
      await assert.rejects(runner.decide({ runId: run.runId, action: 'skip' }));
      assert.equal((await runner.decide({ runId: run.runId, action: 'skip', reason: 'preserve synthetic edit' })).status, 'skipped');
      assert.deepEqual(await readFile(path), bytes);
      assert.deepEqual(await openLedger(root, 'receipts').readAll(), receipts);
      assert.deepEqual(await openLedger(root, 'commit-intents').readAll(), intentsBeforeSkip);
      const fresh = await runner.run({ node: 'stairwell' });
      assert.notEqual(fresh.runId, run.runId);
      assert.equal(fresh.status, 'needs_model');
    });
  }
}

for (const hook of ['afterCommitIntentWrite', 'afterReceiptWrite', 'afterBodyWrite', 'afterCommitWrite', 'afterCommittingRunWrite', 'afterPreparedCommitIntentWrite']) {
  test(`unchanged target resumes exactly once after ${hook}`, async () => {
    const root = await copyFixture('novel-3level');
    await useFakePack(root);
    const makeRunner = () => createRunner({ root, packs: fakePacks(), hooks: { [hook]: () => { throw new Error('crash'); } } });
    await assert.rejects(driveToEnd(makeRunner, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' }), /crash/);
    const originalReceiptId = (await openLedger(root, 'commit-intents').readAll())[0].receiptId;
    const runner = createRunner({ root, packs: fakePacks() });
    assert.equal((await runner.run({ node: 'stairwell' })).status, 'done');
    await runner.run({ node: 'stairwell' });
    const records = await openLedger(root, 'receipts').readAll();
    assert.equal(records.filter((r) => r.type === 'commit').length, 1);
    const intents = await openLedger(root, 'commit-intents').readAll();
    assert.equal(intents.length, 1);
    assert.equal(intents[0].receiptId, originalReceiptId);
  });
}

for (const scenario of ['kill-before-receipt', 'kill-after-receipt']) {
  test(`SIGKILL ${scenario} preserves a subsequent synthetic human edit`, async () => {
    const root = await copyFixture('novel-3level');
    await useFakePack(root);
    const child = runChild(root, scenario);
    assert.ok(wasKilled(child), child.stderr);
    const [run] = await createRunStore(root).list();
    const node = (await openWork(root)).tree.nodes.get(run.nodeId);
    await updateNode(root, node, { body: 'human edit after crash' });
    await assert.rejects(createRunner({ root, packs: fakePacks() }).run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
    assert.equal((await openWork(root)).tree.nodes.get(run.nodeId).body, 'human edit after crash');
    assert.equal((await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit').length, 0);
  });
}

for (const edit of ['none', 'body', 'header']) {
  test(`legacy committing cache without intent fails safe with ${edit} edit`, async () => {
    const root = await copyFixture('novel-3level');
    await useFakePack(root);
    await assert.rejects(driveToEnd(() => createRunner({ root, packs: fakePacks(), hooks: {
      afterCommittingRunWrite: () => { throw new Error('crash'); },
    } }), createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' }), /crash/);
    // 합성 임시 저장소만 옛 버전의 무-intent 캐시 상태로 만든다.
    await rm(join(root, '.folio', 'ledger', 'commit-intents.jsonl'));
    await rm(join(root, '.folio', 'ledger', 'commit-intents.head'));
    const [run] = await createRunStore(root).list();
    const node = (await openWork(root)).tree.nodes.get('stairwell');
    if (edit === 'body') await updateNode(root, node, { body: 'human edit after crash' });
    if (edit === 'header') await updateNode(root, node, { data: { title: 'human header edit' } });
    // 실행 캐시에 가짜 baseline을 넣어도 기록장의 증거로 간주하지 않는다.
    run.beforeHash = 'fabricated-cache-authority';
    await createRunStore(root).save(run);
    const bytes = await readFile(nodeFilePath(root, node));
    const runner = createRunner({ root, packs: fakePacks() });
    for (let retry = 0; retry < 2; retry += 1) {
      await assert.rejects(runner.run({ node: 'next' }), { code: 'COMMIT_TARGET_CONFLICT' });
      assert.deepEqual(await readFile(nodeFilePath(root, node)), bytes);
      assert.equal((await createRunStore(root).load(run.runId)).receipt.receiptId, run.receipt.receiptId);
    }
    assert.deepEqual(await openLedger(root, 'commit-intents').readAll(), []);
    assert.deepEqual(await openLedger(root, 'receipts').readAll(), []);
    await assert.rejects(runner.decide({ runId: run.runId, action: 'skip' }));
    assert.equal((await runner.decide({ runId: run.runId, action: 'skip', reason: 'no durable baseline' })).status, 'skipped');
    assert.deepEqual(await readFile(nodeFilePath(root, node)), bytes);
  });
}
