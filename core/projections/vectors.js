import { join } from 'node:path';
import { canonicalJson, sha256 } from '../util/hash.js';
import { copy, fail } from '../operations/objects.js';
import { readWorkspaceState, withWorkspaceStateTransaction, sameCheckpoint } from '../publications/state.js';
import { createResourceStore } from '../resources/revisions.js';
import { assertRevisionId } from '../resources/schema.js';
import { readObject, writeImmutable } from '../resources/files.js';
import { metadataEntries } from './metadata.js';
import { profileDigest, validateVector } from './vector-profile.js';
import { assertVectorInputLengths } from './vector-input-policy.js';
export { profileDigest, validateVector } from './vector-profile.js';
const pathFor = (root, id) => join(root, '.folio', 'projections', 'vectors', id.slice(7) + '.json');
const supported = new Set(['text/plain', 'application/json', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']);
/** Pins verified selected sources under the lock; model inference happens after release. */
export async function pinVectorInputs(root) {
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    if (Object.values(state.sourceSelections).filter((s) => s.revisionId).length > 100) fail('EMBEDDING_INPUT_INVALID', 'maximum 100 selected sources; reject before reading owned bytes');
    const sources = (await metadataEntries(root, state)).filter((e) => e.role === 'source');
    const entries = sources.filter((e) => e.storageStatus === 'owned_snapshot' && supported.has(e.mediaType));
    // metadataEntries verifies individual source bytes first; reject before retaining a batch.
    assertVectorInputLengths(entries.map((entry) => entry.byteLength));
    const store = createResourceStore(root);
    const inputs = await Promise.all(entries.map(async (entry) => ({ entry, bytes: await store.readContent(entry.revisionId) })));
    return { workspaceCheckpoint: state.checkpoint, inputManifestId: sha256(canonicalJson(state.markers)), entries, inputs,
      coverage: { layers: ['vector'], resourceIds: entries.map((e) => e.resourceId), missing: sources.filter((e) => !entries.includes(e)).map((e) => ({ resourceId: e.resourceId, revisionId: e.revisionId, reason: e.storageStatus === 'external_unobserved' ? 'external-unobserved' : 'media-unsupported' })), scope: 'selected-sources' } };
  });
}
async function verifyBindings(root, manifest, entries) {
  const state = await readWorkspaceState(root, { checkpoint: manifest.workspaceCheckpoint });
  const sources = (await metadataEntries(root, state)).filter((e) => e.role === 'source');
  const expected = sources.filter((e) => e.storageStatus === 'owned_snapshot' && supported.has(e.mediaType));
  if (manifest.inputManifestId !== sha256(canonicalJson(state.markers)) || canonicalJson(expected) !== canonicalJson(entries)) fail('VECTOR_INTEGRITY_FAILURE', 'input selections differ from verified checkpoint');
  const coverage = { layers: ['vector'], resourceIds: expected.map((e) => e.resourceId), missing: sources.filter((e) => !expected.includes(e)).map((e) => ({ resourceId: e.resourceId, revisionId: e.revisionId, reason: e.storageStatus === 'external_unobserved' ? 'external-unobserved' : 'media-unsupported' })), scope: 'selected-sources' };
  if (canonicalJson(coverage) !== canonicalJson(manifest.coverage)) fail('VECTOR_INTEGRITY_FAILURE', 'coverage differs');
}
export async function saveVectors(root, pin, output, { freshness = 'requireCurrent' } = {}) {
  pin = copy({ workspaceCheckpoint: pin.workspaceCheckpoint, inputManifestId: pin.inputManifestId, entries: pin.entries, coverage: pin.coverage });
  output = copy(output);
  const digest = profileDigest(output.profile);
  if (!Array.isArray(output.vectors) || output.vectors.length !== pin.entries.length) fail('VECTOR_INVALID', 'one vector per pinned input required');
  output.vectors.forEach((v) => validateVector(v, output.profile.dimension));
  if (!['requireCurrent', 'allowStale'].includes(freshness)) fail('VECTOR_INVALID', 'unsupported freshness');
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    const manifest = { version: 1, kind: 'vector', generatorRevision: 'folio-vector-v1', ...pin, profile: output.profile, profileDigest: digest, outputHashes: [sha256(canonicalJson(output.vectors))] };
    delete manifest.entries;
    await verifyBindings(root, manifest, pin.entries);
    if (freshness === 'requireCurrent' && !sameCheckpoint(pin.workspaceCheckpoint, state.checkpoint)) fail('PROJECTION_NOT_CURRENT', 'workspace changed during inference; reindex explicitly');
    const value = { manifest, entries: pin.entries, vectors: output.vectors };
    const generationId = sha256(canonicalJson(value));
    await writeImmutable(root, pathFor(root, generationId), canonicalJson(value));
    return { ...manifest, generationId, freshness: sameCheckpoint(pin.workspaceCheckpoint, state.checkpoint) ? (pin.coverage.missing.length ? 'partial' : 'current') : 'stale' };
  });
}
export async function readVectors(root, generationId) {
  assertRevisionId(generationId);
  let value;
  try { value = JSON.parse((await readObject(root, pathFor(root, generationId))).toString('utf8')); } catch (error) { if (error instanceof SyntaxError) fail('VECTOR_INTEGRITY_FAILURE', 'invalid generation JSON'); throw error; }
  const { manifest, entries, vectors } = value;
  if (sha256(canonicalJson(value)) !== generationId || manifest?.version !== 1 || manifest.kind !== 'vector' || manifest.generatorRevision !== 'folio-vector-v1' || profileDigest(manifest.profile) !== manifest.profileDigest || !Array.isArray(vectors) || vectors.length !== entries?.length || canonicalJson(manifest.outputHashes) !== canonicalJson([sha256(canonicalJson(vectors))])) fail('VECTOR_INTEGRITY_FAILURE', 'generation bindings differ');
  vectors.forEach((v) => validateVector(v, manifest.profile.dimension));
  await verifyBindings(root, manifest, entries);
  return { ...value, manifest: { ...manifest, generationId } };
}
export async function searchVectors(root, input) {
  input = copy(input);
  if (!input || Object.keys(input).some((k) => !['generationId', 'profile', 'vector', 'freshness', 'limit'].includes(k))) fail('VECTOR_INVALID', 'unsupported search fields');
  const { generationId, profile, vector, freshness = 'requireCurrent', limit = 10 } = input;
  const digest = profileDigest(profile); validateVector(vector, profile.dimension);
  if (!['requireCurrent', 'allowStale'].includes(freshness) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('VECTOR_INVALID', 'invalid freshness/limit');
  return withWorkspaceStateTransaction(root, async ({ state }) => {
    const value = await readVectors(root, generationId);
    if (digest !== value.manifest.profileDigest) fail('VECTOR_PROFILE_MISMATCH', 'query and documents must share exact space');
    const status = sameCheckpoint(value.manifest.workspaceCheckpoint, state.checkpoint) ? (value.manifest.coverage.missing.length ? 'partial' : 'current') : 'stale';
    if (freshness === 'requireCurrent' && status !== 'current') fail('PROJECTION_NOT_CURRENT', 'vector generation is stale or incomplete');
    const results = value.entries.map((entry, i) => ({ ...entry, score: value.vectors[i].reduce((s, n, j) => s + n * vector[j], 0) })).sort((a, b) => b.score - a.score).slice(0, limit);
    return { results, manifest: value.manifest, checkpoint: value.manifest.workspaceCheckpoint, currentCheckpoint: state.checkpoint, freshness: status, coverage: value.manifest.coverage,
      evidence: results.map(({ resourceId, revisionId, contentHash, selectionRevision, sourceCheckpoint }) => ({ resourceId, revisionId, contentHash, selectionRevision, sourceCheckpoint })) };
  });
}
