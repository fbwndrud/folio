# M4 등장 위치 — SDD 기록장과 판정

브랜치 feat/m4-occurrences에서 계획 docs/plans/2026-09-27-m4-occurrences.md를 실행하며 남긴 기록이다. 각 태스크의 BASE, 리뷰 결과, 판정(Ruling), 미뤄 둔 사소한 항목이 들어 있다. 판정이 계획의 해당 부분보다 앞선다.

사전 점검 표는 원래 작업 폴더의 preflight.md에 있었고 여기에 옮기지 않았다. 그 결론은 판정 P1~P11에 반영돼 있다.


Spec: https://claude.ai/artifact/WjJzcsjnQZnVxyyJZaxvcX (read at start). Baseline: d777c41+2b7f794 on feat/m4-occurrences, npm run check 470/470.
User: stop at M4 (after D3) with acceptance results. Lock/check/commit path task reviewers on strongest model with attack scripts. push/PR ask first. Features must be user toggles; locks never.
Ruling: work on branch feat/m4-occurrences in the main checkout (same as M3) — cost if wrong: trivial.

## Pre-flight scan — table: preflight.md (same dir; scratch-copy trial of plan code: tests + eslint + tsc)
Ruling P1: tsc must stay green; plan code is illustrative on types — implementers add JSDoc (options params `{ now?: () => string }`, `{ hooks?: { beforeWrite?: (i:number)=>any } }`), make resolveQuote's return a JSDoc discriminated union (`{ok:true,start,before,after}|{ok:false,code,count?}`) with before/after optional params, and update find.js/handlers JSDoc — cost if wrong: none (types only).
Ruling P2: A2 maskRanges('ab```\nx\n```') expectation is wrong (last line opens an unclosed fence) — replace with a text whose fence markers are not at line start, e.g. 'ab ``` x' unchanged — cost: none.
Ruling P3: B4 test uses a local minimal valid receipt helper (shape copied from test/core/receipts.test.js / makeReceipt with pipeline) instead of makeReceipt({features}) — cost: none.
Ruling P4: C1 test must not import applyRename (C3 does not exist yet); D3 M4-3 imports applyRename and drops unused `q` param — lint rules — cost: none.
Ruling P5: D2 (skill docs) is folded into D1 — skill-docs.test.js requires every tool to be mentioned, so D1 cannot commit green alone; D1 also adds folio_occurrences to tools.test.js:29 name list (not a count) — cost: one bigger task.
Ruling P6: C4 updates committed-without-record.test.js:51,:66 expected drift entries with `recommit: true` (plan decision 12 adds the hint; assertion unchanged otherwise) — cost: none.
Ruling P7: server import guard adds core/util/file-tx.js only; core/rename/apply.js is a public work-locked entry (like changeStructure/submitOccurrences) and server calls it — Global Constraints wording wins toward the code path D1 specifies — cost: none.
Ruling P8: pendingRechecks treats `feature` reason as recheck-resolvable: output entry `{ nodeId, checks, feature: { id, was, now } }` (like order) — recheck clears it since recheck records carry features — cost: small shape addition.
Ruling P9: validateRecheck also runs pushFeaturesProblems(record.features) (B4) — same rule as receipts — cost: none.
Ruling P10: C1 hardening: journal entries' backup names must match /^backup-\d+$/ and paths pass assertSafe before restore; success cleanup unlinks journal first (atomic) then rm dir; restore without journal only removes dir — a kill during cleanup cannot restore stale backups or lock out — cost: none.
Ruling P11: recordRunOccurrences failure after commitNode must not strand the run in `committing`: commit-step catches its error, pushes run.history {event:'occurrences_not_recorded', code}, and finishes done (occurrences are not lock data; missing record surfaces as nothing recorded → host resubmits) — cost: a silently missing record only visible in history.
Task A1: BASE 2b7f794
Task A1: complete (commits 2b7f794..96b51ed, review clean). 475/475
Task A2: BASE 96b51ed
Task A2: minor (deferred): fencedRanges/fencedLines duplicate the fence state machine (plan-mandated); no CRLF fence test.
Task A2: complete (commits 96b51ed..789ed03, review clean). 478/478
Task A3: BASE 789ed03
Task A3: review Needs fixes (opus, 18 attacks). Important (plan-mandated decision 4): reanchor accepts a unique match with zero/coincidental context → silently relocates onto another occurrence (rename would rewrite it).
Ruling A3-1: reanchor accepts a location only with context evidence — at least one side fully matches, where an empty stored `before` counts as full only when start===0 and an empty stored `after` only when the quote ends the text; no side full → stale reason 'WEAK_CONTEXT'. located = both sides full (same boundary rule). Ties → stale AMBIGUOUS. Overrides decision 4's "unique best → relocated" — spec §15 "못 찾으면 stale", "엉뚱한 곳을 가리키지 않는다" — cost if wrong: more stale marks → host resubmits.
Ruling A3-2: fix minors 1-3 now (Math.max → loop; non-string text → QUOTE_INVALID in resolveQuote / stale in reanchor, no String() coercion; reanchor non-string before/after/quote → stale 'INVALID'). Minors 4-6 deferred except tests for overlap, fence-spanning quote, sibling-deleted→stale.
Task A3: minor (deferred): lone surrogate quotes/contexts; inRanges O(hits×fences).
Ruling A3-3: A3-1 changes B1 'states re-anchor' test expectations (quote at text start + prepend → before not full) — B1 dispatch must derive expectations from the new rule: novel edit ONLY the after-context (not prepend) → relocated; deleted quote → stale QUOTE_MISSING; knowledge prepend → relocated (after full), then editing after too → stale WEAK_CONTEXT. D3 M4-1 allowed lists stay valid — cost: none.
Task A3: fix round 1/5 (2 addressed, 1 open — ruling gap: short non-empty stored context near a boundary still accepts a wrong location; commits 97e26d8..99303ed)
Ruling A3-4: extend A3-1 — a stored context shorter than CONTEXT_CHARS means "text boundary": it is full only when the text between the match and the boundary equals it exactly (beforeText === before / afterText === after); empty is the special case. Also reanchor(text, non-object) and quote '' → stale INVALID — cost: none.
Task A3: minor (deferred): boundary-only evidence with zero score on the other side is accepted (whole-text quote relocates to any text starting with it).
Ruling A3-5: A3-4 repro 2 ('
' before, '다른 장면.
하나는 웃었다.') is the same sentence with text prepended — after still exactly matches the end boundary → relocated is correct; controller's repro was wrong; implementer's 'relocated' assertion and the 'text added far away' → relocated update stand — cost: none.
Task A3: fix round 2/5 (2 addressed, 0 open; commits 99303ed..3eda9ba). Minor: stale test comment anchor.test.js:119-128 → B1 implementer trims it.
Task A3: complete (commits 789ed03..3eda9ba, review clean). 494/494
Task B1: BASE 3eda9ba
Task B1: review Approved (opus, ~15 attacks: all-or-nothing, engine-cut context, feature gate, proto names, 20 concurrent submits, tampered ledger — no bypass).
Ruling B1-1: fix minors 1,2,3,5 now — malformed-but-chained records are skipped by latestBySurface/occurrenceStates (status must not throw); non-string surface id/field refused (SURFACE_INVALID); sparse items iterated by index; status comment — read-path robustness is cheap — cost: none.
Task B1: minor (deferred): same-entity same-start dedupe drops a second item silently (plan-mandated); missing tests for tampered-ledger branch/concurrency/context replacement.
Task B1: fix round 1/5 (4 addressed, 0 open; commits 69728e3..17c9905)
Task B1: minor (deferred): isValidOccurrenceRecord does not require origin/textHash.
Task B1: complete (commits 3eda9ba..17c9905, review clean). 504/504
Task B2: BASE 17c9905
Task B2: minor (deferred): two entities sharing an identical name/alias → only the first gets candidates (shared mask).
Task B2: complete (commits 17c9905..c9f5d6d, review clean). 507/507
Task B3: BASE c9f5d6d
Task B3: implemented 6bc22f6. Review (opus): spec ✅, quality Changes requested (1 Important, 4 Minor). 514/514
Ruling B3-1: validateItems dedupe on entityId@start — appearance wins over mention (not order-dependent) — appearance is the stronger claim that feeds hard checks; cost if wrong: a mention quote at same spot gets reported as appearance.
Ruling B3-2: recordRunOccurrences requires occurrences AND occurrencesInExtract on; revalidation failure → commit-step pushes history occurrences_not_recorded code OCCURRENCES_INVALID — origin 'extract' must mean the feature was on; cost: none.
Ruling B3-3: recheck runs send occurrences.wanted=false (and never parse/block on them) — recheck never records; cost: none.
Ruling B3-4: Minor 1 (run-file items tampered then recorded, re-validated against text only) deferred — occurrences aren't lock data; checks already saw the tampered set on resync? no; low impact, revisit in final review.
Task B3: fix round 1 (resume impl-B3)
Task B3: re-review round 1 — all addressed. Minor (accepted P11): OCCURRENCES_INVALID details not kept in history. Minor 1 deferred (B3-4).
Task B3: complete (commits c9f5d6d..c4fa3cb, review clean). 522/522
Task B4: BASE c4fa3cb
Task B4: implemented c0ceeab. 526/526
Task B4: review (opus, 9 attacks all blocked): spec ✅, quality Approved. Minors: extra keys in features accepted; missing tests for mark-widened recheck refs + asset marks; dynamic import style.
Ruling B4-1: add the two coverage tests (mark-widened recheck refs, asset-mark widening) + strict features key set + static import now, as a small follow-up commit — cheap — cost: none.
Ruling B4-2: marks changing after commit (new submission/relocation) with feature on does NOT make a node stale — spec §8 only asks stale on toggle; marks are additive hints, not lock data — cost if wrong: a later-recorded occurrence isn't checked until the next recheck.
Task B4: follow-up d939041 (strict features keys + 2 coverage tests), controller-checked diff. 528/528
Task B4: complete (commits c4fa3cb..d939041, review clean). 528/528
Task C1: BASE d939041
Task C1: implemented 20173f5. 536/536. Concerns: corrupt journal fails closed (withWorkLock throws until human clears .folio/tx); apply.js not banned.
Ruling C1-1: corrupt/malformed journal stays fail-closed (no guessed restore, no auto-delete) — safety over convenience; error must name the tx dir and status must warn — cost if wrong: user must remove .folio/tx by hand once.
Ruling C1-2: core/rename/apply.js is NOT added to the server ban list (P7: public work-locked entry) — cost: none.
Task C1: review (opus): spec ❌ (C1-1 partial), Changes requested. 2 Important (partial restore before fail; errors don't name tx dir / raw ENOENT), 4 Minor.
Ruling C1-3: recovery validates the WHOLE journal first (every path assertSafe, every backup lstat regular file, not symlink) before any restore write — no partial guessed restore — cost: none.
Ruling C1-4: all journal/recovery failures are FolioError TX_JOURNAL_INVALID with details {dir:'.folio/tx', hint:'remove by hand after checking files'}; status warning TX_INTERRUPTED carries {dir, valid:boolean} — cost: none.
Ruling C1-5: writeFilesTx refuses TX_PENDING when a journal exists; target that is not a regular file (dir) → TX_PATH_INVALID; pendingFileTx treats a non-file journal.json as pending(true) without throwing; backups/restores are byte-exact (Buffer, no utf8 decode). Leftover *.tmp from writeFileAtomic deferred — cost: none.
Task C1: fix round 1 (resume impl-C1)
Task C1: fix round 1 867186e. 545/545
Task C1: re-review r1 — original 1–5 addressed; NEW Important N1 (journal target dir/nonexistent → partial restore + raw EISDIR), N2 (symlinked .folio/tx read+unlink outside root), Minor N3 (.folio/tx regular file → raw ENOTDIR crashes status).
Ruling C1-6: validation pass lstats every journal target: must exist and be a regular file (writeFilesTx only ever journals existing files) — cost: none.
Ruling C1-7: before any read/write/cleanup, .folio and .folio/tx must be real directories (lstat, not symlink) else TX_JOURNAL_INVALID (and never unlink/rm through a symlink; a symlinked .folio/tx is only reported, not followed). pendingFileTx/Status treat any non-ENOENT lstat error or a non-dir .folio/tx as pending+invalid, never throw. Backups opened with O_NOFOLLOW where cheap — cost: none.
Task C1: fix round 2 (resume impl-C1)
Task C1: fix round 2 1ad5344. 550/550
Task C1: re-review r2 — all addressed, Approved. Minor M1 (raw ENOTDIR from validation lstat) fixed by controller in 21f1657 (any lstat failure → TX_JOURNAL_INVALID; test C1-8). Deferred: leftover *.tmp from writeFileAtomic on kill.
Task C1: complete (commits d939041..21f1657, review clean). 551/551
Task C2: BASE 21f1657
Task C2: implemented 3cfa876. 556/556
Task C2: review (opus): spec ✅, Changes requested. Important: (1) other-entity occurrence updates re-resolved by quote-only → wrong place (plan-mandated); (2) stale/unresolvable items silently dropped from updated record; (3) occurrence change mangles longer names inside quote, no opt-out (plan-mandated); (4) NFC/whitespace bypass of NAME_TAKEN/same-name. Minors 5-9.
Ruling C2-1: occurrenceUpdates never re-resolve. Each live item's known start is shifted by the length deltas of applied changes before it; quote rewritten only where a change lies inside it; before/after re-cut from the new text with CONTEXT_CHARS (same as submit); item dropped only if a change partially overlaps its quote boundary (then carried unchanged → reads stale) — overrides plan code; spec §15 "엉뚱한 곳을 가리키지 않는다" — cost: none.
Ruling C2-2: items not live (stale) and items that cannot be shifted are carried over unchanged into the new record (they read stale afterwards → host resubmits); nothing silently disappears; plan lists them in plan.staleCarried [{surface, entityId, quote}] — cost: small shape addition.
Ruling C2-3: a hit that lies inside a longer name/alias of ANY other entity is neither change nor candidate; new option exclude: string[] moves ids from changes to candidates; unknown exclude id → RENAME_INCLUDE_UNKNOWN; include/exclude non-array → RENAME_OPTIONS_INVALID; both in digest — cost: one more option.
Ruling C2-4: names compared after NFC; newName with surrounding whitespace, control chars (incl. \n, NUL) → RENAME_NAME_INVALID; NFC-equal to old name → RENAME_NAME_INVALID; NFC-equal to another entity name/alias → RENAME_NAME_TAKEN — cost: none.
Ruling C2-5: Minor 5 reserialization accepted (same as writeAssetMeta) but non-string aliases preserved as-is (no silent data drop); josa ㄹ+'로' exception fixed; particle-prefix false positives accepted (warning only). Tests for stale/relocated/other-entity/multi-change/CRLF — cost: none.
Task C2: fix round 1 (resume impl-C2)
Task C2: fix round 1 42c90aa. 566/566
Task C2: re-review r1 — all addressed, no new Important. Controller fixed Minor 6 (name refuses \p{Cc}\p{Cf}\p{Zl}\p{Zp}) in 37a6250.
Task C2: minor (deferred): josa ㄹ checks only new name (warnings only); nextAliases raw (not NFC) compare; scalar aliases treated as []; carryAsIs turns missing before/after into '' (malformed records only); YAML/frontmatter reserialization (accepted C2-5).
Task C2: complete (commits 21f1657..37a6250, review clean). 566/566
Task C3: BASE 37a6250
Task C3: implemented 50dd5c7. 569/569 (no RENAME_OCCURRENCES_NOT_RECORDED wrap — reviewer to judge)
Task C3: review (opus): spec ✅, Changes requested. Important: (1) waiting_children run on a changed node → later commit overwrites approved rename silently; (2) ledger append failure after files written throws raw error.
Ruling C3-1: applyRename refuses RENAME_RUN_OPEN with details {runId, nodeId} when a waiting_children run's nodeId is among the plan's changed node surfaces (not global; M3 decision 6 holds) — cost: author must finish/abandon that run first.
Ruling C3-2: occurrence append failure after writeFilesTx → FolioError RENAME_OCCURRENCES_NOT_RECORDED details {applied:true, files, recommit, recorded:k, cause:code} (P11 spirit; unrecorded surfaces read stale) — cost: none.
Task C3: fix round 1 (resume impl-C3)
Task C3: fix round 1 f476236 — controller read apply.js: C3-1 (waiting_children on changed node refused), C3-2 (RENAME_OCCURRENCES_NOT_RECORDED) addressed; + minor tests. 576/576
Task C3: minor (deferred): corrupt run files ignored by open-run check (consistent with runner/locked).
Task C3: complete (commits 37a6250..f476236, review clean). 576/576
Task C4: BASE f476236
Task C4: implemented 2fbfc4a. 581/581 (feature re-checked on continuation until committing)
Task C4: review (opus): spec ❌ (baseHash missing; TEXT_CHANGED deferred to commit), Changes requested. Important: (1) feature-off wedges work (checks after mutation; skip refused); (2) committing exemption covers no-receipt crash window → older text over newer edit; (3) childless branch recommittable. Locks held under all attacks.
Ruling C4-1: recommit feature check happens at run/resume/decide-approve entry BEFORE any mutation (FEATURE_DISABLED, run() refuses instead of returning the question); decide skip always drops an open recommit run in any state except committing-with-receipt-recorded, even with the feature off — toggle removes the feature, never wedges the work — cost: none.
Ruling C4-2: exemption narrowed to state==='committing' && receiptRecorded; otherwise the feature check and RECOMMIT_TEXT_CHANGED apply (a committing run without a receipt is still droppable by skip) — cost: none.
Ruling C4-3: recommit of a branch node with zero children → RECOMMIT_NO_CHILDREN {nodeId} (children not_needed short-circuit only when children exist) — cost: none.
Ruling C4-4: add baseHash (commit record hash or null) to the recommit run per brief; generate's re-read sets fileHash together with setDraft; raise RECOMMIT_TEXT_CHANGED at generate as brief says. Minor 1 (mode tamper to 'open') accepted — hash lock holds, equals normal-run behaviour — cost: none.
Task C4: fix round 1 (resume impl-C4)
Task C4: fix round 1 e1033bc. 587/587
Task C4: re-review r1 — all addressed, no new Important. Controller fixed new Minor (request_revision on RECOMMIT_TEXT_CHANGED → REVISION_UNAVAILABLE) in edba446.
Task C4: minor (accepted/deferred): run-file mode tamper (open/recheck) — hash lock holds; recheck-tamper gives RUN_CURSOR_INVALID (existing behaviour).
Task C4: complete (commits f476236..edba446, review clean). 587/587
Task D1: BASE edba446
Task D1: implemented ac03e41+1264cd9 (D2 folded). 594/594
Task D1: review (sonnet): spec ✅, Approved. Minor: SKILL.md lacked status warnings → controller added TX_INTERRUPTED note in 9eae280. Minor (deferred): find.js ad hoc slice(0,200).
Task D1: complete (commits edba446..9eae280, D2 folded, review clean). 594/594
Task D3: BASE 9eae280
Task D3: implemented 5880eae. 606/606 (acceptance 12/12). Task review folded into final whole-branch review.
Final review (opus, 791201c..5880eae): 606/606, no Critical. Important: (F1) tx recovery silently overwrites author edits made after a crash; (F2) occurrences:false alone → CONFIG_INVALID wedges the work (plan decision 7) while docs tell users to do it. Minors: carried stale items revive at wrong place; D3 asserts weak; doc errors/missing codes; candidates ignores occurrences toggle; RECHECK_TEXT_DRIFTED hint.
Ruling F-1: journal entries carry beforeHash+afterHash. Recovery validates whole journal first; per file: hash==afterHash (or partially written tmp never renamed → still before) → restore backup; ==beforeHash → leave; neither → write nothing, FolioError TX_CONFLICT {dir, paths, hint}; status valid:false for that case. Recovery also removes leftover writeFileAtomic *.tmp siblings of journal paths. Journals without hashes (older) → TX_JOURNAL_INVALID. — spec: engine never guesses; author edits are never silently lost — cost: a conflicting crash needs a human.
Ruling F-2: a child feature is implicitly off when its parent is off, unless the author explicitly wrote the child true (then FEATURE_REQUIRES as before). Overrides plan decision 7; features.test.js expectation updated. featuresDigest/readFeatures reflect effective values — user rule: toggles remove features, never wedge — cost: none.
Ruling F-3: carried items get `carried: true`; state computation treats carried items as stale reason 'CARRIED' always (until resubmitted); validation accepts the optional boolean — keeps C2-2 "reads stale" guarantee — cost: tiny shape addition.
Ruling F-4: strengthen m4.test.js: M4-1 asserts marks start equals quote position in new text for live states, prepend edit expects located exactly where rule is deterministic; M4-5 asserts blocking includes DEAD_ON_STAGE and approve → APPROVE_BLOCKED_BY_HARD with features all off, plus recommit off → FEATURE_DISABLED; M4-3 asserts files were changed before recovery (TX_INTERRUPTED) and occurrences ledger unchanged after injected failure.
Ruling F-5: docs: fix occurrences.md:49 child list; document RENAME_OCCURRENCES_NOT_RECORDED(applied:true), TX_JOURNAL_INVALID, TX_CONFLICT, TX_PENDING, RECOMMIT_NO_CHILDREN, RENAME_INCLUDE_UNKNOWN/OPTIONS_INVALID, implicit child-off rule. folio_find candidates → FEATURE_DISABLED when occurrences off (Global Constraint wins over plan). RECHECK_TEXT_DRIFTED message mentions mode recommit when the feature is on.
Deferred (final): baseHash unread; leaf recommit plan null; isPlainObject duplication; file-tx path-walk duplication; all earlier deferred minors.
Final fix wave: dispatched
Final fix wave: c3214cf..43b767e. 621/621, acceptance 14/14. Concerns accepted: prepend→relocated in short-body fixtures (rule-derived, start asserted); backup hash check; TX_CONFLICT in-process.
Final re-review: ready for acceptance. 621/621, acceptance 14/14. Residual minors accepted: exact after-bytes hand edit is restored (not distinguishable, reproducible from backup); tmp-sibling pattern removal; TX_CONFLICT doc line added.
