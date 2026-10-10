import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { DECISIONS_LEDGER } from '../../core/ledger/decisions.js';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, seedEvents, tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

/** MCP 너머의 가짜 호스트 모델. 요청 모양만 보고 합성 답을 만든다. */
function answerFor(request) {
  const p = request.payload;
  if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
  if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
  if (p.produces === 'plan') return p.node.id === 'arc-1' ? '첫 아크 계획' : `${p.node.title} 계획`;
  if (p.produces === 'children') return JSON.stringify({ children: [{ id: 'ep-1', title: '1화' }, { id: 'ep-2', title: '2화' }] });
  if (p.produces === 'draft') return p.node.id === 'ep-1' ? '1화 본문' : `${p.node.title} 본문`;
  if (p.produces === 'events') return JSON.stringify({ events: [], appearances: [], mentions: [] });
  throw new Error(`no answer for ${request.purpose}/${p.produces}`);
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** until 을 만날 때까지 run/resume/decide 를 MCP 로 돌린다. 지나온 결과 이름을 모은다. */
async function drive(folio, root, start, until) {
  const labels = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 50; i += 1) {
    labels.push(label(out));
    if (until(out)) return { labels, out };
    if (out.status === 'needs_model') {
      out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answerFor(r)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}`);
  }
  throw new Error('drive did not finish');
}

test('M3: over MCP stdio a new serial work gets an approved arc plan and a committed first episode', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = join(await tempDir('folio-m3-'), '유리 등대');
  assert.equal((await ok(folio.call('folio_init', { root, title: '유리 등대', preset: 'serial' }))).created, true);
  await ok(folio.call('folio_structure', { root, op: 'add', level: 'arc', id: 'arc-1', title: '첫 아크' }));
  const { labels, out } = await drive(folio, root, { node: 'next' }, (o) => o.status === 'done');
  assert.deepEqual(labels, [
    'model:plan', 'user:approve', 'model:children',
    'model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve', 'done',
  ]);
  assert.equal(out.nodeId, 'ep-1');
  const status = await ok(folio.call('folio_status', { root }));
  assert.equal(status.next.nodeId, 'ep-2');
  assert.equal(status.activeRun, null);
  assert.deepEqual(status.waiting, ['arc-1']);
  assert.ok(status.ledger.receipts.ok && status.ledger.events.ok && status.ledger.decisions.ok);
  const work = await openWork(root);
  const ep1 = work.tree.nodes.get('ep-1');
  assert.deepEqual([ep1.status, ep1.body.trim()], ['committed', '1화 본문']);
  const arc = work.tree.nodes.get('arc-1');
  assert.deepEqual([arc.status, arc.body.trim()], ['planned', '첫 아크 계획']);
  const receipts = await openLedger(root, 'receipts').readAll();
  assert.deepEqual(receipts.filter((r) => r.type === 'commit').map((r) => r.nodeId), ['ep-1']);
  const decisions = await openLedger(root, DECISIONS_LEDGER).readAll();
  assert.deepEqual(decisions.filter((r) => r.type === 'approval').map((r) => r.nodeId), ['arc-1', 'ep-1']);
  assert.doesNotMatch(folio.stderr(), /ExperimentalWarning/);
});

test('M3: a hard conflict found by the novel pack cannot be approved over MCP', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  const { out } = await drive(folio, root, { node: 'ep-004' }, (o) => o.status === 'needs_user');
  assert.equal(label(out), 'user:blocked');
  assert.deepEqual(out.question.blocking.map((f) => f.code), ['DEAD_ON_STAGE']);
  const refused = await folio.call('folio_decide', { root, runId: out.runId, action: 'approve', reason: '괜찮다' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'APPROVE_BLOCKED_BY_HARD']);
  const status = await ok(folio.call('folio_status', { root }));
  assert.equal(status.pending.question.kind, 'blocked');
});
