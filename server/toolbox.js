import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { FolioError } from '../core/errors.js';
import { TOOLS } from './tools/definitions.js';
import { createHandlers } from './tools/handlers.js';
import { validateInput } from './validate-input.js';

const MAX_MESSAGE = 300;
const MAX_DETAILS = 4000;
const cut = (text) => (text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text);

/** @param {unknown} error */
const logToStderr = (error) => {
  process.stderr.write(`folio-mcp: ${String(/** @type {any} */ (error)?.message ?? error).replace(/\s+/g, ' ').slice(0, MAX_MESSAGE)}\n`);
};

/**
 * 오류를 값으로.
 * - FolioError: 코드, 300자로 자른 메시지, details(JSON 4000자가 넘으면 싣지 않고 `{ truncated: true }`) — 사용자 입력·경로가 끝없이 되돌아오지 않게.
 * - 그 밖(Node 오류 등): INTERNAL_ERROR + errno 만. Node 원문(경로·입력이 섞임)은 호스트에 돌려주지 않고 onError(기본 stderr 한 줄)로만 남긴다.
 * @param {unknown} error
 * @param {(error: unknown) => void} onError
 */
function failure(error, onError) {
  if (error instanceof FolioError) {
    const details = error.details ?? {};
    return { ok: false, error: { code: error.code, message: cut(error.message), details: JSON.stringify(details).length <= MAX_DETAILS ? details : { truncated: true } } };
  }
  onError(error);
  const errno = /** @type {any} */ (error)?.code;
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'internal error (see the folio-mcp server log)', details: { errno: typeof errno === 'string' ? errno : null } } };
}

/**
 * root 가 있는데 폴더가 아니면(파일 등) 도구마다 다른 Node 오류(ENOTDIR 등) 대신 WORK_ROOT_INVALID 하나로 거부한다.
 * 없으면 여기서 막지 않는다 — 도구가 정한다(folio_init 은 만들고, 나머지는 WORK_NOT_FOUND).
 * @param {string} root
 */
async function assertRootUsable(root) {
  let info;
  try { info = await stat(root); } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') return;
    throw new FolioError('WORK_ROOT_INVALID', 'root cannot be used as a work folder', { errno: /** @type {any} */ (error)?.code ?? null });
  }
  if (!info.isDirectory()) throw new FolioError('WORK_ROOT_INVALID', 'root is not a folder', { hint: 'give the absolute path of the work folder (the one with work.yaml)' });
}

/**
 * 도구 상자: 이름과 인자로 부르고, 결과나 오류를 값으로 돌려준다(던지지 않는다). MCP 서버와 테스트가 같은 것을 쓴다.
 * @param {{ packs: Map<string, any>, handlers?: Record<string, (args: any) => Promise<any>>, onError?: (error: unknown) => void }} options
 */
export function createToolbox({ packs, handlers = createHandlers({ packs }), onError = logToStderr }) {
  const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
  async function call(name, args = {}) {
    try {
      const tool = byName.get(name);
      if (!tool) return failure(new FolioError('TOOL_UNKNOWN', String(name), { tools: [...byName.keys()] }), onError);
      const input = args ?? {};
      const errors = validateInput(tool.inputSchema, input);
      if (errors.length) return failure(new FolioError('TOOL_INPUT_INVALID', errors.map((e) => `${e.path} ${e.message}`).join('; '), { errors }), onError);
      if (!isAbsolute(input.root)) return failure(new FolioError('ROOT_NOT_ABSOLUTE', input.root, { root: cut(input.root) }), onError);
      await assertRootUsable(input.root);
      return { ok: true, result: await handlers[name](input) };
    } catch (error) {
      // 검증·조회·처리 어디서 무엇이 던져져도 값으로 돌려준다. FolioError 의 details(hint 등)는 그대로 싣는다.
      return failure(error, onError);
    }
  }
  return { tools: TOOLS, call };
}
