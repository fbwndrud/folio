import { assertNoUnresolvedLegacyCommitIntent } from './legacy-commit-intents.js';
import { variantOf } from '../variants/model.js';
import { openLedger } from '../ledger/ledger.js';
import { FolioError } from '../errors.js';
import { readRunCommitIntent } from './commit-intents.js';

/** 캐시 상태와 무관하게 추가만 되는 기록장의 원 영수증을 복구한다. */
export async function restorePreparedCommit(root, run, path) {
  if (run.state === 'done' || run.state === 'skipped' || run.state === 'abandoned') return false;
  await assertNoUnresolvedLegacyCommitIntent(root, { path, nodeId: run.nodeId });
  const intent = await readRunCommitIntent(root, run.runId);
  if (!intent) return false;
  if (run.state !== 'committing' && (await openLedger(root, 'receipts').readAll()).some((r) => r.type === 'commit' && r.receiptId === intent.receiptId)) {
    throw new FolioError('LOCK_RUN_ALREADY_COMMITTED', 'a completed candidate cannot revive an active run');
  }
  if (intent.nodeId !== run.nodeId || variantOf(intent.receipt) !== variantOf(run)) throw new FolioError('COMMIT_TARGET_CONFLICT', 'prepared candidate belongs to another node');
  run.receipt = intent.receipt;
  run.state = 'committing';
  run.pending = null;
  return true;
}
