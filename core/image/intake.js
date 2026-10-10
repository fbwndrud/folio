import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';

/** 호스트가 만든 그림 한 장의 크기 한도(뷰어가 내주는 한도와 같다). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** 받는 그림 형식: 내용 앞머리(magic bytes)로 판정한다. 파일 이름 확장자는 믿지 않는다. SVG 는 받지 않는다(스크립트를 품을 수 있다). */
const FORMATS = Object.freeze([
  { ext: '.png', type: 'image/png', test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.jpg', type: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', type: 'image/gif', test: (b) => b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { ext: '.webp', type: 'image/webp', test: (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
]);

const cut = (value) => String(value).slice(0, 300);

/** 바이트의 그림 형식. 모르는 형식이면 null. */
export const imageFormatOf = (bytes) => FORMATS.find((f) => f.test(bytes)) ?? null;

/**
 * 호스트가 만든 그림 파일 하나를 읽는다(folio_sources add 의 로컬 파일 읽기와 같은 규칙, N2 결정 17).
 * 절대 경로, 링크가 아닌 보통 파일(O_NOFOLLOW·O_NONBLOCK, 연 손잡이의 fstat 으로 다시 확인), 20MiB 까지, PNG·JPEG·GIF·WebP 내용만.
 * 원본은 읽기만 한다. 돌려준 바이트만 작품 안(.folio/image-runs)에 옮겨 쓴다 — 그 뒤 원본이 바뀌어도 그림 실행은 옮긴 바이트를 본다.
 * @param {unknown} path
 * @returns {Promise<{ bytes: Buffer, ext: string, type: string, hash: string }>}
 */
export async function readHostImage(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    throw new FolioError('IMAGE_PATH_INVALID', 'path must be the absolute path of one image file', { path: cut(path) });
  }
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    throw new FolioError('IMAGE_PATH_INVALID', 'cannot open the image (missing, a link, or not readable)', { path: cut(path), errno: error?.code ?? null });
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new FolioError('IMAGE_PATH_INVALID', 'not a regular file', { path: cut(path) });
    if (info.size > MAX_IMAGE_BYTES) throw new FolioError('IMAGE_TOO_LARGE', `${info.size} bytes`, { bytes: info.size, max: MAX_IMAGE_BYTES });
    const buf = Buffer.allocUnsafe(MAX_IMAGE_BYTES + 1);
    let offset = 0;
    let bytesRead;
    do {
      const result = await handle.read(buf, offset, buf.length - offset, offset);
      bytesRead = result.bytesRead;
      if (bytesRead > 0) {
        offset += bytesRead;
        if (offset > MAX_IMAGE_BYTES) throw new FolioError('IMAGE_TOO_LARGE', `${offset} bytes`, { bytes: offset, max: MAX_IMAGE_BYTES });
      }
    } while (bytesRead > 0);
    const bytes = Buffer.from(buf.subarray(0, offset));
    const format = imageFormatOf(bytes);
    if (!format) throw new FolioError('IMAGE_TYPE_UNSUPPORTED', 'only PNG, JPEG, GIF and WebP images are accepted', { path: cut(path) });
    return { bytes, ext: format.ext, type: format.type, hash: sha256(bytes) };
  } finally {
    await handle.close();
  }
}
