import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { TREE_DIR } from '../../core/store/tree.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { addNode } from '../../core/structure/ops.js';
import { createRunner } from '../../core/run/runner.js';
import { workStatus } from '../../core/status.js';
import { copyFixture, emptyTreeCopy, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';

const runnerFor = (root) => () => createRunner({ root, packs: fakePacks() });
const status = (root) => workStatus(root, { packs: fakePacks() });

test('a fresh work names the next node and has no active run', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const s = await status(root);
  assert.deepEqual(s.ledger, { receipts: { ok: true }, events: { ok: true }, decisions: { ok: true } });
  assert.deepEqual(s.next, { nodeId: 'rooftop-scene', level: 'scene', kind: 'leaf' });
  assert.equal(s.activeRun, null);
  assert.deepEqual([s.waiting, s.stale, s.drift, s.warnings], [[], [], [], []]);
});

test('an opened run is reported as the active run', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const outcome = await runnerFor(root)().run({ node: 'next' });
  assert.equal(outcome.status, 'needs_model');
  assert.deepEqual((await status(root)).activeRun, { runId: outcome.runId, nodeId: 'rooftop-scene', state: 'awaiting_model' });
});

test('a top-down parent waiting for its children is listed in waiting', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root);
  await addNode(root, await openWork(root), { level: 'book', id: 't1', title: 't1' });
  const host = createFakeHost({ children: { t1: (p) => [{ id: `${p.node.id}-1`, title: '가' }] } });
  const trail = await driveToEnd(runnerFor(root), host, { until: (o) => Boolean(o.nodeId) && o.nodeId !== 't1' });
  assert.equal(trail.at(-1).nodeId, 't1-1');
  const s = await status(root);
  assert.deepEqual(s.waiting, ['t1']);
  assert.equal(s.activeRun.nodeId, 't1-1');
});

test('a hand-edited committed body is listed in drift', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  await driveToEnd(runnerFor(root), createFakeHost(), { until: (o) => o.status === 'done' });
  assert.deepEqual((await status(root)).drift, []);
  const node = (await openWork(root)).tree.nodes.get('rooftop-scene');
  const path = join(root, TREE_DIR, node.path);
  const text = await readFile(path, 'utf8');
  assert.ok(text.includes(node.body));
  await writeFile(path, text.replace(node.body, `${node.body} 손으로 고침`));
  assert.deepEqual((await status(root)).drift.map((d) => [d.nodeId, d.code]), [['rooftop-scene', 'HAND_EDITED']]);
});

test('a tampered events ledger short-circuits the status', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  await driveToEnd(runnerFor(root), createFakeHost(), { until: (o) => o.status === 'done' });
  await writeFile(openLedger(root, 'events').path, `${JSON.stringify({ type: 'event', seq: 1, prev: 'genesis', hash: 'x' })}\n`);
  const s = await status(root);
  assert.equal(s.ledger.receipts.ok, true);
  assert.equal(s.ledger.events.ok, false);
  assert.deepEqual({ ...s, ledger: null }, { ledger: null, next: null, activeRun: null, waiting: [], stale: [], recheck: [], flagged: [], drift: [], warnings: [] });
});

test('a tampered decisions ledger is reported and short-circuits the status', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  await driveToEnd(runnerFor(root), createFakeHost(), { until: (o) => o.status === 'done' });
  await writeFile(openLedger(root, 'decisions').path, `${JSON.stringify({ type: 'check_result', seq: 1, prev: 'genesis', hash: 'x' })}\n`);
  const s = await status(root);
  assert.deepEqual([s.ledger.receipts.ok, s.ledger.events.ok, s.ledger.decisions.ok], [true, true, false]);
  assert.deepEqual({ ...s, ledger: null }, { ledger: null, next: null, activeRun: null, waiting: [], stale: [], recheck: [], flagged: [], drift: [], warnings: [] });
});

test('corrupt run files are skipped and reported as warnings', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const outcome = await runnerFor(root)().run({ node: 'next' });
  const dir = join(root, '.folio', 'runs');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'run-broken.json'), '{ not json');
  const s = await status(root);
  assert.deepEqual(s.warnings, [{ code: 'RUN_FILE_CORRUPT', runId: 'run-broken' }]);
  assert.deepEqual(s.activeRun, { runId: outcome.runId, nodeId: 'rooftop-scene', state: 'awaiting_model' });
  assert.deepEqual(s.next, { nodeId: 'rooftop-scene', level: 'scene', kind: 'leaf' });
});
