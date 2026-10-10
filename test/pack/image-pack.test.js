import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { IMAGE_CHECKERS } from '../../packs/image/checkers/index.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { openWork } from '../../core/store/work.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { IMAGE_STAGE_NAMES } from '../../core/image/stages.js';
import { copyFixture } from '../support/fixtures.js';

async function illustrated(checkSets) {
  const root = await copyFixture('novel-3level');
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, checkSets }));
  return root;
}

test('the image pack is a second pack: checks and sets only, all advisory and experimental, no locks, no default sets', async () => {
  const packs = await loadBuiltinPacks();
  const pack = packs.get('image');
  assert.deepEqual([pack.pipelines, pack.presets, pack.prompts, pack.defaultCheckSets], [undefined, {}, {}, []]);
  assert.deepEqual(pack.checks.map((c) => [c.id, c.tier, c.stage]), [
    ['image.asset-refs', 'deterministic', 'facts'], ['image.dialogue-in-text', 'deterministic', 'image-precheck'],
    ['image.entities-in-node', 'deterministic', 'image-precheck'], ['image.references-present', 'deterministic', 'image-precheck'],
    ['image.show-conflict', 'deterministic', 'image-precheck'], ['image.review', 'model', 'image-review'],
  ]);
  for (const check of pack.checks) assert.deepEqual([check.severity, check.experimental, check.locked ?? false], ['advisory', true, false], check.id);
  assert.deepEqual(Object.fromEntries(Object.entries(pack.checkSets).map(([id, set]) => [id, set.checks])), {
    'image.basic': ['image.dialogue-in-text', 'image.entities-in-node', 'image.references-present', 'image.show-conflict', 'image.review'],
    'image.placement': ['image.asset-refs'],
  });
  assert.match(pack.checks.find((c) => c.id === 'image.review').instruction, /자기검토/);
});

test('image-stage checks are chosen like any check but never land in a node pipeline; image.asset-refs runs in facts', async () => {
  const packs = await loadBuiltinPacks();
  const plain = await openWorkspace(await copyFixture('novel-3level'), { packs });
  assert.ok(!plain.checks.some((c) => c.id.startsWith('image.')), 'nothing chosen, nothing runs');
  const ws = await openWorkspace(await illustrated(['novel.basic', 'image.basic', 'image.placement']), { packs });
  assert.deepEqual(ws.checks.filter((c) => IMAGE_STAGE_NAMES.includes(c.stage)).map((c) => c.id).sort(),
    ['image.dialogue-in-text', 'image.entities-in-node', 'image.references-present', 'image.review', 'image.show-conflict']);
  const appliedIds = Object.values(ws.applied.byLevel).flatMap((list) => list.map((a) => a.checkId));
  assert.ok(appliedIds.includes('image.asset-refs'));
  assert.ok(!appliedIds.some((id) => ['image.review', 'image.show-conflict'].includes(id)));
});

test('image checkers: unknown or unreadable pictures in the draft, dialogue not in the text, entities outside the node, missing references, show/forbid overlap', async () => {
  const work = await openWork(await copyFixture('novel-3level'));
  const codes = (findings) => findings.map((f) => f.code);
  assert.deepEqual(codes(IMAGE_CHECKERS['asset-refs']({ draft: '![[asset:img-rooftop]] ![[asset:ghost]] ![[asset:ghost]]', work })), ['ASSET_UNKNOWN']);
  const missing = { ...work, warnings: [{ code: 'ASSET_FILE_MISSING', id: 'img-rooftop' }] };
  assert.deepEqual(codes(IMAGE_CHECKERS['asset-refs']({ draft: '![[asset:img-rooftop]]', work: missing })), ['ASSET_FILE_MISSING']);
  const brief = { mustShow: ['붉은 편지', '난간'], mustNotShow: [' 붉은 편지 '], entities: ['mara', 'junho'], dialogue: [{ speaker: 'mara', text: '늦었어.' }, { speaker: null, text: '바람' }], reference: false };
  const node = { entities: ['mara'] };
  assert.deepEqual(codes(IMAGE_CHECKERS['dialogue-in-text']({ nodeText: '바람이 불었다.', brief })), ['DIALOGUE_NOT_IN_TEXT']);
  assert.deepEqual(IMAGE_CHECKERS['dialogue-in-text']({ nodeText: null, brief }), []);
  assert.deepEqual(IMAGE_CHECKERS['entities-in-node']({ node, nodeText: '마라가 웃었다.', work, brief }).map((f) => f.message), ['junho 가 이 노드에 나오지 않는다']);
  assert.deepEqual(IMAGE_CHECKERS['entities-in-node']({ node, nodeText: '준호와 마라.', work, brief }), []);
  const references = [{ entityId: 'mara', assets: [{}] }, { entityId: 'junho', assets: [] }];
  assert.deepEqual(codes(IMAGE_CHECKERS['references-present']({ brief, references })), ['REFERENCE_MISSING']);
  assert.deepEqual(IMAGE_CHECKERS['references-present']({ brief, references: null }), [], 'imageReferences off');
  assert.deepEqual(IMAGE_CHECKERS['references-present']({ brief: { ...brief, reference: true }, references }), [], 'making a reference itself');
  assert.deepEqual(IMAGE_CHECKERS['show-conflict']({ brief }).map((f) => f.quote), ['붉은 편지']);
});
