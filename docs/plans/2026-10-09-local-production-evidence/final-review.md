# 최종 독립 whole-branch production 검토

검토일: 2026-10-09. BASE `713b9d85f30316ce04ff8c3f7f922bb165bac4c9` → HEAD `25eb59bddd0c039170818584df4d403e87e86b6f`(64 commits). 승인된 범위는 로컬 단일 사용자 MCP+viewer이다. 판정은 **Ready to merge: With fixes**이다. Critical 0건, Important 2건, 수용 가능한 성능 Minor 2건이다.

## Strengths / 설계 일치

- 후보, 선택된 원본, 승인된 출력의 권한을 구분하고 revision/hash·영수증·checkpoint를 조회 증거까지 연결했다. `core/operations/authority.js`, `core/publications/state.js`, `core/query/resource-read.js`의 재검증은 과거 세대의 존재와 현재 선택 여부를 혼동하지 않는다. imported observation과 tracking 제안 역시 원고를 자동 수정하는 권한으로 승격하지 않는다.
- `core/view/resources.js`, `core/view/checkpoint.js`, `core/diagnostics/work.js`는 viewer/doctor의 순수 읽기를 일반 MCP 쓰기 잠금 경로와 분리한다. 동시 변경은 재시도로 드러내며 숨은 복구나 cache 생성으로 해결하지 않는다. doctor가 값으로 반환된 기록장 오류도 오류로 집계하도록 수정된 점을 확인했다.
- 이미지와 원고 writer의 기존 예약·중단 후 재개 계약을 새 managed asset/tracking 경로와 통합했다. 이미지의 durable receipt 예약, strict run 검증, 원고 commit intent·대상 바이트 검사가 남아 있다. hard/hash/receipt/append-only/self-review/soft 비자동수정을 feature 설정으로 우회하는 새 경로는 검토한 코드에서 발견하지 못했다.
- 정적 Resource 목록/상세는 동일한 검증 세대에 묶이고, UI는 revision 하나에 해당하는 복수의 role/receipt/operation 증거를 보존한다. 정적 이미지 export도 승인 당시 버전과 실제 복사 바이트를 대조한다. 기존 출력 보존용 staging/backup/recovery와 비소유 대상 보호가 구현되어 있다.
- Google adapter는 core 밖에 있고 정확한 profile·모델 revision·입력 정책을 기록한다. pinning과 adapter의 32MiB 합계 제한, 100개 입력/개별 제한, 토큰 초과 거부가 서로 연결되어 있다. core에서 직접 모델 또는 네트워크를 호출하도록 책임을 뒤섞지 않았다.
- 배포 검사는 파일 목록 확인에 그치지 않고 실제 tarball 설치본의 공개 stdio/HTTP/doctor/export 경로를 실행한다. 모델 가중치와 실제 작품을 패키지에 넣지 않으며, 합성 fixture·복원 절차·현지 측정의 한계를 문서화했다. source 모듈 300줄 제약과 작은 책임별 분리도 유지된다.
- 6개 작업의 기능 구성은 binding design/plan과 대체로 일치한다. 다만 아래 I1/I2는 로컬 중단·재시도 신뢰성에 남은 결함이다. 최종 controller의 새 전체 검증/정확한 최종 commit benchmark는 아직 별도 완료 gate이다.

## Issues

### Critical (Must Fix)

없음. 아래 재현에서 승인된 데이터의 손실이나 권한 없는 승격을 확인하지 않았다.

### Important (Should Fix)

#### I1. metadata refresh 중 남은 정상 임시 파일이 이후 조회를 계속 차단한다

- 위치: `core/projections/manifest.js:28–37`, 특히 `:34`; 쓰기 호출 `:13`. 계약: `docs/recovery.md:64–68`.
- 문제: 공유 `writeImmutable`는 같은 디렉터리에 `.immutable-<UUID>.tmp`를 만든다. 게시 전 프로세스가 종료되면 이 일반 파일이 남을 수 있지만, `listGenerations`는 64자리 hash JSON 외 모든 이름을 무결성 오류로 거부한다. 기존 정상 세대까지 사용할 수 없어진다. 문서의 “고아 파일은 세대 목록에 포함하지 않는다”와 다르다.
- 실제 재현: 합성 Resource workspace에 정상 세대를 만든 뒤, 별도 프로세스가 다음 metadata 임시 파일에 10바이트를 쓴 지점에서 실제 SIGKILL했다. 기존 목록은 1개였지만 이후 `viewResources`는 `PROJECTION_INTEGRITY_FAILURE: unsupported generation filename`으로 실패했다. 명시적 refresh 재시도는 성공했으나 조회는 계속 같은 오류였다. doctor도 resources error와 `ok:false`를 반환했다.
- 영향: 흔한 프로세스 중단 뒤 읽기 기능이 수동 내부 파일 정리 없이는 회복되지 않는다. MCP query와 snapshot도 같은 세대 목록 경로를 사용하므로 영향을 받는 것으로 코드상 판단된다. 이 두 공개 경로를 재현 실험에서 별도로 실행했다고 주장하지는 않는다.
- 수정: Resource discovery의 기존 계약처럼 **알려진 이름의 일반 임시 파일만 그대로 보존하며 건너뛰고**, 알 수 없는 파일명·symlink·특수 파일은 계속 거부한다. GET/doctor에서 파일을 삭제하거나 복구하지 않는다. 최종 hash JSON 검증도 유지한다. SIGKILL → 명시적 refresh 재시도 → 조회/doctor 성공 및 읽기 무변경 회귀를 추가한다.
- 직접 실행 증거: `/tmp/folio-final-review-refresh-interruption.log`. 합성 fixture는 finally에서 제거했다. 실제 전원 손실 시험은 아니다.

#### I2. managed asset 사본의 부분 쓰기가 동일한 put 재시도를 막는다

- 위치: `core/assets/files.js:71–80`, 특히 `:76`; 공개 변경 경로 연결: `core/assets/change.js:83–85`.
- 문제: content-addressed 최종 경로에 `writeFile(..., { flag: 'wx' })`로 직접 쓴다. 일부 바이트를 쓴 뒤 ENOSPC/프로세스 중단이 발생하면 최종 이름의 불완전 파일이 남는다. 같은 ID·같은 이미지의 재시도는 EEXIST 후 hash 불일치로 `ASSET_IMMUTABLE`을 반환한다. 아직 ledger에 asset version을 게시하기 전인데도 재시도할 수 없다.
- 실제 재현: 합성 SVG의 저장 경로에만 적용한 filesystem fault로 처음 4바이트를 실제 기록한 뒤 ENOSPC를 던졌다. 첫 호출은 ENOSPC, 최종 경로는 4바이트로 남았다. fault를 제거한 정상 `storeOutput` 재호출은 `ASSET_IMMUTABLE`로 실패했다. 이는 부분 쓰기 경계의 하위 함수 실험이며 실제 디스크를 가득 채우거나 공개 MCP put 전체를 실행한 실험은 아니다. 공개 put이 이 함수를 ledger append보다 먼저 호출하는 연결은 소스로 확인했다.
- 영향: 실패한 등록을 같은 입력으로 재개할 수 없어 내부 파일 수동 정리나 ID 변경을 요구한다. 기존 승인본을 덮어쓰지 않는 fail-closed 동작은 옳지만, 최종 이름에 미완성 바이트를 노출하는 쓰기 방식이 복구 가능성을 깨뜨린다. 기존 `afterSnapshot` 시험은 완전한 사본 이후 중단만 다루므로 이 경계를 포괄하지 않는다.
- 수정: 같은 디렉터리의 고유 staging 파일에 전체 바이트를 쓴 뒤 배타적으로 게시한다. 이미 존재하는 최종 파일이 다르면 계속 거부하고, ledger는 완전한 사본 확인 뒤에만 추가한다. managed asset의 **20MiB 계약을 유지**한다(공유 Resource writer의 8MiB 상한을 그대로 적용하면 안 된다). 부분 쓰기/SIGKILL 뒤 동일 입력 재시도와 미완성 version 미발행 회귀를 추가한다.
- 직접 실행 증거: `/tmp/folio-final-review-asset-partial.log`. fault는 복구했고 합성 fixture는 제거했다.

### Minor (Nice to Have)

#### M1. 100개 규모의 정적 viewer export가 약 44.5초 걸린다 — 수용, 후속 최적화

- 위치: `core/view/snapshot.js:63`, `:66`, `:74`의 노드별 조회 루프; 측정 도구 `scripts/benchmark-local.js`.
- 관찰: Task6 실제 로그의 viewer-export는 44,513.683ms다. fixture는 committed manuscripts/tracking observations/selected Resources 각각 100개, fixed draft 53바이트, Resource 입력 총 7,490바이트다. viewer 산출물은 3,148,564바이트이며 status 291.76ms, Resource 목록 59.787ms, query 60.427ms와 차이가 크다. “100개 Resource-only export” 측정으로 오해하면 안 된다.
- 영향/판정: 명시적 export에서 수십 초 기다리는 로컬 UX 비용이다. 손실·timeout·동일 세대 위반은 이 측정에서 관찰되지 않았다. 합의된 로컬 개인용 범위에서는 문서와 busy 표시를 유지하는 조건으로 Minor로 수용한다. 전체 작업의 쓰기 잠금을 44초 점유한다고 주장하지 않는다.
- 권고: 먼저 profile하고 반복된 work/status 검증을 한 번의 검증 snapshot 문맥에서 재사용할 수 있는지 살핀다. 반복 조회는 코드상 후보 원인일 뿐, CPU/IO profiler로 원인을 확정하지 않았다. 최종 commit의 controller benchmark는 아직 미실행이다.
- 근거: `/tmp/folio-production-task6-benchmark.log`. 로그의 sourceCommit은 `f33381e`이며 Task6 변경이 작업 트리에 있던 실행이라는 보고서 설명을 함께 적용한다. `25eb59b` 정확 commit benchmark로 표현하지 않는다.

#### M2. lazy Graph JS가 1,613,441바이트다 — 기존 경고 수용

- 위치: `viewer/src/App.jsx:26`(lazy import), `viewer/src/screens/Graph.jsx`의 그래프 의존성.
- 관찰: build 1613.44kB/gzip 501.80kB 경고가 남는다. 정확한 비압축 크기는 1,613,441바이트(약 1.61MB, 1.54MiB)다. 별도의 최신 controller Chrome154 합성 13-node 측정에서 첫 진입은 320px 971.54ms, 736px 788.71ms이고 진입 전 Graph JS 요청은 없었다. overflow/errors도 없었다.
- 영향/판정: Graph 최초 진입 비용이며 Resource 기본 화면까지 이 chunk를 즉시 읽지는 않는다. 기존 warning을 숨기지 않고 현 로컬 범위에서 Minor로 수용한다. 100-node·저사양·원격 전송 SLA를 검증한 결과는 아니다.
- 권고: 필요하면 layout 의존성 분리 또는 기능별 lazy load를 profile한 뒤 진행한다. 성능 목표를 정하지 않은 상태에서 이번 릴리스를 큰 그래프 재작성으로 확대할 근거는 부족하다.
- 근거: `controller-evidence.md`의 Graph 실행 결과, `/tmp/folio-production-controller-graph-qa.log`, Task6 build 보고.

## 이전 지적·deferred/parked 항목 판정

| 이전 항목 | 최종 판정과 근거 |
|---|---|
| Task1 Important: 중단된 이미지 commit ID 예약 가로채기 | 해결. `core/assets/write-gate.js`, `core/image/commit.js`와 Task1 rereview/예약 회귀를 대조했다. durable 영수증만 남은 경우와 정상 legacy 재개를 함께 다룬다. |
| Task1 M1 SDK/source-map-js 및 ESLint 의존성 정리 | Task4에서 해결. 해당 lock/toolchain 변경과 task review의 4개 audit 0·실제 설치 검증을 확인했다. 이 리뷰에서 새 audit을 실행한 것은 아니다. |
| Task1 M2 → Task3/Task4 Graph chunk 경고 | 동일한 하나의 M2로 유지·수용. 위 최신 실제 browser 측정과 한계를 적용한다. |
| Task2 Minor: 같은 revision의 복수 증거 회귀 부족 | Task3에서 해결. Resource UI의 list/detail/list 일관성 및 증거 grouping, `viewer/test/resources.test.js`, 최신 controller `multipleEvidence:true`를 확인했다. revision-only detail API를 임의 확장하지 않았다. |
| Task5 Important: doctor가 반환값 ledger 오류를 정상 처리 | 해결. `core/diagnostics/work.js:60–65`, status-ledgers 회귀 및 Task5 rereview에 API 오류·CLI exit1·무변경 검증이 있다. |
| Task6 100개 static export 지연 | 위 M1로 유지·수용. 정확한 fixture와 작업 트리 측정임을 명시한다. |
| Task2/3/6 CannotVerify: 실제 UI/모델 | `25eb59b` controller의 실제 Chrome/Google 로그로 좁은 로컬 실행 공백은 해소. 창작 품질·대규모 성능으로 일반화하지 않는다. |
| 원본 dirty checkout/이전 branch/합병 실행 이력 | controller 보존 증거 및 task 보고로 확인. 이 리뷰가 원래 합병 명령을 재실행하거나 원본 checkout을 수정하지 않았다. |
| remote CI/다른 OS/전원 손실/remoteFS/실제 EPUB reader/장기 품질 | 미검증 상태를 그대로 수용하는 승인 범위 제한. 성공으로 바꾸어 기록하지 않는다. |

progress.md의 deferred/Minor/CannotVerify 및 명시적 Ruling을 모두 분류했다. 별도의 미판정 parked 항목을 발견하지 못했다. 새 I1/I2는 과거 task review의 해결 판정을 뒤집는 것이 아니라 그 검증이 다루지 않은 중단 경계다.

## Controller Ruling 전체 판정

아래 줄 번호는 검토 시점 `progress.md` 기준이다.

| 줄 / 결정 | 판정 |
|---|---|
| 36 로컬 MCP+viewer 승인, cloud 별도 | 적합. 최종 판정도 이 범위로 제한한다. |
| 37 기존 managed worktree의 production branch, main/이전 구현 보존 | 적합. controller가 원본 73 dirty 항목과 main/이전 ref 불변을 기록했다. |
| 38 semantic merge로 기존 main 기능과 새 gate 모두 보존 | 적합. 양쪽 이미지/viewer/export 및 tracking/Resource 연결을 검토했다. merge 재실행 증거를 만들지는 않았다. |
| 39 300줄 규칙 우선, 책임별 helper 허용 | 적합. 분리는 저장/권한/조회/adapter 경계를 따른다. controller 초과 파일 scan은 0개다. |
| 40 doctor에 gate/cache 생성도 금지 | 적합. 순수 읽기 구현이다. I1의 doctor 오류는 쓰기 부작용 문제가 아니다. |
| 66 viewer/doctor 공유 순수 읽기, MCP 잠금 유지 | 적합. checkpoint 전후 검증과 재시도 오류를 유지한다. |
| 67 검증된 Resource-only workspace 허용 | 적합. config 없음과 손상 구분, registry 검증과 별도 navigation을 확인했다. |
| 68 stale 세대의 과거 선택 유지, selectionCurrent 제공 | 적합. deselection을 삭제/개인정보 소거로 주장하지 않는다. 미선택 후보는 숨긴다. |
| 69 export 목록/상세 동일 세대 | 적합. 세대 변경 중 혼합 성공 대신 실패/재시도한다. |
| 70 SSR 회귀+실제 isolated browser QA | 적합. 현재 controller Chrome 로그가 순수 SSR의 상호작용 공백을 보완한다. 모든 browser 자동 회귀 보장은 아니다. |
| 71 pinning/adapter 32MiB 합계 제한 및 profile 반영 | 적합. 누적 보관/worker 이전 제한과 이전 profile 재index 필요성을 유지한다. |
| 72 SDK/source-map-js patch 및 lint 약화 없는 ESLint 조사 | 해결. Task4 dependency 검증 근거를 적용한다. |
| 73 export 이전 결과 보존/복구 | 적합. owned backup/recheck/recovery와 실패 회귀를 확인했다. |
| 74 제품 영어, 대화 한국어 | 적합. Resource UI labels는 plain English이고 검토 보고는 한국어다. |
| 80 revision-only API와 UI 복수 증거 보존 | 해결. Task2 Minor와 동일한 근거를 적용한다. |
| 85 정적 이미지 승인 버전과 복사 바이트 결합 | 적합. pinned catalog/hash 및 same-ID 변경 회귀를 확인했다. |
| 95 cooperative export lock, portable rename 경쟁 한계 명시 | 범위 내 수용. 비협조적 외부 변경/remoteFS/power-loss no-replace까지 보장한 것으로 해석하지 않는다. |
| 96 이미지 버전을 pin하되 모든 버퍼 동시 보관 금지 | 적합. catalog/hash와 순차적 읽기로 N×20MiB 보관을 피한다. |

## 검토 범위와 실행 증거의 한계

- 기준 문서는 `docs/plans/2026-10-09-local-production-design.md`, `docs/plans/2026-10-09-local-production-implementation.md`, `final-review-brief.md`, AGENTS.md이다. 요청된 code-reviewer 템플릿을 적용했고, 하위 에이전트 없이 여러 pass로 검토했다.
- 전체 diff package는 1,746,939바이트/25,415줄/345파일이다. 전체 파일·hunk inventory 후 runtime/config/examples 206파일(12,165 diff 줄), docs/skills/plans 49파일(5,584줄), tests 90파일(7,249줄)을 분류했다. **이 숫자는 패키지 크기이며 모든 줄을 읽었다는 뜻이 아니다.** 대용량 출력에서 잘린 내용을 읽은 것으로 계산하지 않았다.
- 깊게 읽은 구현은 Resource revision/storage/selection, operation/publication/policy/authority, metadata/vector/query/profile, tracking authority/integrity/replay/commit/backfill, 원고 run/intent/lock 및 image/managed asset, index/pack/export, view/doctor/HTTP, adapter 경계, Resource UI/static API, 배포/benchmark 경로다. 여러 파일은 전체 source, 기존 통합 파일은 scoped diff와 필요한 호출부를 대조했다. 핵심 clipping 구간은 직접 source로 다시 읽었다.
- 설계/계획/progress/recovery/production 문서와 Task1/2/3/4/5/6 보고·리뷰 및 필요한 rereview를 대조했다. 선택한 경계·회귀 테스트는 소스로 읽었지만, 90개 테스트 파일 전체와 모든 역사적 문서/lock 파일의 모든 줄을 독립적으로 완독한 리뷰는 아니다. 광범위한 실행 포괄성은 아래 기존 로그에 의존한다.
- Task6 최신 worker `npm run check`: lint/typecheck 및 1707/1707, fail/cancelled/skipped/todo 0 (`/tmp/folio-production-task6-check-final.log`). viewer 37/37와 복원 2/2 로그도 읽었다. package 보고/로그는 tarball 실제 설치, devDependencies 부재, 509 entries, doctor pure read 및 공개 경로 검증을 기록한다. production/examples/asset 검증은 Task6 보고의 실제 명령 결과를 적용한다. 이 리뷰에서 suite를 재실행하지 않았다.
- `25eb59b`의 controller 실제 모델 로그는 cached Google `embeddinggemma-2`, revision `914f7f89142e33e77833254d9c9b90c3cef7303b`, CPU/float32/128차원에서 합성 red/blue 이미지에 대한 text query가 current 증거와 각 해당 색의 최고 점수를 반환하고, 9000-token 입력이 `EMBEDDING_TEXT_TOO_LONG`으로 거부됨을 보인다. 호출 연결/증거/overflow 검증이며 일반 의미 검색 품질이나 창작 품질 인증은 아니다.
- 같은 HEAD의 실제 Chrome154 UI 로그는 320/390/736px 목록/상세/본문, stale/static/old-static/writing 경로에서 overflow/XSS 표식/console error 없음, 복수 증거 보존, static API 0회를 기록한다. controller가 스크린샷을 육안 확인했다. 이 리뷰어가 그 화면을 직접 조작하거나 스크린샷을 다시 육안 검사했다고 주장하지 않는다.
- 직접 새로 실행한 것은 I1/I2라는 이름 있는 미해결 위험에 대한 두 합성 집중 실험뿐이다. 소스·index·HEAD·branch는 변경하지 않았다. 요청된 scratch 보고서만 저장하며 원본 `/path/to/folio`와 `/path/to/vibelore`는 수정하지 않았다.

## Recommendations / Assessment

I1/I2를 한 수정 묶음에서 해결하고 해당 중단 경계 회귀와 scoped rereview를 먼저 완료한다. 그 후 controller의 새 전체 검증, 실제 설치본 검증 및 정확한 최종 commit benchmark를 통과시킨다. M1/M2는 성능 수치와 현재 한계를 문서에 유지하며 별도 최적화 후보로 관리한다.

**Ready to merge? With fixes.** 승인·hash·영수증·읽기/쓰기 경계와 설치본 검증은 설계에 잘 맞지만, 프로세스/부분 쓰기 중단 이후 정상 입력의 재시도가 막히는 Important 2건이 남았다. 이 두 건과 남은 controller gate가 완료되기 전에는 로컬 production 완료로 판정하지 않는다.
