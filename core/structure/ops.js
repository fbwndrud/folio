import { basename, dirname, join } from 'node:path';
import { FolioError } from '../errors.js';
import { levelIndex } from '../work/config.js';
import { NODE_FILE, TREE_DIR, ancestorsOf } from '../store/tree.js';
import { serializeDoc } from '../store/frontmatter.js';
import { writeFileAtomic } from '../util/fs.js';
import { ID } from '../store/ids.js';
import { baseName, renumber } from './naming.js';
import { assertAbsent, assertFresh, safeRename } from './fs-guard.js';

/** 노드가 부모 폴더 안에서 차지하는 항목(잎은 파일, 가지는 폴더). */
export const entryOf = (node) => (node.kind === 'leaf' ? basename(node.path) : basename(dirname(node.path)));
const containerDir = (root, parent) => (parent ? join(root, TREE_DIR, dirname(parent.path)) : join(root, TREE_DIR));
const siblingsOf = (work, parentId) => (parentId ? work.tree.nodes.get(parentId).children : work.tree.rootIds).map((id) => work.tree.nodes.get(id));
const entries = (nodes) => nodes.map((n) => ({ name: entryOf(n), base: baseName(entryOf(n)) }));

function assertNewId(work, id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new FolioError('NODE_ID_INVALID', String(id));
  if (work.tree.nodes.has(id)) throw new FolioError('DUPLICATE_ID', id);
}

function levelOf(work, level) {
  const index = levelIndex(work.config, level);
  if (index < 0) throw new FolioError('LEVEL_UNKNOWN', String(level));
  return { index, ...work.config.levels[index] };
}

function assertDeeper(work, parentLevel, childLevel) {
  if (parentLevel === null) return;
  if (levelIndex(work.config, parentLevel) >= levelIndex(work.config, childLevel)) {
    throw new FolioError('LEVEL_ORDER_INVALID', `${childLevel} cannot sit under ${parentLevel}`);
  }
}

function branchOrNull(work, id) {
  if (!id) return null;
  const node = work.tree.nodes.get(id);
  if (!node) throw new FolioError('NODE_NOT_FOUND', id);
  if (node.kind !== 'branch') throw new FolioError('STRUCTURE_PARENT_NOT_BRANCH', id);
  return node;
}

const nodeDoc = ({ id, level, title, brief = null }) => serializeDoc({
  data: { id, level, ...(title ? { title } : {}), status: 'draft', ...(brief ? { brief } : {}) }, body: '',
});

export async function addNode(root, work, { parentId = null, level, id, title = '', brief = null, index = null }) {
  assertNewId(work, id);
  const info = levelOf(work, level);
  const parent = branchOrNull(work, parentId);
  assertDeeper(work, parent?.level ?? null, level);
  const dir = containerDir(root, parent);
  const base = info.leaf ? `${id}.md` : id;
  const temp = `~add-${base}`;
  const siblings = siblingsOf(work, parentId);
  await assertFresh(dir, siblings.map(entryOf));
  await assertAbsent(join(dir, temp));
  await writeFileAtomic(info.leaf ? join(dir, temp) : join(dir, temp, NODE_FILE), nodeDoc({ id, level, title, brief }));
  const list = entries(siblings);
  const at = index === null ? list.length : Math.max(0, Math.min(index, list.length));
  list.splice(at, 0, { name: temp, base });
  await renumber(dir, list);
}

export async function wrapNodes(root, work, { nodeIds, level, id, title = '' }) {
  assertNewId(work, id);
  if (!nodeIds?.length) throw new FolioError('STRUCTURE_EMPTY', 'nothing to wrap');
  const nodes = nodeIds.map((nodeId) => {
    const node = work.tree.nodes.get(nodeId);
    if (!node) throw new FolioError('NODE_NOT_FOUND', nodeId);
    return node;
  });
  const parentId = nodes[0].parentId;
  if (nodes.some((n) => n.parentId !== parentId)) throw new FolioError('STRUCTURE_NOT_SIBLINGS', nodeIds.join(','));
  const siblings = siblingsOf(work, parentId);
  const indexes = nodes.map((n) => siblings.indexOf(n)).sort((a, b) => a - b);
  if (indexes.some((value, i) => i > 0 && value !== indexes[i - 1] + 1)) throw new FolioError('STRUCTURE_NOT_CONTIGUOUS', nodeIds.join(','));
  const info = levelOf(work, level);
  if (info.leaf) throw new FolioError('LEVEL_KIND_MISMATCH', `${level} is a leaf level`);
  for (const node of nodes) assertDeeper(work, level, node.level);
  const parent = parentId ? work.tree.nodes.get(parentId) : null;
  assertDeeper(work, parent?.level ?? null, level);
  const dir = containerDir(root, parent);
  const temp = `~wrap-${id}`;
  await assertFresh(dir, siblings.map(entryOf));
  await assertAbsent(join(dir, temp));
  await writeFileAtomic(join(dir, temp, NODE_FILE), nodeDoc({ id, level, title }));
  const wrapped = indexes.map((i) => siblings[i]);
  for (const node of wrapped) await safeRename(join(dir, entryOf(node)), join(dir, temp, entryOf(node)));
  await renumber(join(dir, temp), entries(wrapped));
  const list = entries(siblings);
  list.splice(indexes[0], wrapped.length, { name: temp, base: id });
  await renumber(dir, list);
}

export async function moveNode(root, work, { nodeId, parentId = null, index = null }) {
  const node = work.tree.nodes.get(nodeId);
  if (!node) throw new FolioError('NODE_NOT_FOUND', nodeId);
  const target = branchOrNull(work, parentId);
  if (target && (target.id === nodeId || ancestorsOf(work.tree, target.id).some((a) => a.id === nodeId))) {
    throw new FolioError('STRUCTURE_CYCLE', `${nodeId} cannot move inside itself`);
  }
  assertDeeper(work, target?.level ?? null, node.level);
  const fromParent = node.parentId ? work.tree.nodes.get(node.parentId) : null;
  const fromDir = containerDir(root, fromParent);
  const toDir = containerDir(root, target);
  const entry = entryOf(node);
  const temp = `~move-${baseName(entry)}`;
  await assertFresh(fromDir, siblingsOf(work, node.parentId).map(entryOf));
  if (toDir !== fromDir) await assertFresh(toDir, siblingsOf(work, parentId).map(entryOf));
  await safeRename(join(fromDir, entry), join(toDir, temp));
  const remaining = entries(siblingsOf(work, node.parentId).filter((n) => n.id !== nodeId));
  if (fromDir !== toDir) await renumber(fromDir, remaining);
  const list = fromDir === toDir ? remaining : entries(siblingsOf(work, parentId));
  const at = index === null ? list.length : Math.max(0, Math.min(index, list.length));
  list.splice(at, 0, { name: temp, base: baseName(entry) });
  await renumber(toDir, list);
}
