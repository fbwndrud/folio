/**
 * 대사 가리기 — 따옴표 짝 안(따옴표 포함)을 공백으로 바꾼다. 글자 위치는 그대로라 찾은 자리를 원고에서 그대로 인용할 수 있다.
 * 낱말 안 아포스트로피(Don't, O'Brien)는 따옴표로 보지 않는다.
 * vibelore engine/src/continuity/pov-check.js(stripDialogue) 의 뜻을 옮김.
 */
const QUOTE_PAIRS = [['"', '"'], ['“', '”'], ["'", "'"], ['‘', '’'], ['「', '」'], ['『', '』']];

const isLetter = (ch) => typeof ch === 'string' && ch.length > 0 && /\p{L}/u.test(ch);

/** 낱말 안·낱말 끝 아포스트로피인가. */
function isWordApostrophe(chars, i, mark) {
  if (mark !== "'" && mark !== '’') return false;
  const prev = i > 0 ? chars[i - 1] : '';
  const next = i + 1 < chars.length ? chars[i + 1] : '';
  if (isLetter(prev) && isLetter(next)) return true;
  return isLetter(prev) && (next === '' || /\s/.test(next) || /[.,!?;:”"]/.test(next));
}

function blankSameMark(chars, mark) {
  let inside = false;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === mark) {
      if (isWordApostrophe(chars, i, mark)) continue;
      chars[i] = ' ';
      inside = !inside;
    } else if (inside) {
      chars[i] = ' ';
    }
  }
}

function blankPair(chars, open, close) {
  let depth = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === open) {
      if (isWordApostrophe(chars, i, open)) continue;
      depth++;
      chars[i] = ' ';
    } else if (chars[i] === close && depth > 0) {
      if (isWordApostrophe(chars, i, close)) continue;
      depth--;
      chars[i] = ' ';
    } else if (depth > 0) {
      chars[i] = ' ';
    }
  }
}

/** @param {string} text */
export function stripDialogue(text) {
  const chars = text.split('');
  for (const [open, close] of QUOTE_PAIRS) {
    if (open === close) blankSameMark(chars, open);
    else blankPair(chars, open, close);
  }
  return chars.join('');
}
