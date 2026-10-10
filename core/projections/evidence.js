import { canonicalJson } from '../util/hash.js';
import { createResourceStore } from '../resources/revisions.js';
import { verifyInput } from '../resources/input-snapshots.js';
import { get, fail } from '../operations/objects.js';
import { readOperation, outputBindings } from '../operations/requests.js';

const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
/** Revalidate marker bindings and retained bytes, never infer approval from a candidate. */
export async function publicationEvidence(root, publication) {
  const p = publication;
  const request = await readOperation(root, p.operationId);
  const result = await get(root, 'results', p.operationId);
  const receipt = await get(root, 'receipts', p.receiptId);
  const intent = await get(root, 'intents', p.intentId);
  const decision = await get(root, 'decisions', p.decisionId);
  const outputs = await outputBindings(root, p.resultRevisionIds);
  const { manifest } = await verifyInput(root, p.inputSnapshotId);
  if (p.version !== 1 || !['approve', 'reject'].includes(p.action) || p.selfReview !== true || receipt.selfReview !== true ||
    p.requestId !== request.requestId || p.inputSnapshotId !== request.inputSnapshotId ||
    result.operationId !== p.operationId || result.requestId !== p.requestId || result.inputSnapshotId !== p.inputSnapshotId ||
    receipt.operationId !== p.operationId || receipt.requestId !== p.requestId || receipt.inputSnapshotId !== p.inputSnapshotId ||
    intent.operationId !== p.operationId || intent.requestId !== p.requestId || intent.inputSnapshotId !== p.inputSnapshotId || intent.receiptId !== p.receiptId ||
    decision.operationId !== p.operationId || decision.receiptId !== p.receiptId || decision.action !== p.action || decision.actor !== p.actor ||
    !equal(intent.expectedCheckpoint, decision.expectedCheckpoint) || decision.expectedCheckpoint.seq !== p.checkpoint.seq - 1 ||
    !equal(outputs, p.outputs) || !equal(outputs, result.outputs) || !equal(outputs, receipt.outputs) || !equal(outputs, intent.outputs) ||
    !equal(p.resultRevisionIds, result.resultRevisionIds) || !equal(p.resultRevisionIds, receipt.resultRevisionIds) || !equal(p.trace, result.trace) ||
    !Array.isArray(receipt.findings) || receipt.findings.some((f) => !['hard', 'soft', 'info'].includes(f.severity)) ||
    (p.action === 'approve' && receipt.findings.some((f) => f.severity === 'hard'))) fail('PUBLICATION_INTEGRITY_FAILURE', 'publication bindings differ');
  return { manifest, receipt, outputs, expectedCheckpoint: decision.expectedCheckpoint };
}
export async function sourceEvidence(root, selection) {
  const store = createResourceStore(root);
  const ref = selection.inputRefs?.[0];
  if (!ref || selection.inputRefs.length !== 1 || selection.action?.actor !== 'user' || !['select', 'deselect'].includes(selection.action.type)) fail('RESOURCE_INTEGRITY_FAILURE', 'invalid selected source marker');
  const revision = await store.readRevision(ref.revisionId);
  if (selection.resourceId !== revision.resourceId || ref.resourceId !== revision.resourceId || ref.contentHash !== revision.contentHash || ref.storageStatus !== revision.storageStatus ||
    (selection.action.type === 'select' ? selection.revisionId !== revision.revisionId : selection.revisionId !== null)) fail('RESOURCE_INTEGRITY_FAILURE', 'source marker bindings differ');
  return revision;
}
