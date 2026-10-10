# Final consolidated fix wave

BASE 25eb59b. Binding scope: local personal MCP+viewer release. Read AGENTS and final-review.md, then address both Important findings below in one scoped fix. No second broad refactor. Preserve all existing hashes/receipts/hard/append-only/self-review/soft-noauto; core no model/network; synthetic only; <=300line one-responsibility modules. Resource original 8MiB and managed asset20MiB contracts must both remain.

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


## Acceptance

- Focused RED reproductions before fix; GREEN/covering tests after fix.
- I1 real child SIGKILL after known metadata stage partially written, explicit refresh retry, public query/view/doctor success, known temporary bytes/path preserved and pure reads unchanged. Unknown names, symlinks/special paths, malformed canonical generations still error. No auto-delete/recovery/mutation on GET/doctor.
- I2 partial write ENOSPC and child SIGKILL staged write, same ID/same bytes put retry success, no incomplete final publication/ledger version. Existing final mismatch/symlink unsafe rejection remains. At least one >8MiB <=20MiB managed synthetic file succeeds; >20MiB still rejected and Resource >8MiB still rejected. Do not silently narrow assets to shared Resource writer limit.
- Cover affected projection/query/view/diagnostics and assets/server/image recovery suites. Fresh whole suite is controller after independent rereview; do not duplicate broad tests now unless a specific integration concern warrants escalation.
- Commit code/tests/necessary recovery docs only; scratch neverforceadd. Append commands/output/RED/GREEN/self-review/limits to final-fix-report.md in this scratch, return concise status+commit. No subagents. No performance rewrite: reviewed M1/M2 remain explicit known limitations.
