import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startViewServer } from '../../server/view/http-server.js';
import { fixturePath, fakePacks } from '../support/fixtures.js';
import { coverageSetup } from '../support/tracking-coverage.js';
import { viewImpact } from '../../core/view/impact-view.js';
import { sourceSnapshot } from '../support/export-work.js';

test('impact endpoint authenticates and returns read-only public change information', async (t) => {
  const s = await coverageSetup(); await s.execute('rooftop-scene', { discover: true });
  const before = await sourceSnapshot(s.root);
  const packs = fakePacks();
  const server = await startViewServer({ root: s.root, packs, distDir: fixturePath('viewer-dist') }); t.after(() => server.close());
  const url = new URL('/api/impact', server.url), headers = { 'x-folio-token': server.token };
  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers }); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), await viewImpact(s.root, { packs }));
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' })).status, 405);
  assert.deepEqual(await sourceSnapshot(s.root), before);
});
