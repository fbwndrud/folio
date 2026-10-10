import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rebuildIndex } from '../../core/index/rebuild.js';
import { openIndex } from '../../core/index/query.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture } from '../support/fixtures.js';

test('index.db reads a receipt or commit record without a variant key as main and keeps variant rows apart', async () => {
  const root = await copyFixture('serial-2level');
  const ledger = openLedger(root, 'receipts');
  await ledger.append({ type: 'receipt', receiptId: 'rcpt-old', nodeId: 'ep-001', draftHash: sha256('옛 본문'), refs: [] });
  await ledger.append({ type: 'commit', receiptId: 'rcpt-old', nodeId: 'ep-001', committedHash: sha256('옛 본문') });
  await ledger.append({ type: 'receipt', receiptId: 'rcpt-en', nodeId: 'ep-001', variant: 'en', draftHash: sha256('old text'), refs: [] });
  await ledger.append({ type: 'commit', receiptId: 'rcpt-en', nodeId: 'ep-001', variant: 'en', committedHash: sha256('old text') });
  await rebuildIndex(root);
  const db = openIndex(root);
  try {
    assert.deepEqual(db.prepare('SELECT receipt_id, variant FROM receipts ORDER BY seq').all().map((r) => [r.receipt_id, r.variant]), [['rcpt-old', 'main'], ['rcpt-en', 'en']]);
    assert.deepEqual(db.prepare('SELECT receipt_id, variant FROM commits ORDER BY seq').all().map((r) => [r.receipt_id, r.variant]), [['rcpt-old', 'main'], ['rcpt-en', 'en']]);
  } finally { db.close(); }
});
