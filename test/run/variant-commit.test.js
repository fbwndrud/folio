import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { lastCommits } from '../../core/ledger/receipts.js';
import { detectDrift } from '../../core/store/drift.js';
import { commitNode } from '../../core/run/commit.js';
import { buildReceipt } from '../../core/run/receipt-builder.js';
import { scopeFor } from '../../core/run/payload.js';
import { originalOf } from '../../core/variants/original.js';
import { fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { EN, commitMain, patchWork, variantWork } from '../support/variant-work.js';

const ORIGINAL = '하나는 지하실 끝에서 잠긴 문을 발견했다.\n';
const ENGLISH = 'Hana found the locked door at the end of the cellar.\n';
const FRENCH = 'Hana trouva la porte verrouillée au fond de la cave.\n';
const MAIN_FILE = ['tree', '01-arc-awakening', '01-ep-001.md'];
const runner = (root) => createRunner({ root, packs: fakePacks() });
const host = () => createFakeHost({ drafts: { '*': (p) => (p.variant?.id === 'fr' ? FRENCH : p.variant ? ENGLISH : ORIGINAL) } });
const EVENT = { events: [{ entityId: 'hana', kind: 'state', data: { found: 'door' }, quote: '잠긴 문을 발견했다' }] };

async function committed(variants = [EN]) {
  const root = await variantWork({ variants });
  await commitMain(root, 'ep-001', ORIGINAL, fakePacks(), EVENT);
  return root;
}
const commitVariant = (root, variant) => driveToEnd(() => runner(root), host(), { start: { node: 'ep-001', variant }, until: (o) => o.status === 'done' });
const ledgers = (root) => ({ receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') });

async function interruptedVariant() {
  const root = await committed([EN, { id: 'fr', kind: 'translation', lang: 'fr' }]);
  await assert.rejects(driveToEnd(() => createRunner({ root, packs: fakePacks(), hooks: { afterBodyWrite() { throw new Error('interrupted'); } } }), host(),
    { start: { node: 'ep-001', variant: 'en' }, until: (o) => o.status === 'done' }), /interrupted/);
  const store = createRunStore(root);
  const run = (await store.list()).find((r) => r.variant === 'en');
  return { root, store, run, ledgers: ledgers(root) };
}

async function recordedState(root) {
  return Object.fromEntries(await Promise.all(['receipts', 'events', 'occurrences', 'evidence'].map(async (name) => [name, await openLedger(root, name).readAll()])));
}

async function approvedUnrecorded() {
  const root = await committed([EN, { id: 'fr', kind: 'translation', lang: 'fr' }]);
  const interrupted = () => createRunner({ root, packs: fakePacks(), hooks: {
    afterDecision(record) { if (record.type === 'approval' && record.action === 'approve') throw new Error('before receipt'); },
  } });
  await assert.rejects(driveToEnd(interrupted, host(), { start: { node: 'ep-001', variant: 'en' }, until: (o) => o.status === 'done' }), /before receipt/);
  const store = createRunStore(root);
  const run = (await store.list()).find((r) => r.variant === 'en');
  const ctx = { ...await openWorkspace(root, { packs: fakePacks() }), receiptRecords: await openLedger(root, 'receipts').readAll() };
  const pipeline = ctx.pipelines.variants.en;
  run.results.approve = { status: 'approved' };
  const receipt = buildReceipt({ run, steps: pipeline.steps, work: ctx.work, refs: scopeFor(ctx, run).refs,
    original: originalOf(ctx, run.nodeId).original, newId: () => 'rcpt-unrecorded', checks: ctx.checks, pipeline });
  assert.equal((await openLedger(root, 'receipts').readAll()).some((r) => r.runId === run.runId), false);
  return { root, store, run, ctx, receipt, ledgers: ledgers(root) };
}

test('a variant commit writes only its text and receipt, binds the original, and leaves main records alone', async () => {
  const root = await committed();
  const mainBefore = await readFile(join(root, ...MAIN_FILE), 'utf8');
  const eventsBefore = activeEvents(await openLedger(root, 'events').readAll()).map((e) => e.eventId);
  const occurrencesBefore = await openLedger(root, 'occurrences').readAll();
  const evidenceBefore = await openLedger(root, 'evidence').readAll();
  const trail = await commitVariant(root, 'en');
  assert.deepEqual([trail.at(-1).status, trail.at(-1).variant], ['done', 'en']);
  assert.equal(await readFile(join(root, 'variants', 'en', 'ep-001.md'), 'utf8'), ENGLISH);
  assert.equal(await readFile(join(root, ...MAIN_FILE), 'utf8'), mainBefore);
  assert.deepEqual(activeEvents(await openLedger(root, 'events').readAll()).map((e) => e.eventId), eventsBefore, 'no retraction of the original events');
  assert.deepEqual(await openLedger(root, 'occurrences').readAll(), occurrencesBefore);
  assert.deepEqual(await openLedger(root, 'evidence').readAll(), evidenceBefore);
  const records = await openLedger(root, 'receipts').readAll();
  const main = lastCommits(records).get('ep-001');
  const en = lastCommits(records, 'en').get('ep-001');
  const receipt = records.find((r) => r.type === 'receipt' && r.receiptId === en.receiptId);
  assert.deepEqual([receipt.variant, receipt.original, receipt.events, receipt.structure], ['en', { receiptId: main.receiptId, committedHash: main.committedHash }, [], undefined]);
  assert.deepEqual(receipt.refs.map((r) => [r.kind, r.id, r.rev]), [['original', 'ep-001', main.committedHash], ['terms', 'en', null]]);
  assert.deepEqual(receipt.steps.map((s) => [s.id, s.status]), [['draft', 'passed'], ['variant-checks', 'not_applicable'], ['variant-review', 'not_applicable'], ['revise', 'not_needed'], ['approve', 'approved']]);
  const { work } = await openWorkspace(root, { packs: fakePacks() });
  assert.deepEqual(detectDrift(work, records), [], 'the original is still its own last commit');
});

/** 기록장에 든 영수증 하나(기록장 필드를 뺀 본문). */
async function recorded(root, variant) {
  const records = await openLedger(root, 'receipts').readAll();
  const commit = lastCommits(records, variant).get('ep-001');
  const { type: _t, seq: _s, at: _a, prev: _p, hash: _h, ...body } = records.find((r) => r.type === 'receipt' && r.receiptId === commit.receiptId);
  return body;
}

test('attack: a receipt of one variant cannot commit another variant or the original, in any combination', async () => {
  const root = await committed([EN, { id: 'fr', kind: 'translation', lang: 'fr' }]);
  await commitVariant(root, 'en');
  const ctx = await openWorkspace(root, { packs: fakePacks() });
  const en = await recorded(root, 'en');
  const main = await recorded(root, 'main');
  const before = { main: await readFile(join(root, ...MAIN_FILE), 'utf8') };
  const commit = (pipeline, receipt, text) => commitNode({ root, work: ctx.work, ledgers: ledgers(root), pipeline, receipt, text, resume: true });
  await assert.rejects(commit(ctx.pipelines.variants.fr, en, ENGLISH), { code: 'LOCK_PIPELINE_MISMATCH' }, 'en receipt → fr pipeline');
  await assert.rejects(commit(ctx.pipelines.byLevel.episode, en, ENGLISH), { code: 'LOCK_PIPELINE_MISMATCH' }, 'en receipt → main pipeline');
  await assert.rejects(commit(ctx.pipelines.variants.en, main, ORIGINAL), { code: 'LOCK_PIPELINE_MISMATCH' }, 'main receipt → en pipeline');
  await assert.rejects(commit(ctx.pipelines.variants.en, { ...main, variant: 'en', pipelineDigest: ctx.pipelines.variants.en.digest }, ORIGINAL), { code: 'LOCK_RECEIPT_INVALID' }, 'main receipt relabelled en has no original');
  const relabelled = { ...en, variant: 'fr', pipelineDigest: ctx.pipelines.variants.fr.digest };
  await assert.rejects(commit(ctx.pipelines.variants.fr, relabelled, ENGLISH), { code: 'LOCK_RECEIPT_MISMATCH' }, 'en receipt relabelled as fr');
  const forged = { ...en, receiptId: 'rcpt-forged', variant: 'fr', pipelineDigest: ctx.pipelines.variants.fr.digest };
  await assert.rejects(commit(ctx.pipelines.variants.fr, forged, ENGLISH), { code: 'LOCK_RUN_ALREADY_COMMITTED' }, 'a fresh receipt id on the same run');
  await assert.rejects(commit(ctx.pipelines.variants.fr, { ...forged, runId: 'run-forged',
    refs: forged.refs.map((r) => r.kind === 'terms' ? { ...r, id: 'fr' } : r) }, ENGLISH),
  { code: 'LOCK_DECISION_MISMATCH' }, 'a fresh run id has no decisions');
  for (const variant of ['de', '../en', 'EN', 7]) {
    await assert.rejects(commit(ctx.pipelines.variants.en, { ...en, receiptId: `rcpt-${variant}`, variant }, ENGLISH), { code: 'LOCK_RECEIPT_INVALID' }, `variant key ${variant}`);
  }
  assert.equal(await readFile(join(root, ...MAIN_FILE), 'utf8'), before.main);
  assert.deepEqual([...lastCommits(await openLedger(root, 'receipts').readAll(), 'fr').keys()], []);
  assert.equal((await commitVariant(root, 'fr')).at(-1).status, 'done', 'a genuine fr run still commits');
  assert.equal(await readFile(join(root, 'variants', 'fr', 'ep-001.md'), 'utf8'), FRENCH);
});

test('attack: a variant receipt checked against an older original cannot commit after the original moved (LOCK_ORIGINAL_CHANGED)', async () => {
  const root = await committed();
  await commitVariant(root, 'en');
  const en = await recorded(root, 'en');
  const ctx = await openWorkspace(root, { packs: fakePacks() });
  const stale = { ...en, original: { ...en.original, committedHash: `sha256:${'0'.repeat(64)}` } };
  await assert.rejects(commitNode({ root, work: ctx.work, ledgers: ledgers(root), pipeline: ctx.pipelines.variants.en, receipt: stale, text: ENGLISH }), { code: 'LOCK_ORIGINAL_CHANGED' });
});

test('commit records stay per variant: a later variant commit does not supersede a recorded original receipt, and the original keeps its own history', async () => {
  const root = await committed();
  await commitVariant(root, 'en');
  const records = await openLedger(root, 'receipts').readAll();
  assert.deepEqual(records.filter((r) => r.type === 'commit').map((r) => r.variant), ['main', 'en']);
  const main = await recorded(root, 'main');
  const ctx = await openWorkspace(root, { packs: fakePacks() });
  const again = await commitNode({ root, work: ctx.work, ledgers: ledgers(root), pipeline: ctx.pipelines.byLevel.episode, receipt: main, text: ORIGINAL, resume: true });
  assert.equal(again.alreadyCommitted, true, 'resuming the original commit is still idempotent, not superseded by the en commit');
});

test('attack: relabelling an open translation run file as main stops at the text guard before anything is written to the original', async () => {
  const root = await committed();
  const first = await runner(root).run({ node: 'ep-001', variant: 'en' });
  const answered = await runner(root).resume({ runId: first.runId, answers: host().answer(first) });
  assert.equal(answered.question.kind, 'approve');
  const store = createRunStore(root);
  const run = await store.load(first.runId);
  await store.save({ ...run, variant: 'main' });
  const host2 = host();
  const trail = await driveToEnd(() => runner(root), host2, { from: await runner(root).run({ node: 'ep-001' }), until: (o) => o.status === 'needs_user' && o.question.kind === 'blocked' });
  assert.equal(trail.at(-1).question.code, 'NODE_TEXT_CHANGED');
  assert.equal(await readFile(join(root, ...MAIN_FILE), 'utf8').then((t) => t.includes(ENGLISH)), false);
});

test('attack: an interrupted en receipt cannot use a fresh id to commit fr, even with variants off', async () => {
  const { root, run, ledgers: books } = await interruptedVariant();
  await patchWork(root, { features: { variants: false } });
  const ctx = await openWorkspace(root, { packs: fakePacks() });
  const before = await recordedState(root);
  const mainBefore = await readFile(join(root, ...MAIN_FILE), 'utf8');
  const changed = { ...run.receipt, receiptId: 'rcpt-fresh-fr', variant: 'fr', pipelineDigest: ctx.pipelines.variants.fr.digest };
  await assert.rejects(commitNode({ root, work: ctx.work, ledgers: books, pipeline: ctx.pipelines.variants.fr,
    receipt: changed, text: ENGLISH, resume: true }), { code: 'LOCK_RECEIPT_MISMATCH' });
  assert.deepEqual(await recordedState(root), before);
  assert.equal(await readFile(join(root, ...MAIN_FILE), 'utf8'), mainBefore);
  await assert.rejects(readFile(join(root, 'variants', 'fr', 'ep-001.md'), 'utf8'), { code: 'ENOENT' });
});

test('attack: an interrupted receipt cannot rebind to a later original, including same-text recommits and forged refs', async () => {
  for (const newText of ['하나는 옥상에서 열린 문을 발견했다.\n', ORIGINAL]) {
    const { root, store, run, ledgers: books } = await interruptedVariant();
    await store.save({ ...run, state: 'done' });
    await commitMain(root, 'ep-001', newText);
    const ctx = await openWorkspace(root, { packs: fakePacks() });
    const latest = lastCommits(await books.receipts.readAll()).get('ep-001');
    assert.notEqual(latest.receiptId, run.receipt.original.receiptId);
    const before = await recordedState(root);
    const mainBefore = await readFile(join(root, ...MAIN_FILE), 'utf8');
    await assert.rejects(commitNode({ root, work: ctx.work, ledgers: books, pipeline: ctx.pipelines.variants.en,
      receipt: run.receipt, text: ENGLISH, resume: true }), { code: 'LOCK_ORIGINAL_CHANGED' });
    const base = { ...run.receipt, receiptId: `rcpt-fresh-${latest.receiptId}`,
      original: { receiptId: latest.receiptId, committedHash: latest.committedHash } };
    for (const receipt of [base, { ...base, refs: base.refs.map((r) => r.kind === 'original' ? { ...r, rev: latest.committedHash } : r) }]) {
      await assert.rejects(commitNode({ root, work: ctx.work, ledgers: books, pipeline: ctx.pipelines.variants.en,
        receipt, text: ENGLISH, resume: true }), { code: 'LOCK_RECEIPT_MISMATCH' });
      assert.deepEqual(await recordedState(root), before);
      assert.equal(await readFile(join(root, ...MAIN_FILE), 'utf8'), mainBefore);
    }
  }
});

test('first unrecorded receipt binds the checked variant; a real en receipt still commits', async () => {
  const { root, ctx, receipt, ledgers: books } = await approvedUnrecorded();
  const before = await recordedState(root);
  const changed = { ...receipt, variant: 'fr', pipelineDigest: ctx.pipelines.variants.fr.digest,
    refs: receipt.refs.map((r) => r.kind === 'terms' ? { ...r, id: 'fr' } : r) };
  await assert.rejects(commitNode({ root, work: ctx.work, ledgers: books, pipeline: ctx.pipelines.variants.fr,
    receipt: changed, text: ENGLISH }), { code: 'LOCK_DECISION_MISMATCH' });
  assert.deepEqual(await recordedState(root), before);
  await assert.rejects(readFile(join(root, 'variants', 'fr', 'ep-001.md'), 'utf8'), { code: 'ENOENT' });
  const result = await commitNode({ root, work: ctx.work, ledgers: books, pipeline: ctx.pipelines.variants.en,
    receipt, text: ENGLISH });
  assert.equal(result.receiptId, receipt.receiptId);
});

test('first unrecorded receipt cannot rebind original receiptId or forge checked original refs', async () => {
  for (const newText of [ORIGINAL, '하나는 옥상에서 열린 문을 발견했다.\n']) {
    const { root, store, run, receipt, ledgers: books } = await approvedUnrecorded();
    await store.save({ ...run, state: 'done' });
    await commitMain(root, 'ep-001', newText);
    const ctx = await openWorkspace(root, { packs: fakePacks() });
    const latest = lastCommits(await books.receipts.readAll()).get('ep-001');
    assert.notEqual(latest.receiptId, receipt.original.receiptId);
    const before = await recordedState(root);
    const forged = { ...receipt, original: { receiptId: latest.receiptId, committedHash: latest.committedHash },
      refs: receipt.refs.map((r) => r.kind === 'original' ? { ...r, rev: latest.committedHash } : r) };
    await assert.rejects(commitNode({ root, work: ctx.work, ledgers: books, pipeline: ctx.pipelines.variants.en,
      receipt: forged, text: ENGLISH }), { code: 'LOCK_DECISION_MISMATCH' });
    assert.deepEqual(await recordedState(root), before);
    await assert.rejects(readFile(join(root, 'variants', 'en', 'ep-001.md'), 'utf8'), { code: 'ENOENT' });
  }
});
