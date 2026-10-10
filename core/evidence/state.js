import { reanchor } from '../occurrences/anchor.js';
import { latestByNode } from './records.js';
import { checkSourceQuote } from './source-quote.js';

/**
 * 기록된 근거 연결이 지금 본문·자료에서 어떤지. 파일이 정본이고 이 결과는 매번 새로 계산한다.
 * - 주장 위치: 노드가 없으면 stale(NODE_MISSING), 아니면 M4 다시 찾기(reanchor)로 located/relocated/stale. 짐작하지 않는다.
 * - 연결마다 verified: 지금 자료에 그 인용이 있는가. 원본은 한 번 쓰기라 움직이지 않지만 설명서(spans)와 자료 목록은 바뀔 수 있다.
 * @param {{ tree: { nodes: Map<string, any> }, sources: Map<string, any> }} work
 * @param {any[]} records
 */
export function evidenceStates(work, records) {
  const out = [];
  for (const record of latestByNode(records).values()) {
    const node = work.tree.nodes.get(record.nodeId);
    for (const claim of record.claims) {
      const at = node ? reanchor(node.body, claim) : { status: 'stale', start: null, reason: 'NODE_MISSING' };
      const sources = claim.sources.map((link) => ({
        sourceId: link.sourceId, quote: link.quote, verified: checkSourceQuote(work.sources.get(link.sourceId), link.quote).ok,
      }));
      out.push({ nodeId: record.nodeId, quote: claim.quote, before: claim.before, after: claim.after, sources, origin: record.origin, seq: record.seq, ...at });
    }
  }
  return out;
}

/** 다시 찾지 못한 주장(작가·호스트가 다시 연결해야 하는 것). */
export const staleEvidence = (states) => states.filter((s) => s.status === 'stale').map(({ nodeId, quote, reason }) => ({ nodeId, quote, reason }));
