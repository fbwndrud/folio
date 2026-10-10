import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_CHARS, matchesOf, reanchor, resolveQuote } from '../../core/occurrences/anchor.js';

const NOVEL = '비가 그친 옥상에서 하나는 잠긴 문을 보았다. 도윤이 뒤에서 불렀다. 하나는 대답하지 않았다.';
const BOOK = '세포막은 바깥 경계다. 막을 지나는 물질은 ATP를 쓴다. 자세한 원리는 에너지 장에서 다룬다.';

test('resolveQuote: a unique quote gets engine-cut context of 30 chars each side', () => {
  const found = resolveQuote(BOOK, { quote: 'ATP를 쓴다' });
  assert.equal(found.ok, true);
  assert.equal(BOOK.slice(found.start, found.start + 'ATP를 쓴다'.length), 'ATP를 쓴다');
  assert.equal(found.before, BOOK.slice(Math.max(0, found.start - CONTEXT_CHARS), found.start));
  assert.equal(found.after.length <= CONTEXT_CHARS, true);
});

test('resolveQuote: a repeated quote needs context, and wrong context or a missing quote is refused', () => {
  assert.deepEqual(resolveQuote(NOVEL, { quote: '하나는' }), { ok: false, code: 'OCCURRENCE_AMBIGUOUS', count: 2 });
  const second = resolveQuote(NOVEL, { quote: '하나는', before: '불렀다. ' });
  assert.equal(second.ok, true);
  assert.equal(second.start, NOVEL.lastIndexOf('하나는'));
  assert.equal(resolveQuote(NOVEL, { quote: '하나는', after: ' 잠긴' }).start, NOVEL.indexOf('하나는'));
  assert.deepEqual(resolveQuote(NOVEL, { quote: '하나는', before: '없는 문맥' }), { ok: false, code: 'OCCURRENCE_CONTEXT_MISMATCH' });
  assert.deepEqual(resolveQuote(NOVEL, { quote: '마라' }), { ok: false, code: 'OCCURRENCE_QUOTE_NOT_FOUND' });
  for (const bad of [{ quote: '' }, { quote: 5 }, { quote: 'x'.repeat(501) }, { quote: '하나는', before: 3 }]) {
    assert.deepEqual(resolveQuote(NOVEL, bad), { ok: false, code: 'OCCURRENCE_QUOTE_INVALID' });
  }
});

test('matchesOf ignores quotes inside code fences', () => {
  assert.deepEqual(matchesOf('```\n하나는\n```\n하나는', '하나는'), [12]);
});

const stored = (text, quote, nth = 0) => {
  const starts = matchesOf(text, quote);
  const found = resolveQuote(text, { quote, before: text.slice(Math.max(0, starts[nth] - CONTEXT_CHARS), starts[nth]) });
  return { quote, before: found.before, after: found.after };
};

test('reanchor after edits: same text, text added far away, context edited, quote deleted, quote duplicated', () => {
  for (const text of [NOVEL, BOOK]) {
    const quote = text === NOVEL ? '잠긴 문을' : 'ATP를 쓴다';
    const occ = stored(text, quote);
    assert.deepEqual(reanchor(text, occ), { status: 'located', start: text.indexOf(quote) });
    // 두 fixture 모두 인용문의 저장된 before가 CONTEXT_CHARS보다 짧다(원문 앞머리 근처라 30자를 다 채우지
    // 못했다). Ruling A3-4에 따라 그런 before는 "지금 후보의 앞 글 전체가 그 값과 정확히 같아야" 온전한데,
    // 문단을 맨 앞에 추가하면 전체 앞머리가 길어져 더는 같지 않다. after(둘 다 30자 또는 문서 끝까지 도달한
    // 문맥)는 삽입과 무관해 그대로 온전하므로 relocated로 내려간다 — located라고 우기지 않는 것이 맞다.
    const prefixed = `새로 넣은 첫 문단.\n\n${text}`;
    assert.deepEqual(reanchor(prefixed, occ), { status: 'relocated', start: prefixed.indexOf(quote) });
    const edited = text.replace(text === NOVEL ? '하나는 잠긴' : '물질은 ATP', text === NOVEL ? '하나가 잠긴' : '분자는 ATP');
    assert.equal(reanchor(edited, occ).status, 'relocated');
    assert.deepEqual(reanchor(text.replace(quote, '다른 말'), occ), { status: 'stale', start: null, reason: 'QUOTE_MISSING' });
    assert.deepEqual(reanchor(`${text}\n${text}`, occ), { status: 'stale', start: null, reason: 'AMBIGUOUS' });
  }
});

test('reanchor picks the copy whose context survives when a quote appears twice', () => {
  const occ = stored(NOVEL, '하나는', 1);
  const moved = NOVEL.replace('비가 그친', '눈이 쌓인');
  assert.deepEqual(reanchor(moved, occ), { status: 'located', start: moved.lastIndexOf('하나는') });
});

test('resolveQuote: overlapping matches of a repeating quote are ambiguous at submit', () => {
  assert.deepEqual(resolveQuote('aaaa', { quote: 'aaa' }), { ok: false, code: 'OCCURRENCE_AMBIGUOUS', count: 2 });
});

test('matchesOf refuses a quote that straddles a fence boundary', () => {
  const text = '문장 시작\n```\n코드\n```\n문장 끝';
  assert.deepEqual(matchesOf(text, '시작\n```'), []);
});

test("reanchor: deleting the anchored occurrence does not relocate to another copy with unrelated context", () => {
  const second = resolveQuote(NOVEL, { quote: '하나는', before: '불렀다. ' });
  const occ = { quote: '하나는', before: second.before, after: second.after };
  const edited = NOVEL.replace('하나는 대답하지 않았다.', '고개를 돌렸다.');
  assert.deepEqual(reanchor(edited, occ), { status: 'stale', start: null, reason: 'WEAK_CONTEXT' });
});

test('reanchor: a quote found in unrelated text with no matching context is weak, not relocated', () => {
  const occ = stored(NOVEL, '하나는', 0);
  assert.deepEqual(reanchor('전혀 다른 글. 하나는 웃었다.', occ), { status: 'stale', start: null, reason: 'WEAK_CONTEXT' });
});

test('reanchor: a start-of-text quote relocates when only the tail context changes (empty before stays full)', () => {
  const text = 'ATP는 세포의 언어다. 그 뒤에 이어지는 설명이 계속된다.';
  const found = resolveQuote(text, { quote: 'ATP는' });
  assert.equal(found.before, '');
  const occ = { quote: 'ATP는', before: found.before, after: found.after };
  const edited = text.replace('그 뒤에 이어지는 설명이 계속된다.', '완전히 새로운 문장이 붙는다.');
  assert.deepEqual(reanchor(edited, occ), { status: 'relocated', start: 0 });
});

test('resolveQuote and reanchor refuse non-string text without coercing it', () => {
  assert.deepEqual(resolveQuote(42, { quote: '하나는' }), { ok: false, code: 'OCCURRENCE_QUOTE_INVALID' });
  assert.deepEqual(reanchor(42, { quote: '하나는' }), { status: 'stale', start: null, reason: 'INVALID' });
  assert.deepEqual(reanchor(NOVEL, { quote: '하나는', before: 3 }), { status: 'stale', start: null, reason: 'INVALID' });
});

test('reanchor refuses a non-object occurrence and an empty quote instead of throwing', () => {
  for (const bad of [undefined, null, 'not-an-object', 5]) {
    assert.deepEqual(reanchor(NOVEL, bad), { status: 'stale', start: null, reason: 'INVALID' });
  }
  assert.deepEqual(reanchor(NOVEL, { quote: '' }), { status: 'stale', start: null, reason: 'INVALID' });
});

test('reanchor: a stored before shorter than CONTEXT_CHARS must equal the whole new prefix exactly, not just end with it', () => {
  // 원문이 짧아 before가 30자를 다 못 채운 경우('그. ' 뿐), 새 글에서 실제로 그 자리 앞에 훨씬 많은 글이
  // 붙으면(문장 구조가 통째로 달라지면) 그 앞 문맥은 더 이상 "온전"하지 않다 — endsWith만으로는 우연히 같은
  // 꼬리를 가진 다른 문맥과 구별할 수 없기 때문이다. 뒤 문맥도 완전히 다른 문장이라 온전하지 않으므로
  // 온전한 쪽이 하나도 없어 stale(WEAK_CONTEXT)다.
  const original = '그. 하나는 창밖을 보았다.';
  const found = resolveQuote(original, { quote: '하나는' });
  assert.equal(found.before, '그. ');
  const occ = { quote: '하나는', before: found.before, after: found.after };
  const rewritten = '서문이다. 완전히 새 글. 그. 하나는 밥을 먹었다.';
  assert.deepEqual(reanchor(rewritten, occ), { status: 'stale', start: null, reason: 'WEAK_CONTEXT' });
});

// before('\n', 1자)는 새 글에서 깨지지만 after(' 웃었다.', 5자)는 그대로 남는다 — 뒤 문맥 쪽이 온전하므로
// (Ruling A3-5) relocated가 맞다: 짧은 문맥이라도 한쪽이 경계까지 정확히 남아 있으면 그 후보를 받는다.
test('reanchor: an edit right before a whole-document-bounded occurrence (before fails, short after still matches exactly)', () => {
  const original = '\n하나는 웃었다.';
  const found = resolveQuote(original, { quote: '하나는' });
  assert.equal(found.before, '\n');
  const occ = { quote: '하나는', before: found.before, after: found.after };
  const rewritten = '다른 장면.\n하나는 웃었다.';
  assert.deepEqual(reanchor(rewritten, occ), { status: 'relocated', start: rewritten.lastIndexOf('하나는') });
});
