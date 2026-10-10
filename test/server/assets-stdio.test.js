import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAssetExample } from '../../examples/assets.js';

test('actual stdio MCP: provider-neutral synthetic handoff, author decision, replacement and fresh approval', async () => {
  assert.deepEqual(await runAssetExample(), { synthetic: true, verified: true, outputsRetained: false, version: 4, status: 'approved', providersOptional: true });
});
