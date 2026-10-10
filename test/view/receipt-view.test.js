import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { viewNodeReceipts, viewReceiptList } from '../../core/view/receipt-view.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { commitMain, variantWork } from '../support/variant-work.js';

/** 1화를 critic 을 끈 채(이유 있음) 커밋해 둔 연재. 승인은 auto. */
async function committedSerial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' }, critic: { mode: 'off', reason: '초고 속도 우선' } } });
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const trail = await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  return root;
}

test('the receipt list shows every node in reading order, with skipped steps of the committed ones', async () => {
  const root = await committedSerial();
  const list = await viewReceiptList(root, { packs: fakePacks() });
  assert.deepEqual([list.ledger, list.statusAvailable], [{ ok: true }, true]);
  assert.deepEqual(list.nodes.map((n) => [n.nodeId, n.committed]), [
    ['arc-awakening', false], ['ep-001', true], ['ep-002', false], ['ep-003', false], ['arc-hunt', false], ['ep-004', false], ['ep-005', false], ['ep-006', false],
  ]);
  const ep1 = list.nodes[1];
  assert.deepEqual([ep1.skipped, ep1.failed, ep1.hard, ep1.stale, ep1.recheck, ep1.flagged, ep1.drift], [['critic'], [], 0, false, false, false, null]);
  assert.match(ep1.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('one node: commit history, steps with the skip reason and its source, and hand edits', async () => {
  const root = await committedSerial();
  const view = await viewNodeReceipts(root, { packs: fakePacks() }, 'ep-001');
  assert.equal(view.commits.length, 1);
  assert.deepEqual(view.receipt.steps.map((s) => [s.id, s.status]), [
    ['plan', 'passed'], ['draft', 'passed'], ['extract', 'passed'], ['facts', 'passed'], ['critic', 'skipped'], ['revise', 'not_needed'], ['approve', 'auto'],
  ]);
  const critic = view.receipt.steps.find((s) => s.id === 'critic');
  assert.deepEqual([critic.reason, critic.source], ['초고 속도 우선', 'work.yaml#overrides.critic']);
  assert.deepEqual([view.recheck, view.stale, view.drift], [null, [], null]);
  const path = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
  await writeFile(path, `${await readFile(path, 'utf8')}손으로 고친 줄.\n`);
  assert.equal((await viewNodeReceipts(root, { packs: fakePacks() }, 'ep-001')).drift.code, 'HAND_EDITED');
  assert.equal((await viewReceiptList(root, { packs: fakePacks() })).nodes[1].drift, 'HAND_EDITED');
  const empty = await viewNodeReceipts(root, { packs: fakePacks() }, 'ep-002');
  assert.deepEqual([empty.commits, empty.receipt], [[], null]);
  await assert.rejects(viewNodeReceipts(root, { packs: fakePacks() }, 'nope'), { code: 'NODE_NOT_FOUND' });
});

test('a broken receipts ledger gives only the verification result; settings that cannot open still show receipts', async () => {
  const root = await committedSerial();
  const list = await viewReceiptList(root, { packs: new Map() });
  assert.deepEqual([list.statusAvailable, list.nodes[1].committed, list.nodes[1].stale], [false, true, null]);
  const path = join(root, '.folio', 'ledger', 'receipts.jsonl');
  await writeFile(path, (await readFile(path, 'utf8')).replace('"ep-001"', '"ep-002"'));
  const broken = await viewReceiptList(root, { packs: fakePacks() });
  assert.deepEqual([broken.ledger.ok, broken.nodes], [false, []]);
  assert.equal((await viewNodeReceipts(root, { packs: fakePacks() }, 'ep-001')).receipt, null);
});

test('viewer receipts keep the original after a variant commits to the same node', async () => {
  const root = await variantWork();
  await commitMain(root, 'ep-001', '하나는 문을 열었다.\n');
  const before = await viewNodeReceipts(root, { packs: fakePacks() }, 'ep-001');
  const trail = await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost({ drafts: { '*': 'Hana opened the door.\n' } }),
    { start: { node: 'ep-001', variant: 'en' }, until: (outcome) => outcome.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  const after = await viewNodeReceipts(root, { packs: fakePacks() }, 'ep-001');
  assert.deepEqual(after.commits, before.commits);
  assert.deepEqual(after.receipt, before.receipt);
  assert.equal((await viewReceiptList(root, { packs: fakePacks() })).nodes.find((node) => node.nodeId === 'ep-001').receiptId, before.receipt.receiptId);
});
