import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents, eventsBefore } from '../../core/ledger/events.js';
import { gatherScope, entityRevAt } from '../../core/scope/scope.js';
import { findStale } from '../../core/scope/stale.js';
import { pickNext } from '../../core/run/next.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { createRunner } from '../../core/run/runner.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

/** 노드 파일 앞머리 맨 앞에 links 를 끼운다(작가가 하는 일). 원본 fixture 는 그대로. */
async function addLinks(root, path, targets) {
  const file = join(root, 'tree', path);
  const lines = targets.map((to) => `  - to: ${to}\n`).join('');
  await writeFile(file, (await readFile(file, 'utf8')).replace(/^---\n/, `---\nlinks:\n${lines}`));
}

/** reference-book 복사본 + 사건 몇 개(합성). features 를 주면 work.yaml 에 적는다. */
async function reference(features) {
  const root = await copyFixture('reference-book');
  if (features) {
    const path = join(root, 'work.yaml');
    await writeFile(path, `${await readFile(path, 'utf8')}features:\n${Object.entries(features).map(([k, v]) => `  ${k}: ${v}\n`).join('')}`);
  }
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  const seeds = [
    { nodeId: 'mitochondria', entityId: 'atp', kind: 'term.defined' }, { nodeId: 'nucleus', entityId: 'atp', kind: 'term.redefined' },
    { nodeId: 'cell', entityId: 'cell-membrane', kind: 'term.defined' }, { nodeId: 'mitochondria', entityId: 'mitochondrion', kind: 'term.defined' },
  ];
  for (const [index, seed] of seeds.entries()) await ledger.append({ type: 'event', eventId: `seed-${index + 1}`, ...seed });
  return { root, work: await openWork(root), events: activeEvents(await ledger.readAll()) };
}

const tag = (e) => `${e.nodeId}:${e.entityId}:${e.kind}`;

test('a none entry gathers the events of the nodes it links to, for its own entities only, apart from priorEvents', async () => {
  const { work, events } = await reference();
  const atp = gatherScope({ work, events, nodeId: 'atp-entry', draftText: 'ATP는 세포막을 지날 때 쓰인다.' });
  assert.deepEqual([atp.ordered, atp.unorderedBy, atp.priorEvents], [false, 'none', []]);
  assert.deepEqual(atp.entityIds, ['atp', 'cell-membrane']);
  assert.deepEqual(atp.linkedNodeIds, ['mitochondria', 'membrane']);
  assert.deepEqual(atp.linkedEvents.map(tag), ['mitochondria:atp:term.defined']);
  const membrane = gatherScope({ work, events, nodeId: 'membrane', draftText: '세포막은 바깥 경계다.' });
  assert.deepEqual([membrane.linkedNodeIds, membrane.linkedEvents.map(tag)], [['cell'], ['cell:cell-membrane:term.defined']]);
  const lonely = gatherScope({ work, events, nodeId: 'nucleus', draftText: 'ATP 이야기는 없다. 세포막도.' });
  assert.deepEqual([lonely.linkedNodeIds, lonely.linkedEvents], [[], []]);
});

test('linkScope off gathers nothing linked and the entity rev is the file and earlier events only', async () => {
  const on = await reference();
  const off = await reference({ linkScope: false });
  const scope = gatherScope({ work: off.work, events: off.events, nodeId: 'atp-entry', draftText: 'ATP.' });
  assert.deepEqual([scope.linkedNodeIds, scope.linkedEvents, scope.unorderedBy], [[], [], 'none']);
  const rev = (w, events) => entityRevAt({ work: w, events, entityId: 'atp', nodeId: 'atp-entry' });
  assert.equal(rev(off.work, off.events), sha256(canonicalJson({ file: off.work.entities.get('atp').rev, events: [] })));
  assert.notEqual(rev(on.work, on.events), rev(off.work, off.events));
  assert.equal(rev(on.work, []), rev(off.work, off.events));
});

test('linear, branching and front/back nodes never gather linked events, even when they link to later nodes', async () => {
  const novel = await copyFixture('novel-3level');
  await seedEvents(novel, 'novel-3level');
  await addLinks(novel, '01-book-one/01-the-fall/01-rooftop.md', ['post-office', 'last-night']);
  const work = await openWork(novel);
  const events = activeEvents(await openLedger(novel, 'events').readAll());
  const first = gatherScope({ work, events, nodeId: 'rooftop-scene', draftText: '붉은 편지를 태웠다. 마라가 웃었다.' });
  assert.deepEqual([first.ordered, first.unorderedBy, first.priorEvents, first.linkedNodeIds, first.linkedEvents], [true, null, [], [], []]);
  const game = await copyFixture('gamebook');
  await seedEvents(game, 'gamebook');
  const gw = await openWork(game);
  const left = gatherScope({ work: gw, events: activeEvents(await openLedger(game, 'events').readAll()), nodeId: 'left-path', draftText: '놋쇠 열쇠' });
  assert.deepEqual([left.unorderedBy, left.linkedNodeIds, left.linkedEvents, left.priorEvents], ['branching', [], [], []]);
  const book = await copyFixture('knowledge-book');
  await addLinks(book, '00-preface.md', ['membranes']);
  const bw = await openWork(book);
  const preface = gatherScope({ work: bw, events: [{ type: 'event', eventId: 'x', seq: 1, nodeId: 'membranes', entityId: 'membrane', kind: 'term.defined' }], nodeId: 'preface', draftText: '세포막' });
  assert.deepEqual([preface.unorderedBy, preface.linkedNodeIds, preface.linkedEvents], ['role', [], []]);
});

/** N4 전 entityRevAt 공식(엔티티 파일 + 앞선 사건). 연결 사건이 없는 노드가 이 값과 같아야 업그레이드만으로 stale 이 되지 않는다. */
const preN4Rev = (work, events, entityId, nodeId) => sha256(canonicalJson({
  file: work.entities.get(entityId)?.rev ?? null,
  events: eventsBefore({ events, positions: work.positions, nodeId }).events.filter((e) => e.entityId === entityId).map((e) => [e.eventId, e.kind, e.data ?? null]),
}));

test('a linear work keeps the same entity revs whether linkScope is on or off, and every rev equals the pre-N4 formula; front/back nodes too; branching with its feature off', async () => {
  const root = await copyFixture('novel-3level');
  await seedEvents(root, 'novel-3level');
  await addLinks(root, '02-book-two/01-after/01-funeral.md', ['last-night']);
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const off = { ...work, config: { ...work.config, features: { ...work.config.features, linkScope: false } } };
  for (const nodeId of ['funeral', 'market', 'rooftop-scene']) {
    for (const entityId of ['mara', 'red-letter', 'junho']) assert.equal(entityRevAt({ work, events, entityId, nodeId }), entityRevAt({ work: off, events, entityId, nodeId }), `${nodeId}/${entityId}`);
  }
  const game = await copyFixture('gamebook');
  await seedEvents(game, 'gamebook');
  const book = await copyFixture('knowledge-book');
  await addLinks(book, '00-preface.md', ['membranes']);
  const bookEvents = [{ type: 'event', eventId: 'x', seq: 1, nodeId: 'membranes', entityId: 'membrane', kind: 'term.defined' }];
  const works = [[work, events], [await openWork(game), activeEvents(await openLedger(game, 'events').readAll())], [await openWork(book), bookEvents]];
  for (const [w, evs] of works) {
    w.config.features.branching = false;
    for (const nodeId of w.tree.nodes.keys()) {
      for (const entityId of w.entities.keys()) assert.equal(entityRevAt({ work: w, events: evs, entityId, nodeId }), preN4Rev(w, evs, entityId, nodeId), `${nodeId}/${entityId}`);
    }
  }
});

test('a folder reorder alone does not mark a committed none entry stale: linked rev material is keyed by event id, not reading position', async () => {
  const { root, work } = await reference();
  await openLedger(root, 'events').append({ type: 'event', eventId: 'memb-atp', receiptId: 'r', nodeId: 'membrane', entityId: 'atp', kind: 'term.used' });
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const node = work.tree.nodes.get('atp-entry');
  const scope = gatherScope({ work, events, nodeId: 'atp-entry', draftText: node.body });
  const atpLinked = (s) => s.linkedEvents.filter((e) => e.entityId === 'atp').map(tag);
  assert.deepEqual(atpLinked(scope), ['membrane:atp:term.used', 'mitochondria:atp:term.defined']);
  const receipts = [
    { type: 'receipt', receiptId: 'rcpt-atp', nodeId: 'atp-entry', variant: 'main', draftHash: sha256(node.body), refs: scope.refs, seq: 1 },
    { type: 'commit', receiptId: 'rcpt-atp', nodeId: 'atp-entry', variant: 'main', committedHash: sha256(node.body), seq: 2 },
  ];
  assert.deepEqual(findStale({ work, receiptRecords: receipts, events }), []);
  await rename(join(root, 'tree', '02-part-energy'), join(root, 'tree', '00-part-energy'));
  const moved = await openWork(root);
  assert.deepEqual(atpLinked(gatherScope({ work: moved, events, nodeId: 'atp-entry', draftText: node.body })), ['mitochondria:atp:term.defined', 'membrane:atp:term.used']);
  assert.deepEqual(findStale({ work: moved, receiptRecords: receipts, events }), []);
});

test('a new event on a linked node marks the committed none entry stale; an event on an unlinked node does not', async () => {
  const { root, work, events } = await reference();
  const node = work.tree.nodes.get('atp-entry');
  const scope = gatherScope({ work, events, nodeId: 'atp-entry', draftText: node.body });
  const receipts = openLedger(root, 'receipts');
  await receipts.append({ type: 'receipt', receiptId: 'rcpt-atp', nodeId: 'atp-entry', variant: 'main', draftHash: sha256(node.body), refs: scope.refs });
  await receipts.append({ type: 'commit', receiptId: 'rcpt-atp', nodeId: 'atp-entry', variant: 'main', committedHash: sha256(node.body) });
  const stale = async () => findStale({ work: await openWork(root), receiptRecords: await receipts.readAll(), events: activeEvents(await openLedger(root, 'events').readAll()) });
  assert.deepEqual(await stale(), []);
  const ledger = openLedger(root, 'events');
  await ledger.append({ type: 'event', eventId: 'far', receiptId: 'r', nodeId: 'cell', entityId: 'atp', kind: 'term.redefined' });
  assert.deepEqual(await stale(), []);
  await ledger.append({ type: 'event', eventId: 'near', receiptId: 'r', nodeId: 'mitochondria', entityId: 'atp', kind: 'term.redefined' });
  const marked = await stale();
  assert.deepEqual(marked.map((s) => [s.nodeId, s.reasons.map((r) => `${r.kind}:${r.id}`)]), [['atp-entry', ['entity:atp']]]);
});

test('run next in a none work stays tree order: the first unfinished node, whatever the links say', async () => {
  const root = await copyFixture('reference-book');
  await addLinks(root, '02-part-energy/02-mitochondria.md', ['nucleus', 'cell']);
  const work = await openWork(root);
  assert.equal(pickNext(work, [], []).id, 'cell');
  const receipts = [{ type: 'receipt', receiptId: 'r1', nodeId: 'cell', seq: 1 }, { type: 'commit', receiptId: 'r1', nodeId: 'cell', committedHash: sha256(work.tree.nodes.get('cell').body), seq: 2 }];
  work.tree.nodes.get('cell').status = 'committed';
  assert.equal(pickNext(work, receipts, []).id, 'membrane');
});

test('model requests of a none entry carry linkedEvents; a linear node\'s requests have no such key', async () => {
  const { root } = await reference();
  await useFakePack(root);
  const host = createFakeHost({ drafts: { 'atp-entry': 'ATP는 미토콘드리아가 만든다.' } });
  const critic = (await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, { start: { node: 'atp-entry' }, until: (o) => label(o) === 'model:critic' })).at(-1);
  assert.deepEqual(critic.requests[0].payload.linkedEvents.map(tag), ['mitochondria:atp:term.defined', 'mitochondria:mitochondrion:term.defined']);
  assert.deepEqual(critic.requests[0].payload.priorEvents, []);
  const novel = await copyFixture('novel-3level');
  await seedEvents(novel, 'novel-3level');
  await useFakePack(novel);
  const linear = (await driveToEnd(() => createRunner({ root: novel, packs: fakePacks() }), createFakeHost(), { start: { node: 'funeral' }, until: (o) => label(o) === 'model:critic' })).at(-1);
  assert.equal(Object.hasOwn(linear.requests[0].payload, 'linkedEvents'), false);
  assert.ok(linear.requests[0].payload.priorEvents.length > 0);
});
