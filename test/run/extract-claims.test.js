import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { readEvidence } from '../../core/evidence/records.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const MEMBRANES = '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다. 막을 지나는 물질은 ATP를 쓴다. 자세한 원리는 에너지 장에서 다룬다.\n';
const NOTE = 'ATP는 세포의 에너지 화폐로 불린다.';
const CLAIMS = [
  { quote: '막을 지나는 물질은 ATP를 쓴다', sources: [{ sourceId: 'cell-notes', quote: NOTE }] },
  { quote: '자세한 원리는 에너지 장에서 다룬다', sources: [] },
];

async function book(features) {
  const root = await copyFixture('knowledge-book');
  await useFakePack(root);
  if (features) {
    const path = join(root, 'work.yaml');
    await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
  }
  return root;
}
/** 추출 요청이 주장을 물으려면 work.yaml packs 에 sources 팩이 있어야 한다(Important 1). 이 registry 는 그 이름만 있으면 되는 속 빈 팩을 하나 더 준다. */
async function withSourcesPack(root) {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, packs: [...config.packs, 'sources'] }));
  return root;
}
const sourcesPacks = () => new Map([...fakePacks(), ['sources', { name: 'sources' }]]);
const makeRunner = (root) => () => createRunner({ root, packs: fakePacks() });
const makeRunnerWithSources = (root) => () => createRunner({ root, packs: sourcesPacks() });
const hostWith = (claims) => createFakeHost({ drafts: { membranes: MEMBRANES }, events: { membranes: { events: [], claims } } });

test('the extract request asks for claims; checked claims are recorded after the commit with the receipt id', async () => {
  const root = await withSourcesPack(await book());
  const host = hostWith(CLAIMS);
  const trail = await driveToEnd(makeRunnerWithSources(root), host, { start: { node: 'membranes' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  assert.deepEqual(host.calls.find((c) => c.stepId === 'extract').payload.evidence, { wanted: true });
  const records = await readEvidence(root);
  assert.equal(records.length, 1);
  assert.deepEqual([records[0].nodeId, records[0].origin, records[0].receiptId], ['membranes', 'extract', trail.at(-1).receiptId]);
  // 앞 문맥은 엔진이 원고에서 자른 30자다
  const before = (quote) => MEMBRANES.slice(Math.max(0, MEMBRANES.indexOf(quote) - 30), MEMBRANES.indexOf(quote));
  assert.deepEqual(records[0].claims.map((c) => [c.quote, c.before, c.sources.map((l) => l.sourceId)]), [
    ['막을 지나는 물질은 ATP를 쓴다', before('막을 지나는'), ['cell-notes']],
    ['자세한 원리는 에너지 장에서 다룬다', before('자세한 원리는'), []],
  ]);
});

test('one wrong claim makes the whole answer unreadable: asked again, then blocked; nothing is recorded', async () => {
  const root = await withSourcesPack(await book());
  const bad = [...CLAIMS, { quote: '에너지 장에서', sources: [{ sourceId: 'cell-notes', quote: 'ATP는 세포의 연료다' }] }];
  const trail = await driveToEnd(makeRunnerWithSources(root), hostWith(bad), { start: { node: 'membranes' }, until: (o) => o.status === 'needs_user' });
  assert.equal(trail.map(label).filter((l) => l === 'model:extract').length, 3);
  assert.equal(trail.at(-1).question.code, 'EXTRACT_FAILED');
  assert.equal(trail.at(-1).question.canApprove, false);
  assert.match(trail.at(-1).question.blocking[0].message, /CLAIM_SOURCE_QUOTE_NOT_FOUND:2/);
  assert.deepEqual(await readEvidence(root), []);
});

test('with evidenceInExtract off (or evidence off) the request does not ask, and claims in the answer are ignored', async () => {
  for (const features of [{ evidenceInExtract: false }, { evidence: false }]) {
    const root = await withSourcesPack(await book(features));
    const host = hostWith([{ quote: '없는 주장', sources: [{ sourceId: 'ghost', quote: 'x' }] }]);
    const trail = await driveToEnd(makeRunnerWithSources(root), host, { start: { node: 'membranes' }, until: (o) => o.status === 'done' });
    assert.equal(trail.at(-1).status, 'done', JSON.stringify(features));
    assert.deepEqual(host.calls.find((c) => c.stepId === 'extract').payload.evidence, { wanted: false });
    assert.deepEqual(await readEvidence(root), []);
  }
});

test('without the sources pack the extract request does not ask for claims, even with every toggle on', async () => {
  const root = await book();
  const host = hostWith([{ quote: '없는 주장', sources: [{ sourceId: 'ghost', quote: 'x' }] }]);
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'membranes' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  assert.deepEqual(host.calls.find((c) => c.stepId === 'extract').payload.evidence, { wanted: false });
  assert.deepEqual(await readEvidence(root), []);
});
