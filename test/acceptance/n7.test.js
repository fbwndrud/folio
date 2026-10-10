import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { createFakeHost } from '../support/fake-host.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { updateNode } from '../../core/store/tree.js';
import { openWork } from '../../core/store/work.js';
const ok = async (promise) => { const out = await promise; assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };

test('N7 MCP 게임북 초기화와 모델 질문·승인·커밋은 기존 잠금 경로를 쓴다', async (t) => {
  const folio = await connectFolio(); t.after(() => folio.close());
  const newRoot = join(await tempDir('folio-n7-init-'), 'work');
  const made = await ok(folio.call('folio_init', { root: newRoot, title: '합성 게임북', preset: 'gamebook', packs: ['gamebook'] }));
  assert.equal(made.config.order, 'branching'); assert.deepEqual(made.config.checkSets, ['gamebook.basic']);
  const root = await copyFixture('gamebook-n7'), host = createFakeHost();
  let out = await ok(folio.call('folio_run', { root, node: 'a' }));
  const requests = [];
  for (let i = 0; i < 40 && out.status !== 'done'; i++) {
    if (out.status === 'needs_model') { requests.push(...out.requests); out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: host.answer(out) })); }
    else if (out.status === 'needs_user') out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    else throw new Error(`unexpected ${out.status}`);
  }
  assert.equal(out.status, 'done'); assert.ok(requests.some((r) => r.payload.branching?.applicable));
  const records = await openLedger(root, 'receipts').readAll(); assert.ok(records.some((r) => r.type === 'commit' && r.nodeId === 'a'));
});
test('승인 직전 선택이 바뀌면 기존 검사·승인으로 커밋하지 않는다', async (t) => {
  const folio = await connectFolio(); t.after(() => folio.close());
  const root = await copyFixture('gamebook-n7'), host = createFakeHost();
  let out = await ok(folio.call('folio_run', { root, node: 'a' }));
  for (let i = 0; i < 30 && out.status === 'needs_model'; i++) out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: host.answer(out) }));
  assert.equal(out.status, 'needs_user');
  const work = await openWork(root), node = work.tree.nodes.get('a');
  await updateNode(root, node, { data: { links: [{ to: 'b', kind: 'choice', label: '합성 변경' }] } });
  const next = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
  assert.notEqual(next.status, 'done');
  assert.ok(!(await openLedger(root, 'receipts').readAll()).some((r) => r.type === 'commit'));
});
