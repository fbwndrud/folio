import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_KINDS, blockKind, parseNodeMarks } from '../../core/blocks/syntax.js';
import { parseBlocks } from '../../core/store/blocks.js';

test('block kinds come from the id prefix; other anchors have no number kind', () => {
  assert.deepEqual(BLOCK_KINDS, { fig: '그림', tbl: '표', eq: '식' });
  assert.ok(Object.isFrozen(BLOCK_KINDS));
  assert.deepEqual(['fig-1-1', 'tbl-size', 'eq-energy', 'intro', 'Fig-1', 'figure-1', 'constructor', '__proto__-x'].map(blockKind),
    ['fig', 'tbl', 'eq', null, null, null, null, null]);
});

test('parseNodeMarks reads anchors with captions, block references, footnotes and source citations with line numbers', () => {
  const body = [
    '세포 모형 {#fig-cell}',
    '세포막은 [[block:fig-cell]]의 경계다[^size][^size]. 출처 [[source:cell-notes]].',
    '[^size]: 크기는 [[source:energy-review]] 기준이다. [^other]',
    '   [^other]:   들여 쓴 정의',
    '    [^deep]: 네 칸은 정의가 아니다',
    '두 앵커 {#intro} 와 {#tbl-a}',
  ].join('\n');
  const marks = parseNodeMarks(body);
  assert.deepEqual(marks, {
    anchors: [
      { id: 'fig-cell', line: 1, kind: 'fig', caption: '세포 모형', start: 6, end: 17 },
      { id: 'intro', line: 6, kind: null, caption: '두 앵커 와', start: 195, end: 203 },
      { id: 'tbl-a', line: 6, kind: 'tbl', caption: '두 앵커 와', start: 206, end: 214 },
    ],
    refs: [{ target: 'fig-cell', line: 2, start: 23, end: 41 }],
    footnoteRefs: [
      { id: 'size', line: 2, start: 46, end: 53 }, { id: 'size', line: 2, start: 53, end: 60 }, { id: 'other', line: 3, start: 132, end: 140 }, { id: 'deep', line: 5, start: 168, end: 175 },
    ],
    footnotes: [
      { id: 'size', line: 3, text: '크기는 [[source:energy-review]] 기준이다. [^other]', start: 88, end: 140 },
      { id: 'other', line: 4, text: '들여 쓴 정의', start: 144, end: 163 },
    ],
    citations: [{ sourceId: 'cell-notes', line: 2, start: 65, end: 86 }, { sourceId: 'energy-review', line: 3, start: 101, end: 125 }],
  });
  const slice = (item) => body.slice(item.start, item.end);
  assert.deepEqual(marks.anchors.map(slice), ['{#fig-cell}', '{#intro}', '{#tbl-a}']);
  assert.deepEqual([...marks.refs, ...marks.citations].map(slice), ['[[block:fig-cell]]', '[[source:cell-notes]]', '[[source:energy-review]]']);
  assert.deepEqual(marks.footnoteRefs.map(slice), ['[^size]', '[^size]', '[^other]', '[^deep]']);
  assert.deepEqual(marks.footnotes.map(slice), ['[^size]: 크기는 [[source:energy-review]] 기준이다. [^other]', '[^other]:   들여 쓴 정의']);
});

test('a CRLF footnote definition is still a definition, and its text drops the carriage return', () => {
  const marks = parseNodeMarks('본문[^a]\r\n[^a]: 정의\r\n');
  assert.deepEqual(marks.footnotes.map((f) => [f.id, f.text]), [['a', '정의']]);
  assert.deepEqual(marks.footnoteRefs.map((r) => r.id), ['a']);
});

test('nothing inside a code fence counts, an unclosed fence runs to the end, and anchors and refs agree with parseBlocks', () => {
  const body = ['앞 {#fig-a} [[block:fig-a]]', '```text', '{#fig-in-code} [[block:no]] [^no] [[source:no]]', '[^no]: 코드', '```', '뒤 {#fig-b}', '~~~', '{#fig-open}'].join('\n');
  const marks = parseNodeMarks(body);
  assert.deepEqual(marks.anchors.map((a) => a.id), ['fig-a', 'fig-b']);
  assert.deepEqual([marks.footnoteRefs, marks.footnotes, marks.citations], [[], [], []]);
  const old = parseBlocks(body);
  assert.deepEqual(marks.anchors.map(({ id, line }) => ({ id, line })), old.anchors);
  assert.deepEqual(marks.refs.map(({ target, line }) => ({ target, line })), old.refs);
});

test('captions are trimmed to 200 characters and an empty body gives empty lists', () => {
  const long = `${'가'.repeat(250)} {#fig-long}`;
  assert.equal(parseNodeMarks(long).anchors[0].caption.length, 200);
  assert.deepEqual(parseNodeMarks(''), { anchors: [], refs: [], footnoteRefs: [], footnotes: [], citations: [] });
});
