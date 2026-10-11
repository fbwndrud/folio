# Linivera 이름 변경 계획

사용자가 2026-10-11에 리니베라로 확정하고 README·MCP 설정·패키지·GitHub 저장소 변경과 기존 데이터 호환성 검증을 요청했다. 배포 정본은 public-source 체크아웃의 main(시작 commit f4a7908)이다. 다른 체크아웃의 미완료 작업은 섞지 않는다.

## 변경 범위와 순서

1. 변경 전 commit의 합성 예시 네 개와 팩 digest를 별도 로컬 출력에 기록한다.
2. 제품 표시명 Linivera/리니베라, 패키지 linivera와 linivera-viewer, linivera-{mcp,view,doctor} 명령을 반영한다. 기존 명령은 같은 구현으로 연결한다.
3. README·현재 사용 문서·AI 지침·Studio와 설치 예시를 갱신한다. 과거 계획서와 배포 파일은 역사적 기록으로 보존한다.
4. 기존 합성 작품의 원고·승인 영수증·기록장과 열린 실행을 새 서버로 조회·재개한다. 팩 digest, 도구 스키마, 원본 bytes와 기존 내보내기 식별자가 유지되는지 확인한다.
5. lint/typecheck, 전체 backend/viewer 테스트, production 및 tarball 새 설치 검증을 수행한다. 새 이름과 기존 명령을 모두 검증한다.
6. GitHub fbwndrud/folio를 fbwndrud/linivera로 바꾸고 remote를 수정한다. 기존 릴리스와 다운로드의 리디렉션을 확인하고 검증된 변경을 push한다. npm registry에는 게시하지 않는다.
7. 실제 로컬 MCP 등록이 있으면 검증한 설치본으로 변경하고 재연결 필요를 안내한다.

## 변경하지 않는 호환성 계약

- core 코드, 팩 이름/내용/버전/digest, 잠금·승인·hash·영수증 규칙.
- work.yaml, .folio, 기록장 형식, Resource/Revision/자산 ID와 외부 참조.
- folio_* 도구 ID와 입력 스키마, skill/folio 경로 및 스킬 ID.
- FOLIO_EMBEDDING_* 환경 변수와 Studio의 기존 저장 키·토큰 헤더·정적 내보내기 식별자.
- v0.1.0 릴리스의 folio-*.tgz/ZIP/이미지 파일명과 원래 checksum.

데이터 마이그레이션은 필요 없다. 새 tarball의 node_modules 패키지 폴더는 linivera이므로 MCP의 실행 경로는 고친다. 실행 중인 프로세스와 과거 정적 화면은 재연결/재내보내기 전까지 이전 이름을 표시한다.

## 롤백과 완료 조건

작품 폴더를 변환하지 않는다. 이전 설치 폴더를 보존하고 MCP 실행 경로를 되돌리면 롤백된다. 원격 저장소 이름을 되돌리는 작업이 필요하면 GitHub rename과 remote URL을 함께 되돌린다. 호스트 설정은 변경 전 사본을 보관한다.

완료: 새 패키지/MCP identity/Studio/문서가 일치하고, 기존 네 작품과 열린 실행의 호환성 및 설치본의 새/기존 CLI 검증이 통과하며, 새 GitHub 주소에서 변경이 확인되어야 한다. CI가 계정 제한으로 실행되지 않으면 통과로 보고하지 않는다. 실제 작품과 생성 결과물은 커밋하지 않는다.
