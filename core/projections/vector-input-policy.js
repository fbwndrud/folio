import { fail } from '../operations/objects.js';

export const VECTOR_INPUT_POLICY = Object.freeze({ maxInputBytes: 8 * 1024 * 1024, maxInputs: 100, maxBatchBytes: 32 * 1024 * 1024 });

/** Use verified envelope lengths when pinning; use actual byte lengths in the adapter. */
export function assertVectorInputLengths(lengths) {
  if (!Array.isArray(lengths) || lengths.length > VECTOR_INPUT_POLICY.maxInputs || lengths.some((size) => !Number.isSafeInteger(size) || size < 0 || size > VECTOR_INPUT_POLICY.maxInputBytes) ||
    lengths.reduce((total, size) => total + size, 0) > VECTOR_INPUT_POLICY.maxBatchBytes) fail('EMBEDDING_INPUT_INVALID', 'maximum 100 inputs, 8 MiB each and 32 MiB combined');
}

export function assertVectorInputPolicy(profile) {
  const policy = profile?.processorConfig?.folioInputPolicy;
  if (!policy || Object.entries(VECTOR_INPUT_POLICY).some(([key, value]) => policy[key] !== value)) fail('VECTOR_PROFILE_INVALID', 'embedding input policy differs; reindex explicitly with the current policy');
}
