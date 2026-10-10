import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pendingFileTx, pendingFileTxStatus, recoverFileTx, writeFilesTx, TX_DIR } from '../../core/util/file-tx.js';
import { withWorkLock } from '../../core/run/work-lock.js';
import { workStatus } from '../../core/status.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, tempDir, useFakePack, fakePacks } from '../support/fixtures.js';
import { runTxChild, wasKilled } from '../support/crash.js';

const A = 'tree/01-arc-awakening/01-ep-001.md';
const B = 'tree/01-arc-awakening/02-ep-002.md';
const E = 'entities/character/hana.md';
const read = (root, path) => readFile(join(root, path), 'utf8');
async function plan(root, edits) {
  return Promise.all(Object.entries(edits).map(async ([path, fn]) => {
    const text = await read(root, path);
    return { path, beforeHash: sha256(text), text: fn(text) };
  }));
}
const snapshot = async (root) => Object.fromEntries(await Promise.all([A, B, E].map(async (p) => [p, await read(root, p)])));

test('all files are written and the tx folder is gone afterwards', async () => {
  const root = await copyFixture('serial-2level');
  const files = await plan(root, { [A]: (t) => t.replace('하나는', '세라는'), [E]: (t) => t.replace('하나', '세라') });
  assert.deepEqual(await writeFilesTx(root, files), { written: 2 });
  assert.match(await read(root, A), /세라는/);
  assert.equal(await pendingFileTx(root), false);
  await assert.rejects(stat(join(root, TX_DIR)), { code: 'ENOENT' });
});

test('a failure in the middle restores every file; a changed file or a bad path refuses before any write', async () => {
  const root = await copyFixture('serial-2level');
  const before = await snapshot(root);
  const files = await plan(root, { [A]: (t) => `${t}x`, [B]: (t) => `${t}y`, [E]: (t) => `${t}z` });
  await assert.rejects(writeFilesTx(root, files, { hooks: { beforeWrite: (i) => { if (i === 2) throw new Error('disk full'); } } }),
    (e) => e.code === 'TX_FAILED' && e.details.cause === null);
  assert.deepEqual(await snapshot(root), before);
  assert.equal(await pendingFileTx(root), false);
  await writeFile(join(root, B), 'someone else');
  await assert.rejects(writeFilesTx(root, files), (e) => e.code === 'TX_FILE_CHANGED' && e.details.path === B);
  assert.equal(await read(root, A), before[A]);
  for (const path of ['../x.md', '/etc/x', '.folio/ledger/receipts.jsonl', 'work.yaml', 'tree/../work.yaml', 'sources/cell.yaml', 'tree\\a.md']) {
    await assert.rejects(writeFilesTx(root, [{ path, beforeHash: 'sha256:0', text: '' }]), { code: 'TX_PATH_INVALID' }, path);
  }
});

test('a symlinked file inside the work is refused', async () => {
  const root = await copyFixture('serial-2level');
  const outside = join(await tempDir(), 'outside.md');
  await writeFile(outside, 'x');
  await symlink(outside, join(root, 'tree', 'link.md'));
  await assert.rejects(writeFilesTx(root, [{ path: 'tree/link.md', beforeHash: sha256('x'), text: 'y' }]), { code: 'TX_PATH_INVALID' });
  assert.equal(await readFile(outside, 'utf8'), 'x');
});

test('after a SIGKILL in the middle, the next work lock restores every file', async () => {
  const root = await copyFixture('serial-2level');
  const before = await snapshot(root);
  const child = runTxChild(root, 'kill-after-second-write');
  assert.ok(wasKilled(child), child.stderr);
  assert.notDeepEqual(await snapshot(root), before);
  assert.equal(await pendingFileTx(root), true);
  await withWorkLock(root, async () => {});
  assert.deepEqual(await snapshot(root), before);
  assert.equal(await pendingFileTx(root), false);
  assert.deepEqual(await recoverFileTx(root), { recovered: false, files: [] });
  assert.equal((await readdir(join(root, '.folio'))).includes('tx'), false);
});

// --- P10 / Fix round 1 (C1-3, C1-4): journal이 망가졌을 때(공격·손상) 복구가 안전한지 ---

/** journal 을 손으로 심어 놓는다. backups 로 준 이름마다 "from backup"을 담은 파일을 만든다. */
async function plantJournal(root, files, backups = ['backup-0']) {
  const dir = join(root, TX_DIR);
  await mkdir(dir, { recursive: true });
  for (const backup of backups) await writeFile(join(dir, backup), 'from backup');
  await writeFile(join(dir, 'journal.json'), JSON.stringify({ id: 'x', files }));
  return dir;
}

const journalRejects = (root) => assert.rejects(recoverFileTx(root), (e) => e.code === 'TX_JOURNAL_INVALID'
  && e.details.dir === TX_DIR && typeof e.details.hint === 'string' && e.details.hint.length > 0);

test('a journal with a backup name that is not backup-<n> refuses to restore', async () => {
  const root = await copyFixture('serial-2level');
  const before = await read(root, A);
  const dir = await plantJournal(root, [{ path: A, backup: '../../../etc/passwd' }]);
  await journalRejects(root);
  assert.equal(await read(root, A), before);
  await assert.doesNotReject(stat(dir));
});

test('a journal entry with a ".." path refuses to restore', async () => {
  const root = await copyFixture('serial-2level');
  const outside = join(root, '..', 'escaped-by-journal.md');
  const dir = await plantJournal(root, [{ path: 'tree/../../escaped-by-journal.md', backup: 'backup-0' }]);
  await journalRejects(root);
  await assert.rejects(stat(outside), { code: 'ENOENT' });
  await assert.doesNotReject(stat(dir));
});

test('a journal entry with an absolute path refuses to restore', async () => {
  const root = await copyFixture('serial-2level');
  const target = join(await tempDir(), 'absolute-target.md');
  await writeFile(target, 'untouched');
  const dir = await plantJournal(root, [{ path: `/${target.replace(/^\//, '')}`, backup: 'backup-0' }]);
  await journalRejects(root);
  assert.equal(await readFile(target, 'utf8'), 'untouched');
  await assert.doesNotReject(stat(dir));
});

test('recovery never touches the ledger even when the journal points at it', async () => {
  const root = await copyFixture('serial-2level');
  const ledgerPath = join(root, '.folio', 'ledger', 'receipts.jsonl');
  const before = await readTextOrNullLocal(ledgerPath);
  const dir = await plantJournal(root, [{ path: '.folio/ledger/receipts.jsonl', backup: 'backup-0' }]);
  await journalRejects(root);
  assert.equal(await readTextOrNullLocal(ledgerPath), before);
  await assert.doesNotReject(stat(dir));
});

test('a corrupt journal (bad JSON) refuses to restore, including through withWorkLock', async () => {
  const root = await copyFixture('serial-2level');
  const before = await read(root, A);
  const dir = join(root, TX_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'journal.json'), '{not json');
  await journalRejects(root);
  assert.equal(await read(root, A), before);
  await assert.rejects(withWorkLock(root, async () => {}), (e) => e.code === 'TX_JOURNAL_INVALID');
  await assert.doesNotReject(stat(dir));
});

test('a journal missing its file list refuses to restore', async () => {
  const root = await copyFixture('serial-2level');
  const dir = join(root, TX_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'journal.json'), JSON.stringify({ id: 'x' }));
  await journalRejects(root);
  await assert.doesNotReject(stat(dir));
});

test('C1-3: a mixed valid + invalid-path journal restores nothing; every file is byte-unchanged and the tx dir stays', async () => {
  const root = await copyFixture('serial-2level');
  const before = await read(root, A);
  const dir = await plantJournal(root, [{ path: A, backup: 'backup-0' }, { path: '.folio/ledger/receipts.jsonl', backup: 'backup-0' }]);
  await journalRejects(root);
  assert.equal(await read(root, A), before);
  await assert.doesNotReject(stat(dir));
});

test('C1-3: a valid entry with a missing backup restores nothing', async () => {
  const root = await copyFixture('serial-2level');
  const before = await read(root, A);
  const dir = join(root, TX_DIR);
  await mkdir(dir, { recursive: true });
  // backup-0 is never created: the journal points at a backup that does not exist.
  await writeFile(join(dir, 'journal.json'), JSON.stringify({ id: 'x', files: [{ path: A, backup: 'backup-0' }] }));
  await journalRejects(root);
  assert.equal(await read(root, A), before);
  await assert.doesNotReject(stat(dir));
});

test('C1-3: a symlinked backup pointing outside the root restores nothing (no read through the link)', async () => {
  const root = await copyFixture('serial-2level');
  const before = await read(root, A);
  const outside = join(await tempDir(), 'secret.md');
  await writeFile(outside, 'secret content from outside the work');
  const dir = join(root, TX_DIR);
  await mkdir(dir, { recursive: true });
  await symlink(outside, join(dir, 'backup-0'));
  await writeFile(join(dir, 'journal.json'), JSON.stringify({ id: 'x', files: [{ path: A, backup: 'backup-0' }] }));
  await journalRejects(root);
  assert.equal(await read(root, A), before);
  await assert.doesNotReject(stat(dir));
});

async function readTextOrNullLocal(path) {
  try { return await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// --- Fix round 1 (C1-5): minor edge cases ---

test('C1-5a: writeFilesTx refuses TX_PENDING when a journal already exists, and does not touch it', async () => {
  const root = await copyFixture('serial-2level');
  const dir = await plantJournal(root, [{ path: A, backup: 'backup-0' }]);
  const journalBefore = await readFile(join(dir, 'journal.json'), 'utf8');
  const backupBefore = await readFile(join(dir, 'backup-0'));
  const files = await plan(root, { [B]: (t) => `${t}x` });
  await assert.rejects(writeFilesTx(root, files), { code: 'TX_PENDING' });
  assert.equal(await readFile(join(dir, 'journal.json'), 'utf8'), journalBefore);
  assert.deepEqual(await readFile(join(dir, 'backup-0')), backupBefore);
});

test('C1-5b: a target path that exists but is not a regular file is TX_PATH_INVALID', async () => {
  const root = await copyFixture('serial-2level');
  await assert.rejects(writeFilesTx(root, [{ path: 'tree', beforeHash: 'sha256:0', text: '' }]), { code: 'TX_PATH_INVALID' });
});

test('C1-5c: when journal.json is a directory, pendingFileTx is true without throwing and status does not crash', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const dir = join(root, TX_DIR);
  await mkdir(join(dir, 'journal.json'), { recursive: true });
  await assert.doesNotReject((async () => assert.equal(await pendingFileTx(root), true))());
  assert.deepEqual(await pendingFileTxStatus(root), { pending: true, valid: false });
  const s = await workStatus(root, { packs: fakePacks() });
  assert.deepEqual(s.warnings.find((w) => w.code === 'TX_INTERRUPTED'), { code: 'TX_INTERRUPTED', dir: TX_DIR, valid: false });
});

test('C1-5d: backups and restores are byte-exact (no utf8 decoding of non-utf8 bytes)', async () => {
  const root = await copyFixture('serial-2level');
  const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x41, 0xc3, 0x28, 0x0a]);
  await writeFile(join(root, A), bytes);
  const beforeHash = sha256(bytes);
  await assert.rejects(
    writeFilesTx(root, [{ path: A, beforeHash, text: 'replacement text' }], { hooks: { beforeWrite: () => { throw new Error('boom'); } } }),
    { code: 'TX_FAILED' },
  );
  assert.deepEqual(await readFile(join(root, A)), bytes);
});

// --- Fix round 2 ---

// C1-6 (N1): the first validation pass must lstat every journal TARGET too, not just the backup.
test('C1-6 repro 1: a journal target that is a directory refuses to restore; status reports invalid', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const before = await read(root, A);
  const dir = await plantJournal(root, [
    { path: A, backup: 'backup-0' },
    { path: 'tree/01-arc-awakening', backup: 'backup-1' },
  ], ['backup-0', 'backup-1']);
  await journalRejects(root);
  assert.equal(await read(root, A), before, 'ep-001 must not have been restored before the directory entry was found');
  await assert.doesNotReject(stat(dir));
  assert.deepEqual(await pendingFileTxStatus(root), { pending: true, valid: false });
});

test('C1-6 repro 2: a journal target whose parent directory does not exist refuses to restore, and creates nothing', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const dir = await plantJournal(root, [{ path: 'tree/newdir/evil.md', backup: 'backup-0' }]);
  await journalRejects(root);
  await assert.rejects(stat(join(root, 'tree', 'newdir')), { code: 'ENOENT' });
  await assert.doesNotReject(stat(dir));
  assert.deepEqual(await pendingFileTxStatus(root), { pending: true, valid: false });
});

test('C1-8: a journal target that runs through a regular file is TX_JOURNAL_INVALID, not a raw ENOTDIR', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const dir = await plantJournal(root, [{ path: `${A}/x`, backup: 'backup-0' }]);
  await journalRejects(root);
  await assert.doesNotReject(stat(dir));
  assert.deepEqual(await pendingFileTxStatus(root), { pending: true, valid: false });
});

// C1-7 (N2/N3): .folio and .folio/tx themselves must be real directories; never follow a symlinked tx dir.
test('C1-7: a symlinked .folio/tx is refused without following it (withWorkLock)', async () => {
  const root = await copyFixture('serial-2level');
  const before = await read(root, A);
  const outsideDir = await tempDir();
  await writeFile(join(outsideDir, 'backup-0'), 'poisoned content from outside the work');
  await writeFile(join(outsideDir, 'journal.json'), JSON.stringify({ id: 'x', files: [{ path: A, backup: 'backup-0' }] }));
  await mkdir(join(root, '.folio'), { recursive: true });
  await symlink(outsideDir, join(root, TX_DIR));
  await assert.rejects(withWorkLock(root, async () => {}), (e) => e.code === 'TX_JOURNAL_INVALID');
  assert.equal(await read(root, A), before, 'ep-001 must be untouched: the symlinked tx dir must never be followed');
  assert.equal(await readFile(join(outsideDir, 'journal.json'), 'utf8'), JSON.stringify({ id: 'x', files: [{ path: A, backup: 'backup-0' }] }), 'the outside journal must not be deleted');
  await assert.doesNotReject(stat(join(outsideDir, 'backup-0')));
});

test('C1-7: writeFilesTx refuses when .folio/tx is a symlink, before writing anything', async () => {
  const root = await copyFixture('serial-2level');
  const before = await read(root, A);
  const outsideDir = await tempDir();
  await mkdir(join(root, '.folio'), { recursive: true });
  await symlink(outsideDir, join(root, TX_DIR));
  const files = await plan(root, { [A]: (t) => `${t}x` });
  await assert.rejects(writeFilesTx(root, files), { code: 'TX_JOURNAL_INVALID' });
  assert.equal(await read(root, A), before);
  assert.deepEqual(await readdir(outsideDir), []);
});

test('C1-7: .folio/tx as a plain file (not a directory) is pending/invalid but never throws in status, and withWorkLock refuses', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await mkdir(join(root, '.folio'), { recursive: true });
  await writeFile(join(root, TX_DIR), 'not a directory');
  assert.equal(await pendingFileTx(root), true);
  assert.deepEqual(await pendingFileTxStatus(root), { pending: true, valid: false });
  const s = await workStatus(root, { packs: fakePacks() });
  assert.deepEqual(s.warnings.find((w) => w.code === 'TX_INTERRUPTED'), { code: 'TX_INTERRUPTED', dir: TX_DIR, valid: false });
  await assert.rejects(withWorkLock(root, async () => {}), (e) => e.code === 'TX_JOURNAL_INVALID');
});
