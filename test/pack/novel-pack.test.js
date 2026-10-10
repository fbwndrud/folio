import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { NOVEL_PACK_DIR } from '../../packs/novel/index.js';
import { deadOnStage } from '../../packs/novel/checkers/dead-on-stage.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { copyFixture, seedEvents } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

test('the novel pack loads and opens the serial fixture with its sets and the core locks', async () => {
  const packs = await loadBuiltinPacks();
  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants', 'gamebook']);
  const novel = packs.get('novel');
  assert.deepEqual(Object.keys(novel.presets), ['serial', 'novel', 'scene', 'picturebook', 'fairytale']);
  assert.deepEqual(novel.defaultCheckSets, ['novel.basic']);
  const root = await copyFixture('serial-2level');
  const ws = await openWorkspace(root, { packs });
  assert.deepEqual(ws.checks.map((c) => c.id).filter((id) => id.startsWith('novel.')).sort(), [
    'novel.cliffhanger', 'novel.critic', 'novel.dead-on-stage', 'novel.destroyed-object', 'novel.episode-hook', 'novel.fixed-facts',
    'novel.honorific-gender', 'novel.info-restate', 'novel.length', 'novel.metadata-leak', 'novel.parent-fit', 'novel.promise-dormant',
    'novel.promise-evidence', 'novel.promise-flow', 'novel.promise-kept', 'novel.sensitive', 'novel.time-skip', 'novel.webnovel-format',
  ]);
  assert.ok(ws.checks.some((c) => c.id === 'core.promise-order'));
  assert.deepEqual(ws.pipelines.leaf.steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  assert.deepEqual(ws.pipelines.branch.steps.filter((s) => s.locked).map((s) => s.id), ['commit']);
});

test('dead-on-stage: a prior death blocks an appearance unless someone revives them', () => {
  const dead = { entityId: 'doyun', kind: 'state', data: { vital: 'dead' } };
  const base = { priorEvents: [dead], appearances: ['doyun', 'hana'], draftEvents: [] };
  assert.deepEqual(deadOnStage(base).map((f) => [f.code, f.entityId]), [['DEAD_ON_STAGE', 'doyun']]);
  const revival = { entityId: 'doyun', kind: 'state', data: { vital: 'alive' }, quote: '도윤이 다시 눈을 떴다' };
  assert.deepEqual(deadOnStage({ ...base, draft: '도윤이 다시 눈을 떴다.', draftEvents: [revival] }), []);
  assert.deepEqual(deadOnStage({ ...base, priorEvents: [dead, { ...dead, data: { vital: 'alive' } }] }), []);
  assert.deepEqual(deadOnStage({ ...base, priorEvents: [] }), []);
});

test('with the novel pack, ep-004 (the dead doyun on stage) is blocked and cannot be approved', async () => {
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  const packs = await loadBuiltinPacks();
  const mk = () => createRunner({ root, packs });
  const first = await mk().run({ node: 'ep-004' });
  assert.equal(label(first), 'model:plan');
  assert.equal(first.requests[0].payload.instructions, await readFile(join(NOVEL_PACK_DIR, 'prompts', 'leaf-plan.md'), 'utf8'));
  const blocked = (await driveToEnd(mk, createFakeHost(), { from: first, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.equal(label(blocked), 'user:blocked');
  assert.equal(blocked.question.canApprove, false);
  assert.deepEqual(blocked.question.blocking.map((f) => f.code), ['DEAD_ON_STAGE']);
  await assert.rejects(mk().decide({ runId: blocked.runId, action: 'approve', reason: '괜찮다' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
});

test('the branch revise step revises the plan with its own prompt, the leaf keeps the draft prompt', async () => {
  const novel = (await loadBuiltinPacks()).get('novel');
  const read = (name) => readFile(join(NOVEL_PACK_DIR, 'prompts', name), 'utf8');
  assert.equal(novel.prompts['leaf.revise'], await read('revise.md'));
  assert.equal(novel.prompts['branch.revise'], await read('revise-plan.md'));
  assert.match(novel.prompts['branch.revise'], /계획/);
  assert.doesNotMatch(novel.prompts['branch.revise'], /원고|draft/);
});
