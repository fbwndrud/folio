import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { EXPORT_LIMITS } from '../core/export/source.js';
import { sha256 } from '../core/util/hash.js';

const ROOTS = new Set(['work.yaml', 'layout.yaml', 'tree', 'entities', 'sources', 'assets', 'checks', 'variants']);
const STATE = new Set(['ledger', 'resources', 'runs', 'image-runs', 'tracking-proposals', 'projections']);
const PRIVATE = /\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Z]:(?:\\+|\/)Users(?:\\+|\/)|file:\/\/|(?:127\.0\.0\.1|localhost):\d+|[?&]token=|Bearer\s+[A-Za-z0-9._-]{12,}|\b(?:sk-|hf_|ghp_|gho_)[A-Za-z0-9_-]{20,}/;
export function assertShareable(bytes, path, privateRoots = []) {
  const bad = (text) => PRIVATE.test(text) || privateRoots.some(root => text.includes(root));
  const fail = () => { throw new Error(`Private host location or credential in ${path}; preserve the original and prepare a separate shareable example`); };
  const text = bytes.toString('utf8');
  if (bad(text)) fail();
  // JSON/JSONL may encode paths and credentials with escapes. Inspect decoded values too.
  for (const line of path.endsWith('.jsonl') ? text.split('\n') : [text]) {
    if (!/^\s*[[{]/.test(line)) continue;
    let value; try { value = JSON.parse(line); } catch { continue; }
    const pending = [value];
    while (pending.length) {
      const entry = pending.pop();
      if (typeof entry === 'string' && bad(entry)) fail();
      else if (entry && typeof entry === 'object') {
        for (const [key, value] of Object.entries(entry)) { pending.push(key); pending.push(value); }
      }
    }
  }
}
export function includeWorkFile(path) {
  const parts = path.split('/');
  if (parts.some((part) => /(?:\.sqlite(?:-.*)?|\.db(?:-.*)?|\.lock|\.tmp)$/.test(part))) return false;
  if (parts[0] !== '.folio') return ROOTS.has(parts[0]);
  return STATE.has(parts[1]) && !parts.slice(2).some((part) => part.startsWith('.'));
}
/** Bounded, regular files only. No symlink traversal or silent path conversion. */
export async function collectFiles(root, accept = () => true, privateRoots = []) {
  if (!(await lstat(root)).isDirectory()) throw new Error('Choose a regular source folder');
  const files = new Map(); let total = 0;
  async function walk(relative) {
    for (const name of (await readdir(join(root, relative))).sort()) {
      const path = relative ? `${relative}/${name}` : name;
      const info = await lstat(join(root, path));
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error(`Unsafe file: ${path}`);
      if (info.isDirectory()) { await walk(path); continue; }
      if (!accept(path)) continue;
      if (files.size >= EXPORT_LIMITS.files || total + info.size > EXPORT_LIMITS.bytes) throw new Error('Example exceeds bundle limits');
      const bytes = await readFile(join(root, path));
      total += bytes.length;
      if (total > EXPORT_LIMITS.bytes) throw new Error('Example exceeds bundle limits');
      assertShareable(bytes, path, privateRoots); files.set(path, bytes);
    }
  }
  await walk(''); return files;
}
export async function writeFiles(root, files) {
  for (const [path, bytes] of files) {
    if (!/^[A-Za-z0-9.][A-Za-z0-9._/-]*$/.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe output path: ${path}`);
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes, { flag: 'wx' });
  }
}
export const fileInventory = (files) => [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, hash: sha256(bytes) }));
