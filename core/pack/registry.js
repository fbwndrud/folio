import { FolioError } from '../errors.js';
import { validatePack } from './validate.js';
import { registryDigest } from './digest.js';
import { SCOPE_FIELDS } from '../scope/fields.js';

/** 팩 하나가 코어 규칙에 맞지 않으면 첫 오류 코드로 던진다. 전체 목록은 details.errors. */
function assertValid(pack) {
  const errors = validatePack(pack);
  if (errors.length) throw new FolioError(errors[0].code, `pack ${pack.name}: ${errors.map((e) => e.code).join(', ')}`, { pack: pack.name, errors });
}

/** 팩끼리 검사 id·세트 id 가 겹치면 거부한다. 뒤 팩이 앞 팩의 것을 조용히 덮지 않는다. */
export function assertUniqueAcrossPacks(packs) {
  const owners = { check: new Map(), set: new Map() };
  const claim = (table, id, pack, code, key) => {
    if (table.has(id)) throw new FolioError(code, `${id} is declared by ${table.get(id)} and ${pack}`, { [key]: id, packs: [table.get(id), pack] });
    table.set(id, pack);
  };
  for (const pack of packs) {
    for (const check of pack.checks ?? []) claim(owners.check, check.id, pack.name, 'PACK_CHECK_ID_DUPLICATE', 'checkId');
    for (const id of Object.keys(pack.checkSets ?? {})) claim(owners.set, id, pack.name, 'PACK_CHECK_SET_DUPLICATE', 'set');
  }
}

/**
 * work.yaml 의 packs 순서대로 팩을 모은다. 단계 정의와 프롬프트는 첫 팩(primary)이 준다.
 * 검사·검사 세트·기본 세트는 모든 팩에서 합친다. 모든 팩은 코어 규칙으로 먼저 검증하고, 팩끼리 id 가 겹치면 거부한다.
 */
export function resolvePacks(names, available) {
  if (!names.length) throw new FolioError('PACK_REQUIRED', 'work.yaml must list at least one pack');
  const repeated = names.filter((name, index) => names.indexOf(name) !== index);
  if (repeated.length) throw new FolioError('PACK_DUPLICATE', repeated.join(', '), { packs: repeated });
  const packs = names.map((name) => {
    const pack = available.get(name);
    if (!pack) throw new FolioError('PACK_UNKNOWN', name);
    if (pack.name !== name) throw new FolioError('PACK_NAME_MISMATCH', `${name} is registered with a pack named ${pack.name}`, { name, packName: pack.name });
    return pack;
  });
  for (const pack of packs) assertValid(pack);
  if (!packs[0].pipelines) throw new FolioError('PACK_PIPELINE_MISSING', `${packs[0].name} brings no pipelines and cannot be the first pack`, { pack: packs[0].name });
  assertUniqueAcrossPacks(packs);
  const checkSets = {};
  for (const pack of packs) for (const [id, set] of Object.entries(pack.checkSets ?? {})) checkSets[id] = set;
  return {
    primary: packs[0],
    packs,
    checks: packs.flatMap((pack) => (pack.checks ?? []).map((check) => ({ ...check, origin: 'pack' }))),
    checkSets,
    // work.yaml 에 checkSets 키가 없을 때 쓰는 기본 세트(팩 순서대로, 중복 없이).
    defaultCheckSets: [...new Set(packs.flatMap((pack) => pack.defaultCheckSets ?? []))],
    // 검사 범위를 넓히는 엔티티 필드(N4): 어느 팩이든 켠 것, 코어가 아는 것만(SCOPE_FIELDS 차례). 켠 팩이 없으면 빈 목록.
    scopeFields: SCOPE_FIELDS.filter((field) => packs.some((pack) => Array.isArray(pack.scopeFields) && pack.scopeFields.includes(field))),
    // 팩 내용이 바뀌면 파이프라인 digest 가 바뀐다(열린 실행은 검사부터 다시, 옛 영수증은 커밋 못 함).
    digest: registryDigest(packs),
  };
}
