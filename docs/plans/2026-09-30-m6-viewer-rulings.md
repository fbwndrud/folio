# M6a 뷰어 — SDD 기록과 판정 (2026-09-30)

계획: `docs/plans/2026-09-30-m6-viewer.md`. 범위는 Part A(A1~A10)뿐이다. Part B(M6b)는 J2(N3·N4·N5가 main에 병합) 뒤에 시작한다.

## 사용자 결정

- 2026-09-30: 사용자가 계획의 "추천 채택(사용자 확인 필요)" 결정 V1~V17을 모두 승인했고, M6a 실행을 지시했다.

## 계획 시험 실행에서 알게 된 것

- 착수 전 점검: 계획의 코드 블록(전체 파일·diff)을 스크립트로 뽑아 작업 공간 밖 복사본(24a403b 기준)에 태스크 순서대로 적용했다. 모든 블록이 깨끗이 적용됐고, 태스크마다 `npm run check`가 초록이었다. 테스트 수는 880/883/886/889/892/897/906/909/910으로 계획과 같았다(A9는 뷰어 설치가 필요해 건너뜀). A10 완료 기준 테스트는 `viewer/dist` 없이도 통과한다(V1).
- 구현자는 계획 코드를 손으로 옮기지 않았다. 스크립트로 쓰거나 적용했고, controller가 태스크마다 바이트 비교를 했다(A1~A10 모두 SAME). 판정으로 바꾼 파일은 A8 고침(`server/view/http-server.js`, `server/view/registry.js`, `test/server/view-tool.test.js`)과 최종 고침(`core/view/stage-toggle.js`, `server/view/http-server.js`, `test/view/stage-toggle.test.js`)이다.
- 브라우저 확인(controller, Browser pane Chromium, `viewer/dist` 빌드, 합성 fixture 복사본):
  - `serial-2level`
    - 목차 → 읽기(ep-001) → 엔티티 이름(하나) → 사용처 → 다른 장면(각성)으로 이동: 확인
    - 영수증 목록: 확인
    - 단계 화면: 잠금 단계(commit, draft, extract, facts)는 🔒만 있고 선택 칸이 없다
    - 화면에서 episode.critic을 끄면 `overrides.levels.episode.critic.mode: off`가 쓰인다
    - 잠금 단계를 직접 POST하면 403 `STEP_LOCKED`
  - `novel-3level`
    - 인라인·첨부 SVG 그림(blob:): 확인
    - 섞어서/글만/그림만 전환: 확인
    - 영수증 상세 화면: 확인
    - 단계 화면에서 서버 오류 코드(`PACK_UNKNOWN: image`, fixture가 builtin이 아닌 팩을 씀)를 그대로 보여 준다
    - 닫기 버튼으로 서버가 닫힌다
  - 확인하지 않은 것: 화면의 이유 칸, 실제 커밋이 있는 영수증 상세(HTTP로는 m6a 완료 기준이 확인), Firefox·Safari, 어두운 테마.
- 환경: macOS, Node v23.11.0만. Node 22·24, Windows, CI에서는 돌리지 않았다. 최종 리뷰가 쓰인 API를 봤고, 22.13·24에서 깨질 것은 없다고 판단했다(`closeAllConnections` 18.2+, `timingSafeEqual`, `O_NOFOLLOW ?? 0`, `fetch`, 따옴표 glob의 `node --test`; Vite 8 engines `^20.19 || >=22.12`).

## 알려진 한계

- `viewer` 기능을 끄면 새 `folio_view`만 막힌다. 이미 떠 있는 서버는 유휴(30분)나 닫기 버튼까지 남는다(계획 "넘길 것").
- `overrides.levels:`나 `levels.<level>:`가 비어 있으면(null) 토글이 400 `CONFIG_INVALID`로 거부된다. 이미 코어의 `openWorkspace`가 그 설정을 거부하기 때문이다(`folio_run`도 같다). 빈 키를 지우면 된다.
- 토글은 YAML Document로 다시 쓴다. 뜻은 그대로지만 `overrides.levels` 밖의 서식(CRLF, 들여쓰기, 빈 줄)이 정규화될 수 있다.

## M6b와 다른 레인에 넘길 것

- **M6b 실행 세션**
  - A8 고침과 최종 고침은 계획 코드를 넘는다. B1·B6의 `server/view/http-server.js`·`server/view/registry.js` diff와 B6의 `core/view/stage-toggle.js` 주변은 그대로 적용되지 않을 수 있다. 손으로 다시 맞춘다.
    - `startViewServer`가 `touch`를 더 돌려준다.
    - `registry.open`이 `server.touch()`를 부른다.
    - listen 뒤 `server.on('error', onError)`를 둔다.
  - 루트 테스트 수 기준은 914다(계획 910 + A8 고침 1 + 최종 고침 3). M6b 기대 수에 4를 더한다.
- M6b(B1): registry 키를 realpath로 한다. 선호 포트가 경로 hash라 중요해진다.
- M6b(B1): SVG를 blob:으로 보이면 그림 응답의 sandbox CSP가 따라가지 않는다(새 탭에서 열 때). `scannedSurfaces`의 반복 스캔 비용도 관계도와 같이 본다.
- M6b: 이 네 가지는 손대지 않았으니 M6b에서 처리한다.
  - 토큰을 주소창·기록에서 지우기(`history.replaceState`)
  - dev 프록시의 Origin 문제(`npm run dev`에서 토글·닫기 실패, README dev 안내가 지금 틀림)
  - error boundary
  - 되돌리기·`WORK_LOCKED`·20MiB·HEAD·`Origin: null`·unref 종료 테스트
- 코어 레인
  - `core/store/assets.js` `readAssets`가 그림 요청마다 모든 그림 파일을 다시 읽고 hash한다. 크기 제한이 없다. 폴더면 EISDIR로 500, FIFO면 멈춘다. "그림만" 보기에서는 비용이 거의 제곱이다.
  - `levels.js`·`config.js`의 `isPlainObject`가 `Map`을 받는다. `%YAML 1.1` work.yaml에서 토글이 성공이라 답하지만 보이지 않는다.
  - `mergeOverrides`에서 레벨 `{mode:on}`이 전역 덮어쓰기의 reason을 물려받는다.
  - root가 파일이면 `openWork`가 `INTERNAL_ERROR`(ENOTDIR)를 낸다.
- CI 소유자: 계획 "넘길 것" 그대로. `npm --prefix viewer ci && npm --prefix viewer test && npm --prefix viewer run build` 단계.

## 기록장

- Task A1: complete (commits 24a403b..9953895, review clean)
- Task A2: Ruling: keep the plan code; no fix — "설정이 안 열리는 작품" in the plan means the workspace layer (packs/checks/pipelines via openWorkspace), which statusSummary absorbs and the test covers; a structurally invalid work.yaml has no levels, so no outline can be built, and the API answers the error code (400 CONFIG_INVALID / 404 WORK_NOT_FOUND) which the viewer's error view shows — cost if wrong: a writer with a broken work.yaml sees an error screen instead of a partial outline until they fix work.yaml.
- Task A2: minor (deferred): core/view/outline.js statusSummary JSDoc says "CONFIG_INVALID 등" — could mislead; it means errors raised by openWorkspace, not loadWorkConfig.
- Task A2: complete (commits 9953895..e8d3062, review clean after ruling)
- Task A3: minor (deferred): segments.js entity aliases pushed as separate terms without dedup against identical name text (harmless: taken-set dedups)
- Task A3: minor (deferred): node-view.js readable() trims every candidate body per neighbour lookup (O(n) per call)
- Task A3: complete (commits e8d3062..c820013, review clean)
- Task A4: minor (deferred): entity-view.js:195 destructure-and-rebuild IIFE around foldPromise reads oddly (plan code)
- Task A4: minor (deferred): scannedSurfaces re-runs scanMentions per surface (inherited from rebuild.js pattern)
- Task A4: complete (commits c820013..613f7d5, review clean)
- Task A5: minor (deferred): stepSummary overridden/advisories counts are not asserted in receipt-view.test.js
- Task A5: minor (deferred): viewReceiptList broken-ledger return omits statusAvailable instead of false
- Task A5: complete (commits 613f7d5..a1e464b, review clean)
- Task A6: minor (deferred): %YAML 1.1 work.yaml — toggle writes !!omap, parse gives Map, reports success but change is invisible (not a lock bypass; root cause isPlainObject accepts Map in levels.js/config.js)
- Task A6: minor (deferred): YAML round trip normalizes formatting outside overrides.levels (CRLF, indent, spacing, blank lines); meaning unchanged
- Task A6: minor (deferred): alias (*x) on overrides.levels / levels.<level> path makes setIn throw plain Error → server 500 INTERNAL_ERROR instead of CONFIG_INVALID; nothing written
- Task A6: minor (deferred): hand edit to work.yaml outside the lock between read and atomic write (or rollback) can be clobbered; no re-check of digest right before write
- Task A6: minor (deferred): tests do not cover the rollback path or WORK_LOCKED (both verified by attack scripts)
- Task A6: minor (deferred): levels.js mergeOverrides — level {mode:on} inherits global override reason (cosmetic)
- Task A6: complete (commits a1e464b..426eb4b, review clean)
- Task A9: minor (deferred): token stays in address bar/history after copy to sessionStorage (suggest history.replaceState)
- Task A9: minor (deferred): empty ?token= hides a valid stored token (?? does not fall through on '')
- Task A9: minor (deferred): dev proxy (vite dev) POSTs carry Origin localhost:5173 → ORIGIN_NOT_ALLOWED; toggles/shutdown fail under npm run dev
- Task A9: minor (deferred): App.jsx shutdown .catch(()=>{}) shows "closed" even on failure
- Task A9: minor (deferred): Reader/Entity show previous data under new route until fetch resolves (no loading cue)
- Task A9: minor (deferred): Stages reason label says "끌 때" but is sent on every change
- Task A9: minor (deferred): no React error boundary; one unexpected response shape blanks the app
- Task A9: complete (commits 72297f4..a8eb8c0, review clean)
- Task A8: minor (deferred): registry key is resolve(root) not realpath — symlink/case variants start separate servers; repointing a symlink makes a running server serve a different work (V6 "root fixed at start")
- Task A8: minor (deferred): closeAll is not a barrier against in-flight open and is never wired to MCP exit (process still exits: unref; keep-alive lag ~6s)
- Task A8: minor (deferred): a root that is a file → INTERNAL_ERROR (ENOTDIR) from openWork (pre-existing, no server starts)
- Task A8: minor (deferred): view-tool.test refusal cases do not assert running.size stays 0
- Task A8: minor (deferred): idleMinutes rounds to 0 for sub-minute idleMs (cosmetic)
- Task A7: minor (deferred): readAssets (core/store/assets.js) re-reads and hashes every asset file on each picture request — no size cap; directory asset → 500 EISDIR on /api/assets and /api/work; FIFO asset hangs threadpool and blocks MCP exit (pre-existing core code; hand-off)
- Task A7: minor (deferred): ENOTDIR / directory named *.png → 500 INTERNAL_ERROR instead of ASSET_FILE_UNAVAILABLE; directory named *.js in dist → 500 (static.js lacks isFile); malformed absolute-form target → 500 + stderr; client abort → stderr noise
- Task A7: minor (deferred): Content-Type check is a prefix match (application/jsonx accepted; not exploitable — token header forces preflight)
- Task A7: minor (deferred): touch() runs before Host/token checks — any page pinging 127.0.0.1:<port> keeps the server alive; open sockets delay MCP exit (bounded by Node timeouts)
- Task A7: minor (deferred): WORK_NOT_FOUND message carries the absolute work path (token required; allowed by design)
- Task A7: minor (deferred): no tests for 20MiB/dir/FIFO assets, HEAD, Origin null, application/jsonx, unref exit, SVG sandbox CSP
- Task A7: complete (commits 426eb4b..015ac6f, review clean)
- Task A8: Ruling: fix the idle-on-reuse finding beyond the plan code — startViewServer also returns touch(); registry calls server.touch() on every open; +1 test in test/server/view-tool.test.js (root count 910→911 after A10) — why: folio_view promises idleMinutes 30 and V5 says idle = 30 min without requests, but a reused server kept its old deadline and the returned URL could be dead on arrival — cost if wrong: one extra field on startViewServer's result; M6b diffs touching server/view/http-server.js and registry.js (B1, B6) will not apply byte-for-byte and must be re-based by hand.
- Task A8: fix round 1/5 (1 addressed, 0 open — idle timer reset on reuse; commits c05fa3b..6a0d130; root tests 911)
- Task A8: minor (deferred): new reuse-idle test has a 400ms margin (idleMs 1000, waits 700+600) — could flake on a very slow machine
- Task A8: complete (commits 015ac6f..72297f4 + fix c05fa3b..6a0d130, review clean)
- Final: Ruling: one fix wave = I2 (+ alias → CONFIG_INVALID, + digest re-check just before write), M1 (error listener), M4 (test); I1 done by controller as the rulings-doc/progress docs commit; M2, M3, M5 parked — M2 window is one event-loop turn and the A8 fix already restarts idle on reuse; M3 handed to M6b B1; M5 reported as unverified to the user — cost if wrong: M2 a reused:true URL can be dead in a sub-millisecond race; M3 an SVG opened in its own tab runs under the page CSP only.
- Final: Ruling: keep the upstream CONFIG_INVALID refusal of a null overrides.levels (no core/pipeline change) and keep the defensive withStageMode fix — the answer is a 400 with a code, not a 500, and core/pipeline is outside this lane — cost if wrong: a writer who comments out every level override sees CONFIG_INVALID on the stages screen (and folio_run fails the same way) until they delete the empty `levels:` key.

## 최종 브랜치 리뷰 (24a403b..6a0d130, 가장 강한 모델)

- 결론: With fixes. Critical 0.
  - 잘된 점: 잠금 단계 거부 세 겹(화면 `canToggle`, 서버 `STEP_LOCKED` 403, 검증 경로 `LOCKED_STEP_OVERRIDE`)이 각각 테스트로 고정됐다. 루프백 보안과 모듈 경계(`server/view` → `core/view/index.js`·`core/errors.js`만)도 탄탄하다. A6·A7·A8 공격 리뷰는 모두 버텼다.
  - A10 확인: `m6a.test.js`는 도구를 MCP stdio로만 부른다. 잠금 단계 403과 `work.yaml` 바이트 불변은 HTTP로 확인한다. `VIEWER_NOT_BUILT` 안내는 `SKILL.md`에서 사라졌다.
- I1(Important): 판정·진행 기록이 브랜치에 없었다. 이 파일과 계획 "현재 상태"의 진행 줄(docs 커밋)로 고쳤다.
- I2(Important): `overrides.levels`가 null이거나 경로에 alias가 있으면 `setIn`이 일반 Error → 500. 고친 커밋은 3e9039d다.
  - 빈 맵을 채운다.
  - 나머지는 `CONFIG_INVALID`로 바꾼다.
  - 쓰기 직전에 digest를 다시 확인한다.
  - null인 경우는 코어가 먼저 `CONFIG_INVALID`로 거부해서 HTTP 500이 실제로 나지 않는다. alias 경우는 전체 경로에서 재현됐고 고쳐졌다.
- M1: listen 뒤 `'error'` 리스너가 없었다(EMFILE이면 MCP가 죽음). 3e9039d에서 고쳤다.
- M4: `viewerToggles: false` + 잠금 단계 테스트를 3e9039d에서 더했다.
- 병합 전 고치지 않고 둔 것(판정 참고)
  - M2: 닫히는 중인 서버가 한 턴 동안 목록에 남는다
  - M3: SVG blob과 sandbox CSP → M6b B1
  - M5: 브라우저 확인 일부 → 위 "확인하지 않은 것"
- 미룬 minor 분류(최종 리뷰)
  - 병합 전 필수: A6 alias → 500 하나. I2와 함께 고쳤다.
  - 넘김: 위 "넘길 것"
  - 나머지: 그대로 낸다(ship)
- 판정: A2·A8 판정 모두 동의.
- 고침 재리뷰(보통 모델): I2·M1·M4 모두 ADDRESSED, 새 문제 없음.
- 끝 모습(3e9039d): `npm run check` lint·typecheck 통과, 테스트 914/914. 뷰어 테스트 6/6, 빌드 성공. 루트 `package.json`·`package-lock.json`은 바뀌지 않았다.


## M6b 완료와 Codex 인계 복구 (2026-10-01)

M6b B1~B7과 M6a 인계 보완 H를 완료했다. 구현 범위는 `c8223aa..eb8d5b0`이다. 최종 검사 환경은 Node v24.19.0이며 루트 lint·typecheck·테스트 1102/1102, 뷰어 테스트 13/13, 빌드가 통과했다. 기존 Graph 청크 크기 경고는 남아 있다.

독립 최종 검토의 정적 SVG 격리 누락 1건을 한 번의 수정으로 해결하고 재검토에서 명세·품질 승인을 받았다. SVG는 data URL에 담고 원문 SVG 파일은 내보내지 않는다. 일반 정적 서버에서 합성 작품의 인라인·첨부 그림 표시와 data URL을 확인했다.

실제 브라우저에서 합성 M5 작품의 이름→정의→다른 회차 이동, 잠금 단계에 토글이 없는 것, 이유를 남긴 critic 끄기의 YAML 저장, 주소창 토큰 제거를 확인했다. 사후 재열기 실패 시 YAML 되돌리기를 강제로 재현하는 테스트는 결정적인 주입 지점이 없어 수행하지 않았다. 기존 내보내기 폴더 교체 중 강제 종료 공백도 남은 한계다. main 병합은 아직 하지 않았다.

다음은 중단 전 기록과 복구 중 판정을 모두 보존한 실행 기록이다. 보류 항목은 최종 검토에서 읽고 비차단 여부를 판단했으며, 해결했다고 표시하지 않는다.

```text
# SDD ledger — plan: docs/plans/2026-09-30-m6-viewer.md (Part B, B1–B7)

Start: main c8223aa (ff from f641366). npm run check 1069/1069. viewer test 6/6, build ok.
Tools: plan_blocks.py (list|write|compare|diffs|brief TASK). Spec = plan "설계 요약"+"결정" (V1–V17 approved).
Count targets (plan base 910 → ours 1069, +159): B1 1072, B2 1075, B3 1077, B4 1080, B5 1083, B6 1089, B7 1090 — plus extra tests from rulings below. Viewer tests: B1 8, B6 11.

## Preflight scan

Dry run (scratch copy of c8223aa, apply blocks task by task): whole-file blocks write fine; diffs that do NOT apply on new main:
- core/view/index.js (B1–B6: main added `viewerStillOn` to the viewer-target export line)
- server/view/api.js (B1–B6: main import list has `viewerStillOn`; routeApi has a viewerStillOn gate)
- server/view/registry.js (B1: main comment line "유휴 시간도 새로 센다" + server.touch())
- test/core/features.test.js, test/server/feature-toggles.test.js, core/work/features.js (B6: N3/N4 keys after viewerToggles)
- skill/folio/references/viewer.md (B7)
Applied cleanly in dry run: B6 http-server.js, registry.js, respond.js, static.js; all viewer/ diffs.

| Pair / task | produces → consumes | finding |
|---|---|---|
| B1..B6 core/view/index.js, server/view/api.js | each adds one export/route line on top of previous | context drift from main (viewerStillOn) → hand re-fit, + lines verbatim |
| B1..B5 App.jsx, route.js, route.test.js, styles.css | sequential hunks | apply cleanly in dry run |
| B1..B5 test/server/view-routes-m6b.test.js | B1 creates, B2–B5 append | ok |
| B4 ↔ B5 Reader.jsx | B4 adds evidence panel, B5 adds anchor/blockRef rendering | ok in dry run; B5 N3 ruling extends Reader (R5) |
| B1 ↔ B6 registry.js | B1 preferredPort + EADDRINUSE fallback; B6 BUILD_HINT move | B1 hunk needs re-fit; R3 adds realpath key |
| B5 ↔ B6 snapshot | snapshot.blocks = viewBlocks(root) | R5 may throw FEATURE_DISABLED → R6 |
| B1 ↔ B6 snapshot.graph | viewGraph shape | R4 adds `links` field; snapshot passes through |
| B6 ↔ features | viewerExport key | R1 |
| B7 acceptance ↔ all | uses all routes | ok |
| B1 self | tests vs code | consistent (plan trial run) |
| B2 self | promise board vs M5 dormantPromises | consistent; N4 kept positions.ordered |
| B3 self | check sets vs N5 brand sets | check-sets test expectations may differ after N5 → fit query, ruling if so |
| B4 self | N2 sources/evidence | consistent (N2 was in plan base) |
| B5 self | blocks vs N3 | R5 |
| B6 self | export, features | R1, R6 |
| B7 self | acceptance + docs | viewer.md hunk re-fit |

## Rulings (preflight)

- Preflight: Ruling: R1 features — `viewerExport` goes at the END after `linkScope` (FEATURES order: … viewer, viewerToggles, checkConfig, blocks, bibliography, termIndex, links, linkScope, viewerExport); FEATURE_PARENTS gets `viewerExport: 'viewer'` after `linkScope: 'links'`; doc comment line after the linkScope lines; NOT in RUN_FEATURES (digest unchanged). Tests: the plan's added assertions are re-fitted into main's lines (features.test.js :19, :36, M6 features test; feature-toggles.test.js :31 append `viewerExport: true` after `linkScope: true`); the N4 test `keys.slice(-2) → ['links','linkScope']` becomes `keys.slice(-3, -1)` same value plus `assert.equal(keys.at(-1), 'viewerExport')` — why: list rule "append at end"; same pinning strength — cost if wrong: one key position, trivially movable before merge.
- Preflight: Ruling: R2 diffs that do not `git apply` on new main are re-fitted by hand: every `+`/`-` line of the plan hunk is applied verbatim, only the context is main's (e.g. api.js import list keeps `viewerStillOn`; index.js keeps `viewerStillOn, viewerTarget`). Files re-fitted are listed in each task's ledger line — cost if wrong: a dropped context change; caught by tests + reviewer comparing against plan hunks.
- Preflight: Ruling: R3 B1 registry key = realpath(root) (M6a hand-off "registry 키를 realpath로"), falling back to resolve(root) if realpath fails (viewerTarget already rejected missing roots); preferredPort hashes the same key; +1 test (symlink to the same work reuses the server) — why: preferred port is now a path hash, so symlink/case variants must map to one server and one origin — cost if wrong: one extra realpath call per open.
- Preflight: Ruling: R4 B1 graph adds N4 node links: `viewGraph` returns `links: [{ from, to, kind, label }]` (valid links only, from `linkTable(work).links`, via core/index/query.js contract — or core/links/graph.js directly to avoid the node:sqlite warning) when `features.links` is on, `links: null` when off; Graph.jsx draws them as node→node edges; +1 test (links on/off) — why: N4 hand-off says the graph's node links use this contract; feature check is the caller's job — cost if wrong: an extra optional field the screen ignores.
- Preflight: Ruling: R5 B5 attaches N3 via the query contract, each part behind its own existing toggle: `viewBlocks(root)` keeps the plan fields (`anchors` [+kind, number, label, caption], `refs` [+label], `problems` = blockCatalog problems) and adds `footnotes`, `citations` (blocks), `bibliography` (bibliography feature, evidence records via readLedgerView, null when off), `terms` (termIndex feature, occurrence records only when occurrences on, null when off); when `blocks` is off the block parts are null; when all three (blocks, bibliography, termIndex) are off → FEATURE_DISABLED. Reader segments split via `parseNodeMarks` start/end (anchor, blockRef, plus footnoteRef, citation); viewNode attaches `nodeId` and `label` (label null when blocks off) to blockRef segments; plan's deepEqual expectation is extended with `label`, never loosened — why: N3 hand-off recommends attaching, and parseNodeMarks avoids writing the grammar twice — cost if wrong: a larger blocks payload and screen; rework is local to blocks-view/segments/Blocks.jsx.
- Preflight: Ruling: R6 B6 snapshot uses `optional(() => viewBlocks(root))` (blocks screen may be FEATURE_DISABLED under R5) — cost if wrong: none (null = screen hidden, same as checkSets).
- Preflight: Ruling: R7 M6a hand-off items that the M6a rulings assign to M6b become an extra Task H after B7, before the final review: token removed from address bar (history.replaceState) and empty `?token=` falls through to the stored token; React error boundary; dev proxy Origin fix + README dev note; SVG opened from a blob: URL (M3) — keep it inside sandbox; tests for rollback, WORK_LOCKED, HEAD, Origin null, oversized asset where cheap. Implementer sonnet, review opus (server security) — why: M6a rulings say "이 네 가지는 손대지 않았으니 M6b에서 처리한다" — cost if wrong: extra ~1 task of scope; all small and reversible.
- B1: BASE c8223aa; implementer m6b-impl-B1 (sonnet, id a86965f97392e8b02)
- B1: implementer DONE_WITH_CONCERNS a1576c1 (1074 tests, viewer 8); plan lines changed only by ruling (R3 import, R4 comment, R4 Graph edges); re-fitted index.js, api.js, registry.js
- Task B1: Ruling: R4b graph nodes also include link endpoints (nodes with a valid link in or out when links is on), so a link-only work (gamebook) shows its node links; plan graph test unchanged (fixture has no links) — why: implementer concern: links whose endpoints have no entity edge were returned by the API but never drawn — cost if wrong: a few extra nodes in the graph of linked works.
- Task B1: Ruling: plan-mandated I1 (graph colours load under key `folio-colors:` before /api/work resolves, so they do not persist on reload at #/graph) — fix beyond the plan code: render Graph only once the outline title is known and remount on title change (key=title) — why: the brief's own manual check is "새로 고침해도 남는지" — cost if wrong: one guard line in App.jsx/Graph.jsx.
- Task B1: minor (deferred): Graph.jsx layout() effect has no cancel guard (stale layout could overwrite; data loads once)
- Task B1: minor (deferred): fallback port changes the origin so stored colours are not seen that session (inherent to V4/V13)
- Task B1: minor (deferred): no pure test for Graph.jsx flow building (V17: screens are manual)
- Task B1: Ruling: graph links carry `index` too ({ from, to, kind, label, index }) for stable edge ids — cost if wrong: one extra field.
- Task B1: fix round 1/5 (4 addressed, 0 open — colours key before title, link-only endpoints, realpathSync.native, stale port comment; commits a1576c1..9279630)
- Task B1: complete (commits c8223aa..9279630, review clean; 1074 tests, viewer 8; ruling-changed: view-routes-m6b.test.js, graph-view.test.js, graph-view.js, Graph.jsx, App.jsx; re-fitted: core/view/index.js, server/view/api.js, server/view/registry.js)
- B2: BASE 9279630
- B2: implementer DONE 97040ee (1077, viewer 8); whole-file blocks SAME; re-fitted index.js, api.js, App.jsx (applied by hand context)
- Task B2: minor (deferred): promise-board.js calls dormantPromises with default spans; a work.yaml checks.<novel.promise-dormant>.config (C0 checkConfig) span can make the board's ⏳ disagree with the check (plan-mandated)
- Task B2: minor (deferred): events on ordered:false nodes (order none, front/back) are dropped silently; no test with an ordered:false node on the board
- Task B2: minor (deferred): PromiseBoard.jsx long names overflow the 150px label column (cosmetic)
- Task B2: complete (commits 9279630..97040ee, review clean; 1077 tests, viewer 8; re-fitted: core/view/index.js, server/view/api.js, viewer/src/App.jsx, test/server/view-routes-m6b.test.js context)
- B3: BASE 97040ee
- B3: implementer DONE 4c5a9c7 (1079, viewer 8); whole-file blocks SAME; re-fitted index.js, api.js, App.jsx, view-routes test context
- Task B3: minor (deferred): CheckSets.jsx <tr className="locked"> has no CSS rule (🔒 text still shows) (plan-mandated)
- Task B3: minor (deferred): check sets screen never renders `origin`, so a check running without a selected set (user check, includeAllHardChecks, work.yaml checks) shows a blank sets column; C0 per-work config not shown (plan-mandated)
- Task B3: minor (deferred): no test for a severityOverride row or a user check set
- Task B3: complete (commits 97040ee..4c5a9c7, review clean; 1079 tests, viewer 8)
- B4: BASE 4c5a9c7
- B4: implementer DONE 5e72d4d (1082, viewer 8); controller compare found Sources.jsx curly quotes straightened (lesson 1) → pre-review fix cf2b428, now SAME. Controller `plus` check: all plan diff + lines present except superseded/ruled ones (api.js import lists carry viewerStillOn; registry preferredPort R3; App graph line B1 ruling; route.js lines superseded by later tasks)
- Task B4: minor (deferred): nav links for feature-gated screens (근거) are drawn even when the feature is off; click lands on a FEATURE_DISABLED error; LoadState does not show details hint
- Task B4: minor (deferred): /api/evidence/:node not gated on `sources` (no parent link in FEATURE_PARENTS); Reader Claims link to a 403 source screen when sources off, evidence on (plan-mandated)
- Task B4: minor (deferred): route test "without writing" asserts no write; no truncation test (>200,000 chars); Claims renders nothing silently when null
- Task B4: complete (commits 4c5a9c7..cf2b428, review clean; 1082 tests, viewer 8; controller pre-review fix of retyped quotes)
- Preflight addendum: Ruling: R5 detail spec written to task-B5-ruling.md (two commits: plan first, then N3 attach) — cost if wrong: see R5.
- B5: BASE cf2b428
- B5: implementer DONE 83f8126 (plan, 1085, compare SAME verified by controller on that commit) + 304e642 (R5 N3 attach, 1089, viewer 8); ruling-changed: blocks-view.js, Blocks.jsx, blocks-view.test.js (+label key), segments.js, node-view.js, Reader.jsx
- Task B5: minor (deferred): blocks-view.js ledgerFor duplicates server/tools/find.js ledgerFor (could live in core/view/ledgers.js)
- Task B5: minor (deferred): viewNode runs whole-work blockCatalog per read (cost on large works)
- Task B5: minor (deferred): no CRLF/overlap segments test, no tampered-ledger test for blocks; Segment typedef lacks viewNode-added fields; bibliography citedIn links show raw node id; duplicate anchors → duplicate DOM ids (plan)
- Task B5: complete (commits cf2b428..304e642, review clean; 1089 tests, viewer 8)
- B6: BASE 304e642
- B6: implementer DONE f9e7139 (1095, viewer 11, build ./static paths); compare SAME except snapshot.js (R6 one line); features re-fit per R1 verified by controller; root package files unchanged

## Codex recovery — 2026-10-01
User instructed continuing all three interrupted lanes. Existing worktree changes are preserved. Pending review gates resume before downstream tasks. New original Codex work uses truthful authorship; plan-generated Claude code retains its contribution trailer. Main integration will be prepared after lane validation.

Task B6: recovered independent review found Important JSON replacement-token corruption and disabled blocks null response. Ruling: use a replacement callback and the existing whole() error contract, with regression tests — plan code violates original text preservation and feature-off behavior — cost if wrong: localized HTML embedding and null-response changes.
Task B6: fix round 1/5 (2 Important findings addressed, no regressions; f9e7139..bfeed8d). Spec and quality approved independently. Full check1096, viewer11, build pass; logs /tmp/folio-m6-b6-fix.
Task B6: complete (commits304e642..bfeed8d, review clean).
Task B7: recovery dispatch. B7 implemented bc4bd39; acceptance1 and full1097 pass; task review pending.
Task B7: independent review requires acceptance coverage for home/outline, source detail and evidence endpoints. Ruling: add those three real API calls with a synthetic source and assert403 on locked refusal — explicit all-screen API completion criterion exceeds the plan test block — cost if wrong: small integration coverage expansion, no runtime change. Fix round1 pending.
Task B7: fix round1/5 (missing APIs and403 addressed; bc4bd39..59cf5ab); independent spec/quality approved; acceptance1+full1097pass.
Task B7: complete (commitsbfeed8d..59cf5ab, review clean). TaskH remains before final branch review/manual verification.
Task H: implemented61bb263+42a2eee; full1101,viewer13,build+realdevproxyPOSTpass. Independent spec+quality approved; proxy preserves401token+403Origin. Rollback afterwrite/reopenfailure untested because no deterministic existing seam (brief permits), retained as limitation.
Task H: complete (commits59cf5ab..42a2eee, review clean). ManualUI and finalbranchreview remain.
ManualUI: syntheticM5copy via IAB: name Hana→definition→ep002, lockedstages have no controls, episodecritic off reason persisted in YAML, token removed from URL. Screenshot /tmp/folio-m6-stages.jpg.
Final review: Critical0/Important1 staticSVGsame-origin copy bypasses H4 isolation. Ruling: embed SVG as opaque dataURL in export mapping, do notpublish rawSVG files, preserve rastercopy and accuratefilecount — static screen safety must match live viewer — cost if wrong: SVG expands base64size aboutone-third, image display stays same. Single finalfix wave pending.
Static browser QA: generic local static host, latest Node24 export of a synthetic novel copy. Two img-rooftop images render complete natural8x8, both src data:image/svg+xml;base64; read-only badge shown. Snapshot /tmp/folio-m6-static.jpg. No raw SVG exported (unit regression); did not execute script or claim top-navigation behavior.
Final fix wave:42a2eee..eb8d5b0, I1 ADDRESSED, independent spec+quality PASS, no new required fixes. Full1102/viewer13/build supportedNode24. M6b runtime complete; record export and integration remain.
```

### 최종 검토 원문

# M6b 최종 전체 브랜치 리뷰

범위: `c8223aa..42a2eee`, 읽기 전용 검토. 전체 변경 패키지의 파일·커밋 목록, 변경 런타임 모듈, 관련 테스트·계약, 계획 설계/결정, progress 판정과 B6/B7/H 보고서를 대조했다. Standards와 Spec 축을 모두 확인하되 추가 에이전트·소스 수정·브라우저·전체 테스트 재실행은 하지 않았다. root가 보고한 root 1101 / viewer 13 / build 통과를 검증 기준으로 사용했다.

## 필수 수정

Critical: 0. Important: 1.

### I1 — 정적 내보내기에서도 SVG 문서의 동일 출처 실행을 차단해야 한다

- 위치: `server/view/export.js:67–70`, `viewer/src/components/Status.jsx:20–22,40–41`.
- 명세: 계획 「서버와 보안」의 “그림은 `sandbox` CSP”, V14의 “같은 화면을 정적 파일로 내보내 쇼케이스로”, H4의 “SVG opened in its own tab ... runs as the viewer origin ... Fix ... show it from a data: URL ... opaque origin”. H4의 토큰 유출 시나리오는 라이브 서버이지만, 같은 비신뢰 SVG가 실행 가능한 동일 출처 문서로 바뀌는 원인이 정적 경로에 남는다.
- 증거: export는 `readAssetFile`의 SVG 바이트를 수정 없이 `assets/<id>.svg`에 쓰고 스냅숏에 그 상대 URL을 넣는다. 정적 API의 `assetUrl`은 이를 그대로 반환한다. `AssetImage`는 fixed URL이면 H4의 data URL 변환 effect를 생략하고 `<img src={fixed}>`를 만든다. 일반 정적 호스팅에는 라이브 서버의 ASSET_CSP 응답 헤더가 없다. 따라서 그림을 새 탭에서 열면 SVG의 script가 호스팅 origin의 문서로 실행될 수 있다. 단순 `<img>` 표시 자체에서 script가 실행된다는 지적은 아니다.
- 집중 재현: 임시 `novel-3level` 복사본의 SVG에 문서 attribute만 설정하는 합성 `<script>`를 넣어 내보냈다. 결과 `{ "staticAssetUrl": "assets/img-rooftop.svg", "scriptCopiedVerbatim": true }`. 원본 fixture와 저장소 소스는 바꾸지 않았으며 임시 폴더는 지원 helper의 종료 정리로 제거했다. 지시대로 브라우저 실행은 하지 않았다.
- 영향: 공유할 정적 사이트의 다른 페이지/저장소 등 동일 출처 권한을 SVG가 얻을 수 있다. 내보낸 뷰어에 Folio 토큰이 없다는 점은 이 동일 출처 실행을 차단하지 않는다.
- 수정: 정적 경로에서도 SVG를 opaque-origin data URL로 제공하고 직접 열 수 있는 실행 가능한 `.svg` 원문 파일을 남기지 않거나, 동등하게 SVG 문서 실행을 차단하는 자급적인 산출물 방식을 적용한다. 외부 호스팅의 미지정 CSP에 의존하지 않는다. 합성 script 포함 SVG로 정적 API의 안전한 URL 및 실행 가능한 원문 파일 부재를 고정하고, 일반 정적 서버에서 그림 열기 QA를 추가한다. 기존 “SVG 원문 그대로 복사” 테스트는 이 보안 판정에 맞게 강화해야 한다.

## 보류 항목 판정

- C0 휴면 기한 불일치: 실제 표시 불일치가 가능한 후속 개선이다. `promise-board.js:42`는 기본값을 쓰고 `packs/novel/checkers/promise-dormant.js:62–65`는 작품 config를 합친다. 다만 보드는 검사 실행 결과가 아닌 기본 휴면 투영이고 기한 수치도 표시하며, 현재 B2 계약이 검사별 config 일치를 요구하지 않는다. 잠금 `foldPromise`는 공유되고 advisory 판정으로 잠금을 바꾸지 않으므로 이번 필수 수정으로 승격하지 않는다. 후속 작업에서는 적용 기한 출처 표시 또는 유효 검사 설정 사용을 명시적으로 결정할 것.
- ordered:false 사건 제외: N4의 `positions.ordered`를 쓰라는 인계와 일치한다. 순서를 갖지 않는 사건을 임의의 타임라인에 섞지 않는 현재 동작은 결함으로 판단하지 않는다. 보드 설명/비순서 사건 개수와 합성 테스트 추가는 개선이다.
- Graph layout의 취소 guard 부재, N4 links를 ELK 입력에는 넣지 않는 점: 데이터가 한 번 로드되는 현 구조에서 필수 회귀 근거 없음. N4 링크 양 끝 노드와 ReactFlow edge 자체는 존재한다. 큰 연결 전용 작품의 배치 품질 개선 대상으로 남긴다.
- 색상 저장의 fallback-port origin 변경: 승인 V4/V13의 한계. 작품 제목 확정 후 Graph를 mount하는 기존 수정은 reload 요구를 충족한다.
- 검사 세트 origin/config 미표시, `.locked` 전용 CSS 없음: 결과 검사·등급·자물쇠는 표시한다. config 편집은 읽기 전용 범위 밖이고 origin 상세 표시 요구도 없어 비차단 개선이다. severityOverride/user-set 추가 테스트는 유용하지만 구현 결함 증거는 없다.
- 꺼진 기능의 nav/자료 링크, Claims의 null/error 무표시: 안내 UX 개선. sources와 evidence는 현재 별도 feature이며 부모 관계가 없으므로 evidence API를 sources로 추가 차단하는 변경은 명세 변경이다. 정적 blocks null은 이미 `STATIC_UNAVAILABLE`로 수정됨.
- blockCatalog 비용, ledgerFor 중복, Segment typedef, duplicate anchor DOM id, CRLF/overlap/깨진 기록장 추가 테스트, 긴 레이블: 성능·유지보수·표현 개선. N3 기능별 null, 본문 조각 원문 보존, catalog 번호/참조 계약 위반은 발견하지 못했다.
- 내보내기 `rm(target)` 뒤 `rename(temp,target)` 구간 및 강제 종료 임시 폴더: 기존 export를 원자 교체하지 않는 알려진 한계. 정상 실패 이전에는 marker/lstat 검사가 사용자 폴더와 symlink를 거부하고 temp에서 완성한다. 실패 복구·동시 export 직렬화는 후속 내구성 개선으로 남긴다.
- H5 rollback byte-for-byte 테스트 미검증: 브리프가 명시적으로 허용한 예외이며 보고에 드러나 있다. 새 쓰기 경로가 추가된 것은 아니므로 이번 필수 수정으로 승격하지 않는다.

## 통과한 계약 및 한계

읽기 조회는 core 내 모델/네트워크·index.db·작품 잠금 쓰기를 추가하지 않는다. 새 export feature는 FEATURES/FEATURE_PARENTS 끝에 추가하고 RUN_FEATURES는 유지했다. 토큰/Host/Origin·잠금 단계 거부 경로를 완화하지 않았고, H4 라이브 SVG data URL 처리는 정적 경로를 제외하면 설계대로다. 내보내기 토글 금지, `<` 이스케이프와 replacement-token 보존, 비소유 폴더 덮어쓰기 거부가 구현·테스트에 있다. N3/N4 선택 기능과 보드의 기존 잠금 접기 함수 연결도 유지됐다.

수동 UI/브라우저 안전성의 실제 동작 확인은 root의 별도 QA에 맡겼다. 따라서 이 보고서는 I1의 파일·URL 경로 재현을 확인했으며 실제 browser script 실행까지 관찰했다고 주장하지 않는다.


### 최종 수정 근거

# M6 final fix wave 보고 — 2026-10-01

상태: DONE_WITH_CONCERNS. 최종 리뷰의 Critical 0건, Important 1건(I1) 중 I1의 파일·URL 경로를 수정했다. 기준 커밋은 `42a2eee`이다. 정적 호스팅 브라우저 수동 QA는 실행하지 않았으므로 실제 브라우저의 새 탭 동작을 관찰했다고 주장하지 않는다.

커밋: `eb8d5b0` (`fix(view): isolate SVG in static exports`, Codex <codex@openai.com>, 작업 소스·테스트·문서 4개 파일만). 허위 공동저자 trailer는 넣지 않았다. 이 보고서는 `.superpowers/` 기록이므로 커밋하지 않았다.

## 수정과 판정

- `server/view/export.js`: SVG 바이트를 base64 `data:image/svg+xml` URL로 `assetFiles`에 넣고, 실행 가능한 원본 `.svg` 파일은 산출물에 쓰지 않는다. 라이브 뷰어 H4와 같은 opaque-origin 방식을 정적 내보내기에 적용했다. PNG/JPEG/WebP/GIF는 종전처럼 파일로 복사한다.
- `files`는 실제 화면 빌드 파일과 실제로 복사한 raster 파일만 센다. `assets`는 SVG data URL을 포함해 매핑된 그림 수를 센다. `.folio-export` 표시는 종전과 같이 파일 수에 넣지 않는다.
- `test/server/view-export.test.js`: 기존 SVG 원문 복사 기대를 새 안전 계약으로 바꿨다. 임시 합성 작품의 스크립트 포함 SVG가 data URL로 매핑되고 디코딩한 바이트가 원본과 같으며 원본 `.svg` 경로는 없는지 검증한다. 같은 내보내기에서 PNG 바이트 복사와 `files: 3, assets: 2`를 검증한다. 기존 fixture는 수정하지 않았다. JSON에 포함된 SVG의 `<`는 기존 `embedSnapshot` 이스케이프를 거쳐 파싱되며, 바이트 왕복 테스트가 이를 확인한다.
- `skill/folio/references/viewer.md`, `viewer/src/lib/static-api.js`: SVG data URL과 raster 파일 경로의 실제 동작을 설명한다. 정적 API는 `assetFiles` 값을 그대로 반환하므로 런타임 분기 변경이 필요 없었다.

## TDD와 최종 검사

- RED: Node 24에서 `node --test test/server/view-export.test.js` → 6개 중 4개 통과, 2개 실패. 기존 코드는 SVG를 파일로 세어 `files: 3`/`files: 4`를 반환했다.
- GREEN: 같은 집중 테스트 → 6/6 통과.
- 최종 `npm run check` → lint·typecheck 통과, root 테스트 1102/1102 통과. 설명 수정 뒤 재실행한 최종 결과다.
- 최종 `npm --prefix viewer test` → 13/13 통과.
- 최종 `npm --prefix viewer run build` → 성공. 기존 Graph 청크 500 kB 초과 경고만 있다.
- `git diff --check` 통과. 수정 파일은 모두 300줄 이하다. 의존성·잠금 규칙·서버 CSP·B6의 폴더 소유권 및 symlink 검사에는 변경이 없다.

## 최종 리뷰 나머지 항목

최종 리뷰의 보류 항목은 이번 한 파동에 포함하지 않았다. C0 휴면 기한 출처 불일치는 후속 보드 표시/설정 결정이 필요하다. `ordered:false` 사건 제외는 N4 인계와 일치한다. 그래프 배치 취소 guard/N4 링크 배치, 색상 저장 origin, 검사 세트 origin 표시, 잠금 CSS, 꺼진 기능 안내, Claims null/error 표시, 블록 비용·중복 계산·타입·DOM id·추가 케이스·레이블은 최종 리뷰의 비차단 개선 판정을 유지한다. 기존 `rm(target)`/`rename(temp,target)` 구간 및 강제 종료 임시 폴더 한계와 H5 rollback byte-for-byte 테스트 미검증도 그대로다. 이 보류 항목을 해결했다고 주장하지 않는다.

수동 정적 서버 QA와 실제 브라우저의 새 탭 확인은 수행하지 않았다. 자동 테스트는 정적 산출물에 원본 SVG 파일이 없고 매핑이 data URL인 사실까지 검증한다.


### 수정 재검토

# M6 최종 수정 재검토 — 2026-10-01

범위: `42a2eee..eb8d5b0`의 4개 파일. HEAD `eb8d5b059b5d2c64ddb2d3d665cd5132e3297cf9`와 제공된 diff, AGENTS.md, final-review.md, final-fix-brief.md, task-final-fix-report.md를 대조했다. 수정의 소비 경로인 `core/view/asset-file.js`, `viewer/src/lib/static-api.js`, `viewer/src/components/Status.jsx` 및 페이지 CSP도 확인했다. 소스 변경·추가 에이전트·기존 테스트 재실행은 하지 않았다.

## I1 판정: ADDRESSED

`server/view/export.js:67`에서 `image/svg+xml`을 base64 data URL로 매핑한 뒤 `continue`하므로, SVG는 원문 파일 쓰기 경로에 도달하지 않는다. `createStaticApi().assetUrl()`은 이 매핑을 그대로 반환하고 `AssetImage`의 fixed URL 분기가 이를 `<img src>`로 전달한다. 따라서 원래 지적한 호스팅 출처의 `assets/<id>.svg` 문서로 열리는 경로가 제거되고, data URL의 별도 출처 방식이 정적 내보내기에도 적용된다. SVG 바이트 자체를 정화했다거나 모든 문맥에서 스크립트 실행이 불가능하다는 판정은 아니다. I1의 핵심인 호스팅 출처 권한 획득 경로를 없앤 수정이다.

내보내기는 기존 출력 폴더 전체를 새 임시 폴더로 교체하므로, 정상적으로 다시 내보낸 결과에 과거 SVG 파일이 남는 경로도 추가되지 않았다. 외부 정적 호스팅의 별도 CSP 설정에 의존하지 않는다.

## Spec: PASS

- 합성 스크립트 포함 SVG에 대해 data URL 형식, 디코딩 바이트 보존, 원본 `.svg` 경로 부재를 검증하는 회귀 테스트가 추가됐다.
- 같은 테스트에서 PNG 복사 및 파일/그림 개수를 함께 고정했다. SVG가 파일이 아니므로 `files`에서 제외하고 `assets`에는 포함하는 구현과 기대값이 일치한다.
- base64 값에는 HTML 종료 태그를 구성하는 `<`가 없으며, 기존 `embedSnapshot`의 JSON 이스케이프·replacement callback도 유지된다.
- 정적 API와 참조 문서 설명을 실제 산출물 계약에 맞게 갱신했다. 요청하지 않은 기능 확장은 없다.

새 명세 결함 0건. 일반 정적 서버의 새 탭 브라우저 QA는 수정 보고서에서 미수행으로 명시되어 있으며, 이 재검토에서도 직접 관찰하지 않았다. controller가 별도 수행 중인 QA 결과는 이 판정의 관찰 근거로 선반영하지 않는다.

## Standards / 품질: PASS

새 Critical 0건, Important 0건. 수정 범위에서 새로운 회귀나 필수 품질 수정 사항을 발견하지 못했다. SVG 분기는 내보내기 책임 안에 있고 기존 안전한 파일 읽기 경로를 사용한다. 실제 파일을 쓰는 raster 분기에서만 파일 수를 증가시켜 매핑 수와 파일 수를 분리했다. 기존 폴더 소유권·링크 거부·오류 정리·잠금·core 경계에는 변경이 없다. 수정 파일은 각각 87/20/92/47줄로 모두 300줄 이하이며, 실제 작품이나 생성 결과물을 추가하지 않았다.

기존 final-review.md의 보류 항목은 이번 수정에서 다루지 않았고, 비차단 판정을 유지한다. 특히 기존 출력 폴더 제거 후 rename 구간의 내구성 한계와 H5 rollback 검증 공백을 해결했다고 해석하지 않는다.

## 검증 근거와 한계

수정 보고서의 집중 테스트 RED 4/6 → GREEN 6/6, 최종 lint·typecheck/root 1102/1102, viewer 13/13, build 성공, diff check 통과를 재검토 근거로 사용했다. 같은 테스트는 반복하지 않았다. controller가 확인해 전달한 실행 환경은 `/path/to/node-runtime/bin/node` (`v24.19.0`)이며, 해당 `bin`을 PATH 앞에 두어 npm을 실행했다. 이 재검토자가 직접 그 검사를 재실행한 결과는 아니다.

최종 판정: **I1 ADDRESSED, Spec PASS, 품질 PASS. 수정 범위에서 새 필수 수정 없음.** 실제 브라우저 QA의 완료 여부는 controller의 별도 기록을 따른다.
