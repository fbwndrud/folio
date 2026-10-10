import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { packDigest } from '../../core/pack/digest.js';
import { checkDigest } from '../../core/checks/applied.js';
import { SOURCES_PACK_DIR } from '../../packs/sources/index.js';
import { SOURCES_CHECKERS } from '../../packs/sources/checkers/index.js';
import { tempDir } from '../support/fixtures.js';

async function packCopy() {
  const dir = await tempDir('folio-code-digest-');
  await cp(SOURCES_PACK_DIR, dir, { recursive: true });
  return dir;
}
const load = (dir, extra = {}) => loadYamlPack(dir, { checkers: SOURCES_CHECKERS, ...extra });
const numberCheck = (pack) => pack.checks.find((check) => check.id === 'sources.numbers-match');

test('a helper change changes the pack and checker digests even with the same checker function', async () => {
  const dir = await packCopy();
  const before = await load(dir);
  const helper = join(dir, 'checkers', 'claims.js');
  await writeFile(helper, (await readFile(helper, 'utf8')).replace("- 0xfee0", "- 0xfee1"));
  const after = await load(dir);
  assert.equal(numberCheck(before).run, numberCheck(after).run);
  assert.notEqual(packDigest(before), packDigest(after));
  assert.notEqual(packDigest(before), packDigest({ ...after, digest: before.digest }), 'a rewound declaration cannot hide changed code');
  assert.notEqual(checkDigest(numberCheck(before)), checkDigest(numberCheck(after)));
  assert.equal(packDigest(await load(dir)), packDigest(after));
});

test('code additions and deletions count, but unrelated documentation does not', async () => {
  const dir = await packCopy();
  const base = packDigest(await load(dir));
  await writeFile(join(dir, 'README.md'), '합성 팩 설명');
  assert.equal(packDigest(await load(dir)), base);
  const helper = join(dir, 'checkers', 'extra.mjs');
  await writeFile(helper, 'export const value = 1;\n');
  assert.notEqual(packDigest(await load(dir)), base);
  await rm(helper);
  assert.equal(packDigest(await load(dir)), base);
});

test('code digests use relative paths and ignore file creation order', async () => {
  const a = await packCopy();
  const b = await packCopy();
  for (const [dir, names] of [[a, ['a.cjs', 'z.json']], [b, ['z.json', 'a.cjs']]]) {
    for (const name of names) await writeFile(join(dir, name), name === 'a.cjs' ? 'module.exports = 1;' : '{"value":1}');
  }
  assert.equal(packDigest(await load(a)), packDigest(await load(b)));
});

test('linked code files and directories are refused instead of read', { skip: process.platform === 'win32' }, async () => {
  for (const directory of [false, true]) {
    const dir = await packCopy();
    const outside = await tempDir('folio-code-outside-');
    await writeFile(join(outside, 'helper.js'), 'export const value = 1;');
    await symlink(directory ? outside : join(outside, 'helper.js'), join(dir, directory ? 'linked' : 'helper.js'));
    await assert.rejects(load(dir), (error) => error.code === 'PACK_INVALID'
      && error.details.errors.some((entry) => entry.code === 'PACK_CODE_PATH_INVALID'));
  }
});

test('declared external checker inputs count even if function source is unchanged', async () => {
  const dir = await packCopy();
  const before = await load(dir, { checkerInputs: { 'numbers-match': { externalHash: 'v1' } } });
  const after = await load(dir, { checkerInputs: { 'numbers-match': { externalHash: 'v2' } } });
  assert.notEqual(packDigest(before), packDigest(after));
  assert.notEqual(checkDigest(numberCheck(before)), checkDigest(numberCheck(after)));
});

test('mistyped checker input names and malformed input maps are rejected', async () => {
  const dir = await packCopy();
  for (const checkerInputs of [null, [], { 'numbers-macth': { limit: 1 } }]) {
    await assert.rejects(load(dir, { checkerInputs }), { code: 'PACK_INVALID' });
  }
});

test('checker input lookup does not read inherited Object prototype properties', async () => {
  const dir = await packCopy();
  const yaml = join(dir, 'pack.yaml');
  await writeFile(yaml, (await readFile(yaml, 'utf8')).replace('run: numbers-match', 'run: constructor'));
  const checkers = { ...SOURCES_CHECKERS, constructor: SOURCES_CHECKERS['numbers-match'] };
  const pack = await loadYamlPack(dir, { checkers });
  assert.equal(numberCheck(pack).digestInputs, null);
  assert.match(checkDigest(numberCheck(pack)), /^sha256:/);
});

test('a programmatic checker includes source and declared closure inputs in its digest', () => {
  const checker = (limit) => ({ id: 'demo.limit', run: (ctx) => ctx.value > limit ? [{ code: 'LIMIT' }] : [], digestInputs: { limit } });
  assert.notEqual(checkDigest(checker(1)), checkDigest(checker(2)));
  assert.notEqual(checkDigest(checker(1)), checkDigest({ ...checker(1), run: () => [] }));
  assert.throws(() => checkDigest({ id: 'demo.native', run: Math.max }), { code: 'PACK_DIGEST_UNSUPPORTED' });
});
