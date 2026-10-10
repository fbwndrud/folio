import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewSummary, quoteRange, highlightedParts } from '../src/lib/review.js';

const step = { id: 'critic', status: 'passed', checks: [{ checkId: 'novel.critic', reviewer: { sameHost: true }, findings: [{ severity: 'advisory', quote: 'The traveler', message: 'Synthetic suggestion' }], unsupported: [{ message: 'Unsupported evidence' }] }] };
const view = () => ({ ledger: { ok: true }, stale: [], receipt: { steps: [step] } });

test('tampered records expose neither findings nor review success', () => {
  const summary = reviewSummary({ ...view(), ledger: { ok: false } });
  assert.equal(summary.state, 'unverified');
  assert.deepEqual(summary.findings, []); assert.deepEqual(summary.unsupported, []);
});

test('import provenance is distinct from finalized review', () => {
  assert.equal(reviewSummary({ ledger: { ok: true }, imported: {}, receipt: null }).label, 'Imported, not finalized');
  assert.equal(reviewSummary({ ledger: { ok: true }, receipt: null }).state, 'unreviewed');
});

test('edited, stale and unavailable freshness remain explicit', () => {
  assert.equal(reviewSummary({ ...view(), drift: { code: 'TEXT_CHANGED' } }).state, 'drift');
  assert.equal(reviewSummary({ ...view(), stale: [{ kind: 'entity' }] }).state, 'stale');
  assert.equal(reviewSummary({ ...view(), stale: null }).state, 'unknown');
});

test('self-review and unsupported findings remain separate from supported findings', () => {
  const summary = reviewSummary(view());
  assert.equal(summary.selfReview, true); assert.equal(summary.findings.length, 1); assert.equal(summary.unsupported.length, 1);
  assert.equal(summary.findings[0].checkId, 'novel.critic');
});

test('latest review failures remain visible and do not hide later edits', () => {
  const recheck = { hard: 1, steps: [{ id: 'facts', status: 'failed', checks: [] }] };
  assert.equal(reviewSummary({ ...view(), recheck }).state, 'attention');
  assert.equal(reviewSummary({ ...view(), recheck, drift: {} }).state, 'drift');
  assert.equal(reviewSummary({ ...view(), recheck }).selfReview, true);
});

test('quotes consisting only of hidden image or replaced reference syntax cannot offer text navigation', () => {
  assert.equal(quoteRange([{ asset: 'light' }], '![[asset:light]]'), null);
  assert.equal(quoteRange([{ text: '[[block:figure]]', blockRef: 'figure' }], '[[block:figure]]'), null);
});

test('quoted passages span linked definitions without changing original text', () => {
  const segments = [{ text: 'The ' }, { text: 'traveler', entityId: 'traveler' }, { text: ' opened the door.' }];
  assert.deepEqual(quoteRange(segments, 'The traveler opened'), { start: 0, end: 19, count: 1 });
  assert.deepEqual(highlightedParts('traveler', 4, { start: 0, end: 19 }), [{ text: 'traveler', marked: true }]);
});

test('NFC matches map to original combining characters and keep emoji intact', () => {
  const text = 'An e\u0301cho 🏞️. An e\u0301cho 🏞️.';
  const range = quoteRange([{ text }], 'écho 🏞️');
  assert.equal(text.slice(range.start, range.end), 'e\u0301cho 🏞️'); assert.equal(range.count, 2);
  assert.equal(quoteRange([{ text }], 'not there'), null); assert.equal(quoteRange([{ text }], ' '), null);
});

test('image syntax occupies original offsets and partial highlights preserve text', () => {
  const offset = '![[asset:light]]'.length;
  const range = quoteRange([{ asset: 'light' }, { text: 'abcd' }], 'bc');
  assert.equal(range.start, offset + 1);
  const parts = highlightedParts('abcd', offset, range);
  assert.deepEqual(parts, [{ text: 'a', marked: false }, { text: 'bc', marked: true }, { text: 'd', marked: false }]);
  assert.equal(parts.map((p) => p.text).join(''), 'abcd');
});
