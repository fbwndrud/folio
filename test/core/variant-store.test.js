import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile, link } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { readVariants, writeVariantText, variantFilePath } from '../../core/store/variants.js';
import { sha256 } from '../../core/util/hash.js';
import { tempDir } from '../support/fixtures.js';
import { patchWork, putVariantFile, variantWork } from '../support/variant-work.js';

const TERMS = 'terms:\n  - { from: 하나, to: Hana }\n  - { from: 잠긴 문, to: the locked door }\n';

test('variants/<id>/<node id>.md is the node text of that variant; terms.yaml is its term map with a rev', async () => {
  const root = await variantWork();
  await putVariantFile(root, 'en', 'ep-001.md', '---\ntitle: Episode 1\n---\nHana found the locked door.\n');
  await putVariantFile(root, 'en', 'terms.yaml', TERMS);
  const work = await openWork(root);
  const en = work.variants.get('en');
  assert.deepEqual([...work.variants.keys()], ['en']);
  assert.deepEqual(en.texts.get('ep-001'), {
    nodeId: 'ep-001', path: 'variants/en/ep-001.md', title: 'Episode 1', data: { title: 'Episode 1' }, body: 'Hana found the locked door.\n',
  });
  assert.deepEqual(en.terms, { rev: sha256(TERMS), pairs: [{ from: '하나', to: 'Hana' }, { from: '잠긴 문', to: 'the locked door' }] });
  assert.deepEqual(work.warnings, []);
});

test('a declared variant without a folder is empty; with the feature off nothing is read at all', async () => {
  const root = await variantWork();
  assert.deepEqual((await openWork(root)).variants.get('en'), { id: 'en', texts: new Map(), terms: { rev: null, pairs: [] } });
  await putVariantFile(root, 'en', 'ep-001.md', 'Hana.\n');
  await patchWork(root, { features: { variants: false } });
  assert.equal((await openWork(root)).variants.size, 0);
});

test('stray files, undeclared folders and files for unknown nodes are warnings, not errors', async () => {
  const root = await variantWork();
  await putVariantFile(root, 'en', 'notes.txt', 'x');
  await putVariantFile(root, 'en', 'Bad Name.md', 'x');
  await putVariantFile(root, 'en', 'ghost.md', 'x');
  await putVariantFile(root, 'fr', 'ep-001.md', 'x');
  const work = await openWork(root);
  const codes = work.warnings.map((w) => [w.code, w.path]);
  assert.deepEqual(codes, [
    ['VARIANT_DIR_UNDECLARED', 'variants/fr'], ['VARIANT_FILE_STRAY', 'variants/en/Bad Name.md'],
    ['VARIANT_NODE_MISSING', 'variants/en/ghost.md'], ['VARIANT_FILE_STRAY', 'variants/en/notes.txt'],
  ]);
  assert.equal(work.variants.get('en').texts.has('ghost'), false);
});

test('links never carry text from outside the work: a linked variant file, folder or variants/ refuses to open; so does a broken term map', { skip: process.platform === 'win32' }, async () => {
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'secret.md'), 'outside text\n');
  const codeOf = async (root) => (await openWork(root).then(() => null, (error) => error.details.errors.map((e) => e.code)));
  const file = await variantWork();
  await mkdir(join(file, 'variants', 'en'), { recursive: true });
  await symlink(join(outside, 'secret.md'), join(file, 'variants', 'en', 'ep-001.md'));
  assert.deepEqual(await codeOf(file), ['VARIANT_FILE_INVALID']);
  const dir = await variantWork();
  await mkdir(join(dir, 'variants'), { recursive: true });
  await symlink(outside, join(dir, 'variants', 'en'));
  assert.deepEqual(await codeOf(dir), ['VARIANT_DIR_INVALID']);
  const top = await variantWork();
  await symlink(outside, join(top, 'variants'));
  assert.deepEqual(await codeOf(top), ['VARIANTS_DIR_INVALID']);
  for (const bad of ['terms: nope\n', 'terms:\n  - { from: 하나 }\n', 'terms: []\nextra: 1\n', ': : :\n']) {
    const root = await variantWork();
    await putVariantFile(root, 'en', 'terms.yaml', bad);
    assert.deepEqual(await codeOf(root), ['VARIANT_TERMS_INVALID'], bad);
  }
});

test('hard-linked variant files and terms.yaml refuse to open with VARIANT_FILE_INVALID or VARIANT_TERMS_INVALID', { skip: process.platform === 'win32' }, async () => {
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'source.md'), 'outside text\n');
  await writeFile(join(outside, 'source.yaml'), 'terms:\n  - { from: a, to: b }\n');
  const codeOf = async (root) => (await openWork(root).then(() => null, (error) => error.details.errors.map((e) => e.code)));
  const file = await variantWork();
  await mkdir(join(file, 'variants', 'en'), { recursive: true });
  await link(join(outside, 'source.md'), join(file, 'variants', 'en', 'ep-001.md'));
  assert.deepEqual(await codeOf(file), ['VARIANT_FILE_INVALID']);
  const terms = await variantWork();
  await mkdir(join(terms, 'variants', 'en'), { recursive: true });
  await link(join(outside, 'source.yaml'), join(terms, 'variants', 'en', 'terms.yaml'));
  assert.deepEqual(await codeOf(terms), ['VARIANT_TERMS_INVALID']);
  const symTerms = await variantWork();
  await mkdir(join(symTerms, 'variants', 'en'), { recursive: true });
  await symlink(join(outside, 'source.yaml'), join(symTerms, 'variants', 'en', 'terms.yaml'));
  assert.deepEqual(await codeOf(symTerms), ['VARIANT_TERMS_INVALID']);
});

test('writeVariantText refuses a symlinked variants/ or variants/<id> and writes nothing to the outside folder', { skip: process.platform === 'win32' }, async () => {
  const outside = await tempDir('folio-outside-');
  const root = await variantWork();
  await mkdir(join(root, 'variants'), { recursive: true });
  await symlink(outside, join(root, 'variants', 'en'));
  try {
    await writeVariantText(root, 'en', 'ep-001', 'text\n');
    assert.fail('should have thrown VARIANT_DIR_INVALID');
  } catch (error) {
    assert.equal(error?.code, 'VARIANT_DIR_INVALID');
  }
  assert.equal((await readFile(join(outside, 'ep-001.md'), 'utf8').then(() => true, () => false)), false);
  const root2 = await variantWork();
  await symlink(outside, join(root2, 'variants'));
  try {
    await writeVariantText(root2, 'en', 'ep-001', 'text\n');
    assert.fail('should have thrown VARIANT_DIR_INVALID');
  } catch (error) {
    assert.equal(error?.code, 'VARIANT_DIR_INVALID');
  }
});

test('writeVariantText keeps the front matter and writes LF text; readVariants reads it back', async () => {
  const root = await tempDir('folio-variant-write-');
  await mkdir(join(root, 'variants', 'en'), { recursive: true });
  await writeFile(variantFilePath(root, 'en', 'ep-001'), '---\ntitle: Episode 1\n---\nOld.\n');
  await writeVariantText(root, 'en', 'ep-001', 'Hana.\n');
  assert.equal(await readFile(variantFilePath(root, 'en', 'ep-001'), 'utf8'), '---\ntitle: Episode 1\n---\nHana.\n');
  await writeVariantText(root, 'en', 'ep-002', 'Doyun.\n');
  const tree = { nodes: new Map([['ep-001', {}], ['ep-002', {}]]) };
  const { variants, errors } = await readVariants(root, { variants: ['main', 'en'], features: { variants: true } }, tree);
  assert.deepEqual(errors, []);
  assert.deepEqual([...variants.get('en').texts.values()].map((t) => [t.nodeId, t.body]), [['ep-001', 'Hana.\n'], ['ep-002', 'Doyun.\n']]);
});
