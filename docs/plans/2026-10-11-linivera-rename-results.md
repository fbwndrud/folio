# Linivera 이름 변경 검증 기록

2026-10-11. 사용자 확정 이름: 리니베라 / Linivera. 배포 소스의 시작점은 f4a7908이다. 검사에는 새 합성 폴더와 고정 응답만 사용했고 실제 작품은 수정하지 않았다.

## 반영한 내용

- 패키지 linivera@0.1.1, 화면 패키지 linivera-viewer@0.1.1.
- Linivera/리니베라 README, 현재 문서, 호스트 지침, Studio 표시와 예시 생성 안내.
- linivera-mcp / linivera-view / linivera-doctor와 기존 folio-* 명령을 함께 설치.
- MCP 초기 응답 {name: linivera, version: 0.1.1}. 기존 도구 22개의 folio_* ID와 입출력 스키마 유지.
- GitHub fbwndrud/folio → fbwndrud/linivera. remote와 현재 문서 링크 갱신.
- 기존 릴리스 1개, 첨부 파일 25개의 ID·이름·크기·digest를 변경 전후 비교하여 보존 확인. 이전 주소의 tarball 다운로드는 HTTP 200으로 연결됨.
- 개발 체크아웃에는 변경 전 배포 소스와 일치한 파일만 동기화하여 기존 작업을 보존함.
- 실제 Claude 프로젝트 MCP 설정을 검증한 새 설치본으로 연결. 등록명 linivera, Node 24의 절대 경로 사용. 스킬 ID는 folio로 유지하고 링크만 새 설치본으로 갱신. 설정과 기존 스킬 링크의 롤백 사본을 보존함. 앱 재연결/새 대화 전까지 실행 중인 서버는 이전 코드를 사용할 수 있음.

## 기존 데이터 검증

1. 변경 전 소스 f4a7908의 Folio 실행 파일로 story / guide / picturebook / fairytale 네 합성 작품을 완료했다. 새 Linivera 서버 조회 결과가 변경 전과 같았고 원본 파일 12 / 17 / 16 / 16개(총61개)의 hash가 유지됐다. 각 작품의 EPUB ZIP을 독립 reader로 읽어 형식을 검증했다. 조회와 내보내기 후에도 원본 hash가 같았다. 재구축 가능한 SQLite 인덱스는 원본 hash 비교에서 제외했다.
2. 내장 팩 7개의 선언 digest와 실효 packDigest를 이전 소스로 직접 계산하고 새 소스와 비교했다. 전부 동일하다. core 파일과 팩 구현/프롬프트/YAML은 수정하지 않았다.
3. 이전 서버에서 시작한 needs_model 실행을 새 서버에서 resume → 모의 승인 → commit으로 완료했다. 기존에 선택한 Resource revision, 기록장 무결성과 stale 없음도 확인했다. 승인은 이 분리된 합성 fixture에만 수행했다.
4. 실제 GitHub v0.1.0 tarball을 별도 설치하여 네 합성 작품을 만들었다. 새 서버에서 기록장 검증·기존 검토 상태·원본 파일 hash 보존을 확인했다.
5. v0.1.0 서버에서 등록·검토·모의 승인·연결한 합성 SVG를 새 서버로 읽었다. 자산 revision·review ID·승인·작품 상태가 같았다. v0.1.0에서 내보낸 Studio 폴더를 새 서버로 교체했고 승인 표시와 동일한 그림 bytes를 확인했다. 새 EPUB에 실제 SVG bytes가 포함되는지도 확인했다.
6. 새 이름과 기존 이름의 MCP 실행 파일이 동일 스키마를 제공하고 같은 저장 폴더를 읽는 회귀 테스트를 추가했다. 기존 test support는 이전 명령을, 공개 합성 예시는 새 명령을 사용한다.

work.yaml, .folio, 원고/영수증/기록장 형식, folio_* ID, skill/folio, FOLIO_EMBEDDING_* 및 화면 저장 키·토큰 헤더·정적 사본 식별자는 유지한다. 데이터 변환은 필요 없다. 새 tarball은 node_modules/linivera에 설치되므로 MCP 실행 경로만 갱신한다.

## 실행한 검증

- npm run check: lint/typecheck와 backend 1763/1763 통과(실패/건너뜀 0, 약332초). 새 호환성 테스트는 별도 재실행도 통과했다.
- viewer: 70/70 통과. 한국어 메시지 누락 검사를 포함한다.
- viewer build 성공. graph chunk 약1614kB의 기존 크기 경고가 있음.
- package:verify 통과: 개발 의존성 없는 tarball 설치, 명령 6개의 shim, 새/기존 doctor의 무변경 진단과 종료 코드, 문서95개의 상대 링크, stdio/HTTP, 그림·추적·선택 Resource, 번역본의 원본 결속 영수증 및 Web/EPUB, Resource 전용 작업, CLI 실행을 검증했다.
- 모델 없는 흐름이 통과했고 선택형 embedding만 EMBEDDING_RUNTIME_UNAVAILABLE를 반환했다. 이번 이름 변경에서 모델 추론/품질 검증을 다시 수행한 것은 아니다.
- 실제 브라우저의 한국어 예시 화면에서 리니베라 표시와 L 마크를 확인했다. 과거 정적 화면은 재내보내기 전까지 이전 이름을 유지한다.
- package:build로 linivera-0.1.1.tgz를 만들고 별도 설치한 실제 MCP의 이름/버전과 도구22개를 확인했다. npm registry 게시와 새로운 GitHub 릴리스 생성은 수행하지 않았다. v0.1.0 원래 다운로드와 checksum을 보존했다.

검증 출력과 합성 작품은 .local-output에만 두고 커밋/엔진 패키지에서 제외했다. 이 검사는 저장 형식·실행·내보내기 호환성 확인이며 실제 작품 품질 평가가 아니다.

## 최종 실행 및 원격 상태

로컬 전체 검사·viewer 70개·새 설치 E2E와 실제 v0.1.0 호환성 검증이 통과했다. 코드 변경 9c4c9c4를 main으로 push하고 GitHub에서 README 및 linivera@0.1.1 package.json을 직접 확인했다.

[원격 CI 38115657988](https://github.com/fbwndrud/linivera/actions/runs/38115657988)는 failure다. GitHub annotation은 “The job was not started because your account is locked due to a billing issue.”라고 보고했다. Linux/Windows/macOS 및 Node22/24/26 매트릭스의 여섯 작업 모두 step 수가 0이다. 코드 테스트가 실행된 실패도, 원격 통과도 아니다. 계정의 결제 잠금 해소 후 CI를 다시 실행해야 한다. 이 한계를 로컬 검증으로 대신하지 않는다.
