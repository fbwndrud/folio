import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { listEntries, readTextOrNull, writeFileAtomic } from '../util/fs.js';
import { parseDoc, serializeDoc } from './frontmatter.js';

export const NODE_FILE = '_node.md';
export const TREE_DIR = 'tree';
export const ROLES = ['front', 'body', 'back'];
export const NODE_STATUSES = ['draft', 'planned', 'committed', 'imported'];
const ID = /^[a-z0-9][a-z0-9-]*$/;

/** @typedef {{ to: string, kind: string, label: string }} NodeLink */
/**
 * @typedef {{ id: string, level: string, role: string, status: string, title: string,
 *   kind: 'branch'|'leaf', path: string, parentId: string|null, siblingIndex: number,
 *   children: string[], links: NodeLink[], assets: string[], entities: string[],
 *   data: Record<string, any>, body: string, fileText: string }} TreeNode
 */
/** @typedef {{ nodes: Map<string, TreeNode>, rootIds: string[], errors: Array<Record<string, any>> }} Tree */

function readLinks(raw, path, errors) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) { errors.push({ code: 'LINK_INVALID', path }); return []; }
  const links = [];
  for (const link of raw) {
    if (typeof link?.to !== 'string' || !link.to) { errors.push({ code: 'LINK_INVALID', path }); continue; }
    links.push({ to: link.to, kind: typeof link.kind === 'string' ? link.kind : 'see-also', label: typeof link.label === 'string' ? link.label : '' });
  }
  return links;
}

const stringList = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);

function toNode(text, path, kind, parentId, errors) {
  const { data, body } = parseDoc(text, { source: `${TREE_DIR}/${path}` });
  if (typeof data.id !== 'string' || !ID.test(data.id)) { errors.push({ code: 'NODE_ID_INVALID', path }); return null; }
  if (typeof data.level !== 'string') { errors.push({ code: 'NODE_LEVEL_MISSING', path, id: data.id }); return null; }
  const role = data.role ?? 'body';
  if (!ROLES.includes(role)) errors.push({ code: 'NODE_ROLE_INVALID', path, id: data.id });
  const status = data.status ?? 'draft';
  if (!NODE_STATUSES.includes(status)) errors.push({ code: 'NODE_STATUS_INVALID', path, id: data.id });
  return {
    id: data.id, level: data.level, role, status, title: typeof data.title === 'string' ? data.title : '',
    kind, path, parentId, siblingIndex: 0, children: [],
    links: readLinks(data.links, path, errors), assets: stringList(data.assets), entities: stringList(data.entities),
    data, body, fileText: text,
  };
}

/** tree/ 를 읽는다. 폴더는 가지(_node.md 필수), 그 밖의 .md 파일은 잎이다. */
export async function readTree(root) {
  /** @type {Tree} */
  const tree = { nodes: new Map(), rootIds: [], errors: [] };
  const register = (node, siblings) => {
    if (tree.nodes.has(node.id)) { tree.errors.push({ code: 'DUPLICATE_ID', id: node.id, path: node.path }); return false; }
    node.siblingIndex = siblings.length;
    tree.nodes.set(node.id, node);
    siblings.push(node.id);
    return true;
  };
  async function visit(dir, relDir, parentId, siblings) {
    for (const entry of await listEntries(dir)) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const text = await readTextOrNull(join(dir, entry.name, NODE_FILE));
        if (text === null) { tree.errors.push({ code: 'NODE_FILE_MISSING', path: rel }); continue; }
        const node = toNode(text, `${rel}/${NODE_FILE}`, 'branch', parentId, tree.errors);
        if (node && register(node, siblings)) await visit(join(dir, entry.name), rel, node.id, node.children);
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== NODE_FILE) {
        const node = toNode(await readFile(join(dir, entry.name), 'utf8'), rel, 'leaf', parentId, tree.errors);
        if (node) register(node, siblings);
      }
    }
  }
  await visit(join(root, TREE_DIR), '', null, tree.rootIds);
  return tree;
}

export const nodeFilePath = (root, node) => join(root, TREE_DIR, node.path);

export async function writeNode(root, node) {
  await writeFileAtomic(nodeFilePath(root, node), serializeDoc({ data: node.data, body: node.body }));
}

export async function writeTree(root, tree) {
  for (const node of tree.nodes.values()) await writeNode(root, node);
}

/**
 * frontmatter 필드와 본문을 바꿔 쓴다. 모델 필드(status/title/role)도 같이 맞춘다.
 * @param {string} root
 * @param {TreeNode} node
 * @param {{ data?: Record<string, any>, body?: string }} [options]
 */
export async function updateNode(root, node, { data = {}, body } = {}) {
  Object.assign(node.data, data);
  for (const key of ['status', 'title', 'role']) if (key in data) node[key] = data[key];
  if (body !== undefined) node.body = body;
  await writeNode(root, node);
  return node;
}

export function preorder(tree) {
  const out = [];
  const walk = (ids) => { for (const id of ids) { out.push(id); walk(tree.nodes.get(id).children); } };
  walk(tree.rootIds);
  return out;
}

export function ancestorsOf(tree, id) {
  const out = [];
  let current = tree.nodes.get(id)?.parentId ?? null;
  while (current) {
    const node = tree.nodes.get(current);
    out.push(node);
    current = node.parentId;
  }
  return out;
}
