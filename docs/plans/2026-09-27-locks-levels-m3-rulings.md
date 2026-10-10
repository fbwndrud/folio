# M2.5·M3 판정 기록 (SDD ledger 사본)

원본: 실행 중 쓰던 git-ignored 작업 폴더의 progress.md와 사전 점검표. 계획서 docs/plans/2026-09-27-locks-levels-m3.md 실행과 최종 리뷰 뒤 수정에서 내린 판정·넘긴 항목(minor deferred) 기록.

# SDD ledger — plan: docs/plans/2026-09-27-locks-levels-m3.md

Spec: https://claude.ai/artifact/WjJzcsjnQZnVxyyJZaxvcX (read at start). Baseline: main 2e8986c, npm run check 354/354.
User: stop at M2.5 (after B3) and M3 (after C9) with acceptance results. Lock/check task reviewers on strongest model with attack scripts. push/PR ask first.
Ruling: work on branch feat/locks-levels-m3 in the main checkout (not a separate worktree) — previous milestones lived on main locally, no remote pushes without asking; branch gives isolation — cost if wrong: trivial rebase/merge.

## Pre-flight scan — table: preflight.md (same dir)
Ruling: C1 ANSWER_STALE breaks test/run/applied-checks.test.js:48-58 and test/run/order-stale.test.js:57-66 (resume after config change) — add both to C1 changed tests: assert.rejects({code:'ANSWER_STALE'}) then restart via driveToEnd from run({node:'next'}); keep all other asserts — plan's own decision (ANSWER_STALE) outranks those tests; cost if wrong: two test edits.
Ruling: A1/A2 validate.js must reuse define.js requires-walk + stageOf (export them) rather than reimplement — duplication is a review defect; cost: tiny API export.
Ruling: C1 generate/children duplicate raw/request block — implementer adds one payload.js helper returning {payload, digestPayload}; remove or reroute packPayload — cost: small deviation from plan code.
Ruling: C6 Files add tsconfig.json; folio_view returns {status, code, message} as handler/test say (decision 9 omits message, harmless extra field).
Ruling: minors (B3 overlap with A3/B2 tests, C2 50ms timing test, C6 test title) — keep plan text; reviewer may flag; C2 implementer should prefer deterministic sync over sleep if easy.
Task A1: BASE 2e8986c
Task A1: review Approved (27 pack + 10 override attacks, no bypass). Minor: pack default mode off on locked step accepted at load (commit dead-ends). Ruling: fix now as round 1 (PACK_LOCKED_STEP_MODE) — lock-adjacent, cheap — cost: none.
Task A1: minor (deferred): REQUIRES_ORDER/dup id/string requires caught by resolvePipeline not validatePack (codes split PACK_* vs STEP_*) — safe.
Task A1: fix round 1/5 (1 addressed, 0 open; commits f32b135..5166ac5). Error shape {code, kind, stepId, mode} accepted.
Task A1: complete (commits 2e8986c..5166ac5, review clean). 361/361
Task A2: BASE 5166ac5
Task A2: review Approved (24 attacks, no bypass). Ruling: fix minors 3 (checkSets prototype lookup → Object.hasOwn) and 4 (undeclared user check ids with core./pack prefix → USER_CHECK_ID_RESERVED) now — identity invariants, cheap — cost: users can't name checks core.x.
Task A2: minor (deferred): resolvePacks re-reads pack.checks/checkSets after validation (getter TOCTOU; JS packs trusted; resolveChecks catches checks case).
Task A2: minor (deferred): check id suffix has no charset rule (trailing space / NFC look-alikes; no shadowing).
Task A2: minor (deferred): id lacking prefix and duplicated reports both codes (plan-mandated, cosmetic).
Task A2: fix round 1/5 (2 addressed, 0 open; commits f0d39fe..f32dc55)
Task A2: complete (commits 5166ac5..f32dc55, review clean). 370/370
Task A3: BASE f32dc55
Task A3: review Approved w/ Important plan-mandated: pack-declared digest pins packDigest → content change invisible, open run skips recheck (attack 12b BYPASS).
Ruling: packDigest always hashes projection; declared digest only folded in (sha256({declared, content})) — spec lock "checked under checked rules" outranks plan shortcut; C3 tests use pack.digest directly so compatible — cost if wrong: file pack digest slightly more work.
Ruling: also fix minors: project RegExp/Date/Map/Set, throw PACK_DIGEST_UNSUPPORTED on bound/native fns, comment JS closure limit; PIPELINE_HINT mentions packs.
Task A3: minor (deferred): decisions-ledger check_result records lack pipelineDigest/packDigest → forged receipt re-stamped with new digest could reuse old-pack check results via direct commitNode (runner never does). Consider binding in final review.
Task A3: minor (deferred): commitNode trusts caller-supplied pipeline.packDigest (existing caller-trust model, same as steps).
Task A3: fix round 1/5 (3 addressed, 0 open; commits 1b3324c..5c5f693; attacks 12/12b re-run → no bypass). runner-locks.test.js hint string updated (wording only).
Task A3: minor (deferred): project ignores non-enumerable props; function vs "fn:"-string collision (exotic, JS packs trusted).
Task A3: complete (commits f32dc55..5c5f693, review clean). 375/375. Part A done.
Task B1: BASE 5c5f693
Task B1: review Needs fixes (22 attacks; no lock bypass). Important (plan-mandated): level `own` error filter hides REQUIRES_ORDER; level custom step reusing other-kind pack step id leaks checks across kinds.
Ruling: fix both + minor perLevel hasOwn in round 1 — config invariants that hold globally must hold per level; B2 runs on these pipelines — cost: slightly stricter configs.
Task B1: minor (deferred): pipelineDigest excludes `reason` (existing behaviour).
Task B1: fix round 1/5 (3 addressed, 0 open; commits 3a98dc9..ca19319)
Task B1: complete (commits 5c5f693..ca19319, review clean). 386/386
Note: user asked about mkdtemp leak — confirmed 248 dirs/run, tempDir never cleaned; reported, fix deferred to user choice at M2.5 stop.
Task B2: BASE ca19319
Ruling: B2 levelOf trusts run.level from run file → node level from tree wins; mismatch → RUN_LEVEL_MISMATCH — run files untrusted for lock choices (M2 ruling) — cost: hand-moved nodes with open runs must restart.
Task B2: review Approved (23 attacks, no bypass). Ruling: fix minors 1 (mismatch freezes work → hint + allow skip on mismatched run) and 2 (stale.js `now` shadowing) — recoverability without touching locks — cost: skip path must stay step-free.
Task B2: minor (deferred): pipelineFor/checksDigestFor recompute levelOf twice (nit).
Task B2: minor (deferred): commitNode/recordRecheck trust caller pipeline is the node's level pipeline (runner only caller; C6 guard).
Task B2: minor (deferred): no regression tests for forged other-level digest resync / crash-resume with level override change (attack-only).
Task B2: fix round 1/5 (2 addressed, 0 open; commits bf46b53..b1fec08)
Task B2: minor (deferred): mismatched run in active/awaiting_model can't be skipped (decide only awaiting_user; pre-existing for all runs).
Task B2: complete (commits ca19319..b1fec08, review clean). 396/396
Task B3: BASE b1fec08
Task B3: complete (commits b1fec08..7a22c11, review clean). 401/401. M2.5 reached → stop per user rule.
User 2026-09-27 at M2.5 stop: (1) fix tmp leak now → d658476 (tempDir exit cleanup, delta 0, 401/401; controller read diff). (2) deleted 4908 leaked $TMPDIR/folio* dirs (~400MB). (3) proceed to Part C.
Task C1: BASE d658476
Task C1: review Approved (13 attacks, no bypass). Ruling: fix minor 2 now (mismatched run in awaiting_model/active has no abandon path; MCP will surface it) — allow decide skip in any open state for mismatched runs only; minor 1 → doc line in digest.js — cost: none.
Task C1: minor (deferred): plan doc line 60 still lists packPayload (plan is historical record; leave).
Task C1: minor (deferred): parked-m3 test 3 covers generate only; children/revise retryReason-in-prompt path untested.
Task C1: minor (deferred, plan-mandated): request digest from raw material → JS pack prompt() closure changes not bound (packDigest known limit).
Task C1: fix round 1/5 (2 addressed, 0 open; commits 1dd0099..8eaa979)
Task C1: minor (deferred): no test for mismatched run in `committing` (skip correctly refused by inspection).
Task C1: complete (commits d658476..8eaa979, review clean). 407/407
Task C2: BASE 8eaa979
Task C2: review Approved (22 attacks, no bypass). Implementer added assertStructurePresent (STRUCTURE_MISSING) per controller note.
Task C2: minor (deferred): legacy branch receipt without structure (recorded before crash) can commit over changed children; legacy receipts never show structure reason nor unknown.missing — no real works exist pre-v0.1, low value.
Task C2: minor (deferred): structure-stale branch not auto re-selected by run next (by design, host must show reason); grandchild changes don't stale grandparent (brief scope); stale-checks.js:54 returns ledger ref (copy safer); 50ms timing test.
Task C2: complete (commits 8eaa979..ab01c4b, review clean). 412/412
Task C3: BASE ab01c4b
Task C3: review Needs fixes (40+ attacks; no YAML-reachable lock bypass). Important: symlinked pack.yaml escapes containment; prompt texts invisible to packDigest projection (bound only via mutable declared digest).
Ruling: fix both + minors NUL/raw `..`/SAFE_ID proto names/toString.call/stale comment/spacing in round 1 — containment + "digest covers content" are spec intent — cost: small.
Task C3: minor (deferred): certain-to-fail pipeline shapes (commit placement, requires unknown, model check on facts stage, sets referencing unknown/core checks) accepted at load, refused at resolve.
Task C3: minor (deferred, plan-mandated): validatePack errors all labelled path 'pipelines'.
Task C3: fix round 1/5 (3 addressed, 0 open; commits 9a4fe0e..b92b788). pack.prompts now data (C4 novel pack must use it).
Task C3: minor (deferred): loose schema: presets.levels shape, non-string title.
Task C3: complete (commits ab01c4b..b92b788, review clean). 427/427
Task C4: BASE b92b788
Task C4: review Approved (hard check blocks end to end). Important (plan-mandated): quote-less state/alive extraction silences dead-on-stage.
Ruling: revival requires quote; extract.md requires quote for vital events; unknown vital values → VITAL_UNKNOWN block finding — "hard conflicts block" must not be defeated by one unverified line — cost: hosts must quote revivals.
Task C4: minor (deferred): scan-based scope can't list pronoun/epithet-only appearances (core limit); branch revise prompt says 원고 not 계획.
Task C4: fix round 1/5 (2 addressed, 0 open; commits 6bce3b2..4d11922). novel-pack.test.js revival assert changed to quoted alive (ruled semantics change).
Task C4: complete (commits b92b788..4d11922, review clean). 435/435
Task C5: BASE 4d11922
Task C5: review Needs fixes: concurrent initWork both created:true, second overwrites (never-overwrite invariant). Ruling: exclusive atomic create (tmp+link), EEXIST → created:false; root-is-file → WORK_ROOT_INVALID. Root confinement stays in server layer (core takes root as trusted).
Task C5: fix round 1/5 (2 addressed; commits 4fa4fef..7d7cb60) — scoped re-review done by controller (read diff: tmp+link exclusive, EEXIST→false, finally unlink; ran init tests 5/5).
Task C5: complete (commits 4d11922..7d7cb60). 440/440
Task C6: BASE 7d7cb60
Task C6: review Approved (40+ tool-layer attacks, call() never threw, hard approve refused, read tools don't mutate).
Task C6: minor (deferred): INTERNAL_ERROR carries raw Node messages (root is file → ENOTDIR; NUL); FolioError messages echo unbounded user input (truncate ~200); index has no maximum; folio_status workStatus/run load race.
Task C6: complete (commits 7d7cb60..dffef8c, review clean). 449/449
Task C7: BASE dffef8c
Note: suite duration 10s→71-112s investigated: machine load avg ~75; baseline 2e8986c also 82s under same load; isolated M2-1a 3.2s→~5s (modest, per-call tree reads). Not a regression block.
Task C7: review Approved (20 live-server attacks, no stdout pollution/orphans; deps clean, SDK 1.30.1). Ruling: add server.onerror stderr line (silent exit on >10MiB message) — cost: none.
Task C7: minor (deferred): SDK low-level Server: no -32700 on parse errors, answers before initialize; warning filter only via bin.
Task C7: fix round 1/5 (1 addressed; f655526..1a528d4) — controller verified diff (stderr only, 4 lines + test).
Task C7: complete (commits dffef8c..1a528d4). 452/452
Task C8: BASE 1a528d4
Task C8: review Needs fixes (no Critical lock sentence). Important: SKILL.md:63 implies host edits tree; checks.md workKind reason never produced (folio_config lacks workKind/node recommendations — user decision gap); checks.md:47/52 contradict init preset sets.
Ruling: fix wording + extend folio_config (read-only) with optional workKind and node → recommendCheckSets(workKind)/recommendForNode — user decision "recommend by work kind and node position" must be reachable by host — cost: small schema addition.
Task C8: fix round 1/5 (4 addressed, 0 open; commits 4d47ba7..9c5eee5)
Task C8: complete (commits 1a528d4..9c5eee5, review clean). 456/456
Task C9: BASE 9c5eee5
Task C9: complete (commits 9c5eee5..6b42b97, review clean). 458/458. Final whole-branch review running.
Final review: With fixes. Important: committing run + pipeline change → permanent freeze. Ruling: one fix wave (skip allowed on committing only when receipt mismatches pipeline; README MCP; skipped doc; stale-branch rerun doc; root = absolute-only documented (C5 ruling text corrected: no confinement exists); initWork removes own work.yaml on open failure; branch revise-plan prompt). Commits 6b42b97..1f25b2b, 464/464.
Final fix wave re-review: 7/7 addressed. Residual Important: crash during FIRST commit after body+status write, then (new) skip on committing → node status committed w/o commit record; children-guard/pickNext treat as done; no detector. Ruling: surface to user at M3 stop with recommended fix (done = commit record present; workStatus COMMITTED_WITHOUT_RECORD; test) — skill allows no second fix wave — cost if unfixed: parent branch can commit over unrecorded child after rare crash+skip.
Residual Minor: staleReceipt reads run.receipt (run file) not ledger receipt body.
User 2026-09-27: fix COMMITTED_WITHOUT_RECORD now. BASE 1f25b2b
CWR fix: ee6fded, 2f74d2f (468/468). Ruling: skipped CWR node stays skipped by run next (author skip respected; parent CHILDREN_PENDING + status drift COMMITTED_WITHOUT_RECORD make it safe) — cost: author must run the node explicitly.
CWR re-review: all addressed (7 attacks). Ruling: harden recordedReceipt (bind runId/nodeId) + commit.js already-check nodeId — cheap, closes run-file forgery. Deferred: crash between appendNodeEvents and commit append leaves uncommitted events active until re-run (pre-existing; drift now flags node).
CWR hardening eae6bfe verified by controller (diff read, full suite). 470/470.

## 사전 점검표 (preflight)

# Preflight — docs/plans/2026-09-27-locks-levels-m3.md

읽기 전용 점검. 계획 줄 번호는 `L<n>`. HEAD = `2e8986c` (계획 문서 커밋. 코드는 계획이 적은 `15d2013`과 같다).

## 판정 요약

| # | 심각도 | 내용 |
|---|---|---|
| 1 | **conflict (빌드 깨짐)** | C1의 `resume` ANSWER_STALE(L1693-1709) 때문에 C1이 목록에 넣지 않은 기존 테스트 두 개가 실패한다: `test/run/applied-checks.test.js:48-58`, `test/run/order-stale.test.js:57-66` |
| 2 | defect (리뷰 지적감) | 로직 중복: `core/pack/validate.js` `requiredBy`/`stageOf`(L297-310)가 `define.js` `coreLockedIds`/`stageOfStep`(L256-272)을 다시 구현한다. C1 generate.js·children.js의 `raw`/`request` 블록이 똑같고 요청마다 `raw(extra)`를 두 번 계산한다(L1760-1776) |
| 3 | minor | C1 뒤에는 `packPayload`(L1729)를 부르는 곳이 없다(죽은 export) |
| 4 | minor | C6 Files 목록(L3088-3095)에 `tsconfig.json`이 없는데 Step 8(L3503)은 고치고 커밋(L3519)도 한다 |
| 5 | minor | 결정 9(L97)와 C6 Interfaces(L3107)는 `folio_view` → `{status, code}`라고 하지만, handler(L3461)와 테스트(L3164)는 `message`를 더 준다 |
| 6 | minor | 테스트 중복: B3 M2.5-3(L1545)은 A3 test 4(L730)와, B3 M2.5-4(L1556)는 B2 test 1(L1224)과 거의 같다. 인수 테스트라 받아들일 수는 있다 |
| 7 | minor | 두 테스트 파일이 같은 `walk`를 각자 가진다(C6 L3131 = no-model-calls). `isPlainObject`가 levels.js·yaml-schema.js에서 다시 정의된다. 자식 목록 비교가 `assertStructureMatches`(L2015)와 `structureReason`(L2042)에 중복된다 |
| 8 | minor | C2 test 2(L1902)는 잠금을 기다리는지 50ms sleep으로 확인한다(타이밍 의존) |

## 1. 작업 쌍 — 같은 파일이나 인터페이스를 쓰는 곳

| 쌍 | 앞 작업이 만드는 것 → 뒤 작업이 쓰는 것 | 판정 |
|---|---|---|
| A1→A2 `core/pack/validate.js` | A1이 `validatePack`=`pipelineErrors`를 만들고, A2가 `idErrors`를 앞에 붙인다(L533-539). A1 테스트는 A2 뒤에도 통과한다(fakePack id는 모두 `fake.` 접두어) | consistent |
| A1→A2 `core/pack/registry.js` | 둘 다 파일 전체를 바꾼다. A2판(L545-595)에 A1의 `assertValid`·PACK_PIPELINE_MISSING이 들어 있다. `core.` 거부는 map 안의 throw에서 `idErrors`의 PACK_CHECK_ID_RESERVED로 옮겨진다. 기존 `check-set.test.js:108-111`도 계속 통과한다 | consistent |
| A2→A3 `registry.js` | A3는 A2판의 반환 객체에 `digest: registryDigest(packs)`만 더한다(L778-783) | consistent |
| A1→A3 `core/pipeline/define.js` | A3의 `resolvePipeline` 교체(L800-814)가 A1의 `markLocked`(core 계산)를 그대로 부른다. A1의 import 줄(L246-247)과도 겹치지 않는다 | consistent |
| A3→B1 `core/pipeline/resolve.js` | B1의 전체 교체(L1096)가 `packDigest`를 받아 모든 `resolvePipeline` 호출에 넘긴다 | consistent |
| A3→B1 `core/run/workspace.js` | B1의 교체(L1139-1142)가 `packDigest: registry.digest`를 유지한다 | consistent |
| A3→C2 `core/run/commit-locks.js` | A3는 `assertPipelineMatch` 첫 줄만(L840), C2는 파일 끝에 추가만(L2015) 한다. `canonicalJson`과 `FolioError`는 HEAD에서 이미 import되어 있다 | consistent |
| A3→C2 `core/run/commit.js` | A3는 JSDoc만, C2는 import와 L27 한 줄을 바꾼다(L2031) | consistent |
| A3 → A3·B1·B2 커밋 경로 | 레벨 파이프라인 객체(`resolvePipeline` 결과)는 `packDigest`를 갖는다. commit·recheck가 `pipeline.packDigest ?? null`로 다시 계산하면 맞는다. HEAD 테스트(`commit.test.js:17`, `decisions.test.js:115`, `applied-checks.test.js:89`)는 packDigest 없이 같은 pipeline을 쓰므로 null → 옛 digest가 나온다 | consistent |
| A3 ↔ C3 digest | `loadYamlPack`의 `digest`는 `sha256()` = `sha256:<hex>`(L2468)이라 `packDigest`의 HASH 정규식(L752)과 맞는다 | consistent |
| A1/A2 ↔ C3 | `loadYamlPack`이 마지막에 `validatePack`을 부른다(L2506). DEMO 팩(L2118)은 잠금·접두어 규칙을 통과한다. `locked` 키는 readPackSpec이 먼저 거부한다 | consistent |
| A1/A2 ↔ C4 | novel pack.yaml(L2638)의 검사·세트 id는 모두 `novel.`로 시작한다. facts→extract→draft 사슬이 있다. C4 테스트의 잠금 목록(L2584)은 A1 계산 `['draft','extract','facts','commit']`과 같다 | consistent |
| B1→B2 `pipelines.byLevel`, `checksDigest.byLevel`, `applied.byLevel` | B1 workspace(L1149-1157)가 만들고, B2 `pipelineFor`/`checksDigestFor`(L1303-1314)와 `findStale`(L1450)이 쓴다 | consistent |
| B2→C1 `core/run/sync.js` | B2가 전체를 교체(L1319-1375)하고, C1이 `dropPending(run);` 뒤에 `run.retries = {}` 한 줄을 넣는다(L1715). 그 줄은 B2판에 있다 | consistent |
| B2→C1 `core/run/runner.js` | B2는 drive/newRun/decide를, C1은 resume을 고친다. C1이 쓰는 `outOfSync`·`dropPending`·`context`·`now`는 이미 import·정의되어 있다 | consistent |
| B2→C2 `core/scope/stale.js` | B2가 L34를 교체(L1450-1451)하고, C2는 `if (order)` 뒤에 추가한다(L2052). 위치가 겹치지 않는다. B2의 `const now`가 안쪽 for 블록의 `now`를 가리지만 lint 규칙에 걸리지 않는다(no-shadow 없음) | consistent |
| B2→C6 `stagesByTier` | B2가 byLevel까지 본다(L1459). C6 `describeConfig`가 `{leaf,branch,byLevel}`를 넘긴다. 기대값 `['critic','fit','review']`(L3206)는 leaf→branch 순서와 맞는다 | consistent |
| B2 `checkPlanFor(ctx, pipeline)` ↔ HEAD 호출처 | 호출처는 runner.js:74, recheck-plan.js:54, sync.js 세 곳이고 B2가 모두 바꾼다. 테스트에는 호출처가 없다 | consistent |
| B1 ↔ HEAD `test/run/pipeline.test.js`, `check-options.test.js` | `levels` 기본값 `[]` → `byLevel {}`. 전체 덮어쓰기 루프는 `split.global`을 쓴다(L1102) | consistent |
| C1 ↔ A3 test 4 / B2 test 2 / B3 M2.5-3 | 이 테스트들은 설정을 바꾼 뒤 `decide`를 쓴다(ANSWER_STALE 대상 아님). `payload.instructions`는 `dressPayload`로 계속 붙는다 | consistent |
| **C1 ↔ HEAD `test/run/applied-checks.test.js:48-58`** | 테스트는 `model:critic`에서 멈춘 뒤 `fake.critic`을 끄고(checksDigest가 바뀜), `driveToEnd({ from: needs_model })` → `resume`을 부른다. C1 뒤에는 이 호출이 ANSWER_STALE로 던져 테스트가 reject된다. C1 Files(L1611-1618)·Step 6에 이 파일이 없다 | **conflict** |
| **C1 ↔ HEAD `test/run/order-stale.test.js:57-66`** | `model:critic` 뒤에 `order: none`으로 바꾸면(outOfSync의 sameOrder가 false) `driveToEnd({ from: first.at(-1) })` → `resume`이 ANSWER_STALE이 된다. 목록에 없다 | **conflict** |
| C1 ↔ HEAD 다른 resume 테스트 | runner-leaf 140-146, runner-locks 160/221/236/274, recheck-locks 70, recheck-complete 20-40, answer-binding 3번째 테스트: 설정을 바꾸지 않은 채 resume하므로 영향 없다. hierarchy-guards 38-43은 구조만 바꾸는데 outOfSync는 구조를 보지 않는다 | consistent |
| C1 ↔ C8 문서 | skill 문서의 ANSWER_STALE 안내(L3876, L3970, L4053)가 C1 동작과 같다 | consistent |
| C2 → C6 `changeStructure` | `{op, outline}`(L1984). C6 handler(L3459)와 테스트(L3175)가 `outline`을 쓴다 | consistent |
| C2 ↔ B2/B3/C9 흐름 | 가지 영수증 `structure`는 커밋 때 자식 목록으로 만든다(L1994). 같은 실행 안에서는 늘 일치한다 | consistent |
| C3 → C4 `loadYamlPack(dir, {name, checkers})` | `packs/novel/index.js`(L2896)의 호출 모양이 같다 | consistent |
| C4 → C5/C6/C7 `loadBuiltinPacks()` | `Map<'novel', Pack>`. C5 테스트(L2978), C6 `box`(L3124), C7 `startStdioServer`(L3714)가 쓴다 | consistent |
| C4 ↔ C9 단계 이름 | arc: plan → fit(parent-fit가 `requiresParentPlan`이라 not_applicable, 요청 없음) → revise(not_needed) → approve → children. episode: plan, draft, extract, facts(결정론), critic, approve, commit. 기대 레이블(L4153-4156)과 같다 | consistent |
| C5 → C6 `initWork(root, {title, packs, preset, available})` | handler(L3450)가 `packs` 기본값 `['novel']`로 부른다 | consistent |
| C6 → C7 `TOOLS`, `createToolbox`, 가드 루프 | C7이 `for (const dir of ['server'])` → `['server','bin']`로 바꾼다(L3633-3637). C6 L3219 원문과 같다 | consistent |
| C6 → C8 `TOOLS` | 문서가 도구 9개를 모두 말한다. `folio_*` 표기는 정규식 `folio_[a-z_]+`에 걸리지 않는다 | consistent |
| C7 → C9 `connectFolio` | `{client, call, stderr, close}`(L3598). C9가 `call`·`stderr`·`close`를 쓴다 | consistent |
| C4/C6/C7 `tsconfig.json` | include를 packs → server → bin 순서로 넓힌다. 각 단계의 기대값이 앞 단계를 포함한다 | consistent |

## 2. 작업마다 자기 일관성

| 작업 | 테스트 ↔ 코드 · 파일 · import | 판정 |
|---|---|---|
| A1 | 여섯 테스트 모두 코드로 따라가 봤다: seed commit+facts → {commit,facts,extract,draft}. `facts` 커스텀 → STEP_ID_RESERVED. mismatch의 `details.errors[0].stepId==='commit'`. requires/tier 오류 코드도 맞다. define.js→builtin.js→promise.js에 순환 import가 없다. FolioError `(code,msg,details)`는 HEAD와 같다 | consistent |
| A2 | 코드 목록(prefix, reserved, duplicate, default-unknown, name invalid/reserved, 팩끼리 중복, PACK_DUPLICATE, PACK_NAME_MISMATCH, CHECK_ID_DUPLICATE)이 테스트와 맞는다. 기존 테스트 수정(`check-set.test.js:102-106`)은 이유가 적혀 있고 assert는 그대로다(`defaultCheckSets: []`도 이유 있음). HEAD의 다른 테스트 팩은 모두 `fake.` 접두어다 | consistent |
| A3 | `packDigest`·`registryDigest`·`resolvePipeline(...,{packDigest})`가 테스트와 맞는다. test 3의 LOCK_PIPELINE_MISMATCH는 `assertLocks`에서 먼저 난다. test 4는 decide → outOfSync → extract부터 다시 도는 것이 HEAD 흐름과 맞다. 줄 참조 `commit-locks.js:27`, `recheck-commit.js:10`이 맞다 | consistent |
| B1 | 여덟 테스트: 레벨 공유 객체 동일성, merge에서 레벨이 이김, custom 충돌은 한 번, 레벨 오류에 `level` 붙음, `[]`는 level null. `__proto__`가 yaml→rest→fromEntries를 거쳐도 자기 속성으로 남는다. workspace `each`도 맞다 | consistent |
| B2 | 다섯 테스트: book auto(`receipt.steps approve 'auto'`는 gateStep 결과), chapter만 바꾸면 scene digest는 그대로 → `done`(commit-step), scene critic off → `model:extract`, recheck digest는 `byLevel.scene`, `pendingRechecks` 모양 `{nodeId, checks}`. HEAD의 `emptyTreeCopy`·`editYaml`·`rechecksOf`가 있다 | consistent |
| B3 | 새 코드가 없다. 다섯 테스트의 기대 코드가 A1/A2/B1 오류 코드와 맞는다(`draft`는 facts→extract→draft로 잠긴다) | consistent (항목 6 중복) |
| C1 | 새 테스트 세 개는 코드와 맞는다: stale → 저장 → RUN_NOT_AWAITING_MODEL. 재계획 때 `retries = {}` → 재검사 시도가 1부터. `digestPayload`는 구조 분해로 빠져 호스트에 가지 않는다. answer-binding 두 테스트 수정은 이유가 적혀 있다. **다만 1절의 기존 테스트 두 개가 빠졌다** | **conflict** |
| C2 | 네 테스트: open run → STRUCTURE_RUN_OPEN `{runId,nodeId}`. outline 모양. `__proto__`/`constructor`는 `Object.hasOwn`으로 거부. wrap 뒤 c1 derive 커밋 → `structure`. s3 추가 → `structure` 이유, recheck 대상 아님. `validateReceipt`→STRUCTURE_INVALID. 루트에 scene을 두는 것은 HEAD `structure.test.js:9`가 이미 쓰는 경로다 | consistent (항목 8) |
| C3 | 아홉 테스트를 오류 순서까지 따라가 봤다(unknown keys: top→pipelines→checks, MISSING instruction → CHECKER_UNKNOWN). `FINDING_SEVERITIES`·`STEP_MODES`·`MAX_LOOP`는 HEAD에서 export된다. `YAML.parse`는 깨진 입력에 던진다. macOS tmp realpath도 양쪽 모두 realpath라 맞는다 | consistent |
| C4 | serial-2level work.yaml은 `packs:[novel]`, `checkSets:[novel.basic, novel.serial]` → 검사 여섯 개. 프리셋 키 순서가 맞다. ep-004 등장은 `scope.js:25`의 node.entities에서 온다(추출 답과 무관 — fake 팩과 같은 경로). no-model-calls 수정은 이유가 적혀 있다 | consistent |
| C5 | `ENTITIES_DIR`·`TREE_DIR`·`CHECKS_DIR`·`writeFileAtomic`이 HEAD에서 export된다. 쓰기 전에 거부하는 네 가지 경우 → `stat(root)` ENOENT | consistent |
| C6 | `validateInput`의 경로·메시지 순서가 테스트와 맞는다. `usagesOf`→`surfaceId`, `eventsFor`→`{eventId,nodeId,kind}`, seed-2=doyun ep-002 state. `describeCheckSets`의 `selected`, `validateUserCheckDraft`의 `{ok,errors}`, `USER_CHECK_STAGE_INVALID`. resume `{}` → C1의 stale 검사를 지나 ANSWERS_INCOMPLETE | consistent (항목 4·5) |
| C7 | 경고 필터 테스트(개수 3)가 코드와 맞다. SDK 1.30.1은 실제로 있다(npm view). zod는 peer(optional:false)라 npm이 자동으로 설치한다 — 전역 제약 L17과 맞다. bin은 동적 import로 필터 뒤에 읽고, find.js의 `node:sqlite` 정적 import를 막는다 | consistent (위험: SDK 타입과 `checkJs` 조합의 TS2589 가능성) |
| C8 | 프론트매터 정규식이 SKILL.md와 맞다. `.gitattributes`가 `eol=lf`다. 금지어(`commitNode`, `createRunner`, `core/run/`)가 문서에 없다. `skill/README.md` 교체가 L3786 정규식과 맞다 | consistent |
| C9 | 레이블 목록, `waiting ['arc-1']`, approval 기록 type `'approval'`(decisions.js:46), `DECISIONS_LEDGER` export. 두 번째 테스트는 C4 test 3과 같은 경로다 | consistent |

## 3. 리뷰어가 결함으로 볼 것

- **기존 테스트를 목록에 없이 깨뜨림**(전역 제약 L26 위반): 1절의 C1 두 건.
- **로직 중복**
  - `validate.js`의 `requiredBy` BFS와 `stageOf`(L297-310)가 `define.js`의 `coreLockedIds`/`stageOfStep`(L256-272)과 같은 일을 한다. `resolve.js`에도 `stageOf`가 따로 있다.
  - `generate.js`/`children.js`의 `raw` + `request` 블록이 똑같고(L1760-1763 = L1773-1776), 요청마다 `basePayload`를 두 번 만든다.
  - 자식 목록 비교가 `assertStructureMatches`와 `structureReason`에 따로 있다.
- **죽은 코드**: C1 뒤 `packPayload`를 부르는 곳이 없다.
- **파일 300줄**: 넘는 파일이 없다. 가장 큰 것도 commit-locks.js 약 170, yaml-schema.js 약 170, runner.js 약 165줄이다.
- **아무것도 확인하지 않는 테스트**: 없다. C6 `only server/ imports the MCP SDK`는 C6 시점에는 SDK가 없어 쉽게 통과하지만, C7 뒤에는 의미가 생긴다.
- **기존 assert 수정의 이유**: A2(L619-627), C1(L1801-1820), C4(L2613), C7(L3631) 모두 이유가 적혀 있다.
- **테스트 제목과 내용 불일치**: C6 L3139 제목은 "nothing else"지만 확인하는 것은 root가 required인지뿐이다.

## 4. 계획의 가정 ↔ 실제 HEAD

| 가정 | 실제 | 판정 |
|---|---|---|
| HEAD `15d2013`(L31) | HEAD `2e8986c`(계획 문서만 더함). 코드는 같다 | OK |
| `resolvePipeline(base, overrides)`, `markLocked`가 팩 표시로 씨앗을 잡음(L52) | define.js:35-46, 122-137 | 맞음 |
| `resolvePipelines({primary, overrides, checks, includeAllHardChecks})` → `{leaf,branch,errors}`(L53) | resolve.js:16 | 맞음 |
| `resolvePacks`가 `Object.assign`으로 조용히 덮음(L54) | registry.js:21 | 맞음 |
| `resolveChecks`의 `known` Map(L55), 수정 대상 첫 두 줄(L600-604) | check-set.js:43-44에 글자 그대로 있음 | 맞음 |
| `openWorkspace` 반환(L56) | workspace.js:31-35 | 맞음 |
| `createRunner` → `{run,resume,decide}` + `withWorkLock`(L57) | runner.js:31, 146-148 | 맞음 |
| `checkPlanFor(ctx, nodeKind)`(B2 L1200 전제) | sync.js:6 | 맞음 |
| `requestModel`·`takeAnswer`·`requestDigest`(L59) | steps/common.js | 맞음 |
| `packPayload`가 `prompt()`를 입힘(L60) | payload.js:33-36 | 맞음 |
| revise.js의 바꿀 세 곳(L1799) | revise.js:15, 26-28, 42 | 맞음 |
| `stale.js:34` 줄(L1446) | stale.js:34 글자 그대로 | 맞음 |
| `check-set.test.js:102-106`(L428) | 102-106 | 맞음 |
| answer-binding 첫 두 테스트의 "마지막 네/세 줄"(L1805, L1814) | 첫 테스트는 `asked` 뒤 6줄(editYaml 포함). 교체 블록이 editYaml을 다시 적으므로 결과는 같다. "네 줄"이라는 표현만 부정확하다 | OK (표현) |
| `buildReceipt`의 `order: nodeOrder(...)` 줄(L1991) | receipt-builder.js:34 | 맞음 |
| `pushOrderProblems`·`validateReceipt`(L1997) | receipts.js:64, 87 | 맞음 |
| `stale-checks.js`에 import가 없음(C2가 `canonicalJson` import 추가) | 파일이 주석으로 시작하고 import가 없다 | 맞음 |
| `addNode`/`moveNode`/`wrapNodes` 인자 모양(C2, C6 STRUCTURE_ARGS) | ops.js:47, 65, 96 | 맞음 |
| `preorder(tree)` export | tree.js:103 | 맞음 |
| `usagesOf`/`eventsFor`/`openIndex`/`rebuildIndex(root)` | index/query.js:8,22,30; rebuild.js:22 | 맞음 |
| `describeCheckSets(registry, config)`, `recommendCheckSets({registry, config})`, `validateUserCheckDraft(draft, {stages})` | recommend.js:23,31; user-check-draft.js:62 | 맞음 |
| `test/support` 도우미(L66) | `copyFixture, useFakePack, emptyTreeCopy, seedEvents, tempDir, fakePacks`(fixtures.js), `makeReceipt, recordDecisions`, `committedWith, editYaml, rechecksOf`, `createFakeHost, driveToEnd, label` 모두 있음 | 맞음 |
| `no-model-calls.test.js`의 `walk`/`stripComments`/`FORBIDDEN`(C4 L2615) | 모두 있음 | 맞음 |
| `.superpowers/` 커밋 안 함 | `.superpowers/sdd/.gitignore`가 `*` | 맞음 |
| 테스트 354개(L46) | 이번 점검에서 돌리지 않음 | 미확인 |
