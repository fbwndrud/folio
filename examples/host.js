/** 미리 작성한 합성 입력을 반환하는 호스트. 실제 모델 검토나 품질 평가는 하지 않는다. */
export function answerRequest(request, scenario) {
  const payload = request.payload;
  const node = scenario.nodes[payload.node.id];
  if (!node) throw new Error(`example has no input for ${payload.node.id}`);
  if (request.purpose === 'check') {
    return JSON.stringify({ checked: payload.checks.map((check) => check.checkId), findings: [] });
  }
  if (request.purpose !== 'generate') throw new Error(`example refuses unexpected ${request.purpose}`);
  if (payload.produces === 'plan') return node.plan;
  if (payload.produces === 'children') return JSON.stringify({ children: node.children });
  if (payload.produces === 'draft') return node.draft;
  if (payload.produces === 'events') return JSON.stringify(node.extract);
  throw new Error(`example cannot answer ${payload.produces}`);
}
