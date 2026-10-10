import test from 'node:test';
import assert from 'node:assert/strict';
import { runProductionExample } from '../../examples/production.js';

test('production path uses real stdio, HTTP, CLI and verified synthetic exports without models', async () => {
  const summary = await runProductionExample();
  assert.equal(summary.synthetic, true);
  assert.equal(summary.viewerResourceVisible, true);
  assert.equal(summary.epubVerified, true);
  assert.equal(summary.outputsRetained, false);
  assert.equal(summary.resourceOnlyVerified, true);
  assert.equal(summary.installedCliReady, true);
  assert.equal(summary.embeddingUnavailable, 'EMBEDDING_RUNTIME_UNAVAILABLE');
});
