import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { runExamples } from './run.js';
import { verifyEpub, verifyViewerCli } from './production-verify.js';
import { verifyProductionEditions } from './production-editions.js';

const REPO = dirname(import.meta.dirname);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="blue"/></svg>';
const snapshotOf = (html) => JSON.parse(html.match(/id="folio-data">(.*?)<\/script>/s)[1]);

/** All decisions are simulated on new synthetic work; no model or credentials are required. */
export async function runProductionExample() {
  const base = await mkdtemp(join(tmpdir(), 'folio-production-'));
  const client = new Client({ name: 'folio-synthetic-production', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(REPO, 'bin/linivera-mcp.js')], cwd: REPO,
    env: { PATH: process.env.PATH ?? '', FOLIO_EMBEDDING_PYTHON: '' }, stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  const validators = new Map();
  async function call(name, args, code = null) {
    const response = await client.callTool({ name, arguments: args });
    const body = JSON.parse(response.content[0].text);
    const validated = validators.get(name)(response.structuredContent);
    assert.equal(validated.valid, true, `${name}: ${validated.errorMessage}`);
    if (code) { assert.equal(response.isError, true); assert.equal(body.error.code, code); return body.error; }
    assert.ok(!response.isError, `${name}: ${JSON.stringify(body)}`);
    assert.deepEqual(response.structuredContent, { result: body });
    return body;
  }
  async function resources(root) {
    const revision = await call('folio_resources', { root, op: 'propose', resourceId: 'synthetic-note', kind: 'document',
      owned: { bytes: 'Synthetic selected resource </script>', mediaType: 'text/plain' } });
    await call('folio_resources', { root, op: 'decideSource', revisionId: revision.revisionId, expectedSelectionRevision: null, action: { type: 'select', actor: 'user' } });
    await call('folio_resource_query', { root, op: 'refresh' });
    const query = await call('folio_resource_query', { root, op: 'query', selector: { type: 'current' }, freshness: 'requireCurrent' });
    assert.equal(query.entries[0].revisionId, revision.revisionId);
    return revision;
  }
  async function verifyHttp(root, revision, mode) {
    const opened = await call('folio_view', { root }); assert.equal(opened.built, true);
    const url = new URL(opened.url), token = url.searchParams.get('token');
    async function request(path, post = false) {
      const response = await fetch(new URL(path, url), { headers: { 'x-folio-token': token, ...(post ? { 'content-type': 'application/json' } : {}) },
        ...(post ? { method: 'POST', body: '{}' } : {}) });
      assert.equal(response.status, 200, path); return response.json();
    }
    const html = await (await fetch(url)).text();
    assert.match(html, /<div id="root">/);
    const script = html.match(/<script[^>]+src="([^"]+)"/)[1];
    assert.equal((await fetch(new URL(script, url))).status, 200);
    assert.equal((await request('/api/work')).mode, mode);
    assert.equal((await request('/api/resources')).entries[0].revisionId, revision.revisionId);
    const detail = await request('/api/resources/' + encodeURIComponent(revision.revisionId));
    assert.equal(detail.contentPreview, 'Synthetic selected resource </script>');
    const impact = mode === 'writing' ? await request('/api/impact') : null;
    if (impact) assert.equal(impact.available, true);
    await request('/api/export', true);
    const snapshot = snapshotOf(await readFile(join(root, 'exports/viewer/index.html'), 'utf8'));
    assert.equal(snapshot.work.mode, mode);
    if (impact) { assert.deepEqual(snapshot.impact, impact); assert.ok(snapshot.tracking && snapshot.publication); }
    assert.equal(snapshot.resources.entries[0].revisionId, revision.revisionId);
    assert.equal(snapshot.resourceDetails[revision.revisionId].contentPreview, detail.contentPreview);
    assert.equal(snapshot.work.capabilities.viewerToggles, false);
    return snapshot;
  }
  try {
    const [writing] = await runExamples({ names: ['picturebook'], out: join(base, 'writing') });
    const root = writing.root;
    await client.connect(transport);
    const manifest = JSON.parse(await readFile(join(REPO, 'package.json'), 'utf8'));
    const serverInfo = client.getServerVersion();
    assert.deepEqual(serverInfo, { name: manifest.name, version: manifest.version });
    assert.match(client.getInstructions(), /Reading edition/);
    const { tools } = await client.listTools(); const provider = new AjvJsonSchemaValidator();
    for (const tool of tools) validators.set(tool.name, provider.getValidator(tool.outputSchema));
    await call('folio_structure', { root, op: 'add' }, 'TOOL_INPUT_INVALID');
    const image = join(base, 'synthetic.svg'); await writeFile(image, SVG);
    let a = (await call('folio_assets', { root, op: 'add', id: 'synthetic-image', brief: { description: 'Synthetic blue square' } })).asset;
    const change = async (op, args) => { a = (await call('folio_assets', { root, op, id: a.id, expectedRev: a.rev, ...args })).asset; };
    await change('put', { path: image, mediaType: 'image/svg+xml' });
    await change('review', { contentHash: a.output.contentHash, checked: a.checks.map((c) => c.id), findings: [] });
    assert.equal(a.review.reviewer.sameHost, true);
    await change('decide', { reviewId: a.review.reviewId, action: 'approve' });
    await change('attach', { nodeIds: ['toy-spread-1'] }); assert.equal(a.approved, true);
    const revision = await resources(root);
    const snapshot = await verifyHttp(root, revision, 'writing');
    assert.equal(snapshot.nodes['toy-spread-1'].assets.attached[0].approved, true);
    assert.equal(Buffer.from(snapshot.assetFiles[a.id].split(',')[1], 'base64').toString(), SVG);
    const web = await call('folio_export', { root, format: 'web', output: join(base, 'web') });
    assert.match(await readFile(join(web.output, 'index.html'), 'utf8'), /상자/);
    const epub = await call('folio_export', { root, format: 'epub', output: join(base, 'epub') });
    const epubVerified = verifyEpub(await readFile(join(epub.output, 'book.epub')), SVG);
    const editions = await verifyProductionEditions(root, call);
    const resourceRoot = join(base, 'resources'); await mkdir(resourceRoot);
    const selected = await resources(resourceRoot); await verifyHttp(resourceRoot, selected, 'resources');
    await assert.rejects(access(join(resourceRoot, 'work.yaml')), { code: 'ENOENT' });
    const missing = await call('folio_embeddings', { root: resourceRoot, op: 'index' }, 'EMBEDDING_RUNTIME_UNAVAILABLE');
    const installedCliReady = await verifyViewerCli(REPO, resourceRoot);
    assert.equal(stderr, '');
    return { synthetic: true, viewerResourceVisible: true, epubVerified, resourceOnlyVerified: true,
      installedCliReady, serverInfo, editions, impactVerified: snapshot.impact.available, embeddingUnavailable: missing.code, outputsRetained: false };
  } finally {
    try { await client.close(); } finally { await rm(base, { recursive: true, force: true }); }
  }
}

const invokedPath = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invokedPath === await realpath(fileURLToPath(import.meta.url))) {
  runProductionExample().then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
