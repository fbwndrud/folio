import { FolioError } from '../errors.js';
import { parseDoc } from '../store/frontmatter.js';
import { ID } from '../store/ids.js';
import { addImportWarning } from './warnings.js';

/** 가져온 회차 중 어느 아크에도 없는 것을 모으는 아크. */
export const FALLBACK_ARC = Object.freeze({ id: 'arc-imported', title: '가져온 회차' });
/** 인물 앞머리에서 가져오는 필드. 그 밖 vibelore 내부 계약 필드는 가져오지 않는다. */
export const CHARACTER_FIELDS = Object.freeze(['gender', 'role']);

const text = (value, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
export const episodeId = (number) => `ep-${String(number).padStart(3, '0')}`;

/** 앞머리가 깨졌으면 경고를 남기고 글 전체를 본문으로 둔다. */
function readDoc(file, warnings) {
  try { return parseDoc(file.text, { source: file.path }); } catch {
    addImportWarning(warnings, { code: 'IMPORT_FRONTMATTER_INVALID', path: file.path });
    return { data: {}, body: file.text };
  }
}

const trimBody = (body) => `${body.replace(/^\s*\n/, '').trimEnd()}\n`;

/** 같은 정규화 번호가 서로 다른 출처에 있으면 조용한 자료 손실을 막는다. */
function assertUniqueNumbers(files, code) {
  const firstByNumber = new Map();
  for (const file of files) {
    const first = firstByNumber.get(file.number);
    if (first !== undefined) {
      throw new FolioError(code, `number ${file.number} appears in both ${first} and ${file.path}`, {
        number: file.number, first, second: file.path,
      });
    }
    firstByNumber.set(file.number, file.path);
  }
}

/** 버리지 않은 아크(번호 순). 한 회차는 그 회차를 처음 적은 아크에 간다. */
function arcsOf(read, chapters, warnings) {
  const taken = new Map();
  const arcs = [];
  for (const arc of read.arcs) {
    const json = arc.json;
    if (json.status === 'rejected' || json.rejectedAt) continue;
    const listed = Array.isArray(json.episodes) ? json.episodes.filter((e) => Number.isInteger(e?.chapter)) : [];
    const id = `arc-${arc.number}`;
    const episodes = [];
    for (const entry of listed) {
      if (!chapters.has(entry.chapter)) continue;
      if (taken.has(entry.chapter)) {
        const kept = taken.get(entry.chapter);
        addImportWarning(warnings, { code: kept === id ? 'IMPORT_CHAPTER_DUPLICATE_IN_ARC' : 'IMPORT_CHAPTER_IN_TWO_ARCS', chapter: entry.chapter, kept, path: arc.path });
        continue;
      }
      taken.set(entry.chapter, id);
      episodes.push({ number: entry.chapter, plannedTitle: text(entry.title) });
    }
    if (episodes.length === 0) { addImportWarning(warnings, { code: 'IMPORT_ARC_EMPTY', path: arc.path }); continue; }
    arcs.push({ id, title: text(json.title) ?? `${arc.number}부`, body: text(json.promise, 4000) ? `${text(json.promise, 4000)}\n` : '', origin: { path: arc.path, sha256: arc.sha256 }, episodes });
  }
  const rest = [...chapters.keys()].filter((n) => !taken.has(n)).map((number) => ({ number, plannedTitle: null }));
  if (rest.length) arcs.push({ id: FALLBACK_ARC.id, title: FALLBACK_ARC.title, body: '', origin: null, episodes: rest });
  return arcs;
}

/** 같은 회차 그림 폴더가 여럿이면 모두 가져오고 경고한다. */
function picturesOf(read, number, warnings) {
  const found = read.pictures.filter((p) => p.episode === number);
  if (found.length > 1) addImportWarning(warnings, { code: 'IMPORT_PICTURES_MULTIPLE', chapter: number, paths: found.map((p) => p.path) });
  return found.map((picture, index) => {
    const id = `${episodeId(number)}-webtoon${index ? `-${index + 1}` : ''}`;
    return { id, file: `${id}.svg`, bytes: picture.bytes, origin: { path: picture.path, sha256: picture.sha256 } };
  });
}

function entityOf(file, kind, warnings) {
  const { data, body } = readDoc(file, warnings);
  const base = file.path.split('/').pop().replace(/\.md$/, '').toLowerCase();
  const id = kind === 'character' && typeof data.id === 'string' ? data.id.toLowerCase() : base;
  if (!ID.test(id) || id.length > 100) { addImportWarning(warnings, { code: 'IMPORT_ENTITY_ID_INVALID', path: file.path }); return null; }
  const name = kind === 'character' ? text(data.name) : id;
  if (!name) { addImportWarning(warnings, { code: 'IMPORT_ENTITY_NAME_MISSING', path: file.path }); return null; }
  const fields = { id, kind, name };
  if (kind === 'character') {
    fields.aliases = Array.isArray(data.aliases) ? data.aliases.map((a) => text(a)).filter(Boolean).slice(0, 50) : [];
    for (const key of CHARACTER_FIELDS) if (text(data[key])) fields[key] = text(data[key]);
  }
  return { id, kind, data: fields, body: trimBody(body), origin: { path: file.path, sha256: file.sha256 } };
}

/**
 * 읽은 원본을 Folio 작품 계획으로 바꾼다. 쓰기는 하지 않는다. 영수증은 출처 경로와 hash만 보존한다.
 * @param {Awaited<ReturnType<typeof import('./read-source.js').readVibelore>>} read
 */
export function mapVibelore(read) {
  const warnings = [...read.warnings];
  assertUniqueNumbers(read.chapters, 'IMPORT_CHAPTER_DUPLICATE');
  assertUniqueNumbers(read.arcs.filter((arc) => arc.json.status !== 'rejected' && !arc.json.rejectedAt), 'IMPORT_ARC_DUPLICATE');
  const chapters = new Map(read.chapters.map((c) => [c.number, c]));
  const arcs = arcsOf(read, chapters, warnings).map((arc) => ({
    ...arc,
    episodes: arc.episodes.map(({ number, plannedTitle }) => {
      const file = chapters.get(number);
      const { data, body } = readDoc(file, warnings);
      return {
        id: episodeId(number), number, title: text(data.title) ?? plannedTitle ?? `${number}화`, body: trimBody(body),
        origin: { path: file.path, sha256: file.sha256, receipts: read.receipts.filter((r) => r.chapter === number).map((r) => ({ path: r.path, sha256: r.sha256 })) },
        pictures: picturesOf(read, number, warnings),
      };
    }),
  }));
  const entities = [];
  for (const [kind, files] of [['character', read.characters], ['world', read.world]]) {
    for (const file of files) {
      const entity = entityOf(file, kind, warnings);
      if (!entity) continue;
      if (entities.some((e) => e.id === entity.id)) { addImportWarning(warnings, { code: 'IMPORT_ENTITY_DUPLICATE', id: entity.id, path: file.path }); continue; }
      entities.push(entity);
    }
  }
  const covered = new Set(arcs.flatMap((a) => a.episodes.map((e) => e.number)));
  for (const picture of read.pictures) if (!covered.has(picture.episode)) addImportWarning(warnings, { code: 'IMPORT_PICTURE_NO_CHAPTER', path: picture.path });
  return { arcs, entities, warnings };
}
