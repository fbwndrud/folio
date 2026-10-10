import { FolioError } from '../errors.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeFilePath } from '../store/tree.js';
import { parseDoc, serializeDoc } from '../store/frontmatter.js';
import { readOriginalFile } from '../store/sources.js';
import { MAIN, variantOf } from '../variants/model.js';

/** Exact file and serialized bytes bound to a commit, for both original and edition. */
export async function commitTargetFile(root, node, receipt, text) {
  if (variantOf(receipt) === MAIN) return {
    path: node.path, current: await readFile(nodeFilePath(root, node)), body: node.body,
    after: serializeDoc({ data: { ...node.data, status: 'committed' }, body: text }),
  };
  const path = `variants/${variantOf(receipt)}/${node.id}.md`;
  let current = null;
  try { current = await readOriginalFile(join(root, path)); }
  catch (error) {
    if (error.code === 'NOT_REGULAR_FILE') throw new FolioError('VARIANT_FILE_INVALID', `${path} must be a plain file`, { path });
    if (error.code !== 'ENOENT') throw error;
  }
  const document = current === null ? { data: {}, body: null } : parseDoc(current.toString('utf8'), { source: path });
  return { path, current, body: document.body, after: serializeDoc({ data: document.data, body: text }) };
}
