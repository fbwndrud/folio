# Task 3 구현 보고서

상태: DONE. Commit: b1ae840 feat: show verified resources and all revision evidence in viewer.
대상: /path/to/folio, codex/production-ready.
Task3 brief를 먼저 읽고 AGENTS.md, docs/user-language.md, 계획의 Global Constraints만 적용했다. Task2 보고서의 후속 UI 소비 계약을 사용했다. 구현자 template과 TDD skill을 적용했고 subagent/reviewer는 생성하지 않았다. 독립 리뷰와 실제 built 브라우저 QA는 controller 담당이다.

## 구현 계약

- Library에 Resources 목록, `#/resource/:revisionId`에 상세 화면을 연결했다. 기존 Read/Review/Library/Settings 집필 탐색, Reader, ReadingSettings는 유지한다.
- 같은 revision의 모든 검증 entry를 목록에서 한 카드로 묶는다. 각 entry의 확정 역할, 상태, 자기검토, finding, 상세 근거가 모두 남는다. 원본 선택 + 복수 승인 근거를 하나로 덮어쓰거나 마지막 entry만 채택하지 않는다.
- 기본 화면은 사람이 읽는 자원 이름/종류, Selected source / Previously selected source / Approved result 역할과 Current selection / Historical selection / Reviewed and approved / Review needed / External content not observed 상태를 표시한다. exact revision/resource/operation/receipt/input IDs, content fingerprint, checkpoint는 접힌 Evidence details와 List details에 둔다.
- output.selfReview는 항상 Self-review · Reported by the host로 표시한다. soft finding은 Suggestion으로 읽히며 자동 수정이나 후보 승인·모델 실행·외부 링크 버튼을 만들지 않았다.
- source.selectionCurrent=false를 Previously selected source로 표시한다. API freshness가 current이어도 entry.reviewRequired를 숨기지 않는다. source-selection-changed의 쉬운 설명과 원래 reviewReasons를 상세에 유지한다.
- 목록 상태는 Complete list / Not indexed / Older list / Partial list / Some content is unknown으로 구분한다. 낡음·부분·unknown 설명은 각각 보존하며 Complete list는 검증 metadata 목록의 완전함만 뜻한다.
- 상세 direct URL은 verified list + singular preview + 최신 verified list를 읽는다. 두 목록 전체와 singular entry의 첫 일치 여부를 검증하고 불일치 시 RESOURCE_VIEW_CHANGED로 재시도를 요구한다. 첫 entry가 같더라도 중간에 다른 승인 근거가 추가되면 재시도한다. 이 과정은 indexing/selection/approval를 호출하지 않는다.
- static API는 resources/resourceDetails를 소비하고 direct URL에서도 목록의 모든 근거를 유지한다. 예전 export에 Resource 데이터가 없으면 STATIC_UNAVAILABLE 안내를 보이며 live API로 바꾸지 않는다. 없는 상세는 RESOURCE_NOT_VISIBLE이다.
- preview를 React text로 렌더링하여 HTML/script가 실행되지 않으며 bounded preview의 잘림 안내를 표시한다. binary/external null preview에는 No text preview 안내를 보인다. resource external.uri도 접힌 텍스트 JSON이며 자동 열기/링크를 만들지 않았다.
- resource-only의 home은 Resources로 시작한다. 탐색은 Library/Resources만 노출하고 집필 Contents를 숨긴다. direct read/stages 등 집필 route는 Writing pages unavailable와 Resources 안내로 차단한다. work 로딩 중에도 writing nav 링크를 먼저 노출하지 않는다.
- resource-only도 기존 ExportButton을 공유하여 검토 사본을 내보낼 수 있다. static 화면은 export 버튼이 없고 서버의 capability.viewerExport를 따르는 Resources 화면에만 버튼을 표시한다. 기존 Home export 동작은 동일하다.
- 기존 skip link, route 변경 시 main focus, refresh, close viewer를 유지한다. Resources는 좁은 화면에서 한 열로 줄고 긴 exact ID/preview를 줄바꿈한다. errors에는 role=alert, 접힌 정확한 진단, live explicit Retry view를 사용한다. 키보드 동작은 native link/button/details를 사용한다.

## TDD 증거

모든 실행은 해당 worktree에서 Node PATH `/path/to/node/bin`으로 수행했다. Node v24.19.0. 합성 fixture만 사용했다.

시험 seam은 Task3 brief가 명시한 ResourcesContent/ResourceContent SSR, 기존 hash/static API, 실제 backend list/detail/export로 사전 지정되어 있었다.

RED1: `node --test viewer/test/resources.test.js`
SSR harness에서 React 자체를 ssrLoadModule로 잘못 import하여 처음 module is not defined를 확인했다. React/ReactDOM-server는 정상 Node import로 바로 수정하고 요구사항 실패를 다시 확인했다.
실제 요구사항 RED: `Failed to load url /src/screens/Resources.jsx ... Does the file exist?`, tests1/pass0/fail1.
이유: 미색인·낡음·부분·완전함·external unknown·빈 목록 시험을 먼저 쓰고 화면이 아직 없었다.
GREEN1: 동일 명령 tests1/pass1/fail0, duration_ms1206.168333.

RED2: 동일 명령, `Element type is invalid ... got: undefined`, tests2/pass1/fail1.
이유: all-evidence 상세·preview escaping·잘림/null preview를 검사하는 ResourceContent가 아직 없었다.
GREEN2: 동일 명령 tests2/pass2/fail0, duration_ms869.816792.

RED3: 동일 명령, direct static detail `ROUTE_UNKNOWN`, tests3/pass2/fail1.
이유: createStaticApi에 /api/resources 경로가 없었다.
GREEN3: 동일 명령 tests3/pass3/fail0, duration_ms860.1335.

RED4: 동일 명령, resources route가 실제 home으로 파싱됨, tests4/pass3/fail1.
이유: resources/resource route와 resource-only nav 소비가 아직 없었다.
GREEN4: 동일 명령 tests4/pass4/fail0, duration_ms816.597542.

실제 backend 회귀: 합성 source·profile·pipeline·policy·output을 등록하고 승인된 동일 output 판본에 두 번째 operation/review/approval와 source 선택을 기록했다. 원래 source를 deselect하고 metadata generation을 새로 만든 뒤 실제 authenticated HTTP API를 호출했다. current generation에 같은 revision의 3개 근거(source+2output)가 보존되고 두 output의 Review needed가 유지되는지 SSR로 확인했다. POST export로 만든 실제 inert snapshot을 static API에서 다시 읽어 direct-detail SSR 전체가 live와 동일한지 확인했다. 테스트 승인 행위는 합성 임시 작업 공간에서만 발생한다.

RED5: 동일 명령, RESOURCE_INTEGRITY_FAILURE가 일반 오류 안내로만 표시되어 `/could not be verified/` assertion 실패, tests6/pass5/fail1.
GREEN5: Resource damage/review damage/retry/static unavailable 쉬운 오류 안내 추가 후 tests6/pass6/fail0, duration_ms1177.813875.

RED6: 동일 명령, `Missing expected rejection`, tests7/pass6/fail1.
이유: list→detail 사이 다른 승인 근거가 추가되어도 first entry만 비교하면 검출하지 못했다.
GREEN6: list→detail→list 전체 비교 추가 후 tests7/pass7/fail0, duration_ms1224.027292.

## 최종 검증

- `npm --prefix viewer test`: tests37/pass37/fail0/cancelled0/skipped0/todo0, duration_ms1374.609458. 출력 깨끗함.
- `npm --prefix viewer run build`: exit0, 212 modules transformed, built in499ms. 최신 main chunk index-BphWup0z.js. 기존 lazy Graph chunk(1,613.44kB)의 500kB 크기 경고는 남으며 build 실패는 아니다.
- `node --test --test-concurrency=2 test/view/*.test.js test/server/view-*.test.js`: tests90/pass90/fail0/cancelled0/skipped0/todo0, duration_ms8525.903834. core/view, resource APIs, token/Host/Origin, export escaping, lifecycle, existing writing screens backend, server import guard 회귀를 확인했다.
- `npm run lint`: exit0, diagnostics 없음.
- `npm run typecheck`: exit0, diagnostics 없음.
- `git diff --check`: exit0.
- 전체 root suite는 지시에 따라 다시 실행하지 않았다. 원격 CI 통과를 주장하지 않는다.
- controller가 준비한 실제 built Chrome320/390/736 QA는 최신 build 준비 완료를 전달했다. 이 구현자는 SSR만으로 모바일·키보드 UI 전체 검증을 완료했다고 주장하지 않는다. 독립 리뷰 역시 controller 후속 단계다.

## 파일

Create:
- viewer/src/screens/Resources.jsx
- viewer/src/lib/resource-labels.js
- viewer/src/lib/resource-detail.js
- viewer/src/components/ResourceEvidence.jsx
- viewer/src/components/ExportButton.jsx (Home의 기존 exporter를 동작 변경 없이 공유)
- viewer/src/resources.css
- viewer/test/resources.test.js

Modify:
- viewer/src/App.jsx
- viewer/src/lib/route.js
- viewer/src/lib/workspace.js
- viewer/src/lib/static-api.js
- viewer/src/lib/labels.js
- viewer/src/main.jsx
- viewer/src/screens/Home.jsx

모든 생성/수정 파일이 300줄 이하이다. Task3 brief의 lib 경로는 실제 viewer/src/lib를 사용했다. snapshot/core/server 변경은 필요 없었다. report와 빌드 산출물은 force-add하거나 커밋하지 않았다.

## Self-review / concerns

- staged diff와 모든 새 모듈을 읽어 entry 누락, direct-detail/static 소비, role/source history, reviewRequired 우선 노출, escaping, immutable read 경계, resource-only route 차단과 기존 reader/settings 보존을 점검했다.
- Self-review로 초기 work loading 중 집필 nav 링크 노출을 제거하고, first entry가 바뀌지 않는 동시 승인 추가도 검출하도록 세 번째 verified list read와 RED/GREEN 회귀를 추가했다.
- 목록과 detail은 동일 evidence component로 모든 receipt/operation/input context를 보존한다. exact ID/diagnostic은 접힌 상세에서 읽을 수 있다.
- core에 모델/네트워크/잠금 설정 우회, 자동 승인/선택/index 실행을 추가하지 않았다. 실제 작품·생성 결과물을 커밋하지 않았고 원래 Folio/Vibelore checkout을 수정하지 않았다. cache/user data cleanup도 수행하지 않았다.
- 알려진 미해결 correctness concern은 없다. live direct detail의 안전한 경계 확인에 두 번의 목록 검증 읽기 비용이 든다. 이를 숨기거나 생략하지 않았다.
- 실제 브라우저 QA와 독립 리뷰가 아직 controller 단계로 남아 있다. 기존 Graph chunk 크기 경고는 범위 밖이며 구조 변경을 하지 않았다.

## Controller가 전달한 실제 built UI QA (구현자 직접 실행 아님)

보고 직전 controller 메시지에서 Chrome320/390/736 목록·상세·XSS preview·3근거·stale Review needed·static noAPI와 writing320 overflow/pageerror0의 첫 full pass 및 screenshot 직접 확인 완료를 전달받았다. unsupported stages는 정상 Writing pages unavailable+Open resources 동작으로 확인했고 harness의 redirect 가정을 수정했다. 예전 static fallback 시험은 hash-only 변경으로 문서가 유지되던 harness를 명시 reload로 고쳐 controller가 재실행 중이다. 최종 controller QA 결과는 후속 보고에서 확정한다.
