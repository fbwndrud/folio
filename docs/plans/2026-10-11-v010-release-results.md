# 0.1.0 사전 점검과 공개 준비 결과

## 보완

독립 Standards/Spec 검토에서 발견한 예시 실패 시 외부 파일 삭제, 출력 부모 링크로 원본 안에 쓰기, escaped JSON의 개인 경로 누출을 재현 후 수정했다. 실제 번들 모듈의 전체 라이선스·ELK 버전별 원본 제공 고지를 배포물에 넣는다. 라이선스 구현 담당자의 자기검증과 다른 담당자의 번들 포함 확인을 구분했다. 이전 기록장·작가 승인·core 잠금은 변경하지 않았다.

설치본에서 빠지는 문서에 대한 링크는 공개 태그 URL로 바꿨다. 실제 설치된 Markdown 95개의 상대 링크 검사와, 공개 소스 Markdown 214개의 상대 링크 검사(작품 fixture의 전용 문법 제외)를 통과했다. 역사적 문서의 개인 경로는 공개 source snapshot에서 예시 경로로 바꾸고 개발 Git 이력은 공개하지 않는다.

## README

공식 MCP reference servers, Logseq, Joplin, Aider를 비교한 연구를 반영했다. 사용 결과·화면·실행 명령·첫 대화·한계를 앞에 두고 영어/한국어를 분리했다. 실제 새 출력 story 예시와 doctor 및 Studio HTTP를 각각 확인했다. 다른 담당자가 문체·기능 범위·번역을 다시 검토했다. 그림 생성은 연결한 프로그램의 도구 지원에 따라 다름을 표시했다.

## 실제 로컬 결과

- macOS arm64, Node 24.19.0.
- backend 1,751개 PASS, viewer 67개 PASS, lint/typecheck PASS.
- 공개 source snapshot에서 npm run setup과 준비된 tarball의 새 설치/stdio/HTTP/원고/자산/추적/Resource/Web/EPUB/doctor 검증 PASS.
- root runtime audit 및 viewer full audit: 알려진 취약점 0. 보안 보증이 아닌 조회 시점 결과다.
- 최종 예시 ZIP 다섯 개 CRC·모든 manifest 파일 hash·CC0·Apache/NOTICE·Studio 제3자 고지 확인. 작품은 공개 Git/npm 엔진에 넣지 않는다.
- 네 예시는 모의 승인, AI 조사서는 실제 작가 승인 대기다. 자기검토를 독립 품질 평가로 표현하지 않는다.

## 남은 관문

원격 hosted runner가 시작되지 않아 CI matrix는 실행되지 않았다. v0.1.0 프리릴리스에서 이를 공개한다. 안정판·모든 운영체제의 동작 검증 완료라고 선언하지 않는다. 공개 첨부 파일의 실제 다운로드 및 hash 검사는 게시 후 별도 기록한다.
