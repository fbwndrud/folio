import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeLinks } from '../../packs/knowledge/checkers/links.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { openWork } from '../../core/store/work.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { initWork } from '../../core/work/init.js';
import { recommendCheckSets } from '../../core/checks/recommend.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, fixturePath, tempDir } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

/** 복사본의 work.yaml 에 설정을 더한다(작가가 하는 일). */
async function edited(fixture, config) {
  const root = await copyFixture(fixture);
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...config }));
  return root;
}

test('knowledge.links flags links to missing nodes and to the node itself, without severity or quote', async () => {
  const work = await openWork(fixturePath('reference-book'));
  const at = (id) => nodeLinks({ work, node: work.tree.nodes.get(id) });
  assert.deepEqual(at('membrane'), [{ code: 'LINK_BROKEN', target: 'ghost-entry', message: '링크 ghost-entry(없는 항목)가 가리키는 노드가 작품에 없다' }]);
  assert.deepEqual(at('nucleus'), [{ code: 'LINK_SELF', target: 'nucleus', message: '링크 nucleus(핵)가 이 노드 자신을 가리킨다' }]);
  assert.deepEqual([at('cell'), at('mitochondria')], [[], []]);
  assert.throws(() => nodeLinks({ node: work.tree.nodes.get('cell') }), TypeError);
  assert.throws(() => nodeLinks({ work }), TypeError);
});

test('a none entry run with knowledge.unordered: links advisory at approve, linked-consistency asked with linkedEvents, order checks not applicable', async () => {
  const root = await edited('reference-book', { checkSets: ['knowledge.unordered'] });
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  await ledger.append({ type: 'event', eventId: 'seed-1', nodeId: 'cell', entityId: 'cell-membrane', kind: 'term.defined' });
  const packs = await loadBuiltinPacks();
  const host = createFakeHost({ drafts: { membrane: '세포막은 세포의 바깥 경계다.' } });
  const trail = await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'membrane' }, until: (o) => o.status === 'needs_user' });
  assert.deepEqual(trail.map(label), ['model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve']);
  const critic = trail.find((o) => label(o) === 'model:critic').requests[0].payload;
  assert.deepEqual(critic.checks.map((c) => c.checkId), ['knowledge.linked-consistency']);
  assert.deepEqual(critic.linkedEvents.map((e) => `${e.nodeId}:${e.entityId}:${e.kind}`), ['cell:cell-membrane:term.defined']);
  const approve = trail.at(-1);
  assert.deepEqual(approve.question.advisories.map((f) => [f.checkId, f.code, f.severity]), [['knowledge.links', 'LINK_BROKEN', 'advisory']]);
  assert.equal((await createRunner({ root, packs }).decide({ runId: approve.runId, action: 'approve' })).status, 'done');
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'membrane');
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.deepEqual(facts.checks.map((c) => [c.checkId, c.status]), [
    ['core.promise-order', 'not_applicable'], ['knowledge.links', 'passed'], ['knowledge.cross-refs', 'passed'], ['knowledge.term-consistency', 'passed'],
  ]);
});

test('on a linear textbook the none-only model check is not applicable and is not asked', async () => {
  const root = await edited('knowledge-book', { checkSets: ['knowledge.unordered'] });
  const packs = await loadBuiltinPacks();
  const trail = await driveToEnd(() => createRunner({ root, packs }), createFakeHost(), { start: { node: 'membranes' }, until: (o) => o.status === 'done' });
  assert.deepEqual(trail.map(label), ['model:plan', 'model:draft', 'model:extract', 'user:approve', 'done']);
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'membranes');
  const critic = receipt.steps.find((s) => s.id === 'critic');
  assert.deepEqual(critic.checks.map((c) => [c.checkId, c.status]), [['knowledge.linked-consistency', 'not_applicable']]);
});

test('the reference preset makes an unordered work that recommends knowledge.unordered for the reference kind', async () => {
  const packs = await loadBuiltinPacks();
  const root = join(await tempDir(), 'dictionary');
  await initWork(root, { title: '작은 사전', packs: ['knowledge'], preset: 'reference', available: packs });
  const yaml = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  assert.deepEqual([yaml.order, yaml.levels.map((l) => l.name), yaml.checkSets], ['none', ['part', 'entry'], ['knowledge.basic', 'knowledge.unordered']]);
  const ws = await openWorkspace(root, { packs });
  assert.ok(recommendCheckSets({ registry: ws.registry, config: ws.work.config, workKind: 'reference' }).some((r) => r.setId === 'knowledge.unordered'));
});
