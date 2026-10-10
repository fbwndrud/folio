import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { embeddingsTool } from '../../server/tools/embeddings.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { connectFolio } from '../support/mcp-client.js';
const profile = { model: 'synthetic', modelRevision: 'a'.repeat(40), processorRevision: 'a'.repeat(40), processorConfig: { folioInputPolicy: { maxInputBytes: 8388608, maxInputs: 100, maxBatchBytes: 33554432 } }, runtime: { synthetic: '1' }, dtype: 'float32', dimension: 128, normalization: 'l2', prefixes: { document: 'd', query: 'q', media: '' } };
const vector = [1, ...Array(127).fill(0)];
test('binary MCP roundtrip, exact operation fields and local runtime absence', async (t) => {
 const root = await mkdtemp(join(tmpdir(), 'folio-embedding-mcp-')); t.after(() => rm(root, { recursive: true, force: true }));
 const folio = await connectFolio(); t.after(() => folio.close());
 assert.ok((await folio.client.listTools()).tools.find((tool) => tool.name === 'folio_embeddings'));
 const bytes = Buffer.from([0, 255, 128, 10]);
 const response = await folio.call('folio_resources', { root, op: 'propose', resourceId: 'binary', kind: 'image', owned: { base64: bytes.toString('base64'), mediaType: 'image/png' } });
 assert.equal(response.ok, true); const revisionId = response.result.revisionId;
 const read = await folio.call('folio_resources', { root, op: 'read', revisionId });
 assert.equal(read.result.base64, bytes.toString('base64')); assert.equal(read.result.encoding, 'base64'); assert.equal(read.result.content, undefined);
 for (const owned of [{ bytes: 'x', base64: 'eA==', mediaType: 'image/png' }, { base64: 'eB==', mediaType: 'image/png' }, { base64: 'eA', mediaType: 'image/png' }]) {
  assert.equal((await folio.call('folio_resources', { root, op: 'propose', resourceId: 'bad', kind: 'image', owned })).ok, false);
 }
 assert.equal((await folio.call('folio_embeddings', { root, op: 'index', text: 'extra' })).error.code, 'TOOL_INPUT_INVALID');
 assert.equal((await folio.call('folio_embeddings', { root, op: 'index' })).error.code, 'EMBEDDING_CONTENT_UNAVAILABLE');
});
test('index/search keeps candidate authority and releases lock during inference', async (t) => {
 const root = await mkdtemp(join(tmpdir(), 'folio-embedding-tool-')); t.after(() => rm(root, { recursive: true, force: true }));
 const revision = await resourcesTool(root, { op: 'propose', resourceId: 'source', kind: 'text', owned: { bytes: 'synthetic', mediaType: 'text/plain' } });
 await assert.rejects(embeddingsTool(root, { op: 'index' }), { code: 'EMBEDDING_CONTENT_UNAVAILABLE' });
 const selected = await resourcesTool(root, { op: 'decideSource', revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
 const before = await readWorkspaceState(root);
 const adapter = { encode: async (inputs) => ({ profile, vectors: inputs.map(() => vector) }) };
 const generation = await embeddingsTool(root, { op: 'index', dimension: 128 }, { adapter });
 const result = await embeddingsTool(root, { op: 'search', generationId: generation.generationId, text: 'synthetic' }, { adapter });
 assert.equal(result.results[0].revisionId, revision.revisionId); assert.deepEqual((await readWorkspaceState(root)).checkpoint, before.checkpoint);
 const changing = { encode: async () => {
  await resourcesTool(root, { op: 'decideSource', revisionId: revision.revisionId, expectedSelectionRevision: selected.selectionRevision, action: { actor: 'user', type: 'deselect', reason: 'synthetic' } });
  return { profile, vectors: [vector] };
 } };
 await assert.rejects(embeddingsTool(root, { op: 'index', dimension: 128 }, { adapter: changing }), { code: 'PROJECTION_NOT_CURRENT' });
 assert.equal((await embeddingsTool(root, { op: 'search', generationId: generation.generationId, text: 'synthetic', freshness: 'allowStale' }, { adapter })).freshness, 'stale');
});

test('full 8 MiB canonical binary upload roundtrips and boundary invalid encodings reject', async (t) => {
 const root = await mkdtemp(join(tmpdir(), 'folio-binary-boundary-')); t.after(() => rm(root, { recursive: true, force: true }));
 const bytes = Buffer.alloc(8 * 1024 * 1024, 0xab); const base64 = bytes.toString('base64');
 const revision = await resourcesTool(root, { op: 'propose', resourceId: 'boundary', kind: 'synthetic-image', owned: { base64, mediaType: 'image/png' } });
 const read = await resourcesTool(root, { op: 'read', revisionId: revision.revisionId });
 assert.equal(read.encoding, 'base64'); assert.equal(read.base64, base64);
 const { sha256 } = await import('../../core/util/hash.js');
 assert.equal(sha256(Buffer.from(read.base64, 'base64')), revision.contentHash);
 assert.equal(revision.byteLength, bytes.length);
 // Equal-length invalid alphabet and noncanonical trailing bits; missing/extra padding and oversized bytes.
 for (const invalid of [base64.slice(0, -4) + '!6s=', base64.slice(0, -4) + 'q6t=', base64.slice(0, -1), base64 + '=', Buffer.alloc(bytes.length + 1).toString('base64')]) {
  await assert.rejects(resourcesTool(root, { op: 'propose', resourceId: 'invalid-boundary', kind: 'synthetic-image', owned: { base64: invalid, mediaType: 'image/png' } }), { code: 'RESOURCE_CONTENT_INVALID' });
 }
});
