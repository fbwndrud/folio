import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../../core/errors.js';
import { buildSnapshot, snapshotAssetFiles } from '../../core/view/index.js';
import { BUILD_HINT } from './static.js';

import { EXPORT_DIR, EXPORT_MARKER, lstatOrNull, prepareExportTarget } from './export-target.js';
export { EXPORT_DIR, EXPORT_MARKER };
const EXT = Object.freeze({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/avif': '.avif' });

/** 빌드된 화면 폴더를 복사한다. 링크와 특수 파일은 건너뛴다. 복사한 파일 수를 돌려준다. */
async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  let count = 0;
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) count += await copyTree(source, target);
    else if (entry.isFile()) { await writeFile(target, await readFile(source)); count += 1; }
  }
  return count;
}

/**
 * index.html 에 한 벌을 JSON 으로 싣는다(실행되지 않는 script). `<` 는 < 로 써서 글 속 `</script>` 가 태그를 닫지 못하게 한다.
 * @param {string} html
 * @param {unknown} snapshot
 */
export function embedSnapshot(html, snapshot) {
  if (!html.includes('</body>')) throw new FolioError('VIEWER_BUILD_INVALID', 'index.html has no </body>');
  const json = JSON.stringify(snapshot).replace(/</g, '\\u003c');
  return html.replace('</body>', () => `<script type="application/json" id="folio-data">${json}</script>\n</body>`);
}

/**
 * 정적 내보내기(설계 §17): 빌드된 뷰어 화면 + 모든 화면의 한 벌(core/view buildSnapshot) + 그림 파일을 <root>/exports/viewer 에 쓴다.
 * 정적 호스팅(웹 서버)에 그대로 올려 쇼케이스로 쓴다. 내보낸 화면은 읽기만 한다(단계 토글 없음).
 * - 화면이 빌드되지 않았으면 VIEWER_NOT_BUILT. viewerExport 가 꺼져 있으면 FEATURE_DISABLED.
 * - exports 가 링크거나 폴더가 아니면 EXPORT_DIR_INVALID. exports/viewer 가 이미 있는데 전에 내보낸 표시가 없으면 EXPORT_DIR_NOT_OURS(작가 파일을 덮지 않는다).
 * - 임시 폴더를 완성한 뒤 기존 사본을 백업하고 교체한다. 실패하면 복구하거나 백업 경로를 알린다.
 * @param {{ root: string, packs: Map<string, any>, distDir: string }} options
 */
export async function exportViewer({ root, packs, distDir }) {
  if (!(await lstatOrNull(join(distDir, 'index.html')))?.isFile()) throw new FolioError('VIEWER_NOT_BUILT', 'build the viewer screens first', { hint: BUILD_HINT });
  const snapshot = await buildSnapshot(root, { packs });
  const output = await prepareExportTarget(root);
  const { temp } = output;
  try {
    let files = await copyTree(distDir, temp);
    /** @type {Record<string, string>} */
    const assetFiles = {};
    for await (const file of snapshotAssetFiles(root, snapshot)) {
      const { id } = file;
      if (file.type === 'image/svg+xml') {
        assetFiles[id] = `data:image/svg+xml;base64,${file.bytes.toString('base64')}`;
        continue;
      }
      const name = `assets/${id}${EXT[file.type]}`;
      await mkdir(join(temp, 'assets'), { recursive: true });
      await writeFile(join(temp, name), file.bytes);
      assetFiles[id] = name;
      files += 1;
    }
    const html = await readFile(join(distDir, 'index.html'), 'utf8');
    await writeFile(join(temp, 'index.html'), embedSnapshot(html, { ...snapshot, assetFiles }));
    await writeFile(join(temp, EXPORT_MARKER), 'made by the folio viewer export; the whole folder is replaced on the next export\n');
    await output.publish();
    return { dir: EXPORT_DIR, files, assets: Object.keys(assetFiles).length };
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  } finally { await output.release(); }
}
