import { lstat, readFile, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FolioError } from '../errors.js';
import { writeFileAtomic } from './fs.js';
import { sha256 } from './hash.js';
import {
  classifyJournal, JOURNAL, journalInvalid, lstatOrNull, pathShapeBad, readBackupBuffer, readJournalValidated,
  removeTmpSiblings, TX_DIR, txConflict, txDirState,
} from './file-tx-journal.js';

export { TX_DIR };

/** writeFilesTx 가 받은 인자용 경로 검사. 여기서 나는 오류만 TX_PATH_INVALID. */
async function assertSafe(root, path) {
  if (pathShapeBad(path)) throw new FolioError('TX_PATH_INVALID', String(path).slice(0, 200), { path: String(path).slice(0, 200) });
  const parts = path.split('/');
  let at = root;
  for (const [index, part] of parts.entries()) {
    at = join(at, part);
    const info = await lstat(at).catch((error) => { if (error?.code === 'ENOENT') return null; throw error; });
    if (info?.isSymbolicLink()) throw new FolioError('TX_PATH_INVALID', `${path} goes through a symbolic link`, { path });
    if (index === parts.length - 1 && info && !info.isFile()) throw new FolioError('TX_PATH_INVALID', `${path} is not a regular file`, { path });
  }
}

/**
 * 여러 파일을 한 번에 쓴다(설계 §15 "한 번에 쓰기"). 중간에 실패하면 아무것도 안 바뀐다.
 * 0) .folio 나 .folio/tx 가 심볼릭 링크거나 폴더가 아니면 아무것도 건드리지 않고 거부한다(TX_JOURNAL_INVALID).
 * 1) 끝나지 않은 쓰기가 이미 있으면 손대지 않고 거부한다(TX_PENDING).
 * 2) 모든 파일의 경로를 검사하고, 지금 hash를 계획의 beforeHash와 대조한다(다르면 쓰기 전에 거부).
 * 3) 원래 글을 있는 그대로(byte 그대로) 백업하고 journal을 쓴다. 4) 파일마다 원자적으로 쓴다.
 * 5) 실패하면 백업으로 되돌리고 TX_FAILED. 프로세스가 죽으면 다음 withWorkLock이 recoverFileTx로 되돌린다.
 * 6) 끝나면 journal을 먼저 지우고(원자적으로 "끝났다" 표시) 그다음 백업 폴더를 지운다.
 *    부르는 쪽이 작업 잠금을 쥐고 있어야 한다.
 * @param {string} root
 * @param {Array<{ path: string, beforeHash: string, text: string }>} files
 * @param {{ hooks?: { beforeWrite?: (i:number) => any } }} [options]
 */
export async function writeFilesTx(root, files, { hooks = {} } = {}) {
  if ((await txDirState(root)) === 'bad') throw journalInvalid('.folio or .folio/tx is not a real directory (refusing to follow a symlink)');
  if (await pendingFileTx(root)) throw new FolioError('TX_PENDING', 'a previous multi-file write has not finished; recover it first', { dir: TX_DIR });
  for (const file of files) await assertSafe(root, file.path);
  const originals = [];
  for (const file of files) {
    const buffer = await readBufferOrNull(join(root, file.path));
    if (buffer === null || sha256(buffer) !== file.beforeHash) throw new FolioError('TX_FILE_CHANGED', `${file.path} changed since the plan`, { path: file.path });
    originals.push(buffer);
  }
  const dir = join(root, TX_DIR);
  await rm(dir, { recursive: true, force: true });
  const entries = files.map((file, index) => ({
    path: file.path, backup: `backup-${index}`, beforeHash: sha256(originals[index]), afterHash: sha256(file.text),
  }));
  for (const [index, entry] of entries.entries()) await writeFileAtomic(join(dir, entry.backup), originals[index]);
  await writeFileAtomic(join(dir, JOURNAL), JSON.stringify({ id: randomUUID(), files: entries }));
  try {
    for (const [index, file] of files.entries()) {
      await hooks.beforeWrite?.(index);
      await writeFileAtomic(join(root, file.path), file.text);
    }
  } catch (error) {
    await restore(root);
    throw new FolioError('TX_FAILED', 'writing stopped in the middle; every file was restored', { cause: error?.code ?? null });
  }
  await finishTx(dir);
  return { written: files.length };
}

async function readBufferOrNull(path) {
  try { return await readFile(path); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

/** journal을 먼저 지워 "끝났다"를 원자적으로 표시하고, 그다음 백업 폴더째 지운다. 이 사이에 죽어도 journal이 없으니 되돌리지 않는다.
 * 부르는 쪽이 dir 이 진짜 폴더(심볼릭 링크 아님)임을 이미 확인했을 때만 부른다. */
async function finishTx(dir) {
  await unlink(join(dir, JOURNAL)).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
  await rm(dir, { recursive: true, force: true });
}

/**
 * journal이 있으면(전체가 안전할 때만) 백업으로 되돌린다. journal이 없으면 남은 백업만 지운다(되돌리지 않는다).
 * journal이 망가졌거나 안전하지 않으면 아무것도 되돌리지 않고 TX_JOURNAL_INVALID를 던진다(tx 폴더도 그대로 둔다).
 * .folio/tx 자체가 심볼릭 링크거나 폴더가 아니면 절대 안을 읽거나 지우지 않고 그대로 알린다(따라가지 않는다).
 * 파일마다 지금 hash 가 afterHash 면 되돌리고, beforeHash 면 그대로 둔다. 둘 다 아니면(작가가 고쳤다) 충돌을 전부 모은 뒤
 * 아무것도 쓰지 않고 TX_CONFLICT 를 던진다(tx 폴더도 그대로 둔다). 되돌린 뒤에는 writeFileAtomic 의 tmp 찌꺼기도 지운다.
 */
async function restore(root) {
  const state = await txDirState(root);
  if (state === 'bad') throw journalInvalid('.folio or .folio/tx is not a real directory (refusing to follow a symlink)');
  if (state === 'absent') return [];
  const dir = join(root, TX_DIR);
  const files = await readJournalValidated(root, dir);
  const restored = [];
  if (files) {
    // 먼저 전부 분류한다. 충돌이 하나라도 있으면 아무것도 쓰지 않고 tx 폴더도 그대로 둔다.
    const { restore: toRestore, conflicts } = await classifyJournal(root, files);
    if (conflicts.length) throw txConflict(conflicts);
    for (const entry of toRestore) {
      await writeFileAtomic(join(root, entry.path), await readBackupBuffer(dir, entry.backup));
      restored.push(entry.path);
    }
    await removeTmpSiblings(root, files.map((entry) => entry.path));
  }
  await finishTx(dir);
  return restored;
}

/** 끝나지 않은 쓰기가 남았으면 되돌린다. withWorkLock이 잠금을 잡은 직후 부른다. journal이 망가졌으면 되돌리지 않고 그대로 던진다. */
export async function recoverFileTx(root) {
  const pending = await pendingFileTx(root);
  const files = await restore(root);
  return { recovered: pending, files };
}

/**
 * 끝나지 않은 쓰기가 남아 있는지. 절대 던지지 않는다: .folio/tx 를 읽다 나는 ENOENT 이외의 어떤 오류도,
 * 그리고 .folio/tx 가 있는데 진짜 폴더가 아닌 경우(일반 파일·심볼릭 링크)도 전부 "남아 있다"로 본다.
 */
export async function pendingFileTx(root) {
  try {
    const state = await txDirState(root);
    if (state === 'absent') return false;
    if (state === 'bad') return true;
    return (await lstatOrNull(join(root, TX_DIR, JOURNAL))) !== null;
  } catch {
    return true;
  }
}

/** status 경고용: journal이 있는지, 있다면 복구가 안전할지(모양이 온전하고 작가가 고친 파일과 충돌이 없는지)까지 미리 본다. 절대 던지지 않는다. */
export async function pendingFileTxStatus(root) {
  const pending = await pendingFileTx(root);
  if (!pending) return { pending: false, valid: true };
  try {
    if ((await txDirState(root)) !== 'ok') return { pending: true, valid: false };
    const files = await readJournalValidated(root, join(root, TX_DIR));
    if (!files) return { pending: true, valid: true };
    const { conflicts } = await classifyJournal(root, files);
    return { pending: true, valid: conflicts.length === 0 };
  } catch {
    return { pending: true, valid: false };
  }
}
