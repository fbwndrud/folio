# Task 6 독립 검토

## 사양 준수 판정

- ✅ **검토 가능한 Task6 구현 범위는 사양을 준수한다.** BASE `f33381e` → HEAD `25eb59b`의 18개 파일 전체 diff를 한 번, 세 구간으로 나누어 읽었다. brief의 신규 3개 파일과 수정 production/testing/SECURITY 문서가 모두 있다. 새 기능의 범위 확대나 요구를 반대로 구현한 사례는 확인하지 못했다.
- `core/projections/vector-input-policy.js:3`의 고정 정책은 개별8MiB·100개·합산32MiB이며 설정으로 끄는 경로가 없다. `core/projections/vectors.js:19`는 verified entry.byteLength를 합산한 뒤 `:21`에서 retained batch를 읽는다. `adapters/embedding/index.js:16`은 실제 Uint8Array.byteLength를 검사하고 임시 payload/worker보다 먼저 거부한다.
- `core/projections/vector-profile.js:12`의 정책 검증은 profile digest 경로에 포함된다. `adapters/embedding/worker.py:30`도 세 제한값을 반환한다. `test/acceptance/production-boundaries.test.js:118`은 기존 maxBatchBytes 없는 profile과 변경된 정책을 거부한다. 기존 index를 그대로 호환한다고 주장하지 않고 명시 재색인을 요구한다.
- `test/acceptance/production-boundaries.test.js:27`은 public HTTP token 없음/오류·잘못된 Host·POST Origin·GET no-CORS·candidate 숨김·path injection·XSS text·export 정본 무변경을 확인한다. `:65`의 실제 owned bytes 시험은 overflow에서 증거 읽기5회 후 추가 retained batch 읽기0, 4×8MiB 성공을 검증한다. `:88`, `:96`은 adapter worker 전 거부와 exact32MiB 합성 worker 성공을 분리한다.
- `scripts/benchmark-local.js:42`는 공개 stdio로 100개 실제 commit과 Resource 선택을 수행한다. `:62`, `:66`, `:73`, `:75`, `:88`, `:96`은 상태·추적·metadata/query·HTTP view·viewer/web export를 측정한다. `:95`는 정적 snapshot의 100개 본문을 실제 segments 계약으로 비교한다. `:104`의 finally는 실패와 성공 모두 자체 MCP와 임시 폴더를 정리한다.
- `docs/plans/2026-10-09-production-readiness.md:3`은 최종 판정을 검증 관문 대기로 두며 실제 Google smoke·종합 리뷰·최종 controller 검증을 완료로 표시하지 않는다. 로컬 Node24/macOS 실측을 원격 CI·다른 OS·모든 reader·실작품 품질·정전/remoteFS 성공으로 확대하지 않았다.

## 잘된 점

- 제한 정책을 작은 core 모듈에 모으고 pin/adapter/profile에서 같은 값을 사용한다(`core/projections/vector-input-policy.js:3`, `:6`, `:12`). 모델/네트워크 호출은 adapter에 남는다. 새 구현 파일은 14/112줄, 새 acceptance 파일은 128줄로 책임과 크기가 적절하다.
- 증거 검증 전 bytes 읽기가 있다는 사실을 숨기지 않고 순서 자체를 회귀로 고정했다(`core/projections/vectors.js:18`, `test/acceptance/production-boundaries.test.js:78`). 압축 bytes 제한을 decoding 또는 모델 전체 메모리 보증으로 설명하지 않는다(`SECURITY.md:36`).
- benchmark가 고정 합성 응답을 사용하되 실제 공개 경로를 통과하며 실행 환경·작업별 wall time·출력 bytes·판본/checkpoint를 남긴다(`scripts/benchmark-local.js:99`). 설치본은 100개 실행을 했다고 과장하지 않고 전체 모듈 의존성 해석까지만 검증한다(`scripts/check-package.js:50`).
- 최초 benchmark 실패의 실제 로그와 성공 재실행을 구분했다. `snapshot.body` 대신 segments를 검증한 수정은 제품 계약에 맞는다(`scripts/benchmark-local.js:95`).

## 지적

### Critical — 반드시 수정

- 없음.

### Important — Task6 승인 전 수정

- 없음. 아래 성능 항목은 새 Task6 correctness 결함이나 사양에 없는 SLA 위반으로 분류하지 않는다. 출시 전체 판정에서는 실제 영향과 수용 여부를 명시해야 한다.

### Minor — 후속 보완 및 출시 성능 triage

1. **100개 viewer export의 실제 대기 비용이 크다.** `scripts/benchmark-local.js:88`, `docs/plans/2026-10-09-production-readiness.md:46`: 고정 원고53bytes·Resource 합계7490bytes의 작은 합성 데이터에서도 viewer export는 **44,513.683ms**, 정적 결과3,148,564bytes다. 사용자가 export 완료를 수십 초 기다리고 그 동안 workspace checkpoint가 바뀌면 재시도가 필요할 수 있다. 코드 확인 결과 기존 `core/view/snapshot.js:63`, `:66`, `:74`가 노드마다 view 함수를 순차 실행하고, `core/view/node-view.js:31`, `core/view/receipt-view.js:78`, `:81` 등이 전체 work/status를 다시 읽는다. 반복 전체 읽기가 비용의 후보라는 추론이며, 이 단일 실측으로 단계별 원인을 확정하지 않는다. `core/view/resource-checkpoint.js:4`처럼 읽기는 작업 잠금을 잡지 않으므로 writer를 44초 잠근다는 판정도 하지 않는다. **재현:** 이미 보존된 benchmark 성공 로그의 동일100개 실행. **권고:** 최종 출시 판정에 이 지연의 수용 여부를 남기고, 후속 성능 작업은 snapshot 한 번의 검증된 읽기 결과를 각 화면에 공유하는 경계와 단계별 비용을 검토한다. 무결성/checkpoint 검증을 생략하거나 timeout/truncation으로 성공시키는 최적화는 피한다.

2. **Graph 빌드 경고는 실제 첫 진입 비용이 있는 후속 항목이다.** `docs/testing.md:81`, `docs/plans/2026-10-09-production-readiness.md:80`: 실제 viewer 및 package build 로그에 Graph1,613.44kB(gzip501.80kB)의 500kB 경고가 남는다. controller QA 로그는 작은 합성 novel13nodes, Chrome154에서 cold 첫 진입320px971.54025ms/736px788.706375ms와 JS1,613,441bytes를 기록한다. errors=[]·fixtureRetained=false지만 100-node graph나 낮은 성능 기기의 근거가 아니다. 약0.79–0.97초의 최초 화면 비용과 추가 JS 파싱/메모리 부담이 있으며 일반 화면의 비차단 여부와 scale 성능은 구분해야 한다. **재현:** 보존된 build 및 controller graph QA 로그. **권고:** 경고 상한을 올려 숨기지 말고, 현재 로컬 범위의 수용 여부를 최종 controller 판정에 적는다. 더 큰 graph/저사양 범위로 출시 주장을 넓힐 때 그 범위를 실측한 뒤 분할 또는 graph 의존성 대안을 판단한다.

## 확인한 근거와 집중 확인

- 요구/보고: scratch `task-6-brief.md`, `task-6-report.md`; template `task-reviewer-prompt.md`. 완료 주장과 pending controller 관문을 별도로 읽었다.
- 전체 변경: `review-f33381e..25eb59b.diff` 851줄을 중복 없이 읽었다. 변경 파일을 내용 확인 목적으로 다시 읽지 않았고 git 명령·index/branch 변경·suite 재실행·추가 agent 호출은 하지 않았다. 아래는 이름 붙인 미확인 위험만 unchanged 코드로 확인한 것이다.
- **verified byteLength를 믿을 수 있는가:** `core/projections/metadata.js:8`, `core/projections/evidence.js:31`, `core/resources/revisions.js:9`, `core/resources/files.js:45`를 확인했다. 순차 source evidence 검증이 revision hash 및 owned content hash/actual length 검증을 거치며 entries에는 bytes를 retained batch로 남기지 않는다.
- **profile 정책 변경이 명시 재색인을 허용하는가:** `server/tools/embeddings.js:15`의 index는 새 pin→adapter→save 경로이며 과거 index를 먼저 읽지 않는다. search `:23`은 저장된 profile 검증을 거치므로 기존 정책 없는 profile을 자동 호환시키지 않는다. profileDigest call site 검색은 이 API 계약 위험 확인에 한정했다.
- **HTTP 문서의 실제 Host/token/Origin 구분이 정확한가:** `server/view/http-server.js:86`, `:90`, `:92`를 확인했다. Origin은 POST에만 적용되며 GET의 외부 Origin 문자열 자체를 거부한다고 문서화하지 않는다.
- **44초 export가 writer 잠금/중복 작업 위험인가:** `server/view/api.js` export 연결, `core/view/snapshot.js`, `core/view/node-view.js`, `core/view/receipt-view.js`, `core/view/evidence-view.js`, `core/view/resource-checkpoint.js`를 하나의 export 경로 확인으로 읽었다. 반복 전체 읽기 후보와 무잠금/checkpoint 재검증을 확인했다. profiler나 반복 benchmark는 실행하지 않았다.
- 실행 근거 원문: `/tmp/folio-production-task6-focused-final.log` 14/14·fail/cancelled/skipped/todo0·2002.169291ms, `/tmp/folio-production-task6-check-final.log` 1707/1707·fail/cancelled/skipped/todo0·118421.055709ms, viewer-test37/37·1358.692458ms, doctor-restore2/2·4356.021375ms의 마지막 요약을 읽었다. lint 로그는 진단 없이 종료 출력이며 viewer-build/package 로그의 Graph 경고는 위 지적으로 보존했다.
- examples/assets/production/package의 실제 출력에서 verified·synthetic·outputsRetained 및 benchmarkModuleVerified를 확인했다. package는 개발 의존성 없음과 entryCount509를 보고하며 benchmark 실제 실행을 주장하지 않는다. 역사적 process exit0 값은 실행 보고서가 제공한 값이고 리뷰에서 명령을 재실행해 재측정하지 않았다.
- `/tmp/folio-production-task6-benchmark-first.log`의 실제 AssertionError와 `/tmp/folio-production-task6-benchmark.log` 성공 JSON을 읽었다. 성공 JSON의 scale100/100/100·checkpoint seq100·hash·generation·tracking revision·작업별 값·출력 bytes는 보고서/readiness와 일치한다. `/tmp/folio-production-task6-benchmark-*` 확인에서 데이터 디렉터리는 남지 않고 실패 로그만 해당 이름 패턴에 남았다. 성공 로그는 benchmark 데이터 폴더와 다른 이름이다.
- `/tmp/folio-production-controller-graph-qa.log` 원문에서 Chrome154·13nodes·두 viewport·실제 resource bytes·errors=[]·fixtureRetained=false를 확인했다. 별도 screenshot 시각 검사는 하지 않았다.
- 수정 코드/시험 파일의 줄 수만 읽어 확인했다: adapter/index30, worker76, policy14, profile19, vectors80, benchmark112, package checker68, boundaries128, integration134, embedding tools59, vectors41. 모두300줄 이하이며 실제 작품/생성 export/model cache를 추가하는 diff는 없다.

## ⚠️ 이 diff에서 검증 불가 / controller 관문

- 실제 Google 모델/processor가 새 input policy를 반환하는 성공 smoke는 아직 controller 실행 예정이다. POSIX 합성 executable 성공은 그 근거가 아니다(`test/acceptance/production-boundaries.test.js:96`).
- 종합 독립 리뷰, 주요 지적 보완, 최종 commit source 재검증, 최종 출시 판정, 이 scratch 정리는 parent/controller 관문이다. Task6 문서가 이를 완료로 주장하지 않으므로 이번 구현의 누락으로 분류하지 않는다(`docs/plans/2026-10-09-production-readiness.md:3`).
- 원격 CI 및 다른 OS/Node 조합, 실제 호스트 장기 집필·실작품 의미 품질, 모든 reader 해석, 정전·remote filesystem 복구는 검증되지 않았다. 새 POSIX 성공 fixture의 Windows skip는 명시되어 있다(`test/acceptance/production-boundaries.test.js:96`).
- 이미 완료된 이행/롤백 관련 Task1/4/5의 모든 기존 형식과 locked hash/receipt/hard/append-only/selfReview/soft 비자동수정 경로를 이번 작은 diff로 전부 증명할 수는 없다. Task6는 이를 비활성화하는 설정이나 core 모델/네트워크 호출을 추가하지 않았다. 전체 불변조건은 controller 종합 리뷰/회귀 범위에서 확인한다.
- benchmark는 Task6 적용 전 commit 식별자(BASE)를 가진 working tree 실행이고, 동시 fullcheck의 영향을 받았다는 한계를 기록한다. 전용 기계·percentile·peak memory·100-node Graph·실제 embedding latency/creative quality의 근거는 아니다(`scripts/benchmark-local.js:99`).
- API와 정적 JSON의 XSS text/escape는 확인되나 실제 브라우저 Resource 화면에서 악성 문자열이 실행되지 않는 것까지 이 Task6 테스트 자체가 증명하지는 않는다. viewer 렌더링/최종 UI 검증은 controller 관문에서 확인한다.

## 품질 판정

**Task quality: Approved.** 고정 입력 정책과 실패 경계가 명료하고 합성 회귀 및 실제100개 실측 근거가 요구사항에 맞는다. 새 correctness/유지보수 차단 결함은 확인하지 못했으며, viewer export 대기 비용과 Graph 경고를 실제 영향이 있는 Minor 출시 triage로 남긴다. **전체 출시 승인은 별도 controller 관문 대기**다.
