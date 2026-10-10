/**
 * 모델 대신 답하는 가짜 호스트. script 값은 노드 id(또는 '*')별 값이나 (payload) => 값 함수다.
 * 검사 요청은 단계 id(critic/fit/review/...)별 함수로 답한다.
 */
export function createFakeHost(script = {}) {
  const s = { plans: {}, drafts: {}, events: {}, children: {}, revisions: {}, ...script };
  const calls = [];
  const pick = (table, payload) => {
    const value = table?.[payload.node.id] ?? table?.['*'];
    return typeof value === 'function' ? value(payload) : value;
  };
  function respond(request) {
    const p = request.payload;
    calls.push({ purpose: request.purpose, stepId: request.stepId, nodeId: p.node.id, payload: p });
    if (request.purpose === 'generate') {
      if (p.produces === 'plan') return pick(s.plans, p) ?? `${p.node.title || p.node.id} 계획`;
      if (p.produces === 'draft') return pick(s.drafts, p) ?? `${p.node.title || p.node.id} 본문`;
      if (p.produces === 'events') return JSON.stringify(pick(s.events, p) ?? { events: [],
        ...(p.tracking ? { tracking: { planRev: p.tracking.plan.rev, discoveries: { subjects: [], criteria: [] }, observations: [],
          checked: p.tracking.plan.criteria.filter((c) => c.appliesTo === 'all' || c.appliesTo.includes(p.node.id)).map((c) => c.id) } } : {}),
      });
      if (p.produces === 'children') return JSON.stringify({ children: pick(s.children, p) ?? [] });
    }
    if (request.purpose === 'revise' || request.purpose === 'user_revision') return pick(s.revisions, p) ?? p.draft;
    if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: (s[p.step] ?? (() => []))(p), ...(s.reviewer ? { reviewer: s.reviewer } : {}) });
    throw new Error(`fake host cannot answer ${request.purpose}/${p.produces}`);
  }
  return { calls, answer: (outcome) => Object.fromEntries(outcome.requests.map((r) => [r.requestId, respond(r)])) };
}

/** 매 호출마다 새 실행기를 만든다 — 메모리 상태 없이 파일만으로 이어지는지 함께 검증한다. */
export async function driveToEnd(makeRunner, host, {
  start = { node: 'next' }, from = null, user = () => ({ action: 'approve' }),
  until = (o) => o.status === 'idle', maxSteps = 2000,
} = {}) {
  const trail = [];
  let outcome = from ?? await makeRunner().run(start);
  for (let i = 0; i < maxSteps; i += 1) {
    trail.push(outcome);
    if (until(outcome) || outcome.status === 'idle' || outcome.status === 'skipped') return trail;
    if (outcome.status === 'needs_model') outcome = await makeRunner().resume({ runId: outcome.runId, answers: host.answer(outcome) });
    else if (outcome.status === 'needs_user') outcome = await makeRunner().decide({ runId: outcome.runId, ...user(outcome) });
    else if (outcome.status === 'done') outcome = await makeRunner().run({ node: 'next' });
    else throw new Error(`unexpected outcome ${outcome.status}`);
  }
  throw new Error('driveToEnd exceeded maxSteps');
}

export const label = (o) => (o.status === 'needs_model' ? `model:${o.requests[0].stepId}`
  : o.status === 'needs_user' ? `user:${o.question.kind}` : o.status);
