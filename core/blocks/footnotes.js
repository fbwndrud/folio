/**
 * 노드 하나의 각주 번호(GFM 과 같은 규칙). 번호는 노드 안에서 처음 참조된 차례대로 1부터다.
 * - 같은 id 의 정의가 둘 이상이면 앞의 것을 쓰고 뒤의 것마다 FOOTNOTE_DUPLICATE.
 * - 정의가 없는 참조는 나올 때마다 FOOTNOTE_UNDEFINED. 참조가 없는 정의는 FOOTNOTE_UNUSED(번호 없음).
 * 오류로 막지 않고 문제로 돌려준다(core/store/blocks.js validateBlocks 와 같은 방식).
 * @param {string} nodeId
 * @param {{ footnoteRefs: Array<{ id: string, line: number }>, footnotes: Array<{ id: string, line: number, text: string }> }} marks core/blocks/syntax.js parseNodeMarks 결과
 */
export function numberFootnotes(nodeId, marks) {
  const definitions = new Map();
  const problems = [];
  for (const definition of marks.footnotes) {
    if (definitions.has(definition.id)) problems.push({ code: 'FOOTNOTE_DUPLICATE', nodeId, id: definition.id, line: definition.line });
    else definitions.set(definition.id, definition);
  }
  const notes = new Map();
  for (const ref of marks.footnoteRefs) {
    const definition = definitions.get(ref.id);
    if (!definition) { problems.push({ code: 'FOOTNOTE_UNDEFINED', nodeId, id: ref.id, line: ref.line }); continue; }
    if (!notes.has(ref.id)) notes.set(ref.id, { nodeId, id: ref.id, number: notes.size + 1, line: definition.line, text: definition.text, refs: [] });
    notes.get(ref.id).refs.push(ref.line);
  }
  for (const definition of definitions.values()) {
    if (!notes.has(definition.id)) problems.push({ code: 'FOOTNOTE_UNUSED', nodeId, id: definition.id, line: definition.line });
  }
  return { footnotes: [...notes.values()], problems };
}
