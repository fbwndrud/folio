/** 뷰어 API 오류. code 는 서버의 오류 코드(STEP_LOCKED 등). */
export class ApiError extends Error {
  /** @param {number} status @param {string} code @param {string} message @param {unknown} [details] */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * 주소의 ?token= 을 읽어 세션에 둔다(새로 고침해도 남게). 주소에 없으면 세션 값.
 * @param {{ search: string }} location
 * @param {{ getItem: (k: string) => string|null, setItem: (k: string, v: string) => void } | null} storage
 */
export function readToken(location, storage) {
  const fromUrl = new URLSearchParams(location.search).get('token');
  try {
    if (fromUrl) storage?.setItem('folio-token', fromUrl);
    return fromUrl || storage?.getItem('folio-token') || null;
  } catch {
    return fromUrl || null;
  }
}

/** 주소에 token 이 있으면 그 값만 지우고 상대 주소를 돌려준다. */
export function stripToken(href) {
  const url = new URL(href);
  if (!url.searchParams.has('token')) return null;
  url.searchParams.delete('token');
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * @param {{ token: string|null, fetchImpl?: typeof fetch }} options
 */
export function createApi({ token, fetchImpl = (...args) => fetch(...args) }) {
  const headers = (extra = {}) => ({ ...(token ? { 'x-folio-token': token } : {}), ...extra });
  async function send(path, init) {
    const res = await fetchImpl(path, init);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      const body = type.startsWith('application/json') ? await res.json() : null;
      throw new ApiError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `HTTP ${res.status}`, body?.error?.details);
    }
    return res;
  }
  return {
    get: async (path) => (await send(path, { headers: headers() })).json(),
    post: async (path, body) => (await send(path, { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(body) })).json(),
    blob: async (path) => (await send(path, { headers: headers() })).blob(),
  };
}
