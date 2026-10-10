import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWorkspace } from '../../core/run/workspace.js';
import { sha256 } from '../../core/util/hash.js';
import { viewStages } from '../../core/view/stages-view.js';
import { candidateErrors, setStageMode, withStageMode } from '../../core/view/stage-toggle.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { editYaml } from '../support/recheck.js';

const packs = fakePacks();

async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  return root;
}
const yamlOf = (root) => readFile(join(root, 'work.yaml'), 'utf8');

test('the stages view lists steps per level, locks without modes, and the work.yaml digest', async () => {
  const root = await serial();
  const view = await viewStages(root, { packs });
  assert.match(view.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(view.toggles, true);
  assert.deepEqual(view.levels.map((l) => [l.level, l.kind]), [['arc', 'branch'], ['episode', 'leaf']]);
  const episode = view.levels[1].steps;
  assert.deepEqual(episode.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  assert.deepEqual(episode.filter((s) => s.locked).map((s) => s.modes), [[], [], [], []]);
  assert.deepEqual(episode.find((s) => s.id === 'critic').modes, ['on', 'off']);
  assert.deepEqual(episode.find((s) => s.id === 'approve').modes, ['on', 'off', 'auto']);
});

test('a toggle writes only overrides.levels.<level>.<step>, keeps comments, and the work opens with it', async () => {
  const root = await serial();
  await writeFile(join(root, 'work.yaml'), `# 작가 메모: 지우지 말 것\n${await yamlOf(root)}`);
  const { digest } = await viewStages(root, { packs });
  const out = await setStageMode(root, { packs }, { level: 'episode', stepId: 'critic', mode: 'off', reason: '초고 속도 우선', baseDigest: digest });
  assert.deepEqual([out.level, out.stepId, out.mode], ['episode', 'critic', 'off']);
  const text = await yamlOf(root);
  assert.match(text, /^# 작가 메모: 지우지 말 것\n/);
  assert.match(text, /overrides:\n {2}levels:\n {4}episode:\n {6}critic:\n {8}mode: off\n {8}reason: 초고 속도 우선\n/);
  const { pipelines } = await openWorkspace(root, { packs });
  assert.deepEqual([pipelines.byLevel.episode.steps.find((s) => s.id === 'critic').mode, pipelines.leaf.steps.find((s) => s.id === 'critic').mode], ['off', 'on']);
  const again = await setStageMode(root, { packs }, { level: 'episode', stepId: 'critic', mode: 'on', baseDigest: out.digest });
  assert.doesNotMatch(await yamlOf(root), /reason: 초고/);
  await setStageMode(root, { packs }, { level: 'episode', stepId: 'approve', mode: 'auto', baseDigest: again.digest });
  assert.equal((await openWorkspace(root, { packs })).pipelines.byLevel.episode.steps.find((s) => s.id === 'approve').mode, 'auto');
});

test('locked steps are refused whatever the mode, and nothing is written', async () => {
  const root = await serial();
  const before = await yamlOf(root);
  const { digest } = await viewStages(root, { packs });
  for (const [level, stepId] of [['episode', 'commit'], ['episode', 'facts'], ['episode', 'draft'], ['episode', 'extract'], ['arc', 'commit']]) {
    for (const mode of ['off', 'on']) {
      await assert.rejects(setStageMode(root, { packs }, { level, stepId, mode, baseDigest: digest }), { code: 'STEP_LOCKED' }, `${level}.${stepId} ${mode}`);
    }
  }
  assert.equal(await yamlOf(root), before);
});

test('the validation path itself refuses a locked-step override, so the refusal does not rest on the first check alone', async () => {
  const root = await serial();
  const text = await yamlOf(root);
  const codes = (next) => candidateErrors(next, { packs }).map((e) => e.code);
  assert.deepEqual(codes(text), []);
  assert.ok(codes(withStageMode(text, { level: 'episode', stepId: 'commit', mode: 'off' })).includes('LOCKED_STEP_OVERRIDE'));
  assert.ok(codes(withStageMode(text, { level: 'episode', stepId: 'facts', mode: 'off' })).includes('LOCKED_STEP_OVERRIDE'));
  assert.deepEqual(codes(withStageMode(text, { level: 'episode', stepId: 'critic', mode: 'off' })), []);
  assert.deepEqual(codes(withStageMode(text, { level: 'volume', stepId: 'critic', mode: 'off' })), ['OVERRIDE_LEVEL_UNKNOWN']);
});

test('stale digests, unknown places, wrong modes, bad requests and a turned-off toggle feature are refused without writing', async () => {
  const root = await serial();
  const { digest } = await viewStages(root, { packs });
  const set = (request) => setStageMode(root, { packs }, { baseDigest: digest, level: 'episode', stepId: 'critic', mode: 'off', ...request });
  await assert.rejects(set({ baseDigest: 'sha256:0' }), { code: 'WORK_YAML_CHANGED' });
  await assert.rejects(set({ level: 'volume' }), { code: 'LEVEL_UNKNOWN' });
  await assert.rejects(set({ level: '__proto__' }), { code: 'LEVEL_UNKNOWN' });
  await assert.rejects(set({ stepId: 'tone' }), { code: 'STEP_UNKNOWN' });
  await assert.rejects(set({ mode: 'auto' }), { code: 'STEP_MODE_INVALID' });
  await assert.rejects(set({ mode: 'fast' }), { code: 'STAGE_TOGGLE_INVALID' });
  await assert.rejects(set({ reason: 'x'.repeat(201) }), { code: 'STAGE_TOGGLE_INVALID' });
  await assert.rejects(set({ root: '/etc' }), { code: 'STAGE_TOGGLE_INVALID' });
  await assert.rejects(setStageMode(root, { packs }, null), { code: 'STAGE_TOGGLE_INVALID' });
  const before = await yamlOf(root);
  await editYaml(root, (config) => { config.features = { viewerToggles: false }; });
  const off = await viewStages(root, { packs });
  assert.equal(off.toggles, false);
  await assert.rejects(setStageMode(root, { packs }, { baseDigest: off.digest, level: 'episode', stepId: 'critic', mode: 'off' }), { code: 'FEATURE_DISABLED' });
  assert.notEqual(await yamlOf(root), before);
  assert.doesNotMatch(await yamlOf(root), /critic/);
});

// overrides.levels 나 그 아래 자리가 비어서 null 인(`overrides:\n  levels:\n` 같은) work.yaml 에서도
// withStageMode 는 던지지 않고 빈 지도를 펴서 mode 를 쓴다(openWorkspace 는 이런 null 을 이미
// OVERRIDE_LEVELS_INVALID 로 거부하므로, 잠긴 setStageMode 경로가 아니라 withStageMode 자체로 본다).
test('a null overrides.levels, or a null levels.<level>, still lets withStageMode write the mode without a crash, and the result opens', async () => {
  for (const empty of ['overrides:\n  levels:\n', 'overrides:\n  levels:\n    episode:\n']) {
    const root = await serial();
    const base = (await yamlOf(root)).replace(/overrides:\s*\{\}\n/, '');
    const before = `${base}${empty}`;
    await writeFile(join(root, 'work.yaml'), before);
    const next = withStageMode(before, { level: 'episode', stepId: 'critic', mode: 'off' });
    assert.match(next, /overrides:\n {2}levels:\n {4}episode:\n {6}critic:\n {8}mode: off\n/, empty);
    await writeFile(join(root, 'work.yaml'), next);
    const { pipelines } = await openWorkspace(root, { packs });
    assert.equal(pipelines.byLevel.episode.steps.find((s) => s.id === 'critic').mode, 'off', empty);
  }
});

test('an alias in the override path is refused as CONFIG_INVALID through setStageMode itself, and work.yaml bytes are unchanged', async () => {
  const root = await serial();
  const base = (await yamlOf(root)).replace(/overrides:\s*\{\}\n/, '');
  const text = `${base}critic-base: &cb\n  critic:\n    mode: on\noverrides:\n  levels:\n    episode: *cb\n`;
  await writeFile(join(root, 'work.yaml'), text);
  assert.deepEqual(candidateErrors(text, { packs }), []);
  await openWorkspace(root, { packs }); // 원래 글은 연다: 별칭이 가리키는 값이 올바른 단계 패치라서다.
  await assert.rejects(setStageMode(root, { packs }, { level: 'episode', stepId: 'critic', mode: 'off', baseDigest: sha256(text) }), { code: 'CONFIG_INVALID' });
  assert.equal(await yamlOf(root), text);
});

test('with viewerToggles off, a locked step is refused as FEATURE_DISABLED (not STEP_LOCKED), and nothing is written', async () => {
  const root = await serial();
  await editYaml(root, (config) => { config.features = { viewerToggles: false }; });
  const before = await yamlOf(root);
  const { digest } = await viewStages(root, { packs });
  await assert.rejects(setStageMode(root, { packs }, { level: 'episode', stepId: 'facts', mode: 'off', baseDigest: digest }), { code: 'FEATURE_DISABLED' });
  assert.equal(await yamlOf(root), before);
});
