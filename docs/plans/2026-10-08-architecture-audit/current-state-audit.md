# Folio 코드 기반 현황 검증

> 착수 시점의 조사·설계 기록이다. 이후 실제 구현과 검증은 [실행 기록](execution-report.md)을 확인한다.
검증일: 2026-10-08. 기준 코드: `d60466aaebfd95fb7bca23aed2fd33cfd4e5fa7b`,
`codex/dynamic-tracking` 작업 공간. 이 보고는 구현 완료 선언이 아니다.
사용자가 제공한 아키텍처 인계서의 결정과 현행 코드를 구분한다.

## 검증 대상과 방법

원래 체크아웃은 `feat/n3-blocks`, HEAD `0bf95e1a442a7fdfe67335324e3b6963d3e0b72e`이며
미커밋·미추적 변경 73개 항목이 있다. 최신 동적 추적 구현과 범용 설계 문서는 별도 작업 공간에 있다.
원래 체크아웃을 초기화·병합하지 않았다. Vibelore는 읽기 전용 원본이며 이번에 수정하지 않았다.
실제 이미지 실습 자료는 원래 체크아웃의 git 제외 폴더에만 존재한다.
다른 세션에서 재검증할 때 먼저 `git worktree list`로 `codex/dynamic-tracking` 위치를 찾고
그 체크아웃의 HEAD를 확인한다. 원래 dirty checkout이 이 기준 코드와 같다고 가정하지 않는다.

설치된 Superpowers 6.3.0의 using-superpowers, dispatching-parallel-agents,
writing-plans, verification-before-completion을 적용했다.
독립 harsh reviewer, 저장·실행 계약 조사자, 이미지 검증 조사자를 실제로 실행했다.
주 담당자는 전체 검증과 반례 다섯 사례를 다시 실행하고 결과를 대조했다.
구현 소스 변경·새 이미지 생성·실제 작품의 승인·외부 메시지 전송은 하지 않았다.

## 현재 구현과 목표의 대응

| 영역 | 현재 코드의 사실 | 목표와 갭 |
|---|---|---|
| 제품 | 구조 있는 집필·추적 엔진. 범용 확장은 설계 초안 | 독립 범용 Core와 분야별 Pack |
| 분야 팩 | `packs/index.js:6` novel/knowledge/sources. 그림책·동화는 novel 프리셋 | Comic/Game/Video 전용 제작·출력 미구현 |
| Core 데이터 | node/entity/asset/source와 `{kind,id,rev}` 참조 | 범용 Resource/Revision/Reference 저장 계약 미구현 |
| 추적 데이터 | 사용자 계획·대상·기준·관찰·근거·위임·보충·coverage/stale | 현재 의미는 집필용. 범용 사실 스키마로 강제하지 않아야 함 |
| 원본 | source 파일 사본, managed image 불변 사본, 이미지 URI-only | 범용 외부 참조 관측·판본 사본·정의 판본·계보 미구현 |
| 실행 | 순차 cursor, 단일 open run, 자식 대기, requestId/digest, 제한 재시도·skip | 범용 정적 DAG·일반 취소·Agentic 재계획 미구현 |
| 자율성 | 일부 auto 단계와 추적의 명시적 추가 위임 | Balanced/Strict/Autonomous 공통 정책 미구현 |
| 조회 | SQLite의 사용처/사건/등장 위치, 종류별 추적 조회 | 전문·벡터·일반 그래프 검색·혼합 검색 미구현 |
| 일관성 | 현재 파일/기록장을 다시 읽고 동기 SQL 재구성; 일부 rev stale 검출 | 공통 checkpoint·Projection manifest·판본 고정 페이지 조회 없음 |
| Wiki/Context | 집필 요청에 범위·인물·앞선 사건·자료·그림 전달 | 생성 Wiki, 사람 Wiki 보호, 범용 Context Package 미구현 |
| 관측 | run cache에 요청·응답·일부 history, 기록장에 검사·결정·영수증 | provider/prompt 버전/usage/cost/tool trace의 공통 완전성 계약 없음 |
| 인터페이스 | stdio MCP. `folio_view`는 VIEWER_NOT_BUILT | CLI/API/Studio·독자 View·일반 Export 미구현 |
| 권한 | 신뢰하는 로컬 호스트, 절대 root 검사, 관리 경로·위임 검사 | 사용자 인증·프로젝트 ACL·마스킹·삭제/보존 정책 없음 |

## 코드와 기존 테스트 근거

- `core/work/config.js:8`은 main 판본만 허용한다. `core/pack/yaml-schema.js:9`의 산출물은
  plan/draft/events/children, `core/pack/validate.js:3`은 leaf/branch다. YAML 추가만으로 범용 매체를 실행하지 못한다.
- `core/scope/scope.js:70`부터 분야별 참조를 만든다. `core/store/tree.js:95`는 현재 본문을 덮어쓴다.
  `core/store/entities.js:27`의 rev는 현재 파일 hash다. 옛 hash가 있다는 것과 옛 bytes 보관은 다르다.
- `core/assets/files.js:55`는 파일 사본 또는 URI를 받으며 URI를 다운로드하지 않는다.
  63–79행은 실제 hash와 불변 사본, 83–89행은 reference_only/changed/missing을 구분한다.
  선언 MIME은 실제 이미지 디코딩의 증거가 아니다. 현재 Folio 코드에 full decoder는 없다.
- `core/sources/add.js:26`은 외부 파일 하나를 안전하게 읽고 100–115행에서 사본과 hash를 남긴다.
  `core/store/sources.js:84`는 저장 사본을 다시 읽어 rev를 계산한다. 원래 외부 파일을 live 참조하지 않는다.
  사본 손편집의 rev 변화는 잡지만 반입 당시 bytes의 일반 판본 조회·복원은 없다.
  `test/core/sources-add.test.js:41`은 합성 비 UTF-8 파일 사본과 hash를 검증한다. PDF 파싱 검사가 아니다.
- `core/run/runner.js:126`은 단일 open run, `core/run/steps/common.js:39`는 요청 결속,
  `core/run/runner.js:177`은 누락/알 수 없는 답을 거부한다. `test/run/resume.test.js:21`과 35행은 SIGKILL 재개를 다룬다.
- `core/ledger/ledger.js:20`은 다중 프로세스 직접 append를 지원하지 않는다고 명시한다.
  `core/run/commit.js:112`부터 receipt → body → events → tracking → final commit 순서로 쓴다.
  `core/run/steps/commit-step.js:62`부터 occurrence/evidence 실패는 별도로 남기며 본문 완료는 유지한다.
  전체 파일·모든 기록장의 원자적 트랜잭션이 아니다.
- `core/util/file-tx-journal.js:11`은 tree/entities/assets 기존 파일만 복구 대상으로 허용한다.
  `core/util/file-tx.js:95`부터 복구 전 충돌을 검사한다. 이 보호가 일반 commit 복구에도 있다는 뜻은 아니다.
  `test/core/file-tx.test.js:58`, `test/core/file-tx-conflict.test.js`가 중단·수동 편집 충돌을 다룬다.
- `server/tools/find.js:54`는 사용처/사건마다 색인을 재구성한다. `core/index/schema.js:2`에는
  projection generation/checkpoint가 없다. `core/tracking/view.js:37`의 cursor는 숫자 offset이다.
  `test/core/index.test.js:63`은 성공하는 전체 재구성 동일성을 검사하며 실패 중 기존 DB 보존은 검사하지 않는다.
- `core/tracking/authority.js:5`는 활성 계획의 grantId/action을 대조한다.
  `core/tracking/replay.js:61`부터 host 교체·fixed 추가·위임 확대를 막는다.
  `source:user`는 신뢰하는 호출자의 decide 경로라는 의미이며 인간 신원 인증이 아니다.
- hash/receipt/hard/decisions 대조는 `core/run/commit.js:26`, 68행,
  자기검토는 `core/ledger/receipts.js:49`, 최종 결정론 검사는 `core/run/commit-guard.js:32`에 있다.
  `test/core/no-model-calls.test.js:43`은 Core 모델·네트워크 금지를 정적으로 검증한다.

## 새로 확인한 경계 실패

독립 리뷰의 번호와 판정을 유지한다. 세부 재현은 [harsh-review](harsh-review.md),
수용·반박은 [review-rebuttal](review-rebuttal.md)에 있다.

| 번호 | 심각도 | 실제 재현 결과 |
|---|---|---|
| H1 | High | 커밋 중단 후 새 합성 손편집이 runner 재개에서 과거 승인 본문으로 덮임 |
| H2 | High | newline 없는 정상 JSON tail을 verify가 통과시킨 뒤 append 성공 반환 후 기록장 파손 |
| H3 | High | managed asset add 후 folio_find usages가 assets.path NOT NULL 오류 |
| H4 | Medium | H3 실패 후 기존 정상 index의 nodes가 0개. 별도 중복 eventId fault도 같은 결과 |
| H5 | High | 실제 살아 있는 holder 중 시간 주입한 다른 프로세스도 work lock 진입 |
| H6 | High | afterEventsWrite 중단 뒤 final commit 없이 사건이 정상 events 조회에 노출 |

H3은 Toolbox의 실제 도구 handler 호출이며 stdio transport를 새로 거친 재현은 아니다.
H1은 실제 runner API, H6은 내부 중단 hook와 실제 find handler를 사용했다.
H2의 실제 OS 부분 쓰기 확률과 H5의 실제 장시간 부하는 측정하지 않았다.
각각 framing 손상과 동시 진입 자체는 직접 재현했다. Critical 현재 결함은 독립 리뷰에서 확정하지 않았다.

## 실행한 검증

Node 24.19.0, 로컬 macOS에서 기준 코드로 새로 실행했다.

| 검증 | 결과와 범위 |
|---|---|
| npm run check | lint/typecheck 성공, 909 tests / 909 pass / 0 fail |
| npm run examples:verify | 합성 집필·추적 공개 stdio 예제 성공 |
| npm run assets:verify | 합성 자산 stdio 승인·교체·새 승인 성공 |
| npm run package:verify | 새 tarball 설치·패키지 합성 검증 성공 |
| 이미지 담당의 집중 검사 | assets 관련 3파일 / 14 합성 테스트 통과 |
| 반례 스크립트 all | 위 H1–H6 조건 재현. managed_index 사례가 H3/H4를 함께 입증 |

기존 테스트 통과와 반례 재현은 양립한다. 원격 CI·타 OS·새 범용 계약·실제 생성 품질을
검증한 것으로 확대하지 않는다. 테스트는 합성 fixture 사본과 임시 폴더만 사용했다.

## 이전 실제 이미지 실습 재검증

자료 위치는 원래 저장소의 `.local-output/folio-image-smoke-20261004-01/`이다.
실제 원고·이미지·생성 프롬프트·MCP 기록은 이 보고에 복사하거나 커밋하지 않았다.

| 주장 | 현재 확인과 한계 |
|---|---|
| 이미지 도구 5회 | generation JSON 5개·PNG 5개·report의 횟수 일치. provider raw transport 재검증은 아님 |
| PNG 1536×1024 | Pillow full decode로 5개 PNG/RGB/해상도 확인. Folio 자체 decoder 검증은 아님 |
| A/B 일관성 | 당시 관찰·sameHost=true/independent=false 자기검토 기록 확인. 새 독립 시각 평가 미실행 |
| 노란 조끼 hard 차단 | 실제 APPROVE_BLOCKED_BY_HARD 응답과 당시 MCP 호출 확인. Folio 자동 픽셀 검출이 아님 |
| 공 폭 175→160→167 | 당시 blue-pixel bounds 근사 측정·NOT_MET 기록. 이번 영역 재측정 미실행 |
| 파일 무결성 | PNG 5개 manifest와 hash 일치, Folio 사본 4개 hash 일치 |
| 사용 위치·재접속 | 당시 attach/get/reconnect 기록 확인. 새 실제 MCP 재연결 미실행 |
| 열린 실행 교체 거부 | ASSET_RUN_OPEN과 현재 기록장 hash 불변 확인 |
| 실제 승인→교체→stale→재검사 | 미실행. 실제 assets ledger 14개에 asset_decision 0개, run awaiting_user |

`test/run/assets.test.js:13`은 합성 전체 승인→교체→stale→재검사와 본문 유지를 다룬다.
`test/server/assets-stdio.test.js:5`와 `examples/assets.js:45`는 stdio 승인·교체·새 승인까지다.
실제 사용자 승인을 시험 승인으로 대체하지 않았다.
