import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO = dirname(import.meta.dirname);
const svg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${color}"/></svg>`;

/** 실제 stdio MCP로 합성 파일 인계·승인·교체를 검증한다. 이미지 생성/시각 검토 정확도 검증은 아니다. */
export async function runAssetExample() {
  const base = await mkdtemp(join(tmpdir(), 'folio-asset-example-'));
  const root = join(base, 'work');
  const path = join(base, 'host-result.svg');
  const client = new Client({ name: 'folio-synthetic-assets', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(REPO, 'bin', 'linivera-mcp.js')], cwd: REPO, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  async function call(name, args, errorCode = null) {
    const out = await client.callTool({ name, arguments: { root, ...args } });
    const body = JSON.parse(out.content[0].text);
    if (errorCode) { assert.equal(body.error?.code, errorCode); assert.equal(out.isError, true); return body; }
    assert.ok(!out.isError, JSON.stringify(body));
    return body;
  }
  const change = async (a, op, args) => (await call('folio_assets', { op, id: a.id, expectedRev: a.rev, ...args })).asset;
  const review = (a) => change(a, 'review', { contentHash: a.output.contentHash,
    checked: a.checks.map((c) => c.id), findings: [] });
  const approve = (a) => change(a, 'decide', { reviewId: a.review.reviewId, action: 'approve' });
  try {
    await client.connect(transport);
    await call('folio_init', { title: '합성 자산 예제', preset: 'picturebook' });
    await call('folio_structure', { op: 'add', id: 'toy-book', level: 'book', title: '합성 책' });
    let a = (await call('folio_assets', { op: 'add', id: 'toy-image', title: '합성 사각형', brief: { description: '파란 사각형' } })).asset;
    assert.equal(a.status, 'planned');
    a = await change(a, 'put', { uri: 'resource://host/toy-image', mediaType: 'image/svg+xml', origin: { provider: 'synthetic-host-a', imageId: 'opaque-a' } });
    assert.equal(a.status, 'reference_only');
    await call('folio_assets', { op: 'review', id: a.id, expectedRev: a.rev, contentHash: 'sha256:' + '0'.repeat(64), checked: a.checks.map((c) => c.id), findings: [] }, 'ASSET_CONTENT_UNVERIFIED');
    await writeFile(path, svg('blue'));
    a = await change(a, 'put', { path, mediaType: 'image/svg+xml', origin: { provider: 'synthetic-host-b', imageId: 'opaque-b' } });
    await unlink(path);
    assert.equal(await readFile(join(root, 'assets', a.output.file), 'utf8'), svg('blue'));
    a = await approve(await review(a));
    assert.equal(a.approved, true);
    assert.deepEqual(a.review.reviewer, { sameHost: true, independent: false });
    a = await change(a, 'attach', { nodeIds: ['toy-book'] });
    const old = a;
    await writeFile(path, svg('red'));
    a = await change(a, 'put', { path, mediaType: 'image/svg+xml' });
    assert.deepEqual(a.output.origin, {});
    assert.equal(a.approved, false);
    assert.equal(a.review, null);
    await call('folio_assets', { op: 'decide', id: a.id, expectedRev: old.rev, reviewId: old.review.reviewId, action: 'approve' }, 'ASSET_REV_STALE');
    await call('folio_assets', { op: 'decide', id: a.id, expectedRev: a.rev, reviewId: old.review.reviewId, action: 'approve' }, 'ASSET_REVIEW_STALE');
    a = await approve(await review(a));
    assert.equal(a.approved, true);
    const detail = await call('folio_assets', { op: 'get', id: a.id });
    assert.deepEqual(detail.usages.map((u) => u.nodeId), ['toy-book']);
    assert.equal(detail.history.filter((r) => r.type === 'asset_version').length, 4);
    assert.equal((await call('folio_assets', { op: 'list' })).summary.approved, 1);
    assert.equal(stderr, '');
    return { synthetic: true, verified: true, outputsRetained: false, version: a.version, status: a.status, providersOptional: true };
  } finally {
    await client.close();
    await rm(base, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invokedPath === await realpath(fileURLToPath(import.meta.url))) {
  runAssetExample().then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
