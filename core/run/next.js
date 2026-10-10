import { preorder } from '../store/tree.js';
import { doneNodes } from './done.js';

function latestRunByNode(runs) {
  const latest = new Map();
  for (const run of runs) latest.set(run.nodeId, run);
  return latest;
}

/**
 * 다음 노드: 커밋 안 된 잎, 자식 없는 가지(큰 틀부터), 자식이 다 끝난 가지(돌아보기·묶기).
 * 끝남은 앞머리 committed + 커밋 기록이다(doneNodes). 커밋 기록 없이 앞머리만 committed 인 노드는 다시 고른다.
 * 마지막 실행이 버려진(abandoned) 노드는 여전히 건너뛴다 — 다시 돌리려면 노드를 짚어 run 한다.
 */
export function pickNext(work, receiptRecords, runs = []) {
  const latest = latestRunByNode(runs);
  const done = doneNodes(work, receiptRecords);
  for (const id of preorder(work.tree)) {
    const node = work.tree.nodes.get(id);
    if (done.has(id) || latest.get(id)?.state === 'abandoned') continue;
    if (node.kind === 'leaf') return node;
    const children = node.children.map((childId) => work.tree.nodes.get(childId));
    if (children.length === 0 || children.every((child) => done.has(child.id))) return node;
  }
  return null;
}
