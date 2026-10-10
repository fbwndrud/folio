# 변경 영향 및 중·장편 성능 개선 결과

2026-10-10. 사용자 승인 범위: 변경 영향 화면, 중·장편 성능, 최신 로컬 배포 검증.
기존 중편·안내서 원본과 /path/to/folio 체크아웃은 수정하지 않았다.
실습 결과물·생성 원고·다운로드·스크린샷은 ignored `.local-output/`에만 보관한다.

## 실제 구현

- `core/view/impact-view.js`: 기존 status의 변경 이유, 당시/current 버전, 원고 직접 수정, hard finding, 근거 재연결, 자료 인용 불일치, tracking coverage를 읽기 전용으로 투영한다. 기록 없는 의미적 영향은 추측하지 않는다. 판본과 Resource 최신성은 별도다.
- 인증된 GET `/api/impact`, Review → Changes 및 정적 snapshot의 optional impact. 구간/항목 검색, 변경 종류 필터, 항목 원본·구간 검토 링크, 당시/current fingerprint. 구버전 정적 사본은 미포함 안내. 자동 승인/재작성 없음.
- `core/view/read-context.js`: export 한 번에만 Work·status·receipt/evidence를 재사용한다. 반복 구간의 전체 파일 재읽기/검토 계산을 제거한다. `node-view`, `entity-view`, `receipt-view`, `evidence-view`의 기존 HTTP/MCP 응답 계약 유지.
- `core/view/writing-checkpoint.js`: 완료 전에 fresh Work, 원문 work.yaml, 모든 ledger/head 및 run 파일 hash를 다시 확인한다. 링크·특수 파일을 열지 않는다. 변화 시 VIEW_CHANGED. 기존 Resource checkpoint와 snapshot asset bytes 검증 유지.
- 손상된 nested ledger 상태를 Overview가 정상으로 표시하던 UI 조건을 수정했다.
- `examples/production.js`: 새 설치의 실제 HTTP impact와 내보낸 snapshot이 같은지 검증한다.

## 실측

Apple M1 / 8GB, Node 24.19.0, 로컬 파일시스템. 모두 합성 데이터, 모의 호스트/승인.

| 측정 | 이전 | 이후 | 확인 |
|---|---:|---:|---|
| 동일 합성 원고 100구간(상위 그룹 포함102) snapshot | 28,648ms | 1,471ms | 약19.5배, 본문 hash100% 일치 |
| committed 원고100 + tracking 관측100 + Resource100의 실제 HTTP viewer-export | 이전 출시 기록44,280ms | 1,261ms | 현행 benchmark:local 통과; 과거 기록과는 실행 조건 차이 가능 |
| 현행 100 Resource의 개별 HTTP 상세100회 | — | 5,949ms | 최적화 적용 대상 아님 |

동일 데이터 전후 비교는 짧은 fixture들과 합성 본문 반복을 사용한다. 실제 관측/선택 데이터100개 통합 측정은
별도다. 단일 로컬 실행이며 p95/SLA·피크 메모리·아주 큰 JSON의 렌더링 상한은 확정하지 않았다.
서버 화면은 기존 구간별 요청을 유지하며, 이번 변경이 live HTTP에 요청 간 캐시나 새 streaming을 추가하지는 않는다.

## 검증

- `npm run check`: lint/typecheck 및1,732/1,732. 신규 source_quote/hard/image 계약 포함.
- 신규 최종 targeted14/14: tracking 변경→정확한 의존 구간→성공 재검토, 설정/원고 변경,
  이미지 교체→승인 무효→새 검토, source 인용 불일치, hard 차단, 변조/설정 오류, shared/public 응답 일치,
  동시에 바뀐 원고·설정·config·ledger의 checkpoint 거부.
- viewer 테스트45/45, production build 성공. 기존 Graph lazy chunk1.61MB 경고 유지.
- Chromium 실제 중편의 **분리된 실습 사본**에서 scene-07 수정: 영향 카드25개(상위 그룹 포함), 변경 필터,
  당시/current 값, 검토 링크, Manuscript/Review/Publish/Changes,390px 넘침 없음, page/HTTP 오류0.
- 새 정적 사본 Changes: API 요청0, live와 카드 수 일치. 중편 원본 전체 파일 hash 전후 동일.
- 최신 tarball 새 설치 `package:verify`: devDependencies 없이 설치, stdio MCP/HTTP viewer/정적 export,
  EPUB 검증, doctor, story/guide/picturebook/fairytale, 자산·tracking 합성 실습 및 impact 일치 검사.

## 판정 및 잔여 과제

이번 범위 완료: 실제 변경 영향 화면 + 기존 형식/잠금 규칙을 유지하는 snapshot 반복 I/O 제거.
Core 모델/네트워크 호출 없음, 저장 형식 이전 없음, 작가 원본 승인/수정 기록 없음.
별도 리뷰 subagent를 이번 작업에 실행하지 않았다. 회귀·계약 테스트와 실제 브라우저를 통한 자체 검증이다.

Git remote가 없어 push/원격 CI는 미실행이다. 실제 초보자 실습, 다른 AI 호스트의 장기 작성,
실기기 EPUB 리더 호환성, 네트워크 파일시스템/전원 손실, 의미 추출 품질은 미확인이다.
embedding inference는 이번 작업 범위가 아니며 설치 검사에서 모델 runtime 미설치 상태를 명시적으로 확인했다.
통합 검색 UX·온보딩·자동 Wiki·클라우드 협업/결제는 이번에 추가하지 않았다.

[착수 계획](2026-10-10-impact-and-performance.md) · [화면 안내](../studio.md)

최신 내부 배포 파일: `.local-output/releases/studio-impact-20261010/folio-0.0.0.tgz`
(1,167,957 bytes; SHA256 `5c0f514e6b1a2c0c168b0064b5dee36108512e859af57a8f2e4b69f8f6755d6b`).
version0.0.0/private 상태의 로컬 설치용 파일이며 공개 npm 출시 선언은 아니다.
