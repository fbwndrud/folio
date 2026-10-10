# Folio 검증 후 단계별 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. 체크박스로 진행을 기록한다.

**Goal:** 현행 데이터 보존 결함을 먼저 고치고, 도메인 중립 원본→입력→결과→발행→판본 조회를 구현한다.
**Architecture:** 현행 집필 경로를 유지하며 신규 계약을 병행한다. 정본·발행은 단일 기록자에서 결속하고 Projection은 판본 manifest로 조회한다.
**Tech Stack:** 기존 Node.js ESM, 파일, hash-chain 기록장, node:sqlite, MCP SDK. P0/P1은 새 DB 서비스 없이 구현한다. 사용자 추가 요청으로 T11에서 선택적 Google 멀티모달 임베딩 어댑터를 연결한다.
**Spec:** [architecture-v2](architecture-v2.md). 근거와 재현: [audit](current-state-audit.md), [review](harsh-review.md).
**Status:** 2026-10-08 사용자가 Superpowers 구현을 승인했다. P0/P1과 T11 구현·작업별 독립 리뷰를 마쳤다. 종합 검토 및 최종 검증은 [실행 기록](execution-report.md)에 기록한다. 실제 작품 승인은 수행하지 않는다.

## 전역 제약

- 설계 정본: 착수 계획서 아티팩트. 구현 계획: docs/plans/.
- 테스트 데이터는 합성 fixture만. 실제 작품·생성 결과물을 커밋하지 않는다.
- 모듈 하나에 책임 하나. 파일이 300줄을 넘으면 나눈다.
- core/는 모델·네트워크를 부르지 않는다.
- 잠금 규칙(hash 일치, 영수증, hard 차단, 추가만 되는 기록장, 자기검토 표기, soft 비자동수정)은 설정으로 끌 수 없어야 한다.
- 소통은 한국어, 코드 식별자는 영어.
- /path/to/vibelore 는 읽기 전용 이식 원본이다.
- 현재 지원 Node 범위는 ^22.13.0 || ^24.0.0 || ^26.0.0, 로컬 기준 검증은 Node 24로 수행한다.
- 원래 dirty checkout을 보존한다. 신뢰하는 로컬 단일 사용자·한 작업 공간이 첫 지원 범위다.
- 실제 사용자 결정 없이 작품 채택을 기록하지 않는다. 테스트의 모의 결정은 임시 fixture에만 한다.

## 의존성과 작업 크기

P0의 T1–T5는 각각 독립 회귀가 가능하다. T6는 발행·legacy seed 계약을 검토한 뒤 수행한다.
P1의 T7→T8→T9→T10은 순서대로 진행한다. P0 완료 전 범용 실행을 기존 작품에 적용하지 않는다.
각 Task는 red 확인→최소 구현→green/관련 회귀→독립 리뷰→해당 파일만 커밋으로 끝낸다.
새 디렉터리의 파일 배치는 아래 책임을 기준으로 하며 추상 Adapter framework를 먼저 만들지 않는다.

## P0 현재 결함 보완

### Task 1 중단 복구의 새 편집 보호 H1

Files: 신규 `core/run/commit-target.js`, `core/run/commit-intents.js`; 수정 `core/run/commit.js`, `core/run/steps/commit-step.js`, `core/run/runner.js`;
Test: 신규 `test/run/commit-edit-recovery.test.js`, 기존 `test/run/commit.test.js`, `test/run/resume.test.js`.
Interface: `classifyCommitTarget({currentHash,beforeHash,afterHash}) -> before|after|conflict`;
`prepareCommitIntent(root,{receiptId,receiptDigest,path,beforeHash,afterHash})`, `readCommitIntent(root,receiptId)`.
입력은 전체 파일 bytes hash다. intent는 별도 추가만 되는 commit-intents 기록장으로 영수증보다 먼저 보존한다.

- [x] harsh-review의 human_edit_recovery를 회귀 테스트로 옮겨 아래 조건이 현재 실패함을 확인한다.
```javascript
await assert.rejects(runner.run({node:'next'}), {code:'COMMIT_TARGET_CONFLICT'});
assert.equal((await openWork(root)).tree.nodes.get('stairwell').body, 'human edit after crash');
```
- [x] 분류 함수는 current===after이면 쓰기 생략, current===before이면 적용, 그 밖은 conflict로 구현한다. 재개 때 새 before를 만들지 않는다.
- [x] 최초 정상 발행에서 intent→receipt→파일 순서를 적용하고 marker 전후 kill·앞머리만 수정·본문 수정·재시도를 검사한다.
- [x] 옛 intent 없는 영수증은 이미 승인 본문인 경우 비덮어쓰기 완료만 허용한다. 다른 상태는 충돌로 남긴다.
- [x] COMMIT_TARGET_CONFLICT에서 이유 있는 skip을 허용해 충돌→skip→새 run을 검사한다. 편집과 과거 기록을 보존하고 새 결정을 요구한다.
- [x] 기존 exact-once·receipt 소비·skip·hard/soft·재검사 회귀와 전체 check 후 리뷰·커밋한다. 완료: 새 편집 손실 0, 동일 영수증 중복 발행 0.

### Task 2 기록장 framing H2

Files: `core/ledger/ledger.js`; Test: 신규 `test/core/ledger-framing.test.js`, 기존 `test/core/ledger.test.js`.
Interface는 openLedger를 유지한다. 완전한 JSON tail은 다음 append 앞에 newline을 추가해 종료하고, 불완전 JSON은 쓰기 전에 거부한다.

- [x] ledger_tail 사례를 red로 만들고 입력 파일과 head의 bytes를 전후 비교한다.
```javascript
assert.equal((await ledger.append({type:'event',eventId:'e2'})).seq, 2);
assert.deepEqual(await ledger.verify(), {ok:true});
assert.equal((await ledger.readAll()).length, 2);
```
- [x] readAll로 완전성과 chain을 검증한 뒤 separator+새 record를 append한다. 기존 prefix를 수정하거나 truncate하지 않는다.
- [x] 잘린 JSON·잘못된 head·append/head 사이 kill을 추가하고 실패가 성공 seq를 반환하지 않는지 확인한다.
- [x] ledger 관련 검증·전체 check 후 리뷰·커밋한다. 정전 durability는 성공 주장에 포함하지 않는다.

### Task 3 관리 자산 SQL 계약 H3

Files: `core/index/schema.js`, `core/index/rebuild.js`, 필요 시 `core/index/query.js`;
Test: 신규 `test/server/managed-assets-find.test.js`, 기존 `test/core/index.test.js`.
Interface: 기존 folio_find 응답 유지. assets.path는 nullable이며 storage=file|managed를 명시한다.

- [x] managed_index를 Toolbox 회귀와 stdio 통합 검사로 만들고 현재 NOT NULL 실패를 확인한다.
```javascript
assert.equal((await call('folio_assets',{op:'add',id:'toy-image',brief:{description:'합성'}})).ok, true);
assert.equal((await call('folio_find',{query:'usages',id:'junho'})).ok, true);
```
- [x] 자산 insert에 실제 storage와 optional path를 기록한다. path가 필요한 기존 호출자는 storage를 먼저 확인한다.
- [x] legacy YAML 자산·설명서만·파일·URI-only·미연결 자산의 usages/events를 검사한다. cache DB는 재구성으로 이행한다.
- [x] index·asset·find 회귀/전체 check 후 리뷰·커밋한다. 가짜 경로 생성과 공개 응답의 의미 변경은 금지한다.

### Task 4 실패한 재구성 보존 H4

Files: 신규 `core/index/generation.js`; 수정 `core/index/rebuild.js`, `server/tools/find.js`;
Test: 신규 `test/core/index-generation.test.js`.
Interface: `buildIndexGeneration(root,{hooks}) -> {path,inputDigest}`; `publishIndexGeneration(root,candidate)`.
공개 rebuildIndex(root)는 유지한다. 기존 파일·기록장을 동일 잠금 범위에서 읽고 inputDigest를 재확인한 뒤 공개한다.

- [x] old index를 만든 뒤 삽입 fault를 주입하는 red 테스트를 작성한다.
```javascript
await assert.rejects(rebuildIndex(root, {hooks:{beforePublish:()=>{throw Error('fault');}}}));
assert.deepEqual(dumpIndex(openIndex(root)), beforeDump);
```
- [x] 별도 DB를 완성·검증·닫은 뒤 atomic pointer 또는 안전한 교체를 수행한다. old DB를 먼저 rm하지 않는다.
- [x] 실제 wrapper의 공개 options에 test hook만 추가하며 fault 없을 때 기존 counts 응답을 유지한다. 열린 reader·Windows 교체도 지원 환경에서 확인한다. 이번 실행은 macOS reader와 EPERM 주입만 검증했으며 실제 Windows는 미검증이다.
- [x] 입력 변경 중 build를 공개하지 않고 중단 후 이전 generation을 유지한다. index 회귀/전체 check 후 리뷰·커밋한다.

### Task 5 살아 있는 단일 기록자 보호 H5

Files: `core/run/work-lock.js`; Test: 신규 `test/run/work-lock-process.test.js`.
Interface withWorkLock(root,fn)는 유지한다. 로컬 PID가 살아 있으면 경과 시간만으로 takeover하지 않는다.

- [x] 별도 child에 Date.now+600001을 주입하는 사례를 red로 만든다.
```javascript
assert.equal(child.status, 0);
assert.match(child.stdout, /WORK_LOCKED/);
assert.doesNotMatch(child.stdout, /second writer entered/);
```
- [x] child는 WORK_LOCKED를 잡고 0으로 종료하는 테스트 프로그램으로 만든다. dead PID·clock backward·잘못된 lock body를 각각 검사한다.
- [x] malformed lock은 살아 있는 writer 여부를 추정해 탈취하지 않고 관리 충돌로 거부한다. dead PID의 잔여 lock만 복구한다.
- [x] PID 재사용·정지 후 재개를 추가 실험하고 lease/fencing은 도입하지 않는다. 관련 회귀/전체 check 후 리뷰·커밋한다.

### Task 6 사건과 retraction의 발행 가시성 H6

Files: 신규 `core/ledger/event-visibility.js`; 수정 `core/index/rebuild.js`, `core/run/workspace.js`, `core/status.js`, `core/scope/scope.js`의 실제 event 소비 경로;
Test: 신규 `test/run/event-publication.test.js`, 기존 commit/recommit/index/status tests.
Interface: `publishedEvents({eventRecords,receiptRecords,legacyImports,legacyMode}) -> events`.
receipt와 연결된 event/retraction은 final commit 후에만 활성화한다. 기존 activeEvents는 순수 fold로 남긴다.

- [x] prepared_event와 재커밋 retraction 중단을 red로 만들고 아래 결과를 검증한다.
```javascript
assert.deepEqual((await findInWork(root,{query:'events',id:'junho'})).events, []);
assert.deepEqual(publishedEvents({eventRecords,receiptRecords,legacyImports:[],legacyMode:false}), []);
```
- [x] 최종 marker 전에는 이전 발행 사건을 유지하고 새 사건·취소 모두 숨긴다. marker 후 두 변화가 함께 보이도록 fold한다.
- [x] 옛 집필 호출은 legacyMode=true로 미연결 seed 의미를 유지한다. receipt 연결된 prepared 행은 이 모드에서도 숨긴다.
- [x] 신규 범용 Query는 legacyMode=false다. 옛 seed 반입은 dry run·분류·사용자 선택 manifest 이후이며 자동 fact 승격은 없다.
- [x] query뿐 아니라 다음 모델 입력·status·recheck의 사건 소비도 대조한다. 전체 check·examples/package 후 리뷰·커밋한다.

## P1 최소 범용 수직 슬라이스

T7–T10의 함수·MCP 도구명은 신규 계약의 제안이다. 이 계획을 실행할 때 공개하기 전 schema review를 한다.
기존 도구를 교체하지 않는다. 그림·PDF 파싱·검색 엔진을 모두 새로 만드는 단계가 아니다.

### Task 7 범용 원본과 불변 판본

Files: 신규 `core/resources/schema.js`(envelope), `core/resources/files.js`(로컬 bytes), `core/resources/revisions.js`(판본 객체), `core/publications/state.js`(공통 marker);
Test: 신규 `test/resources/revisions.test.js`.
Interface: `createResourceStore(root) -> {propose,readRevision,readContent,decideSource,readSourceSelection}`.
`propose({resourceId,kind,parents,owned:{bytes,mediaType}|external:{uri,reportedRevision},schemaRef}) -> candidate`.
후보는 resourceId/revisionId/contentHash/storageStatus를 반환하며 아직 활성 원본 선택이 아니다.
`decideSource({revisionId,expectedSelectionRevision,action})`는 실제 선택 결정과 input refs를 source-selection marker로 결속한다.
`readSourceSelection(resourceId)`는 그 marker의 선택 판본을 읽는다. 결과 채택과 원본 선택은 별도 결정이다.
`appendStateMarker(root,{kind,payload,expectedCheckpoint}) -> {seq,hash}`는 source-selection과 이후 결과/위임 marker의 공통 순서다.
`readWorkspaceState(root,{checkpoint})`는 검증한 prefix를 fold한다. 출처별 검증은 caller Module이 담당한다.

- [x] tempDir()과 store로 동일 bytes의 두 ID·한 ID의 새 부모 판본·외부 URI를 red 테스트한다.
```javascript
assert.notEqual(a.resourceId, b.resourceId);
assert.equal(a.contentHash, b.contentHash);
assert.deepEqual(await store.readContent(a.revisionId), Buffer.from('합성 자료 A'));
assert.equal(external.storageStatus, 'external_unobserved');
```
- [x] revisionId는 버전이 명시된 canonical envelope hash, contentHash는 실제 bytes hash로 분리한다. path traversal·symlink·size·reserved key를 검증한다.
- [x] text/plain과 application/json의 owned 보관부터 구현한다. 분야 필드는 content payload에 두며 Fact/Event schema를 강제하지 않는다.
- [x] 원본 선택은 후보 bytes 검증→decision→source-selection marker 순서다. 실제 선택 없이는 현재 핵심 원본 Query에 후보를 노출하지 않는다.
- [x] 손상·동일 ID 교체·잘못된 부모·snapshot 누락을 검사하고 resources 회귀 후 리뷰·커밋한다. 일반 이미지의 decoding은 아직 지원하지 않는다.

### Task 8 고정 입력과 정책

Files: 신규 `core/resources/input-snapshots.js`, `core/policy/validate.js`, `core/policy/grants.js`;
Test: 신규 `test/resources/input-snapshots.test.js`, `test/policy/grants.test.js`.
Interface: `prepareInput(root,{revisionIds,profileRevisionId,pipelineRevisionId,policyRevisionId}) -> {inputSnapshotId,manifest}`;
`verifyInput(root,inputSnapshotId)`; `authorize(policy,{actor,action,resourceIds,now,grantState})`.
`issueGrant(root,{grantId,policyRevisionId,actor,actions,resourceIds,expiresAt,expectedCheckpoint})`,
`revokeGrant(root,{grantId,expectedCheckpoint})`, `resolveGrant(root,grantId)`는 공통 state marker에서 현재 위임을 읽는다.
profile/pipeline/policy는 T7의 독립 JSON 자원 판본이며 필수 정의와 hash를 검증한다. 입력은 사용자 선택 marker가 가리키는 판본을 사용한다.

- [x] 원본 A를 묶고 B 후보를 만든 뒤 아래 조건을 red 테스트한다.
```javascript
assert.equal((await verifyInput(root,snapshot.inputSnapshotId)).manifest.revisionIds[0], a.revisionId);
assert.throws(()=>authorize(revokedPolicy,{actor:'host',action:'publish',resourceIds:['a'],now:1,grantState:{revoked:true}}), {code:'POLICY_DENIED'});
```
- [x] 필수 입력 bytes·정의·scope·선택 marker·workspaceCheckpoint를 봉인한다. external_unobserved는 strict 생성 입력에서 차단하거나 reference-only를 명시적으로 요구한다.
- [x] scope/expiry/revocation·미지원 capability·길이 예산을 검증한다. 문서 명령문으로 grant를 만들지 않는다.
- [x] Balanced 기본의 제한된 일반 후보 작성과 중요 결정 지점을 검증한다. fixed/hard 해제 옵션 없음. 회귀 후 리뷰·커밋한다.

### Task 9 단일 호스트 작업과 발행

Files: 신규 `core/operations/requests.js`, `core/operations/trace.js`, `core/operations/publications.js`;
Test: 신규 `test/operations/publication.test.js`.
Interface: `startOperation(root,{inputSnapshotId,idempotencyKey,actor,grantId}) -> {operationId,requestId}`;
`submitResult(root,{operationId,requestId,inputSnapshotId,resultRevisionIds,reportedTrace})`;
`recordReview(root,{operationId,outputHashes,findings,reviewer}) -> receiptId`;
`decidePublication(root,{operationId,receiptId,expectedCheckpoint,action,actor,grantId}) -> publication`.
후보 resultRevisionIds는 T7, 입력은 T8의 계약을 사용한다. trace는 관측 수준과 unavailable fields를 durable 기록으로 남긴다.

- [x] 한 원본에서 글·JSON 결과를 반환하고 잘못된 requestId·hard·옛 출력의 채택 거부가 현재 red인지 확인한다.
```javascript
await assert.rejects(submitResult(root,{...submission,requestId:'wrong'}), {code:'REQUEST_MISMATCH'});
await assert.rejects(decidePublication(root,hardDecision), {code:'APPROVE_BLOCKED_BY_HARD'});
```
- [x] 승인/검토를 입력·결과 hash에 결속하고 same host는 반드시 self-review로 표기한다. 호스트가 미보고한 cost는 unknown이다.
- [x] candidate objects→intent→decision/receipt→공통 state의 result-publication marker로 공개한다. 중복 키·late reply·marker 전후 kill·경쟁 HEAD를 검증한다.
- [x] marker 직전 같은 work lock에서 resolveGrant→authorize를 호출한다. 준비 후 철회→옛 policy로 지연 응답/복구→신규 발행 거부를 검사한다.
- [x] 이미 발행한 상태의 복구는 새 채택이 아니다. 철회는 이력을 지우지 않고 marker 전 신규 발행을 막는다. 회귀 후 리뷰·커밋한다.

### Task 10 판본을 명시한 메타데이터 조회와 MCP E2E

Files: 신규 `core/projections/manifest.js`, `core/projections/metadata.js`, `core/query/resources.js`,
`server/tools/resources.js`, `server/tools/inputs.js`, `server/tools/policy.js`, `server/tools/operations.js`, `server/tools/resource-query.js`;
수정 `server/tools/definitions.js`, `server/tools/handlers.js`; Test: 신규 `test/server/resources-e2e.test.js`.
Interface: `queryResources(root,{resourceId,selector,freshness}) -> {entries,checkpoint,freshness,coverage,evidence}`.
신규 MCP: folio_resources(propose/read/decideSource), folio_inputs(prepare/verify),
folio_policy(issue/revoke/status), folio_operations(start/submit/review/decide), folio_resource_query(query).

- [x] stdio로 T7→T8→T9와 metadata Query를 연결한다. 원본 A 선택→B 선택 뒤 A의 metadata 조회를 red 테스트한다.
```javascript
assert.equal(pinned.entries[0].revisionId, a.revisionId);
assert.equal(stale.freshness, 'stale');
assert.equal(strict.code, 'PROJECTION_NOT_CURRENT');
```
- [x] ProjectionManifest/checkpoint를 공개하고 requireCurrent에서 mismatch를 거부한다. allowStale은 판본과 누락을 반환한다.
- [x] 기존 novel/picturebook/source/asset/tools·데이터 포맷을 그대로 열고 회귀한다. CSV/PDF/Vector/Graph/Wiki를 지원했다고 표시하지 않는다.
- [x] 전체 check·examples:verify·assets:verify·package:verify와 독립 리뷰 후 커밋한다. 완료: 한 원본의 복수 결과·과거 입력·후보/채택·변경 영향 조회가 모두 연결됨.

## 사용자 추가 요청: Google 멀티모달 임베딩

### Task 11 EmbeddingGemma 2 어댑터와 판본 결속 벡터 조회

Files: 신규 `adapters/embedding/`의 JS subprocess 어댑터·Python worker·requirements,
`core/projections/vectors.js`, `server/tools/embeddings.js`, `test/embedding/` 및 `docs/embeddings.md`;
수정 package files·MCP definitions/handlers. T10 이후 수행한다.

- [x] 공식 출시·모델 카드·실제 로드 가능성을 확인한다. 기본 모델 `google/embeddinggemma-2`, Apache 2.0, 기본 768차원이다. 모델 revision SHA·processor/라이브러리 버전·dtype·정규화·task prefix를 profile digest에 결속한다.
- [x] `core/`는 네트워크·모델을 호출하지 않는다. 외부 어댑터가 로컬 Python SentenceTransformer를 실행하며 text/image/audio/video capability와 실패를 명시한다. CPU float32 기본, float16 금지, 문서/질의 prefix 구분, 미디어 URI 자동 fetch 금지.
- [x] 실제 합성 텍스트와 합성 이미지의 교차 모달 smoke를 실행한다. 의존성·모델 접근이 막히면 구체적 오류를 기록하고 실제 추론 성공으로 표시하지 않는다. CI는 주입한 합성 벡터와 subprocess 실패 검사로 재현한다.
- [x] immutable revision의 벡터·입력 hash·profile·checkpoint를 보존한다. profile/차원 불일치와 NaN/zero/손상 거부, 선택 판본 변경 시 stale·requireCurrent 차단을 검사한다. 실제 bytes 없이 외부 참조를 임베딩하지 않는다.
- [x] MCP 등록/검색 경로를 연결하고 모델 실행이 승인·원본 선택을 대신하지 않도록 E2E 검사한다. 설치/오프라인 사용·자원 한계·관측 범위를 문서화한다.
- [x] focused red/green·전체 check·패키지 검사·독립 리뷰 후 완료한다. Vector 추가가 Graph/Wiki/DAG 구현 완료를 뜻하지 않는다.

Sources (2026-10-08 확인): [Google releases](https://ai.google.dev/gemma/docs/releases),
[model card](https://huggingface.co/google/embeddinggemma-2),
[multimodal guide](https://ai.google.dev/gemma/docs/embeddinggemma/multimodal-embeddinggemma-with-sentence-transformers).

## 후속 단계와 실험

| 단계 | 선행 | 완료 조건 |
|---|---|---|
| 정적 DAG | P1 발행·정책 | cycle/unsupported 거부, 의존성·취소·부분 실패·멱등 checkpoint; 처음에는 단일 writer 순차 스케줄 |
| Parsing·검색 | Resource+Query | 원본 hash/변환 버전·위치 정밀도; 한국어 full-text; Vector profile·Graph provenance; 계층 mismatch 명시 |
| Wiki·Context | Query+추출 | 생성/사람 자원 분리, stale·관점·시점·길이 예산·근거; on-demand/background/hybrid 비용 비교 |
| Agentic 재계획 | DAG 복구+권한 | 새 plan revision·부모 trace·회수/비용 상한·위임 철회·late response; 모델 자체 판단을 승인처럼 쓰지 않음 |
| Studio·Export | 같은 Query·결정 | 관리/독자 View 구분, 클릭 근거 위치/판본, 기존 편집 보존, 지원 포맷별 실제 출력 검증 |
| 원격·다중 사용자 | 명시적 수요 | 인증/ACL·삭제/보존·백업·비용 상한·실측 성능·정전 내구성·지원 환경 수용 |

## 마이그레이션과 롤백

기존 작품·영수증은 변환 없이 읽는다. 신규 기록은 버전 명시된 별도 저장 계약으로 추가한다.
기존 source/asset/node의 반입은 ID 매핑·옛 hash·현재 bytes·보관 한계·실제 결정의 manifest를 남긴다.
과거 bytes가 없는 원고를 복구 가능한 과거 Resource라고 표시하지 않는다.
Projection은 정본이 아니므로 기존 DB schema 변경은 재구성으로 이행한다.
T6는 옛 집필의 legacy seed 읽기를 유지한다. 범용 모드 반입은 manifest dry run·사용자 선택 후 활성화한다.

코드 롤백은 사용자 이력을 reset/삭제하지 않는다. 신규 writes를 멈추고 기존 경로를 유지한다.
이전 버전이 새 기록을 못 읽으면 unknown version을 알리고 파괴적 재구성을 하지 않는다.
발행 복구는 pending intent와 실제 bytes를 비교하며 미승인 후보를 자동 활성화하지 않는다.
불변 객체 정리는 참조·백업·보존 정책 수용 후 별도 작업으로 시행한다.

## 최종 수용 표

| 인계서 E2E | 첫 슬라이스 또는 후속 |
|---|---|
| owned/external 원본 | T7/T8. PDF·이미지 bytes 반입은 현재 기능 재검증, 전문 parsing은 후속 |
| Pack/Custom/Dynamic 데이터화 | T9의 한 단계 호스트 계약부터. 정적 DAG 후 동적 재계획 |
| 모든 검색 출처/최신성 | T10 metadata, T11 선택 owned text/image Vector. Full-text/Graph 및 승인 결과 Vector는 후속 |
| 실행→context→결과→검토/선택 | T8/T9/T10. 실제 provider trace는 관측 범위 안에서 별도 검증 |
| 변경→stale→재색인 | T10과 T4. 다른 계층은 같은 manifest 계약 수용 |
| Wiki 갱신·human 보호 | Wiki 단계. Hybrid 정책은 미확정 상태 유지 |
| Watch/충돌·영향 | 기존 추적 회귀+P1 의존성, 분야별 semantic Watch 후속 |
| 이미지 전체 승인/교체/재검사 | 기존 합성 full chain+추가 stdio full chain. 실제 작품 승인 시험은 별도 사용자 결정 필요 |
| 장애/권한/예산/마스킹 | P0/P1 해당 계약, 직접 실행·원격 trace/마스킹은 후속 출시 gate |
| 기존 MCP/포맷 | 모든 변경의 회귀 조건. 새 기능이 옛 데이터 승인을 소급 생성하지 않음 |

성능·비용·보존·물리 DB 선택은 후속 실험에서 결정한다. 이 계획의 넓은 목표를 한 번에 구현하지 않는다.
