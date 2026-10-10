# Task 5 — 읽기 전용 진단과 합성 백업 복원 수용

## 상태와 범위

DONE. worktree `/path/to/folio`,
branch `codex/production-ready`, 착수 BASE `287bebe`.
커밋: `df4ce44 feat: add read-only work diagnostics and restore acceptance`.
task-5-brief를 먼저 읽고 AGENTS.md, docs/user-language.md, 계획의 Global Constraints만,
implementer template 및 제공된 후속 소비 계약·named risk를 확인했다.
독립 리뷰는 controller의 책임이며 subagent/reviewer를 생성하지 않았다.
원래 Folio checkout과 Vibelore는 읽거나 수정하지 않았다. 합성 fixture와 임시 복사본만 사용했다.

## 구현

- `inspectWork(root,{packs}) -> {ok,checks,actions}`를 추가했다. checks는
  `{name,status:ok|warning|error,message,details?}`, actions는 실행되지 않는 수동 안내 문자열이다.
- 루트 존재·일반 폴더 여부와 숨김 디렉터리까지 안전한 경로 모양을 검사한다.
  링크·특수 파일·권한 실패는 오류이며, 경로가 안전하지 않으면 더 읽지 않는다.
  `viewWorkspaceMode`를 재사용해 writing/Resource-only를 구분한다. Resource-only에
  work.yaml이나 novel 설정을 만들지 않으며 잘못된 기존 work.yaml을 fallback으로 숨기지 않는다.
- 모든 보존 `.jsonl`/`.head` 이름과 기본 기록장에 `openLedger.verify`를 재사용한다.
  설정에서 기능을 껐거나 현재 참조하지 않는 기록장의 변조도 확인한다.
- pure `workStatus`를 직접 호출한다. toolbox wrapper·withWorkLock·queryResources와
  index/gate 생성·recoverFileTx 경로를 진단에서 호출하지 않는다.
  원고/판본 drift·stale·flagged·warnings를 표시하며 손수정은 보존해야 할 변경으로 경고한다.
- 원고 run store에 선택적 strict list를 추가했다. 기존 기본 list의 corrupt sentinel 계약은 유지한다.
  strict는 깨진 JSON·file/runId 불일치·알 수 없는 state·비정상 .json 파일 종류를 거부한다.
  허용 state는 기존 active/awaiting_model/awaiting_user/committing 및
  waiting_children/done/skipped/abandoned/flagged다. 전체 run schema migration은 강제하지 않는다.
  image run은 기존 `list({strict:true})`를 사용한다. 열린 실행은 warning과 안전한 다음 행동이다.
- `pendingFileTxStatus`는 읽기만 사용한다. 온전한 중단 journal은 warning,
  손상·충돌·검증 불가능은 error이며 복구·삭제하지 않는다.
- `readAssets`/`readManagedAssets`의 기록 재생과 exact managed image bytes용
  `readAssetFile(root,id,{assets})`를 재사용한다. 현재 managed 파일의 실제 bytes와
  기록 fingerprint를 대조하며 손실·변경은 error다. 승인 history를 고치지 않는다.
- `metadataEntries`와 pure `viewResources` 및 시작/종료 Resource checkpoint를 재사용한다.
  선택 원본·승인 output의 bytes와 input/request/result/receipt/decision/publication 연결,
  hard 차단·selfReview·soft 근거를 기존 verifier로 확인한다.
  index 없는 경우에도 정본 근거를 검사하고, index 없음/stale/미관측 외부 및
  reviewRequired는 warning이다. metadata 생성·refresh·선택·승인은 자동 실행하지 않는다.
- `folio-doctor <work> [--json]`와 `npm run doctor --`를 추가했다.
  사람이 읽는 출력과 JSON을 지원하며 error는 exit1, 인자 오류는 exit2, warning만이면 exit0다.
  사용자 표기는 쉬운 영어이며 정확한 코드·메시지는 details에 남긴다.
- package.json/lock bin과 검증을 연결했다. 명시적 build→tarball→개발 의존성 없는
  설치 흐름·stdout JSON은 유지하며 설치본 doctor proof를 JSON에 추가했다.
  POSIX에서는 실제 설치 `.bin/folio-doctor`를 실행한다. Windows는 npm `.cmd` shim 존재를
  확인하고 그 설치된 Node entry를 shell 없이 실행한다. Windows 실제 실행은 로컬에서 주장하지 않는다.
- operations.md에 진단·백업·복원·재연결 수용 순서를 기록하고 README,
  compatibility/recovery/production/testing의 제공 범위와 오래된 doctor 설명을 갱신했다.

## TDD와 실제 실행 증거

모든 명령은 위 worktree에서 실행했다. PATH 앞에
`/path/to/node/bin`을 붙였다.
Node `v24.19.0`. 로그는 새 `/tmp/folio-production-task5-*` 이름으로 격리했다.

RED1: `node --test test/diagnostics/work.test.js`
로그 `/tmp/folio-production-task5-red.log`.
`ERR_MODULE_NOT_FOUND: .../core/diagnostics/work.js`, tests1/pass0/fail1.
합성 정상·손수정·자산 손실·기록장 변조·stale 자원·열린 실행/손상·경로/권한
수용 테스트를 먼저 추가했고 아직 새 진단 API가 없어 기대한 실패다.

GREEN1: 같은 명령. `/tmp/folio-production-task5-green-initial.log`,
tests18/pass18/fail0/skipped0/duration_ms1423.892875.

RED2: `node --test test/diagnostics/cli.test.js`
`/tmp/folio-production-task5-red-cli.log`, tests4/pass3/fail1.
`manifest.bin['folio-doctor']` actual undefined, expected `bin/folio-doctor.js`.
CLI 자체를 만든 뒤 package bin/script 등록을 요구하는 테스트가 먼저 실패했다.

GREEN2: `node --test test/diagnostics/*.test.js`
`/tmp/folio-production-task5-green-restore.log`,
tests26/pass26/fail0/skipped0/duration_ms2916.349083.
CLI, 진단, 원고와 Resource-only 새 폴더 복원·두 번 실제 MCP 재연결,
온전/손상 interrupted write의 무복구 읽기를 포함한다.

관련 보안·복구 회귀:
`node --test --test-concurrency=2 test/diagnostics/*.test.js test/core/status.test.js test/core/file-tx*.test.js test/run/ledger-damage.test.js test/run/commit-edit-recovery.test.js test/resources/immutable-recovery.test.js test/view/resources.test.js test/server/view-resources.test.js`
`/tmp/folio-production-task5-related.log`,
tests106/pass106/fail0/skipped0/duration_ms7556.800083.

첫 check는 restore test의 사용되지 않는 두 번째 asset 대입을 lint가 잡았다.
대입을 제거하고 lint 기준을 유지했다. 초기 typecheck는 workStatus의 오류 short-circuit
union에 variants가 없는 경우를 잡았다. `'variants' in status`로 정당하게 분기했다.
둘 다 기능·잠금 기준을 약화하지 않고 수정했다.

Fresh `npm run check`:
`/tmp/folio-production-task5-check-final.log`, exit0.
lint/typecheck diagnostics 없음. root test는 package.json의 기본 concurrency2를 사용했다.
tests1698/pass1698/fail0/cancelled0/skipped0/todo0/duration_ms115102.242125.
전체 suite의 기존 보안·잠금·자산·그림·복구·Resource·MCP·tarball 회귀도 함께 통과했다.

Self-review에서 snapshot 비교를 inode/mtime/ctime까지 보강한 최종 focused 재검증:
`node --test --test-concurrency=2 test/diagnostics/*.test.js`
`/tmp/folio-production-task5-green-final.log`,
tests26/pass26/fail0/skipped0/duration_ms3864.789666.
최종 `npm run lint`, `npm run typecheck`도 exit0이고 diagnostics 없음
(`/tmp/folio-production-task5-lint-final.log`, `/tmp/folio-production-task5-types-final.log`).

Fresh `npm run --silent package:verify`:
stdout `/tmp/folio-production-task5-package.json`,
stderr `/tmp/folio-production-task5-package.stderr`, exit0.
stdout는 실제 JSON으로 유지되었고 다음을 확인했다:
`installedFromTarball:true`, `developmentDependenciesAbsent:true`, entryCount507,
`doctor:{installedBinVerified:true,resourceOnlyVerified:true,pureReadVerified:true,missingRootExit:1}`.
기존 production synthetic/viewerResourceVisible/epubVerified/resourceOnlyVerified/
installedCliReady 모두 true, outputsRetained false와 네 원고·자산·추적 예제 verified도 유지했다.
명시적 viewer build의 기존 Graph chunk 1,613.44kB 크기 경고는 stderr에 남겼다.
이를 테스트 실패나 원격 CI 통과로 표현하지 않는다.

`git diff --check`: exit0. 모든 새/수정 코드 파일은 300줄 이하.

## 순수 읽기와 복원 proof의 범위

- helper snapshot은 숨김 경로·빈 디렉터리·일반 파일 bytes·mode·링크 대상을 모두 포함한다.
  같은 root의 진단 전후 비교는 inode/mtime/ctime도 확인해 같은 bytes 재작성까지 탐지한다.
  access time은 정상 읽기로 바뀔 수 있어 비교하지 않는다.
- cold writing(상태 폴더/색인/gate 없음), 열린 실행, 기존 gate와 immutable/metadata,
  손상된 bytes/ledger/run, 온전·손상 tx에서 진단이 새 디렉터리를 만들거나
  파일을 바꾸지 않는 것을 검증했다. permission test는 읽을 수 없는 config의
  진단 실패를 직접 확인하고 테스트가 권한을 복원한다.
- 전체 백업 시험은 진짜 stdio server를 종료한 뒤 `cp(...,{recursive:true,
  force:false,errorOnExist:true})`로 새 root에 복사한다. 복사본의 디렉터리·bytes·mode
  목록이 원본과 같은지 확인한 뒤 pure 검사·Resource view를 수행한다.
- 두 번 실제 공개 MCP 재연결에서 과거 source checkpoint와 output receipt,
  자기검토와 soft finding, writing commit 기록, 관리 그림 두 버전의 변경·검토·승인
  history와 independent:false 표기를 확인했다. 원본은 그대로이고 복원본의
  모든 기록장/head·tree·asset bytes와 state marker/receipt 이력은 재연결 뒤에도 유지된다.
  일반 공개 조회는 gate 등 파생 상태를 만들 수 있어 이 단계의 전체 파일 무변경을
  진단의 순수 읽기 보증과 혼동하지 않는다.

## 파일과 Self-review

Create: core/diagnostics/work.js, core/diagnostics/paths.js, bin/folio-doctor.js,
scripts/package-doctor.js, test/diagnostics/work.test.js, test/diagnostics/cli.test.js,
test/diagnostics/restore.test.js, test/support/diagnostics.js, docs/operations.md.
Modify: core/run/run-store.js, package.json, package-lock.json, scripts/check-package.js,
test/server/tracking-package.test.js, README.md, docs/compatibility.md, docs/production.md,
docs/recovery.md, docs/testing.md.
보고서는 scratch artifact이며 force-add/commit하지 않는다.

diff와 새 파일을 읽으며 strict default 호환, valid 종료 상태, 실제 missing root,
경로·권한 오류 보존, 모든 기록장/현재 선택·승인 proof, exact managed bytes,
판본 drift/stale flatten, JSON stdout, Windows shell 회피, 자동 recovery/index/approval
금지와 정상 오류 분리를 점검했다. 하드 잠금·hash·추가만 되는 기록장·자기검토·soft
비자동수정 정책을 바꾸거나 설정으로 끄는 기능을 추가하지 않았다.
core에는 모델·외부 네트워크 호출을 추가하지 않았다.

알려진 미해결 correctness concern 없음. 문서에 있는 범위상 한계는 유지된다:
모든 기록자 중지 후 전체 폴더를 새 사본으로 복원해야 하며 live copy의 원자성,
전원 손실 내구성, 옛/새 기록자 혼합, 모든 파생 cache·과거 미선택 후보의 완전 검사,
AI 의미 품질을 보증하지 않는다. 자동 손상 복구 도구가 아니다.
기존 Graph build 크기 경고는 Task5 범위 밖이다. 원격 CI·Windows/다른 Node 실제
실행은 수행하지 않아 통과로 쓰지 않는다.

## Fix round 1 — 반환형으로 전달된 기록장 실패 보존

Fix BASE `df4ce44`. 독립 리뷰 task-5-review.md의 Important를 확인했다.
Fix commit: `8c8d4aa fix: preserve returned integrity failures in diagnostics`.
초기 self-review가 `openLedger.verify`의 hash-chain 성공과 `workStatus`의
추적 의미/영수증 무결성 실패 반환을 구별하지 못한 결함이다. 앞선
"알려진 미해결 correctness concern 없음"은 당시 보고였으며 이 리뷰로 발견한
false-normal을 이 라운드에서 수정했다.

`core/diagnostics/work.js`의 writing-status 경계가 이제 `status.ledger`의
모든 `ok:false` 반환을 순회한다. 각 실패를 `writing-status:<name>` error check로
보존하고 원래 검증 객체(code/error 포함)를 details로 전달한다. 쓰기 중지와
기록 보존·별도 정상 백업 비교 행동을 안내하고, 실패 상태를
`Writing status verified.`로 축약하지 않는다. 나머지 읽기 경계와
hash/hard/selfReview/append-only/soft 정책은 변경하지 않았다.

추가 파일 `test/diagnostics/status-ledgers.test.js`는 실제 합성 novel 사본에
chain이 온전한 `tracking_unknown`과 영수증 없는 `tracking_batch`를 append한다.
`openLedger.verify`는 `{ok:true}`지만 실제 `workStatus`가 각각
`TRACKING_RECORD_INVALID`, `LOCK_TRACKING_INTEGRITY`를 반환한다는 전제를 먼저
검증한다. 각 경로에서 진단 error/details/안전한 행동을 확인하고 JSON·human
실제 CLI의 exit1, 원래 code 노출 및 모든 파일·디렉터리·bytes·mode·inode·mtime·ctime
무변경을 확인한다. 모델·네트워크·잠금·복구·인덱스 쓰기 경로는 추가하지 않았다.

RED:
`node --test test/diagnostics/status-ledgers.test.js`
`/tmp/folio-production-task5-fix1-red.log`, tests4/pass0/fail4/skipped0,
duration_ms718.522875. 두 API 테스트는 actual `ok:true` != expected false,
두 CLI 테스트는 actual exit0 != expected1로 실패했다. 두 의미 무결성 실패를
기존 doctor가 실제로 정상 처리한다는 재현이었고 기대한 실패다.

GREEN/covering:
`node --test --test-concurrency=2 test/diagnostics/*.test.js test/core/status.test.js test/tracking/integrity.test.js test/tracking/plan.test.js`
`/tmp/folio-production-task5-fix1-green.log`, tests74/pass74/fail0/cancelled0/
skipped0/todo0/duration_ms6111.812, exit0.
진단·CLI·복원 기존 회귀와 두 신규 오류 경로, 코어 status와 추적 의미/영수증
무결성 회귀를 함께 검증했다.
`npm run lint`: `/tmp/folio-production-task5-fix1-lint.log`, exit0, diagnostics 없음.
`npm run typecheck`: `/tmp/folio-production-task5-fix1-types.log`, exit0, diagnostics 없음.
`git diff --check`: exit0.
Controller 지시에 따라 전체 suite와 package:verify는 재실행하지 않았다.
따라서 기존1698/1698 및 설치 검증은 fix BASE의 실행 증거로만 남기며,
이번 수정에 대한 실행 증거는 위74개와 실제 source CLI다.

Self-review: 실패 details를 그대로 보존하며 ledger 이름 전체를 순회하는지,
실패 반환 뒤 정상 writing check를 추가하지 않는지, 오류 시 aggregate ok=false와
CLI exit1이 되는지, 새 테스트가 verifier mock 없이 두 실제 반환 경로를
검증하는지 diff를 확인했다. 코어 파일103줄, 새 테스트54줄로 상한 이내다.
수정 범위는 production 진단과 필요한 회귀 테스트 두 파일뿐이며,
scratch 보고서는 commit하지 않는다. 미해결 correctness concern 없음.
