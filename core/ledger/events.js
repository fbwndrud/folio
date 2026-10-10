/** supersedes 로 가려진 사건을 뺀 현재 유효한 사건. 기록 자체는 지우지 않는다. */
export function activeEvents(records) {
  const superseded = new Set(records.flatMap((record) => record.supersedes ?? []));
  return records.filter((record) => record.type === 'event' && !superseded.has(record.eventId));
}

/** 대상 노드보다 읽는 순서상 앞선 사건. 가지·층과 무관하다. */
export function eventsBefore({ events, positions, nodeId }) {
  const target = positions.get(nodeId);
  if (!target?.ordered) return { applicable: false, events: [] };
  const earlier = events.filter((event) => {
    const position = positions.get(event.nodeId);
    return position?.ordered && position.ordinal < target.ordinal;
  });
  earlier.sort((a, b) => positions.get(a.nodeId).ordinal - positions.get(b.nodeId).ordinal || a.seq - b.seq);
  return { applicable: true, events: earlier };
}

/**
 * 주어진 노드들에 기록된 사건(N4 순서 없는 범위 — 연결된 노드의 사건). 앞인지 뒤인지 따지지 않는다.
 * 읽는 순서 번호 → seq 순. positions 에 없는 노드의 사건은 뺀다.
 */
export function eventsOn({ events, positions, nodeIds }) {
  const on = new Set(nodeIds);
  const found = events.filter((event) => on.has(event.nodeId) && positions.has(event.nodeId));
  found.sort((a, b) => positions.get(a.nodeId).ordinal - positions.get(b.nodeId).ordinal || a.seq - b.seq);
  return found;
}
