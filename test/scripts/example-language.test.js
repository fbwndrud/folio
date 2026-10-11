import test from 'node:test';
import { inflateRawSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exampleEditions } from '../../scripts/example-editions.js';
import { exampleStudio } from '../../scripts/example-studio.js';
import { exampleReadme } from '../../scripts/example-readme.js';
import { openWork } from '../../core/store/work.js';
import { buildExampleCollection } from '../../scripts/example-bundle.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { exportFixture, sourceSnapshot } from '../support/export-work.js';

function epubEntry(bytes, target) {
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), length = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + length).toString(), start = offset + 30 + length + extra;
    if (name === target) return (bytes.readUInt16LE(offset + 8) === 0 ? bytes.subarray(start, start + size) : inflateRawSync(bytes.subarray(start, start + size))).toString();
    offset = start + size;
  }
  throw new Error('Missing EPUB entry');
}
const example = root => ({ id: 'english', root, title: 'A New English Work', description: 'Synthetic English fixture.', approval: 'simulated', language: 'en' });

test('English editions declare English and leave the manuscript and ledger unchanged', async t => {
  const { root } = await exportFixture(t), before = await sourceSnapshot(root);
  const editions = await exampleEditions(root, example(root));
  const web = editions.web.get('index.html').toString();
  assert.match(web, /<html[^>]*lang="en"/);
  assert.match(web, /A New English Work/);
  assert.match(web, /Demonstration: simulated approval/);
  assert.doesNotMatch(web, /시연용 예시/);
  assert.match(epubEntry(editions.epub.get('book.epub'), 'OEBPS/package.opf'), /dc:language>en/);
  assert.equal(JSON.parse(editions.web.get('manifest.json')).language, 'en');
  assert.deepEqual(await sourceSnapshot(root), before);
});

test('translation editions select variant text and derived English headings without rewriting the original', async t => {
  const { root } = await exportFixture(t);
  const path = join(root, 'work.yaml'), config = parseYaml(await readFile(path, 'utf8'));
  config.variants = ['main', { id: 'en', kind: 'translation', lang: 'en' }];
  await writeFile(path, stringifyYaml(config));
  await mkdir(join(root, 'variants', 'en'), { recursive: true });
  await writeFile(join(root, 'variants', 'en', 'a.md'), 'A synthetic translated paragraph.\n');
  for (const id of (await openWork(root)).tree.nodes.keys()) {
    if (id !== 'a') await writeFile(join(root, 'variants', 'en', `${id}.md`), 'A second synthetic translated paragraph.\n');
  }
  const before = await sourceSnapshot(root), details = { ...example(root), language: undefined, variant: 'en', titles: { a: 'The Translated Scene' } };
  const editions = await exampleEditions(root, details), web = editions.web.get('index.html').toString();
  assert.match(web, /A synthetic translated paragraph/);
  assert.match(web, /The Translated Scene/);
  assert.doesNotMatch(web, /합성 제목/);
  assert.equal(JSON.parse(editions.web.get('manifest.json')).variant, 'en');
  assert.equal(editions.language, 'en');
  assert.match(web, /Demonstration: simulated approval/);
  assert.deepEqual(await sourceSnapshot(root), before);
  const readme = exampleReadme({ ...details, language: editions.language }, 'Synthetic notice');
  assert.match(readme, /Studio open the English translation variant/);
  assert.match(readme, /original main manuscript/);
  assert.match(readme, /use Reading edition to switch/);
});

test('an English gallery starts in English and packaged metadata distinguishes the reader and Studio variants', async t => {
  const { root, output } = await exportFixture(t);
  const result = await buildExampleCollection({ examples: [example(root)], output: output('english'), galleryLanguage: 'en' });
  const html = await readFile(join(result.output, 'index.html'), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<option value="en" selected>/);
  assert.match(html, /<title>Linivera — Example Library/);
  assert.match(html, /<span lang="ko" hidden>/);
  const studio = await readFile(join(result.output, 'examples/english/studio/index.html'), 'utf8');
  assert.match(studio, /"language": "en"/);
  assert.match(studio, /"studioVariant": "main"/);
  assert.equal(result.examples[0].language, 'en');
  assert.match(await readFile(join(result.output, 'examples/english/README.md'), 'utf8'), /Open the example/);
});

test('invalid language, variant and heading maps are refused before creating output', async t => {
  const { root, output } = await exportFixture(t);
  for (const [field, value, message] of [['language', ['en'], /language tag/], ['language', '', /language tag/], ['variant', {}, /variant ID/], ['variant', '../en', /variant ID/], ['titles', { a: 4 }, /text map/]]) {
    await assert.rejects(buildExampleCollection({ examples: [{ ...example(root), [field]: value }], output: output('invalid') }), message);
    await assert.rejects(readFile(join(output('invalid'), 'catalog.json')), { code: 'ENOENT' });
  }
});


test('canonical language tags and own title mappings determine the derived edition', async t => {
  const { root } = await exportFixture(t);
  const editions = await exampleEditions(root, { ...example(root), language: 'EN', titles: Object.create({ a: 'Inherited title must be ignored' }) });
  assert.equal(editions.language, 'en');
  const web = editions.web.get('index.html').toString();
  assert.doesNotMatch(web, /Inherited title must be ignored/);
  assert.match(web, /Demonstration: simulated approval/);
});

test('derived Studio titles apply only to the reading variant, escape script boundaries and preserve review hashes', () => {
  const original = { node: { id: 'a', title: 'Original title' }, breadcrumb: [], contentHash: 'original' };
  const translated = { node: { id: 'a', title: 'Original title' }, breadcrumb: [], contentHash: 'translation' };
  const snapshot = { nodes: { a: original }, variants: { editions: { en: { nodes: { a: translated }, receiptNodes: { a: { title: 'Original title' } }, publication: { contents: [{ id: 'a', title: 'Original title' }] } } } } };
  const html = `<script type="application/json" id="folio-data">${JSON.stringify(snapshot)}</script></body>`;
  const result = exampleStudio(html, { variant: 'en', titles: { a: '</script>English title' } });
  assert.doesNotMatch(result, /<\/script>English title/);
  const data = JSON.parse(result.match(/id="folio-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.nodes.a.node.title, 'Original title');
  assert.equal(data.variants.editions.en.nodes.a.node.title, '</script>English title');
  assert.equal(data.variants.editions.en.nodes.a.contentHash, 'translation');
  assert.equal(data.variants.editions.en.receiptNodes.a.title, '</script>English title');
  assert.equal(data.variants.editions.en.publication.contents[0].title, '</script>English title');
  assert.equal(translated.node.title, 'Original title');
});
