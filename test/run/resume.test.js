import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { runChild, wasKilled } from '../support/crash.js';

// 죽인 뒤 .folio/runs/.lock 이 남아 있을 수도(작업 잠금을 쥔 채 죽었으면) 없을 수도(모델 대기까지 마치고 잠금을 놓은 뒤 죽었으면) 있다.
// 어느 쪽이든 재개한 실행이 끝까지 가고 나면 잠금 파일은 남지 않아야 한다(오래된 잠금을 훔쳤다는 뜻).
const lockPath = (root) => join(root, '.folio', 'runs', '.lock');
const lockExists = async (root) => readFile(lockPath(root), 'utf8').then(() => true, (error) => {
  if (error?.code === 'ENOENT') return false;
  throw error;
});

test('a run killed while waiting for the model resumes with the same requests', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const child = runChild(root, 'kill-after-first-request');
  assert.ok(wasKilled(child), `${child.signal} ${child.status} ${child.stderr}`);
  const before = JSON.parse(child.stdout);
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  assert.deepEqual(await makeRunner().run({ node: 'next' }), before);
  const trail = await driveToEnd(makeRunner, createFakeHost(), { from: before, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).nodeId, 'rooftop-scene');
  assert.equal((await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit').length, 1);
  assert.equal(await lockExists(root), false);
});

test('a run killed in the middle of a commit finishes it exactly once', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const child = runChild(root, 'kill-during-commit');
  assert.ok(wasKilled(child), `${child.signal} ${child.status} ${child.stderr}`);
  assert.equal(await lockExists(root), true);
  const [run] = await createRunStore(root).list();
  assert.equal(run.state, 'committing');
  assert.deepEqual((await openLedger(root, 'receipts').readAll()).map((r) => r.type), ['receipt']);
  const outcome = await createRunner({ root, packs: fakePacks() }).run({ node: 'next' });
  assert.deepEqual([outcome.status, outcome.nodeId, outcome.receiptId], ['done', 'rooftop-scene', run.receipt.receiptId]);
  const records = await openLedger(root, 'receipts').readAll();
  assert.deepEqual(records.map((r) => r.type), ['receipt', 'commit']);
  assert.deepEqual(await openLedger(root, 'receipts').verify(), { ok: true });
  const node = (await openWork(root)).tree.nodes.get('rooftop-scene');
  assert.deepEqual([node.status, node.body], ['committed', run.outputs.draft]);
  assert.equal(await lockExists(root), false);
});
