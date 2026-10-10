import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';

/** Inspect directory shapes, including hidden state; never follow links or open special files. */
export async function inspectPaths(root) {
  const info = await lstat(root);
  if (!info.isDirectory()) throw new FolioError('WORK_PATH_INVALID', 'Choose a regular work folder.');
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      const stat = await lstat(child);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new FolioError('WORK_PATH_UNSAFE', 'Inspection requires regular files and folders.', { path: child });
      }
      if (stat.isDirectory()) await walk(child);
    }
  }
  await walk(root);
}

/** Include every retained record and head, even one not used by enabled features. */
export async function ledgerNames(root) {
  const names = new Set(['receipts', 'events', 'decisions', 'tracking', 'workspace-state', 'assets']);
  const entries = await readdir(join(root, '.folio', 'ledger')).catch((error) => {
    if (error.code === 'ENOENT') return []; throw error;
  });
  for (const entry of entries) {
    if (/\.(jsonl|head)$/.test(entry)) names.add(entry.replace(/\.(jsonl|head)$/, ''));
  }
  return [...names].sort();
}
