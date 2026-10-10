import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { OCCURRENCES_LEDGER, latestBySurface } from '../../core/occurrences/records.js';
import { validateItems } from '../../core/occurrences/validate.js';
import { occurrenceStates, staleOccurrences } from '../../core/occurrences/state.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { workStatus } from '../../core/status.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { stringifyYaml, parseYaml } from '../../core/util/yaml.js';

const EP1 = join('tree', '01-arc-awakening', '01-ep-001.md');
const ATP = join('tree', '01-part-basics', '02-chapter-energy', '01-atp.md');

async function edit(root, path, from, to) {
  const text = await readFile(join(root, path), 'utf8');
  assert.ok(text.includes(from), `${path} has ${from}`);
  await writeFile(join(root, path), text.replace(from, to));
}

test('validateItems accepts pronoun quotes, dedupes, and reports every bad item by index', async () => {
  const work = await openWork(await copyFixture('serial-2level'));
  const text = '하나는 문을 보았다. 그녀는 돌아섰다.';
  const out = validateItems(work, text, [
    { entityId: 'hana', kind: 'appearance', quote: '하나는' },
    { entityId: 'hana', kind: 'appearance', quote: '그녀는' },
    { entityId: 'hana', kind: 'mention', quote: '하나는' },
    { entityId: 'ghost', kind: 'appearance', quote: '문을' },
    { entityId: 'hana', kind: 'cameo', quote: '문을' },
    { entityId: 'doyun', kind: 'mention', quote: '도윤' },
    null,
  ]);
  assert.deepEqual(out.items.map((i) => i.quote), ['하나는', '그녀는']);
  assert.deepEqual(out.errors.map((e) => [e.index, e.code]), [
    [3, 'OCCURRENCE_ENTITY_UNKNOWN'], [4, 'OCCURRENCE_KIND_INVALID'], [5, 'OCCURRENCE_QUOTE_NOT_FOUND'], [6, 'OCCURRENCE_INVALID'],
  ]);
  assert.deepEqual(validateItems(work, text, 'x').errors, [{ index: null, code: 'OCCURRENCES_SHAPE_INVALID' }]);
  assert.equal(validateItems(work, text, Array.from({ length: 501 }, () => ({}))).errors[0].code, 'OCCURRENCES_SHAPE_INVALID');
});

test('submit records a whole surface or nothing; the latest record for a surface wins', async () => {
  const root = await copyFixture('serial-2level');
  const surface = { kind: 'node', id: 'ep-001' };
  const first = await submitOccurrences(root, { surface, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  assert.equal(first.accepted, 1);
  await assert.rejects(submitOccurrences(root, { surface, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }, { entityId: 'hana', kind: 'appearance', quote: '없는 글' }] }),
    (e) => e.code === 'OCCURRENCES_INVALID' && e.details.errors[0].index === 1);
  await submitOccurrences(root, { surface, items: [{ entityId: 'locked-door', kind: 'mention', quote: '잠긴 문' }] });
  const records = await openLedger(root, OCCURRENCES_LEDGER).readAll();
  assert.equal(records.length, 2);
  assert.deepEqual(latestBySurface(records).get('node:ep-001:').items.map((i) => i.entityId), ['locked-door']);
  await assert.rejects(submitOccurrences(root, { surface: { kind: 'node', id: 'nope' }, items: [] }), { code: 'SURFACE_NOT_FOUND' });
  await assert.rejects(submitOccurrences(root, { surface: { kind: 'blob', id: 'x' }, items: [] }), { code: 'SURFACE_KIND_INVALID' });
});

test('submit is refused when the occurrences feature is off', async () => {
  const root = await copyFixture('serial-2level');
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { occurrences: false, occurrencesInExtract: false, rename: false } }));
  await assert.rejects(submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [] }), { code: 'FEATURE_DISABLED' });
});

test('states re-anchor after edits for a character (novel) and a term (knowledge book); what is lost is stale', async () => {
  const novel = await copyFixture('serial-2level');
  await submitOccurrences(novel, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }, { entityId: 'locked-door', kind: 'mention', quote: '잠긴 문을' }] });
  await edit(novel, EP1, '지하실 끝에서', '다락 끝에서');
  await edit(novel, EP1, '잠긴 문을', '낡은 문을');
  const states = occurrenceStates(await openWork(novel), await openLedger(novel, OCCURRENCES_LEDGER).readAll());
  assert.deepEqual(states.map((s) => [s.entityId, s.status]), [['hana', 'relocated'], ['locked-door', 'stale']]);
  assert.deepEqual(staleOccurrences(states), [{ entityId: 'locked-door', kind: 'mention', surface: { kind: 'node', id: 'ep-001', field: '' }, quote: '잠긴 문을', reason: 'QUOTE_MISSING' }]);

  const book = await copyFixture('knowledge-book');
  await submitOccurrences(book, { surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'atp', kind: 'appearance', quote: 'ATP는' }] });
  await submitOccurrences(book, { surface: { kind: 'source', id: 'cell-notes', field: '/spans/0/quote' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP는' }] });
  await edit(book, ATP, 'ATP는 세포가', '> 요약\n\nATP는 세포가');
  const bookStates = occurrenceStates(await openWork(book), await openLedger(book, OCCURRENCES_LEDGER).readAll());
  // 인용문이 본문 맨 앞이라 저장된 앞 문맥이 비어 있다 → 앞에 글을 더해도 뒤 문맥은 온전하다(relocated)
  assert.deepEqual(bookStates.map((s) => [s.surface.kind, s.status]), [['node', 'relocated'], ['source', 'located']]);
  await edit(book, ATP, '세포가 쓰는', '세포 안에서 쓰는');
  const edited = occurrenceStates(await openWork(book), await openLedger(book, OCCURRENCES_LEDGER).readAll());
  assert.equal(edited[0].status, 'stale');
  assert.equal(edited[0].reason, 'WEAK_CONTEXT');
});

test('a deleted node or entity makes its marks stale with the reason', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'entity', id: 'locked-door' }, items: [{ entityId: 'hana', kind: 'mention', quote: '문 너머' }] });
  const work = await openWork(root);
  work.entities.delete('locked-door');
  const records = await openLedger(root, OCCURRENCES_LEDGER).readAll();
  assert.equal(occurrenceStates(work, records)[0].reason, 'SURFACE_MISSING');
  const work2 = await openWork(root);
  work2.entities.delete('hana');
  assert.equal(occurrenceStates(work2, records)[0].reason, 'ENTITY_MISSING');
});

test('status lists stale occurrences, and says null when the feature is off', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  assert.deepEqual((await workStatus(root, { packs: fakePacks() })).occurrences, { stale: [], total: 1 });
  await edit(root, EP1, '하나는', '그 아이는');
  assert.equal((await workStatus(root, { packs: fakePacks() })).occurrences.stale.length, 1);
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { occurrences: false, occurrencesInExtract: false, rename: false } }));
  assert.equal((await workStatus(root, { packs: fakePacks() })).occurrences, null);
});

test('records that pass the hash chain but are malformed are skipped, not thrown (Ruling B1-1)', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const ledger = openLedger(root, OCCURRENCES_LEDGER);
  await ledger.append({ type: 'occurrences', surface: { kind: 'node', id: 'ep-001' }, items: null, origin: 'tool' });
  await ledger.append({ type: 'occurrences', items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }], origin: 'tool' });
  await ledger.append({ type: 'occurrences', surface: { kind: 'node', id: 'ep-001' }, items: [null], origin: 'tool' });
  const work = await openWork(root);
  const records = await ledger.readAll();
  assert.deepEqual(occurrenceStates(work, records), []);
  assert.deepEqual((await workStatus(root, { packs: fakePacks() })).occurrences, { stale: [], total: 0 });
});

test('submitOccurrences refuses a non-string surface.id or surface.field with SURFACE_INVALID', async () => {
  const root = await copyFixture('serial-2level');
  await assert.rejects(submitOccurrences(root, { surface: { kind: 'node', id: 123 }, items: [] }), { code: 'SURFACE_INVALID' });
  await assert.rejects(submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001', field: 5 }, items: [] }), { code: 'SURFACE_INVALID' });
});

test('validateItems: for the same entityId and position, appearance wins over mention regardless of submission order (Ruling B3-1)', async () => {
  const work = await openWork(await copyFixture('serial-2level'));
  const text = '도윤이 문을 두드렸다.';
  const mentionFirst = validateItems(work, text, [
    { entityId: 'doyun', kind: 'mention', quote: '도윤이' },
    { entityId: 'doyun', kind: 'appearance', quote: '도윤이' },
  ]);
  assert.deepEqual(mentionFirst.items.map((i) => [i.entityId, i.kind]), [['doyun', 'appearance']]);
  const appearanceFirst = validateItems(work, text, [
    { entityId: 'doyun', kind: 'appearance', quote: '도윤이' },
    { entityId: 'doyun', kind: 'mention', quote: '도윤이' },
  ]);
  assert.deepEqual(appearanceFirst.items.map((i) => [i.entityId, i.kind]), [['doyun', 'appearance']]);
});

test('validateItems reports sparse array holes as OCCURRENCE_INVALID by index', async () => {
  const work = await openWork(await copyFixture('serial-2level'));
  const out = validateItems(work, '하나는 문을 보았다.', new Array(3));
  assert.deepEqual(out.errors.map((e) => [e.index, e.code]), [[0, 'OCCURRENCE_INVALID'], [1, 'OCCURRENCE_INVALID'], [2, 'OCCURRENCE_INVALID']]);
});

test('status reports the ledger verification (not just stale/total) when the occurrences ledger is tampered', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  const ledger = openLedger(root, OCCURRENCES_LEDGER);
  await writeFile(ledger.path, `${JSON.stringify({ type: 'occurrences', seq: 1, prev: 'genesis', hash: 'x' })}\n`);
  const s = await workStatus(root, { packs: fakePacks() });
  assert.equal(s.occurrences.ledger.ok, false);
  assert.deepEqual([s.occurrences.stale, s.occurrences.total], [[], 0]);
});
