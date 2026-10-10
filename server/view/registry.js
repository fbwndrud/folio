import { realpath, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewerTarget } from '../../core/view/index.js';
import { IDLE_MS, startViewServer } from './http-server.js';
import { BUILD_HINT } from './static.js';

/** 빌드된 뷰어 화면 자리(viewer/ 의 vite build 결과). 커밋하지 않는다. */
export const DIST_DIR = fileURLToPath(new URL('../../viewer/dist/', import.meta.url));
export { BUILD_HINT };

const exists = (path) => stat(path).then((info) => info.isFile(), () => false);

/** 실제 경로(심볼릭 링크를 푼 것). 못 풀면 resolve 결과. 서버 목록 키와 선호 포트가 같은 경로를 쓰게 한다. */
function realKey(root) {
  try { return realpathSync.native(resolve(root)); } catch { return resolve(root); }
}

/**
 * 작품마다 먼저 써 보는 포트(41000~48999, 작품 경로의 hash). 주소(origin)가 작품마다 같아야 브라우저가
 * 관계도 색 같은 화면 설정을 다음 번에도 기억한다. 이미 쓰는 중이면 OS 가 고르는 포트로 바꾼다.
 * @param {string} root
 */
export const preferredPort = (root) => 41000 + (createHash('sha256').update(realKey(root)).digest().readUInt32BE(0) % 8000);

/**
 * 작품마다 뷰어 서버 하나. 이 MCP 서버 프로세스 안에서 돌고, 프로세스가 끝나면 같이 끝난다.
 * 같은 작품을 다시 열면 떠 있는 서버를 다시 쓴다(reused: true, 유휴 시간도 새로 센다). 서버가 닫히면(유휴·닫기 버튼) 목록에서 빠진다.
 * @param {{ packs: Map<string, any>, distDir?: string, idleMs?: number, start?: typeof startViewServer }} options
 */
export function createViewerRegistry({ packs, distDir = DIST_DIR, idleMs = IDLE_MS, start = startViewServer }) {
  /** @type {Map<string, Promise<Awaited<ReturnType<typeof startViewServer>>>>} */
  const running = new Map();
  /**
   * @param {string} root
   * @param {{ nodeId?: string }} [options]
   */
  async function open(root, { nodeId } = {}) {
    await viewerTarget(root, nodeId);
    // 같은 작품이 심볼릭 링크로 열려도 서버 하나를 쓰도록 실제 경로를 키로 쓴다.
    const key = await realpath(resolve(root)).catch(() => resolve(root));
    let entry = running.get(key);
    const reused = Boolean(entry);
    if (!entry) {
      const options = { root: key, packs, distDir, idleMs, onClose: () => { if (running.get(key) === started) running.delete(key); } };
      const started = start({ ...options, port: preferredPort(key) })
        .catch((error) => { if (error?.code === 'EADDRINUSE') return start({ ...options, port: 0 }); throw error; });
      running.set(key, started);
      started.catch(() => { if (running.get(key) === started) running.delete(key); });
      entry = started;
    }
    const server = await entry;
    server.touch();
    const built = await exists(join(distDir, 'index.html'));
    const hash = nodeId === undefined ? '' : `#/read/${encodeURIComponent(nodeId)}`;
    return {
      status: 'ready', url: `${server.url}?token=${server.token}${hash}`, reused, built, idleMinutes: Math.round(idleMs / 60000),
      ...(built ? {} : { hint: BUILD_HINT }),
    };
  }
  /** 떠 있는 서버를 모두 닫는다(테스트·종료용). */
  async function closeAll() {
    const servers = await Promise.allSettled([...running.values()]);
    await Promise.all(servers.filter((s) => s.status === 'fulfilled').map((s) => /** @type {any} */ (s).value.close()));
  }
  return { open, closeAll, running };
}
