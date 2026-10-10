import { lstat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { FolioError } from '../errors.js';

/** 선택된 root 아래의 Folio 관리 경로만 검사한다. OS 조상 별칭은 범위 밖이다. */
export async function assertManagedPath(root, path, { directory = false } = {}) {
  const base = resolve(root);
  const target = resolve(path);
  const parts = relative(base, target).split(sep);
  if (parts[0] !== '.folio' || parts.some((part) => part === '..')) throw new FolioError('MANAGED_PATH_INVALID', target);
  let current = base;
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || (index < parts.length - 1 || directory ? !stat.isDirectory() : !stat.isFile())) {
        throw new FolioError('MANAGED_PATH_UNSAFE', 'Folio state requires regular files and directories', { path: current });
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
