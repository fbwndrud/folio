import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { bodySegments } from '../../core/view/segments.js';
import { viewNode } from '../../core/view/node-view.js';
import { copyFixture } from '../support/fixtures.js';

const MARA = { id: 'mara', name: '마라', aliases: ['마라 언니'] };
const ROOF = { id: 'rooftop', name: '옥상' };

test('segments link names longest-first, keep code blocks as text and put inline pictures in place', () => {
  const body = '마라 언니는 옥상에 섰다. 마라는 웃었다.\n![[asset:img-1]]\n```\n마라\n```\n';
  const segments = bodySegments(body, [MARA, ROOF]);
  assert.deepEqual(segments, [
    { text: '마라 언니', entityId: 'mara' }, { text: '는 ' }, { text: '옥상', entityId: 'rooftop' }, { text: '에 섰다. ' },
    { text: '마라', entityId: 'mara' }, { text: '는 웃었다.\n' }, { asset: 'img-1' }, { text: '\n```\n마라\n```\n' },
  ]);
  const joined = segments.map((s) => ('asset' in s ? `![[asset:${s.asset}]]` : s.text)).join('');
  assert.equal(joined, body);
  assert.deepEqual(bodySegments('', [MARA]), []);
  assert.deepEqual(bodySegments('아무도 없다.', [MARA]), [{ text: '아무도 없다.' }]);
});

test('the reading view of a leaf: segments, path, neighbours with a body, pictures and entities', async () => {
  const root = await copyFixture('serial-2level');
  const view = await viewNode(root, 'ep-001');
  assert.deepEqual(view.node, { id: 'ep-001', level: 'episode', kind: 'leaf', role: 'body', status: 'draft', title: '1화', parentId: 'arc-awakening', children: [] });
  assert.deepEqual(view.breadcrumb, [{ id: 'arc-awakening', level: 'arc', title: '각성' }]);
  assert.deepEqual([view.prev, view.next], [null, 'ep-002']);
  assert.deepEqual(view.segments, [
    { text: '하나', entityId: 'hana' }, { text: '는 지하실 끝에서 ' }, { text: '잠긴 문', entityId: 'locked-door' }, { text: '을 발견했다.\n' },
  ]);
  assert.deepEqual(view.entities, [
    { id: 'hana', kind: 'character', name: '하나', declared: false, count: 1 },
    { id: 'locked-door', kind: 'promise', name: '잠긴 문', declared: false, count: 1 },
  ]);
  assert.deepEqual(view.assets, { inline: [], attached: [] });
  assert.deepEqual([(await viewNode(root, 'arc-hunt')).prev, (await viewNode(root, 'arc-hunt')).next], ['ep-003', 'ep-004']);
  await assert.rejects(viewNode(root, 'ep-999'), { code: 'NODE_NOT_FOUND' });
});

test('pictures: inline and attached, with or without the image file', async () => {
  const root = await copyFixture('novel-3level');
  const view = await viewNode(root, 'rooftop-scene');
  const picture = { id: 'img-rooftop', known: true, hasFile: true, entities: ['mara', 'rooftop'] };
  assert.deepEqual(view.assets, { inline: [picture], attached: [picture] });
  assert.deepEqual(view.entities.map((e) => [e.id, e.declared]), [['mara', true], ['red-letter', false], ['rooftop', true]]);
  assert.deepEqual(view.breadcrumb.map((b) => b.id), ['book-one', 'the-fall']);
  await rm(join(root, 'assets', 'img-rooftop.svg'));
  assert.equal((await viewNode(root, 'rooftop-scene')).assets.inline[0].hasFile, false);
});
