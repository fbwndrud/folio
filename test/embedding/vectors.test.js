import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
import { pinVectorInputs, saveVectors, searchVectors } from '../../core/projections/vectors.js';
const profile = { model: 'synthetic', modelRevision: 'a'.repeat(40), processorRevision: 'a'.repeat(40), processorConfig: { synthetic: true, folioInputPolicy: { maxInputBytes: 8388608, maxInputs: 100, maxBatchBytes: 33554432 } }, runtime: { synthetic: '1' }, dtype: 'float32', dimension: 128, normalization: 'l2', prefixes: { document: 'doc', query: 'query', media: '' } };
const vector = [1, ...Array(127).fill(0)];
test('immutable vector profile, evidence, stale and finite gates', async () => {
 const root = await mkdtemp(join(tmpdir(), 'folio-vector-')); const store = createResourceStore(root);
 const revision = await store.propose({ resourceId: 'synthetic', kind: 'text', owned: { bytes: 'red square', mediaType: 'text/plain' } });
 await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
 const pin = await pinVectorInputs(root); const manifest = await saveVectors(root, pin, { profile, vectors: [vector] });
 const result = await searchVectors(root, { generationId: manifest.generationId, profile, vector });
 assert.equal(result.results[0].score, 1); assert.equal(result.evidence[0].contentHash, revision.contentHash);
 await assert.rejects(searchVectors(root, { generationId: manifest.generationId, profile: { ...profile, dtype: 'float16' }, vector }));
 await assert.rejects(saveVectors(root, pin, { profile, vectors: [[NaN, ...vector.slice(1)]] }));
 await assert.rejects(saveVectors(root, pin, { profile, vectors: [Array(128).fill(0)] }));
 await assert.rejects(saveVectors(root, pin, { profile, vectors: [[1, 0]] }));
 await assert.rejects(saveVectors(root, pin, { profile, vectors: [[2, ...vector.slice(1)]] }));
 await assert.rejects(saveVectors(root, pin, { profile, vectors: [[Infinity, ...vector.slice(1)]] }));
 await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: (await store.readSourceSelection('synthetic')).selectionRevision, action: { actor: 'user', type: 'deselect', reason: 'synthetic test' } });
 await assert.rejects(searchVectors(root, { generationId: manifest.generationId, profile, vector }), { code: 'PROJECTION_NOT_CURRENT' });
 assert.equal((await searchVectors(root, { generationId: manifest.generationId, profile, vector, freshness: 'allowStale' })).freshness, 'stale');
 await assert.rejects(saveVectors(root, pin, { profile, vectors: [vector] }), { code: 'PROJECTION_NOT_CURRENT' });
});

test('partial coverage rejects strict search; profile and durable corruption cannot pass allowStale', async () => {
 const root = await mkdtemp(join(tmpdir(), 'folio-vector-')); const store = createResourceStore(root);
 const a = await store.propose({ resourceId: 'local', kind: 'text', owned: { bytes: 'synthetic', mediaType: 'text/plain' } });
 const b = await store.propose({ resourceId: 'external', kind: 'image', external: { uri: 'https://example.invalid/image.png' } });
 for (const revision of [a, b]) await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
 const pin = await pinVectorInputs(root); assert.equal(pin.inputs.length, 1);
 const manifest = await saveVectors(root, pin, { profile, vectors: [vector] });
 await assert.rejects(searchVectors(root, { generationId: manifest.generationId, profile, vector }), { code: 'PROJECTION_NOT_CURRENT' });
 const result = await searchVectors(root, { generationId: manifest.generationId, profile, vector, freshness: 'allowStale' });
 assert.equal(result.coverage.missing[0].reason, 'external-unobserved');
 await assert.rejects(searchVectors(root, { generationId: manifest.generationId, profile: { ...profile, runtime: { synthetic: '2' } }, vector, freshness: 'allowStale' }), { code: 'VECTOR_PROFILE_MISMATCH' });
 const { writeFile } = await import('node:fs/promises');
 await writeFile(join(root, '.folio', 'projections', 'vectors', manifest.generationId.slice(7) + '.json'), '{}');
 await assert.rejects(searchVectors(root, { generationId: manifest.generationId, profile, vector, freshness: 'allowStale' }), { code: 'VECTOR_INTEGRITY_FAILURE' });
});

test('selected source bound is checked before any nonexistent bytes are read', async () => {
 const root = await mkdtemp(join(tmpdir(), 'folio-vector-bound-'));
 const { appendStateMarker } = await import('../../core/publications/state.js');
 for (let i = 0; i < 101; i++) await appendStateMarker(root, { kind: 'source-selection', payload: { resourceId: 'synthetic-' + i, revisionId: 'sha256:' + 'a'.repeat(64) } });
 await assert.rejects(pinVectorInputs(root), { code: 'EMBEDDING_INPUT_INVALID' });
});
