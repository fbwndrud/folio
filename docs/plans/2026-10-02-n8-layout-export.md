# N8 지면·내보내기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원고와 기록장을 바꾸지 않고 지면·웹·EPUB 출판물을 만든다.

**Architecture:** core/layout은 순수 검증, core/export는 선택 판본·블록·그림의 출판 투영/형식화/게시를 소유한다. 기존 안전 그림 읽기와 배타 게시를 재사용한다.

**Tech Stack:** Node24, ESM/checkJs, 기존 yaml과 node:zlib, node:test. 새 의존성 없음.

**Spec:** docs/plans/2026-10-02-n8-layout-export-design.md; 2026-10-02-n8-layout-export-rulings.md

## Global Constraints

- 합성 fixture만. 실제 작품·생성 결과물을 커밋하지 않는다.
- 모듈 책임 하나, JS 300줄 이하, runner 250줄 이하.
- core는 모델·네트워크·런타임 dynamic import를 부르지 않는다. root 런타임 의존성 추가 금지.
- hash·영수증·hard·추가만 되는 기록장·자기검토·soft 비자동수정 잠금은 설정으로 끌 수 없다.
- 원고·기록장·설정·index를 내보내기가 변경하지 않는다. 결과는 작품 밖의 새로운 폴더만.
- 판본 누락을 main으로 채우지 않는다. 부적절한 그림을 조용히 생략하지 않는다.
- 페이지 500, 항목/잎/그림/파일 5000, 전체 출력 64MiB, 그림 20MiB, 지면 진단 200, layout.yaml 1MiB.
- PDF는 브라우저 인쇄, EPUB은 reflow. D9 추천 A 가정이며 침묵을 승인으로 간주하지 않는다.
- 한국어 안내/주석, 영어 식별자. /path/to/folio 및 /path/to/vibelore 수정 금지.
- 사용자 지시에 따라 계획·시험·구현·검토·J5 로컬 main 통합까지 진행한다. 원격 공개하지 않는다.


## 계획 실행·검토

각 Task 패치는 완전한 코드다. 테스트 차이를 먼저 적용해 RED, 구현 차이를 적용해 GREEN. 백틱 네 개의 diff 블록만 추출하고 안쪽 Markdown/JSON 블록이나 diff의 +를 망가뜨리지 말고 git apply한다. 계획 복사본에서 코드를 가져오지 않는다. 1→2→3 순서, 동시에 구현자 한 명, 태스크별 독립 spec/quality 검토, 최종 전체 검토와 필요 시 한 번의 최종 수정·재검토를 수행한다. 검토자는 보고된 동일 suite를 반복하지 않는다.

## Task 1: 읽기 전용 지면 검증

**Files:**
- Create: `core/layout/read.js`
- Create: `core/layout/validate.js`
- Create: `test/core/layout.test.js`

**Interfaces:** 소비: work.tree.nodes와 work.assets. 생산: validateLayout(input,work)→{layout,problems}, readLayout(root,work)→{layout|null,problems}, LAYOUT_LIMITS. 경고는 입력을 고치지 않는다.

- [x] **Step 1: Apply the complete test patch.**

````diff
diff --git a/test/core/layout.test.js b/test/core/layout.test.js
new file mode 100644
--- /dev/null
+++ b/test/core/layout.test.js
@@ -0,0 +1,42 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
+import { join } from 'node:path';
+import { tmpdir } from 'node:os';
+import { validateLayout } from '../../core/layout/validate.js';
+import { readLayout } from '../../core/layout/read.js';
+const work = { tree: { nodes: new Map([['a', { id: 'a', kind: 'leaf', body: '합성 원고' }], ['branch', { kind: 'branch' }]]) }, assets: new Map([['pic', {}]]) };
+const item = () => ({ nodeId: 'a', xMm: 10, yMm: 10, widthMm: 80, heightMm: 80 });
+const layout = () => ({ version: 1, page: { widthMm: 100, heightMm: 100, marginMm: 5 }, pages: [{ id: 'p1', items: [item()] }] });
+test('지면은 바꾸지 않고 분량·중첩·영역 경고와 펼침을 검증한다', () => {
+  const input = layout(); input.pages[0].items[0].maxChars = 1;
+  input.pages[0].items.push({ assetId: 'pic', xMm: 20, yMm: 20, widthMm: 90, heightMm: 90 });
+  const before = structuredClone(input), out = validateLayout(input, work);
+  assert.deepEqual(input, before); assert.equal(out.layout, input);
+  for (const code of ['LAYOUT_TEXT_BUDGET', 'LAYOUT_OVERLAP', 'LAYOUT_OUTSIDE_PAGE', 'LAYOUT_MARGIN']) assert.ok(out.problems.some((p) => p.code === code));
+  input.pages[0].spreadId = 'spread'; input.pages[0].side = 'left';
+  assert.throws(() => validateLayout(input, work), { code: 'LAYOUT_INVALID' });
+  input.pages.push({ id: 'p2', spreadId: 'spread', side: 'right', items: [] });
+  assert.equal(validateLayout(input, work).layout.pages.length, 2);
+});
+test('형식·숫자·대상·중복·상한 오류는 fail closed다', () => {
+  for (const mutate of [
+    (x) => { x.page.widthMm = NaN; }, (x) => { x.page.marginMm = 50; },
+    (x) => { x.pages[0].items[0].nodeId = 'branch'; }, (x) => { x.pages[0].items[0].assetId = 'pic'; },
+    (x) => { x.pages[0].items[0].widthMm = 0; }, (x) => { x.pages[0].items.push(item()); },
+    (x) => { x.unknown = true; }, (x) => { x.pages = Array.from({ length: 501 }, (_, i) => ({ id: `p${i}`, items: [] })); },
+    (x) => { x.pages[0].items = Array.from({ length: 5001 }, item); },
+  ]) { const input = layout(); mutate(input); assert.throws(() => validateLayout(input, work), { code: 'LAYOUT_INVALID' }); }
+  const input = layout(); input.pages[0].items = Array.from({ length: 30 }, (_, i) => ({ assetId: 'pic', xMm: i, yMm: 0, widthMm: 100, heightMm: 100 }));
+  const out = validateLayout(input, work); assert.equal(out.problems.length, 200); assert.equal(out.problems.at(-1).code, 'LAYOUT_PROBLEMS_TRUNCATED');
+});
+test('없는 지면은 선택 사항이고 링크·큰 파일·깨진 YAML을 읽지 않는다', async () => {
+  const root = await mkdtemp(join(tmpdir(), 'folio-layout-')); const path = join(root, 'layout.yaml');
+  try {
+    assert.deepEqual(await readLayout(root, work), { layout: null, problems: [] });
+    await writeFile(join(root, 'outside'), 'version: 1'); await symlink(join(root, 'outside'), path);
+    await assert.rejects(readLayout(root, work), { code: 'LAYOUT_INVALID' }); await rm(path);
+    await writeFile(path, 'a'.repeat(1048577)); await assert.rejects(readLayout(root, work), { code: 'LAYOUT_INVALID' });
+    await writeFile(path, 'version: [broken'); await assert.rejects(readLayout(root, work), { code: 'LAYOUT_INVALID' });
+  } finally { await rm(root, { recursive: true, force: true }); }
+});
````

- [x] **Step 2: Run RED.**

```bash
node --test test/core/layout.test.js
```

Expected: FAIL. 새 모듈/도구/기능이 없거나 새 목록 기대값과 기존 값이 다르다.

- [x] **Step 3: Apply the complete implementation patch.**

````diff
diff --git a/core/layout/read.js b/core/layout/read.js
new file mode 100644
--- /dev/null
+++ b/core/layout/read.js
@@ -0,0 +1,32 @@
+import { constants } from 'node:fs';
+import { open } from 'node:fs/promises';
+import { join } from 'node:path';
+import { FolioError } from '../errors.js';
+import { parseYaml } from '../util/yaml.js';
+import { validateLayout, LAYOUT_LIMITS } from './validate.js';
+
+/** 지면 파일 하나만 제한된 크기로 읽는다. 링크·특수 파일·하드 링크를 따라가지 않는다. */
+export async function readLayout(root, work) {
+  let handle;
+  try { handle = await open(join(root, 'layout.yaml'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
+  catch (error) {
+    if (error.code === 'ENOENT') return { layout: null, problems: [] };
+    throw new FolioError('LAYOUT_INVALID', '지면 파일을 안전하게 읽을 수 없다');
+  }
+  try {
+    const stat = await handle.stat();
+    if (!stat.isFile() || stat.nlink !== 1 || stat.size > LAYOUT_LIMITS.bytes) throw new FolioError('LAYOUT_INVALID', '지면은 1MiB 이하의 보통 파일이어야 한다');
+    const buffer = Buffer.alloc(LAYOUT_LIMITS.bytes + 1);
+    let offset = 0;
+    while (offset < buffer.length) {
+      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
+      if (!bytesRead) break;
+      offset += bytesRead;
+    }
+    if (offset > LAYOUT_LIMITS.bytes) throw new FolioError('LAYOUT_INVALID', '지면 파일이 1MiB를 넘었다');
+    let input;
+    try { input = parseYaml(buffer.subarray(0, offset).toString('utf8')); }
+    catch { throw new FolioError('LAYOUT_INVALID', '지면 YAML이 잘못됐다'); }
+    return validateLayout(input, work);
+  } finally { await handle.close(); }
+}
diff --git a/core/layout/validate.js b/core/layout/validate.js
new file mode 100644
--- /dev/null
+++ b/core/layout/validate.js
@@ -0,0 +1,57 @@
+import { FolioError } from '../errors.js';
+import { isPlainObject } from '../util/plain.js';
+
+export const LAYOUT_LIMITS = Object.freeze({ pages: 500, items: 5000, problems: 200, bytes: 1048576 });
+const keys = (value, allowed) => isPlainObject(value) && Object.keys(value).every((key) => allowed.includes(key));
+const id = (value) => typeof value === 'string' && /^[A-Za-z0-9][\w-]{0,79}$/.test(value);
+const number = (value) => typeof value === 'number' && Number.isFinite(value);
+const invalid = (field) => { throw new FolioError('LAYOUT_INVALID', `지면 형식이 잘못됐다: ${field}`, { field }); };
+
+/** 작가가 적은 지면은 그대로 돌려준다. 배치·분량 경고가 좌표나 원고를 바꾸지 않는다. */
+export function validateLayout(input, work) {
+  if (!keys(input, ['version', 'page', 'pages']) || input.version !== 1) invalid('version');
+  const page = input.page;
+  if (!keys(page, ['widthMm', 'heightMm', 'marginMm'])) invalid('page');
+  if (![page.widthMm, page.heightMm].every((v) => number(v) && v >= 20 && v <= 1000)) invalid('page.size');
+  if (!number(page.marginMm) || page.marginMm < 0 || page.marginMm * 2 >= Math.min(page.widthMm, page.heightMm)) invalid('page.marginMm');
+  if (!Array.isArray(input.pages) || !input.pages.length || input.pages.length > LAYOUT_LIMITS.pages) invalid('pages');
+  const ids = new Set(), placed = new Set(), spreads = new Map(), problems = [];
+  let count = 0, truncated = false;
+  const add = (problem) => {
+    if (problems.length < LAYOUT_LIMITS.problems) problems.push({ severity: 'advisory', ...problem });
+    else truncated = true;
+  };
+  for (const sheet of input.pages) {
+    if (!keys(sheet, ['id', 'spreadId', 'side', 'items']) || !id(sheet.id) || ids.has(sheet.id)) invalid('pages.id');
+    ids.add(sheet.id);
+    if (sheet.spreadId !== undefined || sheet.side !== undefined) {
+      if (!id(sheet.spreadId) || !['left', 'right'].includes(sheet.side)) invalid('pages.spread');
+      if (!spreads.has(sheet.spreadId)) spreads.set(sheet.spreadId, []);
+      spreads.get(sheet.spreadId).push(sheet.side);
+    }
+    if (!Array.isArray(sheet.items) || (count += sheet.items.length) > LAYOUT_LIMITS.items) invalid('pages.items');
+    for (const [index, item] of sheet.items.entries()) {
+      if (!keys(item, ['nodeId', 'assetId', 'xMm', 'yMm', 'widthMm', 'heightMm', 'fit', 'maxChars'])) invalid('item');
+      if ((item.nodeId === undefined) === (item.assetId === undefined)) invalid('item.target');
+      if (![item.xMm, item.yMm].every((v) => number(v) && v >= 0) || ![item.widthMm, item.heightMm].every((v) => number(v) && v > 0)) invalid('item.rect');
+      if (item.fit !== undefined && !['contain', 'cover'].includes(item.fit)) invalid('item.fit');
+      if (item.maxChars !== undefined && (!Number.isSafeInteger(item.maxChars) || item.maxChars < 1 || item.nodeId === undefined)) invalid('item.maxChars');
+      if (item.nodeId !== undefined) {
+        if (typeof item.nodeId !== 'string' || work.tree.nodes.get(item.nodeId)?.kind !== 'leaf' || placed.has(item.nodeId)) invalid('item.nodeId');
+        placed.add(item.nodeId);
+        if (item.maxChars && [...work.tree.nodes.get(item.nodeId).body].length > item.maxChars) add({ code: 'LAYOUT_TEXT_BUDGET', pageId: sheet.id, index, nodeId: item.nodeId, maxChars: item.maxChars });
+      } else if (typeof item.assetId !== 'string' || !work.assets.has(item.assetId)) invalid('item.assetId');
+      const right = item.xMm + item.widthMm, bottom = item.yMm + item.heightMm;
+      if (right > page.widthMm || bottom > page.heightMm) add({ code: 'LAYOUT_OUTSIDE_PAGE', pageId: sheet.id, index });
+      if (item.xMm < page.marginMm || item.yMm < page.marginMm || right > page.widthMm - page.marginMm || bottom > page.heightMm - page.marginMm) add({ code: 'LAYOUT_MARGIN', pageId: sheet.id, index });
+      for (let j = 0; j < index; j += 1) {
+        const other = sheet.items[j];
+        if (item.xMm < other.xMm + other.widthMm && other.xMm < right && item.yMm < other.yMm + other.heightMm && other.yMm < bottom) add({ code: 'LAYOUT_OVERLAP', pageId: sheet.id, items: [j, index] });
+      }
+    }
+  }
+  for (const sides of spreads.values()) if (sides.length !== 2 || !sides.includes('left') || !sides.includes('right')) invalid('pages.spreadPair');
+  for (const node of work.tree.nodes.values()) if (node.kind === 'leaf' && !placed.has(node.id)) add({ code: 'LAYOUT_UNPLACED', nodeId: node.id });
+  if (truncated) problems[LAYOUT_LIMITS.problems - 1] = { severity: 'advisory', code: 'LAYOUT_PROBLEMS_TRUNCATED' };
+  return { layout: input, problems };
+}
````

- [x] **Step 4: Run GREEN and validate.**

```bash
node --test test/core/layout.test.js
npm run lint
npm run typecheck
```

Expected: PASS. 새/변경 JS 300줄 이하, 기존 잠금과 읽기 전용 계약을 자가 검토한다.

- [x] **Step 5: Commit and report.**

```bash
git add core/layout/read.js core/layout/validate.js test/core/layout.test.js
git commit -m "feat: N8 task 1 layout validation"
```

태스크 보고 파일에 RED/GREEN 명령·실제 결과·exit·커밋·자가 검토·우려를 기록한다.

## Task 2: 안전한 웹·EPUB 출판과 게시

**Files:**
- Create: `core/export/assets.js`
- Create: `core/export/epub.js`
- Create: `core/export/export-work.js`
- Create: `core/export/publish.js`
- Create: `core/export/render.js`
- Create: `core/export/source.js`
- Create: `core/export/svg.js`
- Create: `core/export/text.js`
- Create: `core/export/web.js`
- Create: `core/export/zip.js`
- Modify: `core/import/publish-work.js`
- Modify: `core/store/work.js`
- Create: `core/util/publish-tree.js`
- Modify: `core/view/asset-file.js`
- Create: `test/core/export.test.js`
- Create: `test/support/export-work.js`

**Interfaces:** 소비: Task1 readLayout; 기존 N3 blockCatalog, N6 lastCommits/variantSpecs, M6 readAssetFile. 생산: exportWork({root,output,format?,variant?,now?,language?,fs?})와 checkExport({root,format?,variant?,language?,now?}); publishTree(temp,target,{fs?,marker?,prefix?})의 IMPORT 기본값은 유지한다. openWork hashAssetFiles 기본true, readAssetFile optional assets catalog 기본재조회·singleLink 기본false; N8은 true를 고정한다.

- [x] **Step 1: Apply the complete test patch.**

````diff
diff --git a/test/core/export.test.js b/test/core/export.test.js
new file mode 100644
--- /dev/null
+++ b/test/core/export.test.js
@@ -0,0 +1,120 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import * as fs from 'node:fs/promises';
+import { join } from 'node:path';
+import { inflateRawSync } from 'node:zlib';
+import { readAssetFile } from '../../core/view/asset-file.js';
+import { exportWork, checkExport } from '../../core/export/export-work.js';
+import { epubZip, crc32 } from '../../core/export/zip.js';
+import { assertStaticSvg } from '../../core/export/svg.js';
+import { xml } from '../../core/export/text.js';
+import { exportFixture, sourceSnapshot, SVG, CLOCK, BODY } from '../support/export-work.js';
+import { editYaml } from '../support/recheck.js';
+import { openWork } from '../../core/store/work.js';
+import { updateNode } from '../../core/store/tree.js';
+import { loadBuiltinPacks } from '../../packs/index.js';
+import { createRunner } from '../../core/run/runner.js';
+import { createFakeHost, driveToEnd } from '../support/fake-host.js';
+import { stringifyYaml } from '../../core/util/yaml.js';
+const json = async (path) => JSON.parse(await fs.readFile(path, 'utf8'));
+function entries(bytes) {
+  const out = new Map(); let at = 0;
+  while (bytes.readUInt32LE(at) === 0x04034b50) {
+    const method = bytes.readUInt16LE(at + 8), size = bytes.readUInt32LE(at + 18), length = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28);
+    const name = bytes.subarray(at + 30, at + 30 + length).toString(), start = at + 30 + length + extra;
+    const packed = bytes.subarray(start, start + size), raw = method === 0 ? packed : inflateRawSync(packed);
+    assert.equal(crc32(raw), bytes.readUInt32LE(at + 14)); out.set(name, raw); at = start + size;
+  }
+  return out;
+}
+test('웹은 원고/기록장을 바꾸지 않고 블록·각주·자료·그림·선택지를 안전하게 출판한다', async (t) => {
+  const f = await exportFixture(t), before = await sourceSnapshot(f.root);
+  const checked = await checkExport({ root: f.root, now: CLOCK }); assert.equal(checked.nodes, 4); assert.equal(checked.assets, 1);
+  const out = await exportWork({ root: f.root, output: f.output('web'), now: CLOCK }); assert.equal(out.status, 'exported');
+  const html = await fs.readFile(join(out.output, 'index.html'), 'utf8'), manifest = await json(join(out.output, 'manifest.json'));
+  assert.ok(html.includes('그림 1.1')); assert.ok(html.includes('href="#block-fig-test"')); assert.ok(html.includes('href="#note-node-0-note"'));
+  assert.ok(html.includes('href="#source-ref"')); assert.ok(html.includes('href="#node-1"'));
+  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(html.includes('Content-Security-Policy'));
+  assert.ok(html.includes('![[asset:missing]]')); assert.equal(manifest.receipt, false); assert.equal(manifest.assets[0].id, 'cover');
+  assert.ok(manifest.warnings.some((w) => w.code === 'EXPORT_UNVERIFIED'));
+  assert.deepEqual(await sourceSnapshot(f.root), before);
+});
+test('실제 커밋 결속과 이후 손수정은 기존 영수증을 바꾸지 않고 manifest에 드러난다', async (t) => {
+  const f = await exportFixture(t), packs = await loadBuiltinPacks(), host = createFakeHost({ drafts: { a: BODY } });
+  await driveToEnd(() => createRunner({ root: f.root, packs }), host, { start: { node: 'a' }, until: (o) => o.status === 'done' });
+  let work = await openWork(f.root); await updateNode(f.root, work.tree.nodes.get('a'), { body: BODY + '손수정 합성 문장.\n' });
+  const before = await sourceSnapshot(f.root), out = await exportWork({ root: f.root, output: f.output('changed'), now: CLOCK });
+  const manifest = await json(join(out.output, 'manifest.json')), a = manifest.nodes.find((n) => n.id === 'a');
+  assert.ok(a.commitReceiptId); assert.notEqual(a.bodyHash, a.committedHash); assert.ok(manifest.warnings.some((w) => w.code === 'EXPORT_BODY_CHANGED' && w.nodeId === 'a'));
+  assert.deepEqual(await sourceSnapshot(f.root), before);
+});
+test('EPUB은 첫 비압축 mimetype·CRC·nav/spine·UTF-8 XML과 결정적 바이트를 제공한다', async (t) => {
+  const f = await exportFixture(t), before = await sourceSnapshot(f.root);
+  const a = await exportWork({ root: f.root, output: f.output('epub-a'), format: 'epub', now: CLOCK });
+  const b = await exportWork({ root: f.root, output: f.output('epub-b'), format: 'epub', now: CLOCK });
+  const bytes = await fs.readFile(join(a.output, 'book.epub')); assert.deepEqual(bytes, await fs.readFile(join(b.output, 'book.epub')));
+  assert.equal(bytes.readUInt16LE(8), 0); assert.equal(bytes.readUInt16LE(28), 0); assert.equal(bytes.subarray(30, 38).toString(), 'mimetype');
+  const files = entries(bytes); assert.equal(files.get('mimetype').toString(), 'application/epub+zip');
+  const opf = files.get('OEBPS/package.opf').toString(); assert.ok(opf.includes('properties="nav"')); assert.ok(opf.includes('properties="svg"')); assert.ok(opf.includes('<itemref idref="book"/>'));
+  assert.ok(opf.includes('2026-10-02T03:04:05Z')); assert.ok(files.get('OEBPS/nav.xhtml').toString().includes('book.xhtml#node-0'));
+  assert.ok(files.get('OEBPS/book.xhtml').toString().includes('&lt;script&gt;'));
+  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
+  assert.deepEqual(await sourceSnapshot(f.root), before);
+});
+test('지면 웹은 펼침/인쇄를 만들고 EPUB은 reflow 경고와 지면 전용 그림을 보존한다', async (t) => {
+  const f = await exportFixture(t);
+  await fs.writeFile(join(f.root, 'layout.yaml'), stringifyYaml({ version: 1, page: { widthMm: 100, heightMm: 100, marginMm: 5 }, pages: [
+    { id: 'left', spreadId: 'pair', side: 'left', items: [{ nodeId: 'a', xMm: 10, yMm: 10, widthMm: 80, heightMm: 80, maxChars: 1 }] },
+    { id: 'right', spreadId: 'pair', side: 'right', items: [{ assetId: 'cover', xMm: 10, yMm: 10, widthMm: 80, heightMm: 80, fit: 'cover' }] },
+  ] }));
+  const checked = await checkExport({ root: f.root, now: CLOCK }); assert.ok(checked.warnings.some((w) => w.code === 'LAYOUT_TEXT_BUDGET')); assert.ok(checked.warnings.some((w) => w.code === 'LAYOUT_UNPLACED'));
+  const web = await exportWork({ root: f.root, output: f.output('layout'), now: CLOCK });
+  assert.ok((await fs.readFile(join(web.output, 'index.html'), 'utf8')).includes('class="spread"')); assert.ok((await fs.readFile(join(web.output, 'style.css'), 'utf8')).includes('@page{size:100mm 100mm;margin:0}'));
+  const epub = await exportWork({ root: f.root, output: f.output('layout-epub'), format: 'epub', now: CLOCK }); assert.ok(epub.warnings.some((w) => w.code === 'EPUB_LAYOUT_REFLOW'));
+  assert.ok(entries(await fs.readFile(join(epub.output, 'book.epub'))).get('OEBPS/book.xhtml').toString().includes('지면 그림'));
+});
+test('판본 누락은 실패하고 모든 선택 판본 원고는 main과 섞이지 않는다', async (t) => {
+  const f = await exportFixture(t); await editYaml(f.root, (config) => { config.variants = ['main', { id: 'en', kind: 'translation', lang: 'en' }]; });
+  await assert.rejects(exportWork({ root: f.root, variant: 'en', output: f.output('missing'), now: CLOCK }), { code: 'EXPORT_VARIANT_MISSING' });
+  await fs.mkdir(join(f.root, 'variants', 'en'), { recursive: true });
+  for (const id of ['a', 'b', 'c', 'z']) await fs.writeFile(join(f.root, 'variants', 'en', `${id}.md`), `---\ntitle: English ${id}\n---\nEnglish synthetic ${id}.\n`);
+  const out = await exportWork({ root: f.root, variant: 'en', output: f.output('en'), now: CLOCK });
+  const html = await fs.readFile(join(out.output, 'index.html'), 'utf8'); assert.ok(html.includes('lang="en"')); assert.ok(html.includes('English synthetic z')); assert.ok(!html.includes('합성 제목'));
+});
+test('출력 충돌/작품 내부 별칭과 안전하지 않은 그림·XML을 거부한다', async (t) => {
+  const f = await exportFixture(t); await fs.mkdir(f.output('exists')); await fs.writeFile(join(f.output('exists'), 'user.txt'), '사용자 파일');
+  await assert.rejects(exportWork({ root: f.root, output: f.output('exists'), now: CLOCK }), { code: 'EXPORT_ROOT_EXISTS' });
+  assert.equal(await fs.readFile(join(f.output('exists'), 'user.txt'), 'utf8'), '사용자 파일');
+  await fs.symlink(f.root, f.output('alias')); await assert.rejects(exportWork({ root: f.root, output: join(f.output('alias'), 'new'), now: CLOCK }), { code: 'EXPORT_OUTPUT_INVALID' });
+  await fs.writeFile(join(f.root, 'assets', 'cover.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
+  await assert.rejects(exportWork({ root: f.root, output: f.output('unsafe'), now: CLOCK }), { code: 'EXPORT_SVG_UNSAFE' });
+  for (const bad of ['\x01', '\ud800']) assert.throws(() => xml(bad), { code: 'EXPORT_TEXT_INVALID' });
+  assert.doesNotThrow(() => xml('합성🙂\n')); assert.throws(() => epubZip(new Map([['mimetype', Buffer.from('wrong')]])), { code: 'EXPORT_ZIP_INVALID' });
+  assert.doesNotThrow(() => assertStaticSvg(Buffer.from(SVG)));
+  await fs.writeFile(f.output('external.svg'), SVG); await fs.rm(join(f.root, 'assets', 'cover.svg'));
+  await fs.link(f.output('external.svg'), join(f.root, 'assets', 'cover.svg'));
+  assert.equal((await readAssetFile(f.root, 'cover')).type, 'image/svg+xml');
+  await assert.rejects(exportWork({ root: f.root, output: f.output('hardlink'), now: CLOCK }), { code: 'ASSET_FILE_UNAVAILABLE' });
+  for (const fragment of ['<script/>', '<foreignObject/>', '<use href="https://example.test/x"/>', '<use href="&#104;ttps://example.test/x"/>', '<rect style="fill:url(https://example.test/x)"/>', '<!DOCTYPE svg>', '<g><rect/></svg>', '<text>&bad</text>', '<rect x="1"y="2"/>', '<use xlink:href="#id"/>']) {
+    const bytes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${fragment}</svg>`); assert.throws(() => assertStaticSvg(bytes), { code: 'EXPORT_SVG_UNSAFE' });
+  }
+});
+test('게시 실패 정리는 타인이 넣은 결과 파일을 지우지 않는다', async (t) => {
+  const f = await exportFixture(t); let first = true;
+  const injected = { ...fs, async link(from, to) { await fs.link(from, to); if (first) { first = false; await fs.writeFile(join(f.output('failed'), 'foreign.txt'), '보존'); throw new Error('injected'); } } };
+  await assert.rejects(exportWork({ root: f.root, output: f.output('failed'), now: CLOCK, fs: injected }), (error) => error.code === 'EXPORT_PUBLISH_FAILED' && error.details.cleanupPending);
+  assert.equal(await fs.readFile(join(f.output('failed'), 'foreign.txt'), 'utf8'), '보존');
+  await assert.rejects(fs.stat(join(f.output('failed'), 'manifest.json')), { code: 'ENOENT' });
+});
+
+test('빈 작품·빈 제목은 출판하지 않고 장면의 빈 제목은 id로 목차를 만든다', async (t) => {
+  const f = await exportFixture(t), work = await openWork(f.root);
+  await updateNode(f.root, work.tree.nodes.get('a'), { data: { title: '   ' } });
+  const out = await exportWork({ root: f.root, format: 'epub', output: f.output('blank-node-title'), now: CLOCK });
+  assert.ok(entries(await fs.readFile(join(out.output, 'book.epub'))).get('OEBPS/nav.xhtml').toString().includes('book.xhtml#node-0">a</a>'));
+  await editYaml(f.root, (config) => { config.title = ' '; });
+  await assert.rejects(checkExport({ root: f.root, now: CLOCK }), { code: 'EXPORT_TITLE_INVALID' });
+  await editYaml(f.root, (config) => { config.title = '합성 작품'; });
+  await fs.rm(join(f.root, 'tree'), { recursive: true, force: true });
+  await assert.rejects(exportWork({ root: f.root, output: f.output('empty'), now: CLOCK }), { code: 'EXPORT_EMPTY' });
+});
diff --git a/test/support/export-work.js b/test/support/export-work.js
new file mode 100644
--- /dev/null
+++ b/test/support/export-work.js
@@ -0,0 +1,34 @@
+import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
+import { join } from 'node:path';
+import { tmpdir } from 'node:os';
+import { copyFixture } from './fixtures.js';
+import { openWork } from '../../core/store/work.js';
+import { updateNode } from '../../core/store/tree.js';
+import { stringifyYaml } from '../../core/util/yaml.js';
+import { sha256 } from '../../core/util/hash.js';
+export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f0c75e"/><circle cx="50" cy="50" r="25" fill="#2d5e59"/></svg>';
+export const BODY = '# 합성 제목\n도표 {#fig-test}\n[[block:fig-test]] [^note] [[source:ref]] ![[asset:cover]]\n[^note]: 합성 각주\n<script>alert("x")</script>\n```\n![[asset:missing]] {#fig-code}\n```\n';
+/** 테스트가 소유하는 합성 작품과 외부 결과 부모다. */
+export async function exportFixture(t) {
+  const root = await copyFixture('gamebook-n7'), outside = await mkdtemp(join(tmpdir(), 'folio-export-out-'));
+  if (t) t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
+  await mkdir(join(root, 'assets'), { recursive: true }); await mkdir(join(root, 'sources'), { recursive: true });
+  await writeFile(join(root, 'assets', 'cover.svg'), SVG);
+  await writeFile(join(root, 'assets', 'cover.yaml'), stringifyYaml({ id: 'cover', file: 'cover.svg', brief: { title: '합성 원' } }));
+  await writeFile(join(root, 'sources', 'ref.yaml'), stringifyYaml({ id: 'ref', file: 'ref.txt', title: '합성 자료' }));
+  await writeFile(join(root, 'sources', 'ref.txt'), '합성 자료 문장.');
+  const work = await openWork(root); await updateNode(root, work.tree.nodes.get('a'), { body: BODY });
+  return { root, outside, output: (name) => join(outside, name) };
+}
+export async function sourceSnapshot(root) {
+  const out = {};
+  async function walk(rel) {
+    for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
+      const path = rel ? `${rel}/${entry.name}` : entry.name;
+      if (entry.isDirectory()) await walk(path);
+      else if (entry.isFile()) out[path] = sha256(await readFile(join(root, path)));
+    }
+  }
+  await walk(''); return out;
+}
+export const CLOCK = () => '2026-10-02T03:04:05.678Z';
````

- [x] **Step 2: Run RED.**

```bash
node --test test/core/export.test.js test/core/layout.test.js test/import/*.test.js test/server/import-tool.test.js
```

Expected: FAIL. 새 모듈/도구/기능이 없거나 새 목록 기대값과 기존 값이 다르다.

- [x] **Step 3: Apply the complete implementation patch.**

````diff
diff --git a/core/export/assets.js b/core/export/assets.js
new file mode 100644
--- /dev/null
+++ b/core/export/assets.js
@@ -0,0 +1,27 @@
+import { fencedRanges, maskRanges } from '../util/fences.js';
+import { assetRefsInBody } from '../store/assets.js';
+import { readAssetFile, MAX_ASSET_BYTES } from '../view/asset-file.js';
+import { sha256 } from '../util/hash.js';
+import { FolioError } from '../errors.js';
+import { EXPORT_LIMITS } from './source.js';
+import { assertStaticSvg } from './svg.js';
+const extensions = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' });
+/** M7 설명서와 M6 안전 읽기를 재사용한다. 참조 그림 누락을 정상 출력처럼 숨기지 않는다. */
+export async function exportAssets(source) {
+  const ids = new Set();
+  for (const node of source.nodes) {
+    for (const id of assetRefsInBody(maskRanges(node.body, fencedRanges(node.body)))) ids.add(id);
+    for (const id of node.data.assets ?? []) ids.add(id);
+  }
+  for (const page of source.layout?.pages ?? []) for (const item of page.items) if (item.assetId !== undefined) ids.add(item.assetId);
+  if (ids.size > EXPORT_LIMITS.assets) throw new FolioError('EXPORT_LIMIT', '그림이 5000개를 넘었다');
+  const assets = new Map(); let bytes = 0;
+  for (const id of ids) {
+    const file = await readAssetFile(source.root, id, { assets: source.work.assets, singleLink: true });
+    bytes += file.bytes.length;
+    if (file.bytes.length > MAX_ASSET_BYTES || bytes > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', '그림 바이트 한도를 넘었다');
+    if (file.type === 'image/svg+xml') assertStaticSvg(file.bytes);
+    assets.set(id, { ...file, id, name: `images/image-${assets.size}.${extensions[file.type]}`, hash: sha256(file.bytes) });
+  }
+  return assets;
+}
diff --git a/core/export/epub.js b/core/export/epub.js
new file mode 100644
--- /dev/null
+++ b/core/export/epub.js
@@ -0,0 +1,28 @@
+import { htmlDocument, xml } from './text.js';
+import { STYLE } from './web.js';
+import { epubZip } from './zip.js';
+import { sha256 } from '../util/hash.js';
+/** EPUB 3.3 reflow 묶음. 지면 전용 그림도 끝 부록에 보존한다. */
+export function epubFiles(source, render, assets, modified) {
+  if (source.layout) source.warnings.push({ code: 'EPUB_LAYOUT_REFLOW', message: '명시 지면 좌표는 EPUB에 적용되지 않는다' });
+  const extras = new Set();
+  for (const page of source.layout?.pages ?? []) for (const item of page.items) if (item.assetId !== undefined) extras.add(item.assetId);
+  const appendix = extras.size ? `<section><h2>지면 그림</h2>${[...extras].map((id) => `<figure>${render.image(id)}</figure>`).join('')}</section>` : '';
+  const body = `<h1>${xml(source.title)}</h1>${[...render.articles.values()].join('\n')}${appendix}${render.bibliography}`;
+  const files = new Map([
+    ['mimetype', Buffer.from('application/epub+zip')],
+    ['META-INF/container.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')],
+    ['OEBPS/book.xhtml', Buffer.from(htmlDocument(source.title, body, source.lang))],
+    ['OEBPS/nav.xhtml', Buffer.from(htmlDocument(source.title, `<nav epub:type="toc" id="toc"><h1>목차</h1><ol>${render.toc.replaceAll('href="#', 'href="book.xhtml#')}</ol></nav>`, source.lang))],
+    ['OEBPS/style.css', Buffer.from(STYLE)],
+  ]);
+  const identifiers = sha256(JSON.stringify({ title: source.title, variant: source.variant, nodes: source.manifestNodes, assets: [...assets.values()].map((a) => a.hash) }));
+  let imageItems = '', svg = false;
+  for (const [index, asset] of [...assets.values()].entries()) {
+    files.set(`OEBPS/${asset.name}`, asset.bytes); if (asset.type === 'image/svg+xml') svg = true;
+    imageItems += `<item id="image-${index}" href="${asset.name}" media-type="${asset.type}"/>`;
+  }
+  const packageText = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:sha256:${identifiers}</dc:identifier><dc:title>${xml(source.title)}</dc:title><dc:language>${xml(source.lang)}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="book" href="book.xhtml" media-type="application/xhtml+xml"${svg ? ' properties="svg"' : ''}/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/>${imageItems}</manifest><spine><itemref idref="book"/></spine></package>`;
+  files.set('OEBPS/package.opf', Buffer.from(packageText));
+  return new Map([['book.epub', epubZip(files)]]);
+}
diff --git a/core/export/export-work.js b/core/export/export-work.js
new file mode 100644
--- /dev/null
+++ b/core/export/export-work.js
@@ -0,0 +1,32 @@
+import { FolioError } from '../errors.js';
+import { sha256 } from '../util/hash.js';
+import { loadExportSource, EXPORT_LIMITS } from './source.js';
+import { exportAssets } from './assets.js';
+import { createRender } from './render.js';
+import { webFiles } from './web.js';
+import { epubFiles } from './epub.js';
+import { publishExport } from './publish.js';
+
+/** 형식별 바이트를 먼저 완성한다. 원고·기록장에 쓰지 않고 영수증을 만들지 않는다. */
+async function bundle({ root, variant = 'main', language = null, format = 'web', now = () => new Date().toISOString() }) {
+  if (!['web', 'epub'].includes(format)) throw new FolioError('EXPORT_FORMAT_INVALID', '웹 또는 EPUB 형식만 지원한다');
+  const generatedAt = new Date(now()).toISOString().replace(/\.\d{3}Z$/, 'Z');
+  const source = await loadExportSource({ root, variant, language }), assets = await exportAssets(source), render = createRender(source, assets);
+  const files = format === 'web' ? webFiles(source, render, assets) : epubFiles(source, render, assets, generatedAt);
+  const manifest = { version: 1, format, variant, generatedAt, title: source.title, language: source.lang, receipt: false,
+    nodes: source.manifestNodes, receiptsHash: source.receiptsHash, warnings: source.warnings,
+    assets: [...assets.values()].map((asset) => ({ id: asset.id, type: asset.type, hash: asset.hash, bytes: asset.bytes.length })),
+    files: [...files].map(([path, bytes]) => ({ path, bytes: bytes.length, hash: sha256(bytes) })) };
+  files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
+  if (files.size > EXPORT_LIMITS.files || [...files.values()].reduce((n, bytes) => n + bytes.length, 0) > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', '출력 파일·바이트 한도를 넘었다');
+  return { files, manifest, layout: source.layout };
+}
+export async function checkExport(options) {
+  const { files, manifest, layout } = await bundle(options);
+  return { format: manifest.format, variant: manifest.variant, language: manifest.language, layout, warnings: manifest.warnings, nodes: manifest.nodes.length, assets: manifest.assets.length, files: files.size, bytes: [...files.values()].reduce((n, b) => n + b.length, 0) };
+}
+export async function exportWork({ root, output, fs = undefined, ...options }) {
+  const { files, manifest } = await bundle({ root, ...options });
+  const published = await publishExport(root, output, files, { fs });
+  return { status: 'exported', output: published.target, format: manifest.format, variant: manifest.variant, files: files.size, warnings: [...manifest.warnings, ...published.warnings] };
+}
diff --git a/core/export/publish.js b/core/export/publish.js
new file mode 100644
--- /dev/null
+++ b/core/export/publish.js
@@ -0,0 +1,71 @@
+import * as filesystem from 'node:fs/promises';
+import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
+import { FolioError } from '../errors.js';
+import { publishTree } from '../util/publish-tree.js';
+const same = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino;
+const unchanged = (a, b) => same(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs;
+const statOrNull = (fs, path) => fs.lstat(path).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
+
+/** 새 외부 폴더에만 쓴다. 정리할 때도 자기 inode 중 바뀌지 않은 것만 제거한다. */
+export async function publishExport(root, output, files, { fs = filesystem } = {}) {
+  if (typeof output !== 'string' || !isAbsolute(output) || output.includes('\0')) throw new FolioError('EXPORT_OUTPUT_INVALID', '출력은 작품 밖의 새 절대 경로여야 한다');
+  const sourceRoot = await fs.realpath(root), requested = resolve(output);
+  const parent = await fs.realpath(dirname(requested)).catch(() => { throw new FolioError('EXPORT_OUTPUT_INVALID', '출력 부모 폴더가 있어야 한다'); });
+  const target = join(parent, basename(requested));
+  const inside = relative(sourceRoot, target);
+  if (inside === '' || (!inside.startsWith('../') && !isAbsolute(inside))) throw new FolioError('EXPORT_OUTPUT_INVALID', '작품 안에 내보낼 수 없다');
+  if (await statOrNull(fs, target)) throw new FolioError('EXPORT_ROOT_EXISTS', '출력 폴더가 이미 있다', { target });
+  const parentInfo = await fs.lstat(parent);
+  const temp = await fs.mkdtemp(join(parent, '.folio-export-'));
+  let tempInfo = null; const ownFiles = [], ownDirs = [];
+  async function verify() {
+    if (!same(await fs.lstat(parent), parentInfo) || !same(await fs.lstat(temp), tempInfo)) throw new FolioError('EXPORT_PARENT_CHANGED', '출력 부모 또는 임시 폴더가 바뀌었다');
+    for (const dir of ownDirs) if (!same(await fs.lstat(join(temp, dir.rel)), dir.info)) throw new FolioError('EXPORT_STAGE_CHANGED', '임시 하위 폴더가 바뀌었다');
+  }
+  async function cleanup() {
+    if (!tempInfo) return false;
+    try {
+      if (!same(await fs.lstat(parent), parentInfo) || !same(await statOrNull(fs, temp), tempInfo)) return false;
+      let clean = true;
+      for (const file of [...ownFiles].reverse()) {
+        const found = await statOrNull(fs, join(temp, file.rel));
+        if (found === null) continue;
+        if (!unchanged(found, file.info)) { clean = false; continue; }
+        await fs.unlink(join(temp, file.rel));
+      }
+      for (const dir of [...ownDirs].reverse()) {
+        if (!same(await statOrNull(fs, join(temp, dir.rel)), dir.info)) { clean = false; continue; }
+        try { await fs.rmdir(join(temp, dir.rel)); } catch { clean = false; }
+      }
+      try { await fs.rmdir(temp); } catch { clean = false; }
+      return clean;
+    } catch { return false; }
+  }
+  try {
+    tempInfo = await fs.lstat(temp); if (!tempInfo.isDirectory()) throw new FolioError('EXPORT_STAGE_CHANGED', '임시 폴더가 아니다');
+    const paths = [...files.keys()].filter((path) => path !== 'manifest.json').sort().concat('manifest.json');
+    for (const rel of paths) {
+      await verify();
+      const parts = rel.split('/');
+      if (parts.some((part) => !part || part === '.' || part === '..') || rel.startsWith('/') || rel.includes('\\')) throw new FolioError('EXPORT_STAGE_INVALID', '내부 출력 경로가 잘못됐다');
+      let prefix = '';
+      for (const part of parts.slice(0, -1)) {
+        prefix = prefix ? `${prefix}/${part}` : part;
+        if (!ownDirs.some((dir) => dir.rel === prefix)) {
+          await verify(); await fs.mkdir(join(temp, prefix)); const info = await fs.lstat(join(temp, prefix));
+          if (!info.isDirectory()) throw new FolioError('EXPORT_STAGE_CHANGED', '임시 하위 폴더가 바뀌었다');
+          ownDirs.push({ rel: prefix, info });
+        }
+      }
+      await verify(); await fs.writeFile(join(temp, rel), files.get(rel), { flag: 'wx' });
+      ownFiles.push({ rel, info: await fs.lstat(join(temp, rel)) });
+    }
+    await verify(); await publishTree(temp, target, { fs, marker: 'manifest.json', prefix: 'EXPORT' });
+    const cleaned = await cleanup();
+    return { target, warnings: cleaned ? [] : [{ code: 'EXPORT_TEMP_CLEANUP_PENDING', temp, message: '결과는 완성됐고 임시 폴더 정리가 남았다' }] };
+  } catch (error) {
+    const cleaned = await cleanup();
+    error.details = { ...(error.details ?? {}), target, temp, cleanupPending: Boolean(error.details?.cleanupPending) || !cleaned };
+    throw error;
+  }
+}
diff --git a/core/export/render.js b/core/export/render.js
new file mode 100644
--- /dev/null
+++ b/core/export/render.js
@@ -0,0 +1,69 @@
+import { parseNodeMarks } from '../blocks/syntax.js';
+import { fencedRanges, maskRanges } from '../util/fences.js';
+import { assetRefsInBody } from '../store/assets.js';
+import { xml } from './text.js';
+
+/** 원문 HTML을 허용하지 않는 출판 렌더러. 원고와 catalog는 변경하지 않는다. */
+export function createRender(source, assets) {
+  const nodeIds = new Map(source.nodes.map((node, index) => [node.id, `node-${index}`]));
+  const blocks = new Map(source.catalog.blocks.map((block) => [block.id, block]));
+  const usedAnchors = new Set();
+  const image = (id, style = '') => {
+    const asset = assets.get(id);
+    return `<img src="${asset.name}" alt="${xml(source.work.assets.get(id)?.brief?.title ?? id)}"${style}/>`;
+  };
+  function inline(text, nodeId) {
+    const marks = parseNodeMarks(text), pieces = [];
+    for (const anchor of marks.anchors) {
+      const owner = blocks.get(anchor.id), owned = owner?.nodeId === nodeId && !usedAnchors.has(anchor.id);
+      if (owned) usedAnchors.add(anchor.id);
+      pieces.push({ ...anchor, html: owned ? `<span id="block-${anchor.id}" class="block-label">${xml(owner.label ?? '')}</span>` : xml(`{#${anchor.id}}`) });
+    }
+    for (const ref of marks.refs) {
+      const target = blocks.get(ref.target), href = target && nodeIds.has(target.nodeId) ? `#block-${ref.target}` : null;
+      if (target && !href) source.warnings.push({ code: 'EXPORT_BLOCK_TARGET_NOT_EXPORTED', target: ref.target, nodeId });
+      pieces.push({ ...ref, html: href ? `<a href="${href}">${xml(target.label ?? ref.target)}</a>` : xml(`[[block:${ref.target}]]`) });
+    }
+    for (const note of marks.footnoteRefs) {
+      const target = source.catalog.footnotes.find((n) => n.nodeId === nodeId && n.id === note.id);
+      pieces.push({ ...note, html: target ? `<sup><a href="#note-${nodeIds.get(nodeId)}-${note.id}">${target.number}</a></sup>` : xml(`[^${note.id}]`) });
+    }
+    for (const ref of marks.citations) {
+      const target = source.work.sources.get(ref.sourceId);
+      pieces.push({ ...ref, html: target ? `<a href="#source-${ref.sourceId}">${xml(target.title || ref.sourceId)}</a>` : xml(`[[source:${ref.sourceId}]]`) });
+    }
+    for (const match of text.matchAll(/!\[\[asset:([A-Za-z0-9][\w-]*)\]\]/g)) pieces.push({ start: match.index, end: match.index + match[0].length, html: image(match[1]) });
+    pieces.sort((a, b) => a.start - b.start || b.end - a.end);
+    let at = 0, html = '';
+    for (const part of pieces) { if (part.start < at) continue; html += xml(text.slice(at, part.start)) + part.html; at = part.end; }
+    return html + xml(text.slice(at));
+  }
+  const titleOf = (node) => typeof node.title === 'string' && node.title.trim() ? node.title : node.id;
+  const articles = new Map();
+  for (const node of source.nodes) {
+    const paragraphs = []; let fence = null, code = [];
+    for (const line of node.body.split('\n')) {
+      const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line);
+      if (fence) {
+        if (mark && mark[1][0] === fence.char && mark[1].length >= fence.length && !line.slice(mark[0].length).trim()) {
+          paragraphs.push(`<pre><code>${xml(code.join('\n'))}</code></pre>`); fence = null; code = [];
+        } else code.push(line);
+      } else if (mark) fence = { char: mark[1][0], length: mark[1].length };
+      else if (/^ {0,3}\[\^[A-Za-z0-9][\w-]*\]:/.test(line)) continue;
+      else if (/^#{1,6}\s/.test(line)) {
+        const heading = /^(#{1,6})\s+(.*)$/.exec(line); paragraphs.push(`<h${heading[1].length}>${inline(heading[2], node.id)}</h${heading[1].length}>`);
+      } else if (line.trim()) paragraphs.push(`<p>${inline(line, node.id)}</p>`);
+    }
+    if (fence) paragraphs.push(`<pre><code>${xml(code.join('\n'))}</code></pre>`);
+    const already = new Set(assetRefsInBody(maskRanges(node.body, fencedRanges(node.body))));
+    for (const id of node.data.assets ?? []) if (!already.has(id)) paragraphs.push(`<figure>${image(id)}</figure>`);
+    for (const note of source.catalog.footnotes.filter((n) => n.nodeId === node.id)) paragraphs.push(`<aside id="note-${nodeIds.get(node.id)}-${note.id}"><span>${note.number}. </span>${inline(note.text, node.id)}</aside>`);
+    const choices = (node.links ?? []).filter((link) => link.kind === 'choice');
+    if (choices.length) paragraphs.push(`<nav aria-label="선택지"><ul>${choices.map((link) => nodeIds.has(link.to) ? `<li><a href="#${nodeIds.get(link.to)}">${xml(link.label ?? link.to)}</a></li>` : `<li>${xml(link.label ?? link.to)}</li>`).join('')}</ul></nav>`);
+    articles.set(node.id, `<article id="${nodeIds.get(node.id)}"><h2>${xml(titleOf(node))}</h2>${paragraphs.join('\n')}</article>`);
+  }
+  const sourceIds = new Set(source.catalog.citations.filter((ref) => ref.valid).map((ref) => ref.sourceId));
+  const bibliography = sourceIds.size ? `<section class="bibliography"><h2>참고 자료</h2><ul>${[...sourceIds].map((id) => `<li id="source-${id}">${xml(source.work.sources.get(id).title || id)}</li>`).join('')}</ul></section>` : '';
+  const toc = source.nodes.map((node) => `<li><a href="#${nodeIds.get(node.id)}">${xml(titleOf(node))}</a></li>`).join('');
+  return { articles, toc, bibliography, nodeIds, image };
+}
diff --git a/core/export/source.js b/core/export/source.js
new file mode 100644
--- /dev/null
+++ b/core/export/source.js
@@ -0,0 +1,49 @@
+import { openWork } from '../store/work.js';
+import { preorder } from '../store/tree.js';
+import { validateBlocks } from '../store/blocks.js';
+import { blockCatalog } from '../blocks/catalog.js';
+import { openLedger } from '../ledger/ledger.js';
+import { lastCommits, receiptsById } from '../ledger/receipts.js';
+import { MAIN, variantOf } from '../variants/model.js';
+import { sha256 } from '../util/hash.js';
+import { FolioError } from '../errors.js';
+import { readLayout } from '../layout/read.js';
+import { xml } from './text.js';
+
+export const EXPORT_LIMITS = Object.freeze({ nodes: 5000, files: 5000, assets: 5000, bytes: 67108864 });
+/** 파일·기록장을 읽기만 하며 선택 판본의 별도 트리에서 블록을 투영한다. */
+export async function loadExportSource({ root, variant = MAIN, language = null }) {
+  const original = await openWork(root, { hashAssetFiles: false });
+  if (original.config.features.export === false) throw new FolioError('FEATURE_DISABLED', '내보내기 기능이 꺼졌다', { feature: 'export' });
+  const declaration = variant === MAIN ? { lang: 'ko' } : original.config.variantSpecs[variant];
+  if (!declaration) throw new FolioError('EXPORT_VARIANT_INVALID', '선언하지 않은 판본이다', { variant });
+  if (variant !== MAIN && !original.config.features.variants) throw new FolioError('FEATURE_DISABLED', '판본 기능이 꺼졌다', { feature: 'variants' });
+  const ids = preorder(original.tree).filter((id) => original.tree.nodes.get(id).kind === 'leaf');
+  if (!ids.length) throw new FolioError('EXPORT_EMPTY', '내보낼 잎 원고가 없다');
+  if (ids.length > EXPORT_LIMITS.nodes) throw new FolioError('EXPORT_LIMIT', '원고 잎이 5000개를 넘었다');
+  const records = await openLedger(root, 'receipts').readAll(), commits = lastCommits(records, variant), receipts = receiptsById(records);
+  const nodes = new Map(original.tree.nodes), warnings = [...original.warnings], manifestNodes = [];
+  let bytes = 0;
+  for (const id of ids) {
+    const node = original.tree.nodes.get(id), text = variant === MAIN ? node : original.variants.get(variant)?.texts.get(id);
+    if (!text) throw new FolioError('EXPORT_VARIANT_MISSING', '판본 원고가 빠졌다', { variant, nodeId: id });
+    xml(text.body); xml(text.title ?? node.title ?? id);
+    bytes += Buffer.byteLength(text.body); if (bytes > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', '원고가 64MiB를 넘었다');
+    nodes.set(id, { ...node, body: text.body, title: text.title ?? node.title });
+    const bodyHash = sha256(text.body), commit = commits.get(id), receipt = commit ? receipts.get(commit.receiptId) : null;
+    const bound = Boolean(commit && receipt && receipt.nodeId === id && variantOf(receipt) === variant && receipt.draftHash === commit.committedHash);
+    manifestNodes.push({ id, bodyHash, status: node.status, commitReceiptId: bound ? commit.receiptId : null, committedHash: bound ? commit.committedHash : null });
+    if (!bound || (variant === MAIN && node.status !== 'committed')) warnings.push({ code: 'EXPORT_UNVERIFIED', nodeId: id, variant });
+    else if (bodyHash !== commit.committedHash) warnings.push({ code: 'EXPORT_BODY_CHANGED', nodeId: id, variant });
+  }
+  const tree = { ...original.tree, nodes }, work = { ...original, tree, blocks: validateBlocks(tree) };
+  const catalog = blockCatalog(work); warnings.push(...catalog.problems);
+  const layout = original.config.features.layout === false ? { layout: null, problems: [{ code: 'LAYOUT_DISABLED' }] } : await readLayout(root, work);
+  warnings.push(...layout.problems);
+  const title = original.config.title; let lang;
+  try { lang = Intl.getCanonicalLocales(language ?? declaration.lang ?? 'ko')[0]; }
+  catch { throw new FolioError('EXPORT_LANGUAGE_INVALID', '지원되는 언어 태그를 지정해야 한다'); }
+  if (!lang) throw new FolioError('EXPORT_LANGUAGE_INVALID', '언어 태그가 비었다'); if (!title.trim()) throw new FolioError('EXPORT_TITLE_INVALID', '작품 제목이 비었다');
+  xml(title); xml(lang);
+  return { root, work, variant, title, lang, nodes: ids.map((id) => nodes.get(id)), catalog, layout: layout.layout, warnings, manifestNodes, receiptsHash: sha256(JSON.stringify(records)) };
+}
diff --git a/core/export/svg.js b/core/export/svg.js
new file mode 100644
--- /dev/null
+++ b/core/export/svg.js
@@ -0,0 +1,55 @@
+import { FolioError } from '../errors.js';
+import { xml } from './text.js';
+const tags = new Set('svg g defs path rect circle ellipse line polyline polygon text tspan title desc clipPath mask linearGradient radialGradient stop use'.split(' '));
+const attributes = new Set('xmlns id viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width opacity fill-opacity stroke-opacity transform font-size font-family font-weight text-anchor dominant-baseline clip-path mask gradientUnits gradientTransform offset stop-color stop-opacity href preserveAspectRatio style'.split(' '));
+const fail = () => { throw new FolioError('EXPORT_SVG_UNSAFE', '정적 SVG 지원 범위 밖의 요소·속성·외부 참조가 있다'); };
+const decode = (text) => {
+  if (text.replace(/&[^;]+;/g, '').includes('&') || text.includes(']]>')) fail();
+  return text.replace(/&([^;]+);/g, (_whole, name) => {
+  const known = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
+  if (known[name] !== undefined) return known[name];
+  if (/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(name)) {
+    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
+    if (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) return String.fromCodePoint(code);
+  }
+  fail();
+  });
+};
+/** 정적 SVG 부분집합만 허용한다. 바이트를 수정하거나 외부 리소스를 가져오지 않는다. */
+export function assertStaticSvg(bytes) {
+  let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(); }
+  if (/<!|<\?(?!xml\s)/i.test(text) || !/^\s*(?:<\?xml[^?]*\?>\s*)?<svg\s/.test(text)) fail();
+  const stack = []; let position = 0, roots = 0;
+  for (const match of text.matchAll(/<[^>]*>/g)) {
+    const between = text.slice(position, match.index);
+    if (between.includes('<') || (!stack.length && between.trim())) fail();
+    xml(decode(between)); position = match.index + match[0].length;
+    const token = match[0];
+    if (token.startsWith('<?xml')) {
+      if (roots || stack.length || match.index > text.indexOf('<?xml') || !/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>$/.test(token)) fail();
+      continue;
+    }
+    const close = /^<\/([A-Za-z][\w]*)\s*>$/.exec(token);
+    if (close) { if (stack.pop() !== close[1]) fail(); continue; }
+    const open = /^<([A-Za-z][\w]*)\s*([\s\S]*?)\s*(\/?)>$/.exec(token);
+    if (!open || !tags.has(open[1])) fail();
+    if (!stack.length) { if (open[1] !== 'svg' || ++roots !== 1) fail(); }
+    let rest = open[2], xmlns = false; const seen = new Set();
+    while (rest.trim()) {
+      if (seen.size && !/^\s/.test(rest)) fail();
+      const attr = /^\s*([A-Za-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
+      if (!attr || !attributes.has(attr[1]) || seen.has(attr[1])) fail();
+      seen.add(attr[1]); rest = rest.slice(attr[0].length);
+      const value = decode(attr[2] ?? attr[3]);
+      if (/[<\\]/.test(value) || [...value].some((char) => char.codePointAt(0) < 32)) fail();
+      if (attr[1] === 'xmlns') { if (value !== 'http://www.w3.org/2000/svg') fail(); xmlns = true; }
+      xml(value);
+      if (/^(?:href|xlink:href)$/.test(attr[1]) && !/^#[A-Za-z0-9][\w-]*$/.test(value)) fail();
+      if (/url\s*\(/i.test(value) && !/^(?:[^()]*|url\(#[A-Za-z0-9][\w-]*\))$/.test(value)) fail();
+      if (attr[1] === 'style' && (/@|expression|-moz-binding|[{}]/i.test(value) || /url\s*\(/i.test(value))) fail();
+    }
+    if (open[1] === 'svg' && roots === 1 && !stack.length && !xmlns) fail();
+    if (!open[3]) stack.push(open[1]);
+  }
+  if (stack.length || roots !== 1 || text.slice(position).trim()) fail();
+}
diff --git a/core/export/text.js b/core/export/text.js
new file mode 100644
--- /dev/null
+++ b/core/export/text.js
@@ -0,0 +1,11 @@
+import { FolioError } from '../errors.js';
+/** XML 1.0에 실을 수 없는 문자를 버리지 않고 거부한다. */
+export function xml(value) {
+  const text = String(value ?? '');
+  for (const char of text) {
+    const code = char.codePointAt(0);
+    if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 0xd800 && code <= 0xdfff) || [0xfffe, 0xffff].includes(code)) throw new FolioError('EXPORT_TEXT_INVALID', 'XML에 실을 수 없는 문자가 있다');
+  }
+  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
+}
+export const htmlDocument = (title, body, lang, css = 'style.css', extra = '') => `<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xml(lang)}" xml:lang="${xml(lang)}"><head><meta charset="utf-8"/><title>${xml(title)}</title><link rel="stylesheet" href="${css}"/>${extra}</head><body>${body}</body></html>`;
diff --git a/core/export/web.js b/core/export/web.js
new file mode 100644
--- /dev/null
+++ b/core/export/web.js
@@ -0,0 +1,30 @@
+import { htmlDocument, xml } from './text.js';
+export const STYLE = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#ece8df;color:#242721;font-family:Georgia,"Noto Serif KR",serif;line-height:1.7}header,main>nav,.warnings{max-width:900px;margin:24px auto;padding:0 28px}h1{font-size:2.2rem}h2{font-size:1.3rem}a{color:#2d5e59}img{max-width:100%;height:auto}article,.bibliography{background:white;max-width:900px;margin:28px auto;padding:36px;border-radius:4px}p{white-space:pre-wrap}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f0;padding:16px}aside{font-size:.85em}.block-label{font-weight:bold}.spread{display:flex;justify-content:center;gap:18px;margin:32px 0}.page{position:relative;flex:none;background:white;box-shadow:0 3px 16px #0002}.page article{margin:0;padding:0;border:0;background:transparent}.page-item{position:absolute;overflow:visible}.page-item img{width:100%;height:100%}.page-item figure{margin:0}.page>footer{position:absolute;bottom:1mm;right:4mm;font-size:9pt}.warnings{font-family:system-ui;font-size:14px}.publication-note{font-size:14px;color:#4d544c}@media print{body{background:white}header[data-layout="true"],main>nav,.warnings,.publication-note{display:none}article,.bibliography{box-shadow:none;border:0;margin:0;max-width:none}.spread{display:block;margin:0}.page{box-shadow:none;margin:0;break-after:page;page-break-after:always}.page:last-child{break-after:auto}.page>footer{color:#444}a{color:inherit;text-decoration:none}}`;
+/** 명시 좌표는 그대로 쓰고 미배치 원고는 끝에 보존한다. */
+export function webFiles(source, render, assets) {
+  const layout = source.layout; let body = '', pageCss = '';
+  if (layout) {
+    const { widthMm, heightMm } = layout.page; pageCss = `@page{size:${widthMm}mm ${heightMm}mm;margin:0}`;
+    const placed = new Set(), groups = new Map();
+    for (const page of layout.pages) {
+      const items = page.items.map((item) => {
+        const style = `left:${item.xMm}mm;top:${item.yMm}mm;width:${item.widthMm}mm;height:${item.heightMm}mm`;
+        if (item.nodeId) placed.add(item.nodeId);
+        const content = item.nodeId ? render.articles.get(item.nodeId) : render.image(item.assetId, ` style="object-fit:${item.fit ?? 'contain'}"`);
+        return `<div class="page-item" style="${style}">${content}</div>`;
+      }).join('');
+      const sheet = `<section class="page" data-side="${page.side ?? ''}" style="width:${widthMm}mm;height:${heightMm}mm">${items}<footer>${xml(page.id)}</footer></section>`;
+      const key = page.spreadId ? `spread:${page.spreadId}` : `page:${page.id}`;
+      if (!groups.has(key)) groups.set(key, []);
+      groups.get(key).push({ side: page.side, sheet });
+    }
+    body = [...groups.values()].map((group) => `<div class="spread">${group.sort((a, b) => a.side === b.side ? 0 : a.side === 'left' ? -1 : 1).map((p) => p.sheet).join('')}</div>`).join('\n');
+    body += source.nodes.filter((node) => !placed.has(node.id)).map((node) => render.articles.get(node.id)).join('\n');
+  } else body = [...render.articles.values()].join('\n');
+  const warning = source.warnings.length ? `<section class="warnings"><h2>확인할 항목</h2><ul>${source.warnings.map((w) => `<li>${xml(w.code)}${w.nodeId ? ` · ${xml(w.nodeId)}` : ''}</li>`).join('')}</ul></section>` : '';
+  const content = `<header data-layout="${Boolean(layout)}"><p class="publication-note">판본 ${xml(source.variant)} · 읽기 전용 내보내기. 검사 영수증이 아닙니다. PDF는 인쇄 메뉴에서 저장합니다.</p><h1>${xml(source.title)}</h1></header><main><nav aria-label="목차"><ol>${render.toc}</ol></nav>${warning}${body}${render.bibliography}</main>`;
+  const csp = '<meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; img-src &apos;self&apos; data:; style-src &apos;self&apos; &apos;unsafe-inline&apos;; base-uri &apos;none&apos;; form-action &apos;none&apos;"/>';
+  const files = new Map([['index.html', Buffer.from(htmlDocument(source.title, content, source.lang, 'style.css', csp))], ['style.css', Buffer.from(STYLE + pageCss)]]);
+  for (const asset of assets.values()) files.set(asset.name, asset.bytes);
+  return files;
+}
diff --git a/core/export/zip.js b/core/export/zip.js
new file mode 100644
--- /dev/null
+++ b/core/export/zip.js
@@ -0,0 +1,35 @@
+import { deflateRawSync } from 'node:zlib';
+import { FolioError } from '../errors.js';
+import { EXPORT_LIMITS } from './source.js';
+const table = Uint32Array.from({ length: 256 }, (_, i) => {
+  let value = i;
+  for (let j = 0; j < 8; j += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
+  return value >>> 0;
+});
+export function crc32(bytes) {
+  let crc = 0xffffffff;
+  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
+  return (crc ^ 0xffffffff) >>> 0;
+}
+/** ZIP32·UTF-8 이름·고정 DOS 시각. mimetype은 첫 비압축 항목이며 extra가 없다. */
+export function epubZip(files) {
+  if (files.size > EXPORT_LIMITS.files || files.get('mimetype')?.toString('ascii') !== 'application/epub+zip') throw new FolioError('EXPORT_ZIP_INVALID', 'EPUB 항목이 잘못됐다');
+  const order = ['mimetype', ...[...files.keys()].filter((name) => name !== 'mimetype').sort()], local = [], central = [];
+  let offset = 0, total = 0;
+  for (const path of order) {
+    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path) || path.split('/').some((p) => !p || p === '.' || p === '..')) throw new FolioError('EXPORT_ZIP_INVALID', 'ZIP 경로가 잘못됐다');
+    const raw = files.get(path), name = Buffer.from(path), method = path === 'mimetype' ? 0 : 8;
+    total += raw.length; if (total > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', '출력 바이트 한도를 넘었다');
+    const packed = method ? deflateRawSync(raw) : raw, crc = crc32(raw), header = Buffer.alloc(30);
+    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(method, 8); header.writeUInt16LE(33, 12);
+    header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(raw.length, 22); header.writeUInt16LE(name.length, 26);
+    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(method, 10); entry.writeUInt16LE(33, 14);
+    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
+    local.push(header, name, packed); central.push(entry, name); offset += header.length + name.length + packed.length;
+  }
+  const directory = Buffer.concat(central), end = Buffer.alloc(22);
+  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(order.length, 8); end.writeUInt16LE(order.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
+  const result = Buffer.concat([...local, directory, end]);
+  if (result.length > EXPORT_LIMITS.bytes) throw new FolioError('EXPORT_LIMIT', 'ZIP이 출력 바이트 한도를 넘었다');
+  return result;
+}
diff --git a/core/import/publish-work.js b/core/import/publish-work.js
--- a/core/import/publish-work.js
+++ b/core/import/publish-work.js
@@ -1,105 +1,3 @@
-import * as filesystem from 'node:fs/promises';
-import { dirname, join } from 'node:path';
-import { FolioError } from '../errors.js';
-
-const sameEntry = (left, right) => left.dev === right.dev && left.ino === right.ino;
-const sameFile = (left, right) => sameEntry(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs;
-const pathIn = (root, rel) => rel ? join(root, rel) : root;
-
-async function listStage(temp, fs) {
-  const dirs = [];
-  const files = [];
-  async function visit(rel) {
-    for (const entry of await fs.readdir(pathIn(temp, rel), { withFileTypes: true })) {
-      const child = rel ? `${rel}/${entry.name}` : entry.name;
-      if (entry.isDirectory()) { dirs.push(child); await visit(child); }
-      else if (entry.isFile()) files.push(child);
-      else throw new FolioError('IMPORT_STAGE_INVALID', `stage contains a non-file entry: ${child}`);
-    }
-  }
-  await visit('');
-  if (!files.includes('work.yaml')) throw new FolioError('IMPORT_STAGE_INVALID', 'stage has no work.yaml');
-  return { dirs: dirs.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)), files: files.filter((f) => f !== 'work.yaml').sort().concat('work.yaml') };
-}
-
-/** 완성된 temp를 배타 게시한다. 실패 시 이 호출이 만든 inode 중 변경되지 않은 것만 되돌린다. */
-export async function publishWork(temp, target, { fs = filesystem } = {}) {
-  const stage = await listStage(temp, fs);
-  const parent = dirname(target);
-  const parentInfo = await fs.lstat(parent);
-  const createdDirs = [];
-  const createdFiles = [];
-  let rootInfo = null;
-  let reserved = false;
-  let pending = false;
-
-  async function owned(rel, expected) {
-    const found = await fs.lstat(pathIn(target, rel)).catch(() => null);
-    return found && sameEntry(found, expected) ? found : null;
-  }
-  async function verifyPath(rel) {
-    const currentParent = await fs.lstat(parent).catch(() => null);
-    if (!currentParent || !sameEntry(currentParent, parentInfo)) throw new FolioError('IMPORT_PARENT_CHANGED', 'target parent changed during publication');
-    if (!rootInfo || !(await owned('', rootInfo))) throw new FolioError('IMPORT_ROOT_CHANGED', 'reserved target changed during publication');
-    const parts = rel ? rel.split('/') : [];
-    let prefix = '';
-    for (const part of parts) {
-      prefix = prefix ? `${prefix}/${part}` : part;
-      const expected = createdDirs.find((dir) => dir.rel === prefix)?.info;
-      if (!expected || !(await owned(prefix, expected))) throw new FolioError('IMPORT_ROOT_CHANGED', 'published directory changed during publication');
-    }
-  }
-  try {
-    try { await fs.mkdir(target); }
-    catch (error) {
-      if (error?.code === 'EEXIST') throw new FolioError('IMPORT_ROOT_EXISTS', 'import root appeared before publication', { target });
-      throw error;
-    }
-    reserved = true;
-    rootInfo = await fs.lstat(target);
-    if (!rootInfo.isDirectory()) throw new FolioError('IMPORT_ROOT_CHANGED', 'reserved target is not a directory');
-    for (const rel of stage.dirs) {
-      await verifyPath(dirname(rel) === '.' ? '' : dirname(rel));
-      await fs.mkdir(pathIn(target, rel));
-      const info = await fs.lstat(pathIn(target, rel));
-      createdDirs.push({ rel, info });
-      if (!info.isDirectory()) throw new FolioError('IMPORT_ROOT_CHANGED', 'published directory changed during publication');
-    }
-    for (const rel of stage.files) {
-      await verifyPath(dirname(rel) === '.' ? '' : dirname(rel));
-      const source = pathIn(temp, rel);
-      const sourceInfo = await fs.lstat(source);
-      if (!sourceInfo.isFile()) throw new FolioError('IMPORT_STAGE_INVALID', `stage file changed: ${rel}`);
-      await fs.link(source, pathIn(target, rel));
-      createdFiles.push({ rel, info: sourceInfo });
-      const targetInfo = await fs.lstat(pathIn(target, rel));
-      if (!targetInfo.isFile() || !sameFile(targetInfo, sourceInfo)) throw new FolioError('IMPORT_ROOT_CHANGED', 'published file changed during publication');
-    }
-    await verifyPath('');
-    const publishedWork = createdFiles.at(-1);
-    const foundWork = await owned('work.yaml', publishedWork.info);
-    if (!foundWork || !sameFile(foundWork, publishedWork.info)) throw new FolioError('IMPORT_ROOT_CHANGED', 'published work changed before completion');
-    return target;
-  } catch (error) {
-    if (rootInfo) {
-      const currentParent = await fs.lstat(parent).catch(() => null);
-      if (!currentParent || !sameEntry(currentParent, parentInfo) || !(await owned('', rootInfo))) pending = true;
-      else {
-        for (const { rel, info } of createdFiles.reverse()) {
-          const found = await owned(rel, info);
-          if (!found || !sameFile(found, info)) { pending = true; continue; }
-          try { await fs.unlink(pathIn(target, rel)); } catch { pending = true; }
-        }
-        for (const { rel, info } of createdDirs.reverse()) {
-          if (!(await owned(rel, info))) { pending = true; continue; }
-          try { await fs.rmdir(pathIn(target, rel)); } catch { pending = true; }
-        }
-        try { await fs.rmdir(target); } catch { pending = true; }
-      }
-    } else if (reserved) pending = true;
-    if (error instanceof FolioError && error.code === 'IMPORT_ROOT_EXISTS') throw error;
-    throw new FolioError('IMPORT_PUBLISH_FAILED', 'could not publish imported work', {
-      target, cause: error?.code ?? 'UNKNOWN', cleanupPending: pending,
-    });
-  }
-}
+import { publishTree } from '../util/publish-tree.js';
+/** 기존 가져오기 코드·완료 표시는 그대로인 공용 배타 게시의 얇은 경계다. */
+export const publishWork = (temp, target, options = {}) => publishTree(temp, target, { ...options, marker: 'work.yaml', prefix: 'IMPORT' });
diff --git a/core/store/work.js b/core/store/work.js
--- a/core/store/work.js
+++ b/core/store/work.js
@@ -15,15 +15,15 @@
  * 작품 폴더 전체를 읽어 한 모델로 묶는다. 파일이 정본이고 이 객체는 매번 새로 만든다.
  * workYaml 을 주면 work.yaml 파일 대신 그 글로 연다(쓰기 전에 후보 설정이 작품과 맞는지 보는 데만 쓴다).
  * @param {string} root
- * @param {{ workYaml?: string }} [options]
+ * @param {{ workYaml?: string, hashAssetFiles?: boolean }} [options]
  */
-export async function openWork(root, { workYaml } = {}) {
+export async function openWork(root, { workYaml, hashAssetFiles = true } = {}) {
   const { config, warnings: configWarnings } = await loadWorkConfig(root, { text: workYaml });
   const tree = await readTree(root);
   const levels = validateTreeLevels(tree, config);
   const entities = await readEntities(root);
   const sources = await readSources(root);
-  const assets = await readAssets(root);
+  const assets = await readAssets(root, { hashFiles: hashAssetFiles });
   const variants = await readVariants(root, config, tree);
   const errors = [...tree.errors, ...levels.errors, ...entities.errors, ...sources.errors, ...assets.errors, ...variants.errors];
   if (errors.length) throw new FolioError('WORK_INVALID', errors.map((e) => e.code).join(', '), { errors });
diff --git a/core/util/publish-tree.js b/core/util/publish-tree.js
new file mode 100644
--- /dev/null
+++ b/core/util/publish-tree.js
@@ -0,0 +1,105 @@
+import * as filesystem from 'node:fs/promises';
+import { dirname, join } from 'node:path';
+import { FolioError } from '../errors.js';
+
+const sameEntry = (left, right) => left.dev === right.dev && left.ino === right.ino;
+const sameFile = (left, right) => sameEntry(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs;
+const pathIn = (root, rel) => rel ? join(root, rel) : root;
+
+async function listStage(temp, fs, marker, prefix) {
+  const dirs = [];
+  const files = [];
+  async function visit(rel) {
+    for (const entry of await fs.readdir(pathIn(temp, rel), { withFileTypes: true })) {
+      const child = rel ? `${rel}/${entry.name}` : entry.name;
+      if (entry.isDirectory()) { dirs.push(child); await visit(child); }
+      else if (entry.isFile()) files.push(child);
+      else throw new FolioError(`${prefix}_STAGE_INVALID`, `stage contains a non-file entry: ${child}`);
+    }
+  }
+  await visit('');
+  if (!files.includes(marker)) throw new FolioError(`${prefix}_STAGE_INVALID`, '게시 완료 표시 파일이 없다');
+  return { dirs: dirs.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)), files: files.filter((f) => f !== marker).sort().concat(marker) };
+}
+
+/** 완성된 temp를 배타 게시한다. 실패 시 이 호출이 만든 inode 중 변경되지 않은 것만 되돌린다. */
+export async function publishTree(temp, target, { fs = filesystem, marker = 'work.yaml', prefix: errorPrefix = 'IMPORT' } = {}) {
+  const stage = await listStage(temp, fs, marker, errorPrefix);
+  const parent = dirname(target);
+  const parentInfo = await fs.lstat(parent);
+  const createdDirs = [];
+  const createdFiles = [];
+  let rootInfo = null;
+  let reserved = false;
+  let pending = false;
+
+  async function owned(rel, expected) {
+    const found = await fs.lstat(pathIn(target, rel)).catch(() => null);
+    return found && sameEntry(found, expected) ? found : null;
+  }
+  async function verifyPath(rel) {
+    const currentParent = await fs.lstat(parent).catch(() => null);
+    if (!currentParent || !sameEntry(currentParent, parentInfo)) throw new FolioError(`${errorPrefix}_PARENT_CHANGED`, 'target parent changed during publication');
+    if (!rootInfo || !(await owned('', rootInfo))) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'reserved target changed during publication');
+    const parts = rel ? rel.split('/') : [];
+    let prefix = '';
+    for (const part of parts) {
+      prefix = prefix ? `${prefix}/${part}` : part;
+      const expected = createdDirs.find((dir) => dir.rel === prefix)?.info;
+      if (!expected || !(await owned(prefix, expected))) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'published directory changed during publication');
+    }
+  }
+  try {
+    try { await fs.mkdir(target); }
+    catch (error) {
+      if (error?.code === 'EEXIST') throw new FolioError(`${errorPrefix}_ROOT_EXISTS`, 'import root appeared before publication', { target });
+      throw error;
+    }
+    reserved = true;
+    rootInfo = await fs.lstat(target);
+    if (!rootInfo.isDirectory()) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'reserved target is not a directory');
+    for (const rel of stage.dirs) {
+      await verifyPath(dirname(rel) === '.' ? '' : dirname(rel));
+      await fs.mkdir(pathIn(target, rel));
+      const info = await fs.lstat(pathIn(target, rel));
+      createdDirs.push({ rel, info });
+      if (!info.isDirectory()) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'published directory changed during publication');
+    }
+    for (const rel of stage.files) {
+      await verifyPath(dirname(rel) === '.' ? '' : dirname(rel));
+      const source = pathIn(temp, rel);
+      const sourceInfo = await fs.lstat(source);
+      if (!sourceInfo.isFile()) throw new FolioError(`${errorPrefix}_STAGE_INVALID`, `stage file changed: ${rel}`);
+      await fs.link(source, pathIn(target, rel));
+      createdFiles.push({ rel, info: sourceInfo });
+      const targetInfo = await fs.lstat(pathIn(target, rel));
+      if (!targetInfo.isFile() || !sameFile(targetInfo, sourceInfo)) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'published file changed during publication');
+    }
+    await verifyPath('');
+    const publishedWork = createdFiles.at(-1);
+    const foundWork = await owned(marker, publishedWork.info);
+    if (!foundWork || !sameFile(foundWork, publishedWork.info)) throw new FolioError(`${errorPrefix}_ROOT_CHANGED`, 'published work changed before completion');
+    return target;
+  } catch (error) {
+    if (rootInfo) {
+      const currentParent = await fs.lstat(parent).catch(() => null);
+      if (!currentParent || !sameEntry(currentParent, parentInfo) || !(await owned('', rootInfo))) pending = true;
+      else {
+        for (const { rel, info } of createdFiles.reverse()) {
+          const found = await owned(rel, info);
+          if (!found || !sameFile(found, info)) { pending = true; continue; }
+          try { await fs.unlink(pathIn(target, rel)); } catch { pending = true; }
+        }
+        for (const { rel, info } of createdDirs.reverse()) {
+          if (!(await owned(rel, info))) { pending = true; continue; }
+          try { await fs.rmdir(pathIn(target, rel)); } catch { pending = true; }
+        }
+        try { await fs.rmdir(target); } catch { pending = true; }
+      }
+    } else if (reserved) pending = true;
+    if (error instanceof FolioError && error.code === `${errorPrefix}_ROOT_EXISTS`) throw error;
+    throw new FolioError(`${errorPrefix}_PUBLISH_FAILED`, '완성 결과를 게시할 수 없다', {
+      target, cause: error?.code ?? 'UNKNOWN', cleanupPending: pending,
+    });
+  }
+}
diff --git a/core/view/asset-file.js b/core/view/asset-file.js
--- a/core/view/asset-file.js
+++ b/core/view/asset-file.js
@@ -24,10 +24,11 @@
  * 지나는 자리가 파일이라 더 못 들어가거나(ENOTDIR) 이름이 너무 길면(ENAMETOOLONG) missing 이다.
  * @param {string} root
  * @param {string} assetId
+ * @param {{ assets?: Map<string, any>, singleLink?: boolean }} [options]
  * @returns {Promise<{ type: string, bytes: Buffer }>}
  */
-export async function readAssetFile(root, assetId) {
-  const { assets } = await readAssets(root, { hashFiles: false });
+export async function readAssetFile(root, assetId, { assets: catalog, singleLink = false } = {}) {
+  const assets = catalog ?? (await readAssets(root, { hashFiles: false })).assets;
   const asset = assets.get(assetId);
   if (!asset) throw new FolioError('ASSET_NOT_FOUND', String(assetId).slice(0, 200));
   const file = asset.file;
@@ -62,6 +63,7 @@
   try {
     const info = await handle.stat();
     if (!info.isFile()) throw unavailable(assetId, 'not a file');
+    if (singleLink && info.nlink !== 1) throw unavailable(assetId, 'link');
     if (info.size > MAX_ASSET_BYTES) throw unavailable(assetId, 'too large');
     return { type, bytes: await handle.readFile() };
   } finally {
````

- [x] **Step 4: Run GREEN and validate.**

```bash
node --test test/core/export.test.js test/core/layout.test.js test/import/*.test.js test/server/import-tool.test.js
npm run lint
npm run typecheck
```

Expected: PASS. 새/변경 JS 300줄 이하, 기존 잠금과 읽기 전용 계약을 자가 검토한다.

- [x] **Step 5: Commit and report.**

```bash
git add core/export/assets.js core/export/epub.js core/export/export-work.js core/export/publish.js core/export/render.js core/export/source.js core/export/svg.js core/export/text.js core/export/web.js core/export/zip.js core/import/publish-work.js core/store/work.js core/util/publish-tree.js core/view/asset-file.js test/core/export.test.js test/support/export-work.js
git commit -m "feat: N8 task 2 web and EPUB export"
```

태스크 보고 파일에 RED/GREEN 명령·실제 결과·exit·커밋·자가 검토·우려를 기록한다.

## Task 3: 도구·기능·사용 안내와 통합 수용

**Files:**
- Modify: `core/work/features.js`
- Create: `docs/export.md`
- Modify: `server/tools/definitions.js`
- Modify: `server/tools/handlers.js`
- Modify: `skill/folio/SKILL.md`
- Create: `skill/folio/references/export.md`
- Modify: `test/core/features.test.js`
- Create: `test/server/export-tool.test.js`
- Modify: `test/server/feature-toggles.test.js`
- Modify: `test/server/occurrence-tools.test.js`
- Modify: `test/server/tools.test.js`

**Interfaces:** 소비: Task2 exportWork/checkExport. 생산: 기존 도구 끝 14번째 folio_export; layout/export는 FEATURES 끝에만, RUN_FEATURES 밖. 기본 op export/format web/variant main. check는 쓰지 않는다. 기존 뷰어·가져오기 동작을 유지한다.

- [x] **Step 1: Apply the complete test patch.**

````diff
diff --git a/test/core/features.test.js b/test/core/features.test.js
--- a/test/core/features.test.js
+++ b/test/core/features.test.js
@@ -17,7 +17,7 @@
   assert.deepEqual(config.features, {
     occurrences: true, occurrencesInExtract: true, occurrenceScope: false, rename: true, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
     viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true, viewerExport: true,
-    images: true, imageReferences: true, imageReview: true, variants: true, branching: true,
+    images: true, imageReferences: true, imageReview: true, variants: true, branching: true, layout: true, export: true,
   });
   assert.deepEqual(config.features, FEATURES);
   assert.ok(Object.isFrozen(FEATURES));
@@ -35,7 +35,7 @@
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false } }).config.features,
     { occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
       viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true, viewerExport: true,
-      images: true, imageReferences: true, imageReview: true, variants: true, branching: true });
+      images: true, imageReferences: true, imageReview: true, variants: true, branching: true, layout: true, export: true });
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false, rename: true } }).errors,
     [{ code: 'FEATURE_REQUIRES', feature: 'rename', requires: 'occurrences' }]);
   const detail = validateWorkConfig({ ...base, features: { occurrences: false, occurrencesInExtract: false, rename: false } }).errors;
diff --git a/test/server/export-tool.test.js b/test/server/export-tool.test.js
new file mode 100644
--- /dev/null
+++ b/test/server/export-tool.test.js
@@ -0,0 +1,50 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { writeFile, readFile, stat, mkdtemp, rm } from 'node:fs/promises';
+import { join } from 'node:path';
+import { tmpdir } from 'node:os';
+import { VIBELORE_FIXTURE, treeHashes } from '../support/import-source.js';
+import { createToolbox } from '../../server/toolbox.js';
+import { loadBuiltinPacks } from '../../packs/index.js';
+import { featuresDigest } from '../../core/work/features.js';
+import { openWork } from '../../core/store/work.js';
+import { exportFixture, sourceSnapshot } from '../support/export-work.js';
+import { editYaml } from '../support/recheck.js';
+test('마지막 folio_export 도구는 check를 읽기만 수행하고 web/epub을 새 외부 폴더에 낸다', async (t) => {
+  const f = await exportFixture(t), tools = createToolbox({ packs: await loadBuiltinPacks() }), before = await sourceSnapshot(f.root);
+  assert.equal(tools.tools.length, 14); assert.equal(tools.tools.at(-1).name, 'folio_export');
+  const checked = await tools.call('folio_export', { root: f.root, op: 'check' }); assert.equal(checked.ok, true); assert.equal(checked.result.nodes, 4);
+  assert.equal((await tools.call('folio_export', { root: f.root, op: 'check', language: 'en-US' })).result.language, 'en-US');
+  assert.equal((await tools.call('folio_export', { root: f.root, op: 'check', language: '한국어' })).error.code, 'EXPORT_LANGUAGE_INVALID');
+  assert.deepEqual(await sourceSnapshot(f.root), before);
+  for (const format of ['web', 'epub']) {
+    const out = await tools.call('folio_export', { root: f.root, format, output: f.output(format) }); assert.equal(out.ok, true); assert.equal(out.result.format, format);
+    assert.equal((await stat(join(out.result.output, 'manifest.json'))).isFile(), true);
+  }
+  const pdf = await tools.call('folio_export', { root: f.root, format: 'pdf', output: f.output('pdf') }); assert.equal(pdf.error.code, 'TOOL_INPUT_INVALID');
+  const missing = await tools.call('folio_export', { root: f.root }); assert.equal(missing.error.code, 'EXPORT_OUTPUT_INVALID');
+});
+test('export/layout 토글은 잠금·실행 digest를 바꾸지 않고 명시적으로 적용된다', async (t) => {
+  const f = await exportFixture(t), tools = createToolbox({ packs: await loadBuiltinPacks() });
+  const work = await openWork(f.root), beforeDigest = featuresDigest(work.config.features);
+  await writeFile(join(f.root, 'layout.yaml'), 'version: [broken');
+  await editYaml(f.root, (config) => { config.features = { layout: false }; });
+  const off = await tools.call('folio_export', { root: f.root, op: 'check' }); assert.equal(off.ok, true); assert.ok(off.result.warnings.some((w) => w.code === 'LAYOUT_DISABLED'));
+  assert.equal(featuresDigest((await openWork(f.root)).config.features), beforeDigest);
+  const original = await readFile(join(f.root, 'layout.yaml'), 'utf8'); assert.equal(original, 'version: [broken');
+  await editYaml(f.root, (config) => { config.features.export = false; });
+  assert.equal((await tools.call('folio_export', { root: f.root, op: 'check' })).error.code, 'FEATURE_DISABLED');
+  assert.equal(featuresDigest((await openWork(f.root)).config.features), beforeDigest);
+});
+
+test('합성 M7b 가져오기 뒤 그림·원고·가져오기 기록은 웹 내보내기에서도 보존된다', async (t) => {
+  const parent = await mkdtemp(join(tmpdir(), 'folio-import-export-')); t.after(() => rm(parent, { recursive: true, force: true }));
+  const tools = createToolbox({ packs: await loadBuiltinPacks() }), beforeSource = await treeHashes(VIBELORE_FIXTURE);
+  const imported = await tools.call('folio_import_vibelore', { root: join(parent, 'work'), from: VIBELORE_FIXTURE }); assert.equal(imported.ok, true);
+  const root = imported.result.root, before = await sourceSnapshot(root);
+  const out = await tools.call('folio_export', { root, output: join(parent, 'publication') }); assert.equal(out.ok, true, JSON.stringify(out.error));
+  const manifest = JSON.parse(await readFile(join(out.result.output, 'manifest.json'), 'utf8'));
+  assert.equal(manifest.assets.length, 2); assert.ok(manifest.warnings.some((w) => w.code === 'EXPORT_UNVERIFIED'));
+  const html = await readFile(join(out.result.output, 'index.html'), 'utf8'); assert.ok(html.includes('images/image-0.svg')); assert.ok(html.includes('images/image-1.svg'));
+  assert.deepEqual(await sourceSnapshot(root), before); assert.deepEqual(await treeHashes(VIBELORE_FIXTURE), beforeSource);
+});
diff --git a/test/server/feature-toggles.test.js b/test/server/feature-toggles.test.js
--- a/test/server/feature-toggles.test.js
+++ b/test/server/feature-toggles.test.js
@@ -29,7 +29,7 @@
   assert.deepEqual(values, {
     occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true,
     promiseScope: true, viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true, viewerExport: true,
-    images: true, imageReferences: true, imageReview: true, variants: true, branching: true,
+    images: true, imageReferences: true, imageReview: true, variants: true, branching: true, layout: true, export: true,
   });
   const renamed = await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' });
   assert.equal(code(renamed), 'FEATURE_DISABLED');
diff --git a/test/server/occurrence-tools.test.js b/test/server/occurrence-tools.test.js
--- a/test/server/occurrence-tools.test.js
+++ b/test/server/occurrence-tools.test.js
@@ -9,8 +9,8 @@
 const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
 const code = (out) => out.error?.code;

-test('thirteen tools, and folio_occurrences is one of them', () => {
-  assert.equal(TOOLS.length, 13);
+test('fourteen tools, and folio_occurrences is one of them', () => {
+  assert.equal(TOOLS.length, 14);
   assert.ok(TOOLS.some((t) => t.name === 'folio_occurrences'));
 });

diff --git a/test/server/tools.test.js b/test/server/tools.test.js
--- a/test/server/tools.test.js
+++ b/test/server/tools.test.js
@@ -24,9 +24,9 @@
   }
 }

-test('the tool list keeps its thirteen names in order and each tool requires an absolute root', () => {
+test('the tool list keeps its fourteen names in order and each tool requires an absolute root', () => {
   assert.deepEqual(BASE_TOOL_NAMES, ['folio_init', 'folio_status', 'folio_run', 'folio_resume', 'folio_decide', 'folio_structure', 'folio_find', 'folio_view']);
-  assert.deepEqual(TOOLS.map((t) => t.name), [...BASE_TOOL_NAMES, 'folio_occurrences', 'folio_sources', 'folio_config', 'folio_image', 'folio_import_vibelore']);
+  assert.deepEqual(TOOLS.map((t) => t.name), [...BASE_TOOL_NAMES, 'folio_occurrences', 'folio_sources', 'folio_config', 'folio_image', 'folio_import_vibelore', 'folio_export']);
   for (const tool of TOOLS) {
     assert.ok(tool.inputSchema.required.includes('root'), tool.name);
     assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
````

- [x] **Step 2: Run RED.**

```bash
node --test test/server/export-tool.test.js test/core/features.test.js test/server/tools.test.js test/server/feature-toggles.test.js test/server/occurrence-tools.test.js
```

Expected: FAIL. 새 모듈/도구/기능이 없거나 새 목록 기대값과 기존 값이 다르다.

- [x] **Step 3: Apply the complete implementation patch.**

````diff
diff --git a/core/work/features.js b/core/work/features.js
--- a/core/work/features.js
+++ b/core/work/features.js
@@ -30,6 +30,7 @@
  * - variants: 판본(번역·개정·요약) 실행(folio_run variant)과 folio_status 의 variants(N6). 판본은 work.yaml variants 로 선언해야 생긴다.
  *   끄면 판본 실행이 FEATURE_DISABLED(영수증까지 적힌 커밋은 잠금대로 끝맺는다), status.variants 는 null. main 실행에는 영향이 없어 RUN_FEATURES 밖이다.
  *   판본별 hash 일치·영수증 잠금은 이 값과 상관없이 늘 돈다.
+ * - layout/export: 읽기 전용 출판 투영과 지면. 노드 실행 digest 밖이며 잠금에 영향이 없다(N8).
  */
 export const FEATURES = Object.freeze({
   occurrences: true,
@@ -55,6 +56,8 @@
   imageReview: true,
   variants: true,
   branching: true,
+  layout: true,
+  export: true,
 });

 /** 켜려면 부모 기능도 켜져 있어야 하는 기능. 부모가 꺼지면 (명시적으로 true 가 아닌 한) 저절로 꺼진다. */
diff --git a/docs/export.md b/docs/export.md
new file mode 100644
--- /dev/null
+++ b/docs/export.md
@@ -0,0 +1,33 @@
+# 지면과 내보내기
+
+`folio_export`는 원고·설정·기록장을 읽기만 한다. 웹과 EPUB 출판물은 검사 영수증이 아니며 커밋이나 최신성 보증을 만들지 않는다. 잎 원고와 작품 제목이 없는 작품은 출판하지 않는다. 장면 제목이 빈 경우 표시 제목은 id다. 현재 초안·가져온 원고·손수정 원고도 내보낼 수 있고 경고와 본문 hash를 `manifest.json`에 남긴다.
+
+먼저 `folio_export { root, op: "check", format: "web", variant: "main" }`로 확인할 항목을 본다. 그다음 `folio_export { root, output: "/기존/부모/새폴더", format: "web" }`를 부른다. output은 작품 밖의 아직 없는 폴더이고 부모는 있어야 한다. 기존 출력은 덮지 않는다. 결과의 index.html을 열어 읽고 브라우저 인쇄에서 PDF로 저장한다. 엔진은 PDF 파일을 직접 생성하지 않는다.
+
+`format: "epub"`은 `book.epub`을 만든다. EPUB은 화면 크기에 따라 흐르는 형식이라 명시 지면 좌표를 적용하지 않는다고 경고한다. 지면에만 놓은 그림은 그림 부록에 포함한다. 특정 판본은 `variant: "en"`처럼 고른다. 출판 언어는 판본의 lang, 원본은 ko가 기본이다. 다른 원본 언어는 language: "en"처럼 명시한다. Intl이 지원하는 언어 태그만 받으며 부적절한 값은 거부한다. 모든 잎의 판본 원고가 있어야 하고 빠진 원고를 main으로 채우지 않는다.
+
+`layout.yaml`은 작가가 직접 쓰는 정본이다. 엔진은 좌표·원고를 자동 고치지 않는다. 예:
+
+```yaml
+version: 1
+page: { widthMm: 210, heightMm: 297, marginMm: 15 }
+pages:
+  - id: left
+    spreadId: opening
+    side: left
+    items:
+      - { nodeId: intro, xMm: 15, yMm: 15, widthMm: 180, heightMm: 100, maxChars: 700 }
+  - id: right
+    spreadId: opening
+    side: right
+    items:
+      - { assetId: cover, xMm: 15, yMm: 15, widthMm: 180, heightMm: 240, fit: contain }
+```
+
+nodeId는 잎 원고, assetId는 그림 설명서의 id다. 둘 중 하나만 쓴다. 펼침은 같은 spreadId의 left/right 두 페이지다. 노드는 한 번만 놓으며 그림은 반복해서 놓을 수 있다. 좌표와 크기는 mm다. 페이지·대상·숫자·상한 형식 오류는 거부한다. 겹침·페이지 밖·여백 침범·명시 maxChars 초과는 경고한다. maxChars는 글자 예산이며 실제 글꼴 조판을 보증하지 않는다. 인쇄 미리보기에서 넘침을 확인한다. 빠진 잎 원고는 경고와 함께 끝에 보존한다.
+
+제목·문단·울타리 코드, Folio 블록 번호/참조·각주·자료 인용·그림·게임북 선택지를 표시한다. 일반 Markdown 전체를 해석하지 않으며 미지원 문법은 글로 남긴다. 원문 HTML과 외부 링크는 실행하지 않는다. XML 금지 문자는 거부한다. 그림은 20MiB까지, 링크·특수 파일·작품 밖 경로는 거부한다. SVG는 정적 도형/글자/그룹/그라디언트 부분집합만 지원하고 스크립트·외부 참조·스타일시트·외부 개체·애니메이션을 거부한다. 일부 복잡한 정상 SVG는 지원되지 않을 수 있다.
+
+페이지 500, 전체 배치 항목·잎·그림·결과 파일 각각 5000, 출력 총 64MiB, layout.yaml 1MiB, 지면 경고 200개까지다. 상한을 넘으면 절단 사유 또는 실패를 명시한다. `features.export: false`는 도구를 끄고 `features.layout: false`는 지면을 적용하지 않으며 이유를 경고한다. 기존 실행/잠금 digest는 바뀌지 않는다.
+
+실패의 cleanupPending이 true이면 details.target/temp를 확인한다. 이 호출이 만든 바뀌지 않은 파일만 정리하며 타인이 넣은 파일은 보존한다. 성공의 EXPORT_TEMP_CLEANUP_PENDING은 결과는 완성됐고 임시 정리가 남았다는 뜻이다. 기존 `folio_view`의 검토 화면 정적 내보내기도 계속 쓸 수 있다.
diff --git a/server/tools/definitions.js b/server/tools/definitions.js
--- a/server/tools/definitions.js
+++ b/server/tools/definitions.js
@@ -76,4 +76,7 @@
     }, ['op']),
   tool('folio_import_vibelore', '작가가 고른 vibelore 작품 폴더(from: 절대 경로)를 새 Folio 작품(root: 아직 없는 폴더)으로 가져온다. 원본은 읽기만 한다. 정해진 회차·인물·세계·아크 계획·검사 영수증의 경로와 hash·모든 웹툰 episode.svg를 읽는다. 연재 프리셋과 novel·image 팩을 쓰며 모든 노드는 imported이다. 가져오기 기록은 Folio 검사 통과나 커밋 영수증이 아니다. 검사를 받으려면 노드마다 folio_run mode recommit. root가 이미 있거나 from 안이면 거부하며 건너뛴 파일은 warnings로 알린다. 결과 root는 정규화한 실제 경로다. 오류의 cleanupPending이 true이면 반환된 details.target과 details.temp를 각각 확인한다. 성공 결과의 IMPORT_TEMP_CLEANUP_PENDING은 작품이 게시됐고 임시 폴더 정리만 남았다는 뜻이다.',
     { from: { type: 'string', minLength: 1, maxLength: 4096 }, title: { type: 'string', maxLength: 200 } }, ['from']),
+  tool('folio_export', '읽기 전용 지면 검사와 출판 내보내기. op check는 파일을 쓰지 않고 layout.yaml과 선택 판본·그림을 확인한다. op export(기본)는 format web(기본) 또는 epub을 작품 밖의 새 output 절대 경로 폴더에 쓴다(부모 폴더는 있어야 한다). 기존 출력은 덮지 않는다. variant 기본 main; 누락 판본 원고를 main으로 채우지 않는다. 웹은 지면·펼침과 브라우저 인쇄 PDF를 지원하고 EPUB은 reflow라 명시 배치는 경고한다. 원고·기록장·영수증은 바꾸지 않는다. 경고는 원고 상태·분량·배치 등이며 내보내기는 검사 영수증이 아니다. 실패 cleanupPending이 true면 details.target/temp를 확인한다.',
+    { op: { type: 'string', enum: ['export', 'check'] }, format: { type: 'string', enum: ['web', 'epub'] }, variant: ID, language: { type: 'string', minLength: 1, maxLength: 35 }, output: { type: 'string', minLength: 1, maxLength: 4096 } }),
+
 ]);
diff --git a/server/tools/handlers.js b/server/tools/handlers.js
--- a/server/tools/handlers.js
+++ b/server/tools/handlers.js
@@ -1,5 +1,6 @@
 import { FolioError } from '../../core/errors.js';
 import { createRunner } from '../../core/run/runner.js';
+import { exportWork, checkExport } from '../../core/export/export-work.js';
 import { createRunStore } from '../../core/run/run-store.js';
 import { outcomeFromPending } from '../../core/run/steps/common.js';
 import { changeStructure } from '../../core/structure/locked.js';
@@ -53,5 +54,7 @@
     folio_config: ({ root, checkDraft, workKind, node }) => describeConfig(root, { packs, checkDraft, workKind, node }),
     folio_image: ({ root, op, ...args }) => imageTool(root, packs, { op, ...args }),
     folio_import_vibelore: ({ root, from, title }) => importVibelore(root, { from, title, packs }),
+    folio_export: ({ root, op = 'export', format = 'web', variant = 'main', language = null, output }) => op === 'check'
+      ? checkExport({ root, format, variant, language }) : exportWork({ root, format, variant, language, output }),
   };
 }
diff --git a/skill/folio/SKILL.md b/skill/folio/SKILL.md
--- a/skill/folio/SKILL.md
+++ b/skill/folio/SKILL.md
@@ -109,3 +109,5 @@
 ## 선택 경로 게임북

 게임북을 만들거나 분기 경로 요청을 받으면 [게임북 안내](references/gamebook.md)를 읽는다. `packs: ['gamebook']`, `preset: gamebook`으로 시작한다. 선택 연결과 진입·끝 표시는 작가가 앞머리에 적는다.
+
+지면·웹·EPUB·인쇄 PDF 내보내기는 [references/export.md](references/export.md)를 먼저 읽는다. 원고와 기록장을 바꾸지 않는 출판 절차다.
diff --git a/skill/folio/references/export.md b/skill/folio/references/export.md
new file mode 100644
--- /dev/null
+++ b/skill/folio/references/export.md
@@ -0,0 +1,11 @@
+# 출판 내보내기
+
+작가가 지면·웹·EPUB·인쇄 PDF를 원하면 이 절차를 따른다. 작품을 쓰거나 커밋하는 절차와 별개다.
+
+1. 원하는 판본과 형식을 확인하고 `folio_export op:check`로 경고를 본다. 판본 원고가 빠지면 해당 판본을 완성해야 하며 원본으로 섞어 채우지 않는다.
+2. 경고는 작가에게 설명한다. 지면은 작가의 layout.yaml을 정본으로 삼고 원고/좌표를 자동 수정하지 않는다. maxChars는 예산이며 실제 넘침은 인쇄 미리보기로 확인한다.
+3. 작품 밖 새 폴더를 output으로 골라 `folio_export`한다. 부모 폴더가 있어야 하며 기존 출력은 덮지 않는다. 읽기 전용으로 원고와 기록장을 보존한다.
+4. 웹은 index.html, EPUB은 book.epub을 연다. EPUB은 흐르는 지면이고 고정 배치가 적용되지 않는다는 경고를 알려 준다. PDF는 웹 결과의 브라우저 인쇄에서 저장한다. 엔진 PDF 생성으로 보고하지 않는다.
+5. 결과 manifest는 출판 provenance이며 검사 영수증이나 최신성 보증이 아니다. imported/draft/손수정 경고가 있으면 새 검사 통과로 말하지 않는다. cleanupPending 또는 EXPORT_TEMP_CLEANUP_PENDING이면 반환된 정확한 경로를 확인한다.
+
+자세한 데이터 모양·상한·지원 문법은 docs/export.md. 새 도구는 기존 13개 뒤 folio_export이며 기존 뷰어 정적 내보내기도 유지한다.
````

- [x] **Step 4: Run GREEN and validate.**

```bash
node --test test/server/export-tool.test.js test/core/features.test.js test/server/tools.test.js test/server/feature-toggles.test.js test/server/occurrence-tools.test.js
npm test
npm run lint
npm run typecheck
```

Expected: PASS. 새/변경 JS 300줄 이하, 기존 잠금과 읽기 전용 계약을 자가 검토한다.

- [x] **Step 5: Commit and report.**

```bash
git add core/work/features.js docs/export.md server/tools/definitions.js server/tools/handlers.js skill/folio/SKILL.md skill/folio/references/export.md test/core/features.test.js test/server/export-tool.test.js test/server/feature-toggles.test.js test/server/occurrence-tools.test.js test/server/tools.test.js
git commit -m "feat: N8 task 3 export tool and acceptance"
```

태스크 보고 파일에 RED/GREEN 명령·실제 결과·exit·커밋·자가 검토·우려를 기록한다.

## 최종 통합

가장 강한 독립 검토자가 전체 브랜치를 검토한다. 기존 IMPORT 공격·읽기 전용 snapshot·판본·출력 실패를 포함한 전체 suite를 구현자가 한 번 실행한다. 독립 unzip CRC와 XML parser로 합성 EPUB, 브라우저로 최종 웹·지면·인쇄를 확인한다. load-bearing 미해결 문제를 통합하지 않는다. 승인된 J5 main ff 통합 뒤 main npm run check. 원래 checkout은 바꾸지 않으며 증거를 main의 별도 scratch에 보존하고 native worktree를 보관한다.

## 계획 자기 검토·시험

전체 코드·인터페이스는 위 세 태스크에 대응한다. Node24 린트·타입·전체 1327/1327 통과. 각 태스크 시험은 RED exit1→GREEN exit0. 실제 그림 가져오기/내보내기, 원고·기록장 바이트 불변, 기존 IMPORT 공격도 포함한다. 외부 EPUB 검사와 브라우저 화면 확인은 구현 산출물에서 수행한다. 자세한 판정/생산·소비 표는 rulings 문서와 계획별 SDD ledger에 보존한다.
