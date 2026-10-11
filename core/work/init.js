import { link, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { stringifyYaml } from '../util/yaml.js';
import { resolvePacks } from '../pack/registry.js';
import { openWorkspace } from '../run/workspace.js';
import { validateWorkConfig } from './config.js';
import { ENTITIES_DIR } from '../store/entities.js';
import { TREE_DIR } from '../store/tree.js';
import { CHECKS_DIR } from '../checks/check-sources.js';

/** work.yaml 이 있는지만 본다. root 자체가 폴더가 아니거나(ENOTDIR) 다른 stat 오류면 WORK_ROOT_INVALID. */
async function hasWorkYaml(root) {
  try {
    await stat(join(root, 'work.yaml'));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw new FolioError('WORK_ROOT_INVALID', `${root} is not usable as a work root`, { root });
  }
}

/**
 * work.yaml 을 딱 한 번만 만든다: 임시 파일에 쓰고 `link`로 옮긴다. 대상이 이미 있으면 `link`가 EEXIST 로 실패하니,
 * 동시에 두 번 불려도(두 프로세스가 나란히 "없다"를 봤어도) 둘 중 하나만 이긴다 — TOCTOU 없이 배타적이고 원자적이다.
 * @returns {Promise<number|null>} 이 호출이 만들었으면 그 파일의 inode(나중에 이 호출이 만든 파일인지 알아보는 데 쓴다), 이미 있어서 못 만들었으면 null.
 */
async function createWorkYamlExclusive(root, text) {
  const target = join(root, 'work.yaml');
  const tmp = `${target}.${randomUUID().slice(0, 8)}.tmp`;
  await mkdir(root, { recursive: true });
  await writeFile(tmp, text);
  try {
    await link(tmp, target);
    return (await stat(tmp)).ino;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return null;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

/**
 * 팩 이름 → 프리셋 id 목록(팩 등록 순서). 첫 팩이 될 수 있는 팩(단계가 있음)만, 프리셋이 있을 때만 싣는다.
 * 단계 없는 둘째 팩(예: sources)은 프리셋을 적었어도 뺀다 — 첫 팩으로 쓸 수 없다(N2 미룬 minor).
 */
const presetsByPack = (available) => Object.fromEntries([...available]
  .filter(([, pack]) => pack.pipelines !== undefined && Object.keys(pack.presets ?? {}).length > 0).map(([name, pack]) => [name, Object.keys(pack.presets)]));

/**
 * 새 작품 폴더를 만든다. 레벨·순서·검사 세트는 첫 팩의 프리셋에서 가져온다(작가가 고른 것).
 * work.yaml 이 이미 있으면 아무것도 쓰지 않는다 — 덮어쓰지 않는다. 동시에 여러 번 불려도 하나만 이긴다.
 * 쓰기 전에 팩·프리셋·설정을 모두 검증한다.
 * @param {string} root
 * @param {{ title: string, packs: string[], preset?: string|null, available: Map<string, any>, features?: Record<string, boolean>, language?: string }} options
 */
export async function initWork(root, { title, packs, preset = null, available, features = undefined, language = undefined }) {
  if (await hasWorkYaml(root)) return { created: false, root };
  const registry = resolvePacks(packs, available);
  const presets = registry.primary.presets ?? {};
  // presets: 첫 팩의 프리셋. packPresets: 쓸 수 있는 모든 팩의 프리셋 — 다른 팩(예: knowledge 의 textbook)을 고를 수 있게 알린다.
  const listing = () => ({ presets: Object.keys(presets), packPresets: presetsByPack(available) });
  if (!preset) throw new FolioError('PRESET_REQUIRED', 'choose a preset', listing());
  if (!Object.hasOwn(presets, preset)) throw new FolioError('PRESET_UNKNOWN', preset, listing());
  const chosen = presets[preset];
  const config = {
    title, levels: structuredClone(chosen.levels), ...(chosen.order !== undefined ? { order: chosen.order } : {}),
    packs: [...packs], ...(chosen.checkSets !== undefined ? { checkSets: [...chosen.checkSets] } : {}),
    ...(features !== undefined ? { features: { ...features } } : {}),
    ...(language !== undefined ? { language } : {}),
  };
  const { config: validated, errors } = validateWorkConfig(config);
  if (errors.length) throw new FolioError('CONFIG_INVALID', errors.map((e) => e.code).join(', '), { errors });
  if (language !== undefined) config.language = validated.language;
  for (const dir of [TREE_DIR, ENTITIES_DIR, CHECKS_DIR]) await mkdir(join(root, dir), { recursive: true });
  const ino = await createWorkYamlExclusive(root, stringifyYaml(config));
  if (ino === null) return { created: false, root };
  try {
    await openWorkspace(root, { packs: available });
  } catch (error) {
    await removeOwnWorkYaml(root, ino);
    throw error;
  }
  return { created: true, root, config };
}

/**
 * 방금 만든 work.yaml 로 작품이 열리지 않으면 그 파일을 지운다 — 그래야 다음 호출이 깨진 작품에 created:false 를 받지 않는다.
 * 이 호출이 만든 파일(같은 inode)일 때만 지운다. 그 사이 다른 누가 바꿔 놓은 파일은 건드리지 않는다.
 */
async function removeOwnWorkYaml(root, ino) {
  const target = join(root, 'work.yaml');
  const current = await stat(target).catch(() => null);
  if (current?.ino === ino) await unlink(target).catch(() => {});
}
