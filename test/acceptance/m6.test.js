import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { answerer, drive, ok, serialWork } from '../support/parity-serial.js';

/** folio_view 가 준 주소로 API 를 부르는 브라우저 대신. */
function browserFor(viewUrl) {
  const url = new URL(viewUrl);
  const token = url.searchParams.get('token');
  return async (path, body) => {
    const res = await fetch(new URL(path, url), body === undefined
      ? { headers: { 'x-folio-token': token } }
      : { method: 'POST', headers: { 'x-folio-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
}

test('M6 done over MCP stdio on the M5 work: name → definition → usages → another scene; every screen answers; toggles land in work.yaml and locks never move', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await serialWork();
  const view = await ok(folio.call('folio_view', { root }));
  const get = browserFor(view.url);

  const outline = await get('/api/work');
  assert.equal(outline.status, 200);
  assert.equal(outline.json.title, '붉은 봉인');
  assert.ok(outline.json.nodes.some((node) => node.id === 'ep-001'));

  const first = (await get('/api/nodes/ep-001')).json;
  const name = first.segments.find((s) => s.entityId === 'hana');
  const definition = (await get(`/api/entities/${name.entityId}`)).json;
  assert.equal(definition.entity.name, '하나');
  assert.deepEqual(definition.events.map((e) => [e.nodeId, e.kind]), [['ep-003', 'state']]);
  const elsewhere = definition.usages.find((u) => u.kind === 'node' && u.id !== 'ep-001' && u.id.startsWith('ep-'));
  assert.ok((await get(`/api/nodes/${elsewhere.id}`)).json.segments.some((s) => s.entityId === 'hana'), elsewhere.id);

  const board = (await get('/api/promises')).json;
  const seal = board.promises.find((p) => p.entityId === 'red-seal');
  assert.deepEqual([seal.stage, seal.dormant?.code], ['planted', 'PROMISE_DORMANT']);
  assert.equal(board.promises.find((p) => p.entityId === 'old-map').stage, 'advanced');
  const graph = (await get('/api/graph')).json;
  assert.ok(graph.edges.some((e) => e.source === 'node:ep-001' && e.target === 'entity:hana'));
  const sets = (await get('/api/check-sets')).json;
  assert.deepEqual(sets.sets.filter((s) => s.selected).map((s) => s.id), ['novel.basic', 'novel.serial', 'novel.style']);
  assert.equal(sets.checks.find((c) => c.id === 'core.promise-order').locked, true);
  assert.equal((await get('/api/blocks')).status, 200);
  await ok(folio.call('folio_sources', { root, op: 'add', id: 'm6-note', title: '합성 자료', text: 'M6 화면 확인용 문장.\n' }));
  const sources = await get('/api/sources');
  assert.equal(sources.status, 200);
  assert.ok(sources.json.sources.some((source) => source.id === 'm6-note'));
  const source = await get('/api/sources/m6-note');
  assert.equal(source.status, 200);
  assert.deepEqual([source.json.source.title, source.json.source.text], ['합성 자료', 'M6 화면 확인용 문장.\n']);

  const before = await readFile(join(root, 'work.yaml'), 'utf8');
  const stages = (await get('/api/stages')).json;
  for (const stepId of ['commit', 'facts', 'extract', 'draft']) {
    const locked = await get('/api/stages', { level: 'episode', stepId, mode: 'off', baseDigest: stages.digest });
    assert.deepEqual([locked.status, locked.json.error.code], [403, 'STEP_LOCKED'], stepId);
  }
  assert.equal(await readFile(join(root, 'work.yaml'), 'utf8'), before);
  assert.equal((await get('/api/stages', { level: 'episode', stepId: 'critic', mode: 'off', reason: '초고 속도 우선', baseDigest: stages.digest })).status, 200);
  assert.match(await readFile(join(root, 'work.yaml'), 'utf8'), /episode:\n {6}critic:\n {8}mode: off\n {8}reason: 초고 속도 우선/);
  assert.equal((await ok(folio.call('folio_config', { root }))).pipelines.episode.steps.find((s) => s.id === 'critic').mode, 'off');
  const { out } = await drive(folio, root, { node: 'ep-001' }, answerer({ 'ep-001': { draft: first.segments.map((s) => s.text ?? '').join('') } }));
  assert.equal(out.status, 'done');
  const receipt = (await get('/api/receipts/ep-001')).json.receipt;
  assert.deepEqual(receipt.steps.filter((s) => s.status === 'skipped').map((s) => [s.id, s.reason]), [['critic', '초고 속도 우선']]);
  assert.deepEqual((await get('/api/receipts')).json.nodes.find((n) => n.nodeId === 'ep-001').skipped, ['critic']);
  const evidence = await get('/api/evidence/ep-001');
  assert.equal(evidence.status, 200);
  assert.equal(evidence.json.nodeId, 'ep-001');
  assert.deepEqual(evidence.json.claims, []);

  const exported = await get('/api/export', {});
  if (view.built) assert.equal(exported.json.dir, 'exports/viewer');
  else {
    assert.deepEqual([exported.status, exported.json.error.code], [400, 'VIEWER_NOT_BUILT']);
    assert.equal(exported.json.error.details.hint, view.hint);
    assert.match(view.hint, /npm --prefix viewer run build/);
  }
  assert.doesNotMatch(folio.stderr(), /Error/);
});
