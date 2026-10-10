# N6 판본 — 실행 기록과 판정

계획: `docs/plans/2026-10-01-n6-variants.md`. A1~D1을 완료했다.

## 사용자 결정과 완료

중단 전 사용자의 “묻지 말고 끝까지” 지시로 추천 결정 18건이 승인되었다. Codex는 인계 후 미완료 검토와 변경을 보존하고 작업을 완료했다. 구현 범위 `c8223aa..2fd0389`, 최종 확인 2026-10-02. 지원 Node v24.19.0에서 lint·typecheck·테스트 1138/1138, 복구 관련 집중 검사 39/39가 통과했다. 최종 독립 검토의 Important 2건을 단일 수정 파동으로 해결하고 한 차례 범위 제한 재검토 승인을 받았다.

## 주요 동작과 호환 비용

판본은 커밋된 원본 잎에서 `mode: normal`로 만든다. 판본마다 실행·영수증·커밋을 분리하고 새 커밋은 원본의 정확한 영수증 ID와 hash에 결속한다. 판본 커밋은 원본 파일과 사건·등장 위치·근거 기록을 수정하지 않는다. 판본 재검사·다시 커밋·판본 뷰어·내보내기는 이번 범위에 없다.

기능 꺼짐 상태에서도 기록된 영수증의 committing 실행은 공개 실행기로 안전하게 완료된다. 기존 판본 앞머리는 대상 파일 하나를 안전하게 읽어 의미를 보존하고 본문만 바꾼다. 링크·하드 링크·깨진 앞머리를 조용히 덮어쓰지 않는다. 전체 판본/용어표를 다시 읽는 예외가 아니며, YAML 주석이나 직렬화 바이트까지 보존하는 계약은 아니다.

중간 개발판에서 원본 결속 결정 기록이 없는 미커밋 판본 실행은 fail-closed하므로 skip 후 다시 시작해야 한다. 과거 main 기록 형식은 유지한다. 완료 판본의 stale는 원본 내용 hash·용어표·검사 정의를 비교하고 새 커밋의 exact pointer 잠금과 구분한다. 공통 live-run 손수정 경고에는 variant를 붙이고 완료 판본 drift는 variants[id] 안에 둔다.

## 인계와 남은 범위

- M6b→M7a→N6 순서로 기능·팩 목록을 이어 붙인다. runner는 분리됐으며 M7a의 별도 그림 실행기를 보존한다.
- 원본 영수증 뷰는 main만 본다. 판본 상태는 folio_status.variants에 있다.
- 부모 디렉터리의 악의적 동시 교체, Windows 동일 보장, 대규모 판본 성능은 검증하지 않았다. 정적 링크 방어를 절대 경로 격리로 주장하지 않는다.
- validateReceipt options 타입의 방어 강화, 플랫폼 ID 제한, 용어 대응표 규모 정책, M4/N7 인계 등 비차단 항목은 아래 최종 검토 표에 전수 보존했다.
- 정본 착수 계획서 아티팩트는 확인하지 못했으며 구현 계획 설계와 승계 결정을 기준으로 검토했다. main 병합 전이다.

## 전체 실행 기록

```text
# SDD ledger — plan: docs/plans/2026-10-01-n6-variants.md

Start: branch feat/n6-variants, HEAD a3b243e (plan commit) on main c8223aa. `npm run check` 1069/1069 (lint·typecheck ok).
Spec: plan "설계 요약" section is the N6 spec (canonical artifact §03/§04/§09 not read here; rulings provisional against it).
Tooling: plan-blocks.py (write/apply/compare/brief) in this workspace. Briefs task-<id>-brief.md = Global Constraints + task body.

## User approval
- User said "묻지 말고 끝까지". This approves all 18 decisions marked "추천 채택(사용자 확인 필요)".

## Preflight scan

Mechanical dry run: HEAD extracted to scratchpad/n6-dry, every task's whole-file blocks written and diff blocks `git apply`d in order A1→D1. All 71 blocks applied; per-task compare SAME/APPLIED for all. Whole-file line counts match headings. Full `npm run check` on the dry tree: exit 0, 1120/1120 (matches plan's final count).

Shared file / interface rows:
| tasks | file / interface | producer → consumer | finding |
|---|---|---|---|
| A1 → B4 | core/run/run-start.js | A1 creates newRun/sameRequest(open,node,mode); B4 diff adds variant param | diff applies on A1 block; ok |
| A1 → B4 | core/run/runner.js | A1 diff 212→175; B4 diff →192 | applies; ≤250 ok |
| A1 → B4 | core/run/run-context.js | loadRunContext consumed by runner | ok |
| B1 → B2..C2 | core/variants/model.js (MAIN, variantOf, isVariantRun) | consumed by B3 level-pipeline, B4 plan/gates, B5 locks, C2 status | ok |
| B1 → B5 | receipts.js validateReceipt(receipt,{variants}), lastCommits(records,variant) | B5 commit-locks/commit consume | ok |
| B1 → B3 | config.variantSpecs | B3 resolveVariantPipelines({specs}) | ok |
| B2 → B4/B5/C2 | store/variants.js readVariants/writeVariantText, work.variants | B4 original.js, B5 commit.js, C2 status | ok |
| B2 → B5 | test/support/variant-work.js | B2 whole file; B5 diff | applies ok |
| B3 → B4/B5 | pipelineFor/checksDigestFor follow variant; pipelines.variants | B4 newVariantRun, B5 assertPipelineVariant | ok |
| B4 → C1 | check ctx original/variant/terms (variantScope) | C1 checkers consume | ok |
| B4 → C2 | core/run/text-guard.js | B4 diff then C2 diff | applies ok |
| B1 → C2 | stale-checks latestRecheck variant filter | C2 variantsStatus | ok |
| B1,C1 | core/work/features.js, packs/index.js (append-only shared with M6b/M7) | append at end only | ok; controller reorders at merge |
| B4 | server/tools/definitions.js, handlers.js (append-only shared) | arg add only | ok |

Per-task self-consistency rows:
| task | tests vs code | files created vs touched | finding |
|---|---|---|---|
| A1 | ledger-damage test ↔ run-context readGated details | creates run-context/run-start, modifies runner/recommit-plan | ok; behaviour-preserving except LEDGER_TAMPERED details (plan-intended) |
| B1 | variant-records/index tests ↔ model/config/receipts/rebuild | 2 new + 7 diffs + 2 test diffs | ok |
| B2 | variant-store test ↔ store/variants.js | ok | ok |
| B3 | variant-pipeline test ↔ variants/pipeline.js + level-pipeline | ok | ok |
| B4 | variant-run test ↔ variant-plan/payload/original/gates | ok | ok |
| B5 | variant-commit test ↔ locks/commit/receipt-builder | ok | ok |
| C1 | variants-checkers/pack tests ↔ packs/variants | list tests updated in same commit (pack tests) | ok |
| C2 | variant-status test ↔ variants/status.js | ok | ok |
| D1 | n6 acceptance ↔ MCP; skill doc test | Step 2 expected PASS (acceptance bundles B1–C2) | plan-stated; not a defect (D1 is acceptance-only) |

Preflight rulings:
- Ruling: M7a (image pack, /path/to/folio-worktrees/m7) runs concurrently with N6, superseding the plan's "현재 상태" note that M7a must not run alongside — the controller confirmed M7a's plan does not touch core/run/runner.js (image runs are a separate unit in core/image/*), so the runner.js hotspot rule is not violated — cost if wrong: merge conflict in runner.js/run-*.js at merge time, resolved by the controller rebasing M7a onto the split runner.
- Ruling: D1's Step 2 expects PASS rather than FAIL (acceptance test over already-built B1–C2) — it is an acceptance task, not TDD; no test asserting nothing — cost if wrong: none beyond a missing red step.

## Tasks
Task A1: dispatched implementer n6-impl-A1 (haiku), BASE a3b243e
Task A1: implementer DONE 9e58836, compare all SAME/APPLIED, trailer ok, 1072/1072
Task A1: review (sonnet) clean; no existing test changed; byte-identical ledgers/run files base vs head (2 scenarios)
Task A1: complete (commits a3b243e..9e58836, review clean)
Task B1: dispatched implementer (haiku), BASE 9e58836
Task B1: implementer DONE 3e02b90, compare all SAME/APPLIED, trailer ok, 1081/1081
Task B1: attack review (opus): all 6 attacks BLOCKED, Approved, 0 Critical/Important
Task B1: minor (deferred): receipts.js:99 validateReceipt trusts `variants` is an array (string → substring match; null throws); harden with Array.isArray (plan-mandated code)
Task B1: minor (deferred): no-arg validateReceipt now rejects a main receipt carrying `original` (ORIGINAL_ON_MAIN) and VARIANT_UNSUPPORTED payload changed (null / 60-char cut) — stricter than before; no recorded receipt re-judged
Task B1: minor (deferred): core/variants/config.js specs is a plain {} — variantSpecs['constructor'] returns a function; ids 'constructor'/'hasownproperty' accepted (plan-mandated); use Object.create(null)
Task B1: minor (deferred): core/work/config.js SUPPORTED_VARIANTS now unused export
Task B1: minor (deferred): VARIANT_ID accepts trailing '-' and Windows reserved names ('con') as folder names
Task B1: note for B5 reviewer: commit.js already/sameRun/supersededBy must become per-variant (plan diff ~line 2781)
Task B1: complete (commits 9e58836..3e02b90, review clean)
Task B2: dispatched implementer (haiku), BASE 3e02b90
Task B2: implementer DONE eea0093, compare SAME/APPLIED, trailer ok, 1086/1086
Task B2: attack review (opus; plan said normal model, upgraded per lessons #6: out-of-work paths): Needs fixes — Critical hard link read; Important write through symlink with feature off; Important ghost files become texts
Ruling: B2 hard-link and ghost-node findings fixed against the plan block (core/store/variants.js): read variant .md and terms.yaml through sources.js readOriginalFile (exported, no other change) so hard links and symlinks are refused on the open handle; VARIANT_NODE_MISSING files are skipped — the plan's own design says these are warnings/never text and N2/C0 already refuse hard links; matching that bar is cheaper than a later lock leak — cost if wrong: a writer with a legitimately hard-linked variant file gets WORK_INVALID and must copy the file; plan block compare for variants.js/test now DIFF by ruling.
Ruling: writeVariantText refuses a non-folder (link) variants/ or variants/<id> with VARIANT_DIR_INVALID — locked variant commits may finish with features.variants off (plan) and readVariants then skips the link checks; the write must not depend on the toggle (locks are toggle-independent) — cost if wrong: one extra lstat pair per variant commit; a commit into a linked folder now throws instead of writing outside the work.
Task B2: minor (deferred): with features.variants off a locked variant commit gets previous=null and drops the variant file's front matter (title)
Task B2: minor (deferred): a variant file with broken front matter throws raw FRONTMATTER_UNCLOSED/YAML_INVALID instead of aggregated WORK_INVALID (tree reader behaves the same)
Task B2: minor (deferred): variant front matter that is a YAML list is accepted as data
Task B2: minor (deferred): terms.yaml accepts conflicting duplicate `from` entries silently, no pair count cap

## Codex recovery — 2026-10-01
User instructed continuing all three interrupted lanes. Existing worktree changes are preserved. Pending review gates resume before downstream tasks. New original Codex work uses truthful authorship; plan-generated Claude code retains its contribution trailer. Main integration will be prepared after lane validation.
Task B2: fix round 1/5 (all three findings addressed, no regression; eea0093..142afdb). Independent review spec and quality approved; focused 9/9 verified, full implementation evidence 1088/1088. Existing parent-directory concurrent replacement race remains explicitly documented.
Task B2: complete (commits 3e02b90..142afdb, review clean).
Task B3: recovery dispatch. B3 starts142afdb; complete B2 fixes reviewed before dependency work.
Task B3: independent attack review found Critical strict-hard placement bypass and Important non-string variant coercion blocking skip. Ruling: include resolved variant pipelines in existing placement validation and use safe labels for malformed variant values — toggle-independent hard protection and skip-only recovery outrank defective plan blocks — cost if wrong: stricter invalid configuration rejection, error display for malformed JSON changes. Fix round1 pending.
Task B3: fix round1/5 (Critical hard placement and Important skip coercion both addressed; 1c94836..93e7fe9). Independent spec+quality approved, focused7/7, full1095/1095.
Task B3: complete (commits142afdb..93e7fe9, review clean).
Task B4: 3aa1b50 focused7/full1102. Independent attack review found Critical next request variant mixing and Minor malformed request coercion. Ruling: require variant equality before next shortcut, retain prior main next continuation contract, and safe invalid labels — variant execution isolation outranks defective OR in plan — cost if wrong: requests must explicitly name the open variant; intentionally mismatched callers receive RUN_IN_PROGRESS. Fix round1 pending.
Task B4: fix round1/5 (Critical next variant mixing and Minor coercion both addressed; 3aa1b50..e4aced4). Independent spec+quality approved, focused rereview39/39, full1105/1105 on supported Node24.
Task B4: complete (commits93e7fe9..e4aced4, review clean).
Task B5:5008039 full1110; independent attack review found Important fresh-ID variant relabel and stale original relabel commits. Ruling: bind receipt variant/original to immutable decisions scope, validate metadata against protected original/terms refs — self-asserted current pointer is insufficient — cost if wrong: stricter rejection for malformed receipts; valid runs unchanged. Fix round1 pending.
Task B5: fix round1/5 (two Important findings addressed;5008039..84bbe59), independent spec+quality approved; focused9/full1114 Node24.
Ruling: add variant and exact original pointer only to variant check_result decisions — refsDigest lacks original receiptId and same-body recommit must stale old results — cost if wrong: prebinding uncommitted variant runs fail closed and must restart; old main records unchanged.
Task B5: complete (commitse4aced4..84bbe59, review clean). C1 next.
Task C1:b70ffc4 focused28/full1121. Review specPASS/qualityNeedsFix P2 everybuiltin digest guard omitsvariants. Ruling: append variants loader/checkers to existing all-pack digest traversal — claimed common guard must cover newpack — cost if wrong: stronger guard may require actual missing module declarations. Fix round1 queued aftercandidate merge implementation.
Task C1: fix round1/5 (P2 guard omission ADDRESSED;b70ffc4..619d032), independent spec+quality approved. Related15/lint/typecheck pass no runtimechange.
Task C1: complete (commits84bbe59..619d032, review clean).
Task C2:8cf467d focused6/full1127. Review spec+qualityPASS_WITH_CONCERNS, existingP2 false CHANGED_DURING_RUN when features.variants off confirmed. Fixround1 pending.
Ruling: top-level CHANGED_DURING_RUN stays shared live-run warning taggedvariant per explicitdesign§113; completedvariant drift remains variants[id].drift — precisecontract preserves existingshape — cost if wrong: clients ignoringvariant mustadapt; no field relocation.
Ruling: skip featureoff variant text comparison only in statusprojection; keep all writeguards/locks — unread variant map cannot provehandedit — cost if wrong: livevariant edits hidden untilfeatureon, consistent no-readcontract.
Ruling: completedvariant stale stays contenthash/terms/checkdigest based; samebody originalreceiptId change alone does notstalepastresult — B5 exactpointer appliesnewcommits separately — cost if wrong: metadata-only pointer change is not a contentstale warning.
Task C2: fix round1/5 (featureoff false live drift ADDRESSED;8cf467d..87e802f), independent spec+qualityPASS, related24/full1129 Node24.
Task C2: complete (commits619d032..87e802f, review clean). D1 acceptance/docs next.
Task D1:de691d0 acceptance4+skilldocs4/full1133. Review specPASS/qualityrecommendation P2 descriptionmissingvariants +P3 misleadingrecheckwording. Ruling: add concise variantcreation/status frontmattertrigger and correctnormal-only wording — independentuserrequests mustdiscoverworkflow — cost if wrong: tiny alwaysloaded contextaddition; APIunchanged. Fixround1 pending.
Task D1: minor(deferred): MCPacceptance doesnotduplicate featureoffmalformedfile/immutablepointer/taggedlivewarn boundary scenarios; B5/C2 actualwrite/status tests coverthem; finalreviewtriage required.

Ruling: D1 reviewer trailer objection resolved against prior Codex recovery authorship ruling: preserve truthful Codex attribution for original Codex fixes, rather than attributing unmade work to Claude — plan-specific trailer identifies the original executor and was superseded when the human handed continuation to Codex — cost if wrong: metadata differs from the original plan template; implementation and contributions remain auditable. No history rewrite.
Task D1: fix round1/5 (description and normal-only wording ADDRESSED;de691d0..d19aeef), independent functionality spec+document quality PASS; metadata objection adjudicated as above. Target8/8 Node24.
Task D1: complete (commits87e802f..d19aeef). All N6 tasks complete; final whole-branch review next.

Final wholebranch review /root/n6_final_review complete: Critical0 Important2 Minor0, all deferred/rulings individually triaged in final-review.md. I1 recorded committing variant cannot resume through public run when feature off; I2 same off commit loses existing frontmatter. Final ONE fix wave pending.
Ruling: separate new variant request gate from recorded locked same-run recovery, preserving feature-disabled unrecorded/new starts and cross-variant isolation — recorded commitments must finish independent of feature toggle — cost if wrong: recovery gate ordering may alter error precedence, regression tests pin behavior.
Ruling: preserve existing target variant frontmatter via a limited safe target read during writing even with feature off; malformed metadata must fail closed, full variants/terms remain unread — data preservation and locked completion outrank defective previous=null plan code — cost if wrong: one target read during commit and malformed existing metadata now needs repair instead of being discarded.

Final ONE fix wave /root/n6_final_fix complete2fd0389 (d19aeef..2fd0389), target39/full1138 lint+typecheck Node24 PASS. Scoped single rereview /root/n6_final_review active; no second finalfix wave.

Final scoped rereview /root/n6_final_review PASS I1/I2 ADDRESSED, new0, spec+qualityPASS. N6 runtimecomplete2fd0389; ONE finalwave and ONE rereview finished. Node24 focused39/full1138 lint+typecheck. Finaldocs record next; main unmerged.

```

## 전체 브랜치 독립 검토

# N6 전체 브랜치 최종 독립 검토

- 범위: c8223aa..d19aeef, /path/to/folio-worktrees/n6, feat/n6-variants.
- 기준: AGENTS.md, 구현 계획의 설계 요약·결정·Global Constraints·호환 계약, progress.md의 모든 유보/판정, 지정 senior code reviewer rubric.
- 소스/index/HEAD 읽기 전용. 하위 에이전트 없음. 전체 변경 목록·커밋·소스·관련 테스트를 읽고 미검증 경로만 합성 임시 fixture로 재현했다.
- 집계: **Critical 0 / Important 2 / Minor 0**. 유보 항목의 비차단 개선 가능성은 새 결함으로 중복 집계하지 않는다.

## Strengths

- 실행 문맥, 실행 시작, 기능 문, 판본 범위·잠금·상태가 분리되어 있다. 변경된 코드와 테스트는 모두 300줄 이하, runner.js는 192줄이다. 4,052줄 계획 문서는 코드 모듈 제한 대상이 아니다.
- 영수증 형식, 파이프라인 판본/digest, 본문 hash, hard 판정, 결정 기록장 대조가 실제 쓰기 전에 모인다. B5의 check_result.variant와 정확한 원본 {receiptId, committedHash} 결합은 fresh receipt ID와 같은 본문 재커밋을 이용한 바꿔치기를 함께 막는다.
- lastCommits, 재검사 조회, 색인, 원본 영수증 화면에 판본 구분을 적용했다. 판본 커밋은 원본 파일, 사건, 등장 위치, 근거 기록을 쓰지 않으며, 테스트가 실제 원본 기록 보존도 확인한다.
- 다섯 판본 검사는 experimental/advisory이고 모델 요청은 호스트로 반환한다. 판본 실행 테스트가 advisory 자동 수정 없음과 {sameHost:true, independent:false} 기록을 확인한다. 런타임 의존성은 yaml/MCP SDK뿐이며 새 core/packs 코드는 모델·네트워크를 호출하지 않는다.
- 기존 기능/팩 목록 끝에 항목을 추가하고 순서 검증을 유지했다. N4 목록 검증의 범위 변경도 기존 인접 순서와 새 N6 끝 항목 검증을 합치면 약화가 아니다. 새 팩의 모듈 digest 가드도 보강되었다.

## Critical findings

없음.

## Important findings

### I1. 기능을 끄면 이미 잠긴 판본 커밋을 공개 실행 경로로 끝낼 수 없다

- 위치: **core/run/runner.js:104**, core/run/variant-plan.js:18 및 core/run/run-gates.js:11과 상호작용.
- run()은 열린 실행의 committing + recorded receipt 예외를 확인하기 전에 모든 비-main 요청에 assertVariantRequest()를 호출한다. 그 함수의 첫 동작은 무조건 assertFeature(..., 'variants')다. 뒤의 assertRunFeatures()에 마련한 잠긴 실행 예외까지 도달하지 못한다.
- 재현: 원본을 커밋한 합성 작품에서 afterBodyWrite로 판본 커밋을 중단한다. 실행 파일은 committing, 영수증은 기록장에 있고 commit record는 아직 없다. features.variants=false로 바꾼 뒤 run({node:'ep-001', variant:'en'}) 및 run({variant:'en'})은 FEATURE_DISABLED, 기본 main 요청은 RUN_IN_PROGRESS, decide(skip)은 RUN_NOT_AWAITING_USER가 된다.
- 영향: 문서와 run-gates.js가 약속한 기능 꺼짐 상태의 잠긴 커밋 완료가 불가능하다. 이 실행이 다른 실행까지 막는다. 기능을 다시 켜야 복구할 수 있어 잠긴 작업을 토글과 무관하게 끝낸다는 계약을 위반한다.
- 수정: 요청의 판본/모드 검증과 새 실행의 기능 검증을 분리하거나, 같은 요청의 열린 실행을 먼저 확인해 기록된 잠긴 실행에만 기능 예외를 적용한다. 새 실행과 미기록 실행의 FEATURE_DISABLED, 다른 판본의 RUN_IN_PROGRESS는 유지한다.
- 회귀 검증: createRunner.run() 또는 MCP를 통한 실제 중단→기능 끄기→완료 경로. commitNode() 직접 호출만으로는 이 결함을 잡지 못한다. 기능 꺼짐 시 malformed terms 파일도 일반 작품 읽기를 막지 않는 기존 no-read 계약을 보존한다.

### I2. 기능 꺼짐 상태의 잠긴 커밋이 기존 판본 앞머리를 삭제한다

- 위치: **core/run/commit.js:123**, **core/store/variants.js:115**.
- readVariants()는 기능 꺼짐 시 빈 Map을 반환한다. commitNode()가 이 Map에서 previous를 찾기 때문에 실제 파일이 있어도 null을 전달하고 writer는 {}로 직렬화한다.
- 재현: I1과 같은 작품의 판본 파일에 title: Existing title, custom: keep을 넣었다. 중단 직후에는 앞머리가 보존된다. 기능을 끄고 잠긴 영수증으로 commitNode(..., resume:true)를 직접 호출하면 성공하지만 파일에는 Synthetic translation 본문만 남는다.
- 영향: 본문만 바꾸고 앞머리를 보존한다는 저장 계약(writer 주석 및 B2 보존 테스트)을 위반하며 사용자가 작성한 제목/메타데이터를 조용히 잃는다. progress의 B2 minor 유보를 **Important로 상향**한다. I1을 고치면 공개 경로에서도 발생한다.
- 수정: 쓰기 시점에 실제 대상 파일의 앞머리를 안전하게 보존한다. 전체 판본/terms를 다시 로드할 필요는 없다. 대상 하나의 제한된 읽기에 기존 symlink/hard-link/디렉터리 보호를 유지하고, 앞머리를 안전하게 해석할 수 없으면 조용히 비우지 말고 명확히 거부한다. 다른 방법도 현재 메타데이터 보존 계약을 충족해야 한다.
- 회귀 검증: 제목과 임의 필드를 가진 파일에서 기록된 커밋을 기능 꺼짐 상태로 재개한 뒤 두 필드, 최종 본문, 영수증/커밋 기록, 원본 격리를 확인한다. I1과 함께 고치고 실제 실행기로 종단 검증한다.

## Minor findings

이번 수정 파동에 요구할 별도 Minor 결함은 없다. 아래의 비차단 개선 가능성은 유지보수 후보다.

## 모든 유보 항목의 독립 판정

| 항목 | 판정과 근거 |
|---|---|
| B1 validateReceipt options.variants 타입 신뢰 | **비차단 방어적 개선**. string이면 substring includes, null이면 예외인 것은 사실이다(receipts.js:96,112). 현재 commit 호출은 검증된 work.config.variants 배열을 전달하고 JSDoc도 배열을 요구한다. MCP가 임의 options를 전달하는 경로는 없다. Array.isArray 보강은 유익하지만 현재 잠금 우회 증거는 아니다. |
| B1 no-arg main 영수증의 original 거부, 오류 payload 변경 | **의도한 명세 강화**. main original 금지는 N6 계약이다. N6 이전 정식 builder가 그 필드를 만들지 않았고 기존 읽기 투영은 variantOf를 사용한다. 새 영수증 검증과 옛 기록 읽기 호환은 별개다. 짧고 안전한 오류 표시도 허용할 변경이다. |
| B1 plain {} 및 constructor/hasownproperty ID | **현재 결함 아님**. 선언되지 않은 constructor는 Object.hasOwn으로 차단되고 선언된 constructor는 own property다. Object.values는 상속 항목을 열거하지 않으며 __proto__는 정규식상 거부된다. lowercase hasownproperty는 Object.prototype.hasOwnProperty와도 다르다. null-prototype은 선택적 개선이다. |
| B1 미사용 SUPPORTED_VARIANTS export | **비차단 정리 후보**. 주석은 선언 없이 존재하는 원본 목록으로 설명하며 실행 판정에 쓰이지 않는다. 삭제/MAIN 재사용은 가능하나 동작 오류는 없다. |
| B1 trailing '-'와 Windows 예약 ID con | **trailing '-'는 명세상 허용; Windows는 플랫폼 한계**. probe에서 trail-/con 설정을 허용했다. con은 Windows 호환용 제한 후보이나 이 darwin 검토에서 Windows 실패를 직접 검증하지 않았고 계획도 Windows 미검증을 명시한다. 지원 확정 시 예약 이름을 제한한다. |
| B2 feature-off frontmatter/title 유실 | **수정 필수 I2**. 실제 파일 쓰기로 재현했다. minor 유보를 유지하지 않는다. |
| B2 잘못된 앞머리의 직접 FRONTMATTER_UNCLOSED/YAML_INVALID | **비차단, 기존 파서 계약과 일치**. parseDoc의 구조화된 FolioError이며 INTERNAL_ERROR에 원문을 노출하는 경로가 아니다. WORK_INVALID 집계 대상으로 명시한 것은 링크/용어 대응표다. 집계 통일은 후속 UX 개선이다. |
| B2 YAML 배열 frontmatter 허용 | **비차단 스키마 강화 후보**. title은 문자열만 취하고 data는 직렬화하여 보존한다. 배열이 잠금/경로/본문 판정을 바꾸는 경로를 찾지 못했다. object-only 스키마를 요구한다면 별도 검증을 추가할 수 있다. |
| B2 중복 from, pair 수 제한 없음 | **비차단 정책/규모 개선 후보**. 읽기는 모든 pair를 보존하고 advisory 검사는 모두 평가하므로 한 의미를 덮어쓰지 않는다. 모순된 대응표는 지적을 늘릴 수 있으나 자동 수정하지 않는다. 유일성/최대 항목 수는 현재 요구사항에 없다. |
| B2 부모 디렉터리 동시 교체 race | **기록된 제한 유지**. 마지막 파일은 열린 handle에서 읽지만 부모는 lstat 뒤 경로 접근이므로 악의적 동시 교체까지 완전히 막지 못한다. 기존 sources 계열과 공통인 한계이며 이번에 새 race probe를 수행하지 않았다. 정적인 링크/하드 링크 거부 수정은 유효하다. |
| D1 malformed feature-off 파일 MCP 중복 검증 | **상태 경로 근거는 충분; 잠긴 복구 근거는 부족하여 I1/I2로 구체화**. variant-status.test.js의 실제 malformed terms + off 검증을 그대로 MCP로 복제할 필요는 없다. 그러나 잠긴 커밋의 공개 실행기 완료 증거로 대신할 수 없다. |
| D1 immutable pointer MCP 중복 검증 | **별도 복제 불필요**. B5 테스트가 first-unrecorded, recorded/resumed, fresh ID, changed-body/same-body 원본 재커밋, 위조 refs를 실제 ledger/write 경로에서 검사한다. handler는 variant를 실행기에 전달한다. |
| D1 tagged live warning MCP 중복 검증 | **별도 복제 불필요**. C2 workStatus 실제 파일 테스트가 feature-on tagged drift와 off 미투영을 확인하고 서버 status도 같은 함수를 쓴다. |
| 계획 결정 13: N2 getSource 통째 실패 | **N6 범위 밖 유보 수용**. 실행기의 gated ledger 진단만 추가하고 별도 자료 API는 변경하지 않는 명시적 경계다. |
| 계획 결정 14: record-run/status 중복 정리 | **유보 수용**. 판본 커밋은 side-ledger writer 전에 반환한다. 이번 요구사항에 더 큰 공통화가 필요하지 않다. |
| 계획 결정 15: M4 같은 이름 후보/중복 폐기/baseHash/file-tx 경로 중복 | **N7 인계 유지**. N6 diff가 해당 코드를 바꾸지 않으며 I1/I2 해결에도 필요하지 않다. M4 문제 자체를 이 검토가 해결했다고 주장하지 않는다. |

## 모든 수정 판정과 기록된 계약의 독립 재검토

| 기존 판정 | 최종 검토 |
|---|---|
| 사용자 승인으로 18개 추천 결정을 실행 | progress의 승계 계약으로 수용. 정본 아티팩트를 대신 읽었다고 주장하지 않는다. |
| M7a 병렬 실행 허용 | N6의 runner 소유 경계/분리 구조는 맞다. 다른 worktree 접근 금지 때문에 M7a의 실제 diff는 재확인하지 않았으며 통합 시 확인해야 한다. |
| D1 acceptance 최초 PASS | B/C 구현 위의 수용 테스트이므로 적절하다. 인위적 RED는 필요 없다. |
| B2 hard-link/ghost 수정 | 안전한 열린 파일 읽기 재사용과 ghost skip을 소스/테스트에서 확인했다. 계획 블록과 달라도 작품 밖 입력 거부를 강화한다. |
| B2 feature-off 쓰기 폴더 링크 방어 | writer 자체 lstat 보호는 토글과 무관하게 유효하다. 공개 복구/메타데이터 보존까지 해결했다는 판정은 I1/I2 때문에 불충분하다. |
| B3 strict hard 배치 검사 | 실제 variant pipelines를 homes에 포함했다. 추가 probe에서 features.variants=false + strict hard variant-checks off는 CONFIG_INVALID/HARD_CHECK_OVERRIDE로 거부됐다. |
| B3/B4 malformed ID 표시와 skip | 위험한 객체 문자열 강제 변환을 피하고 own-property 조회를 한다. 테스트가 malformed JSON skip을 실제 run store로 검증한다. 수정 수용. |
| B4 next 실행 혼합 수정 | variant equality가 next shortcut 앞에 있으며 main next의 기존 continuation도 별도 검증된다. 수정 수용. |
| B5 immutable decision binding | recordResult가 현재 ledger에서 얻은 원본 pointer를 check_result에 남기고 assertDecisionsMatch가 비교한다. off check도 기록되며 refs 형식/exact current-original 검사는 feature gate 밖에서 첫 영수증과 재개 모두 쓰기 전에 적용된다. 수정 수용. |
| B5 prebinding uncommitted variant 거부 | binding이 없으면 fail-closed, main record 형식은 유지한다. 중간 개발판의 미완료 실행을 다시 시작하게 하는 제한은 잠금 강화에 부합한다. |
| C1 모든 내장 팩 digest 가드 보강 | 모듈 순회/loader 비교 양쪽에 variants를 추가하고 앞선 네 팩 검증을 유지했다. 수정 수용. |
| C2 shared live-run warning | 설계가 CHANGED_DURING_RUN의 variant를 명시한다. 공통 경고를 variant로 구분하고 완료된 drift는 variants[id]에 두는 문서/구현/테스트가 일치한다. |
| C2 feature-off drift 미투영 | 빈 Map으로 읽지 않은 본문 변경을 단정하지 않는 것이 맞다. projection만 생략하여 쓰기/영수증 잠금을 약화하지 않는다. |
| C2 완료 판본의 content-based stale | currentRev는 body hash, terms rev, check 정의를 비교한다. 같은 본문 재커밋만으로 완료 결과를 stale로 만들지 않는 계약은 새 커밋의 exact receipt pointer 잠금과 모순되지 않는다. |
| D1 discoverability/normal-only 문구 | SKILL description에 판본 생성/상태 trigger가 있고 reference는 recheck/recommit 미지원을 설명한다. 적절한 보정이다. |
| D1 Claude-only trailer 이의와 Codex recovery | task-D1-fix-codex.md가 Codex 수정을 명시하고 d19aeef는 Codex trailer를 갖는다. 이를 Claude로 바꾸라는 이전 이의는 기각한다. 계획 생성 코드의 Claude 기여 표기는 근거가 있다. fix trailer 부재만으로 오류라 판단하지 않는다. 619d032 등 개별 편집의 실제 작성 주체는 Git 메타데이터만으로 확정할 수 없어 추가 저자 오류를 단정하지 않는다. |

## 재현 근거와 위치

- 작업 위치: /path/to/folio-worktrees/n6.
- 런타임: /path/to/node-runtime/bin/node --input-type=module.
- probe는 표준입력으로 실행해 별도 파일을 만들지 않았다. 아래 재현 소스를 이 보고서에 보존한다.
- fixture 원본: test/fixtures/serial-2level. variantWork()가 OS tmpdir 아래 folio-serial-2level-XXXXXX 폴더에 복사했다. 두 probe 모두 finally에서 임시 작품을 삭제했다. 무작위 절대 경로는 출력에 남기지 않아 복원할 수 없다. 실제 작품이나 원본 fixture는 변경하지 않았다.

재현 소스(위 작업 위치에서 Node 표준입력으로 실행):
```js
import { variantWork, commitMain, putVariantFile, patchWork } from './test/support/variant-work.js';
import { fakePacks } from './test/support/fixtures.js';
import { createFakeHost, driveToEnd } from './test/support/fake-host.js';
import { createRunner } from './core/run/runner.js';
import { createRunStore } from './core/run/run-store.js';
import { openWorkspace } from './core/run/workspace.js';
import { openLedger } from './core/ledger/ledger.js';
import { commitNode } from './core/run/commit.js';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
const root = await variantWork();
try {
  await commitMain(root, 'ep-001', '합성 원본.\n');
  await putVariantFile(root, 'en', 'ep-001.md',
    '---\ntitle: Existing title\ncustom: keep\n---\nExisting body.\n');
  try {
    await driveToEnd(() => createRunner({ root, packs: fakePacks(), hooks: {
      afterBodyWrite() { throw new Error('interrupted'); },
    } }), createFakeHost({ drafts: { '*': 'Synthetic translation.\n' } }),
    { start: { node: 'ep-001', variant: 'en' }, until: o => o.status === 'done' });
  } catch (e) { console.log('interrupt', e.message); }
  const run = (await createRunStore(root).list()).find(r => r.variant === 'en');
  console.log('saved state', run.state, 'title before',
    (await readFile(join(root, 'variants/en/ep-001.md'), 'utf8')).includes('Existing title'));
  await patchWork(root, { features: { variants: false } });
  for (const args of [{ node: 'ep-001', variant: 'en' }, { variant: 'en' }, {}]) {
    try { console.log('run', args, await createRunner({ root, packs: fakePacks() }).run(args)); }
    catch (e) { console.log('run', args, 'error', e.code); }
  }
  try { console.log(await createRunner({ root, packs: fakePacks() }).decide({
    runId: run.runId, action: 'skip', reason: 'synthetic recovery',
  })); } catch (e) { console.log('skip error', e.code); }
  const ctx = await openWorkspace(root, { packs: fakePacks() });
  const ledgers = Object.fromEntries(['receipts', 'events', 'decisions'].map(x => [x, openLedger(root, x)]));
  const result = await commitNode({ root, work: ctx.work, ledgers,
    pipeline: ctx.pipelines.variants.en, receipt: run.receipt, text: run.outputs.draft, resume: true });
  console.log('direct commit success', Boolean(result.receiptId), 'file after',
    JSON.stringify(await readFile(join(root, 'variants/en/ep-001.md'), 'utf8')));
} finally { await rm(root, { recursive: true, force: true }); }
```

실제 출력:

```text
interrupt interrupted
saved state committing title before true
run { node: 'ep-001', variant: 'en' } error FEATURE_DISABLED
run { variant: 'en' } error FEATURE_DISABLED
run {} error RUN_IN_PROGRESS
skip error RUN_NOT_AWAITING_USER
direct commit success true file after "Synthetic translation.\n"
```

추가 설정 probe 결과: constructor/con/trail- 선언 오류 없음. 기능 꺼짐 + includeAllHardChecks:true + hard 검사 stage off는 CONFIG_INVALID [HARD_CHECK_OVERRIDE]. 이 probe도 합성 fixture의 임시 복사본만 사용하고 삭제했다.

## 검증 범위와 제한

- 기존 증거: task-D1-report.md와 브리프의 Node24 전체 npm run check 1,133/1,133 및 lint/typecheck 통과, 최종 문서 수정 후 8/8 통과. 같은 검사는 다시 돌리지 않았다. 이번 최종 검토가 전체 실행을 새로 수행했다고 주장하지 않는다.
- 새 증거: 위 실제 runner/commit 쓰기 probe, feature-off hard placement probe, 변경 파일 줄 수, Git 로그/작업 트리 확인. 검토 시작 시 tracked working tree는 깨끗했다.
- git diff --check는 계획 문서에 삽입한 unified diff의 공백 context 줄들을 trailing whitespace로 보고했다. 실행 코드 공백 결함이 아니며 패치 재생 자료를 수정하라는 요구로 승격하지 않는다.
- 정본 착수 계획서 아티팩트는 제공되지 않았다. 구현 계획의 설계 요약과 승계된 결정을 기준으로 판단했으며 정본과의 완전 일치는 인증하지 못한다.
- 실제 모델/외부 호스트, Windows/Linux·다른 Node 버전, 수백 판본 성능, 부모 디렉터리 동시 교체는 새로 검증하지 않았다. 원본 체크아웃, vibelore, 다른 레인 worktree는 접근/변경하지 않았다.
- A1 분리는 기존 newRun/context 동작과 main next 연속 실행을 보존한다. evidence/occurrence gated ledger 오류에 식별 정보만 더했으며 receipts/events/decisions 잠금 기록장을 기능 설정으로 생략하는 변경은 없다. 최종 N6의 새 판본 진입 문은 I1로 별도 실패한다.

## Plan/spec verdict, quality verdict, Ready to merge

- **Plan/spec verdict: 수정 필요.** 주요 기능, 격리, 잠금 및 명시한 변경 판정은 충족하지만 기능 꺼짐 상태의 잠긴 커밋 완료와 앞머리 보존 계약은 충족하지 못한다.
- **Quality verdict: 수정 필요.** 책임 분리, 실제 기록장 기반 공격 검증, 호환/목록 테스트는 양호하다. 공개 복구 경로와 데이터 보존의 두 Important 결함은 병합 전에 해결해야 한다.
- **Ready to merge: No — I1/I2 수정 후 가능.** 한 수정 파동에서 두 결함을 고치고 실제 실행기에서 feature-off locked resume가 정상 완료되면서 앞머리/기록장/원본 격리를 유지하는 집중 회귀 검증 후 한 번의 범위 제한 재검토를 수행한다.


## 단일 최종 수정 보고

# N6 final fix report

- Result: DONE
- Branch / base: `feat/n6-variants` / `d19aeef`
- Commit: `2fd0389 fix(variants): finish locked runs and preserve target metadata`
- Scope: final review I1 and I2 only. No other checkout, remote, or real work was changed. Test works are temporary copies of synthetic fixtures.

## Changes

1. `createRunner.run()` identifies an open request before applying the new-variant feature gate. A matching open variant still has its declaration and mode checked; `assertRunFeatures` permits feature-off continuation only when the run is `committing` and its own receipt is recorded. New and unrecorded runs continue to fail with `FEATURE_DISABLED`; a different variant or main request gets `RUN_IN_PROGRESS`.
2. Variant commit writing reads only its target Markdown file immediately before serialization, through the open-handle `readOriginalFile` guard. It preserves the target's parsed frontmatter while replacing the body. A linked/non-regular target gets `VARIANT_FILE_INVALID`; malformed frontmatter gets the explicit parser error. The existing parent directory guards remain. The feature-off workspace path still does not load unrelated variants or terms.
3. Updated the store test to use a real existing file and added a public-runner recovery regression. It interrupts after body write, turns variants off, leaves malformed unrelated terms, resumes the recorded run, and verifies title/custom/body, one receipt and one commit, append-only receipt prefix, unchanged main text and side ledgers. It also checks wrong-request isolation, an unrecorded `committing` run, and malformed/symlink/hardlink targets without clobbering or commit records.

## Commands and observed results

- RED: `PATH=/path/to/node-runtime/bin:$PATH node --test test/run/variant-locked-recovery.test.js` — 5 tests; 1 pass, 4 fail. The failures were the existing `FEATURE_DISABLED` gate blocking public recovery and its target safety cases.
- Focused: `PATH=/path/to/node-runtime/bin:$PATH node --test test/run/variant-locked-recovery.test.js test/run/variant-commit.test.js test/run/variant-run.test.js test/core/variant-store.test.js test/core/variant-status.test.js` — 39 tests; 39 pass, 0 fail.
- Full: `PATH=/path/to/node-runtime/bin:$PATH npm run check` — lint and typecheck passed; 1,138 tests passed, 0 failed.
- `git diff --cached --check` — exit 0 before commit.

## Self-review, cost, limits

- I1: the exception derives from `variantLocked`, which requires both `committing` state and `receiptRecorded` for that run; it cannot be invoked by a fresh variant request. Declaration/mode checks remain in the matching-open path. The existing commit path still enforces receipt, hash, decisions, original, hard, pipeline, and path locks.
- I2: the writer no longer relies on `work.variants`, which is empty when the feature is off. The read is limited to one target and uses the same open-handle symlink/hardlink protection as source reading. A malformed target leaves its bytes and commit record untouched; an already recorded receipt stays in the append-only ledger for a later safe retry.
- Cost: one target-file read and frontmatter parse per variant body write; no dependency or model/network use added.
- Limit: static parent directory link checks remain path-based; concurrent replacement of a parent directory is outside the documented protection boundary. No actual external model, Windows/Linux, or concurrent parent replacement was tested. These are unchanged boundaries, not a claim of protection.

## 단일 수정 재검토

# N6 최종 수정 범위 재검토

- 범위: **d19aeef..2fd0389**, I1/I2 및 그 수정으로 생긴 새 문제만.
- 작업 위치: /path/to/folio-worktrees/n6.
- 입력: final-fix-brief.md, final-review.md, task-final-fix-report.md, review-d19aeef..2fd0389.diff.
- 소스/index/HEAD 읽기 전용, 하위 에이전트 없음. 이번 보고서만 작성했다.
- 판정: **I1 ADDRESSED / I2 ADDRESSED**, 새 Critical/Important/Minor **0/0/0**.

## I1 — ADDRESSED

수정 위치: core/run/runner.js:104, core/run/variant-plan.js:22.

열린 실행이 있으면 먼저 sameRequest로 노드·판본을 맞추고, 판본 선언/타입/normal 모드를 검증한 뒤 assertRunFeatures를 적용한다. 새 판본 실행은 기존 assertVariantRequest를 거쳐 기능이 켜져 있어야 시작된다.

잠긴 예외는 여전히 variantLocked → receiptRecorded → recordedReceiptOf로 판단한다. committing 상태만으로 허용하지 않고 기록장 영수증의 receiptId/runId/nodeId/variant가 해당 실행과 같아야 한다. 그 뒤 drive/commitStep/commitNode의 기존 pipeline, receipt body, draft hash, hard, decisions, original pointer 검증을 그대로 통과해야 실제 쓰기가 된다. main 및 다른 판본 요청이 그 실행을 이어가는 경로도 열리지 않았다.

새 test/run/variant-locked-recovery.test.js:34의 실제 실행기 회귀 테스트는 다음을 한 흐름에서 검증한다.

- afterBodyWrite 중단으로 영수증만 기록되고 commit record가 없는 상태를 만든다.
- 기능을 끄고 다른 판본에 malformed terms를 둔다.
- main/fr 요청은 RUN_IN_PROGRESS로 거부되고 en 요청은 done으로 완료된다.
- 같은 영수증이 정확히 하나, commit이 정확히 하나이며 이전 receipt ledger prefix가 보존된다.
- 원본 파일과 events/occurrences/evidence 기록이 그대로다.
- 완료 뒤 새 fr 실행은 FEATURE_DISABLED로 거부된다.

같은 테스트 파일:56은 committing 상태로 바꿨더라도 영수증이 없는 실행을 FEATURE_DISABLED로 거부한다. 기존 일반 실행 테스트와 합쳐 최초 지적의 공개 복구 경로 및 예외 범위를 충분히 확인한다. 전체 판본/terms 읽기를 다시 켜는 변경은 없다.

## I2 — ADDRESSED

수정 위치: core/run/commit.js:123, core/store/variants.js:108.

writer는 비어 있을 수 있는 work.variants/previous 객체에 의존하지 않는다. 정적 부모 폴더 검사를 한 뒤 실제 대상 Markdown 파일 하나를 readOriginalFile로 열고, 읽은 앞머리를 parseDoc하여 새 본문과 함께 직렬화한다. 따라서 기능을 꺼도 현재 파일의 title/custom 필드를 보존한다.

- readOriginalFile의 열린 handle 기반 O_NOFOLLOW/일반 파일/nlink 검증을 재사용한다.
- 대상 없음(ENOENT)은 새 파일로 다루고, 비정상·symlink·hardlink 대상은 VARIANT_FILE_INVALID로 거부한다.
- malformed frontmatter는 쓰기 전에 명시적 파서 오류를 내므로 metadata를 빈 객체로 대체하지 않는다.
- 쓰기는 기존 atomic writer를 유지하며, commit record는 본문 쓰기에 성공한 뒤에만 추가한다.
- writeVariantText의 바뀐 인자 형식은 모든 core/test 호출부에 반영되어 있다. 별도 누락 호출부를 찾지 못했다.

test/run/variant-locked-recovery.test.js:34는 기존 title/custom/body를 실제 공개 복구 경로에서 확인한다. :68부터의 세 테스트는 malformed/symlink/hardlink 대상을 만들어 바이트 보존과 commit record 미추가를 확인한다. 기존 store 보존 테스트도 모의 previous 객체 대신 실제 파일을 만들어 검사하도록 바뀌어 실제 새 계약을 검증한다.

## 수정 범위의 품질 판정

**Spec PASS / Quality PASS.**

기능 문을 선언/모드 검증과 분리한 변경은 작고 예외 조건을 기존 영수증 판단 함수에 맡긴다. 앞머리 복구도 대상 하나의 제한된 읽기로 해결하여 no-read 설정을 전체적으로 뒤집지 않는다. 기록장/원본 잠금을 완화하거나 에러를 삼키는 변경은 없다.

변경 파일은 6개다. runner.js 195줄, variant-plan.js 90줄, variants.js 125줄, 새 회귀 테스트 88줄로 크기 제한을 만족한다. core/packs 모델·네트워크 호출이나 의존성 추가는 없다. 기존 assertion을 약하게 하지 않았으며, 단일 수정 커밋은 Codex 기여를 명시한다.

## 검증 근거

- 구현 보고의 RED: 새 회귀 테스트 5개 중 1 통과/4 실패. 원래 공개 복구 gate 실패를 확인했다.
- 구현 보고의 집중 GREEN: 39/39.
- 구현 보고의 Node24 전체 npm run check: lint/typecheck 통과, 1,138/1,138.
- 재검토에서 해당 소스·새 테스트·호출부·잠금 연계 경로를 읽고 Git diff 범위를 확인했다. git diff d19aeef..2fd0389 --check는 오류 없이 끝났으며 tracked working tree는 깨끗했다.
- 새로 실행해야 할 구체적 미해결 위험을 발견하지 않아 기존 39/39 및 1,138/1,138 검사를 반복하지 않았다. 이번 재검토가 그 테스트를 새로 실행했다고 주장하지 않는다.

## 남은 제한

- 부모 디렉터리 lstat 뒤의 악의적 동시 교체는 기존 문서화된 보호 경계 밖이다. 정적 링크 거부를 동시 교체 방어라고 해석하지 않는다.
- 대상 파일 한 번의 추가 읽기/파싱 비용이 든다. 앞머리는 의미를 보존하며 YAML 주석·원래 직렬화 바이트까지 보존하는 계약은 아니다.
- 실제 외부 모델/호스트, Windows/Linux·다른 Node 버전은 이번 수정이나 재검토에서 검증하지 않았다.
- 이전 최종 보고의 비차단 유보와 정본 아티팩트 미확인 제한은 그대로다. 이번에 전체 브랜치나 그 유보들을 재검토하지 않았다.

## 최종 결론

**Ready to merge: Yes — 이 검토의 I1/I2 차단은 해제한다.**

한 번의 최종 수정 파동과 한 번의 제한된 재검토를 완료했다. 이 범위에 추가 수정 요구는 없다. 이후 통합 및 병합 절차는 제어 세션의 기존 계약을 따른다.
