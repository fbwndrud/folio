import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';

const HASH = /^sha256:[0-9a-f]{64}$/;
/** 소스 글자가 없는 함수(바인드된 함수·네이티브 함수)는 V8 에서 이렇게 나타난다. */
const NO_SOURCE = '[native code]';

const byCanonical = (a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : canonicalJson(a) > canonicalJson(b) ? 1 : 0);

/**
 * 함수 자체의 소스. 숨은 클로저는 JS에서 읽을 수 없으므로 JS 팩은 digestInputs로 명시한다.
 * 파일 팩은 codeDigest로 보조 파일까지 묶고, 팩 밖 입력은 checkerInputs로 명시한다.
 * 자신의 toString은 믿지 않는다. 소스 없는 바인드·네이티브 함수는 거부한다.
 */
export function functionSource(value) {
  const source = Function.prototype.toString.call(value);
  if (source.includes(NO_SOURCE)) {
    throw new FolioError('PACK_DIGEST_UNSUPPORTED', 'a pack function has no readable source (bound or native)', { source });
  }
  return source;
}

/** 함수·Map·Set을 포함한 선언 입력을 내용으로 투영한다. */
export function digestProjection(value) {
  if (typeof value === 'function') return `fn:${functionSource(value)}`;
  if (value instanceof RegExp) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return [...value.entries()].map(([key, item]) => [digestProjection(key), digestProjection(item)]).sort(byCanonical);
  if (value instanceof Set) return [...value].map(digestProjection).sort(byCanonical);
  if (Array.isArray(value)) return value.map(digestProjection);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, digestProjection(item)]));
  return value;
}

/**
 * 팩 내용 digest. 항상 내용(팩 자신의 `digest` 필드는 뺀 나머지)을 투영해 해시한다 —
 * 팩이 적은 `digest`를 믿고 그대로 돌려주면 내용이 바뀌어도 값이 고정돼 실행이 재검사를 놓친다.
 * 유효한 선언 digest(`sha256:<64hex>`, 파일 팩 로더가 채움)가 있으면 내용과 함께 묶어 반영한다 — 절대 내용을 대신하지 않는다.
 */
export function packDigest(pack) {
  const { digest: declared, ...rest } = pack ?? {};
  const content = digestProjection(rest);
  const valid = typeof declared === 'string' && HASH.test(declared);
  return sha256(canonicalJson(valid ? { declared, content } : content));
}

/** 작품이 쓰는 팩 전체의 digest(순서 포함). 파이프라인 digest 에 들어간다. */
export const registryDigest = (packs) => sha256(canonicalJson(packs.map((pack) => ({ name: pack.name, digest: packDigest(pack) }))));
