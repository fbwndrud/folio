import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hrefFor, parseRoute } from '../src/lib/route.js';

test('hash routes map to screens and back', () => {
  assert.deepEqual(parseRoute('#/read/ep-001'), { screen: 'read', id: 'ep-001' });
  assert.deepEqual(parseRoute('#/entity/%ED%95%98%EB%82%98'), { screen: 'entity', id: '하나' });
  assert.deepEqual(parseRoute('#/receipts'), { screen: 'receipts', id: null });
  assert.deepEqual(parseRoute('#/receipt/ep-001'), { screen: 'receipt', id: 'ep-001' });
  assert.deepEqual(parseRoute('#/stages'), { screen: 'stages', id: null });
  assert.deepEqual(parseRoute('#/graph'), { screen: 'graph', id: null });
  assert.deepEqual(parseRoute('#/promises'), { screen: 'promises', id: null });
  assert.deepEqual(parseRoute('#/checks'), { screen: 'checks', id: null });
  assert.deepEqual(parseRoute('#/sources'), { screen: 'sources', id: null });
  assert.deepEqual(parseRoute('#/blocks'), { screen: 'blocks', id: null });
  assert.deepEqual(parseRoute('#/source/cell-notes'), { screen: 'source', id: 'cell-notes' });
  for (const hash of ['', '#/', '#/read', '#/read/a/b', '#/nope/x', '#/read/%E0%A4%A']) assert.deepEqual(parseRoute(hash), { screen: 'home', id: null }, hash);
  assert.equal(hrefFor('read', '하나 둘'), '#/read/%ED%95%98%EB%82%98%20%EB%91%98');
  assert.equal(hrefFor('stages'), '#/stages');
  assert.deepEqual(parseRoute(hrefFor('entity', 'a/b')), { screen: 'entity', id: 'a/b' });
});
