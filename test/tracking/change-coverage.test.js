import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackingChange } from '../../core/tracking/change.js';
import { sha256 } from '../../core/util/hash.js';
import { coverageSetup, TEXT } from '../support/tracking-coverage.js';

for (const op of ['decide', 'apply']) test(`${op} subject addition returns the same pending catalog coverage as an immediate get`, async () => {
  const s = await coverageSetup(); await s.execute('rooftop-scene');
  const before = await trackingChange(s.root, { op: 'get' });
  assert.deepEqual(before.coverage.map((entry) => entry.state), ['complete']);
  const proposal = await trackingChange(s.root, { op: 'propose', expectedRev: before.plan.rev,
    changes: { subjects: [{ id: 'key', kind: 'object', name: '합성 열쇠', aliases: [], body: '', data: {},
      evidence: { nodeId: 'rooftop-scene', textHash: sha256(TEXT), quote: '파란 열쇠' } }] } });
  const response = await trackingChange(s.root, { op, proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
    ...(op === 'decide' ? { action: 'approve' } : { grantId: before.plan.grantId }) });
  const read = await trackingChange(s.root, { op: 'get' });
  assert.deepEqual(response.coverage, read.coverage);
  assert.deepEqual(response.coverage.map((entry) => entry.state), ['pending']);
  assert.notEqual(response.coverage[0].catalogDigest, before.coverage[0].catalogDigest);
  const { proposalId: _proposalId, action: _action, ...view } = response;
  assert.deepEqual(view, read);
  const entities = await trackingChange(s.root, { op: 'query', type: 'entities', subjectId: 'key' });
  assert.equal(entities.entries[0].storage, 'tracking');
  assert.equal(entities.entries[0].path, null);
});
