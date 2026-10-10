import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { BRAND_PACK_DIR } from '../../packs/brand/index.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { brandWork } from '../support/brand-work.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const DRAFT = '업계 최고 품질을 보장합니다. 최고경영자가 직접 설명해요!\n';
const TONE = { checkId: 'brand.tone', code: 'TONE_MIXED', message: '합니다체 지침에 해요체가 섞였다', quote: '최고경영자가 직접 설명해요!' };
const GHOST = { checkId: 'brand.tone', code: 'TONE_MIXED', message: '원고에 없는 인용', quote: '원고에 없는 문장입니다' };

async function runOverview(root, critic = () => []) {
  const packs = await loadBuiltinPacks();
  const host = createFakeHost({ drafts: { overview: DRAFT }, critic });
  const trail = await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'overview' }, until: (o) => o.status === 'needs_user' && o.question.kind !== 'approve_plan' });
  return { trail, host };
}

test('the brand pack is a second pack: checks and one set only, advisory experimental checks, no default sets, no locks', async () => {
  const packs = await loadBuiltinPacks();
  const pack = packs.get('brand');
  assert.deepEqual([pack.pipelines, pack.presets, pack.prompts, pack.defaultCheckSets], [undefined, {}, {}, []]);
  assert.deepEqual(pack.checks.map((c) => [c.id, c.tier, c.stage, c.severity, Boolean(c.experimental), Boolean(c.requireQuote), c.checker ?? null]), [
    ['brand.tone', 'model', 'critic', 'advisory', true, true, null],
    ['brand.banned-phrases', 'deterministic', 'facts', 'advisory', true, false, 'banned-phrases'],
    ['brand.figure-units', 'deterministic', 'facts', 'advisory', true, false, 'figure-units'],
  ]);
  assert.equal(pack.checks[0].instruction, await readFile(join(BRAND_PACK_DIR, 'checks', 'tone.md'), 'utf8'));
  assert.ok(pack.checks.every((c) => !c.locked), 'a pack cannot declare locks');
  assert.deepEqual(pack.checkSets['brand.voice'], {
    title: '브랜드 어조', description: pack.checkSets['brand.voice'].description, checks: ['brand.tone', 'brand.banned-phrases'], recommendedFor: { kinds: ['company', 'brochure'] },
  });
  assert.deepEqual(pack.checkSets['brand.figures'].checks, ['sources.claim-supported', 'sources.numbers-match', 'brand.figure-units']);
  assert.deepEqual(pack.checkSets['brand.figures'].recommendedFor, { kinds: ['company', 'brochure'] });
  assert.deepEqual(pack.checks[2].config.units['%'], ['%', '％', '퍼센트']);
  const banned = pack.checks[1];
  assert.ok(banned.config.words.includes('최고') && banned.config.allow.includes('최고경영자'));
  assert.deepEqual(banned.run({ draft: '최고경영자가 최고라고 합니다.' }).map((f) => [f.quote, f.count]), [['최고', 1]]);
  assert.throws(() => resolvePacks(['brand'], packs), { code: 'PACK_PIPELINE_MISSING' });
  for (const first of ['knowledge', 'novel']) assert.equal(resolvePacks([first, 'brand'], packs).primary.name, first);
});

test('brand.voice gives the banned phrases as advisories and asks the host for the tone check with the plan that carries the tone', async () => {
  const root = await brandWork({ checkSets: ['brand.voice'] });
  const { trail, host } = await runOverview(root, () => [TONE, GHOST]);
  const last = trail.at(-1);
  assert.equal(label(last), 'user:approve');
  assert.deepEqual(last.question.advisories.map((f) => [f.checkId, f.code, f.quote, f.severity]), [
    ['brand.banned-phrases', 'BANNED_PHRASE', '최고', 'advisory'],
    ['brand.banned-phrases', 'BANNED_PHRASE', '보장', 'advisory'],
    ['brand.tone', 'TONE_MIXED', '최고경영자가 직접 설명해요!', 'advisory'],
  ]);
  const critic = host.calls.find((c) => c.purpose === 'check' && c.stepId === 'critic').payload;
  assert.deepEqual(critic.checks.map((c) => [c.checkId, c.requireQuote, c.severity]), [['brand.tone', true, 'advisory']]);
  assert.match(critic.checks[0].instruction, /upperPlans/);
  assert.match(critic.upperPlans[0].text, /어조: 존댓말\(합니다체\)/);
  const done = await createRunner({ root, packs: await loadBuiltinPacks() }).decide({ runId: last.runId, action: 'approve' });
  assert.equal(done.status, 'done');
  const receipt = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === 'overview').at(-1);
  assert.deepEqual(receipt.appliedChecks.map((a) => a.checkId), ['brand.banned-phrases', 'brand.tone', 'core.promise-order']);
});

test('raised to block the banned phrases stop the run; hard is refused; mode off or no set leaves only the core lock', async () => {
  const strict = await brandWork({ checkSets: ['brand.voice'], checks: { 'brand.banned-phrases': { severity: 'block' } } });
  const { trail } = await runOverview(strict);
  assert.equal(label(trail.at(-1)), 'user:blocked');
  assert.equal(trail.map(label).filter((l) => l === 'model:revise').length, 3);
  assert.deepEqual(trail.at(-1).question.blocking.map((f) => [f.code, f.quote, f.severity]), [['BANNED_PHRASE', '최고', 'block'], ['BANNED_PHRASE', '보장', 'block']]);
  const packs = await loadBuiltinPacks();
  const hard = await brandWork({ checkSets: ['brand.voice'], checks: { 'brand.banned-phrases': { severity: 'hard' } } });
  await assert.rejects(openWorkspace(hard, { packs }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'USER_CHECK_SEVERITY_INVALID'));
  const off = await openWorkspace(await brandWork({ checkSets: ['brand.voice'], checks: { 'brand.banned-phrases': { mode: 'off' } } }), { packs });
  assert.deepEqual(off.checks.map((c) => c.id), ['core.promise-order', 'brand.tone']);
  const none = await openWorkspace(await brandWork({ checkSets: [] }), { packs });
  assert.deepEqual(none.checks.map((c) => [c.id, Boolean(c.locked)]), [['core.promise-order', true]]);
});

test('brand.figures reuses the sources checks and adds units: a wrong unit, a missing number and an unsupported claim, but no date false positive', async () => {
  const root = await brandWork({ checkSets: ['brand.figures'] });
  const draft = '2025년 매출은 30% 늘었다. 고객사는 1,200곳이다. 매장은 2026.09.30에 열었다. 우리는 늘 곁에 있습니다.\n';
  const claims = [
    { quote: '2025년 매출은 30% 늘었다', sources: [{ sourceId: 'product-facts', quote: '2025년 매출은 30억 원 늘었다' }] },
    { quote: '고객사는 1,200곳이다', sources: [{ sourceId: 'product-facts', quote: '고객사는 1,100곳이다' }] },
    { quote: '매장은 2026.09.30에 열었다', sources: [{ sourceId: 'product-facts', quote: '매장은 2026년 9월 30일에 30제곱미터로 열었다' }] },
    { quote: '우리는 늘 곁에 있습니다', sources: [] },
  ];
  const packs = await loadBuiltinPacks();
  const host = createFakeHost({ drafts: { overview: draft }, events: { overview: { events: [], claims } } });
  const last = (await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'overview' }, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.equal(label(last), 'user:approve');
  assert.deepEqual(last.question.advisories.map((f) => [f.checkId, f.code, f.quote, f.severity]), [
    ['sources.claim-supported', 'CLAIM_UNSUPPORTED', '우리는 늘 곁에 있습니다', 'advisory'],
    ['sources.numbers-match', 'NUMBER_NOT_IN_SOURCE', '고객사는 1,200곳이다', 'advisory'],
    ['brand.figure-units', 'UNIT_NOT_IN_SOURCE', '2025년 매출은 30% 늘었다', 'advisory'],
  ]);
  assert.deepEqual(last.question.advisories[2].figures, [{ number: '30', unit: '%', sourceUnits: ['억'] }]);
});

test('without the sources pack brand.figures is refused as an unknown check; brand.voice still opens', async () => {
  const packs = await loadBuiltinPacks();
  const refused = await openWorkspace(await brandWork({ packs: ['knowledge', 'brand'], checkSets: ['brand.figures'] }), { packs }).catch((e) => e);
  assert.equal(refused.code, 'CONFIG_INVALID');
  assert.deepEqual(refused.details.errors.map((e) => [e.code, e.checkId]), [['CHECK_UNKNOWN', 'sources.claim-supported'], ['CHECK_UNKNOWN', 'sources.numbers-match']]);
  const voice = await openWorkspace(await brandWork({ packs: ['knowledge', 'brand'], checkSets: ['brand.voice'] }), { packs });
  assert.deepEqual(voice.checks.map((c) => c.id), ['core.promise-order', 'brand.tone', 'brand.banned-phrases']);
});
