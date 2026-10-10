import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, seedEvents } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

/** MCP 너머의 가짜 호스트 모델: 검사는 지적 없이, 수정 요청에는 같은 원고로 답한다. 원고는 fixture 본문 그대로. */
function answer(request) {
  const p = request.payload;
  if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
  if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
  if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획`;
  if (p.produces === 'draft') return p.node.body || `${p.node.title || p.node.id} 본문.\n`;
  if (p.produces === 'events') return JSON.stringify({ events: [], appearances: [], mentions: [] });
  throw new Error(`no answer for ${request.purpose}/${p.produces}`);
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

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

test('M6a over MCP stdio: name → definition → usages → another scene; a stage toggle lands in work.yaml and shows in the receipt; locked stages are refused', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  const view = await ok(folio.call('folio_view', { root, nodeId: 'ep-001' }));
  assert.equal(view.status, 'ready');
  assert.equal(typeof view.built, 'boolean');
  assert.match(view.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+#\/read\/ep-001$/);
  const get = browserFor(view.url);

  const scene = (await get('/api/nodes/ep-001')).json;
  const name = scene.segments.find((s) => s.entityId === 'locked-door');
  assert.equal(name.text, '잠긴 문');
  const definition = (await get(`/api/entities/${name.entityId}`)).json;
  assert.equal(definition.entity.body, '문 너머에 무엇이 있는가.\n');
  assert.deepEqual(definition.events.map((e) => e.nodeId), ['ep-001', 'ep-003', 'ep-006']);
  const elsewhere = definition.usages.find((u) => u.kind === 'node' && u.id !== 'ep-001' && u.id.startsWith('ep-'));
  const other = (await get(`/api/nodes/${elsewhere.id}`)).json;
  assert.ok(other.segments.some((s) => s.entityId === 'locked-door'), elsewhere.id);

  const before = await readFile(join(root, 'work.yaml'), 'utf8');
  const stages = (await get('/api/stages')).json;
  const episode = stages.levels.find((l) => l.level === 'episode').steps;
  assert.deepEqual(episode.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  for (const stepId of ['commit', 'facts', 'draft']) {
    const refused = await get('/api/stages', { level: 'episode', stepId, mode: 'off', baseDigest: stages.digest });
    assert.deepEqual([refused.status, refused.json.error.code], [403, 'STEP_LOCKED'], stepId);
  }
  assert.equal(await readFile(join(root, 'work.yaml'), 'utf8'), before);
  const toggled = await get('/api/stages', { level: 'episode', stepId: 'critic', mode: 'off', reason: '초고 속도 우선', baseDigest: stages.digest });
  assert.equal(toggled.status, 200);
  assert.match(await readFile(join(root, 'work.yaml'), 'utf8'), /episode:\n {6}critic:\n {8}mode: off\n {8}reason: 초고 속도 우선/);
  const config = await ok(folio.call('folio_config', { root }));
  assert.equal(config.pipelines.episode.steps.find((s) => s.id === 'critic').mode, 'off');

  let out = await ok(folio.call('folio_run', { root, node: 'ep-001' }));
  for (let i = 0; i < 40 && out.status !== 'done'; i += 1) {
    if (out.status === 'needs_model') out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    else if (out.status === 'needs_user') out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    else throw new Error(`unexpected ${label(out)}`);
  }
  assert.equal(out.status, 'done');
  const receipt = (await get('/api/receipts/ep-001')).json.receipt;
  const critic = receipt.steps.find((s) => s.id === 'critic');
  assert.deepEqual([critic.status, critic.reason, critic.source], ['skipped', '초고 속도 우선', 'work.yaml#overrides.critic']);
  const list = (await get('/api/receipts')).json.nodes.find((n) => n.nodeId === 'ep-001');
  assert.deepEqual([list.committed, list.skipped], [true, ['critic']]);
  assert.equal((await ok(folio.call('folio_view', { root }))).reused, true);
  assert.doesNotMatch(folio.stderr(), /Error/);
});
