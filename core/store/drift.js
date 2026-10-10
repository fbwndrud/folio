import { sha256 } from '../util/hash.js';
import { lastCommits } from '../ledger/receipts.js';

/**
 * 마지막 커밋 hash와 지금 파일 본문 hash를 비교한다. 본문만 본다.
 * 앞머리는 committed 인데 커밋 기록이 없는 노드(첫 커밋 도중 죽고 버린 실행, 손으로 고친 앞머리)도
 * { nodeId, code: 'COMMITTED_WITHOUT_RECORD' } 로 알린다. 그런 노드는 끝나지 않은 것으로 다룬다(run/done.js).
 */
export function detectDrift(work, receiptRecords) {
  const drift = [];
  const commits = lastCommits(receiptRecords);
  for (const [nodeId, commit] of commits) {
    const node = work.tree.nodes.get(nodeId);
    if (!node) { drift.push({ nodeId, code: 'NODE_MISSING' }); continue; }
    const actual = sha256(node.body);
    if (actual !== commit.committedHash) {
      drift.push({ nodeId, code: 'HAND_EDITED', path: node.path, expected: commit.committedHash, actual });
    }
  }
  for (const node of work.tree.nodes.values()) {
    if (node.status === 'committed' && !commits.has(node.id)) drift.push({ nodeId: node.id, code: 'COMMITTED_WITHOUT_RECORD' });
  }
  return drift;
}
