import { FolioError } from '../../core/errors.js';
import { openWork } from '../../core/store/work.js';
import { withWorkLock } from '../../core/run/work-lock.js';
import { buildIndexGeneration, publishIndexGeneration } from '../../core/index/generation.js';
import { bibliography, blockCatalog, eventsFor, linkTable, marksOf, openIndex, termIndex, usagesOf } from '../../core/index/query.js';
import { EVIDENCE_LEDGER } from '../../core/evidence/records.js';
import { readLedgerView } from '../../core/view/ledgers.js';
import { candidatesFor } from '../../core/occurrences/candidates.js';
import { OCCURRENCES_LEDGER, readOccurrences } from '../../core/occurrences/records.js';
import { surfaceFields } from '../../core/occurrences/surfaces.js';
import { planRename } from '../../core/rename/plan.js';
import { assertFeature } from '../../core/work/features.js';

const nodeView = (node) => ({
  id: node.id, level: node.level, kind: node.kind, role: node.role, status: node.status, title: node.title,
  parentId: node.parentId, children: [...node.children], path: node.path, data: node.data, body: node.body,
});
const entityView = (entity) => ({ id: entity.id, kind: entity.kind, name: entity.name, aliases: entity.aliases, path: entity.path, data: entity.data, body: entity.body,
  ...(entity.managed ? { managed: true, storage: entity.storage } : {}) });

/** 블록·참고문헌·색인(N3)의 id: 노드 id 면 그 노드와 자손만, '*' 면 작품 전체(노드 id 는 '*' 일 수 없다). */
const WHOLE_WORK = '*';
const scopeOf = (id) => (id === WHOLE_WORK ? {} : { nodeId: id });
/**
 * 참고문헌·색인이 읽는 기록장. 기능이 꺼지면 { records: null, ledger: null }. hash 사슬이 깨졌으면 던지지 않고
 * records: null, ledger: { ok: false, line } — 깨진 기록은 한 줄도 쓰지 않고 파일(본문 인용·이름 스캔)만으로 답한다(N2 결정 19와 같은 길).
 */
const ledgerFor = (root, on, name) => (on ? readLedgerView(root, name) : Promise.resolve({ records: null, ledger: null }));

/**
 * folio_find. 노드는 파일에서, 엔티티는 파일과 추적 기록장 정의에서 읽는다.
 * 사용처·사건 이력·후보·이름 바꾸기 계획은 작업 잠금 안에서 파일과 기록장으로 다시 만든 뒤 읽는다(파생 캐시라 언제든 다시 만들 수 있다).
 * rename 은 계획만 만든다 — 아무것도 쓰지 않는다. 글 전체(text)는 돌려주지 않고 path·beforeHash 만 준다.
 * blocks(N3)는 파일에서 바로 계산한다. bibliography·terms 는 기록장(근거 연결·등장 위치)도 읽으므로 작업 잠금 안에서 읽는다.
 * 셋 다 id 로 범위를 정한다(노드 id 또는 '*'). 기능(blocks·bibliography·termIndex)이 꺼지면 FEATURE_DISABLED.
 * links(N4, 노드 연결 표)도 파일에서 바로 계산하고(잠금 없음) 같은 id 규칙을 쓴다. links 기능이 꺼지면 FEATURE_DISABLED.
 * @param {string} root
 * @param {{ query: 'node'|'entity'|'usages'|'events'|'candidates'|'rename'|'blocks'|'bibliography'|'terms'|'links', id: string, kind?: string,
 *   newName?: string, keepOldName?: boolean, include?: string[], exclude?: string[] }} request
 */
export async function findInWork(root, { query, id, kind = 'node', newName, keepOldName, include, exclude }) {
  if (query === 'blocks') {
    const work = await openWork(root);
    assertFeature(work.config, 'blocks');
    return { scope: id, ...blockCatalog(work, scopeOf(id)) };
  }
  if (query === 'links') {
    const work = await openWork(root);
    assertFeature(work.config, 'links');
    return { scope: id, ...linkTable(work, scopeOf(id)) };
  }
  if (query === 'node' || query === 'entity') {
    const work = await openWork(root);
    if (query === 'node') {
      const node = work.tree.nodes.get(id);
      if (!node) throw new FolioError('NODE_NOT_FOUND', id);
      return { node: nodeView(node) };
    }
    const entity = work.entities.get(id);
    if (!entity) throw new FolioError('ENTITY_NOT_FOUND', id);
    return { entity: entityView(entity) };
  }
  if (query === 'rename' && newName === undefined) throw new FolioError('FIND_ARGS_INVALID', 'rename needs newName', { query });
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    if (query === 'bibliography') {
      assertFeature(work.config, 'bibliography');
      const { records, ledger } = await ledgerFor(root, work.config.features.evidence, EVIDENCE_LEDGER);
      return { scope: id, ...bibliography(work, { evidenceRecords: records, ...scopeOf(id) }), ledger };
    }
    if (query === 'terms') {
      assertFeature(work.config, 'termIndex');
      const { records, ledger } = await ledgerFor(root, work.config.features.occurrences, OCCURRENCES_LEDGER);
      return { scope: id, ...termIndex(work, { occurrenceRecords: records, ...scopeOf(id) }), ledger };
    }
    if (query === 'candidates') {
      // 후보는 등장 위치 제출을 돕는 도구다 — occurrences 가 꺼져 있으면 쓸 데가 없으니 거부한다(Ruling F-5).
      assertFeature(work.config, 'occurrences');
      if (!surfaceFields(work, kind, id)) throw new FolioError('SURFACE_NOT_FOUND', `${kind}:${id}`.slice(0, 200), { surface: { kind, id } });
      return { surface: { kind, id }, candidates: candidatesFor(work, await readOccurrences(root), { kind, id }) };
    }
    if (!work.entities.has(id)) throw new FolioError('ENTITY_NOT_FOUND', id);
    if (query === 'rename') {
      assertFeature(work.config, 'rename');
      const plan = planRename(work, await readOccurrences(root), { entityId: id, newName, keepOldName, include, exclude });
      return { ...plan, files: plan.files.map(({ path, beforeHash }) => ({ path, beforeHash })) };
    }
    await publishIndexGeneration(root, await buildIndexGeneration(root));
    const db = openIndex(root);
    try {
      return query === 'usages' ? { entityId: id, usages: usagesOf(db, id), marks: marksOf(db, id) } : { entityId: id, events: eventsFor(db, id) };
    } finally {
      db.close();
    }
  });
}
