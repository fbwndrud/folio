import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pendingFileTx, pendingFileTxStatus, recoverFileTx, TX_DIR } from '../../core/util/file-tx.js';
import { withWorkLock } from '../../core/run/work-lock.js';
import { workStatus } from '../../core/status.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { runTxChild, wasKilled } from '../support/crash.js';

// F-1: 복구는 작가가 고친 글을 절대 덮어쓰지 않는다. journal 의 beforeHash·afterHash 로 파일마다 판단한다.

const A = 'tree/01-arc-awakening/01-ep-001.md';
const B = 'tree/01-arc-awakening/02-ep-002.md';
const E = 'entities/character/hana.md';
const read = (root, path) => readFile(join(root, path), 'utf8');
const snapshot = async (root) => Object.fromEntries(await Promise.all([A, B, E].map(async (p) => [p, await read(root, p)])));
const txFiles = async (root) => (await readdir(join(root, TX_DIR))).sort();

/** 원본을 기억해 두고, 자식 프로세스가 A·B 를 쓴 뒤 E 앞에서 SIGKILL 로 죽게 한다. */
async function killedAfterSecondWrite() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const before = await snapshot(root);
  const child = runTxChild(root, 'kill-after-second-write');
  assert.ok(wasKilled(child), child.stderr);
  const after = await snapshot(root);
  assert.notEqual(after[A], before[A]);
  assert.notEqual(after[B], before[B]);
  assert.equal(after[E], before[E]);
  return { root, before, after };
}

test('F-1: an author edit to an already-written file after a kill is TX_CONFLICT and nothing changes', async () => {
  const { root } = await killedAfterSecondWrite();
  await writeFile(join(root, A), `${await read(root, A)}\n작가가 새로 쓴 문단.\n`);
  const edited = await snapshot(root);
  const txBefore = await txFiles(root);
  await assert.rejects(withWorkLock(root, async () => {}), (e) => e.code === 'TX_CONFLICT'
    && e.details.dir === TX_DIR && e.details.paths.length === 1 && e.details.paths[0] === A
    && /compare/.test(e.details.hint) && /\.folio\/tx/.test(e.details.hint));
  assert.deepEqual(await snapshot(root), edited, 'no file may be restored while a conflict exists (not even B)');
  assert.deepEqual(await txFiles(root), txBefore, 'the tx folder must stay for the author');
  assert.deepEqual(await pendingFileTxStatus(root), { pending: true, valid: false });
  const s = await workStatus(root, { packs: fakePacks() });
  assert.deepEqual(s.warnings.find((w) => w.code === 'TX_INTERRUPTED'), { code: 'TX_INTERRUPTED', dir: TX_DIR, valid: false });
});

test('F-1: an author edit to a not-yet-written file after a kill is TX_CONFLICT; every conflict is listed', async () => {
  const { root } = await killedAfterSecondWrite();
  await writeFile(join(root, E), `${await read(root, E)}\n작가 메모.\n`);
  await writeFile(join(root, B), `${await read(root, B)}\n또 다른 손질.\n`);
  const edited = await snapshot(root);
  await assert.rejects(recoverFileTx(root), (e) => e.code === 'TX_CONFLICT' && e.details.paths.slice().sort().join('|') === [B, E].sort().join('|'));
  assert.deepEqual(await snapshot(root), edited);
  assert.equal(await pendingFileTx(root), true);
});

test('F-1: a kill with no author edits restores cleanly, and the status saw it as valid first', async () => {
  const { root, before } = await killedAfterSecondWrite();
  assert.deepEqual(await pendingFileTxStatus(root), { pending: true, valid: true });
  await withWorkLock(root, async () => {});
  assert.deepEqual(await snapshot(root), before);
  assert.equal(await pendingFileTx(root), false);
});

test('F-1: a leftover writeFileAtomic tmp sibling of a journal path is removed; look-alike names are kept', async () => {
  const { root, before } = await killedAfterSecondWrite();
  const dir = join(root, 'entities', 'character');
  await writeFile(join(dir, 'hana.md.0a1b2c3d.tmp'), 'half written');
  await writeFile(join(dir, 'hana.md.notatmp.tmp'), 'author file');
  await writeFile(join(dir, 'other.md.0a1b2c3d.tmp'), 'not ours');
  await recoverFileTx(root);
  assert.deepEqual(await snapshot(root), before);
  await assert.rejects(stat(join(dir, 'hana.md.0a1b2c3d.tmp')), { code: 'ENOENT' });
  await assert.doesNotReject(stat(join(dir, 'hana.md.notatmp.tmp')));
  await assert.doesNotReject(stat(join(dir, 'other.md.0a1b2c3d.tmp')));
});

test('F-1: an old journal without beforeHash/afterHash is TX_JOURNAL_INVALID and nothing is restored', async () => {
  const root = await copyFixture('serial-2level');
  const before = await read(root, A);
  const dir = join(root, TX_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'backup-0'), 'from backup');
  await writeFile(join(dir, 'journal.json'), JSON.stringify({ id: 'x', files: [{ path: A, backup: 'backup-0' }] }));
  await assert.rejects(recoverFileTx(root), (e) => e.code === 'TX_JOURNAL_INVALID' && /beforeHash/.test(e.message));
  assert.equal(await read(root, A), before);
  await assert.doesNotReject(stat(dir));
  assert.deepEqual(await pendingFileTxStatus(root), { pending: true, valid: false });
});

test('F-1: a malformed afterHash is TX_JOURNAL_INVALID', async () => {
  const { root, after } = await killedAfterSecondWrite();
  const journalPath = join(root, TX_DIR, 'journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  journal.files[1].afterHash = 'sha256:nothex';
  await writeFile(journalPath, JSON.stringify(journal));
  await assert.rejects(recoverFileTx(root), (e) => e.code === 'TX_JOURNAL_INVALID' && /afterHash/.test(e.message));
  assert.deepEqual(await snapshot(root), after);
});
