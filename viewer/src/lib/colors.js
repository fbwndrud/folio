/** 관계도 엔티티 종류별 색. 작가가 고른 색은 이 브라우저에만 남는다(work.yaml 에 쓰지 않는다). */
export const PALETTE = Object.freeze(['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#9c755f']);
const HEX = /^#[0-9a-f]{6}$/i;

/** 고른 색이 있으면 그 색, 없으면 종류 순서대로 기본 색. */
export function colorFor(kind, kinds, colors) {
  if (HEX.test(colors?.[kind] ?? '')) return colors[kind];
  const index = kinds.indexOf(kind);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}

/** 저장한 색을 읽는다. 모양이 틀린 값은 버린다. 저장소를 못 쓰면 빈 설정. */
export function loadColors(storage, key) {
  try {
    const raw = JSON.parse(storage?.getItem(key) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'string' && HEX.test(value)));
  } catch {
    return {};
  }
}

export function saveColors(storage, key, colors) {
  try { storage?.setItem(key, JSON.stringify(colors)); } catch { /* 저장소를 못 쓰면 이번 화면에서만 쓴다 */ }
}

export const colorKey = (title) => `folio-colors:${title}`;
