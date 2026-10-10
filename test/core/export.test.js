import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { readAssetFile } from '../../core/view/asset-file.js';
import { exportWork, checkExport } from '../../core/export/export-work.js';
import { epubZip, crc32 } from '../../core/export/zip.js';
import { assertStaticSvg } from '../../core/export/svg.js';
import { xml } from '../../core/export/text.js';
import { exportFixture, sourceSnapshot, SVG, CLOCK, BODY } from '../support/export-work.js';
import { editYaml } from '../support/recheck.js';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createRunner } from '../../core/run/runner.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { stringifyYaml } from '../../core/util/yaml.js';
const json = async (path) => JSON.parse(await fs.readFile(path, 'utf8'));
function entries(bytes) {
  const out = new Map(); let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const method = bytes.readUInt16LE(at + 8), size = bytes.readUInt32LE(at + 18), length = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + length).toString(), start = at + 30 + length + extra;
    const packed = bytes.subarray(start, start + size), raw = method === 0 ? packed : inflateRawSync(packed);
    assert.equal(crc32(raw), bytes.readUInt32LE(at + 14)); out.set(name, raw); at = start + size;
  }
  return out;
}
test('한국어 EPUB 초안은 파일 안에도 검토 대기 상태를 표시한다', async (t) => {
  const f = await exportFixture(t);
  const output = await exportWork({ root: f.root, output: f.output('draft-ko'), format: 'epub', language: 'ko' });
  const files = entries(await fs.readFile(join(output.output, 'book.epub')));
  assert.match(files.get('OEBPS/book.xhtml').toString(), /class="publication-draft">검토용 초안/);
  assert.match(files.get('OEBPS/nav.xhtml').toString(), /<h1>목차<\/h1>/);
  assert.ok(output.warnings.some(w => w.code === 'EXPORT_UNVERIFIED'));
});
test('웹은 원고/기록장을 바꾸지 않고 블록·각주·자료·그림·선택지를 안전하게 출판한다', async (t) => {
  const f = await exportFixture(t), before = await sourceSnapshot(f.root);
  const checked = await checkExport({ root: f.root, now: CLOCK }); assert.equal(checked.nodes, 4); assert.equal(checked.assets, 1);
  const out = await exportWork({ root: f.root, output: f.output('web'), now: CLOCK }); assert.equal(out.status, 'exported');
  const html = await fs.readFile(join(out.output, 'index.html'), 'utf8'), manifest = await json(join(out.output, 'manifest.json'));
  assert.ok(html.includes('그림 1.1')); assert.ok(html.includes('href="#block-fig-test"')); assert.ok(html.includes('href="#note-node-0-note"'));
  assert.ok(html.includes('href="#source-ref"')); assert.ok(html.includes('href="#node-1"'));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(html.includes('![[asset:missing]]')); assert.equal(manifest.receipt, false); assert.equal(manifest.assets[0].id, 'cover');
  assert.ok(manifest.warnings.some((w) => w.code === 'EXPORT_UNVERIFIED'));
  assert.deepEqual(await sourceSnapshot(f.root), before);
});
test('실제 커밋 결속과 이후 손수정은 기존 영수증을 바꾸지 않고 manifest에 드러난다', async (t) => {
  const f = await exportFixture(t), packs = await loadBuiltinPacks(), host = createFakeHost({ drafts: { a: BODY } });
  await driveToEnd(() => createRunner({ root: f.root, packs }), host, { start: { node: 'a' }, until: (o) => o.status === 'done' });
  let work = await openWork(f.root); await updateNode(f.root, work.tree.nodes.get('a'), { body: BODY + '손수정 합성 문장.\n' });
  const before = await sourceSnapshot(f.root), out = await exportWork({ root: f.root, output: f.output('changed'), now: CLOCK });
  const manifest = await json(join(out.output, 'manifest.json')), a = manifest.nodes.find((n) => n.id === 'a');
  assert.ok(a.commitReceiptId); assert.notEqual(a.bodyHash, a.committedHash); assert.ok(manifest.warnings.some((w) => w.code === 'EXPORT_BODY_CHANGED' && w.nodeId === 'a'));
  assert.deepEqual(await sourceSnapshot(f.root), before);
});
test('EPUB은 첫 비압축 mimetype·CRC·nav/spine·UTF-8 XML과 결정적 바이트를 제공한다', async (t) => {
  const f = await exportFixture(t), before = await sourceSnapshot(f.root);
  const a = await exportWork({ root: f.root, output: f.output('epub-a'), format: 'epub', now: CLOCK });
  const b = await exportWork({ root: f.root, output: f.output('epub-b'), format: 'epub', now: CLOCK });
  const bytes = await fs.readFile(join(a.output, 'book.epub')); assert.deepEqual(bytes, await fs.readFile(join(b.output, 'book.epub')));
  assert.equal(bytes.readUInt16LE(8), 0); assert.equal(bytes.readUInt16LE(28), 0); assert.equal(bytes.subarray(30, 38).toString(), 'mimetype');
  const files = entries(bytes); assert.equal(files.get('mimetype').toString(), 'application/epub+zip');
  const opf = files.get('OEBPS/package.opf').toString(); assert.ok(opf.includes('properties="nav"')); assert.ok(opf.includes('properties="svg"')); assert.ok(opf.includes('<itemref idref="book"/>'));
  assert.ok(opf.includes('2026-10-02T03:04:05Z')); assert.ok(files.get('OEBPS/nav.xhtml').toString().includes('book.xhtml#node-0'));
  assert.ok(files.get('OEBPS/book.xhtml').toString().includes('&lt;script&gt;'));
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.deepEqual(await sourceSnapshot(f.root), before);
});
test('지면 웹은 펼침/인쇄를 만들고 EPUB은 reflow 경고와 지면 전용 그림을 보존한다', async (t) => {
  const f = await exportFixture(t);
  await fs.writeFile(join(f.root, 'layout.yaml'), stringifyYaml({ version: 1, page: { widthMm: 100, heightMm: 100, marginMm: 5 }, pages: [
    { id: 'left', spreadId: 'pair', side: 'left', items: [{ nodeId: 'a', xMm: 10, yMm: 10, widthMm: 80, heightMm: 80, maxChars: 1 }] },
    { id: 'right', spreadId: 'pair', side: 'right', items: [{ assetId: 'cover', xMm: 10, yMm: 10, widthMm: 80, heightMm: 80, fit: 'cover' }] },
  ] }));
  const checked = await checkExport({ root: f.root, now: CLOCK }); assert.ok(checked.warnings.some((w) => w.code === 'LAYOUT_TEXT_BUDGET')); assert.ok(checked.warnings.some((w) => w.code === 'LAYOUT_UNPLACED'));
  const web = await exportWork({ root: f.root, output: f.output('layout'), now: CLOCK });
  assert.ok((await fs.readFile(join(web.output, 'index.html'), 'utf8')).includes('class="spread"')); assert.ok((await fs.readFile(join(web.output, 'style.css'), 'utf8')).includes('@page{size:100mm 100mm;margin:0}'));
  const epub = await exportWork({ root: f.root, output: f.output('layout-epub'), format: 'epub', now: CLOCK }); assert.ok(epub.warnings.some((w) => w.code === 'EPUB_LAYOUT_REFLOW'));
  assert.ok(entries(await fs.readFile(join(epub.output, 'book.epub'))).get('OEBPS/book.xhtml').toString().includes('지면 그림'));
});
test('판본 누락은 실패하고 모든 선택 판본 원고는 main과 섞이지 않는다', async (t) => {
  const f = await exportFixture(t); await editYaml(f.root, (config) => { config.variants = ['main', { id: 'en', kind: 'translation', lang: 'en' }]; });
  await assert.rejects(exportWork({ root: f.root, variant: 'en', output: f.output('missing'), now: CLOCK }), { code: 'EXPORT_VARIANT_MISSING' });
  await fs.mkdir(join(f.root, 'variants', 'en'), { recursive: true });
  for (const id of ['a', 'b', 'c', 'z']) await fs.writeFile(join(f.root, 'variants', 'en', `${id}.md`), `---\ntitle: English ${id}\n---\nEnglish synthetic ${id}.\n`);
  const out = await exportWork({ root: f.root, variant: 'en', output: f.output('en'), now: CLOCK });
  const html = await fs.readFile(join(out.output, 'index.html'), 'utf8'); assert.ok(html.includes('lang="en"')); assert.ok(html.includes('English synthetic z')); assert.ok(!html.includes('합성 제목'));
});
test('출력 충돌/작품 내부 별칭과 안전하지 않은 그림·XML을 거부한다', async (t) => {
  const f = await exportFixture(t); await fs.mkdir(f.output('exists')); await fs.writeFile(join(f.output('exists'), 'user.txt'), '사용자 파일');
  await assert.rejects(exportWork({ root: f.root, output: f.output('exists'), now: CLOCK }), { code: 'EXPORT_ROOT_EXISTS' });
  assert.equal(await fs.readFile(join(f.output('exists'), 'user.txt'), 'utf8'), '사용자 파일');
  await fs.symlink(f.root, f.output('alias')); await assert.rejects(exportWork({ root: f.root, output: join(f.output('alias'), 'new'), now: CLOCK }), { code: 'EXPORT_OUTPUT_INVALID' });
  await fs.writeFile(join(f.root, 'assets', 'cover.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
  await assert.rejects(exportWork({ root: f.root, output: f.output('unsafe'), now: CLOCK }), { code: 'EXPORT_SVG_UNSAFE' });
  for (const bad of ['\x01', '\ud800']) assert.throws(() => xml(bad), { code: 'EXPORT_TEXT_INVALID' });
  assert.doesNotThrow(() => xml('합성🙂\n')); assert.throws(() => epubZip(new Map([['mimetype', Buffer.from('wrong')]])), { code: 'EXPORT_ZIP_INVALID' });
  assert.doesNotThrow(() => assertStaticSvg(Buffer.from(SVG)));
  await fs.writeFile(f.output('external.svg'), SVG); await fs.rm(join(f.root, 'assets', 'cover.svg'));
  await fs.link(f.output('external.svg'), join(f.root, 'assets', 'cover.svg'));
  assert.equal((await readAssetFile(f.root, 'cover')).type, 'image/svg+xml');
  await assert.rejects(exportWork({ root: f.root, output: f.output('hardlink'), now: CLOCK }), { code: 'ASSET_FILE_UNAVAILABLE' });
  for (const fragment of ['<script/>', '<foreignObject/>', '<use href="https://example.test/x"/>', '<use href="&#104;ttps://example.test/x"/>', '<rect style="fill:url(https://example.test/x)"/>', '<!DOCTYPE svg>', '<g><rect/></svg>', '<text>&bad</text>', '<rect x="1"y="2"/>', '<use xlink:href="#id"/>']) {
    const bytes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${fragment}</svg>`); assert.throws(() => assertStaticSvg(bytes), { code: 'EXPORT_SVG_UNSAFE' });
  }
});
test('게시 실패 정리는 타인이 넣은 결과 파일을 지우지 않는다', async (t) => {
  const f = await exportFixture(t); let first = true;
  const injected = { ...fs, async link(from, to) { await fs.link(from, to); if (first) { first = false; await fs.writeFile(join(f.output('failed'), 'foreign.txt'), '보존'); throw new Error('injected'); } } };
  await assert.rejects(exportWork({ root: f.root, output: f.output('failed'), now: CLOCK, fs: injected }), (error) => error.code === 'EXPORT_PUBLISH_FAILED' && error.details.cleanupPending);
  assert.equal(await fs.readFile(join(f.output('failed'), 'foreign.txt'), 'utf8'), '보존');
  await assert.rejects(fs.stat(join(f.output('failed'), 'manifest.json')), { code: 'ENOENT' });
});

test('빈 작품·빈 제목은 출판하지 않고 장면의 빈 제목은 id로 목차를 만든다', async (t) => {
  const f = await exportFixture(t), work = await openWork(f.root);
  await updateNode(f.root, work.tree.nodes.get('a'), { data: { title: '   ' } });
  const out = await exportWork({ root: f.root, format: 'epub', output: f.output('blank-node-title'), now: CLOCK });
  assert.ok(entries(await fs.readFile(join(out.output, 'book.epub'))).get('OEBPS/nav.xhtml').toString().includes('book.xhtml#node-0">a</a>'));
  await editYaml(f.root, (config) => { config.title = ' '; });
  await assert.rejects(checkExport({ root: f.root, now: CLOCK }), { code: 'EXPORT_TITLE_INVALID' });
  await editYaml(f.root, (config) => { config.title = '합성 작품'; });
  await fs.rm(join(f.root, 'tree'), { recursive: true, force: true });
  await assert.rejects(exportWork({ root: f.root, output: f.output('empty'), now: CLOCK }), { code: 'EXPORT_EMPTY' });
});

test('CRLF 본문은 웹·EPUB에서 제목·문단·코드를 렌더링하고 원고 바이트를 보존한다', async (t) => {
  const f = await exportFixture(t), work = await openWork(f.root);
  const body = '# CRLF 제목\r\n문단 합성 문장.\r\n```\r\n코드 합성 문장.\r\n```\r\n';
  await updateNode(f.root, work.tree.nodes.get('a'), { body });
  const before = await sourceSnapshot(f.root);
  const web = await exportWork({ root: f.root, output: f.output('crlf-web'), now: CLOCK });
  const html = await fs.readFile(join(web.output, 'index.html'), 'utf8');
  assert.ok(html.includes('<h1>CRLF 제목</h1>'));
  assert.ok(html.includes('<p>문단 합성 문장.</p>'));
  assert.ok(html.includes('<pre><code>코드 합성 문장.</code></pre>'));
  assert.ok(!html.includes('\r'));
  const epub = await exportWork({ root: f.root, output: f.output('crlf-epub'), format: 'epub', now: CLOCK });
  const book = entries(await fs.readFile(join(epub.output, 'book.epub'))).get('OEBPS/book.xhtml').toString();
  assert.ok(book.includes('<h1>CRLF 제목</h1>'));
  assert.ok(book.includes('<p>문단 합성 문장.</p>'));
  assert.ok(book.includes('<pre><code>코드 합성 문장.</code></pre>'));
  assert.ok(!book.includes('\r'));
  assert.deepEqual(await sourceSnapshot(f.root), before);
});

test('SVG의 prototype 속성 이름 엔티티는 XML에서 선언되지 않아 거부한다', () => {
  for (const entity of ['constructor', 'toString', '__proto__']) {
    const bytes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><text>&${entity};</text></svg>`);
    assert.throws(() => assertStaticSvg(bytes), { code: 'EXPORT_SVG_UNSAFE' });
  }
});

test('SVG는 XML 숫자 개체와 공백 문법을 지키고 금지 문자를 거부한다', () => {
  for (const valid of ['&#x41;', '&#xAf;', '&#65;']) {
    assert.doesNotThrow(() => assertStaticSvg(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><text>${valid}</text></svg>`)));
  }
  for (const invalid of [
    '<text>&#X41;</text>',
    '<rect\u000bwidth="1"/>',
    '<rect width\u000b="1"/>',
    '<text>합성\u000b본문</text>',
  ]) {
    assert.throws(() => assertStaticSvg(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${invalid}</svg>`)), { code: 'EXPORT_SVG_UNSAFE' });
  }
});

test('유니코드 줄 구분자가 있는 제목은 check·웹·EPUB에서 렌더링되고 원문 바이트를 보존한다', async (t) => {
  const f = await exportFixture(t), work = await openWork(f.root);
  const body = '# 합성\u2028제목\n## 다른\u2029제목\n';
  await updateNode(f.root, work.tree.nodes.get('a'), { body });
  const before = await sourceSnapshot(f.root);
  assert.equal((await checkExport({ root: f.root, now: CLOCK })).nodes, 4);
  const web = await exportWork({ root: f.root, output: f.output('unicode-web'), now: CLOCK });
  const html = await fs.readFile(join(web.output, 'index.html'), 'utf8');
  assert.ok(html.includes('<h1>합성\u2028제목</h1>'));
  assert.ok(html.includes('<h2>다른\u2029제목</h2>'));
  const epub = await exportWork({ root: f.root, output: f.output('unicode-epub'), format: 'epub', now: CLOCK });
  const book = entries(await fs.readFile(join(epub.output, 'book.epub'))).get('OEBPS/book.xhtml').toString();
  assert.ok(book.includes('<h1>합성\u2028제목</h1>'));
  assert.ok(book.includes('<h2>다른\u2029제목</h2>'));
  assert.deepEqual(await sourceSnapshot(f.root), before);
});
