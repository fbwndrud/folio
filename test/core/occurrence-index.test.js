import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rebuildIndex } from '../../core/index/rebuild.js';
import { dumpIndex, marksOf, openIndex } from '../../core/index/query.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { candidatesFor } from '../../core/occurrences/candidates.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { copyFixture } from '../support/fixtures.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

const read = async (root, fn) => { await rebuildIndex(root); const db = openIndex(root); try { return fn(db); } finally { db.close(); } };

test('marks come from the ledger with their current status, in reading order, and rebuild is stable', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-003' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'arc-hunt' }, items: [{ entityId: 'hana', kind: 'mention', quote: '하나가' }] });
  const marks = await read(root, (db) => marksOf(db, 'hana'));
  // 읽는 순서: arc-awakening, ep-001, ep-002, ep-003, arc-hunt, ...
  assert.deepEqual(marks.map((m) => [m.surfaceId, m.kind, m.status]), [['ep-001', 'appearance', 'located'], ['ep-003', 'appearance', 'located'], ['arc-hunt', 'mention', 'located']]);
  assert.equal(marks[0].start, 0);
  const first = await read(root, dumpIndex);
  const second = await read(root, dumpIndex);
  assert.deepEqual(first.marks, second.marks);
});

test('marks are empty when the occurrences feature is off, even with a ledger', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { occurrences: false, occurrencesInExtract: false, rename: false } }));
  assert.deepEqual(await read(root, (db) => marksOf(db, 'hana')), []);
});

test('candidates list name and alias hits outside code fences with context, marking what is already recorded', async () => {
  const root = await copyFixture('serial-2level');
  const path = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('하나는 지하실 끝에서 잠긴 문을 발견했다.', '하나는 지하실 끝에서 잠긴 문을 발견했다. 도윤도 왔다.\n```\n하나\n```\n'));
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  const work = await openWork(root);
  const list = candidatesFor(work, await openLedger(root, OCCURRENCES_LEDGER).readAll(), { kind: 'node', id: 'ep-001' });
  assert.deepEqual(list.map((c) => [c.entityId, c.quote, c.recorded]), [['hana', '하나', true], ['locked-door', '잠긴 문', false], ['doyun', '도윤', false]]);
  assert.equal(list[2].before.endsWith('발견했다. '), true);
});
