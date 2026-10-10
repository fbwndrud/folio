import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { connectFolio } from '../support/mcp-client.js';
import { tempDir } from '../support/fixtures.js';
import { brandWork } from '../support/brand-work.js';
import { label } from '../support/fake-host.js';

const VOICE_DRAFT = '업계 최고 품질을 보장합니다. 최고경영자가 직접 설명해요! 경쟁사A보다 빠릅니다.\n';
const TONE = { checkId: 'brand.tone', code: 'TONE_MIXED', message: '합니다체 지침에 해요체가 섞였다', quote: '최고경영자가 직접 설명해요!' };
const GHOST = { checkId: 'brand.tone', code: 'TONE_MIXED', message: '원고에 없는 인용', quote: '원고에 없는 문장입니다' };
const FIGURES_DRAFT = '2025년 매출은 30% 늘었다. 고객사는 1,200곳이다. 매장은 2026.09.30에 열었다. 우리는 늘 곁에 있습니다.\n';
const fact = (quote) => [{ sourceId: 'product-facts', quote }];
const FIGURE_CLAIMS = [
  { quote: '2025년 매출은 30% 늘었다', sources: fact('2025년 매출은 30억 원 늘었다') },
  { quote: '고객사는 1,200곳이다', sources: fact('고객사는 1,100곳이다') },
  { quote: '매장은 2026.09.30에 열었다', sources: fact('매장은 2026년 9월 30일에 30제곱미터로 열었다') },
  { quote: '우리는 늘 곁에 있습니다', sources: [] },
];

/** MCP 너머의 가짜 호스트 모델. 검사는 critic 지적(있으면)으로 답하고, 수정 요청에는 같은 원고를 돌려준다. */
function answerer({ draft = '본문.', claims = null, events = [], critic = [] } = {}) {
  return (request) => {
    const p = request.payload;
    if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: p.step === 'critic' ? critic : [] });
    if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획`;
    if (p.produces === 'draft') return draft;
    if (p.produces === 'events') return JSON.stringify({ events, appearances: [], mentions: [], ...(claims ? { claims } : {}) });
    throw new Error(`no answer for ${request.purpose}/${p.produces}`);
  };
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** 작가 질문(needs_user)까지 overview 를 MCP 로 돌린다. 지나온 결과 이름과 요청을 모은다. */
async function driveOverview(folio, root, answer) {
  const labels = [];
  const requests = [];
  let out = await ok(folio.call('folio_run', { root, node: 'overview' }));
  for (let i = 0; i < 40; i += 1) {
    labels.push(label(out));
    if (out.status !== 'needs_model') return { labels, requests, out };
    requests.push(...out.requests);
    out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
  }
  throw new Error('drive did not finish');
}

const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
const findingsOf = (out) => [...out.question.blocking, ...out.question.advisories].map((f) => [f.checkId, f.code, f.quote ?? null, f.severity]);

test('N5-1 over MCP stdio a company work starts from the guide preset with the brand pack; brand sets are recommended for company, never chosen for the writer', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = join(await tempDir('folio-n5-'), '제품 소개서');
  const made = await ok(folio.call('folio_init', { root, title: '제품 소개서', preset: 'guide', packs: ['knowledge', 'sources', 'brand'] }));
  assert.deepEqual([made.created, made.config.packs, made.config.checkSets], [true, ['knowledge', 'sources', 'brand'], ['knowledge.basic']]);
  const listing = await folio.call('folio_init', { root: join(await tempDir('folio-n5-'), 'x'), title: 'x', preset: 'company', packs: ['knowledge', 'brand'] });
  assert.equal(listing.error.code, 'PRESET_UNKNOWN');
  assert.deepEqual(Object.keys(listing.error.details.packPresets), ['novel', 'knowledge', 'gamebook']);
  const config = await ok(folio.call('folio_config', { root, workKind: 'company' }));
  assert.deepEqual(config.checkSets.filter((s) => s.id.startsWith('brand.')).map((s) => [s.id, s.selected, s.default]), [['brand.voice', false, false], ['brand.figures', false, false]]);
  const brandReasons = config.recommended.filter((r) => r.setId.startsWith('brand.')).map((r) => [r.setId, r.selected, r.reasons]);
  assert.deepEqual(brandReasons, [['brand.voice', false, [{ kind: 'workKind', value: 'company' }]], ['brand.figures', false, [{ kind: 'workKind', value: 'company' }]]]);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N5-2 brand.voice: banned phrases are advisories, the tone check is asked with the tone line and needs a real quote, a user word check runs beside it', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await brandWork({ checkSets: ['brand.voice'], checks: { 'brand-words': { words: ['경쟁사A'], severity: 'advisory', experimental: true } } });
  const { out, requests } = await driveOverview(folio, root, answerer({ draft: VOICE_DRAFT, critic: [TONE, GHOST] }));
  assert.equal(label(out), 'user:approve');
  assert.deepEqual(findingsOf(out), [
    ['brand.banned-phrases', 'BANNED_PHRASE', '최고', 'advisory'],
    ['brand.banned-phrases', 'BANNED_PHRASE', '보장', 'advisory'],
    ['brand-words', 'USER_PATTERN', '경쟁사A', 'advisory'],
    ['brand.tone', 'TONE_MIXED', '최고경영자가 직접 설명해요!', 'advisory'],
  ]);
  const critic = requests.find((r) => r.stepId === 'critic').payload;
  assert.deepEqual(critic.checks.map((c) => [c.checkId, c.requireQuote]), [['brand.tone', true]]);
  assert.match(critic.upperPlans[0].text, /어조: 존댓말\(합니다체\)/);
  assert.equal((await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }))).status, 'done');
  assert.deepEqual((await receiptOf(root, 'overview')).appliedChecks.map((a) => a.checkId), ['brand-words', 'brand.banned-phrases', 'brand.tone', 'core.promise-order']);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N5-3 brand.figures: a wrong unit, a number the source lacks and an unsupported claim are caught; a split date and ㎡ are not', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await brandWork({ checkSets: ['brand.figures'] });
  const claims = [...FIGURE_CLAIMS, { quote: '30㎡', sources: fact('30제곱미터') }];
  const { out, requests } = await driveOverview(folio, root, answerer({ draft: FIGURES_DRAFT.replace('열었다.', '열었다. 넓이는 30㎡다.'), claims }));
  assert.deepEqual(requests.find((r) => r.stepId === 'extract').payload.evidence, { wanted: true });
  assert.deepEqual(findingsOf(out), [
    ['sources.claim-supported', 'CLAIM_UNSUPPORTED', '우리는 늘 곁에 있습니다', 'advisory'],
    ['sources.numbers-match', 'NUMBER_NOT_IN_SOURCE', '고객사는 1,200곳이다', 'advisory'],
    ['brand.figure-units', 'UNIT_NOT_IN_SOURCE', '2025년 매출은 30% 늘었다', 'advisory'],
  ]);
  assert.deepEqual(out.question.advisories.find((f) => f.code === 'UNIT_NOT_IN_SOURCE').figures, [{ number: '30', unit: '%', sourceUnits: ['억'] }]);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N5-4 raised to block a brand check stops the run and approving needs a reason; hard is refused', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const strict = await brandWork({ checkSets: ['brand.figures'], checks: { 'brand.figure-units': { severity: 'block' } } });
  const blocked = await driveOverview(folio, strict, answerer({ draft: FIGURES_DRAFT, claims: FIGURE_CLAIMS }));
  assert.equal(label(blocked.out), 'user:blocked');
  assert.equal(blocked.labels.filter((l) => l === 'model:revise').length, 3);
  assert.deepEqual(blocked.out.question.blocking.map((f) => [f.code, f.quote, f.severity]), [['UNIT_NOT_IN_SOURCE', '2025년 매출은 30% 늘었다', 'block']]);
  const refused = await folio.call('folio_decide', { root: strict, runId: blocked.out.runId, action: 'approve' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'OVERRIDE_REASON_REQUIRED']);
  const hard = await folio.call('folio_run', { root: await brandWork({ checkSets: ['brand.voice'], checks: { 'brand.banned-phrases': { severity: 'hard' } } }), node: 'overview' });
  assert.deepEqual([hard.error.code, hard.error.details.errors.map((e) => e.code)], ['CONFIG_INVALID', ['USER_CHECK_SEVERITY_INVALID']]);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N5-5 without the sources pack brand.figures is refused; sets or mode off stop the brand checks; the core lock stays', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const lonely = await folio.call('folio_run', { root: await brandWork({ packs: ['knowledge', 'brand'], checkSets: ['brand.figures'] }), node: 'overview' });
  assert.deepEqual([lonely.error.code, lonely.error.details.errors.map((e) => [e.code, e.checkId])], ['CONFIG_INVALID', [['CHECK_UNKNOWN', 'sources.claim-supported'], ['CHECK_UNKNOWN', 'sources.numbers-match']]]);

  const off = await brandWork({ checkSets: ['brand.voice'], checks: { 'brand.banned-phrases': { mode: 'off' } } });
  const quiet = await driveOverview(folio, off, answerer({ draft: VOICE_DRAFT }));
  assert.deepEqual(findingsOf(quiet.out), []);
  await ok(folio.call('folio_decide', { root: off, runId: quiet.out.runId, action: 'approve' }));
  assert.deepEqual((await receiptOf(off, 'overview')).appliedChecks.map((a) => a.checkId), ['brand.tone', 'core.promise-order']);

  const locked = await brandWork({ checkSets: ['brand.voice', 'brand.figures'] });
  await mkdir(join(locked, 'entities', 'promise'), { recursive: true });
  await writeFile(join(locked, 'entities', 'promise', 'launch.md'), '---\nid: launch\nkind: promise\nname: 출시 약속\n---\n');
  const events = [{ entityId: 'launch', kind: 'promise.resolved', quote: '약속한 출시를 마쳤습니다' }];
  const hard = await driveOverview(folio, locked, answerer({ draft: '약속한 출시를 마쳤습니다.\n', events, claims: [] }));
  assert.equal(label(hard.out), 'user:blocked');
  assert.deepEqual([hard.out.question.canApprove, hard.out.question.blocking.map((f) => [f.checkId, f.code, f.severity])], [false, [['core.promise-order', 'PROMISE_RESOLVED_BEFORE_PLANT', 'hard']]]);
  const refused = await folio.call('folio_decide', { root: locked, runId: hard.out.runId, action: 'approve', reason: '괜찮다' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'APPROVE_BLOCKED_BY_HARD']);
  const unlock = await folio.call('folio_run', { root: await brandWork({ checkSets: ['brand.voice'], checks: { 'core.promise-order': { mode: 'off' } } }), node: 'overview' });
  assert.deepEqual([unlock.error.code, unlock.error.details.errors.map((e) => e.code)], ['CONFIG_INVALID', ['LOCKED_CHECK_OVERRIDE']]);
  assert.doesNotMatch(folio.stderr(), /Error/);
});
