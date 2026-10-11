# 리뷰 버그 수정 결과

2026-10-11. 비교 기준 c2ff65700905c7a9e9f1d24eb3d839bbb4142836 이후 작업 사본. 구현 계약은 같은 날짜 review-bugfixes 계획서다. 공개 릴리스 파일은 변경하거나 재게시하지 않았다. CI는 제외했다.

## 수정

- SECURITY.md의 API 헤더를 실제 호환 계약인 X-Folio-Token으로 바로잡았다. 인증 검사 자체와 Host/Origin/권한 경계는 유지했다.
- work.yaml의 선택 language를 검증·정규화하며 folio_init에서 새 작품에 저장한다. 기존 작품은 덮어쓰거나 자동 이행하지 않는다. 필드가 없으면 기존 정규화 설정 객체도 그대로다.
- 원본 Web/EPUB은 저장한 language를 사용하고, Studio catalog와 folio_config에도 지정 여부를 제공한다. export의 명시적 override와 번역 판본 lang은 유지한다. 기존 미지정 작품 export는 ko이고 catalog는 null이다.
- 영어/한국어 합성 예시는 공개 MCP init에 해당 본문 언어를 전달한다. MCP 초기 지침·도구 필드 설명·동봉 스킬·사용 안내를 맞췄다.
- package:verify에 새 설치본의 MCP 영어/한국어 작품 생성 → 기본 Studio HTTP → Web/EPUB 내부 언어 태그 검증을 추가했다. 별도 language override로 버그를 가리지 않는다.

## 재현과 검증

수정 전 test/server/publication-language.test.js에서 문서 헤더 요청이 401(예상200), 영어 기본 HTTP publication 언어가 ko(예상en)로 실패했다. 새 설정 계약도 저장·검증이 없는 상태에서 실패함을 먼저 확인했다.

Node24.19.0·macOS arm64에서 아래 명령을 실제 실행했다. 실제 작품과 이미지 생성 결과는 수정·커밋하지 않았고 테스트 승인도 합성 입력의 모의 승인이다.

| 검증 | 결과 |
|---|---|
| 관련 config/init/언어/판본 테스트 | 39/39, 실패0 |
| npm run check | lint/typecheck 및1774/1774, 실패·skip0 |
| npm --prefix viewer test | 70/70, 실패·skip0 |
| npm run package:verify | 새 tarball 설치·개발 의존성 없음·22개 MCP 도구·기존 production/doctor/번역 계약 통과 |
| 새 설치 원본 언어 관문 | en/ko, 기본 Studio Web/EPUB·OPF 언어 태그·본문 확인 |
| 기존 작품 보존 | 조회·다운로드 전후 설정/원고/ledger 전체 파일 hash 일치; language 제거 후 ko 기본값·자동 이행 없음 |
| git diff --check | 통과 |

원시 로그는 ignored .local-output/review-bugfix-{red,check,targeted,package,viewer}.log 및 review-language-config-red.log다. 기존 Graph chunk 크기 경고는 유지한다. 다른 OS·Node, 실제 AI 호스트 장기 작업, 정전 내구성이나 대규모 색인 지원까지 이 수정으로 검증했다고 주장하지 않는다.

## 남은 범위

선택 원본100개 벡터 한도·청크/배치 색인·저장 내구성·실제 호스트/규모 검증은 이전 보고의 별도 과제다. 기존 영어 작품은 사용자가 원할 때만 language: en을 설정하거나 export에서 언어를 지정한다. 공개0.1.1 다운로드는 수정 전 bytes로 보존했으며 배포 업데이트는 별도 단계다.
