import { openWork } from '../store/work.js';
import { assertFeature } from '../work/features.js';
import { blockCatalog } from '../blocks/catalog.js';
import { bibliography } from '../blocks/bibliography.js';
import { termIndex } from '../blocks/term-index.js';
import { EVIDENCE_LEDGER } from '../evidence/records.js';
import { OCCURRENCES_LEDGER } from '../occurrences/records.js';
import { readLedgerView } from './ledgers.js';
import { bodySegments } from './segments.js';

/** 기능이 켜져 있을 때만 기록장을 읽는다(server/tools/find.js ledgerFor 와 같다). 꺼져 있으면 records·ledger 모두 null. */
const ledgerFor = (root, on, name) => (on ? readLedgerView(root, name) : Promise.resolve({ records: null, ledger: null }));

/**
 * 블록 화면(설계 §04 블록 id): 본문 속 앵커({#id})와 그것을 가리키는 참조([[block:id]]), 깨진 참조·겹친 앵커,
 * 그리고 N3 의 번호·각주·자료 인용·참고문헌·색인. 파일에서 바로 읽는다 — index.db 도 작업 잠금도 쓰지 않고 아무것도 쓰지 않는다(V10).
 * 기능(blocks·bibliography·termIndex)이 꺼진 칸은 null 이고, 셋 다 꺼지면 FEATURE_DISABLED(folio_find 와 같다).
 * @param {string} root
 */
export async function viewBlocks(root) {
  const work = await openWork(root);
  const { features } = work.config;
  if (!features.blocks && !features.bibliography && !features.termIndex) assertFeature(work.config, 'blocks');
  const title = (nodeId) => work.tree.nodes.get(nodeId)?.title ?? '';
  let sections = { anchors: null, refs: null, problems: null, footnotes: null, citations: null };
  if (features.blocks) {
    const catalog = blockCatalog(work);
    const ordinal = (nodeId) => work.positions.get(nodeId)?.ordinal ?? Number.MAX_SAFE_INTEGER;
    const owned = new Map(catalog.blocks.map((block) => [block.id, block]));
    const labels = new Map(catalog.refs.map((ref) => [`${ref.nodeId}\u0000${ref.line}\u0000${ref.target}`, ref.label]));
    const refs = [...work.blocks.refs].sort((a, b) => ordinal(a.nodeId) - ordinal(b.nodeId) || a.line - b.line)
      .map((ref) => ({
        ...ref, nodeTitle: title(ref.nodeId), targetNodeId: work.blocks.anchors.get(ref.target)?.nodeId ?? null,
        label: labels.get(`${ref.nodeId}\u0000${ref.line}\u0000${ref.target}`) ?? null,
        targetTitle: owned.get(ref.target)?.caption || title(work.blocks.anchors.get(ref.target)?.nodeId) || null,
      }));
    const anchors = [...work.blocks.anchors].map(([id, anchor]) => {
      const block = owned.get(id);
      return {
        id, nodeId: anchor.nodeId, nodeTitle: title(anchor.nodeId), line: anchor.line, refs: refs.filter((r) => r.target === id).length,
        kind: block?.kind ?? null, number: block?.number ?? null, label: block?.label ?? null, caption: block?.caption ?? null,
      };
    }).sort((a, b) => ordinal(a.nodeId) - ordinal(b.nodeId) || a.line - b.line);
    sections = {
      anchors, refs, problems: catalog.problems.map((p) => ({ ...p, nodeTitle: title(p.nodeId) })),
      footnotes: catalog.footnotes.map((f) => ({ ...f, nodeTitle: title(f.nodeId), segments: bodySegments(f.text, []).map((s) => {
        if ('citation' in s) return { ...s, valid: work.sources.has(s.citation), label: work.sources.get(s.citation)?.title ?? s.citation };
        if ('blockRef' in s) return { ...s, nodeId: work.blocks.anchors.get(s.blockRef)?.nodeId ?? null, label: owned.get(s.blockRef)?.label ?? owned.get(s.blockRef)?.caption ?? s.blockRef };
        return s;
      }) })),
      citations: catalog.citations.map((c) => ({ ...c, nodeTitle: title(c.nodeId) })),
    };
  }
  let bib = null;
  if (features.bibliography) {
    const { records, ledger } = await ledgerFor(root, features.evidence, EVIDENCE_LEDGER);
    const result = bibliography(work, { evidenceRecords: records });
    bib = { ...result, entries: result.entries.map((e) => ({ ...e, citedIn: e.citedIn.map((c) => ({ ...c, nodeTitle: title(c.nodeId) })) })), ledger };
  }
  let terms = null;
  if (features.termIndex) {
    const { records, ledger } = await ledgerFor(root, features.occurrences, OCCURRENCES_LEDGER);
    terms = { ...termIndex(work, { occurrenceRecords: records }), ledger };
  }
  return { ...sections, bibliography: bib, terms };
}
