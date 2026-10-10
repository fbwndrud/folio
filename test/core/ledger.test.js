import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { openLedger } from '../../core/ledger/ledger.js';
import { tempDir } from '../support/fixtures.js';

const clock = () => { let n = 0; return () => `2026-09-26T00:00:0${n++}.000Z`; };

test('append chains records and readAll returns them in order', async () => {
  const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
  const a = await ledger.append({ type: 'receipt', receiptId: 'r1' });
  const b = await ledger.append({ type: 'commit', receiptId: 'r1' });
  assert.equal(a.seq, 1);
  assert.equal(a.prev, 'genesis');
  assert.equal(b.prev, a.hash);
  assert.deepEqual((await ledger.readAll()).map((r) => r.type), ['receipt', 'commit']);
  assert.deepEqual(await ledger.verify(), { ok: true });
});

test('the ledger API offers no way to edit or delete', async () => {
  const ledger = openLedger(await tempDir(), 'events');
  assert.deepEqual(Object.keys(ledger).sort(), ['append', 'name', 'path', 'readAll', 'verify']);
  assert.ok(Object.isFrozen(ledger));
});

test('editing, deleting or reordering lines is detected', async () => {
  for (const tamper of [
    (lines) => [lines[0].replace('"r1"', '"rX"'), lines[1]],
    (lines) => [lines[1]],
    (lines) => [lines[1], lines[0]],
  ]) {
    const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
    await ledger.append({ type: 'receipt', receiptId: 'r1' });
    await ledger.append({ type: 'receipt', receiptId: 'r2' });
    const lines = (await readFile(ledger.path, 'utf8')).trim().split('\n');
    await writeFile(ledger.path, `${tamper(lines).join('\n')}\n`);
    await assert.rejects(ledger.readAll(), { code: 'LEDGER_TAMPERED' });
    assert.equal((await ledger.verify()).ok, false);
    await assert.rejects(ledger.append({ type: 'receipt', receiptId: 'r3' }), { code: 'LEDGER_TAMPERED' });
  }
});

test('entries need a type and ledger names are plain', async () => {
  const root = await tempDir();
  await assert.rejects(openLedger(root, 'events').append({}), { code: 'LEDGER_ENTRY_INVALID' });
  assert.throws(() => openLedger(root, '../x'), { code: 'LEDGER_NAME_INVALID' });
});

test('a truncated last line is detected', async () => {
  const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
  await ledger.append({ type: 'receipt', receiptId: 'r1' });
  const lines = (await readFile(ledger.path, 'utf8')).trim().split('\n');
  await writeFile(ledger.path, `${lines[0].slice(0, -5)}\n`);
  await assert.rejects(ledger.readAll(), { code: 'LEDGER_TAMPERED' });
});

test('a gap in seq is detected', async () => {
  const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
  await ledger.append({ type: 'receipt', receiptId: 'r1' });
  await ledger.append({ type: 'receipt', receiptId: 'r2' });
  const lines = (await readFile(ledger.path, 'utf8')).trim().split('\n');
  const second = JSON.parse(lines[1]);
  second.seq = 3;
  await writeFile(ledger.path, `${[lines[0], JSON.stringify(second)].join('\n')}\n`);
  await assert.rejects(ledger.readAll(), { code: 'LEDGER_TAMPERED' });
});

test('caller-supplied seq, prev and hash are ignored', async () => {
  const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
  const a = await ledger.append({ type: 'receipt', receiptId: 'r1' });
  const b = await ledger.append({ type: 'receipt', receiptId: 'r2', seq: 999, prev: 'nope', hash: 'nope' });
  assert.equal(b.seq, a.seq + 1);
  assert.equal(b.prev, a.hash);
  assert.notEqual(b.hash, 'nope');
});

test('concurrent appends are serialised', async () => {
  const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
  const results = await Promise.all(
    [1, 2, 3, 4, 5].map((n) => ledger.append({ type: 'receipt', receiptId: `r${n}` })),
  );
  assert.deepEqual(results.map((r) => r.seq).sort((x, y) => x - y), [1, 2, 3, 4, 5]);
  assert.deepEqual(await ledger.verify(), { ok: true });
});

test('a Date value round-trips through JSON and still verifies', async () => {
  const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
  const record = await ledger.append({ type: 'receipt', receiptId: 'r1', at: new Date('2026-01-01T00:00:00.000Z') });
  assert.equal(record.at, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(await ledger.verify(), { ok: true });
});

test('deleting the last line is detected via the head anchor', async () => {
  const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
  await ledger.append({ type: 'receipt', receiptId: 'r1' });
  await ledger.append({ type: 'receipt', receiptId: 'r2' });
  const lines = (await readFile(ledger.path, 'utf8')).trim().split('\n');
  await writeFile(ledger.path, `${lines[0]}\n`);
  await assert.rejects(ledger.readAll(), { code: 'LEDGER_TAMPERED' });
  assert.equal((await ledger.verify()).ok, false);
});

test('emptying the ledger file is detected via the head anchor', async () => {
  const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
  await ledger.append({ type: 'receipt', receiptId: 'r1' });
  await writeFile(ledger.path, '');
  await assert.rejects(ledger.readAll(), { code: 'LEDGER_TAMPERED' });
});

test('a head behind the chain (crash after write, before head update) is tolerated', async () => {
  const ledger = openLedger(await tempDir(), 'receipts', { now: clock() });
  const a = await ledger.append({ type: 'receipt', receiptId: 'r1' });
  await ledger.append({ type: 'receipt', receiptId: 'r2' });
  const headPath = ledger.path.replace(/\.jsonl$/, '.head');
  await writeFile(headPath, JSON.stringify({ seq: a.seq, hash: a.hash }));
  assert.deepEqual(await ledger.verify(), { ok: true });
});
