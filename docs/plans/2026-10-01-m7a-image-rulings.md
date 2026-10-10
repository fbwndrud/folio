# M7a 그림 — 실행 기록과 판정

계획: `docs/plans/2026-10-01-m7-image-import.md`. 완료 범위는 A1~A8이며 M7b는 시작하지 않았다.

## 사용자 결정과 완료

중단 전 사용자의 “묻지 말고 끝까지” 지시로 계획의 추천 결정 19건이 승인되었다. Codex는 이어서 작업하라는 지시에 따라 기존 변경과 미완료 검토를 보존하고 후속 작업을 완료했다. 구현 범위 `c8223aa..e7ccff5`, 최종 확인 2026-10-02. Node v24.19.0에서 lint·typecheck·테스트 1136/1136, 그림 집중 검사 62/62, MCP 수용 2/2가 통과했다. 독립 최종 검토의 중요 지적 3건을 단일 수정 파동으로 해결하고 재검토 승인을 받았다.

## 주요 동작과 호환 비용

설명서·그림 hash와 추가만 되는 그림 결과·승인·영수증을 대조한다. 검토는 sameHost:true, independent:false이며 참고 지적으로 자동 재생성하지 않는다. 선택되거나 includeAllHardChecks로 포함된 hard 그림 검사는 현재 지원하지 않으므로 IMAGE_HARD_CHECK_UNSUPPORTED로 명시 거부한다. 일반 참고 검토를 끄거나 미선택 non-strict hard 검사를 두는 동작은 유지된다.

사용자 precheck는 실제 설명서 글을 검사하며 stage/tier를 검증한다. image-precheck/image-review는 그림 전용 이름이므로 같은 이름의 사용자 노드 단계는 재명명해야 한다. 정적 내부 실행 폴더·파일 링크는 거부한다. 검사 후 동시 디렉터리 교체 경합과 Windows 동일 보장은 남은 범위이며 절대 경로 격리를 주장하지 않는다.

승인된 결정 10에 따라 active 상태 중단은 skip만 받는다. committing 상태의 같은 영수증·바이트 복구와 구분해야 하며, 모든 crash 시점의 완전 재개를 보장하지 않는다. 기존 비차단 항목은 최종 검토 표에 전수 보존했다. main 병합 전이다.

## 다른 레인에 알릴 것

- 사용자가 지정한 판정 파일 이름에 따라 이 파일을 쓴다. M7b는 계획의 다른 파일명 대신 여기에 기록을 덧붙이거나 별도 판정 파일을 만든다.
- core/run/runner.js는 수정하지 않았다. 그림 실행은 core/image/*에 있다. N6의 판본 실행기 분리와 합칠 때 공통 features·팩·도구·스킬 목록 순서는 M6b→M7a→N6로 맞춘다.
- 참고 그림 metadata의 reference 위치 불일치와 YAML 확장자 참고 허용, 손상 JSON 목록 처리 등은 비차단 후속 항목이며 해결했다고 표시하지 않는다.

## 전체 실행 기록

```text
# SDD ledger — plan: docs/plans/2026-10-01-m7-image-import.md

Scope: Part A only (A1–A8). Part B (M7b) is out of scope for this session.
Worktree /path/to/folio-worktrees/m7, branch feat/m7a-image, start HEAD a95646e (main c8223aa).
Spec: no separate spec file; the plan's "설계 요약" + "결정" table are the design (plan header says so). Rulings below argue from those.
User approval: the user said "don't ask, go to the end" — all 19 "추천 채택(사용자 확인 필요)" decisions are approved (record in plan 현재 상태 with the progress line).
Tools: plan-blocks.py (write/apply/compare plan blocks), brief.py (task briefs with Global Constraints; A3/A5/A6 also carry the attack list).

## Preflight scan

Mechanical: copied HEAD to scratchpad/m7dry, applied every A1–A8 whole-file block and diff block in task order: all diffs apply, all whole files compare SAME after their own task, every whole-file block's line count equals the plan's "(N줄)". Tests were not run in the dry copy (plan's own trial run: 1069→1094).

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| A1 → A5, A7, A8 | FEATURES.images/imageReferences/imageReview (+ parents) → context.js digest, FEATURE_DISABLED in tool, acceptance `features: { images: false }` | consistent |
| A2 → A4, A5 | readBrief/briefHash/briefText/referencesFor/MAX_REFERENCES → checkers context + steps | consistent (dry apply) |
| A3 → A5, A6, A8 | readHostImage/MAX_IMAGE_BYTES, writeAssetOnce/ASSET_WRITE_NAME/assertAssetsDirSafe; test/support/images.js PNG_A/PNG_B/placeImage → image-work.js, commit.js, m7a test | consistent |
| A4 → A5 | IMAGE_STAGES, IMAGE_PACK, image pack sets → steps.js precheck/review | consistent |
| A5 → A6 | core/image/runner.js + steps.js whole files → A6 diffs patch both | A6 diffs apply on A5 blocks; A5 compare must run before A6 (after A6 these two files intentionally differ from the A5 blocks) |
| A5/A6 → A7 | createImageRunner(start/resume/decide/pending) → server/tools/image.js | consistent |
| all → A8 | acceptance over MCP stdio | consistent |
| A1 vs M6b lane | features.js tail: plan appends after linkScope; M6b appends viewerExport | per controller instruction implement plan diff as-is; reorder is merge-time work of whichever lane merges second |
| A8 vs user instruction | plan: rulings file docs/plans/2026-10-01-m7-image-import-rulings.md created in A8 + progress line in A8 commit | Ruling R1 below |
| A1 self | changes N4 assert keys.slice(-2) → links-relative slice | plan-mandated; it asserts the same two keys at the same relative place (not a weakening); reviewer may flag → rule in loop |
| A2 self | tests vs brief.js/references.js | consistent |
| A3 self | tests vs intake.js + assets.js diff | consistent |
| A4 self | 4 pack-list tests edited at the end + new pack | consistent; novel-3level fixture already lists [novel, image] |
| A5 self | 6 core files + support + test | consistent; steps.js 170 lines (<300) |
| A6 self | receipt.js/commit.js + diffs | consistent |
| A7 self | tool + definitions/handlers diffs + list tests (BANNED end, 11→12) | consistent |
| A8 self | single test file | consistent |
| runner.js | no task touches core/run/runner.js (A5 imports core/run/work-lock.js, core/run/steps/common.js, core/run/answers.js only) | consistent |

Ruling: R1 — the rulings doc goes to docs/plans/2026-10-01-m7a-image-rulings.md (user's path, not the plan's 2026-10-01-m7-image-import-rulings.md), and the controller writes it plus the plan's "진행" line (with the user-approval note) in one final docs commit after the final review; the A8 implementer commits only test/acceptance/m7a.test.js — the user's instruction names the path and wants the progress line to carry the approval, and progress ranges are only known at the end — cost if wrong: M7b's plan steps refer to the plan's filename; M7b must append to the m7a file or start its own (noted in the doc's "다른 레인에 알릴 것").

## Tasks
Baseline: npm run check 1069/1069 at a95646e.
Task A1: dispatched (base a95646e)
Task A1: implemented 271dfdc (1070/1070; trailer ok; 3 diffs reverse-apply = exact); review dispatched (sonnet)
Task A2: dispatched (base 271dfdc), pipelined with A1 review — disjoint files
Task A1: review ⚠️ forward refs (folio_image, core/image/context.js imageSpecDigest) — resolved: A5 creates context.js imageSpecDigest, A7 creates folio_image
Task A1: minor (deferred): new M7a test placed after the fakePresetPacks() helper at file end (plan-mandated placement)
Task A1: minor (deferred): features.js comment describes skip/FEATURE_DISABLED behaviour implemented only in later tasks (A5/A7)
Task A1: complete (commits a95646e..271dfdc, review clean)
Task A2: implemented a6ca80d (1072/1072; compare SAME; trailer ok); review dispatched (sonnet)
Task A3: dispatched (base a6ca80d), pipelined with A2 review
Task A2: review ⚠️ trailer/1072 — resolved by controller (git log -1 --format=%B a6ca80d exact; report shows 1072/1072)
Task A2: minor (deferred): references.js readability relies on openWork warnings; readAssets(root,{hashFiles:false}) emits none → missing files could pass as references
Task A2: minor (deferred): references.js passes asset meta `file` through unchecked (../, non-image ext) — host-facing path safety belongs to the consumer (A5 requests; flagged to A5 reviewer)
Task A2: minor (deferred): brief.js isLine does not trim; ' x' vs 'x' give different briefHash
Task A2: minor (deferred): test gaps — default limit 3, continuity >2000, dialogue speaker null, briefText with mustNotShow/continuity
Task A2: complete (commits 271dfdc..a6ca80d, review clean)
Task A3: implemented 2209c3d (1074/1074; compare SAME; diff exact; trailer ok); attack review dispatched (opus)
Task A4: dispatched (base 2209c3d), pipelined with A3 review — disjoint files
Task A4: implemented da09184 (1077/1077; compare SAME; 7 diffs exact; trailer ok); review dispatched (sonnet)
Task A5: dispatched (base da09184), pipelined with A3/A4 reviews
Task A4: review ✅ Approved, no Critical/Important. ⚠️ instruction loading / forward refs — resolved (test asserts review.md text; folio_image is A7)
Task A4: minor (deferred): resolve.js:78 image-stage `continue` also skips LOCKED_CHECK_UNGUARDED/HARD_CHECK_OVERRIDE for image-stage checks (plan-mandated; latent — packs cannot make locked checks, all image checks advisory) — final review to triage
Task A4: minor (deferred): a work.yaml user check with stage image-precheck/image-review is now silently accepted and never runs (was CHECK_STAGE_MISSING)
Task A4: minor (deferred): no direct test pins the resolve.js boundary (non-image unknown stage still CHECK_STAGE_MISSING)
Task A4: complete (commits 2209c3d..da09184, review clean)
Task A5: implemented 6014138 (1084/1084; compare SAME; trailer ok; core/run/runner.js, package.json, lock untouched since a95646e); attack review dispatched (opus)
Task A3: review (opus attack): Needs fixes — C1 TOCTOU assets dir swap → write outside root under concurrent in-work writer (239/10549 in race repro); I2 failed writeFile leaves .tmp in assets/ (contradicts the code comment); I3 intake reads past the fstat size (memory, needs concurrent grower); I4 readHostImage/assertAssetsDirSafe duplicate N2's readLocalFile/assertSourcesDirSafe (plan-mandated)
Task A3: Ruling: C1 (TOCTOU between lstat of assets/ and the path-based write) is parked, not fixed — same accepted residual as N2 B3 sources/ (n2 rulings: "TOCTOU ... needs in-work attacker; names Folio-chosen; wx never overwrites"); Node has no openat/linkat so a fix only narrows the window; link() never overwrites and names are Folio-chosen — cost if wrong: a concurrent process already able to write inside the work root can make the engine create (never overwrite) one asset-named file in another directory it points assets/ at
Task A3: Ruling: I4 (duplicated safe-read / safe-dir blocks) parked — extracting shared helpers means editing N2-owned core/sources/add.js and core/store/sources.js outside this lane while other lanes run; plan-mandated copies — cost if wrong: a future fix to one copy must be repeated in the other (noted for the final review)
Task A3: Ruling: I2 and I3 enter the fix loop, scoped to core/store/assets.js and core/image/intake.js only (N2's readLocalFile keeps its unbounded read; out of lane) — cost if wrong: none beyond a small deviation from the plan blocks (compare for those two files becomes DIFF by ruling)
Task A3: minor (deferred): ASSET_WRITE_NAME has no length cap (250 chars → raw ENAMETOOLONG)
Task A3: minor (deferred): writeAssetOnce mkdir recursive creates a missing root chain
Task A3: minor (deferred): format detection is magic bytes only (PNG header + text accepted as .png)
Task A3: minor (deferred): imageFormatOf throws TypeError on non-Buffer input
Task A3: minor (deferred): tests miss FIFO, NUL, same-name dir, dangling assets link (probes show all refused)
Task A3: ⚠️ ASSET_WRITE_NAME allows .svg while readHostImage refuses SVG — A6 commit must take the extension from readHostImage; carried to the A6 reviewer. ⚠️ Windows O_NOFOLLOW ?? 0 — unverified (POSIX-only tests), reported as not verified
Task A3: fix round 1/5 (1 addressed, 1 open — I2 tmp cleanup ADDRESSED; I3 bounded read NOT ADDRESSED: new loop aliases one buffer → every image > 64 KiB corrupted/rejected (Critical regression); commits 6014138..bd6be32)
Task A3: fix round 2 dispatched (resume m7a-impl-A3): single preallocated buffer, read to EOF, tests at 65537 / MAX / MAX+1 with content equality
Task A5: review (opus attack): Needs fixes — C1 reference picture paths: asset meta `file` (../x, ../work.yaml) and linked asset files become absolute host paths outside assets/ and the work root (requests.js referenceMaterial ← references.js referencesFor); I2 run left `active` can only be skipped (plan-mandated)
Task A5: Ruling: I2 (run stranded in `active` accepts only skip) parked — decision 10 (user-approved) says a run left active after a failed commit lock accepts only `skip`; re-driving `active` from resume would change that decision and collide with A6's runner diff — cost if wrong: a crash between a save and the next drive (or IMAGE_STAGED_CONFLICT) makes the author skip and redraw an approved picture
Task A5: Ruling: C1 enters the fix loop — fix in core/image/references.js (name filter with ASSET_WRITE_NAME, pure) plus an lstat filter (regular file, not a link) applied where steps.js computes run.references; A2's file changes too (compare A2/A5 DIFF by ruling) — cost if wrong: none (fail closed: a dropped reference only yields REFERENCE_MISSING)
Task A5: minor (deferred): config change escapes image_blocked (syncSpec resets cursor; retries stay 3)
Task A5: minor (deferred): planted links under .folio/image-runs redirect run/staged writes outside root (wx, no overwrite; same as node run store)
Task A5: minor (deferred): unreadable review answer → check status error, review 'passed', canApprove true; question does not say the review never happened (matches node check step)
Task A5: minor (deferred): corrupt open-run JSON is skipped by store.list → one-run rule bypassed
Task A5: minor (deferred): precheck not re-run when node text changes after it (review re-asks)
Task A5: minor (deferred): no test asserts the image review reviewer label or stale/unknown-answer refusal for image runs
Task A5: minor (deferred): run-store.js:61 stage() comment describes a crash re-run no entry point reaches (see I2 ruling)
Task A5: ⚠️ commit re-hash / ledger cross-check / approve at cursor 5 → A6 owns; carried to the A6 attack reviewer
Task A3: fix round 2 committed e31b6ba (1088/1088); re-review dispatched (sonnet)
Task A5: fix round 1 dispatched (resume m7a-impl-A5) for C1
Task A3: fix round 2/5 (3 addressed, 0 open — bounded single-buffer read to EOF; 65537/MAX/MAX+1 content tests; assert.rejects; commits bd6be32..e31b6ba)
Task A3: minor (deferred): MAX+1 test only hits the fstat precheck; the grow-after-fstat in-loop bound has no regression test (probe-verified)
Task A3: minor (deferred): readHostImage allocUnsafe(MAX+1) per read (20 MiB reserve, pages untouched)
Task A3: complete (commits a6ca80d..e31b6ba, review clean; C1, I4 parked by ruling) — compare A3: core/image/intake.js, core/store/assets.js, test/image/intake-assets.test.js DIFF by ruling
Task A5: fix round 1 committed 5e7f8ae (1090/1090); scoped re-review dispatched (opus)
Task A6: dispatched (base 5e7f8ae), pipelined with A5 re-review; expected 1096 (plan 1090 + 6 review-fix tests)

## Codex recovery — 2026-10-01
User instructed continuing all three interrupted lanes. Existing worktree changes are preserved. Pending review gates resume before downstream tasks. New original Codex work uses truthful authorship; plan-generated Claude code retains its contribution trailer. Main integration will be prepared after lane validation.

Task A5: scoped re-review C1 remains open: assets/ directory symlink bypasses final-file lstat. Ruling: require a plain assets directory and strengthen escape fixture with a real file — no concurrent attacker is required, so the parked TOCTOU ruling does not cover this — cost if wrong: intentionally linked assets folders lose host references, consistent with safe assets policy. Fix round 2 pending.
Task A5: fix round 2/5 (C1 fully addressed, zero regressions; 5e7f8ae..319d559). Directory symlink blocked, path fixture meaningful; focused10/10, full1097/1097 includes pending A6.
Task A5: complete (commits da09184..319d559, review clean; interrupted active-state limitation remains parked by original ruling).
Task A6: recovered draft ea20911, same source full1097, focused6/6 + image24/24; RED history unavailable, truthfully recorded. Independent attack review requires three fixes. Ruling: rehash actual brief on new/resumed commit, mandate generation/approval receipt hashes, and reject empty/blank skip reasons/sources — stored-string comparisons violate hash/receipt locks — cost if wrong: previously malformed receipts and edited interrupted runs reject instead of silently committing. Fix round1 pending.
Task A6: fix round1/5 (all three findings addressed, no regressions; ea20911..c94e5a1). Independent spec+quality approved; actual persisted receipt resume tested; focused8/8/full1099.
Task A6: complete (commits319d559..c94e5a1, review clean; interrupted RED unavailable documented).
Task A7: implemented485f25f viaNode24; focused16/server63/full1101pass, taskreview spec+qualityapproved, nofindings.
Task A7: complete (commitsc94e5a1..485f25f, review clean).
Task A8:389eef7 acceptance2/full1103 Node24. Independent spec+quality approved; receipt-order/sameHost locks verified by existing image commit tests, no missing end-to-end behavior.
Task A8: complete (commits485f25f..389eef7, review clean). M7a finalbranch review remains; M7b excluded.
Final review: Critical0/Important3. Ruling: enforce image hard inclusion and stage/tier/material validation beyond unconditional continue — registered extension/user checks must be real and hard protection toggle-independent — cost if wrong: invalid image-stage configurations reject earlier; ordinary advisory review-off preserved.
Ruling: reject static .folio/image-runs and run-folder links for reads/writes; retract old wx/no-overwrite claim for JSON save because atomic rename overwrites — static path escape needs no concurrent attacker — cost if wrong: intentionally linked internal run folders reject; concurrent directory replacement remains documented residual. Single final wave dispatched next.
Ruling: selected or includeAllHardChecks-included image hard checks explicitly reject with IMAGE_HARD_CHECK_UNSUPPORTED, rather than implement unsupported hard image runners — fail closed meets hard guarantee; unselected non-strict checks unchanged — cost if wrong: a configured hard image extension needs changing severity/config before workspace opens; ordinary advisory image review off still works. Supported precheck deterministic/review model tiers validated, userprecheck sees actual briefText.
Ruling: reserve custom node step IDs image-precheck/image-review in CUSTOM_STEP_CONFLICT — derived checks otherwise bypass earlier placement validation — cost if wrong: authors with these colliding custom step IDs must rename them; ordinary custom steps unchanged.
Final fix wave:389eef7..e7ccff5, independent scoped re-review I1/I2/I3 ADDRESSED, spec+quality approved, no new requiredfix. Focused62/full1136 Node24. M7a complete, M7b notstarted.
```

## 최종 검토 원문

# M7a 최종 독립 검토 — c8223aa..389eef7

판정: **수정 필요 — Critical 0, Important 3**. 계획 코드와 일치하더라도 아래 동작은 상위 잠금·경로·검사 보장과 충돌한다. M7b는 검토하지 않았다. 소스·테스트·브랜치를 수정하지 않았으며 이 보고서와 재현 스크립트만 비추적 작업 기록에 썼다.

## 근거와 범위

- AGENTS.md, 계획의 M7a 설계·결정·제약·A1–A8, progress.md의 보류 사항 전부, task-A8-report.md, review-c8223aa..389eef7.diff 패키지와 해당 현재 소스를 대조했다.
- A8의 Node 24 전체 1103/1103, acceptance 2/2 기록과 기존 영수증·경로·재개 테스트를 확인했다. 같은 검사를 다시 실행하지 않았다.
- 구체적인 새 의심 세 가지에만 Node 24로 합성 재현을 실행했다. 재현 소스: `final-probes.mjs`(이 문서와 같은 폴더). 실행 명령: `/path/to/node-runtime/bin/node .superpowers/sdd/2026-10-01-m7-image-import/final-probes.mjs`.
- 재현은 합성 fixture 복사본·합성 PNG·임시 외부 디렉터리만 사용했고 모두 지웠다. 실제 vibelore 작품에는 접근하지 않았다.

## Critical

없음. 아래 중요 항목은 내장 기본 팩의 정상 흐름에서 즉시 모두 발생하는 것은 아니지만, 유효한 확장 검사 또는 정적 경로 링크에서 보장이 깨진다.

## Important

### I1. imageReview 토글이 includeAllHardChecks의 hard 검사까지 없앤다

- 위치: `core/image/steps.js:146–149`, 관련 `core/pipeline/resolve.js:64–66`.
- 합성 `guard` 팩에 `guard.review`, `tier: model`, `stage: image-review`, `severity: hard`를 등록하고 작품에 `includeAllHardChecks: true`, `imageReview: false`를 설정했다. 정상 `resolvePacks`/`openWorkspace` 검증을 통과한 뒤 설명서·생성만 요청하고 승인 후 `done`이 됐다. 영수증의 review는 skipped, hard 검사의 결과는 없었다.
- 출력: `hard skip {"status":"done","review":{"id":"review","kind":"check","status":"skipped",...},"purposes":["image_brief","image_generate"]}`.
- 기존 코어는 YAML 팩의 hard 등급을 허용한다. 내장 image 검사가 advisory라는 사실이나 팩이 locked를 선언할 수 없다는 사실은 다른 팩의 hard image-stage 검사를 배제하지 않는다. 실제 locked 코어 검사는 facts에 고정되며 사용자 override로 stage를 옮길 수 없으므로, 이 코어 검사가 우회된다는 뜻은 아니다. 그 locked 경로는 안전하다.
- **계획 유래 충돌:** 그림 stage의 무조건 continue와 review 전체 skip이 결합해 `includeAllHardChecks`의 명시 보장을 깨뜨린다. A4의 보류 사유 중 “모든 image 검사는 advisory”는 내장 팩에만 맞는다.
- 수정: 지원하지 않을 hard 그림 검사를 명시적으로 거부하거나, 설정 검증/실행 단계에서 강제 포함된 hard 검사의 skip을 막아야 한다. 선택되지 않은 일반 hard 검사까지 새로 켜야 한다는 요구는 아니다. 정상 soft 검토 끄기 동작은 그대로 허용 가능하다.

### I2. 허용된 사용자 block 그림 검사가 빈 텍스트에서 통과한다

- 위치: `core/image/steps.js:94–95`, 관련 `core/pipeline/resolve.js:64–66`.
- `checks.user.pre: { words: ['문'], stage: image-precheck, severity: block }`를 넣었다. 합성 설명서에는 '문'이 실제로 있으나 image_precheck 질문 없이 image_approval로 갔다. 저장 결과: `{"checkId":"user.pre","status":"passed","findings":[]}`.
- 사용자 pattern 검사기는 `ctx.draft`를 읽는다. 그림 실행은 `brief`, `nodeText`만 넣고 `draft`를 빼므로 빈 문자열을 검사한다. 이는 “never runs”라는 이전 표현보다 정확히는 “실행됐다고 남지만 실제 검사 재료가 없음”이다.
- placement의 continue는 tier 검사도 생략한다. model 검사를 image-precheck에 두거나 deterministic 검사를 image-review에 두는 설정도 잘못된 실행기로 흘러간다. 검토자는 판정 없는 dummy 실행을 정상 검사로 간주할 수 없다.
- **계획 유래 충돌:** 사용자 검사를 허용하면서 효력이 사라지는 경로다. 지원할 경우 stage별 tier와 검사 대상 텍스트를 정의해 전달하고, 미지원이면 설정 단계에서 명시 거부해야 한다. 조용한 통과는 부적절하다.

### I3. 정적 image-runs 디렉터리 링크가 외부 파일 덮어쓰기를 허용한다

- 위치: `core/image/run-store.js:24–27,45`, 관련 `core/util/fs.js:6–10`.
- `.folio/image-runs`를 작품 밖 임시 폴더에 미리 연결하고 그 폴더에 `imgrun-probe.json` 원본을 둔 뒤, 공개된 newId 주입으로 같은 id의 start를 실행했다. `needs_model`을 반환하면서 외부 JSON을 덮어썼다. 출력: `static symlink overwrote needs_model true`.
- 결정적 id는 충돌을 재현하기 위한 장치다. 기본 랜덤 id도 링크 밖 새 파일을 쓰며, 알려진 기존 실행을 resume/decide로 저장하는 경로에는 이미 파일 이름이 정해져 있다. 동시 교체 공격은 필요 없다.
- `stage()`의 wx는 최종 그림 파일에만 적용된다. `save()`는 writeFileAtomic의 rename으로 목적지를 교체한다. O_NOFOLLOW도 파일의 상위 디렉터리 링크를 차단하지 않는다.
- **기존 보류 판정의 사실 오류:** A5 minor의 “wx, no overwrite; same as node run store”는 run JSON 저장에는 성립하지 않는다. A3의 동시 assets 폴더 교체 잔여 위험과 구분해서 수정해야 한다.
- 수정: image-runs 및 run 하위 폴더 등 사용 경로의 정적 링크를 거부한 뒤 읽기·쓰기해야 한다. 그 뒤 남는 동시 경로 교체 위험은 별도의 기존 TOCTOU 수용 범위로 정확히 기록한다. 노드 실행기를 바꿀 필요는 없다.

## Minor / 보류 항목 전수 판정

| 출처·항목 | 최종 판정 |
|---|---|
| A1 helper 뒤 새 테스트 | 배치 취향. 계획 지시 그대로이며 수정 불필요. |
| A1 features 주석의 미래 구현 참조 | A5/A7 완료로 해소. |
| A1 목록 상대 위치 assert | 이전 links/linkScope 순서 검증 유지. 추가 전용 목록과 모순 없음. |
| A2 hashFiles:false 때 missing reference 경고 없음 | 순수 referencesFor 단독 호출 제한은 남지만 실행 경로에서 lstat 필터를 거쳐 없는 파일은 제외. 현재 실행의 차단 결함은 해소. |
| A2 ../ 경로·비그림 확장자 | ../와 정적 assets/파일 링크는 A5 수정으로 차단. 다만 재사용한 ASSET_WRITE_NAME은 yaml도 허용하므로 YAML을 기준 그림으로 제시할 수 있음. 참고 그림 확장자 전용 필터가 더 정확함(Minor). |
| A2 brief 문자열 공백 차이 | 원문 보존·정확 hash와 양립. trim canonicalization 요구 없음. |
| A2 limit=3, continuity 길이, null speaker, briefText 테스트 공백 | 남는 집중 테스트 공백. 코드 경계가 명확하고 직접 결함 증거 없어 Minor. |
| A3 C1 동시 assets/ 교체 | 기존 수용 유지. 정적 assets 링크는 거부하며 경합에는 작품 내부 쓰기 권한 필요. link가 목적 파일을 덮지 않는다는 설명은 assets 쓰기에 한정해 맞음. I3에는 적용 불가. |
| A3 I4 안전 읽기·폴더 검사 중복 | 레인 경계상 공유화 보류 유지. 유지보수 비용을 기록하되 N2를 이번에 수정할 필요 없음. |
| A3 긴 ASSET_WRITE_NAME | API에서 긴 이름은 raw ENAMETOOLONG 가능. runner assetId 100자 제한으로 정상 생성에는 해당 안 됨. Minor. |
| A3 mkdir가 없는 root 부모까지 생성 | 저수준 API 동작. runner는 먼저 작품을 열므로 정상 도구는 없는 작품을 생성하지 않음. Minor. |
| A3 magic bytes만 판정 | 설계가 명시한 형식 탐지. 완전 디코딩 보장은 없음. 허위 “유효 그림” 보장으로 확장하지 말 것. |
| A3 imageFormatOf 비Buffer TypeError | 내부 타입 전제. readHostImage가 Buffer를 전달. Minor API 방어 문제. |
| A3 FIFO/NUL/동명 폴더/dangling link 테스트 공백 | 기존 탐색에서 거부 확인된 것으로 기록돼 있음. 코드의 nofollow/nonblock/fstat와 부합. 반복 검사 불필요. |
| A3 SVG 쓰기 이름과 intake 거부 | 생성 확장자는 intake 결과에서 정해지고 staged 이름도 raster만 허용. 정상 생성으로 SVG가 커밋되는 경로 없음. |
| A3 Windows O_NOFOLLOW | POSIX만 검증됨. Windows 안전성을 새로 보장하지 않음. 플랫폼 한계 유지. |
| A3 MAX+1 fstat 뒤 성장 회귀 테스트 없음 | bounded read가 MAX+1에서 중단하며 기존 probe 검증 기록 있음. 추가 회귀 케이스는 Minor. |
| A3 20MiB allocUnsafe 예약 | 성능·메모리 선택. 상한이 있으며 읽힌 부분만 복사. lock 결함 아님. |
| A4 image-stage continue의 hard/locked 검사 생략 | 실제 core locked 검사는 facts에 고정. 외부 hard 팩과 review skip은 I1로 승격. |
| A4 사용자 그림 stage 검사 효력 | 정확한 재현은 I2. model review 사용자 검사는 실제 요청에 포함될 수 있어 “모든 사용자 그림 검사는 never runs”는 과장. |
| A4 비그림 unknown stage 직접 테스트 없음 | continue 조건은 IMAGE_STAGE_NAMES만. 나머지는 CHECK_STAGE_MISSING 유지. Minor 테스트 공백. |
| A5 active 재개 불가 / 결정 10 | 승인된 결정 10과 기존 보류 판정 유지. active는 skip만 받으며 잠금 실패를 재개로 우회하지 않음. 다만 일반 crash도 active로 남아 재생성이 필요할 수 있음. |
| A5 run-store stage 주석의 crash 재실행 | 저수준 stage의 멱등성 설명은 맞지만 public resume(active)는 불가. 주석·문서는 이 차이를 분명히 하면 좋음. |
| A5 설정 변경으로 image_blocked 탈출 | retries가 남고 후속 답 검증·승인·커밋 잠금은 유지. “skip만” 상태 설명에는 예외가 생기는 UX 제한. Minor, 무제한 성공 우회는 아님. |
| A5 image-runs 정적 링크 | I3로 승격. 기존 no-overwrite 근거 철회 필요. |
| A5 읽지 못한 review 답의 상위 passed | advisory 검사의 개별 status:error는 보존되지만 질문에는 미검토가 안 보이고 상위 review passed가 될 수 있음. 기존 모델 검사 재사용 동작이나 품질 표시는 오해 가능. Minor 후속 UI/집계 개선. block/hard 답 오류는 fail-closed 지적으로 남음. |
| A5 깨진 open JSON을 list가 건너뜀 | 외부 손상 시 열린 실행 하나 보장 약화. 원자 저장의 정상 경로에는 없고 ledger lock 우회는 아님. Minor 복구·진단 제한. |
| A5 node text 변경 뒤 precheck 재실행 안 됨 | 그림/설명서 hash 잠금은 지키지만 노드 기반 precheck는 오래된 결과일 수 있음. node revision을 precheck에 묶는 후속 개선 가능. 현재 설계는 노드 hash 잠금을 요구하지 않으므로 Minor. |
| A5 reviewer label·stale/unknown 직접 테스트 부족 | A6의 영수증 reviewer/위조 거부 테스트가 라벨 부분을 보완. resume은 요청 id 누락/unknown 검사, takeAnswer는 payload digest 검사, spec 변경은 재질문. 추가 이미지 전용 회귀만 Minor. |
| A6 이전 실제 brief/필수 hash/blank skip 이유 | 수정 및 전용 테스트로 해결. 같은 쟁점 재개방 없음. |
| A7/A8 forward refs·통합 범위 | 소스·도구·스킬·acceptance로 연결됨. R1 최종 docs는 컨트롤러의 후속 작업이며 소스 결함 아님. |

추가 Minor: 새로 생성한 기준 그림은 `assetMeta`가 `brief.reference`에만 값을 저장하지만 referencesFor는 `meta.reference`만 읽는다. 따라서 생성 시 reference:true를 줘도 우선 정렬 표지가 아니며, 같은 엔티티의 더 앞선 일반 그림 셋이 있으면 기준 그림이 제외될 수 있다. 저장 위치 또는 읽는 위치를 통일해야 “reference:true 먼저”의 의도가 완전히 성립한다.

경로 잔여 범위: 참고 경로는 precheck에서만 검사하고 run.references에 저장한다. 이후 사용자/동시 프로세스가 그 경로나 실행 JSON을 바꾸는 경우 요청 직전 다시 검증하지 않는다. 기존 로컬 상태 변조/경합 경계로 남지만, 요청 직전 검증은 방어를 강화한다. 기본 precheck 입력의 정적 ../와 symlink 차단이 해결됐다는 결론을 임의의 이후 변조까지 확장하지 않았다.

## 잠금·복구·범위 종합

- 실제 brief를 다시 hash하고 staged byte hash와 생성/검토/승인 hash를 대조한다. precheck/review/approve는 마지막 append-only image_result digest와 일치해야 한다. asset receipt를 먼저 남기고 한 번 쓰기 후 asset_commit을 남긴다. 기존 malformed receipt 수정은 타당하다.
- same-host 검토는 parser와 영수증에서 sameHost:true, independent:false로 고정되며 independent:true 변조도 거부된다. soft/advisory 때문에 자동 재생성하는 분기는 없다. staged 그림 변조에 따른 재생성은 hash 잠금 복구이므로 soft 자동수정이 아니다.
- committing 상태로 저장된 실행은 같은 영수증과 바이트로 복구하며 중복 커밋 기록을 만들지 않는다. 결정 10은 active 실패 실행의 skip 전용 정책이다. 영수증 append 후 committing 상태 저장 전 crash도 active로 남을 수 있으므로 “어느 시점이든 완전 재개”는 보장하지 않는다. 이는 기존 수용된 active crash 제한이며 이번에 임의로 정책을 뒤집지 않았다. 수정 뒤에도 이 범위를 최종 판정 문서에 남겨야 한다.
- 원본 노드 `core/run/runner.js`, package.json/lock 변경 없음. core/image·packs/image에 모델/네트워크 호출·동적 import 없음. 코드 모듈과 변경 테스트는 300줄 미만. 4310줄 계획 문서는 설계 입력 자체이며 모듈 분할 결함으로 취급하지 않았다.
- features·팩·도구·서버 가드는 끝에 추가했고 기존 상대 순서 검증을 유지했다. M6b viewerExport 순서 조정은 실제 병합 시 담당한다. 테스트 자료는 합성이며 vibelore 읽기/수정/커밋 없음.
- 진짜 authored diff의 trailer는 복구 시점의 정직한 기여자 정책을 따른다는 progress 판정을 유지한다. A6 RED 이력 미확인은 보고서에 이미 솔직히 표시되어 있다.
- R1의 최종 판정 문서·계획 진행 줄은 최종 수정 검증 뒤 컨트롤러가 기록할 항목이다. M7b 착수나 main 통합을 이 검토가 승인하지 않는다.


## 단일 수정 근거

# M7a 최종 단일 수정 파동 보고서

완료. 기준 커밋 `389eef7`, 결과 커밋 `e7ccff5` (`fix(image): reject unsupported checks and unsafe run paths`). 구현·회귀검사만 수행했으며 다른 레인·하위 에이전트·병합·push는 수행하지 않았다. 결정 정본과 R1 문서는 컨트롤러 소유다.

## 수정과 선택

- I1: 선택됐거나 includeAllHardChecks로 포함된 hard 그림 검사는 `CONFIG_INVALID`의 `IMAGE_HARD_CHECK_UNSUPPORTED`로 명시 거부한다. 그림 precheck/review 모두 같은 정책이다. 그림 실행의 hard 확장 검사 지원을 추가하는 대신, 기능 토글과 적용 조건으로 필요한 검사가 사라지는 설정 자체를 거부하는 컨트롤러 승인 선택이다. `images`, `imageReferences`, `imageReview` 각각 off도 거부하며 기본 기능 on도 동일하다. 미선택 non-strict hard 검사는 새로 활성화하지 않는다. 기존 코어 locked 검사는 원래 경로를 유지한다.
- I2: `image-precheck`는 deterministic, `image-review`는 model만 허용한다. 반대 tier는 `CHECK_TIER_MISMATCH`로 명시 거부한다. precheck의 `draft`는 review와 같은 `briefText(run.brief)`다. 즉 mustShow/mustNotShow/continuity/dialogue 본문 원문을 검사하며 노드 본문은 별도 `nodeText`로 유지한다. 사용자 words/pattern block 검사가 합성 설명서의 실제 인용을 지적하고 생성 전에 `image_precheck` 사용자 결정으로 멈춘다.
- I2 자체검토 추가: 사용자 정의 노드 단계가 `image-precheck`/`image-review`라는 id와 prompt를 가지면 placement 검증 이후 customStepChecks가 잘못된 tier를 파생시킬 수 있었다. 실제 두 RED로 확인하고 기존 `CUSTOM_STEP_CONFLICT`에서 그림 전용 단계 이름을 예약했다. 그림 이름 충돌을 막으므로 노드 실행과 그림 실행에 같은 파생 검사가 새는 경로도 닫힌다. 노드 실행기 파일은 변경하지 않았다.
- I3: 저장소 list/load/save/readStaged/stage가 `.folio` → `image-runs` → 사용한 실행 디렉터리/파일을 lstat로 확인하고 링크(끊긴 링크 포함)나 잘못된 파일 종류는 `IMAGE_RUN_PATH_UNSAFE`로 거부한다. JSON 최종 링크도 읽거나 교체하지 않는다. runner의 start/resume/decide/pending는 공용 잠금 전에 `.folio/runs`와 `.folio/image-runs` 부모를 검사하고 잠금 진입 뒤 다시 검사한다. 따라서 `.folio` 링크를 통과해 공용 잠금이 외부에 먼저 쓰는 문제도 막는다. 공용 노드 실행기·잠금 구현은 그대로다.

## RED/GREEN 근거

모든 명령은 작업 경로 `/path/to/folio-worktrees/m7`, Node `v24.19.0`에서 실행했다. Node PATH 접두사는 다음과 같다.

`PATH=/path/to/node-runtime/bin:$PATH`

| 단계 | 명령(위 PATH 접두사 사용) | 실제 결과 | 보존 로그 |
|---|---|---|---|
| 최초 RED, 소스 수정 전 | `node --test test/image/image-check-guards.test.js test/image/image-run-paths.test.js` | 29개: 27실패/2통과. 잘못된 설정과 경로가 거부되지 않음, 실제 brief 단어가 승인 단계로 샘 | task-final-fix-red.log |
| 최초 GREEN | 같은 명령 | 29/29 통과 | task-final-fix-green.log |
| 집중 회귀 확장 | `node --test test/image/*.test.js test/pack/image-pack.test.js` | 60/60 통과 | task-final-fix-focused.log |
| 최초 전체 | `npm run check` | 종료 0, lint/typecheck/1134개 전체 통과 | task-final-fix-full.log |
| 자체검토 파생 검사 RED | `node --test --test-name-pattern='custom node step' test/image/image-check-guards.test.js` | 2개 모두 Missing expected rejection | task-final-fix-derived-red.log |
| 최종 집중 | `node --test test/image/*.test.js test/pack/image-pack.test.js` | 62/62 통과, 2262ms | task-final-fix-focused-final.log |
| 최종 전체 | `npm run check` | 종료 0, lint/typecheck/1136개 전체 통과, 테스트 29950ms | task-final-fix-full-final.log |
| 원본 독립 probe | `node .superpowers/sdd/2026-10-01-m7-image-import/final-probes.mjs` | 예상대로 첫 I1 start에서 CONFIG_INVALID / IMAGE_HARD_CHECK_UNSUPPORTED로 종료 1 | task-final-fix-original-probes.log |

전체 재실행은 이미 통과한 검사를 습관적으로 반복한 것이 아니라, 자체검토에서 실제 확인된 파생 검사 경로의 추가 수정 때문에 수행했다. RED 명령은 로그 보존 후 tail을 잇는 셸로 실행하여 셸 전체 종료 값은 tail의 0이었으나, node:test 출력의 실패 수와 AssertionError를 위와 같이 보존했다. 최초 29개 테스트 외 추가 검사는 처음부터 GREEN인 정상 호환성/실행 경로 확장 2개, 실제 RED를 확인한 파생 검사 2개다. 인위적으로 버그를 되돌린 적 없다.

원본 probe는 실패를 assert하지 않는 선형 스크립트여서 수정 후 첫 명시 거부에서 중단된다. 따라서 그 출력만으로 I2/I3를 검증했다고 주장하지 않는다. 새 회귀검사는 원본의 유효 hard 팩+strict+review-off, `words:['문']`+block, 고정 imgrun-probe id+image-runs 디렉터리 링크+외부 원본 JSON 시나리오를 각각 독립적으로 assert한다. 이어서 실제 resume/save, staged 디렉터리/파일 링크를 검사한다.

## 잠금과 외부 바이트 확인

- 기존 image-commit 테스트가 실제 brief 재hash, 설명서/그림/승인 hash 불일치, 필수 영수증 필드, reviewer independent 위조, 추가 기록 순서, committing 복구의 단일 영수증을 다시 검증했다.
- 일반 advisory review-off는 생성 후 정상 승인·커밋되며 skipped 이유가 기존 영수증으로 보존된다. sameHost:true / independent:false 표기와 soft 비자동수정 분기는 변경하지 않았다.
- 결정 10 그대로: active crash 상태는 resume하지 못하며 skip 전용이다. 낮은 수준의 stage 같은 바이트 재호출과 public active 복구를 혼동하지 않도록 기존 주석을 바로잡았다.
- `.folio`, `.folio/runs`, `.folio/image-runs` 정적 링크 start는 외부 `EXTERNAL ORIGINAL` 바이트와 외부 디렉터리 항목 목록이 그대로임을 assert했다. `.folio`/image-runs 교체 뒤 알려진 resume와 직접 save/load/list도 거부하며 바이트와 목록이 그대로다.
- 실행 JSON 최종 링크, 실행별 staged 디렉터리 링크, staged 파일 링크에 대해서 읽기/쓰기 모두 거부한다. 기존 PNG 바이트와 디렉터리 항목 목록이 그대로이며 새 image-2 파일도 외부에 만들지 않는다. 실제 runner의 generation resume도 preplanted 실행 하위 폴더 링크에서 거부한다.
- 정상 store list/save 덮어쓰기/load, stage 멱등성, 누락 파일 null, 호스트 합성 PNG intake가 정상이다. 동시 start 두 개는 공용 잠금 안에서 하나만 열린 실행을 만들고 나머지는 IMAGE_RUN_IN_PROGRESS로 거부한다.
- max20MiB와 파일 형식 allowlist는 변경하지 않았다. 기존 집중 intake 검사와 전체 검사에서 통과했다.

## 호환성·비용·잔여 범위

- 선택된 hard 그림 검사를 선언한 작품은 이제 명시 설정 오류다. hard 그림 검사가 필요하면 후속 설계가 필요하며 여기서는 몰래 advisory로 낮추거나 기본 토글을 강제 변경하지 않는다. 미선택 non-strict hard 및 정상 advisory-off는 그대로다.
- 그림 전용 stage 이름을 사용한 custom 노드 단계는 새로 거부된다. 기존 작품이 이 두 이름으로 custom 단계를 만들었다면 그림 전용 이름과 겹치지 않게 단계 id 및 관련 참조를 재명명해야 한다. 일반 이름의 custom 단계는 그대로다. 검사 대상 글은 기존 review용 briefText와 같아서 새 직렬화 형식을 만들지 않았다.
- 정적 링크/비정상 파일 종류를 사용하는 실행 저장소는 이전처럼 따라가거나 조용히 무시하지 않고 오류를 낸다. 손상된 JSON 내용의 목록 건너뛰기 정책은 그대로다.
- 새 의존성, 모델 호출, 네트워크 호출은 없다. 경로마다 깊이에 비례하는 lstat 몇 회가 추가되고 runner 진입에서는 공용 잠금 앞뒤 검사 비용이 추가된다. 상태 저장의 원자적 rename과 staged wx 정책은 유지한다. 노드 실행기나 범용 fs/ledger 정책을 바꾸지 않았다.
- 검사는 신뢰하는 작품 root 아래 기존 경로 구성 요소에 대한 정적 검사다. 검사 후 다른 쓰기 권한 프로세스가 디렉터리를 갈아 끼우는 TOCTOU 경쟁은 여전히 남는다. openat/dirfd 기반의 절대 경로 격리나 Windows 동일 보장을 주장하지 않는다. 작품 root 자체의 바깥 조상 경로를 새로 검증하는 정책도 아니다.
- 기존 참고 그림 메타데이터 정렬/확장자, advisory 모델 답 표시, active crash 복구 제한 등 final-review의 비차단 Minor를 이번 범위 밖에서 임의 수정하지 않았다.
- 테스트는 합성 fixture 사본과 합성 PNG만 사용했다. 실제 작품/생성 산출물을 저장소에 추가하지 않았으며 `/path/to/vibelore`에 접근하지 않았다.
- 변경한 소스/테스트 8개 모두 300줄 이하(최대 175줄). `git diff --check` 통과. package.json/lock, core/run/runner.js, core/run/work-lock.js 변경 없음.

구현 기여자는 Codex이며 커밋 trailer도 이를 사실대로 기재한다. 로그와 이 보고서는 기존 비추적 `.superpowers` 작업 아티팩트에 두고, 커밋에는 이번 소스/테스트 8개만 넣는다.


## 수정 재검토

# M7a 단일 최종 재검토 — 389eef7..e7ccff5

판정: **통과 — I1/I2/I3 모두 ADDRESSED. 이번 수정 범위의 새 Critical/Important 회귀 없음.**

AGENTS.md, final-fix-brief.md의 승인된 판정, final-review.md, task-final-fix-report.md, review-389eef7..e7ccff5.diff와 관련 현재 소스·회귀검사·보존 로그를 대조했다. HEAD는 `e7ccff54d9de13601c60585a6c62e1edf5a01a9f`다. 기존 비차단 항목을 재개방하지 않았고 소스 수정·하위 에이전트·병합은 하지 않았다.

| 지적 | 명세 판정 | 품질 판정 및 근거 |
|---|---|---|
| I1 필수 hard 그림 검사 생략 | **ADDRESSED** | `resolveChecks`가 선택/strict 포함을 결정한 뒤 `checkPlacement`가 두 그림 stage의 hard/locked를 `IMAGE_HARD_CHECK_UNSUPPORTED`로 거부한다. 이는 승인된 미지원 명시 거부 선택이며 기능 토글이나 실제 적용 조건 전에 처리된다. `images`, `imageReferences`, `imageReview` off 조합도 회귀검사에 있다. 미선택 non-strict hard를 켜지 않으며 일반 advisory review-off의 정상 커밋 검사가 유지된다. |
| I2 빈 검사 글·tier 불일치 | **ADDRESSED** | precheck가 `draft: briefText(run.brief)`를 전달해 words/pattern 검사가 설명서 본문을 검사하고 `image_precheck` 결정에서 멈춘다. precheck=deterministic, review=model 계약을 설정 검증에서 강제한다. 검증 뒤 생성되는 customStepChecks 우회도 그림 stage 이름의 `CUSTOM_STEP_CONFLICT`로 차단하며 전체/레벨 파이프라인에 같은 충돌 검사가 적용된다. |
| I3 정적 실행 저장소 링크 | **ADDRESSED** | list/load/save/readStaged/stage가 `.folio`, `image-runs`, 실제 사용하는 실행별 폴더와 최종 파일을 lstat로 검사한다. 공용 잠금이 먼저 쓰는 `.folio/runs`도 runner 진입 전 및 잠금 진입 후 검사한다. 알려진 resume/save, JSON 링크, staged 폴더/파일 링크는 읽기·쓰기 전에 거부된다. 외부 기존 바이트 및 목록 보존, 정상 저장·stage 멱등성·호스트 intake·동시 start 잠금 검사가 구체적이며 수정과 대응한다. |

## 검증 근거

- 보존된 최종 집중 로그: **62/62 통과**. 최종 `npm run check` 로그: **lint/typecheck 및 1136/1136 통과**. 최초 실패 로그와 custom 단계 파생 경로의 추가 RED 로그도 확인했다.
- 지원 런타임은 보고서의 Node **v24.19.0**, 경로 `/path/to/node-runtime/bin/node`다. 원본 probe의 오류 로그에도 같은 버전이 남는다.
- 원본 probe는 첫 I1 명시 거부에서 종료 1이다. 이것을 I2/I3까지 실행한 증거로 취급하지 않았다. 독립 회귀검사 및 소스 대조로 각각 판정했다.
- 새 구체적 위험이 발견되지 않아 이미 통과한 테스트를 재실행하지 않았다. 재검토에서 `git diff --check 389eef7..e7ccff5`는 통과했다.

## 유지되는 한계와 범위

- lstat는 정적 경로 검사다. 검사 뒤 다른 쓰기 권한 프로세스가 폴더를 바꾸는 TOCTOU는 남는다. 신뢰하는 작품 root 바깥 조상 검증, openat/dirfd 격리, Windows 동일 안전성까지 보장한다는 주장은 없다. 보고서의 잔여 위험 설명은 정확하다.
- 선택된 hard 그림 검사 및 그림 stage 이름을 쓴 custom 노드 단계가 이제 설정 오류가 되는 호환성 비용은 의도적이며 보고돼 있다.
- 실제 설명서 재hash·영수증 필드·추가 기록·자기검토 표기·soft 비자동수정 분기는 이번 변경에서 약화되지 않았다. 결정 10의 active crash **skip 전용**과 committing 복구 구분도 그대로다.
- 참고 그림 메타데이터/확장자 등 기존 Minor는 앞 검토의 비차단 판정을 유지한다. 이번 판정은 M7a 최종 수정 범위에 한정하며 M7b 착수나 main 통합 판정은 아니다.
