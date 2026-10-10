import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateLayout } from '../../core/layout/validate.js';
import { readLayout } from '../../core/layout/read.js';
const work = { tree: { nodes: new Map([['a', { id: 'a', kind: 'leaf', body: '합성 원고' }], ['branch', { kind: 'branch' }]]) }, assets: new Map([['pic', {}]]) };
const item = () => ({ nodeId: 'a', xMm: 10, yMm: 10, widthMm: 80, heightMm: 80 });
const layout = () => ({ version: 1, page: { widthMm: 100, heightMm: 100, marginMm: 5 }, pages: [{ id: 'p1', items: [item()] }] });
test('지면은 바꾸지 않고 분량·중첩·영역 경고와 펼침을 검증한다', () => {
  const input = layout(); input.pages[0].items[0].maxChars = 1;
  input.pages[0].items.push({ assetId: 'pic', xMm: 20, yMm: 20, widthMm: 90, heightMm: 90 });
  const before = structuredClone(input), out = validateLayout(input, work);
  assert.deepEqual(input, before); assert.equal(out.layout, input);
  for (const code of ['LAYOUT_TEXT_BUDGET', 'LAYOUT_OVERLAP', 'LAYOUT_OUTSIDE_PAGE', 'LAYOUT_MARGIN']) assert.ok(out.problems.some((p) => p.code === code));
  input.pages[0].spreadId = 'spread'; input.pages[0].side = 'left';
  assert.throws(() => validateLayout(input, work), { code: 'LAYOUT_INVALID' });
  input.pages.push({ id: 'p2', spreadId: 'spread', side: 'right', items: [] });
  assert.equal(validateLayout(input, work).layout.pages.length, 2);
});
test('형식·숫자·대상·중복·상한 오류는 fail closed다', () => {
  for (const mutate of [
    (x) => { x.page.widthMm = NaN; }, (x) => { x.page.marginMm = 50; },
    (x) => { x.pages[0].items[0].nodeId = 'branch'; }, (x) => { x.pages[0].items[0].assetId = 'pic'; },
    (x) => { x.pages[0].items[0].widthMm = 0; }, (x) => { x.pages[0].items.push(item()); },
    (x) => { x.unknown = true; }, (x) => { x.pages = Array.from({ length: 501 }, (_, i) => ({ id: `p${i}`, items: [] })); },
    (x) => { x.pages[0].items = Array.from({ length: 5001 }, item); },
  ]) { const input = layout(); mutate(input); assert.throws(() => validateLayout(input, work), { code: 'LAYOUT_INVALID' }); }
  const input = layout(); input.pages[0].items = Array.from({ length: 30 }, (_, i) => ({ assetId: 'pic', xMm: i, yMm: 0, widthMm: 100, heightMm: 100 }));
  const out = validateLayout(input, work); assert.equal(out.problems.length, 200); assert.equal(out.problems.at(-1).code, 'LAYOUT_PROBLEMS_TRUNCATED');
});
test('없는 지면은 선택 사항이고 링크·큰 파일·깨진 YAML을 읽지 않는다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'folio-layout-')); const path = join(root, 'layout.yaml');
  try {
    assert.deepEqual(await readLayout(root, work), { layout: null, problems: [] });
    await writeFile(join(root, 'outside'), 'version: 1'); await symlink(join(root, 'outside'), path);
    await assert.rejects(readLayout(root, work), { code: 'LAYOUT_INVALID' }); await rm(path);
    await writeFile(path, 'a'.repeat(1048577)); await assert.rejects(readLayout(root, work), { code: 'LAYOUT_INVALID' });
    await writeFile(path, 'version: [broken'); await assert.rejects(readLayout(root, work), { code: 'LAYOUT_INVALID' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
