# 次 작업 계약 검토 메모

Task2:
- queryResources는 withWorkspaceStateTransaction→withWorkLock→recoverFileTx를 호출한다. 단순 GET에 직접 쓰면 gate 파일 생성/미완료 rename 복구가 일어나므로 core/view read-only 계약과 충돌한다.
- read-only query helper로 같은 generation/authoritative-prefix/evidence 검증을 사용하되 work lock/recovery/write를 피한다. 읽기 시작/끝 state 체크포인트가 다르면 RESOURCE_VIEW_CHANGED로 실패 또는 명시 retry 상태. 원본 bytes 손상은 항상 오류.
- detail은 generation에 보이더라도 현재 selected/approved 상태에서 unselected candidate로 바뀐 것의 접근 의미를 명확히 하자. 과거 정식 선택 원본은 역사 근거로 조회할 수 있지만 unselected raw candidate는 숨겨야 함.
- buildSnapshot 실제 위치는 core/view/snapshot.js. server/view/export.js는 그 함수 소비자. 새 snapshot keys resources/resourceDetails를 Task2에서 생성하고 Task3 static-api가 소비.
- 일반 Resource 폴더에는 work.yaml이 없을 수 있다. book/novel 임의 초기화를 강제하지 않고 리소스 workspace도 viewerTarget/viewerStillOn/viewOutline에서 읽기 진입 지원. 기존 writing workflow는 unchanged. 이 검증은 Task2 HTTP, Task3 navbar mode, Task4 합성 resource-only smoke에 연결.

Task3:
- viewer는 Node --test의 .test.js를 사용하며 testing-library/jsx test 런타임은 없음. 계획의 예시 render/screen은 runnable이 아님.
- devDependency 추가 없이 Vite ssrLoadModule + ReactDOM/server로 pure ResourcesContent/ResourceDetailContent를 렌더링하여 상태·escaping·링크 계약을 검증. 외곽 컴포넌트는 기존 useLoad 소비.
- controller는 실제 built UI를 bundled Playwright로 736px/모바일320~390px에서 열고 empty/stale/current/error 클릭 및 스크린샷 확인. Node helper tests만으로 전체 UI를 검증했다고 쓰지 않음.

Task4:
- main에 node_modules 없는 설치 CLI 구동은 viewer/dist 포함이 필요. explicit build-package→npm pack --ignore-scripts 흐름. weights/Python 미포함.
- static viewer export의 target 삭제→rename는 실패 중 이전 export를 잃는 창이 있음. production export 복구 계약에 atomic replacement/원본 보존 시험을 포함할지 read/primary consumers 확인.
- 기존 read-only export가 resources 미포함이면 fallback unavailability, 단 현재 snapshot generation bytes 손상은 숨겨 정상 export로 만들면 안됨.

Task6 모델 메모리 경계:
- pinVectorInputs는100*8MiB supported bytes를 Promise.all로 retain하고 adapter가 text payload까지 복사할 수 있다. 개별 상한만으로 batch 메모리를 제한하지 못함.
- 실제 대용량 입력을 만들지 않는 경계 회귀로 합산32MiB cap을 pin의 verified entries.byteLength에서 적용하고 adapter direct input에도 적용하는 최소 보완을 검토. maxBatchBytes도 profile input policy에 기록해 이전 generation은 명시 reindex 필요. 이 cap은 synthetic benchmark/SLA와 구분.

Task4 SDK dependency:
- root runtime audit high GHSA-6qxp-vccf-f47h, installed SDK1.30.x; affected >=1.12.0<1.31.0. Official advisory excludes MCP servers and stdio clients, so current Folio exposure is not claimed.
- registry2026-10-09 latestSDK1.32.1 engines>=18. Update minimum to patched1.x, lock validated1.32.1 in release task; full stdio input/output regressions afterward. Source https://github.com/advisories/GHSA-6qxp-vccf-f47h (maintainer advisory also linked there).
- viewer full audit에서 source-map-js<1.2.2 dev dependency high1(GHSA-68fv-2mgg-jv7q). --omit=dev는0건. 실제 registry latest1.2.2와 maintainer release https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2 를 확인. Task4 lock 갱신+full/dev와runtime audit 구분.
- main 합류 후 AGENTS.md는 제품 labels에 docs/user-language.md의 쉬운 영어를 지시함. Task3 계획의 /재검토/ assertion은 /Review needed/로 수정하여 제품 언어 계약을 유지. 대화·보고서는 한국어.
- ESLint9.39.5 npm deprecation 실제경고. Registry ESLint10.12.0/@eslint/js10.0.1, engines ^20.19.0||^22.13.0||>=24 로 Folio지원Node와 양립. Official https://eslint.org/docs/latest/use/migrate-to-10.0.0 는 recommended에 새3rules(no-unassigned-vars/no-useless-assignment/preserve-caught-error) 추가를 명시. Task4 최소 dev-tool 업그레이드 검토; 전체 core error/privacy 정책 리팩터링이나 기존 lint 기준 약화로 번지지 않도록 named 판정/실측.

Task4 추가 named risk (아직 실험 전): static viewer export는 buildSnapshot 뒤 readAssetFile(root,id)를 새 current catalog로 읽는다. snapshot asset summary에 pinned contentHash/revision이 없고 managed assets의 별도 변경은 workspace-state checkpoint에 잡히지 않을 수 있다. 그 사이 같은 id 교체 시 이전 approved 상태와 새 bytes가 섞이는지 합성 boundary 재현을 요청한다. readAssetFile은 {assets: catalog}를 지원하며 core/export/assets.js는 pinned source.work.assets를 사용한다. 임시 체크포인트를 더 만들어 원본을 쓰거나 손상을 FolioError null로 삼키지 않는다. 실제로 검증하기 전 결함이라고 선언하지 않는다.

Controller Task4 export race 실제 재현: /tmp/folio-controller-export-race.mjs (합성 setupAssets, built fixture app.js copy 후 같은 ID를 red로 put). 첫 harness get의 .asset wrapper 실수 수정 후 /tmp/folio-controller-export-race.log exit0. 결과 snapshotSummary.approved:true/status:approved지만 copiedRed:true, actualApproval:false, priorHash01dc... != currentHashf69f... . 이전 승인된 snapshot과 새 미승인 bytes가 실제 섞였다. Task4는 snapshot의 image byte/version을 pin하여 변경 시 export 실패 또는 이전 exact image를 복사해야 한다. 이 boundary 회귀 필요. 생성 root는 helper exit정리; 사용자 데이터나 source 수정 없음.

Task5 named risk: workStatus는 core/status.js이며 openWorkspace+ledger.verify+pendingFileTxStatus를 소비한다. normal toolbox status wrapper/gate와 구별하여 pure core만 검토. 원고 runStore.list는 corrupt sentinel을 반환하지만 unknownstate/filename mismatch를 완전검증하지 않는다; imageRunStore.list({strict:true})는 unknown/mismatch/corrupt예약을 거부하며 기본list는 malformed를 silentlyskip할 수 있다. Doctor의 false-normal 방지 요구에 맞춰 strict읽기/진단 경계를 검증하되 실행기 무관 대규모리팩터링은 피한다. Viewer/resource-only판별은 work.yaml absence만fallback하며 workspaceFolder 검증 도움을 재사용가능.
