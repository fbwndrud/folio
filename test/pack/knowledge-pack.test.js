import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { KNOWLEDGE_PACK_DIR } from '../../packs/knowledge/index.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const MEMBRANES = '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다. 막을 지나는 물질은 ATP를 쓴다. 자세한 원리는 에너지 장에서 다룬다.\n';
const DEFINES_MEMBRANE = { events: [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다' }], appearances: [], mentions: [] };

/** knowledge-book 복사본의 work.yaml 을 고친다(원본 fixture 는 그대로). */
async function book(edit = {}) {
  const root = await copyFixture('knowledge-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...edit }));
  return root;
}

async function runMembranes(root, until = (o) => o.status === 'needs_user') {
  const packs = await loadBuiltinPacks();
  const host = createFakeHost({ drafts: { membranes: MEMBRANES }, events: { membranes: DEFINES_MEMBRANE } });
  return (await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'membranes' }, until })).at(-1);
}

test('the knowledge pack loads with three presets, three sets and advisory experimental deterministic checks', async () => {
  const packs = await loadBuiltinPacks();
  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants', 'gamebook']);
  const pack = packs.get('knowledge');
  assert.deepEqual(Object.keys(pack.presets), ['textbook', 'history', 'guide', 'sourcebook', 'reference']);
  assert.deepEqual(Object.values(pack.presets).map((p) => [p.levels.map((l) => l.name), p.checkSets]), [
    [['part', 'chapter', 'section'], ['knowledge.basic']], [['era', 'chapter', 'section'], ['knowledge.basic']], [['chapter', 'section'], ['knowledge.basic']],
    [['part', 'chapter', 'section'], ['knowledge.basic', 'sources.citations']], [['part', 'entry'], ['knowledge.basic', 'knowledge.unordered']],
  ]);
  assert.deepEqual(Object.values(pack.presets).map((p) => p.order ?? null), [null, null, null, null, 'none']);
  assert.deepEqual(pack.defaultCheckSets, ['knowledge.basic']);
  assert.deepEqual(Object.fromEntries(Object.entries(pack.checkSets).map(([id, set]) => [id, set.checks])), {
    'knowledge.basic': ['knowledge.defined-before-use', 'knowledge.prerequisite-order', 'knowledge.parent-fit', 'knowledge.critic', 'knowledge.goals-covered'],
    'knowledge.terms': ['knowledge.term-consistency'],
    'knowledge.exercises': ['knowledge.exercises-cover-goals'],
    'knowledge.references': ['knowledge.cross-refs'],
    'knowledge.unordered': ['knowledge.links', 'knowledge.cross-refs', 'knowledge.term-consistency', 'knowledge.linked-consistency'],
  });
  const view = (id) => { const c = pack.checks.find((x) => x.id === id); return [c.tier, c.stage, c.severity, Boolean(c.experimental), c.requiresOrder ?? null]; };
  assert.deepEqual(view('knowledge.defined-before-use'), ['deterministic', 'facts', 'advisory', true, 'linear']);
  assert.deepEqual(view('knowledge.prerequisite-order'), ['deterministic', 'facts', 'advisory', true, 'linear']);
  assert.deepEqual(view('knowledge.term-consistency'), ['deterministic', 'facts', 'advisory', true, null]);
  assert.deepEqual(view('knowledge.parent-fit'), ['model', 'fit', 'block', false, null]);
  assert.deepEqual(view('knowledge.critic'), ['model', 'critic', 'advisory', false, null]);
  assert.deepEqual(view('knowledge.goals-covered'), ['model', 'review', 'advisory', false, null]);
  assert.deepEqual(view('knowledge.exercises-cover-goals'), ['model', 'critic', 'advisory', true, null]);
  assert.deepEqual(view('knowledge.cross-refs'), ['deterministic', 'facts', 'advisory', true, null]);
  assert.deepEqual(view('knowledge.links'), ['deterministic', 'facts', 'advisory', true, null]);
  assert.deepEqual(view('knowledge.linked-consistency'), ['model', 'critic', 'advisory', true, 'none']);
  assert.equal(pack.checks.find((c) => c.id === 'knowledge.linked-consistency').requireQuote, true);
  assert.equal(pack.checks.find((c) => c.id === 'knowledge.parent-fit').requiresParentPlan, true);
  assert.ok(pack.checks.every((c) => !c.locked), 'a pack cannot declare locks');
  assert.equal(pack.prompts['leaf.extract'], await readFile(join(KNOWLEDGE_PACK_DIR, 'prompts', 'extract.md'), 'utf8'));
  assert.match(pack.prompts['leaf.extract'], /term\.defined/);
  assert.match(pack.prompts['leaf.extract'], /occurrences\.wanted/);
  const promptFiles = {
    'leaf.plan': 'leaf-plan.md', 'leaf.draft': 'draft.md', 'leaf.extract': 'extract.md', 'leaf.revise': 'revise.md',
    'branch.plan': 'branch-plan.md', 'branch.revise': 'revise-plan.md', 'branch.children': 'children.md',
  };
  for (const [key, file] of Object.entries(promptFiles)) {
    assert.equal(pack.prompts[key], await readFile(join(KNOWLEDGE_PACK_DIR, 'prompts', file), 'utf8'), key);
  }
});

test('the knowledge-book fixture now opens with the real knowledge pack; its empty checkSets still keep the core lock', async () => {
  const ws = await openWorkspace(await copyFixture('knowledge-book'), { packs: await loadBuiltinPacks() });
  assert.deepEqual(ws.registry.packs.map((p) => p.name), ['knowledge']);
  assert.deepEqual(ws.checks.map((c) => c.id), ['core.promise-order']);
  assert.deepEqual(ws.pipelines.leaf.steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
});

test('membranes (uses ATP before the ATP section defines it) gets an advisory at the approve question', async () => {
  const root = await book({ checkSets: ['knowledge.basic', 'knowledge.terms'] });
  const first = await createRunner({ root, packs: await loadBuiltinPacks() }).run({ node: 'membranes' });
  assert.equal(first.requests[0].payload.instructions, await readFile(join(KNOWLEDGE_PACK_DIR, 'prompts', 'leaf-plan.md'), 'utf8'));
  const last = await runMembranes(root);
  assert.equal(label(last), 'user:approve');
  assert.deepEqual(last.question.blocking, []);
  assert.deepEqual(last.question.advisories.map((f) => [f.checkId, f.code, f.entityId, f.severity]), [
    ['knowledge.defined-before-use', 'USED_BEFORE_DEFINED', 'atp', 'advisory'],
  ]);
});

test('the author can raise defined-before-use to block: the run stops and approving needs a reason; hard is refused', async () => {
  const root = await book({ checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { severity: 'block' } } });
  const last = await runMembranes(root);
  assert.equal(label(last), 'user:blocked');
  assert.equal(last.question.canApprove, true);
  assert.deepEqual(last.question.blocking.map((f) => [f.code, f.entityId, f.severity]), [['USED_BEFORE_DEFINED', 'atp', 'block']]);
  await assert.rejects(createRunner({ root, packs: await loadBuiltinPacks() }).decide({ runId: last.runId, action: 'approve' }), { code: 'OVERRIDE_REASON_REQUIRED' });
  const hard = await book({ checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { severity: 'hard' } } });
  await assert.rejects(openWorkspace(hard, { packs: await loadBuiltinPacks() }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'USER_CHECK_SEVERITY_INVALID'));
});

test('front and back matter skip the order checks; term consistency still runs there', async () => {
  const root = await book({ checkSets: ['knowledge.basic', 'knowledge.terms'], overrides: { approve: { mode: 'auto' } } });
  await writeFile(join(root, 'entities', 'term', 'membrane.md'), '---\nid: membrane\nkind: term\nname: 세포막\navoid: [세포 막]\n---\n');
  const packs = await loadBuiltinPacks();
  const host = createFakeHost({ drafts: { glossary: 'ATP: 에너지 화폐. 세포 막: 세포의 경계.' } });
  const last = (await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'glossary' }, until: (o) => o.status === 'done' })).at(-1);
  assert.equal(last.status, 'done');
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'glossary');
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.deepEqual(facts.checks.map((c) => [c.checkId, c.status, c.findings.map((f) => f.code)]), [
    ['core.promise-order', 'not_applicable', []], ['knowledge.defined-before-use', 'not_applicable', []],
    ['knowledge.prerequisite-order', 'not_applicable', []], ['knowledge.term-consistency', 'passed', ['TERM_AVOIDED']],
  ]);
});

test('turning the knowledge sets off is allowed; the core promise lock cannot be turned off', async () => {
  const packs = await loadBuiltinPacks();
  const off = await openWorkspace(await book({ checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { mode: 'off' } } }), { packs });
  assert.ok(!off.checks.some((c) => c.id === 'knowledge.defined-before-use'));
  assert.ok(off.checks.some((c) => c.id === 'core.promise-order' && c.locked));
  const lock = await book({ checkSets: [], checks: { 'core.promise-order': { mode: 'off' } } });
  await assert.rejects(openWorkspace(lock, { packs }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'LOCKED_CHECK_OVERRIDE'));
});
