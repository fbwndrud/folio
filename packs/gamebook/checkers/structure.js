const graphOf = (ctx) => ctx.branching?.graph ?? ctx.branchGraph;
const finding = (problem) => ({ ...problem, message: `${problem.code}: ${problem.nodeId ?? problem.nodeIds?.join(', ') ?? problem.limit ?? '분기 자료'}` });
const capped = (items) => items.length <= 200 ? items : [...items.slice(0, 199), finding({ code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'findings' })];
export function deadEnds(ctx) {
  const graph = graphOf(ctx); if (!graph || graph.truncated || !graph.entries.length) return [];
  return capped(graph.reached.filter((id) => !graph.endings.includes(id) && (!graph.edges[id].length || !graph.canEnd.includes(id)))
    .map((nodeId) => finding({ code: graph.edges[nodeId].length ? 'BRANCH_NO_ENDING' : 'BRANCH_DEAD_END', nodeId })));
}
export function unreachable(ctx) {
  const graph = graphOf(ctx); if (!graph || graph.truncated || !graph.entries.length) return [];
  return capped(graph.vertices.filter((id) => !graph.reached.includes(id)).map((nodeId) => finding({ code: 'BRANCH_UNREACHABLE', nodeId })));
}
export function paths(ctx) {
  const graph = graphOf(ctx);
  const all = [...(graph?.problems ?? []), ...(ctx.branching?.problems ?? [])];
  const unique = new Map();
  for (const p of all) {
    const key = JSON.stringify([p.code, p.nodeId ?? null, p.nodeIds ?? null, p.pathId ?? null, p.limit ?? null, p.to ?? null]);
    if (!unique.has(key)) unique.set(key, finding(p));
  }
  if (ctx.branching?.complete === false && !all.some((p) => p.code === 'BRANCH_ANALYSIS_INCOMPLETE')) unique.set('incomplete', finding({ code: 'BRANCH_ANALYSIS_INCOMPLETE' }));
  return capped([...unique.values()]);
}
