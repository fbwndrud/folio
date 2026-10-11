# 첫 설치·영어 예시·배포 이름 검증 결과

## 바꾼 것

Vibelore README의 AI에게 설치 맡기기, 간단한 npx 등록, 소스 설치를 접은 상세 안내로 두는 순서를 읽기 전용으로 참고했다. Linivera는 의존성과 화면 빌드가 있으므로 소스 자체에 빌드가 필요 없다고 안내하지 않는다. 대신 준비된 GitHub tarball에 Studio를 포함하고 npx가 패키지와 의존성을 받도록 한다. npm 레지스트리에 게시했다고 주장하지 않는다.

- 단일 `linivera` 실행 파일: 기본 stdio MCP, `demo`, `view`, `examples`, `--help`.
- 영어 CLI 기본 예시 4종과 새 합성 영어 실습 안내서. 한국어는 `--language ko`, 기존 JavaScript API 기본값은 한국어 유지.
- 초기 MCP 작업 규칙 및 읽기 전용 안내 리소스. 임의 URI/파일 경로는 허용하지 않는다. 상세 스킬은 현재 한국어이며 영어 첫 사용 안내와 도구 설명을 제공한다.
- 영어/한국어 README의 AI 설치 요청, 호스트별 한 줄 등록, 한 줄 데모, 소스 개발 상세 안내. Studio 예시 명령도 화면 언어에 맞춘다.
- 새 `linivera-0.1.1.tgz`, `linivera-examples-en.zip`, `linivera-examples-ko.zip`, 작품별 `linivera-example-*.zip`. 예시 내부 README도 npx로 작업 사본을 여는 방법을 포함한다.

## 실제 확인

Node.js 24.19.0 / macOS에서 확인했다. CI는 사용자 요청에 따라 제외했다.

- `npm run check`: lint, typecheck, 백엔드 1,767/1,767 통과.
- `npm --prefix viewer test`: 70/70 통과.
- 배포/언어 묶음 관련 별도 테스트: 9/9 통과. 최종 README 보완 후 재확인했다.
- `npm run package:verify`: 새 tarball 설치, 개발 의존성 제외, 기본/기존 실행 파일, stdio/HTTP/Studio/자료/그림/추적/Web/EPUB/번역 판본 검증 통과. 문서 96개 상대 링크 확인.
- 새 npm cache를 이용한 tarball npx 진입점 추론과 SDK MCP 연결: 22개 도구, 서버 Linivera 0.1.1, 안내 리소스 읽기 통과. 공개 파일 URL은 릴리스 게시 후 별도로 확인한다.
- 영어 4종을 실제 MCP 실행 → 모의 검토·승인 → committed → idle까지 확인. 기존 API 한국어 단편은 mailbox ID를 그대로 유지한다. 기존 출력 폴더 덮어쓰기와 지원하지 않는 언어의 폴더 생성은 차단한다.
- 읽기 전용 MCP 안내 리소스를 전부 읽고 file URI, 경로 탈출, query를 붙인 미등록 URI는 거부됨을 확인했다.
- Studio 브라우저에서 영어 원고를 읽고 예시 명령이 en/ko 선택에 따라 바뀌는 것을 확인했다. 새 영어 모음은 영어로 열리며 새 실습 안내서 Web 본문도 확인했다.
- 최종 작품 ZIP 10개 CRC, manifest 파일 hash, 내부 EPUB CRC, 새 이름과 npx 재열기 안내 확인. 빌더가 원본과 복사본의 파일 hash를 대조하며 원본 기록을 수정하지 않는다.
- core/, packs/, CI 파일을 변경하지 않았다. 기존 `.folio`, `folio_*`, 스킬 ID와 기존 명령 별칭은 유지한다. 개발 체크아웃에는 기준 파일이 같은 변경만 반영해 다른 작업을 보존했다.

## 범위와 제한

호스트 등록 명령은 설치된 Claude Code/Codex/Grok CLI 도움말과 Codex 공식 MCP 문서를 대조했다. 사용자 실제 호스트 설정을 새 테스트 용도로 덮어쓰지 않았다. Windows와 Node 22/26에서 이번 새 설치를 직접 실행한 것은 아니다. UI 언어와 원고 언어는 별개이며 브라우저 기존 언어 선택을 존중한다. 이미지 모델이나 임베딩 모델을 추가 설치·재검증한 작업도 아니다.

영어 신규 안내서는 고정 합성 입력과 응답이다. 이전 예시의 실제 작가 승인을 만들거나 봉인된 Folio 원본 문구를 덮어쓰지 않았다. 생성 작품·이미지는 소스 커밋과 엔진 패키지에 넣지 않고 별도 릴리스로 제공한다. 최초 v0.1.0 파일 이름·내용·checksum은 보존한다.
