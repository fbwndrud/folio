import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../../core/run/runner.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { committedWith, editYaml } from '../support/recheck.js';

const RECHECK = { node: 'next-recheck', mode: 'recheck' };
const unanswered = (o) => ({ [o.requests[0].requestId]: JSON.stringify({ checked: [], findings: [] }) });

test('resume refuses answers to a question asked under settings that changed (ANSWER_STALE); the next run asks again', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const mk = () => createRunner({ root, packs: fakePacks() });
  const first = await mk().run({ node: 'stairwell' });
  assert.equal(label(first), 'model:plan');
  await editYaml(root, (c) => { c.overrides = { critic: { mode: 'off', reason: '속도' } }; });
  await assert.rejects(mk().resume({ runId: first.runId, answers: createFakeHost().answer(first) }),
    (e) => e.code === 'ANSWER_STALE' && e.details.runId === first.runId);
  await assert.rejects(mk().resume({ runId: first.runId, answers: createFakeHost().answer(first) }), { code: 'RUN_NOT_AWAITING_MODEL' });
  const again = await mk().run({ node: 'next' });
  assert.equal(label(again), 'model:plan');
  assert.notEqual(again.requests[0].requestId, first.requests[0].requestId);
});

test('a recheck that re-plans after a settings change gets a fresh set of tries', async () => {
  const { root, makeRunner } = await committedWith({ checks: { 'fake.critic': { mode: 'off' } } });
  await editYaml(root, (c) => { c.checks = {}; });
  let out = (await driveToEnd(makeRunner, createFakeHost(), { start: RECHECK, until: (o) => label(o) === 'model:critic' })).at(-1);
  for (let i = 0; i < 2; i += 1) out = await makeRunner().resume({ runId: out.runId, answers: unanswered(out) });
  assert.equal(label(out), 'model:critic');
  await editYaml(root, (c) => { c.checks = { quiet: { words: ['없는말'] } }; });
  out = (await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'next' }, until: (o) => label(o) === 'model:critic' })).at(-1);
  out = await makeRunner().resume({ runId: out.runId, answers: unanswered(out) });
  assert.equal(label(out), 'model:critic', 'tries used before the re-plan do not count');
});

test('an answer to a retried request is taken even when the pack prompt folds the retry reason into the request', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const pack = { ...fakePack, prompt: (step, payload) => ({ ...payload, instructions: `${step.id}${payload.retryReason ? ` / retry: ${payload.retryReason}` : ''}` }) };
  const mk = () => createRunner({ root, packs: new Map([['fake', pack]]) });
  const host = createFakeHost();
  let out = (await driveToEnd(mk, host, { start: { node: 'stairwell' }, until: (o) => label(o) === 'model:extract' })).at(-1);
  out = await mk().resume({ runId: out.runId, answers: { [out.requests[0].requestId]: 'not json' } });
  assert.equal(label(out), 'model:extract');
  assert.match(out.requests[0].payload.instructions, /retry: EVENTS_JSON_INVALID/);
  assert.equal(out.requests[0].digestPayload, undefined, 'the digest source is not sent to the host');
  out = await mk().resume({ runId: out.runId, answers: host.answer(out) });
  assert.equal(label(out), 'model:critic', 'the retried extract answer was taken');
});
