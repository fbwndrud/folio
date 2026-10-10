import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fencedLines, fencedRanges, inRanges, maskRanges } from '../../core/util/fences.js';
import { parseBlocks } from '../../core/store/blocks.js';
import { scanMentions } from '../../core/index/scan.js';

const TEXT = ['앞 {#fig-1}', '```js', 'const a = "{#fig-2} [[block:fig-9]] 마라";', '```', '뒤 [[block:fig-1]] 마라', '~~~~', '안 마라', '~~~', '여전히 안 마라'].join('\n');

test('fenced ranges cover backtick and tilde fences, need a closing fence at least as long, and run to the end if unclosed', () => {
  assert.deepEqual([...fencedLines(TEXT)], [2, 3, 4, 6, 7, 8, 9]);
  const ranges = fencedRanges(TEXT);
  assert.equal(ranges.length, 2);
  assert.equal(TEXT.slice(ranges[0][0], ranges[0][1]), '```js\nconst a = "{#fig-2} [[block:fig-9]] 마라";\n```');
  assert.equal(ranges[1][1], TEXT.length);
  assert.equal(inRanges(ranges, ranges[0][0], ranges[0][0] + 1), true);
  assert.equal(inRanges(ranges, 0, 2), false);
  assert.equal(maskRanges('ab ``` x', fencedRanges('ab ``` x')), 'ab ``` x');
  assert.equal(maskRanges('```\nx\n```\ny', fencedRanges('```\nx\n```\ny')), '\u0000'.repeat(9) + '\ny');
});

test('parseBlocks skips anchors and refs inside code fences', () => {
  assert.deepEqual(parseBlocks(TEXT), { anchors: [{ id: 'fig-1', line: 1 }], refs: [{ target: 'fig-1', line: 5 }] });
});

test('scanMentions ignores names inside code fences', () => {
  assert.deepEqual(Object.fromEntries(scanMentions(TEXT, [{ id: 'mara', name: '마라', aliases: [] }])), { mara: 1 });
});
