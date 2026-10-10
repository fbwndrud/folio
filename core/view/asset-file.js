import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import { sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';
import { ASSETS_DIR, readAssets } from '../store/assets.js';

/** 뷰어가 보여 주는 그림 파일 종류. 그 밖의 파일은 설명서가 가리켜도 내주지 않는다. */
export const ASSET_TYPES = Object.freeze({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif',
});
export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

const unavailable = (assetId, reason) => new FolioError('ASSET_FILE_UNAVAILABLE', `${String(assetId).slice(0, 100)}: ${reason}`, { assetId: String(assetId).slice(0, 100), reason });

/**
 * 그림 id → 이미지 바이트. 작품 폴더 밖은 읽지 않는다:
 * 설명서의 file 은 assets/ 기준 상대 경로여야 하고(절대 경로·빈 칸·`.`·`..`·NUL 바이트 거부), 지나는 폴더와 파일이
 * 링크면 거부, 보통 파일이어야 하고, 알려진 그림 종류(ASSET_TYPES)만, 20MiB 까지. 한 조각씩 lstat 으로 걸으며
 * 링크·있고 없음을 보고, 마지막 조각의 stat 정보로 보통 파일인지 미리 확인한다 — 소켓·장치·FIFO 는 열어 보지 않고
 * bail한다(장치를 결코 열지 않는다). 통과하면 링크를 따라가지 않고(O_NOFOLLOW, 되는 OS 에서) FIFO 로 바뀌어도
 * 멈추지 않게(O_NONBLOCK) 연다 — 확인과 여는 사이 바꿔치기됐을 때의 열기 오류(ENXIO/EOPNOTSUPP/ELOOP/
 * ENAMETOOLONG/NUL 바이트)도 원문 그대로 던지지 않고 같은 응답으로 갈무리한다.
 * 설명서는 그림 파일을 읽지 않고 찾는다(readAssets hashFiles: false — 요청마다 모든 그림을 다시 읽지 않는다).
 * 지나는 자리가 파일이라 더 못 들어가거나(ENOTDIR) 이름이 너무 길면(ENAMETOOLONG) missing 이다.
 * @param {string} root
 * @param {string} assetId
 * @param {{ assets?: Map<string, any>, singleLink?: boolean }} [options]
 * @returns {Promise<{ type: string, bytes: Buffer }>}
 */
export async function readAssetFile(root, assetId, { assets: catalog, singleLink = false } = {}) {
  const assets = catalog ?? (await readAssets(root, { hashFiles: false })).assets;
  const asset = assets.get(assetId);
  if (!asset) throw new FolioError('ASSET_NOT_FOUND', String(assetId).slice(0, 200));
  const file = asset.file;
  if (typeof file !== 'string' || !file) throw unavailable(assetId, 'no file');
  if (file.includes('\0')) throw unavailable(assetId, 'path');
  const parts = file.split(/[\\/]/);
  if (isAbsolute(file) || parts.some((part) => part === '' || part === '.' || part === '..')) throw unavailable(assetId, 'path');
  const type = ASSET_TYPES[extname(file).toLowerCase()];
  if (!type) throw unavailable(assetId, 'type');
  let at = root;
  let last;
  for (const part of [ASSETS_DIR, ...parts]) {
    at = join(at, part);
    last = await lstat(at).catch((error) => {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR' || error?.code === 'ENAMETOOLONG') return null;
      throw error;
    });
    if (!last) throw unavailable(assetId, 'missing');
    if (last.isSymbolicLink()) throw unavailable(assetId, 'link');
  }
  if (!last.isFile()) throw unavailable(assetId, 'not a file');
  let handle;
  try {
    handle = await open(at, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    if (error?.code === 'ENXIO' || error?.code === 'EOPNOTSUPP') throw unavailable(assetId, 'not a file');
    if (error?.code === 'ELOOP') throw unavailable(assetId, 'link');
    if (error?.code === 'ENAMETOOLONG') throw unavailable(assetId, 'missing');
    if (error?.code === 'ERR_INVALID_ARG_VALUE') throw unavailable(assetId, 'path');
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw unavailable(assetId, 'not a file');
    if (singleLink && info.nlink !== 1) throw unavailable(assetId, 'link');
    if (info.size > MAX_ASSET_BYTES) throw unavailable(assetId, 'too large');
    const bytes = await handle.readFile();
    if (asset.managed && sha256(bytes) !== asset.output?.contentHash) throw unavailable(assetId, 'content changed');
    return { type, bytes };
  } finally {
    await handle.close();
  }
}
