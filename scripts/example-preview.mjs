import { createServer } from 'node:http';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.epub': 'application/epub+zip', '.zip': 'application/zip', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
/** Self-contained preview shipped with each ZIP. The work folder is never served. */
export async function startExamplePreview(directory, { port = 0 } = {}) {
  if (!(await lstat(directory)).isDirectory()) throw new Error('Choose a regular example folder');
  const root = await realpath(directory);
  const collection = await readFile(join(root, 'catalog.json'), 'utf8').then(s => JSON.parse(s).version === 1, () => false);
  if (!collection && !await readFile(join(root, 'manifest.json'), 'utf8').then(s => JSON.parse(s).version === 1, () => false)) throw new Error('Choose an example bundle or collection');
  let bound = 0, timer;
  const server = createServer((req, res) => {
    clearTimeout(timer); timer = setTimeout(() => server.close(), 30 * 60_000); timer.unref();
    handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(404, { 'content-type': 'text/plain' }); res.end('File unavailable'); });
  });
  async function handle(req, res) {
    if (![`127.0.0.1:${bound}`, `localhost:${bound}`].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, `http://127.0.0.1:${bound}`);
    if (!collection && url.pathname === '/') { res.writeHead(302, { location: '/studio/' }); res.end(); return; }
    let path = decodeURIComponent(url.pathname).slice(1);
    if (!path || path.endsWith('/')) path += 'index.html';
    const parts = path.split('/');
    if (/[\\\0]/.test(path) || parts.some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe path');
    const publicFile = /^(index\.html|gallery\.(css|js)|catalog\.json|manifest\.json|README\.md|THIRD-PARTY-NOTICES\.txt|SHA256SUMS|(?:linivera|folio)-example-[a-z0-9-]+\.zip)$/.test(path);
    const previewFile = collection ? /^examples\/[a-z0-9-]+\/(studio|web|epub)\//.test(path) : /^(studio|web|epub)\//.test(path);
    if (!publicFile && !previewFile) throw new Error('Private file');
    if (await realpath(root) !== root) throw new Error('Moved root');
    let at = root;
    for (const part of parts) {
      at = join(at, part); const info = await lstat(at);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error('Unsafe file');
    }
    const type = path === 'SHA256SUMS' ? 'text/plain' : TYPES[extname(path)];
    if (!type) throw new Error('Unsupported file');
    const bytes = await readFile(at);
    res.writeHead(200, { 'content-type': type, 'content-length': bytes.length, 'x-content-type-options': 'nosniff',
      'content-security-policy': CSP, ...(/\.(zip|epub)$/.test(path) ? { 'content-disposition': `attachment; filename="${parts.at(-1)}"` } : {}) });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  }
  await new Promise((ready, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', ready); });
  bound = server.address().port;
  return { url: `http://127.0.0.1:${bound}/`, close: () => new Promise(done => { clearTimeout(timer); server.close(done); server.closeAllConnections(); }) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preview = await startExamplePreview(dirname(fileURLToPath(import.meta.url)));
  console.log(preview.url);
  const stop = async () => { await preview.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
