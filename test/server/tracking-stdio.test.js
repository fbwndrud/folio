import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

test('public stdio tracking flow preserves prose, hides candidates, separates coverage and reconnects', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dirname, '../../examples/tracking.js')], {
    encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.synthetic, true);
  assert.equal(output.verified, true);
  assert.deepEqual(output.scenarios, ['mystery', 'cookbook', 'picturebook']);
  assert.deepEqual(output.verifiedBehaviors, [
    'explicit-plan', 'hidden-candidate', 'managed-null-path', 'unchanged-prose',
    'next-payload-provenance', 'stale-versus-coverage', 'reconnect', 'strict-input', 'feature-off-integrity',
  ]);
});
