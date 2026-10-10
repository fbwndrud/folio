import { draftDefinitions, prerequisitesOf, priorDefinitions, workEntities } from './definitions.js';

/** 지적에 담을 문자열이 아닌 값을 사람이 읽을 수 있게 나타낸다. 객체·배열은 JSON.stringify, 그래도 안 되면(순환 등) String. */
function display(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 선수 개념 순서(knowledge.prerequisite-order). 이 원고가 X 를 정의(인용 있는 term.defined)하는데
 * X 의 선수 개념(엔티티 data.prerequisites) 가운데 앞 노드에서도, 이 원고의 X 정의보다 앞(인용 위치)에서도 정의되지 않은 것이 있으면 지적한다.
 * - 선수 개념의 앞 사건은 코어 범위(gatherScope 의 prerequisiteIds)가 priorEvents 에 넣어 준다.
 * - 없는 엔티티 id 를 선수 개념으로 적었으면 PREREQUISITE_UNKNOWN 으로 알린다(조용히 넘기지 않는다).
 * - `data.prerequisites`가 배열이 아니거나, 원소가 비어 있지 않은 문자열이 아니거나, 자기 자신을 적었으면
 *   PREREQUISITE_INVALID 로 알린다(형식 오류를 조용히 넘기지 않는다 — Review Round 1 M2·M3).
 * - 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다.
 * - ctx.work 가 없으면 던진다(workEntities — 코어가 CHECK_CRASHED 로 알린다).
 * - 결정론 한계: 이 검사는 draftDefinitions(추출 답이 고른 인용과 그 위치)를 그대로 믿는다. 추출 답이 X 의 이름이 든
 *   원고의 뒤쪽 문장을 X 의 "정의" 인용으로 고르면, X 의 인용 위치가 실제보다 뒤로 밀려 선수 개념이 실제로는 아직
 *   정의되지 않았어도 순서 지적이 사라질 수 있다(Review Round 1 M4). A1 의 정의 전 사용 검사와 같은 부류의 한계다.
 * @param {{ priorEvents?: any[], draftEvents?: any[], draft?: string, work?: { entities: Map<string, any> } }} ctx
 */
export function prerequisiteOrder(ctx) {
  const entities = workEntities(ctx);
  const prior = priorDefinitions(ctx);
  const here = draftDefinitions(ctx);
  const findings = [];
  for (const [id, at] of here) {
    const entity = entities.get(id);
    const raw = entity?.data?.prerequisites;
    if (raw !== undefined && !Array.isArray(raw)) {
      findings.push({
        code: 'PREREQUISITE_INVALID', entityId: id, prerequisite: display(raw),
        message: `${entity.name}(${id}): 선수 개념 목록은 배열이어야 하는데 "${display(raw)}"이다`,
      });
    } else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item !== 'string' || item.trim().length === 0) {
          findings.push({
            code: 'PREREQUISITE_INVALID', entityId: id, prerequisite: display(item),
            message: `${entity.name}(${id}): 선수 개념 항목은 빈 값이 아닌 문자열이어야 하는데 "${display(item)}"이다`,
          });
        } else if (item === id) {
          findings.push({
            code: 'PREREQUISITE_INVALID', entityId: id, prerequisite: display(item),
            message: `${entity.name}(${id}): 자기 자신을 선수 개념으로 적었다`,
          });
        }
      }
    }
    for (const need of prerequisitesOf(entity)) {
      if (need === id) continue; // 자기 참조는 위에서 PREREQUISITE_INVALID 로 이미 알렸다.
      if (!entities.has(need)) {
        findings.push({ code: 'PREREQUISITE_UNKNOWN', entityId: id, prerequisite: need, message: `${entity.name}(${id}): 선수 개념 "${need}"은(는) 없는 엔티티다` });
        continue;
      }
      if (prior.has(need) || (here.has(need) && here.get(need) < at)) continue;
      const name = entities.get(need).name;
      findings.push({
        code: 'PREREQUISITE_NOT_DEFINED', entityId: id, prerequisite: need,
        message: `${entity.name}(${id})을(를) 정의하기 전에 선수 개념 ${name}(${need})이(가) 정의되지 않았다`,
      });
    }
  }
  return findings;
}
