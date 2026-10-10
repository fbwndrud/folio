import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, fakePacks, tempDir, useFakePack } from '../support/fixtures.js';

const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => out.error?.code;

async function workWithFeatures(features) {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
  return root;
}

// F-2: 부모 기능만 꺼도 작품은 막히지 않는다. 자식은 저절로 꺼진다.
test('F-2: features { occurrences: false } alone gives a working work; the children are effectively off', async () => {
  const root = await workWithFeatures({ occurrences: false });
  const tools = createToolbox({ packs: fakePacks() });
  ok(await tools.call('folio_status', { root }));
  ok(await tools.call('folio_run', { root, node: 'ep-001' }));
  assert.equal(ok(await tools.call('folio_find', { root, query: 'node', id: 'ep-001' })).node.id, 'ep-001');
  const values = ok(await tools.call('folio_config', { root })).features.values;
  assert.deepEqual(values, {
    occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true,
    assets: true, tracking: true, promiseScope: true, viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true, viewerExport: true,
    images: true, imageReferences: true, imageReview: true, variants: true, branching: true, layout: true, export: true,
  });
  const renamed = await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' });
  assert.equal(code(renamed), 'FEATURE_DISABLED');
  assert.equal(renamed.error.details.feature, 'rename');
});

test('F-2: a child explicitly set true under an off parent is still CONFIG_INVALID (FEATURE_REQUIRES)', async () => {
  const root = await workWithFeatures({ occurrences: false, occurrenceScope: true });
  const tools = createToolbox({ packs: fakePacks() });
  const out = await tools.call('folio_status', { root });
  assert.equal(code(out), 'CONFIG_INVALID');
  assert.match(JSON.stringify(out.error), /FEATURE_REQUIRES/);
});

test('F-2: folio_init with { occurrences: false } succeeds', async () => {
  const tools = createToolbox({ packs: await loadBuiltinPacks() });
  const root = join(await tempDir('folio-toggle-'), 'work');
  const init = ok(await tools.call('folio_init', { root, title: '유리 등대', preset: 'serial', features: { occurrences: false } }));
  assert.equal(init.created, true);
  ok(await tools.call('folio_status', { root }));
  assert.deepEqual(parseYaml(await readFile(join(root, 'work.yaml'), 'utf8')).features, { occurrences: false });
});

// F-5: 후보 찾기는 등장 위치 제출용이라 occurrences 가 꺼지면 거부한다.
test('F-5: folio_find candidates is FEATURE_DISABLED when occurrences is off, and works when it is on', async () => {
  const tools = createToolbox({ packs: fakePacks() });
  const off = await workWithFeatures({ occurrences: false });
  const refused = await tools.call('folio_find', { root: off, query: 'candidates', id: 'ep-003' });
  assert.equal(code(refused), 'FEATURE_DISABLED');
  assert.equal(refused.error.details.feature, 'occurrences');
  const on = await workWithFeatures({});
  assert.deepEqual(ok(await tools.call('folio_find', { root: on, query: 'candidates', id: 'ep-003' })).candidates.map((c) => c.entityId), ['hana']);
});
