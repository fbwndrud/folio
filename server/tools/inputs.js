import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';
import { ID, ids, definition, argsFor, rule } from './resource-schema.js';
export const inputsDefinition = definition('folio_inputs', '입력과 profile/pipeline/policy의 정확한 선택 판본 및 전체 보관 bytes를 봉인한다. verify는 과거 checkpoint를 검증하며 현재 발행 권한을 보장하지 않는다.', ['prepare', 'verify'], {
  revisionIds: ids, profileRevisionId: ID, pipelineRevisionId: ID, policyRevisionId: ID, inputSnapshotId: ID, externalMode: { type: 'string', enum: ['reject', 'reference-only'] },
});
export async function inputsTool(root, input) {
  const { op, values } = argsFor(input, { prepare: rule(['revisionIds', 'profileRevisionId', 'pipelineRevisionId', 'policyRevisionId'], ['externalMode']), verify: rule(['inputSnapshotId']) });
  return op === 'prepare' ? prepareInput(root, values) : verifyInput(root, values.inputSnapshotId);
}
