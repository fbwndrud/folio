import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../core/util/yaml.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { computePositions } from '../../core/store/position.js';
import { scanMentions } from '../../core/index/scan.js';
import { BUILTIN_CHECKS } from '../../core/checks/builtin.js';
import { runDeterministicChecks, parseModelCheckAnswer } from '../../core/checks/run-checks.js';
import { loadBuiltinPacks } from '../../packs/index.js';

/**
 * 판정 비교(M5 D10 A) 도우미. 중립 모양의 합성 사례(test/fixtures/parity-cases/<id>.yaml)를
 * Folio 검사기가 읽는 메모리 속 작품·ctx 로 바꾸고, 코어의 runDeterministicChecks 로 판정을 낸다.
 * 사례 모양: { id, title, episode, entities, prose, priorEvents, draftEvents, appearances, mentions, modelVerdicts?, anchors? }
 */
export const PARITY_CASES_DIR = join(import.meta.dirname, '..', 'fixtures', 'parity-cases');
export const PARITY_EXPECTED_DIR = join(import.meta.dirname, '..', 'fixtures', 'parity-expected');

/** 사례 id 목록(파일 이름 순). */
export const listCaseIds = () => readdirSync(PARITY_CASES_DIR).filter((name) => name.endsWith('.yaml')).map((name) => name.slice(0, -5)).sort();

/** 사례 원문(YAML 텍스트). */
export const readCaseText = (id) => readFileSync(join(PARITY_CASES_DIR, `${id}.yaml`), 'utf8');

/** 사례를 parseYaml 로 읽은 객체. */
export const loadCase = (id) => parseYaml(readCaseText(id));

/** 기대 판정 JSON(생성 스크립트가 쓴 것). */
export const loadExpected = (id) => JSON.parse(readFileSync(join(PARITY_EXPECTED_DIR, `${id}.json`), 'utf8'));

/** 사례 digest = sha256(canonicalJson(parseYaml 결과)). YAML 텍스트나 이미 읽은 객체를 받는다(생성 스크립트와 같은 규칙). */
export const caseDigest = (raw) => sha256(canonicalJson(typeof raw === 'string' ? parseYaml(raw) : raw));

/** 회차 번호 → 노드 id(ep-001 …). */
export const episodeId = (n) => `ep-${String(n).padStart(3, '0')}`;

const SERIAL_CONFIG = Object.freeze({
  title: '판정 비교', levels: [{ name: 'arc', children: [1, 60] }, { name: 'episode', leaf: true }], order: 'linear', packs: ['novel'],
});

const leafNode = (n, anchors) => {
  const anchor = anchors.find((a) => a.episode === n);
  return {
    id: episodeId(n), level: 'episode', role: 'body', status: 'draft', kind: 'leaf', parentId: 'a1', children: [],
    data: anchor ? { styleAnchor: true } : {}, body: anchor ? String(anchor.prose ?? '') : '', entities: [], assets: [],
  };
};

/**
 * 사례 → 검사기가 읽는 작품(메모리). 아크 a1 아래 ep-001 … ep-00N, 읽는 순서는 linear.
 * config 는 validateWorkConfig 를 거쳐 features 가 들어 있다.
 */
export function caseWork(parityCase) {
  const { config, errors } = validateWorkConfig(SERIAL_CONFIG);
  if (errors.length) throw new Error(`parity config invalid: ${errors.map((e) => e.code).join(', ')}`);
  const count = Number(parityCase.episode);
  const anchors = Array.isArray(parityCase.anchors) ? parityCase.anchors : [];
  const leaves = Array.from({ length: count }, (_, i) => leafNode(i + 1, anchors));
  const arc = {
    id: 'a1', level: 'arc', role: 'body', status: 'draft', kind: 'branch', parentId: null,
    children: leaves.map((leaf) => leaf.id), data: {}, body: '', entities: [], assets: [],
  };
  const tree = { rootIds: ['a1'], nodes: new Map([[arc.id, arc], ...leaves.map((leaf) => [leaf.id, leaf])]) };
  const entities = new Map((parityCase.entities ?? []).map((e) => [e.id, {
    id: e.id, kind: e.kind, name: e.name, aliases: e.aliases ?? [], data: e.data ?? {}, body: e.body ?? '', rev: null,
  }]));
  return { config, tree, positions: computePositions(tree, config), entities, sources: new Map(), assets: new Map() };
}

const withNode = (event, nodeId, eventId) => ({ ...event, nodeId, eventId });

/** 코어 추출이 거절하는 사건(모르는 엔티티). Folio 는 이런 답을 검사까지 보내지 않는다. */
export const refusedEvents = (parityCase, work = caseWork(parityCase)) =>
  (parityCase.draftEvents ?? []).filter((e) => !work.entities.has(e?.entityId)).map((e) => `EVENT_INVALID:${e?.entityId ?? '?'}`);

/** 사례 → 검사 ctx(core/run/steps/check.js checkContext 와 같은 모양). 거절될 사건은 빼고 싣는다. */
// 이 ctx 의 priorEvents 는 범위로 거르지 않고 앞선 사건을 전부 싣는다. 실제 범위 거르기는 M5 인수 테스트(MCP)가 다룬다.
export function caseContext(parityCase, work = caseWork(parityCase)) {
  const nodeId = episodeId(parityCase.episode);
  const known = (id) => work.entities.has(id);
  const prior = [...(parityCase.priorEvents ?? [])].map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.episode - b.e.episode || a.i - b.i)
    .map(({ e }, i) => {
      const { episode, ...rest } = e;
      return { ...withNode(rest, episodeId(episode), `prior-${i + 1}`), seq: i + 1 };
    });
  const draftEvents = (parityCase.draftEvents ?? []).filter((e) => known(e?.entityId)).map((e, i) => withNode(e, nodeId, `draft-${i + 1}`));
  const draft = String(parityCase.prose ?? '');
  const appearances = [...new Set((parityCase.appearances ?? []).filter(known))].sort();
  const scanned = [...scanMentions(draft, work.entities.values()).keys()];
  const entityIds = [...new Set([...appearances, ...scanned, ...(parityCase.mentions ?? []), ...draftEvents.map((e) => e.entityId)])].filter(known).sort();
  return {
    nodeId, ordered: work.positions.get(nodeId)?.ordered === true, appearances, entityIds, prerequisiteIds: [], priorEvents: prior,
    upperPlans: [], parentPlan: null, upperMentions: [], assets: [], sources: [], claims: [], refs: [],
    work, node: work.tree.nodes.get(nodeId), draft, draftEvents,
  };
}

let novelPack = null;
const loadNovel = async () => {
  novelPack ??= (await loadBuiltinPacks()).get('novel');
  return novelPack;
};

/** 고정 모델 판정(modelVerdicts)을 novel.fixed-facts 의 답으로 만든다. */
const fixedFactsAnswer = (verdicts) => JSON.stringify({
  checked: ['novel.fixed-facts'],
  findings: verdicts.map((v) => ({ checkId: 'novel.fixed-facts', code: v.code, message: `${v.entityId}: ${v.code}`, quote: v.quote })),
});

const byCodeEntity = (a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : String(a.entityId) < String(b.entityId) ? -1 : String(a.entityId) > String(b.entityId) ? 1 : 0);

/**
 * Folio 판정. 코어 내장 검사 + novel 팩의 결정론 검사 전부를 runDeterministicChecks 로(등급은 코어 stamp 가 정한다),
 * novel.fixed-facts 는 고정 답을 parseModelCheckAnswer 로 읽는다.
 * @returns {Promise<{ hard: Array<{ code: string, entityId: string|null }>, all: Array<{ checkId: string, code: string, severity: string, entityId: string|null }>,
 *   results: any[], refused: string[] }>}
 */
export async function folioVerdicts(parityCase) {
  const pack = await loadNovel();
  const work = caseWork(parityCase);
  const ctx = caseContext(parityCase, work);
  const deterministic = [...BUILTIN_CHECKS, ...pack.checks.filter((c) => c.tier === 'deterministic')];
  const results = runDeterministicChecks(deterministic, ctx);
  const verdicts = Array.isArray(parityCase.modelVerdicts) ? parityCase.modelVerdicts : [];
  if (verdicts.length) {
    const fixed = pack.checks.find((c) => c.id === 'novel.fixed-facts');
    results.push(...parseModelCheckAnswer([fixed], fixedFactsAnswer(verdicts), ctx.draft));
  }
  const all = results.flatMap((r) => r.findings)
    .map((f) => ({ checkId: f.checkId, code: f.code, severity: f.severity, entityId: f.entityId ?? null }));
  const hard = all.filter((f) => f.severity === 'hard').map(({ code, entityId }) => ({ code, entityId })).sort(byCodeEntity);
  return { hard, all, results, refused: refusedEvents(parityCase, work) };
}

export { byCodeEntity };
