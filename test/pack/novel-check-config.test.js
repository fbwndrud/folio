import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicChecks } from '../../core/checks/run-checks.js';
import { withCheckConfig } from '../../packs/novel/index.js';

test('M5: pack.yaml config reaches the checker as its second argument, frozen and copied; checks without config are untouched', () => {
  const seen = [];
  const run = (ctx, config) => { seen.push(config === undefined ? [ctx.nodeId, 'no config'] : [ctx.nodeId, config, Object.isFrozen(config), Object.isFrozen(config.spans)]); return []; };
  const plain = { id: 'x.plain', run };
  const given = { spans: { next: 2 } };
  const pack = withCheckConfig({ name: 'x', checks: [{ id: 'x.tuned', run, config: given }, plain] });
  runDeterministicChecks(pack.checks, { nodeId: 'n1' });
  assert.deepEqual(seen, [['n1', { spans: { next: 2 } }, true, true], ['n1', 'no config']]);
  assert.equal(pack.checks[1], plain);
  assert.equal(Object.isFrozen(given), false);
});
