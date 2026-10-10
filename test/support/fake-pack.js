/**
 * 모델 없이 실행기를 시험하는 팩. 단계 모양은 계획서의 소설 팩 기본값과 같다.
 * leaf 에는 계획서 대조 결과대로 extract 단계가 facts 앞에 있다.
 */
function deadOnStage(ctx) {
  const dead = new Set();
  for (const event of ctx.priorEvents) {
    if (event.kind !== 'state') continue;
    if (event.data?.vital === 'dead') dead.add(event.entityId);
    if (event.data?.vital === 'alive') dead.delete(event.entityId);
  }
  return ctx.appearances.filter((id) => dead.has(id))
    .map((id) => ({ code: 'DEAD_ON_STAGE', message: `${id} is dead but appears on stage`, entityId: id }));
}

function definedBeforeUse(ctx) {
  const defined = new Set([...ctx.priorEvents, ...ctx.draftEvents].filter((e) => e.kind === 'term.defined').map((e) => e.entityId));
  return ctx.draftEvents.filter((e) => e.kind === 'term.used' && !defined.has(e.entityId))
    .map((e) => ({ code: 'USED_BEFORE_DEFINED', message: `${e.entityId} is used before it is defined`, entityId: e.entityId }));
}

export const fakePack = {
  name: 'fake',
  pipelines: {
    leaf: [
      { id: 'plan', kind: 'generate', produces: 'plan' },
      { id: 'draft', kind: 'generate', produces: 'draft' },
      { id: 'extract', kind: 'generate', produces: 'events', requires: ['draft'] },
      { id: 'facts', kind: 'check', tier: 'deterministic', stage: 'facts', locked: true, requires: ['extract'] },
      { id: 'critic', kind: 'check', tier: 'model', stage: 'critic' },
      { id: 'revise', kind: 'generate', produces: 'draft', loop: { until: ['facts'], max: 3 } },
      { id: 'approve', kind: 'gate' },
      { id: 'commit', kind: 'commit', locked: true },
    ],
    branch: [
      { id: 'plan', kind: 'generate', produces: 'plan' },
      { id: 'fit', kind: 'check', tier: 'model', stage: 'fit' },
      { id: 'revise', kind: 'generate', produces: 'draft', loop: { until: ['fit'], max: 3 } },
      { id: 'approve', kind: 'gate' },
      { id: 'children', kind: 'generate', produces: 'children' },
      { id: 'review', kind: 'check', tier: 'model', stage: 'review' },
      { id: 'commit', kind: 'commit', locked: true },
    ],
  },
  checks: [
    { id: 'fake.dead-on-stage', tier: 'deterministic', stage: 'facts', severity: 'hard', requiresOrder: 'linear', origin: 'pack', run: deadOnStage },
    { id: 'fake.defined-before-use', tier: 'deterministic', stage: 'facts', severity: 'hard', requiresOrder: 'linear', origin: 'pack', run: definedBeforeUse },
    { id: 'fake.critic', tier: 'model', stage: 'critic', severity: 'advisory', origin: 'pack', instruction: 'Review the draft.' },
    { id: 'fake.parent-fit', tier: 'model', stage: 'fit', severity: 'block', requiresParentPlan: true, origin: 'pack', instruction: 'Does this plan keep the parent plan promises?' },
    { id: 'fake.promise-kept', tier: 'model', stage: 'review', severity: 'advisory', origin: 'pack', instruction: 'Did the finished children keep this plan?' },
  ],
  defaultCheckSets: ['fake.basic'],
  checkSets: {
    'fake.basic': {
      title: '기본 검사', description: '가짜 팩의 모든 검사.', recommendedFor: { kinds: ['novel', 'serial'] },
      checks: ['fake.dead-on-stage', 'fake.defined-before-use', 'fake.critic', 'fake.parent-fit', 'fake.promise-kept'],
    },
    'fake.empty': { title: '빈 세트', description: '검사 없음.', checks: [] },
    'fake.plans': {
      title: '계획 검사', description: '가지 노드의 계획을 본다.', recommendedFor: { positions: ['branch'] },
      checks: ['fake.parent-fit', 'fake.promise-kept'],
    },
    'fake.scenes': {
      title: '장면 연속성', description: '본문 장면의 연속성.', recommendedFor: { kinds: ['novel'], levels: ['scene', 'episode'], roles: ['body'], positions: ['leaf'] },
      checks: ['fake.dead-on-stage', 'fake.critic'],
    },
    'fake.matter': { title: '앞뒤 부록', description: '서문·부록 검토.', recommendedFor: { roles: ['front', 'back'] }, checks: ['fake.critic'] },
    'fake.textbook': { title: '용어 순서', description: '정의 전 사용 금지.', recommendedFor: { kinds: ['textbook'], levels: ['section'] }, checks: ['fake.defined-before-use'] },
  },
};

export const fakePacks = () => new Map([['fake', fakePack]]);
