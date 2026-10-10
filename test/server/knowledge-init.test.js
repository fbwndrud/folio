import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { TOOLS } from '../../server/tools/definitions.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseYaml } from '../../core/util/yaml.js';
import { tempDir } from '../support/fixtures.js';

const box = async () => createToolbox({ packs: await loadBuiltinPacks() });

test('folio_init makes a textbook work from the knowledge pack preset', async () => {
  const tools = await box();
  const root = join(await tempDir('folio-n1-init-'), '처음 만나는 세포');
  const out = await tools.call('folio_init', { root, title: '처음 만나는 세포', preset: 'textbook', packs: ['knowledge'] });
  assert.equal(out.ok, true, JSON.stringify(out.error));
  assert.deepEqual(parseYaml(await readFile(join(root, 'work.yaml'), 'utf8')), {
    title: '처음 만나는 세포', levels: [{ name: 'part', children: [1, 10] }, { name: 'chapter', children: [1, 20] }, { name: 'section', leaf: true }],
    packs: ['knowledge'], checkSets: ['knowledge.basic'],
  });
});

test('an unknown preset lists every pack\'s presets, so the knowledge presets are discoverable', async () => {
  const tools = await box();
  const root = join(await tempDir('folio-n1-init-'), 'w');
  const out = await tools.call('folio_init', { root, title: 't', preset: 'textbook' });
  assert.equal(out.error.code, 'PRESET_UNKNOWN');
  assert.deepEqual(out.error.details.presets, ['serial', 'novel', 'scene', 'picturebook', 'fairytale']);
  assert.deepEqual(out.error.details.packPresets, { novel: ['serial', 'novel', 'scene', 'picturebook', 'fairytale'], knowledge: ['textbook', 'history', 'guide', 'sourcebook', 'reference'], gamebook: ['gamebook'] });
  assert.match(TOOLS.find((t) => t.name === 'folio_init').description, /textbook, history, guide/);
});
