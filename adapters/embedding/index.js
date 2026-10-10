import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FolioError } from '../../core/errors.js';
import { profileDigest, validateVector } from '../../core/projections/vector-profile.js';
import { assertVectorInputLengths } from '../../core/projections/vector-input-policy.js';
import { runWorker } from './subprocess.js';
export const MODEL_REVISION = '914f7f89142e33e77833254d9c9b90c3cef7303b';
const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
export function createEmbeddingAdapter({ python = process.env.FOLIO_EMBEDDING_PYTHON, timeoutMs = 300000 } = {}) {
  async function encode(inputs, { query = false, dimension = 768 } = {}) {
    if (!python) throw new FolioError('EMBEDDING_RUNTIME_UNAVAILABLE', 'set FOLIO_EMBEDDING_PYTHON to an optional local Python runtime');
    if (![128, 256, 512, 768].includes(dimension) || !Array.isArray(inputs) || inputs.length > 100) throw new FolioError('EMBEDDING_INPUT_INVALID', 'dimension and bounded batch required');
    if (inputs.some((input) => !(input?.bytes instanceof Uint8Array))) throw new FolioError('EMBEDDING_INPUT_INVALID', 'observed bytes required; remote URIs are unsupported');
    assertVectorInputLengths(inputs.map((input) => input.bytes.byteLength));
    const directory = await mkdtemp(join(tmpdir(), 'folio-embedding-'));
    try {
      const payload = [];
      for (const [i, input] of inputs.entries()) {
        if (['text/plain', 'application/json'].includes(input.mediaType)) payload.push({ text: new TextDecoder('utf-8', { fatal: true }).decode(input.bytes) });
        else if (!query && extensions[input.mediaType]) {
          const path = join(directory, String(i) + extensions[input.mediaType]); await writeFile(path, input.bytes); payload.push({ image: path });
        } else throw new FolioError('EMBEDDING_MEDIA_UNSUPPORTED', 'runtime supports text and local raster images; audio/video require a future verified adapter');
      }
      const result = await runWorker(python, fileURLToPath(new URL('./worker.py', import.meta.url)), { inputs: payload, query, dimension, revision: MODEL_REVISION }, { timeoutMs });
      profileDigest(result.profile);
      if (result.profile.model !== 'google/embeddinggemma-2' || result.profile.modelRevision !== MODEL_REVISION || result.profile.processorRevision !== MODEL_REVISION || result.profile.dimension !== dimension || result.vectors?.length !== inputs.length) throw new FolioError('EMBEDDING_PROTOCOL_INVALID', 'worker model profile differs');
      result.vectors.forEach((v) => validateVector(v, dimension));
      return result;
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  return Object.freeze({ encode });
}
