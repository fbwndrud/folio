import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { moduleGraph } from '../../core/pack/module-graph.js';
import { stringifyYaml } from '../../core/util/yaml.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { tempDir } from '../support/fixtures.js';
import { NOVEL_CHECKERS } from '../../packs/novel/checkers/index.js';
import { KNOWLEDGE_CHECKERS } from '../../packs/knowledge/checkers/index.js';
import { SOURCES_CHECKERS } from '../../packs/sources/checkers/index.js';
import { BRAND_CHECKERS } from '../../packs/brand/checkers/index.js';
import { IMAGE_CHECKERS } from '../../packs/image/checkers/index.js';
import { VARIANTS_CHECKERS } from '../../packs/variants/checkers/index.js';

const PACKS_DIR = join(import.meta.dirname, '..', '..', 'packs');

async function jsFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await jsFiles(path));
    else if (entry.name.endsWith('.js')) out.push(path);
  }
  return out;
}

test('C0 guard: every .js file under a built-in pack checkers/ and lexicons/ is in its module graph, so the pack digest sees it', async () => {
  for (const name of ['novel', 'knowledge', 'sources', 'brand', 'image', 'variants']) {
    const dir = join(PACKS_DIR, name);
    const graph = new Map(await moduleGraph(dir, ['checkers/index.js']));
    const files = [...await jsFiles(join(dir, 'checkers')), ...await jsFiles(join(dir, 'lexicons'))].map((f) => relative(dir, f).split(sep).join('/'));
    assert.ok(files.length > 0, name);
    for (const file of files) assert.ok(graph.has(file), `${name}: ${file} is not reached from checkers/index.js`);
  }
  assert.ok(new Map(await moduleGraph(join(PACKS_DIR, 'brand'), ['checkers/index.js'])).has('../sources/checkers/claims.js'), 'another pack helper counts');
  assert.ok(new Map(await moduleGraph(join(PACKS_DIR, 'novel'), ['checkers/index.js'])).has('../../core/promise.js'), 'a core helper counts');
});

const SPEC = {
  name: 'demo', checks: { 'demo.nobody': { tier: 'deterministic', stage: 'facts', severity: 'advisory', experimental: true, run: 'nobody' } },
  checkSets: { 'demo.basic': { title: '기본', checks: ['demo.nobody'] } },
  pipelines: {
    leaf: [
      { id: 'draft', kind: 'generate', produces: 'draft' }, { id: 'extract', kind: 'generate', produces: 'events', requires: ['draft'] },
      { id: 'facts', kind: 'check', tier: 'deterministic', stage: 'facts', requires: ['extract'] }, { id: 'commit', kind: 'commit' },
    ],
    branch: [{ id: 'plan', kind: 'generate', produces: 'plan' }, { id: 'children', kind: 'generate', produces: 'children' }, { id: 'commit', kind: 'commit' }],
  },
};
const CHECKERS = { nobody: () => [] };

async function writeFiles(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
  }
}

async function writePack(files) {
  const dir = await tempDir('folio-graph-');
  await writeFile(join(dir, 'pack.yaml'), stringifyYaml(SPEC));
  await writeFiles(dir, files);
  return dir;
}
const MODULES = {
  'checkers/index.js': "import { nobody } from './nobody.js';\nexport { lexicon } from '../lexicons/words.js';\nexport const CHECKERS = { nobody };\n",
  'checkers/nobody.js': "import './text/helper.js';\nimport { readFile } from 'node:fs/promises';\nexport const nobody = () => [];\n",
  'checkers/text/helper.js': 'export const helper = 1;\n',
  'lexicons/words.js': "export const lexicon = ['가'];\n",
};

test('C0: the pack digest changes when an imported helper or lexicon changes, even though the checker function text does not', async () => {
  const load = (dir) => loadYamlPack(dir, { checkers: CHECKERS, modules: ['checkers/index.js'] });
  const base = await load(await writePack(MODULES));
  assert.equal((await load(await writePack(MODULES))).digest, base.digest, 'same files, same digest on another folder');
  assert.notEqual((await load(await writePack({ ...MODULES, 'checkers/text/helper.js': 'export const helper = 2;\n' }))).digest, base.digest);
  assert.notEqual((await load(await writePack({ ...MODULES, 'lexicons/words.js': "export const lexicon = ['나'];\n" }))).digest, base.digest);
  const graph = await moduleGraph(await writePack(MODULES), ['checkers/index.js']);
  assert.deepEqual(graph.map(([path]) => path), ['checkers/index.js', 'checkers/nobody.js', 'checkers/text/helper.js', 'lexicons/words.js']);
  const without = await loadYamlPack(await writePack(MODULES), { checkers: CHECKERS });
  assert.notEqual(without.digest, base.digest, 'packs that name no modules keep the old digest recipe');
  await assert.rejects(loadYamlPack(await writePack({}), { checkers: CHECKERS, modules: ['checkers/index.js'] }), { code: 'PACK_FILE_MISSING' });
});

test('C0: every built-in pack loads with its module graph in the declared digest', async () => {
  const packs = await loadBuiltinPacks();
  const loaders = { novel: NOVEL_CHECKERS, knowledge: KNOWLEDGE_CHECKERS, sources: SOURCES_CHECKERS, brand: BRAND_CHECKERS, image: IMAGE_CHECKERS, variants: VARIANTS_CHECKERS };
  for (const [name, checkers] of Object.entries(loaders)) {
    const withoutGraph = await loadYamlPack(join(PACKS_DIR, name), { name, checkers });
    assert.notEqual(packs.get(name).digest, withoutGraph.digest, name);
  }
});

// --- fix round 1: 공격 리뷰가 찾은 fail-open 경로(회귀 방지) ---

async function graphOf(files) {
  const dir = await tempDir('folio-graph-form-');
  await writeFiles(dir, files);
  return new Map(await moduleGraph(dir, ['entry.js']));
}

const FORMS = {
  '?query 는 떼고 본다': ["import './helper.js?x=1';\n", 'helper.js'],
  '#hash 는 떼고 본다': ["import './helper.js#frag';\n", 'helper.js'],
  '%xx 퍼센트 인코딩을 푼다': ["import './%68elper.js';\n", 'helper.js'],
  'from 과 따옴표 사이 블록 주석을 지나간다': ["import { x } from /* c */ './helper.js';\n", 'helper.js'],
  'from 과 따옴표 사이 줄 주석을 지나간다': ["import { x } from // c\n './helper.js';\n", 'helper.js'],
  '이중따옴표 속 작은따옴표는 경로 글자다': ["import x from \"./it's.js\";\n", "it's.js"],
  // C0 최종 리뷰 fix-4: 줄 주석은 \n 뿐 아니라 외로운 \r·U+2028·U+2029 에서도 끝난다(자바스크립트 줄 끝 규칙).
  // 이 세 글자를 놓치면 주석이 다음 줄까지 삼켜 진짜 import 를 건너뛴다 — Node 는 여전히 그 파일을 불러오므로 잠금 경로가 fail open 된다.
  '줄 주석이 외로운 \\r 에서 끝난다': ["import { x } from // c\r './helper.js';\n", 'helper.js'],
  '줄 주석이 U+2028(줄 구분자) 에서 끝난다': ["import { x } from // c  './helper.js';\n", 'helper.js'],
  '줄 주석이 U+2029(문단 구분자) 에서 끝난다': ["import { x } from // c  './helper.js';\n", 'helper.js'],
};

test('C0: query strings, hash fragments, %xx, and a comment between from/import and the specifier all still resolve to the real helper (fail-open regression)', async () => {
  for (const [label, [entryText, helperPath]] of Object.entries(FORMS)) {
    const before = await graphOf({ 'entry.js': entryText, [helperPath]: 'export const v = 1;\n' });
    assert.ok(before.has(helperPath), label);
    const after = await graphOf({ 'entry.js': entryText, [helperPath]: 'export const v = 2;\n' });
    assert.notEqual(after.get(helperPath), before.get(helperPath), label);
  }
});

test('C0: a relative import inside a symlinked helper resolves next to the real file, like Node (no --preserve-symlinks)', { skip: process.platform === 'win32' }, async () => {
  const dir = await tempDir('folio-graph-symlink-');
  await writeFiles(dir, {
    'entry.js': "import './checkers/helper.js';\n",
    'shared/helper.js': "import './dict.js';\nexport const v = 1;\n",
    'shared/dict.js': 'export const dict = 1;\n',
  });
  await mkdir(join(dir, 'checkers'), { recursive: true });
  await symlink(join(dir, 'shared', 'helper.js'), join(dir, 'checkers', 'helper.js'));
  const before = new Map(await moduleGraph(dir, ['entry.js']));
  assert.ok(before.has('shared/dict.js'), 'the import inside the symlinked helper resolves against the real file, not the link');
  assert.ok(!before.has('checkers/dict.js'), 'it must not resolve against the link path (that file does not exist)');
  await writeFile(join(dir, 'shared', 'dict.js'), 'export const dict = 2;\n');
  const after = new Map(await moduleGraph(dir, ['entry.js']));
  assert.notEqual(after.get('shared/dict.js'), before.get('shared/dict.js'), 'editing the real dict.js changes the digest input');
});

test('C0: a missing file reached through a static import, not just a missing entry, fails closed with PACK_FILE_MISSING', async () => {
  const dir = await tempDir('folio-graph-missing-');
  await writeFiles(dir, { 'entry.js': "import './real.js';\n", 'real.js': "import './nope.js';\nexport const v = 1;\n" });
  await assert.rejects(moduleGraph(dir, ['entry.js']), (error) => {
    assert.equal(error.code, 'PACK_FILE_MISSING');
    assert.equal(error.details.path, 'nope.js');
    assert.equal(error.details.from, 'real.js');
    return true;
  });
});

// --- fix round 2: 재검토가 찾은 ReDoS(지수 폭발 되짚기) 회귀 방지 ---

const REDOS_GAPS = {
  '줄 주석 40줄, 뒤에 따옴표 없음': '// x\n'.repeat(40),
  '블록 주석 300개 연달아, 뒤에 따옴표 없음': '/* x */'.repeat(300),
};

test('C0: a long run of comments after from/import with no specifier resolves well under a second, not exponentially (ReDoS regression)', async () => {
  for (const [label, gap] of Object.entries(REDOS_GAPS)) {
    const dir = await tempDir('folio-graph-redos-');
    await writeFiles(dir, { 'entry.js': `import ${gap}\nconst z = 1;\n` });
    const start = Date.now();
    const graph = new Map(await moduleGraph(dir, ['entry.js']));
    assert.ok(Date.now() - start < 1000, `${label}: took ${Date.now() - start}ms`);
    assert.deepEqual([...graph.keys()], ['entry.js']);
  }
});

test('C0: real code between two comments breaks the from/import gap, so a specifier only reachable by skipping over it is not picked up (over-match regression)', async () => {
  const dir = await tempDir('folio-graph-overmatch-');
  await writeFiles(dir, {
    'entry.js': "from /* a */ code /* b */ './x.js'\nimport './real.js';\n",
    'real.js': 'export const v = 1;\n',
  });
  const graph = new Map(await moduleGraph(dir, ['entry.js']));
  assert.ok(!graph.has('x.js'), "'code' between the two comments is not part of the gap, so './x.js' (which does not even exist) must not be treated as an import");
  assert.ok(graph.has('real.js'), 'the real import right after must still be found');
});
