import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { recordRunOccurrences } from '../../core/occurrences/record-run.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture } from '../support/fixtures.js';

async function ctxWith(root, features) {
  const work = await openWork(root);
  return { work: { ...work, config: { ...work.config, features: { ...work.config.features, ...features } } } };
}

function runFor(text, occurrences) {
  return {
    runId: 'run-1', nodeId: 'ep-001', draftHash: sha256(text),
    outputs: { draft: text, events: { submittedOccurrences: true, occurrences } },
  };
}

test('recordRunOccurrences needs occurrencesInExtract too (origin extract implies it); a forged submittedOccurrences under the toggle off records nothing (Ruling B3-2)', async () => {
  const root = await copyFixture('serial-2level');
  const ledger = openLedger(root, OCCURRENCES_LEDGER);
  const ctx = await ctxWith(root, { occurrences: true, occurrencesInExtract: false });
  const text = '하나는 문 앞에 섰다.';
  const run = runFor(text, [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }]);
  const result = await recordRunOccurrences({ ledger, ctx, run, receiptId: 'r1' });
  assert.equal(result, null);
  assert.deepEqual(await ledger.readAll(), []);
});

test('recordRunOccurrences records nothing when features.occurrences itself is off, even with occurrencesInExtract forged on', async () => {
  const root = await copyFixture('serial-2level');
  const ledger = openLedger(root, OCCURRENCES_LEDGER);
  const ctx = await ctxWith(root, { occurrences: false, occurrencesInExtract: true });
  const text = '하나는 문 앞에 섰다.';
  const run = runFor(text, [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }]);
  assert.equal(await recordRunOccurrences({ ledger, ctx, run, receiptId: 'r1' }), null);
  assert.deepEqual(await ledger.readAll(), []);
});

test('recordRunOccurrences throws OCCURRENCES_INVALID (not a silent null) on a hash mismatch or on items that fail re-validation', async () => {
  const root = await copyFixture('serial-2level');
  const ledger = openLedger(root, OCCURRENCES_LEDGER);
  const ctx = await ctxWith(root, { occurrences: true, occurrencesInExtract: true });
  const text = '하나는 문 앞에 섰다.';
  const badHash = runFor(text, [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }]);
  badHash.draftHash = sha256('다른 원고');
  await assert.rejects(recordRunOccurrences({ ledger, ctx, run: badHash, receiptId: 'r1' }), { code: 'OCCURRENCES_INVALID' });
  const badItems = runFor(text, [{ entityId: 'hana', kind: 'appearance', quote: '없는 인용' }]);
  await assert.rejects(recordRunOccurrences({ ledger, ctx, run: { ...badItems, runId: 'run-2' }, receiptId: 'r2' }), { code: 'OCCURRENCES_INVALID' });
  assert.deepEqual(await ledger.readAll(), []);
});
