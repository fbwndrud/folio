import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openWorkspace } from '../../core/run/workspace.js';
import { candidateErrors, setStageMode, withStageMode } from '../../core/view/stage-toggle.js';
import { viewStages } from '../../core/view/stages-view.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';

const packs = fakePacks();
async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  return root;
}
const criticMode = (workspace) => workspace.pipelines.byLevel.episode.steps.find((s) => s.id === 'critic').mode;

test('C0 (M6 hand-off): openWorkspace opens an in-memory work.yaml text without touching the file', async () => {
  const root = await serial();
  const path = join(root, 'work.yaml');
  const text = await readFile(path, 'utf8');
  const candidate = withStageMode(text, { level: 'episode', stepId: 'critic', mode: 'off' });
  assert.equal(criticMode(await openWorkspace(root, { packs, workYaml: candidate })), 'off');
  assert.equal(await readFile(path, 'utf8'), text);
  assert.equal(criticMode(await openWorkspace(root, { packs })), 'on');
  const locked = withStageMode(text, { level: 'episode', stepId: 'commit', mode: 'off' });
  await assert.rejects(openWorkspace(root, { packs, workYaml: locked }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'LOCKED_STEP_OVERRIDE'));
  await assert.rejects(openWorkspace(root, { packs, workYaml: 'levels: [' }), (e) => e.code === 'YAML_INVALID' && e.details.source === 'work.yaml');
});

// (fix-C2-r1 지적 2) candidateErrors 는 이제 resolveWorkspaceConfig 를 그대로 부르므로, 자기 자신과 비교하면
// 아무것도 증명하지 못한다. 대신 뷰어 토글(setStageMode)의 거부와, 그 토글이 만든 같은 후보 글을 직접
// openWorkspace(root, { packs, workYaml })로 연 거부가 같은 오류를 내는지 본다 — 실제 팩(novel)의
// includeAllHardChecks + hard 검사(critic 단계 novel.fixed-facts)로, 트리·검사 글 파일까지 지나야 나는
// 진짜 거부를 쓴다(레벨/단계/잠금 같은 setStageMode 자체의 앞단 확인이 아니라).
test('a setStageMode refusal and openWorkspace(root, { packs, workYaml }) on the same candidate text agree on the same errors', async () => {
  const realPacks = await loadBuiltinPacks();
  const root = await copyFixture('serial-2level');
  const path = join(root, 'work.yaml');
  const cfg = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...cfg, options: { includeAllHardChecks: true } }));
  const text = await readFile(path, 'utf8');
  const { digest } = await viewStages(root, { packs: realPacks });
  const next = withStageMode(text, { level: 'episode', stepId: 'critic', mode: 'off' });

  const fromToggle = await setStageMode(root, { packs: realPacks }, { level: 'episode', stepId: 'critic', mode: 'off', baseDigest: digest }).then(() => null, (e) => e);
  const fromOpen = await openWorkspace(root, { packs: realPacks, workYaml: next }).then(() => null, (e) => e);

  assert.equal(fromToggle?.code, 'CONFIG_INVALID');
  assert.equal(fromOpen?.code, 'CONFIG_INVALID');
  const toggleCodes = fromToggle.details.errors.map((e) => e.code);
  assert.deepEqual(toggleCodes, fromOpen.details.errors.map((e) => e.code));
  assert.ok(toggleCodes.includes('HARD_CHECK_OVERRIDE'), toggleCodes.join(','));
  // candidateErrors(설정만 보는 좁은 길)도 같은 자리에서 같은 코드를 낸다.
  assert.deepEqual(candidateErrors(next, { packs: realPacks }).map((e) => e.code), toggleCodes);
});

// (fix-C2-r1 지적 1-a) 후보 열기가 쓰기 전에 거부하면 work.yaml 은 바이트뿐 아니라 mtime·inode 까지 그대로여야
// 한다 — "쓴 뒤 되돌림"과 "애초에 안 씀"을 mtime 으로 구분한다(바이트만 보면 둘을 가를 수 없다).
test('setStageMode refuses before writing when the candidate open would fail, and does not touch work.yaml at all (mtime, inode included)', async () => {
  const realPacks = await loadBuiltinPacks();
  const root = await copyFixture('serial-2level');
  const path = join(root, 'work.yaml');
  const cfg = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...cfg, options: { includeAllHardChecks: true } }));
  const before = await readFile(path, 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const stat0 = await stat(path);
  const { digest } = await viewStages(root, { packs: realPacks });

  await assert.rejects(
    setStageMode(root, { packs: realPacks }, { level: 'episode', stepId: 'critic', mode: 'off', baseDigest: digest }),
    (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'HARD_CHECK_OVERRIDE'),
  );
  const stat1 = await stat(path);
  assert.equal(stat1.mtimeMs, stat0.mtimeMs, 'mtime must not move: nothing was ever written');
  assert.equal(stat1.ino, stat0.ino, 'inode must not move: no replace/rename happened');
  assert.equal(await readFile(path, 'utf8'), before);
});

// (fix-C2-r1 지적 1-b) 후보 열기까지는 통과했지만 쓴 뒤 다시 열기가 실패하면(예: 그 사이 팩이 사라진 것처럼
// 보이면) 원래 글로 되돌려야 한다 — 바이트가 원래대로인지, .tmp 찌꺼기가 없는지를 본다.
test('setStageMode rolls back the write when the post-write reopen fails, restoring the original bytes with no leftover .tmp file', async () => {
  const root = await serial();
  const path = join(root, 'work.yaml');
  const text = await readFile(path, 'utf8');
  const fake = fakePacks().get('fake');
  // critic off 가 디스크에 보이면(=쓰기가 끝난 뒤) 그때부터만 팩을 못 찾은 것처럼 군다 — 쓰기 전 후보 열기는 통과시킨다.
  class FailAfterWrite extends Map {
    get(name) {
      if (/critic:\n\s+mode: off/.test(readFileSync(path, 'utf8'))) return undefined;
      return super.get(name);
    }
  }
  const trapPacks = new FailAfterWrite([['fake', fake]]);
  const { digest } = await viewStages(root, { packs: trapPacks });

  await assert.rejects(
    setStageMode(root, { packs: trapPacks }, { level: 'episode', stepId: 'critic', mode: 'off', baseDigest: digest }),
    { code: 'PACK_UNKNOWN' },
  );
  assert.equal(await readFile(path, 'utf8'), text, 'rolled back to the original bytes');
  assert.deepEqual((await readdir(root)).filter((name) => name.endsWith('.tmp')), [], 'no .tmp leftovers');
});

// (fix-C2-r1 지적 3-a) %YAML 1.1 문서에서 병합 키(`<<: *b`) 위에 setIn 하면 그 자리가 `!!omap`(Map)으로
// 바뀐다 — Map 은 `.mode` 접근이 항상 undefined 라 mode 가 조용히 무시된 채 성공을 돌려줄 수 있었다.
test('a merge key under %YAML 1.1 turns the toggled step into an !!omap; the toggle is refused instead of silently keeping the old mode', async () => {
  const root = await serial();
  const path = join(root, 'work.yaml');
  const base = (await readFile(path, 'utf8')).replace('overrides: {}\n', '');
  const text = `%YAML 1.1\n---\n${base}base: &b\n  critic: { mode: "on" }\noverrides:\n  levels:\n    episode:\n      <<: *b\n`;
  await writeFile(path, text);
  // 원래 글은 연다: 병합 키가 가리키는 값은 읽을 때는 올바른 단계 패치라서다(문제는 다시 쓸 때 생긴다).
  const opened = await openWorkspace(root, { packs });
  assert.equal(opened.pipelines.byLevel.episode.steps.find((s) => s.id === 'critic').mode, 'on');
  const { digest } = await viewStages(root, { packs });

  await assert.rejects(
    setStageMode(root, { packs }, { level: 'episode', stepId: 'critic', mode: 'off', baseDigest: digest }),
    (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => ['OVERRIDE_STEP_INVALID', 'STAGE_TOGGLE_NOT_APPLIED'].includes(x.code)),
  );
  assert.equal(await readFile(path, 'utf8'), text);
});

// (fix-C2-r1 지적 3-b) 두 레벨이 overrides.levels 자리에서 YAML 별칭으로 같은 객체를 가리키면, 한 레벨의
// 토글이 다른 레벨도 함께 바꾼다 — 요청한 자리만 바뀌었는지 다시 보지 않으면 조용히 새는 변경이었다.
test('an anchor shared between two levels leaks a toggle on one level into the other; the toggle is refused instead of changing both', async () => {
  const root = await serial();
  const path = join(root, 'work.yaml');
  const base = (await readFile(path, 'utf8')).replace('overrides: {}\n', '');
  const text = `${base}overrides:\n  levels:\n    episode: &ap\n      approve: { mode: on }\n    arc: *ap\n`;
  await writeFile(path, text);
  const opened = await openWorkspace(root, { packs });
  assert.equal(opened.pipelines.byLevel.arc.steps.find((s) => s.id === 'approve').mode, 'on');
  const { digest } = await viewStages(root, { packs });

  await assert.rejects(
    setStageMode(root, { packs }, { level: 'episode', stepId: 'approve', mode: 'auto', baseDigest: digest }),
    (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'STAGE_TOGGLE_SIDE_EFFECT'),
  );
  assert.equal(await readFile(path, 'utf8'), text);
});
