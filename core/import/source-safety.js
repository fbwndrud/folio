import { constants } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { addImportWarning, IMPORT_WARNING_LIMIT } from './warnings.js';

/** 원본을 메모리에 보관하는 읽기이므로 파일·순회·총 바이트를 함께 제한한다. */
export const VIBELORE_LIMITS = Object.freeze({
  text: 2 * 1024 * 1024,
  json: 1024 * 1024,
  svg: 20 * 1024 * 1024,
  files: 5000,
  entries: 10_000,
  warnings: IMPORT_WARNING_LIMIT,
  totalBytes: 64 * 1024 * 1024,
});

/** @param {any} state @param {object} warning */
export function warn(state, warning) {
  addImportWarning(state.warnings, warning);
}

function identity(info) {
  return `${info.dev}:${info.ino}:${info.mode & constants.S_IFMT}`;
}

/** 모든 성분의 최초 장치·inode·종류를 보존하고 이후 검사에서 달라지면 버린다. */
export async function verifyPath(state, rel, kind) {
  const segments = rel ? rel.split('/') : [];
  for (let index = 0; index <= segments.length; index += 1) {
    const part = segments.slice(0, index).join('/');
    const path = part ? join(state.from, ...segments.slice(0, index)) : state.from;
    const info = await lstat(path).catch((error) => {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
      throw error;
    });
    if (!info) {
      if (state.identities.has(part)) warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: part || rel, reason: 'changed' });
      return false;
    }
    const needsDirectory = index < segments.length || kind === 'directory';
    if (info.isSymbolicLink() || (needsDirectory && !info.isDirectory())) {
      warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: part || rel, reason: info.isSymbolicLink() ? 'link' : 'not a directory' });
      return false;
    }
    const fingerprint = identity(info);
    if (state.identities.has(part) && state.identities.get(part) !== fingerprint) {
      warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: part || rel, reason: 'changed' });
      return false;
    }
    state.identities.set(part, fingerprint);
    if (index === segments.length) return info;
  }
  return false;
}

/** opendir 반복자로 최대 10,001번째 항목까지만 검사한다. */
export async function listDir(state, rel) {
  if (state.fileExhausted || state.scanExhausted || !(await verifyPath(state, rel, 'directory'))) return [];
  const names = [];
  let dir;
  try {
    dir = await opendir(join(state.from, ...rel.split('/')));
    for await (const entry of dir) {
      if (state.entries >= VIBELORE_LIMITS.entries) {
        state.scanExhausted = true;
        warn(state, { code: 'IMPORT_TOO_MANY_ENTRIES', path: rel, limit: VIBELORE_LIMITS.entries });
        break;
      }
      state.entries += 1;
      names.push(entry.name);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
    return [];
  }
  if (!(await verifyPath(state, rel, 'directory'))) return [];
  return names.sort();
}

/** 열린 fd에서 limit+1 바이트까지만 읽는다. stat 이후 파일 확장에도 EOF까지 따라가지 않는다. */
async function readLimited(state, handle, limit) {
  const chunks = [];
  let length = 0;
  while (length <= limit) {
    const remainingTotal = VIBELORE_LIMITS.totalBytes - state.bytes;
    const size = Math.min(64 * 1024, limit + 1 - length, remainingTotal + 1);
    const buffer = Buffer.allocUnsafe(size);
    const { bytesRead } = await handle.read(buffer, 0, size, null);
    if (bytesRead === 0) break;
    state.bytes += bytesRead;
    if (state.bytes > VIBELORE_LIMITS.totalBytes) {
      throw new FolioError('IMPORT_SOURCE_TOO_LARGE', 'source exceeds the total byte limit');
    }
    chunks.push(buffer.subarray(0, bytesRead));
    length += bytesRead;
  }
  return Buffer.concat(chunks, length);
}

/** 마지막 성분은 O_NOFOLLOW, 모든 성분과 열린 파일의 identity를 대조한다. */
export async function readFileSafe(state, rel, limit) {
  if (state.fileExhausted) return null;
  if (state.files >= VIBELORE_LIMITS.files) {
    state.fileExhausted = true;
    warn(state, { code: 'IMPORT_TOO_MANY_FILES', path: rel, limit: VIBELORE_LIMITS.files });
    return null;
  }
  state.files += 1;
  const before = await verifyPath(state, rel, 'file');
  if (!before) return null;
  if (!before.isFile()) { warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: rel, reason: 'not a file' }); return null; }
  let handle;
  try {
    handle = await open(join(state.from, ...rel.split('/')), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: rel, reason: error?.code === 'ELOOP' ? 'link' : 'unreadable' });
    return null;
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || identity(opened) !== identity(before)) {
      warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: rel, reason: 'changed' });
      return null;
    }
    if (opened.size > limit) { warn(state, { code: 'IMPORT_FILE_TOO_LARGE', path: rel, limit }); return null; }
    if (!(await verifyPath(state, rel, 'file'))) return null;
    const bytes = await readLimited(state, handle, limit);
    if (!(await verifyPath(state, rel, 'file'))) return null;
    if (bytes.length > limit) { warn(state, { code: 'IMPORT_FILE_TOO_LARGE', path: rel, limit }); return null; }
    return bytes;
  } finally {
    await handle.close();
  }
}
