import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../../core/util/hash.js';
import { validateReceipt, lastCommits } from '../../core/ledger/receipts.js';
import { validateRecheck } from '../../core/ledger/recheck.js';
import { latestRecheck } from '../../core/scope/stale-checks.js';
import { recordedReceiptOf } from '../../core/run/steps/common.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { MAIN, variantOf } from '../../core/variants/model.js';

const hash = (text) => sha256(text);
const commit = (nodeId, variant, receiptId, text, seq) => ({ type: 'commit', receiptId, nodeId, ...(variant ? { variant } : {}), committedHash: hash(text), seq });
const variantReceipt = () => ({
  receiptVersion: 1, receiptId: 'rcpt-en', runId: 'run-en', nodeId: 'n1', variant: 'en', level: 'scene',
  draftHash: hash('Mara waited.'), pipelineDigest: hash('p'), hard: 0, attempts: 0, refs: [], advisories: [], overridden: [], events: [],
  original: { receiptId: 'rcpt-main', committedHash: hash('마라는 기다렸다.') },
  steps: [{ id: 'draft', kind: 'generate', status: 'passed' }, { id: 'approve', kind: 'gate', status: 'auto' }],
});

test('a record without a variant key reads as main (records written before N6)', () => {
  assert.equal(variantOf({ type: 'commit' }), MAIN);
  assert.equal(variantOf({ type: 'commit', variant: 'en' }), 'en');
  assert.equal(variantOf(undefined), MAIN);
});

test('lastCommits sees one variant only: a later translation commit never hides or replaces the original commit', () => {
  const records = [commit('n1', null, 'rcpt-main', '마라는 기다렸다.', 1), commit('n1', 'en', 'rcpt-en', 'Mara waited.', 2), commit('n2', 'main', 'rcpt-2', '둘', 3)];
  assert.deepEqual([...lastCommits(records).entries()].map(([id, c]) => [id, c.receiptId]), [['n1', 'rcpt-main'], ['n2', 'rcpt-2']]);
  assert.deepEqual([...lastCommits(records, 'en').entries()].map(([id, c]) => [id, c.receiptId]), [['n1', 'rcpt-en']]);
  assert.deepEqual([...lastCommits(records, 'fr').keys()], []);
});

test('validateReceipt takes only declared variants; without a list only main (a forged variant key cannot pass the format lock)', () => {
  const codes = (receipt, options) => validateReceipt(receipt, options).map((p) => p.code);
  assert.deepEqual(codes(variantReceipt()), ['VARIANT_UNSUPPORTED']);
  assert.deepEqual(codes(variantReceipt(), { variants: ['main', 'en'] }), []);
  for (const forged of ['fr', 'EN', '../en', '__proto__', '', 5, null]) {
    assert.deepEqual(codes({ ...variantReceipt(), variant: forged }, { variants: ['main', 'en'] }), ['VARIANT_UNSUPPORTED'], String(forged));
  }
  const { variant: _v, ...missing } = variantReceipt();
  assert.deepEqual(codes(missing, { variants: ['main', 'en'] }), ['VARIANT_UNSUPPORTED'], 'a new receipt must carry its variant');
});

test('a variant receipt carries the original it was checked against and no events or structure; a main receipt carries no original', () => {
  const codes = (patch) => validateReceipt({ ...variantReceipt(), ...patch }, { variants: ['main', 'en'] }).map((p) => p.code);
  assert.deepEqual(codes({ original: undefined }), ['ORIGINAL_MISSING']);
  assert.deepEqual(codes({ original: { receiptId: 'r', committedHash: 'abc' } }), ['ORIGINAL_INVALID']);
  assert.deepEqual(codes({ original: { receiptId: 'r', committedHash: hash('x'), extra: 1 } }), ['ORIGINAL_INVALID']);
  assert.deepEqual(codes({ events: [{ entityId: 'mara', kind: 'state' }] }), ['VARIANT_EVENTS_FORBIDDEN']);
  assert.deepEqual(codes({ events: undefined }), ['VARIANT_EVENTS_FORBIDDEN']);
  assert.deepEqual(codes({ structure: { children: [] } }), ['VARIANT_STRUCTURE_FORBIDDEN']);
  assert.deepEqual(codes({ variant: 'main' }), ['ORIGINAL_ON_MAIN']);
});

test('variant rechecks stay unsupported (N6 runs no variant recheck), and a recheck of another variant never resets a main commit', () => {
  assert.deepEqual(validateRecheck({ variant: 'en' }).map((p) => p.code).filter((c) => c === 'VARIANT_UNSUPPORTED'), ['VARIANT_UNSUPPORTED']);
  const main = commit('n1', null, 'rcpt-main', '본문', 1);
  const records = [main, { type: 'recheck', nodeId: 'n1', variant: 'en', committedHash: main.committedHash, seq: 2 }];
  assert.equal(latestRecheck(records, main), null);
  const own = { type: 'recheck', nodeId: 'n1', committedHash: main.committedHash, seq: 3 };
  assert.equal(latestRecheck([...records, own], main), own, 'an old recheck without a variant key is main');
});

test('recordedReceiptOf needs the same variant: a run cannot adopt a recorded receipt of another variant as its own', () => {
  const run = { runId: 'run-1', nodeId: 'n1', variant: 'en', receipt: { receiptId: 'rcpt-1' } };
  const records = [{ type: 'receipt', receiptId: 'rcpt-1', runId: 'run-1', nodeId: 'n1', variant: 'main' }];
  assert.equal(recordedReceiptOf(records, run), null);
  assert.equal(recordedReceiptOf(records, { ...run, variant: undefined }), records[0], 'an old run file without a variant key is main');
});

test('work.yaml variants: main is implicit and first, other variants are maps with a kind', () => {
  const levels = [{ name: 'scene', leaf: true }];
  const read = (variants) => validateWorkConfig({ levels, variants });
  assert.deepEqual([read(undefined).config.variants, read(['main']).config.variants], [['main'], ['main']]);
  const ok = read(['main', { id: 'en', kind: 'translation', lang: 'en' }, { id: 'short', kind: 'summary', steps: { approve: { mode: 'auto' } } }]);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.config.variants, ['main', 'en', 'short']);
  assert.deepEqual(ok.config.variantSpecs.en, { id: 'en', kind: 'translation', lang: 'en', steps: {} });
  assert.deepEqual(ok.config.variantSpecs.short.steps, { approve: { mode: 'auto' } });
  const codes = (variants) => read(variants).errors.map((e) => e.code);
  assert.deepEqual(codes(['main', 'en']), ['VARIANT_UNSUPPORTED']);
  assert.deepEqual(codes('main'), ['VARIANTS_INVALID']);
  assert.deepEqual(codes([{ id: 'main', kind: 'translation' }]), ['VARIANT_ID_INVALID']);
  assert.deepEqual(codes([{ id: 'En', kind: 'translation' }]), ['VARIANT_ID_INVALID']);
  assert.deepEqual(codes([{ id: 'en', kind: 'translation' }, { id: 'en', kind: 'summary' }]), ['VARIANT_DUPLICATE']);
  assert.deepEqual(codes([{ id: 'en', kind: 'poem' }]), ['VARIANT_KIND_INVALID']);
  assert.deepEqual(codes([{ id: 'en', kind: 'translation', lang: 3 }]), ['VARIANT_LANG_INVALID']);
  assert.deepEqual(codes([{ id: 'en', kind: 'translation', steps: [] }]), ['VARIANT_STEPS_INVALID']);
  assert.deepEqual(codes([{ id: 'en', kind: 'translation', from: 'main' }]), ['VARIANT_FIELD_UNKNOWN']);
});
