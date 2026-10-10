import { createResourceStore } from '../../core/resources/revisions.js';
import { prepareInput } from '../../core/resources/input-snapshots.js';
import { startOperation, submitResult } from '../../core/operations/requests.js';
import { recordReview, decidePublication } from '../../core/operations/publications.js';
import { readWorkspaceState } from '../../core/publications/state.js';

export async function resourceFixture(root) {
  const store = createResourceStore(root);
  const propose = (resourceId, bytes, mediaType = 'text/plain', kind = 'document') => store.propose({ resourceId, kind, owned: { bytes: Buffer.from(bytes), mediaType } });
  const select = (revision, expectedSelectionRevision = null, type = 'select') => store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision, action: { actor: 'user', type, ...(type === 'deselect' ? { reason: 'synthetic decision' } : {}) } });
  const source = await propose('source', 'synthetic selected');
  const selected = await select(source);
  const candidate = await propose('candidate', 'synthetic unselected');
  return { store, propose, select, source, selected, candidate };
}
export async function approvedFixture(root) {
  const fixture = await resourceFixture(root);
  const definitions = {};
  for (const [kind, value] of [['profile', { version: 1, scope: ['source'], maxInputBytes: 10000 }], ['pipeline', { version: 1, steps: [{ id: 'draft', capability: 'transform' }] }], ['policy', { version: 1, scope: ['source'], allowedActions: ['create-candidate', 'publish'] }]]) {
    const revision = await fixture.propose(kind, JSON.stringify(value), 'application/json', kind);
    await fixture.select(revision); definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  const input = await prepareInput(root, { revisionIds: [fixture.source.revisionId], ...definitions });
  const request = await startOperation(root, { inputSnapshotId: input.inputSnapshotId, actor: 'user', idempotencyKey: 'synthetic' });
  const output = await fixture.propose('output', 'synthetic approved');
  const result = await submitResult(root, { ...request, inputSnapshotId: input.inputSnapshotId, resultRevisionIds: [output.revisionId] });
  const receiptId = await recordReview(root, { operationId: request.operationId, reviewer: 'host', outputHashes: result.outputs.map((r) => r.contentHash), findings: [{ severity: 'soft', message: 'synthetic suggestion' }] });
  await decidePublication(root, { operationId: request.operationId, receiptId, action: 'approve', actor: 'user', expectedCheckpoint: (await readWorkspaceState(root)).checkpoint });
  return { ...fixture, output, receiptId };
}
