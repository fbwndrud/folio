# Folio 리뷰 반박과 수용 판정

> 착수 시점의 조사·설계 기록이다. 이후 실제 구현과 검증은 [실행 기록](execution-report.md)을 확인한다.
검증일: 2026-10-08. 독립 리뷰에 대한 주 담당자의 설계 판정이다.
Rejected는 코드·실험으로 반박되는 주장에만 사용한다. 계획에 해결책을 적었다는 이유로
현재 결함을 해결됐다고 판정하지 않는다. 수정은 이번 조사에서 실행하지 않았다.

## 현재 결함과 설계 갭의 판정

| 번호 | 판정 | 근거와 반박 범위 | 후속 |
|---|---|---|---|
| H1 | Accepted | 주 담당자가 실제 runner 재개로 새 합성 편집 소실 재현. 영수증 결속으로 대상 파일 CAS를 대체할 수 없음 | P0 write intent·충돌 보호 |
| H2 | Accepted | verify 정상 → append seq2 → verify 파손 재현. OS에서 tail 발생 빈도는 미측정 | P0 framing 보완·부분 tail 실험 |
| H3 | Accepted | add 설명서 후 실제 find handler가 NOT NULL 오류. managed subject 수정은 asset 불일치를 고치지 않음 | P0 저장 종류·선택 경로 |
| H4 | Accepted | 기존 nodes=11이 실패 후 0. 정본 손실까지 입증한 것은 아니므로 reviewer의 Medium 유지 | P0 generation 교체·실패 보존 |
| H5 | Accepted | 살아 있는 실제 holder와 별도 자식 동시 진입. 실제 장시간 경쟁 손상까지 측정한 것은 아님 | P0 단일 기록자 보호 |
| H6 | Accepted | final commit 없는 event 조회를 재실행. 승인된 본문 기록이 있어도 발행 완료와 다름 | P0 이벤트/retraction 가시성 |
| H7 | Accepted | current SQL에는 checkpoint 없음. 단일 DB를 쓴다는 사실만으로 파생 계층 판본 정합성이 생기지 않음 | P1 manifest·Query 계약 |
| H8 | Accepted | tracking 추가 위임은 범용 Policy가 아님. 다중 사용자 인증이 현재 구현됐다는 증거도 없음 | P1 로컬 최소 정책, 원격 전 별도 인증 |
| H9 | Accepted | reference_only는 올바른 부분 지원. Hybrid 목표에 필요한 관측 상태 계약은 새 기능 | P1 unknown·관측·snapshot 구분 |
| H10 | Accepted | 부가 기록 실패를 허용한 기존 결정은 존중. 범용 관측 완전성은 별도 durable 상태가 필요 | P1 bounded observability |

H1–H6는 확장보다 먼저 해결한다. H7–H10은 수정된 설계의 수용 조건이며 구현 완료 상태가 아니다.
기존 테스트 909개 통과를 이 반례의 반박으로 사용하지 않았다.

## 인계서의 Critical 및 High 가설 판정

| 가설 | 판정 | 구체적인 이유와 실험 |
|---|---|---|
| 범위 과대·책임 모호가 Critical 현재 결함 | Needs Experiment | 목표의 범위는 크지만 미구현 목표가 곧 현재 Critical 버그는 아님. 한 수직 슬라이스에서 Core/호스트 책임·사용 시간을 검증 |
| Document/Vector/Graph/Wiki 불일치 | Accepted | 미래 다층 조회 계약 갭 H7. 현재 Vector/일반 Graph/Wiki 구현이 없어 그 결과의 실제 불일치는 아직 재현 대상 아님 |
| 모든 외부 모델 실행 로그 수집 불가 | Accepted | core는 needs_model을 반환하고 호스트의 독립 호출을 관측하지 않음. 보고와 직접 관측을 구분 |
| DAG와 Agentic 복잡성 과대 | Accepted | 현재 cursor가 DAG를 대신하지 못함. 정적 순차·DAG·재계획을 따로 수용하며 복잡한 병렬 모델을 첫 단계에 넣지 않음 |
| Wiki와 Projection 중복 | Accepted | 생성 Wiki는 파생 Projection, 사람 확정 Wiki는 보호된 Resource. 명칭만 다르게 같은 저장소를 중복 운영하지 않음 |
| Core 추상화 사용 사례 검증 부족 | Needs Experiment | 추상화는 아직 신규 후보. 텍스트+JSON 및 이미지 참조, 기존 집필을 함께 테스트해 일반화의 비용과 적용 범위 검증 |
| 기존 Folio 마이그레이션 불명확 | Accepted | 원고 현재 bytes, 사건/영수증, 관리 이미지, 새 Resource가 다른 계약. 강제 변환 없이 adapter+명시적 반입+원본 보존 필요 |
| 모든 접근 계층에 별도 DB/서비스가 필수 | Rejected | 인계서가 물리 분리를 요구하지 않으며 현행 SQL은 같은 DB에서 여러 표를 투영. 논리 Adapter 계약은 서비스 수를 결정하지 않음 |
| 이미지 hash 확인이 시각적 품질 보증 | Rejected | core/assets/files.js는 bytes만 대조. 실제 기록의 sameHost/independent=false와 엄격 편집 NOT_MET가 품질 보증 주장을 반박 |
| 현재 managed URI가 승인된 불변 사본 | Rejected | core/assets/files.js:85의 reference_only, assets-tool.test.js:23의 승인 거부. 이 정확한 현재 구분을 보존 |

## 채택한 설계 수정

[architecture-v2](architecture-v2.md)는 도메인 중립 envelope와 분야 payload를 분리한다.
관계형 표·벡터·그래프·위키는 하나의 강제 사실 스키마가 아니다.
강하게 결속할 결정·원본 판본·publication marker와 지연될 수 있는 Projection을 구분한다.
Query는 선택한 판본·부분 범위·현재성·근거를 반환하고 서로 다른 판본을 숨겨 합치지 않는다.

실행은 계획과 실제 관측을 분리한다. 호스트가 보고하지 않은 모델·비용·도구 호출은 unknown이다.
자율성 모드는 위임과 예산을 바꾸지만 강제 잠금은 유지한다.
새 소유 자원·외부 참조·snapshot과 기존 원고·자료·자산의 권위를 명확히 한다.

## 추가 실험과 출시 제한

| 실험 | 성공 기준 |
|---|---|
| 프로세스 kill·부분 append·head 지연 | 승인된 prefix 유지, 완전 tail의 다음 append 안전, 불완전 tail 성공 반환 금지 |
| 시계 변화·장시간 holder·dead PID | 살아 있는 writer의 동시 진입 없음, 죽은 writer만 안전 복구 |
| Publication 직전/직후 중단 | 미발행 데이터 현재 Query 제외, 재개 멱등, 수동 편집 보존 |
| 다층 checkpoint 불일치 | requireCurrent 거부/미확인, pin 조회는 지정 판본만, allowed stale은 명시 |
| 외부 변경·404·접근 불가 | 마지막 확인 사실과 현재 unknown/unavailable 구분, 과거 snapshot 유지 |
| 위임 철회 후 지연 응답 | 신규 활성화 불가, 이미 발행한 이력은 유지 |
| generated Wiki와 human Wiki | 자동 갱신이 human Resource를 덮지 않음, 근거·입력 변경 시 stale |
| 삭제·보존 | 내용·인덱스·백업·로그별 삭제 범위 표시, append-only 이력을 위조하지 않음 |

정전 durability와 fsync·디렉터리 flush 정책은 아직 확정하지 않았다. rename의 원자성을
정전 내구성으로 설명하지 않는다(`core/util/fs.js:6–10`).
민감한 payload가 이미 기록장에 들어간 과거 데이터의 삭제 정책도 미확정이다.
새로운 원격·다중 사용자·관리형 실행 출시 전에 권한·보존·삭제·비용 상한을 따로 수용해야 한다.

## 최종 초안의 독립 대조 결과

같은 독립 reviewer가 다섯 문서를 다시 읽어 추가 모순 네 가지를 지적했다.
모두 Accepted이며 아래와 같이 설계·계획을 수정했다. 코드 수정 완료 판정은 아니다.

| 추가 지적 | 반영 |
|---|---|
| D1 source 선택과 결과 발행의 checkpoint 분리 | 공통 workspace-state seq/hash, snapshot의 선택 marker 결속 |
| D2 고정 policy로 현재 철회 확인 불가 | 현재 grant resolve와 marker 직전 잠금 안의 재검증 |
| D3 seed 강제 이행과 옛 작품 호환 충돌 | 옛 Adapter legacy 읽기 유지, 범용 반입은 명시적 선택 |
| D4 COMMIT_TARGET_CONFLICT 뒤 skip 불가 | runner의 비파괴적 skip·새 실행을 T1 완료 조건에 추가 |

수정 후 독립 reviewer가 다시 대조했으며 최소 수직 슬라이스를 막는 주요 모순을 더 발견하지 못했다.
이는 문서 계약의 대조 결과이며 신규 구현이나 E2E 통과를 뜻하지 않는다.
