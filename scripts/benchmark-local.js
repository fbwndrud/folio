import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { tmpdir, platform, release, arch, cpus, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { connectSyntheticMcp, driveSynthetic, planFor, TEXT, textHash } from '../examples/tracking-host.js';

const repo = dirname(import.meta.dirname);
const count = 100;
async function outputBytes(root) {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) total += await outputBytes(path);
    else if (entry.isFile()) total += (await readFile(path)).length;
  }
  return total;
}
function sourceCommit() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo, encoding: 'utf8' });
  if (top.status !== 0 || resolve(top.stdout.trim()) !== resolve(repo)) return null;
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  return revision.status === 0 ? revision.stdout.trim() : null;
}

/** Actual timings on disposable synthetic data; no model quality scores or SLA. */
export async function benchmarkLocal() {
  const base = await mkdtemp(join(tmpdir(), 'folio-production-task6-benchmark-'));
  const root = join(base, 'work'); const operations = [];
  let folio = null;
  async function measure(name, fn) {
    const started = performance.now(); const result = await fn();
    operations.push({ name, milliseconds: Number((performance.now() - started).toFixed(3)), outputBytes: Buffer.byteLength(JSON.stringify(result)) });
    return result;
  }
  let summary;
  try {
    folio = await connectSyntheticMcp();
    const call = (name, args = {}) => folio.call(name, { root, ...args });
    const resources = [];
    await measure('synthetic-setup', async () => {
      await call('folio_init', { title: 'Synthetic scale benchmark', preset: 'scene' });
      const proposal = await call('folio_tracking', { op: 'propose', expectedRev: null, plan: planFor('mystery') });
      await call('folio_tracking', { op: 'decide', proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest, action: 'approve' });
      for (let i = 0; i < count; i++) {
        const id = `synthetic-${String(i).padStart(3, '0')}`;
        await call('folio_structure', { op: 'add', id, level: 'scene', title: `Synthetic scene ${i}` });
        await driveSynthetic(folio, root, id, { discover: i === 0, value: '문' });
        const node = (await call('folio_find', { query: 'node', id })).node;
        assert.equal(node.body, TEXT); assert.equal(node.status, 'committed');
        const revision = await call('folio_resources', { op: 'propose', resourceId: id, kind: 'document', owned: { bytes: `Synthetic resource ${i}\n${TEXT}`, mediaType: 'text/plain' } });
        await call('folio_resources', { op: 'decideSource', revisionId: revision.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
        resources.push(revision);
      }
      return { manuscripts: count, selectedResources: resources.length, textHash: textHash(TEXT) };
    });
    const status = await measure('status', () => call('folio_status'));
    assert.equal(status.activeRun, null);
    for (const ledger of Object.values(status.ledger)) assert.equal(ledger.ok, true);
    for (const field of ['stale', 'trackingStale', 'backfillPending', 'recheck', 'flagged', 'drift', 'warnings', 'waiting']) assert.deepEqual(status[field], []);
    const tracking = await measure('tracking-query', () => call('folio_tracking', { op: 'query', type: 'observations', limit: 100 }));
    assert.equal(tracking.entries.length, count); assert.equal(tracking.nextCursor, null);
    assert.equal(new Set(tracking.entries.map((e) => e.evidence.nodeId)).size, count);
    for (const entry of tracking.entries) { assert.equal(entry.evidence.textHash, textHash(TEXT)); assert.ok(entry.receiptId); }
    const generation = await measure('metadata-refresh', () => call('folio_resource_query', { op: 'refresh' }));
    const query = await measure('resource-query', () => call('folio_resource_query', { op: 'query', selector: { type: 'current' }, freshness: 'requireCurrent' }));
    assert.equal(query.entries.length, count); assert.equal(query.evidence.length, count);
    assert.equal(query.manifest.generationId, generation.generationId);
    assert.deepEqual(query.entries.map((e) => e.revisionId).sort(), resources.map((r) => r.revisionId).sort());
    for (const evidence of query.evidence) assert.equal(evidence.contentHash, resources.find((r) => r.revisionId === evidence.revisionId).contentHash);
    const viewer = await call('folio_view'); assert.equal(viewer.built, true);
    const token = new URL(viewer.url).searchParams.get('token');
    const http = async (path, post = false) => {
      const response = await fetch(new URL(path, viewer.url), { headers: { 'x-folio-token': token, ...(post ? { 'content-type': 'application/json' } : {}) }, ...(post ? { method: 'POST', body: '{}' } : {}) });
      assert.equal(response.status, 200, path); return response.json();
    };
    const outline = await measure('view-outline', () => http('/api/work')); assert.equal(outline.nodes.length, count);
    const list = await measure('view-resource-list', () => http('/api/resources')); assert.equal(list.entries.length, count);
    await measure('view-resource-details-100', async () => {
      const details = [];
      for (const revision of resources) {
        const detail = await http('/api/resources/' + encodeURIComponent(revision.revisionId));
        assert.equal(detail.entry.contentHash, revision.contentHash); assert.equal(detail.previewTruncated, false);
        assert.equal(detail.contentPreview, `Synthetic resource ${details.length}\n${TEXT}`); details.push(detail);
      }
      return details;
    });
    await measure('viewer-export', () => http('/api/export', true));
    const html = await readFile(join(root, 'exports/viewer/index.html'), 'utf8');
    const snapshot = JSON.parse(html.match(/id="folio-data">(.*?)<\/script>/s)[1]);
    assert.equal(Object.keys(snapshot.nodes).length, count); assert.equal(snapshot.resources.entries.length, count);
    assert.equal(Object.keys(snapshot.resourceDetails).length, count); assert.equal(snapshot.work.capabilities.viewerToggles, false);
    for (const node of Object.values(snapshot.nodes)) assert.equal(node.segments.map((s) => s.text ?? `![[asset:${s.asset}]]`).join(''), TEXT);
    const web = await measure('web-export', () => call('folio_export', { format: 'web', output: join(base, 'web') }));
    const manifest = JSON.parse(await readFile(join(web.output, 'manifest.json'), 'utf8')); assert.equal(manifest.nodes.length, count);
    const packageJson = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
    summary = { synthetic: true, verified: true, outputsRetained: false, environment: { node: process.version, platform: platform(), osRelease: release(), arch: arch(), cpu: cpus()[0]?.model ?? null, cpuCount: cpus().length, totalMemoryBytes: totalmem() },
      version: { package: packageJson.version, sourceCommit: sourceCommit(), metadataGenerator: generation.generatorRevision, metadataGenerationId: generation.generationId, checkpoint: query.checkpoint, trackingPlanRevision: (await call('folio_tracking', { op: 'get' })).plan.rev },
      scale: { committedManuscripts: count, trackingObservations: tracking.entries.length, selectedResources: resources.length, fixedDraftBytes: Buffer.byteLength(TEXT), resourceInputBytes: resources.reduce((n, r) => n + r.byteLength, 0) },
      operations, exportBytes: { viewer: await outputBytes(join(root, 'exports/viewer')), web: await outputBytes(web.output) },
      limits: ['single local run; no SLA', 'fixed synthetic responses; no AI quality score', 'no embedding inference benchmark', 'not a power-loss or remote filesystem test'] };
  } finally {
    try { await folio?.close(); } finally { await rm(base, { recursive: true, force: true }); }
  }
  return summary;
}

const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === await realpath(fileURLToPath(import.meta.url))) benchmarkLocal().then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => { console.error(error); process.exitCode = 1; });
