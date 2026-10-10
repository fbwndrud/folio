import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 중립 사례(test/fixtures/parity-cases) → vibelore 입력. vibelore 함수를 그대로 불러 판정을 모은다.
 * 모델·네트워크는 부르지 않는다: continuityCheck 의 provider 는 사례의 modelVerdicts 로 만든 고정 답을 돌려주는 가짜다.
 * vibelore 는 읽기만 한다(모두 순수 함수이고 파일을 쓰지 않는다).
 */
const MODULES = {
  continuity: 'engine/src/continuity/continuity-check.js',
  lexiconScan: 'engine/src/continuity/lexicon-scan.js',
  honorific: 'engine/src/continuity/honorific-lexicon.js',
  genre: 'engine/src/continuity/genre-profile.js',
  story: 'engine/src/continuity/story-state.js',
  ledger: 'engine/src/continuity/ledger.js',
  sentence: 'engine/src/continuity/sentence-stats.js',
  prosody: 'engine/src/continuity/prosody-scan.js',
  gate: 'engine/src/continuity/quality-gate.js',
  quality: 'engine/src/continuity/quality-scan.js',
  emotion: 'engine/src/continuity/emotion-verb-lexicon.js',
  simile: 'engine/src/continuity/simile-marker-lexicon.js',
  onomatopoeia: 'engine/src/continuity/onomatopoeia-lexicon.js',
  style: 'engine/src/continuity/style-scan.js',
  styleLexicon: 'engine/src/continuity/style-lexicon.js',
  tags: 'engine/src/continuity/dialogue-marker-variety.js',
  ratio: 'engine/src/continuity/dialogue-ratio.js',
  cliffhanger: 'engine/src/continuity/cliffhanger-detector.js',
  gapSkip: 'engine/src/continuity/gap-skip-detector.js',
  sensitive: 'engine/src/continuity/sensitive-lexicon.js',
  infoRestate: 'engine/src/continuity/info-restate-detector.js',
  format: 'src/tools/webnovel-format.js',
  memory: 'src/tools/memory-index.js',
  policy: 'src/core/quality-policy.js',
};

/** vibelore 모듈을 절대 경로로 불러온다. */
export async function loadVibelore(root) {
  const mods = {};
  for (const [key, rel] of Object.entries(MODULES)) mods[key] = await import(pathToFileURL(join(root, rel)).href);
  return mods;
}

export const VIBELORE_MODULE_PATHS = Object.freeze(Object.values(MODULES));

/** 사례당 부르는 vibelore 함수(기록용). */
export const VIBELORE_CALLS = Object.freeze([
  'continuityCheck (scanLexicon Mode B, 구조 INTRINSIC_VIOLATION·DEAD_CHARACTER_ON_STAGE, 가짜 provider 의 intrinsicViolations)',
  'scanLexicon (Mode A, address 사건이 있을 때만 hints 로)',
  'applyLedgerOps (앞 회차마다, 그리고 이 회차) + reviewLedgerOps (이 회차)',
  'hookDebt', 'scanSentenceStats', 'runProsodyScan + evaluateChapterQuality + failsToViolations', 'scanQuality', 'scanStyle',
  'scanDialogueMarkerVariety', 'scanDialogueRatio', 'scanWebnovelFormat (strict)', 'detectCliffhanger', 'detectGapSkip',
  'scanSensitive (adult)', 'scanInfoRestate', 'classifyQualityViolations (hard/soft 가르기)',
]);

const LANG = 'ko';
const ofKind = (c, kind) => (c.entities ?? []).filter((e) => e.kind === kind);
const byEpisode = (events) => [...events].map((e, i) => ({ e, i })).sort((a, b) => a.e.episode - b.e.episode || a.i - b.i).map((x) => x.e);

/** 인물 → Foundation.characters. 성별 변화(state data.gender)는 intrinsicChanges 로. */
function foundationOf(c, mods) {
  const characters = ofKind(c, 'character').map((e) => ({
    id: e.id, name: e.name, canonicalName: e.name, aliases: e.aliases ?? [], registeredAtChapter: 1,
    intrinsic: { gender: e.data?.gender ?? null, coreAppearance: [] },
  }));
  const intrinsicChanges = [];
  const gender = new Map(characters.map((ch) => [ch.id, ch.intrinsic.gender]));
  for (const event of byEpisode(c.priorEvents ?? [])) {
    if (event.kind !== 'state' || event.data?.gender === undefined || !gender.has(event.entityId)) continue;
    intrinsicChanges.push({ characterId: event.entityId, field: 'gender', from: gender.get(event.entityId), to: event.data.gender, atChapter: event.episode });
    gender.set(event.entityId, event.data.gender);
  }
  const worldFacts = (c.entities ?? []).flatMap((e) => (Array.isArray(e.data?.facts) ? e.data.facts : [])).map((statement) => ({ statement }));
  return { characters, intrinsicChanges, worldFacts, genreProfile: mods.genre.createGenreProfileRegistry().get('other') };
}

/** 앞 회차의 생사(state data.vital) → prevState.characterStates. */
function prevStateOf(c, mods) {
  const state = mods.story.emptyStoryState('parity');
  const characterStates = {};
  for (const event of byEpisode(c.priorEvents ?? [])) {
    const vital = event.kind === 'state' ? event.data?.vital : undefined;
    if (vital === undefined) continue;
    characterStates[event.entityId] = { vitalStatus: String(vital).trim().toLowerCase(), sinceChapter: event.episode };
  }
  return { ...state, characterStates };
}

/** 이 회차 사건 → ChapterDelta(mutableChanges, appearedCharacterIds). 모르는 엔티티의 사건은 knownFactsAdded 로 싣는다. */
function deltaOf(c) {
  const known = new Set((c.entities ?? []).map((e) => e.id));
  const characters = new Set(ofKind(c, 'character').map((e) => e.id));
  const mutableChanges = [];
  for (const event of c.draftEvents ?? []) {
    if (!known.has(event.entityId)) mutableChanges.push({ characterId: event.entityId, knownFactsAdded: [event.quote ?? event.kind] });
    else if (characters.has(event.entityId) && event.kind === 'state' && event.data?.vital !== undefined) {
      mutableChanges.push({ characterId: event.entityId, vitalStatus: String(event.data.vital).trim().toLowerCase() });
    }
  }
  return { mutableChanges, appearedCharacterIds: (c.appearances ?? []).filter((id) => characters.has(id)) };
}

/** 고정 답을 돌려주는 가짜 provider. 모델도 네트워크도 부르지 않는다. */
const stubProviders = (c) => ({
  complete: async () => ({ text: JSON.stringify({ intrinsicViolations: (c.modelVerdicts ?? []).map((v) => ({ characterId: v.entityId, message: v.code })) }) }),
});

/** address 사건 → Mode A hints(인용 안에서 호칭의 위치). */
function hintsOf(c) {
  const prose = String(c.prose ?? '');
  return (c.draftEvents ?? []).filter((e) => e.kind === 'address' && typeof e.data?.term === 'string').flatMap((e) => {
    const base = typeof e.quote === 'string' && prose.includes(e.quote) ? prose.indexOf(e.quote) : 0;
    const start = prose.indexOf(e.data.term, base);
    return start === -1 ? [] : [{ term: e.data.term, targetId: e.entityId, span: { start, end: start + e.data.term.length } }];
  });
}

/** Folio 사건 → vibelore ledger op. 물건(item)과 약속(promise)만 장부에 오른다. */
function opOf(event, kindOf, nameOf, horizonOf) {
  const kind = kindOf(event.entityId);
  const id = event.entityId;
  if (kind === 'item') {
    const exists = event.kind === 'state' && event.data?.exists !== undefined ? String(event.data.exists).trim().toLowerCase() : null;
    if (exists === 'restored') return { op: 'event', id, event: 'restored', ...(event.quote ? { note: event.quote } : {}) };
    if (exists !== null) return { op: 'event', id, event: 'status', status: exists };
    const set = event.data && Object.keys(event.data).length ? { ...event.data } : { [event.kind]: true };
    return { op: 'event', id, event: 'changed', set };
  }
  if (kind !== 'promise' || typeof event.kind !== 'string' || !event.kind.startsWith('promise.')) return null;
  const stage = event.kind.slice('promise.'.length);
  if (stage === 'planted') return { op: 'plant', id, text: nameOf(id), ...(horizonOf(id) ? { horizon: horizonOf(id) } : {}) };
  if (stage === 'resolved') return { op: 'hook', id, event: 'paid', ...(event.quote ? { evidence: event.quote } : {}) };
  const hookEvent = { advanced: 'advanced', misdirected: 'advanced', closed: 'closed', parked: 'parked', reopened: 'reopened', mentioned: 'mentioned' }[stage];
  return hookEvent ? { op: 'hook', id, event: hookEvent } : null;
}

/** 앞 회차를 차례로 접고, 이 회차 op 를 reviewLedgerOps → applyLedgerOps 로 돌린다. */
function ledgerVerdicts(c, mods) {
  const entities = new Map((c.entities ?? []).map((e) => [e.id, e]));
  const kindOf = (id) => entities.get(id)?.kind ?? null;
  const nameOf = (id) => entities.get(id)?.name ?? id;
  const horizonOf = (id) => entities.get(id)?.data?.horizon ?? null;
  const toOps = (events) => events.map((e) => opOf(e, kindOf, nameOf, horizonOf)).filter(Boolean);
  const config = {};
  const register = ofKind(c, 'item').map((e) => ({ op: 'register', feature: 'objects', id: e.id, name: e.name, aliases: e.aliases ?? [] }));
  let state = { ledger: mods.ledger.emptyLedger(), hooks: [] };
  const prior = byEpisode(c.priorEvents ?? []);
  for (let chapter = 1; chapter < c.episode; chapter += 1) {
    const ops = [...(chapter === 1 ? register : []), ...toOps(prior.filter((e) => e.episode === chapter))];
    const applied = mods.ledger.applyLedgerOps(state, ops, { chapter, config });
    state = { ledger: applied.ledger, hooks: applied.hooks };
  }
  const ops = [...(c.episode === 1 ? register : []), ...toOps(c.draftEvents ?? [])];
  const reviewed = mods.ledger.reviewLedgerOps({ state, ops, prose: c.prose, cast: c.appearances ?? [], config });
  const applied = mods.ledger.applyLedgerOps(state, reviewed.ops, { chapter: c.episode, config });
  const stale = mods.memory.hookDebt(applied.hooks, c.episode)
    .map((debt) => ({ severity: 'soft', code: 'HOOK_STALE', entityId: debt.id, message: `stale for ${debt.staleFor}` }));
  return [...reviewed.violations, ...applied.violations, ...stale];
}

/** 문체·연재 스캐너(모두 한국어 기준). */
function scanVerdicts(c, mods, foundation) {
  const prose = String(c.prose ?? '');
  const chapterNumber = c.episode;
  const base = { prose, chapterNumber, language: LANG };
  const prosody = mods.prosody.runProsodyScan(prose, { language: LANG });
  const gate = mods.gate.evaluateChapterQuality({ prosodyScore: prosody.score, coherenceScore: null, threshold: { coherence: null } });
  return [
    ...mods.sentence.scanSentenceStats(base).violations,
    ...mods.gate.failsToViolations(chapterNumber, gate.fails),
    ...mods.quality.scanQuality({
      ...base, emotionLexicon: new mods.emotion.DefaultEmotionVerbLexicon(), simileLexicon: new mods.simile.DefaultSimileMarkerLexicon(),
      onomatopoeiaLexicon: new mods.onomatopoeia.DefaultOnomatopoeiaLexicon(),
    }).violations,
    ...mods.style.scanStyle({ ...base, genre: 'action', lexicon: new mods.styleLexicon.DefaultStyleLexicon() }).violations,
    ...mods.tags.scanDialogueMarkerVariety(base).violations,
    ...mods.ratio.scanDialogueRatio({ ...base, genreProfile: foundation.genreProfile }).violations,
    ...mods.format.scanWebnovelFormat({ prose, chapterNumber, dialogueBreakMode: 'strict', language: LANG }).violations,
    ...mods.cliffhanger.detectCliffhanger(base).violations,
    ...mods.gapSkip.detectGapSkip(base).violations,
    ...mods.sensitive.scanSensitive({ ...base, lexicon: new mods.sensitive.DefaultSensitiveLexicon(), mode: 'adult' }).violations,
    ...mods.infoRestate.scanInfoRestate({ prose, chapterNumber, foundation }).violations,
  ];
}

/** INTRINSIC_VIOLATION 은 두 출처(구조·모델)가 같은 코드를 쓴다 — origin 으로 가른다. */
const codeOf = (v) => (v.code === 'INTRINSIC_VIOLATION' && v.origin ? `${v.code}:${v.origin}` : String(v.code));

/**
 * 한 사례의 vibelore 판정. hard/soft 는 vibelore classifyQualityViolations 로 가른다
 * (severity hard, 형식 불변식 WEBNOVEL_SOFT_LINEBREAKS·DIALOGUE_BURIED·DIALOGUE_NOT_ISOLATED, QUALITY_GATE_LENGTH 는 막는다).
 * @returns {Promise<{ hard: Array<{ code: string, entityId: string|null }>, soft: string[] }>}
 */
export async function vibeloreVerdicts(mods, c) {
  const foundation = foundationOf(c, mods);
  const lexicon = new mods.honorific.DefaultHonorificLexicon();
  const continuity = await mods.continuity.continuityCheck({
    language: LANG, prose: c.prose, chapterNumber: c.episode, foundation, lexicon,
    delta: deltaOf(c), prevState: prevStateOf(c, mods), model: 'parity-stub', providers: stubProviders(c),
  });
  const hints = hintsOf(c);
  const modeA = hints.length ? mods.lexiconScan.scanLexicon({ language: LANG, prose: c.prose, chapterNumber: c.episode, foundation, lexicon, hints }).violations : [];
  const violations = [...continuity.violations, ...modeA, ...ledgerVerdicts(c, mods), ...scanVerdicts(c, mods, foundation)];
  const { blocking, advisory } = mods.policy.classifyQualityViolations(violations);
  const entityOf = (v) => v.characterId ?? v.entityId ?? v.ledgerId ?? null;
  const hardKeys = new Set(blocking.map((v) => `${codeOf(v)}\0${entityOf(v)}`));
  const hard = [...hardKeys].map((key) => { const [code, entityId] = key.split('\0'); return { code, entityId: entityId === 'null' ? null : entityId }; })
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : String(a.entityId) < String(b.entityId) ? -1 : 1));
  const soft = [...new Set(advisory.map(codeOf))].sort();
  return { hard, soft };
}
