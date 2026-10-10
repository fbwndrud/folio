import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents, eventsBefore } from '../../core/ledger/events.js';
import { foldPromise } from '../../core/promise.js';
import { copyFixture, seedEvents } from '../support/fixtures.js';

test('eventsBefore collects earlier events across branches and levels', async () => {
  const root = await copyFixture('novel-3level');
  await seedEvents(root, 'novel-3level');
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const before = eventsBefore({ events, positions: work.positions, nodeId: 'funeral' });
  assert.equal(before.applicable, true);
  assert.deepEqual(before.events.map((e) => `${e.nodeId}:${e.kind}`), [
    'rooftop-scene:promise.resolved', 'post-office:promise.planted', 'last-night:state',
  ]);
  assert.deepEqual(eventsBefore({ events, positions: work.positions, nodeId: 'rooftop-scene' }).events, []);
});

test('eventsBefore is not applicable outside a linear order', async () => {
  const root = await copyFixture('gamebook');
  await seedEvents(root, 'gamebook');
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  assert.deepEqual(eventsBefore({ events, positions: work.positions, nodeId: 'ending-trap' }), { applicable: false, events: [] });
});

test('superseded events drop out', async () => {
  const root = await copyFixture('novel-3level');
  const seeded = await seedEvents(root, 'novel-3level');
  const ledger = openLedger(root, 'events');
  await ledger.append({ type: 'retraction', nodeId: 'last-night', receiptId: 'r9', supersedes: [seeded[2].eventId] });
  assert.deepEqual(activeEvents(await ledger.readAll()).map((e) => e.eventId), [seeded[0].eventId, seeded[1].eventId]);
});

test('foldPromise flags a payoff before the plant', async () => {
  const root = await copyFixture('novel-3level');
  await seedEvents(root, 'novel-3level');
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const ordered = events.filter((e) => e.entityId === 'red-letter')
    .sort((a, b) => work.positions.get(a.nodeId).ordinal - work.positions.get(b.nodeId).ordinal);
  const folded = foldPromise(ordered);
  assert.deepEqual(folded.problems.map((p) => [p.code, p.severity, p.nodeId]), [['PROMISE_RESOLVED_BEFORE_PLANT', 'hard', 'rooftop-scene']]);
  assert.equal(folded.stage, 'planted');
});

test('foldPromise accepts a clean arc and warns on payoff after close', () => {
  const e = (kind, nodeId) => ({ kind: `promise.${kind}`, nodeId, eventId: `${nodeId}-${kind}` });
  assert.deepEqual(foldPromise([e('planted', 'a'), e('advanced', 'b'), e('resolved', 'c')]).problems, []);
  const late = foldPromise([e('planted', 'a'), e('resolved', 'b'), e('closed', 'c'), e('resolved', 'd')]);
  assert.deepEqual(late.problems.map((p) => [p.code, p.severity]), [['PROMISE_RESOLVED_AFTER_CLOSE', 'warning']]);
});
