import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { updateNode } from '../../core/store/tree.js';
import { workStatus } from '../../core/status.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';

// "끝남" = 앞머리 status: committed + 영수증 기록장의 커밋 기록. 앞머리만 committed 인 노드는 끝나지 않았다.
const WARNING = 'COMMITTED_WITHOUT_RECORD';
const mkFor = (root) => (extra = {}) => createRunner({ root, packs: fakePacks(), ...extra });
const status = (root) => workStatus(root, { packs: fakePacks() });
const noRecord = async (root) => (await status(root)).drift.filter((d) => d.code === WARNING);
const commitsOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit' && r.nodeId === nodeId);

// rooftop-scene 은 정상 커밋. 부모 the-fall 에 남은 자식은 stairwell 뿐이다.
async function withFirstSceneCommitted() {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const mk = mkFor(root);
  const first = await driveToEnd(mk, createFakeHost(), { start: { node: 'rooftop-scene' }, until: (o) => o.status === 'done' });
  assert.equal(first.at(-1).status, 'done');
  return { root, mk };
}

const commitChild = async (mk, start) => {
  const trail = await driveToEnd(mk, createFakeHost(), { start, until: (o) => o.status === 'done' });
  assert.deepEqual([trail.at(-1).status, trail.at(-1).nodeId], ['done', 'stairwell']);
};

test('a first commit that died after the body write and was skipped does not count as done', async () => {
  const { root, mk } = await withFirstSceneCommitted();
  const trail = await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'needs_model' && o.requests[0].stepId === 'critic' });
  const last = trail.at(-1);
  const crashing = mk({ hooks: { afterBodyWrite: () => { throw new Error('crash'); } } });
  await assert.rejects(crashing.resume({ runId: last.runId, answers: createFakeHost().answer(last) }), /crash/);
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  config.overrides.critic = { prompt: 'harsher' };
  await writeFile(path, stringifyYaml(config));
  assert.equal((await mk().decide({ runId: last.runId, action: 'skip', reason: '설정이 바뀜' })).status, 'skipped');
  assert.equal((await openWork(root)).tree.nodes.get('stairwell').status, 'committed');
  assert.deepEqual(await commitsOf(root, 'stairwell'), []);

  assert.deepEqual(await noRecord(root), [{ nodeId: 'stairwell', code: WARNING, recommit: true }]);
  assert.notEqual((await status(root)).next?.nodeId, 'the-fall');
  await assert.rejects(mk().run({ node: 'the-fall' }), (e) => e.code === 'CHILDREN_PENDING' && e.details.pending.includes('stairwell'));
  assert.deepEqual(await commitsOf(root, 'the-fall'), []);

  await commitChild(mk, { node: 'stairwell' });
  assert.equal((await commitsOf(root, 'stairwell')).length, 1);
  assert.deepEqual(await noRecord(root), []);
  assert.equal((await status(root)).next.nodeId, 'the-fall');
});

test('a hand-edited committed status on a never-committed node is reported and blocks the parent', async () => {
  const { root, mk } = await withFirstSceneCommitted();
  const work = await openWork(root);
  await updateNode(root, work.tree.nodes.get('stairwell'), { data: { status: 'committed' } });
  assert.deepEqual(await noRecord(root), [{ nodeId: 'stairwell', code: WARNING, recommit: true }]);
  assert.equal((await status(root)).next.nodeId, 'stairwell');
  await assert.rejects(mk().run({ node: 'the-fall' }), (e) => e.code === 'CHILDREN_PENDING' && e.details.pending.includes('stairwell'));
  assert.deepEqual(await createRunStore(root).list().then((runs) => runs.filter((r) => r.nodeId === 'the-fall')), []);
  await commitChild(mk, { node: 'next' });
  assert.deepEqual(await noRecord(root), []);
});

test('normally committed nodes produce no committed-without-record warning', async () => {
  const { root, mk } = await withFirstSceneCommitted();
  await commitChild(mk, { node: 'stairwell' });
  const parent = await driveToEnd(mk, createFakeHost(), { start: { node: 'the-fall' }, until: (o) => o.status === 'done' });
  assert.deepEqual([parent.at(-1).status, parent.at(-1).nodeId], ['done', 'the-fall']);
  const s = await status(root);
  assert.deepEqual([s.drift, s.warnings], [[], []]);
});
