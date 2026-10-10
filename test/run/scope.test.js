import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { gatherScope, entityRevAt } from '../../core/scope/scope.js';
import { findStale } from '../../core/scope/stale.js';
import { sha256 } from '../../core/util/hash.js';
import { computePositions } from '../../core/store/position.js';
import { copyFixture, seedEvents } from '../support/fixtures.js';

async function seeded(name) {
  const root = await copyFixture(name);
  const seeds = await seedEvents(root, name);
  return { root, seeds, work: await openWork(root), events: activeEvents(await openLedger(root, 'events').readAll()) };
}

/** promiseScope(M5)만 끈 작품. 약속 앞 사건이 범위에 끼지 않던 원래 동작을 본다. */
const withoutPromiseScope = (work) => ({ ...work, config: { ...work.config, features: { ...work.config.features, promiseScope: false } } });

test('scope gathers entities, earlier events on any branch, upper plans and assets', async () => {
  const { work: seededWork, events } = await seeded('novel-3level');
  const work = withoutPromiseScope(seededWork);
  const scope = gatherScope({ work, events, nodeId: 'funeral', draftText: work.tree.nodes.get('funeral').body });
  assert.equal(scope.ordered, true);
  assert.deepEqual(scope.entityIds, ['junho', 'mara']);
  assert.deepEqual(scope.priorEvents.map((e) => `${e.nodeId}:${e.entityId}`), ['last-night:mara']);
  assert.deepEqual(scope.upperPlans.map((p) => p.nodeId), ['after', 'book-two']);
  assert.equal(scope.parentPlan, work.tree.nodes.get('after').body);
  assert.deepEqual(scope.upperMentions.map((m) => [m.nodeId, m.entityIds]), [
    ['book-one', ['junho', 'mara']], ['the-fall', ['junho', 'mara']], ['the-letter', ['mara']],
  ]);
  assert.deepEqual(scope.assets.map((a) => a.id), ['img-rooftop']);
  assert.deepEqual(scope.refs.map((r) => `${r.kind}:${r.id}`), ['node:after', 'node:book-two', 'entity:junho', 'entity:mara', 'asset:img-rooftop']);
});

test('promiseScope (M5): earlier promise events join priorEvents only — not entityIds nor refs — and turning it off drops them', async () => {
  const { work, events } = await seeded('novel-3level');
  const draftText = work.tree.nodes.get('funeral').body;
  const on = gatherScope({ work, events, nodeId: 'funeral', draftText });
  const off = gatherScope({ work: withoutPromiseScope(work), events, nodeId: 'funeral', draftText });
  assert.equal(work.config.features.promiseScope, true);
  assert.deepEqual(on.priorEvents.map((e) => `${e.nodeId}:${e.entityId}:${e.kind}`),
    ['rooftop-scene:red-letter:promise.resolved', 'post-office:red-letter:promise.planted', 'last-night:mara:state']);
  assert.deepEqual(off.priorEvents.map((e) => `${e.nodeId}:${e.entityId}`), ['last-night:mara']);
  assert.deepEqual(on.entityIds, off.entityIds);
  assert.deepEqual(on.refs, off.refs);
});

test('extracted events and appearances join the scope', async () => {
  const { work, events } = await seeded('novel-3level');
  const scope = gatherScope({ work: withoutPromiseScope(work), events, nodeId: 'market', draftText: '시장.', extracted: { events: [{ entityId: 'red-letter', kind: 'promise.advanced' }], appearances: ['junho'], mentions: [] } });
  assert.deepEqual(scope.appearances, ['junho']);
  assert.deepEqual(scope.entityIds, ['junho', 'red-letter']);
  assert.deepEqual(scope.priorEvents.map((e) => e.kind), ['promise.resolved', 'promise.planted']);
});

test('off-order nodes gather no earlier events', async () => {
  const { work, events } = await seeded('gamebook');
  const scope = gatherScope({ work, events, nodeId: 'ending-trap', draftText: '놋쇠 열쇠' });
  assert.equal(scope.ordered, false);
  assert.deepEqual(scope.priorEvents, []);
});

test('promiseScope on: an off-order node still gathers no earlier events, promise events included (C0)', async () => {
  const { work, events } = await seeded('novel-3level');
  const config = { ...work.config, order: { ...work.config.order, default: 'none', levels: {} } };
  const unordered = { ...work, config, positions: computePositions(work.tree, config) };
  assert.equal(unordered.config.features.promiseScope, true);
  assert.ok(events.some((e) => e.kind.startsWith('promise.')));
  const scope = gatherScope({ work: unordered, events, nodeId: 'funeral', draftText: work.tree.nodes.get('funeral').body });
  assert.equal(scope.ordered, false);
  assert.deepEqual(scope.priorEvents, []);
});

test('an entity rev at a node changes only when earlier events or the entity file change', async () => {
  const { root, seeds, work, events } = await seeded('novel-3level');
  const at = (evts, w = work) => entityRevAt({ work: w, events: evts, entityId: 'mara', nodeId: 'funeral' });
  const base = at(events);
  const later = [...events, { type: 'event', eventId: 'x', seq: 99, nodeId: 'market', entityId: 'mara', kind: 'state', data: {} }];
  assert.equal(at(later), base);
  const ledger = openLedger(root, 'events');
  await ledger.append({ type: 'retraction', receiptId: 'r', nodeId: 'last-night', supersedes: [seeds[2].eventId] });
  assert.notEqual(at(activeEvents(await ledger.readAll())), base);
  const path = join(root, 'entities/character/mara.md');
  await writeFile(path, `${await readFile(path, 'utf8')}설정 추가.\n`);
  assert.notEqual(at(events, await openWork(root)), base);
});

async function commitWithScope(root, nodeId) {
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const node = work.tree.nodes.get(nodeId);
  const scope = gatherScope({ work, events, nodeId, draftText: node.body });
  const receipts = openLedger(root, 'receipts');
  const receiptId = `rcpt-${nodeId}`;
  await receipts.append({ type: 'receipt', receiptId, nodeId, variant: 'main', draftHash: sha256(node.body), refs: scope.refs });
  await receipts.append({ type: 'commit', receiptId, nodeId, variant: 'main', committedHash: sha256(node.body) });
  return receipts;
}

test('changing an earlier event marks later users of that entity stale, and nobody else', async () => {
  const { root, seeds } = await seeded('novel-3level');
  for (const id of ['stairwell', 'funeral', 'market']) await commitWithScope(root, id);
  const read = async () => findStale({
    work: await openWork(root),
    receiptRecords: await openLedger(root, 'receipts').readAll(),
    events: activeEvents(await openLedger(root, 'events').readAll()),
  });
  assert.deepEqual(await read(), []);
  await openLedger(root, 'events').append({ type: 'retraction', receiptId: 'r', nodeId: 'last-night', supersedes: [seeds[2].eventId] });
  const stale = await read();
  assert.deepEqual(stale.map((s) => s.nodeId), ['funeral']);
  assert.deepEqual(stale[0].reasons.map((r) => `${r.kind}:${r.id}`), ['entity:mara']);
});

test('changing an upper plan marks its children stale', async () => {
  const { root } = await seeded('novel-3level');
  await commitWithScope(root, 'market');
  const path = join(root, 'tree/02-book-two/01-after/_node.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('장례 뒤의 나날.', '장례 뒤, 이사.'));
  const stale = findStale({ work: await openWork(root), receiptRecords: await openLedger(root, 'receipts').readAll(), events: [] });
  assert.deepEqual(stale.map((s) => [s.nodeId, s.reasons.map((r) => `${r.kind}:${r.id}`)]), [['market', ['node:after']]]);
});
