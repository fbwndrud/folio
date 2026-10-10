import { FolioError } from '../../core/errors.js';

const MAX_MESSAGE = 300;
const MAX_DETAILS = 4000;
const cut = (text) => (text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text);

/** 오류 코드 → HTTP 상태. 나머지 FolioError 는 400, *_NOT_FOUND 는 404. */
const STATUS = Object.freeze({
  TOKEN_INVALID: 401, STEP_LOCKED: 403, FEATURE_DISABLED: 403, ORIGIN_NOT_ALLOWED: 403, ROUTE_UNKNOWN: 404, ASSET_FILE_UNAVAILABLE: 404,
  METHOD_NOT_ALLOWED: 405, EXPORT_DIR_NOT_OURS: 409, WORK_YAML_CHANGED: 409, WORK_LOCKED: 409, TX_PENDING: 409, BODY_TOO_LARGE: 413, CONTENT_TYPE_INVALID: 415,
  HOST_NOT_ALLOWED: 421, RESOURCE_NOT_VISIBLE: 404, RESOURCE_VIEW_CHANGED: 409,
});

export const statusOf = (code) => STATUS[code] ?? (code.endsWith('_NOT_FOUND') ? 404 : 400);

/** 모든 응답에 붙는 머리글. */
export const BASE_HEADERS = Object.freeze({ 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });

/**
 * 오류를 응답으로. FolioError 는 코드와 300자로 자른 메시지, 크지 않은 details 를 싣는다.
 * 그 밖의 오류(Node 오류 등)는 원문·경로를 싣지 않고 INTERNAL_ERROR 만 준다(M3 미룬 minor) — 원문은 onError 로 서버 쪽에만 남긴다.
 * @param {unknown} error
 * @returns {{ status: number, body: { error: { code: string, message: string, details?: unknown } } }}
 */
export function errorResponse(error) {
  if (error instanceof FolioError) {
    const details = JSON.stringify(error.details ?? {});
    return {
      status: statusOf(error.code),
      body: { error: { code: error.code, message: cut(error.message), ...(details.length <= MAX_DETAILS ? { details: error.details ?? {} } : {}) } },
    };
  }
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'internal error' } } };
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} value
 */
export function sendJson(res, status, value) {
  res.writeHead(status, { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {{ type: string, bytes: Buffer }} file
 * @param {Record<string, string>} [headers]
 */
export function sendBytes(res, { type, bytes }, headers = {}) {
  res.writeHead(200, { ...BASE_HEADERS, 'content-type': type, 'content-length': String(bytes.length), ...headers });
  res.end(bytes);
}
