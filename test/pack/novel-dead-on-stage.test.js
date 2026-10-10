import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBuiltinPacks } from '../../packs/index.js';
import { deadOnStage } from '../../packs/novel/checkers/dead-on-stage.js';
import { createRunner } from '../../core/run/runner.js';
import { copyFixture, seedEvents } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const dead = { entityId: 'doyun', kind: 'state', data: { vital: 'dead' } };
const alive = (extra = {}) => ({ entityId: 'doyun', kind: 'state', data: { vital: 'alive' }, ...extra });
const codes = (findings) => findings.map((f) => [f.code, f.entityId, f.severity ?? null]);

test('dead-on-stage: a draft revival counts only with a non-empty quote that is in the draft', () => {
  const base = { priorEvents: [dead], appearances: ['doyun'], draft: '도윤이 다시 눈을 떴다.' };
  for (const quote of [undefined, '', '   ', 'x', '없는 문장이다']) {
    assert.deepEqual(codes(deadOnStage({ ...base, draftEvents: [alive(quote === undefined ? {} : { quote })] })), [['DEAD_ON_STAGE', 'doyun', null]], String(quote));
  }
  assert.deepEqual(deadOnStage({ ...base, draftEvents: [alive({ quote: '도윤이 다시 눈을 떴다' })] }), []);
});

test('dead-on-stage: vital values are trimmed and lowercased', () => {
  const upper = { ...dead, data: { vital: ' Dead ' } };
  assert.deepEqual(codes(deadOnStage({ priorEvents: [upper], appearances: ['doyun'], draftEvents: [] })), [['DEAD_ON_STAGE', 'doyun', null]]);
  const revived = deadOnStage({ priorEvents: [dead, { ...dead, data: { vital: 'ALIVE' } }], appearances: ['doyun'], draftEvents: [] });
  assert.deepEqual(revived, []);
});

test('dead-on-stage: an unknown vital value for an entity in scope asks the user (block), quoting the value', () => {
  const prior = deadOnStage({ priorEvents: [{ ...dead, data: { vital: '사망' } }], appearances: ['doyun'], draftEvents: [] });
  assert.deepEqual(codes(prior), [['VITAL_UNKNOWN', 'doyun', 'block']]);
  assert.equal(prior[0].quote, '사망');
  assert.match(prior[0].message, /"사망"/);
  const draft = deadOnStage({ priorEvents: [], appearances: ['hana'], draftEvents: [{ entityId: 'hana', kind: 'state', data: { vital: 'missing' } }] });
  assert.deepEqual(codes(draft), [['VITAL_UNKNOWN', 'hana', 'block']]);
  assert.equal(draft[0].quote, 'missing');
  // 범위 밖(이 노드에 나오지도, 이 원고가 다루지도 않는) 엔티티의 앞 사건은 이 노드의 일이 아니다.
  assert.deepEqual(deadOnStage({ priorEvents: [{ entityId: 'mira', kind: 'state', data: { vital: 'Gone' } }], appearances: ['doyun'], draftEvents: [] }), []);
  // vital 이 없는 state 사건은 생사와 무관하다.
  assert.deepEqual(deadOnStage({ priorEvents: [{ entityId: 'doyun', kind: 'state', data: { mood: 'sad' } }], appearances: ['doyun'], draftEvents: [] }), []);
});

async function driveEp004(script) {
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  const packs = await loadBuiltinPacks();
  const mk = () => createRunner({ root, packs });
  const trail = await driveToEnd(mk, createFakeHost(script), { start: { node: 'ep-004' }, until: (o) => o.status === 'needs_user' || o.status === 'done' });
  return trail.at(-1);
}

test('ep-004: a quote-less revival in the extraction does not silence the hard check', async () => {
  const last = await driveEp004({ events: { 'ep-004': { events: [alive()], appearances: ['doyun'], mentions: [] } } });
  assert.equal(label(last), 'user:blocked');
  assert.equal(last.question.canApprove, false);
  assert.deepEqual(last.question.blocking.map((f) => [f.code, f.severity]), [['DEAD_ON_STAGE', 'hard']]);
});

test('ep-004: a revival quoted from the draft lets doyun appear', async () => {
  const text = '도윤이 숨을 몰아쉬며 다시 눈을 떴다.';
  const last = await driveEp004({
    drafts: { 'ep-004': text },
    events: { 'ep-004': { events: [alive({ quote: '숨을 몰아쉬며 다시 눈을 떴다' })], appearances: ['doyun'], mentions: [] } },
  });
  assert.ok(!(last.question?.blocking ?? []).some((f) => f.code === 'DEAD_ON_STAGE'), JSON.stringify(last.question?.blocking));
});
