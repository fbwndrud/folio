/**
 * 영수증 목록 거르기: 건너뛴 단계 id(예: critic 을 건너뛴 장면만), 다시 확인 필요만, 커밋된 것만.
 * @param {Array<{ committed: boolean, skipped: string[], stale: boolean|null, recheck: boolean|null, flagged: boolean|null, drift: string|null }>} nodes
 * @param {{ skipped?: string|null, attention?: boolean, committedOnly?: boolean }} filter
 */
export function filterReceipts(nodes, { skipped = null, attention = false, committedOnly = false } = {}) {
  return nodes.filter((node) => {
    if (committedOnly && !node.committed) return false;
    if (skipped && !node.skipped.includes(skipped)) return false;
    if (attention && !(node.stale || node.recheck || node.flagged || node.drift)) return false;
    return true;
  });
}

/** 목록에 나오는 건너뛴 단계 id(정렬, 중복 없음). */
export const skippedStepIds = (nodes) => [...new Set(nodes.flatMap((n) => n.skipped))].sort();
