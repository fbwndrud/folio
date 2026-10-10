import { FolioError } from '../errors.js';
import { canonicalJson } from '../util/hash.js';
import { normalizeDiscoveryEvidence } from './subject-schema.js';
import { assertJson, fields, id, invalid, normalizeValue, text as meaningful } from './schema.js';

export const criterionAppliesTo = (criterion, nodeId) => criterion.appliesTo === 'all' || criterion.appliesTo.includes(nodeId);

/** 관찰은 제출한 basis와 관점을 유지한다. 엔진은 의미나 이미지에서 본문 인용을 만들어 내지 않는다. */
export function normalizeObservation(input, { entities, criteria, nodeId, text }) {
  assertJson(input);
  fields(input, ['subjectId', 'criterionId', 'value', 'basis', 'perspectiveId', 'timeLabel', 'pathLabel', 'evidence'], 'observation');
  const subjectId = id(input.subjectId, 'observation.subjectId');
  const criterionId = id(input.criterionId, 'observation.criterionId');
  const subject = entities.get(subjectId);
  const criterion = criteria.find((entry) => entry.id === criterionId);
  if (!subject || !criterion || !criterion.subjectKinds.includes(subject.kind) || !criterionAppliesTo(criterion, nodeId)) throw invalid('observation requires a known subject and applicable criterion of matching kind');
  if (!['explicit', 'attributed', 'inferred'].includes(input.basis)) throw invalid('observation requires a known basis');
  const value = normalizeValue(input.value, criterion.valueType);
  const refs = criterion.valueType === 'entity' ? [value] : criterion.valueType === 'entity-list' && Array.isArray(value) ? value : [];
  if (refs.some((ref) => !entities.has(ref))) throw invalid('observation value references an unknown entity');
  if (input.basis === 'attributed' && input.perspectiveId === undefined) throw invalid('attributed observation requires perspectiveId');
  if (input.perspectiveId !== undefined && !entities.has(id(input.perspectiveId, 'perspectiveId'))) throw invalid('perspectiveId references an unknown entity');
  const evidence = normalizeDiscoveryEvidence(input.evidence, { nodeId, text });
  if (criterion.behavior === 'fixed' && input.basis === 'explicit' && canonicalJson(value) !== canonicalJson(criterion.expectedValue)) {
    throw new FolioError('TRACKING_FIXED_VALUE_CONFLICT', `explicit observation conflicts with ${criterion.id}`, { subjectId, criterionId });
  }
  return { subjectId, criterionId, value, basis: input.basis,
    ...(input.perspectiveId !== undefined ? { perspectiveId: input.perspectiveId } : {}),
    ...(input.timeLabel !== undefined ? { timeLabel: meaningful(input.timeLabel, 'timeLabel') } : {}),
    ...(input.pathLabel !== undefined ? { pathLabel: meaningful(input.pathLabel, 'pathLabel') } : {}), evidence };
}
