import { canonicalJson, sha256 } from '../util/hash.js';
export const BRANCH_LIMITS = Object.freeze({ nodes: 5000, edges: 20000, paths: 256, depth: 512, states: 100000, events: 20000, bytes: 2 * 1024 * 1024, problems: 200 });
/** 순환을 허용하는 선형 도달성. 폴더 차례와 무관하다. */
export function reach(seeds, edges) {
  const seen = new Set(seeds), queue = [...seeds];
  for (let i = 0; i < queue.length; i++) for (const id of edges[queue[i]] ?? []) if (!seen.has(id)) { seen.add(id); queue.push(id); }
  return seen;
}
export function reverseEdges(vertices, edges) {
  const reverse = Object.fromEntries(vertices.map((id) => [id, []]));
  for (const id of vertices) for (const to of edges[id] ?? []) reverse[to].push(id);
  for (const list of Object.values(reverse)) list.sort();
  return reverse;
}
/** 재귀 없는 Kosaraju. 상태 의미를 결합하지 않고 그래프 순환만 찾는다. */
export function components(vertices, edges, reverse) {
  const seen = new Set(), finished = [];
  for (const seed of vertices) {
    if (seen.has(seed)) continue;
    seen.add(seed); const stack = [{ id: seed, next: 0 }];
    while (stack.length) {
      const frame = stack.at(-1), targets = edges[frame.id];
      if (frame.next === targets.length) { finished.push(frame.id); stack.pop(); continue; }
      const id = targets[frame.next++]; if (seen.has(id)) continue;
      seen.add(id); stack.push({ id, next: 0 });
    }
  }
  const assigned = new Set(), groups = [];
  for (const seed of finished.reverse()) {
    if (assigned.has(seed)) continue;
    const group = [], stack = [seed]; assigned.add(seed);
    while (stack.length) {
      const id = stack.pop(); group.push(id);
      for (const previous of reverse[id]) if (!assigned.has(previous)) { assigned.add(previous); stack.push(previous); }
    }
    group.sort(); groups.push(group);
  }
  return groups.filter((g) => g.length > 1 || edges[g[0]].includes(g[0])).sort((a, b) => a[0].localeCompare(b[0]));
}
/** 진입→대상 직전의 단순 경로. 대기 상태마다 경로 복사본을 만들지 않는다. */
export function pathsTo(graph, nodeId) {
  const ancestors = reach([nodeId], graph.reverse), relevant = new Set([...ancestors].filter((id) => graph.reached.includes(id)));
  const problems = [], paths = [];
  let complete = !graph.truncated, states = 0;
  for (const cycle of graph.cycles) if (cycle.some((id) => relevant.has(id))) { complete = false; problems.push({ code: 'BRANCH_CYCLE', nodeIds: cycle }); }
  const cut = (limit) => { complete = false; if (!problems.some((p) => p.limit === limit)) problems.push({ code: 'BRANCH_ANALYSIS_INCOMPLETE', limit }); };
  outer: for (const entry of graph.entries.filter((id) => relevant.has(id))) {
    const route = [entry], visiting = new Set(route), stack = [{ id: entry, next: 0 }];
    while (stack.length) {
      if (++states > BRANCH_LIMITS.states) { cut('states'); break outer; }
      const frame = stack.at(-1);
      if (frame.id === nodeId) {
        if (paths.length >= BRANCH_LIMITS.paths) { cut('paths'); break outer; }
        const nodeIds = route.slice(0, -1);
        paths.push({ pathId: sha256(canonicalJson(route)), entry, nodeIds });
        stack.pop(); visiting.delete(route.pop()); continue;
      }
      const targets = graph.edges[frame.id] ?? [];
      if (frame.next === targets.length) { stack.pop(); visiting.delete(route.pop()); continue; }
      const id = targets[frame.next++];
      if (!relevant.has(id) || visiting.has(id)) continue;
      if (route.length >= BRANCH_LIMITS.depth) { cut('depth'); continue; }
      route.push(id); visiting.add(id); stack.push({ id, next: 0 });
    }
  }
  if (!paths.length) { complete = false; problems.push({ code: graph.entries.length ? 'BRANCH_TARGET_UNREACHED' : 'BRANCH_ENTRY_MISSING', nodeId }); }
  return { paths, relevant: [...relevant].sort(), complete, problems };
}
