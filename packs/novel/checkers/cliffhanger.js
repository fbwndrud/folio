import { CLIFFHANGER_TRIGGERS } from '../lexicons/cliffhanger-triggers.js';
import { configInvalid, paragraphsOf, proseOf, quoteIn, withQuote } from './text/serial-prose.js';

/**
 * 회차 끝 절단신공(novel.cliffhanger). 마지막 문단에 의문문 종결·미완 사건·반전 표지가 하나도 없으면 알린다.
 * vibelore engine/src/continuity/cliffhanger-detector.js:60-105 detectCliffhanger(CLIFFHANGER_MISSING) 의 뜻을 옮김.
 * - config.when: 'always'(모든 노드, vibelore 의 arcPosition 미지정 = 기본 동작) | 'arc-end'(부모의 마지막 자식일 때만,
 *   vibelore 의 arcPosition === 'closing' 에 해당). 부모가 없는 노드는 최상위 노드 목록(rootIds)의 마지막인지 본다.
 *   'arc-end' 인데 트리에서 이 노드를 찾을 수 없으면 판단할 수 없으므로 조용히 넘어간다.
 * - 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다.
 */
export const CLIFFHANGER_DEFAULTS = Object.freeze({ when: 'always' });

const WHEN = Object.freeze(['always', 'arc-end']);

/**
 * @param {{ draft?: string, nodeId?: string, work?: { tree?: { nodes?: Map<string, any>, rootIds?: string[] } } }} ctx
 * @param {{ when?: string }} [config]
 */
export function cliffhanger(ctx, config = CLIFFHANGER_DEFAULTS) {
  const { when } = { ...CLIFFHANGER_DEFAULTS, ...config };
  if (!WHEN.includes(when)) return [configInvalid('CLIFFHANGER_CONFIG_INVALID', 'when', when, WHEN)];
  if (when === 'arc-end' && !isLastSibling(ctx)) return [];

  const prose = proseOf(ctx);
  if (prose.trim().length === 0) return [];
  const paragraphs = paragraphsOf(prose.trimEnd());
  const last = paragraphs.at(-1) ?? '';
  if (last.length === 0) return [];
  if (CLIFFHANGER_TRIGGERS.some((trigger) => new RegExp(trigger.patternSource, 'm').test(last))) return [];

  return [withQuote({
    code: 'CLIFFHANGER_MISSING',
    message: '마지막 문단에 절단신공 표지(의문문 종결·미완 사건·반전)가 없다. 다음 화로 당기는 끝맺음을 고려한다',
  }, quoteIn(ctx.draft, last))];
}

/** 이 노드가 부모(없으면 최상위 목록)의 마지막 자식인가. 트리에서 찾을 수 없으면 false. */
function isLastSibling(ctx) {
  const tree = ctx.work?.tree;
  const node = ctx.nodeId === undefined ? undefined : tree?.nodes?.get(ctx.nodeId);
  if (!node) return false;
  const siblings = node.parentId == null ? tree.rootIds : tree.nodes.get(node.parentId)?.children;
  return Array.isArray(siblings) && siblings.at(-1) === node.id;
}
