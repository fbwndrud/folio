import { assertNoUnresolvedLegacyCommitIntent } from './legacy-commit-intents.js';
import { commitTargetFile } from './commit-target-file.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';
import { prepareCommitIntent, readCommitIntent } from './commit-intents.js';

export function classifyCommitTarget({ currentHash, beforeHash, afterHash }) {
  if (currentHash === afterHash) return 'after';
  if (currentHash === beforeHash) return 'before';
  return 'conflict';
}

export async function commitTarget({ root, node, receipt, text, recorded = false, prepare = false }) {
  const { current, after, path, body } = await commitTargetFile(root, node, receipt, text);
  const currentHash = current === null ? null : sha256(current);
  let intent = await readCommitIntent(root, receipt.receiptId);
  const receiptDigest = sha256(canonicalJson(receipt));
  if (!intent && !recorded && prepare) {
    await assertNoUnresolvedLegacyCommitIntent(root, { path, nodeId: node.id });
    intent = await prepareCommitIntent(root, { receiptId: receipt.receiptId, receiptDigest, runId: receipt.runId, nodeId: receipt.nodeId, receipt, path, beforeHash: currentHash, afterHash: sha256(after) });
  }
  if (intent && (intent.receiptDigest !== receiptDigest || intent.path !== path)) {
    throw new FolioError('COMMIT_TARGET_CONFLICT', 'receipt or path differs from commit intent');
  }
  // 이전 버전 영수증에는 before 증거가 없다. 승인 본문이 이미 쓰였으면 비덮어쓰기 완료만 허용한다.
  const state = intent ? classifyCommitTarget({ currentHash, beforeHash: intent.beforeHash, afterHash: intent.afterHash })
    : recorded && body === text ? 'after' : 'conflict';
  if (state === 'conflict') throw new FolioError('COMMIT_TARGET_CONFLICT', 'target changed after commit preparation', { path });
  return state;
}
