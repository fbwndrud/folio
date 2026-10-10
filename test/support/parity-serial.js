import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { copyFixture } from './fixtures.js';
import { label } from './fake-host.js';

/**
 * parity-serial fixture 의 시드 사건(test/fixtures/parity-serial-seeds/events.yaml)을 events 기록장에 넣는다(테스트 전용 경로).
 * support/fixtures.js seedEvents 와 같은 방식이다: 같은 기록장, 같은 seed-N id, 같은 시각.
 */
export async function seedParityEvents(root) {
  const seeds = parseYaml(await readFile(join(import.meta.dirname, '..', 'fixtures', 'parity-serial-seeds', 'events.yaml'), 'utf8'));
  const ledger = openLedger(root, 'events', { now: () => '2026-09-26T00:00:00.000Z' });
  const records = [];
  for (const [index, seed] of seeds.entries()) {
    records.push(await ledger.append({ type: 'event', eventId: `seed-${index + 1}`, ...seed }));
  }
  return records;
}

/** 시드를 넣은 parity-serial 복사본. config 는 work.yaml 에 덮어 쓴다(작가가 하는 일). 원본 fixture 는 그대로. */
export async function serialWork(config = {}) {
  const root = await copyFixture('parity-serial');
  await seedParityEvents(root);
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...config }));
  return root;
}

/**
 * MCP 너머의 가짜 호스트 모델. script: 노드 id → { draft, events, appearances, mentions }.
 * 검사는 지적 없이 답하고, 수정 요청에는 같은 원고를 돌려준다(수정해도 hard 는 그대로 남는다).
 */
export function answerer(script = {}) {
  return (request) => {
    const p = request.payload;
    const own = script[p.node.id] ?? {};
    if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
    if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획`;
    if (p.produces === 'draft') return own.draft ?? `${p.node.title || p.node.id} 본문.\n`;
    if (p.produces === 'events') {
      return JSON.stringify({ events: own.events ?? [], appearances: own.appearances ?? [], mentions: own.mentions ?? [] });
    }
    throw new Error(`no answer for ${request.purpose}/${p.produces}`);
  };
}

export async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** until 을 만날 때까지 run/resume/decide(approve) 를 MCP 로 돌린다. 지나온 결과 이름과 모델 요청을 모은다. */
export async function drive(folio, root, start, answer, until = (o) => o.status === 'done') {
  const labels = [];
  const requests = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 60; i += 1) {
    labels.push(label(out));
    if (until(out)) return { labels, requests, out };
    if (out.status === 'needs_model') {
      requests.push(...out.requests);
      out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}`);
  }
  throw new Error('drive did not finish');
}

export const untilUser = (o) => o.status === 'needs_user';
/** 질문의 지적 전부(blocking + advisories). blocking 에는 hard 와 block 이 함께 온다. */
export const findingsOf = (out) => [...out.question.blocking, ...out.question.advisories];
export const hardOf = (out) => out.question.blocking.filter((f) => f.severity === 'hard').map((f) => [f.checkId, f.code, f.entityId ?? null]);
export const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
export const commitsOf = async (root) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit');

/** 4화 원고들(합성). 인용은 모두 원고에 그대로 있다. */
export const DRAFTS = Object.freeze({
  clean: '도윤은 강가 마을에서 하룻밤을 묵었다.\n',
  dead: '하나가 강가에 서서 도윤을 불렀다. "도련님, 이리 오세요." 도윤은 부러진 은빛 검을 다시 허리에 찼다.\n',
  ghost: '도윤은 강가 마을에서 유령의 맹세가 무엇이었는지 마침내 알게 되었다.\n',
  sudden: '도윤은 강가 마을 어귀에서 갑자기 걸음을 멈췄다.\n',
});

/** 죽은 하나를 무대에 올리고, 파괴된 검을 다시 쓰고, 하나를 남성 호칭으로 부르는 추출 답. */
export const DEAD_EP4 = Object.freeze({
  draft: DRAFTS.dead,
  events: [
    { entityId: 'hana', kind: 'address', data: { term: '도련님' }, quote: '"도련님, 이리 오세요."' },
    { entityId: 'sword', kind: 'state', data: { holder: 'doyun' }, quote: '도윤은 부러진 은빛 검을 다시 허리에 찼다' },
  ],
  appearances: ['doyun', 'hana', 'sword'],
});
export const CLEAN_EP4 = Object.freeze({ draft: DRAFTS.clean, appearances: ['doyun'] });
/** 심지 않은 약속(ghost-oath)을 갚는 추출 답 — core.promise-order 잠금이 막는다. */
export const GHOST_EP4 = Object.freeze({
  draft: DRAFTS.ghost,
  events: [{ entityId: 'ghost-oath', kind: 'promise.resolved', quote: '유령의 맹세가 무엇이었는지 마침내 알게 되었다' }],
  appearances: ['doyun'],
});
