import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setupAssets, syntheticSvg, checked, finding } from '../support/assets.js';

const code = (out) => out.error?.code;

test('a host without generation can register a brief; provider IDs are optional opaque metadata', async () => {
  const s = await setupAssets();
  const a = await s.add();
  assert.equal(a.status, 'planned'); assert.equal(a.approved, false);
  assert.equal((await s.get()).history.length, 1);
  assert.equal(code(await s.asset({ op: 'add', id: a.id, brief: {} })), 'ASSET_EXISTS');
  const ready = await s.put(a, { origin: { provider: 'synthetic-provider-a', imageId: 'opaque-id:42' } });
  assert.equal(ready.status, 'ready'); assert.equal(ready.contentVerified, true);
  assert.equal(ready.output.origin.imageId, 'opaque-id:42');
  const b = await s.add('second-image');
  assert.deepEqual((await s.put(b)).output.origin, {});
  assert.equal(s.ok(await s.asset({ op: 'list' })).summary.total, 2);
});

test('external resource IDs are stored without download or approval; file handoff takes a new version', async () => {
  const s = await setupAssets(); const a = await s.add();
  const uri = 'mcp-resource://synthetic-host/image-42';
  const referenced = s.ok(await s.asset({ op: 'put', id: a.id, expectedRev: a.rev, uri, mediaType: 'image/png', contentHash: `sha256:${'0'.repeat(64)}` })).asset;
  assert.equal(referenced.status, 'reference_only'); assert.equal(referenced.contentVerified, false);
  assert.equal(code(await s.asset({ op: 'review', id: a.id, expectedRev: referenced.rev, contentHash: referenced.output.reportedHash, checked, findings: [] })), 'ASSET_CONTENT_UNVERIFIED');
  assert.equal(code(await s.asset({ op: 'decide', id: a.id, expectedRev: referenced.rev, reviewId: 'unknown', action: 'approve' })), 'ASSET_CONTENT_UNVERIFIED');
  const ready = await s.put(referenced);
  assert.equal(ready.version, 3); assert.equal(ready.contentVerified, true);
  await unlink(s.source);
  assert.equal((await s.get()).asset.status, 'ready', 'the saved copy does not depend on the host source');
});

test('advisory review remains visible, self-review labelled, and approving never replaces the file', async () => {
  const s = await setupAssets(); const ready = await s.put(await s.add());
  const reviewed = await s.review(ready, [finding('asset.quality')]);
  assert.equal(reviewed.status, 'reviewed');
  assert.deepEqual(reviewed.review.reviewer, { sameHost: true, independent: false });
  assert.equal(reviewed.review.findings[0].severity, 'advisory');
  const before = await readFile(join(s.root, 'assets', ready.output.file));
  const approved = await s.approve(reviewed);
  assert.equal(approved.status, 'approved'); assert.equal(approved.decision.source, 'user');
  assert.deepEqual(await readFile(join(s.root, 'assets', ready.output.file)), before);
  assert.equal((await s.get()).history.length, 4);
});

test('hard cannot be overridden; block needs a reason, missing checks and severity injection change nothing', async () => {
  const s = await setupAssets(); let a = await s.put(await s.add());
  const before = (await s.get()).history.length;
  for (const checkedInput of [[], checked.slice(1), [...checked, checked[0]]]) {
    assert.equal(code(await s.asset({ op: 'review', id: a.id, expectedRev: a.rev, contentHash: a.output.contentHash, checked: checkedInput, findings: [] })), 'ASSET_INPUT_INVALID');
  }
  assert.equal(code(await s.asset({ op: 'review', id: a.id, expectedRev: a.rev, contentHash: a.output.contentHash, checked, findings: [{ ...finding('asset.fixed-facts'), severity: 'advisory' }] })), 'TOOL_INPUT_INVALID');
  assert.equal((await s.get()).history.length, before);
  a = await s.review(a, [finding('asset.fixed-facts')]);
  assert.equal(code(await s.asset({ op: 'decide', id: a.id, expectedRev: a.rev, reviewId: a.review.reviewId, action: 'approve', reason: '작가가 요청함' })), 'APPROVE_BLOCKED_BY_HARD');
  a = await s.review(a, [finding('asset.brief-fit')]);
  assert.equal(code(await s.asset({ op: 'decide', id: a.id, expectedRev: a.rev, reviewId: a.review.reviewId, action: 'approve' })), 'OVERRIDE_REASON_REQUIRED');
  assert.equal((await s.get()).asset.rev, a.rev);
  assert.equal((await s.approve(a, { reason: '합성 예외 승인' })).approved, true);
});

test('a replacement, changed brief, fresh review and revision request each invalidate earlier approval', async () => {
  const s = await setupAssets(); let a = await s.approve(await s.review(await s.put(await s.add())));
  const oldFile = a.output.file; const oldReview = a.review.reviewId;
  await writeFile(s.source, syntheticSvg('red'));
  const replacement = await s.put(a, { origin: { provider: 'synthetic-provider-b' } });
  assert.equal(replacement.version, 3); assert.equal(replacement.approved, false); assert.equal(replacement.review, null);
  assert.equal((await readFile(join(s.root, 'assets', oldFile), 'utf8')), syntheticSvg());
  assert.equal(code(await s.asset({ op: 'decide', id: a.id, expectedRev: replacement.rev, reviewId: oldReview, action: 'approve' })), 'ASSET_REVIEW_STALE');
  assert.equal(code(await s.asset({ op: 'put', id: a.id, expectedRev: a.rev, path: s.source, mediaType: 'image/svg+xml' })), 'ASSET_REV_STALE');
  a = await s.approve(await s.review(replacement));
  a = s.ok(await s.asset({ op: 'update', id: a.id, expectedRev: a.rev, brief: { description: '수정된 합성 설명서' } })).asset;
  assert.equal(a.status, 'ready'); assert.equal(a.review, null);
  a = await s.approve(await s.review(a));
  a = await s.review(a); assert.equal(a.approved, false);
  assert.equal(code(await s.asset({ op: 'decide', id: a.id, expectedRev: a.rev, reviewId: a.review.reviewId, action: 'request_revision' })), 'FEEDBACK_REQUIRED');
  a = s.ok(await s.asset({ op: 'decide', id: a.id, expectedRev: a.rev, reviewId: a.review.reviewId, action: 'request_revision', feedback: '합성 수정 요청' })).asset;
  assert.equal(a.status, 'needs_revision'); assert.equal(a.approved, false);
  assert.equal(code(await s.asset({ op: 'decide', id: a.id, expectedRev: a.rev, reviewId: a.review.reviewId, action: 'approve' })), 'ASSET_ALREADY_DECIDED');
});

test('tampering or losing a stored image removes current approval and blocks new review/approval', async () => {
  const s = await setupAssets(); const a = await s.approve(await s.review(await s.put(await s.add())));
  const file = join(s.root, 'assets', a.output.file);
  await writeFile(file, syntheticSvg('red'));
  let current = (await s.get()).asset;
  assert.equal(current.status, 'content_changed'); assert.equal(current.approved, false);
  assert.equal(code(await s.asset({ op: 'decide', id: a.id, expectedRev: a.rev, reviewId: a.review.reviewId, action: 'approve' })), 'ASSET_REV_STALE');
  assert.equal(code(await s.asset({ op: 'review', id: a.id, expectedRev: current.rev, contentHash: a.output.contentHash, checked, findings: [] })), 'ASSET_CONTENT_UNVERIFIED');
  await unlink(file); current = (await s.get()).asset;
  assert.equal(current.status, 'content_missing');
  assert.equal(code(await s.asset({ op: 'decide', id: a.id, expectedRev: current.rev, reviewId: a.review.reviewId, action: 'approve' })), 'ASSET_CONTENT_UNVERIFIED');
});

test('two hosts updating the same revision cannot silently overwrite each other', async () => {
  const s = await setupAssets(); const a = await s.add();
  const outcomes = await Promise.all([1, 2].map(() => s.asset({ op: 'put', id: a.id, expectedRev: a.rev, path: s.source, mediaType: 'image/svg+xml' })));
  assert.equal(outcomes.filter((o) => o.ok).length, 1);
  assert.equal(code(outcomes.find((o) => !o.ok)), 'ASSET_REV_STALE');
  assert.equal((await s.get()).history.length, 2);
});

test('ops reject irrelevant arguments and a URI cannot be disguised as a local input', async () => {
  const s = await setupAssets(); const a = await s.add();
  assert.equal(code(await s.asset({ op: 'get', id: a.id, action: 'approve' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await s.asset({ op: 'list', id: a.id })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await s.asset({ op: 'put', id: a.id, expectedRev: a.rev, path: s.source, uri: 'https://invalid.example/image', mediaType: 'image/png' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await s.asset({ op: 'put', id: a.id, expectedRev: a.rev, uri: 'file:///outside', mediaType: 'image/png' })), 'ASSET_INPUT_INVALID');
  assert.equal(code(await s.asset({ op: 'add', id: '../escape', brief: {} })), 'ID_INVALID');
  assert.equal(code(await s.asset({ op: 'add', id: 'unknown-entity', brief: { entities: ['missing'] } })), 'ASSET_INPUT_INVALID');
  assert.equal((await s.get()).history.length, 1);
});
