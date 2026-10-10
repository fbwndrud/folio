import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterReceipts, skippedStepIds } from '../src/lib/receipts-filter.js';

const node = (nodeId, extra = {}) => ({ nodeId, committed: true, skipped: [], stale: false, recheck: false, flagged: false, drift: null, ...extra });

test('filters: skipped step, needing attention, committed only', () => {
  const nodes = [node('a', { skipped: ['critic'] }), node('b', { stale: true }), node('c', { committed: false }), node('d', { skipped: ['approve', 'critic'], drift: 'HAND_EDITED' })];
  assert.deepEqual(filterReceipts(nodes, { skipped: 'critic' }).map((n) => n.nodeId), ['a', 'd']);
  assert.deepEqual(filterReceipts(nodes, { attention: true }).map((n) => n.nodeId), ['b', 'd']);
  assert.deepEqual(filterReceipts(nodes, { committedOnly: true }).map((n) => n.nodeId), ['a', 'b', 'd']);
  assert.deepEqual(filterReceipts(nodes).length, 4);
  assert.deepEqual(skippedStepIds(nodes), ['approve', 'critic']);
});
