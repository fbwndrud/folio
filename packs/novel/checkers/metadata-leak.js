/**
 * 내부 메타데이터 노출(novel.metadata-leak). 원고 본문에 엔티티 id 나 말미의 캐스트 목록이 새어 나오면 지적한다.
 * vibelore src/tools/check.js(METADATA_LEAK)·src/tools/prose-integrity.js(trailingCastMetadata) 의 뜻을 옮김.
 * - '-' 나 '_' 가 든 id 만 본다. 그런 글자가 없는 id 는 평범한 낱말과 구별되지 않는다.
 * - 말미 15줄에서 "id|이름" 줄이나, 목록 표시("- ", "* ") 뒤에 이름만 있는 줄을 캐스트 목록으로 본다.
 * - 실험 검사라 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ draft?: string, work?: { entities: Map<string, any> } }} ctx
 */
export function metadataLeak(ctx) {
  const draft = typeof ctx.draft === 'string' ? ctx.draft : '';
  if (!draft) return [];
  const entities = [...(ctx.work?.entities ?? new Map()).values()].filter((e) => typeof e?.id === 'string');
  const findings = [];
  for (const entity of entities) {
    if (!/[-_]/.test(entity.id) || entity.id.length < 2) continue;
    const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegex(entity.id)}([^A-Za-z0-9_-]|$)`, 'm');
    if (!pattern.test(draft)) continue;
    findings.push({ code: 'METADATA_LEAK', entityId: entity.id, quote: entity.id, message: `본문에 내부 id "${entity.id}"가 노출됐다` });
  }
  for (const line of trailingCastMetadata(draft, entities)) {
    findings.push({ code: 'METADATA_LEAK', quote: line, message: `본문 말미에 내부 캐스트 이름 목록 또는 id 대응이 노출됐다: "${line}"` });
  }
  return findings;
}

/** 말미 15줄 중 캐스트 목록처럼 보이는 줄(다듬은 원문). vibelore trailingCastMetadata. */
function trailingCastMetadata(draft, entities) {
  const tail = draft.split(/\r?\n/).slice(-15);
  const names = new Set(entities.map((e) => e.name).filter((n) => typeof n === 'string' && n));
  const pairs = new Set(entities.filter((e) => e.name).map((e) => `${e.id}|${e.name}`));
  const leaked = [];
  for (const line of tail) {
    const raw = line.trim();
    const bare = raw.replace(/^[-*]\s*/, '');
    if (raw.length >= 2 && (pairs.has(bare) || (/^[-*]\s+/.test(raw) && names.has(bare)))) leaked.push(raw);
  }
  return leaked;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
