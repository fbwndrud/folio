import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import fs, { readFile, writeFile, access } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tempDir, fakePacks, fixturePath } from '../support/fixtures.js';
import { resourceFixture } from '../support/view-resources.js';
import { sourceSnapshot } from '../support/export-work.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { resourceObjectPath } from '../../core/resources/files.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { pinVectorInputs } from '../../core/projections/vectors.js';
import { VECTOR_INPUT_POLICY, assertVectorInputLengths } from '../../core/projections/vector-input-policy.js';
import { profileDigest } from '../../core/projections/vector-profile.js';
import { createEmbeddingAdapter } from '../../adapters/embedding/index.js';
import { startViewServer } from '../../server/view/http-server.js';

const MiB = 1024 * 1024;
const raw = (server, path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: server.port, path, method, headers }, (res) => {
    let body = ''; res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }));
  }); req.on('error', reject); req.end(method === 'POST' ? '{}' : undefined);
});

test('production Resource reads require token and Host; POST enforces Origin, GET has no CORS grant', async (t) => {
  const root = await tempDir('folio-production-task6-http-'); const f = await resourceFixture(root);
  const text = '</script><script>alert("synthetic")</script><img src=x onerror="synthetic">';
  const xss = await f.propose('xss', text); await f.select(xss); await buildMetadataProjection(root);
  const server = await startViewServer({ root, packs: fakePacks(), distDir: fixturePath('viewer-dist') });
  t.after(() => server.close());
  const headers = { 'x-folio-token': server.token };
  const before = await sourceSnapshot(root);
  for (const path of ['/api/resources', `/api/resources/${xss.revisionId}`]) {
    assert.equal((await raw(server, path)).status, 401);
    assert.equal((await raw(server, path, { 'x-folio-token': 'incorrect' })).status, 401);
    assert.equal((await raw(server, path, { ...headers, host: 'evil.invalid' })).status, 421);
    const get = await raw(server, path, { ...headers, origin: 'https://evil.invalid' });
    assert.equal(get.status, 200); assert.equal(get.headers['access-control-allow-origin'], undefined);
    assert.equal((await raw(server, path, { origin: 'https://evil.invalid' })).status, 401);
  }
  const post = { ...headers, origin: 'https://evil.invalid', 'content-type': 'application/json' };
  assert.equal((await raw(server, '/api/export', post, 'POST')).body.error.code, 'ORIGIN_NOT_ALLOWED');
  assert.equal((await raw(server, `/api/resources/${f.candidate.revisionId}`, headers)).status, 404);
  for (const path of ['/api/resources/a%2Fb', '/api/resources/a%5Cb', '/api/resources/%00', '/api/resources/%E0%A4%A']) {
    assert.equal((await raw(server, path, headers)).body.error.code, 'ROUTE_INVALID');
  }
  const list = await raw(server, '/api/resources?root=/etc&path=/etc/passwd', headers);
  assert.deepEqual(list.body.entries.map((e) => e.resourceId).sort(), ['source', 'xss']);
  const detail = await raw(server, `/api/resources/${xss.revisionId}`, headers);
  assert.equal(detail.body.contentPreview, text); assert.equal(detail.body.previewTruncated, false);
  assert.deepEqual(await sourceSnapshot(root), before);
  const exported = await raw(server, '/api/export', { ...headers, 'content-type': 'application/json', origin: `http://127.0.0.1:${server.port}` }, 'POST');
  assert.equal(exported.status, 200);
  const html = await readFile(join(root, 'exports/viewer/index.html'), 'utf8');
  assert.doesNotMatch(html, /<script>alert|<img src=x/);
  const snapshot = JSON.parse(html.match(/id="folio-data">(.*?)<\/script>/s)[1]);
  assert.equal(snapshot.resourceDetails[xss.revisionId].contentPreview, text);
  assert.equal(snapshot.resourceDetails[f.candidate.revisionId], undefined);
  assert.equal(snapshot.work.capabilities.viewerToggles, false);
  const after = await sourceSnapshot(root);
  for (const path of Object.keys(after)) if (path.startsWith('exports/')) delete after[path];
  assert.deepEqual(after, before);
});

test('vector pin rejects aggregate overflow after individual evidence reads, before retaining batch buffers', async (t) => {
  const root = await tempDir('folio-production-task6-vector-'); const store = createResourceStore(root);
  const revisions = [];
  for (let i = 0; i < 5; i++) {
    const revision = await store.propose({ resourceId: `synthetic-${i}`, kind: 'document', owned: { bytes: Buffer.alloc(8 * MiB, 97 + i), mediaType: 'text/plain' } });
    revisions.push(revision);
    await store.decideSource({ revisionId: revision.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
  }
  const contentPaths = new Set(revisions.map((r) => resourceObjectPath(root, r.contentHash, 'content')));
  const original = fs.readFile; let contentReads = 0;
  const mocked = t.mock.method(fs, 'readFile', async (path, ...args) => { if (contentPaths.has(path)) contentReads++; return original(path, ...args); });
  syncBuiltinESMExports();
  try { await assert.rejects(pinVectorInputs(root), { code: 'EMBEDDING_INPUT_INVALID' }); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(contentReads, 5, 'each evidence is read once; no additional retained input batch reads');
  const last = revisions.at(-1);
  await store.decideSource({ revisionId: last.revisionId, expectedSelectionRevision: (await store.readSourceSelection(last.resourceId)).selectionRevision, action: { actor: 'user', type: 'deselect', reason: 'synthetic boundary' } });
  const pin = await pinVectorInputs(root);
  assert.equal(pin.entries.length, 4); assert.equal(pin.inputs.reduce((n, input) => n + input.bytes.length, 0), 32 * MiB);
  assertVectorInputLengths(Array(100).fill(0));
  assert.throws(() => assertVectorInputLengths(Array(101).fill(0)), { code: 'EMBEDDING_INPUT_INVALID' });
  assert.throws(() => assertVectorInputLengths([8 * MiB + 1]), { code: 'EMBEDDING_INPUT_INVALID' });
});

test('adapter rejects aggregate overflow before reaching even an unavailable worker', async () => {
  const root = await tempDir('folio-production-task6-no-worker-');
  const adapter = createEmbeddingAdapter({ python: join(root, 'missing-runtime') });
  const input = { bytes: Buffer.alloc(8 * MiB, 97), mediaType: 'text/plain' };
  await assert.rejects(adapter.encode(Array(5).fill(input)), { code: 'EMBEDDING_INPUT_INVALID' });
  await assert.rejects(adapter.encode([...Array(4).fill(input), { bytes: Buffer.from('a'), mediaType: 'text/plain' }]), { code: 'EMBEDDING_INPUT_INVALID' });
});

test('adapter succeeds at exact 32 MiB with a POSIX synthetic executable', { skip: process.platform === 'win32' ? 'POSIX fixture; fixed input gate and pin boundary tested independently' : false }, async () => {
  const root = await tempDir('folio-production-task6-worker-'); const marker = join(root, 'called');
  const worker = join(root, 'synthetic-worker');
  await writeFile(worker, `#!${process.execPath}
const fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(marker)}, 'called');
let data = ''; process.stdin.on('data', b => data += b); process.stdin.on('end', () => {
const r = JSON.parse(data); const profile = { model: 'google/embeddinggemma-2', modelRevision: r.revision, processorRevision: r.revision,
processorConfig: { folioInputPolicy: ${JSON.stringify(VECTOR_INPUT_POLICY)} }, runtime: { synthetic: '1' }, dtype: 'float32', dimension: r.dimension,
normalization: 'l2', prefixes: { document: '', query: '', media: '' } };
console.log(JSON.stringify({ profile, vectors: r.inputs.map(() => [1, ...Array(r.dimension - 1).fill(0)]) }));
});`, { mode: 0o700 });
  const adapter = createEmbeddingAdapter({ python: worker });
  const input = { bytes: Buffer.alloc(8 * MiB, 97), mediaType: 'text/plain' };
  await assert.rejects(adapter.encode(Array(5).fill(input)), { code: 'EMBEDDING_INPUT_INVALID' });
  await assert.rejects(adapter.encode([...Array(4).fill(input), { bytes: Buffer.from('a'), mediaType: 'text/plain' }]), { code: 'EMBEDDING_INPUT_INVALID' });
  await assert.rejects(access(marker), { code: 'ENOENT' });
  const result = await adapter.encode(Array(4).fill(input), { dimension: 128 });
  assert.equal(result.vectors.length, 4); assert.equal(result.profile.processorConfig.folioInputPolicy.maxBatchBytes, 32 * MiB);
});

test('legacy and changed input-policy profiles require explicit reindex', () => {
  const profile = { model: 'synthetic', modelRevision: 'a'.repeat(40), processorRevision: 'a'.repeat(40),
    processorConfig: { folioInputPolicy: VECTOR_INPUT_POLICY }, runtime: { synthetic: '1' }, dtype: 'float32',
    dimension: 128, normalization: 'l2', prefixes: { document: '', query: '', media: '' } };
  profileDigest(profile);
  const legacy = structuredClone(profile); delete legacy.processorConfig.folioInputPolicy.maxBatchBytes;
  assert.throws(() => profileDigest(legacy), { code: 'VECTOR_PROFILE_INVALID' });
  const changed = structuredClone(profile); changed.processorConfig.folioInputPolicy.maxBatchBytes++;
  assert.throws(() => profileDigest(changed), { code: 'VECTOR_PROFILE_INVALID' });
});
