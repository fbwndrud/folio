# 첫 단계 종합 리뷰 및 보완

2026-10-08. 독립 reviewer `final_architecture_critic`, `gpt-6-astra`가
`740e0c6..1d2fcb3` 전체 변경의 주요 구현 구간과 경계를 검토했다.
모든 문서·패키지·시험 diff를 줄 단위로 전수 검토했다고 주장하지 않는다.
실제 설치된 Superpowers 종합 리뷰 절차이며 구현자가 자기검토한 것을 대신 쓰지 않았다.

초기 판정: **With fixes**, Critical 0, Important 2. 두 Important를 Accepted로 판정했다.

| 지적 | 근거와 영향 | 보완 방향 | 최종 상태 |
|---|---|---|---|
| 최종 경로 wx 직접 쓰기의 부분 파일 | 당시 core/resources/files.js:26. ENOSPC로 부분 bytes를 남기는 메모리 I/O 주입 뒤 동일 요청 재시도는 integrity failure. 여러 immutable 요청/결과/영수증/Projection 복구에 영향 | 같은 디렉터리 temp 완성 뒤 exclusive link로 공개, 기존 충돌 보존 | 해결·재검토 완료 |
| stale lock takeover 경쟁 | 당시 core/run/work-lock.js:35. A/B가 dead lock을 본 뒤 B가 A의 live lock을 rename하는 창에 C가 진입하는 메모리 순서 제어 재현. 기준 버전에도 있었지만 H5와 신규 transaction을 깨뜨림 | 최초 획득·복구·반환에 동일 배타 프로토콜 | 해결·재검토 완료 |
| cost:null 관측표기 | Task9 비차단 Minor. unknown 비용과 unavailableFields가 불일치 | nullish 조건 통일 | 해결·재검토 완료 |

위 재현은 read-only 메모리 I/O 주입이며 실제 OS 다중 프로세스 시험을 대신하지 않는다.
보완 단계에는 실제 프로세스 중단·경쟁 및 동일 요청 재시도를 추가한다.

컨트롤러는 기존 builtin SQLite의 짧은 BEGIN IMMEDIATE gate로 파일 잠금의
획득·dead 복구·반환을 직렬화하도록 결정했다. 긴 작업 callback 전체를 DB transaction에 넣지 않는다.
비용: 별도 gate control file, bounded busy 오류, 손상 시 fail closed.
혼합된 옛 unsafe writer 프로토콜과 공유 네트워크 파일시스템 안전성은 보장하지 않는다.
정전 fsync 내구성으로 확장하지 않는다.

실행 입력 exact 판본, 현재 위임과 역사 retry 분리, 승인 전 노출 차단,
Projection의 정본 재검증, 잠금 밖 모델 추론 및 publish 시 checkpoint 재검증은
종합 리뷰에서 강점으로 확인했다. 실제 Google 추론과 전체 테스트는 reviewer가 재실행하지 않았다.

한 명의 별도 구현자에게 전체 지적을 함께 맡겼고, 수정 후 새 독립 scoped review를 수행했다.
최종 수정·검증·판정은 아래 이어 기록한다.

## 첫 보완 재검토

`final_recovery_rereview`(별도 gpt-6-astra)가 `1d2fcb3..d093da5`를 검토했다.
기존 두 Important, trace Minor, 추가 immutable read/write 8MiB 상한은 모두 ADDRESSED다.
다만 새 Important: 다른 프로세스가 gate에서 잠시 중지되면 release도500ms뒤 포기하여
작업을 마친 살아 있는 소유자의 file lock이 영구 잔류했다. 실제 OS child로 재현했다.
전체1009개 통과만으로 이 새 경우를 해결했다고 쓰지 않는다.

같은 보완 구현자를 재개했다. 획득의 bounded busy와 소유자의 release cleanup 정책을 분리한다.
release는 busy일 때 비동기로 기다려 gate 재개/종료 후 완료하며 손상은 여전히 fail closed다.
비용: 살아 있는 gate 소유자가 멈춰 있으면 종료 응답이 대기할 수 있다.
Superpowers의 기본 한 번 final wave 권고를 넘어선 추가 보완이다. 이미 승인된 필수 수정의
완료를 우선하여 알려진 회귀를 남기지 않기로 했고, 새 범위도 별도 독립 재검토를 마쳤다.

## 최종 보완 재검토 및 수용

추가 보완 커밋 `d8f4d69`는 acquisition의 500ms 상한을 유지하며 owner release만
busy gate가 재개되거나 종료될 때까지 비동기로 기다리게 했다.
별도 reviewer `rereview_release_cleanup`(gpt-6.1-sol)은 해당 범위만 재검토했다.
판정 **ADDRESSED**, 새 Critical/Important/Minor 없음. 독립 집중 시험14/14 통과.

근거: `core/run/lock-gate.js`의 release-only 대기와 `core/run/work-lock.js`의 반환 경로,
`test/run/work-lock-gate.test.js`의 실제 프로세스650ms 중지 시험.
다른 프로세스가 gate에서 멈춰 있을 때 기존 소유자는 반환 대기·잠금 보존,
재개 뒤 경쟁자는 WORK_LOCKED, 소유자는 정상 정리, 다음 작업은 성공했다.
이 리뷰는 첫 종합 지적 네 건을 다시 검토하거나 전체 검사를 실행한 리뷰가 아니다.

컨트롤러 최종 소스 `d8f4d69` 확인: lint/typecheck와 tests1010/1010 통과,
examples:verify/assets:verify/package:verify 모두 exit0.
고정 Google embeddinggemma-2를 사용한 실제 stdio MCP도 재실행하여
128D 빨강/파랑 질의 각각 대응 이미지 우선, freshness=current, 원본 버전 근거를 확인했다.
주요 열린 지적은 없다. 미래 DAG/Graph/Wiki/Studio/다중 사용자 구현이나
정전 내구성·모든 OS·실제 작품 검색 품질을 이 판정으로 보장하지 않는다.
