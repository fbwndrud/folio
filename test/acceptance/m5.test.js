import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { connectFolio } from '../support/mcp-client.js';
import { label } from '../support/fake-host.js';
import {
  CLEAN_EP4, DEAD_EP4, DRAFTS, GHOST_EP4, answerer, drive, findingsOf, hardOf, ok, receiptOf, serialWork, untilUser,
} from '../support/parity-serial.js';

// M5 완료 검증(약속·사용자 검사·세트 토글). 모두 MCP stdio 로 실제 실행 파일을 띄워 parity-serial 복사본에서 4화(ep-004)를 돈다.
// 시드: red-seal(기한 next) 1화에 심음, old-map 1화 심음·2화 진행, sword 2화 파괴, hana 3화 죽음. ghost-oath 는 심지 않았다.

const GHOST_HARD = [['core.promise-order', 'PROMISE_RESOLVED_BEFORE_PLANT', 'ghost-oath']];
const dormantOf = (out) => findingsOf(out).filter((f) => f.checkId === 'novel.promise-dormant').map((f) => [f.code, f.entityId, f.severity]);

async function refusedApprove(folio, root, out) {
  const refused = await folio.call('folio_decide', { root, runId: out.runId, action: 'approve', reason: '괜찮다' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'APPROVE_BLOCKED_BY_HARD']);
}

test('M5-4 resolving a promise that was never planted is a hard block; with no check sets the lock still runs', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  for (const config of [{}, { checkSets: [] }]) {
    const root = await serialWork(config);
    const { out } = await drive(folio, root, { node: 'ep-004' }, answerer({ 'ep-004': GHOST_EP4 }), untilUser);
    assert.equal(label(out), 'user:blocked', JSON.stringify(config));
    assert.equal(out.question.canApprove, false);
    assert.deepEqual(hardOf(out), GHOST_HARD, JSON.stringify(config));
    await refusedApprove(folio, root, out);
  }
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('M5-5 a promise that has not moved for its horizon is reported even when the draft never names it (promiseScope)', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await serialWork();
  assert.equal(DRAFTS.clean.includes('봉인'), false, 'the draft must not mention red-seal');
  const { out, requests } = await drive(folio, root, { node: 'ep-004' }, answerer({ 'ep-004': CLEAN_EP4 }), untilUser);
  assert.equal(label(out), 'user:approve');
  // red-seal: 기한 next(2칸), 1화 뒤로 움직이지 않아 4화에서 3칸 → 잠듦. old-map: 기본 10칸, 2화에서 2칸 → 조용.
  assert.deepEqual(dormantOf(out), [['PROMISE_DORMANT', 'red-seal', 'advisory']]);
  assert.match(out.question.advisories.find((f) => f.code === 'PROMISE_DORMANT').message, /3칸째.*기준 2칸.*ep-001/);
  const critic = requests.find((r) => r.stepId === 'critic').payload;
  assert.deepEqual(critic.priorEvents.filter((e) => e.entityId === 'red-seal').map((e) => [e.nodeId, e.kind]), [['ep-001', 'promise.planted']]);
  // promiseScope 는 앞 사건만 싣는다 — 범위(entityIds)는 넓히지 않는다.
  assert.equal(critic.entities.some((e) => e.id === 'red-seal'), false);

  const off = await serialWork({ features: { promiseScope: false } });
  const quiet = await drive(folio, off, { node: 'ep-004' }, answerer({ 'ep-004': CLEAN_EP4 }), untilUser);
  assert.equal(label(quiet.out), 'user:approve');
  assert.deepEqual(dormantOf(quiet.out), []);
  assert.equal(quiet.requests.find((r) => r.stepId === 'critic').payload.priorEvents.some((e) => e.entityId === 'red-seal'), false);
  // 기능을 꺼도 잠금(core.promise-order)은 그대로 돈다.
  const lockedOff = await serialWork({ features: { promiseScope: false } });
  const hard = await drive(folio, lockedOff, { node: 'ep-004' }, answerer({ 'ep-004': GHOST_EP4 }), untilUser);
  assert.equal(label(hard.out), 'user:blocked');
  assert.deepEqual(hardOf(hard.out), GHOST_HARD);
  await refusedApprove(folio, lockedOff, hard.out);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('M5-6 a user pattern check drafted with folio_config and written to work.yaml by the author finds its word', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await serialWork();
  const draft = (await ok(folio.call('folio_config', { root, checkDraft: { id: 'no-sudden', title: '갑자기 금지', words: ['갑자기'] } }))).checkDraft;
  assert.deepEqual([draft.ok, draft.id, draft.kind, draft.errors], [true, 'no-sudden', 'pattern', []]);
  assert.deepEqual(draft.spec, { severity: 'advisory', experimental: true, title: '갑자기 금지', words: ['갑자기'] });
  // folio_config 는 읽기 전용이다. 작가가 승인하고 work.yaml 에 적는다(여기서는 테스트가 그 손 작업을 한다).
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  assert.equal(config.checks, undefined);
  await writeFile(path, stringifyYaml({ ...config, checks: { [draft.id]: draft.spec } }));
  const script = answerer({ 'ep-004': { draft: DRAFTS.sudden, appearances: ['doyun'] } });
  const { out } = await drive(folio, root, { node: 'ep-004' }, script, untilUser);
  assert.equal(label(out), 'user:approve');
  const mine = findingsOf(out).filter((f) => f.checkId === 'no-sudden').map((f) => [f.code, f.quote, f.severity]);
  assert.deepEqual(mine, [['USER_PATTERN', '갑자기', 'advisory']]);
  assert.equal((await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }))).status, 'done');
  assert.ok((await receiptOf(root, 'ep-004')).appliedChecks.some((a) => a.checkId === 'no-sudden'));
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('M5-7 choosing only novel.basic turns the serial and style checks off; dead-on-stage and the core lock still run', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await serialWork({ checkSets: ['novel.basic'] });
  const sets = (await ok(folio.call('folio_config', { root }))).checkSets;
  const members = (id) => sets.find((s) => s.id === id).checks;
  assert.deepEqual(sets.filter((s) => s.selected).map((s) => s.id), ['novel.basic']);
  const off = new Set([...members('novel.serial'), ...members('novel.style')]);
  assert.ok(off.has('novel.prosody') && off.has('novel.promise-dormant') && off.has('novel.cliffhanger'));
  const allowed = new Set(['core.promise-order', ...members('novel.basic')]);

  const both = { ...DEAD_EP4, events: [...DEAD_EP4.events, ...GHOST_EP4.events], draft: `${DRAFTS.dead}${DRAFTS.ghost}` };
  const { out } = await drive(folio, root, { node: 'ep-004' }, answerer({ 'ep-004': both }), untilUser);
  assert.equal(label(out), 'user:blocked');
  assert.deepEqual(hardOf(out).sort(), [['core.promise-order', 'PROMISE_RESOLVED_BEFORE_PLANT', 'ghost-oath'], ['novel.dead-on-stage', 'DEAD_ON_STAGE', 'hana']]);
  for (const finding of findingsOf(out)) assert.ok(allowed.has(finding.checkId), `${finding.checkId} ${finding.code}`);
  assert.ok(findingsOf(out).some((f) => f.checkId === 'novel.honorific-gender'), 'novel.basic advisories still run');
  await refusedApprove(folio, root, out);

  const clean = await serialWork({ checkSets: ['novel.basic'] });
  const done = await drive(folio, clean, { node: 'ep-004' }, answerer({ 'ep-004': CLEAN_EP4 }));
  assert.equal(done.out.status, 'done');
  const applied = (await receiptOf(clean, 'ep-004')).appliedChecks.map((a) => a.checkId);
  assert.ok(applied.includes('core.promise-order') && applied.includes('novel.dead-on-stage'), applied.join());
  assert.deepEqual(applied.filter((id) => off.has(id)), []);
  const receipt = JSON.stringify(await receiptOf(clean, 'ep-004'));
  assert.doesNotMatch(receipt, /novel\.prosody|novel\.promise-dormant|PROMISE_DORMANT/);
  assert.doesNotMatch(folio.stderr(), /Error/);
});
