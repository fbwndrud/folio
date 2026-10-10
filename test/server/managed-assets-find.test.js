import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { openIndex, dumpIndex } from '../../core/index/query.js';
import { rebuildIndex } from '../../core/index/rebuild.js';
import { copyFixture } from '../support/fixtures.js';
import { connectFolio } from '../support/mcp-client.js';
import { syntheticSvg } from '../support/assets.js';

function result(response) {
  assert.equal(response.ok, true, JSON.stringify(response.error));
  return response.result;
}

test('Toolbox projects legacy and managed assets without invented paths', async () => {
  const root = await copyFixture('novel-3level');
  const toolbox = createToolbox({ packs: await loadBuiltinPacks() });
  const call = (name, args) => toolbox.call(name, { root, ...args });
  const add = async (id, brief) => result(await call('folio_assets', { op: 'add', id, brief })).asset;
  await add('toy-brief', { description: '마라의 합성 그림', entities: ['junho'] });
  const file = await add('toy-file', { description: '합성 파일', entities: ['junho'] });
  const source = join(root, 'synthetic.svg');
  await writeFile(source, syntheticSvg());
  result(await call('folio_assets', { op: 'put', id: file.id, expectedRev: file.rev, path: source, mediaType: 'image/svg+xml' }));
  const uri = await add('toy-uri', { description: '합성 URI', entities: ['junho'] });
  result(await call('folio_assets', { op: 'put', id: uri.id, expectedRev: uri.rev, uri: 'resource://synthetic/toy-uri', mediaType: 'image/png' }));
  await add('toy-unassociated', { description: '연결되지 않은 합성 그림' });

  const usages = result(await call('folio_find', { query: 'usages', id: 'junho' }));
  assert.equal(usages.entityId, 'junho');
  for (const id of ['toy-brief', 'toy-file', 'toy-uri']) {
    assert.ok(usages.usages.some((entry) => entry.surfaceKind === 'asset' && entry.surfaceId === id && entry.origin === 'declared'), id);
  }
  assert.ok(!usages.usages.some((entry) => entry.surfaceId === 'toy-unassociated'));
  assert.deepEqual(result(await call('folio_find', { query: 'events', id: 'junho' })), { entityId: 'junho', events: [] });
  const db = openIndex(root);
  let assetRows;
  try {
    const rows = dumpIndex(db).assets;
    assetRows = rows;
    assert.deepEqual(rows.find((row) => row.id === 'img-rooftop').path, 'assets/img-rooftop.yaml');
    assert.equal(rows.find((row) => row.id === 'img-rooftop').storage, 'file');
    for (const id of ['toy-brief', 'toy-file', 'toy-uri', 'toy-unassociated']) {
      assert.equal(rows.find((row) => row.id === id).path, null);
      assert.equal(rows.find((row) => row.id === id).storage, 'managed');
    }
  } finally { db.close(); }
  await rebuildIndex(root);
  const rebuilt = openIndex(root);
  try { assert.deepEqual(dumpIndex(rebuilt).assets, assetRows); }
  finally { rebuilt.close(); }
});

test('actual stdio managed add followed by find usages and events', async (t) => {
  const root = await copyFixture('novel-3level');
  const folio = await connectFolio();
  t.after(() => folio.close());
  result(await folio.call('folio_assets', { root, op: 'add', id: 'toy-image', brief: { description: '합성', entities: ['junho'] } }));
  const usages = result(await folio.call('folio_find', { root, query: 'usages', id: 'junho' }));
  assert.ok(usages.usages.some((entry) => entry.surfaceKind === 'asset' && entry.surfaceId === 'toy-image'));
  assert.deepEqual(result(await folio.call('folio_find', { root, query: 'events', id: 'junho' })), { entityId: 'junho', events: [] });
});
