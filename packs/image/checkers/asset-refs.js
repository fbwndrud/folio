import { assetRefsInBody } from '../../../core/store/assets.js';

const UNREADABLE = new Set(['ASSET_FILE_MISSING', 'ASSET_FILE_NOT_REGULAR']);

/**
 * 본문 그림 참조(image.asset-refs, 노드 facts 단계). 원고의 ![[asset:id]] 가 작품에 없는 그림이면 ASSET_UNKNOWN,
 * 설명서는 있는데 이미지 파일을 읽을 수 없으면 ASSET_FILE_MISSING. 그림마다 한 번 알린다.
 * @param {{ draft?: unknown, work?: { assets: Map<string, any>, warnings?: Array<{ code: string, id?: string }> } }} ctx
 */
export function assetRefs(ctx) {
  const draft = typeof ctx?.draft === 'string' ? ctx.draft : '';
  const assets = ctx?.work?.assets ?? new Map();
  const unreadable = new Set((ctx?.work?.warnings ?? []).filter((w) => UNREADABLE.has(w.code)).map((w) => w.id));
  const findings = [];
  for (const id of new Set(assetRefsInBody(draft))) {
    const quote = `![[asset:${id}]]`;
    if (!assets.has(id)) findings.push({ code: 'ASSET_UNKNOWN', quote, message: `그림 ${id} 가 작품에 없다(assets/${id}.yaml)` });
    else if (typeof assets.get(id).file !== 'string' || unreadable.has(id)) findings.push({ code: 'ASSET_FILE_MISSING', quote, message: `그림 ${id} 의 이미지 파일을 읽을 수 없다` });
  }
  return findings;
}
