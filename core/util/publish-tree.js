import * as filesystem from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FolioError } from '../errors.js';

const sameEntry = (left, right) => left.dev === right.dev && left.ino === right.ino;
const sameFile = (left, right) => sameEntry(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs;
const pathIn = (root, rel) => rel ? join(root, rel) : root;

async function listStage(temp, fs, marker, prefix) {
  const dirs = [];
  const files = [];
  async function visit(rel) {
    for (const entry of await fs.readdir(pathIn(temp, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { dirs.push(child); await visit(child); }
      else if (entry.isFile()) files.push(child);
      else throw new FolioError(`${prefix}_STAGE_INVALID`, `stage contains a non-file entry: ${child}`);
    }
  }
  await visit('');
  if (!files.includes(marker)) throw new FolioError(`${prefix}_STAGE_INVALID`, '게시 완료 표시 파일이 없다');
  return { dirs: dirs.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)), files: files.filter((f) => f !== marker).sort().concat(marker) };
}

/** 완성된 temp를 배타 게시한다. 실패 시 이 호출이 만든 inode 중 변경되지 않은 것만 되돌린다. */
export async function publishTree(temp, target, { fs = filesystem, marker = 'work.yaml', prefix: errorPrefix = 'IMPORT' } = {}) {
  const stage = await listStage(temp, fs, marker, errorPrefix);
  const parent = dirname(target);
  const parentInfo = await fs.lstat(parent);
  const createdDirs = [];
  const createdFiles = [];
  let rootInfo = null;
  let reserved = false;
  let pending = false;

  async function owned(rel, expected) {
    const found = await fs.lstat(pathIn(target, rel)).catch(() => null);
    return found && sameEntry(found, expected) ? found : null;
  }
  async function verifyPath(rel) {
    const currentParent = await fs.lstat(parent).catch(() => null);
    if (!currentParent || !sameEntry(currentParent, parentInfo)) throw new FolioError(`${errorPrefix}_PARENT_CHANGED`, 'target parent changed during publication');
    if (!rootInfo || !(await owned('', rootInfo))) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'reserved target changed during publication');
    const parts = rel ? rel.split('/') : [];
    let prefix = '';
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      const expected = createdDirs.find((dir) => dir.rel === prefix)?.info;
      if (!expected || !(await owned(prefix, expected))) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'published directory changed during publication');
    }
  }
  try {
    try { await fs.mkdir(target); }
    catch (error) {
      if (error?.code === 'EEXIST') throw new FolioError(`${errorPrefix}_ROOT_EXISTS`, 'import root appeared before publication', { target });
      throw error;
    }
    reserved = true;
    rootInfo = await fs.lstat(target);
    if (!rootInfo.isDirectory()) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'reserved target is not a directory');
    for (const rel of stage.dirs) {
      await verifyPath(dirname(rel) === '.' ? '' : dirname(rel));
      await fs.mkdir(pathIn(target, rel));
      const info = await fs.lstat(pathIn(target, rel));
      createdDirs.push({ rel, info });
      if (!info.isDirectory()) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'published directory changed during publication');
    }
    for (const rel of stage.files) {
      await verifyPath(dirname(rel) === '.' ? '' : dirname(rel));
      const source = pathIn(temp, rel);
      const sourceInfo = await fs.lstat(source);
      if (!sourceInfo.isFile()) throw new FolioError(`${errorPrefix}_STAGE_INVALID`, `stage file changed: ${rel}`);
      await fs.link(source, pathIn(target, rel));
      createdFiles.push({ rel, info: sourceInfo });
      const targetInfo = await fs.lstat(pathIn(target, rel));
      if (!targetInfo.isFile() || !sameFile(targetInfo, sourceInfo)) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'published file changed during publication');
    }
    await verifyPath('');
    const publishedWork = createdFiles.at(-1);
    const foundWork = await owned(marker, publishedWork.info);
    if (!foundWork || !sameFile(foundWork, publishedWork.info)) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'published work changed before completion');
    return target;
  } catch (error) {
    if (rootInfo) {
      const currentParent = await fs.lstat(parent).catch(() => null);
      if (!currentParent || !sameEntry(currentParent, parentInfo) || !(await owned('', rootInfo))) pending = true;
      else {
        for (const { rel, info } of createdFiles.reverse()) {
          const found = await owned(rel, info);
          if (!found || !sameFile(found, info)) { pending = true; continue; }
          try { await fs.unlink(pathIn(target, rel)); } catch { pending = true; }
        }
        for (const { rel, info } of createdDirs.reverse()) {
          if (!(await owned(rel, info))) { pending = true; continue; }
          try { await fs.rmdir(pathIn(target, rel)); } catch { pending = true; }
        }
        try { await fs.rmdir(target); } catch { pending = true; }
      }
    } else if (reserved) pending = true;
    if (error instanceof FolioError && error.code === `${errorPrefix}_ROOT_EXISTS`) throw error;
    throw new FolioError(`${errorPrefix}_PUBLISH_FAILED`, '완성 결과를 게시할 수 없다', {
      target, cause: error?.code ?? 'UNKNOWN', cleanupPending: pending,
    });
  }
}
