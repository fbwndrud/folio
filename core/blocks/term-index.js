import { preorder } from '../store/tree.js';
import { scanMentions } from '../index/scan.js';
import { occurrenceStates } from '../occurrences/state.js';
import { PROMISE_KIND } from '../promise.js';
import { subtreeOf } from './subtree.js';

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const nfc = (text) => String(text).normalize('NFC');

/**
 * 색인(N3 계약, core/index/query.js 가 이름을 고정해 내보낸다). 엔티티마다 그것이 나오는 본문 잎 노드를 읽는 순서로.
 * - 나옴 = 이름·별칭 스캔(index.db 와 같은 규칙: core/index/scan.js, 긴 말 먼저, 코드 블록 제외) 또는 앞머리 entities 선언
 *   또는 기록된 등장 위치(M4, 지금 본문에서 다시 찾은 것만). 위치마다 { nodeId, title, count, declared, marks }.
 * - 인쇄되는 본문만 가리킨다: 잎 노드이고 role: body. 계획(가지 노드)·서문(front)·부록(back)은 넣지 않는다.
 * - kinds 를 주면 그 종류만, 없으면 약속(promise)을 뺀 모든 종류. 나오는 곳이 없는 엔티티는 빠진다.
 * - 순서: 이름(NFC) 코드 순 → id 순(한글 음절은 가나다 순이다).
 * occurrenceRecords 가 null 이면 기록된 등장 위치를 보지 않는다(occurrences 기능이 꺼졌거나 기록장을 못 읽음).
 * nodeId 를 주면 그 가지만(장별 색인). 없는 노드는 NODE_NOT_FOUND.
 * @param {any} work openWork 결과
 * @param {{ occurrenceRecords?: any[]|null, nodeId?: string, kinds?: string[] }} [options]
 */
export function termIndex(work, { occurrenceRecords = null, nodeId, kinds } = {}) {
  const inScope = subtreeOf(work.tree, nodeId);
  const entities = [...work.entities.values()];
  const wanted = (entity) => (Array.isArray(kinds) ? kinds.includes(entity.kind) : entity.kind !== PROMISE_KIND);
  const marked = new Map();
  for (const mark of occurrenceRecords === null ? [] : occurrenceStates(work, occurrenceRecords)) {
    if (mark.status === 'stale' || mark.surface.kind !== 'node') continue;
    const key = `${mark.entityId}\u0000${mark.surface.id}`;
    marked.set(key, (marked.get(key) ?? 0) + 1);
  }
  const locations = new Map(entities.filter(wanted).map((entity) => [entity.id, []]));
  for (const id of preorder(work.tree)) {
    const node = work.tree.nodes.get(id);
    if (node.kind !== 'leaf' || node.role !== 'body' || (inScope && !inScope.has(id))) continue;
    const counts = scanMentions(node.body, entities);
    for (const [entityId, list] of locations) {
      const count = counts.get(entityId) ?? 0;
      const declared = node.entities.includes(entityId);
      const marks = marked.get(`${entityId}\u0000${id}`) ?? 0;
      if (count > 0 || declared || marks > 0) list.push({ nodeId: id, title: node.title, count, declared, marks });
    }
  }
  const entries = entities.filter((entity) => locations.get(entity.id)?.length > 0)
    .map((entity) => ({ entityId: entity.id, name: entity.name, kind: entity.kind, locations: locations.get(entity.id) }))
    .sort((a, b) => byText(nfc(a.name), nfc(b.name)) || byText(a.entityId, b.entityId));
  return { entries };
}
