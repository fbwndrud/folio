import { BUILTIN_CHECKS } from './builtin.js';

/** 사용자 세트 id 는 core. 이나 팩 이름. 으로 시작할 수 없고, 팩 세트 id 와 겹칠 수 없다. */
function reservedSetId(id, registry) {
  if (id.startsWith('core.')) return true;
  if ((registry.packs ?? []).some((pack) => id.startsWith(`${pack.name}.`))) return true;
  return Object.hasOwn(registry.checkSets ?? {}, id);
}

/**
 * work.yaml userCheckSets 를 팩 세트와 같은 모양으로 푼다. 멤버는 팩·코어 검사 id 이거나 work.yaml checks 의 사용자 검사 id.
 * @returns {{ sets: Record<string, any>, errors: object[] }}
 */
export function resolveUserCheckSets({ registry, config }) {
  const errors = [];
  /** @type {Record<string, any>} */
  const sets = {};
  for (const [id, set] of Object.entries(config.userCheckSets ?? {})) {
    if (reservedSetId(id, registry)) { errors.push({ code: 'USER_CHECK_SET_ID_RESERVED', set: id }); continue; }
    sets[id] = { ...set, origin: 'user' };
  }
  return { sets, errors };
}

/** 세트 멤버가 될 수 있는 검사 id: 팩·코어 검사와 work.yaml checks 에 적은 사용자 검사. */
export function knownMemberIds(registry, config) {
  return new Set([...registry.checks.map((c) => c.id), ...BUILTIN_CHECKS.map((c) => c.id), ...Object.keys(config.checks ?? {})]);
}
