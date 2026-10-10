- **I1. metadata 중단 임시 파일이 이후 조회를 차단함 — ADDRESSED.** `core/projections/manifest.js:35`는 `core/resources/immutable-stage.js:4–10`의 정확한 이름 및 일반 파일 검사를 통과한 stage만 보존하며 건너뛴다. unknown 이름은 `manifest.js:36`, symlink/디렉터리/FIFO는 `core/util/managed-path.js:15–17`, 손상된 최종 세대는 `manifest.js:19–26`에서 계속 거부한다. 기존 Resource 탐색의 규칙도 `core/view/workspace-mode.js:24`에서 같은 helper로 유지한다. `test/view/metadata-interruption.test.js:19–58`은 실제 자식 SIGKILL, 이전 세대의 stale 조회/doctor, 명시적 공개 refresh/query 재시도, current 목록/상세/snapshot/doctor, stage 보존 및 읽기 전후 bytes/mode/inode/mtime/ctime 불변을 검증한다. `:61–84`는 unknown/symlink/특수 파일/손상 canonical 거부를 검증한다. GET/doctor에 삭제·복구·쓰기 경로를 추가하지 않았다.
- **I2. managed asset 부분 쓰기가 동일 put 재시도를 차단함 — ADDRESSED.** `core/assets/files.js:74–88`은 소유 Buffer 전체를 고유 stage에 `wx`로 쓴 뒤 같은 디렉터리에서 `link(stage, target)`로 배타적으로 게시한다. 부분 쓰기 중단에는 최종 이름이 만들어지지 않으며, ledger append는 여전히 `core/assets/change.js:83–85`에서 저장 성공 뒤에만 실행한다. 기존 최종 파일의 hash 불일치와 symlink 거부는 `files.js:25–47,83–85`에서 유지한다. `test/core/assets-interruption.test.js:13–68`은 실제 4바이트 ENOSPC 및 자식 SIGKILL 후 최종 파일/새 version 부재, 동일 ID·expectedRev·입력의 공개 toolbox put 성공, SIGKILL 고아 stage 보존을 검증한다. `:71–84`는 기존 final mismatch/symlink 보존·거부, `:88–101`은 정확히 20MiB asset 성공, 20MiB+1 거부 및 Resource 8MiB+1 거부를 검증한다.

## 수정 diff의 새 회귀

- **없음.** `25eb59b..5fc61bc`의 7개 파일 수정만 재검토했으며 새 Critical/Important/Minor 결함을 발견하지 못했다. core 모델·네트워크 호출 및 설정 가능한 잠금 우회가 추가되지 않았고, hash/영수증/hard/추가만 되는 기록장/자기검토/soft 비자동수정 경계를 바꾸지 않았다. 수정 source/test는 최대 102줄이며 helper의 책임은 stage 판별 하나다. 회귀 입력은 합성 fixture이고 기존 종료 정리 helper를 사용한다.

## 확인한 검증 증거

- **검증 확인 — suite 재실행 없음.** 구현 보고서의 명령·결과를 diff 및 기존 raw 로그와 대조했다. 특정 미해결 위험이 없어 새 focused test도 실행하지 않았다. 아래 결과는 구현자의 기존 실행을 확인한 것이며 독립 재실행 결과가 아니다.
- **RED 확인.** `node --test --test-reporter=tap test/view/metadata-interruption.test.js test/core/assets-interruption.test.js > /tmp/folio-final-fix-red.log 2>&1`의 raw 로그는 `tests 6 / pass 2 / fail 4 / cancelled 0 / skipped 0 / todo 0`이다. 보고서가 cat wrapper exit 0과 실제 TAP 실패를 구분하며, 실패는 final partial file 잔류 및 metadata stage 이름 거부와 일치한다.
- **GREEN 확인.** 같은 두 파일 명령의 `/tmp/folio-final-fix-green.log`는 여섯 회귀 모두 `ok`, `tests 6 / pass 6 / fail 0 / cancelled 0 / skipped 0 / todo 0 / duration_ms 1118.683792`이다. 보고된 실행 exit는 0이다.
- **연결 suite 확인.** 보고서 명령은 다음과 같고 `/tmp/folio-final-fix-covering.log`에서 신규 여섯 회귀 및 최종 합계를 확인했다.

```sh
node --test --test-concurrency=2 --test-reporter=tap test/resources/*.test.js test/operations/*.test.js test/view/*.test.js test/diagnostics/*.test.js test/core/assets-*.test.js test/image/*.test.js test/server/resources-e2e.test.js test/server/view-resources.test.js test/server/managed-assets-find.test.js test/server/assets-*.test.js test/server/image-tool.test.js test/server/view-export.test.js test/server/view-export-safety.test.js test/run/assets.test.js test/run/work-lock-*.test.js test/run/commit-edit-recovery.test.js test/run/variant-locked-recovery.test.js test/run/gamebook-recovery.test.js test/run/tracking-backfill-recovery.test.js > /tmp/folio-final-fix-covering.log 2>&1
```

```text
1..266
# tests 266
# suites 0
# pass 266
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 22283.511875
```

- **정적 검사 확인.** 보고서의 `npm run lint && npm run typecheck > /tmp/folio-final-fix-typecheck.log 2>&1` 및 `git diff --check`는 각각 exit 0이다. lint 출력은 `> folio@0.0.0 lint` / `> eslint .` 이후 진단 없음으로 보고되어 있다. 직접 읽은 typecheck raw 로그는 `> folio@0.0.0 typecheck` / `> tsc -p tsconfig.json` 이후 진단 없음이다. diff-check 출력 없음은 보고서 증거이며 재실행하지 않았다.
- **검토 실행 확인.** brief/기존 I1·I2/fix report/제공 diff/수정 코드·테스트 및 관련 호출·검사 helper/raw 로그를 읽었다. `wc -l`로 수정 source/test의 300줄 이내를 확인했다. 체크아웃·인덱스·HEAD를 변경하지 않았고 이 scratch 보고서만 작성했다.

## 범위 밖 관찰

- **새 관찰 없음.** 기존 수용 Minor M1/M2는 이 수정의 차단 조건으로 다시 열지 않았다.
- **남은 gate 확인.** controller의 fresh 전체 suite·설치본 검증·정확한 최종 commit benchmark·실제 모델/UI 실행은 이 재검토 이후 별도 완료 단계로 남는다. 이 보고서가 이를 완료했다고 주장하지 않는다. SIGKILL은 실제 전원 손실/fsync 내구성 또는 다른 OS/remoteFS 검증이 아니다.

## 라운드 판정

- **Fix round: All findings addressed, no new Critical/Important breakage.** I1/I2 모두 해결되었으며 열린 지적은 없다. 지정된 한 번의 scoped re-review gate를 통과한다.
