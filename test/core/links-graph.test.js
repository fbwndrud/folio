import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { linkTable, linkedNodeIds, linksFrom, linksTo } from '../../core/links/graph.js';
import { eventsOn } from '../../core/ledger/events.js';
import { fixturePath } from '../support/fixtures.js';

const row = (link) => `${link.from}>${link.to}:${link.kind}:${link.label}:${link.index}:${link.valid}`;

test('the link table lists every link in reading order, with broken and self links as problems', async () => {
  const work = await openWork(fixturePath('reference-book'));
  const table = linkTable(work);
  assert.deepEqual(table.links.map(row), [
    'cell>membrane:see-also:세포막:0:true', 'membrane>cell:see-also:세포:0:true', 'membrane>ghost-entry:see-also:없는 항목:1:false',
    'nucleus>nucleus:see-also:핵:0:true', 'atp-entry>mitochondria:see-also:미토콘드리아:0:true', 'atp-entry>membrane:see-also::1:true',
  ]);
  assert.deepEqual(table.problems, [
    { code: 'LINK_BROKEN', nodeId: 'membrane', to: 'ghost-entry', kind: 'see-also', index: 1 },
    { code: 'LINK_SELF', nodeId: 'nucleus', to: 'nucleus', kind: 'see-also', index: 0 },
  ]);
  assert.deepEqual(table.backlinks.map(row), [
    'membrane>cell:see-also:세포:0:true', 'cell>membrane:see-also:세포막:0:true', 'atp-entry>membrane:see-also::1:true', 'atp-entry>mitochondria:see-also:미토콘드리아:0:true',
  ]);
});

test('a node id narrows the table to that branch; backlinks come from anywhere; unknown ids are NODE_NOT_FOUND', async () => {
  const work = await openWork(fixturePath('reference-book'));
  const energy = linkTable(work, { nodeId: 'part-energy' });
  assert.deepEqual(energy.links.map((l) => `${l.from}>${l.to}`), ['atp-entry>mitochondria', 'atp-entry>membrane']);
  assert.deepEqual(energy.backlinks.map((l) => `${l.from}>${l.to}`), ['atp-entry>mitochondria']);
  assert.deepEqual(energy.problems, []);
  assert.deepEqual(linkTable(work, { nodeId: 'membrane' }).backlinks.map((l) => `${l.from}>${l.to}`), ['cell>membrane', 'atp-entry>membrane']);
  for (const bad of ['nowhere', '*', '__proto__']) assert.throws(() => linkTable(work, { nodeId: bad }), { code: 'NODE_NOT_FOUND' }, bad);
});

test('linksFrom and linksTo give one node\'s outgoing and incoming links; linkedNodeIds keeps real targets once, never itself', async () => {
  const work = await openWork(fixturePath('reference-book'));
  assert.deepEqual(linksFrom(work, 'membrane').map(row), ['membrane>cell:see-also:세포:0:true', 'membrane>ghost-entry:see-also:없는 항목:1:false']);
  assert.deepEqual(linksTo(work, 'membrane').map((l) => l.from), ['cell', 'atp-entry']);
  assert.deepEqual(linksTo(work, 'nucleus'), []);
  assert.deepEqual(linksFrom(work, 'mitochondria'), []);
  assert.throws(() => linksFrom(work, 'ghost-entry'), { code: 'NODE_NOT_FOUND' });
  assert.throws(() => linksTo(work, 'ghost-entry'), { code: 'NODE_NOT_FOUND' });
  assert.deepEqual(linkedNodeIds(work, 'atp-entry'), ['mitochondria', 'membrane']);
  assert.deepEqual(linkedNodeIds(work, 'membrane'), ['cell']);
  assert.deepEqual(linkedNodeIds(work, 'nucleus'), []);
  assert.deepEqual(linkedNodeIds(work, 'ghost-entry'), []);
});

test('positions say why a node is outside the order: none, branching (wins over none) or role', async () => {
  const none = await openWork(fixturePath('reference-book'));
  assert.deepEqual([...none.positions.values()].map((p) => [p.orderMode, p.ordered, p.unorderedBy]).at(1), ['none', false, 'none']);
  assert.ok([...none.positions.values()].every((p) => p.unorderedBy === 'none'));
  const game = await openWork(fixturePath('gamebook'));
  assert.ok([...game.positions.values()].every((p) => p.unorderedBy === 'branching'));
  const book = await openWork(fixturePath('knowledge-book'));
  assert.deepEqual(['preface', 'membranes', 'glossary'].map((id) => book.positions.get(id).unorderedBy), ['role', null, 'role']);
});

test('eventsOn keeps only the given nodes\' events, in reading order then seq, whatever their place', async () => {
  const work = await openWork(fixturePath('reference-book'));
  const events = [
    { eventId: 'a', seq: 3, nodeId: 'mitochondria', entityId: 'atp' }, { eventId: 'b', seq: 1, nodeId: 'cell', entityId: 'cell-membrane' },
    { eventId: 'c', seq: 2, nodeId: 'nucleus', entityId: 'atp' }, { eventId: 'd', seq: 0, nodeId: 'mitochondria', entityId: 'mitochondrion' },
    { eventId: 'e', seq: 4, nodeId: 'gone', entityId: 'atp' },
  ];
  assert.deepEqual(eventsOn({ events, positions: work.positions, nodeIds: ['mitochondria', 'cell', 'gone'] }).map((e) => e.eventId), ['b', 'd', 'a']);
  assert.deepEqual(eventsOn({ events, positions: work.positions, nodeIds: [] }), []);
});
