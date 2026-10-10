import { DatabaseSync } from 'node:sqlite';
import { FolioError } from '../errors.js';
import { indexPath } from './rebuild.js';
import { TABLES } from './schema.js';

const plain = (rows) => rows.map((row) => ({ ...row }));

export const openIndex = (root) => new DatabaseSync(indexPath(root), { readOnly: true });

/** 모든 표를 모든 열 기준으로 정렬해 덤프한다. 재생성 동일성 비교용. */
export function dumpIndex(db) {
  const out = {};
  for (const table of TABLES) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    out[table] = plain(db.prepare(`SELECT * FROM ${table} ORDER BY ${columns.join(', ')}`).all());
  }
  return out;
}

export const nodesInReadingOrder = (db) => db.prepare('SELECT id FROM nodes ORDER BY ordinal').all().map((r) => r.id);

/** 관리 대상도 가짜 파일 경로 없이 조회한다. */
export function entitiesInIndex(db) {
  return plain(db.prepare('SELECT id, kind, name, path, rev, storage FROM entities ORDER BY id').all())
    .map((entity) => ({ ...entity, managed: entity.storage === 'tracking' }));
}

export function usagesOf(db, entityId) {
  return plain(db.prepare(`
    SELECT o.surface_kind AS surfaceKind, o.surface_id AS surfaceId, o.origin, o.count
    FROM occurrences o LEFT JOIN nodes n ON o.surface_kind = 'node' AND n.id = o.surface_id
    WHERE o.entity_id = ?
    ORDER BY o.surface_kind, COALESCE(n.ordinal, -1), o.surface_id, o.origin`).all(entityId));
}

export function eventsFor(db, entityId) {
  return plain(db.prepare(`
    SELECT e.event_id AS eventId, e.node_id AS nodeId, e.kind
    FROM events e JOIN nodes n ON n.id = e.node_id
    WHERE e.entity_id = ? AND e.active = 1
    ORDER BY n.ordinal, e.seq`).all(entityId));
}

/** 호스트가 제출한 등장 위치(기록장 투영). 노드 표면은 읽는 순서로, 그 뒤 엔티티·그림·자료. */
export function marksOf(db, entityId) {
  return plain(db.prepare(`
    SELECT m.surface_kind AS surfaceKind, m.surface_id AS surfaceId, m.field, m.kind, m.quote, m.start, m.status, m.origin
    FROM marks m LEFT JOIN nodes n ON m.surface_kind = 'node' AND n.id = m.surface_id
    WHERE m.entity_id = ?
    ORDER BY CASE m.surface_kind WHEN 'node' THEN 0 WHEN 'entity' THEN 1 WHEN 'asset' THEN 2 ELSE 3 END,
      COALESCE(n.ordinal, -1), m.surface_id, m.field, COALESCE(m.start, -1), m.kind`).all(entityId));
}

/**
 * N3 계약 — M6b 뷰어(블록 화면)와 N8 내보내기가 쓰는 조회. 이 이름과 인자 모양은 바꾸지 않는다(바꾸려면 쓰는 레인의 테스트와 같은 커밋에서).
 * 모두 openWork 결과(work)에서 바로 계산한다: index.db 도 작업 잠금도 쓰지 않는다(M6 V10 과 같은 길). 기록장은 호출자가 읽어 넘긴다(null = 보지 않음).
 * 기능 확인(`blocks`·`bibliography`·`termIndex`)은 호출자가 한다: 이 함수들은 기능이 꺼져 있는지 스스로 검사하지 않으므로, 작가가 기능을 껐으면 호출자가 아예 호출하지 않거나 결과를 보여주지 않아야 한다.
 * - blockCatalog(work, { nodeId? }) → { blocks, refs, footnotes, citations, problems }
 * - bibliography(work, { evidenceRecords?, nodeId? }) → { entries, evidence }
 * - termIndex(work, { occurrenceRecords?, nodeId?, kinds? }) → { entries }
 * - parseNodeMarks(body) → { anchors, refs, footnoteRefs, footnotes, citations }(본문 조각에 표시를 붙일 때)
 * - BLOCK_KINDS: 번호 종류(fig·tbl·eq) → 이름
 */
export { blockCatalog } from '../blocks/catalog.js';
export { bibliography } from '../blocks/bibliography.js';
export { termIndex } from '../blocks/term-index.js';
export { BLOCK_KINDS, parseNodeMarks } from '../blocks/syntax.js';

export function compareInIndex(db, a, b) {
  const get = db.prepare('SELECT ordinal, ordered FROM nodes WHERE id = ?');
  const pa = get.get(a);
  const pb = get.get(b);
  if (!pa || !pb) throw new FolioError('NODE_NOT_FOUND', !pa ? a : b);
  if (!pa.ordered || !pb.ordered) return 'not_applicable';
  if (pa.ordinal === pb.ordinal) return 'same';
  return pa.ordinal < pb.ordinal ? 'before' : 'after';
}

/**
 * N4 계약 — N7(분기·게임북)과 M6b 뷰어가 쓰는 노드 연결 표 조회. 이 이름과 인자 모양은 바꾸지 않는다(바꾸려면 쓰는 레인의 테스트와 같은 커밋에서).
 * 모두 openWork 결과(work)에서 바로 계산한다: index.db 도 작업 잠금도 쓰지 않는다. 기능 확인(`links`)은 호출자가 한다.
 * - linkTable(work, { nodeId? }) → { links, backlinks, problems }(nodeId 를 주면 그 가지만, 없는 노드는 NODE_NOT_FOUND)
 * - linksFrom(work, nodeId) → 그 노드가 가리키는 링크 / linksTo(work, nodeId) → 다른 노드에서 그 노드로 오는 링크
 * - 링크 한 줄: { from, to, kind, label, index, valid }. 문제 한 줄: { code: 'LINK_BROKEN'|'LINK_SELF', nodeId, to, kind, index }
 */
export { linkTable, linksFrom, linksTo } from '../links/graph.js';
