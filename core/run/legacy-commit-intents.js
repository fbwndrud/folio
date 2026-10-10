import { openLedger } from '../ledger/ledger.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';

const reasonedSkip = (record, { reason = '', feedback = '' }) => record.type === 'approval' && record.action === 'skip'
  && Boolean(String(reason).trim()) && record.digest === sha256(canonicalJson({ action: 'skip', feedback, reason, stepId: record.stepId, draftHash: record.draftHash }));
const receiptBody = ({ type: _t, seq: _s, at: _a, prev: _p, hash: _h, ...body }) => body;

/** 무-runId 구형 후보는 대상 경로로만 식별한다. 완료 또는 실제 skip에 결속된 해제 증거만 소비한다. */
export async function unresolvedLegacyCommitIntents(root, { path, nodeId }) {
  if (!path || !nodeId) return [];
  const [intents, receipts, decisions] = await Promise.all([
    openLedger(root, 'commit-intents').readAll(), openLedger(root, 'receipts').readAll(), openLedger(root, 'decisions').readAll(),
  ]);
  return intents.filter((intent) => {
    if (intent.type !== 'commit-intent' || intent.runId !== undefined || intent.path !== path) return false;
    const receipt = receipts.find((r) => r.type === 'receipt' && r.receiptId === intent.receiptId && r.nodeId === nodeId);
    const completed = receipt && sha256(canonicalJson(receiptBody(receipt))) === intent.receiptDigest
      && receipts.some((r) => r.type === 'commit' && r.receiptId === intent.receiptId && r.nodeId === nodeId && r.committedHash === receipt.draftHash);
    if (completed) return false;
    const abandoned = intents.some((marker) => marker.type === 'commit-intent-abandoned' && marker.intentHash === intent.hash
      && marker.receiptId === intent.receiptId && marker.path === path && marker.nodeId === nodeId
      && decisions.some((r) => r.hash === marker.decisionHash && r.seq === marker.decisionSeq && r.runId === marker.runId
        && r.nodeId === nodeId && reasonedSkip(r, marker)));
    return !abandoned;
  });
}

export async function assertNoUnresolvedLegacyCommitIntent(root, target) {
  const intents = await unresolvedLegacyCommitIntents(root, target);
  if (intents.length) throw new FolioError('COMMIT_TARGET_CONFLICT', 'unresolved legacy target intent has no recoverable run binding', {
    path: target.path, receiptIds: intents.map((r) => r.receiptId),
  });
}

/** 결정 기록이 먼저다. 해제 마커는 해당 기록 hash/seq와 특정 대상·intent에 결속되어 멱등으로 추가된다. */
export async function abandonLegacyCommitIntents(root, { path, nodeId, runId, reason, feedback = '' }) {
  const intents = await unresolvedLegacyCommitIntents(root, { path, nodeId });
  if (!intents.length) return;
  const decision = (await openLedger(root, 'decisions').readAll()).findLast((r) => r.runId === runId && r.nodeId === nodeId && reasonedSkip(r, { reason, feedback }));
  if (!decision) throw new FolioError('COMMIT_TARGET_CONFLICT', 'legacy abandonment requires a recorded reasoned skip');
  for (const intent of intents) {
    await openLedger(root, 'commit-intents').append({ type: 'commit-intent-abandoned', receiptId: intent.receiptId,
      intentHash: intent.hash, path, nodeId, runId, decisionHash: decision.hash, decisionSeq: decision.seq, reason, feedback });
  }
}

export async function hasRecordedReasonedSkip(root, runId, nodeId, reason, feedback) {
  return (await openLedger(root, 'decisions').readAll()).some((r) => r.runId === runId && r.nodeId === nodeId && reasonedSkip(r, { reason, feedback }));
}
