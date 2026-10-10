import { createServer } from 'node:http';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FolioError } from '../../core/errors.js';
import { EXPORT_MARKER } from './export.js';
import { IDLE_MS, LOOPBACK } from './http-server.js';
import { errorResponse, sendBytes, sendJson } from './respond.js';
import { PAGE_CSP, staticFile } from './static.js';

/** Preview only an explicitly selected Folio export, never an arbitrary work folder. */
export async function exportDirectory(directory) {
  const root = await realpath(resolve(directory)).catch(() => null);
  if (!root) throw new FolioError('VIEWER_EXPORT_INVALID', 'choose an existing viewer export folder');
  const regular = (name) => lstat(join(root, name)).then((info) => info.isFile(), () => false);
  if (!await regular(EXPORT_MARKER) || !await regular('index.html')) {
    throw new FolioError('VIEWER_EXPORT_INVALID', 'choose the exports/viewer folder made by Export review view');
  }
  const marker = await readFile(join(root, EXPORT_MARKER), 'utf8');
  if (!marker.startsWith('made by the folio viewer export;')) throw new FolioError('VIEWER_EXPORT_INVALID', 'the export marker is not recognized');
  return root;
}

/** Loopback-only static preview: no work APIs, no writes, no directory listing. */
export async function startExportPreview(directory, { port = 0, idleMs = IDLE_MS } = {}) {
  const root = await exportDirectory(directory);
  let bound = 0;
  /** @type {NodeJS.Timeout|null} */
  let timer = null;
  /** @type {Promise<void>|null} */
  let closing = null;
  /** @type {() => void} */
  let markClosed = () => {};
  const closed = new Promise((resolveClosed) => { markClosed = () => resolveClosed(undefined); });
  const server = createServer((req, res) => {
    touch();
    handle(req, res).catch((error) => { const out = errorResponse(error); sendJson(res, out.status, out.body); });
  });
  const close = () => {
    closing ??= new Promise((finish) => {
      if (timer) clearTimeout(timer);
      server.close(() => { markClosed(); finish(); });
      server.closeAllConnections();
    });
    return closing;
  };
  function touch() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { close(); }, idleMs);
    timer.unref();
  }
  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
  async function handle(req, res) {
    if (![`127.0.0.1:${bound}`, `localhost:${bound}`].includes(String(req.headers.host ?? ''))) {
      throw new FolioError('HOST_NOT_ALLOWED', 'use the local preview address');
    }
    const pathname = new URL(req.url ?? '/', `http://${LOOPBACK}:${bound}`).pathname;
    if (pathname.startsWith('/api/')) throw new FolioError('ROUTE_UNKNOWN', 'exported views have no work APIs');
    if (!['GET', 'HEAD'].includes(req.method ?? 'GET')) throw new FolioError('METHOD_NOT_ALLOWED', 'exported views are read only');
    const unchangedRoot = await realpath(root).catch(() => null);
    if (unchangedRoot !== root) throw new FolioError('VIEWER_EXPORT_INVALID', 'the selected folder was moved or replaced');
    const file = await staticFile(root, pathname);
    sendBytes(res, file,
      file.type.startsWith('text/html') ? { 'content-security-policy': PAGE_CSP } : {});
  }
  return new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => {
      server.off('error', reject);
      server.on('error', () => { close(); });
      server.unref();
      const address = server.address();
      bound = typeof address === 'object' && address ? address.port : port;
      touch();
      resolveReady({ url: `http://${LOOPBACK}:${bound}/`, port: bound, closed, close });
    });
  });
}
