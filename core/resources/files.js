import { randomUUID } from 'node:crypto';
import { immutableWriteFault } from './immutable-write-fault.js';
import { link, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FolioError } from '../errors.js';
import { assertManagedPath } from '../util/managed-path.js';
import { sha256 } from '../util/hash.js';
import { assertRevisionId, MAX_RESOURCE_BYTES } from './schema.js';

export function resourceObjectPath(root, hash, type) {
  assertRevisionId(hash);
  return join(root, '.folio', 'resources', type, hash.slice(7) + (type === 'revisions' ? '.json' : '.bin'));
}
export async function readObject(root, path, limit = MAX_RESOURCE_BYTES) {
  await assertManagedPath(root, path);
  let bytes;
  try {
    if ((await stat(path)).size > limit) throw new FolioError('RESOURCE_TOO_LARGE', 'stored object exceeds byte limit');
    bytes = await readFile(path);
  }
  catch (error) { if (error.code === 'ENOENT') throw new FolioError('RESOURCE_OBJECT_MISSING', 'immutable object is missing', { path }); throw error; }
  if (bytes.length > limit) throw new FolioError('RESOURCE_TOO_LARGE', 'stored object exceeds byte limit');
  return bytes;
}
export async function writeImmutable(root, path, bytes) {
  const owned = Buffer.from(bytes);
  if (owned.length > MAX_RESOURCE_BYTES) throw new FolioError('RESOURCE_TOO_LARGE', 'immutable object exceeds byte limit');
  await assertManagedPath(root, path);
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.immutable-${randomUUID()}.tmp`);
  await assertManagedPath(root, temp);
  try {
    const writer = immutableWriteFault() ?? writeFile;
    await writer(temp, owned, { flag: 'wx' });
    await assertManagedPath(root, path);
    try { await link(temp, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await readObject(root, path)).equals(owned)) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'immutable object cannot be replaced');
    }
  } finally {
    await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}
export async function readOwnedContent(root, envelope) {
  const bytes = await readObject(root, resourceObjectPath(root, envelope.contentHash, 'content'));
  if (sha256(bytes) !== envelope.contentHash || bytes.length !== envelope.byteLength) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'snapshot hash or byte length differs');
  return bytes;
}
