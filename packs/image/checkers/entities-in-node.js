import { scanMentions } from '../../../core/index/scan.js';

/**
 * 장면 밖 엔티티(image.entities-in-node, 그림 생성 전 점검). 설명서 엔티티가 노드 앞머리 entities 에도, 본문 속 이름·별칭에도 없으면 알린다.
 * 노드가 없는 그림(작품 전체 그림, 기준 그림)은 지적하지 않는다.
 * @param {{ node?: { entities: string[] } | null, nodeText?: string|null, work?: { entities: Map<string, any> }, brief?: { entities?: string[] } }} ctx
 */
export function entitiesInNode(ctx) {
  if (!ctx?.node || typeof ctx.nodeText !== 'string') return [];
  const named = scanMentions(ctx.nodeText, ctx.work?.entities.values() ?? []);
  return (ctx.brief?.entities ?? []).filter((id) => !ctx.node?.entities.includes(id) && !named.has(id))
    .map((id) => ({ code: 'ENTITY_NOT_IN_NODE', message: `${id} 가 이 노드에 나오지 않는다` }));
}
