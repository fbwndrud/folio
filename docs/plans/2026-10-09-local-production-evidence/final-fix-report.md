# 최종 Important 수정 보고

상태: DONE. 기준 `25eb59bddd0c039170818584df4d403e87e86b6f`. 작업 위치 `/path/to/folio`. 실행 환경 Node v24.19.0, darwin arm64. I1/I2만 수정했으며, 성능 M1/M2는 기존 수용 범위로 유지한다.

커밋: `5fc61bc fix: recover metadata and asset writes after interruption`. 7개 production/test/doc 파일만 포함했고 scratch는 제외했다. 커밋 후 `git status --short` 출력 없음. 검증 이후 production/test 파일을 변경하지 않았다.

## 구현

- I1: `core/view/workspace-mode.js`에 있던 정확한 `.immutable-<UUID>.tmp` 이름 규칙과 `assertManagedPath` 검사를 `core/resources/immutable-stage.js`로 공유했다. Resource 탐색과 metadata 세대 열거가 모두 알려진 일반 임시 파일만 건너뛰며 보존한다. 알 수 없는 이름, symlink, 디렉터리/FIFO, 손상된 canonical JSON 및 canonical symlink는 계속 거부한다. 최종 hash/checkpoint/출처 검증은 변경하지 않았다.
- I2: `core/assets/files.js`는 입력 Buffer를 소유 사본으로 만든 뒤 같은 `assets/files/` 디렉터리의 고유 `.asset-<UUID>.tmp`에 `wx`로 전체 바이트를 쓴다. 쓰기 성공 후 `link(stage, target)`로 최종 이름에 배타적으로 게시하고 해당 호출의 stage만 정리한다. 기존 최종 파일이 있으면 기존 regular-file/20MiB reader와 hash 검증을 유지한다. mismatch는 `ASSET_IMMUTABLE`, symlink는 `ASSET_PATH_INVALID`로 거부한다. `changeAsset`의 ledger append는 `storeOutput` 성공 후라는 기존 순서를 유지한다.
- 정상 오류의 부분 stage는 finally에서 정리되며, 실제 SIGKILL로 남은 이전 stage는 다음 호출이 삭제하지 않는다. 최종 이름으로 미완성 바이트를 게시하지 않는다. 공유 Resource writer를 asset에 적용하지 않아 Resource 8MiB와 asset 20MiB 상한은 독립적으로 유지된다.
- `docs/recovery.md`에 알려진 일반 stage 보존/읽기 무변경, 관리 이미지 stage와 명시적 동일 입력 재시도, 서로 다른 상한을 설명했다.

## RED → GREEN 증거

모든 실행 전 런타임 PATH:

```sh
export PATH=/path/to/node/bin:$PATH
```

먼저 production code를 변경하지 않고 새 회귀 두 파일을 추가했다. RED 명령:

```sh
node --test --test-reporter=tap test/view/metadata-interruption.test.js test/core/assets-interruption.test.js > /tmp/folio-final-fix-red.log 2>&1
cat /tmp/folio-final-fix-red.log
```

실제 RED 결과(이 명령의 cat wrapper exit는 0이며, 테스트 실패는 TAP 아래에 기록됨):

```text
not ok 1 - partial asset ENOSPC publishes no final copy or version, then the same public put succeeds
  error: 'Missing expected rejection.'
  expected: code: 'ENOENT'
not ok 2 - SIGKILL during asset staging leaves no version and the same public put retries without deleting the orphan
  error: 'Missing expected rejection.'
  expected: code: 'ENOENT'
not ok 5 - SIGKILL during metadata staging preserves reads and explicit refresh retries through public query
  error: 'PROJECTION_INTEGRITY_FAILURE: unsupported generation filename'
not ok 6 - metadata stages admit only known regular files; unknown names, unsafe paths and corrupt generations fail closed
  error: 'PROJECTION_INTEGRITY_FAILURE: unsupported generation filename'
# tests 6
# pass 2
# fail 4
# cancelled 0
# skipped 0
# todo 0
```

asset 실패는 4바이트가 실제 최종 경로에 남아 `readFile`이 성공한 예상 결함이다. metadata 실패는 10바이트 기록 후 자식 SIGKILL/일반 stage를 세대로 오인한 예상 결함이다. 원래 mismatch/symlink 거부와 크기 경계 테스트 2개는 RED에서도 통과했다.

수정 후 GREEN 명령:

```sh
node --test --test-reporter=tap test/view/metadata-interruption.test.js test/core/assets-interruption.test.js > /tmp/folio-final-fix-green.log 2>&1
result=$?
cat /tmp/folio-final-fix-green.log
exit $result
```

실제 결과: exit 0, 6/6 통과, fail/cancelled/skipped/todo 모두 0, 1118.683792ms.

새 회귀의 구체적 증거:

- metadata 정상 이전 세대 생성 → 선택 변경 → 별도 Node 프로세스에서 실제 임시 파일 10바이트 기록 후 실제 SIGKILL. canonical 세대 목록에 이전 1개만 존재함을 확인한다. 중단 직후 stale viewer 및 doctor가 성공하고 전체 workspace bytes/mode/inode/mtime/ctime/디렉터리 상태가 불변이다.
- 이후 공개 toolbox `folio_resource_query refresh`와 `query`가 성공하고 새 선택 revision을 반환한다. 정상 세대는 2개이며, viewer 목록/상세, static snapshot 생성, doctor가 current/ok를 반환한다. 이 순수 읽기 묶음 전후 전체 상태 불변, 고아 stage의 경로/바이트/메타데이터가 중단 직후와 동일함을 확인한다. MCP query는 원래 잠금 쓰기 경로이므로 순수 읽기 불변 비교 범위에 포함한다고 주장하지 않는다.
- 정상 stage와 unknown names, malformed UUID, stage symlink/directory/FIFO, malformed canonical JSON/canonical symlink를 구분하여 검증한다.
- asset ENOSPC는 실제 파일 4바이트 기록 후 예외를 주입한다. SIGKILL은 별도 프로세스가 공개 core `changeAsset put` 중 실제 파일 4바이트를 기록한 뒤 자신을 종료한다. 두 경우 모두 ledger history 1개/planned 유지와 최종 사본 부재를 확인한 뒤 같은 ID·expectedRev·입력 bytes를 공개 toolbox put으로 재시도한다. version 2/history 2 및 전체 실제 사본을 검증한다. SIGKILL 고아 stage는 이후에도 원래 4바이트로 남는다.
- 정확히 20MiB인 합성 SVG 사본이 성공하며 bytes가 일치한다. 20MiB+1 asset은 `ASSET_SIZE_INVALID`로 기록 없이 거부한다. 8MiB+1 공유 Resource 객체는 `RESOURCE_TOO_LARGE`이고 최종 파일이 없다.

## 연결 경로 검증

```sh
node --test --test-concurrency=2 --test-reporter=tap test/resources/*.test.js test/operations/*.test.js test/view/*.test.js test/diagnostics/*.test.js test/core/assets-*.test.js test/image/*.test.js test/server/resources-e2e.test.js test/server/view-resources.test.js test/server/managed-assets-find.test.js test/server/assets-*.test.js test/server/image-tool.test.js test/server/view-export.test.js test/server/view-export-safety.test.js test/run/assets.test.js test/run/work-lock-*.test.js test/run/commit-edit-recovery.test.js test/run/variant-locked-recovery.test.js test/run/gamebook-recovery.test.js test/run/tracking-backfill-recovery.test.js > /tmp/folio-final-fix-covering.log 2>&1
result=$?
tail -n 18 /tmp/folio-final-fix-covering.log
exit $result
```

실제 결과:

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

exit 0. 이 실행은 Resource/projection/query 경로, 전체 viewer core, doctor/restore, managed assets, 전체 image, 해당 공개 서버/stdio 및 export, work-lock과 원고·tracking recovery를 포괄한다. 전체 suite는 controller의 독립 rereview 이후 최종 gate로 남겨 중복 실행하지 않았다.

```sh
npm run lint && npm run typecheck > /tmp/folio-final-fix-typecheck.log 2>&1
git diff --check
```

두 실행 exit 0. lint stdout는 `> folio@0.0.0 lint` / `> eslint .` 이후 진단 없음. typecheck raw log에는 `> folio@0.0.0 typecheck` / `> tsc -p tsconfig.json` 이후 진단 없음. `git diff --check` 출력 없음.

## 파일 및 자기검토

변경 파일: `core/assets/files.js`, `core/projections/manifest.js`, `core/resources/immutable-stage.js`, `core/view/workspace-mode.js`, `test/core/assets-interruption.test.js`, `test/view/metadata-interruption.test.js`, `docs/recovery.md`.

자기검토로 production diff와 신규 helper/회귀 전체를 읽었다. 최종 게시가 rename 덮어쓰기를 사용하지 않으며 EEXIST hash/regular-file 검증이 유지되고, ledger append 이전에 파일 저장이 끝나는 호출 순서를 확인했다. GET/doctor에 쓰기·자동 복구·stage 삭제를 추가하지 않았다. 기존 Resource discovery 이름 규칙을 넓히지 않았고 canonical 무결성 검사를 우회하지 않았다. 원래 hash/영수증/hard/추가만 되는 기록장/자기검토/soft 비자동수정에는 변경이 없다. core 모델·네트워크 호출을 추가하지 않았다.

수정 source/test 파일 최대 102줄이며 모든 파일이 300줄 이내다. 각 helper는 알려진 관리 stage 판별 하나만 담당한다. 변경/회귀는 합성 입력만 사용하고 테스트 종료 후 fixture가 정리된다. 실제 작품·생성 결과물·scratch 보고서를 커밋하지 않는다. 원본 `/path/to/folio` 및 `/path/to/vibelore`를 변경하지 않았다. 하위 에이전트를 사용하지 않았다.

## 한계와 다음 gate

- 실제 자식 프로세스 SIGKILL을 실행했으나 전원 손실/fsync 내구성 시험은 아니다. ENOSPC는 특정 filesystem write 함수의 실제 부분 기록 후 오류 주입이며 실제 디스크를 채우지 않았다.
- 새 중단 회귀의 공개 put/query 호출은 toolbox/core 경로이고 별도 MCP wire 중단 시험이라고 주장하지 않는다. 연결 suite의 기존 실제 stdio/HTTP 회귀는 통과했다.
- 이번 수정이 로컬 파일 시스템에서의 안전한 배타적 게시를 확인하며 다른 OS/remoteFS·비협조적 외부 디렉터리 교체까지 검증한 것은 아니다.
- 이미 과거 코드가 만든 손상된 최종 사본은 계속 fail-closed로 거부한다. 정상 최종 경로를 지우거나 덮어쓰는 자동 복구를 추가하지 않았다.
- M1 static export 약 44.5초, M2 Graph chunk 기존 경고는 이번 범위 밖의 수용된 Minor이며 성능 rewrite를 하지 않았다.
- controller의 독립 재검토, fresh 전체 suite, 설치본 검증, 최종 정확 commit benchmark가 남는다. 이는 구현자가 수행한 것으로 기록하지 않는다.

참고한 원 리뷰 raw 재현: `/tmp/folio-final-review-refresh-interruption.log`, `/tmp/folio-final-review-asset-partial.log`. 새 raw 로그: `/tmp/folio-final-fix-red.log`, `/tmp/folio-final-fix-green.log`, `/tmp/folio-final-fix-covering.log`, `/tmp/folio-final-fix-typecheck.log`.
