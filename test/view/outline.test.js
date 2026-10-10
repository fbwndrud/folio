import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { viewOutline } from '../../core/view/outline.js';
import { readLedgerView } from '../../core/view/ledgers.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level');
  return root;
}

test('the outline lists nodes in reading order, the entities and a status summary', async () => {
  const root = await serial();
  const view = await viewOutline(root, { packs: fakePacks() });
  assert.equal(view.title, '잠긴 문');
  assert.deepEqual(view.levels, [{ name: 'arc', leaf: false }, { name: 'episode', leaf: true }]);
  assert.deepEqual(view.nodes.map((n) => n.id), ['arc-awakening', 'ep-001', 'ep-002', 'ep-003', 'arc-hunt', 'ep-004', 'ep-005', 'ep-006']);
  assert.deepEqual(view.nodes[1], {
    id: 'ep-001', level: 'episode', kind: 'leaf', role: 'body', status: 'draft', title: '1화',
    parentId: 'arc-awakening', children: [], ordinal: 1, ordered: true, hasBody: true,
  });
  assert.deepEqual(view.nodes[0].children, ['ep-001', 'ep-002', 'ep-003']);
  assert.deepEqual(view.entities, [
    { id: 'doyun', kind: 'character', name: '도윤' }, { id: 'hana', kind: 'character', name: '하나' }, { id: 'locked-door', kind: 'promise', name: '잠긴 문' },
  ]);
  assert.deepEqual(view.features, { viewerToggles: true });
  assert.equal(view.status.ok, true);
  assert.deepEqual(view.status.next, { nodeId: 'ep-001', level: 'episode', kind: 'leaf' });
  assert.deepEqual([view.status.activeRun, view.status.stale, view.status.flagged, view.status.drift], [null, [], [], []]);
});

test('a work whose settings cannot open still shows its outline, with only the status error code', async () => {
  const root = await serial();
  await editYaml(root, (config) => { config.packs = ['nope']; });
  const view = await viewOutline(root, { packs: fakePacks() });
  assert.equal(view.nodes.length, 8);
  assert.deepEqual(view.status, { ok: false, error: { code: 'PACK_UNKNOWN' } });
});

test('a broken ledger is reported, never guessed: no records, only where it broke', async () => {
  const root = await serial();
  const intact = await readLedgerView(root, 'events');
  assert.deepEqual([intact.ledger, intact.records.length], [{ ok: true }, 4]);
  const path = join(root, '.folio', 'ledger', 'events.jsonl');
  await writeFile(path, (await readFile(path, 'utf8')).replace('"ep-002"', '"ep-003"'));
  assert.deepEqual(await readLedgerView(root, 'events'), { records: null, ledger: { ok: false, line: 2 } });
  assert.deepEqual(await readLedgerView(root, 'decisions'), { records: [], ledger: { ok: true } });
});
