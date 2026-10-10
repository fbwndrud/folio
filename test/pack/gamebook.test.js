import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGamebookPack } from '../../packs/gamebook/index.js';
import { pathFacts } from '../../packs/gamebook/checkers/facts.js';
import { deadEnds, unreachable, paths } from '../../packs/gamebook/checkers/structure.js';
import { branchScope } from '../../core/branching/scope.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseJsonAnswer } from '../../core/run/answers.js';
import { branchWork, branchEvidence } from '../support/branching.js';
const setup = () => {
  const work = branchWork({ a: { entry: true, to: ['b', 'c'] }, b: { to: ['z'] }, c: { to: ['z'] }, z: { ending: true }, lost: {} });
  return { work, ...branchEvidence(work, { b: [{ entityId: 'hero', kind: 'state', data: { vital: 'dead' } }, { entityId: 'key', kind: 'state', data: { exists: 'destroyed' } }] }) };
};
test('첫 gamebook 팩과 프리셋·잠금 단계·실험 참고 세트를 제공한다', async () => {
  const pack = await loadGamebookPack(); assert.equal(pack.presets.gamebook.order, 'branching');
  assert.deepEqual(pack.pipelines.leaf.map((s) => s.id), ['plan', 'draft', 'extract', 'facts', 'critic', 'revise', 'approve', 'commit']);
  assert.ok(pack.checks.every((c) => c.experimental && c.severity === 'advisory'));
  assert.equal((await loadBuiltinPacks()).has('gamebook'), true);
});
test('실제 자식 생성·사건 추출 프롬프트의 JSON 예제를 답 파서가 읽는다', async () => {
  const pack = await loadGamebookPack();
  const example = (kind, id) => {
    const { instructions } = pack.prompt({ id }, { node: { kind } });
    const match = instructions.match(/```json\s*([\s\S]*?)\s*```/i);
    assert.ok(match, `${kind}.${id} prompt must contain a fenced JSON example`);
    return parseJsonAnswer(match[1]);
  };
  assert.deepEqual(example('branch', 'children'), {
    children: [{ id: 'ep-1', title: '1화', brief: '한 줄 요약' }],
  });
  assert.deepEqual(example('leaf', 'extract'), {
    events: [
      { entityId: 'doyun', kind: 'state', data: { vital: 'dead' }, quote: '원고 속 문장 그대로' },
      { entityId: 'hana', kind: 'address', data: { term: '아가씨' }, quote: '원고 속 문장 그대로' },
    ],
    appearances: ['doyun'],
    mentions: ['hana'],
    occurrences: [{ entityId: 'doyun', kind: 'appearance', quote: '원고 속 짧은 인용' }],
  });
});
test('왼쪽 경로의 죽음·파괴는 오른쪽에 새지 않는다', () => {
  const ctx = setup(), branching = branchScope({ ...ctx, nodeId: 'z' });
  const findings = pathFacts({ branching, appearances: ['hero', 'key'], draftEvents: [], draft: '주인공과 열쇠' });
  assert.deepEqual(findings.map((f) => f.code), ['DEAD_ON_STAGE', 'DESTROYED_ON_STAGE']);
  assert.ok(findings.every((f) => f.nodeIds.includes('b') && !f.nodeIds.includes('c')));
});
test('인용 없는 되살림·복구는 경로 상태를 지우지 않고 NFC 인용은 인정한다', () => {
  const ctx = setup(), branching = branchScope({ ...ctx, nodeId: 'z' });
  const draftEvents = [{ entityId: 'hero', kind: 'state', data: { vital: 'alive' }, quote: '없음' }, { entityId: 'key', kind: 'state', data: { exists: 'restored' } }];
  assert.ok(pathFacts({ branching, appearances: ['hero', 'key'], draftEvents, draft: '되살림 복구' }).some((f) => f.code === 'DEAD_ON_STAGE'));
  draftEvents[0].quote = '되살림'; draftEvents[1].quote = '복구';
  assert.deepEqual(pathFacts({ branching, appearances: ['hero', 'key'], draftEvents, draft: '되살림 복구' }), []);
});
test('미검증 경로는 확정 사실 지적을 내지 않는다', () => {
  const ctx = setup(); ctx.work.tree.nodes.get('b').status = 'imported';
  const branching = branchScope({ ...ctx, nodeId: 'z' });
  assert.deepEqual(pathFacts({ branching, appearances: ['hero'], draftEvents: [], draft: '주인공' }), []);
  assert.ok(paths({ branching }).some((f) => f.code === 'BRANCH_EVENTS_UNVERIFIED'));
});
test('막다른 도달 장면·도달 불가·진입점 누락을 구분한다', () => {
  const ctx = setup(); ctx.work.tree.nodes.get('c').links = [];
  let branching = branchScope({ ...ctx, nodeId: 'z' });
  assert.ok(deadEnds({ branching }).some((f) => f.nodeId === 'c')); assert.ok(unreachable({ branching }).some((f) => f.nodeId === 'lost'));
  ctx.work.tree.nodes.get('a').data.branching.entry = false; branching = branchScope({ ...ctx, nodeId: 'z' });
  assert.deepEqual(unreachable({ branching }), []); assert.ok(paths({ branching }).some((f) => f.code === 'BRANCH_ENTRY_MISSING'));
});
test('최신 미상 경로 상태는 과거의 생사·존재 확정 지적을 무효화한다', () => {
  const work = branchWork({ a: { entry: true, to: ['b'] }, b: { to: ['z'] }, z: { ending: true } });
  const evidence = branchEvidence(work, { b: [
    { entityId: 'hero', kind: 'state', data: { vital: 'dead' } },
    { entityId: 'hero', kind: 'state', data: { vital: 'missing' } },
    { entityId: 'key', kind: 'state', data: { exists: 'destroyed' } },
    { entityId: 'key', kind: 'state', data: { exists: 'unknown' } },
  ] });
  const branching = branchScope({ work, ...evidence, nodeId: 'z' });
  const findings = pathFacts({ branching, appearances: ['hero', 'key'], draftEvents: [], draft: '등장' });
  assert.deepEqual(findings.map((finding) => [finding.code, finding.entityId]), [
    ['BRANCH_STATE_UNKNOWN', 'hero'], ['BRANCH_STATE_UNKNOWN', 'key'],
  ]);
});
test('초안의 미상 생사·존재는 참고 지적을 내고 확정 충돌과 파괴물 수정 지적을 억제한다', () => {
  const ctx = setup(), branching = branchScope({ ...ctx, nodeId: 'z' });
  const draftEvents = [
    { entityId: 'hero', kind: 'state', data: { vital: 'unknown' } },
    { entityId: 'key', kind: 'state', data: { exists: 'missing' } },
  ];
  const findings = pathFacts({ branching, appearances: ['hero', 'key'], draftEvents, draft: '주인공과 열쇠' });
  assert.deepEqual([...new Set(findings.map((finding) => `${finding.code}:${finding.entityId}`))], [
    'BRANCH_STATE_UNKNOWN:hero', 'BRANCH_STATE_UNKNOWN:key',
  ]);
  assert.ok(findings.every((finding) => finding.code === 'BRANCH_STATE_UNKNOWN'));
  assert.ok(!findings.some((finding) => ['DEAD_ON_STAGE', 'DESTROYED_ON_STAGE', 'DESTROYED_UPDATED'].includes(finding.code)));
});
