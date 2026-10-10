import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { assertFeature } from '../work/features.js';
import { EVIDENCE_LEDGER } from '../evidence/records.js';
import { evidenceStates, staleEvidence } from '../evidence/state.js';
import { MAX_TEXT_CHARS } from '../sources/view.js';
import { readLedgerView } from './ledgers.js';

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * 근거 상태(N2). evidence 기능이 꺼져 있으면 states 는 null(연결을 보여 주지 않는다).
 * 기록장이 깨졌으면 짐작하지 않고 states 는 null, ledger 에 검증 결과.
 * @param {string} root
 * @param {Awaited<ReturnType<typeof openWork>>} work
 */
export async function evidenceReadState(root, work) {
  if (!work.config.features.evidence) return { states: null, ledger: null };
  const { records, ledger } = await readLedgerView(root, EVIDENCE_LEDGER);
  return { states: records ? evidenceStates(work, records) : null, ledger };
}

/** 뷰어 화면에 싣는 연결 하나. */
const linkView = (state, work) => ({
  nodeId: state.nodeId, quote: state.quote, status: state.status, reason: /** @type {{ reason?: string }} */ (state).reason ?? null, nodeTitle: work.tree.nodes.get(state.nodeId)?.title ?? null, sources: state.sources.map((s) => ({ ...s, sourceTitle: work.sources.get(s.sourceId)?.title ?? null })),
});

/**
 * 근거 화면의 목록: 자료(설명 요약과 걸린 주장 수)와 근거 연결 요약(folio_status evidence 와 같은 모양 + 켜짐 여부).
 * 작업 잠금 없이 읽기만 한다. sources 기능이 꺼져 있으면 FEATURE_DISABLED(folio_sources 와 같음).
 * @param {string} root
 */
export async function viewSources(root, context = null) {
  const work = context?.work ?? await openWork(root);
  assertFeature(work.config, 'sources');
  const { states, ledger } = context?.evidence ?? await evidenceReadState(root, work);
  return {
    sources: [...work.sources.values()].sort(byId).map((s) => ({
      id: s.id, title: s.title, file: s.file, date: s.date, reliability: s.reliability, spans: s.spans.length, text: s.text !== null,
      links: states ? states.filter((st) => st.sources.some((l) => l.sourceId === s.id)).length : null,
    })),
    evidence: {
      enabled: work.config.features.evidence, ledger,
      total: states ? states.length : null, stale: states ? staleEvidence(states) : null,
    },
  };
}

/**
 * 자료 하나: 설명서, 글 자료의 글(20만 자까지), 이 자료에 걸린 주장들(노드·지금 상태·인용이 자료에 있는지).
 * @param {string} root
 * @param {string} sourceId
 */
export async function viewSource(root, sourceId, context = null) {
  const work = context?.work ?? await openWork(root);
  assertFeature(work.config, 'sources');
  const source = work.sources.get(sourceId);
  if (!source) throw new FolioError('SOURCE_NOT_FOUND', String(sourceId).slice(0, 200));
  const { states, ledger } = context?.evidence ?? await evidenceReadState(root, work);
  return {
    source: {
      id: source.id, title: source.title, file: source.file, date: source.date, reliability: source.reliability, spans: source.spans,
      text: source.text === null ? null : source.text.slice(0, MAX_TEXT_CHARS), truncated: source.text !== null && source.text.length > MAX_TEXT_CHARS,
    },
    links: states ? states.filter((s) => s.sources.some((l) => l.sourceId === source.id))
      .map((s) => ({ ...linkView(s, work), sources: linkView(s, work).sources.filter((l) => l.sourceId === source.id) })) : null,
    ledger,
  };
}

/**
 * 노드 하나의 주장과 그 근거(읽기 화면 옆에 붙인다). evidence 가 꺼져 있거나 기록장이 깨졌으면 claims 는 null.
 * @param {string} root
 * @param {string} nodeId
 */
export async function viewNodeEvidence(root, nodeId, context = null) {
  const work = context?.work ?? await openWork(root);
  if (!work.tree.nodes.has(nodeId)) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
  const { states, ledger } = context?.evidence ?? await evidenceReadState(root, work);
  return { nodeId, claims: states ? states.filter((s) => s.nodeId === nodeId).map((s) => linkView(s, work)) : null, ledger };
}
