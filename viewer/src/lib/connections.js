/** Only manuscript mentions/declarations from the verified graph; no semantic relations invented. */
export function focusedConnections(graph, entityId, query = '') {
  const entity = graph.entities.find((e) => e.refId === entityId) ?? graph.entities[0] ?? null;
  const search = query.trim().toLocaleLowerCase();
  const edges = entity ? graph.edges.filter((e) => e.target === entity.id) : [];
  const bySource = new Map(edges.map((e) => [e.source, e]));
  const nodes = graph.nodes.filter((n) => bySource.has(n.id) && (!search || `${n.label} ${n.refId}`.toLocaleLowerCase().includes(search)));
  return { entity, nodes, edges: edges.filter((e) => nodes.some((n) => n.id === e.source)), bySource };
}
