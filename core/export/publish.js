import * as filesystem from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { FolioError } from '../errors.js';
import { publishTree } from '../util/publish-tree.js';
const same = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino;
const unchanged = (a, b) => same(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs;
const statOrNull = (fs, path) => fs.lstat(path).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });

/** 새 외부 폴더에만 쓴다. 정리할 때도 자기 inode 중 바뀌지 않은 것만 제거한다. */
export async function publishExport(root, output, files, { fs = filesystem } = {}) {
  if (typeof output !== 'string' || !isAbsolute(output) || output.includes('\0')) throw new FolioError('EXPORT_OUTPUT_INVALID', '출력은 작품 밖의 새 절대 경로여야 한다');
  const sourceRoot = await fs.realpath(root), requested = resolve(output);
  const parent = await fs.realpath(dirname(requested)).catch(() => { throw new FolioError('EXPORT_OUTPUT_INVALID', '출력 부모 폴더가 있어야 한다'); });
  const target = join(parent, basename(requested));
  const inside = relative(sourceRoot, target);
  if (inside === '' || (!inside.startsWith('../') && !isAbsolute(inside))) throw new FolioError('EXPORT_OUTPUT_INVALID', '작품 안에 내보낼 수 없다');
  if (await statOrNull(fs, target)) throw new FolioError('EXPORT_ROOT_EXISTS', '출력 폴더가 이미 있다', { target });
  const parentInfo = await fs.lstat(parent);
  const temp = await fs.mkdtemp(join(parent, '.folio-export-'));
  let tempInfo = null; const ownFiles = [], ownDirs = [];
  async function verify() {
    if (!same(await fs.lstat(parent), parentInfo) || !same(await fs.lstat(temp), tempInfo)) throw new FolioError('EXPORT_PARENT_CHANGED', '출력 부모 또는 임시 폴더가 바뀌었다');
    for (const dir of ownDirs) if (!same(await fs.lstat(join(temp, dir.rel)), dir.info)) throw new FolioError('EXPORT_STAGE_CHANGED', '임시 하위 폴더가 바뀌었다');
  }
  async function cleanup() {
    if (!tempInfo) return false;
    try {
      if (!same(await fs.lstat(parent), parentInfo) || !same(await statOrNull(fs, temp), tempInfo)) return false;
      let clean = true;
      for (const file of [...ownFiles].reverse()) {
        const found = await statOrNull(fs, join(temp, file.rel));
        if (found === null) continue;
        if (!unchanged(found, file.info)) { clean = false; continue; }
        await fs.unlink(join(temp, file.rel));
      }
      for (const dir of [...ownDirs].reverse()) {
        if (!same(await statOrNull(fs, join(temp, dir.rel)), dir.info)) { clean = false; continue; }
        try { await fs.rmdir(join(temp, dir.rel)); } catch { clean = false; }
      }
      try { await fs.rmdir(temp); } catch { clean = false; }
      return clean;
    } catch { return false; }
  }
  try {
    tempInfo = await fs.lstat(temp); if (!tempInfo.isDirectory()) throw new FolioError('EXPORT_STAGE_CHANGED', '임시 폴더가 아니다');
    const paths = [...files.keys()].filter((path) => path !== 'manifest.json').sort().concat('manifest.json');
    for (const rel of paths) {
      await verify();
      const parts = rel.split('/');
      if (parts.some((part) => !part || part === '.' || part === '..') || rel.startsWith('/') || rel.includes('\\')) throw new FolioError('EXPORT_STAGE_INVALID', '내부 출력 경로가 잘못됐다');
      let prefix = '';
      for (const part of parts.slice(0, -1)) {
        prefix = prefix ? `${prefix}/${part}` : part;
        if (!ownDirs.some((dir) => dir.rel === prefix)) {
          await verify(); await fs.mkdir(join(temp, prefix)); const info = await fs.lstat(join(temp, prefix));
          if (!info.isDirectory()) throw new FolioError('EXPORT_STAGE_CHANGED', '임시 하위 폴더가 바뀌었다');
          ownDirs.push({ rel: prefix, info });
        }
      }
      await verify(); await fs.writeFile(join(temp, rel), files.get(rel), { flag: 'wx' });
      ownFiles.push({ rel, info: await fs.lstat(join(temp, rel)) });
    }
    await verify(); await publishTree(temp, target, { fs, marker: 'manifest.json', prefix: 'EXPORT' });
    const cleaned = await cleanup();
    return { target, warnings: cleaned ? [] : [{ code: 'EXPORT_TEMP_CLEANUP_PENDING', temp, message: '결과는 완성됐고 임시 폴더 정리가 남았다' }] };
  } catch (error) {
    const cleaned = await cleanup();
    error.details = { ...(error.details ?? {}), target, temp, cleanupPending: Boolean(error.details?.cleanupPending) || !cleaned };
    throw error;
  }
}
