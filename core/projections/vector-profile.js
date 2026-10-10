import { canonicalJson, sha256 } from '../util/hash.js';
import { assertVectorInputPolicy } from './vector-input-policy.js';
import { fail } from '../operations/objects.js';
export function profileDigest(profile) {
  const keys = ['model', 'modelRevision', 'processorRevision', 'processorConfig', 'runtime', 'dtype', 'dimension', 'normalization', 'prefixes'];
  if (!profile || Object.keys(profile).length !== keys.length || keys.some((k) => !Object.hasOwn(profile, k)) ||
    typeof profile.model !== 'string' || !profile.model || !/^[a-f0-9]{40}$/.test(profile.modelRevision) || !/^[a-f0-9]{40}$/.test(profile.processorRevision) ||
    profile.dtype !== 'float32' || ![128, 256, 512, 768].includes(profile.dimension) || profile.normalization !== 'l2' ||
    !profile.processorConfig || typeof profile.processorConfig !== 'object' || Array.isArray(profile.processorConfig) ||
    !profile.runtime || typeof profile.runtime !== 'object' || Array.isArray(profile.runtime) || !Object.keys(profile.runtime).length || Object.values(profile.runtime).some((v) => typeof v !== 'string' || !v) ||
    !profile.prefixes || Object.keys(profile.prefixes).sort().join() !== 'document,media,query' || Object.values(profile.prefixes).some((v) => typeof v !== 'string')) fail('VECTOR_PROFILE_INVALID', 'exact model/processor/runtime/float32/normalized space required');
  assertVectorInputPolicy(profile);
  return sha256(canonicalJson(profile));
}
export function validateVector(vector, dimension) {
  if (!Array.isArray(vector) || vector.length !== dimension || vector.some((n) => typeof n !== 'number' || !Number.isFinite(n))) fail('VECTOR_INVALID', 'finite exact dimension required');
  const norm = Math.sqrt(vector.reduce((s, n) => s + n * n, 0));
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.0001) fail('VECTOR_INVALID', 'nonzero l2 normalized vector required');
}
