import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS_CHECKERS } from '../../packs/variants/checkers/index.js';

const { 'blocks-kept': blocks, 'numbers-kept': numbers, paragraphs, terms } = VARIANTS_CHECKERS;
const ctx = (kind, original, draft, extra = {}) => ({ variant: { id: 'v', kind, lang: null }, original, draft, terms: [], ...extra });
const codes = (findings) => findings.map((f) => f.code);

test('every checker is silent outside a variant run (no original or variant in ctx)', () => {
  for (const run of Object.values(VARIANTS_CHECKERS)) assert.deepEqual(run({ draft: '1 [^1] {#fig-1}' }), []);
});

test('blocks-kept: omitted and added anchors, refs, footnotes and citations; a summary may drop marks but not add them', () => {
  const original = '세포 {#fig-1-1}\n[[block:fig-1-1]] 본문[^1] [[source:paper]]\n\n[^1]: 각주\n';
  assert.deepEqual(blocks(ctx('translation', original, 'Cell {#fig-1-1}\n[[block:fig-1-1]] text[^1] [[source:paper]]\n\n[^1]: note\n')), []);
  const dropped = blocks(ctx('translation', original, 'Cell {#fig-1-1}\ntext [[source:paper]] [[source:other]]\n'));
  assert.deepEqual(dropped.map((f) => [f.code, f.mark]), [['BLOCK_OMITTED', 'footnote:1'], ['BLOCK_OMITTED', 'note:1'], ['BLOCK_OMITTED', 'ref:fig-1-1'], ['BLOCK_ADDED', 'source:other']]);
  assert.deepEqual(codes(blocks(ctx('summary', original, 'Cells. [[source:other]]\n'))), ['BLOCK_ADDED']);
});

test('numbers-kept: reads numbers like the sources pack, ignores numbers inside block marks, lets a summary drop numbers', () => {
  const original = '1,100곳의 매장이 30% 늘었다 {#tbl-2-1}[^3].\n';
  assert.deepEqual(numbers(ctx('translation', original, '1100 stores grew by 30% {#tbl-2-1}[^3].\n')), []);
  const found = numbers(ctx('translation', original, 'Stores grew by 40%.\n'));
  assert.deepEqual(found.map((f) => [f.code, f.numbers]), [['NUMBER_OMITTED', ['1100', '30']], ['NUMBER_ADDED', ['40']]]);
  assert.deepEqual(codes(numbers(ctx('summary', original, '매장이 늘었다.'))), []);
  assert.deepEqual(codes(numbers(ctx('summary', original, '매장이 2배 늘었다.'))), ['NUMBER_ADDED']);
});

test('paragraphs: a translation keeps the paragraph count, a summary is shorter, a revision is free', () => {
  const original = '첫 문단.\n\n둘째 문단.\n';
  assert.deepEqual(paragraphs(ctx('translation', original, 'One.\r\n\r\nTwo.\n')), []);
  assert.deepEqual(paragraphs(ctx('translation', original, 'One. Two.\n')).map((f) => [f.code, f.was, f.now]), [['PARAGRAPH_COUNT', 2, 1]]);
  assert.deepEqual(codes(paragraphs(ctx('summary', original, '첫 문단과 둘째 문단을 길게 다시 말한 요약이다.'))), ['SUMMARY_NOT_SHORTER']);
  assert.deepEqual(paragraphs(ctx('summary', original, '두 문단.')), []);
  assert.deepEqual(paragraphs(ctx('revision', original, '하나로 합쳤다.')), []);
});

test('terms: a translation uses the mapped term and leaves no source term; revisions and summaries use the mapped term when the source term shows', () => {
  const pairs = [{ from: '하나', to: 'Hana' }, { from: '잠긴 문', to: 'the locked door' }];
  const original = '하나는 잠긴 문을 보았다.';
  assert.deepEqual(terms(ctx('translation', original, 'Hana saw the locked door.', { terms: pairs })), []);
  assert.deepEqual(terms(ctx('translation', original, '하나 saw a sealed door.', { terms: pairs })).map((f) => [f.code, f.term]), [
    ['TERM_NOT_USED', '하나'], ['TERM_LEFT', '하나'], ['TERM_NOT_USED', '잠긴 문'],
  ]);
  const same = [{ from: '마라', to: '마라 언니' }];
  assert.deepEqual(terms(ctx('revision', '마라가 왔다.', '마라 언니가 왔다.', { terms: same })), [], 'the mapped term contains the source term');
  assert.deepEqual(codes(terms(ctx('summary', '하나는 왔다.', '하나가 왔다.', { terms: pairs }))), ['TERM_INCONSISTENT']);
});
