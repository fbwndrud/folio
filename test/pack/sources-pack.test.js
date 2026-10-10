import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const DRAFT = '사람 몸의 세포는 약 36조 개다. 세포막은 바깥 경계다.\n';
const CLAIMS = [
  { quote: '사람 몸의 세포는 약 36조 개다', sources: [{ sourceId: 'census', quote: '성인의 세포는 약 37조 개로 추정됐다' }] },
  { quote: '세포막은 바깥 경계다', sources: [] },
];

/** knowledge-book 복사본: work.yaml 을 고치고 신뢰도 낮은 합성 자료 하나를 더한다(작가가 하는 일). 원본 fixture 는 그대로. */
async function book(config) {
  const root = await copyFixture('knowledge-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...config }));
  await writeFile(join(root, 'sources', 'census.txt'), '2020년 조사에서 성인의 세포는 약 37조 개로 추정됐다.\n');
  await writeFile(join(root, 'sources', 'census.yaml'), 'id: census\ntitle: 세포 수 조사\nfile: census.txt\nreliability: low\n');
  return root;
}

async function runMembranes(root) {
  const packs = await loadBuiltinPacks();
  const host = createFakeHost({ drafts: { membranes: DRAFT }, events: { membranes: { events: [], claims: CLAIMS } } });
  return driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'membranes' }, until: (o) => o.status === 'needs_user' });
}

test('the sources pack is a second pack: checks and sets only, advisory experimental checks, no default sets, no locks', async () => {
  const packs = await loadBuiltinPacks();
  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants', 'gamebook']);
  const pack = packs.get('sources');
  assert.deepEqual([pack.pipelines, pack.presets, pack.prompts, pack.defaultCheckSets], [undefined, {}, {}, []]);
  assert.deepEqual(Object.fromEntries(Object.entries(pack.checkSets).map(([id, set]) => [id, set.checks])), {
    'sources.citations': ['sources.claim-supported', 'sources.numbers-match', 'sources.reliability'],
    'sources.review': ['sources.conflict', 'sources.claims-found'],
  });
  assert.deepEqual(pack.checks.map((c) => [c.id, c.tier, c.stage, c.severity, Boolean(c.experimental), Boolean(c.requireQuote), c.checker ?? null]), [
    ['sources.claim-supported', 'deterministic', 'facts', 'advisory', true, false, 'claim-supported'],
    ['sources.numbers-match', 'deterministic', 'facts', 'advisory', true, false, 'numbers-match'],
    ['sources.reliability', 'deterministic', 'facts', 'advisory', true, false, 'low-reliability'],
    ['sources.conflict', 'model', 'critic', 'advisory', true, false, null],
    ['sources.claims-found', 'model', 'critic', 'advisory', true, true, null],
  ]);
  assert.ok(pack.checks.every((c) => !c.locked), 'a pack cannot declare locks');
  assert.throws(() => resolvePacks(['sources'], packs), { code: 'PACK_PIPELINE_MISSING' });
  for (const first of ['knowledge', 'novel']) assert.equal(resolvePacks([first, 'sources'], packs).primary.name, first);
});

test('a pack.yaml without pipelines loads as checks only; a prompt then has no step to belong to', async () => {
  const dir = await tempDir('folio-pack-');
  await mkdir(join(dir, 'checks'));
  await writeFile(join(dir, 'checks', 'look.md'), '본다.');
  const spec = { name: 'extra', checks: { 'extra.look': { tier: 'model', stage: 'critic', severity: 'advisory', instruction: 'checks/look.md' } } };
  await writeFile(join(dir, 'pack.yaml'), stringifyYaml(spec));
  const pack = await loadYamlPack(dir, { name: 'extra' });
  assert.deepEqual([pack.pipelines, pack.checks.map((c) => c.id)], [undefined, ['extra.look']]);
  await writeFile(join(dir, 'pack.yaml'), stringifyYaml({ ...spec, prompts: { 'leaf.plan': 'checks/look.md' } }));
  const refused = await loadYamlPack(dir, { name: 'extra' }).catch((e) => e);
  assert.deepEqual(refused.details.errors.map((e) => [e.code, e.path]), [['PACK_PROMPT_STEP_UNKNOWN', 'prompts.leaf.plan']]);
});

test('with packs [knowledge, sources] the citations set gives advisories; raised to block it stops the run; hard is refused; the core lock stays', async () => {
  const root = await book({ packs: ['knowledge', 'sources'], checkSets: ['sources.citations'] });
  const last = (await runMembranes(root)).at(-1);
  assert.equal(label(last), 'user:approve');
  assert.deepEqual(last.question.advisories.map((f) => [f.checkId, f.code, f.quote, f.severity]), [
    ['sources.claim-supported', 'CLAIM_UNSUPPORTED', '세포막은 바깥 경계다', 'advisory'],
    ['sources.numbers-match', 'NUMBER_NOT_IN_SOURCE', '사람 몸의 세포는 약 36조 개다', 'advisory'],
    ['sources.reliability', 'LOW_RELIABILITY_ONLY', '사람 몸의 세포는 약 36조 개다', 'advisory'],
  ]);
  const strict = await book({ packs: ['knowledge', 'sources'], checkSets: ['sources.citations'], checks: { 'sources.claim-supported': { severity: 'block' } } });
  const trail = await runMembranes(strict);
  assert.equal(label(trail.at(-1)), 'user:blocked');
  assert.equal(trail.map(label).filter((l) => l === 'model:revise').length, 3);
  assert.deepEqual(trail.at(-1).question.blocking.map((f) => [f.code, f.quote, f.severity]), [['CLAIM_UNSUPPORTED', '세포막은 바깥 경계다', 'block']]);
  await assert.rejects(createRunner({ root: strict, packs: await loadBuiltinPacks() }).decide({ runId: trail.at(-1).runId, action: 'approve' }), { code: 'OVERRIDE_REASON_REQUIRED' });
  const hard = await book({ packs: ['knowledge', 'sources'], checkSets: ['sources.citations'], checks: { 'sources.numbers-match': { severity: 'hard' } } });
  await assert.rejects(openWorkspace(hard, { packs: await loadBuiltinPacks() }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'USER_CHECK_SEVERITY_INVALID'));
  const none = await openWorkspace(await book({ packs: ['knowledge', 'sources'], checkSets: [] }), { packs: await loadBuiltinPacks() });
  assert.deepEqual(none.checks.map((c) => [c.id, Boolean(c.locked)]), [['core.promise-order', true]]);
});
