import { queryResources } from '../../core/query/resources.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { ID, CHECKPOINT, definition, argsFor, rule } from './resource-schema.js';
export const resourceQueryDefinition = definition('folio_resource_query', '선택 원본과 최종 approve 결과만 metadata로 조회한다. refresh로 검증된 checkpoint generation을 만든다. query selector={type:current}|{type:atRevision,revisionId}|{type:atCheckpoint,checkpoint}. freshness=requireCurrent는 최신 checkpoint/관측 불일치 거부, allowStale은 실제 판본·누락·근거 반환. metadata 최신성과 과거 입력 결과의 reviewRequired는 별도. Vector 검색은 별도 folio_embeddings이며 이 도구는 Graph/Wiki/CSV/PDF parsing 지원을 뜻하지 않는다.', ['query', 'refresh'], {
  resourceId: ID, checkpoint: CHECKPOINT,
  selector: { type: 'object', additionalProperties: false, required: ['type'], properties: { type: { type: 'string', enum: ['current', 'atRevision', 'atCheckpoint'] }, revisionId: ID, checkpoint: CHECKPOINT } },
  freshness: { type: 'string', enum: ['requireCurrent', 'allowStale'] },
});
export async function resourceQueryTool(root, input) {
  const { op, values } = argsFor(input, { query: rule([], ['resourceId', 'selector', 'freshness']), refresh: rule([], ['checkpoint']) });
  return op === 'query' ? queryResources(root, values) : buildMetadataProjection(root, values);
}
