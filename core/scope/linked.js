import { eventsOn } from '../ledger/events.js';
import { linkedNodeIds } from '../links/graph.js';

const NOTHING = Object.freeze({ nodeIds: Object.freeze([]), events: Object.freeze([]) });

/**
 * 순서 밖 노드의 앞쪽 범위(정본 §10 끝): "앞선 모든 사건" 대신 "연결된 노드의 사건"(N4).
 * 읽는 순서 까닭(positions 의 unorderedBy)에 따라 갈린다.
 * - 'none': 이 노드의 links 가 가리키는 있는 노드(한 단계, 자기 자신 제외)의 사건.
 * - 'branching': N7 이 경로별로 정한다. 지금은 모으지 않는다(갈림 자리 — 이 case 만 바꾼다).
 * - null(읽는 순서 안)·'role'(front·back): 모으지 않는다. 앞 사건은 eventsBefore 몫이다.
 * linkScope 기능이 꺼지면 모으지 않는다. 결과는 priorEvents 와 섞지 않는다 — 앞뒤를 따지는 검사가 연결 사건을 "앞"으로 읽지 못하게.
 * @param {{ work: any, events: any[], nodeId: string }} input
 * @returns {{ nodeIds: readonly string[], events: readonly any[] }}
 */
export function linkedScope({ work, events, nodeId }) {
  if (!work.config?.features?.linkScope) return NOTHING;
  switch (work.positions.get(nodeId)?.unorderedBy ?? null) {
    case 'none': {
      const nodeIds = linkedNodeIds(work, nodeId);
      return { nodeIds, events: eventsOn({ events, positions: work.positions, nodeIds }) };
    }
    case 'branching':
      return NOTHING; // N7: 경로별 범위가 이 자리를 채운다.
    default:
      return NOTHING;
  }
}
