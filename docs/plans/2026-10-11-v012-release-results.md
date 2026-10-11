# 0.1.2 공개 배포 결과

2026-10-11. 사용자 요청에 따라 버그 수정과 패키지 배포를 GitHub에 반영했다. CI는 추가하지 않았다.

- 코드/릴리스 태그 정본: 2344d90d5917d8fe97c2fab92d7ad04319899141. main과 v0.1.2에 같은 코드 commit을 공개했다. 이 검증 기록은 후속 문서 commit이며 배포 runtime을 바꾸지 않는다.
- 공개 prerelease: https://github.com/fbwndrud/linivera/releases/tag/v0.1.2
- 패키지: linivera-0.1.2.tgz, 1,252,068bytes, 파일548개, 준비된 Studio 포함. SHA256SUMS도 함께 공개했다.
- SHA-256: b06f6257eb32f81554696c26f9401e46d394be81ec49a8c09ea68df26df2dabc.
- tarball의 모든 파일 bytes를 소스/준비된 화면과 비교했다. test/plans/실제 작품/생성 결과물/CI 파일은 패키지에 넣지 않았다. Git에는 작은 합성 테스트만 포함했다.
- README 영어/한국어, 첫 실행 가이드와 설치 안내의 패키지 URL을0.1.2로 바꿨다. 기존 npx 등록은 URL 교체와 재연결이 필요하다. 예시 모음·스크린샷은0.1.1 다운로드를 유지한다.

## 검증

버그 수정의 전체 backend1774/1774·Studio70/70 결과를 유지하고, 버전 변경 후 MCP identity/schema/호환/첫 실행/실제 Studio 언어 경로10/10과 lint/typecheck를 다시 확인했다. 0.1.2 package:verify는 tarball 새 설치·개발 의존성 없음·22개 MCP 도구·한국어/영어 기본 Web/EPUB·번역·진단·기존 production 경로를 통과했다.

배포할 최종 tarball을 빈 npm cache에서 npx로 직접 실행했다. GitHub draft에 두 자산을 올려 크기와 digest를 대조한 뒤 공개했다. 공개 URL도 별도의 빈 npm cache에서 새로 실행해 서버 이름/버전 linivera0.1.2, 도구22개, 동봉 안내, 합성 영어 작품 생성·상태·Studio의 기본 Web/EPUB 본문과 en 태그를 확인했다. 작가 승인은 합성 fixture에서만 모의 실행했다. 자체 임시 작품·cache·서버는 정리했다.

공개 파일을 다시 다운로드해 로컬 배포 파일과 byte 단위로 비교했다. 이전0.1.1 자산17개의 ID·크기·digest는 배포 전후 동일하다. 이전0.1.0 릴리스도 수정하지 않았다. git ls-remote로 main과 v0.1.2의 dereferenced commit이 코드 정본과 일치하는지 확인했다.

원시 근거는 ignored .local-output/v012-release/의 package-verify.log, version-contract-tests.log, package-proof.json, final-artifact-smoke.json, public-smoke.json, published-release.json 및 다운로드 사본이다.

실제 호스트 장기 작업·다른 OS/Node·정전 내구성·100개 초과 벡터 색인 지원은 이번 배포 검증 범위 밖이다. 이전 설치와 정적 사본은 자동 갱신되지 않으며 기존 영어 작품의 language 설정도 자동으로 바꾸지 않는다.
