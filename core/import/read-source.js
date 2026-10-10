import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { listDir, readFileSafe, VIBELORE_LIMITS, warn } from './source-safety.js';

export { VIBELORE_LIMITS };

/** 읽는 자리와 이름 규칙. 이 밖의 파일(.vibelore 의 다른 상태, 실행 기록, 그림 계획)은 열지 않는다. */
const CHAPTER = /^(\d{1,5})\.md$/;
const DOC = /^[A-Za-z0-9][\w-]{0,99}\.md$/;
const ARC = /^(\d{1,4})\.json$/;
const RECEIPT = /^[A-Za-z0-9][\w-]{0,99}\.json$/;
const EPISODE_DIR = /^(\d{1,5})-[A-Za-z0-9][\w-]{0,99}$/;

async function readText(state, rel) {
  const bytes = await readFileSafe(state, rel, VIBELORE_LIMITS.text);
  return bytes ? { path: rel, text: bytes.toString('utf8'), sha256: sha256(bytes) } : null;
}

async function readJson(state, rel) {
  const bytes = await readFileSafe(state, rel, VIBELORE_LIMITS.json);
  if (!bytes) return null;
  try {
    const json = JSON.parse(bytes.toString('utf8'));
    if (json && typeof json === 'object' && !Array.isArray(json)) return { path: rel, json, sha256: sha256(bytes) };
  } catch { /* 아래 경고 */ }
  warn(state, { code: 'IMPORT_JSON_INVALID', path: rel });
  return null;
}

/**
 * vibelore 작품 폴더를 읽기만 한다. 쓰지 않는다. 정해진 자리의 정해진 이름만 연다:
 * chapters/<n>.md, characters/*.md, world/*.md, .vibelore/arcs/<n>.json, .vibelore/check-receipts/*.json,
 * webtoon/episodes/<회차>-<id>/episode.svg. from 자신이 링크이거나 폴더가 아니면 IMPORT_FROM_INVALID, 회차가 없으면 IMPORT_FROM_EMPTY.
 * @param {string} from  절대 경로
 */
export async function readVibelore(from) {
  if (typeof from !== 'string' || !isAbsolute(from) || from.includes('\0')) throw new FolioError('IMPORT_FROM_INVALID', 'from must be an absolute path');
  const normalized = resolve(from);
  const info = await lstat(normalized).catch(() => null);
  if (!info?.isDirectory()) throw new FolioError('IMPORT_FROM_INVALID', 'from must be a directory, not a link or a file', { reason: info?.isSymbolicLink() ? 'link' : info ? 'not a directory' : 'missing' });
  const canonical = await realpath(normalized);
  const canonicalInfo = await lstat(canonical);
  if (canonicalInfo.dev !== info.dev || canonicalInfo.ino !== info.ino) {
    throw new FolioError('IMPORT_FROM_INVALID', 'source directory changed while opening');
  }
  const state = { from: canonical, warnings: [], files: 0, entries: 0, bytes: 0, fileExhausted: false, scanExhausted: false, identities: new Map([['', `${info.dev}:${info.ino}:${info.mode & 0o170000}`]]) };
  const out = { chapters: [], characters: [], world: [], arcs: [], receipts: [], pictures: [], warnings: state.warnings };
  for (const name of await listDir(state, 'chapters')) {
    if (state.fileExhausted) break;
    const match = CHAPTER.exec(name);
    if (!match) { warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: `chapters/${name}`, reason: 'name' }); continue; }
    const read = match ? await readText(state, `chapters/${name}`) : null;
    if (read) out.chapters.push({ number: Number(match[1]), ...read });
  }
  out.chapters.sort((a, b) => a.number - b.number);
  for (const [dir, list] of /** @type {Array<[string, any[]]>} */ ([['characters', out.characters], ['world', out.world]])) {
    if (state.fileExhausted) break;
    for (const name of await listDir(state, dir)) {
      if (state.fileExhausted) break;
      if (!DOC.test(name)) { warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: `${dir}/${name}`, reason: 'name' }); continue; }
      const read = DOC.test(name) ? await readText(state, `${dir}/${name}`) : null;
      if (read) list.push(read);
    }
  }
  for (const name of await listDir(state, '.vibelore/arcs')) {
    if (state.fileExhausted) break;
    const match = ARC.exec(name);
    if (!match) { warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: `.vibelore/arcs/${name}`, reason: 'name' }); continue; }
    const read = match ? await readJson(state, `.vibelore/arcs/${name}`) : null;
    if (read) out.arcs.push({ number: Number(match[1]), ...read });
  }
  out.arcs.sort((a, b) => a.number - b.number);
  for (const name of await listDir(state, '.vibelore/check-receipts')) {
    if (state.fileExhausted) break;
    if (!RECEIPT.test(name)) { warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: `.vibelore/check-receipts/${name}`, reason: 'name' }); continue; }
    const read = RECEIPT.test(name) ? await readJson(state, `.vibelore/check-receipts/${name}`) : null;
    // 판정(verdict)·점수는 들고 오지 않는다 — 어느 회차의 영수증인지와 파일 hash 만.
    if (read && Number.isInteger(read.json.chapter)) out.receipts.push({ path: read.path, sha256: read.sha256, chapter: read.json.chapter });
  }
  for (const name of await listDir(state, 'webtoon/episodes')) {
    if (state.fileExhausted) break;
    const match = EPISODE_DIR.exec(name);
    if (!match) { warn(state, { code: 'IMPORT_ENTRY_SKIPPED', path: `webtoon/episodes/${name}`, reason: 'name' }); continue; }
    const rel = `webtoon/episodes/${name}`;
    if (!(await listDir(state, rel)).includes('episode.svg')) continue;
    const bytes = await readFileSafe(state, `${rel}/episode.svg`, VIBELORE_LIMITS.svg);
    if (bytes) out.pictures.push({ episode: Number(match[1]), path: `${rel}/episode.svg`, bytes, sha256: sha256(bytes) });
  }
  if (out.chapters.length === 0) throw new FolioError('IMPORT_FROM_EMPTY', 'no chapters/<n>.md to import', { warnings: state.warnings.slice(0, 20) });
  return out;
}
