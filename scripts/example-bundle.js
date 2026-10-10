import { readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBuiltinPacks } from '../packs/index.js';
import { inspectWork } from '../core/diagnostics/work.js';
import { sha256 } from '../core/util/hash.js';
import { zipFiles } from '../core/export/zip.js';
import { exportViewer } from '../server/view/export.js';
import { collectFiles, fileInventory, includeWorkFile, writeFiles } from './example-files.js';
import { approvalNotice, exampleEditions } from './example-editions.js';
import { writeExampleGallery } from './example-gallery.js';
import { prepareExampleOutput } from './example-output.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');

function validateExamples(examples) {
  if (!Array.isArray(examples) || !examples.length || examples.length > 20) throw new Error('Choose 1–20 examples');
  const ids = new Set();
  for (const item of examples) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(item.id) || ids.has(item.id)) throw new Error('Example IDs must be unique safe names');
    ids.add(item.id);
    if (typeof item.title !== 'string' || !item.title.trim() || typeof item.description !== 'string' || !['simulated', 'pending'].includes(item.approval)) throw new Error('Each example needs a title, description and explicit approval status');
    if (item.contentLicense !== undefined && !['CC0-1.0', 'not-set'].includes(item.contentLicense)) throw new Error('Choose an explicit supported content license');
    if (!isAbsolute(item.root)) throw new Error('Source roots must be absolute');
  }
}
function readme(example) {
  return `# ${example.title}\n\n${example.description}\n\n${approvalNotice(example.approval)}\n\n## 먼저 읽기 / Read first\n\n- \`web/index.html\`: 웹 원고. 브라우저로 열 수 있습니다.\n- \`epub/book.epub\`: 전자책 앱에서 여는 EPUB.\n- \`studio/\`: 목차·인물·근거·검토 기록을 보는 읽기 전용 사본.\n- \`work/\`: 원고·설정·이미지 ID·자료·원래 기록장을 보존한 Folio 작품 사본.\n\n## 화면 열기 / Open Studio\n\n이 ZIP을 푼 폴더에서 \`node serve.mjs\`를 실행하고 표시되는 주소를 엽니다. Node.js 22.13 이상이 필요합니다. 이 서버는 읽기만 하며 원고를 바꾸지 않습니다. Ctrl+C로 종료합니다. 인터넷 업로드는 하지 않습니다.\n\n## 이어 쓰기 / Continue in Folio\n\n먼저 폴더 전체를 복사해 작업 사본을 만드세요. 연결한 AI에게 “이 폴더의 work를 Folio로 열고, 현재 상태와 대기 중인 질문부터 확인해 줘”라고 요청합니다. 이미 기록된 모의 승인은 실제 작가 승인으로 간주하지 마세요. 설치된 명령은 \`folio-doctor work --json\`, \`folio-view work\`입니다. 엔진과 모델은 이 ZIP에 포함하지 않습니다.\n\n## 확인 / Integrity\n\n\`manifest.json\`은 포함 파일의 hash를 제공합니다. 다운로드 자체의 checksum은 예시 모음의 \`SHA256SUMS\`에서 확인합니다. 기록장은 수정하지 않았으며 캐시·잠금 DB·호스트 통신 로그는 포함하지 않습니다.\n\n## 권리 / Rights\n\nFolio 엔진의 Apache-2.0 라이선스와 예시 콘텐츠의 라이선스는 별개입니다. ${example.contentLicense === 'CC0-1.0' ? '이 예시의 자체 제작 원고·그림·설정·조사 노트는 CC0-1.0으로 제공됩니다. 상업적 사용과 수정·재배포가 가능합니다. licenses/CC0-1.0.txt를 확인하세요.' : '이 예시의 콘텐츠 라이선스는 미지정입니다. 재사용하려면 권리자의 허락을 확인하세요.'} 출처 자료는 원문 재배포본이 아닌 조사 노트이며 각 출처의 권리를 유지합니다. Folio 소프트웨어에는 LICENSE와 NOTICE가 적용됩니다. Studio에 포함된 제3자 코드는 studio/THIRD-PARTY-NOTICES.txt의 별도 라이선스를 따릅니다. CC0는 제3자 인용·코드·상표의 권리를 바꾸지 않습니다.\n`;
}
async function buildOne(example, output, packs, distDir) {
  const folder = join(output, 'examples', example.id), work = join(folder, 'work');
  const sourceInspection = await inspectWork(example.root, { packs });
  if (!sourceInspection.ok || sourceInspection.checks.some(c => c.name === 'pending-write' && c.status !== 'ok')) {
    throw new Error(`Source work needs inspection or interrupted-write recovery: ${example.id}`);
  }
  const original = await collectFiles(example.root, includeWorkFile, example.privateRoots ?? [example.root]);
  if (!original.has('work.yaml')) throw new Error('Example must contain work.yaml');
  await writeFiles(work, original);
  const inspection = await inspectWork(work, { packs });
  if (!inspection.ok) throw new Error(`Copied work failed inspection: ${example.id}: ${JSON.stringify(inspection.checks.filter(c => c.status === 'error'))}`);
  await exportViewer({ root: work, packs, distDir });
  await rename(join(work, 'exports', 'viewer'), join(folder, 'studio'));
  await rmdir(join(work, 'exports')); // Preserve an unexpected file instead of deleting it.
  const htmlPath = join(folder, 'studio', 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  const metadata = jsonBytes({ id: example.id, approval: example.approval }).toString().replaceAll('<', '\\u003c');
  await writeFile(htmlPath, html.replace('</body>', `<script type="application/json" id="folio-example">${metadata}</script></body>`));
  const editions = await exampleEditions(work, example);
  await writeFiles(join(folder, 'web'), editions.web);
  await writeFiles(join(folder, 'epub'), editions.epub);
  await writeFile(join(folder, 'README.md'), readme(example));
  const rights = new Map();
  for (const name of ['LICENSE', 'NOTICE']) rights.set(name, await readFile(join(repo, name)));
  if (example.contentLicense === 'CC0-1.0') rights.set('licenses/CC0-1.0.txt', await readFile(join(repo, 'licenses', 'CC0-1.0.txt')));
  await writeFiles(folder, rights);
  await writeFile(join(folder, 'serve.mjs'), await readFile(join(repo, 'scripts', 'example-preview.mjs')));
  const copied = await collectFiles(work, includeWorkFile, example.privateRoots ?? [example.root]);
  if (JSON.stringify(fileInventory(original)) !== JSON.stringify(fileInventory(copied))) throw new Error('Original work bytes changed during packaging');
  const unchanged = await collectFiles(example.root, includeWorkFile, example.privateRoots ?? [example.root]);
  if (JSON.stringify(fileInventory(original)) !== JSON.stringify(fileInventory(unchanged))) throw new Error('Source work changed during packaging; retry from a stable copy');
  const files = await collectFiles(folder, () => true, example.privateRoots ?? [example.root]);
  const info = { version: 1, id: example.id, title: example.title, description: example.description,
    approval: example.approval, review: 'same-host', contentLicense: example.contentLicense ?? 'not-set', originalRecordsUnchanged: true,
    pending: inspection.checks.filter(c => c.status === 'warning').map(c => ({ name: c.name, message: c.message })),
    files: fileInventory(files) };
  const manifest = jsonBytes(info);
  await writeFile(join(folder, 'manifest.json'), manifest); files.set('manifest.json', manifest);
  const zip = zipFiles(new Map([...files].map(([path, bytes]) => [`${example.id}/${path}`, bytes])));
  const filename = `folio-example-${example.id}.zip`;
  await writeFile(join(output, filename), zip, { flag: 'wx' });
  return { id: info.id, title: info.title, description: info.description, approval: info.approval,
    contentLicense: info.contentLicense, filename, bytes: zip.length, hash: sha256(zip), files: files.size };
}
/** No approval, source mutation, model calls, network or public uploads. */
export async function buildExampleCollection({ examples, output, distDir = join(repo, 'viewer', 'dist') }) {
  validateExamples(examples);
  const { target, roots, assertParent } = await prepareExampleOutput(output, examples.map(e => e.root));
  try {
    const packs = await loadBuiltinPacks(), catalog = [];
    for (const [index, example] of examples.entries()) {
      await assertParent();
      catalog.push(await buildOne({ ...example, root: roots[index], privateRoots: [example.root, roots[index]] }, target, packs, distDir));
    }
    await assertParent();
    await writeFile(join(target, 'catalog.json'), jsonBytes({ version: 1, publishingPerformedByBuilder: false, examples: catalog }));
    await writeFile(join(target, 'SHA256SUMS'), catalog.map(e => `${e.hash.slice(7)}  ${e.filename}\n`).join(''));
    await writeExampleGallery(target, catalog);
    return { output: target, published: false, examples: catalog };
  } catch (error) {
    // Another process may have added or changed files. Never recursively erase output.
    throw new Error(`Example build failed; partial output preserved at ${target}: ${error.message}`, { cause: error });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifestPath, output, ...extra] = process.argv.slice(2);
  if (!manifestPath || !output || extra.length) throw new Error('Usage: node scripts/example-bundle.js <manifest.json> <new-output-folder>');
  const { examples } = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
  console.log(JSON.stringify(await buildExampleCollection({ examples, output }), null, 2));
}
