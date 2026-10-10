import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture } from '../support/fixtures.js';
import { trackingPlan } from '../support/tracking.js';

test('tracking tool exposes strict proposal and user decision entry points', async () => {
  const box = createToolbox({ packs: await loadBuiltinPacks() });
  const root = await copyFixture('serial-2level');
  const call = (input) => box.call('folio_tracking', { root, ...input });
  assert.equal((await call({ op: 'get' })).result.plan, null);
  assert.equal((await call({ op: 'get', grantId: 'fake' })).error.code, 'TOOL_INPUT_INVALID');
  assert.equal((await call({ op: 'propose', expectedRev: 1, plan: trackingPlan() })).error.code, 'TOOL_INPUT_INVALID');
  const proposed = await call({ op: 'propose', expectedRev: null, plan: trackingPlan() });
  assert.equal(proposed.ok, true);
  const p = proposed.result;
  assert.equal((await call({ op: 'decide', proposalId: p.proposalId, proposalDigest: p.proposalDigest, action: 'approve' })).ok, true);
  assert.equal((await call({ op: 'get', planId: 'main' })).result.plan.version, 1);
  assert.equal((await call({ op: 'query', limit: 201 })).error.code, 'TOOL_INPUT_INVALID');
});
