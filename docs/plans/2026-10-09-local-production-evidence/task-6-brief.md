## Task 6 규모·경계 검증과 출시 판정 기록

Create: scripts/benchmark-local.js, test/acceptance/production-boundaries.test.js, docs/plans/2026-10-09-production-readiness.md.
Modify: docs/production.md, docs/testing.md, SECURITY.md의 실제 경계 설명.
Interfaces: `npm run benchmark:local`은 임시 합성 data 규모·환경·작업별 milliseconds/output bytes를 JSON으로 기록한다.

- [ ] 합성 원고100개·추적/자원100개 범위에서 상태/metadata refresh/query/view read·export를 실행한다. 생성 답변은 고정 fixture이며 AI 품질 점수를 만들지 않는다.
- [ ] 시간값은 실제 측정한다. 내부 timeout/임의 truncation 없는 결과와 버전 근거 보존을 검증하고 출력은 정리한다.
- [ ] vector input은 개별8MiB/100개 외에 합산32MiB를 상한으로 적용한다. verified entries.byteLength 합산 후 retained input buffers를 모으고 adapter 직접 호출도 같은 상한을 검사한다. source evidence 검증 중 개별 bytes 읽기가 있음을 숨기지 않는다. maxBatchBytes를 embedding profile input policy에 포함하며 기존 profile에는 명시 재색인이 필요하다. overflow·경계 성공·worker 호출 전 거부를 합성 시험한다.
- [ ] 새 HTTP API의 token 없음·잘못된 Host/Origin·path injection·candidate 노출·XSS text와 export read-only를 추가 회귀로 확인한다.
- [ ] fresh root check, viewer test/build, examples/assets/production/package, doctor 복원, benchmark 결과와 실제 Google adapter smoke를 controller에게 보고한다.
- [ ] 출시 판정은 완료/미검증/차단을 구분한다. 원격 CI/실제 호스트 장기 실사용/정전·remoteFS 미검증을 명시한다.
- [ ] 종합 독립 리뷰 후 주요 지적을 보완하고 최종 소스에서 controller가 검증한다. 전체 기록을 커밋하고 이 계획 scratch만 정리한다.

## 이행과 롤백 검증

기존 원고·자료·그림·영수증 형식을 그대로 여는 회귀를 Task1/4/5에 유지한다.
새 표시용 metadata는 명시 refresh 후 생성하며 조회가 새 승인을 만들지 않는다.
롤백은 전체 작품 백업을 별도 폴더에 복원한 뒤 이전 checkout에서 읽는 방식으로 문서화한다.
혼합 구버전 writer를 허용하지 않고 파일 손상 자동 수리 기능은 제공하지 않는다.
