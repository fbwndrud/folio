import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { gatherScope } from '../../core/scope/scope.js';
import { openWork } from '../../core/store/work.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { occurrenceStates, liveMarks } from '../../core/occurrences/state.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { validateReceipt } from '../../core/ledger/receipts.js';
import { validateRecheck, recheckOfRun } from '../../core/ledger/recheck.js';
import { findStale } from '../../core/scope/stale.js';
import { pendingRechecks } from '../../core/scope/rechecks.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { sha256 } from '../../core/util/hash.js';

const makeRunner = (root) => () => createRunner({ root, packs: fakePacks() });
async function setFeatures(root, features) {
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
}
const marksOf = async (root, work) => liveMarks(occurrenceStates(work, await openLedger(root, OCCURRENCES_LEDGER).readAll()));

/** 최소 유효 영수증(P3): test/core/receipts.test.js 의 유효 영수증 모양을 그대로 쓰고 overrides 를 얹는다. */
function makeReceipt(overrides = {}) {
  const draftHash = sha256('본문');
  return {
    receiptVersion: 1, receiptId: 'rcpt-1', runId: 'run-1', nodeId: 'n1', variant: 'main', level: 'scene',
    draftHash, pipelineDigest: sha256('p'), hard: 0, attempts: 0, refs: [], advisories: [], overridden: [], events: [],
    steps: [
      { id: 'draft', kind: 'generate', status: 'passed' },
      { id: 'facts', kind: 'check', status: 'passed', draftHash, checks: [] },
      { id: 'critic', kind: 'check', status: 'skipped', reason: '초고 속도 우선', source: 'work.yaml#overrides.critic' },
      { id: 'approve', kind: 'gate', status: 'auto', source: 'work.yaml#overrides.approve' },
    ],
    ...overrides,
  };
}

test('marks add entities to the scope: this node when its text is the file text, and upper plans; never remove', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-005' }, items: [{ entityId: 'locked-door', kind: 'mention', quote: '열쇠공을' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'arc-awakening' }, items: [{ entityId: 'doyun', kind: 'mention', quote: '하나가' }] });
  const work = await openWork(root);
  const marks = await marksOf(root, work);
  const body = work.tree.nodes.get('ep-005').body;
  const off = gatherScope({ work, events: [], nodeId: 'ep-005', draftText: body });
  const on = gatherScope({ work, events: [], nodeId: 'ep-005', draftText: body, marks });
  assert.deepEqual(off.entityIds, ['hana']);
  assert.deepEqual(on.entityIds, ['hana', 'locked-door']);
  assert.ok(off.entityIds.every((id) => on.entityIds.includes(id)));
  const otherDraft = gatherScope({ work, events: [], nodeId: 'ep-005', draftText: '다른 원고의 하나', marks });
  assert.deepEqual(otherDraft.entityIds, ['hana']);
  const ep3 = gatherScope({ work, events: [], nodeId: 'ep-003', draftText: '도윤이 왔다.', marks });
  assert.deepEqual(ep3.upperMentions, []);
  const ep6 = gatherScope({ work, events: [], nodeId: 'ep-006', draftText: '도윤이 왔다.', marks });
  assert.deepEqual(ep6.upperMentions, [{ nodeId: 'arc-awakening', entityIds: ['doyun'] }]);
});

test('the receipt records occurrenceScope; toggling it later marks the node stale with a feature reason, and recheck resolves it', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const trail = await driveToEnd(makeRunner(root), createFakeHost(), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  const receipts = await openLedger(root, 'receipts').readAll();
  assert.deepEqual(receipts.find((r) => r.type === 'receipt' && r.receiptId === trail.at(-1).receiptId).features, { occurrenceScope: false });
  await setFeatures(root, { occurrenceScope: true });
  const stale = findStale({ work: await openWork(root), receiptRecords: receipts, events: [] });
  assert.deepEqual(stale.find((s) => s.nodeId === 'ep-001').reasons, [{ kind: 'feature', id: 'occurrenceScope', was: false, now: true }]);
  const pending = pendingRechecks(stale);
  assert.deepEqual(pending.find((p) => p.nodeId === 'ep-001').feature, { id: 'occurrenceScope', was: false, now: true });
  const recheck = await driveToEnd(makeRunner(root), createFakeHost(), { start: { node: 'ep-001', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.equal(recheck.at(-1).mode, 'recheck');
  const after = findStale({ work: await openWork(root), receiptRecords: await openLedger(root, 'receipts').readAll(), events: [] });
  assert.equal(after.find((s) => s.nodeId === 'ep-001'), undefined);
});

test('a receipt with a malformed features field is invalid; an old receipt without it counts as off', () => {
  assert.deepEqual(validateReceipt(makeReceipt({ features: { occurrenceScope: 'yes' } })).map((p) => p.code), ['FEATURES_INVALID']);
  assert.deepEqual(validateReceipt(makeReceipt({ features: null })).map((p) => p.code), ['FEATURES_INVALID']);
  assert.deepEqual(validateReceipt(makeReceipt({ features: { occurrenceScope: true, junk: 1 } })).map((p) => p.code), ['FEATURES_INVALID']);
  assert.deepEqual(validateReceipt(makeReceipt({})).map((p) => p.code), []);
});

test('a recheck record\'s refs include an entity only marked (not in the node text) when occurrenceScope is on', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await driveToEnd(makeRunner(root), createFakeHost(), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  const work0 = await openWork(root);
  const committedText = work0.tree.nodes.get('ep-001').body;
  assert.ok(!committedText.includes('도윤'), 'fixture assumption: doyun\'s name is not in the committed ep-001 text');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'doyun', kind: 'mention', quote: committedText.trim() }] });

  const off = await driveToEnd(makeRunner(root), createFakeHost(), { start: { node: 'ep-001', mode: 'recheck' }, until: (o) => o.status === 'done' });
  const offRecord = recheckOfRun(await openLedger(root, 'receipts').readAll(), off.at(-1).runId);
  assert.ok(!offRecord.refs.some((r) => r.kind === 'entity' && r.id === 'doyun'));

  await setFeatures(root, { occurrenceScope: true });
  const on = await driveToEnd(makeRunner(root), createFakeHost(), { start: { node: 'ep-001', mode: 'recheck' }, until: (o) => o.status === 'done' });
  const onRecord = recheckOfRun(await openLedger(root, 'receipts').readAll(), on.at(-1).runId);
  assert.ok(onRecord.refs.some((r) => r.kind === 'entity' && r.id === 'doyun'));
});

test('an asset-surface live mark widens gatherScope(...).assets', async () => {
  const root = await copyFixture('novel-3level');
  // img-rooftop's own brief.entities are mara/rooftop, not junho — a mark is the only thing that ties it to junho.
  await submitOccurrences(root, { surface: { kind: 'asset', id: 'img-rooftop', field: '/brief/mustShow/0' }, items: [{ entityId: 'junho', kind: 'mention', quote: '마라' }] });
  const work = await openWork(root);
  const marks = await marksOf(root, work);
  const extracted = { events: [], appearances: ['junho'], mentions: [] };
  const off = gatherScope({ work, events: [], nodeId: 'market', draftText: '시장.', extracted });
  assert.ok(!off.assets.some((a) => a.id === 'img-rooftop'));
  const on = gatherScope({ work, events: [], nodeId: 'market', draftText: '시장.', extracted, marks });
  assert.ok(on.assets.some((a) => a.id === 'img-rooftop'));
});

test('validateRecheck reports FEATURES_INVALID via the same shared helper as receipts', () => {
  const draftHash = sha256('본문');
  const record = {
    recheckId: 'rchk-1', runId: 'run-1', nodeId: 'n1', variant: 'main', level: 'scene', receiptId: 'rcpt-1',
    committedHash: draftHash, pipelineDigest: sha256('p'), appliedChecks: [], order: { mode: 'linear', ordered: true },
    steps: [], refs: [], hard: 0, advisories: [], overridden: [], features: { occurrenceScope: 'yes' },
  };
  assert.deepEqual(validateRecheck(record).map((p) => p.code), ['FEATURES_INVALID']);
  assert.deepEqual(validateRecheck({ ...record, features: undefined }).map((p) => p.code), []);
});
