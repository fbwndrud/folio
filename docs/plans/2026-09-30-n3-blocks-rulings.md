# N3 블록·상호 참조 — SDD 기록과 판정 (2026-09-30)

계획: `docs/plans/2026-09-30-n3-blocks.md`. 브랜치 `feat/n3`(worktree `/path/to/folio-worktrees/n3`), 커밋 `f67c09e..f60bc5c`(계획 커밋 위 11개). 병합·push·PR·정본 수정은 하지 않았다.

## 사용자 결정

- 2026-09-30: 사용자가 묻지 말고 끝까지 가라고 했다. 그래서 계획 결정 표 1–22("추천 채택(사용자 확인 필요)")를 모두 쓰인 대로 승인한 것으로 보고 실행했다.

## 실행 방법

- superpowers:subagent-driven-development. 태스크마다 구현(haiku, 계획 블록을 스크립트로 쓰기·`git apply`) → 리뷰 → 고침 루프. A4·B1·C1·C2는 가장 강한 리뷰어(opus)가 "공격해 볼 것"을 실제 탐침으로 시도했다. A1·A2·A3·D1은 보통 모델(sonnet). D2는 최종 브랜치 리뷰(opus)에 합쳤다.
- 착수 전 점검: 계획의 모든 블록을 `f67c09e` 사본(작업 공간 밖, `git archive`)에 태스크 순서대로 적용하고 태스크마다 `npm run check`를 돌렸다. 9개 태스크 모두 깨끗이 적용됐고 테스트 수가 계획 자기 점검 표와 같았다(997 → 1030). 태스크 사이 이음새 표에서 충돌은 없었다.
- controller가 태스크마다 계획 블록과 작업 트리를 바이트 비교했다(새 파일 SAME, diff 블록 APPLIED). 판정으로 계획 코드를 넘은 파일은 C1의 `packs/knowledge/checkers/term-consistency.js`와 `test/pack/knowledge-checker-guards.test.js` 둘이다.
- 커밋 서명 줄은 모든 커밋에서 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 하나다.

## 테스트 수

- 시작 992. 태스크 끝마다: A1 997, A2 1003, A3 1007, A4 1010, B1 1015, C1 1020, C2 1024, D1 1025, D2 1030, 최종 고침 1030(단언만 강화).
- 끝 모습(`f60bc5c`): `npm run check` lint·typecheck 통과, 1030/1030.
- 태스크별 고침 라운드: C1 1회, 나머지 0회. 최종 고침 물결 1회.

## 계획 글과 달라진 것 (판정)

- C1: 계획 코드는 이름의 겹친 자리를 avoid 표기가 있든 없든 모두 모았다. 스스로 닮은 이름 500개(`'가'.repeat(k)`)와 63k자 원고에서 avoid가 하나도 없는데 26 s·659 MB(옛 코드 58 ms)였다. C1의 목적(O(n·m) 폭증 제거)과 어긋나므로, avoid 표기를 하나라도 품은 이름만 `containmentIndex`에 넣고 avoid가 없으면 이름 스캔을 건너뛰게 했다. 결과는 계획 코드와 같다(avoid 자리가 이름 자리 안에 완전히 들면 그 이름이 그 표기를 품는다; 무작위 대조 16만 건 차이 0). 기존 시간 테스트에 이 입력을 더했다(테스트 수 그대로).
- 최종 고침(`f60bc5c`): `core/index/query.js` 계약 주석에 "기능 확인은 호출자 몫"을 더했다. `skill/folio/references/knowledge.md` 세트 표에 `knowledge.references` 행, `blocks.md`에 id 글자 규칙(ASCII)과 깨진 근거·등장 기록장이 보이는 자리(`folio_status.evidence.ledger`·`occurrences.ledger`, `folio_find`의 `ledger`)를 적었다. 완료 기준 테스트는 hard 거부의 안쪽 코드 `USER_CHECK_SEVERITY_INVALID`와 참고 의견 실행에 `model:revise`가 없음을 단언한다.

## 알려진 한계

- 각주·앵커·자료 id는 ASCII(`[A-Za-z0-9][\w-]*`)만 읽는다. `[^주1]` 같은 한국어 라벨은 참조도 정의도 문제도 되지 않고 조용히 무시된다(문서에 적음; 알리는 검사는 후속).
- term-consistency: 모든 이름이 품는 avoid 표기가 있는 병적 입력(이름 `'가'.repeat(k+3)` 500개 + avoid `'가가'` + 63k자)은 여전히 이름 수 × 원고 길이로 커져 약 22 s 뒤 MCP 서버가 OOM으로 죽는다(`CHECK_CRASHED`가 아님). 작가 데이터로만 생긴다. 후속: 시작 위치마다 최대 끝값만 두어 메모리를 O(text)로.
- 서문과 부록은 무리 밖 번호 칸을 함께 쓴다(서문 그림 1 다음 부록 그림은 2). 설계 문구가 허용한다. 부록 `A.1`은 "뺀 것"이다.
- `folio_find bibliography`·`terms`는 범위(id)를 보기 전에 기록장을 읽는다. 기록장 파일이 디렉터리 같은 I/O 오류면 `NODE_NOT_FOUND` 대신 `INTERNAL_ERROR`다(누출 없음).
- `core/index/query.js`를 import하면 `node:sqlite`가 올라와 Node `ExperimentalWarning`이 찍힌다(기존 잡음). 계약 함수만 쓰는 쪽은 `core/blocks/*`를 바로 import해도 된다.

## 확인하지 못한 것

- CI 행렬(Node 22·24·26, Windows·Linux). 로컬은 macOS, Node v23.11.0 하나다(`engines` 범위 밖이지만 결과에 영향 없음). CRLF 원고는 문자열 테스트와 MCP 탐침으로만 확인했다.
- 뷰어(M6b)에서 계약 함수를 실제로 붙이는 일, N4가 `find.js`·`query.js`를 이어 쓰는 일. 다른 레인 브랜치와 합쳐 보지 않았다.
- Claude Code 호스트에서 사람이 하는 흐름. D2는 가짜 호스트로 MCP stdio만 확인한다.

## 호환이 바뀌는 것 (병합 공지)

- knowledge 팩 digest가 한 번 바뀐다(C1·C2 검사기 모듈 그래프와 `pack.yaml`). knowledge를 쓰는 작품의 열린 실행은 검사를 한 번 다시 돌고, 대기 중인 모델 답은 `ANSWER_STALE`이 된다. 커밋된 노드가 `stale`·`recheck`로 뜨지는 않는다.
- knowledge 검사기 넷(`defined-before-use`, `prerequisite-order`, `term-consistency`, `cross-refs`)은 `ctx.work.entities`(Map)가 없으면 던진다 → `CHECK_CRASHED`(선언 등급). 코어 경로는 늘 work를 넣으므로 외부·테스트 호출자만 바뀐다.
- term-consistency: 겹친 이름(ABA) 속 avoid는 이제 세지 않는다(지적 감소). NUL이 든 avoid는 `TERM_AVOID_INVALID`. 재검사 결과가 달라질 수 있다.
- `folio_status`에 `blocks`가 생긴다(기본 켜짐, 모든 작품). M1 `BLOCK_*`와 새 `FOOTNOTE_*`·`SOURCE_CITATION_BROKEN`이 처음으로 상태에 보인다(기존 fixture 중 knowledge-book에 `BLOCK_REF_BROKEN` 1건).
- `folio_config` `features`에 키 셋(`blocks`, `bibliography`, `termIndex`). 옛 엔진에서 이 키를 적은 work.yaml은 `FEATURE_UNKNOWN`.
- `folio_find` enum 끝에 셋, 설명문 끝에 한 문장(도구 스키마가 바뀐다, 추가만).

## 다른 레인에 알릴 것

- **M6b(`feat/m6-viewer`)**
  - `core/work/features.js` 끝 순서: `checkConfig`, `blocks`, `bibliography`, `termIndex`. `viewerExport`는 그 뒤에 붙인다. 목록 테스트 둘(`test/core/features.test.js`, `test/server/feature-toggles.test.js`)과 "N3 features" 테스트(`slice(-3)` → 새 키를 넣으면 이 단언을 새 끝 기준으로 옮기고 셋의 자리를 고정)를 같은 커밋에서 맞춘다. `features.test.js`에는 "`checkConfig`는 `viewerToggles` 바로 뒤", "`blocks`는 `checkConfig` 바로 뒤" 단언이 있다.
  - 조회 계약(`core/index/query.js`): `blockCatalog(work, { nodeId? })`, `bibliography(work, { evidenceRecords?, nodeId? })`, `termIndex(work, { occurrenceRecords?, nodeId?, kinds? })`, `parseNodeMarks(body)`, `BLOCK_KINDS`. 이름·인자 모양은 계획 "M6b 계약" 표 그대로다. 바꾸려면 쓰는 레인의 테스트와 같은 커밋에서.
  - index.db·작업 잠금을 쓰지 않는다(탐침: `.folio`를 만들지 않음). 기록장은 호출자가 `readLedgerView`의 `records`(깨졌으면 `null`)로 넘긴다.
  - **기능 확인은 호출자 몫이다.** 계약 함수는 `blocks`·`bibliography`·`termIndex`가 꺼졌는지 보지 않는다. 뷰어는 꺼진 기능의 화면을 내지 않는다(`FEATURE_DISABLED`).
  - B5 `viewBlocks`의 `anchors`·`refs`·`problems`는 `blockCatalog`의 `blocks`·`refs`·`problems`로 바꿀 수 있다(문제 목록은 각주·인용 문제까지 는다). 본문 조각은 `parseNodeMarks`의 `start`·`end`를 쓰면 문법을 두 번 적지 않는다.
  - `query.js` import는 `node:sqlite` 경고를 낸다. 경고가 싫으면 `core/blocks/*`를 바로 import한다.
- **N4(코어 레인 다음)**
  - `server/tools/find.js`: `blocks`는 잠금 밖(`node`·`entity`처럼), `bibliography`·`terms`는 작업 잠금 안에서 `ledgerFor`(= `core/view/ledgers.js` `readLedgerView`)로 기록장을 읽는다. 오류 순서는 `FEATURE_DISABLED` → `NODE_NOT_FOUND`. `id`는 노드 id 또는 `'*'`. `required`는 그대로.
  - `core/index/query.js`: 기존 db 조회 함수는 그대로이고 끝에 N3 계약 다시 내보내기가 붙었다. N4가 여기에 더할 때 계약 주석 블록을 건드리지 않는다.
  - `order: none`의 상호 참조 중심 검사는 `core/blocks/catalog.js`·`packs/knowledge/checkers/cross-refs.js`를 재사용할 수 있다.
- **N5(brand):** `packs/knowledge/pack.yaml` 프리셋은 바꾸지 않았다. 세트 `knowledge.references`와 검사 `knowledge.cross-refs`가 끝에 붙었다.

## 기록장

- Task A1: minor (deferred): syntax.js span closure recreated per line; captionOf recomputed per anchor on the same line (plan-mandated micro-inefficiency, no behaviour effect)
- Task A1: complete (commits f67c09e..04fc98b, review clean; check 997/997)
- Task A2: minor (deferred): numbering.js front and back matter share one outside-group counter (a fig in preface and in appendix number 1, 2 — spec wording allows it; untested combination)
- Task A2: minor (deferred): catalog.js blockCatalog does ref index/blocks/refs/footnotes/citations/sort in one body (style)
- Task A2: complete (commits 04fc98b..95022d4, review clean; check 1003/1003)
- Task A3: minor (deferred): byText comparator duplicated in bibliography.js and term-index.js (plan-mandated, tiny)
- Task A3: minor (deferred): bibliography.js iterates order.keys() instead of preorder list (style)
- Task A3: minor (deferred): no test for termIndex with kinds+nodeId together, nor bibliography evidence link out of scope vs citation in scope
- Task A3: complete (commits 95022d4..9e0b7b3, review clean; check 1007/1007)
- Task A4: minor (deferred): query.js contract doc block omits "feature check is the caller's duty" (blocks/bibliography/termIndex); a viewer reading only the doc could show a disabled bibliography/index — add one line + M6b notice (candidate for final fix wave)
- Task A4: minor (deferred): block-query.test.js compares only [next, evidence] when blocks off; spec says every other field stays equal — compare full rest object
- Task A4: minor (deferred): query.js imports node:sqlite at load, so pure-contract consumers print the SQLite ExperimentalWarning (pre-existing noise; import core/blocks/* directly if needed)
- Task A4: note: opus attack review probed index.db not created, featuresDigest/run file unchanged with toggles off, early-return shape unchanged, perf 1054 nodes/5100 anchors blocksStatus 25 ms; no toggle can weaken a lock
- Task A4: complete (commits 9e0b7b3..10c377c, review clean; check 1010/1010)
- Task B1: minor (deferred): find-blocks.test.js broken-ledger assert pins only ok:false — not line, not leak absence; no broken-ledger case for terms (plan-mandated test; candidate for final fix wave)
- Task B1: minor (deferred): find-blocks.test.js does not pin lock behaviour (bibliography/terms WORK_LOCKED under a live lock, blocks lock-free and creates no .folio)
- Task B1: minor (deferred): NODE_NOT_FOUND loop lacks 'constructor', over-long id, path-shaped ids (behaviour correct by probe)
- Task B1: minor (deferred): find.js reads the ledger before validating scope; ledger I/O error (EISDIR) masks NODE_NOT_FOUND as INTERNAL_ERROR (no leak)
- Task B1: minor (deferred): termIndex kinds option not exposed through folio_find (spec shape is { query, id } only)
- Task B1: note: opus attack review probed ids (__proto__, ../x, 5000 chars → 216-char message), FEATURE_DISABLED before NODE_NOT_FOUND, broken ledgers (secret never leaks, bytes unchanged), no write path, blocks lock-free, WORK_LOCKED for locked queries, existing queries unchanged
- Task B1: complete (commits 10c377c..a361b03, review clean; check 1015/1015)
- Task C1: Ruling: deviate from plan code in packs/knowledge/checkers/term-consistency.js — only names that contain some valid avoid form go into containmentIndex (exactly equivalent: a name span can fully contain an avoid occurrence only if the name contains that form; reviewer 30k-case reference 0 mismatches), and extend the existing timing test with a "periodic names, no avoid" input (no new test; count stays 1020) — why: C1's own goal is removing O(n·m) blowups and the plan code adds one in the same envelope — cost if wrong: one extra filter line; worst case a missed TERM_AVOIDED if equivalence were false (reference says it is not). Adversarial residue (avoid form contained in many self-overlapping names) stays O(names·text) — deferred.
- Task C1: minor (deferred): prerequisiteOrder can pass silently with a getter that returns the Map once then undefined (draftDefinitions re-reads ctx.work.entities with ?? new Map()); not reachable via core
- Task C1: minor (deferred): a name containing NUL can match masked code and hide a nearby avoid spelling (suppresses findings only; pathological)
- Task C1: minor (deferred): guards test covers declared block CHECK_CRASHED, not advisory + severityOverride block (behaviour correct by probe)
- Task C1: minor (deferred): greedy non-overlapping avoid scan can miss an occurrence sticking out of a name (name baa, avoid aa, draft baaa) — pre-existing
- Task C1: minor (deferred): residual adversarial case — avoid form contained in many self-overlapping names still O(names·text) after the filter
- Task C1: fix round 1/5 (1 addressed, 0 open — overlapping name scan filtered to names holding an avoid form; 60k+100k randomized cases 0 mismatches; no-avoid input 24 s OOM → 2 ms; commits c4b22f6..fdd7a38)
- Task C1: minor (deferred): residual — names '가'.repeat(k+3) x500 with one avoid '가가' and draft '가'x63000 still OOMs after ~22 s (process crash, not CHECK_CRASHED); needs span merging or a cap; author-controlled data only
- Task C1: minor (deferred): avoidOf called twice per entity (term-consistency.js:102,118)
- Task C1: complete (commits a361b03..fdd7a38, review clean after 1 fix round; check 1020/1020)
- Task C2: minor (deferred): cross-refs.js without ctx.node/ctx.nodeId treats the node's own old anchors as elsewhere → false BLOCK_DUPLICATE (core checkContext always passes node; fail closed or document) — candidate for final fix wave
- Task C2: minor (deferred): knowledge-cross-refs.test.js has no CRLF draft or block/hard path (D2 N3-4 covers block/hard; probe OK)
- Task C2: minor (deferred): knowledge-pack.test.js:31 title says "three sets" but there are now four (plan-mandated)
- Task C2: minor (deferred): skill/folio/references/knowledge.md set table lacks knowledge.references
- Task C2: note: opus attack review ran real MCP runs (advisory: approve, no auto-revise; block: 3x revise then user:blocked, OVERRIDE_REASON_REQUIRED; hard/warning → USER_CHECK_SEVERITY_INVALID); promise-order still runs with only knowledge.references; pack.yaml additions only; module graph has cross-refs.js; cost 1000 nodes x 20K chars 61 ms
- Task C2: complete (commits fdd7a38..272758f, review clean; check 1024/1024)
- Task D1: complete (commits 272758f..8cc3ffb, review clean; check 1025/1025)
- Task D2: complete (commits 8cc3ffb..88e3568, folded into final branch review per plan; check 1030/1030)
- Final: Ruling: one fix wave covers Important 1-2 and Minor 3-6 (all one-liners in docs/tests, no behaviour change, count stays 1030); Minor 7 (term-consistency memory cap) and non-ASCII footnote-label detection stay deferred as follow-ups — why: cheap, same files, reviewer recommended bundling — cost if wrong: a few extra doc/test lines
- Final: deferred-minor triage by final reviewer — all ledger minors stay-deferred except A4 query.js contract comment and C2 knowledge.md set row (must-fix, in fix wave). C1 ruling judged sound (exact equivalence).
- Final: fix wave BASE 88e3568, dispatched fixer (sonnet)
- Final: fix wave f60bc5c (6 addressed, 0 open, re-review sonnet clean; commits 88e3568..f60bc5c)

## 최종 브랜치 리뷰 (f67c09e..88e3568, 가장 강한 모델)

- 결론: With fixes. Critical 0. 잠금 경로(runner·commit·commit-guard·payload·scope·ledger)는 바뀌지 않았고, MCP로 다시 확인했다: 참고 의견 실행은 자동 수정 없이 승인, block으로 올리면 수정 3번 뒤 `user:blocked`와 `OVERRIDE_REASON_REQUIRED`, hard는 `USER_CHECK_SEVERITY_INVALID`, `knowledge.references`만 골라도 `core.promise-order`가 영수증 `appliedChecks`에 든다.
- 완료 기준 N3-1~N3-5는 모두 자식 프로세스 `bin/folio-mcp.js`(stdio)로 확인하고, 서버 stderr에 `Error`가 없다.
- I1: `core/index/query.js` 계약 주석에 "기능 확인은 호출자 몫"이 없었다. I2: `knowledge.md` 세트 표에 `knowledge.references`가 없었다. 둘 다 최종 고침 `f60bc5c`에서 고쳤다.
- 같은 고침 물결에 더한 것(판정): 완료 기준 테스트 단언 둘(hard 안쪽 코드, `model:revise` 없음), `blocks.md`의 id 글자 규칙과 기록장 자리 문장.
- C1 판정(term-consistency 필터)은 계획 코드와 결과가 같은 필터로 타당하다고 봤다.
- 미룬 minor 분류: 병합 전 필수는 A4 계약 주석과 C2 세트 표 둘(→ I1·I2). 나머지는 그대로 둔다. 후속 추천: term-consistency 메모리 상한, 비ASCII 각주 라벨 알림.
- 고침 재리뷰(sonnet): 여섯 가지 모두 ADDRESSED, 새 Critical/Important 없음. 테스트 수 1030 그대로.
