const norm = (value) => String(value).normalize('NFC').trim().toLowerCase();

/**
 * 보여줄 것과 금지가 겹침(image.show-conflict, 그림 생성 전 점검). mustShow 와 mustNotShow 에 같은 항목(NFC·앞뒤 공백·대소문자 무시)이 있으면 알린다.
 * @param {{ brief?: { mustShow?: string[], mustNotShow?: string[] } }} ctx
 */
export function showConflict(ctx) {
  const banned = new Set((ctx?.brief?.mustNotShow ?? []).map(norm));
  return [...new Set((ctx?.brief?.mustShow ?? []).filter((item) => banned.has(norm(item))))]
    .map((item) => ({ code: 'SHOW_CONFLICT', quote: item, message: `"${item}" 가 꼭 보여줄 것과 보여주면 안 될 것에 함께 있다` }));
}
