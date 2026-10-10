/**
 * 기준 그림 없음(image.references-present, 그림 생성 전 점검). 설명서 엔티티마다 실어 보낼 기준 그림(core/image/references.js)이
 * 하나도 없으면 알린다. imageReferences 가 꺼져 references 가 null 이면 지적하지 않는다. 기준 그림 자신을 만드는 실행(brief.reference)도 그렇다.
 * @param {{ brief?: { reference?: boolean }, references?: Array<{ entityId: string, assets: unknown[] }> | null }} ctx
 */
export function referencesPresent(ctx) {
  if (!Array.isArray(ctx?.references) || ctx.brief?.reference === true) return [];
  return ctx.references.filter((entry) => entry.assets.length === 0)
    .map((entry) => ({ code: 'REFERENCE_MISSING', message: `${entry.entityId} 의 기준 그림이 없다 — 외형이 그림마다 달라질 수 있다` }));
}
