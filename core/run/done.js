import { lastCommits } from '../ledger/receipts.js';
import { lastImports } from '../import/records.js';

/**
 * 끝난 노드 id 모음. committed 앞머리에는 커밋 기록, imported 앞머리에는 가져오기 기록이 필요하다.
 * 앞머리만 바꾼 노드는 끝나지 않았다 — 기록 없이 끝냄 금지.
 * 기록장은 부르는 쪽이 한 번 읽어 넘긴다.
 */
export function doneNodes(work, receiptRecords) {
  const commits = lastCommits(receiptRecords);
  const imports = lastImports(receiptRecords);
  const done = new Set();
  for (const node of work.tree.nodes.values()) {
    if ((node.status === 'committed' && commits.has(node.id)) || (node.status === 'imported' && imports.has(node.id))) done.add(node.id);
  }
  return done;
}
