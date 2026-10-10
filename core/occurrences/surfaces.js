import { preorder } from '../store/tree.js';
import { isPlainObject } from '../util/plain.js';

/** 등장 위치를 달 수 있는 글(표면)의 종류. 자료 원본 파일은 표면이 아니다(설명서의 글 필드만). */
export const SURFACE_KINDS = Object.freeze(['node', 'entity', 'asset', 'source']);
const SOURCE_SKIPPED = new Set(['/id', '/file', '/date', '/reliability']);
const escape = (key) => String(key).replace(/~/g, '~0').replace(/\//g, '~1');

/**
 * 객체·배열 속 문자열 leaf 들을 [JSON Pointer, 글] 로. 숫자·불리언은 글이 아니다.
 * @param {any} value
 * @param {string} [pointer]
 * @returns {Array<[string, string]>}
 */
export function stringLeaves(value, pointer = '') {
  if (typeof value === 'string') return [[pointer, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => stringLeaves(item, `${pointer}/${index}`));
  if (isPlainObject(value)) return Object.entries(value).flatMap(([key, item]) => stringLeaves(item, `${pointer}/${escape(key)}`));
  return [];
}

/**
 * 표면 하나의 글 필드들. node·entity 는 본문 하나(field ''), asset 은 brief 의 글 leaf(엔티티 목록 제외),
 * source 는 설명서의 글 leaf(id·file·date·reliability·구간 id 제외). 없으면 null.
 * @param {import('../store/work.js').Work} work
 * @param {string} kind
 * @param {string} id
 * @returns {Map<string, string> | null}
 */
export function surfaceFields(work, kind, id) {
  switch (kind) {
    case 'node': { const node = work.tree.nodes.get(id); return node ? new Map([['', node.body]]) : null; }
    case 'entity': { const entity = work.entities.get(id); return entity ? new Map([['', entity.body]]) : null; }
    case 'asset': {
      const asset = work.assets.get(id);
      if (!asset) return null;
      return new Map(stringLeaves(asset.brief, '/brief').filter(([pointer]) => !pointer.startsWith('/brief/entities/')));
    }
    case 'source': {
      const source = work.sources.get(id);
      if (!source) return null;
      return new Map(stringLeaves(source.meta).filter(([pointer]) => !SOURCE_SKIPPED.has(pointer) && !/^\/spans\/\d+\/id$/.test(pointer)));
    }
    default: return null;
  }
}

/**
 * @param {import('../store/work.js').Work} work
 * @param {{ kind: string, id: string, field?: string }} target
 * @returns {string | null}
 */
export function surfaceText(work, { kind, id, field = '' }) {
  return surfaceFields(work, kind, id)?.get(field) ?? null;
}

/** @param {{ kind: string, id: string, field?: string }} target */
export const surfaceKey = ({ kind, id, field = '' }) => `${kind}:${id}:${field}`;

/**
 * 작품의 모든 표면 글. 노드(읽는 순서) → 엔티티 → 그림 → 자료(각각 id 순).
 * @param {import('../store/work.js').Work} work
 * @returns {Array<{ kind: string, id: string, field: string, text: string }>}
 */
export function allSurfaces(work) {
  const out = [];
  const push = (kind, id) => { for (const [field, text] of surfaceFields(work, kind, id) ?? []) out.push({ kind, id, field, text }); };
  for (const id of preorder(work.tree)) push('node', id);
  for (const kind of ['entity', 'asset', 'source']) {
    const map = kind === 'entity' ? work.entities : kind === 'asset' ? work.assets : work.sources;
    for (const id of [...map.keys()].sort()) push(kind, id);
  }
  return out;
}
