import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { allSurfaces, stringLeaves, surfaceFields, surfaceKey, surfaceText } from '../../core/occurrences/surfaces.js';
import { copyFixture } from '../support/fixtures.js';

test('stringLeaves walks objects and arrays with escaped JSON pointers', () => {
  assert.deepEqual(stringLeaves({ a: 'x', 'b/c': ['y', { d: 'z', n: 3 }] }), [['/a', 'x'], ['/b~1c/0', 'y'], ['/b~1c/1/d', 'z']]);
});

test('surfaces: node body, entity body, asset brief text leaves and source text leaves', async () => {
  const root = await copyFixture('knowledge-book');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'assets', 'cell.yaml'), 'id: cell\nbrief:\n  show: [ATP 분자 모형]\n  avoid: 글자\n  entities: [atp]\n');
  const work = await openWork(root);
  assert.equal(surfaceText(work, { kind: 'node', id: 'atp-section' }), 'ATP는 세포가 쓰는 에너지 화폐다. {#tbl-2-1}\n');
  assert.equal(surfaceText(work, { kind: 'entity', id: 'energy-detail' }), '막 수송의 에너지 원리를 에너지 장에서 설명한다.\n');
  assert.deepEqual([...surfaceFields(work, 'asset', 'cell')], [['/brief/show/0', 'ATP 분자 모형'], ['/brief/avoid', '글자']]);
  assert.deepEqual([...surfaceFields(work, 'source', 'cell-notes')], [['/title', '세포 강의 메모'], ['/spans/0/quote', 'ATP는 세포의 에너지 화폐로 불린다.']]);
  assert.equal(surfaceText(work, { kind: 'node', id: 'nope' }), null);
  assert.equal(surfaceText(work, { kind: 'asset', id: 'cell', field: '/brief/entities/0' }), null);
  assert.equal(surfaceText(work, { kind: 'wat', id: 'x' }), null);
  assert.equal(surfaceKey({ kind: 'node', id: 'a' }), 'node:a:');
  const kinds = allSurfaces(work).map((s) => `${s.kind}:${s.id}`);
  assert.equal(kinds[0], 'node:preface');
  assert.ok(kinds.indexOf('node:glossary') < kinds.indexOf('entity:atp'));
  assert.ok(kinds.indexOf('entity:membrane') < kinds.indexOf('asset:cell'));
  assert.equal(kinds.at(-1), 'source:cell-notes');
});
