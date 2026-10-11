import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editionPath } from '../src/lib/edition.js';
import { createStaticApi } from '../src/lib/static-api.js';

test('edition routing scopes reading, section reviews and publication while original settings remain explicit', () => {
  for (const path of ['/api/nodes/scene', '/api/receipts/scene', '/api/publication', '/api/publication/web', '/api/publication/epub']) {
    assert.equal(editionPath(path), path); assert.equal(editionPath(path, 'main'), path);
    assert.equal(editionPath(path, 'en'), path.replace('/api/', '/api/variants/en/'));
  }
  for (const path of ['/api/work', '/api/tracking', '/api/entities/hana', '/api/receipts', '/api/resources']) assert.equal(editionPath(path, 'en'), path);
  for (const id of ['../en', '', null, '__proto__']) assert.throws(() => editionPath('/api/nodes/scene', id), /Invalid reading edition/);
});

test('portable editions preserve receipt identities, missing state and publication warnings without fallback', async () => {
  const main = { contentHash: 'original' }, en = { contentHash: 'translation' }, receipt = { receipt: { variant: 'en', receiptId: 'en-record' } };
  const api = createStaticApi({ nodes: { scene: main }, receiptNodes: {}, variants: {
    catalog: { editions: [{ id: 'main' }, { id: 'en' }] }, editions: { en: { nodes: { scene: en, missing: { edition: { missing: true }, segments: [] } }, receiptNodes: { scene: receipt }, publication: { unavailable: true, code: 'EXPORT_VARIANT_MISSING' } } },
  } });
  assert.deepEqual((await api.get('/api/variants')).editions.map(e => e.id), ['main', 'en']);
  assert.equal(await api.get('/api/nodes/scene'), main); assert.equal(await api.get('/api/variants/main/nodes/scene'), main);
  assert.equal(await api.get('/api/variants/en/nodes/scene'), en); assert.equal(await api.get('/api/variants/en/receipts/scene'), receipt);
  assert.equal((await api.get('/api/variants/en/nodes/missing')).edition.missing, true);
  assert.equal((await api.get('/api/variants/en/publication')).code, 'EXPORT_VARIANT_MISSING');
  await assert.rejects(api.get('/api/variants/en/nodes/ghost'), { code: 'NODE_NOT_FOUND' });
  for (const path of ['/api/variants/en/nodes/scene/extra', '/api/variants/en/publication/web']) await assert.rejects(api.get(path), { code: 'ROUTE_UNKNOWN' });
  for (const id of ['fr', '__proto__', 'constructor']) await assert.rejects(api.get(`/api/variants/${id}/nodes/scene`), { code: 'VARIANT_UNKNOWN' });
  await assert.rejects(api.post('/api/variants/en/nodes/scene', {}), { code: 'STATIC_EXPORT' });
});

test('older review copies stay readable and advertise only the original', async () => {
  const api = createStaticApi({ nodes: { scene: { contentHash: 'old' } } });
  assert.deepEqual((await api.get('/api/variants')).editions, [{ id: 'main', kind: 'original', lang: null }]);
  assert.equal((await api.get('/api/nodes/scene')).contentHash, 'old');
  await assert.rejects(api.get('/api/variants/en/nodes/scene'), { code: 'VARIANT_UNKNOWN' });
});
