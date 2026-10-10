import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../../core/util/hash.js';
import { validateReceipt, lastCommits, isBlocking } from '../../core/ledger/receipts.js';

const draftHash = sha256('본문');
const validReceipt = () => ({
  receiptVersion: 1, receiptId: 'rcpt-1', runId: 'run-1', nodeId: 'n1', variant: 'main', level: 'scene',
  draftHash, pipelineDigest: sha256('p'), hard: 0, attempts: 0, refs: [], advisories: [], overridden: [], events: [],
  steps: [
    { id: 'draft', kind: 'generate', status: 'passed' },
    { id: 'facts', kind: 'check', status: 'passed', draftHash, checks: [] },
    { id: 'critic', kind: 'check', status: 'skipped', reason: '초고 속도 우선', source: 'work.yaml#overrides.critic' },
    { id: 'approve', kind: 'gate', status: 'auto', source: 'work.yaml#overrides.approve' },
  ],
});

test('a well-formed receipt is valid', () => {
  assert.deepEqual(validateReceipt(validReceipt()), []);
});

const broken = {
  VARIANT_UNSUPPORTED: (r) => { r.variant = 'en'; },
  DRAFT_HASH_INVALID: (r) => { r.draftHash = 'abc'; },
  STEP_SKIP_REASON_MISSING: (r) => { delete r.steps[2].reason; },
  CHECK_HASH_MISMATCH: (r) => { r.steps[1].draftHash = sha256('다른 본문'); },
  STEP_NOT_RUN: (r) => { r.steps[1].status = 'not_run'; },
  SELF_REVIEW_MISLABELED: (r) => { r.steps[1].checks = [{ checkId: 'c', status: 'passed', findings: [], reviewer: { sameHost: true, independent: true } }]; },
  RECEIPT_FIELD_MISSING: (r) => { delete r.nodeId; },
  STEP_INVALID: (r) => { r.steps[0] = null; },
};
for (const [code, mutate] of Object.entries(broken)) {
  test(`validateReceipt reports ${code}`, () => {
    const receipt = validReceipt();
    mutate(receipt);
    assert.ok(validateReceipt(receipt).some((e) => e.code === code), JSON.stringify(validateReceipt(receipt)));
  });
}

test('lastCommits keeps the latest commit per node', () => {
  const commits = lastCommits([
    { type: 'commit', nodeId: 'a', receiptId: 'r1', seq: 1 },
    { type: 'receipt', nodeId: 'a', receiptId: 'r2', seq: 2 },
    { type: 'commit', nodeId: 'a', receiptId: 'r2', seq: 3 },
  ]);
  assert.equal(commits.get('a').receiptId, 'r2');
});

test('only hard and block findings block', () => {
  assert.deepEqual(['hard', 'block', 'warning', 'advisory'].map((severity) => isBlocking({ severity })), [true, true, false, false]);
});
