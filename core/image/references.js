import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { ASSETS_DIR } from '../store/assets.js';
import { ASSET_WRITE_NAME } from '../store/assets.js';

/** 엔티티 하나에 실어 보내는 기준 그림 수. */
export const MAX_REFERENCES = 3;
const UNREADABLE = new Set(['ASSET_FILE_MISSING', 'ASSET_FILE_NOT_REGULAR']);

/**
 * 엔티티 기준 그림(정본 §14 "나오는 엔티티의 기준 그림을 등장 위치 목록에서 찾아 참조로 넘긴다").
 * 그림 설명서의 entities(그림의 등장 목록)에 그 엔티티가 있고 이미지 파일을 읽을 수 있는 그림만 고른다.
 * 기준 그림으로 표시한 것(meta.reference: true)이 먼저, 그다음 id 차례. 엔티티마다 MAX_REFERENCES 장까지.
 * exclude: 빼는 그림 id(지금 만드는 그림 자신). 파일을 읽지 않는다 — openWork 의 그림 목록과 경고만 본다.
 * 파일 이름 검증: 안전한 이름만(ASSET_WRITE_NAME), 경로 탈출 방지.
 * @param {{ assets: Map<string, any>, warnings: Array<{ code: string, id?: string }> }} work
 * @param {string[]} entityIds
 * @param {{ exclude?: string|null, limit?: number }} [options]
 * @returns {Array<{ entityId: string, assets: Array<{ assetId: string, file: string, reference: boolean }> }>}
 */
export function referencesFor(work, entityIds, { exclude = null, limit = MAX_REFERENCES } = {}) {
  const unreadable = new Set(work.warnings.filter((w) => UNREADABLE.has(w.code)).map((w) => w.id));
  const readable = [...work.assets.values()].filter((a) =>
    a.id !== exclude && typeof a.file === 'string' && !unreadable.has(a.id) && ASSET_WRITE_NAME.test(a.file)
  );
  const isReference = (asset) => asset.meta?.reference === true;
  return entityIds.map((entityId) => ({
    entityId,
    assets: readable.filter((a) => a.entities.includes(entityId))
      .sort((a, b) => Number(isReference(b)) - Number(isReference(a)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, limit)
      .map((a) => ({ assetId: a.id, file: a.file, reference: isReference(a) })),
  }));
}

/**
 * assets/ 가 링크 아닌 보통 폴더인지 먼저 확인하고, 각 그림도 링크 아닌 보통 파일만 남긴다.
 * 안전성을 확인할 수 없으면 참조를 모두 버린다(fail closed).
 * @param {string} root
 * @param {Array<{ entityId: string, assets: Array<{ assetId: string, file: string, reference: boolean }> }>} references referencesFor 의 결과
 * @returns {Promise<Array<{ entityId: string, assets: Array<{ assetId: string, file: string, reference: boolean }> }>>}
 */
export async function filterSymlinkedReferences(root, references) {
  const empty = () => references.map((ref) => ({ ...ref, assets: [] }));
  try {
    if (!(await lstat(join(root, ASSETS_DIR))).isDirectory()) return empty();
  } catch {
    return empty();
  }
  const result = [];
  for (const ref of references) {
    const assets = [];
    for (const asset of ref.assets) {
      const path = join(root, ASSETS_DIR, asset.file);
      try {
        const stat = await lstat(path);
        if (stat.isFile()) assets.push(asset);
      } catch {
        // 읽을 수 없거나 링크면 버린다.
      }
    }
    result.push({ ...ref, assets });
  }
  return result;
}
