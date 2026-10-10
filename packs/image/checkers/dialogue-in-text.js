/**
 * 대사 원문 대조(image.dialogue-in-text, 그림 생성 전 점검). 설명서 대사(dialogue[].text)가 그림이 붙는 노드 본문(NFC)에
 * 그대로 있어야 한다 — 그림 속 글자는 작품 언어 원문이어야 한다(정본 §14). 노드가 없는 그림은 대조할 글이 없어 지적하지 않는다.
 * @param {{ nodeText?: string|null, brief?: { dialogue?: Array<{ text: string }> } }} ctx
 */
export function dialogueInText(ctx) {
  if (typeof ctx?.nodeText !== 'string') return [];
  const text = ctx.nodeText.normalize('NFC');
  return (ctx.brief?.dialogue ?? []).filter((line) => !text.includes(line.text.normalize('NFC')))
    .map((line) => ({ code: 'DIALOGUE_NOT_IN_TEXT', quote: line.text, message: `대사 "${line.text}" 가 노드 본문에 없다` }));
}
