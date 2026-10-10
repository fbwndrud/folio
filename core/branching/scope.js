import { canonicalJson, sha256 } from '../util/hash.js';
import { buildBranchGraph, graphView, isBranchLeaf } from './graph.js';
import { BRANCH_LIMITS, pathsTo } from './paths.js';
import { branchEvidence } from './evidence.js';
/** 선택 경로별 사건. 코어는 생사·파괴 같은 사건의 뜻을 해석하지 않는다. */
export function branchScope({ work, events, receiptRecords = [], nodeId }) {
  if (!work.config.features.branching || !isBranchLeaf(work, nodeId)) return { applicable: false };
  const graph = buildBranchGraph(work), found = pathsTo(graph, nodeId), evidence = branchEvidence(work, events, receiptRecords);
  /** @type {any[]} */
  const problems = [], paths = [], bindings = found.relevant.filter((id) => id !== nodeId).map((id) => evidence(id).binding);
  let complete = found.complete, count = 0, bytes = 2, diagnosticOverflow = false;
  const addProblem = (value) => {
    if (diagnosticOverflow) return;
    if (problems.length < BRANCH_LIMITS.problems) problems.push(value);
    else {
      diagnosticOverflow = true; complete = false;
      problems[BRANCH_LIMITS.problems - 1] = { code: 'BRANCH_ANALYSIS_INCOMPLETE', limit: 'problems' };
    }
  };
  for (const problem of found.problems) addProblem(problem);
  for (const path of found.paths) {
    const collected = [], missing = []; let limited = false, limitReason, eventBytes = 0;
    for (const id of path.nodeIds) {
      const data = evidence(id);
      if (!data.verified) missing.push(id);
      if (count + collected.length + data.events.length > BRANCH_LIMITS.events) { limited = true; limitReason = 'events'; break; }
      for (const event of data.events) {
        if (bytes + eventBytes + Buffer.byteLength(canonicalJson(event)) + 1024 > BRANCH_LIMITS.bytes) { limited = true; limitReason = 'bytes'; break; }
        collected.push(event); eventBytes += Buffer.byteLength(canonicalJson(event)) + 1;
      }
      if (limited) break;
    }
    const full = { ...path, events: collected, complete: !missing.length && !limited && !graph.truncated && !graph.cycles.some((c) => c.some((id) => id === nodeId || path.nodeIds.includes(id))) };
    const pathBytes = Buffer.byteLength(JSON.stringify(full)), separatorBytes = paths.length ? 1 : 0;
    if (bytes + separatorBytes + pathBytes > BRANCH_LIMITS.bytes) {
      complete = false;
      addProblem({ code: 'BRANCH_ANALYSIS_INCOMPLETE', pathId: path.pathId, limit: 'bytes' });
      continue;
    }
    bytes += separatorBytes + pathBytes;
    count += collected.length;
    if (missing.length) addProblem({ code: 'BRANCH_EVENTS_UNVERIFIED', pathId: path.pathId, nodeIds: missing });
    if (limited) addProblem({ code: 'BRANCH_ANALYSIS_INCOMPLETE', pathId: path.pathId, limit: limitReason });
    if (!full.complete) complete = false;
    paths.push(full);
  }
  const topology = found.relevant.map((id) => [id, graph.edges[id].filter((to) => found.relevant.includes(to)), graph.entries.includes(id), graph.endings.includes(id)]);
  const rev = sha256(canonicalJson({ topology, bindings, complete, problems }));
  return { applicable: true, graph: graphView(graph), paths, complete, problems, rev, limits: BRANCH_LIMITS };
}
