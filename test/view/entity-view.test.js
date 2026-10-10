import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { viewEntity } from '../../core/view/entity-view.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { copyFixture, seedEvents } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

async function serial() {
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  return root;
}

test('an entity: definition, usages in reading order with recorded marks, and its event history', async () => {
  const root = await serial();
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  const view = await viewEntity(root, 'hana');
  assert.deepEqual(view.entity, { id: 'hana', kind: 'character', name: '하나', aliases: [], data: { id: 'hana', kind: 'character', name: '하나' }, body: '' });
  assert.deepEqual(view.usages.map((u) => [u.kind, u.id, u.count, u.declared, u.title]), [
    ['node', 'arc-awakening', 1, false, '각성'], ['node', 'ep-001', 1, false, '1화'], ['node', 'ep-003', 1, false, '3화'],
    ['node', 'arc-hunt', 1, false, '추적'], ['node', 'ep-005', 1, false, '5화'],
  ]);
  assert.deepEqual(view.usages[1].marks, [{ field: '', kind: 'appearance', quote: '하나는', status: 'located', start: 0, reason: null }]);
  assert.deepEqual(view.events, []);
  assert.deepEqual(view.ledgers, { events: { ok: true }, occurrences: { ok: true } });
  assert.equal(view.promise, null);
  const doyun = await viewEntity(root, 'doyun');
  assert.deepEqual(doyun.events, [{ eventId: 'seed-2', nodeId: 'ep-002', nodeTitle: '2화', kind: 'state', data: { vital: 'dead' }, ordered: true }]);
  await assert.rejects(viewEntity(root, 'nobody'), { code: 'ENTITY_NOT_FOUND' });
});

test('a promise shows its stage history in reading order', async () => {
  const root = await serial();
  const view = await viewEntity(root, 'locked-door');
  assert.deepEqual(view.events.map((e) => [e.nodeId, e.kind]), [['ep-001', 'promise.planted'], ['ep-003', 'promise.advanced'], ['ep-006', 'promise.resolved']]);
  assert.equal(view.promise.stage, 'resolved');
  assert.deepEqual(view.promise.history.map((h) => [h.stage, h.nodeId]), [['planted', 'ep-001'], ['advanced', 'ep-003'], ['resolved', 'ep-006']]);
});

test('pictures and other surfaces are listed after nodes; broken ledgers and a turned-off feature are not guessed', async () => {
  const root = await copyFixture('novel-3level');
  const view = await viewEntity(root, 'mara');
  const kinds = view.usages.map((u) => `${u.kind}:${u.id}`);
  assert.deepEqual(kinds.filter((k) => !k.startsWith('node:')), ['entity:junho', 'asset:img-rooftop']);
  assert.deepEqual(view.assets, [{ id: 'img-rooftop', known: true, hasFile: true, entities: ['mara', 'rooftop'] }]);
  await seedEvents(root, 'novel-3level');
  const path = join(root, '.folio', 'ledger', 'events.jsonl');
  await writeFile(path, (await readFile(path, 'utf8')).replace('"last-night"', '"post-office"'));
  const broken = await viewEntity(root, 'mara');
  assert.deepEqual([broken.events, broken.ledgers.events], [null, { ok: false, line: 3 }]);
  await editYaml(root, (config) => { config.features = { occurrences: false }; });
  const off = await viewEntity(root, 'mara');
  assert.deepEqual([off.ledgers.occurrences, off.usages.every((u) => u.marks.length === 0)], [null, true]);
});
