import { sha256 } from '../../core/util/hash.js';
export function branchWork(spec) {
  const nodes = new Map(Object.entries(spec).map(([id, data]) => [id, {
    id, kind: 'leaf', role: 'body', level: 'scene', status: 'committed', parentId: null,
    body: `${id} 합성 원고`, children: [], entities: [], assets: [], links: (data.to ?? []).map((to) => ({ to, kind: 'choice', label: '' })),
    data: { branching: { entry: Boolean(data.entry), ending: Boolean(data.ending) } }, ...data,
  }]));
  return { tree: { nodes }, config: { features: { branching: true, links: true } },
    positions: new Map([...nodes.keys()].map((id, ordinal) => [id, { unorderedBy: 'branching', ordered: false, orderMode: 'branching', ordinal }])),
    entities: new Map(), assets: new Map(), sources: new Map() };
}
export function branchEvidence(work, byNode = {}) {
  const records = [], events = [];
  for (const node of work.tree.nodes.values()) {
    const receiptId = `r-${node.id}`, draftHash = sha256(node.body);
    const declared = (byNode[node.id] ?? []).map((e, i) => ({ eventId: `${node.id}-${i}`, ...e }));
    records.push({ type: 'receipt', receiptId, runId: `run-${node.id}`, nodeId: node.id, variant: 'main', level: 'scene',
      pipelineDigest: sha256('pipeline'), draftHash, steps: [{ id: 'facts', kind: 'check', status: 'passed', draftHash }], refs: [], hard: 0, events: declared });
    records.push({ type: 'commit', nodeId: node.id, receiptId, variant: 'main', committedHash: draftHash });
    events.push(...declared.map((e, i) => ({ ...e, type: 'event', nodeId: node.id, receiptId, seq: i + 1 })));
  }
  return { receiptRecords: records, events };
}
