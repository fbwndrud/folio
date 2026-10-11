import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const TEXT = '파란 열쇠는 문 옆에 있다. 탁자도 있다.';
export const textHash = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
export const SCENARIOS = ['mystery', 'cookbook', 'picturebook'];

export function planFor(scenario) {
  const declarations = {
    mystery: ['물건의 위치를 추적한다', 'object', 'location', '위치', 'text', 'state'],
    cookbook: ['조리 단계의 온도를 추적한다', 'recipe-stage', 'temperature', '온도', 'number', 'state'],
    picturebook: ['주인공 외투 색을 유지한다', 'character', 'coat-color', '외투 색', 'text', 'fixed'],
  };
  const [purpose, kind, id, title, valueType, behavior] = declarations[scenario];
  return { planId: 'main', purpose, audience: '합성 초보 독자', priorities: [title], subjectKinds: [kind],
    criteria: [{ id, title, instruction: purpose, subjectKinds: [kind], valueType, behavior, appliesTo: 'all',
      ...(behavior === 'fixed' ? { expectedValue: '파랑' } : {}) }],
    delegation: { addSubjects: true, addCriteria: false, addObservations: true, backfill: false },
    interview: { summary: purpose, answers: [{ question: '무엇을 유지할까요?', answer: title }] } };
}

/** 실제 공개 bin과 stdio. 합성 답변 외에는 엔진을 대체하지 않는다. */
export async function connectSyntheticMcp() {
  const repo = join(import.meta.dirname, '..');
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [join(repo, 'bin/linivera-mcp.js')], cwd: repo, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  const client = new Client({ name: 'folio-synthetic-tracking', version: '1.0.0' });
  await client.connect(transport);
  async function raw(name, args) {
    const response = await client.callTool({ name, arguments: args });
    return { isError: !!response.isError, body: JSON.parse(response.content[0].text) };
  }
  async function call(name, args) {
    const result = await raw(name, args);
    assert.equal(result.isError, false, `${name}: ${JSON.stringify(result.body)}`);
    return result.body;
  }
  return { client, call, raw, close: async () => { await client.close(); assert.equal(stderr, ''); } };
}

function answer(request, { discover = false, value = null } = {}) {
  const p = request.payload;
  if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
  if (p.produces === 'plan') return '합성 장면에서 파란 열쇠를 살펴본다.';
  if (p.produces === 'draft') return TEXT;
  assert.equal(p.produces, 'events', `unexpected synthetic request: ${request.purpose}`);
  const body = p.draft ?? p.node.body;
  const evidence = { nodeId: p.node.id, textHash: textHash(body), quote: '파란 열쇠' };
  const tracking = p.tracking ? { planRev: p.tracking.plan.rev, checked: ['location'],
    discoveries: { subjects: discover ? [{ id: 'key', kind: 'object', name: '파란 열쇠',
      aliases: [], body: '합성 추적 대상', data: {}, evidence }] : [], criteria: [] },
    observations: value === null ? [] : [{ subjectId: 'key', criterionId: 'location', value, basis: 'explicit', evidence }] } : null;
  return JSON.stringify({ events: [], appearances: value === null ? [] : ['key'], mentions: [], occurrences: [],
    ...(tracking ? { tracking } : {}) });
}

/** 이 fixture 안에서만 미리 정한 작가 결정을 제출한다. 실제 호스트는 실제 응답을 기다린다. */
export async function driveSynthetic(folio, root, node, options = {}) {
  let outcome = await folio.call('folio_run', { root, node, ...(options.mode ? { mode: options.mode } : {}) });
  let sawMetadataDecision = false;
  for (let turn = 0; turn < 30; turn += 1) {
    if (outcome.status === 'done') return { outcome, sawMetadataDecision };
    if (outcome.status === 'needs_model') {
      for (const request of outcome.requests) await options.inspect?.(request);
      outcome = await folio.call('folio_resume', { root, runId: outcome.runId,
        answers: Object.fromEntries(outcome.requests.map((request) => [request.requestId, answer(request, options)])) });
    } else {
      assert.equal(outcome.status, 'needs_user', JSON.stringify(outcome));
      assert.ok(['approve', 'tracking_metadata'].includes(outcome.question.kind));
      assert.notEqual(outcome.question.canApprove, false);
      if (outcome.question.kind === 'tracking_metadata') sawMetadataDecision = true;
      await options.beforeApprove?.(outcome);
      outcome = await folio.call('folio_decide', { root, runId: outcome.runId, action: 'approve' });
    }
  }
  throw new Error('synthetic tracking flow did not finish');
}
