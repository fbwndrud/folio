import { spawn } from 'node:child_process';
import { FolioError } from '../../core/errors.js';
/** JSON-only transport: no shell, bounded output, timeout and redacted failures. */
export function runWorker(python, worker, request, { timeoutMs = 300000, maxOutputBytes = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [worker], { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' } });
    let stdout = ''; let stderrBytes = 0; let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (error) { child.kill('SIGKILL'); reject(error); } else resolve(value); };
    const timer = setTimeout(() => finish(new FolioError('EMBEDDING_TIMEOUT', 'local embedding worker timed out')), timeoutMs);
    child.on('error', () => finish(new FolioError('EMBEDDING_RUNTIME_UNAVAILABLE', 'configured Python could not start')));
    child.stdin.on('error', () => {});
    child.stdout.on('data', (bytes) => { stdout += bytes.toString('utf8'); if (Buffer.byteLength(stdout) > maxOutputBytes) finish(new FolioError('EMBEDDING_OUTPUT_LIMIT', 'worker output exceeded bound')); });
    child.stderr.on('data', (bytes) => { stderrBytes += bytes.length; if (stderrBytes > 65536) finish(new FolioError('EMBEDDING_OUTPUT_LIMIT', 'worker diagnostics exceeded bound')); });
    child.on('close', (code) => {
      if (code !== 0) return finish(new FolioError('EMBEDDING_RUNTIME_FAILURE', 'local worker failed; verify installed dependencies and offline model cache', { exitCode: code }));
      try { const value = JSON.parse(stdout); if (value.error) return finish(new FolioError(['EMBEDDING_TEXT_TOO_LONG', 'EMBEDDING_IMAGE_TOO_LARGE'].includes(value.errorCode) ? value.errorCode : 'EMBEDDING_RUNTIME_FAILURE', value.error)); finish(null, value); }
      catch { finish(new FolioError('EMBEDDING_PROTOCOL_INVALID', 'worker must emit exactly one JSON response')); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
