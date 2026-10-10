import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleOutline, attentionIds, nextAction, workProgress, navGroup } from '../src/lib/workspace.js';

const nodes = [
  { id: 'group', title: 'Part one', parentId: null, children: ['opening', 'ending'], kind: 'branch', status: 'committed' },
  { id: 'opening', title: 'The gate', parentId: 'group', children: [], kind: 'leaf', hasBody: true, status: 'committed' },
  { id: 'ending', title: 'The river', parentId: 'group', children: [], kind: 'leaf', hasBody: false, status: 'draft' },
];

test('outline filters retain ancestors and exclude unrelated siblings', () => {
  assert.deepEqual([...visibleOutline(nodes, 'river', 'all')], ['ending', 'group']);
  assert.deepEqual([...visibleOutline(nodes, '', 'attention', ['opening'])], ['opening', 'group']);
  assert.deepEqual([...visibleOutline(nodes, 'missing', 'all')], []);
  assert.deepEqual([...visibleOutline(nodes, '', 'draft')], ['ending', 'group']);
});

test('attention queue deduplicates edits and includes pending new checks', () => {
  assert.deepEqual(attentionIds({ ok: true, stale: ['opening'], flagged: ['opening'], recheck: ['ending'], drift: [{ nodeId: 'opening' }] }), ['opening', 'ending']);
  assert.deepEqual(attentionIds({ ok: false }), []);
});

test('overview prioritizes unverified records, attention, then readable text', () => {
  assert.equal(nextAction(nodes, { ok: true, ledger: { ok: false } }).screen, 'receipts');
  assert.deepEqual(nextAction(nodes, { ok: true, stale: ['ending'] }), { screen: 'receipt', id: 'ending', label: 'Open section review' });
  assert.equal(nextAction(nodes, { ok: true, next: { nodeId: 'ending' } }).id, 'opening');
  assert.equal(nextAction([], { ok: true }), null);
});

test('progress counts writing sections rather than finalized containers', () => {
  assert.deepEqual(workProgress(nodes), { total: 2, written: 1, finalized: 1 });
});

test('detail pages belong to their navigation groups', () => {
  for (const [screen, name] of [['read', 'Manuscript'], ['receipt', 'Review'], ['entity', 'Library'], ['source', 'Library'], ['checks', 'Review'], ['stages', 'Settings']]) assert.equal(navGroup(screen).name, name);
});
