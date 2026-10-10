import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { tempDir } from '../support/fixtures.js';
import { runExamples } from '../../examples/run.js';

test('both storybook formats finish over real stdio MCP with the committed synthetic bodies', async () => {
  const results = await runExamples({ names: ['picturebook', 'fairytale'], verify: true });
  assert.deepEqual(results.map((r) => [r.example, r.committed.length]), [['picturebook', 3], ['fairytale', 3]]);
});

for (const [preset, levels] of [['picturebook', ['book', 'spread']], ['fairytale', ['chapter', 'scene']]]) {
  test(`${preset} selects its structure and advisory reader review while retaining core locks`, async () => {
    const packs = await loadBuiltinPacks();
    const tools = createToolbox({ packs });
    const root = join(await tempDir(), preset);
    const init = await tools.call('folio_init', { root, title: '합성 입력', preset });
    assert.equal(init.ok, true, JSON.stringify(init.error));
    const ws = await openWorkspace(root, { packs });
    assert.deepEqual(ws.work.config.levels.map((l) => l.name), levels);
    assert.ok(ws.checks.some((c) => c.id === 'core.promise-order' && c.severity === 'hard'));
    assert.ok(ws.checks.some((c) => c.id === 'novel.dead-on-stage' && c.severity === 'hard'));
    const review = ws.checks.find((c) => c.id === 'novel.young-readers');
    assert.deepEqual([review.severity, review.experimental, review.requireQuote], ['advisory', true, true]);
    assert.deepEqual(ws.pipelines.leaf.steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  });
}

test('a picturebook reader advisory remains visible and cannot silently rewrite the approved spread', async () => {
  const packs = await loadBuiltinPacks();
  const tools = createToolbox({ packs });
  const root = join(await tempDir(), 'advisory-picturebook');
  assert.equal((await tools.call('folio_init', { root, title: '합성 입력', preset: 'picturebook' })).ok, true);
  assert.equal((await tools.call('folio_structure', { root, op: 'add', level: 'book', id: 'toy-book', title: '합성 책' })).ok, true);
  assert.equal((await tools.call('folio_structure', { root, op: 'add', parentId: 'toy-book', level: 'spread', id: 'toy-spread', title: '합성 펼침면' })).ok, true);
  const draft = '### 읽을 글\n상자가 열렸다.\n\n### 그림 설명\n닫힌 파란 상자를 그릴 계획이다.\n';
  const host = createFakeHost({ drafts: { 'toy-spread': draft }, critic: () => [{
    checkId: 'novel.young-readers', code: 'PICTURE_TEXT_CONFLICT', message: '본문은 열렸지만 그림 설명은 닫혔다.', quote: '닫힌 파란 상자를 그릴 계획이다.',
  }] });
  const make = () => createRunner({ root, packs });
  const trail = await driveToEnd(make, host, { start: { node: 'toy-spread' }, until: (o) => o.status === 'needs_user' });
  const gate = trail.at(-1);
  assert.equal(gate.question.kind, 'approve');
  assert.equal(gate.question.advisories[0].code, 'PICTURE_TEXT_CONFLICT');
  assert.ok(!host.calls.some((c) => c.purpose === 'revise'));
  const done = await make().decide({ runId: gate.runId, action: 'approve' });
  assert.equal(done.status, 'done');
  const saved = await tools.call('folio_find', { root, query: 'node', id: 'toy-spread' });
  assert.equal(saved.result.node.body.trim(), draft.trim());
  assert.equal(host.calls.filter((c) => c.purpose === 'check' && c.stepId === 'critic').length, 1);
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt');
  const readerReview = receipt.steps.flatMap((s) => s.checks ?? []).find((c) => c.checkId === 'novel.young-readers');
  assert.deepEqual(readerReview.reviewer, { sameHost: true, independent: false });
});
