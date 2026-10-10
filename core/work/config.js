import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { readTextOrNull } from '../util/fs.js';
import { parseYaml } from '../util/yaml.js';
import { readFeatures } from './features.js';
import { isPlainObject } from '../util/plain.js';
import { readVariantDecls } from '../variants/config.js';

export const ORDER_MODES = ['linear', 'none', 'branching'];
/** 선언 없이 늘 있는 판본(원본). 다른 판본은 work.yaml variants 의 지도로 선언한다(N6, core/variants/config.js). */
export const SUPPORTED_VARIANTS = ['main'];
const LEVEL_NAME = /^[a-z][a-z0-9-]*$/;
const isRange = (value) => Array.isArray(value) && value.length === 2
  && value.every((n) => Number.isInteger(n) && n >= 0) && value[0] <= value[1];

function readLevels(input, errors) {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push({ code: 'LEVELS_REQUIRED', message: 'levels must be a non-empty list' });
    return [];
  }
  const seen = new Set();
  return input.map((level, index) => {
    const name = level?.name;
    const leaf = index === input.length - 1;
    if (typeof name !== 'string' || !LEVEL_NAME.test(name)) errors.push({ code: 'LEVEL_NAME_INVALID', index });
    else if (seen.has(name)) errors.push({ code: 'LEVEL_NAME_DUPLICATE', name });
    seen.add(name);
    if (level?.leaf === true && !leaf) errors.push({ code: 'LEAF_NOT_LAST', name });
    let children = null;
    if (level?.children !== undefined && level?.children !== null) {
      if (!leaf && isRange(level.children)) children = [level.children[0], level.children[1]];
      else errors.push({ code: 'LEVEL_CHILDREN_INVALID', name });
    }
    return { name, leaf, children };
  });
}

function readOrder(input, levelNames, errors) {
  if (input === undefined) return { default: 'linear', levels: {} };
  if (typeof input === 'string') {
    if (!ORDER_MODES.includes(input)) errors.push({ code: 'ORDER_MODE_INVALID', value: input });
    return { default: input, levels: {} };
  }
  if (!isPlainObject(input)) {
    errors.push({ code: 'ORDER_MODE_INVALID', value: input });
    return { default: 'linear', levels: {} };
  }
  const order = { default: input.default ?? 'linear', levels: {} };
  if (!ORDER_MODES.includes(order.default)) errors.push({ code: 'ORDER_MODE_INVALID', value: order.default });
  if (input.levels !== undefined && !isPlainObject(input.levels)) { errors.push({ code: 'ORDER_MODE_INVALID', value: 'levels' }); return order; }
  for (const [level, mode] of Object.entries(input.levels ?? {})) {
    if (!levelNames.includes(level)) errors.push({ code: 'ORDER_LEVEL_UNKNOWN', level });
    else if (!ORDER_MODES.includes(mode)) errors.push({ code: 'ORDER_MODE_INVALID', value: mode });
    else order.levels[level] = mode;
  }
  return order;
}

function readList(input, code, errors) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || !input.every((item) => typeof item === 'string')) {
    errors.push({ code });
    return [];
  }
  return [...input];
}

function readMap(input, code, errors) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) {
    errors.push({ code });
    return {};
  }
  return structuredClone(input);
}

export const WORK_OPTIONS = { includeAllHardChecks: false };

/** options: 알려진 불리언 옵션만. 빠진 것은 기본값. */
function readOptions(input, errors) {
  const options = { ...WORK_OPTIONS };
  if (input === undefined) return options;
  if (!isPlainObject(input)) { errors.push({ code: 'OPTIONS_INVALID' }); return options; }
  for (const [key, value] of Object.entries(input)) {
    if (!(key in WORK_OPTIONS)) errors.push({ code: 'OPTION_UNKNOWN', option: key });
    else if (typeof value !== 'boolean') errors.push({ code: 'OPTION_INVALID', option: key });
    else options[key] = value;
  }
  return options;
}

const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const optionalString = (value) => value === undefined || typeof value === 'string';

/** userCheckSets: { id: { title?, description?, checks: [] } }. id 규칙·멤버 존재는 resolveChecks 가 본다. */
function readUserCheckSets(input, errors) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) { errors.push({ code: 'USER_CHECK_SETS_INVALID' }); return {}; }
  const sets = {};
  for (const [id, set] of Object.entries(input)) {
    if (!isPlainObject(set) || !isStringList(set.checks) || !optionalString(set.title) || !optionalString(set.description)) {
      errors.push({ code: 'USER_CHECK_SET_INVALID', set: id });
      continue;
    }
    sets[id] = { title: set.title ?? id, description: set.description ?? '', checks: [...set.checks] };
  }
  return sets;
}

/** work.yaml 원본 객체를 정규화한다. 예외를 던지지 않고 오류 목록을 돌려준다. */
export function validateWorkConfig(raw) {
  const errors = [];
  const warnings = [];
  const input = isPlainObject(raw) ? raw : {};
  const levels = readLevels(input.levels, errors);
  const order = readOrder(input.order, levels.map((l) => l.name), errors);
  const variants = readVariantDecls(input.variants, errors);
  const config = {
    title: typeof input.title === 'string' ? input.title : '',
    levels,
    order,
    // 판본 id 목록(main 이 첫째)과 main 밖 판본의 선언. 판본을 다루는 기능은 features.variants 로 켜고 끈다.
    variants: variants.ids,
    variantSpecs: variants.specs,
    packs: readList(input.packs, 'PACKS_INVALID', errors),
    // checkSets 키가 없으면 null: 팩 기본 세트를 쓴다. 빈 목록은 "세트 없음"이다.
    checkSets: input.checkSets === undefined ? null : readList(input.checkSets, 'CHECK_SETS_INVALID', errors),
    userCheckSets: readUserCheckSets(input.userCheckSets, errors),
    options: readOptions(input.options, errors),
    features: readFeatures(input.features, errors),
    checks: readMap(input.checks, 'CHECKS_INVALID', errors),
    overrides: readMap(input.overrides, 'OVERRIDES_INVALID', errors),
  };
  return { config, errors, warnings };
}

/**
 * 작품의 work.yaml 을 읽어 검증한다. text 를 주면 파일 대신 그 글을 본다(쓰기 전 후보 검증 — 뷰어 단계 토글).
 * @param {string} root
 * @param {{ text?: string }} [options]
 */
export async function loadWorkConfig(root, { text: given } = {}) {
  const text = typeof given === 'string' ? given : await readTextOrNull(join(root, 'work.yaml'));
  if (text === null) throw new FolioError('WORK_NOT_FOUND', `no work.yaml in ${root}`);
  const { config, errors, warnings } = validateWorkConfig(parseYaml(text, { source: 'work.yaml' }));
  if (errors.length) throw new FolioError('CONFIG_INVALID', errors.map((e) => e.code).join(', '), { errors });
  return { config, warnings };
}

export const levelIndex = (config, name) => config.levels.findIndex((level) => level.name === name);
export const orderModeFor = (config, levelName) => config.order.levels[levelName] ?? config.order.default;
