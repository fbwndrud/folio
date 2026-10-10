# Task 2 구현 보고서

상태: DONE. Commit: 1e36c58 feat: expose verified resources through read-only viewer APIs. 대상: codex/production-ready, /path/to/folio.
요구사항: task-2-brief.md, AGENTS.md, docs/user-language.md, 계획 Global Constraints만 읽고 적용.
구현자 template에 따라 직접 구현·검증·self-review했으며 subagent/reviewer를 생성하지 않았다. 독립 검토는 controller 담당이다.

## 구현

- 기존 queryResources의 입력 사본/selector 검증과 work-lock/recovery 계약을 보존했다. authoritative prefix, generation manifest/entries, 선택·승인 근거, retained bytes, allowStale/current 판정을 core/query/resource-read.js의 순수 읽기 seam으로 공유한다.
- Resource GET은 queryResources나 withWorkspaceStateTransaction을 호출하지 않는다. 조회 시작/종료의 검증된 workspace-state checkpoint를 비교하고 변경 시 RESOURCE_VIEW_CHANGED로 재시도를 요구한다. 읽기 중 오류가 있어도 종료 checkpoint를 확인한다.
- generation 부재만 not-indexed로 표시하며, 이때에도 현재 authoritative 선택/승인 근거와 bytes를 검증한다. 손상된 generation·원본 내용·검토 기록·자기 일관성만 맞춘 위조 projection은 오류를 보존한다.
- stale generation은 그 당시 정식 선택 원본/승인 결과를 역사 근거로 읽는다. source.selectionCurrent는 현재 검증된 선택의 revisionId와 일치하는지 표시하며 deselect/교체 뒤 과거본은 false다. output.reviewRequired/reviewReasons는 현재 source 변경을 반영한다.
- 승인 output의 Resource entry에 실제 검증한 revision envelope도 함께 포함해 kind/storageStatus/byteLength/parents를 보존한다. MCP query 응답 계약은 바뀌지 않는다.
- detail은 같은 검증 목록에서 실제 보이는 revision만 허용한다. text/plain/application/json만 최대32768 JS 문자 preview를 보내고 JSON 응답/정적 embed가 escape한다. binary 및 external_unobserved는 contentPreview:null이며 bytes를 전송하지 않는다.
- work.yaml이 없을 때만 Resource-only 모드를 검토한다. 실제 검증되는 canonical revision이 1개 이상 있어야 한다. candidate-only 등록도 진입 가능하지만 정식 선택/승인 근거 없는 후보는 목록과 detail에 나타나지 않는다. 빈 임의 폴더, stage-only 폴더는 WORK_NOT_FOUND다. 잘못된 기존 work.yaml은 resource 모드 fallback으로 숨기지 않는다.
- .immutable-UUID.tmp는 interrupted immutable stage로 구분한다. managed-path로 일반 파일/안전한 경로만 확인하며 내용은 읽거나 삭제하지 않고 정식 등록 수에도 포함하지 않는다. stage symlink는 MANAGED_PATH_UNSAFE를 보존한다. canonical envelope/content와 current marker 근거는 계속 검증한다.
- viewerTarget·/api/work에서 writing/resources 모드와 capability/screen 정보를 반환한다. 기존 writing 기능, viewer 비활성화 후 서버 종료, viewerExport gate 및 export optional fallback을 유지한다.
- buildSnapshot은 전체 읽기를 checkpoint boundary 안에서 수행하고 Resources 목록을 한 번만 검증한 뒤 그 entry 집합의 detail을 모은다. export가 목록/본문을 다시 query해서 다른 세대를 섞지 않는다. 같은 revision에 근거가 여러 개 있으면 detail은 API의 find와 같은 첫 entry를 사용한다.
- server/view/export.js는 기존 buildSnapshot 소비 그대로 새 resources/resourceDetails를 embed하므로 별도 쓰기 구조 변경 없이 Resource-only export도 동작한다. 기존 asset 복사/fallback/opaque SVG/작가 파일 보호/JSON escaping을 그대로 유지한다. 조회/내보내기는 승인 기록을 만들지 않는다.
- server/view는 core/view/index.js와 core/errors.js만 import하는 guard를 보존한다. core에 모델 호출·네트워크 호출·새 feature toggle·잠금 우회는 추가하지 않았다.

## 후속 UI 소비 계약: 정확한 값/키

### GET /api/work (또는 snapshot.work)

- `mode`: `'writing' | 'resources'`.
- `capabilities`: `{resources:boolean, writing:boolean, viewerExport:boolean, viewerToggles:boolean}`.
- resources 모드: `{resources:true, writing:false, viewerExport:true, viewerToggles:false}`.
- writing 모드: resources/writing true, viewerExport/viewerToggles는 기존 config.features의 유효한 값.
- `availableScreens`: resources 모드는 정확히 `['resources']`.
- writing 모드 기본 screen key는 `['reading','entities','receipts','stages','graph','promises','check-sets','resources']`; blocks/bibliography/termIndex 중 하나라도 true면 `'blocks'`, sources true면 `'sources'`를 추가한다.
- screen key는 capability 목록의 의미 값이다. 기존 hash route `#/read/:id`, `#/entity/:id`, `#/checks` 등과 매핑은 후속 UI 담당이다.
- 기존 `title,levels,features,nodes,entities,status` 키 유지. resources 모드 title은 선택한 root의 basename, levels/nodes/entities는 [], features는 `{viewerToggles:false}`, status는 `{ok:true}`.
- `viewerTarget(root,nodeId?)`도 title/mode/capabilities를 돌려준다. resources 모드의 nodeId는 NODE_NOT_FOUND.
- 정적 writing snapshot.work는 capabilities.viewerToggles와 features.viewerToggles를 모두 false로 설정한다.

### GET /api/resources = viewResources(root)

정확한 top-level 키: `{entries,checkpoint,currentCheckpoint,freshness,coverage,unavailableReason}`.

- checkpoint/currentCheckpoint는 검증된 `{seq,hash}`. generation 부재의 checkpoint만 null.
- freshness는 기존 query 의미의 `'current' | 'stale' | 'unknown'`. 현재 세대의 external_unobserved는 unknown, 과거 세대는 stale이며 coverage.unknown은 유지한다.
- unavailableReason은 정상 세대에 null, 세대 부재에 `'not-indexed'`. 세대 부재는 entries:[], freshness:'unknown', checkpoint:null, currentCheckpoint:검증된 현재 상태.
- coverage: `{layers,resourceIds,missing,unknown,returnedRevisionIds}`. missing은 기존 metadata coverage, unknown에는 `{resourceId,revisionId,reason:'external-unobserved'}` 등 기존 근거. generation 부재의 layers는 ['metadata'], 나머지 배열은 [].
- 공통 entry: 검증된 revision envelope의 `version,resourceId,kind,parents,revisionId,storageStatus,contentHash`; owned에는 `mediaType,byteLength`, external에는 `external`과 contentHash:null. 선언된 schemaRef도 보존.
- source entry 추가: `role:'source',sourceCheckpoint,selectionRevision,selectionCurrent:boolean`.
- output entry 추가: `role:'output',operationId,requestId,inputSnapshotId,receiptId,publicationCheckpoint,selfReview:true,findings,inputRefs,inputCheckpoint,reviewRequired:boolean,reviewReasons`.
- selectionCurrent는 현재 선택된 revisionId와 일치 여부다. 과거 marker의 selectionRevision/sourceCheckpoint는 역사 근거 그대로 유지한다.
- 한 판본에 여러 승인 근거가 있을 수 있으므로 entry 집합을 임의로 후보/현재 승인으로 추론하거나 덮어쓰지 않는다.

### GET /api/resources/:revisionId = viewResource(root,revisionId)

정확한 top-level 키: `{entry,contentPreview,previewTruncated}`.

- entry는 같은 검증 목록의 해당 revision 첫 entry.
- contentPreview는 text/plain·application/json의 최대32768 JS 문자 문자열, opaque binary·미관측 외부는 null.
- previewTruncated는 문자 길이가 상한보다 클 때만 true. binary/external은 false.
- binary bytes/base64/download path는 응답에 없다.
- Resource route는 서버에 고정된 root만 사용하며 query/body의 root/path를 사용하지 않는다. 기존 token/Host/Origin/JSON/method 경계를 그대로 거친다.
- invisible valid revision: RESOURCE_NOT_VISIBLE, HTTP404.
- checkpoint 변경: RESOURCE_VIEW_CHANGED, HTTP409; UI는 재시도할 수 있지만 refresh/select/approve를 자동 실행하면 안 된다.
- bad revision hash: RESOURCE_REVISION_INVALID, HTTP400. bad encoding/escaped separator/NUL/200자 초과: ROUTE_INVALID, HTTP400. POST Resource는405.

### 정적 검토 snapshot

- SNAPSHOT_VERSION은 기존1 유지. 기존 key에 `resources`와 `resourceDetails`를 추가했다.
- resources는 위 목록과 같은 모양, resourceDetails는 `{[revisionId]:{entry,contentPreview,previewTruncated}}`.
- 동일한 검증 generation/list에서 detail을 읽고 export 전체 시작/종료 checkpoint를 검사한다. 중간 변경은409로 export가 파일을 만들기 전에 거부된다.
- Resource-only snapshot은 기존 writing collection을 빈 객체로, writing 전용 singular 화면은 null로 둔다. nodes/entities/receiptNodes/sourceDetails/evidence는 {}, receipts/stages/checkSets/graph/promises/blocks/sources는 null.
- exportViewer가 기존 방식으로 `assetFiles`를 추가한다. Resource-only는 {}이며 Resource의 binary는 내보내지 않는다.

## TDD 및 실행 증거

모든 명령은 위 worktree에서 실행했다. Node PATH:
`/path/to/node/bin` (Node v24.19.0).

RED1 명령:
`node --test test/view/resources.test.js`
실제 출력: `ERR_MODULE_NOT_FOUND: Cannot find module .../core/view/resources.js`, `tests 1 / pass 0 / fail 1`.
기대한 이유: 신규 list/detail·mode·snapshot 테스트를 먼저 작성했으며 읽기 API가 아직 없었다.
첫 구현 후 5/6 통과했지만 테스트의 선언 JSON이 유효하지 않아 RESOURCE_CONTENT_INVALID로 실패했다. 합성 JSON fixture를 JSON.stringify로 수정했다.

RED2 명령:
`node --test --test-name-pattern='interrupted immutable stages' test/view/resources.test.js`
실제 출력: `RESOURCE_INTEGRITY_FAILURE: unsupported resource revision filename`, `tests 1 / pass 0 / fail 1`.
기대한 이유: mode 초기 구현이 정식 판본 옆의 interrupted stage를 정본으로 취급하고 거부했다.
GREEN: stage는 안전한 일반 파일인지 확인하되 정식 등록 수에서 제외하도록 수정한 후 해당 회귀가 통과했다.

최종 신규 covering tests:
`node --test test/view/resources.test.js test/server/view-resources.test.js`
실제 출력: `tests 15 / pass 15 / fail 0 / cancelled 0 / skipped 0 / todo 0` (duration_ms953.519708).
Covering: generation 부재, 후보, 선택 원본, 승인/soft/selfReview 근거, stale deselect/교체, JSON 긴 preview, binary/external unknown, damage, 위조 authoritative projection, candidate-only 진입, 잘못된 config, 실제 list/detail/export checkpoint race, GET 파일 snapshot 동일, 안전한 stage 잔여물, token/Host/Origin/root/route 거부, static JSON escape와 승인 기록 불변.

관련 범위 회귀:
`node --test test/view/*.test.js test/server/view-*.test.js test/server/resources-e2e.test.js test/resources/*.test.js test/tracking/query.test.js`
실제 출력: `tests 111 / pass 111 / fail 0 / cancelled 0 / skipped 0 / todo 0 / duration_ms7204.599167`.
기존 core-view, HTTP/export, server import guard, writing viewer lifecycle/launcher, MCP resource/query/input 및 tracking query 계약을 확인했다.

최종 output entry에 실제 envelope의 storageStatus/kind/byteLength를 보존한 이후 필요한 해당 범위만 재검증:
`node --test test/view/resources.test.js test/server/view-resources.test.js test/view/snapshot.test.js test/server/view-export.test.js test/server/resources-e2e.test.js`
실제 출력: `tests 25 / pass 25 / fail 0 / cancelled 0 / skipped 0 / todo 0 / duration_ms3002.784875`.

`npm run lint`: `> eslint .`, exit0, diagnostics 없음.
`npm run typecheck`: `> tsc -p tsconfig.json`, exit0, diagnostics 없음.
`git diff --check`: exit0.
전체 root suite는 controller의 Task1에서 검증했고 지시에 따라 여기서는 관련 범위만 수행했다. 최종 전체 실행은 후속 Task4/6 담당이며 원격 CI 통과로 주장하지 않는다.

## 파일

Create: core/query/resource-read.js, core/view/resource-checkpoint.js, core/view/resources.js, core/view/workspace-mode.js, server/view/resource-routes.js, test/view/resources.test.js, test/server/view-resources.test.js, test/support/view-resources.js.
Modify: core/query/resources.js, core/view/index.js, core/view/outline.js, core/view/snapshot.js, core/view/viewer-target.js, server/view/api.js, server/view/respond.js.
모든 새 파일과 수정된 파일은 300줄 이하. report는 scratch 아티팩트이며 force-add/commit하지 않는다.

## Self-review / 범위 / concerns

- diff와 신규 모듈을 읽어 query wrapper의 work lock/recovery 계약, exact prefix 비교, preview 상한, 검증 근거/bytes, export generation 혼합 방지, feature gates, HTTP mapping 및 import guard를 점검했다.
- Self-review로 generation 부재 시 authoritative byte corruption 검증을 강화했고, Resource detail 중복판본의 첫 entry 선택을 API와 맞췄으며 static capabilities.viewerToggles를 false로 맞췄다.
- Controller 관찰로 interrupted immutable stage의 무변경 처리 회귀를 RED→GREEN으로 보강했다.
- UI(Task3), package(Task4), doctor(Task5), cap(Task6)는 구현하지 않았다. 알려진 미해결 correctness concern 없음.
- 읽기는 기존 query와 같은 강한 증거 검증을 하므로 등록/승인 자원 수에 따라 파일 읽기 비용이 든다. 인덱스/증거 검증을 생략하는 최적화는 넣지 않았다.
- 실제 작품/생성 결과물은 읽거나 커밋하지 않았으며 합성 임시 fixture만 사용했다. original Folio 및 Vibelore checkout은 수정하지 않았다.
