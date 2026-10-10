import { randomUUID } from 'node:crypto';
import * as filesystem from 'node:fs/promises';
import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { openWorkspace } from '../run/workspace.js';
import { writeAssetOnce } from '../store/assets.js';
import { writeEntity } from '../store/entities.js';
import { NODE_FILE, TREE_DIR, writeNode } from '../store/tree.js';
import { entryName } from '../structure/naming.js';
import { sha256 } from '../util/hash.js';
import { stringifyYaml } from '../util/yaml.js';
import { initWork } from '../work/init.js';
import { importRecord, IMPORTED } from './records.js';
import { mapVibelore } from './map-source.js';
import { readVibelore } from './read-source.js';
import { publishWork } from './publish-work.js';
import { addCleanupWarning } from './warnings.js';

/** 가져온 작품의 팩과 프리셋. 검사 세트는 프리셋 그대로다 — 그림 세트(image.basic)는 작가가 고른다(folio_config 가 추천). */
export const IMPORT_PACKS = Object.freeze(['novel', 'image']);
export const IMPORT_PRESET = 'serial';

const width = (count) => Math.max(2, String(count).length);
const inside = (parent, child) => { const rel = relative(parent, child); return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)); };

/** root 는 아직 없는 절대 경로, 그 부모는 있는 폴더, 그리고 원본(from) 안이 아니어야 한다(원본에 쓰지 않는다). */
async function assertTarget(root, from) {
  if (typeof root !== 'string' || !isAbsolute(root) || root.includes('\0')) throw new FolioError('ROOT_NOT_ABSOLUTE', 'root must be an absolute path');
  const parent = await realpath(dirname(root)).catch(() => null);
  const parentInfo = parent ? await lstat(parent) : null;
  if (!parentInfo?.isDirectory()) throw new FolioError('IMPORT_ROOT_INVALID', 'the folder that will hold root must exist', { root });
  const target = join(parent, basename(root));
  if (await lstat(target).then(() => true, (e) => (e?.code === 'ENOENT' ? false : Promise.reject(e)))) throw new FolioError('IMPORT_ROOT_EXISTS', 'import makes a new work folder; root must not exist yet', { root: target });
  const source = await realpath(from);
  if (inside(source, target)) throw new FolioError('IMPORT_ROOT_INSIDE_SOURCE', 'root must not be inside the vibelore folder');
  return { parent, target, parentInfo };
}

/** 계획을 빈 작품 폴더(temp)에 쓴다. 노드는 모두 status: imported, 그림은 assets/ 에 한 번만, 가져오기 기록은 영수증 기록장에. */
async function writePlan(temp, plan, { importId, now }) {
  const ledger = openLedger(temp, 'receipts', { now });
  const records = [];
  for (const [arcIndex, arc] of plan.arcs.entries()) {
    const arcDir = entryName(arcIndex, arc.id, width(plan.arcs.length));
    await writeNode(temp, { path: `${arcDir}/${NODE_FILE}`, data: { id: arc.id, level: 'arc', title: arc.title, status: IMPORTED }, body: arc.body });
    records.push(importRecord({ importId, nodeId: arc.id, importedHash: sha256(arc.body), origin: { from: 'vibelore', ...(arc.origin ?? { path: null }) } }));
    for (const [index, episode] of arc.episodes.entries()) {
      const assets = [];
      for (const picture of episode.pictures) {
        await writeAssetOnce(temp, picture.file, picture.bytes);
        const meta = { id: picture.id, file: picture.file, nodeId: episode.id, imported: { from: 'vibelore', path: picture.origin.path, sha256: picture.origin.sha256 } };
        await writeAssetOnce(temp, `${picture.id}.yaml`, stringifyYaml(meta));
        assets.push({ assetId: picture.id, path: picture.origin.path, sha256: picture.origin.sha256 });
      }
      const data = { id: episode.id, level: 'episode', title: episode.title, status: IMPORTED, ...(assets.length ? { assets: assets.map((a) => a.assetId) } : {}) };
      await writeNode(temp, { path: `${arcDir}/${entryName(index, `${episode.id}.md`, width(arc.episodes.length))}`, data, body: episode.body });
      records.push(importRecord({ importId, nodeId: episode.id, importedHash: sha256(episode.body), origin: { from: 'vibelore', ...episode.origin, assets } }));
    }
  }
  for (const entity of plan.entities) await writeEntity(temp, { id: entity.id, kind: entity.kind, data: entity.data, body: entity.body });
  for (const record of records) await ledger.append(record);
  return records;
}

/**
 * vibelore 작품 폴더(from) → 새 Folio 작품(root). from 은 읽기만 한다. root 는 아직 없어야 하고, 옆에 숨긴 임시 폴더를 만들어
 * 다 쓰고 작품이 열리는 것까지 본 뒤 배타 게시한다. 잡힌 실패는 자기 게시물만 되돌린다.
 * 가져온 노드는 status: imported 이고 가져오기 기록만 있다(영수증·커밋 기록이 아니다 — 검사를 지난 것이 아니다).
 * Folio 의 검사를 받으려면 노드마다 folio_run mode recommit 으로 다시 커밋한다.
 * @param {string} root
 * @param {{ from: string, title?: string, packs: Map<string, any>, now?: () => string, newId?: (prefix: string) => string, fs?: typeof filesystem }} options
 */
export async function importVibelore(root, { from, title, packs, now = () => new Date().toISOString(), newId = (p) => `${p}-${randomUUID().replace(/-/g, '').slice(0, 12)}`, fs = filesystem }) {
  const read = await readVibelore(from);
  const { parent, target, parentInfo } = await assertTarget(root, from);
  const plan = mapVibelore(read);
  const temp = join(parent, `.${basename(target)}.import-${randomUUID().slice(0, 8)}`);
  const ensureParent = async () => {
    const current = await fs.lstat(parent).catch(() => null);
    if (!current || current.dev !== parentInfo.dev || current.ino !== parentInfo.ino) {
      throw new FolioError('IMPORT_ROOT_INVALID', 'the folder that will hold root changed', { root: target });
    }
  };
  await ensureParent();
  await fs.mkdir(temp);
  let tempInfo = null;
  const lstatForCleanup = async (path) => {
    try { return await fs.lstat(path); }
    catch (error) { return error?.code === 'ENOENT' ? null : undefined; }
  };
  const cleanupTemp = async () => {
    if (!tempInfo) return false;
    const [currentParent, currentTemp] = await Promise.all([lstatForCleanup(parent), lstatForCleanup(temp)]);
    if (!currentParent || currentParent.dev !== parentInfo.dev || currentParent.ino !== parentInfo.ino) return false;
    if (currentTemp === null) return true;
    if (!currentTemp) return false;
    if (currentTemp.dev !== tempInfo.dev || currentTemp.ino !== tempInfo.ino) return false;
    try { await fs.rm(temp, { recursive: true, force: true }); return true; } catch { return false; }
  };
  let published = false;
  try {
    try { tempInfo = await fs.lstat(temp); }
    catch (error) {
      throw new FolioError('IMPORT_TEMP_UNVERIFIED', 'cannot verify temporary work folder ownership', {
        cause: error?.code ?? 'UNKNOWN', cleanupPending: true, temp,
      });
    }
    await ensureParent();
    const name = typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : basename(from);
    await initWork(temp, { title: name, packs: [...IMPORT_PACKS], preset: IMPORT_PRESET, available: packs });
    await fs.mkdir(join(temp, TREE_DIR), { recursive: true });
    await ensureParent();
    const importId = newId('import');
    const records = await writePlan(temp, plan, { importId, now });
    await openWorkspace(temp, { packs });
    await ensureParent();
    await publishWork(temp, target, { fs });
    published = true;
    const cleaned = await cleanupTemp();
    if (!cleaned) addCleanupWarning(plan.warnings, temp);
    return {
      root: target, importId, status: IMPORTED,
      imported: { arcs: plan.arcs.length, episodes: plan.arcs.reduce((n, a) => n + a.episodes.length, 0), entities: plan.entities.length, assets: records.reduce((n, r) => n + (r.origin.assets?.length ?? 0), 0) },
      warnings: plan.warnings,
    };
  } catch (error) {
    if (!published && !(await cleanupTemp())) {
      error.details = { ...(error.details ?? {}), cleanupPending: true, temp };
    }
    throw error;
  }
}
