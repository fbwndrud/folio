import { canonicalJson, sha256 } from '../util/hash.js';

/** provisional와 확정 대상의 저장 위치는 catalog 의미에 들어가지 않는다. */
export function trackingCatalog(work) {
  const kinds = work.tracking?.plan?.subjectKinds ?? [];
  const entries = [...work.entities.values()].filter((entity) => kinds.includes(entity.kind)).sort((a, b) => a.id.localeCompare(b.id));
  const rev = sha256(canonicalJson(entries.map(({ id, kind }) => ({ id, kind }))));
  return { entries, rev };
}

export const catalogRef = (work) => ({ kind: 'tracking_catalog', id: 'main', rev: trackingCatalog(work).rev });
