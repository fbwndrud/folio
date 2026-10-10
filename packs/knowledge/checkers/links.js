import { linksFrom } from '../../../core/links/graph.js';
import { workEntities } from './definitions.js';

/**
 * 노드 링크 유효성(knowledge.links, N4). 이 노드 앞머리 links 가 가리키는 노드가 있는지 본다(core/links/graph.js 와 같은 규칙).
 * - LINK_BROKEN: 없는 노드를 가리킨다. LINK_SELF: 이 노드 자신을 가리킨다. target 은 링크의 to 다.
 * - 링크는 앞머리에 있고 원고에는 없으므로 quote 를 적지 않는다.
 * - 순서와 무관하다(requiresOrder 없음) — linear 작품의 "함께 보기" 링크도 본다.
 * - 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다. ctx.work·ctx.node 가 없으면 던진다.
 * @param {{ work?: any, node?: { id?: string } }} ctx
 */
export function nodeLinks(ctx) {
  workEntities(ctx);
  const nodeId = ctx.node?.id;
  if (typeof nodeId !== 'string') throw new TypeError('knowledge.links needs ctx.node (the core check context)');
  const findings = [];
  for (const link of linksFrom(ctx.work, nodeId)) {
    const name = link.label || link.kind;
    if (!link.valid) findings.push({ code: 'LINK_BROKEN', target: link.to, message: `링크 ${link.to}(${name})가 가리키는 노드가 작품에 없다` });
    else if (link.to === nodeId) findings.push({ code: 'LINK_SELF', target: link.to, message: `링크 ${link.to}(${name})가 이 노드 자신을 가리킨다` });
  }
  return findings;
}
