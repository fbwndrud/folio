import { openLedger } from '../ledger/ledger.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';

const fields = ['receiptId', 'receiptDigest', 'path', 'beforeHash', 'afterHash'];
const bodyOf = (record) => Object.fromEntries([...fields, 'runId', 'nodeId', 'receipt'].filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));

export async function readCommitIntent(root, receiptId) {
  const records = await openLedger(root, 'commit-intents').readAll();
  const matches = records.filter((r) => r.receiptId === receiptId && r.type !== 'commit-intent-abandoned');
  if (matches.some((r) => r.type !== 'commit-intent' || canonicalJson(bodyOf(r)) !== canonicalJson(bodyOf(matches[0])))) {
    throw new FolioError('COMMIT_TARGET_CONFLICT', 'commit intent records disagree');
  }
  return matches[0] ? bodyOf(matches[0]) : null;
}

export async function prepareCommitIntent(root, intent) {
  const existing = await readCommitIntent(root, intent.receiptId);
  if (existing) {
    if (canonicalJson(existing) !== canonicalJson(bodyOf(intent))) throw new FolioError('COMMIT_TARGET_CONFLICT', 'commit intent cannot be replaced');
    return existing;
  }
  await openLedger(root, 'commit-intents').append({ type: 'commit-intent', ...bodyOf(intent) });
  return intent;
}

/** 실행 단위의 정본 후보. 최신 항목을 임의로 고르지 않고 단일 후보만 허용한다. */
export async function readRunCommitIntent(root, runId) {
  const records = await openLedger(root, 'commit-intents').readAll();
  const matches = records.filter((r) => r.runId === runId && r.type === 'commit-intent');
  if (!matches.length) return null;
  if (matches.some((r) => canonicalJson(bodyOf(r)) !== canonicalJson(bodyOf(matches[0])))) {
    throw new FolioError('COMMIT_TARGET_CONFLICT', 'multiple prepared candidates exist for this run');
  }
  const intent = await readCommitIntent(root, matches[0].receiptId);
  if (!intent.receipt || intent.receipt.runId !== runId || intent.receipt.nodeId !== intent.nodeId
    || intent.receipt.receiptId !== intent.receiptId || sha256(canonicalJson(intent.receipt)) !== intent.receiptDigest) {
    throw new FolioError('COMMIT_TARGET_CONFLICT', 'prepared candidate has no authoritative receipt');
  }
  return intent;
}
