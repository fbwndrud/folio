import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { FolioError } from '../../core/errors.js';
import { routeApi } from './api.js';
import { errorResponse, sendBytes, sendJson } from './respond.js';
import { PAGE_CSP, staticFile } from './static.js';

export const LOOPBACK = '127.0.0.1';
export const IDLE_MS = 30 * 60 * 1000;
export const MAX_BODY = 16 * 1024;
const ASSET_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** @param {unknown} error */
const logToStderr = (error) => {
  process.stderr.write(`linivera-view: ${String(/** @type {any} */ (error)?.message ?? error).replace(/\s+/g, ' ').slice(0, 300)}\n`);
};

/**
 * 요청 본문(JSON)을 16KiB 까지 읽는다. application/json 이 아니면 거부한다(다른 사이트의 단순 요청을 막는다).
 * @param {import('node:http').IncomingMessage} req
 */
async function readJson(req) {
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new FolioError('CONTENT_TYPE_INVALID', 'send application/json');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new FolioError('BODY_TOO_LARGE', `at most ${MAX_BODY} bytes`);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new FolioError('BAD_JSON', 'the body is not JSON'); }
}

/**
 * 한 작품의 로컬 뷰어 서버(node:http). 127.0.0.1 에만 묶고, 포트는 레지스트리가 작품별 선호 포트를 먼저 써 보고 쓰는 중이면 0(OS 가 고름)으로 넘어간다. 직접 부르면 기본은 0.
 * - root 는 여기서 한 번 정해진다. API 는 root·경로를 받지 않고 id 만 받는다(core/view 가 작품 폴더 안만 읽는다).
 * - Host 머리글은 127.0.0.1:<port> 또는 localhost:<port> 만(DNS 리바인딩 막기). /api/* 는 X-Folio-Token 이 맞아야 한다.
 * - POST 는 JSON 만, Origin 이 있으면 같은 곳이어야 한다.
 * - idleMs 동안 요청이 없으면 스스로 닫힌다. close()·POST /api/shutdown 으로도 닫힌다. 프로세스를 붙잡지 않는다(unref).
 * @param {{ root: string, packs: Map<string, any>, distDir: string, idleMs?: number, port?: number, onError?: (error: unknown) => void, onClose?: () => void }} options
 * @returns {Promise<{ url: string, port: number, token: string, close: () => Promise<void>, closed: Promise<void>, touch: () => void }>}
 */
export function startViewServer({ root, packs, distDir, idleMs = IDLE_MS, port = 0, onError = logToStderr, onClose = () => {} }) {
  const token = randomBytes(24).toString('base64url');
  const expected = Buffer.from(token);
  let bound = 0;
  /** @type {NodeJS.Timeout | null} */
  let timer = null;
  /** @type {Promise<void> | null} */
  let closing = null;
  /** @type {(value?: void) => void} */
  let markClosed = () => {};
  const closed = new Promise((resolve) => { markClosed = resolve; });
  const server = createServer((req, res) => {
    touch();
    handle(req, res).catch((error) => {
      const out = errorResponse(error);
      if (out.status === 500) onError(error);
      if (!res.headersSent) sendJson(res, out.status, out.body);
      else res.destroy();
    });
  });
  const close = () => {
    closing ??= new Promise((resolve) => {
      if (timer) clearTimeout(timer);
      server.close(() => { onClose(); markClosed(); resolve(); });
      server.closeAllConnections();
    });
    return closing;
  };
  function touch() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { close(); }, idleMs);
    timer.unref();
  }
  const origins = () => [`${LOOPBACK}:${bound}`, `localhost:${bound}`];
  const tokenOk = (value) => {
    const given = Buffer.from(typeof value === 'string' ? value : '');
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    if (!origins().includes(String(req.headers.host ?? ''))) throw new FolioError('HOST_NOT_ALLOWED', 'use the address folio_view gave');
    const { pathname } = new URL(req.url ?? '/', `http://${LOOPBACK}:${bound}`);
    const method = req.method ?? 'GET';
    if (pathname.startsWith('/api/')) {
      if (!tokenOk(req.headers['x-folio-token'])) throw new FolioError('TOKEN_INVALID', 'open the viewer from the address folio_view gave');
      const origin = req.headers.origin;
      if (method === 'POST' && origin !== undefined && !origins().map((o) => `http://${o}`).includes(origin)) throw new FolioError('ORIGIN_NOT_ALLOWED', 'cross-site request');
      const body = method === 'POST' ? await readJson(req) : undefined;
      const result = await routeApi({ method, pathname, body, ctx: { root, packs, distDir, close: () => { setImmediate(close); } } });
      if ('file' in result) sendBytes(res, result.file, { 'content-security-policy': ASSET_CSP });
      else sendJson(res, 200, result.json);
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') throw new FolioError('METHOD_NOT_ALLOWED', method.slice(0, 10));
    const file = await staticFile(distDir, pathname);
    sendBytes(res, file, file.type.startsWith('text/html') ? { 'content-security-policy': PAGE_CSP } : {});
  }
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => {
      server.off('error', reject);
      server.on('error', onError); // listen 뒤의 accept 오류(예: EMFILE)가 리스너 없이 프로세스를 끄지 않게 한다.
      server.unref();
      const address = server.address();
      bound = typeof address === 'object' && address ? address.port : port;
      touch();
      resolve({ url: `http://${LOOPBACK}:${bound}/`, port: bound, token, close, closed, touch });
    });
  });
}
