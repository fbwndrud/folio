# Folio 로컬 출시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. 체크박스로 진행한다.

**Goal:** 기존 화면·출력과 새 데이터·검색 기능을 한 로컬 설치로 통합하고 출시 계약을 검증한다.
**Architecture:** 기존 두 이력을 merge한 뒤 additive read-only 화면/진단 경계를 추가한다. 호스트 생성·판단과 core 데이터 무결성 책임은 유지한다.
**Tech Stack:** 기존 Node ESM/SQLite/MCP, React/Vite, 파일/hash-chain, 선택 Python adapter.
**Spec:** [로컬 출시 설계](2026-10-09-local-production-design.md).
**Status:** 사용자가 2026-10-09 앞서 제시한 통합·초보자 흐름 구현을 승인했다. 출시 후보의 실제 증거와 갭을 끝에 기록한다.

## Global Constraints

- 설계 정본: 착수 계획서 아티팩트. 구현 계획: docs/plans/.
- 테스트 데이터는 합성 fixture만. 실제 작품·생성 결과물을 커밋하지 않는다.
- 모듈 하나에 책임 하나. 파일이 300줄을 넘으면 나눈다.
- core/는 모델·네트워크를 부르지 않는다.
- 잠금 규칙(hash 일치, 영수증, hard 차단, 추가만 되는 기록장, 자기검토 표기, soft 비자동수정)은 설정으로 끌 수 없어야 한다.
- 소통은 한국어, 코드 식별자는 영어. 사용자 화면·상태·작업 이름은 docs/user-language.md의 쉬운 영어를 따른다.
- /path/to/vibelore 는 읽기 전용 이식 원본이다.
- 원래 dirty checkout, main@713b9d8, codex/dynamic-tracking@c44b13c를 보존한다. codex/production-ready에서만 구현한다.
- Node 지원 ^22.13.0 || ^24.0.0 || ^26.0.0. 로컬 검증 Node24.19.0이며 원격 CI는 실행 증거 없이 통과로 쓰지 않는다.
- 실제 작가 승인 없이 작품 채택을 기록하지 않는다. 테스트 모의 승인은 합성 임시 작품에만 한다.
- 모델/외부 fetch는 core와 viewer 읽기 경계에 넣지 않는다. 비용·미관측·자기검토를 숨기지 않는다.

## Task 1 두 구현 이력 통합 및 회귀 보존

Files: 충돌하는 core/run/*, core/index/*, core/scope/*, core/store/*, server/tools/*,
package.json, .github/workflows/ci.yml, README.md, skill/folio/*, packs/novel/*와 관련 tests.
Create: test/acceptance/production-integration.test.js.
Interfaces: main의 viewer/image/variants/export + 신규 assets/tracking/resources/inputs/policy/operations/resource_query/embeddings 도구를 함께 등록한다.

- [x] `git merge --no-commit --no-ff main`으로 실제 merge를 시작하고 충돌 목록을 기록한다.
- [x] production-integration 시험에서 두 계열 공개 도구와 gamebook/picturebook 프리셋, tracking 모드·벡터/metadata 경로를 호출한다. 단순 export 이름 존재 시험만으로 완료하지 않는다.
```javascript
const listed = await client.listTools();
for (const name of ['folio_view','folio_export','folio_image','folio_assets','folio_tracking','folio_resources','folio_embeddings']) {
  assert.ok(listed.tools.some(tool => tool.name === name));
}
// 합성 원본 선택/refresh/query와 gamebook 초기화는 같은 stdio 실행 파일로 실행한다.
```
- [x] main의 variant/branching/viewer 동작과 신규 immutable intent/최종 발행/추적 snapshot을 합친다. 한쪽 전체 파일 선택으로 기능을 버리지 않는다.
- [x] 기존 scalar 사건과 variant 사건, 관리 자산 nullable path, writer gate, receipts alias·caller signatures를 소비자까지 대조한다.
- [x] 신규 tool definitions도 main의 annotations/input/output schema와 structuredContent를 준수하게 한다.
- [x] package는 setup/viewer/preview와 check/examples/assets/package scripts를 모두 보존한다. 모델 adapter는 선택 상태다.
- [x] Node24로 npm ci, viewer ci/build/test, root check, examples/assets/package를 실행한다. 실제 실패는 분류·수정하고 검증 삭제로 숨기지 않는다.
- [x] merge 이력 두 부모를 보존한 커밋과 보고서, 변경 파일별 책임·검증 근거를 남긴다.

## Task 2 검증된 자원 목록·근거의 로컬 읽기 API

Create: core/view/resources.js, server/view/resource-routes.js, test/view/resources.test.js, test/server/view-resources.test.js.
Modify: core/view/index.js, core/view/snapshot.js, core/view/viewer-target.js, core/view/outline.js,
core/query/resources.js 및 pure read helper, server/view/api.js, server/view/export.js의 snapshot 소비.
Interfaces: `viewResources(root) -> {entries,checkpoint,currentCheckpoint,freshness,coverage,unavailableReason}`;
`viewResource(root,revisionId) -> {entry,contentPreview,previewTruncated}`.
GET /api/resources, GET /api/resources/:revisionId. 외부 path/root/body 입력 없음.

- [x] generation 없음·선택 원본·승인 결과·후보·낡음·손상·외부 unknown을 합성 fixture로 red 확인한다.
```javascript
assert.equal((await viewResources(root)).unavailableReason,'not-indexed');
await assert.rejects(viewResource(root,unselected.revisionId),{code:'RESOURCE_NOT_VISIBLE'});
```
- [x] pure read seam에서 metadata query의 allowStale와 authoritative prefix/evidence 검증을 공유한다. 일반 queryResources의 work lock/recovery 경로는 GET에서 호출하지 않는다. generation 부재만 안전한 empty 이유로 변환하고 손상/기타 오류를 삼키지 않는다.
- [x] 읽기 전후 workspace checkpoint가 달라지면 RESOURCE_VIEW_CHANGED로 재시도를 요구한다. GET 전후 전체 파일 snapshot이 같아야 한다.
- [x] work.yaml 없이 Resource만 등록한 검증 가능한 Folio workspace도 viewer 진입과 /api/work 요약을 지원한다. 임의 폴더 탐색이나 소설 초기화를 요구하지 않는다. writing/resource 모드와 사용 가능한 화면을 명시한다.
- [x] stale generation의 과거 정식 선택/승인 판본은 역사 근거로 읽되, source entry에 selectionCurrent를 표시한다. 현재 deselect/교체된 원본을 현재 선택된 것으로 표시하지 않는다. 한 번도 정식 선택/승인하지 않은 candidate는 숨긴다.
- [x] detail은 목록에 실제 보이는 판본만 읽는다. text/plain·JSON escaped preview는 최대32768문자, 더 길면 previewTruncated=true; binary bytes는 응답에 넣지 않는다.
- [x] 상태·근거·hash·selfReview·reviewRequired를 유지한다. 조회는 refresh/원본 선택/승인/모델 실행을 하지 않는다.
- [x] 기존 token·Origin·Host·root 고정 경계와 잘못된 revision route의 거부 시험을 통과한다.
- [x] 정적 검토 export의 resources/resourceDetails는 동일한 검증 generation/checkpoint에서 구성한다. 중간 state 변경은 RESOURCE_VIEW_CHANGED로 거부하여 서로 다른 세대의 목록/본문을 섞지 않는다.
- [x] 정적 검토 export는 목록과 허용 detail snapshot을 담고 기존 export의 fallback을 유지한다. export는 새로운 승인 기록을 만들지 않는다.
- [x] 관련 core/view·HTTP·export 회귀와 lint/typecheck 통과 후 커밋·독립 리뷰한다.

## Task 3 화면에서 원본·결과·최신성과 근거 보기

Create: viewer/src/screens/Resources.jsx, viewer/src/lib/resource-labels.js, viewer/test/resources.test.js.
Modify: viewer/src/App.jsx, lib/route.js, lib/workspace.js, lib/static-api.js, 필요한 styles.
Interfaces: Library의 Resources 목록과 resource/:revisionId 상세, Task2 두 API 및 정적 snapshot을 소비한다.

- [x] UI 시험에서 미색인·낡음·external unknown·손상·선택 원본/승인 결과·재검토 필요·정적 export를 red로 확인한다.
```javascript
// 기존 Node test runner에서 Vite ssrLoadModule과 ReactDOM/server를 사용한다.
const html = renderToStaticMarkup(React.createElement(ResourcesContent, { data: fixture }));
assert.match(html, /Review needed/);
// 순수 내용 컴포넌트로 상태·escaping·상세 링크를 검사한다.
```
- [x] 기본 화면에는 사람이 읽는 제목/종류/확정 역할/상태를 표시하고 hash·checkpoint·exact IDs는 펼치는 상세에 둔다.
- [x] 원문 preview는 React text로 렌더링한다. 외부 링크 자동 열기, 모델 실행, 후보 승인 버튼은 만들지 않는다.
- [x] 같은 revision의 source/복수 output entry를 grouping하거나 역할·receipt·operation을 명확히 연결한다. 단수 detail.entry를 그 판본의 유일한 근거로 가정하지 않고, 검증 목록의 모든 관련 근거를 유지한다. direct detail URL와 static export에서도 확인한다. 복수 근거의 API/SSR 합성 회귀를 추가한다.
- [x] selectionCurrent=false인 source는 과거 선택 원본으로 표시한다.
- [x] 전체 목록 상태는 부분/낡음과 완전함을 구분한다. 현재 generation이어도 old result의 reviewRequired를 숨기지 않는다.
- [x] resource-only 모드는 집필 전용 화면을 사용 가능한 것처럼 표시하지 않는다. 기존 writing nav/reader/ReadingSettings를 유지한다.
- [x] 모바일·키보드·빈 화면·HTTP 오류 및 static fallback을 확인한다. controller가 built UI를 실제 브라우저에서 320~390px/736px로 확인한다. 순수 렌더 시험만으로 전체 UI 확인을 주장하지 않는다.
- [x] viewer test/build와 HTTP/export 회귀 후 커밋·독립 리뷰한다.

## Task 4 새 설치·배포 패키지·첫 작품의 전체 경로

Modify: package.json, scripts/check-package.js, .github/workflows/ci.yml, README.md, docs/connect.md, docs/writing-guide.md, docs/testing.md.
Create: examples/production.js, test/server/production-stdio.test.js, scripts/build-package.js(필요 시), docs/production.md.
Interfaces: `npm run production:verify`는 임시 합성 작품의 stdio→HTTP→export 결과를 JSON으로 반환하고 출력은 종료 시 정리한다.

- [x] tarball 새 설치에서 viewer 준비 파일·folio-view 실행이 누락되는 실패를 red로 확인한다.
- [x] 배포 전 viewer build를 명시 실행하고 package에 dist와 필요한 runtime 파일만 넣는다. source setup과 설치된 CLI를 구분한다.
- [x] 합성 그림책을 공개 MCP로 작성·검토·모의 채택하고 합성 그림 등록·연결, selected Resource→metadata 조회→HTTP 목록/상세, 웹/EPUB과 정적 검토 export를 수행한다.
```javascript
assert.equal(summary.synthetic,true);
assert.equal(summary.viewerResourceVisible,true);
assert.equal(summary.epubVerified,true);
assert.equal(summary.outputsRetained,false);
```
- [x] 별도 resource-only workspace를 folio_init 없이 만들어 stdio→HTTP→정적 export를 검증한다.
- [x] 모델 런타임이 없을 때도 기본 흐름이 성공하고, embedding 호출만 명확한 runtime-unavailable가 되는지 검증한다.
- [x] 설치 시 ESLint9 deprecation을 조사하고 지원되는 lint 도구로 갱신 가능한지 확인한다. 기존 lint 기준을 약화하지 않고, 새 recommended 규칙과 민감 정보 마스킹의 충돌은 근거와 판정을 기록한다. 관련 없는 core 리팩터링으로 확대하지 않는다.
- [x] SDK minimum은 patched1.x로 올리고 lock은 검증한1.32.1을 사용한다. viewer source-map-js lock도 patched1.2.2로 갱신한다. installed stdio schema·viewer build 회귀와 root runtime/viewer full audit 결과를 구분해 확인한다.
- [x] 정적 export 교체 중 실패 시 기존 export를 보존하거나 명시 복구 가능하게 한다. target을 먼저 삭제하지 않으며 교체 실패 주입 시험으로 계약을 확인한다. 이전 이미지 손상/누락도 정상 완전 export로 숨기지 않는다.
- [x] snapshot 승인 상태와 실제 복사하는 이미지 bytes를 같은 판본에 결속한다. 합성 same-ID 교체를 snapshot 직후 주입해 이전 approved 표시와 새 미승인 이미지가 섞이는 것을 거부하거나 이전 exact bytes를 복사한다. 경로·hash·managed version과 legacy 파일의 처리 경계를 기록한다.
- [x] docs/스킬의 첫 사용자 안내와 기능/한계를 최신 통합 코드로 맞춘다. PDF는 브라우저 인쇄, 자동 조판·클라우드 게시로 쓰지 않는다.
- [x] CI에 root/viewer checks와 production/package 검증을 연결한다. 설정과 실제 실행 증거를 분리한다.
- [x] fresh npm setup, root/viewer 검사, 전체 합성 example와 installed tarball 검증 후 커밋·독립 리뷰한다.

## Task 5 읽기 전용 진단과 백업 복원 수용

Create: core/diagnostics/work.js, bin/folio-doctor.js, test/diagnostics/work.test.js, docs/operations.md.
Modify: package.json bin/scripts 및 package 검증, docs/recovery.md.
Interfaces: `inspectWork(root,{packs}) -> {ok,checks,actions}`; CLI `folio-doctor <work> --json`.
checks 항목은 name,status:ok|warning|error,message,details?이며 nonzero 종료는 error가 있을 때다.

- [x] 정상·원고 손수정·자산 손실·기록장 변조·stale 자원·열린 run을 합성 사본으로 red 확인한다.
```javascript
const before=await snapshotFiles(root);
await inspectWork(root,{packs});
assert.deepEqual(await snapshotFiles(root),before);
```
- [x] 상태/기록장 검증, 선택 source·승인 output 무결성 및 managed asset file 검증을 재사용한다. index 생성/복구/ledger 수정은 하지 않는다.
- [x] pending은 warning과 안전한 다음 행동으로 표시한다. 경로/권한 오류도 거짓 정상으로 처리하지 않는다.
- [x] 작품 전체 백업을 새 임시 폴더에 복사해 진단·조회·재연결하고 변경/승인 이력 보존을 검사한다. 실제 작품에는 적용하지 않는다.
- [x] 사람이 읽는 출력과 --json, 잘못된 인자/없는 root/종료 코드/installed bin을 검증한다.
- [x] 파일 상한·관련 보안/복구 회귀와 check/package 후 커밋·독립 리뷰한다.

## Task 6 규모·경계 검증과 출시 판정 기록

Create: scripts/benchmark-local.js, test/acceptance/production-boundaries.test.js, docs/plans/2026-10-09-production-readiness.md.
Modify: docs/production.md, docs/testing.md, SECURITY.md의 실제 경계 설명.
Interfaces: `npm run benchmark:local`은 임시 합성 data 규모·환경·작업별 milliseconds/output bytes를 JSON으로 기록한다.

- [x] 합성 원고100개·추적/자원100개 범위에서 상태/metadata refresh/query/view read·export를 실행한다. 생성 답변은 고정 fixture이며 AI 품질 점수를 만들지 않는다.
- [x] 시간값은 실제 측정한다. 내부 timeout/임의 truncation 없는 결과와 버전 근거 보존을 검증하고 출력은 정리한다.
- [x] vector input은 개별8MiB/100개 외에 합산32MiB를 상한으로 적용한다. verified entries.byteLength 합산 후 retained input buffers를 모으고 adapter 직접 호출도 같은 상한을 검사한다. source evidence 검증 중 개별 bytes 읽기가 있음을 숨기지 않는다. maxBatchBytes를 embedding profile input policy에 포함하며 기존 profile에는 명시 재색인이 필요하다. overflow·경계 성공·worker 호출 전 거부를 합성 시험한다.
- [x] 새 HTTP API의 token 없음·잘못된 Host/Origin·path injection·candidate 노출·XSS text와 export read-only를 추가 회귀로 확인한다.
- [x] fresh root check, viewer test/build, examples/assets/production/package, doctor 복원, benchmark 결과와 실제 Google adapter smoke를 controller에게 보고한다.
- [x] 출시 판정은 완료/미검증/차단을 구분한다. 원격 CI/실제 호스트 장기 실사용/정전·remoteFS 미검증을 명시한다.
- [x] 종합 독립 리뷰 후 주요 지적을 보완하고 최종 소스에서 controller가 검증한다. 전체 기록을 커밋하고 이 계획 scratch만 정리한다.

## 이행과 롤백 검증

기존 원고·자료·그림·영수증 형식을 그대로 여는 회귀를 Task1/4/5에 유지한다.
새 표시용 metadata는 명시 refresh 후 생성하며 조회가 새 승인을 만들지 않는다.
롤백은 전체 작품 백업을 별도 폴더에 복원한 뒤 이전 checkout에서 읽는 방식으로 문서화한다.
혼합 구버전 writer를 허용하지 않고 파일 손상 자동 수리 기능은 제공하지 않는다.
