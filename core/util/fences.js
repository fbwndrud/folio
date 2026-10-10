const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * 코드 블록(``` 또는 ~~~ 울타리) 범위. 여는 울타리와 같은 글자로, 길이가 같거나 긴 줄(뒤에 공백만)이 닫는다.
 * 닫는 줄이 없으면 글 끝까지. 반환: [start, end) 글자 위치 목록(울타리 줄 포함).
 * 블록 앵커·등장 인용문·이름 스캔은 이 범위 안을 보지 않는다.
 */
export function fencedRanges(text) {
  const source = String(text);
  const ranges = [];
  let offset = 0;
  let open = null;
  for (const line of source.split('\n')) {
    const match = FENCE.exec(line);
    if (open) {
      if (match && match[1][0] === open.char && match[1].length >= open.len && line.slice(match[0].length).trim() === '') {
        ranges.push([open.start, offset + line.length]);
        open = null;
      }
    } else if (match) {
      open = { char: match[1][0], len: match[1].length, start: offset };
    }
    offset += line.length + 1;
  }
  if (open) ranges.push([open.start, source.length]);
  return ranges;
}

/** 코드 블록에 걸친 줄 번호(1부터). */
export function fencedLines(text) {
  const lines = new Set();
  let open = null;
  String(text).split('\n').forEach((line, index) => {
    const match = FENCE.exec(line);
    if (open) {
      lines.add(index + 1);
      if (match && match[1][0] === open.char && match[1].length >= open.len && line.slice(match[0].length).trim() === '') open = null;
    } else if (match) {
      open = { char: match[1][0], len: match[1].length };
      lines.add(index + 1);
    }
  });
  return lines;
}

/** [start, end) 가 어느 범위와 겹치는가. */
export const inRanges = (ranges, start, end = start + 1) => ranges.some(([a, b]) => start < b && end > a);

/** 범위 안 글자를 NUL 로 가린다(길이·위치는 그대로). */
export function maskRanges(text, ranges) {
  let out = String(text);
  for (const [a, b] of ranges) out = out.slice(0, a) + '\u0000'.repeat(b - a) + out.slice(b);
  return out;
}
