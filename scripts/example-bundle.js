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
import { exampleStudio } from './example-studio.js';
import { exampleReadme } from './example-readme.js';
import { VARIANT_ID } from '../core/variants/model.js';
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
    if (item.language !== undefined) {
      try { if (typeof item.language !== 'string' || !Intl.getCanonicalLocales(item.language)[0]) throw new Error(); }
      catch { throw new Error('Choose a valid language tag'); }
    }
    if (item.variant !== undefined && (typeof item.variant !== 'string' || (item.variant !== 'main' && !VARIANT_ID.test(item.variant)))) throw new Error('Choose a safe variant ID');
    if (item.titles !== undefined && (!item.titles || typeof item.titles !== 'object' || Array.isArray(item.titles) || Object.values(item.titles).some(v => typeof v !== 'string'))) throw new Error('Example titles must be a text map');
    if (!isAbsolute(item.root)) throw new Error('Source roots must be absolute');
  }
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
  const editions = await exampleEditions(work, example);
  example = { ...example, language: editions.language };
  await exportViewer({ root: work, packs, distDir });
  await rename(join(work, 'exports', 'viewer'), join(folder, 'studio'));
  await rmdir(join(work, 'exports')); // Preserve an unexpected file instead of deleting it.
  const htmlPath = join(folder, 'studio', 'index.html');
  const html = exampleStudio(await readFile(htmlPath, 'utf8'), example);
  const metadata = jsonBytes({ id: example.id, approval: example.approval, language: example.language ?? 'ko', readingVariant: example.variant ?? 'main', studioVariant: example.variant ?? 'main' }).toString().replaceAll('<', '\\u003c');
  await writeFile(htmlPath, html.replace('</body>', `<script type="application/json" id="folio-example">${metadata}</script></body>`));
  await writeFiles(join(folder, 'web'), editions.web);
  await writeFiles(join(folder, 'epub'), editions.epub);
  await writeFile(join(folder, 'README.md'), exampleReadme(example, approvalNotice(example.approval, example.language)));
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
    approval: example.approval, review: 'same-host', language: example.language ?? 'ko', readingVariant: example.variant ?? 'main', studioVariant: example.variant ?? 'main', contentLicense: example.contentLicense ?? 'not-set', originalRecordsUnchanged: true,
    pending: inspection.checks.filter(c => c.status === 'warning').map(c => ({ name: c.name, message: c.message })),
    files: fileInventory(files) };
  const manifest = jsonBytes(info);
  await writeFile(join(folder, 'manifest.json'), manifest); files.set('manifest.json', manifest);
  const zip = zipFiles(new Map([...files].map(([path, bytes]) => [`${example.id}/${path}`, bytes])));
  const filename = `linivera-example-${example.id}.zip`;
  await writeFile(join(output, filename), zip, { flag: 'wx' });
  return { id: info.id, title: info.title, description: info.description, approval: info.approval,
    contentLicense: info.contentLicense, language: info.language, readingVariant: info.readingVariant, studioVariant: info.studioVariant, filename, bytes: zip.length, hash: sha256(zip), files: files.size };
}
/** No approval, source mutation, model calls, network or public uploads. */
export async function buildExampleCollection({ examples, output, distDir = join(repo, 'viewer', 'dist'), galleryLanguage = 'ko' }) {
  validateExamples(examples);
  if (!['en', 'ko'].includes(galleryLanguage)) throw new Error('Choose en or ko for gallery language');
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
    await writeExampleGallery(target, catalog, galleryLanguage);
    return { output: target, published: false, examples: catalog };
  } catch (error) {
    // Another process may have added or changed files. Never recursively erase output.
    throw new Error(`Example build failed; partial output preserved at ${target}: ${error.message}`, { cause: error });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifestPath, output, ...extra] = process.argv.slice(2);
  if (!manifestPath || !output || extra.length) throw new Error('Usage: node scripts/example-bundle.js <manifest.json> <new-output-folder>');
  const { examples, galleryLanguage = 'ko' } = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
  console.log(JSON.stringify(await buildExampleCollection({ examples, output, galleryLanguage }), null, 2));
}
