import { isPlainObject } from '../util/plain.js';

/** 설정값을 얼려 복사한다(검사기가 고쳐도 다른 실행에 새지 않는다). */
const frozenCopy = (value) => {
  const copy = structuredClone(value);
  const freeze = (item) => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } };
  freeze(copy);
  return copy;
};

/** 설정을 받는 검사기의 원래 함수(run(ctx, config)). 감싼 run → 원래 함수. 작품 설정으로 다시 묶을 때 쓴다. */
const RAW_RUN = new WeakMap();

/** 원래 검사기에 얼린 설정을 둘째 인자로 묶은 run. 코어는 run(ctx)만 부른다. */
function bound(raw, config) {
  const frozen = frozenCopy(config);
  const run = (ctx) => raw(ctx, frozen);
  RAW_RUN.set(run, raw);
  return run;
}

/**
 * 팩의 checks.<id>.config 를 결정론 검사기의 둘째 인자로 넘긴다(모든 팩이 같이 쓴다 — N5 인계 H2).
 * config 가 없거나 run 이 함수가 아닌 검사는 그대로 둔다. config 는 checksDigest(CHECK_DIGEST_FIELDS)에 든다.
 * @template {{ checks: any[] }} P
 * @param {P} pack
 * @returns {P}
 */
export function withCheckConfig(pack) {
  const checks = pack.checks.map((check) => {
    if (typeof check.run !== 'function' || check.config === undefined) return check;
    return { ...check, run: bound(check.run, check.config) };
  });
  return { ...pack, checks };
}

/** 이 검사가 작품 설정(work.yaml checks.<id>.config)을 받을 수 있는가: withCheckConfig 로 묶였고 팩 config 가 지도다. */
export const takesWorkConfig = (check) => typeof check?.run === 'function' && RAW_RUN.has(check.run) && isPlainObject(check.config);

/**
 * 팩 설정 위에 작품 설정을 겹친다. 둘 다 지도인 자리는 안으로 들어가 겹치고, 나머지(배열 포함)는 작품 값으로 바꾼다.
 * 키는 자기 속성으로만 쓴다(`__proto__` 같은 키가 프로토타입을 바꾸지 못한다).
 * @param {Record<string, any>} base
 * @param {Record<string, any>} patch
 * @returns {Record<string, any>}
 */
export function mergeCheckConfig(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const next = isPlainObject(base?.[key]) && isPlainObject(value) && Object.hasOwn(base, key) ? mergeCheckConfig(base[key], value) : value;
    Object.defineProperty(out, key, { value: next, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/**
 * 팩 검사를 작품 설정으로 다시 묶는다: config = 팩 config + 작품 config(겹침), run 은 원래 검사기에 새 설정을 넘긴다.
 * takesWorkConfig(check) 가 참인 검사만 받는다. 새 config 가 검사 digest 에 들어가 바뀌면 재검사된다.
 * @param {any} check
 * @param {Record<string, any>} workConfig
 */
export function bindCheckConfig(check, workConfig) {
  const config = mergeCheckConfig(check.config, workConfig);
  return { ...check, config, run: bound(RAW_RUN.get(check.run), config) };
}
