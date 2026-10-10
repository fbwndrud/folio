import assert from 'node:assert/strict';
import { lstat, readdir, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectWork } from '../../core/diagnostics/work.js';
import { loadBuiltinPacks } from '../../packs/index.js';

/** Include empty directories, hidden caches/gates, links, modes and bytes, not access time. */
export async function snapshotFiles(root, relative = '', includeStats = false) {
  const result = [];
  for (const name of (await readdir(join(root, relative))).sort()) {
    const path = relative ? `${relative}/${name}` : name;
    const info = await lstat(join(root, path));
    const value = info.isSymbolicLink() ? await readlink(join(root, path)) : info.isDirectory() ? null : (await readFile(join(root, path))).toString('base64');
    result.push({ path, directory: info.isDirectory(), link: info.isSymbolicLink(), mode: info.mode, value,
      ...(includeStats ? { inode: info.ino, modified: info.mtimeMs, changed: info.ctimeMs } : {}) });
    if (info.isDirectory()) result.push(...await snapshotFiles(root, path, includeStats));
  }
  return result;
}

export async function unchangedInspection(root, packs) {
  const before = await snapshotFiles(root, '', true);
  const result = await inspectWork(root, { packs: packs ?? await loadBuiltinPacks() });
  assert.deepEqual(await snapshotFiles(root, '', true), before);
  assert.equal(result.ok, !result.checks.some((c) => c.status === 'error'));
  for (const check of result.checks) {
    assert.ok(check.name && check.message);
    assert.ok(['ok', 'warning', 'error'].includes(check.status));
  }
  return result;
}
