# N4 순서 없음(order: none) — SDD 기록과 판정 (2026-10-01)

계획: `docs/plans/2026-09-30-n4-order-none.md`. 브랜치 `feat/n4-order-none`(worktree `/path/to/folio-worktrees/n4`), 커밋 `5487b76..bc96025`(계획 커밋 위 12개, 이 판정 기록 커밋 별도). 병합·push·PR·정본 수정은 하지 않았다.

## 사용자 결정

- 2026-09-30: 사용자가 묻지 말고 끝까지 가라고 했다. 그래서 계획 결정 표 1–22("추천 채택(사용자 확인 필요)")를 모두 쓰인 대로 승인한 것으로 보고 실행했다.

## 실행 방법

- superpowers:subagent-driven-development를 썼다. 태스크마다 구현 → 리뷰 → 고침 루프를 돌렸다.
  - 구현은 haiku가 했다. 계획 블록은 스크립트로 쓰거나 `git apply`로 붙였다.
  - A1~A5, B1, C1은 가장 강한 리뷰어(opus)가 맡아 "공격해 볼 것"을 실제 탐침으로 시도했다.
  - D1은 보통 모델(sonnet)이 리뷰했다.
  - D2는 최종 브랜치 리뷰(opus)에 합쳤다(결정 22).
- 착수 전에 점검했다. 모든 블록을 `git archive HEAD` 사본에 태스크 순서대로 적용했고, 모든 블록이 깨끗이 적용됐다. 태스크 사이 이음새 표에서 충돌은 없었다.
- controller가 태스크마다 계획 블록과 작업 트리를 바이트로 비교했다. 판정으로 계획 블록을 넘은 파일은 넷이다.
  - `test/core/position.test.js`(P1)
  - `skill/folio/references/order.md`(D1-R1, F-R3)
  - `core/scope/scope.js`(F-R2)
  - `test/run/scope-linked.test.js`(F-R1, F-R2)
- 모든 커밋의 서명 줄은 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 하나다.
- 실행 도중 API 사용 한도로 controller가 한 번 멈췄다(B1 구현 뒤). 다음 controller가 ledger에서 이어받았다. 이미 끝난 태스크는 다시 하지 않았다.

## 테스트 수

- 시작은 1030이다.
- 태스크 끝마다: A1 1036, A2 1039, A3 1046, A4 1052, A5 1055, B1 1058, C1 1062, D1 1063(고침 뒤 그대로), D2 1068, 최종 고침 1069.
- 끝 모습(`bc96025`): `npm run check`의 lint·typecheck가 통과했고 1069/1069다. 로컬은 macOS, Node v23.11.0이다.
- 태스크별 고침 라운드: D1 1회, 나머지 0회. 최종 고침 물결 1회.

## 계획 글과 달라진 것 (판정)

- **P1(A1):** 위치 테스트 제목은 front 역할을 약속하지만 본문이 그것을 단언하지 않았다. 그래서 `preface`·`glossary`의 `unorderedBy === 'role'` 단언을 더했다. 테스트 수는 그대로다.
- **D1-R1:** 계획 문구 "게임북의 `branching`은 아직 순서 없음과 똑같이 다룬다"가 코드와 달랐다. branching은 `linkedScope`가 아무것도 모으지 않고, `requiresOrder: none` 검사도 해당 없음이다. `order.md`의 세 문장을 코드에 맞췄다.
  - branching 문장
  - `requiresOrder: none` 범위 문장
  - 찾기 결과 필드 문장
- **F-R1(최종):** `scope-linked` 테스트 4는 HEAD와 HEAD를 비교했다(토글만 뒤집음). 그래서 업그레이드 대량 stale(공격 9)을 어떤 테스트도 잡지 못했다. 뮤테이션으로 확인했다: 모든 linear rev에 `linked`를 넣어도 초점 테스트 139개가 통과했다. 이제 linear(novel-3level, 링크 포함), branching(gamebook), role(knowledge-book) 작품의 모든 노드×엔티티 rev를 N4 전 공식(엔티티 파일 rev + `eventsBefore`)과 비교한다.
- **F-R2(최종, A3 미룬 minor):** `order: none` 작품에서 폴더 순서만 바꿔도, 같은 엔티티 사건이 있는 노드 둘 이상을 링크한 커밋 항목이 `stale`이 됐다. 연결 사건 rev 재료가 읽는 순서 번호로 정렬됐기 때문이다.
  - 고친 것: `entityRevAt`이 연결 사건 rev 재료를 eventId로 정렬한다. payload의 `linkedEvents`는 읽는 순서 그대로다. 회귀 테스트를 더했다(+1).
  - 영향: linear·role·branching 노드와 링크 없는 none 노드의 값은 그대로다(F-R1이 고정한다). `linked` 키는 N4에서 새로 생겼고 아직 배포 전이라, 더해지는 호환 비용이 없다.
- **F-R3(최종):** `order.md` 두 문장을 코드에 맞췄다.
  - `linkedEvents`는 이 원고 범위의 엔티티 사건이다: 나온 엔티티, 선수 개념, 그리고 `promiseScope`가 켜졌으면 약속.
  - 레벨별 순서 예시 문구를 고쳤다.

## 호환이 바뀌는 것 (병합 공지)

계획 "호환이 바뀌는 것" 절 그대로다. 실행에서 더하거나 바뀐 것은 없다.
- `RUN_FEATURES`에 `linkScope`가 붙어 모든 작품의 `featuresDigest`가 한 번 바뀐다.
  - 열린 실행은 검사부터 한 번 다시 돈다.
  - 대기 중인 모델 답은 `ANSWER_STALE`이 된다.
  - 커밋된 노드가 `stale`이 되지는 않는다.
- 지식 책 팩 digest가 한 번 바뀐다(`23f620657c26` → `21f3d3dc1c5c`). 소설(`12152219862d`)·자료(`b810c582ecbd`)·브랜드(`961f5fb1433a`) 팩 digest는 그대로다.
- `order: none` 작품에서 커밋 노드가 링크로 가리키는 노드에 같은 엔티티 사건이 있으면, 그 노드는 업그레이드 뒤 한 번 `stale`(`entity:<id>`)이 된다. 재검사로 풀린다. linear 작품의 rev는 N4 전과 같다(F-R1 테스트가 고정한다).
- `scopeFields`를 켜지 않은 팩의 작품에서는 엔티티 `prerequisites`가 범위를 넓히지 않는다.
- 위치, ctx, scope 변경(모두 있을 때만 또는 추가만):
  - `folio_status.links`
  - `folio_config` `features`의 `links`·`linkScope`(옛 엔진에서 이 키를 쓰면 `FEATURE_UNKNOWN`)
  - `folio_find` enum 끝의 `links`
  - payload의 `linkedEvents`(있을 때만)
  - 위치의 `unorderedBy`
  - 지식 책 팩의 프리셋 `reference`, 검사 둘, 세트 `knowledge.unordered`(끝에 추가)

## 다른 레인에 알릴 것

- **M6b(`feat/m6-viewer`)**
  - **features 순서:** `core/work/features.js` 끝 순서는 `termIndex`, `links`, `linkScope`다(:40-42). 부모는 `linkScope: 'links'`(:48)다. `RUN_FEATURES` 끝은 `linkScope`이고 `links`는 그 밖이다(:52).
    - `viewerExport`는 `linkScope` 뒤에 붙인다.
    - 같은 커밋에서 목록 테스트를 맞춘다: `test/core/features.test.js:19,36`과 "N4 features" 테스트 `:116-129`(`keys.slice(-2)`, `indexOf('links') === indexOf('termIndex') + 1`), `test/server/feature-toggles.test.js:31`.
  - **연결 조회 계약:** `core/index/query.js` 끝(:73-80)이 `export { linkTable, linksFrom, linksTo } from '../links/graph.js'`다. N3 계약 주석과 내보내기는 그대로다.
    - `linkTable(work, { nodeId? })` → `{ links, backlinks, problems }`. `nodeId`를 주면 그 가지만 보고, 없는 노드면 `NODE_NOT_FOUND`다. 링크 한 줄은 `{ from, to, kind, label, index, valid }`다.
    - `linksFrom(work, nodeId)`와 `linksTo(work, nodeId)`가 있다.
    - 셋 다 `openWork` 결과만 읽는다. index.db와 작업 잠금을 쓰지 않는다.
    - **기능 확인(`links`)은 호출자 몫이다.** 계약 함수는 토글을 보지 않는다.
    - `linkedNodeIds`와 `linksStatus`는 계약 밖이다.
  - **위치:** `unorderedBy`가 생겼다. `positions.ordered`는 그대로다. 읽기 화면의 "함께 보기"와 관계도의 노드 링크는 위 계약을 쓴다.
- **N7(분기·게임북)**
  - **갈림 자리:** `core/scope/linked.js`의 `case 'branching': return NOTHING; // N7`(:23-24)이다. N7은 이 case만 바꿔 경로별 범위를 채운다.
    - 게이트는 :17(`linkScope` 꺼지면 아무것도 없음)과 :18(`positions.unorderedBy`)이다.
    - 나머지 갈림 자리:
      - `core/pack/yaml-schema.js:17`의 `REQUIRES_ORDER = ['linear', 'none']`에 `branching`을 더한다.
      - `core/checks/run-checks.js:12-13`의 `applicability`에서 :13 뒤에 `requiresOrder === 'branching'` 한 줄을 더한다.
      - `core/run/next.js:18`의 `preorder`(경로 차례를 원하면)
  - **계약:**
    - `unorderedBy`에서는 branching이 none보다 앞선다(`core/store/position.js:10-14` `modeReasonOf`). branching 아래 none 레벨도 `'branching'`이다.
    - 연결 조회는 `linkTable`·`linksFrom`·`linksTo`를 쓴다. 게임북 fixture 링크 넷은 `kind: choice`다(D2 N4-2).
    - 연결 사건은 `linkedEvents`로 따로 둔다. `priorEvents`와 섞지 않아야 `core.promise-order`가 경로 사건을 "앞"으로 오해하지 않는다. branching의 경로 앞뒤를 잠금에 넣을지는 N7 설계 몫이다.
    - `entityRevAt`의 연결 사건 rev 재료는 eventId로 정렬한다(F-R2). 연결 사건이 없는 노드에는 `linked` 키를 넣지 않는다. N7이 branching에서 사건을 모으면 그 노드들의 rev가 한 번 바뀐다(병합 공지 거리). F-R1 테스트의 gamebook 단언도 같은 커밋에서 옮긴다.
    - 지금 문서(`skill/folio/references/order.md:9`)는 "branching은 연결 사건과 `requiresOrder: none` 검사가 아직 없다"고 적는다. N7이 이 문장을 고친다.
- **N6(판본):** 지식 책 팩 모듈 그래프가 `packs/knowledge/checkers/links.js` → `core/links/graph.js` → `core/store/tree.js`·`core/blocks/subtree.js`를 품는다. 그래서 `tree.js`나 `subtree.js`를 고치면 지식 책 팩 digest가 바뀐다.
- **M5·N7(`yaml-schema.js`):** 최상위 키 `scopeFields`와 상수 `REQUIRES_ORDER`가 생겼다. 필드는 추가만 한다.

## 알려진 한계

- 아래 minor는 일부러 미뤘다. 줄별 이유는 아래 기록장과 최종 리뷰 분류에 있다.
  - `knowledge.links`의 깨진 링크·자기 링크 규칙이 `core/links/graph.js` `problemOf`와 두 곳에 있다. 합치면 팩 digest가 한 번 더 바뀌므로 N4 뒤 정리 몫이다.
  - 문서 테스트(`order-docs.test.js`)는 부분 문자열만 본다.
  - D2 N4-5의 none 부분은 공격 전제(연결 노드의 심기 사건이 `linkedEvents`에 있음)를 단언하지 않는다. 뮤테이션으로 그 테스트가 의미 있음은 확인했다.
- `core/index/query.js`를 import하면 `node:sqlite`의 `ExperimentalWarning`이 찍힌다. 기존 잡음이다.

## 확인하지 못한 것

- CI 행렬은 돌리지 않았다(Node 22·24·26, Windows·Linux). 로컬은 macOS, Node v23.11.0 하나다(`engines` 범위 밖).
- 다른 레인 브랜치(M6b·N7)와 합쳐 보지 않았다. 뷰어에서 연결 조회 계약을 실제로 붙이는 일도 하지 않았다.
- Claude Code 호스트에서 사람이 하는 흐름은 보지 않았다. D2는 가짜 호스트로 MCP stdio만 확인한다.
- `ORDER_MISMATCH` 자체는 C1 탐침에서 닿지 않았다. 실행이 extract부터 다시 돌아 먼저 걸렀다. 다만 커밋 잠금 경로의 diff는 비어 있다.

## 기록장

- Preflight: Ruling: P1 — A1 implementer adds, inside the plan's new position test, assertions that knowledge-book `preface` and `glossary` have `unorderedBy === 'role'` (test count unchanged, +6 for A1) — the test name promises the role case and design table defines 'role'; leaving it unasserted is a test-hygiene defect — cost if wrong: one extra assert line diverging from the plan block (compare will show DIFF for test/core/position.test.js, expected).
- Task A1: minor (deferred): position.test title says "front node's children" but no fixture front node has children; P1 asserts leaf front/back only and duplicates links-graph.test.js:57
- Task A1: minor (deferred): only branching-parent-over-none-child precedence tested; reverse direction untested (correct by attack)
- Task A1: minor (deferred): graph.js nodeOf duplicates subtreeOf's input check
- Task A1: minor (deferred): linkedNodeIds returns [] for unknown node and does not gate on unorderedBy — comment should say the none check belongs to the caller (A3 linkedScope)
- Task A1: minor (deferred): implementer skipped showing RED (wrote tests+code together); rules tightened for later tasks
- Task A1: ⚠️ carried to A3: linkedScope must gate on unorderedBy === 'none' and feed eventsOn activeEvents — verify at A3
- Task A1: complete (commits 5487b76..081e68d, review clean)
- Task A2: minor (deferred): links-query.test only stats index.db; no before/after snapshot guards the "no .folio / no lock" promise
- Task A2: minor (deferred): no test pins that status's ledger-broken early return lacks the links key
- Task A2: minor (deferred): ExperimentalWarning SQLite on Node v23 from pre-existing query.js import (env, not A2)
- Task A2: ⚠️ carried to A3: linkScope must never touch ordered/priorEvents — verify at A3
- Task A2: complete (commits 081e68d..54280dc, review clean)
- Task A3: review (opus, attacks 2·4·8·9 HELD over 1332-case HEAD-vs-BASE matrix) Approved, spec ✅; A1/A2 carried ⚠️ settled (gate on none + linkScope in linked.js; callers pass activeEvents; ordered/priorEvents unchanged under all toggles)
- Task A3: minor (deferred, plan-mandated): folder reorder in an order:none work falsely stales committed none entries linking ≥2 nodes with events of the same entity (linked rev material sorted by reading ordinal) — fails safe; fix = sort rev material by eventId in entityRevAt; final review to triage
- Task A3: minor (deferred): scope-linked test 4 compares HEAD vs HEAD with toggle flipped, does not pin pre-N4 rev formula for linear nodes
- Task A3: minor (deferred): A3 report claims assertCommitReady coverage no test gives (holds by trace)
- Task A3: minor (deferred): entityRevAt recomputes linkedScope per entity (O(entities×events), negligible now)
- Task A3: complete (commits 54280dc..2f1e6fc, review clean)
- Task A4: minor (deferred, plan-mandated): order-none-checks ctxFor rebuilds ctx by hand instead of using checkContext
- Task A4: minor (deferred, plan-mandated): link-laundering test stops at runDeterministicChecks, does not assert "cannot approve" via runner (holds by attack; D2 N4-5 covers end-to-end)
- Task A4: minor (deferred): A4 report miscounts where the +6 tests are
- Task A4: complete (commits 2f1e6fc..0f0d4eb, review clean)
- Task A5: minor (deferred, plan-mandated): scope.js gate tests literal 'prerequisites' not a constant from fields.js
- Task A5: minor (deferred, plan-mandated): no test pins the JS-pack scopeFields path (unknown values dropped) — holds by attack
- Task A5: minor (deferred): scopeFields: [] accepted and adds an empty key (changes that pack's digest, no effect)
- Task A5: complete (commits 0f0d4eb..8cb69a5, review clean)
- Task B1: minor (deferred): findInWork called directly with id undefined/null returns whole table (scopeOf shared with N3 queries; MCP schema blocks it) — pre-existing N3 behaviour
- Task B1: minor (deferred): find-links.test does not pin "no lock taken" / "no .folio when links off" (holds by attack)
- Task B1: complete (commits 8cb69a5..4a20d4f, review clean)
- Task C1: minor (deferred, plan-mandated): links.js repeats LINK_BROKEN/LINK_SELF rule from graph.js problemOf (drift risk)
- Task C1: minor (deferred, plan-mandated): links.js calls workEntities(ctx) only for its no-work throw
- Task C1: minor (deferred, plan-mandated): knowledge-pack.test title "three presets, three sets" stale (pre-existing)
- Task C1: minor (deferred): C1 report carries no raw test output; SQLite ExperimentalWarning is env noise
- Task C1: ⚠️ reference preset in skill docs — D1 order.md covers it (verify at D1)
- Task C1: complete (commits 4a20d4f..3f7eef1, review clean)
- Ruling: D1-R1 — order.md corrected (controller patch fix-D1.patch): branching line says order checks are not_applicable like none but linkedEvents and requiresOrder-none checks are absent until N7; requiresOrder none line says "order: none 레벨(또는 그 아래)" and names branching and linear front/back as not_applicable; find section labels links/backlinks/problems as result fields — the plan text contradicted linked.js/applicability and a host would expect linked events on gamebook nodes — cost if wrong: three doc sentences differ from the plan block (compare D1 shows DIFF for skill/folio/references/order.md, expected); test count unchanged (1063)
- Task D1: fix round 1 (3886250..01e503a, 1063/1063): D1-R1 patch applied; re-review (sonnet) all 3 findings ADDRESSED, no new breakage
- Task D1: minor (deferred): order-docs.test checks substrings only (status shape, FEATURE_DISABLED/NODE_NOT_FOUND, cross-refs/term-consistency names not pinned) — plan-mandated
- Task D1: minor (deferred): order.md:9 "requiresOrder: none 검사 ... 아직 없다" can read as "the check does not exist" rather than "does not run on branching"
- Task D1: complete (commits 3f7eef1..01e503a, review clean after 1 fix round)
- Task D2: complete (commits 01e503a..60b3c1b, folded into final branch review per decision 22; check 1068/1068)
- Final review (opus, 5487b76..60b3c1b): Needs fixes — I-1 attack 9 not pinned by any test (mutation making every linear rev carry `linked` passed 139/139 focused tests); I-2 A3 folder-reorder false stale (fix now); M-1 order.md:30 linkedEvents scope wording; M-2 order.md:8 per-level example wording; M-3 N4-5 does not assert the linked plant precondition (keep). Attacks: BASE-vs-HEAD matrix 2324 node cases (6 fixtures × 11 order configs incl. mixed per-level × linkScope × promiseScope) — positions (minus unorderedBy), ordered, priorEvents, receipt order, linear/hard applicability identical; D2 real stdio, copies only, attacks 1·3 caught by mutation; novel/sources/brand digests unchanged; locks/BANNED/no-model/300-line HELD
- Ruling: F-R1 — test/run/scope-linked.test.js test 4 also pins every node×entity rev of novel-3level (linear+link), gamebook (branching) and knowledge-book (role) to the explicit pre-N4 formula (sha256 of file rev + eventsBefore) — HEAD-vs-HEAD toggle flip could not catch a mass-stale regression — cost if wrong: one test is stricter than the plan block (plan block compare A3 shows DIFF for this file afterwards, expected); count unchanged for this test
- Ruling: F-R2 — entityRevAt sorts linked rev material by eventId (payload linkedEvents keeps reading order) + regression test "a folder reorder alone does not mark a committed none entry stale" — reading ordinal is only folder placement for none nodes; eventIds are unique; matrix re-run shows only none+linkScope+linked-events revs differ from base, same distribution as before; the `linked` key is new in N4 and unreleased, so no extra compatibility cost — cost if wrong: none-entry revs with ≥2 linked events differ from the plan's formula (one-time stale already announced); expected count 1069
- Ruling: F-R3 — order.md:30 says linkedEvents carry events of this draft's scope entities (appearing, prerequisites, promises when promiseScope is on); order.md:8 per-level example reworded — docs matched to scope.js:67 inScope — cost if wrong: two doc sentences differ from the D1 plan block
- Final review triage: A3 reorder minor → fixed (F-R2); A3 test-4 HEAD-vs-HEAD minor → fixed (F-R1); ⚠️ A1/A2/C1 carried items → closed (verified); all other deferred minors → keep deferred (per final-review.md reasons)
- Final fix wave: 60b3c1b..bc96025 (1069/1069) — 1a22fe7 fix(scope) F-R1·F-R2, bc96025 docs(skill) F-R3
- Final scoped re-review (opus): I-1, I-2, M-1, M-2 ADDRESSED; mutation (linear rev carries linked) fails the new pin test; old scope.js fails the reorder test; no new breakage
- Final: M-3 (N4-5 does not assert the linked plant precondition) — keep deferred (mutation shows the test is meaningful)

## 최종 브랜치 리뷰 (5487b76..60b3c1b, 가장 강한 모델)

- 결론: Needs fixes(작은 것). Critical 0, Important 2, Minor 3.
- 잠금 경로는 diff가 비어 있다: `runner.js`, `commit*.js`, `commit-locks.js`, `promise.js`, `receipts.js`, `receipt-builder.js`, `builtin.js`, `next.js`, `tree.js`, `config.js`.
- BASE(`5487b76`)와 HEAD를 행렬로 비교했다. 2324 노드 경우에서 아래 값이 BASE와 같다.
  - 행렬: fixture 6개 × 순서 설정 11종(레벨별 섞임 포함) × `linkScope` × `promiseScope`. 노드마다 앞·뒤·자기·깨진 링크와 무작위 사건을 넣었다.
  - 같은 값: positions(`unorderedBy` 제외), `ordered`, `priorEvents`, 영수증 `order`, linear·hard 검사의 해당 여부.
  - 결과: `core.promise-order`와 hard 잠금은 none, branching, role, 섞인 순서 어디서도 약해지지 않는다.
- D2(N4-1~N4-5)는 자식 프로세스 `bin/folio-mcp.js`(stdio)로 돈다. 복사본만 고친다.
  - 공격 1과 3은 뮤테이션으로 D2가 끝까지 잡는 것을 확인했다.
  - 공격 9는 코드로는 HELD였지만 잡는 테스트가 없었다(I-1).
- 팩 digest: novel·sources·brand는 그대로다. knowledge만 바뀐다(공지대로).
- I-1: 공격 9(업그레이드 대량 stale)를 지키는 테스트가 없었다 → F-R1.
- I-2: A3 미룬 minor(폴더 순서만 바꿔도 가짜 stale)를 지금 고친다 → F-R2.
- M-1·M-2: `order.md`의 `linkedEvents` 범위 문장과 레벨별 예시 → F-R3. M-3(N4-5 전제 단언)은 그대로 미룬다.
- 미룬 minor 분류: fix now는 A3 둘(I-1·I-2)이다. ⚠️ 셋(A1·A2·C1)은 확인 후 닫았다. 나머지는 keep deferred다.
- 고침 물결(`1a22fe7`, `bc96025`)은 opus가 범위를 좁혀 다시 리뷰했다. 네 가지 모두 ADDRESSED이고, 새 문제는 없다.
  - I-1 뮤테이션(linear rev에 `linked`)이 새 고정 테스트에서 실패한다.
  - 옛 `scope.js`는 폴더 순서 테스트에서 실패한다.
  - HEAD는 8/8 통과다.
- 끝 확인: controller가 `bc96025`에서 `npm run check`를 돌렸다. lint·typecheck 통과, 1069/1069다.

### 미룬 minor 분류 (최종 리뷰어)

- A1 position.test 제목 "front node's children" 불일치: keep deferred — 제목뿐이다. 단언(preface·glossary role)은 맞다.
- A1 branching이 none보다 앞서는 반대 방향(윗노드 none, 아래 branching) 미시험: keep deferred — position.js:21 `modeReasonOf`가 branching을 먼저 본다(추적). 비용 대비 가치가 낮다.
- A1 graph.js nodeOf가 subtreeOf 입력 검사와 중복: keep deferred — 두 줄이고 동작이 같다.
- A1 linkedNodeIds가 unorderedBy로 거르지 않음(주석): keep deferred — 계약 밖 내부 함수이고 유일한 호출자 linked.js:18-19가 거른다. 행렬로 확인.
- A1 RED 단계 생략: keep deferred — 과정 문제다. 이후 태스크 규칙이 강화됐다.
- A1 ⚠️ linkedScope가 none으로 거르고 activeEvents를 먹는가: closed — linked.js:17-19, 호출자는 ctx.events(activeEvents). 행렬 HELD.
- A2 links-query.test가 index.db만 stat: keep deferred — 조회는 openWork만 쓴다(graph.js import 추적). B1 리뷰가 43개 질의 hash로 확인했다.
- A2 기록장 깨짐 early return에 links 키 없음 미고정: keep deferred — blocks와 같은 모양이고 설계대로다.
- A2 SQLite ExperimentalWarning: keep deferred — 환경 잡음(Node v23), N4와 무관.
- A2 ⚠️ linkScope가 ordered/priorEvents를 건드리지 않는가: closed — 행렬(linkScope on/off × 11 순서 설정)에서 BASE와 같다.
- A3 폴더 순서 바꿈으로 가짜 stale: **fix now** — I-2(eventId 정렬 한 줄 + 회귀 테스트). linear·링크 없는 none은 값이 그대로고, 배포 전 키라 호환 비용이 없다.
- A3 scope-linked test 4가 HEAD 대 HEAD: **fix now** — I-1(N4 전 공식을 명시로 고정). 뮤테이션이 통과하는 것을 확인했다.
- A3 보고서의 assertCommitReady 커버리지 주장: keep deferred — 보고서 문제다. 성질은 추적으로 HELD(commit-guard.js:23).
- A3 entityRevAt이 엔티티마다 linkedScope 재계산: keep deferred — O(엔티티×사건)은 기존 eventsBefore와 같은 차수다. 성능 테스트 근거가 없다.
- A4 ctxFor를 손으로 만듦: keep deferred — 테스트 코드, 계획이 정함. D2가 러너를 끝까지 돈다.
- A4 세탁 테스트가 runDeterministicChecks에서 멈춤: keep deferred — D2 N4-5가 승인 불가를 끝까지 단언하고, 뮤테이션 `mut-a3`로 잡는 것을 확인했다.
- A4 보고서 테스트 수 오기: keep deferred — 보고서뿐이다.
- A5 scope.js가 문자열 'prerequisites'를 씀: keep deferred — 값이 하나이고, SCOPE_FIELDS는 얼린 목록이라 바뀌면 scope-fields.test가 잡는다.
- A5 JS 팩 scopeFields 경로 미고정: keep deferred — 쓰는 JS 팩이 없다. registry.js:52가 SCOPE_FIELDS로 거른다(추적·A5 공격).
- A5 `scopeFields: []`가 빈 키를 더함: keep deferred — 작가가 그렇게 적은 그 팩의 digest만 바뀐다. 동작 영향 없음.
- B1 findInWork 직접 호출 때 id가 undefined/null이면 전체: keep deferred — N3 때부터 있던 동작이다. MCP 스키마가 `id`를 요구한다.
- B1 find-links.test가 잠금·.folio 없음을 고정하지 않음: keep deferred — B1 공격으로 HELD. 경로상 withWorkLock을 부르지 않는다(find.js:46-50).
- C1 links.js가 graph.js problemOf 규칙을 반복: keep deferred — 두 줄 규칙이고 양쪽 테스트(knowledge-links, links-graph)가 같은 코드를 고정한다. 합치려면 graph.js에 export를 더해야 해서 팩 digest가 한 번 더 바뀐다. N4 뒤 정리 몫.
- C1 workEntities(ctx)를 던지기용으로만 부름: keep deferred — 동작이 옳다. 스타일 문제.
- C1 knowledge-pack.test 제목 "three presets, three sets" 낡음: keep deferred — N4 이전부터 있던 것이다. 제목뿐.
- C1 보고서에 원출력 없음: keep deferred — 보고서뿐이다. 이 리뷰에서 초점 테스트를 다시 돌렸다.
- C1 ⚠️ reference 프리셋이 스킬 문서에 있는가: closed — order.md:7, knowledge.md 프리셋 표 `reference` 행.
- D1 order-docs.test가 부분 문자열만 봄: keep deferred — 계획이 정한 것이다. 문서 테스트의 기존 관례.
- D1 order.md:9 "아직 없다" 모호: keep deferred — branching 문맥 안의 문장이고, 호스트가 따라 해도 결과(게임북에서 그 검사가 돌지 않음)가 맞다. M-1을 고칠 때 같이 다듬어도 된다.
- (ledger 64행) A3 리뷰가 A1/A2 ⚠️를 정리함: closed — 위 두 ⚠️와 같다. 이 리뷰에서 다시 확인했다.
