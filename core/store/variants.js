import { join } from 'node:path';
import { lstat } from 'node:fs/promises';
import { listEntries, writeFileAtomic } from '../util/fs.js';
import { sha256 } from '../util/hash.js';
import { parseYaml } from '../util/yaml.js';
import { isPlainObject } from '../util/plain.js';
import { parseDoc, serializeDoc } from './frontmatter.js';
import { ID } from './ids.js';
import { readOriginalFile } from './sources.js';
import { FolioError } from '../errors.js';

export const VARIANTS_DIR = 'variants';
export const TERMS_FILE = 'terms.yaml';
const TERM_MAX = 200;
const MD = /^(.+)\.md$/;

/** @typedef {{ nodeId: string, path: string, title: string|null, data: Record<string, any>, body: string }} VariantText */
/** @typedef {{ id: string, texts: Map<string, VariantText>, terms: { rev: string|null, pairs: { from: string, to: string }[] } }} VariantStore */

/** 링크를 따라가지 않고 본다. 없으면 null. */
async function entryKind(path) {
  try {
    const info = await lstat(path);
    return info.isSymbolicLink() ? 'link' : info.isDirectory() ? 'dir' : info.isFile() ? 'file' : 'other';
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
    throw error;
  }
}

/** 보통 파일만 읽는다: 심볼릭 링크·하드 링크(이름이 둘 이상)는 null(자료 원본과 같은 규칙, 열린 손잡이에서 읽는다). */
async function readRegular(path) {
  try { return (await readOriginalFile(path)).toString('utf8'); } catch (error) {
    if (error?.code === 'NOT_REGULAR_FILE') return null;
    throw error;
  }
}

/** terms.yaml: { terms: [{ from, to }] }. from·to 는 비지 않은 글(200자까지). 틀리면 null. */
function readTerms(text) {
  let raw;
  try { raw = parseYaml(text, { source: TERMS_FILE }); } catch { return null; }
  if (!isPlainObject(raw) || !Array.isArray(raw.terms) || Object.keys(raw).some((key) => key !== 'terms')) return null;
  const ok = (value) => typeof value === 'string' && value.trim() !== '' && value.length <= TERM_MAX;
  if (!raw.terms.every((t) => isPlainObject(t) && ok(t.from) && ok(t.to) && Object.keys(t).every((key) => key === 'from' || key === 'to'))) return null;
  return raw.terms.map((t) => ({ from: t.from, to: t.to }));
}

/** 판본 하나의 폴더: <노드 id>.md(판본 본문)와 terms.yaml(용어 대응표). */
async function readVariantDir(root, id, tree, errors, warnings) {
  /** @type {VariantStore} */
  const store = { id, texts: new Map(), terms: { rev: null, pairs: [] } };
  const dir = join(root, VARIANTS_DIR, id);
  const kind = await entryKind(dir);
  if (kind === null) return store;
  if (kind !== 'dir') { errors.push({ code: 'VARIANT_DIR_INVALID', path: `${VARIANTS_DIR}/${id}` }); return store; }
  for (const entry of await listEntries(dir)) {
    const path = `${VARIANTS_DIR}/${id}/${entry.name}`;
    if (entry.name === TERMS_FILE) {
      if (!entry.isFile()) { errors.push({ code: 'VARIANT_TERMS_INVALID', variant: id, path }); continue; }
      const text = await readRegular(join(dir, entry.name));
      if (text === null) { errors.push({ code: 'VARIANT_TERMS_INVALID', variant: id, path }); continue; }
      const pairs = readTerms(text);
      if (!pairs) errors.push({ code: 'VARIANT_TERMS_INVALID', variant: id, path });
      else store.terms = { rev: sha256(text), pairs };
      continue;
    }
    const match = MD.exec(entry.name);
    if (!match || !ID.test(match[1])) { warnings.push({ code: 'VARIANT_FILE_STRAY', path }); continue; }
    const nodeId = match[1];
    if (!tree.nodes.has(nodeId)) { warnings.push({ code: 'VARIANT_NODE_MISSING', variant: id, nodeId, path }); continue; }
    // 링크·폴더·장치는 읽지 않는다(작품 밖 글을 판본으로 받지 않는다).
    if (!entry.isFile()) { errors.push({ code: 'VARIANT_FILE_INVALID', variant: id, path }); continue; }
    const text = await readRegular(join(dir, entry.name));
    if (text === null) { errors.push({ code: 'VARIANT_FILE_INVALID', variant: id, path }); continue; }
    const { data, body } = parseDoc(text, { source: path });
    store.texts.set(nodeId, { nodeId, path, title: typeof data.title === 'string' ? data.title : null, data, body });
  }
  return store;
}

/**
 * 판본 본문을 읽는다(N6). variants/<판본 id>/<노드 id>.md 한 파일이 노드 하나의 그 판본 본문이다 — 트리 폴더와 떨어져 있어 노드를 옮기거나 묶어도 그대로다.
 * features.variants 가 꺼졌으면 읽지 않는다(빈 Map). 선언하지 않은 판본 폴더·트리에 없는 노드의 파일은 경고, 링크·깨진 용어 대응표는 오류다.
 * @param {string} root
 * @param {{ variants: string[], features: Record<string, boolean> }} config
 * @param {{ nodes: Map<string, any> }} tree
 */
export async function readVariants(root, config, tree) {
  /** @type {Map<string, VariantStore>} */
  const variants = new Map();
  const errors = [];
  const warnings = [];
  if (!config.features.variants) return { variants, errors, warnings };
  const top = await entryKind(join(root, VARIANTS_DIR));
  if (top !== null && top !== 'dir') return { variants, errors: [{ code: 'VARIANTS_DIR_INVALID', path: VARIANTS_DIR }], warnings };
  const declared = config.variants.filter((id) => id !== 'main');
  for (const entry of top ? await listEntries(join(root, VARIANTS_DIR)) : []) {
    if (!declared.includes(entry.name)) warnings.push({ code: 'VARIANT_DIR_UNDECLARED', path: `${VARIANTS_DIR}/${entry.name}` });
  }
  for (const id of declared) variants.set(id, await readVariantDir(root, id, tree, errors, warnings));
  return { variants, errors, warnings };
}

export const variantFilePath = (root, variant, nodeId) => join(root, VARIANTS_DIR, variant, `${nodeId}.md`);

/** 판본 본문을 쓴다(커밋만 부른다). 쓰기 직전 대상 하나에서 앞머리를 안전하게 읽는다. */
export async function writeVariantText(root, variant, nodeId, body) {
  const variantsPath = join(root, VARIANTS_DIR);
  const kind = await entryKind(variantsPath);
  if (kind !== null && kind !== 'dir') throw new FolioError('VARIANT_DIR_INVALID', 'a variant folder must be a plain folder, not a link', { path: VARIANTS_DIR });
  const variantPath = join(variantsPath, variant);
  const kindVariant = await entryKind(variantPath);
  if (kindVariant !== null && kindVariant !== 'dir') throw new FolioError('VARIANT_DIR_INVALID', 'a variant folder must be a plain folder, not a link', { path: `${VARIANTS_DIR}/${variant}` });
  const path = `${VARIANTS_DIR}/${variant}/${nodeId}.md`;
  let previous;
  try { previous = (await readOriginalFile(variantFilePath(root, variant, nodeId))).toString('utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') previous = null;
    else if (error?.code === 'NOT_REGULAR_FILE') throw new FolioError('VARIANT_FILE_INVALID', `${path} must be a plain file`, { path });
    else throw error;
  }
  const data = previous === null ? {} : parseDoc(previous, { source: path }).data;
  await writeFileAtomic(variantFilePath(root, variant, nodeId), serializeDoc({ data, body }));
}
