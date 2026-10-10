import { preorder } from '../store/tree.js';
import { evidenceStates } from '../evidence/state.js';
import { parseNodeMarks } from './syntax.js';
import { subtreeOf } from './subtree.js';

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** 글자 위치 → 줄 번호(1부터). */
const lineAt = (text, offset) => String(text).slice(0, offset).split('\n').length;

/**
 * 참고문헌(N3 계약, core/index/query.js 가 이름을 고정해 내보낸다). 이 작품이 실제로 인용한 자료만 싣는다.
 * - 인용 = 본문 `[[source:id]]`(있는 자료만) + 근거 연결(N2 기록장). 근거 연결은 주장을 지금 본문에서 다시 찾았고(located·relocated)
 *   자료 인용이 지금 자료에 있는(verified) 것만 센다 — 다시 찾지 못한 주장은 folio_status evidence.stale 이 알린다.
 * - 번호는 처음 인용된 읽는 순서(노드 → 줄 → 본문 인용이 근거 연결보다 앞)로 1부터. citedIn 은 { nodeId, via: 'citation'|'evidence' } 를 읽는 순서로, 겹치지 않게.
 * - 자료 설명서와 근거 기록을 읽기만 한다. 기록장은 호출자가 읽어 넘긴다. evidenceRecords 가 null 이면 근거 연결을 보지 않고 evidence: false.
 * nodeId 를 주면 그 가지의 인용만 보고 번호도 그 안에서 새로 매긴다(장별 참고문헌). 없는 노드는 NODE_NOT_FOUND.
 * @param {any} work openWork 결과
 * @param {{ evidenceRecords?: any[]|null, nodeId?: string }} [options]
 */
export function bibliography(work, { evidenceRecords = null, nodeId } = {}) {
  const inScope = subtreeOf(work.tree, nodeId);
  const order = new Map(preorder(work.tree).map((id, index) => [id, index]));
  const cites = [];
  for (const id of order.keys()) {
    if (inScope && !inScope.has(id)) continue;
    for (const citation of parseNodeMarks(work.tree.nodes.get(id).body).citations) {
      if (work.sources.has(citation.sourceId)) cites.push({ sourceId: citation.sourceId, nodeId: id, line: citation.line, via: 'citation' });
    }
  }
  for (const state of evidenceRecords === null ? [] : evidenceStates(work, evidenceRecords)) {
    if (state.status === 'stale' || (inScope && !inScope.has(state.nodeId))) continue;
    const line = lineAt(work.tree.nodes.get(state.nodeId).body, state.start);
    for (const link of state.sources) {
      if (link.verified && work.sources.has(link.sourceId)) cites.push({ sourceId: link.sourceId, nodeId: state.nodeId, line, via: 'evidence' });
    }
  }
  cites.sort((a, b) => order.get(a.nodeId) - order.get(b.nodeId) || a.line - b.line || byText(a.via, b.via));
  const entries = new Map();
  for (const cite of cites) {
    if (!entries.has(cite.sourceId)) {
      const source = work.sources.get(cite.sourceId);
      entries.set(cite.sourceId, {
        number: entries.size + 1, sourceId: source.id, title: source.title, date: source.date, reliability: source.reliability, file: source.file, citedIn: [],
      });
    }
    const entry = entries.get(cite.sourceId);
    if (!entry.citedIn.some((c) => c.nodeId === cite.nodeId && c.via === cite.via)) entry.citedIn.push({ nodeId: cite.nodeId, via: cite.via });
  }
  return { entries: [...entries.values()], evidence: evidenceRecords !== null };
}
