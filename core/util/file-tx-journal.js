import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir, readFile, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { FolioError } from '../errors.js';
import { readTextOrNull } from './fs.js';
import { sha256 } from './hash.js';

/** 여러 파일 쓰기의 journal·백업 자리. 작품 안 .folio/tx. */
export const TX_DIR = '.folio/tx';
export const JOURNAL = 'journal.json';
/** 이 쓰기가 닿을 수 있는 최상위 폴더. 기록장·실행 파일·work.yaml·자료 원본은 여기로 쓸 수 없다. */
const ALLOWED_TOP = new Set(['tree', 'entities', 'assets']);
/** journal 에 적힌 백업 파일 이름의 모양. 이 모양이 아니면 journal 을 믿지 않는다(경로 조작 방지). */
const BACKUP_NAME = /^backup-\d+$/;
/** journal 에 적힌 hash 의 모양. */
const HASH_SHAPE = /^sha256:[0-9a-f]{64}$/;
/** journal이 망가졌거나 안전하지 않을 때 사람에게 줄 힌트. */
const JOURNAL_HINT = 'check files, then remove .folio/tx by hand';
/** 복구 중 작가가 고친 파일을 만났을 때 사람에게 줄 힌트. */
const CONFLICT_HINT = 'these files were edited after the interrupted write; compare each with its backup in .folio/tx (journal.json maps paths to backups), keep what you want, then remove .folio/tx by hand';

export function pathShapeBad(path) {
  const parts = typeof path === 'string' ? path.split('/') : [];
  return !parts.length || path.includes('\\') || path.includes('\0') || path.startsWith('/')
    || parts.some((p) => p === '' || p === '.' || p === '..' || p.startsWith('.')) || !ALLOWED_TOP.has(parts[0]);
}

export async function lstatOrNull(path) {
  try { return await lstat(path); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

/**
 * .folio 와 .folio/tx 자체가 진짜 폴더인지 본다(심볼릭 링크로 바꿔치기됐는지).
 * 'absent': tx 폴더가 아예 없다(정상, 할 일 없음). 'ok': 진짜 폴더다. 'bad': .folio 나 .folio/tx 가 심볼릭 링크거나
 * 폴더가 아닌 무언가다 — 이때는 절대 그 경로를 열거나 지우지 않는다(심볼릭 링크를 따라가지 않는다). 이 함수 자체는 던지지 않는다.
 */
export async function txDirState(root) {
  try {
    const folioInfo = await lstatOrNull(join(root, '.folio'));
    if (folioInfo && !folioInfo.isDirectory()) return 'bad';
    const txInfo = await lstatOrNull(join(root, TX_DIR));
    if (!txInfo) return 'absent';
    return txInfo.isDirectory() ? 'ok' : 'bad';
  } catch {
    return 'bad';
  }
}

export function journalInvalid(detail) {
  return new FolioError('TX_JOURNAL_INVALID', detail, { dir: TX_DIR, hint: JOURNAL_HINT });
}

/**
 * journal 에 적힌 대상 경로를 검사한다. writeFilesTx 는 이미 있던 파일만 journal 에 싣기 때문에,
 * 중간 칸을 포함한 모든 칸이 이미 있어야 하고 어디도 심볼릭 링크면 안 되며, 마지막 칸은 반드시 일반 파일이어야
 * 한다(디렉터리·심볼릭 링크·없는 파일은 전부 거부). 문제없으면 null, 있으면 이유 문자열.
 */
async function journalTargetProblem(root, path) {
  const parts = path.split('/');
  let at = root;
  for (const [index, part] of parts.entries()) {
    at = join(at, part);
    /** @type {import('node:fs').Stats | string} */
    const info = await lstat(at).catch((error) => (error?.code === 'ENOENT' ? `${path} does not exist` : `${path} cannot be checked (${error?.code ?? 'ERROR'})`));
    if (typeof info === 'string') return info;
    if (info.isSymbolicLink()) return `${path} goes through a symbolic link`;
    if (index === parts.length - 1 && !info.isFile()) return `${path} is not a regular file`;
  }
  return null;
}

/** 백업 파일을 심볼릭 링크는 절대 따라가지 않고 연다(O_NOFOLLOW). lstat 검사와 함께 이중으로 막는다. */
export async function readBackupBuffer(dir, backup) {
  const handle = await open(join(dir, backup), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try { return await handle.readFile(); } finally { await handle.close(); }
}

/**
 * journal 전체를 첫 번째 패스로 검사한다(하나라도 안 되면 아무것도 복구하지 않는다). 부르는 쪽이 이미
 * txDirState 로 .folio/tx 가 진짜 폴더임을 확인했다고 가정한다(여기서는 다시 확인하지 않는다).
 * - json 자체, 목록 모양, 각 path 의 모양·최상위 폴더, 각 backup 이름의 모양(/^backup-\d+$/)
 * - 각 beforeHash·afterHash 가 sha256 모양인지(없거나 망가졌으면 — 예전 journal 포함 — 거부)
 * - 각 path 가 실제로 있는 일반 파일인지(심볼릭 링크·디렉터리·없는 파일 전부 거부 — C1-6)
 * - 각 backup 파일이 실제로 있고 일반 파일이며 심볼릭 링크가 아닌지
 *   (백업을 심볼릭 링크로 바꿔치기해 밖의 파일을 읽어 들이는 길도 여기서 막는다)
 * - 각 backup 의 hash 가 beforeHash 와 같은지(백업이 원래 글이 아니면 믿지 않는다)
 * 문제가 있으면 무엇이든 TX_JOURNAL_INVALID 를 던진다(TX_PATH_INVALID 는 여기서 쓰지 않는다).
 * @returns {Promise<Array<{ path: string, backup: string, beforeHash: string, afterHash: string }> | null>}
 */
export async function readJournalValidated(root, dir) {
  let text;
  try { text = await readTextOrNull(join(dir, JOURNAL)); }
  catch (error) { throw journalInvalid(`journal could not be read: ${error?.code ?? error}`); }
  if (text === null) return null;
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw journalInvalid('journal is not valid JSON'); }
  const files = Array.isArray(parsed?.files) ? parsed.files : null;
  if (!files) throw journalInvalid('journal has no file list');
  for (const entry of files) {
    if (typeof entry?.path !== 'string' || pathShapeBad(entry.path)) {
      throw journalInvalid(`journal has a bad path: ${String(entry?.path).slice(0, 200)}`);
    }
    if (typeof entry?.backup !== 'string' || !BACKUP_NAME.test(entry.backup)) {
      throw journalInvalid(`journal has a bad backup name: ${String(entry?.backup).slice(0, 200)}`);
    }
    for (const key of ['beforeHash', 'afterHash']) {
      if (typeof entry?.[key] !== 'string' || !HASH_SHAPE.test(entry[key])) {
        throw journalInvalid(`journal has a missing or bad ${key} for ${entry.path}`);
      }
    }
  }
  for (const entry of files) {
    const problem = await journalTargetProblem(root, entry.path);
    if (problem) throw journalInvalid(problem);
    const info = await lstat(join(dir, entry.backup)).catch(() => null);
    if (!info) throw journalInvalid(`missing backup for ${entry.path}`);
    if (!info.isFile()) throw journalInvalid(`backup for ${entry.path} is not a regular file`);
    let backupHash;
    try { backupHash = sha256(await readBackupBuffer(dir, entry.backup)); }
    catch (error) { throw journalInvalid(`backup for ${entry.path} cannot be read (${error?.code ?? 'ERROR'})`); }
    if (backupHash !== entry.beforeHash) throw journalInvalid(`backup for ${entry.path} does not match its beforeHash`);
  }
  return files;
}

/**
 * 검사를 통과한 journal 을 보고 파일마다 할 일을 정한다(아무것도 쓰지 않는다).
 * 지금 hash == afterHash → 백업으로 되돌린다. == beforeHash → 그대로 둔다(아직 안 썼거나 tmp 만 남았다).
 * 그 밖 → 작가가 고친 것으로 보고 충돌. 엔진은 절대 추측하지 않는다.
 * @param {string} root
 * @param {Array<{ path: string, backup: string, beforeHash: string, afterHash: string }>} files
 */
export async function classifyJournal(root, files) {
  const restore = [];
  const conflicts = [];
  for (const entry of files) {
    const current = sha256(await readFile(join(root, entry.path)));
    if (current === entry.afterHash) restore.push(entry);
    else if (current !== entry.beforeHash) conflicts.push(entry.path);
  }
  return { restore, conflicts };
}

export function txConflict(paths) {
  return new FolioError('TX_CONFLICT', `files changed after the interrupted write: ${paths.join(', ').slice(0, 300)}`,
    { dir: TX_DIR, paths, hint: CONFLICT_HINT });
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * writeFileAtomic 이 남긴 tmp 형제 파일을 지운다. 이름 모양은 `<파일이름>.<uuid 앞 8자>.tmp` 딱 하나만 맞춘다
 * (넓게 긁어 지우지 않는다). 폴더는 건드리지 않고, 심볼릭 링크는 따라가지 않고 링크 자체만 지운다.
 * @param {string} root
 * @param {string[]} paths journal 에 적힌(검사를 통과한) 대상 경로
 */
export async function removeTmpSiblings(root, paths) {
  for (const path of paths) {
    const full = join(root, path);
    const pattern = new RegExp(`^${escapeRegExp(basename(full))}\\.[0-9a-f]{8}\\.tmp$`);
    let names;
    try { names = await readdir(dirname(full)); } catch { continue; }
    for (const name of names) {
      if (!pattern.test(name)) continue;
      const info = await lstatOrNull(join(dirname(full), name));
      if (!info || info.isDirectory()) continue;
      await unlink(join(dirname(full), name)).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    }
  }
}
