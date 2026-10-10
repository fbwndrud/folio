import { isPlainObject } from '../util/plain.js';

/**
 * work.yaml overrides 를 전체 덮어쓰기와 레벨별 덮어쓰기로 나눈다.
 * overrides.levels.<레벨>.<단계>: patch — 그 레벨의 노드에만, 전체 덮어쓰기 위에 얹힌다.
 * @param {Record<string, any>} overrides
 * @param {string[]} levelNames
 */
export function splitOverrides(overrides = {}, levelNames = []) {
  const { levels, ...global } = overrides ?? {};
  const errors = [];
  /** @type {Record<string, Record<string, any>>} */
  const perLevel = {};
  if (levels !== undefined) {
    if (!isPlainObject(levels)) errors.push({ code: 'OVERRIDE_LEVELS_INVALID' });
    else {
      for (const [name, patches] of Object.entries(levels)) {
        if (!levelNames.includes(name)) { errors.push({ code: 'OVERRIDE_LEVEL_UNKNOWN', level: name }); continue; }
        if (!isPlainObject(patches)) { errors.push({ code: 'OVERRIDE_LEVELS_INVALID', level: name }); continue; }
        perLevel[name] = patches;
      }
    }
  }
  return { global, perLevel, errors };
}

/** 같은 단계에 전체·레벨 덮어쓰기가 둘 다 있으면 필드 단위로 합친다(레벨이 이긴다). 키는 데이터로만 다룬다. */
export function mergeOverrides(global, levelPatches = {}) {
  const merged = new Map(Object.entries(global));
  for (const [id, patch] of Object.entries(levelPatches)) {
    const base = merged.get(id);
    merged.set(id, isPlainObject(base) && isPlainObject(patch) ? { ...base, ...patch } : patch);
  }
  return Object.fromEntries(merged);
}
