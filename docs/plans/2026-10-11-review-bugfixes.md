# 리뷰 버그 수정: 인증 안내와 본문 언어

2026-10-11. 사용자 승인 범위는 확인된 두 버그의 수정이다. 대규모 색인·내구성 강화·클라우드 기능·CI는 포함하지 않는다.

## 확인된 원인

- SECURITY.md가 실제 API의 X-Folio-Token을 X-Linivera-Token으로 바꿔 안내했다. 기존 인증 헤더와 보호 경계는 유지하고 문서를 수정한다.
- 영어 예시의 language가 fixture 선택에만 쓰인다. 원본 export는 ko로 고정되어 Studio에서 내려받은 영어 Web/EPUB에 한국어 언어 태그가 붙는다.

## 본문 언어 계약

1. work.yaml의 선택 필드 language는 본문 언어다. UI 언어와 독립이며 Intl.getCanonicalLocales로 검증·정규화한 최대35자 언어 태그다. 빈 값·null·숫자·잘못된 태그는 CONFIG_INVALID / WORK_LANGUAGE_INVALID로 거부한다.
2. language가 없는 기존 작품은 파일과 정규화된 기존 설정 객체에 필드를 추가하지 않는다. 읽기·원본 내보내기의 기본값만 ko다. 기존 승인·기록장·도구 ID는 변경하지 않는다.
3. folio_init은 선택 language를 받는다. 명시한 언어를 새 작품에만 저장한다. 기존 작품은 init으로 갱신하거나 덮지 않는다. 예시 생성은 선택한 en/ko를 init에 전달한다.
4. export 언어 우선순위는 명시적 language → 원본 work.language 또는 번역 variant.lang → ko다. 기존 명시적 export 언어와 번역 판본 계약은 유지한다.
5. Studio의 원본 Reading edition 언어도 저장된 본문 언어를 표시한다. 미지정 작품의 catalog는 기존 null을 유지하며 export만 ko로 기본 처리한다. 화면 언어 선택은 저장값이나 다운로드 언어를 바꾸지 않는다.

## 실행·검증 순서

- 실제 MCP 영어 예시 생성 → Studio HTTP summary 및 Web/EPUB 내부 태그를 검사하는 회귀 테스트를 먼저 실패시킨다. 보안 문서의 헤더로 실제 요청하는 회귀도 실패시킨다.
- 설정 검증·새 작품 생성·MCP schema/handler·예시·내보내기·판본 metadata를 최소 범위로 수정한다.
- 한국어 기본값, 기존 work.yaml/본문/ledger 무변경, 번역 판본·명시적 override, 잘못된 언어가 파일 생성 전에 거부되는지 확인한다.
- 관련 계약 테스트, lint/typecheck, 전체 회귀, 준비된 tarball 새 설치에서 같은 HTTP 다운로드 경로를 검증한다. 합성 입력만 사용한다.

## 이행·롤백

자동 마이그레이션은 없다. 기존 영어 작품은 사용자가 선택하면 work.yaml에 language: en을 추가할 수 있다. 명시적 export language 지정도 계속 쓸 수 있다. 이전 실행 파일로 롤백할 때 새 language 필드는 기존 reader에서 무시되므로 그 버전의 한국어 기본값이 돌아온다. 배포 패키지 재게시나 기존 릴리스 덮어쓰기는 이 수정 단계에 포함하지 않는다.

완료 조건: 문서의 헤더로 인증 성공, 새 영어 작품의 기본 Studio Web/EPUB 태그가 en, 기존 한국어/번역/승인 호환 회귀 통과.
