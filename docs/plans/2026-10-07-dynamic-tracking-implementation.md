# Dynamic Tracking Implementation Plan

상태: 구현 및 독립 최종 재검토 완료 — 2026-10-07 로컬 합성 수용 A1–A20/A17b 및 최종 check 909/909 통과.
증거 정본: [추적 수용 증거](../tracking-verification.md). 최종 수정의 독립 재검토와 커밋 후 컨트롤러의 새 전체 검증을 통과했다.
원격 CI·실제 호스트 발견 정확도는 미검증이다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 인터뷰로 정한 작품별 추적 기준을 보관하고, 집필 중 발견과 과거 원고 보충을 원문 근거·위임·영수증으로 검증한다.

**Architecture:** 추적 정본은 추가만 되는 tracking 기록장이다. 선언형 기준과 실행 내 후보를 분리하고, 원고 확정 또는 보충 영수증에 맞는 batch만 활성화한다. 기존 엔진과 호스트 경계를 유지하며 새 모드는 별도 모듈로 연결한다.

**Tech Stack:** Node.js 22.13+/24/26, ESM JavaScript, node:test, 기존 MCP SDK·YAML·SQLite. 런타임 의존성을 추가하지 않는다.

**Spec:** `docs/plans/2026-10-06-dynamic-tracking-design.md` (2026-10-07 사용자 구현 승인).

## Global Constraints

- `core/`와 팩은 모델·네트워크를 호출하지 않는다. 모든 판단·생성은 호스트가 한다.
- hash 일치, 영수증, hard 차단, 추가만 되는 기록장, 자기검토 표기, soft 비자동수정은 끌 수 없다.
- 테스트는 합성 fixture만. 실제 작품·이미지·호스트 결과는 저장소에 커밋하지 않는다.
- 파일 하나에 책임 하나, 구현 파일 300줄 이하. 새 런타임 의존성을 추가하지 않는다.
- `/path/to/vibelore`는 읽기 전용이다. 기존 미커밋 변경을 보존한다.
- 실제 사용자 승인과 위임 아래 호스트가 한 행동의 출처를 구분한다. 사용자 결정을 만들어 넣지 않는다.
- planId는 `main`, valueType은 `text|number|boolean|entity|entity-list`, behavior는 `fixed|state|relation|note`다.
- evidence quote는 1~500자다. basis는 `explicit|attributed|inferred`이며 attributed에는 perspectiveId가 필수다.
- 구현·검토자는 이 계획의 자기 작업만 수행한다. 추가 하위 에이전트는 컨트롤러가 배정한다.
- 각 작업은 실패 테스트 실행 → 구현 → 집중 테스트 → 전체 check 1회 → 명시적 파일 커밋 → 독립 검토 순서다.

## Shared interfaces and file map

`readTracking(root, options={})` returns `{plan, records, subjects, observations, batches}`. `plan` is null before a user approval; plan.rev hashes normalized effective content, excluding version/time/ledger positions. Plan criteria include committed additions. `options` may contain `nodeIds`, `legacyEntities`, `receiptRecords`; reading must never create canonical records. `subjects` is an array; work.entities remains a Map. Observation entries retain provenance.

`normalizePlan(input,{nodeIds=[]}={})`, `planRevision(plan)`, `normalizeCriterion(input,{nodeIds=[]}={})` are pure. `assertDelegation(plan,action,grantId)` permits only the recorded active grant, with separate `addSubjects`, `addCriteria`, `addObservations`, `backfill` flags, default false.

`trackingChange(root,input)` is the public locked API for get/propose/decide/apply/query. Proposals are noncanonical files and checked against current expectedRev at decision time. changes uses `{subjects:[],criteria:[],plan?:...}`; full replacements require user decisions. Initial plans use expectedRev:null. Public writes reject an open run.

`prepareTracking(work,run,answer,{nodeId,text,mode='normal'})` returns a normalized candidate snapshot `{basePlanRev,effectivePlanRev,subjects,criteria,observations,checked,batchDigest,grantId}` without writing. `virtualTrackingWork(work,candidate)` returns a new work object. `trackingPayload(work,run,node)` returns active plan, bounded catalog, relevant observations, pending coverage and candidate state, or null if ineffective. `trackingRefs(work,run,node)` returns dedicated plan/snapshot refs.

`trackingBatchFor(run,receiptId)` returns the full receipt-bound batch or null. `appendTrackingBatch(root,batch)` is exact-content idempotent. `assertTrackingIntegrity(root,{receiptRecords,trackingRecords}={})` verifies prepared and active receipt relationships. `coverageFor(work)` and `trackingStale(work,receiptRecords,node)` are read-only projections. Readers never ignore malformed recorded tracking just because feature is off.

Each named module owns one responsibility. If schema, proposal, or snapshot projection exceeds 300 lines, split into named helpers (`criterion-schema.js`, `observation-schema.js`, `replay.js`, `proposal-io.js`, `snapshots.js`) and record the split. Do not refactor unrelated modules.

### Task 1: Plan, authority and append-only replay

**Files:** Create `core/tracking/schema.js`, `criterion-schema.js`, `plan.js`, `authority.js`, `records.js`, `replay.js`; modify `core/store/work.js`; tests `test/tracking/plan.test.js`, `test/support/tracking.js`.

**Interfaces:** Produce normalizePlan, normalizeCriterion, planRevision, assertDelegation, readTracking. Work gains `tracking` with null plan/empty arrays for legacy works. Replay accepts tracking_plan records with `{proposalId,proposalDigest,source,grantId,plan}`; host records must reference a prior user grant. Batch replay integration is completed in Task 5; unknown or malformed tracking record types fail closed.

- [x] Write behavioral failing tests using temporary synthetic work roots. Include arbitrary kinds across mystery/cookbook/picturebook, strict unknown fields, unique stable IDs, appliesTo node IDs, fixed expectedValue, delegation defaults, meaningful interview answers, reconnect and tamper detection.

```js
const p = normalizePlan({planId:'main',purpose:'추리',audience:'초보',priorities:['열쇠'],
  subjectKinds:['object'],criteria:[{id:'owner',title:'소유자',instruction:'소유자 기록',
    subjectKinds:['object'],valueType:'text',behavior:'state',appliesTo:'all'}],delegation:{}});
assert.equal(p.delegation.addSubjects,false);
assert.equal(planRevision(p),planRevision({...p,version:99,rev:'ignored'}));
assert.throws(()=>assertDelegation({...p,delegation:{addSubjects:true}},'addSubjects','fake'));
```

- [x] Run `node --test test/tracking/plan.test.js`; observe missing export or behavior failure before implementation.
- [x] Implement pure normalized validation plus append-only replay. Reject executable/non-JSON input. Preserve text interview answers and summaries in optional `{summary,answers:[{question,answer}]}`. Default delegation flags false. Grant provenance requires user decision identity. Repeated ID cannot silently change a criterion; replacement plan changes require a user record and version increase. Use canonicalJson/sha256.

```js
export const planRevision = plan => sha256(canonicalJson(normalizedPlanContent(plan)));
// readTracking reads the existing ledger; openWork attaches this read-only projection.
```

- [x] Run focused tests and `npm run check` under bundled Node 24. Document RED/GREEN command and output in task report.
- [x] Commit only Task 1 files with `feat: add declared tracking plans and grant replay`.

### Task 2: Proposal decisions and MCP entry point

**Files:** Create `core/tracking/change.js`, `proposals.js`, `proposal-io.js`, `view.js`, `subject-schema.js`, `server/tools/tracking.js`; modify `core/tracking/replay.js`, `server/tools/definitions.js`, `handlers.js`; tests `test/tracking/change.test.js`, `test/server/tracking-tool.test.js`, existing exact tool lists.

**Interfaces:** Consume readTracking/normalizePlan/authority. Produce trackingChange(root,input) and tool handler. changes subjects/criteria additions supported; full plan replacement is user-only. query initially exposes canonical replay entries; coverage added Task 7.

Public subject changes require a shared `normalizeSubject(input,context)` pure definition validator; Task 3 reuses it for candidates and canonical merge. `tracking_plan` records may additionally carry `subjects:[]` definition changes, validated against prior definitions/legacy IDs and exact committed-node discovery evidence. User decisions can update managed display names/aliases under the same stable ID; host can only add new definitions with addSubjects. Subject-only host records do not require addCriteria. Proposal cache binds both expected plan rev and base version so metadata-only changes cannot let two pre-existing proposals activate against one state. Subject rev hashes declaration content, independent of version/provenance. Task 3 completes index/rename/virtual candidate integration, rather than inventing a second subject schema.

- [x] Write failures for initial propose→decide approval, stale expectedRev, digest tampering, request_revision feedback, plan XOR changes, exact op fields, current active grant, host source, revocation, same-ID modifications, open run, duplicate decision/application and concurrent expectedRev single winner.

```js
const a=await trackingChange(root,{op:'propose',expectedRev:null,plan:syntheticPlan()});
assert.equal((await trackingChange(root,{op:'get'})).plan,null);
await trackingChange(root,{op:'decide',proposalId:a.proposalId,proposalDigest:a.proposalDigest,action:'approve'});
assert.equal((await trackingChange(root,{op:'get'})).plan.version,1);
await assert.rejects(trackingChange(root,{op:'decide',proposalId:a.proposalId,
  proposalDigest:a.proposalDigest,action:'approve'}),{code:'TRACKING_PROPOSAL_DECIDED'});
```

- [x] Run focused tests to observe actual failures.
- [x] Implement withWorkLock around read-modify-append writes. Proposal file is resume cache; ledger is decision authority. Validate rev/digest both at proposal activation and replay; approved retry does not append duplicates. Refuse plan writes during OPEN_STATES using `TRACKING_RUN_OPEN`. Apply only additive delegated actions, never fixed/meaning/scope/grant expansion. get/query retain integrity regardless feature. Cursor+limit defaults 50/max200; reject malformed values. Tool schema allows only root/op-specific fields, planId main, expectedRev null|string.

```js
// get/query are pure; all proposal mutations share the runner's work lock.
return withWorkLock(root,()=>activateCheckedProposal(root,input));
```

- [x] Run tracking/server tests and full check once; preserve tests for existing tools by deliberately appending folio_tracking.
- [x] Commit `feat: expose tracking proposals and explicit decisions`.

### Task 3: Managed subjects and virtual candidates

**Files:** Create `core/tracking/subjects.js`, `candidates.js`, `observation-schema.js`; modify work loader, index schema/rebuild/query and rename plan; tests `test/tracking/subjects.test.js`, `candidates.test.js`, core index/rename tests.

**Interfaces:** Produce prepareTracking(work,run,answer,options), virtualTrackingWork(work,candidate). readTracking subjects becomes canonical managed entity definitions. Normalized subject rev excludes path/seq/time. Managed entities have managed:true,path:null,storage:'tracking'; file entities remain supported.

- [x] Write failures for collisions across legacy/managed ID/name/aliases, arbitrary declared kinds, undeclared references, candidate disappearance after rejected draft, entity-list type, attributed perspective, hash/quote ambiguity, 500 limit and fixed explicit conflict. Candidates with nonfixed criteria use effectivePlanRev matching final replay.

```js
const c=prepareTracking(work,run,{planRev:work.tracking.plan.rev,
  discoveries:{subjects:[],criteria:[]},observations:[],checked:['owner']},
  {nodeId:'scene',text:'합성 본문'});
assert.deepEqual(c.checked,['owner']);
assert.equal(work.entities.size,virtualTrackingWork(work,c).entities.size);
assert.equal(c.basePlanRev,c.effectivePlanRev);
```

- [x] Run focused failures before implementing.
- [x] Validate all observations as an atomic batch: same node/hash, exact unambiguous quote+before/after, known subject/criterion, matching kind, correctly typed entity refs. fixed explicit mismatch throws TRACKING_FIXED_VALUE_CONFLICT; attributed/inferred persist separately. Discovery evidence follows same text rules. Auto additions require their separate grant flags, fixed candidates cannot activate without user decision. Checked is explicit and applies only valid current criteria. Candidate snapshot digest includes definitions/criteria/observations/checked and relevant plan/grant, excludes operational time/seq. Merge canonical definitions into openWork; reject collision. Nullable SQLite path and storage column; managed rename returns RENAME_MANAGED_ENTITY before any file transaction.

```js
const virtual = {...work,entities:new Map(work.entities),tracking:{...work.tracking}};
for(const s of candidate.subjects) virtual.entities.set(s.id,{...s,managed:true,path:null});
```

- [x] Run candidate/subject/index/rename tests and full check once. No candidate writes to canonical ledger.
- [x] Commit `feat: validate managed subjects and provisional observations`.

### Task 4: Extraction, model payload and candidate binding

**Files:** Create `core/tracking/extract.js`, `payload.js`; modify `core/run/steps/generate.js`, `core/run/payload.js`, sync/common/check/commit-guard as necessary, `core/work/features.js`, workspace, novel/knowledge extract prompts; tests `test/run/tracking.test.js`, existing features/digests.

**Interfaces:** Consume prepareTracking/virtualTrackingWork. Produce trackingPayload, trackingRefs; run.outputs.tracking stores candidate bound to draftHash. Tracking acts only with approved plan and feature not false. featuresDigest accepts optional plan presence while old no-plan projection remains identical.

- [x] Write failing actual-engine tests for old no-plan host, feature false, missing tracking/checked retry, discovery used in events/checks, full declaration data in relevant entities, bounded catalog, abandoned candidate, draft change, external plan change and post-review candidate tamper.

```js
const request=await runner.run({node:'scene'});
// Drive normal draft steps using fake host, then inspect events/extract request.
assert.equal(extractRequest.payload.tracking.plan.rev,approvedPlan.rev);
assert.equal(extractRequest.payload.entities[0].data.color,'blue');
```

- [x] Run focused engine failures.
- [x] Add effective tracking field at end of FEATURES default true. Don't include it in no-plan old featuresDigest. Extraction requires tracking envelope only when effective; parse before validating event entity references against virtual work. Recheck must not turn missing tracking into backfill. SetDraft clears candidate. Include normalized plan+candidate in request and check decision refs; preserve body if plan change only needs extraction/check restart. Deterministic checks and host checks use same virtual definitions. Core never calls model. Same-host provenance labeling unchanged. Updated prompts request declared observations, exact quotes and checked without creating checks or pretending user decisions.

```js
const candidate=prepareTracking(ctx.work,run,answer.tracking,{nodeId:run.nodeId,text:run.outputs.draft});
run.outputs.tracking={...candidate,draftHash:run.draftHash};
// virtual view is constructed per drive/check, never written by extraction.
```

- [x] Run actual-engine tracking tests plus old fake-host tests/full check once.
- [x] Commit `feat: connect declared tracking to extraction and review`.

### Task 5: Receipt-bound commit and integrity recovery

**Files:** Create `core/tracking/commit.js`, `integrity.js`, `snapshots.js`; modify run commit/receipt-builder/commit-step, receipts/decisions as required, generic ledger path guard and work-lock preflight; tests `test/run/tracking-commit.test.js`, `test/tracking/integrity.test.js`, synthetic crash support.

**Interfaces:** Produce trackingBatchFor(run,receiptId), appendTrackingBatch(root,batch), assertTrackingIntegrity(root,options). Batch `{receiptId,runId,nodeId,committedHash,basePlanRev,effectivePlanRev,batchDigest,...candidate}` stored in receipt and tracking_batch. Canonical definitions/criteria fold all valid committed batches, observations only matching latest commit/hash/receipt. No-plan legacy receipts stay readable.

Guard `.folio`/ledger/runs paths before the work lock can create a lock outside the selected work through a symlink. Limit ancestor checking to the selected root and its managed paths; ordinary OS aliases outside the root are not Folio state. Recorded-receipt recovery validates its original immutable batch and historical base plan; its own just-activated additions must not make resume reject the recorded receipt as stale.

- [x] Write failures at receipt/body/events/tracking/commit boundaries; same batch resume exactly once; prepared batch invisible before commit; same receipt other batch rejected; missing/tampered batch rejected even feature false; old snapshot after recommit excluded; definitions retained after rewrite; head and JSONL symlink rejection for events/tracking.

```js
await assert.rejects(commitNode({...options,hooks:{afterTrackingWrite(){throw Error('crash');}}}));
assert.equal((await readTracking(root)).observations.length,0);
await commitNode(options);
assert.equal((await readTracking(root)).observations.length,1);
assert.equal((await openLedger(root,'tracking').readAll()).filter(r=>r.type==='tracking_batch').length,1);
```

- [x] Run failures before changing commit.
- [x] Bind full normalized batch and candidate digest in receipts/check refs. Final validation rechecks hash+grant+fixed lock+evidence against authoritative work. Order receipt→body→events→tracking→commit; expose test hooks at each boundary. Recovery uses ledger receipt full batch, no best-effort swallow. Prepared batch read requires matching final commit; same receipt differing data fails. Ledger read/append refuses symlink directory/file/head before access. Reject forged commit marker without receipt/batch matching; retained definitions have stable normalized rev. All recorded tracking integrity checks run independently of feature setting.

```js
await receipts.append(receipt);
await writeCommittedBody();
await appendLegacyEvents();
await appendTrackingBatch(root,receipt.trackingBatch);
await receipts.append(commitMarker);
```

- [x] Run crash/tamper/recommit/asset regression tests and full check once.
- [x] Commit `feat: make tracking commits recoverable and receipt bound`.

### Task 6: Independent tracking-backfill execution

**Files:** Create `core/tracking/backfill.js`, `backfill-record.js`, `core/run/tracking-backfill-run.js` plus focused helpers; modify runner dispatch, receipt validators/status verifier, server mode schema; tests `test/run/tracking-backfill.test.js`.

**Interfaces:** `createTrackingBackfillDriver({env,context,packs})` exposes start/resume/decide/drive for mode tracking-backfill through same work lock/run store. Does not acquire nested lock. Backfill receipt type tracking-backfill contains committedHash/planRev/batchDigest/checks/refs. Existing normal/recheck/recommit contracts remain unchanged.

Backfill receipts also bind `commitReceiptId`, the current prose commit's receipt ID. Same-hash recommit with a new prose receipt does not resurrect an old backfill snapshot. Snapshot semantic refs exclude operational receipt IDs/time/seq so identical content processed again does not create an endless downstream stale loop.

- [x] Write failures for committed-only target, direct mode dispatch/resume reconnect, no prose generation/revision/gate, no-grant metadata gate, request_revision re-extract only, MAX_ANSWER_TRIES, original hash drift at start/resume/write, hard no activation, advisory no rewrite, idempotent receipt/batch and legacy event/occurrence/evidence bytes unchanged.

```js
const before=(await openWork(root)).tree.nodes.get('scene').body;
const o=await runner.run({node:'scene',mode:'tracking-backfill'});
assert.equal(o.status,'needs_model');
assert.equal(o.requests[0].payload.node.body,before);
assert.equal(o.requests[0].payload.produces,'events');
```

- [x] Observe failures, then implement separate small driver. Existing generated events may be parsed for checks but never appended by backfill. Extraction plus existing check selection remains; hard stores failed receipt without active batch. Metadata approval carries actual decision refs, not prose approval. Grant permits automatic record only inside recorded backfill authority. Drift throws TRACKING_TEXT_DRIFTED without overwriting old records. Plan change yields stale answer/re-extraction, never success. Final record verifies exact committed hash and current criteria; identical retry reuses normalized batch/receipt rather than duplicate observations. Feature false rejects new backfill, recorded integrity still checked.

```js
if(hashBody(currentNode.body)!==run.committedHash)
  throw new FolioError('TRACKING_TEXT_DRIFTED',run.nodeId);
// No setDraft/revise or updateNode call exists in the backfill driver.
```

- [x] Run backfill/normal/recheck tests and full check once.
- [x] Commit `feat: backfill tracking metadata without rewriting prose`.

### Task 7: Coverage, downstream stale and bounded queries

**Files:** Create `core/tracking/coverage.js`, `stale.js`; modify tracking view/payload, `core/scope/scope.js`, `stale.js`, `core/status.js`, recheck refs; tests `test/tracking/coverage.test.js`, `test/run/tracking-stale.test.js`.

**Interfaces:** Produce coverageFor(work) over committed node/hash/criterionId/criterionDigest and trackingStale(work,receiptRecords,node). Populate get/query/status/payload. Tracking refs use existing dedicated kinds `tracking_plan`/`tracking_snapshot` and stable normalized digest. A separate `tracking_candidate` binds the full batchDigest for new receipts; historical receipts retain their original candidate binding. Meaning-only stale refs never weaken approval locks. Latest valid successful backfill/recheck refs for the current prose receipt/hash can clear tracking stale only, never backfill coverage; ordinary entity/asset refs retain their original rule.

- [x] Write failures for zero observation checked, partial criteria/node coverage, blocked/drifted, late subject discovery conservatively reopening prior nodes, late criterion appliesTo, first-scene key→second discovery→first backfill→third payload, changed observation→later stale, identical backfill not stale loop and unchanged legacy entity stale behavior.

```js
const coverage=coverageFor(work);
assert.equal(coverage.find(c=>c.nodeId==='first'&&c.criterionId==='owner').state,'pending');
// After an explicit checked-empty batch, no observations is valid complete coverage.
assert.equal(coverageFor(after)[0].state,'complete');
```

- [x] Run failures; implement coverage from canonical snapshots and explicit checked only, never name absence. New subject discovery expands prior-node review demand with subject-set digest while criterionDigest remains semantic. Bind the reviewed subject catalog (managed and legacy file entity IDs) in the receipt/ref context; earlier batches without a verifiable catalog stamp remain conservatively pending. The candidate semantic digest remains separate from operational history pointers. Snapshot refs exclude seq/time. Scope sends relevant prior observations/provenance and pending ranges; catalog is bounded and never silently claims full lookup. query uses optional type `entities|observations|evidence|history` (default history) and returns one bounded entries page with validated cursor and limits, without duplicating an alias array. Evidence entries include original subject discovery/registration evidence (`origin:'subject'`) and current observation evidence (`origin:'observation'`); declaration evidence survives source rewrites as historical registration proof, without becoming a current observation or manufacturing quotes for file entities. Status integrity before projection, separate tracking stale from backfillPending. recheck fresh refs clear only tracking stale; legacy entity/asset behavior retained.

```js
const semanticDigest=sha256(canonicalJson({observations,checked}));
// Latest valid recheck refs override tracking refs, not ordinary entity refs.
```

- [x] Run integrated sequence/stale/coverage tests and full check once.
- [x] Commit `feat: report tracking coverage and downstream review needs`.

### Task 8: Human instructions, synthetic stdio and fresh install

**Files:** Create `docs/tracking.md`, `skill/folio/references/tracking.md`, `examples/tracking.js`, `test/server/tracking-stdio.test.js`; modify SKILL/checks, writing-guide/quickstart/testing/README, example verification, package smoke, CI workflow.

**Interfaces:** Public example uses actual MCP stdio transport and only synthetic inline fixtures. Explain interview→explicit grant→draft candidate→author prose approval→backfill→recheck→reconnect. root is user-chosen works folder, never this machine's path in public docs. No provider-specific API/image generation.

- [x] Add failing actual stdio and packed-install tests: initial plan approval, discovery hidden precommit, finalized managed path null, early-scene backfill preserves original hash, next payload provenance, observation change stale/recheck separation, reconnect, unsupported fields/types, tracking false recorded tamper failure.

```js
const client=await connectSyntheticMcp();
const p=await callTool(client,'folio_tracking',{root,op:'get'});
assert.equal(p.plan,null);
// Synthetic script submits explicit author decisions only within this fixture.
```

- [x] Observe focused failures; implement the example and docs. Explain interview text the human can copy, each separate delegation permission, actual author decisions and unfinished coverage. Claims limited to protocol/integrity; AI discovery accuracy and complete arbitrary-genre semantic checking aren't certified. Show mystery/cookbook/picturebook declarative criteria. Include query/backfill/recovery/error guidance and explain tracking-off limitations in plain Korean.
- [x] Run `npm run check`, examples verification, asset verification and package verification under Node 24. Packed install without devDependencies must contain docs/skill/example and complete tracking flow. Verify all changed implementation files <=300 lines and no model/network imports. CI workflow includes new example/tests; report remote CI as unexecuted unless actual URL/result available, no unauthorized push.
- [x] Record acceptance A1–A20/A17b coverage with concrete test file+name. Update design/plan state to implemented only if every required behavior passed. Commit `docs: teach dynamic tracking and verify packaged MCP flow`.

## Completion gate

Controller reviews each task and one final whole-change diff. Fresh final checks precede any completion statement. Keep branch/worktree available for user review; do not merge, push or publish. If any implemented boundary differs from approved design, record the decision and practical cost in progress ledger and final report. Actual model discovery quality remains a separately authorized real-use evaluation.
