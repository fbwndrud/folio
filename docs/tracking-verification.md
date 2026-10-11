# 동적 추적 수용 증거

검증 범위는 합성 프로토콜·무결성이다. 실제 AI의 중요 대상 발견 정확도, 누락률,
모든 장르의 의미 검증 정확도를 인증하지 않는다. 실제 작품·생성 이미지·호스트 결과를 사용하지 않았다.

## 실행 환경과 재현

2026-10-07, 로컬 macOS·Node 24.19.0. lint·typecheck·전체 테스트 **909/909**, 네 원고·추적·자산 예제, 새 tarball 설치를 모두 통과했다. 원격 CI는 미실행이다.
[CI 설정](https://github.com/fbwndrud/linivera/blob/v0.1.0/.github/workflows/ci.yml)의 OS·Node 매트릭스는 실행 결과를 대신하지 않는다.

```sh
npm ci
npm run check
npm run examples:verify
npm run assets:verify
npm run package:verify
```

`check`가 아래 모든 실제 테스트를 실행한다. stdio 테스트와 패키지 테스트는
`node --test test/server/tracking-stdio.test.js test/server/tracking-package.test.js`로 따로 재현할 수 있다.
`examples/tracking.js`는 공개 bin과 실제 MCP stdio, inline 합성 모델 답·작가 결정을 사용한다.
추리·요리·그림책의 공통 선언과 추리 원고 채택·보충·재검토·재연결·공격 거부를 확인한다.
다른 네 원고 예제와 자산 예제는 기존 팩·자료·그림책·동화·자산 흐름의 회귀를 확인한다.

패키지 검증은 새 tarball을 별도 임시 폴더에 `--omit=dev`로 설치한다.
개발 의존성의 실제 경로가 없는지 확인하고 설치본의 공개 bin으로 모든 예제를 실행한다.
추적 안내·스킬·예제 포함과 test·plans·내부 상태·작품 출력 경로 제외도 검사한다.
의존성 설치에는 레지스트리 접근이 필요하며 원본 node_modules를 연결하지 않는다.

## A1–A20/A17b

각 행은 실제 테스트 파일과 실행되는 테스트명이다. `/`로 나열한 crash 경계는
해당 파일의 매개변수화된 개별 테스트를 뜻한다. 모든 행은 같은 최종 전체 검사에서 통과했다.

| ID | 확인한 행동 | 실제 테스트 파일 · 이름 | 결과 |
|---|---|---|---|
| A1 | 추리·요리·그림책 공통 규약 | [test/tracking/plan.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/plan.test.js) — `declared plans support arbitrary mystery, cookbook and picturebook kinds and default denied delegation`<br>[test/server/tracking-stdio.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/server/tracking-stdio.test.js) — `public stdio tracking flow preserves prose, hides candidates, separates coverage and reconnects` | PASS · check 909/909 |
| A2 | 새 대상 종류와 선언형 기준 | [test/tracking/candidates.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/candidates.test.js) — `candidate criteria allow declared arbitrary kinds and effective rev equals canonical plan normalization` | PASS · check 909/909 |
| A3 | 계획 버전·결정·위임·재연결 | [test/tracking/change.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/change.test.js) — `initial plan is only canonical after explicit approval; reconnect and duplicate refuse`<br>[test/tracking/plan.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/plan.test.js) — `new user decision can revoke permission while history and semantic revisions remain stable`<br>[test/server/tracking-stdio.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/server/tracking-stdio.test.js) — `public stdio tracking flow preserves prose, hides candidates, separates coverage and reconnects` | PASS · check 909/909 |
| A4 | 위임 안의 추가와 변경 거부 | [test/tracking/change.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/change.test.js) — `host additions preserve source, require current grant and reject replacement/fixed/modification` | PASS · check 909/909 |
| A5 | 후보 가상 정의와 확정 전 비공개 | [test/run/tracking.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking.test.js) — `discoveries validate events against virtual definitions and expose full data in review with bound refs` | PASS · check 909/909 |
| A6 | 수정·폐기 후보 비활성 | [test/run/tracking.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking.test.js) — `draft revision abandons provisional definitions and extracts against the new hash`<br>[test/run/tracking.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking.test.js) — `skipping a reviewed draft abandons all provisional metadata` | PASS · check 909/909 |
| A7 | ID·이름·별칭 충돌 | [test/tracking/candidates.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/candidates.test.js) — `collisions across legacy and managed IDs/names/aliases reject without autoload`<br>[test/tracking/subjects.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/subjects.test.js) — `canonical managed merge rejects every ID/name/alias collision and retains history after rewrite` | PASS · check 909/909 |
| A8 | 관점·주장·추론·관계 값 | [test/tracking/candidates.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/candidates.test.js) — `entity and entity-list values require known entity IDs; attributed perspectives persist`<br>[test/tracking/candidates.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/candidates.test.js) — `fixed explicit mismatch is an unconditional lock; attributed and inferred remain distinct` | PASS · check 909/909 |
| A9 | 정확한 인용·타입과 batch 거부 | [test/tracking/candidates.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/candidates.test.js) — `observation and discovery evidence reject wrong hash/node, missing, ambiguous or oversized quotes`<br>[test/tracking/candidates.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/candidates.test.js) — `observations validate known subjects, criteria, applicable kinds and references atomically` | PASS · check 909/909 |
| A10 | 검사 후 후보·계획 바꿔치기 거부 | [test/run/tracking-ref-locks.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-ref-locks.test.js) — `full candidate refs reject subject tampering even when observation snapshot is identical`<br>[test/run/tracking.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking.test.js) — `a changed or deleted candidate after model review is rejected before approval is recorded`<br>[test/run/tracking.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking.test.js) — `same-content plan grant renewal drops the old answer and preserves the draft for fresh extraction` | PASS · check 909/909 |
| A11 | 확정 crash 경계와 정확히 한 번 활성화 | [test/run/tracking-commit.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-commit.test.js) — `tracking commit recovers exactly once after afterReceiptWrite / tracking commit recovers exactly once after afterBodyWrite / tracking commit recovers exactly once after afterEventsWrite / tracking commit recovers exactly once after afterTrackingWrite / tracking commit recovers exactly once after afterCommitWrite`<br>[test/run/tracking-backfill.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-backfill.test.js) — `backfill recovers durable records after afterReceiptWrite, including feature off / backfill recovers durable records after afterTrackingWrite, including feature off` | PASS · check 909/909 |
| A12 | 기록장 hash·head·링크·변조 | [test/tracking/plan.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/plan.test.js) — `append-only replay detects modified ledger bytes and truncation through recorded heads`<br>[test/tracking/integrity.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/integrity.test.js) — `events ledger refuses symlink jsonl for read and append / events ledger refuses symlink head for read and append / tracking ledger refuses symlink jsonl for read and append / tracking ledger refuses symlink head for read and append`<br>[test/tracking/integrity.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/integrity.test.js) — `deleting the entire tracking ledger is rejected even with feature off` | PASS · check 909/909 |
| A13 | 동일 expectedRev CAS 한 건 성공 | [test/tracking/change.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/change.test.js) — `two pre-existing proposals have a single CAS winner, including unchanged plan content` | PASS · check 909/909 |
| A14 | 앞 장면 원문 유지와 다음 payload 근거 | [test/run/tracking-stale.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-stale.test.js) — `first scene backfill reaches third payload with provenance and pending node ranges`<br>[test/run/tracking-backfill.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-backfill.test.js) — `backfill dispatch reconnects without generating or rewriting prose and preserves legacy ledgers`<br>[test/server/tracking-stdio.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/server/tracking-stdio.test.js) — `public stdio tracking flow preserves prose, hides candidates, separates coverage and reconnects` | PASS · check 909/909 |
| A15 | 원문·기준 drift·재시도·멱등 복구 | [test/run/tracking-backfill.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-backfill.test.js) — `backfill refuses original hash drift at start / backfill refuses original hash drift at resume / backfill refuses original hash drift at write`<br>[test/run/tracking-backfill.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-backfill.test.js) — `plan changes reject pending answers and re-extract under the current plan`<br>[test/run/tracking-backfill.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-backfill.test.js) — `same committed text and criteria reuse receipt and batch; checked-empty is durable`<br>[test/run/tracking-backfill-recovery.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-backfill-recovery.test.js) — `A to B to A publishes a new current snapshot instead of reusing historical A` | PASS · check 909/909 |
| A16 | 명시 checked·관찰0·부분 coverage | [test/tracking/coverage.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/coverage.test.js) — `explicit checked-empty completes while unchecked criteria remain pending`<br>[test/tracking/coverage.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/coverage.test.js) — `late criterion applies only to its selected node and leaves other criteria coverage complete` | PASS · check 909/909 |
| A17 | hard 비활성·완료 차단, advisory 원문 유지 | [test/run/tracking-backfill.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-backfill.test.js) — `hard findings store a failed receipt without activating a batch; advisory never revises`<br>[test/tracking/coverage.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/coverage.test.js) — `hard discovery is blocked in get status and payload without activating its catalog or batch` | PASS · check 909/909 |
| A17b | 고정 explicit 충돌의 불가역 잠금 | [test/tracking/candidates.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/candidates.test.js) — `fixed explicit mismatch is an unconditional lock; attributed and inferred remain distinct`<br>[test/run/tracking-commit.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-commit.test.js) — `legitimate historical fixed observations survive a later user value decision`<br>[test/tracking/plan.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/plan.test.js) — `only a new user decision may update the expected value of an existing fixed criterion` | PASS · check 909/909 |
| A18 | 관찰 변경 stale와 coverage 분리 | [test/run/tracking-stale.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-stale.test.js) — `changed observation stales dependent later node; identical backfill and recheck resolve only tracking stale`<br>[test/run/tracking-stale.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-stale.test.js) — `recheck fresh tracking refs leaves pending coverage visible in status when feature false`<br>[test/run/tracking-stale.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-stale.test.js) — `feature-off recheck cannot erase recorded tracking review needs` | PASS · check 909/909 |
| A19 | 기존 원고·지식·자료·자산·rename·off 회귀 | [test/run/tracking.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking.test.js) — `old no-plan host and feature false preserve the old extract envelope and can commit`<br>[test/server/knowledge-init.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/server/knowledge-init.test.js) — `folio_init makes a textbook work from the knowledge pack preset`<br>[test/server/sources-tool.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/server/sources-tool.test.js) — `folio_sources: add, list, get, link — a wrong quote in link records nothing; an edited body makes the link stale`<br>[test/run/assets.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/assets.test.js) — `asset scope is sent to the host; replacement marks the original stale and a new recheck clears it without rewriting prose`<br>[test/core/rename-apply.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/core/rename-apply.test.js) — `receipts, decisions and events ledgers stay byte-identical after an apply`<br>[test/tracking/integrity.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/integrity.test.js) — `deleting the entire tracking ledger is rejected even with feature off` | PASS · check 909/909 |
| A20 | 공개 stdio와 새 tarball omit-dev 설치 | [test/server/tracking-stdio.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/server/tracking-stdio.test.js) — `public stdio tracking flow preserves prose, hides candidates, separates coverage and reconnects`<br>[test/server/tracking-package.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/server/tracking-package.test.js) — `fresh tarball without dev dependencies completes the public tracking stdio flow` | PASS · check 909/909 |

## 최종 검토 수정 회귀

최종 수정 후 `npm run check`는 lint·typecheck와 전체 **909/909** 테스트를 통과했다.
`npm run examples:verify`, `npm run assets:verify`, `npm run package:verify`도 exit 0이다.
예제는 `synthetic:true`, `verified:true`, `outputsRetained:false`를 반환했고,
패키지는 새 tarball의 `--omit=dev` 설치본과 공개 bin으로 같은 흐름을 확인했다.

| 지적 | 실제 회귀 · 실행 경계 | 결과 |
|---|---|---|
| I1 / A18 | [test/run/tracking-stale.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-stale.test.js) — `first observation in a checked-empty source stales its dependent until recheck, including deletion and unchanged retries`<br>`first observation linked only by value stales a person-only dependent`<br>`first observation linked only by perspective stales a person-only dependent` | PASS · check 909/909 |
| I2 / A15·A17 | [test/run/tracking-backfill-recovery.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/run/tracking-backfill-recovery.test.js) — `success after an intervening hard failure records a fresh receipt and clears blocked coverage` | PASS · check 909/909 |
| I3 / A4·A16 | [test/tracking/change-coverage.test.js](https://github.com/fbwndrud/linivera/blob/v0.1.0/test/tracking/change-coverage.test.js) — `decide subject addition returns the same pending catalog coverage as an immediate get`<br>`apply subject addition returns the same pending catalog coverage as an immediate get` | PASS · check 909/909 |
| M1 / A20 | [examples/tracking.js](../examples/tracking.js) 연결을 try 안에 두고 close·stderr 단언과 삭제를 nested finally로 분리한 제어 흐름 검토. 기존 실제 stdio·예제·설치본 실행으로 정상 경로 확인 | PASS · examples/package |

I1은 미래 관점·관계 값을 미리 알 수 없어 관련 known entity가 있는 검사에 모든 유효 checked
원천 snapshot을 보수적으로 묶는다. 같은 의미의 반복 보충은 운영 seq·receipt·authority가 달라도
stale 원인이 되지 않는다. 실제 의미 변화로 검토 범위가 넓어질 수 있다.

## 한계와 검토 상태

MCP SDK·실행기·팩·기록장·원문 hash·영수증·잠금은 실제 구현을 사용한다.
모델 응답만 미리 작성한 합성 입력이며 실제 작가 결정은 실습에서 별도로 받아야 한다.
전원 손실·손상 파일 시스템·대규모 성능·실제 생성 제공자와 이미지 품질은 확인하지 않았다.
그림 생성은 호스트의 역할이며 이 구현은 대상 ID와 검토 데이터, 자산 기록과 연결한다.
tracking false도 이미 기록한 무결성·pending·검토 필요를 지우지 않는다.
8개 작업의 독립 검토와 전체 변경 검토를 수행했다. 최종 수정 I1·I2·I3·M1은 독립 재검토에서
모두 해결로 확인했고 새 결함과 열린 지적은 없었다. 커밋 후 컨트롤러의 새 전체 검사도
lint·typecheck·909/909 테스트를 통과했다. 브랜치 `codex/dynamic-tracking`과 작업 폴더는 검토용으로 보존한다.
push·publish·원격 CI 실행은 하지 않았다.
