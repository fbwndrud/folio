import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorker } from '../../adapters/embedding/subprocess.js';
import { createEmbeddingAdapter } from '../../adapters/embedding/index.js';
test('subprocess unavailable, malformed protocol, timeout, output bounds and exit are explicit', async (t) => {
 const dir = await mkdtemp(join(tmpdir(), 'folio-worker-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
 const run = async (code, options = {}) => { const worker = join(dir, 'worker.cjs'); await writeFile(worker, code); return runWorker(process.execPath, worker, {}, options); };
 await assert.rejects(runWorker('/folio-missing-python', 'missing', {}), { code: 'EMBEDDING_RUNTIME_UNAVAILABLE' });
 await assert.rejects(run("process.stdout.write('not JSON')"), { code: 'EMBEDDING_PROTOCOL_INVALID' });
 await assert.rejects(run('setInterval(() => {}, 1000)', { timeoutMs: 30 }), { code: 'EMBEDDING_TIMEOUT' });
 await assert.rejects(run("process.stdout.write('x'.repeat(1000))", { maxOutputBytes: 100 }), { code: 'EMBEDDING_OUTPUT_LIMIT' });
 await assert.rejects(run('process.exit(2)'), { code: 'EMBEDDING_RUNTIME_FAILURE' });
 await assert.rejects(createEmbeddingAdapter({ python: process.execPath }).encode([{ uri: 'https://example.invalid', mediaType: 'image/png' }]), { code: 'EMBEDDING_INPUT_INVALID' });
 await assert.rejects(createEmbeddingAdapter({ python: process.execPath }).encode([{ bytes: Buffer.from('synthetic'), mediaType: 'audio/wav' }]), { code: 'EMBEDDING_MEDIA_UNSUPPORTED' });
});

test('safe worker input-policy codes are surfaced without generic runtime ambiguity', async (t) => {
 const dir = await mkdtemp(join(tmpdir(), 'folio-worker-policy-')); t.after(() => rm(dir, { recursive: true, force: true }));
 const worker = join(dir, 'worker.cjs');
 await writeFile(worker, `console.log(JSON.stringify({error:'observed input exceeds policy',errorCode:'EMBEDDING_TEXT_TOO_LONG'}))`);
 await assert.rejects(runWorker(process.execPath, worker, {}), { code: 'EMBEDDING_TEXT_TOO_LONG' });
});
