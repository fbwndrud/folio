import { TERM_KINDS, draftDefinitions, priorDefinitions, workEntities } from './definitions.js';

/**
 * 정의 전 사용(knowledge.defined-before-use). 이 노드에 나온(ctx.entityIds: 등장·언급·이름 스캔·사건·기록된 등장 위치) 개념·용어가
 * 앞 노드에서 정의(term.defined)되지 않았고 이 원고에도 인용 있는 정의가 없으면 지적한다.
 * - 이 원고의 정의는 인용이 원고에 그대로 있고, 인용에 그 이름·별칭이 있고, 이름·별칭을 지우고도 글자가 남아야 인정한다.
 *   인용 없음·이름 자체만 인용·이름+조사 하나만 인용 같은 값싼 위조로 지적이 꺼지지 않는다. 다만 결정론 검사의 한계로 이름이 든
 *   사용 문장이나 다른 용어의 정의 문장을 그대로 인용하는 위조까지는 막지 못한다.
 * - 등급은 pack.yaml(advisory)과 작가 설정(severityOverride)이 정한다. 지적에 severity 를 적지 않는다.
 * - ctx.work 가 없으면 던진다(workEntities — 코어가 CHECK_CRASHED 로 알린다).
 * @param {{ entityIds?: string[], priorEvents?: any[], draftEvents?: any[], draft?: string, work?: { entities: Map<string, any> } }} ctx
 */
export function definedBeforeUse(ctx) {
  const entities = workEntities(ctx);
  const defined = new Set([...priorDefinitions(ctx), ...draftDefinitions(ctx).keys()]);
  const findings = [];
  for (const id of ctx.entityIds ?? []) {
    const entity = entities.get(id);
    if (!entity || !TERM_KINDS.includes(entity.kind) || defined.has(id)) continue;
    findings.push({
      code: 'USED_BEFORE_DEFINED', entityId: id,
      message: `${entity.name}(${id}): 앞에서 정의되지 않았고 이 원고에도 인용 있는 정의(term.defined)가 없다`,
    });
  }
  return findings;
}
