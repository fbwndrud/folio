import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { viewPromiseBoard } from '../../core/view/promise-board.js';
import { serialWork } from '../support/parity-serial.js';
import { copyFixture, seedEvents } from '../support/fixtures.js';

test('the board lays each promise on the reading order and marks the long-dormant ones (M5 dormancy)', async () => {
  const board = await viewPromiseBoard(await serialWork());
  assert.deepEqual(board.leaves.map((l) => l.id), ['ep-001', 'ep-002', 'ep-003', 'ep-004', 'ep-005', 'ep-006']);
  assert.equal(board.frontier, 'ep-006');
  const byId = Object.fromEntries(board.promises.map((p) => [p.entityId, p]));
  assert.deepEqual(Object.keys(byId), ['ghost-oath', 'old-map', 'red-seal']);
  assert.deepEqual(byId['red-seal'].marks.map((m) => [m.nodeId, m.stage, m.column]), [['ep-001', 'planted', 0]]);
  assert.deepEqual([byId['red-seal'].horizon, byId['red-seal'].dormant], ['next', { code: 'PROMISE_DORMANT', lastMovedAt: 'ep-001', distance: 5, span: 2 }]);
  assert.deepEqual(byId['old-map'].marks.map((m) => [m.nodeId, m.stage]), [['ep-001', 'planted'], ['ep-002', 'advanced']]);
  assert.deepEqual([byId['old-map'].stage, byId['old-map'].dormant], ['advanced', null]);
  assert.deepEqual([byId['ghost-oath'].stage, byId['ghost-oath'].marks], [null, []]);
});

test('order problems from the locked fold are shown, and a broken events ledger is not guessed', async () => {
  const root = await copyFixture('novel-3level');
  await seedEvents(root, 'novel-3level');
  const board = await viewPromiseBoard(root);
  const letter = board.promises.find((p) => p.entityId === 'red-letter');
  assert.deepEqual(letter.problems, [{ code: 'PROMISE_RESOLVED_BEFORE_PLANT', severity: 'hard', nodeId: 'rooftop-scene' }]);
  assert.deepEqual(letter.marks.map((m) => [m.nodeId, m.stage]), [['rooftop-scene', 'resolved'], ['post-office', 'planted']]);
  const path = join(root, '.folio', 'ledger', 'events.jsonl');
  await writeFile(path, (await readFile(path, 'utf8')).replace('"post-office"', '"stairwell"'));
  const broken = await viewPromiseBoard(root);
  assert.deepEqual([broken.ledger.ok, broken.promises, broken.frontier], [false, [], null]);
});
