import { canonicalJson, sha256 } from '../util/hash.js';
import { isPlainObject } from '../util/plain.js';
import { BRANCH_LIMITS, components, reach, reverseEdges } from './paths.js';
/** 본문 잎만 독자의 이동 정점이다. front/back 조상 아래는 제외한다. */
export function isBranchLeaf(work, nodeId) {
  const node = work.tree.nodes.get(nodeId);
  if (!node || node.kind !== 'leaf' || node.role !== 'body' || work.positions.get(nodeId)?.unorderedBy !== 'branching') return false;
  const seen = new Set([nodeId]); let parentId = node.parentId;
  while (parentId) {
    if (seen.has(parentId)) return false; seen.add(parentId);
    const parent = work.tree.nodes.get(parentId); if (!parent || parent.role !== 'body') return false;
    parentId = parent.parentId;
  }
  return true;
}
export function buildBranchGraph(work) {
  const problems = [], candidates = [], entries = [], endings = [];
  let truncated = false, examined = 0;
  const problem = (value) => {
    if (problems.length < BRANCH_LIMITS.problems) problems.push(value);
    else { truncated = true; problems[BRANCH_LIMITS.problems - 1] = { code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'problems' }; }
  };
  for (const node of work.tree.nodes.values()) {
    if (node.data?.branching !== undefined && !isBranchLeaf(work, node.id)) problem({ code: 'BRANCH_METADATA_INVALID', nodeId: node.id });
    if (isBranchLeaf(work, node.id)) candidates.push(node.id);
  }
  candidates.sort();
  if (candidates.length > BRANCH_LIMITS.nodes) { truncated = true; problem({ code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'nodes' }); }
  const vertices = candidates.slice(0, BRANCH_LIMITS.nodes), valid = new Set(vertices);
  const edges = Object.fromEntries(vertices.map((id) => [id, []]));
  for (const id of vertices) {
    const node = work.tree.nodes.get(id), meta = node.data?.branching;
    const metadataOk = meta === undefined || (isPlainObject(meta) && Object.keys(meta).every((key) => ['entry', 'ending'].includes(key) && typeof meta[key] === 'boolean'));
    if (!metadataOk) problem({ code: 'BRANCH_METADATA_INVALID', nodeId: id });
    if (metadataOk && meta?.entry === true) entries.push(id);
    if (metadataOk && meta?.ending === true) endings.push(id);
    const choices = (node.links ?? []).filter((l) => l.kind === 'choice');
    if (endings.includes(id) && choices.length) problem({ code: 'BRANCH_ENDING_HAS_CHOICES', nodeId: id });
    const seen = new Set();
    for (const link of choices) {
      if (++examined > BRANCH_LIMITS.edges) { truncated = true; problem({ code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'edges' }); break; }
      if (!valid.has(link.to)) { problem({ code: 'BRANCH_TARGET_INVALID', nodeId: id, to: link.to }); continue; }
      if (link.to === id) problem({ code: 'BRANCH_SELF_CHOICE', nodeId: id });
      if (seen.has(link.to)) { problem({ code: 'BRANCH_CHOICE_DUPLICATE', nodeId: id, to: link.to }); continue; }
      seen.add(link.to); if (!endings.includes(id)) edges[id].push(link.to);
    }
    edges[id].sort();
  }
  if (!entries.length) problem({ code: 'BRANCH_ENTRY_MISSING' });
  const reverse = reverseEdges(vertices, edges), reached = [...reach(entries, edges)].sort(), canEnd = [...reach(endings, reverse)].sort();
  const cycles = components(vertices, edges, reverse);
  for (const nodeIds of cycles) problem({ code: 'BRANCH_CYCLE', nodeIds, canEnd: nodeIds.some((id) => canEnd.includes(id)) });
  const stableProblems = problems.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  const rev = sha256(canonicalJson({ vertices, edges, entries, endings, problems: stableProblems, truncated }));
  return { vertices, edges, entries, endings, reached, canEnd, cycles, reverse, problems: stableProblems, truncated, rev };
}
/** 모델과 검사기에 공개할 요약. 내부 역방향 인덱스는 숨긴다. */
export const graphView = ({ vertices, edges, entries, endings, reached, canEnd, problems, truncated, rev }) => ({ vertices, edges, entries, endings, reached, canEnd, problems, truncated, rev });
