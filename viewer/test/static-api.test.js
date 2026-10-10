import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api.js';
import { createStaticApi, readStaticData } from '../src/lib/static-api.js';

const data = {
  work: { title: 't' }, nodes: { 'ep-001': { node: { id: 'ep-001' } } }, entities: { hana: { entity: { id: 'hana' } } },
  receipts: { nodes: [] }, receiptNodes: { 'ep-001': { receipt: null } }, stages: { toggles: false }, checkSets: null,
  graph: { edges: [] }, promises: { promises: [] }, blocks: { anchors: [] }, sources: null, sourceDetails: {}, evidence: { 'ep-001': { claims: [] } },
  assetFiles: { img: 'assets/img.png' },
};

test('the static API answers the same paths from the embedded snapshot', async () => {
  const api = createStaticApi(data);
  assert.equal(api.static, true);
  assert.equal((await api.get('/api/work')).title, 't');
  assert.equal((await api.get('/api/nodes/ep-001')).node.id, 'ep-001');
  assert.equal((await api.get('/api/entities/hana')).entity.id, 'hana');
  assert.deepEqual(await api.get('/api/receipts'), { nodes: [] });
  assert.deepEqual(await api.get('/api/receipts/ep-001'), { receipt: null });
  assert.deepEqual(await api.get('/api/stages'), { toggles: false });
  assert.deepEqual(await api.get('/api/evidence/ep-001'), { claims: [] });
  assert.equal(api.assetUrl('img'), 'assets/img.png');
  assert.equal(api.assetUrl('none'), null);
});

test('missing things, prototype names and every write are refused', async () => {
  const api = createStaticApi(data);
  const code = async (promise) => { try { await promise; return 'ok'; } catch (e) { assert.ok(e instanceof ApiError); return e.code; } };
  assert.equal(await code(api.get('/api/nodes/nope')), 'NODE_NOT_FOUND');
  assert.equal(await code(api.get('/api/nodes/__proto__')), 'NODE_NOT_FOUND');
  assert.equal(await code(api.get('/api/check-sets')), 'STATIC_UNAVAILABLE');
  assert.equal(await code(createStaticApi({ ...data, blocks: null }).get('/api/blocks')), 'STATIC_UNAVAILABLE');
  assert.equal(await code(api.get('/api/sources')), 'STATIC_UNAVAILABLE');
  assert.equal(await code(api.get('/api/teleport')), 'ROUTE_UNKNOWN');
  assert.equal(await code(api.post('/api/stages', {})), 'STATIC_EXPORT');
  assert.equal(await code(api.post('/api/export', {})), 'STATIC_EXPORT');
});

test('the snapshot is read from the inert script tag, or null on a live server', () => {
  const doc = (text) => ({ getElementById: (id) => (id === 'folio-data' && text !== null ? { textContent: text } : null) });
  assert.deepEqual(readStaticData(doc('{"work":{}}')), { work: {} });
  assert.equal(readStaticData(doc(null)), null);
  assert.equal(readStaticData(doc('{bad')), null);
  assert.equal(readStaticData(null), null);
});
