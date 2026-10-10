import { constants } from 'node:fs';
import { open, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import { FolioError } from '../errors.js';
import { ID } from '../store/ids.js';
import { openWork } from '../store/work.js';
import { SOURCES_DIR, addSourceFile, assertSourcesDirSafe, isTextSourceFile } from '../store/sources.js';
import { withWorkLock } from '../run/work-lock.js';
import { assertFeature } from '../work/features.js';
import { sha256 } from '../util/hash.js';
import { stringifyYaml } from '../util/yaml.js';

/** 한 자료 원본의 크기 한도. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/** 설명서 reliability 로 받는 값. sources.reliability 검사는 low 만 본다. */
export const RELIABILITIES = Object.freeze(['low', 'medium', 'high']);
const MAX_SPANS = 200;
const cut = (value) => String(value).slice(0, 300);

/**
 * 작가가 고른 로컬 파일 하나를 그대로 읽는다(N2 결정 17). 절대 경로, 링크가 아닌 보통 파일, 10MiB 까지.
 * O_NOFOLLOW 로 링크를 따라가지 않고, O_NONBLOCK 으로 FIFO 에서 멈추지 않는다. 연 뒤 fstat 으로 보통 파일인지 본다(검사와 읽기 사이 바꿔치기 없음).
 * @param {unknown} path
 * @returns {Promise<Buffer>}
 */
async function readLocalFile(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    throw new FolioError('SOURCE_PATH_INVALID', 'path must be an absolute path to one file', { path: cut(path) });
  }
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    throw new FolioError('SOURCE_PATH_INVALID', 'cannot open the file (missing, a link, or not readable)', { path: cut(path), errno: error?.code ?? null });
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new FolioError('SOURCE_PATH_INVALID', 'not a regular file', { path: cut(path) });
    if (info.size > MAX_SOURCE_BYTES) throw new FolioError('SOURCE_TOO_LARGE', `${info.size} bytes`, { path: cut(path), bytes: info.size, max: MAX_SOURCE_BYTES });
    const bytes = await handle.readFile();
    if (bytes.length > MAX_SOURCE_BYTES) throw new FolioError('SOURCE_TOO_LARGE', `${bytes.length} bytes`, { path: cut(path), bytes: bytes.length, max: MAX_SOURCE_BYTES });
    return bytes;
  } finally {
    await handle.close();
  }
}

/** 복사본 확장자: 원래 확장자(소문자, 영숫자 1~8자)를 쓰고, 아니면 .bin. 글(text)은 .txt. .yaml 은 설명서 이름과 겹치므로 받지 않는다(.bin). */
const suffixOf = (path) => {
  const ext = extname(path).toLowerCase();
  return ext !== '.yaml' && /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '.bin';
};

/** spans: [{ id, quote }]. id 는 작품 id 규칙, 중복 없음. 글 자료면 인용이 그 글(NFC)에 있어야 한다. */
function readSpans(spans, text) {
  if (spans === undefined) return [];
  if (!Array.isArray(spans) || spans.length > MAX_SPANS) throw new FolioError('SOURCE_SPANS_INVALID', 'spans must be a list of { id, quote }');
  const seen = new Set();
  return spans.map((span, index) => {
    const valid = span && typeof span === 'object' && typeof span.id === 'string' && ID.test(span.id) && !seen.has(span.id)
      && typeof span.quote === 'string' && span.quote.trim().length >= 2 && span.quote.length <= 500;
    if (!valid) throw new FolioError('SOURCE_SPANS_INVALID', `span ${index}`, { index });
    if (text !== null && !text.normalize('NFC').includes(span.quote.normalize('NFC'))) {
      throw new FolioError('SOURCE_SPAN_NOT_FOUND', `span ${span.id} is not in the source text`, { index, spanId: span.id });
    }
    seen.add(span.id);
    return { id: span.id, quote: span.quote };
  });
}

const exists = (path) => stat(path).then(() => true, (error) => (error?.code === 'ENOENT' ? false : Promise.reject(error)));

/**
 * 자료 하나를 더한다(folio_sources add). 글(text) 또는 로컬 파일(path) 중 하나를 sources/<id>.<확장자>로 한 번만 쓰고 설명서 sources/<id>.yaml 을 쓴다.
 * - 원본은 덮지 않는다: 같은 id 의 자료·설명서가 있으면 SOURCE_EXISTS, 같은 이름의 원본만 남아 있으면 SOURCE_IMMUTABLE(addSourceFile).
 * - 파일 이름은 id(작품 id 규칙)와 정리한 확장자로만 만든다 — 호스트가 준 이름·경로 조각은 쓰지 않는다(sources/ 밖으로 못 나간다).
 * - 모든 검증(spans 포함)이 끝난 뒤에 쓴다. 설명서 쓰기가 실패하면 이 호출이 방금 쓴 원본만 지운다.
 * - 읽은 파일은 결과의 read 에 경로·바이트 수·hash 로 밝힌다. 작업 잠금 안에서 돈다. sources 기능이 켜져 있어야 한다.
 * @param {string} root
 * @param {{ id?: unknown, title?: unknown, date?: unknown, reliability?: unknown, spans?: unknown, text?: unknown, path?: unknown }} input
 */
export async function addSource(root, input) {
  return withWorkLock(root, async () => {
    // sources/ 가 링크면(작품 밖으로 쓰기) 다른 무엇보다 먼저 멈춘다 — 원본·설명서 어느 쪽도 쓰기 전에(N2 결정 17).
    await assertSourcesDirSafe(root);
    const work = await openWork(root);
    assertFeature(work.config, 'sources');
    const { id, title = '', date = null, reliability = null, spans, text, path } = input ?? {};
    if (typeof id !== 'string' || !ID.test(id) || id.length > 100) throw new FolioError('ID_INVALID', `source.id: ${cut(id)}`);
    if ((text === undefined) === (path === undefined) || (text !== undefined && (typeof text !== 'string' || text.length === 0))) {
      throw new FolioError('SOURCE_INPUT_INVALID', 'give exactly one of text (non-empty) or path');
    }
    if (typeof title !== 'string' || (date !== null && typeof date !== 'string') || (reliability !== null && !RELIABILITIES.includes(/** @type {any} */ (reliability)))) {
      throw new FolioError('SOURCE_INPUT_INVALID', 'title and date are strings; reliability is low, medium or high', { reliabilities: RELIABILITIES });
    }
    if (work.sources.has(id) || await exists(join(root, SOURCES_DIR, `${id}.yaml`))) throw new FolioError('SOURCE_EXISTS', id, { id });
    if (typeof text === 'string' && Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES) {
      throw new FolioError('SOURCE_TOO_LARGE', `${Buffer.byteLength(text, 'utf8')} bytes`, { bytes: Buffer.byteLength(text, 'utf8'), max: MAX_SOURCE_BYTES });
    }
    const bytes = typeof text === 'string' ? Buffer.from(text, 'utf8') : await readLocalFile(path);
    const file = `${id}${typeof text === 'string' ? '.txt' : suffixOf(path)}`;
    const cleanSpans = readSpans(spans, isTextSourceFile(file) ? bytes.toString('utf8') : null);
    const meta = { id, title, file, ...(date !== null ? { date } : {}), ...(reliability !== null ? { reliability } : {}), spans: cleanSpans };
    await addSourceFile(root, file, bytes);
    try {
      await writeFile(join(root, SOURCES_DIR, `${id}.yaml`), stringifyYaml(meta), { flag: 'wx' });
    } catch (error) {
      await unlink(join(root, SOURCES_DIR, file)).catch(() => {});
      // 댕글링 링크 등으로 설명서 이름이 이미 차 있으면 wx 가 EEXIST 를 던진다 — INTERNAL_ERROR 대신 SOURCE_EXISTS 로 알린다.
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EEXIST') throw new FolioError('SOURCE_EXISTS', id, { id });
      throw error;
    }
    return {
      source: { id, title, file, date, reliability, spans: cleanSpans },
      read: typeof text === 'string' ? null : { path, bytes: bytes.length, sha256: sha256(bytes) },
    };
  });
}
