# Folio 첫 범용 구현 실행 기록

작성일: 2026-10-08. P0/P1과 T11 구현, 독립 종합 리뷰, 보완 재검토와 최종 수용 검증을 마쳤다. 전체 플랫폼 완료 선언이 아니다.
사용자가 승인한 P0/P1 최소 수직 슬라이스와 Google 멀티모달 임베딩 확장을 수행한다.
후속 DAG·Graph·Wiki·Studio·원격 다중 사용자 단계는 이번 구현 범위 밖이다.

## 작업 환경과 검증 방식

- 기존 managed worktree의 `codex/dynamic-tracking` 브랜치를 재사용했다.
- 구현 기준 커밋 `740e0c6`; 직전 설계 조사 `08c43e8`.
- 원래 dirty checkout과 읽기 전용 Vibelore를 구현 대상으로 사용하지 않았다.
- 실제 설치된 Superpowers 6.3.0의 task별 구현 → 독립 리뷰 → 수정 재검토 흐름을 사용했다.
- 구현자는 `gpt-6.1-sol` 또는 작은 작업의 `gpt-6-sol`, 리뷰어는 별도 에이전트다.
- 로컬 검증 환경은 macOS, Node 24.19.0. 합성 fixture만 사용했다.
- 기준 검사: lint/typecheck와 909/909 tests 통과.
- 표의 전체 검사 수는 각 단계의 최종 코드 기준이다. 최종 종합 검사는 별도로 기록한다.

## 완료한 작업과 실제 리뷰

| 작업 | 마지막 커밋 | 전체 tests | 독립 판정 |
|---|---|---:|---|
| T1 중단 복구 편집 보호 | `649bc0c` | 943 | review_commit_recovery 후 3회 수정, rereview_legacy_commit 승인 |
| T2 기록장 framing | `03516dc` | 948 | review_ledger_framing, 실제 kill 추가 후 rereview_ledger_kill 승인 |
| T3 관리 자산 SQL | `c8b54a0` | 950 | review_managed_asset_index 승인 |
| T4 안전한 index 교체 | `cacbfaf` | 955 | review_index_generation 승인 |
| T5 살아 있는 writer 잠금 | `887fe44` | 962 | review_live_writer_lock 후 PID 수정, rereview_pid_probe 승인 |
| T6 완료된 발행만 사건 노출 | `30932a0` | 967 | review_event_publication 승인 |
| T7 불변 자원·원본 선택 | `f7d08c5` | 974 | review_resources_revisions 후 action 복사 수정, rereview_source_action 승인 |
| T8 고정 입력·위임 | `4d4c130` | 982 | review_pinned_policy 후 exact 판본·예산 수정, rereview_exact_grants 승인 |
| T9 단일 호스트 실행·발행 | `c40587b` | 987 | review_generic_publication 승인, trace null 비용 표시는 최종 보완에서 해결 |
| T10 MCP·판본 조회 | `c229cdb` | 989 + 문서 회귀 | review_resource_mcp_query와 portable skill 수정 후 rereview_portable_resource_skill 승인 |
| T11 선택 원본 벡터·모델 어댑터 | `0e06f29` | 998 | 8MiB base64 경계 수정 포함 review_multimodal_vectors 승인 |

모든 Critical/Important 지적은 코드 또는 재현 근거로 수용·수정한 뒤 별도 재검토를 받았다.
리뷰어가 전체 테스트를 반복 실행한 것으로 쓰지 않는다. 구현자의 실제 출력과 diff를 검토했다.

## 중요한 구현 판정

- 중단 복구는 최초 영수증·전체 파일 before/after hash를 불변 intent에 보관한다.
  중단 뒤 사람이 바꾼 원고를 새로운 baseline으로 삼아 덮어쓰지 않는다.
- 불완전 legacy intent는 현재 파일을 덮어쓰기보다 충돌로 남긴다.
  이유 있는 skip과 추가 전용 abandonment 기록으로 안전하게 새 작업을 시작할 수 있다.
- 완전한 JSON tail에는 다음 append 앞 separator를 붙인다. 잘린 JSON·잘못된 head는 쓰기 전에 거부한다.
- index는 별도 후보 DB를 검증·닫은 뒤 교체한다. 실패 시 기존 DB를 삭제하지 않는다.
- 잠금은 TTL이나 시계 차이로 살아 있는 PID에서 빼앗지 않는다. ESRCH만 죽은 PID의 근거다.
- 준비된 receipt-linked 사건·retraction은 exact 최종 발행 표시 전까지 활성화하지 않는다.
  실제 영수증 없이 receiptId를 갖던 합성 seed는 진짜 unlinked legacy fixture로 수정했다.
- generic Resource 등록 후보와 사용자 원본 선택은 다르다. 선택 해제에도 marker 판본을 보존한다.
- 입력은 정확한 자원·세 정의·선택 marker·workspace checkpoint·보관 bytes에 묶인다.
  예산은 자료와 세 정의의 관측 bytes 합이며 외부 참조 길이는 unknown이다.
- 위임은 actor/action/scope/policy/profile/pipeline exact 판본·정의 hash·만료·철회에 묶인다.
  원본 선택·위임 관리는 user 전용이며 문서 명령문이 위임을 만들지 않는다.
- 신규 발행 직전 같은 잠금 안에서 현재 policy/위임을 확인한다. 과거 입력 봉인이 현재 권한을 대신하지 않는다.
- 이미 끝난 발행의 exact retry는 역사 이력이다. 이후 철회가 과거 이력을 지우지 않는다.
- 단일 호스트 검토는 항상 selfReview로 표시한다. 비용·내부 추론을 관측하지 못하면 unknown/unavailable다.

## 실패 재현과 검증 한계

T2는 실제 child SIGKILL 뒤 살아 있는 parent가 기록장을 다시 열어 append했다.
T9는 marker 전후 실제 child SIGKILL과 새 프로세스의 복구를 확인했다.
프로세스 중단 시험은 정전·파일시스템 fsync 내구성 보장과 다르다.

T4는 macOS에서 기존 열린 reader와 신규 reader, 교체 실패 EPERM 보존을 검증했다.
실제 Windows에서 열린 DB 교체는 미검증이다. 정상 교체 성공을 모든 OS에 보장하지 않는다.
잠금 밖에서 직접 파일을 고치는 외부 프로그램과의 원자적 조정도 보장하지 않는다.

T6 전체 검사 중 stopped-owner 시험의 readiness 신호 순서 문제가 한 번 드러났다.
SIGTERM listener 등록 뒤 ready를 보내도록 시험을 수정했고, 집중 20회와 최종 전체 검사를 통과했다.
실패를 단순 재시도로 숨기지 않았다.

actor=user와 authority.attested는 신뢰하는 로컬 caller의 명시적 인간 결정 진술이다.
사용자 인증·서버 ACL·원격 다중 사용자 보안을 제공한다는 뜻이 아니다.
외부 reference-only 입력은 실제 bytes 보관·완전한 byte budget 집행을 주장하지 않는다.
모델 내부 비공개 추론과 비결정적 AI 결과의 완전 재현도 제공하지 않는다.

## Google 모델 사전 실험

2026-10-08 공식 출시 기록과 모델 카드로 `google/embeddinggemma-2`를 확인했다.
고정 revision은 `914f7f89142e33e77833254d9c9b90c3cef7303b`이다.
CPU float32로 실제 로드했고 기본 768차원 유한 벡터를 확인했다.
합성 빨강/파랑 사각형 이미지 2개에 대응하는 텍스트 질의는 각 대응 이미지를 먼저 찾았다.
사전 실험을 통합 완료 근거로 대신하지 않고 아래 실제 Folio 시험도 수행했다.
실제 작품이나 생성 이미지는 커밋하지 않았다.

근거: [Google 출시 기록](https://ai.google.dev/gemma/docs/releases),
[모델 카드](https://huggingface.co/google/embeddinggemma-2),
[공식 멀티모달 사용 안내](https://ai.google.dev/gemma/docs/embeddinggemma/multimodal-embeddinggemma-with-sentence-transformers).

## MCP 연결 및 배포 문서 검증

T10은 metadata generation과 기존 13개 뒤의 신규 MCP 5개 도구를 연결했다.
실제 stdio에서 복수 결과·후보/준비/거부 결과 제외·판본 변경·과거 조회·손상 거부를 검증했다.
스킬만 복사하는 설치 방식에서 새 필수 문서 링크가 끊기는 결함도 재현·수정했다.
초기 리뷰의 package 포함으로 해소된다는 판정을 독립 리뷰어가 Important로 정정했고, 수정 후 별도 재검토를 받았다.

## 실제 Folio 모델 통합 수용

고정 Google 모델·오프라인 CPU float32로 실제 adapter와 stdio MCP를 각각 실행했다.
768D의 합성 text/image index와 search가 실행되었고 이미지끼리의 순위는 맞았다.
혼합 corpus에서는 텍스트가 이미지보다 높은 점수를 받아 전체 검색 품질을 보증하지 않는다.
최종 input policy를 포함한 실제 stdio128D MRL 시험에서는 다음 순위를 확인했다.

| 합성 질의 | 대응 이미지 | 다른 이미지 |
|---|---:|---:|
| a red square | 0.879021 | 0.832864 |
| a blue square | 0.882774 | 0.841843 |

두 응답은 current checkpoint seq2와 실제 원본 revision/content hash/selection marker를 반환했다.
최종 profileDigest `sha256:6508145424da07d920bdbb43e9e26e0346e11342102af5d5333cb4327c4514f7`.
9000회 반복한 합성 텍스트는 실제 worker가 EMBEDDING_TEXT_TOO_LONG으로 거부했다.
자동 truncation 없이 prefix+token reserve와 8192/runtime 한도, 1600만 image pixels,
선택 원본100개 pre-read gate를 적용한다. 이 정책도 profile에 결속한다.
실제 smoke 로그는 로컬 임시 경로에 보관했으며 벡터·이미지·작품 결과물은 커밋하지 않았다.

첫 stdio 실험에서 테스트 SDK 기본 환경이 Python 설정을 전달하지 않아 runtime unavailable였다.
배포 환경 변수를 명시해 실제 모델 실행을 성공시켰고, 설치 문서에도 설정 방법을 기록했다.

허용된 최대8MiB base64 업로드에서 반복 regexp의 stack 오류도 실제 재현했다.
선형 canonical decode/reencode 검증으로 수정하고 최대 크기 등록·읽기·hash 및 invalid/padding/초과 회귀를 통과했다.

벡터는 선택된 owned text/JSON/raster 원본만 다룬다. 승인 결과 색인과 audio/video 추론은 후속이다.
미관측 URI 자동 fetch와 원본 자동 선택/승인 기능은 없다. core는 모델·네트워크를 부르지 않는다.
선택 Python 환경·고정 가중치 캐시가 필요하며 기본 집필·metadata 기능은 모델 없이 유지된다.

## 종합 검토·최종 검증

종합 리뷰의 Important 두 건과 후속 재검토에서 발견한 release 경합 한 건을 모두 수용·수정했다.
첫 보완 `d093da5`: 불변 객체를 완성된 임시 파일에서 exclusive link로 공개하고,
잠금 획득·죽은 소유자 복구·반환을 짧은 SQLite gate로 직렬화했다.
공통 8MiB 쓰기 상한과 trace.cost의 null 관측 표기도 함께 수정했다.
독립 `final_recovery_rereview`는 위 네 항목을 ADDRESSED로 판정했으나,
실제 OS 프로세스로 release의 500ms 포기가 살아 있는 소유자 잠금을 남기는 새 Important를 발견했다.

추가 보완 `d8f4d69`: 획득은 500ms 상한을 유지하고 소유자 반환만 gate의 재개/종료까지
비동기로 기다린다. 손상은 계속 fail closed다. 별도 `rereview_release_cleanup`은
새 지적 ADDRESSED, 추가 지적 없음으로 판정했고 집중 시험14/14를 직접 실행했다.
기본 SDD final wave 한 번 규칙을 넘긴 이유와 범위는 [최종 리뷰](final-review.md)에 기록했다.
이 후속 리뷰가 전체 변경을 다시 전수 검토했다고 주장하지 않는다.

컨트롤러가 최종 소스 `d8f4d6911540d767864580abf6feb31d3ed3ca25`에서 새로 확인했다.

| 최종 검사 | 실제 결과 |
|---|---|
| npm run check | lint/typecheck 통과, tests 1010/1010, 실패·skip 0 |
| examples:verify | 합성 예제와 tracking 검증 exit0 |
| assets:verify | 합성 자산 검증 exit0 |
| package:verify | tarball 설치, 개발 의존성 없이 검증 exit0, 289 entries |
| 실제 모델 stdio MCP 재실행 | CPU float32, 128D, 빨강/파랑 질의 각각 대응 이미지 1위, freshness=current |

최종 모델 재실행은 위와 같은 고정 모델 revision·profileDigest를 반환했다.
current checkpoint seq2와 각 원본의 revision/content hash/selection marker가 유지됐다.
이는 연결·무결성·작은 합성 검색 수용 시험이며 장르별 검색 품질이나 성능 목표 달성 선언이 아니다.

원래 checkout은 HEAD `0bf95e1`, dirty 항목73개를 그대로 보존했다.
구현 브랜치 `codex/dynamic-tracking`과 managed worktree를 유지한다.
이번 계획의 임시 SDD 작업 폴더만 최종 기록을 커밋한 뒤 정리하며,
아래 판정·비용과 리뷰 근거는 저장소 문서에 남긴다.

## 수행 중 내린 판정과 비용

시간순이다. 당시 ledger의 Ruling 및 이에 준하는 budget 판정을 모두 보존했다.
비용은 선택의 제약 또는 판단이 틀렸을 때 재검토할 부분이다.

| 순서 | 판정 | 비용·제약 |
|---|---|---|
| 1 | 승인된 P0/P1와 T11을 첫 구현 범위로 수행 | DAG/Wiki/원격 등 전체 플랫폼은 후속 |
| 2 | Google 임베딩은 core 밖 선택 어댑터로 추가 | Python 환경·모델 캐시 설치 필요 |
| 3 | 계획 제목 Tn을 Task N으로 정규화 | 요구사항은 유지, 스크립트 호환 형식 의존 |
| 4 | 300줄 규칙을 따라 책임별 파일 분리 | 파일 수 증가, 과도한 분리는 재검토 |
| 5 | 중단 뒤 인간 편집 덮어쓰기 시험을 충돌·보존으로 변경 | 이전의 위험한 복구 동작 변경 |
| 6 | 영수증/intent 권위 없는 committing cache는 차단·이유 있는 skip | 불완전 legacy 작업은 새 결정 필요 |
| 7 | 최초 영수증과 runId를 append-only intent에 보관 | intent 크기·형식 복잡도 증가 |
| 8 | 미해결 legacy intent는 재캡처 차단, 명시적 abandonment로 새 작업 허용 | 보수적 차단과 추가 사용자 판단 |
| 9 | 허위 receiptId 합성 seed를 진짜 unlinked fixture로 수정 | 실제 근거 없는 receipt-linked 이력은 노출 차단 |
| 10 | T6 검증 중 T5 시험의 SIGTERM readiness 순서 수정 | 작업 경계를 넘는 시험 변경, production lock 변경 없음 |
| 11 | 원본 선택·해제는 user 진술과 marker 판본으로 관리 | 로컬 attestation은 사용자 인증이 아님 |
| 12 | 위임은 선택된 profile/pipeline/policy 정확한 판본과 hash에 결속 | 정의·판본 변경 시 새 위임 필요 |
| 13 | 입력 예산은 자료와 세 정의의 관측 bytes 합 | 더 엄격한 예산, 외부 미관측 bytes는 incomplete |
| 14 | 짧은 SQLite 잠금 gate와 완성 temp의 exclusive 공개 사용 | gate 파일·busy·손상 차단, 혼합 구버전 writer/원격 FS/fsync 보장 제외 |
| 15 | 알려진 필수 회귀를 남기지 않고 SDD final wave 추가 보완 | 멈춘 live gate 소유자 동안 반환 응답 대기 가능, 추가 리뷰 비용 |
