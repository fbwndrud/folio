### Spec Compliance

- ❌ Issues found: `core/diagnostics/work.js:58-64`가 `workStatus`의 반환형으로 전달되는 무결성 실패를 정상으로 표시한다. 상태/기록장 검증 재사용 요구와 손상 시 거짓 정상 금지 요구를 충족하지 못한다.
- ⚠️ Cannot verify from diff: 원래 dirty checkout 및 지정된 기존 branch/ref의 전체 보존은 변경 diff만으로 입증할 수 없다. controller의 격리 작업 증거를 확인해야 한다. Windows와 Node22/26 및 원격 CI 실실행은 보고서에서 통과로 주장하지 않았으며 이번 리뷰도 검증하지 않았다.

### Strengths

- `core/diagnostics/work.js:19-45`, `core/diagnostics/paths.js:5-31`: 오류를 구조화하고 안전하지 않은 경로는 즉시 중단한다. 기존에 참조하지 않는 기록장/head도 확인하며, 중단된 쓰기는 읽기만 수행한다.
- `core/diagnostics/work.js:46-57`, `core/run/run-store.js:36-54`: 열린 실행을 warning으로 안내하고, strict 목록은 깨진 JSON·파일명 불일치·알 수 없는 상태를 거부한다. 기본 목록의 손상 sentinel 동작은 유지한다.
- `core/diagnostics/work.js:69-94`: managed image의 실제 bytes와 Resource 정본 검증기를 재사용한다. metadata 생성·승인·선택·복구 함수를 호출하지 않는다.
- `test/support/diagnostics.js:8-25`, `test/diagnostics/work.test.js:21-144`: 숨김/빈 디렉터리·링크·파일 bytes·mode·inode·mtime·ctime을 비교해 진단의 무변경을 검증한다. cold work, 손상, 권한 실패, pending write를 합성 사본으로 다룬다.
- `test/diagnostics/restore.test.js:17-77`: 모든 기록자를 닫은 뒤 새 폴더로 전체 복사하며 실제 MCP 두 번 재연결, 과거 checkpoint·output receipt·self-review/soft 근거·그림 승인 이력과 원본 보존을 확인한다.
- `bin/folio-doctor.js:8-22`, `scripts/package-doctor.js:19-45`: human/JSON, 인자 exit2, 오류 exit1, 설치 bin과 Resource-only 사본 무변경을 검사한다. `docs/operations.md:37-72`는 진단의 순수 읽기와 일반 재연결의 파생 상태/복구 가능성을 구별하며 backup 범위를 정확히 한정한다.
- 변경된 코드 파일은 300줄 이하이며 diff에 실제 작품, 모델/외부 네트워크 호출 또는 잠금 비활성화 경로가 없다.

### Issues

#### Critical (Must Fix)

- 없음.

#### Important (Should Fix)

- `core/diagnostics/work.js:58-64`: `workStatus`는 tracking 의미/영수증 무결성 실패를 throw하지 않고 `status.ledger.tracking.ok=false`로 반환한다(`core/status.js:36-44`). doctor는 `status.ledger`를 검사하지 않고 비어 있는 drift/stale/warnings/flagged만 보고 `Writing status verified.`를 출력한다. 앞선 `openLedger.verify()`는 hash chain만 검증하므로 의미적으로 손상됐지만 chain이 온전한 기록은 잡지 못한다. 합성 novel 사본에 `openLedger(root,'tracking').append({type:'tracking_unknown'})`를 추가한 집중 재현에서 원래 status는 `TRACKING_RECORD_INVALID`지만 doctor는 `ok:true`, `writing-status:ok`, `actions:[]`였다. 실제 CLI도 `--json`에서 exit0/ok:true로 확인했다. 반환된 모든 ledger 실패를 error check로 보존하고 안전한 다음 행동을 안내해야 한다. `TRACKING_RECORD_INVALID` 및 `LOCK_TRACKING_INTEGRITY` 반환 경로에 대해 순수 읽기와 CLI exit1 회귀를 추가한다.

#### Minor (Nice to Have)

- 알려진 Task4 M2 유지: `/tmp/folio-production-task5-package.stderr:10`의 Graph chunk는 1,613.44kB이고 같은 파일의 크기 경고가 남는다. Task5가 새로 만든 오류는 아니며 controller 최종 triage에서 기존 Minor와 합쳐 추적한다. 테스트/검증 출력이 완전히 경고 없는 상태는 아니다.

### Checks Run / Evidence

- `/tmp/folio-production-task5-check-final.log`의 최종 요약을 확인했다: tests1698/pass1698/fail0/skipped0. 전체 suite를 재실행하지 않았다.
- `/tmp/folio-production-task5-package.json`을 확인했다: installedFromTarball/developmentDependenciesAbsent 및 doctor.installedBinVerified/resourceOnlyVerified/pureReadVerified가 true, missingRootExit=1이다. stderr의 기존 Graph 크기 경고도 확인했다.
- 이름 붙인 집중 위험 확인: **상태 API의 실패 반환이 정상으로 축약될 위험** — `core/status.js:27-86`, `core/run/workspace.js:48-67`, `core/store/work.js:22-47`, `core/tracking/records.js:10-17`와 해당 tracking_unknown fixture 계약을 확인하고 합성 임시 사본으로 API/CLI 한 사례만 재현했다. 결과는 위 Important와 같다.
- 이름 붙인 집중 위험 확인: **진단 의존성이 index/gate/recovery를 만들거나 권한 오류를 숨길 위험** — pure status/workspace, `core/util/fs.js:13-27`, `core/util/managed-path.js:6-20`, `core/ledger/ledger.js:34-62,86-91`, `core/util/file-tx.js:132-146` 및 Resource checkpoint/read query를 확인했다. 진단이 호출하는 읽기 경로는 기록/복구를 실행하지 않고 ENOENT 외 읽기 실패를 전파한다.
- 이름 붙인 집중 위험 확인: **Resource/asset 증거가 bytes 또는 receipt/hard/self-review 연결 없이 통과할 위험** — `core/projections/metadata.js:8-25`, `core/projections/evidence.js:9-38`, `core/query/resource-read.js:8-26`, `core/view/asset-file.js:31-74`를 확인했다. 정본 증거와 실제 managed file hash를 재검증한다.
- 리뷰 diff는 한 번 읽었다. 도구 출력에서 중간이 잘려 누락된 docs/package 구간만 이어서 읽었다. 변경 source 파일을 별도로 다시 읽지 않았다. checkout/index/HEAD/branch를 변경하지 않았으며 리뷰 산출물 외 저장소 파일을 쓰지 않았다.

### Assessment

**Task quality:** Needs fixes

**Reasoning:** 읽기 전용 경계, 설치본과 새 폴더 복원 proof는 탄탄하다. 그러나 정본 tracking 무결성 실패를 성공과 exit0으로 돌려주는 실제 재현이 있어 진단을 신뢰할 수 없으며, 반환형 실패를 error로 처리한 뒤 승인해야 한다.
