import { createEmbeddingAdapter } from '../../adapters/embedding/index.js';
import { pinVectorInputs, saveVectors, readVectors, searchVectors, profileDigest } from '../../core/projections/vectors.js';
import { FolioError } from '../../core/errors.js';
import { ID, definition, argsFor, rule } from './resource-schema.js';
export const embeddingsDefinition = definition('folio_embeddings', '선택된 owned text/JSON·이미지의 로컬 모델 벡터를 index하고 exact generationId에 search한다. FOLIO_EMBEDDING_PYTHON 선택 런타임·오프라인 고정 가중치 필요. 입력 판본/checkpoint/profile 결속. 미관측 외부 URI 자동 fetch 없음. source 선택·작품 승인·품질 검토를 대신하지 않는다. freshness 기본 requireCurrent; allowStale은 실제 과거 판본·누락·근거를 반환한다. audio/video는 현재 미지원.', ['index', 'search'], {
  generationId: ID, text: { type: 'string', minLength: 1, maxLength: 32768 },
  dimension: { type: 'integer', enum: [128, 256, 512, 768] },
  freshness: { type: 'string', enum: ['requireCurrent', 'allowStale'] }, limit: { type: 'integer', minimum: 1, maximum: 100 },
});
export async function embeddingsTool(root, input, { adapter = createEmbeddingAdapter() } = {}) {
  const { op, values } = argsFor(input, { index: rule([], ['dimension', 'freshness']), search: rule(['generationId', 'text'], ['freshness', 'limit']) });
  if (values.freshness !== undefined && !['requireCurrent', 'allowStale'].includes(values.freshness)) throw new FolioError('TOOL_INPUT_INVALID', 'invalid freshness');
  if (values.dimension !== undefined && ![128, 256, 512, 768].includes(values.dimension)) throw new FolioError('TOOL_INPUT_INVALID', 'unsupported dimension');
  if (values.limit !== undefined && (!Number.isSafeInteger(values.limit) || values.limit < 1 || values.limit > 100)) throw new FolioError('TOOL_INPUT_INVALID', 'bounded limit required');
  if (op === 'index') {
    const pin = await pinVectorInputs(root);
    if (!pin.inputs.length) throw new FolioError('EMBEDDING_CONTENT_UNAVAILABLE', 'no selected observed supported bytes to index');
    if (pin.inputs.length > 100) throw new FolioError('EMBEDDING_INPUT_INVALID', 'maximum 100 selected sources per generation');
    const output = await adapter.encode(pin.inputs.map(({ entry, bytes }) => ({ bytes, mediaType: entry.mediaType })), { dimension: values.dimension ?? 768 });
    return saveVectors(root, pin, output, { freshness: values.freshness ?? 'requireCurrent' });
  }
  if (typeof values.text !== 'string' || !values.text.trim() || values.text.length > 32768) throw new FolioError('TOOL_INPUT_INVALID', 'bounded nonempty search text required');
  const generation = await readVectors(root, values.generationId);
  const output = await adapter.encode([{ bytes: Buffer.from(values.text), mediaType: 'text/plain' }], { query: true, dimension: generation.manifest.profile.dimension });
  if (profileDigest(output.profile) !== generation.manifest.profileDigest) throw new FolioError('VECTOR_PROFILE_MISMATCH', 'query runtime differs from indexed profile');
  return searchVectors(root, { generationId: values.generationId, profile: output.profile, vector: output.vectors[0], ...(values.freshness ? { freshness: values.freshness } : {}), ...(values.limit === undefined ? {} : { limit: values.limit }) });
}
