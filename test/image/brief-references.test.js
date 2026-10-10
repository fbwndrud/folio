import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { readBrief, briefHash, briefText } from '../../core/image/brief.js';
import { referencesFor } from '../../core/image/references.js';
import { copyFixture } from '../support/fixtures.js';

test('a brief is normalised with every field, and unknown fields, bad shapes and unknown entities are refused', async () => {
  const work = await openWork(await copyFixture('novel-3level'));
  const { brief } = readBrief(work, { mustShow: ['난간의 마라'], entities: ['mara'], dialogue: [{ speaker: 'mara', text: '늦었어.' }] });
  assert.deepEqual(brief, {
    mustShow: ['난간의 마라'], mustNotShow: [], entities: ['mara'], continuity: '', dialogue: [{ speaker: 'mara', text: '늦었어.' }], reference: false,
  });
  assert.equal(briefHash(brief), briefHash({ ...brief }));
  assert.notEqual(briefHash(brief), briefHash({ ...brief, reference: true }));
  assert.equal(briefText(brief), '난간의 마라\n늦었어.');
  const codes = (raw) => (readBrief(work, raw).errors ?? []).map((e) => `${e.code}:${e.field}${e.index === undefined ? '' : `:${e.index}`}`);
  assert.deepEqual(codes('x'), ['BRIEF_INVALID:']);
  assert.deepEqual(codes({ style: 'noir' }), ['BRIEF_FIELD_UNKNOWN:style']);
  assert.deepEqual(codes({ entities: ['ghost', 'mara', 'mara'] }), ['BRIEF_ENTITY_UNKNOWN:entities:0', 'BRIEF_FIELD_INVALID:entities:2']);
  assert.deepEqual(codes({ mustShow: ['', 'x'.repeat(301)] }), ['BRIEF_FIELD_INVALID:mustShow:0', 'BRIEF_FIELD_INVALID:mustShow:1']);
  assert.deepEqual(codes({ dialogue: [{ speaker: 'ghost', text: '누구' }, { text: '좋아', tone: 'soft' }] }), ['BRIEF_FIELD_INVALID:dialogue:0', 'BRIEF_FIELD_INVALID:dialogue:1']);
  assert.deepEqual(codes({ reference: 'yes', continuity: 3 }), ['BRIEF_FIELD_INVALID:continuity', 'BRIEF_FIELD_INVALID:reference']);
  assert.deepEqual(codes({ mustShow: Array.from({ length: 21 }, () => 'a') }), ['BRIEF_FIELD_INVALID:mustShow']);
});

test('references: assets that list the entity and have a readable file; reference-marked first, then id; the asset being made is left out', async () => {
  const root = await copyFixture('novel-3level');
  await writeFile(join(root, 'assets', 'mara-sheet.yaml'), 'id: mara-sheet\nfile: mara-sheet.svg\nreference: true\nbrief:\n  entities: [mara]\n');
  await writeFile(join(root, 'assets', 'mara-sheet.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(root, 'assets', 'no-file.yaml'), 'id: no-file\nfile: no-file.png\nbrief:\n  entities: [mara]\n');
  const work = await openWork(root);
  assert.deepEqual(referencesFor(work, ['mara', 'junho']), [
    { entityId: 'mara', assets: [{ assetId: 'mara-sheet', file: 'mara-sheet.svg', reference: true }, { assetId: 'img-rooftop', file: 'img-rooftop.svg', reference: false }] },
    { entityId: 'junho', assets: [] },
  ]);
  assert.deepEqual(referencesFor(work, ['mara'], { exclude: 'mara-sheet', limit: 1 })[0].assets.map((a) => a.assetId), ['img-rooftop']);
  await rm(join(root, 'assets', 'img-rooftop.svg'));
  assert.deepEqual(referencesFor(await openWork(root), ['rooftop']), [{ entityId: 'rooftop', assets: [] }]);
});
