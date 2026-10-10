import { constants } from 'node:fs';
import { open, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { sha256 } from '../util/hash.js';
import { assertManagedPath } from '../util/managed-path.js';

/** Hash every ledger/head and run file, without following links or opening special files. */
async function directoryState(root, relative) {
  const path = join(root, relative);
  await assertManagedPath(root, path, { directory: true });
  const entries = await readdir(path, { withFileTypes: true }).catch((e) => { if (e.code === 'ENOENT') return []; throw e; });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) throw new FolioError('VIEW_CHANGED', 'unsupported file in writing records');
    const handle = await open(join(path, entry.name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      if (!(await handle.stat()).isFile()) throw new FolioError('VIEW_CHANGED', 'writing record is not a regular file');
      files.push([entry.name, sha256(await handle.readFile())]);
    } finally { await handle.close(); }
  }
  return files;
}

/** No persistent cache: one export shares one model, then checks fresh bytes again. */
export async function writingCheckpoint(root, work) {
  const ledgers = await directoryState(root, '.folio/ledger');
  const runs = await directoryState(root, '.folio/runs');
  const yaml = await readFile(join(root, 'work.yaml'), 'utf8');
  return sha256(JSON.stringify({ work, ledgers, runs, yaml }, (_key, value) => value instanceof Map ? [...value] : value));
}

export async function assertWritingCheckpoint(root, checkpoint) {
  if (await writingCheckpoint(root, await openWork(root)) !== checkpoint) {
    throw new FolioError('VIEW_CHANGED', 'writing data changed while reading; retry the view');
  }
}
