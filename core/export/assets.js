import { fencedRanges, maskRanges } from '../util/fences.js';
import { assetRefsInBody } from '../store/assets.js';
import { readAssetFile, MAX_ASSET_BYTES } from '../view/asset-file.js';
import { sha256 } from '../util/hash.js';
import { FolioError } from '../errors.js';
import { EXPORT_LIMITS } from './source.js';
import { assertStaticSvg } from './svg.js';
const extensions = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' });
/** M7 설명서와 M6 안전 읽기를 재사용한다. 참조 그림 누락을 정상 출력처럼 숨기지 않는다. */
export async function exportAssets(source) {
  const ids = new Set();
  for (const node of source.nodes) {
    for (const id of assetRefsInBody(maskRanges(node.body, fencedRanges(node.body)))) ids.add(id);
    for (const id of node.data.assets ?? []) ids.add(id);
  }
  for (const page of source.layout?.pages ?? []) for (const item of page.items) if (item.assetId !== undefined) ids.add(item.assetId);
  if (ids.size > EXPORT_LIMITS.assets) throw new FolioError('EXPORT_LIMIT', '그림이 5000개를 넘었다');
  const assets = new Map(); let bytes = 0;
  for (const id of ids) {
    const file = await readAssetFile(source.root, id, { assets: source.work.assets, singleLink: true });
    bytes += file.bytes.length;
    if (file.bytes.length > MAX_ASSET_BYTES || bytes > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', '그림 바이트 한도를 넘었다');
    if (file.type === 'image/svg+xml') assertStaticSvg(file.bytes);
    assets.set(id, { ...file, id, name: `images/image-${assets.size}.${extensions[file.type]}`, hash: sha256(file.bytes) });
  }
  return assets;
}
