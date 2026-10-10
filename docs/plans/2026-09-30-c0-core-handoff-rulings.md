# C0 코어 인계 정리 — SDD 기록과 판정 (2026-09-30)

계획: `docs/plans/2026-09-30-c0-core-handoff.md`. 브랜치 `feat/c0-core-handoff`, 커밋 `f2ed0b9..aab8c50`(계획 커밋 위 18개). 병합·push·PR·정본 수정은 하지 않았다.

## 사용자 결정

- 2026-09-30: 사용자가 코어 레인 인계를 먼저 처리하라고 했고, 묻지 말고 끝까지 가라고 했다. 그래서 계획 결정 표 1–20("추천 채택(사용자 확인 필요)")을 모두 쓰인 대로 승인한 것으로 보고 실행했다.

## 실행 방법

- superpowers:subagent-driven-development. 태스크마다 구현(haiku, 계획 블록을 스크립트로 쓰기·적용) → 리뷰 → 고침 루프. A2·B1·B2·B3·C1·C2·C3·D1은 가장 강한 리뷰어(opus)가 "공격해 볼 것"을 실제 탐침으로 시도했다. A1·B4는 보통 모델(sonnet).
- 착수 전 점검: 계획의 모든 블록을 `f2ed0b9` 사본(작업 공간 밖, `git archive`)에 태스크 순서대로 적용했다. 10개 태스크 모두 깨끗이 적용됐다(계획 자기 점검의 시험 실행과 같다).
- controller가 태스크마다 계획 블록과 작업 트리를 바이트 비교했다(모두 SAME). 판정으로 계획 코드를 넘은 파일은 아래 기록장의 `compare exception` 줄에 있다.
- 커밋 서명 줄은 모든 커밋에서 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`이다.

## 테스트 수

- 시작 937. 태스크 끝마다: A1 941, A2 945(계획 944 + 1), B1 951, B2 959(+5), B3 963, B4 965, C1 973(+3), C2 979(+4), C3 985(+1), D1 988, 최종 고침 992.
- 끝 모습(`aab8c50`): `npm run check` lint·typecheck 통과, 992/992. 뷰어 `npm --prefix viewer test` 6/6, `npm --prefix viewer run build` 성공.

## 계획 글과 달라진 것 (판정)

- B2: 계획은 "없는 import는 건너뛴다"고 적었지만, 실제 코드는 없는 상대 import를 `PACK_FILE_MISSING`(`path`, `from`)으로 막는다(fail closed). 해석도 Node와 같다(URL 해석, `?`·`#`·`%xx`, 심볼릭 링크는 실제 경로 기준, `from`과 경로 사이 주석). 잠금 경로는 엄격해지기만 해야 한다는 규칙이 계획 글보다 앞선다.
- A2: `TX_FAILED`의 `details.cause`는 Node 메시지가 아니라 errno 코드뿐이다. 노드·엔티티 파일의 `YAML_INVALID` 줄 번호는 여는 `---` 줄을 센다(메시지와 `details.line`이 같다).
- C1: 자산 파일은 먼저 stat하고, 일반 파일이 아니면 열지 않고 `ASSET_FILE_NOT_REGULAR`(소켓, 장치, 링크 고리 포함). NUL 바이트·너무 긴 이름도 원문 오류가 아니다. EACCES는 계획 테스트대로 그대로 거부한다.
- C2: 단계 토글은 후보를 열어 본 뒤, 요청한 (레벨, 단계)만 요청한 mode로 바뀌었는지 비교한다. 앵커·병합 키로 다른 레벨이 같이 바뀌면 `STAGE_TOGGLE_SIDE_EFFECT`, 요청이 먹지 않으면 `STAGE_TOGGLE_NOT_APPLIED`, 단계 patch가 지도가 아니면 `OVERRIDE_STEP_INVALID`(모두 `CONFIG_INVALID` 안).
- C3: 영수증까지 적힌 커밋(잠금대로 끝나야 하는 실행)에는 상태 `CHANGED_DURING_RUN`을 띄우지 않는다. 그 실행은 skip을 받지 않고 손수정을 덮으며 끝난다(잠금).
- 최종 고침: `core/pipeline/define.js`의 단계 patch 판단도 `isPlainObject`(`!!omap` 단계 patch → `STEP_PATCH_INVALID`). 같은 김에 `assets.js`·`surfaces.js`·`user-checks.js`·`sources.js`의 지도 판단도 `isPlainObject`로 바꿨다.

## 알려진 한계

- 실행 파일을 손으로 고쳐 `fileHash`를 지우거나 바꾸면 손수정 점검이 꺼진다(C0 전 실행 호환). 실행 전부터 있던 손 글은 그대로 덮는다(결정 18).
- 부모가 `waiting_children`인 동안 부모 계획을 손으로 고치면 상태에 바로 보이지 않고, 부모 커밋 때 `NODE_TEXT_CHANGED`로 막힌다.
- `NODE_TEXT_CHANGED`가 걸린 뒤 파일을 되돌려도 질문은 남는다. skip 뒤 다시 실행한다.
- work.yaml이 깨진 채 `viewer: false`면 떠 있는 뷰어가 닫히지 않는다(결정 15: 못 읽으면 켜진 것으로 본다). 그동안 `/api/assets`는 그림을 계속 보낸다(토큰이 있는 로컬 요청만).
- 자료 원본의 하드 링크, 심볼릭 링크, FIFO는 모두 이유 없이 같은 `SOURCE_FILE_INVALID`다. `rsync --link-dest` 스냅숏 같은 하드 링크 복사본은 열리지 않는다. 파일을 복사하면 링크가 풀린다.

## 확인하지 못한 것

- GitHub Actions CI(원격 없음). Node 22·26, windows-latest 행렬. Windows의 `nlink`는 문서·libuv 근거로 추론만 했다(일반 파일 1, 하드 링크는 실제 개수).
- 로컬은 macOS, Node v23 하나다.

## 다른 레인에 알릴 것

- **팩 digest가 한 번 바뀐다(B2·B3, 병합 공지에 적는다).** 내장 팩 넷의 선언 digest에 모듈 그래프가 들어가고, 소설 팩은 `core/promise.js` 변경도 본다. 열린 실행은 검사를 한 번 다시 돌고, 대기 중인 모델 질문은 `ANSWER_STALE`이 된다. 업그레이드를 끼고 `committing` + 영수증 상태로 죽은 실행은 `LOCK_PIPELINE_MISMATCH`로 skip만 받는다.
- **N3(`feat/n3-blocks`) rebase**
  - `core/run/runner.js`: 새 실행이 `fileHash`(시작 때 본문 hash)를 적는다. 커밋 단계 앞에 `nodeTextChanged` 점검이 있고, 바뀌었으면 `NODE_TEXT_CHANGED` 질문(`textChangedQuestion`)으로 멈춘다. 영수증이 적힌 커밋(`commitLocked`)은 점검하지 않는다. 옛 `recommitTextChanged` 점검 자리를 이것이 대신한다(다시 커밋 실행은 여전히 `RECOMMIT_TEXT_CHANGED`).
  - `core/run/steps/children.js`: 자식 단계 앞에서 같은 점검을 하고, 계획을 다시 읽은 뒤 `fileHash`를 새 본문으로 다시 적는다. N3가 새 단계를 더해 노드 본문을 쓰면 `core/run/text-guard.js`의 `writesNodeBody`·`nodeTextChanged`를 같은 식으로 부른다.
  - `core/status.js`: `drift`에 `CHANGED_DURING_RUN`(`runTextDrift(work, run, receiptRecords)`)이 붙는다. `receiptRecords`를 넘긴다.
  - `core/scope/scope.js`: 앞 사건 거르기가 `inScope` Set 하나다(동작 같음, 20,468개 비교에서 차이 0).
  - `core/store/tree.js`: `parseDoc(text, { source: \`${TREE_DIR}/${path}\` })` — 파싱 오류가 `YAML_INVALID`(작품 안 상대 경로)로 나온다.
  - `core/store/frontmatter.js`: `parseDoc(text, { source })`. YAML 문법 오류는 `YAML_INVALID`이고 줄 번호는 여는 `---`를 센다. 닫는 `---`가 없으면 `FRONTMATTER_UNCLOSED` 메시지 앞에 파일 이름이 붙고 `details.source`가 생긴다.
  - N3가 새 검사를 더하면 `checks.<id>.config`는 팩이 `withCheckConfig`(이제 `core/pack/check-config.js`, 소설 팩도 다시 내보냄)로 감싸야 받는다. hard·잠금 검사는 config를 받지 않는다.
  - N3가 팩 검사기 도우미·사전을 더하면 `moduleGraph`가 digest에 자동으로 넣는다. 없는 파일을 가리키는 상대 import(주석 속도)는 팩을 `PACK_FILE_MISSING`으로 막는다. 가드 테스트가 `checkers/`·`lexicons/`의 모든 `.js`가 그래프에 있는지 본다.
  - work.yaml 지도 판단은 모두 `core/util/plain.js`의 `isPlainObject`를 쓴다. 새 코드도 그것을 쓴다.
- **M6b(`feat/m6-viewer`) rebase**
  - `core/work/features.js`: `checkConfig`가 `viewerToggles` 뒤, 끝에 있다. M6b의 `viewerExport`는 그 뒤에 붙인다. 목록 테스트 둘(`test/core/features.test.js`, `test/server/feature-toggles.test.js`)의 순서를 맞춘다.
  - `server/view/api.js`: `routeApi` 맨 앞에서 `viewerStillOn(ctx.root)`를 본다. 꺼졌으면 `ctx.close()` 뒤 `FEATURE_DISABLED`(403). `/api/shutdown`은 늘 받는다. 새 뷰어 라우트도 이 길로 닫힌다. 정적 파일은 이 점검을 거치지 않는다.
  - `core/view/index.js`: `viewerStillOn`을 내보낸다. `core/view/viewer-target.js`에 있다.
  - `core/view/asset-file.js`: 그림 요청은 `readAssets(root, { hashFiles: false })`로 목록만 읽고 자기 파일만 연다. 일반 파일이 아니면 `'not a file'`, 열기 오류는 원문 대신 사용 불가 답이다. 계획 C1 diff보다 더 바뀌었다.
  - `core/view/stage-toggle.js`: 계획 C2 diff보다 크게 바뀌었다(`assertPlainStepPatch`, `assertOnlyRequestedStepChanged`, 쓰기 전 `openWorkspace(root, { packs, workYaml })`). `candidateErrors`는 설정만 보는 도우미로 남았고 토글 경로는 쓰지 않는다. M6b B6 diff는 손으로 다시 맞춘다.
  - 루트 테스트 수 기준은 992다.

## 기록장

- Task A1: minor (deferred): core/work/config.js:48 explicit `order.levels: null` now ORDER_MODE_INVALID (was treated as {}) — stricter only
- Task A1: complete (commits f2ed0b9..845c5d0, review clean)
- Task A2: Ruling: TX_FAILED details.cause (core/util/file-tx.js:64) carries raw Node message + absolute path to tool results — fold the fix into A2 (cause = error.code only, as core/rename/apply.js:51) though the file is outside the plan — A2's stated goal is "no raw Node message/outside path in tool results"; a follow-up would leave the goal false — cost if wrong: authors lose the Node message text in TX_FAILED (errno code still there; full text not logged anywhere unless we also log it)
- Task A2: Ruling: plan-mandated frontmatter YAML_INVALID line is one too early (the opening `---` line not counted) — fix by +1 offset in parseDoc and assert exact line in the test; A2 compare will show DIFF for core/store/frontmatter.js and test/server/tool-errors.test.js from here on (exception) — cost if wrong: none plausible; line numbers pointed at the wrong line
- Task A2: minor (deferred): mode-000 dir root and dangling-symlink root give INTERNAL_ERROR(errno) not WORK_ROOT_INVALID (no leak)
- Task A2: minor (deferred): WORK_ROOT_INVALID from core/work/init.js:20 and WORK_NOT_FOUND echo the caller's own root in message/details (pre-existing; caller's own path)
- Task A2: minor (deferred): failure() in server/toolbox.js can itself throw on pathological throws (null-proto, throwing toString, circular/BigInt details) → call() rejects; pre-existing mode
- Task A2: minor (deferred): YAML alias bomb in work.yaml → INTERNAL_ERROR (ReferenceError, not YAMLError); no leak
- Task A2: minor (deferred): test/server/tool-errors.test.js:43 mkdtemp(tmpdir()) not tempDir() — temp dir left behind
- Task A2: minor (deferred): no test pins folio_init on a missing root after the new pre-check (probe shows it works)
- Task A2: fix round 1/5 (2 addressed, 1 open — frontmatter rethrow keeps old message "line 3" while details.line=4; commits a29680b..1797b28)
- Task A2: Ruling: re-review Minor "test/core/file-tx.test.js 298→309 lines crosses the 300-line rule" is a Global Constraints breach, not polish — move the new TX_FAILED leak test to its own file in round 2 — cost if wrong: one extra small test file
- Task A2: fix round 2/5 (2 addressed, 0 open — message line agrees with details.line; TX leak test split to test/core/file-tx-errors.test.js; commits 1797b28..7aa5bc1)
- Task A2: compare exception — core/store/frontmatter.js, test/server/tool-errors.test.js differ from plan blocks by ruling; + core/util/file-tx.js, test/core/file-tx.test.js, test/core/file-tx-errors.test.js outside plan. Test count now 945 (plan 944, +1). Later expected counts: plan value + 1.
- Task A2: complete (commits 845c5d0..7aa5bc1, review clean)
- Task B1: ⚠️ resolved — reviewer probes (.mjs) under .superpowers/ broke `eslint .`; moved all probes to scratchpad/c0-probes/, lint OK again. Future reviewers put probes in scratchpad/c0-probes/<task>/.
- Task B1: minor (deferred): hard-config rule split — known-check-spec.js:48 skips config validation for hard and relies on check-set.js:26 to reject (plan-mandated; lock depends on call order)
- Task B1: minor (deferred): user-check line `config` silently ignored and still changes the digest (core/checks/user-checks.js:18); also under checkConfig:false
- Task B1: minor (deferred): only top-level config keys validated; nested keys (e.g. promise-dormant spans NEXT) left to checker unreported
- Task B1: minor (deferred): resolved config shares nested objects with the unfrozen pack config (check-config.js:48) — future mutation would cross works
- Task B1: minor (deferred): work-check-config.test.js lacks pins for includeAllHardChecks+config, hard config:null, proto keys/depth, checker mutation, user-check config
- Task B1: complete (commits 7aa5bc1..8208263, review clean)
- Task B2: Ruling: resolve specifiers the way Node does (URL resolution against the realpath of the importing file; keys relative to realpath(dir), POSIX), accept comments between `from`/`import` and the specifier and quotes-of-the-other-kind inside it, and FAIL CLOSED on a matched relative specifier that does not exist (PACK_FILE_MISSING with path and importer) instead of skipping — the plan's "없는 import는 건너뛴다" contradicts the lock rule "lock-path changes only stricter"; spec (lock) wins over plan text — cost if wrong: a pack whose comment text looks like `import './x.js'` for a missing file refuses to load with PACK_FILE_MISSING until the comment changes
- Task B2: Ruling: fix round dispatched to a fresh sonnet implementer (not a haiku resume) — the fix is prose design, below haiku's floor per model selection — cost if wrong: a little more spend
- Task B2: minor (deferred): module-graph.js reads imported files with no isFile/size check — a FIFO import hangs, /dev/zero reads ~512MB (pack-author-only trigger)
- Task B2: minor (deferred): pack-module-digest.test.js:77 says "keep the old digest recipe" but only asserts notEqual (plan-mandated); pin the no-modules recipe
- Task B2: minor (deferred): no tests for cycle stop, 500/501 cap, non-ENOENT fail-closed
- Task B2: minor (deferred): README "계산한 경로로 모듈을 불러오지 않는다" does not cover readFileSync(new URL(...)) data reads; no guard forbids them
- Task B2: fix round 1/5 (1 addressed, 1 open — new: GAP regex exponential backtracking (ReDoS) hangs loadYamlPack on stacked // comment lines; commits 7d88b90..c976214). Fixer c0-fix-B2 (sonnet). Built-in pack keys+digests identical to 7d88b90 (verified). Tests 957.
- Task B2: minor (deferred): graph reads files outside pack/repo (/etc/hosts via comment import) and a symlink target outside the pack gives a machine-dependent key
- Task B2: minor (deferred): plan text (brief line 57) still says "없는 import는 건너뛴다" — superseded by the fail-closed ruling; record in rulings doc
- Task B2: fix round 2/5 (1 addressed, 0 open — GAP rewritten unambiguous, ReDoS gone; commits c976214..62c2c97). Tests 959 (plan 953; +1 A2, +5 B2 fixes).
- Task B2: minor (deferred): line-comment branch of GAP ends only at \n — a lone \r / U+2028 / U+2029 after `from // c` hides the specifier (fail-open on lock path, regression from c976214; one-line fix `//[^\n\r
- Task B2: minor (deferred): unanchored scan restarts at each from/import token inside comments → quadratic on crafted 10s-of-KB comment text; no file-size cap
- Task B2: compare exception — core/pack/module-graph.js, test/pack/pack-module-digest.test.js differ from plan blocks by ruling.
- Task B2: complete (commits 8208263..62c2c97, review clean)
- Task B3: ⚠️ resolved — novel pack digest changes: promise.js and promise-flow.js are both in the novel module graph (guard test pins ../../core/promise.js), so their edit changes the digest by construction.
- Task B3: minor (deferred): promise-step.test.js oracle uses subset check and one event per node (plan-mandated); probes cover the gap
- Task B3: minor (deferred): closed→resolved→resolved in one node gives two identical PROMISE_RESOLVED_AFTER_CLOSE warnings (old gave one; non-blocking)
- Task B3: minor (deferred): foldPromise.history lists events that did not move the promise (no `moved` flag) — API consumer could misread
- Task B3: minor (deferred): stepPromise accepts undefined/unknown next stage (unreachable today)
- Task B3: minor (deferred): pre-existing — promise-flow treats events on entities missing from work.entities as promises; core.promise-order ignores them
- Task B3: complete (commits 62c2c97..bf5446a, review clean)
- Task B4: minor (deferred): "known check ids" computed separately in recommend.js:43 and check-set.js:59-65 (consistent today, comment-documented)
- Task B4: complete (commits bf5446a..27eb40a, review clean)
- Task C1: Ruling: fix per reviewer — fileHashOf stats first and treats any non-regular file as ASSET_FILE_NOT_REGULAR without opening it (open+fstat kept as race re-check); ENXIO/EOPNOTSUPP/ELOOP/ENAMETOOLONG from open map to not-regular/missing; NUL byte in meta.file rejected before the syscall; readAssetFile refuses !isFile() as 'not a file' and maps open errors to unavailable. EACCES keeps rejecting as the plan test pins (decision unchanged) — the attack list names socket/device→INTERNAL_ERROR as a defect; spec over plan code — cost if wrong: a stray odd asset becomes a warning instead of an error (that is the stated intent of C1)
- Task C1: Ruling: fix round dispatched to a fresh sonnet implementer (prose fix) — cost if wrong: spend
- Task C1: minor (deferred): viewerStillOn catch→true: `viewer: false` + any config error (or deleted work.yaml) keeps the viewer open and /api/assets still serves bytes (decision 15 says treat unreadable as on; plan-mandated) — FINAL REVIEW SHOULD TRIAGE
- Task C1: minor (deferred): feature check only in routeApi — static files / static 404-405 keep answering and reset idle timer until a tokened /api call
- Task C1: minor (deferred): assets-files.test.js:52 pins chmod-000 asset → raw EACCES reject (INTERNAL_ERROR path), contradicting the JSDoc (plan-mandated)
- Task C1: minor (deferred): fileHashOf no size cap; >2GiB asset → INTERNAL_ERROR (pre-existing)
- Task C1: minor (deferred): each API request reads/validates work.yaml twice
- Task C1: fix round 1/5 (1 addressed, 0 open — stat-first, non-regular never opened, error mapping, NUL pre-check; fixer c0-fix-C1 sonnet; commits 6e1ac20..154d3f6). Tests 973.
- Task C1: minor (deferred): openWork hashes (no warning) an asset whose file is ../outside or a symlink to an outside file — hash only, bytes never served (pre-existing)
- Task C1: compare exception — core/store/assets.js, core/view/asset-file.js, test/core/assets-files.test.js differ from plan by ruling.
- Task C1: complete (commits 27eb40a..154d3f6, review clean)
- Task C2: Ruling: (1) add a pre-write refusal test asserting work.yaml mtime+inode unchanged, and a rollback test (packs Map that fails once the new mode is on disk) asserting bytes restored and no .tmp left — cost if wrong: two more tests
- Task C2: Ruling: (2) rewrite the plan's test 2 to compare setStageMode refusal codes with openWorkspace({ workYaml }) codes for the same candidate; keep `candidateErrors` exported (other lanes/tests use it) but document it as config-only (no tree/source checks); leave test/view/stage-toggle.test.js as is — cost if wrong: a config-only helper stays around unused on the toggle path
- Task C2: Ruling: (3) fix in C2 although pre-existing — C2 already opens the candidate workspace, so compare base vs candidate effective pipelines and refuse (CONFIG_INVALID) unless exactly the requested (level, step) changed to the requested mode; refuse a non-plain-object step patch — the toggle must never report a change it did not make (writer trust) — cost if wrong: an exotic anchored/merge-key work.yaml can no longer be toggled from the viewer (author edits by hand)
- Task C2: minor (deferred): loadWorkConfig/openWorkspace: non-string workYaml silently reads the on-disk file (fail-open for a validation API; no caller)
- Task C2: minor (deferred): candidateErrors calls parseYaml outside its try (invalid YAML throws instead of returning an error) — pre-existing
- Task C2: fix round 1/5 (3 addressed, 0 open — pre-write/rollback tests with mutants, parity test vs openWorkspace, assertPlainStepPatch + assertOnlyRequestedStepChanged; fixer c0-fix-C2 sonnet; commits 43d0ede..e542254). Tests 979.
- Task C2: minor (deferred): toggle guard compares only `mode` — an anchor shared across levels can change another level's `reason` (lands in skip receipts) silently
- Task C2: minor (deferred): guard compares pipelines.byLevel only, not global leaf/branch overrides — an anchor can flip a global override the user did not ask for
- Task C2: minor (deferred): no test pins that the pre-write check uses openWorkspace rather than config-only candidateErrors (mutant M6 survives); comment at workspace-candidate.test.js:36-38 is false
- Task C2: minor (deferred): core/pipeline/define.js:49 validPatchShape accepts a Map step patch (typeof object) instead of isPlainObject — root cause of 3a
- Task C2: compare exception — core/view/stage-toggle.js, test/core/workspace-candidate.test.js differ from plan by ruling.
- Task C2: complete (commits 154d3f6..e542254, review clean)
- Task C3: Ruling: runTextDrift returns [] when commitLocked (pass the receipt records status.js already loads); SKILL.md states that a commit whose receipt is recorded finishes by the lock and overwrites a later hand edit, and names RECOMMIT_TEXT_CHANGED for recommit runs on the same line (the line being corrected must be right); add a crash→edit→status→finish test — status must not advise a skip the engine refuses; the lock (finish a receipted commit) wins — cost if wrong: in that rare crash window the author gets no status warning before the lock overwrites their edit (same as before C0)
- Task C3: minor (deferred): drift checks only OPEN_STATES — a waiting_children parent whose plan was hand-edited is not reported until its commit blocks
- Task C3: minor (deferred): a pending NODE_TEXT_CHANGED stays after the author reverts the file (status clears, question stays; skip + regenerate needed)
- Task C3: minor (deferred): core/run/recommit-plan.js:48-56 recommitTextChanged now dead (exported, unused, stale comment)
- Task C3: minor (deferred): hand-edit-guard test 4 does not show an edit after the children step blocks the parent commit; commitLocked exemption for normal runs untested
- Task C3: minor (deferred): not demonstrated — crash mid children addNode loop + parent hand edit + skip → parent in derive mode with partial children
- Task C3: documented limit confirmed: a run file hand-edited to drop or forge fileHash disables the guard (pre-C0 compatibility)
- Task C3: fix round 1/5 (1 addressed, 0 open — runTextDrift skips commitLocked runs; comment/SKILL.md corrected; crash→edit→finish test; fixer c0-fix-C3 sonnet; commits 69ee279..9c09847). Tests 985.
- Task C3: minor (deferred): probe p4-partial — rerun of a branch (arc-three) after skipping a NODE_TEXT_CHANGED on the parent throws CHILDREN_PENDING from runner.js:148 (identical before this fix; pre-existing or probe artifact)
- Task C3: compare exception — core/run/text-guard.js, core/status.js, skill/folio/SKILL.md, test/run/hand-edit-guard.test.js differ from plan by ruling.
- Task C3: complete (commits e542254..9c09847, review clean)
- Task D1: minor (deferred): hard link / symlink / FIFO all give the same SOURCE_FILE_INVALID with no reason or remedy; whole work refuses to open (e.g. rsync --link-dest snapshots) — add remedy to sources.md
- Task D1: minor (deferred): sources/*.yaml descriptors and viewer asset bytes have no nlink check (follow-up)
- Task D1: minor (deferred): no test for an in-work twin hard link (both originals refused)
- Task D1: minor (deferred): scope.test.js:67-76 pin passes before and after (only pins unordered short-circuit; Set semantics covered elsewhere)
- Task D1: not verifiable locally: windows-latest nlink behaviour (reasoned OK), GitHub Actions viewer steps
- Task D1: complete (commits 9c09847..da4f061, review clean)
- Final: Ruling: fix wave = Important 1 + 2, plus the Korean-comment rule breaches (English comments in frontmatter.js, file-tx-errors.test.js, tool-errors.test.js, hand-edit-guard.test.js — a Global Constraint), plus the B2 lone-\r/U+2028/U+2029 line-comment one-liner with a FORMS test (lock-path fail-open, one line); Important 3 is written by the controller (rulings doc, progress line); other deferred minors stay deferred as triaged — cost if wrong: small extra diff in the fix wave
- Final: parked — assets.js:79 extra isPlainObject gate makes a bare-list asset `brief: [..]` silently invisible (was visible at da4f061: entity view counts, occurrence surfaces, rename, index) — Ruling: real, deferred (no second fix wave); documented brief shape is a map and no engine code writes list briefs; follow-up: accept arrays or warn — cost if wrong: a work with list briefs loses mention counts/rename coverage for those briefs without a warning
- Final: minor (deferred): test/pack/pack-module-digest.test.js:463-464 raw U+2028/U+2029 bytes in string literals — use escapes
- Final: minor (deferred): SKILL.md WORK_ROOT_INVALID line omits the stat-error case (EACCES with details.errno)

## 최종 브랜치 리뷰 (f2ed0b9..da4f061, 가장 강한 모델)

- 결론: With fixes. Critical 0. 모든 잠금은 약해지지 않았고 태스크 사이 이음새도 맞았다(B1 config가 C2 후보 열기를 지나는 것, A2 `YAML_INVALID`가 C1·C2 경로에서 나오는 것, C3와 다시 커밋·가지 실행을 탐침으로 확인).
- I1: `core/pipeline/define.js` `validPatchShape`가 `!!omap` 단계 patch를 받고 조용히 버렸다(A1 목표 미달). 최종 고침 `aab8c50`에서 고쳤다.
- I2: SKILL.md "오류일 때"에 A2의 `YAML_INVALID`, `WORK_ROOT_INVALID`, 고정 메시지 `INTERNAL_ERROR`, `details: { truncated: true }`가 없었다. `aab8c50`에서 더했다.
- I3: 판정·진행 기록이 없었다. 이 파일과 계획 "현재 상태"의 진행 줄(docs 커밋)로 고쳤다.
- 같은 고침 물결에 더한 것(판정): 영어 주석을 한국어로(전역 규칙), B2 줄 주석의 끝으로 `\r`·U+2028·U+2029도 본다(잠금 경로 fail-open 한 줄).
- 판정: 기록장의 판정 모두 설계 기준에 맞다고 봤다.
- 미룬 minor 분류: 병합 전 필수는 B2 계획 글(→ 이 파일 "계획 글과 달라진 것")과 C2 `validPatchShape`(→ I1) 둘. 나머지는 그대로 둔다. 빠른 후속 추천: `runTextDrift`에 `waiting_children`, `readKnownCheckSpec`이 hard config를 스스로 거부, `details.errors`를 통째로 버리지 말고 앞부분을 남김, sources.md에 하드 링크 푸는 법.
- 고침 재리뷰(가장 강한 모델): 네 가지 모두 ADDRESSED, 새 Critical/Important 없음. 남은 minor 셋은 기록장 `Final:` 줄에 있다(목록 모양 자산 `brief`가 보이지 않게 된 것 포함).
