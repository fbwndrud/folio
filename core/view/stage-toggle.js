import { join } from 'node:path';
import YAML from 'yaml';
import { FolioError } from '../errors.js';
import { openWorkspace, resolveWorkspaceConfig } from '../run/workspace.js';
import { withWorkLock } from '../run/work-lock.js';
import { STEP_MODES } from '../pipeline/define.js';
import { validateWorkConfig } from '../work/config.js';
import { assertFeature } from '../work/features.js';
import { writeFileAtomic } from '../util/fs.js';
import { sha256 } from '../util/hash.js';
import { parseYaml } from '../util/yaml.js';
import { isPlainObject } from '../util/plain.js';
import { allowedModes, readWorkYaml } from './stages-view.js';

export const MAX_REASON = 200;

/**
 * work.yaml 글에서 overrides.levels.<level>.<stepId> 의 mode(와 reason)만 바꾼 글. 주석과 다른 줄은 그대로 둔다.
 * reason 이 비었으면 그 자리의 reason 을 지운다.
 * @param {string} text
 * @param {{ level: string, stepId: string, mode: string, reason?: string }} change
 */
export function withStageMode(text, { level, stepId, mode, reason = '' }) {
  const doc = YAML.parseDocument(text);
  if (doc.errors.length) throw new FolioError('CONFIG_INVALID', 'work.yaml is not valid YAML', { errors: [{ code: 'YAML_INVALID' }] });
  const at = ['overrides', 'levels', level, stepId];
  try {
    // `overrides:` 나 `levels:` 나 `<level>:` 나 `<step>:` 가 비어서 null 인 자리는 빈 지도로 편다.
    // 그래야 그 아래로 mode 를 내려 쓸 수 있다(YAML 라이브러리는 null 스칼라 밑을 파고들지 못한다).
    for (let depth = 1; depth <= at.length; depth += 1) {
      const path = at.slice(0, depth);
      const node = doc.getIn(path, true);
      if (YAML.isScalar(node) && node.value == null) doc.setIn(path, doc.createNode({}));
    }
    doc.setIn([...at, 'mode'], mode);
    if (reason) doc.setIn([...at, 'reason'], reason);
    else doc.deleteIn([...at, 'reason']);
    // 비어 있던 `overrides: {}` 같은 흐름 표기는 블록 표기로 편다(작가가 읽고 고치기 쉽게).
    for (let depth = 1; depth <= at.length; depth += 1) {
      const node = doc.getIn(at.slice(0, depth), true);
      if (YAML.isMap(node)) node.flow = false;
    }
  } catch {
    // 별칭(`*x`)이나 스칼라가 그 경로에 있으면 YAML 라이브러리가 평범한 Error 를 던진다 — FolioError 로 바꾼다.
    // 이 자리에서 걸리면 아무것도 쓰지 않은 채(호출자가 doc.toString 결과를 아직 쓰지 않았다) 위로 던진다.
    throw new FolioError('CONFIG_INVALID', 'overrides.levels path could not be set', { errors: [{ code: 'OVERRIDES_INVALID' }] });
  }
  return doc.toString({ lineWidth: 0 });
}

/**
 * 후보 work.yaml 글의 설정 오류만 본다(설정 형식 → 팩 → 검사 세트 → 레벨별 단계; 잠금 덮어쓰기는
 * LOCKED_STEP_OVERRIDE, hard 검사 단계 끄기는 HARD_CHECK_OVERRIDE). 나무(트리)나 검사 글 파일은 보지 않는다 —
 * 그건 openWorkspace 만 안다. 뷰어 토글(setStageMode)은 이 함수가 아니라 openWorkspace 에 후보 글을 직접
 * 넘겨 연다(검사 글 파일까지 같은 길로 본다). 이 함수는 작품을 열 때와 같은 함수(core/run/workspace.js
 * resolveWorkspaceConfig)를 쓴다 — 따로 다시 짜지 않는다(C0, M6 인계). candidateErrors 는 옛 테스트 호환과
 * 설정 단계만의 빠른 확인을 위해 남겨 둔다.
 * @param {string} text
 * @param {{ packs: Map<string, any> }} options
 * @returns {Array<{ code: string, [key: string]: unknown }>}
 */
export function candidateErrors(text, { packs }) {
  const { config, errors } = validateWorkConfig(parseYaml(text));
  if (errors.length) return errors;
  try {
    return resolveWorkspaceConfig(config, { packs }).errors;
  } catch (error) {
    if (error instanceof FolioError) return [{ code: error.code }];
    throw error;
  }
}

/**
 * overrides.levels.<level>.<stepId> patch 가 순수 지도(plain map)인지 본다. splitOverrides(core/pipeline/levels.js)가
 * overrides.levels.<level> 한 겹 위에서 이미 하는 검사를 그 아래 단계 patch 한 겹에도 그대로 한다.
 * work.yaml 을 `%YAML 1.1`로 다시 쓰면(병합 키 위에 setIn 한 경우) 그 자리가 `!!omap`(Map)으로 바뀔 수 있다 —
 * Map 은 `.mode` 접근이 항상 undefined 라 mode 가 조용히 무시된다(C2 수정 1라운드 지적 3-a).
 * @param {string} text
 * @param {{ level: string, stepId: string }} at
 */
function assertPlainStepPatch(text, { level, stepId }) {
  const { config, errors } = validateWorkConfig(parseYaml(text));
  if (errors.length) return; // 다른 형식 오류는 openWorkspace 후보 열기가 이어서 던진다
  const patch = config.overrides?.levels?.[level]?.[stepId];
  if (patch !== undefined && !isPlainObject(patch)) {
    throw new FolioError('CONFIG_INVALID', `${level}.${stepId} override`, { errors: [{ code: 'OVERRIDE_STEP_INVALID', level, stepId }] });
  }
}

/**
 * 후보로 연 파이프라인이 요청한 (level, stepId) 만 mode 를 바꿨는지 본다: 그 단계는 요청한 mode 그대로여야
 * 하고(STAGE_TOGGLE_NOT_APPLIED — 위 assertPlainStepPatch 가 못 잡은 값도 여기서 다시 걸린다), 다른 단계·
 * 다른 레벨은 하나도 달라지면 안 된다(STAGE_TOGGLE_SIDE_EFFECT). 병합 키·별칭이 다른 자리로 새는 것을
 * (C2 수정 1라운드 지적 3) 여기서 잡는다 — 그렇지 않으면 openWorkspace 후보 열기는 성공하고도
 * setStageMode 가 다른 결과를 쓴 채 조용히 성공을 돌려줄 수 있다.
 * @param {{ byLevel: Record<string, any> }} base
 * @param {{ byLevel: Record<string, any> }} candidate
 * @param {{ level: string, stepId: string, mode: string }} request
 */
function assertOnlyRequestedStepChanged(base, candidate, { level, stepId, mode }) {
  const levels = new Set([...Object.keys(base.byLevel), ...Object.keys(candidate.byLevel)]);
  for (const lvl of levels) {
    const before = new Map((base.byLevel[lvl]?.steps ?? []).map((s) => [s.id, s.mode]));
    const after = new Map((candidate.byLevel[lvl]?.steps ?? []).map((s) => [s.id, s.mode]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const isTarget = lvl === level && id === stepId;
      const want = isTarget ? mode : before.get(id);
      const got = after.get(id);
      if (got !== want) {
        const code = isTarget ? 'STAGE_TOGGLE_NOT_APPLIED' : 'STAGE_TOGGLE_SIDE_EFFECT';
        throw new FolioError('CONFIG_INVALID', `toggling ${level}.${stepId} changed ${lvl}.${id} unexpectedly`, {
          errors: [{ code, level: lvl, stepId: id, mode: got ?? null, expected: want ?? null }],
        });
      }
    }
  }
}

/** @param {unknown} request */
function readRequest(request) {
  const r = /** @type {Record<string, unknown>} */ (request && typeof request === 'object' ? request : {});
  const bad = [];
  for (const key of ['level', 'stepId', 'baseDigest']) if (typeof r[key] !== 'string' || !r[key]) bad.push(key);
  if (typeof r.mode !== 'string' || !STEP_MODES.includes(r.mode)) bad.push('mode');
  if (r.reason !== undefined && (typeof r.reason !== 'string' || r.reason.length > MAX_REASON)) bad.push('reason');
  const extra = Object.keys(r).filter((key) => !['level', 'stepId', 'mode', 'reason', 'baseDigest'].includes(key));
  if (bad.length || extra.length) throw new FolioError('STAGE_TOGGLE_INVALID', `bad ${[...bad, ...extra].join(', ')}`, { fields: [...bad, ...extra] });
  return { level: String(r.level), stepId: String(r.stepId), mode: String(r.mode), reason: typeof r.reason === 'string' ? r.reason : '', baseDigest: String(r.baseDigest) };
}

/**
 * 뷰어의 단계 켜고 끄기(설계 §17: 뷰어가 쓰는 것은 이것뿐). 실행기와 같은 작업 잠금 안에서:
 * 1) 뷰어가 읽은 work.yaml(baseDigest)이 지금과 같아야 한다(WORK_YAML_CHANGED).
 * 2) 지금 작품이 열려야 하고, viewerToggles 가 켜져 있어야 한다(FEATURE_DISABLED).
 * 3) 잠금 단계는 기능·설정과 상관없이 거부한다(STEP_LOCKED). 모드는 그 단계가 받는 것만.
 * 4) 바꾼 글을 작품을 여는 길 그대로 본다 — openWorkspace 에 후보 글을 넘겨(검사 글 파일까지) 연다. 열리지 않으면 아무것도 쓰지 않는다(CONFIG_INVALID 등).
 *    열려도 바뀐 파이프라인이 요청한 (level, stepId) 만 바뀌었는지 다시 본다(assertOnlyRequestedStepChanged) —
 *    병합 키·별칭으로 다른 단계가 새거나 요청한 mode 가 조용히 안 먹은 채 성공을 돌려주는 일을 막는다.
 * 5) 원자적으로 쓰고 openWorkspace 로 다시 연다. 열리지 않으면(그 사이 다른 파일이 바뀐 경우) 원래 글로 되돌리고 그 오류를 던진다.
 * 열린 실행이 있어도 쓴다 — 실행기는 단계 digest 가 바뀐 것을 보고 검사부터 다시 돈다(core/run/sync.js).
 * @param {string} root
 * @param {{ packs: Map<string, any> }} options
 * @param {unknown} request { level, stepId, mode, reason?, baseDigest }
 */
export async function setStageMode(root, { packs }, request) {
  const { level, stepId, mode, reason, baseDigest } = readRequest(request);
  return withWorkLock(root, async () => {
    const text = await readWorkYaml(root);
    const digest = sha256(text);
    if (digest !== baseDigest) throw new FolioError('WORK_YAML_CHANGED', 'work.yaml changed since the viewer read it; reload the stages', { digest });
    const { work, pipelines } = await openWorkspace(root, { packs });
    assertFeature(work.config, 'viewerToggles');
    const pipeline = Object.hasOwn(pipelines.byLevel, level) ? pipelines.byLevel[level] : null;
    if (!pipeline) throw new FolioError('LEVEL_UNKNOWN', level.slice(0, 100), { levels: Object.keys(pipelines.byLevel) });
    const step = pipeline.steps.find((s) => s.id === stepId);
    if (!step) throw new FolioError('STEP_UNKNOWN', stepId.slice(0, 100), { level });
    if (step.locked) throw new FolioError('STEP_LOCKED', `${stepId} is a locked step; it cannot be turned off or changed`, { level, stepId });
    if (!allowedModes(step).includes(mode)) throw new FolioError('STEP_MODE_INVALID', `${stepId} does not take ${mode}`, { level, stepId, modes: allowedModes(step) });
    const next = withStageMode(text, { level, stepId, mode, reason });
    assertPlainStepPatch(next, { level, stepId });
    const candidate = await openWorkspace(root, { packs, workYaml: next });
    assertOnlyRequestedStepChanged(pipelines, candidate.pipelines, { level, stepId, mode });
    const path = join(root, 'work.yaml');
    // 검증한 글을 쓰기 바로 전에 한 번 더 확인한다: 잠금 안이라도, 잠금 밖에서 work.yaml 을 손으로 고친
    // 경우를 놓치지 않기 위해서다(예: 다른 도구가 파일을 직접 덮어썼을 때).
    const beforeWrite = await readWorkYaml(root);
    if (sha256(beforeWrite) !== digest) throw new FolioError('WORK_YAML_CHANGED', 'work.yaml changed since the viewer read it; reload the stages', { digest: sha256(beforeWrite) });
    await writeFileAtomic(path, next);
    try {
      await openWorkspace(root, { packs });
    } catch (error) {
      await writeFileAtomic(path, text);
      throw error;
    }
    return { level, stepId, mode, digest: sha256(next) };
  });
}
