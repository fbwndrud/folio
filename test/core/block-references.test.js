import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { bibliography } from '../../core/blocks/bibliography.js';
import { termIndex } from '../../core/blocks/term-index.js';
import { submitEvidence } from '../../core/evidence/submit.js';
import { readEvidence } from '../../core/evidence/records.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { readOccurrences } from '../../core/occurrences/records.js';
import { copyFixture, fixturePath } from '../support/fixtures.js';

const MEMBRANE_FILE = ['tree', '01-part-one', '01-chapter-cell', '02-membrane.md'];
const view = (entries) => entries.map((e) => [e.number, e.sourceId, e.citedIn.map((c) => `${c.nodeId}:${c.via}`)]);

/** blocks-book 복사본에 근거 연결 둘을 남긴다(N2 folio_sources link 와 같은 길). */
async function linked() {
  const root = await copyFixture('blocks-book');
  await submitEvidence(root, { nodeId: 'membrane-section', claims: [{ quote: '세포막은 [[block:fig-cell]]의 바깥 경계다', sources: [{ sourceId: 'membrane-notes', quote: '세포막은 물질의 출입을 고른다.' }] }] });
  await submitEvidence(root, { nodeId: 'atp-section', claims: [{ quote: 'ATP는 에너지 화폐다', sources: [{ sourceId: 'cell-notes', quote: '세포는 생명의 가장 작은 단위다.' }] }] });
  return root;
}

test('bibliography: only cited sources, numbered by first citation in reading order, with each source description', async () => {
  const work = await openWork(fixturePath('blocks-book'));
  const plain = bibliography(work);
  assert.equal(plain.evidence, false);
  assert.deepEqual(plain.entries, [
    { number: 1, sourceId: 'cell-notes', title: '세포 강의 메모', date: '2026-01-10', reliability: 'medium', file: 'cell-notes.txt', citedIn: [{ nodeId: 'cell-section', via: 'citation' }] },
    { number: 2, sourceId: 'energy-review', title: '에너지 대사 개관', date: '2025-11-02', reliability: 'high', file: 'energy-review.txt', citedIn: [{ nodeId: 'atp-section', via: 'citation' }] },
  ]);
  assert.deepEqual(bibliography(work, { evidenceRecords: [] }), { ...plain, evidence: true });
});

test('bibliography: evidence links count once they are found again in the body; a stale claim drops its source', async () => {
  const root = await linked();
  const records = await readEvidence(root);
  const work = await openWork(root);
  assert.deepEqual(view(bibliography(work, { evidenceRecords: records }).entries), [
    [1, 'cell-notes', ['cell-section:citation', 'atp-section:evidence']],
    [2, 'membrane-notes', ['membrane-section:evidence']],
    [3, 'energy-review', ['atp-section:citation']],
  ]);
  assert.deepEqual(view(bibliography(work).entries), [[1, 'cell-notes', ['cell-section:citation']], [2, 'energy-review', ['atp-section:citation']]]);
  assert.deepEqual(view(bibliography(work, { evidenceRecords: records, nodeId: 'chapter-energy' }).entries), [
    [1, 'cell-notes', ['atp-section:evidence']], [2, 'energy-review', ['atp-section:citation']],
  ]);
  const file = join(root, ...MEMBRANE_FILE);
  await writeFile(file, (await readFile(file, 'utf8')).replace('바깥 경계다', '가장자리다'));
  assert.deepEqual(view(bibliography(await openWork(root), { evidenceRecords: records }).entries).map((e) => e[1]), ['cell-notes', 'energy-review']);
  assert.throws(() => bibliography(work, { nodeId: 'nowhere' }), { code: 'NODE_NOT_FOUND' });
});

test('term index: body leaves only, names in code-point order, promises left out unless asked, declared entities count', async () => {
  const work = await openWork(fixturePath('blocks-book'));
  const where = (entries) => entries.map((e) => [e.entityId, e.locations.map((l) => `${l.nodeId}:${l.count}${l.declared ? ':declared' : ''}`)]);
  // 약속 "ATP 순환"이 긴 이름이라 먼저 가려진다(index.db 와 같은 스캔 규칙). 서문·부록·계획(가지 노드)은 색인에 없다.
  assert.deepEqual(where(termIndex(work).entries), [
    ['atp', ['atp-section:1']],
    ['cell', ['cell-section:4', 'tissue:1']],
    ['membrane', ['cell-section:1', 'membrane-section:2', 'atp-section:1', 'tissue:1']],
    ['nucleus', ['tissue:0:declared']],
  ]);
  assert.deepEqual(termIndex(work).entries[0], { entityId: 'atp', name: 'ATP', kind: 'term', locations: [{ nodeId: 'atp-section', title: 'ATP', count: 1, declared: false, marks: 0 }] });
  assert.deepEqual(where(termIndex(work, { kinds: ['promise'] }).entries), [['energy-later', ['atp-section:1']]]);
  assert.deepEqual(where(termIndex(work, { nodeId: 'part-two' }).entries), [['cell', ['tissue:1']], ['membrane', ['tissue:1']], ['nucleus', ['tissue:0:declared']]]);
  assert.throws(() => termIndex(work, { nodeId: 'nowhere' }), { code: 'NODE_NOT_FOUND' });
});

test('term index: recorded occurrences add a place even without the name; stale ones and non-body surfaces do not', async () => {
  const root = await copyFixture('blocks-book');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'cell', kind: 'mention', quote: '에너지 화폐' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'appendix' }, items: [{ entityId: 'nucleus', kind: 'mention', quote: '다시 정리한다' }] });
  const records = await readOccurrences(root);
  const cell = (work, occurrenceRecords) => termIndex(work, { occurrenceRecords }).entries.find((e) => e.entityId === 'cell').locations;
  assert.deepEqual(cell(await openWork(root), records).map((l) => [l.nodeId, l.count, l.marks]), [['cell-section', 4, 0], ['atp-section', 0, 1], ['tissue', 1, 0]]);
  assert.deepEqual(cell(await openWork(root), null).map((l) => l.nodeId), ['cell-section', 'tissue']);
  assert.deepEqual(termIndex(await openWork(root), { occurrenceRecords: records }).entries.find((e) => e.entityId === 'nucleus').locations.map((l) => l.nodeId), ['tissue']);
  const file = join(root, 'tree', '01-part-one', '02-chapter-energy', '01-atp.md');
  await writeFile(file, (await readFile(file, 'utf8')).replace('에너지 화폐다', '연료다'));
  assert.deepEqual(cell(await openWork(root), records).map((l) => l.nodeId), ['cell-section', 'tissue']);
});
