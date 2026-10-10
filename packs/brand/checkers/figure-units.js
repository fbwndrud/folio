import { claimsOf, numberMatches } from '../../sources/checkers/claims.js';

/** config.units({ 대표 단위: [표기, ...] })를 [표기, 대표 단위] 목록으로 편다. 긴 표기부터 본다(개월이 개보다 먼저). */
function aliasesOf(units) {
  if (!units || typeof units !== 'object' || Array.isArray(units)) return [];
  const pairs = Object.entries(units).flatMap(([unit, spellings]) => (Array.isArray(spellings) ? spellings : [])
    .filter((spelling) => typeof spelling === 'string' && spelling).map((spelling) => [spelling.normalize('NFC'), unit]));
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

/** 숫자 덩어리 바로 뒤(빈칸 하나까지 건너뜀)의 단위. 날짜처럼 한 덩어리에서 나온 값은 마지막 값만 단위를 읽는다. */
function figuresIn(text, aliases) {
  const normal = typeof text === 'string' ? text.normalize('NFC') : '';
  const matches = numberMatches(normal);
  return matches.map((match, index) => {
    if (matches[index + 1]?.end === match.end) return { value: match.value, unit: null };
    const rest = normal.slice(match.end).replace(/^[ \t]/, '');
    return { value: match.value, unit: aliases.find(([spelling]) => rest.startsWith(spelling))?.[1] ?? null };
  });
}

/**
 * 수치 단위 대조(brand.figure-units). 주장 인용의 숫자가 연결된 자료 인용에도 있지만 그 자리에서는 늘 다른 단위일 때 알린다
 * (예: 주장 "30%", 자료 "30억"). 자료에 그 숫자가 없으면 sources.numbers-match 몫이라 건너뛴다. 자료 쪽에 단위 없는 같은 숫자가
 * 하나라도 있으면 알리지 않는다(단위를 모르면 틀렸다고 하지 않는다). 근거 없는 주장은 sources.claim-supported 몫이다.
 * 단위 표기 목록은 pack.yaml config.units. 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ claims?: unknown }} ctx
 * @param {{ units?: unknown }} [config]
 */
export function figureUnits(ctx, config = {}) {
  const aliases = aliasesOf(config.units);
  const findings = [];
  for (const claim of claimsOf(ctx)) {
    if (claim.sources.length === 0) continue;
    const backed = claim.sources.flatMap((link) => figuresIn(link?.quote, aliases));
    const figures = [];
    for (const { value, unit } of figuresIn(claim.quote, aliases)) {
      if (unit === null) continue;
      const same = backed.filter((figure) => figure.value === value);
      if (same.length === 0 || same.some((figure) => figure.unit === null || figure.unit === unit)) continue;
      figures.push({ number: value, unit, sourceUnits: [...new Set(same.map((figure) => figure.unit))] });
    }
    if (figures.length === 0) continue;
    const told = figures.map((f) => `${f.number}${f.unit}(자료: ${f.sourceUnits.map((u) => `${f.number}${u}`).join(', ')})`).join(', ');
    findings.push({ code: 'UNIT_NOT_IN_SOURCE', quote: claim.quote, figures, message: `"${claim.quote}": ${told} — 단위가 연결된 자료 인용과 다르다` });
  }
  return findings;
}
