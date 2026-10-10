# v0.1.0 공개 전 재검토

## Spec re-review — 별도 담당 검토

검토일: 2026-10-11. 사용자 요청, AGENTS.md, 예시 배포 계획과 이전 Spec 지적을 기준으로 부모의 수정 결과를 재검토했다. 이 결과는 공개 게시·원격 CI 통과 선언이 아니다. 검토 과정에서는 이 문서 외의 프로젝트 파일을 수정하지 않았다. 실험에는 임시 합성 작품만 사용했고 출력은 정리했다.

### 이전 지적 판정

| 지적 | 판정 | 코드와 실제 확인 |
|---|---|---|
| P1: JSON에 저장된 Windows 개인 경로가 번들에 포함됨 | Resolved | `scripts/example-files.js:8–26`에서 원시 텍스트와 해석된 JSON/JSONL 문자열·키를 검사한다. `scripts/example-bundle.js:83`은 입력 및 정규화한 원본 경로를 검사 대상으로 전달한다. 이전과 같은 `sources/privacy.json`을 합성 작품에 넣어 실제 번들 빌드를 다시 실행했으며 이번에는 거부됐다. escaped Windows·Unicode escape·file URI·알려진 토큰·실제 sourceRoot 회귀도 통과했다. |
| P1: v0.1.0 및 예시 이용 조건 미반영 | Resolved in code; final artifacts pending | root/viewer package와 각 lock의 최상위·root package 판본 여섯 값이 모두 `0.1.0`이다. GitHub tarball 배포와 npm 미게시를 README 및 production 안내에서 구분한다. `private: true`는 npm 게시를 막는 설정이며 이번 GitHub 배포와 충돌하지 않는다. 별도 합성 CC0 번들을 실제 생성하여 manifest의 `CC0-1.0`, 원고 승인 `pending`, `LICENSE`, `NOTICE`, `licenses/CC0-1.0.txt`, `studio/THIRD-PARTY-NOTICES.txt`의 포함 및 파일 manifest 등록, ZIP hash를 확인했다. 최종 실제 예시 다섯 개에도 같은 조건이 적용됐는지는 배포물 재생성 후 확인해야 한다. |
| P2: tarball에 없는 개발 문서로 연결되는 상대 링크 | Resolved | 제외된 계획·test·CI 링크는 `v0.1.0` GitHub 주소로 바뀌었다. 실제 `npm pack --dry-run --json` 파일 목록을 기준으로 포함 Markdown 95개의 상대 링크 검증이 통과했다. `scripts/check-package.js:40`은 실제 설치된 tarball에서 동일 검증을 수행하도록 연결돼 있다. 앵커 의미나 외부 HTTP 주소의 가용성까지 검사한 결과는 아니다. |

### 추가 안전 수정 확인

- `scripts/example-output.js:9–23`은 존재하는 출력 부모와 원본의 정규 경로를 비교한 뒤 출력 폴더를 만든다. 원본으로 향하는 부모 symlink는 출력 생성 전에 거부되며 원본 hash가 유지된다. 부모의 dev/ino 및 정규 경로를 재검사한다.
- `scripts/example-bundle.js:90–92`는 실패 시 출력 전체를 재귀 삭제하지 않는다. 다른 프로세스가 추가한 파일이 남는 실제 회귀를 확인했다. 부분 출력 위치를 오류에 안내한다.
- 전체 미리보기의 일괄 초안 표시는 없어졌고 각 카드에서 모의 승인과 실제 작가 승인 대기를 구분한다. 콘텐츠 조건과 Studio의 별도 소프트웨어 라이선스도 분리한다. 기존 기록장이나 원고에 새로운 작가 승인 기록을 추가하지 않는다.
- 영문/한국어 README는 새 사용자의 합성 예시 실행, Studio 열기, 자신의 작품 시작, 연결, 백업 및 기능 한계를 앞에서 안내한다. 소스 설치와 준비된 tarball 설치가 분리돼 있다. 검토 결과를 의미 정확도 보증으로 표현하지 않는다.

### 직접 실행한 검증

`node --test test/scripts/package-links.test.js test/scripts/example-safety.test.js test/scripts/example-bundle.test.js`: **10/10 PASS**. 기존 기록장 보존·다른 폴더에서 열기·미리보기의 work/API 비공개·기존 출력 보호·사생활 경로 차단·실패 후 파일 보존·문서 링크 회귀를 포함한다.

추가 독립 실험으로 이전 Windows 경로 누출 재현을 반복해 거부를 확인하고, 새 합성 CC0 번들의 권리 파일과 checksum을 확인했다. 현 시점에서 새로 재현된 Spec release blocker는 없다.

### 아직 대기 중인 공개 관문

- Windows/Linux/macOS 및 지원 Node 버전의 **원격 CI는 대기**다. 로컬 통과나 CI 설정 존재를 원격 실행 결과로 해석하지 않는다.
- 부모의 전체 테스트·새 설치본 package 검증, 최종 공개 source snapshot의 개인 경로 및 자격정보 검사, 생성 결과물·로컬 개발 Git 이력 제외 확인은 별도 최종 관문이다.
- 실제 배포 예시 ZIP 다섯 개의 새 라이선스·notice·manifest·checksum과 다운로드 검증, 공개 tag 및 릴리스 URL 가용성은 게시 흐름에서 확인해야 한다. 기존 준비본은 이번 새 합성 실험으로 대체 검증되지 않는다.
- 패턴 검사와 JSON 해석이 모든 형식·모든 비밀정보를 찾아내는 것은 아니다. 출판 대상으로 고른 원본을 따로 검토해야 한다. 비협력 프로세스가 매 파일 접근 사이에서 파일시스템을 바꾸는 모든 경쟁이나 전원 손실까지 이번 수정으로 보장한다고 해석하지 않는다.
