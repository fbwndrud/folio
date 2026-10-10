# Studio 세 모드 구현 결과

2026-10-09. 사용자 요청대로 원고·검토·출판을 모두 실제 viewer에 반영했다.
이전 시안의 원고·대상 이름·숫자·비교 switcher는 제품 코드에 포함하지 않았다.
기본 파일은 `2026-10-09-studio-modes-implementation.md`의 순서와 경계를 따른다.

## 구현

| 계획 | 결과와 코드 |
| --- | --- |
| 추적 읽기 모델 | `core/view/tracking-view.js`: 공개 current query를 페이지 끝까지 읽고 source hash, ordinal, coverage, receipt, 자기검토를 보존한다. |
| 원고 모드 | `viewer/src/screens/Reader.jsx`: 기존 원고·그림·읽기 설정·검토 기록을 유지하며 Tracking 패널을 추가했다. |
| 근거 검토 | `viewer/src/screens/ReviewDesk.jsx`: 사용자 정의 대상·기준·그룹 필터, 전체 활성 기록, 실제 source section과 본문 hash 대조를 제공한다. |
| 제한된 연결 | `components/tracking/Connections.jsx`: 선택 대상의 실제 본문 참조를 보여 주고 그룹으로 좁힌다. 부모 계획 메모와 추론 관계는 섞지 않는다. |
| 출판 모드 | `viewer/src/screens/Publish.jsx`: 계층형 목차, 저장 원고의 연속 미리보기, Web ZIP·EPUB 다운로드와 검토 사본 버튼을 제공한다. |
| 실제 export | `core/export/contents.js`: 부모 제목과 잎 본문을 계층형 목차에 연결한다. 계획 메모는 본문에서 제외한다. |
| 다운로드 경계 | `core/view/publication-view.js`와 인증된 GET 경로: 서버 출력 경로를 받거나 원고·기록장을 쓰지 않는다. |
| 안내 | `docs/studio.md`, writing-guide/export/production/README를 현재 화면과 맞췄다. |

## 의미·버전 계약

- 원고의 근거 링크는 observation identity를 전달한다. 현재 contentHash와 evidence hash가
  일치할 때만 실제 원문 인용을 강조한다. 변경되거나 빠진 근거는 미확인 안내로 표시한다.
- 최신 기록은 ordered 작품의 현재 절까지로 제한한다. unordered 작업에는 단일 현재 상태를 만들어 내지 않는다.
- 같은 위치의 상충 기록, 다른 basis·관점·경로를 합치지 않는다. 작품 내 timeLabel은
  실제 시간 순서를 추정하지 않고 개별 기록으로 남긴다. note는 이력으로 보존한다.
- coverage 미완료와 기록 없는 절을 표시한다. coverage와 명시/믿음/추론은
  호스트가 제출한 검사 범위와 분류이며 의미 정확도·작가 승인을 보증하지 않는다.
- snapshot은 새 추적/출판 필드를 포함한다. 원고 hash와 추적의 source hash가 다르거나
  읽는 동안 tracking checkpoint가 바뀌면 혼합 사본을 내지 않고 재시도를 요구한다.
- 이전 snapshot의 필드가 없으면 미포함으로 안내한다. resource-only Library는 유지된다.
- 새 lookup 경로에 데이터가 준비되기 전에는 이전 경로의 데이터를 보여 주지 않도록 `useLoad`를 보완했다.
- 선택 판본의 API·기존 MCP 도구 계약과 잠금 규칙은 유지했다. 화면 다운로드는 main 판본이다.

## 검증 결과

- `npm run check`: lint/typecheck 성공, **1,720/1,720 테스트 통과**.
- `npm --prefix viewer test`: **42/42 통과**.
- 마지막 export HTML 구조 보완 후 관련 테스트 **17/17**, lint/typecheck를 다시 확인했다.
- `npm --prefix viewer run build`: 성공. 기존 lazy Graph의 큰 chunk 경고는 남아 있다.
- 새 계약 테스트: public query와 viewer/snapshot 일치, source fingerprint,
  drift 시 이전 관측 제외, 기록장 손상, 인증·지원 형식·읽기 전용 다운로드,
  EPUB 목차의 실제 anchor, 부모 메모 제외, 본문 hash 보존.
- viewer 테스트: 미래 정보 제외, 분기 순서 임의 추정 금지, 같은 위치 충돌·관점·경로·시간
  보존, missing coverage, bounded evidence identity, 이전 snapshot fallback과 다운로드 거부.
- 실제 합성 중편과 안내서에서 세 모드를 열었다. 중편의 근거 링크가 정확한 원문을 강조하고
  앞 절에서 나중 보관자를 표시하지 않는 것을 확인했다. 믿음은 관점과 함께 표시했다.
- 대상/기준/그룹 필터와 실제 원문 연결, 장 선택, 실제 Web ZIP·EPUB 다운로드를 확인했다.
- 새 정적 검토 사본은 세 모드를 읽으며 `/api/` 요청 0개, 새 책 다운로드 비활성이다.
- 390/768/1024px의 세 화면에서 페이지 전체 가로 overflow 없음.
- 중편·안내서의 전체 원본 파일 hash 비교가 일치했다. 브라우저 page error와 HTTP 오류 0개.
- 실제 내려받은 EPUB: ZIP CRC, XML 4개, 목차 25개 링크, 중첩 목록 8개,
  본문 장면 18개를 확인했다. Web ZIP manifest도 같은 18개 본문과 목차를 보존한다.

## 증거와 한계

원고·다운로드·스크린샷은 커밋하지 않고 다음 ignored 디렉터리에 보관한다.

`.local-output/studio-modes-20261009/browser-proof.json`

`.local-output/studio-modes-20261009/epub-proof.json`

`.local-output/studio-modes-20261009/downloads/`

`.local-output/studio-modes-20261009/shots/`

미리보기는 실제 저장 본문이며 자동 조판/페이지 수/출판 PDF를 제공하지 않는다.
전자책의 실제 기기별 렌더링과 독립 초보 사용자 사용성은 이번 검사에 포함하지 않았다.
라이브 화면은 자동 polling 없이 Refresh view로 갱신한다. 자동 페이지 갱신이나
관측 의미의 AI 재판정은 수행하지 않는다. 생성물과 기존 테스트 작품의 작가 결정을 바꾸지 않았다.
