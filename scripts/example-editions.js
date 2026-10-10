import { loadExportSource } from '../core/export/source.js';
import { exportAssets } from '../core/export/assets.js';
import { createRender } from '../core/export/render.js';
import { webFiles } from '../core/export/web.js';
import { epubFiles } from '../core/export/epub.js';
import { xml } from '../core/export/text.js';
import { fileInventory } from './example-files.js';

export function approvalNotice(approval, language = null) {
  if (language?.startsWith('en')) return approval === 'simulated'
    ? 'Demonstration: simulated approval, not author adoption. Same-host review is not an independent assessment of writing quality.'
    : 'Demonstration draft: author approval pending. Same-host review is not an independent assessment of writing quality.';
  return approval === 'simulated'
    ? '시연용 예시 · 모의 승인 / Demonstration: simulated approval, not author adoption or independent quality certification.'
    : '시연용 초안 · 작가 승인 대기 / Demonstration draft: author approval pending; self-review is not independent certification.';
}

/** Add the disclosure to derived editions, never to manuscript or sealed records. */
export async function exampleEditions(root, example) {
  const original = await loadExportSource({ root, variant: example.variant ?? 'main', language: example.language === undefined ? null : Intl.getCanonicalLocales(example.language)[0] });
  const titles = example.titles ?? {};
  const titleOf = (id, fallback) => Object.hasOwn(titles, id) ? titles[id] : fallback;
  const tree = { ...original.work.tree, nodes: new Map([...original.work.tree.nodes].map(([id, node]) => [id, { ...node, title: titleOf(id, node.title) }])) };
  const source = { ...original, title: example.title, work: { ...original.work, tree }, nodes: original.nodes.map(node => ({ ...node, title: titleOf(node.id, node.title) })) };
  const assets = await exportAssets(source), render = createRender(source, assets);
  const notice = `<aside class="example-notice" style="max-width:900px;margin:24px auto;padding:14px 28px;font-family:system-ui;line-height:1.5;border-left:3px solid #b7cab9" aria-label="Example status">${xml(approvalNotice(example.approval, source.lang))}</aside>`;
  const decorated = { ...render, body: notice + render.body, groupHeadings: notice + render.groupHeadings };
  const web = webFiles(source, decorated, assets);
  const epub = epubFiles(source, decorated, assets, '2026-10-10T00:00:00Z');
  for (const [format, files] of [['web', web], ['epub', epub]]) {
    const manifest = { version: 1, format, exampleId: example.id, approval: example.approval,
      title: source.title, language: source.lang, variant: source.variant, receipt: false, nodes: source.manifestNodes, warnings: source.warnings,
      assets: [...assets.values()].map((asset) => ({ id: asset.id, hash: asset.hash, bytes: asset.bytes.length })), files: fileInventory(files) };
    files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  }
  return { web, epub, language: source.lang, variant: source.variant };
}
