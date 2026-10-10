import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;
export const MEDIA_TYPES = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' });
const fail = (code, message) => new FolioError(code, message);

/** 새 도구가 닿는 저장 폴더는 링크를 따라가지 않는다. 기존 작품의 경로 자체는 작가가 선택한다. */
export async function assertAssetDirs(root) {
  for (const path of ['.folio', '.folio/ledger', '.folio/runs', 'assets', 'assets/files']) {
    const info = await lstat(join(root, path)).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
    if (info && !info.isDirectory()) throw fail('ASSET_DIRECTORY_INVALID', `${path} must be a plain directory`);
  }
  for (const path of ['.folio/ledger/assets.jsonl', '.folio/ledger/assets.head']) {
    const info = await lstat(join(root, path)).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
    if (info && !info.isFile()) throw fail('ASSET_DIRECTORY_INVALID', `${path} must be a plain file`);
  }
}

/** 일반 파일 하나를 열린 손잡이에서 크기를 제한해 읽는다. FIFO와 링크는 열기/검사에서 거부한다. */
export async function readAssetBytes(path) {
  let handle;
  try {
    if (!(await lstat(path)).isFile()) throw fail('ASSET_PATH_INVALID', 'not a plain file');
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  }
  catch { throw fail('ASSET_PATH_INVALID', 'cannot read a regular file without following a link'); }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw fail('ASSET_PATH_INVALID', 'not a regular file');
    if (!info.size || info.size > MAX_ASSET_BYTES) throw fail('ASSET_SIZE_INVALID', `file must contain 1..${MAX_ASSET_BYTES} bytes`);
    const chunks = [];
    let length = 0;
    for (;;) {
      const buffer = Buffer.alloc(Math.min(65536, MAX_ASSET_BYTES + 1 - length));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      chunks.push(buffer.subarray(0, bytesRead)); length += bytesRead;
      if (length > MAX_ASSET_BYTES) throw fail('ASSET_SIZE_INVALID', `file exceeds ${MAX_ASSET_BYTES} bytes`);
    }
    if (!length) throw fail('ASSET_SIZE_INVALID', 'empty file');
    return Buffer.concat(chunks);
  } finally { await handle.close(); }
}

/**
 * 입력을 파일 사본 또는 미확인 URI로 변환한다. URI를 열거나 다운로드하지 않는다.
 * @param {string} _root
 * @param {string} id
 * @param {{ path?: string, uri?: string, mediaType: string, contentHash?: string, origin?: object }} input
 */
export async function prepareOutput(_root, id, { path, uri, mediaType, contentHash, origin = {} }) {
  if (!Object.hasOwn(MEDIA_TYPES, mediaType)) throw fail('ASSET_INPUT_INVALID', 'unsupported mediaType');
  if ((path === undefined) === (uri === undefined)) throw fail('ASSET_INPUT_INVALID', 'give exactly one of path or uri');
  if (uri !== undefined) {
    if (typeof uri !== 'string' || !/^[a-z][a-z0-9+.-]*:[^\s]+$/i.test(uri) || /^(file|data|javascript):/i.test(uri)) throw fail('ASSET_INPUT_INVALID', 'uri must be an external resource reference');
    return { output: { kind: 'reference', uri, mediaType, reportedHash: contentHash ?? null, origin }, bytes: null };
  }
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw fail('ASSET_PATH_INVALID', 'path must be absolute');
  const bytes = await readAssetBytes(path);
  const hash = sha256(bytes);
  if (contentHash !== undefined && contentHash !== hash) throw fail('ASSET_HASH_MISMATCH', 'input contentHash differs from the actual bytes');
  const file = `files/${id}-${hash.slice(7)}.${MEDIA_TYPES[mediaType]}`;
  return { output: { kind: 'file', file, mediaType, contentHash: hash, bytes: bytes.length, origin }, bytes };
}

/** 불변 사본. 재시도 때 기존 사본이 같은 바이트면 재사용하고, 다른 바이트면 거부한다. */
export async function storeOutput(root, output, bytes) {
  if (!bytes) return;
  const owned = Buffer.from(bytes);
  await assertAssetDirs(root);
  await mkdir(join(root, 'assets', 'files'), { recursive: true });
  const target = join(root, 'assets', output.file);
  const stage = join(root, 'assets', 'files', `.asset-${randomUUID()}.tmp`);
  try {
    await writeFile(stage, owned, { flag: 'wx' });
    await assertAssetDirs(root);
    try { await link(stage, target); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (sha256(await readAssetBytes(target)) !== output.contentHash) throw fail('ASSET_IMMUTABLE', 'an existing snapshot has different bytes');
    }
  } finally {
    await unlink(stage).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function inspectOutput(root, output) {
  if (!output) return { state: 'planned', actualHash: null };
  if (output.kind === 'reference') return { state: 'reference_only', actualHash: null };
  try {
    const actualHash = sha256(await readAssetBytes(join(root, 'assets', output.file)));
    return { state: actualHash === output.contentHash ? 'ready' : 'content_changed', actualHash };
  } catch { return { state: 'content_missing', actualHash: null }; }
}
