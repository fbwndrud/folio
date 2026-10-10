/**
 * 문체 기준 이탈(novel.style-drift). 작가가 문체 기준으로 승인한 노드(frontmatter styleAnchor: true)들의 지문으로
 * 허용 대역을 만들고, 이 원고의 문단 밀도·문단 길이 중앙값·대사 문단 비율이 대역 밖이면 STYLE_ANCHOR_DRIFT 로 알린다.
 * vibelore src/core/style-continuity.js(proseStyleFingerprint, buildStyleAnchor, evaluateChapterStyle) 의 뜻을 옮김.
 * - 기준 노드는 이 노드를 빼고 본문이 있는 것 중 읽는 순서(positions ordinal)로 앞에서 3개까지. 없으면 보지 않는다.
 * - 빈 원고는 보지 않는다(vibelore 는 빈 원고도 대역 밖으로 셌다).
 * - 자동 교정 대상이 아니다. 원고와 기준 노드를 함께 보고 작가가 정한다.
 * - 대역 판정은 따옴표·빈 줄 기준이라 언어를 가리지 않는다.
 */
import { styleBaseline, styleFingerprint } from './text/style-fingerprint.js';
import { draftText } from './text/style-prose.js';

const MAX_ANCHORS = 3;

const METRICS = Object.freeze([
  ['paragraphsPer1k', '1,000자당 문단 수', ''],
  ['medianParagraphChars', '문단 길이 중앙값', '자'],
  ['dialogueParagraphRatio', '대사 문단 비율', ''],
]);

/** 기준 노드들(이 노드 제외, 본문 있음, 읽는 순서, 최대 3개). */
function anchorNodes(ctx) {
  const nodes = [...(ctx.work?.tree?.nodes?.values() ?? [])];
  const positions = ctx.work?.positions;
  const ordinal = (id) => {
    const value = positions?.get?.(id)?.ordinal;
    return typeof value === 'number' ? value : Number.POSITIVE_INFINITY;
  };
  return nodes
    .filter((node) => node?.data?.styleAnchor === true && node.id !== ctx.nodeId)
    .filter((node) => typeof node.body === 'string' && node.body.trim().length > 0)
    .sort((a, b) => ordinal(a.id) - ordinal(b.id) || String(a.id).localeCompare(String(b.id)))
    .slice(0, MAX_ANCHORS);
}

/**
 * @param {{ draft?: string, nodeId?: string, work?: { tree?: { nodes?: Map<string, any> }, positions?: Map<string, { ordinal?: number }> } }} ctx
 */
export function styleDrift(ctx) {
  const text = draftText(ctx);
  if (text.trim().length === 0) return [];
  const anchors = anchorNodes(ctx);
  if (anchors.length === 0) return [];
  const baseline = styleBaseline(anchors.map((node) => styleFingerprint(node.body.normalize('NFC'))));
  const fingerprint = styleFingerprint(text);
  const reasons = [];
  for (const [key, label, unit] of METRICS) {
    const [low, high] = baseline.tolerance[key];
    const value = fingerprint[key];
    if (value < low || value > high) reasons.push(`${label} ${value}${unit}(기준 ${low}~${high}${unit})`);
  }
  if (reasons.length === 0) return [];
  return [{
    code: 'STYLE_ANCHOR_DRIFT',
    message: `승인한 문체 기준(${anchors.map((node) => node.id).join(', ')})과 차이가 크다: ${reasons.join(', ')}. 자동으로 고치지 말고 원고와 기준 노드를 함께 검토한다`,
  }];
}
