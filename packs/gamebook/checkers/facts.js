const supported = (quote, draft) => typeof quote === 'string' && quote.trim().length >= 2 && String(draft).normalize('NFC').includes(quote.normalize('NFC'));
const valueOf = (value) => typeof value === 'string' ? value.trim().toLowerCase() : value;
/** 최신 사실을 각 경로에서 따로 접는다. 미완료 경로의 생사·존재를 확정하지 않는다. */
export function pathFacts(ctx) {
  const findings = [];
  for (const path of ctx.branching?.paths ?? []) {
    if (!path.complete) continue;
    const states = new Map();
    const add = (code, entityId, message) => findings.push({ code, entityId, message, pathId: path.pathId, entry: path.entry, nodeIds: path.nodeIds });
    for (const event of path.events) {
      if (event.kind !== 'state') continue;
      const state = states.get(event.entityId) ?? {};
      for (const [field, values] of Object.entries({ vital: ['dead', 'alive'], exists: ['destroyed', 'restored'] })) {
        const value = valueOf(event.data?.[field]);
        if (value === undefined) continue;
        if (!values.includes(value)) {
          state[field] = 'unknown';
          add('BRANCH_STATE_UNKNOWN', event.entityId, `${field}의 알 수 없는 상태`);
          continue;
        }
        state[field] = value;
      }
      states.set(event.entityId, state);
    }
    for (const event of ctx.draftEvents ?? []) {
      if (event.kind !== 'state') continue;
      const state = states.get(event.entityId) ?? {};
      for (const [field, values] of Object.entries({ vital: ['dead', 'alive'], exists: ['destroyed', 'restored'] })) {
        const value = valueOf(event.data?.[field]);
        if (value === undefined || values.includes(value)) continue;
        state[field] = 'unknown';
        add('BRANCH_STATE_UNKNOWN', event.entityId, `${field}의 알 수 없는 상태`);
      }
      if (valueOf(event.data?.vital) === 'alive') {
        if (supported(event.quote, ctx.draft)) state.vital = 'alive';
        else add('REVIVAL_NOTE_MISSING', event.entityId, '되살림 인용이 원고에 없다');
      }
      if (valueOf(event.data?.exists) === 'restored') {
        if (supported(event.quote, ctx.draft)) state.exists = 'restored';
        else add('RESTORE_NOTE_MISSING', event.entityId, '복구 인용이 원고에 없다');
      }
      states.set(event.entityId, state);
    }
    for (const id of ctx.appearances ?? []) {
      const state = states.get(id);
      if (state?.vital === 'dead') add('DEAD_ON_STAGE', id, '이 경로에서 죽은 인물이 등장한다');
      if (state?.exists === 'destroyed') add('DESTROYED_ON_STAGE', id, '이 경로에서 파괴된 것이 등장한다');
    }
    for (const event of ctx.draftEvents ?? []) if (states.get(event.entityId)?.exists === 'destroyed') add('DESTROYED_UPDATED', event.entityId, '이 경로에서 파괴된 것의 사건이 있다');
  }
  const unique = [...new Map(findings.map((f) => [`${f.pathId}:${f.entityId}:${f.code}`, f])).values()];
  if (unique.length <= 200) return unique;
  return [...unique.slice(0, 199), { code: 'BRANCH_ANALYSIS_INCOMPLETE', message: '경로 사실 지적이 200개 한도를 넘었다' }];
}
