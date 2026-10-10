import { loadExportSource } from '../core/export/source.js';
import { exportAssets } from '../core/export/assets.js';
import { createRender } from '../core/export/render.js';
import { webFiles } from '../core/export/web.js';
import { epubFiles } from '../core/export/epub.js';
import { xml } from '../core/export/text.js';
import { fileInventory } from './example-files.js';

export const approvalNotice = (approval) => approval === 'simulated'
  ? '시연용 예시 · 승인 기록은 모의 승인입니다. 실제 작가의 채택이나 독립 품질 인증이 아닙니다. / Demonstration: simulated approval, not author adoption or independent quality certification.'
  : '시연용 초안 · 실제 작가 승인을 기다립니다. 자기검토는 독립 품질 인증이 아닙니다. / Demonstration draft: author approval pending; self-review is not independent certification.';

/** Add the disclosure to derived editions, never to manuscript or sealed records. */
export async function exampleEditions(root, example) {
  const source = await loadExportSource({ root });
  const assets = await exportAssets(source), render = createRender(source, assets);
  const notice = `<aside class="example-notice" aria-label="Example status">${xml(approvalNotice(example.approval))}</aside>`;
  const decorated = { ...render, body: notice + render.body, groupHeadings: notice + render.groupHeadings };
  const web = webFiles(source, decorated, assets);
  const epub = epubFiles(source, decorated, assets, '2026-10-10T00:00:00Z');
  for (const [format, files] of [['web', web], ['epub', epub]]) {
    const manifest = { version: 1, format, exampleId: example.id, approval: example.approval,
      title: source.title, receipt: false, nodes: source.manifestNodes, warnings: source.warnings,
      assets: [...assets.values()].map((asset) => ({ id: asset.id, hash: asset.hash, bytes: asset.bytes.length })), files: fileInventory(files) };
    files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  }
  return { web, epub };
}
