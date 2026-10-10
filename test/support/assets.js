import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { tempDir } from './fixtures.js';

export const syntheticSvg = (color = 'blue') => `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${color}"/></svg>`;
export const checked = ['asset.fixed-facts', 'asset.brief-fit', 'asset.quality'];
export const finding = (checkId, code = 'SYNTHETIC_FINDING') => ({ checkId, code, message: '합성 검토 지적' });

export async function setupAssets() {
  const base = await tempDir('folio-assets-');
  const root = join(base, 'work');
  const packs = await loadBuiltinPacks();
  const tools = createToolbox({ packs });
  const call = async (name, args) => tools.call(name, { root, ...args });
  const asset = async (args) => call('folio_assets', args);
  const ok = (out) => { if (!out.ok) throw new Error(JSON.stringify(out.error)); return out.result; };
  ok(await call('folio_init', { title: '합성 자산 실습', preset: 'scene' }));
  ok(await call('folio_structure', { op: 'add', level: 'scene', id: 'toy-scene', title: '합성 장면' }));
  const source = join(base, 'host-result.svg'); await writeFile(source, syntheticSvg());
  const add = async (id = 'toy-image') => ok(await asset({ op: 'add', id, brief: { description: '합성 파란 사각형', entities: [] } })).asset;
  const get = async (id = 'toy-image') => ok(await asset({ op: 'get', id }));
  const put = async (a, extras = {}) => ok(await asset({ op: 'put', id: a.id, expectedRev: a.rev, path: source, mediaType: 'image/svg+xml', ...extras })).asset;
  const review = async (a, findings = []) => ok(await asset({ op: 'review', id: a.id, expectedRev: a.rev, contentHash: a.output.contentHash, checked, findings })).asset;
  const approve = async (a, extras = {}) => ok(await asset({ op: 'decide', id: a.id, expectedRev: a.rev, reviewId: a.review.reviewId, action: 'approve', ...extras })).asset;
  return { base, root, packs, tools, call, asset, ok, source, add, get, put, review, approve };
}
