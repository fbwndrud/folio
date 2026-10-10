# Task 1 독립 리뷰 — spec + quality

## Spec Compliance

- ❌ **Issues found.** 두 자산 구현의 writer gate/재개 경계가 통합되지 않았다. 공개 관리 자산 쓰기와 중단된 이미지 커밋을 순서대로 실행하면 중복 ID를 발행하여 작품 전체를 `WORK_INVALID`로 만든다. `core/assets/change.js:40`, `core/image/commit.js:78`, `core/image/commit.js:90`. 아래 I1을 고쳐야 Task 1의 “writer gate를 소비자까지 대조”, “양쪽 기능 보존”을 충족한다.
- ✅ 실제 두 부모 merge 증거: supplemental package 첫 2줄은 `49be509760fc810f47a6823ff50a5f8fab9ed12f`, `Merge: 50b56c3 713b9d8`이다. 충돌 35개와 해결 책임은 `task-1-report.md`에 기록되어 있다.
- ✅ 동일 stdio 수용 시험이 공개 도구 호출, picturebook/gamebook 초기화, selected resource→metadata refresh/query→vector index/search, tracking-backfill, active tracking 작품의 번역 판본 확정과 원문 보존을 실제로 수행한다. `test/acceptance/production-integration.test.js:14`, `:41`, `:50`, `:61`, `:72`.
- ✅ nullable managed attachment, snapshot/export 소비자, 자산 바이트 변조 거부, scalar 사건과 최종 발행 marker의 가시성은 구체적인 assertion으로 추가되었다. `test/acceptance/production-consumers.test.js:15`, `:37`.
- ✅ script 합집합과 선택적 모델 adapter 경계가 유지된다. `package.json:10`, `.github/workflows/ci.yml:34`, `server/tools/embeddings.js:1`. source setup/viewer/preview와 check/examples/assets/package가 공존한다.
- ⚠️ **Cannot verify from diff:** 실제 merge 시작 명령, 원본 dirty checkout/main/vibelore 보존은 보고서 주장이며 이 read-only 리뷰에서 Git 상태나 다른 checkout을 재조회하지 않았다. 원격 CI 다중 OS/Node 결과도 확인하지 않았으며 로컬 성공과 혼동하지 않는다.
- ⚠️ **Cannot verify from diff:** 설치 tarball의 완성된 viewer/dist, resource-only HTTP 읽기, export 교체 안전성은 Task 4/후속 범위이다. `package.json:21`의 파일 목록에 viewer/dist가 없는 현재 상태를 최종 배포 준비 완료로 인정하지 않는다. Task 4 실제 계획(`docs/plans/2026-10-09-local-production-implementation.md:86`)은 이를 red부터 검증하도록 명시한다.

## Strengths

- `core/run/commit-target.js:13`, `core/run/commit-target-file.js:10`에서 원본/판본 모두 정확한 before/after 파일 바이트를 intent에 결속한다. 영수증 후 손수정을 다시 덮도록 기존 기대를 유지하지 않고 충돌로 막는다.
- `core/run/commit.js:66`의 판본별 원본 결속·영수증 동일성, `core/tracking/commit.js:43`의 판본 tracking 주입 거부, `core/run/steps/commit-step.js:77`의 판본 곁 기록장 쓰기 제외가 서로 맞는다.
- `core/view/ledgers.js:27`가 최종 발행 가시성을 공통화하고 entity/promise 소비자가 이를 사용한다. `core/run/run-context.js:40`와 index generation도 동일한 `publishedEvents` 규칙을 쓴다. 원본 사건에 대한 scalar data는 그대로 유지한다.
- `core/store/asset-bindings.js:2`의 공통 첨부 투영을 node view와 publication export에 연결하고, `core/view/asset-file.js:70`에서 실제 제공할 managed 바이트를 contentHash와 다시 대조한다.
- `core/pack/yaml-pack.js:88`에서 외부 checks 카탈로그를 안전한 팩 내부 경로로 읽고 선언 digest에 포함한다. `packs/novel/checks.yaml` 분리로 새 카탈로그와 pack 선언은 300줄 이내이다.
- `server/tools/resource-contracts.js:3`, `server/tools/definitions.js:99`에서 신규 도구에 strict 입력 조건과 공통 annotations/output schema를 연결한다. `test/server/schema-stdio.test.js`의 실제 structuredContent 경로도 함께 보존한다.

## Issues

### Critical (Must Fix)

없음.

### Important (Should Fix)

**I1. [P1] 중단된 이미지 커밋이 예약한 ID를 managed add가 가로채고, 재개가 중복 자산을 최종 발행한다.**

- 위치: `core/image/commit.js:78`–`:90`; 관련 미변경 소비자 `core/assets/change.js:40`–`:45`.
- 원인: 관리 자산 gate는 `.folio/runs`의 원고 실행만 확인한다. 이미지 실행은 별도 `.folio/image-runs`에 있으며 `asset_receipt`를 남기고 YAML을 쓰기 전에 중단될 수 있다. 그때 `openWork().assets`에는 아직 이미지 ID가 없으므로 같은 ID로 managed `asset_version`을 추가할 수 있다. 이미지 재개는 `run.state === 'committing'`이라는 이유로 ID 충돌 검사를 생략하고 `<id>.yaml`과 `asset_commit`을 쓴다.
- 영향: 재개는 `done`을 반환하지만 다음 `openWork`가 `DUPLICATE_ASSET_ID`로 실패한다. 관리 기록장은 추가만 되므로 단순 재시도나 일반 자산 수정으로 회복할 수 없다. 기존 어느 한 부모에서 따로 존재하던 두 기능을 합친 뒤 발생하는 소비자 통합 결함이다.
- 재현: Node 24의 단일 focused 실행으로 확인했다. 합성 `illustratedWork`/`createImageHost`로 `collision-image`를 승인 질문까지 진행한다. `assets/collision-image.yaml`에 다른 합성 ID의 설명서를 두면 기존 image recovery 시험과 동일하게 `ASSET_IMMUTABLE`에서 중단되고 영수증과 `committing` 실행이 남는다. 장애용 설명서를 제거한 뒤 `changeAsset(root,{op:'add',id:'collision-image',brief:{description:'synthetic managed asset',entities:[]}})`를 호출한다. 성공 후 이미지 `resume`을 호출하고 `openWork`를 호출한다.
- 관측 출력:

```text
interrupted image commit: ASSET_IMMUTABLE
image run state: committing
managed add while image committing: collision-image
resume: done
work: WORK_INVALID {"errors":[{"code":"DUPLICATE_ASSET_ID","id":"collision-image"}]}
asset records: image_result, image_result, image_result, asset_receipt, asset_version, asset_commit
```

- 수정: 이미지 실행/영수증의 예약 ID를 관리 자산 쓰기가 확인하도록 공통 gate를 만들거나, 두 체계의 active/committing writer를 함께 차단한다. 이미지 재개에서도 자신의 기존 YAML/영수증만 멱등 허용하고 같은 ID의 managed 자산은 최종 파일 쓰기 전에 거부해야 한다. 위 중단 경계의 회귀 시험을 추가하고, 실패 후에도 작품이 열리며 두 체계의 각 기록이 보존됨을 검증한다.
- 이 재현은 원고·실제 이미지·소스·HEAD/index/branch를 변경하지 않았다. 합성 임시 작품/PNG만 사용했고 생성한 임시 경로를 끝에 정리했다. 전체 suite는 재실행하지 않았다.

### Minor (Nice to Have)

**M1. 설치 검증에 남은 dependency 경고의 후속 책임을 계획에 명시해야 한다.**

- 위치: `package-lock.json:265`(SDK 1.30.1), `viewer/package-lock.json:985`(source-map-js 1.2.1), `package-lock.json:795`(eslint 9.39.5 deprecation).
- 증거: `/tmp/folio-ci.log:1`의 deprecated 경고, root/viewer ci의 high 1건씩, `/tmp/folio-audit-runtime.json`의 SDK advisory, `/tmp/folio-viewer-audit.json`의 source-map-js advisory를 실제 읽었다. viewer `--omit=dev` audit는 0건이다.
- 분류 근거: SDK audit는 OAuth client 경로이며 확인한 공개 실행은 `server/stdio.js:1`의 stdio server와 examples의 stdio client이다. 이 리뷰에서 해당 취약 코드에 대한 도달 가능한 제품 경로는 발견하지 않았다. source-map-js는 viewer 개발 의존성이므로 즉시 제품 경로 취약성으로 확대하지 않는다. 그렇더라도 설치 검증 출력은 pristine하지 않다.
- 수정/후속: Task 4는 fresh 설치·root/viewer 검사·installed tarball을 명시하지만 실제 계획에는 SDK/source-map-js 업데이트 항목이 없다. 보고서의 “Task 4에서 정리”만으로 해결된 것으로 간주하지 말고, 수정 버전 lock 갱신과 재검증을 명시해 추적한다. eslint deprecation도 같은 dependency 정리에서 다룬다.

**M2. viewer 번들 크기 경고는 성공 판정과 분리해 남겨야 한다.**

- 위치: `task-1-report.md:122`, `task-1-report.md:138`(약 1.61 MB graph chunk).
- 보고서가 경고를 숨기지는 않는다. 현재 리뷰에는 별도 viewer build 로그 경로가 제공되지 않아 이 수치를 독립 확인하지 않았고, 경고가 있다는 구현 보고를 그대로 기록한다. 새로 도입된 성능 회귀라는 증거가 없어 merge 차단 사유로 삼지 않는다. Task 4 viewer build 때 실제 로그와 필요 시 번들 분리를 검토한다.

## 읽은 범위와 검증 근거

- 기준 범위는 **BASE `50b56c3` → HEAD `49be509` 전체**이다. primary `review-50b56c3..49be509.diff`는 inherited main 이력 약 200개 commit을 포함하는 전체 패키지이며 그 범위를 다른 base로 축소했다고 주장하지 않는다.
- 이 리뷰는 Task 1의 semantic integration gate이다. 전체 패키지를 기능/위험별 pass로 읽었으며 inherited main의 모든 파일을 전면 재감사한 broad final review가 아니다. 전체 4.86 MB의 모든 줄을 읽었다고 주장하지 않는다.
- Pass 1: commit 목록/merge header, brief/report, Global Constraints 정확한 블록, Task 4 실제 계획과 package/CI 통합.
- Pass 2: primary와 supplemental의 commit/target/prepared/runner/workspace/run-context/run-start/receipt-builder/common/check/commit-step/sync/text-guard, receipts/variant locks·store, payload/scope/branching/stale/rechecks, tracking commit/extract, status.
- Pass 3: assets records/store/bindings, work, index generation, view ledgers/entity/node/promise/receipt/asset-file, export source/assets 및 두 production acceptance 시험.
- Pass 4: definitions/handlers/find, input/output/resource contracts/metadata/validate-input, yaml-pack/features 및 관련 changed tests의 assertions. 잘린 출력은 필요한 후속 hunk로 보충했다.
- Pass 5: 두 자산 writer의 예약/재개 충돌 위험 때문에 primary의 `core/image/commit.js`, `core/image/runner.js`, `core/image/context.js`, `test/image/image-commit.test.js`, `test/support/image-work.js` hunk를 읽고 focused reproduction을 수행했다.
- diff 밖 named risk 확인: (a) final marker helper가 variant/scalar를 잘못 발행할 위험 → 미변경 `core/ledger/event-visibility.js`; (b) variant intent 재개 결속 누락 → 미변경 commit-intents/legacy-commit-intents; (c) schema wrapper가 기존 계약을 덮는 위험 → 미변경 resources/inputs/policy/operations/resource-query/embeddings 정의 및 handler; (d) managed/image writer 충돌 → 미변경 assets/change/view와 test/support/assets; (e) receiptRecords 시그니처 유실 → `entityRevAt`/`gatherScope` 호출처만 검색; (f) dependency advisory의 실제 경로 → server/bin/adapters/examples/scripts의 SDK import와 OAuth 사용만 검색.
- 소스 직접 재독으로 diff를 대체하지 않았다. 변경 파일의 확인 기준은 패키지 hunk이며 구체적 참조 줄 위치는 좁은 문자열 검색으로 확인했다. Git 명령/소스 수정/branch 변경/추가 subagent는 사용하지 않았다. 유일한 checkout 쓰기는 요청받은 이 scratch 리뷰 문서이다.
- 실제 읽은 최종 검증 로그: `/tmp/folio-check-green.log`는 lint/typecheck 후 **1645 tests, 1645 pass, 0 fail, 0 skipped, 102451.366 ms**. package 로그는 `installedFromTarball:true`, `developmentDependenciesAbsent:true`, story/guide/picturebook/fairytale와 assets/tracking 통과. examples/assets 로그 역시 합성 및 `outputsRetained:false`를 확인했다.
- 추가로 실행한 검증은 I1의 단일 focused reproduction뿐이다. 구현자가 이미 보고한 suite를 재실행하지 않았다.

## Assessment

**Spec compliance: ❌ Issues found**

**Task quality: Needs fixes (`qualityApproved: false`)**

두 기능군의 주된 계약 합성은 잘 되어 있고 기존 검증은 실제로 통과했다. 그러나 공유 자산 ID 공간의 writer/recovery 경계가 열린 채여서 정상적인 재개가 작품을 열 수 없는 상태로 만들므로 I1 수정 후 재리뷰가 필요하다.
