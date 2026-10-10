import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { label } from '../support/fake-host.js';
import { importTarget, treeHashes, VIBELORE_FIXTURE } from '../support/import-source.js';

/** MCP 너머의 가짜 호스트: 검사는 지적 없이, 사건 추출은 빈 목록으로 답한다. */
function answer(request) {
  const p = request.payload;
  if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
  if (p.produces === 'events') return JSON.stringify({ events: [], appearances: [], mentions: [] });
  if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
  throw new Error(`unexpected request ${request.purpose}/${p.produces}`);
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

test('M7b MCP stdio: imported prose and SVG stay uncommitted until recommit creates a real receipt', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const before = await treeHashes(VIBELORE_FIXTURE);
  const root = await importTarget('lighthouse');
  const imported = await ok(folio.call('folio_import_vibelore', { root, from: VIBELORE_FIXTURE, title: '등대' }));
  assert.deepEqual([imported.status, imported.imported], ['imported', { arcs: 2, episodes: 4, entities: 3, assets: 2 }]);
  assert.deepEqual(await treeHashes(VIBELORE_FIXTURE), before, '합성 원본은 읽기 전용이다');
  assert.equal((await ok(folio.call('folio_status', { root }))).next, null);

  const view = await ok(folio.call('folio_view', { root, nodeId: 'ep-001' }));
  const url = new URL(view.url);
  const headers = { 'x-folio-token': url.searchParams.get('token') };
  const get = async (path) => {
    const response = await fetch(new URL(path, url), { headers });
    assert.equal(response.status, 200, path);
    return response.json();
  };
  const node = await get('/api/nodes/ep-001');
  assert.equal(node.node.status, 'imported');
  assert.match(node.segments.map((segment) => segment.text ?? '').join(''), /꺼진 등불을 들어 올렸다/);
  assert.deepEqual(node.assets.attached.map((asset) => [asset.id, asset.known, asset.hasFile]), [
    ['ep-001-webtoon', true, true], ['ep-001-webtoon-2', true, true],
  ]);
  const picture = await fetch(new URL('/api/assets/ep-001-webtoon', url), { headers });
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get('content-type'), 'image/svg+xml');
  assert.equal(picture.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  assert.deepEqual(Buffer.from(await picture.arrayBuffer()), await readFile(join(VIBELORE_FIXTURE, 'webtoon', 'episodes', '1-wt-aaaa1111', 'episode.svg')));

  const list = await get('/api/receipts');
  const row = list.nodes.find((item) => item.nodeId === 'ep-001');
  assert.deepEqual([row.status, row.committed, row.receiptId, row.imported.status, row.imported.path],
    ['imported', false, null, 'imported', 'chapters/001.md']);
  const beforeReceipt = await get('/api/receipts/ep-001');
  assert.deepEqual([beforeReceipt.receipt, beforeReceipt.commits.length, beforeReceipt.imported.status], [null, 0, 'imported']);

  const labels = [];
  const requests = [];
  let out = await ok(folio.call('folio_run', { root, node: 'ep-001', mode: 'recommit' }));
  for (let i = 0; i < 40 && out.status !== 'done'; i += 1) {
    labels.push(label(out));
    if (out.status === 'needs_model') {
      requests.push(...out.requests);
      out = await ok(folio.call('folio_resume', { root, runId: out.runId,
        answers: Object.fromEntries(out.requests.map((request) => [request.requestId, answer(request)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}: ${labels.join(' → ')}`);
  }
  assert.equal(out.status, 'done', labels.join(' → '));
  assert.ok(requests.some((request) => request.purpose === 'check'));
  assert.ok(requests.some((request) => request.payload.produces === 'events'));
  assert.ok(!requests.some((request) => request.payload.produces === 'draft'), 'recommit은 새 본문 초안을 요구하지 않는다');
  const receipt = await get('/api/receipts/ep-001');
  assert.deepEqual([typeof receipt.receipt.receiptId, receipt.imported.status, receipt.imported.origin.receipts.length],
    ['string', 'imported', 1]);
  assert.equal(receipt.commits.length, 1);
  assert.equal((await get('/api/nodes/ep-001')).node.status, 'committed');
  assert.equal(folio.stderr(), '');
});
