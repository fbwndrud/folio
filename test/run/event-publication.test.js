import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedEvents } from '../../core/ledger/event-visibility.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { commitNode } from '../../core/run/commit.js';
import { resolvePipeline } from '../../core/pipeline/define.js';
import { findInWork } from '../../server/tools/find.js';
import { copyFixture } from '../support/fixtures.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { fakePack } from '../support/fake-pack.js';

const pipeline = resolvePipeline(fakePack.pipelines.leaf, {});
const event = (eventId) => ({ eventId, entityId: 'junho', kind: 'state', data: { eventId } });

async function setup() {
  const root = await copyFixture('novel-3level');
  const ledgers = Object.fromEntries(['receipts', 'events', 'decisions'].map((name) => [name, openLedger(root, name)]));
  const commit = async (receipt, hooks = {}) => {
    await recordDecisions(ledgers.decisions, receipt);
    return commitNode({ root, work: await openWork(root), ledgers, pipeline, receipt, text: '합성 사건 원고\n', hooks, resume: true });
  };
  const receipt = (id) => makeReceipt({ nodeId: 'stairwell', text: '합성 사건 원고\n', pipeline, receiptId: id, events: [event(id)] });
  return { root, ledgers, commit, receipt };
}

async function visible(ledgers, options = {}) {
  return publishedEvents({ eventRecords: await ledgers.events.readAll(), receiptRecords: await ledgers.receipts.readAll(), ...options });
}

test('prepared events stay hidden from find and both publication modes until final commit', async () => {
  const { root, ledgers, commit, receipt } = await setup();
  const checked = receipt('prepared');
  await assert.rejects(commit(checked, { afterEventsWrite: () => { throw new Error('prepared crash'); } }), /prepared crash/);
  assert.deepEqual((await findInWork(root, { query: 'events', id: 'junho' })).events, []);
  assert.deepEqual(await visible(ledgers, { legacyImports: [], legacyMode: false }), []);
  assert.deepEqual(await visible(ledgers, { legacyMode: true, legacyImports: ['prepared'] }), []);
  await commit(checked);
  assert.deepEqual((await visible(ledgers)).map((e) => e.eventId), ['prepared']);
});

test('recommit publishes cancellation and replacement together after a crash', async () => {
  const { root, ledgers, commit, receipt } = await setup();
  await commit(receipt('old'));
  const replacement = receipt('new');
  await assert.rejects(commit(replacement, { afterEventsWrite: () => { throw new Error('retraction crash'); } }), /retraction crash/);
  assert.deepEqual((await visible(ledgers)).map((e) => e.eventId), ['old']);
  assert.deepEqual((await findInWork(root, { query: 'events', id: 'junho' })).events.map((e) => e.eventId), ['old']);
  await commit(replacement);
  assert.deepEqual((await visible(ledgers)).map((e) => e.eventId), ['new']);
  assert.deepEqual((await findInWork(root, { query: 'events', id: 'junho' })).events.map((e) => e.eventId), ['new']);
});

test('legacy seeds require explicit imports outside the legacy writing path', () => {
  const seed = { type: 'event', nodeId: 'stairwell', ...event('seed') };
  const prepared = { ...seed, eventId: 'prepared', receiptId: 'missing' };
  const input = { eventRecords: [seed, prepared], receiptRecords: [] };
  assert.deepEqual(publishedEvents(input), []);
  assert.deepEqual(publishedEvents({ ...input, legacyMode: true }), [seed]);
  assert.deepEqual(publishedEvents({ ...input, legacyImports: ['seed', 'prepared'] }), [seed]);
});

test('publication refuses mismatched marker hashes, nodes and receipt event payloads', async () => {
  const { ledgers, commit, receipt } = await setup();
  await commit(receipt('bound'));
  const eventRecords = await ledgers.events.readAll();
  const receiptRecords = await ledgers.receipts.readAll();
  const input = { eventRecords, receiptRecords };
  assert.equal(publishedEvents(input).length, 1);
  for (const field of [{ nodeId: 'wrong' }, { committedHash: 'sha256:' + '0'.repeat(64) }, { variant: 'wrong' }]) {
    const changed = receiptRecords.map((r) => r.type === 'commit' ? { ...r, ...field } : r);
    assert.deepEqual(publishedEvents({ ...input, receiptRecords: changed, legacyMode: true, legacyImports: ['bound'] }), []);
  }
  for (const field of [{ nodeId: 'wrong' }, { receiptId: 'wrong' }, { data: { forged: true } }, { supersedes: ['other'] }]) {
    assert.deepEqual(publishedEvents({ ...input, eventRecords: eventRecords.map((r) => ({ ...r, ...field })) }), []);
  }
});

test('next model context, status and recheck retain old events until replacement publication', async () => {
  const { createRunner } = await import('../../core/run/runner.js');
  const { workStatus } = await import('../../core/status.js');
  const { useFakePack, fakePacks } = await import('../support/fixtures.js');
  const { createFakeHost, driveToEnd } = await import('../support/fake-host.js');
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const events = openLedger(root, 'events');
  const receipts = openLedger(root, 'receipts');
  const checked = (id, vital) => makeReceipt({ nodeId: 'rooftop-scene', text: '합성 앞 사건', pipeline, receiptId: id,
    events: [{ eventId: id, entityId: 'junho', kind: 'state', data: { vital } }] });
  const prepare = async (receipt) => {
    await receipts.append({ type: 'receipt', ...receipt });
    await events.append({ type: 'event', receiptId: receipt.receiptId, nodeId: receipt.nodeId, ...receipt.events[0] });
  };
  const publish = (receipt) => receipts.append({ type: 'commit', receiptId: receipt.receiptId, nodeId: receipt.nodeId,
    variant: 'main', committedHash: receipt.draftHash });
  const old = checked('old-context', 'alive');
  await prepare(old); await publish(old);
  const makeRunner = () => createRunner({ root, packs: fakePacks() });
  const host = createFakeHost({ drafts: { stairwell: '준호는 계단참에 있었다.\n' },
    events: { stairwell: { events: [], appearances: ['junho'] } } });
  await driveToEnd(makeRunner, host, { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  assert.deepEqual(host.calls.find((call) => call.stepId === 'critic').payload.priorEvents.map((e) => e.eventId), ['old-context']);
  const baseline = await workStatus(root, { packs: fakePacks() });
  const replacement = checked('new-context', 'dead');
  await prepare(replacement);
  await events.append({ type: 'retraction', receiptId: replacement.receiptId, nodeId: replacement.nodeId, supersedes: ['old-context'] });
  assert.deepEqual((await workStatus(root, { packs: fakePacks() })).stale, baseline.stale);
  const recheckHost = createFakeHost({ events: { stairwell: { events: [], appearances: ['junho'] } } });
  const recheck = await driveToEnd(makeRunner, recheckHost, { start: { node: 'stairwell', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.equal(recheck.at(-1).status, 'done');
  assert.deepEqual(recheckHost.calls.find((call) => call.stepId === 'critic').payload.priorEvents.map((e) => e.eventId), ['old-context']);
  await publish(replacement);
  const changed = await workStatus(root, { packs: fakePacks() });
  assert.ok(changed.stale.some((entry) => entry.nodeId === 'stairwell' && entry.reasons.some((reason) => reason.kind === 'entity' && reason.id === 'junho')));
  const blocked = await driveToEnd(makeRunner, recheckHost, { start: { node: 'stairwell', mode: 'recheck' },
    until: (o) => o.status === 'needs_user' && o.question.kind === 'flagged' });
  assert.equal(blocked.at(-1).question.canApprove, false);
});
