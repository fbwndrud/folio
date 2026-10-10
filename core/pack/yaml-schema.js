import { FINDING_SEVERITIES } from '../ledger/receipts.js';
import { CHECK_TIERS, LOCKED_STAGES, MAX_LOOP, STEP_KINDS, STEP_MODES } from '../pipeline/define.js';
import { validateWorkConfig } from '../work/config.js';
import { isPlainObject } from '../util/plain.js';
import { SCOPE_FIELDS } from '../scope/fields.js';

const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const str = (value) => (typeof value === 'string' ? value : '');
const TOP = ['name', 'version', 'title', 'description', 'presets', 'pipelines', 'prompts', 'checks', 'checkSets', 'defaultCheckSets', 'scopeFields'];
const STEP = ['id', 'kind', 'tier', 'stage', 'produces', 'requires', 'loop', 'mode'];
const PRODUCES = ['plan', 'draft', 'events', 'children'];
const CHECK = ['title', 'description', 'tier', 'stage', 'severity', 'requiresOrder', 'requiresParentPlan', 'requireQuote', 'experimental', 'config', 'instruction', 'run'];
const SET = ['title', 'description', 'checks', 'recommendedFor'];
const RECOMMEND = ['kinds', 'levels', 'roles', 'positions'];
const PRESET = ['title', 'description', 'levels', 'order', 'checkSets'];
/** requiresOrder 값: linear(읽는 순서 안에서만), none(순서 없는 노드에서만, N4). branching 은 N7 이 더한다. */
const REQUIRES_ORDER = ['linear', 'none', 'branching'];
const STEP_ID = /^[a-z][a-z0-9-]*$/;
/** 세트·검사·프리셋 id: 점으로 이은 소문자 조각. __proto__ 같은 이름은 데이터로도 받지 않는다. */
const SAFE_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;
/** Object.prototype 이름(constructor 등)도 거부한다 — define.js isValidCustomId 와 같은 규칙. */
const isSafeId = (id) => typeof id === 'string' && SAFE_ID_PATTERN.test(id) && !(id in Object.prototype);
const PROMPT_KEY = /^(leaf|branch)\.[a-z][a-z0-9-]*$/;
/** 제목·설명은 있으면 문자열이어야 한다(M3 C3 느슨한 스키마). */
const TEXT_FIELDS = ['title', 'description'];

function textErrors(object, at, push) {
  for (const key of TEXT_FIELDS) if (object[key] !== undefined && typeof object[key] !== 'string') push('PACK_FIELD_INVALID', at ? `${at}.${key}` : key);
}

function unknownKeys(object, allowed, path, push) {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) push('PACK_FIELD_UNKNOWN', path ? `${path}.${key}` : key);
}

function readStep(step, at, push) {
  if (!isPlainObject(step)) { push('PACK_FIELD_INVALID', at); return null; }
  unknownKeys(step, STEP, at, push);
  if (typeof step.id !== 'string' || !STEP_ID.test(step.id)) push('PACK_FIELD_INVALID', `${at}.id`);
  if (!STEP_KINDS.includes(step.kind)) push('PACK_FIELD_INVALID', `${at}.kind`);
  if (step.kind === 'check' && !CHECK_TIERS.includes(step.tier)) push('PACK_FIELD_INVALID', `${at}.tier`);
  if (step.kind === 'generate' && !PRODUCES.includes(step.produces)) push('PACK_FIELD_INVALID', `${at}.produces`);
  if (step.stage !== undefined && typeof step.stage !== 'string') push('PACK_FIELD_INVALID', `${at}.stage`);
  if (step.requires !== undefined && !isStringList(step.requires)) push('PACK_FIELD_INVALID', `${at}.requires`);
  if (step.mode !== undefined && !STEP_MODES.includes(step.mode)) push('PACK_FIELD_INVALID', `${at}.mode`);
  if (step.loop !== undefined) {
    if (!isPlainObject(step.loop)) push('PACK_FIELD_INVALID', `${at}.loop`);
    else {
      unknownKeys(step.loop, ['until', 'max'], `${at}.loop`, push);
      if (!isStringList(step.loop.until) || !Number.isInteger(step.loop.max) || step.loop.max < 0 || step.loop.max > MAX_LOOP) push('PACK_FIELD_INVALID', `${at}.loop`);
    }
  }
  const { mode, ...rest } = structuredClone(step);
  return mode === undefined ? rest : { ...rest, mode };
}

/** pipelines 가 없으면 검사·세트만 보태는 팩이다(둘째 팩, N2). 첫 팩이 될 수 없는 것은 resolvePacks 가 본다(PACK_PIPELINE_MISSING). */
function readPipelines(input, push) {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) { push('PACK_FIELD_MISSING', 'pipelines'); return { leaf: [], branch: [] }; }
  unknownKeys(input, ['leaf', 'branch'], 'pipelines', push);
  const read = (kind) => {
    const list = input[kind];
    if (!Array.isArray(list) || list.length === 0) { push('PACK_FIELD_MISSING', `pipelines.${kind}`); return []; }
    return list.map((step, index) => readStep(step, `pipelines.${kind}[${index}]`, push)).filter(Boolean);
  };
  return { leaf: read('leaf'), branch: read('branch') };
}

function readPrompts(input, pipelines, push) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) { push('PACK_FIELD_INVALID', 'prompts'); return {}; }
  const out = {};
  for (const [key, path] of Object.entries(input)) {
    if (!PROMPT_KEY.test(key) || typeof path !== 'string') { push('PACK_FIELD_INVALID', `prompts.${key}`); continue; }
    const [kind, stepId] = key.split('.');
    if (!(pipelines?.[kind] ?? []).some((s) => s.id === stepId && s.kind === 'generate')) { push('PACK_PROMPT_STEP_UNKNOWN', `prompts.${key}`); continue; }
    out[key] = path;
  }
  return out;
}

function readCheck(id, check, push) {
  const at = `checks.${id}`;
  unknownKeys(check, CHECK, at, push);
  textErrors(check, at, push);
  if (!CHECK_TIERS.includes(check.tier)) push('PACK_FIELD_INVALID', `${at}.tier`);
  if (typeof check.stage !== 'string' || !check.stage) push('PACK_FIELD_INVALID', `${at}.stage`);
  // 잠긴 코어 stage(facts)는 결정론 단계다. 모델 검사를 거기 두면 resolve 때 CHECK_TIER_MISMATCH 로 거부된다 — 로드 때 알린다(M3 C3).
  else if (check.tier === 'model' && LOCKED_STAGES.includes(check.stage)) push('PACK_FIELD_INVALID', `${at}.stage`);
  if (!FINDING_SEVERITIES.includes(check.severity)) push('PACK_FIELD_INVALID', `${at}.severity`);
  if (check.requiresOrder !== undefined && !REQUIRES_ORDER.includes(check.requiresOrder)) push('PACK_FIELD_INVALID', `${at}.requiresOrder`);
  for (const flag of ['requiresParentPlan', 'requireQuote', 'experimental']) {
    if (check[flag] !== undefined && typeof check[flag] !== 'boolean') push('PACK_FIELD_INVALID', `${at}.${flag}`);
  }
  if (check.config !== undefined && !isPlainObject(check.config)) push('PACK_FIELD_INVALID', `${at}.config`);
  if (check.tier === 'model') {
    if (typeof check.instruction !== 'string' || !check.instruction) push('PACK_FIELD_MISSING', `${at}.instruction`);
    if (check.run !== undefined) push('PACK_FIELD_INVALID', `${at}.run`);
  }
  if (check.tier === 'deterministic') {
    if (typeof check.run !== 'string' || !check.run) push('PACK_FIELD_MISSING', `${at}.run`);
    if (check.instruction !== undefined) push('PACK_FIELD_INVALID', `${at}.instruction`);
  }
  return { id, ...structuredClone(check) };
}

function readChecks(input, push) {
  if (input === undefined) return [];
  if (!isPlainObject(input)) { push('PACK_FIELD_INVALID', 'checks'); return []; }
  const out = [];
  for (const [id, check] of Object.entries(input)) {
    if (!isSafeId(id) || !isPlainObject(check)) { push('PACK_FIELD_INVALID', `checks.${id}`); continue; }
    out.push(readCheck(id, check, push));
  }
  return out;
}

function readSets(input, push) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) { push('PACK_FIELD_INVALID', 'checkSets'); return {}; }
  const out = {};
  for (const [id, set] of Object.entries(input)) {
    const at = `checkSets.${id}`;
    if (!isSafeId(id) || !isPlainObject(set) || !isStringList(set.checks)) { push('PACK_FIELD_INVALID', at); continue; }
    unknownKeys(set, SET, at, push);
    textErrors(set, at, push);
    const rf = set.recommendedFor;
    if (rf !== undefined) {
      if (!isPlainObject(rf)) push('PACK_FIELD_INVALID', `${at}.recommendedFor`);
      else {
        unknownKeys(rf, RECOMMEND, `${at}.recommendedFor`, push);
        for (const [key, value] of Object.entries(rf)) if (!isStringList(value)) push('PACK_FIELD_INVALID', `${at}.recommendedFor.${key}`);
      }
    }
    out[id] = { title: str(set.title) || id, description: str(set.description), checks: [...set.checks], ...(isPlainObject(rf) ? { recommendedFor: structuredClone(rf) } : {}) };
  }
  return out;
}

function readPresets(input, push) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) { push('PACK_FIELD_INVALID', 'presets'); return {}; }
  const out = {};
  for (const [id, preset] of Object.entries(input)) {
    const at = `presets.${id}`;
    if (!isSafeId(id) || !isPlainObject(preset)) { push('PACK_FIELD_INVALID', at); continue; }
    unknownKeys(preset, PRESET, at, push);
    textErrors(preset, at, push);
    if (!Array.isArray(preset.levels) || preset.levels.length === 0) push('PACK_FIELD_MISSING', `${at}.levels`);
    else presetShapeErrors(preset, at, push);
    if (preset.order !== undefined && typeof preset.order !== 'string') push('PACK_FIELD_INVALID', `${at}.order`);
    if (preset.checkSets !== undefined && !isStringList(preset.checkSets)) push('PACK_FIELD_INVALID', `${at}.checkSets`);
    out[id] = structuredClone(preset);
  }
  return out;
}

/** 프리셋 레벨·순서는 work.yaml 과 같은 규칙으로 본다 — 쓰는 순간 CONFIG_INVALID 가 될 프리셋을 로드 때 거부한다(M3 C3). */
function presetShapeErrors(preset, at, push) {
  const { errors } = validateWorkConfig({ levels: preset.levels, ...(typeof preset.order === 'string' ? { order: preset.order } : {}) });
  const fields = new Set(errors.map((e) => (String(e.code).startsWith('ORDER_') ? 'order' : 'levels')));
  for (const field of [...fields].sort()) push('PACK_FIELD_INVALID', `${at}.${field}`);
}

/**
 * 세트 멤버: core. 검사는 늘 돌아 세트에 넣을 수 없고, 이 팩 접두어를 가진 멤버는 이 팩 검사여야 한다(M3 C3).
 * 다른 팩 접두어의 멤버는 로드 때 알 수 없다 — resolve 가 본다.
 */
function memberErrors(name, checks, sets, push) {
  if (typeof name !== 'string' || !name) return;
  const own = new Set(checks.map((c) => c.id));
  for (const [id, set] of Object.entries(sets)) {
    const bad = set.checks.some((member) => member.startsWith('core.') || (member.startsWith(`${name}.`) && !own.has(member)));
    if (bad) push('PACK_FIELD_INVALID', `checkSets.${id}.checks`);
  }
}

/**
 * pack.yaml 을 팩 명세로 바꾼다(순수 함수). 선언만 받는다: 알 수 없는 키는 거부하고, 읽어야 할 글 경로는 files 로 돌려준다.
 * 잠금(locked)은 적을 수 없다 — 코어가 정한다. 결정론 검사는 이름(run)으로만 검사기를 가리킨다.
 * @returns {{ spec: object|null, files: string[], errors: Array<{ code: string, path: string }> }}
 */
export function readPackSpec(raw) {
  const errors = [];
  const push = (code, path) => errors.push({ code, path });
  if (!isPlainObject(raw)) { push('PACK_YAML_INVALID', 'pack.yaml'); return { spec: null, files: [], errors }; }
  unknownKeys(raw, TOP, '', push);
  textErrors(raw, '', push);
  if (typeof raw.name !== 'string' || !raw.name) push('PACK_FIELD_MISSING', 'name');
  if (raw.version !== undefined && (!Number.isInteger(raw.version) || raw.version < 1)) push('PACK_FIELD_INVALID', 'version');
  const pipelines = readPipelines(raw.pipelines, push);
  const prompts = readPrompts(raw.prompts, pipelines, push);
  const checks = readChecks(raw.checks, push);
  const checkSets = readSets(raw.checkSets, push);
  let defaultCheckSets = [];
  if (raw.defaultCheckSets !== undefined) {
    if (isStringList(raw.defaultCheckSets)) defaultCheckSets = [...raw.defaultCheckSets];
    else push('PACK_FIELD_INVALID', 'defaultCheckSets');
  }
  const presets = readPresets(raw.presets, push);
  // scopeFields(N4): 검사 범위를 넓히는 엔티티 필드. 코어가 아는 것(SCOPE_FIELDS)만. 적지 않으면 spec 에 키가 없다.
  let scopeFields = null;
  if (raw.scopeFields !== undefined) {
    if (isStringList(raw.scopeFields) && raw.scopeFields.every((field) => SCOPE_FIELDS.includes(field))) scopeFields = [...new Set(raw.scopeFields)];
    else push('PACK_FIELD_INVALID', 'scopeFields');
  }
  // 프리셋은 첫 팩 몫이다. 단계가 없는 팩(둘째 팩)의 프리셋은 쓸 수 없다(N2 미룬 minor — initWork packPresets 와 같은 기준).
  if (pipelines === undefined && Object.keys(presets).length > 0) push('PACK_FIELD_INVALID', 'presets');
  memberErrors(raw.name, checks, checkSets, push);
  const files = [...new Set([...Object.values(prompts), ...checks.filter((c) => typeof c.instruction === 'string').map((c) => c.instruction)])].sort();
  return {
    spec: {
      name: raw.name, version: raw.version ?? 1, title: str(raw.title), description: str(raw.description), presets, pipelines, prompts, checks, checkSets, defaultCheckSets,
      ...(scopeFields ? { scopeFields } : {}),
    },
    files, errors,
  };
}
