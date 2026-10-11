import { lstat, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { FolioError } from '../../core/errors.js';

const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
});

/** 뷰어 화면(HTML)의 CSP. 스크립트·연결은 이 서버만, 밖으로 나가는 요청은 없다. */
export const PAGE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; "
  + "font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

/** 화면을 빌드하는 명령(folio_view 의 hint, 내보내기 오류의 hint). */
export const BUILD_HINT = 'npm --prefix viewer ci && npm --prefix viewer run build';

/** viewer/dist 가 없을 때의 첫 화면. API 는 이미 돈다. */
export const FALLBACK_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Linivera Viewer</title></head>
<body><h1>The viewer is not ready yet</h1>
<p>Ask your AI assistant to prepare the viewing screens, then reopen this page.</p>
<details><summary>Setup details</summary><p>In the Linivera repository, run <code>${BUILD_HINT}</code>. An installed package should already contain the screens; reinstall a prepared tarball if they are missing. The viewing service is already running.</p></details></body></html>
`;

const notFound = (pathname) => new FolioError('STATIC_NOT_FOUND', String(pathname).slice(0, 200));

/**
 * 빌드된 뷰어 파일 하나. distDir 밖은 읽지 않는다: 풀어 쓴 경로에 빈 조각·`.`·`..`·역슬래시·NUL 이 있으면 거부하고,
 * 지나는 것이 링크면 거부한다. `/` 는 index.html 이고, index.html 이 없으면 FALLBACK_HTML 을 준다.
 * @param {string} distDir
 * @param {string} pathname URL 의 pathname(아직 풀지 않은 것)
 * @returns {Promise<{ type: string, bytes: Buffer }>}
 */
export async function staticFile(distDir, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw notFound(pathname); }
  const rel = decoded === '/' ? 'index.html' : decoded.slice(1);
  const parts = rel.split('/');
  if (!decoded.startsWith('/') || /[\\\0]/.test(rel) || parts.some((p) => p === '' || p === '.' || p === '..')) throw notFound(pathname);
  const type = TYPES[extname(rel).toLowerCase()];
  if (!type) throw notFound(pathname);
  let at = distDir;
  for (const part of parts) {
    at = join(at, part);
    const info = await lstat(at).catch((error) => { if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null; throw error; });
    if (!info || info.isSymbolicLink()) {
      if (rel === 'index.html' && !info) return { type: TYPES['.html'], bytes: Buffer.from(FALLBACK_HTML) };
      throw notFound(pathname);
    }
  }
  return { type, bytes: await readFile(at) };
}
