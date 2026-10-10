import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';

const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json']);
const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** 팩의 보조 코드·JSON까지 포함한다. 경로는 '/'로 고정하고 링크는 따라가지 않는다. */
export async function readPackCode(dir) {
  const files = [];
  async function scan(parts) {
    const entries = (await readdir(join(dir, ...parts), { withFileTypes: true })).sort(byName);
    for (const entry of entries) {
      const next = [...parts, entry.name];
      const path = next.join('/');
      if (entry.isSymbolicLink()) {
        throw new FolioError('PACK_INVALID', `PACK_CODE_PATH_INVALID@${path}`, {
          errors: [{ code: 'PACK_CODE_PATH_INVALID', path }],
        });
      }
      if (entry.isDirectory()) await scan(next);
      else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) {
        files.push([path, sha256(await readFile(join(dir, ...next)))]);
      }
    }
  }
  await scan([]);
  return files;
}
