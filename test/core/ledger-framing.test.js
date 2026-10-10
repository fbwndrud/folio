import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { openLedger } from '../../core/ledger/ledger.js';
import { tempDir } from '../support/fixtures.js';

const headPath = (ledger) => ledger.path.replace(/\.jsonl$/, '.head');
const bytes = (ledger) => Promise.all([readFile(ledger.path), readFile(headPath(ledger))]);
const seed = async () => {
  const root = await tempDir();
  const ledger = openLedger(root, 'events', { now: () => '2026-10-08T00:00:00.000Z' });
  const first = await ledger.append({ type: 'event', eventId: 'e1' });
  return { root, ledger, first };
};

test('complete JSON tail without newline is separated before the next append', async () => {
  const { ledger, first } = await seed();
  const original = await readFile(ledger.path);
  await writeFile(ledger.path, original.subarray(0, -1));
  const [beforeLedger, beforeHead] = await bytes(ledger);
  assert.deepEqual(await ledger.verify(), { ok: true });

  assert.equal((await ledger.append({ type: 'event', eventId: 'e2' })).seq, 2);
  assert.deepEqual(await ledger.verify(), { ok: true });
  assert.equal((await ledger.readAll()).length, 2);
  const [afterLedger, afterHead] = await bytes(ledger);
  assert.deepEqual(afterLedger.subarray(0, beforeLedger.length), beforeLedger);
  assert.equal(afterLedger.subarray(beforeLedger.length, beforeLedger.length + 1).toString(), '\n');
  assert.deepEqual(JSON.parse(beforeHead), { seq: first.seq, hash: first.hash });
  assert.deepEqual(JSON.parse(afterHead).seq, 2);
});

test('incomplete JSON tail rejects append without changing ledger or head bytes', async () => {
  const { ledger } = await seed();
  const original = await readFile(ledger.path);
  await writeFile(ledger.path, original.subarray(0, -6));
  const before = await bytes(ledger);
  await assert.rejects(ledger.append({ type: 'event', eventId: 'e2' }), { code: 'LEDGER_TAMPERED' });
  const after = await bytes(ledger);
  assert.deepEqual(after, before);
});

test('invalid head rejects append without changing ledger or head bytes', async () => {
  const { ledger } = await seed();
  await writeFile(headPath(ledger), JSON.stringify({ seq: 99, hash: 'wrong' }));
  const before = await bytes(ledger);
  await assert.rejects(ledger.append({ type: 'event', eventId: 'e2' }), { code: 'LEDGER_TAMPERED' });
  assert.deepEqual(await bytes(ledger), before);
});

test('a head behind an unterminated tail can be followed by another append', async () => {
  const { ledger, first } = await seed();
  const second = await ledger.append({ type: 'event', eventId: 'e2' });
  await writeFile(headPath(ledger), JSON.stringify({ seq: first.seq, hash: first.hash }));
  const original = await readFile(ledger.path);
  await writeFile(ledger.path, original.subarray(0, -1));
  const [beforeLedger] = await bytes(ledger);

  const third = await ledger.append({ type: 'event', eventId: 'e3' });
  assert.equal(third.seq, 3);
  assert.equal(third.prev, second.hash);
  assert.deepEqual(await ledger.verify(), { ok: true });
  assert.deepEqual((await ledger.readAll()).map((record) => record.eventId), ['e1', 'e2', 'e3']);
  const [afterLedger] = await bytes(ledger);
  assert.deepEqual(afterLedger.subarray(0, beforeLedger.length), beforeLedger);
});

test('SIGKILL after append and before head update preserves chain for recovery', async () => {
  const { root, ledger, first } = await seed();
  const before = await bytes(ledger);
  const moduleUrl = new URL('../../core/ledger/ledger.js', import.meta.url).href;
  const childCode = `
    import { openLedger } from ${JSON.stringify(moduleUrl)};
    const ledger = openLedger(${JSON.stringify(root)}, 'events', {
      hooks: { afterAppend: () => process.kill(process.pid, 'SIGKILL') },
    });
    const result = await ledger.append({ type: 'event', eventId: 'e2' });
    console.log(result.seq);
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', childCode],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.equal(child.stdout, '');

  const afterKill = await bytes(ledger);
  assert.deepEqual(afterKill[0].subarray(0, before[0].length), before[0]);
  assert.deepEqual(afterKill[1], before[1]);
  const records = await ledger.readAll();
  assert.deepEqual(records.map((record) => record.eventId), ['e1', 'e2']);
  assert.equal(records[1].prev, first.hash);

  const third = await ledger.append({ type: 'event', eventId: 'e3' });
  assert.equal(third.seq, 3);
  assert.equal(third.prev, records[1].hash);
  assert.deepEqual(await ledger.verify(), { ok: true });
  assert.deepEqual((await ledger.readAll()).map((record) => record.eventId), ['e1', 'e2', 'e3']);
  const afterRecovery = await bytes(ledger);
  assert.deepEqual(afterRecovery[0].subarray(0, afterKill[0].length), afterKill[0]);
  assert.deepEqual(JSON.parse(afterRecovery[1]), { seq: third.seq, hash: third.hash });
});
