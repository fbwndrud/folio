# SDD ledger — plan: docs/plans/2026-10-09-local-production-implementation.md

Spec: docs/plans/2026-10-09-local-production-design.md
Branch codex/production-ready; execution base50b56c3; sourcebasec44b13c; merge main713b9d8; commonbase0bf95e1.
Original checkout0bf95e1 dirty73 preserved. Existing managed worktree reused.
Baseline latest actual check /tmp/folio-pr-final-check.log: lint/typecheck,1010/1010 exit0; sourcec44b13c unchanged by plan docs.

## Preflight task internal scan
| Task | Text/files/test consistency |
|---|---|
| 1 | Merge precedes tests that need both code families; preserve two-parent history and existing write guards; complete Task1 with backend+viewer green |
| 2 | Read-only verified generation API; not-indexed only handled empty, candidate raw read forbidden; same static snapshot contract |
| 3 | Consumes exact two API routes and preview contract; no hidden mutation/model execution |
| 4 | First-user runtime/tarball tests include viewer build; package prep must be explicit, not install-time hidden build |
| 5 | Doctor strictly read-only: avoid normal query/worklock functions that create gate/index; use read/verify APIs with consistency check |
| 6 | Synthetic benchmark produces measurements, not performance SLA; major errors/coverage remain visible |

## Shared interfaces/files scan
| Tasks | Shared dependency | Resolution |
|---|---|---|
| 1,2 | main core/view and server/view APIs | union existing main viewer behavior before adding resources |
| 1,3 | React routing/nav/static API | main frontend retained before new screen |
| 1,4 | package scripts/files/CI/README | preserve both scripts first, release packaging later |
| 1,5 | status+integrity+bin/package | read-only diagnosis consumes verified state, no new approval |
| 1,6 | locks/integrity+tests | preserve all prior boundaries then focused combined adversarial tests |
| 2,3 | list/detail/currentCheckpoint/preview | exact two routes; no body/root arguments |
| 2,4 | API and static snapshot | production smoke calls actual HTTP and installed frontend |
| 2,5 | metadata verification | diagnosis may reuse pure read checks; never auto refresh |
| 2,6 | resource visibility and freshness | benchmark/adversarial tests consume accepted entries only |
| 3,4 | installed/static frontend | package and end-to-end screen must both support new resource route |
| 3,6 | error/state labels | stale/unknown/partial and read-only export remain visible |
| 4,5 | package/bin/docs | doctor packaging added after established source/installed runtime seam |
| 4,6 | production/docs and package tests | final measured evidence replaces preparation claims |
| 5,6 | read-only diagnostics and recovery | compare complete synthetic files before/after; copy backup for restore |

Ruling: User's production request continues the approved integration/first-user direction, so implement local MCP+viewer release contracts without another permission gate — developer says existing authorization governs skill approval gates — cost: cloud/remote collaboration remains separate unless user steers scope.
Ruling: Preserve main and previous implementation by adding codex/production-ready in the already-managed clean worktree; merge main into this branch only — isolated reversible implementation — cost: source worktree name remains dynamic-tracking although branch changes.
Ruling: Resolve merge semantically, preserving both current main features and new ledger/hash/receipt/live-writer gates; no blanket ours/theirs — each side has independent load-bearing contracts — cost: broad integration/review effort and regression surface.
Ruling: 300-line repository limit outranks implementer-template split discouragement; single-responsibility helpers allowed when necessary — AGENTS authority — cost: additional focused files.
Ruling: Task5 read-only guarantee includes not creating gate or cache files; use pure read/verify APIs rather than normal query paths that acquire locks — spec requires no mutation — cost: concurrent changes may yield a warning requiring retry instead of an atomic snapshot.

Task 1: in_progress — BASE50b56c3; fresh implementer to be dispatched.
Task 1: implementer /root/production_merge (gpt-6-astra/high); actual merge35 conflicts. Existing fake receipt seed fixtures corrected while preserving hard receipt validation. Focused recovery/variant contracts green; final managed asset snapshot/export consumer regression pending, full final checks follow.
Task 1: implementation DONE_WITH_CONCERNS49be509, two-parent50b56c3+713b9d8, tree clean. Actual final lint/types+1645/1645 skip0, viewer30/build, examples/assets/installed package green. Known dependency updates belong Task4. Review package BASE50b56c3..49be509 includes inherited200commits (4.86MB); supplemental combined merge resolution provided for concrete integration focus, not truncated replacement.
Task 1: independent review /root/production_merge_review confirmed Important via synthetic focused reproduction: committing image receipt interrupted before YAML publication permits managed add with same ID, then image resume returnsdone and openWork permanently fails DUPLICATE_ASSET_ID. Root source unchanged. Await full review report, then fix round1 resumes original implementer; no later task builds on this defect.

Task 1: fix round1/5 dispatch pending — I1 Important source task-1-findings.md, FIX_BASE49be509. M1 deferred to Task4 explicit SDK/source-map-js lock + audit/deprecation accounting; M2 viewer graph chunk warning requires real build log and final triage. CannotVerify: actual merge command recorded in original worker tools; original checkout/Vibelore no controller/worker mutations, main/previous refs preserved; no remote CI claim. Dist/resource-only/export safety are tracked future tasks, not missing Task1 work.
Task 1: fix1 implemented1d65ec4 (FIX_BASE49be509); actual RED4→GREEN32→covering81/81 skip0+lint/types. Scope includes durable receipt reservation, all open image writer gates, strict malformed/unknown/mismatch rejection, own legacy receipt resume. Task1 report untracked but actual scratch preserved. Independent scoped reviewer /root/production_merge_rereview gpt-6.1-sol/high dispatched; no broad/full tests repeated.

Task 1: fix round1/5 (1 addressed,0 open; commits49be509..1d65ec4); rereview clean task-1-rereview-1.md. M1/M2 deferred to Task4/final triage.
Task 1: complete (commits50b56c3..1d65ec4, review clean).

## Preflight amendments from actual merged code
| Tasks | Verified conflict / resolution |
|---|---|
|2,5,6|normal resource query acquires worklock/recovery; add shared pure read seam with begin/end checkpoint verification|
|2,3,4|Resource-only workspace lacks work.yaml; verified resource mode/navigation/first-user smoke must agree|
|2,3|actual buildSnapshot is core/view/snapshot.js; same-generation resources/resourceDetails snapshot, oldexport fallback|
|2,3,6|stale historical selected sources are valid history; selectionCurrent distinguishes present selection and candidates stay hidden|
|3,4|existing Node .test.js runner has no JSX testing-library; SSR pure component tests plus actual built browser QA|
|4,6|export deletes target before rename; preserve prior export/recovery on failure and test injected boundary|
|4,6|root SDK1.30.1/viewer source-map-js1.2.1 advisories and ESLint9 deprecation; explicit dependency/check responsibility|
|1,3|merged AGENTS product language requires plain English; plan Korean assertion corrected to Review needed|
|6|100*8MiB retained input buffers exceed reasonable local batch;32MiB total boundary/profile policy+reindex tests|

Ruling: Viewer GET and doctor use a shared pure read verification seam, retaining locked MCP query semantics — normal query would create gate/recover files despite read-only promise — cost: concurrent state changes produce retry errors and shared validation needs regression coverage.
Ruling: Permit verified Resource-only workspaces without a novel work.yaml and expose a separate screen capability mode — general Core should not require fiction initialization — cost: extra entry/navigation paths must distinguish missing config from corrupt config.
Ruling: Preserve historical formally selected sources in stale snapshots while exposing selectionCurrent; never-selected/unapproved candidates remain hidden — stale/history and present selection are distinct — cost: deselection is not deletion/privacy erasure of existing history or exports.
Ruling: Resource export list and details share one verified generation/checkpoint or fail on change — mixed epochs mislead provenance — cost: export may require retry during concurrent work.
Ruling: Use existing Vite SSR/ReactDOM for .test.js UI assertions and actual isolated browser QA rather than an unrunnable JSX/testing-library example — current viewer runner contract — cost: browser interaction QA remains locally measured rather than automatically guaranteed by pure CI tests.
Ruling: Apply32MiB aggregate embedding input cap in pinning and adapter, record it in profile policy —100*8MiB retained buffers are an actual memory exposure — cost: larger batches must be split and old profiles explicitly reindexed.
Ruling: Patch SDK and source-map-js in release task and investigate supported ESLint toolchain without weakening existing lint — actual install/audit findings — cost: dependency compatibility must be retested; no claim of current stdio exploitability.
Ruling: Export replacement must preserve the prior output or explicit recovery on failure — deleting target before rename can lose the only prior export — cost: staging/backup recovery adds filesystem and concurrency cases.
Ruling: Keep product labels in plain English from merged AGENTS/user-language and Korean conversation — binding repository UX convention — cost: Korean-only product localization remains future work.
Task 2: in_progress — BASEd544ea6; fresh implementer to be dispatched, read-only API/resource-only/static same-generation slice.
Controller baseline UI QA (before Task3, not final feature proof): isolated installed Chrome154.0.8037.98 with Playwright; synthetic writing fixture, widths320/390/736, documentWidth==viewport, no page/server errors; screenshots visually inspected320+736. Own harness first selector incorrectly expected Overview heading (actual work title); corrected selector then green /tmp/folio-controller-ui-baseline-green.log. No application defect inferred. Synthetic root removed; own screenshots retained/tmp only. Chromium package browser absent, existing Chrome isolated profile works, no download/user browser profile access.
Task 2: controller named risk during implementation — resource-only discovery must not reject writeImmutable's known .immutable-UUID.tmp SIGKILL leftovers. Worker confirms RED→GREEN: regular known stage ignored/preserved, stage-only root WORK_NOT_FOUND, symlink stage unsafe; canonical revision/content still verified. Mode contract mode writing/resources + capabilities(resources,writing,viewerExport,viewerToggles) + availableScreens; downstream UI consumes exact report contract. Worker reports new14/related108+lint/types provisional, final report/commit pending.

Task 2: complete (commitsd544ea6..1e36c58, review clean). Reviewer production_resources_review; spec✅/qualityApproved, no Critical/Important. Minor multiple-evidence synthetic regression explicitly carried Task3, not discarded. CannotVerify UI clicked context resolved as downstream requirement: list preserves all, detail contract first entry; Task3 must group/retain role/receipt/operation and direct/static contexts. No Task2 spec gap asserted.
Ruling: Keep revision-only detail API contract and make the UI preserve all verified list evidence for that revision — Task2 reviewer confirms list contains all contexts while singular detail picks first — cost: UI needs grouping or an additional verified list read on direct detail routes, with explicit regression coverage.

Task 3: in_progress — BASEdc2cda0; fresh Resources UI implementer, actual controller browser QA required before completion.

Task4 preflight actual export race: controller /tmp/folio-controller-export-race.mjs confirms same-ID managed put during dist copy returns snapshot approved:true while copied new red unapproved bytes. Report /tmp/folio-controller-export-race.log. Harness initially omitted get.asset wrapper, corrected before successful reproduction; root helper cleans synthetic fixture. Explicit Task4 pinned image boundary appended to plan; not an untested claim.
Ruling: Bind static export image bytes to the snapshot version and fail on incompatible changes rather than labeling new bytes with old approval — actual synthetic export race reproduced — cost: concurrent asset changes may require retry; legacy assets need explicit byte fingerprint handling.

Task3 controller UI QA final: /tmp/folio-controller-resources-qa-final.log exit0. Chrome154 isolated,320/390/736 list/detail/text nooverflow/noXSS/no page/server errors. Direct same revision source+2approval evidence retained, stale Review needed, unsupported Writing pages unavailable + link, keyboard skip link focusesmain, static0API requests. Oldsnapshot actually reloads modified inertJSON -> STATIC_UNAVAILABLE explanation, writing320 preserved. Screenshots list320/detail320+736/stale390/oldstatic390 visually inspected. Earlier harness expected redirect/Resources heading for unavailable screens and hash-only oldsnapshot navigation; corrected, no app defects inferred. Original dirty checkout still73 entries, main713b9d8 and priorc44b13c refs unchanged.

Task3 additional controller QA: /tmp/folio-controller-resources-empty-error.log exit0; not-indexed empty, injected503 integrity response displays verifierror+explicit Retry, requestCalls2 after2manual actions, no automatic refresh/mutation. Both320px screenshots visually inspected.
Task 3: complete (commitsdc2cda0..b1ae840, review clean). Reviewer production_resources_ui_review gpt-6.1-sol/high spec✅/Approved, noCritical/Important. CannotVerify mobile/keyboard/static resolved by actual finalQAandempty/error logs+visualinspection. GraphchunkMinor carriedTask4.

Task 4: in_progress — BASE1ce53af; fresh installer/export integration implementer, prior M1deps/M2Graphwarning + actual pinned-image risk carried.

Task4 controller architecture ruling after worker escalation:
Ruling: Use a cooperative exclusive export lock plus uniquely named owned backup/recheck/recovery; document portable rename's noncooperative lstat→rename gap rather than add OS-specific service — local single-user/worktree scope, portable Node cannot promise directory no-replace — cost: hostile external mutation and remoteFS need stronger future primitives; no claim of full power-loss atomicity.
Ruling: Pin image versions without retaining every image buffer simultaneously; use pinned catalog/hash or private sequential staging — current sequential20MiB read would otherwise become N×20MiB memory — cost: hash verification/staging IO and possible retry for changed legacy images.

Task4 implementer /root/production_release_install gpt-6-astra/high. Installed tarball GREEN devDependenciesAbsent+viewer/dist and source-exclusion, new productionflow +4prose/assets/tracking verified /tmp/folio-task4-package-green.log. Parent read actualaudit rootruntime0/viewerfull0. First fullcheck1671tests1670pass1fail due to new Vite buildstdout mixing JSON contract in tracking-package; worker preserves build diagnostics stderr and verificationstdoutJSON with scripts/build-package.js. Focused stdout regression1/1 +export/launcher/importguard20/20. Fresh full check /tmp/folio-production-task4-final-check.log running; older /tmp/folio-task4-check-final.log belongs priorstage814results, not current evidence. No complete/review dispatch yet.

Task4 implementation DONE b205553, tree clean; finalfreshcheck1672/1672 skip0 +viewer37; final installedpackage entryCount502 all fullflows+stdoutJSON verified; audit4total0. Independent reviewer /root/production_release_review gpt-6-astra/high range1ce53af..b205553,130934bytes, read-only. No later implementation beforegate.

Task 4: complete (commits1ce53af..b205553, review clean). Reviewer /root/production_release_review gpt-6-astra/high spec✅/Approved, noCritical/Important. CannotVerify remoteCI/powerloss/remoteFS/realEPUBreaders resolved as explicit unverified scope in spec+docs, no success claim. M1deps resolved4audit0; Task4 minor(deferred):M2existingGraph1613.44kB/gzip501.80lazy chunk measured+documented, finalreviewtriage required.

Task 5: in_progress — BASE287bebe; fresh doctor/restore implementer tobe dispatched.

Task5 implementer /root/production_doctor gpt-6.1-sol/high; brief requires readonly/filesnapshot/installedbin/restoredworkspace proof. Task4global-lock preservation CannotVerify resolved by Task1/2 tests plus fresh1672 full and original73/main713/priorc44 preservation controllercheck; finalreevaluation remains.

Task5 provisional worker evidence: diagnostics+CLI/backup26/26; full hidden dirs/gate/cache/links/mode/bytes snapshot unchanged. Writing+resource-only restore newfolders then2MCP reconnects preserve sourceCP, outputreceipt/selfReview/softfindings, manuscriptcommit and2assetversionsapprovalhistory. InstalleddoctorJSON/human/missingroot/purity integration added; fresh check/package and independentgate pending, notcomplete.

Task5 implementation DONEdf4ce44 treeclean,26new/106related/full1698passskip0 +installeddoctortests. Indepreview /root/production_doctor_review gpt-6.1-sol/high fullrange287bebe..df4ce44,61506bytes. Parentreadactualfinalwholelog. Stage purityfullbackuphistoryreported; independentgatepending.

Task5 review Important: doctor ignores workStatus ledger failure returned as value. Synthetic tracking_unknown gives API ok:true/CLI exit0 despite TRACKING_RECORD_INVALID. Fix round1 originalworker /root/production_doctor BASEdf4ce44; add both semantic/receipt integrity error+readonly+CLI exit1 regression. Original readonly check again73dirty/main713b9d8/priorc44 preserved. GraphMinor remains finaltriage.

Task 5: fix round1/5 (1 addressed,0 open; commitsdf4ce44..8c8d4aa). Independent scoped review production_doctor_rereview confirms returned ledger failures/API/CLI/read-only regression; no newbreakage. CannotVerify original refs resolved controller read-only73dirty/main713/priorc44. OtherOS/remoteCI not claimed.
Task 5: complete (commits287bebe..8c8d4aa, review clean).

Task 6: in_progress BASEf33381e; freshworker /root/production_scale_boundaries gpt-6.1-sol/high. Last task scale/boundaries/32MiB profile/install/measuredreadiness. Controller actualGooglemodel+finalUI+wholebranchreview/finaltests pending.

Controller named GraphMinor measure actual /tmp/folio-production-controller-graph-qa.log exit0: isolatedChrome154, syntheticnovel13nodes; noGraphrequest beforelazyentry, firstentry320px971.54ms/736px788.71ms; JS1,613,441bytes, documentwidth==viewport, noerrors, screenshots visuallyinspected. Smallfixture/currentlocaldevice only, nolargegraph/lowend/SLA claim. Passed toTask6 fortruthfulreadiness; finalreviewtriagepending.

Task6 implementation DONE_WITH_CONCERNS25eb59b treeclean. Fresh1707/1707 skip0 +viewer37/installed509entries/restore2/benchmarkactual; independentTask6review production_boundaries_review dispatched f33381e..25eb59b. Staticexport100~44.514s andGraphwarning needfinaltriage.
Controller actualGoogle smoke25eb59b exit0 /tmp/folio-production-controller-model-smoke.log: pinnedgoogle/embeddinggemma-2 revision914f7f..., CPUfloat32/128dim runtimeactualprofileDigested4eed5a..., maxBatchBytes33554432. Two syntheticcolorimageMCPindex+textsearch current, redtop0.879021/blue0.882774; sourceCP/revision/hash/selectionevidence, long9000tokens EMBEDDING_TEXT_TOO_LONG, fixturedeleted. Narrowwiring/retrievalsmoke notgeneralAIquality.
Controller finalUI25eb59b /tmp/folio-production-controller-ui-final.log exit0: isolatedChrome154,320390736 nooverflow/XSS/errors, allsource+2approvalcontexts preserved, staleexplicit, keyboardskipmain, writing320 preserved, static0APIrequests+oldexportunavailability. New screenshotlist320/detail736/stale390 visuallyinspected.

Task 6: complete (commitsf33381e..25eb59b, taskreview clean). task-6-review.md recovered afterturninterruption: spec✅/Approved, noCritical/Important. Minor100staticexport44.514s/Graph1.61MiB forwardedfinaltriage. CannotVerify actualmodel/UI resolvedcontroller25eb59b logs; sharedunchangedlocks/compatibility resolved earlierreview/tests+finalbroadgate; otherOS/remoteCI/realcreativequality notclaimed. Finalwholebranchreview+exactcommitverification remain separatecompletiongates.

Final independentreview production_final_review: Withfixes, Critical0 Important2 Minor2. Actual I1SIGKILLmetadata stage makesnormalgeneration permanentlyunreadable evenrefreshretry; I2partialmanagedassetwrite ENOSPC leavespoisonedfinalhash andsameinputretry ASSET_IMMUTABLE. Fullreport final-review.md, focusedactuallogs fixturedeleted. Oneconsolidatedfinalfixwave toaddressboth, BASE25eb59b; no latercompletionbeforegate.
Ruling: Accept measured100-manuscript/tracking/resource static export ~44.5s and lazyGraph1,613,441bytes as documented local release Minor limits, without suppressing warning or expanding this release into unmeasured performance refactor — independent wholebranch review found no loss/timeout/consistency failure and no agreed SLA — cost: export wait and concurrent-change retry remain; largergraphs/lowend/remote performance require separate measurement and optimization.

Final consolidatedfix DONE5fc61bc, BASE25eb59b, only7files. Actual RED4failed/2existingpass→GREEN6/6, covering266/266 no skips +linttype. I1sharedknownregularstagehelper preservesorphans/readpurity; I2asset ownstage+exclusivehardlink completes20MiBbeforepublish, Resource8MiBunchanged, oldcorruptfinalstillreject. Independentscoped finalrereview production_final_rereview gpt-6.1-sol/high, fixdiff24645bytes. Finalfreshcontrollergateswaitrereview.

Final scopedrereview production_final_rereview confirmsI1+I2ADDRESSED/newbreakageNone, outofscopeNone, gatePASS. Onefixwave25eb59b..5fc61bc complete; noresidualfindings. FinalcontrollerfreshverificationstartedexactHEAD5fc61bc (root/viewer/examples/assets/flow/installedpackage/100benchmark), actualmodel/UI afterthat; no completionclaimuntilactualexit0.

Final controller all gates PASS code5fc61bc: root1713/1713 skip0, viewer37/37, build/examples/assets/production/installedpackage/100benchmark/realGoogle/actualUI. Alltasks complete, ImportantI1/I2addressed inonefinalwave andindependentrereview, noresidualloadbearingissues. KnownMinorperformanceaccepted Ruling19; remoteCI/pushPRblockedonlymissingGitremote, nofakepublication. Durablearchive collected before thisplanscratchcleanup.
