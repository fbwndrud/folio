import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { packDigest } from '../../core/pack/digest.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { stringifyYaml } from '../../core/util/yaml.js';
import { tempDir } from '../support/fixtures.js';

const DEMO = {
  name: 'demo',
  pipelines: {
    leaf: [
      { id: 'plan', kind: 'generate', produces: 'plan' },
      { id: 'draft', kind: 'generate', produces: 'draft' },
      { id: 'extract', kind: 'generate', produces: 'events', requires: ['draft'] },
      { id: 'facts', kind: 'check', tier: 'deterministic', stage: 'facts', requires: ['extract'] },
      { id: 'critic', kind: 'check', tier: 'model', stage: 'critic' },
      { id: 'approve', kind: 'gate' },
      { id: 'commit', kind: 'commit' },
    ],
    branch: [
      { id: 'plan', kind: 'generate', produces: 'plan' },
      { id: 'approve', kind: 'gate' },
      { id: 'children', kind: 'generate', produces: 'children' },
      { id: 'commit', kind: 'commit' },
    ],
  },
  prompts: { 'leaf.plan': 'prompts/plan.md' },
  checks: {
    'demo.nobody': { tier: 'deterministic', stage: 'facts', severity: 'hard', run: 'nobody' },
    'demo.critic': { tier: 'model', stage: 'critic', severity: 'advisory', instruction: 'checks/critic.md' },
  },
  checkSets: { 'demo.basic': { title: '기본', checks: ['demo.nobody', 'demo.critic'] } },
  defaultCheckSets: ['demo.basic'],
};
const FILES = { 'prompts/plan.md': '계획을 쓴다.', 'checks/critic.md': '원고를 검토한다.' };
const CHECKERS = { nobody: () => [] };

async function writePack(spec = DEMO, files = FILES) {
  const dir = await tempDir('folio-pack-');
  await writeFile(join(dir, 'pack.yaml'), typeof spec === 'string' ? spec : stringifyYaml(spec));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}
const failure = async (promise) => {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected the pack to be refused');
};
const codesOf = (error) => error.details.errors.map((e) => [e.code, e.path]);
const edit = (fn) => { const spec = structuredClone(DEMO); fn(spec); return spec; };

test('a declarative pack loads into the core Pack shape', async () => {
  const pack = await loadYamlPack(await writePack(), { name: 'demo', checkers: CHECKERS });
  assert.equal(pack.name, 'demo');
  assert.deepEqual(pack.checks.map((c) => [c.id, c.origin, typeof c.run, c.checker ?? null, c.instruction ?? null]), [
    ['demo.nobody', 'pack', 'function', 'nobody', null],
    ['demo.critic', 'pack', 'undefined', null, '원고를 검토한다.'],
  ]);
  assert.match(pack.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(resolvePacks(['demo'], new Map([['demo', pack]])).primary, pack);
  const payload = { node: { kind: 'leaf', id: 'x' }, step: 'plan' };
  assert.deepEqual(pack.prompt({ id: 'plan' }, payload), { ...payload, instructions: '계획을 쓴다.' });
  assert.equal(pack.prompt({ id: 'draft' }, payload), payload);
  assert.equal(pack.prompt({ id: 'plan' }, { ...payload, node: { kind: 'branch', id: 'y' } }).instructions, undefined);
});

test('the pack digest follows the files it reads', async () => {
  const a = await loadYamlPack(await writePack(), { checkers: CHECKERS });
  assert.equal((await loadYamlPack(await writePack(), { checkers: CHECKERS })).digest, a.digest);
  const b = await loadYamlPack(await writePack(DEMO, { ...FILES, 'prompts/plan.md': '계획을 쓴다!' }), { checkers: CHECKERS });
  assert.notEqual(b.digest, a.digest);
  const c = await loadYamlPack(await writePack(), { checkers: { nobody: () => [{ code: 'X' }] } });
  assert.notEqual(c.digest, a.digest);
});

test('unknown keys are refused, including a locked flag (core decides locks)', async () => {
  const spec = edit((s) => {
    s.extra = 1;
    s.pipelines.leaf[6].locked = true;
    s.checks['demo.critic'].weight = 3;
  });
  const error = await failure(loadYamlPack(await writePack(spec), { checkers: CHECKERS }));
  assert.equal(error.code, 'PACK_INVALID');
  assert.deepEqual(codesOf(error), [
    ['PACK_FIELD_UNKNOWN', 'extra'], ['PACK_FIELD_UNKNOWN', 'pipelines.leaf[6].locked'], ['PACK_FIELD_UNKNOWN', 'checks.demo.critic.weight'],
  ]);
});

test('files must be .md files inside the pack folder', async () => {
  for (const bad of ['../outside.md', '/etc/hosts.md', 'prompts/plan.txt']) {
    const error = await failure(loadYamlPack(await writePack(edit((s) => { s.prompts['leaf.plan'] = bad; })), { checkers: CHECKERS }));
    assert.deepEqual(codesOf(error), [['PACK_PATH_INVALID', bad]], bad);
  }
  const missing = await failure(loadYamlPack(await writePack(edit((s) => { s.prompts['leaf.plan'] = 'prompts/missing.md'; })), { checkers: CHECKERS }));
  assert.deepEqual(codesOf(missing), [['PACK_FILE_MISSING', 'prompts/missing.md']]);
});

test('a link that points out of the pack folder is refused', { skip: process.platform === 'win32' }, async () => {
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'secret.md'), 'x');
  const dir = await writePack(edit((s) => { s.prompts['leaf.plan'] = 'prompts/link.md'; }));
  await symlink(join(outside, 'secret.md'), join(dir, 'prompts', 'link.md'));
  assert.deepEqual(codesOf(await failure(loadYamlPack(dir, { checkers: CHECKERS }))), [['PACK_PATH_INVALID', 'prompts/link.md']]);
});

test('deterministic checks name a registered checker; model checks bring an instruction', async () => {
  const spec = edit((s) => {
    s.checks['demo.nobody'].run = 'ghost';
    delete s.checks['demo.critic'].instruction;
  });
  const error = await failure(loadYamlPack(await writePack(spec), { checkers: CHECKERS }));
  assert.deepEqual(codesOf(error), [['PACK_FIELD_MISSING', 'checks.demo.critic.instruction'], ['PACK_CHECKER_UNKNOWN', 'checks.demo.nobody.run']]);
});

test('a prompt must belong to a generate step of that node kind', async () => {
  const error = await failure(loadYamlPack(await writePack(edit((s) => { s.prompts['branch.draft'] = 'prompts/plan.md'; })), { checkers: CHECKERS }));
  assert.deepEqual(codesOf(error), [['PACK_PROMPT_STEP_UNKNOWN', 'prompts.branch.draft']]);
});

test('the pack name must be the expected one, and core lock rules still apply', async () => {
  assert.deepEqual(codesOf(await failure(loadYamlPack(await writePack(), { name: 'novel', checkers: CHECKERS }))), [['PACK_NAME_MISMATCH', 'name']]);
  const cut = await failure(loadYamlPack(await writePack(edit((s) => { s.pipelines.leaf[3].requires = []; })), { checkers: CHECKERS }));
  assert.equal(codesOf(cut)[0][0], 'PACK_FACTS_REQUIRES_EVENTS');
});

test('broken YAML is reported as such', async () => {
  assert.deepEqual(codesOf(await failure(loadYamlPack(await writePack('name: [unclosed'), { checkers: CHECKERS }))), [['PACK_YAML_INVALID', 'pack.yaml']]);
});

test('a loaded pack hashes through packDigest, and checkers must be plain functions with source', async () => {
  const pack = await loadYamlPack(await writePack(), { checkers: CHECKERS });
  assert.match(packDigest(pack), /^sha256:[0-9a-f]{64}$/);
  for (const bad of [function nobody() { return []; }.bind(null), Math.max, 'nobody']) {
    const error = await failure(loadYamlPack(await writePack(), { checkers: { nobody: bad } }));
    assert.deepEqual(codesOf(error), [['PACK_CHECKER_UNSUPPORTED', 'checks.demo.nobody.run']]);
  }
});

test('a pack.yaml link that points out of the pack folder is refused', { skip: process.platform === 'win32' }, async () => {
  const outside = await writePack();
  const dir = await tempDir('folio-pack-');
  await mkdir(join(dir, 'prompts'), { recursive: true });
  await mkdir(join(dir, 'checks'), { recursive: true });
  for (const [path, text] of Object.entries(FILES)) await writeFile(join(dir, path), text);
  await symlink(join(outside, 'pack.yaml'), join(dir, 'pack.yaml'));
  assert.deepEqual(codesOf(await failure(loadYamlPack(dir, { checkers: CHECKERS }))), [['PACK_PATH_INVALID', 'pack.yaml']]);
  assert.deepEqual(codesOf(await failure(loadYamlPack(await tempDir('folio-empty-'), { checkers: CHECKERS }))), [['PACK_FILE_MISSING', 'pack.yaml']]);
});

test('prompt texts are pack data, so packDigest sees them even if the declared digest is rewound', async () => {
  const a = await loadYamlPack(await writePack(), { checkers: CHECKERS });
  assert.deepEqual(a.prompts, { 'leaf.plan': '계획을 쓴다.' });
  const b = await loadYamlPack(await writePack(DEMO, { ...FILES, 'prompts/plan.md': '계획을 쓴다!' }), { checkers: CHECKERS });
  assert.notEqual(packDigest(b), packDigest(a));
  b.digest = a.digest;
  assert.notEqual(packDigest(b), packDigest(a));
  assert.equal(b.prompt({ id: 'plan' }, { node: { kind: 'leaf' } }).instructions, '계획을 쓴다!');
});

test('a checker cannot fake its source with an own toString', async () => {
  const a = await loadYamlPack(await writePack(), { checkers: CHECKERS });
  const faked = Object.assign(() => [{ code: 'X' }], { toString: () => String(CHECKERS.nobody) });
  const b = await loadYamlPack(await writePack(), { checkers: { nobody: faked } });
  assert.notEqual(b.digest, a.digest);
  b.digest = a.digest;
  assert.notEqual(packDigest(b), packDigest(a));
});

test('NUL bytes and .. segments in paths are refused even when they normalise inside', async () => {
  for (const bad of ['prompts/pl\0an.md', 'prompts/../prompts/plan.md']) {
    const error = await failure(loadYamlPack(await writePack(edit((s) => { s.prompts['leaf.plan'] = bad; })), { checkers: CHECKERS }));
    assert.deepEqual(codesOf(error), [['PACK_PATH_INVALID', bad]], JSON.stringify(bad));
  }
});

test('ids that name Object.prototype members are refused', async () => {
  const spec = edit((s) => { s.presets = { constructor: { levels: [{ id: 'chapter' }] } }; });
  assert.deepEqual(codesOf(await failure(loadYamlPack(await writePack(spec), { checkers: CHECKERS }))), [['PACK_FIELD_INVALID', 'presets.constructor']]);
});

test('split check catalog stays inside the pack and participates in the declaration digest', async () => {
  const spec = { ...DEMO, checks: 'checks.yaml' };
  const dir = await writePack(spec, { ...FILES, 'checks.yaml': stringifyYaml(DEMO.checks) });
  const original = await loadYamlPack(dir, { checkers: CHECKERS });
  await writeFile(join(dir, 'checks.yaml'), stringifyYaml({ ...DEMO.checks, 'demo.nobody': { ...DEMO.checks['demo.nobody'], severity: 'block' } }));
  const changed = await loadYamlPack(dir, { checkers: CHECKERS });
  assert.notEqual(packDigest(changed), packDigest(original));
  for (const path of ['../outside.yaml', '/outside.yaml']) {
    const outside = await writePack({ ...spec, checks: path });
    assert.ok(codesOf(await failure(loadYamlPack(outside, { checkers: CHECKERS }))).some(([code]) => code === 'PACK_PATH_INVALID'));
  }
});
