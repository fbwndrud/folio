import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webnovelFormat, WEBNOVEL_FORMAT_DEFAULTS } from '../../packs/novel/checkers/webnovel-format.js';
import { SUPPORTED_QUOTE_RE } from '../../packs/novel/checkers/text/serial-webnovel-rhythm.js';

const codes = (findings) => findings.map((f) => f.code);
const para = (n, text) => Array.from({ length: n }, () => text).join('\n\n');
/** 문장 하나 약 30자. */
const sentence = '서윤은 낡은 지도를 펼쳐 놓고 강줄기를 손끝으로 따라갔다.';

const clean = [
  '서윤은 낡은 지도를 펼쳐 놓고 강줄기를 손끝으로 따라갔다. 창밖에서는 바람이 불었다.',
  '"여기서 하룻밤 묵어야겠어."',
  '도현이 고개를 끄덕였다. 둘은 짐을 풀고 불을 피웠다.',
].join('\n\n');

test('webnovel-format: well-formed mobile prose passes in every mode', () => {
  assert.deepEqual(webnovelFormat({ draft: clean }), []);
  for (const mode of ['strict', 'relaxed', 'natural']) {
    assert.deepEqual(webnovelFormat({ draft: clean }, { dialogueBreakMode: mode }), [], mode);
  }
  assert.deepEqual(webnovelFormat({}), []);
  assert.deepEqual(webnovelFormat({ draft: '' }, WEBNOVEL_FORMAT_DEFAULTS), []);
});

test('webnovel-format: strict flags dialogue sharing a paragraph with narration, quoting it', () => {
  const mixed = '도현이 웃었다. "여기서 하룻밤 묵어야겠어."';
  const draft = `${clean}\n\n${mixed}`;
  const out = webnovelFormat({ draft });
  assert.deepEqual(codes(out), ['WEBNOVEL_DIALOGUE_NOT_ISOLATED']);
  assert.equal(out[0].quote, mixed);
  assert.equal(out[0].severity, undefined);
  // 두 대사가 한 문단에 붙어도 걸린다. 낫표 대사도 본다.
  assert.deepEqual(codes(webnovelFormat({ draft: '"가자." "그래."' })), ['WEBNOVEL_DIALOGUE_NOT_ISOLATED']);
  assert.deepEqual(codes(webnovelFormat({ draft: '그가 말했다. 「가자.」' })), ['WEBNOVEL_DIALOGUE_NOT_ISOLATED']);
  // 여러 줄 문단은 대사 분리를 보지 않는다(vibelore 와 같다).
  assert.deepEqual(webnovelFormat({ draft: '도현이 웃었다.\n"가자."' }), []);
});

test('webnovel-format: relaxed flags only dialogue buried in >100 chars of narration', () => {
  const short = '도현이 웃었다. "가자."';
  const long = `${sentence} ${sentence} ${sentence} ${sentence} "가자."`;
  const cfg = { dialogueBreakMode: 'relaxed' };
  assert.deepEqual(webnovelFormat({ draft: short }, cfg), []);
  assert.deepEqual(codes(webnovelFormat({ draft: long }, cfg)), ['WEBNOVEL_DIALOGUE_BURIED']);
  assert.deepEqual(webnovelFormat({ draft: long }, { dialogueBreakMode: 'natural' }), []);
});

test('webnovel-format: em-dash-only dialogue skips the quote isolation check', () => {
  assert.deepEqual(webnovelFormat({ draft: '— 가자, 그가 말했다.' }), []);
});

test('webnovel-format: dense paragraphs and long paragraph runs', () => {
  const dense = Array.from({ length: 22 }, () => sentence).join(' ');
  assert.ok(dense.length > 650);
  const out = webnovelFormat({ draft: dense });
  assert.deepEqual(codes(out), ['WEBNOVEL_DENSE_PARAGRAPH']);
  assert.match(out[0].message, /1번 \d+자\/22문장/);
  // 420자 초과이고 6문장 이상이면 과밀.
  const mid = Array.from({ length: 15 }, () => sentence).join(' ');
  assert.ok(mid.length > 420 && mid.length <= 650);
  assert.deepEqual(codes(webnovelFormat({ draft: mid })), ['WEBNOVEL_DENSE_PARAGRAPH']);
  // 300자 이상 문단 3개 연속.
  const long = Array.from({ length: 11 }, () => sentence).join(' ');
  assert.ok(long.length >= 300 && long.length <= 420);
  assert.deepEqual(codes(webnovelFormat({ draft: para(3, long) })), ['WEBNOVEL_LONG_PARAGRAPH_RUN']);
  assert.deepEqual(webnovelFormat({ draft: para(2, long) }), []);
  assert.deepEqual(webnovelFormat({ draft: para(3, long) }, { dialogueBreakMode: 'natural' }), []);
});

test('webnovel-format: choppy breaks when 70%+ of 12+ paragraphs are 18 chars or less', () => {
  const draft = para(12, '"비가 온다."');
  assert.deepEqual(codes(webnovelFormat({ draft })), ['WEBNOVEL_CHOPPY_BREAKS']);
  assert.deepEqual(webnovelFormat({ draft: para(11, '"비가 온다."') }), []);
  assert.deepEqual(webnovelFormat({ draft }, { dialogueBreakMode: 'natural' }), []);
});

test('webnovel-format: fragmented rhythm needs 16+ narration paragraphs, 65%+ short, a run of 6', () => {
  const shortLine = '그는 창가에 서서 먼 산을 오래도록 바라보고 있었다.';
  assert.ok(shortLine.length > 18 && shortLine.length <= 40);
  const out = webnovelFormat({ draft: para(16, shortLine) });
  assert.deepEqual(codes(out), ['WEBNOVEL_FRAGMENTED_RHYTHM']);
  assert.match(out[0].message, /16\/16개이고 16개 연속/);
  assert.deepEqual(webnovelFormat({ draft: para(15, shortLine) }), []);
  // 대사·시스템 알림 문단이 연속을 끊는다(연속 5 이하).
  const broken = Array.from({ length: 4 }, () => para(5, shortLine)).join('\n\n"그래."\n\n');
  assert.deepEqual(webnovelFormat({ draft: broken.replaceAll('"그래."', '[시스템 알림: 퀘스트 갱신]') }), []);
});

test('webnovel-format: soft line breaks in every mode (20+ breaks or 12+ multi-line paragraphs)', () => {
  const twoLines = '그는 문을 열었다.\n바람이 들어왔다.';
  const draft = para(12, twoLines);
  for (const mode of ['strict', 'relaxed', 'natural']) {
    const out = webnovelFormat({ draft }, { dialogueBreakMode: mode });
    assert.ok(codes(out).includes('WEBNOVEL_SOFT_LINEBREAKS'), mode);
  }
  assert.ok(!codes(webnovelFormat({ draft: para(11, twoLines) })).includes('WEBNOVEL_SOFT_LINEBREAKS'));
  const oneBlock = Array.from({ length: 21 }, () => '그는 문을 열었다.').join('\n');
  assert.ok(codes(webnovelFormat({ draft: oneBlock })).includes('WEBNOVEL_SOFT_LINEBREAKS'));
  // CRLF 줄바꿈도 같은 문단 경계로 본다.
  assert.deepEqual(webnovelFormat({ draft: clean.replaceAll('\n', '\r\n') }), []);
});

test('webnovel-format: an unknown dialogueBreakMode is reported and nothing else runs', () => {
  assert.deepEqual(codes(webnovelFormat({ draft: '"가자." "그래."' }, { dialogueBreakMode: 'loose' })), ['WEBNOVEL_CONFIG_INVALID']);
});

test('webnovel-format: curly-quoted dialogue is recognized and produces the same findings as straight quotes', () => {
  // Verify SUPPORTED_QUOTE_RE recognizes curly quotes
  assert.ok(SUPPORTED_QUOTE_RE.test('“가자.”'));
  // Two dialogue lines with curly quotes should produce DIALOGUE_NOT_ISOLATED like straight quotes
  const straightQuoted = '"가자." "그래."';
  const curlyQuoted = '“가자.” “그래.”';
  assert.deepEqual(codes(webnovelFormat({ draft: straightQuoted })), codes(webnovelFormat({ draft: curlyQuoted })));
  assert.deepEqual(codes(webnovelFormat({ draft: straightQuoted })), ['WEBNOVEL_DIALOGUE_NOT_ISOLATED']);
});
