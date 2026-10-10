import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { commitTarget, classifyCommitTarget } from '../../core/run/commit-target.js';
import { prepareCommitIntent, readCommitIntent, readRunCommitIntent } from '../../core/run/commit-intents.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { openWork } from '../../core/store/work.js';
import { updateNode, nodeFilePath } from '../../core/store/tree.js';
import { copyFixture } from '../support/fixtures.js';

test('target classification prefers after, applies before, refuses other bytes', () => {
  assert.equal(classifyCommitTarget({ currentHash: 'a', beforeHash: 'a', afterHash: 'a' }), 'after');
  assert.equal(classifyCommitTarget({ currentHash: 'b', beforeHash: 'b', afterHash: 'a' }), 'before');
  assert.equal(classifyCommitTarget({ currentHash: 'c', beforeHash: 'b', afterHash: 'a' }), 'conflict');
});

test('intent is append-only and cannot be replaced on retry', async () => {
  const root = await copyFixture('novel-3level');
  const intent = { receiptId: 'synthetic-receipt', receiptDigest: 'digest', path: 'synthetic.md', beforeHash: 'before', afterHash: 'after' };
  await prepareCommitIntent(root, intent);
  await prepareCommitIntent(root, intent);
  assert.deepEqual(await readCommitIntent(root, intent.receiptId), intent);
  await assert.rejects(prepareCommitIntent(root, { ...intent, beforeHash: 'changed' }), { code: 'COMMIT_TARGET_CONFLICT' });
});

test('legacy receipt permits completion only for already approved body without rewriting header', async () => {
  const root = await copyFixture('novel-3level');
  const node = (await openWork(root)).tree.nodes.get('stairwell');
  const receipt = { receiptId: 'legacy-synthetic' };
  await assert.rejects(commitTarget({ root, node, receipt, text: 'approved', recorded: true, prepare: true }), { code: 'COMMIT_TARGET_CONFLICT' });
  assert.equal(await readCommitIntent(root, receipt.receiptId), null);
  await updateNode(root, node, { data: { title: 'preserved header' }, body: 'approved' });
  const before = await readFile(nodeFilePath(root, node));
  assert.equal(await commitTarget({ root, node, receipt, text: 'approved', recorded: true, prepare: true }), 'after');
  assert.deepEqual(await readFile(nodeFilePath(root, node)), before);
  assert.equal(await readCommitIntent(root, receipt.receiptId), null);
});

test('run lookup resolves canonical receipt and rejects competing candidates rather than choosing latest', async () => {
  const root = await copyFixture('novel-3level');
  const receipt = { receiptId: 'synthetic-first', runId: 'synthetic-run', nodeId: 'stairwell' };
  const intent = { receiptId: receipt.receiptId, receiptDigest: sha256(canonicalJson(receipt)), runId: receipt.runId,
    nodeId: receipt.nodeId, receipt, path: 'synthetic.md', beforeHash: 'before', afterHash: 'after' };
  await prepareCommitIntent(root, intent);
  assert.deepEqual(await readRunCommitIntent(root, receipt.runId), intent);
  const competing = { ...receipt, receiptId: 'synthetic-second' };
  await prepareCommitIntent(root, { ...intent, receiptId: competing.receiptId, receipt: competing, receiptDigest: sha256(canonicalJson(competing)) });
  await assert.rejects(readRunCommitIntent(root, receipt.runId), { code: 'COMMIT_TARGET_CONFLICT' });
});

test('run lookup fails safe for partial or digest-mismatched candidate evidence', async () => {
  const root = await copyFixture('novel-3level');
  const receipt = { receiptId: 'synthetic-bad', runId: 'synthetic-bad-run', nodeId: 'stairwell' };
  await prepareCommitIntent(root, { receiptId: receipt.receiptId, runId: receipt.runId, nodeId: receipt.nodeId,
    receipt, receiptDigest: 'wrong-digest', path: 'synthetic.md', beforeHash: 'before', afterHash: 'after' });
  await assert.rejects(readRunCommitIntent(root, receipt.runId), { code: 'COMMIT_TARGET_CONFLICT' });
  await prepareCommitIntent(root, { receiptId: 'synthetic-partial', runId: 'synthetic-partial-run',
    receiptDigest: 'digest', path: 'synthetic.md', beforeHash: 'before', afterHash: 'after' });
  await assert.rejects(readRunCommitIntent(root, 'synthetic-partial-run'), { code: 'COMMIT_TARGET_CONFLICT' });
});
