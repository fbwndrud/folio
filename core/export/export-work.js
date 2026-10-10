import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { loadExportSource, EXPORT_LIMITS } from './source.js';
import { exportAssets } from './assets.js';
import { createRender } from './render.js';
import { webFiles } from './web.js';
import { epubFiles } from './epub.js';
import { publishExport } from './publish.js';

/** 형식별 바이트를 먼저 완성한다. 원고·기록장에 쓰지 않고 영수증을 만들지 않는다. */
export async function bundlePublication({ root, variant = 'main', language = null, format = 'web', now = () => new Date().toISOString() }) {
  if (!['web', 'epub'].includes(format)) throw new FolioError('EXPORT_FORMAT_INVALID', '웹 또는 EPUB 형식만 지원한다');
  const generatedAt = new Date(now()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const source = await loadExportSource({ root, variant, language }), assets = await exportAssets(source), render = createRender(source, assets);
  const files = format === 'web' ? webFiles(source, render, assets) : epubFiles(source, render, assets, generatedAt);
  const manifest = { version: 1, format, variant, generatedAt, title: source.title, language: source.lang, receipt: false,
    contents: render.contents, nodes: source.manifestNodes, receiptsHash: source.receiptsHash, warnings: source.warnings,
    assets: [...assets.values()].map((asset) => ({ id: asset.id, type: asset.type, hash: asset.hash, bytes: asset.bytes.length })),
    files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, hash: sha256(bytes) })) };
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  if (files.size > EXPORT_LIMITS.files || [...files.values()].reduce((n, bytes) => n + bytes.length, 0) > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', '출력 파일·바이트 한도를 넘었다');
  return { files, manifest, layout: source.layout };
}
export async function checkExport(options) {
  const { files, manifest, layout } = await bundlePublication(options);
  return { format: manifest.format, variant: manifest.variant, language: manifest.language, layout, warnings: manifest.warnings, contents: manifest.contents, nodes: manifest.nodes.length, assets: manifest.assets.length, files: files.size, bytes: [...files.values()].reduce((n, b) => n + b.length, 0) };
}
export async function exportWork({ root, output, fs = undefined, ...options }) {
  const { files, manifest } = await bundlePublication({ root, ...options });
  const published = await publishExport(root, output, files, { fs });
  return { status: 'exported', output: published.target, format: manifest.format, variant: manifest.variant, files: files.size, warnings: [...manifest.warnings, ...published.warnings] };
}
