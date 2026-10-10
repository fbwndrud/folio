import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { listEntries, writeFileAtomic } from '../util/fs.js';
import { sha256 } from '../util/hash.js';
import { parseDoc, serializeDoc } from './frontmatter.js';
import { ID, assertId, assertSafePath } from './ids.js';

export const ENTITIES_DIR = 'entities';

/** @typedef {{ id: string, kind: string, name: string, aliases: string[], data: Record<string, any>, body: string, path: string, rev: string, fileText: string }} Entity */

/** entities/<kind>/<file>.md 를 읽는다. 폴더 이름과 kind 필드가 같아야 한다. */
export async function readEntities(root) {
  const found = [];
  const errors = [];
  for (const kindDir of await listEntries(join(root, ENTITIES_DIR))) {
    if (!kindDir.isDirectory()) continue;
    for (const file of await listEntries(join(root, ENTITIES_DIR, kindDir.name))) {
      if (!file.isFile() || !file.name.endsWith('.md')) continue;
      const path = `${ENTITIES_DIR}/${kindDir.name}/${file.name}`;
      const text = await readFile(join(root, path), 'utf8');
      const { data, body } = parseDoc(text, { source: path });
      if (typeof data.id !== 'string' || !ID.test(data.id)) { errors.push({ code: 'ENTITY_ID_INVALID', path }); continue; }
      if (data.kind !== kindDir.name) { errors.push({ code: 'ENTITY_KIND_MISMATCH', path, id: data.id }); continue; }
      if (typeof data.name !== 'string' || !data.name) { errors.push({ code: 'ENTITY_NAME_MISSING', path, id: data.id }); continue; }
      const aliases = Array.isArray(data.aliases) ? data.aliases.filter((a) => typeof a === 'string' && a) : [];
      found.push({ id: data.id, kind: data.kind, name: data.name, aliases, data, body, path, rev: sha256(text), fileText: text });
    }
  }
  const entities = new Map();
  for (const entity of found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (entities.has(entity.id)) errors.push({ code: 'DUPLICATE_ENTITY_ID', id: entity.id, path: entity.path });
    else entities.set(entity.id, entity);
  }
  return { entities, errors };
}

export async function writeEntity(root, entity) {
  assertId(entity.id, 'entity.id');
  assertId(entity.kind, 'entity.kind');
  assertSafePath(entity.path, 'entity.path');
  const path = entity.path ?? `${ENTITIES_DIR}/${entity.kind}/${entity.id}.md`;
  await writeFileAtomic(join(root, path), serializeDoc({ data: entity.data, body: entity.body ?? '' }));
}
