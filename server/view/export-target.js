import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FolioError } from '../../core/errors.js';

export const EXPORT_DIR = 'exports/viewer';
export const EXPORT_MARKER = '.folio-export';
export const lstatOrNull = (path) => lstat(path).catch((e) => { if (e?.code === 'ENOENT') return null; throw e; });
const same = (a, b) => a === null ? b === null : b !== null && a.dev === b.dev && a.ino === b.ino;

/** One cooperating export at a time. A stopped process leaves a visible lock for manual recovery. */
export async function prepareExportTarget(root) {
  const parent = join(root, 'exports');
  const info = await lstatOrNull(parent);
  if (info && !info.isDirectory()) throw new FolioError('EXPORT_DIR_INVALID', 'exports must be a plain folder');
  await mkdir(parent, { recursive: true });
  const lock = join(parent, '.viewer-export.lock');
  try { await mkdir(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new FolioError('EXPORT_BUSY', 'Another export is active, or an interrupted export needs recovery');
    throw error;
  }
  const target = join(root, EXPORT_DIR);
  const temp = join(parent, `.viewer-${randomUUID()}.tmp`);
  const backup = join(parent, `.viewer-${randomUUID()}.backup`);
  let targetInfo, markerInfo;
  const release = () => rm(lock, { recursive: true, force: true });
  try {
    targetInfo = await lstatOrNull(target);
    markerInfo = targetInfo?.isDirectory() ? await lstatOrNull(join(target, EXPORT_MARKER)) : null;
    if (targetInfo && (!targetInfo.isDirectory() || !markerInfo?.isFile())) {
      throw new FolioError('EXPORT_DIR_NOT_OURS', 'The output folder was not made by Linivera', { dir: EXPORT_DIR });
    }
  } catch (error) { await release(); throw error; }
  return { temp, release, async publish() {
    if (!same(targetInfo, await lstatOrNull(target)) || !same(markerInfo, await lstatOrNull(join(target, EXPORT_MARKER)))) throw new FolioError('EXPORT_TARGET_CHANGED', 'The output folder changed during export');
    let saved = false;
    try {
      if (targetInfo) { await rename(target, backup); saved = true; }
      if (await lstatOrNull(target)) throw new FolioError('EXPORT_TARGET_CHANGED', 'The output folder changed during export');
      await rename(temp, target);
    } catch (error) {
      if (saved) {
        try {
          if (await lstatOrNull(target)) throw new FolioError('EXPORT_TARGET_CHANGED', 'The output folder is occupied');
          await rename(backup, target);
        } catch {
          throw new FolioError('EXPORT_RECOVERY_REQUIRED', 'The previous review copy is preserved in the backup folder', { backup, target, reason: error.code ?? 'EXPORT_FAILED' });
        }
      }
      throw error;
    }
    if (saved) await rm(backup, { recursive: true, force: true });
  } };
}
