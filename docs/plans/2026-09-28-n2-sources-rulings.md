# N2 자료 근거 — SDD 기록과 판정 (2026-09-28)

계획: `docs/plans/2026-09-28-n2-sources.md`. 이 파일은 실행 기록장(`.superpowers/sdd/.../progress.md`)을 옮긴 것이다. `Ruling:` 줄은 계획과 다르게, 또는 계획을 넘어서 정한 것이다. `minor (deferred)`는 미룬 사소한 문제다. 최종 리뷰(opus)는 모든 판정에 동의했다. 싼 항목은 최종 수정 한 번(`61801d9`)에 묶어 고쳤다.

## 결과

- `npm run check` 715/715. 시작은 669, 계획 예상은 705다. 판정으로 A1·B3에서 +4, 최종 수정에서 +6이 늘었다.
- `test/acceptance/n2.test.js` 7/7 (N2-1 ~ N2-7, MCP stdio).
- 알아 둘 동작
  - `SOURCE_FILE_INVALID`(링크이거나 보통 파일이 아닌 원본)와 `SOURCES_DIR_INVALID`(`sources/`가 링크) 오류는 `openWork`에서 `WORK_INVALID`로 나온다. 이때 작품 전체가 열리지 않고, `features.sources: false`로도 풀리지 않는다.
  - `RUN_FEATURES`가 늘었다. 그래서 업그레이드 전에 열려 있던 실행은 한 번 `pipeline_changed`로 다시 시작한다.
  - `sources.numbers-match`는 NFKC 때문에 오탐이 난다(㎡·² → 2, ① → 1). 그래서 참고 의견으로 둔다.
- 후속 과제
  - 해결(`420f83f`, 사용자 확인 뒤): `test/run/extract-claims.test.js`의 토글 꺼짐 테스트가 sources 팩이 있는 작품을 쓴다. 조건을 빼면 실패함을 확인했다. `generate.js`·`features.js` 주석도 고쳤다.
  - 코어 `stamp`의 severity 문제는 N1에서 넘어온 과제로 그대로 남아 있다.

## 기록장


Start: HEAD 15f56fc (decision 19 = folio_status evidence, user commit). npm run check 669/669.
Spec: plan "설계 요약" + canonical artifact §13/§16/§12/§03 (read 2026-09-28, consistent: §16 folio_status shows 다시 확인 필요).
Expected cumulative tests (plan 자기 점검): A1 674, A2 680, A3 683, B1 690, B2 692, B3 698, C1 705.
Untracked docs/plans/2026-09-28-roadmap-*.md are the user's — not ours, never add.

## Pre-flight scan (plan code already run in temp copy → interfaces focus)
| Pair / task | Produces → consumes | Found |
|---|---|---|
| A1 → A2 | validateClaims(work,text,claims), EVIDENCE_LEDGER | match (A2 Consumes) |
| A1 → A3 | latestByNode, checkSourceQuote, reanchor(M4) | match |
| A1 → B3 | isTextSourceFile, readEvidence, evidenceStates, staleEvidence; addSourceFile is pre-existing core/store/sources.js | match (B3 lists addSourceFile under "A1" but it already exists — naming only) |
| A2 → A3 | run.outputs.events.claims / submittedClaims, env.ledgers.evidence | match; both edit core/run/runner.js sequentially (A2 ledgers, A3 ctx.evidenceRecords) |
| A2 → B3 | submitEvidence(root,{nodeId,claims},{now?}), EVIDENCE_INVALID | match |
| A2 → B2 | extract payload evidence.wanted | match (prompts only reference real payload fields — N1 ruling) |
| A3 → B1 | ctx.claims [{quote,sources[{sourceId,quote}]}], work.sources Map | match |
| A3 → B2/C1 | payload sources[{id,title,date,reliability,spans}] | match |
| B1 → B2/C1 | sets sources.citations/review, pack `sources`, check ids | match |
| B1 ↔ B2 | both edit test/pack/knowledge-pack.test.js (B1 line 33 pack list, B2 preset lines) | sequential, no conflict |
| B2 ↔ B3 | both edit server/tools/definitions.js (B2 folio_init preset text, B3 folio_sources) | sequential |
| B3 → C1 | folio_sources ops, folio_status.evidence, 11 tools | match; decision 19 revised (15f56fc) → B3 core/status.js + status test present in brief |
| Each task self-consistency | tests vs code, Files vs git add | plan 자기 점검 says verified in temp worktree (705/705) |
No conflicts → no preflight rulings.

Task A1: implemented 0e80639 (674/674). Review (opus): spec ✅, quality needs fixes.
Task A1: Ruling: readSources follows symlinks in sources/ (plan-mandated readFile) — fix: open original with O_NOFOLLOW|O_NONBLOCK + fstat isFile(); a link/non-regular original becomes error { code: 'SOURCE_FILE_INVALID', id, file } and is skipped like SOURCE_FILE_MISSING — decision 3's goal (no outside file via one meta line / folio_sources get text) is otherwise open; add (decision 17) already refuses links — cost if wrong: an author who symlinks a source gets a work error and must copy the file instead.
Task A1: minor (deferred): checkSourceQuote re-NFCs whole source text per link (10MiB × 200×20 ≈ 15s in validateClaims/evidenceStates; hits folio_status).
Task A1: minor (deferred): quote length limit measured before NFC; claim side has no NFC matching (NFD claim quote → CLAIM_QUOTE_NOT_FOUND) while source side NFCs.
Task A1: minor (deferred): non-object link (string/null/array) reported as CLAIM_SOURCE_UNKNOWN not shape error (validate.js).
Task A1: minor (deferred): link dedup by raw string, NFC/NFD twins both kept, NFD stored raw.
Task A1: minor (deferred): isPlainObject duplicated in evidence/records.js, evidence/validate.js, occurrences/records.js.
Task A1: minor (deferred): attack cases (sub/, backslash, NUL, "", numeric file, non-object link, bad ledger context types) not pinned by tests.
Task A1: fix round 1/5 (1 addressed, 0 open — readSources symlink refusal SOURCE_FILE_INVALID; commits 0e80639..6cd36ca) — opus re-review, 675/675.
Task A1: minor (deferred): sources/ directory itself as symlink outside work is still followed (O_NOFOLLOW only last component) — final review to triage.
Task A1: minor (deferred): hard links inside same FS read as regular files (would need nlink check).
Task A1: complete (commits 15f56fc..6cd36ca, review clean). Tests 675 (plan 674 +1 ruling test → later expectations +1).
Task A2: implemented 43aed42 (681/681).
Task A2: review (opus): spec ✅, quality approved; all attacks held (toggles off → core.promise-order in receipt, draftHash = commit hash).
Task A2: minor (deferred): no regression tests for forged outputs.events.claims → evidence_not_recorded, double record same receipt, recheck extract evidence.wanted false, claims null/'x'/201.
Task A2: minor (deferred): core/evidence/record-run.js skeleton repeats core/occurrences/record-run.js (~12 lines, not verbatim).
Task A2: minor (deferred, info): RUN_FEATURES grew → pre-upgrade open runs restart once with pipeline_changed; committing runs unaffected.
Task A2: complete (commits 6cd36ca..43aed42, review clean). Tests 681.
Task A3: implemented 75daf66 (684/684).
Task A3: review (opus): spec ✅, quality approved; 6 attacks held.
Task A3: minor (deferred): evidence/scope.js:26 ledger-sourced claims not link-deduped (tampered-but-hash-valid record → duplicate link in ctx; refs once).
Task A3: minor (deferred, plan-mandated, same as M4): broken evidence ledger with evidence on → LEDGER_TAMPERED blocks all runs; status survives; evidence:false unblocks.
Task A3: minor (deferred): sources:false still carries claims[].sources[] {sourceId, quote} in model-check payload — matches decision 10 (claims belong to `evidence`, payload `sources` to `sources`); no titles/meta leak.
Task A3: minor (deferred): test gaps — not-stale right after commit, nearest-ancestor order with several ancestors, runner "extract claims override ledger".
Task A3: minor (deferred): payload.js non-object spans entries become {id:null, quote:null}.
Task A3: complete (commits 43aed42..75daf66, review clean). Tests 684.
Task B1: implemented fd1d9da (691/691).
Task B1: review (opus): spec ✅, quality approved; lock/severity attacks held (hard → USER_CHECK_SEVERITY_INVALID, promise-order survives off/[] sets, packs:[sources] → PACK_PIPELINE_MISSING).
Task B1: minor (deferred): numbersIn NFKC false positives (㎡/² → 2, ① → 1), dates as one token, 1.50 ≠ 1.5.
Task B1: minor (deferred, cheap): init.js/yaml-schema.js — third-party pack with presets but no pipelines lands in packPresets; filter should key on pipelines (decision 9 intent). Built-ins unaffected.
Task B1: minor (deferred): claimsOf doesn't filter malformed links (sources:[null] → checkers disagree; Object.create(null) quote throws in numbersMatch); core only passes strings.
Task B1: minor (deferred, known limit): pack digest ignores helper claims.js changes.
Task B1: minor (deferred): stale half-sentence in task-B1-report.md (workspace only).
Task B1: complete (commits 75daf66..fd1d9da, review clean). Tests 691.
Task B2: implemented 0c1bf91 (693/693).
Task B2: review (sonnet): spec ✅, approved, no findings.
Task B2: complete (commits fd1d9da..0c1bf91, review clean). Tests 693.
Task B3: implemented 2a67968 (699/699).
Task B3: review (opus): spec ✅, quality needs fixes. ⚠️ main-ledger-broken early return omits `evidence` key (same as existing occurrences shape) — checked: plan decision 19 covers evidence-ledger breakage only; consistent with M4, not a gap.
Task B3: Ruling: a `sources/` that is a symlink (or any non-directory) is refused on both read and write — one helper in core/store/sources.js lstat's `sources/`; readSources reports { code: 'SOURCES_DIR_INVALID' } and returns no sources; addSourceFile/writeSourceMeta/addSource throw FolioError SOURCES_DIR_INVALID before any write — B3 turned the A1 deferred read leak into writes outside the work (attacks-B3/a3-writes.mjs); decision 17's "never leave sources/" requires it; also closes A1 deferred minor — cost if wrong: an author who keeps sources/ as a symlink (e.g. shared library) must use a real folder.
Task B3: Ruling: `add` with a `.yaml` extension (plan-mandated sanitizer) collides with the meta `<id>.yaml` → always EEXIST and a crash can leave outside bytes as meta — treat extension `yaml` like invalid → copy name `<id>.bin` — cost if wrong: YAML sources lose their extension (they were spans-only anyway; isTextSourceFile is .txt/.md).
Task B3: minor (deferred): wx EEXIST (dangling link/existing name) surfaces as INTERNAL_ERROR not SOURCE_EXISTS.
Task B3: minor (deferred): getSource fails whole with LEDGER_TAMPERED on broken evidence ledger while list/status return { ledger } (brief code).
Task B3: minor (deferred): add path accepts intermediate links/`..`; read.path echoes given string not realpath.
Task B3: minor (deferred): empty text rejected but 0-byte path file accepted.
Task B3: minor (deferred): 200k-char truncation in UTF-16 units can split surrogate pair.
Task B3: minor (deferred): test gaps — meta write failure cleanup, FIFO/device, linked sources/, link evidence toggle.
Task B3: minor (deferred): core/evidence/status.js repeats occurrencesStatus skeleton (7 lines).
Task B3: fix round 1/5 (2 addressed, 0 open — SOURCES_DIR_INVALID via lstat helper; .yaml → .bin; commits 2a67968..53aa792) — opus re-review, 702/702 (+2 ruling tests +1 extra defense test).
Task B3: minor (deferred): TOCTOU between lstat and mkdir/wx write if a concurrent process flips sources/ dir↔link (8918/22k in race repro); needs in-work attacker; names Folio-chosen; wx never overwrites.
Task B3: minor (deferred): writeSourceMeta accepts explicit path outside sources/ (test-only caller).
Task B3: complete (commits 0c1bf91..53aa792, review clean). Tests 702 (plan 698 → +4 from rulings; C1 expect 709).
Task C1: implemented ce316d2 (709/709, n2 7/7).
Task C1: review (sonnet): spec ✅ (byte-identical to brief, all 7 criteria asserted), approved.
Task C1: minor (deferred): n2.test.js N2-2..N2-6 lack stderr /Error/ doesNotMatch (only N2-1, N2-7 have it).
Task C1: complete (commits 53aa792..ce316d2, review clean). Tests 709.
Final review (opus, 15f56fc..ce316d2): with fixes. Critical none. Agrees with all rulings (note: SOURCE_FILE_INVALID/SOURCES_DIR_INVALID surface as WORK_INVALID from openWork — whole work won't open, features.sources:false doesn't lift it).
Final: Ruling: extract asks for claims (`evidence.wanted: true`) only when features.evidence && features.evidenceInExtract && the work's `packs` includes `sources` — with the plan's defaults every novel/knowledge work without the sources pack got evidence.wanted:true, so a host following SKILL.md adds claims and a bad quote opens a new EXTRACT_FAILED (hard) path for works that never use sources; decision 10 says what the toggle does but not that it applies to works with no sources pack, and nothing reads claims without it except the ledger — cost if wrong: a work that wants extract-time evidence links without the sources pack must add the pack or use folio_sources link.
Final: cheap-fix-now (one fix wave): claimsFor robustness to malformed run claims; core size cap for `text` add (MAX_SOURCE_BYTES on utf8 bytes); sources.md error guide adds SOURCES_DIR_INVALID/SOURCE_FILE_INVALID/SOURCE_META_INVALID (→ WORK_INVALID); B3 wx EEXIST → SOURCE_EXISTS; getSource on broken evidence ledger returns links:null + ledger like list/status; writeSourceMeta only accepts sources/<name>.yaml; n2.test N2-2..N2-6 stderr /Error/ check.
Final: leave (reasoned in final-review.md): A1 NFC perf (~1.2ms/link @1.2M chars), A1 NFC rules (M4 parity), A1 non-object link code, A1 link dedup, A1 isPlainObject dup, A1/A2/A3 test gaps, A2 record-run skeleton, A3 ledger-blocks-runs (M4 lock rule), A3 payload spans nulls, A3 sources:false claims, B1 numbers false positives (document), B1 packPresets filter (no third-party packs yet), B1 claimsOf links, B1 digest helper, B3 intermediate links (/tmp is a link on macOS), B3 0-byte path, B3 surrogate split, B3 status skeleton, B3 TOCTOU, A1 hard links. A2-3 restart + B1-1 false positives go into rulings doc.
Final: fix wave 61801d9 (715/715); opus re-review: 8/8 ADDRESSED, no asserts weakened, locks untouched.
Final: parked — test/run/extract-claims.test.js:67 "evidenceInExtract off (or evidence off)" is now vacuous (work has no sources pack → wanted false regardless), no run-level test pins the toggle with the pack present — Ruling: real, not load-bearing for code (generate.js:81 gate verified by reading), one-line setup fix (withSourcesPack + makeRunnerWithSources); no second fix wave per SDD, surfaced to user — cost if wrong: a regression dropping the evidenceInExtract condition would pass CI until fixed.
Final: minor (deferred): generate.js:24 JSDoc and features.js:9 comment omit the sources-pack condition.
Final: minor (deferred): record-run.js does not recheck the sources pack — removing `sources` from packs between extract and commit still records submitted claims (packs change likely restarts run via pipeline digest).
Notes for rulings doc: A2 — RUN_FEATURES grew, pre-upgrade open runs restart once (pipeline_changed). B1 — numbersIn NFKC false positives (㎡/² → 2, ① → 1); keep advisory. SOURCE_FILE_INVALID / SOURCES_DIR_INVALID surface as WORK_INVALID (whole work won't open; features.sources:false doesn't lift it).
N2 complete: 15f56fc..61801d9, 715/715 (plan 705; +4 rulings in A1/B3, +6 final fix wave).
