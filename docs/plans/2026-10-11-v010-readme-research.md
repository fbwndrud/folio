# Folio 0.1.0 README와 첫 사용 조사

조사일: 2026-10-11. 공식 저장소의 README와 공식 문서만 비교했다. 아래 개선안은 문서 구조에 관한 판단이며, 비교 프로젝트의 성능이나 Folio의 안정성을 보증하지 않는다. 별점·사용자 수·다운로드 수는 비교하지 않았다.

## 결론

README는 개발 기록보다 사용자가 얻는 결과를 먼저 보여 주는 편이 좋다. Folio에서는 “AI와 만든 원고·그림·자료를 정리하고, 변경과 검토 기록을 확인한 뒤 책으로 내보낸다”를 첫 화면에 놓는다. 이어 예시 화면, 설치, AI에 보낼 첫 요청, 결과 확인, 한계 순으로 안내한다. 아키텍처와 세부 도구 응답은 별도 문서로 옮겨도 정확성을 잃지 않는다. 이 순서는 사용 목적과 실행 경로를 직접 안내하는 [Aider README](https://github.com/Aider-AI/aider#readme), 다운로드와 화면을 앞에 두는 [Logseq README](https://github.com/logseq/logseq#readme), 사용 문서와 개발 문서를 나누는 [Joplin README](https://github.com/laurent22/joplin#readme)를 참고한 제안이다.

## 비교 대상과 가져올 점

| 프로젝트 | 공식 문서에서 확인한 구조 | Folio에 적용할 점 | 그대로 가져오지 않을 점 |
|---|---|---|---|
| MCP reference servers / Filesystem | reference 목적과 production 한계를 먼저 명시한다. 서버 실행만으로는 부족하며 호스트 연결이 필요하다고 설명한다. Filesystem 문서는 Claude Desktop과 VS Code 설정을 구분한다. [Servers](https://github.com/modelcontextprotocol/servers#readme), [Filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem#readme) | “MCP를 지원하는 AI 프로그램이 필요하다”와 엔진/호스트의 책임을 짧게 설명한다. 설치 후 실제 도구 연결 확인을 넣는다. 호스트별 설정은 연결 문서에서 구분한다. | Folio의 폴더 접근이 Filesystem 서버와 같은 제한 모델이라고 설명하면 안 된다. 비교 서버의 npx 명령·버튼을 Folio용으로 복제하지 않는다. |
| Logseq | 상단에 문서·다운로드 링크가 있고, 사용 목적 설명 뒤 데모와 첫 사용 단계가 나온다. 개발 환경 안내는 기여 항목에 있다. DB beta/관련 alpha 상태와 백업 필요도 구분한다. [README](https://github.com/logseq/logseq#readme) | 읽기 전에 볼 수 있는 합성 예시 화면, 실제 릴리스 다운로드, 첫 사용과 개발 체크 분리, 현재 안정성 표시를 가져온다. | 다수 배지·이모지·과장된 생산성 문구는 필요 없다. 설치가 끝나면 곧바로 쓸 수 있는 독립 앱인 것처럼 Folio를 소개하지 않는다. |
| Joplin | README에서 노트·Markdown·검색·오프라인 접근·가져오기를 설명한 뒤 도움말로 연결한다. 설치 문서는 desktop/mobile/terminal과 운영체제를 구분하고, 비공식 배포의 지원 경계도 적는다. [README](https://github.com/laurent22/joplin#readme), [Installation](https://joplinapp.org/help/install/) | 저장 형식, 내 컴퓨터에서 여는 화면, 기존 자료와 내보내기를 사용 결과 중심으로 설명한다. 지원 환경과 배포본/소스 설치를 나눈다. | Folio에 동기화·모바일 앱·클라우드 기능이 있는 것처럼 다른 제품의 설명을 옮기지 않는다. 후원·커뮤니티 링크를 많이 늘리지 않는다. |
| Aider | 한 문장 목적 → 기능 → 짧은 설치·시작 명령 → 사용·문제 해결·FAQ·릴리스 링크로 이어진다. 사용 문서는 실제 대화 요청과 파일을 추가하는 행동을 보여 준다. [README](https://github.com/Aider-AI/aider#readme), [Usage](https://aider.chat/docs/usage.html) | 사용자가 AI에게 무엇을 말하면 되는지, 그 뒤 어떤 화면과 파일을 얻는지 보여 준다. 첫 사용 명령은 한 경로만 선택하고 나머지는 연결 문서로 보낸다. | 모델별 추천 목록은 쉽게 낡으므로 Folio README에 넣지 않는다. 추천사·극적인 성능 문구를 근거 없이 만들지 않는다. |

각 README는 영어로 접근 가능한 진입점이다. Folio의 영어 설명은 한국어 중간에 들어가 있으므로, 완결된 영어 README와 한국어 README를 상단에서 서로 연결하는 편이 낫다. 이는 비교 사례의 접근 방식을 참고한 제안이며, 각 프로젝트에 한국어 README가 있다고 주장하는 것은 아니다. [Aider](https://github.com/Aider-AI/aider#readme), [Joplin](https://github.com/laurent22/joplin#readme), [Folio 조사 시점 README](../../README.md)

## 현재 README에서 막히는 지점

아래 행 번호는 수정 전 조사 시점의 README를 기준으로 한다. 나중에 README가 수정되면 항목 제목과 내용으로 찾는다.

| 우선순위 | 현재 내용과 근거 | 초보자가 겪는 문제 | 개선 |
|---|---|---|---|
| 높음 | 3–9행: 목표·아키텍처 초안·수직 경로·코드 현황 조사로 시작한다. [README](../../README.md) | 무슨 일을 할 수 있는지보다 개발 경위를 먼저 읽게 된다. | 지금 가능한 작업을 2문장으로 설명하고 설계 문서는 하단 개발 문서로 옮긴다. |
| 높음 | 25–33행: `setup`, `check`, `production:verify`를 첫 실행 경로로 안내한다. 마지막 명령은 임시 결과를 정리한다고 적혀 있다. [README](../../README.md) | 검증 성공 뒤에도 자기 눈으로 볼 예시 작품이 남지 않는다. | 처음에는 합성 예시를 새 폴더에 보존하고 Studio를 여는 명령을 제시한다. 테스트 명령은 기여 안내로 옮긴다. |
| 높음 | 47행부터 영어 본문이 별도 언어 선택 없이 시작한다. 52행은 화면 라벨이 영어라고 설명한다. [README](../../README.md) | 언어가 갑자기 바뀌며 한국어/영어 선택 기능을 발견하기 어렵다. | `README.md`와 `README.ko.md`로 분리하고 화면의 한국어/영어 선택을 양쪽에 적는다. 문서 번역이 없는 링크는 해당 언어를 표시한다. |
| 높음 | 106행 이후에야 MCP 등록이 등장하고, 초기 코드에는 AI에게 보낼 첫 요청이 없다. [README](../../README.md) | 검증 명령과 실제 AI 집필의 관계를 이해하기 어렵다. | 첫 사용 단계에서 호스트 연결 안내를 먼저 연결하고 짧은 인터뷰 요청을 넣는다. |
| 중간 | 118–125행: 인자 검증·응답 스키마·`null` 응답 설명이 본문에 있다. [README](../../README.md) | 사용자가 알 필요 없는 도구 구현 세부가 흐름을 끊는다. | 기존 상세 연결/도구 문서로 옮기고 README에는 관련 문서 링크만 남긴다. |
| 중간 | 36–46행: 안내 링크가 열 개 이상 연속된다. [README](../../README.md) | 첫 작품·그림·복구·개발 문서의 우선순위가 같다. | “처음 쓰기 / 자료와 그림 / 문제 해결 / 개발”로 묶는다. |
| 중간 | 예시 준비본과 npm private 상태가 여러 위치에 적혀 있다. [README](../../README.md), [예시 문서](../examples.md), [연결 문서](../connect.md) | 공개 릴리스 뒤 일부 문서가 준비본 상태로 남으면 설치 방법이 서로 어긋난다. | 게시 결과를 확인한 후 버전·실제 배포 파일·저장소 주소를 한 번에 갱신한다. 게시 전에는 공개 성공을 적지 않는다. |
| 중간 | 실제 화면 이미지가 README에 없다. [README](../../README.md) | 일관성 확인과 근거 추적이 어떤 화면인지 판단하기 어렵다. | 합성 fixture로 만든 Studio 화면 1장을 붙이고, 원고·검토·내보내기 중 보이는 기능만 설명한다. 실제 작품/생성 이미지 파일은 저장소에 커밋하지 않는다. [저장소 규칙](../../AGENTS.md) |

## 추천 README 구성

1. **제목과 언어 링크.** 영어/한국어를 즉시 선택하게 한다. 설치·예시·사용법·버그 신고 링크는 많아도 네 개로 시작한다. 앞부분에 문서와 다운로드를 두는 [Logseq](https://github.com/logseq/logseq#readme)를 참고한 제안이다.
2. **무엇을 하는가.** 원고·그림·자료, 설정과 근거, 변경 이후 재검토, Web/EPUB라는 결과를 설명한다. 기존 [Folio 기능 안내](../studio.md)를 요약하고, 한 문장 사용 목적을 내세우는 [Aider](https://github.com/Aider-AI/aider#readme)의 방식을 참고한다.
3. **화면과 예시.** 작은 합성 Studio 화면에 “모의 AI 응답과 승인으로 만든 예시”라는 캡션을 붙인다. 전체 생성 작품은 별도 릴리스 ZIP으로 연결한다. 화면을 보고 판단하게 하는 구성은 [Logseq 데모](https://github.com/logseq/logseq#readme), 예시 구분은 [Folio 예시 정책](../examples.md)을 따른다.
4. **첫 실행.** Node.js 권장 버전, 실제 배포/소스 설치 한 경로, 새 출력 폴더에 합성 예시 생성, Studio 실행을 순서대로 넣는다. npm에 게시하지 않았다면 `npx folio`를 제안하지 않는다. 설치 경로를 구분하는 [Joplin 설치 문서](https://joplinapp.org/help/install/)와 기존 [Folio 설치 문서](../production.md)를 참고한다.
5. **자기 작업 시작하기.** 호스트 등록 → 지침 연결 → 도구 확인 → 작업 폴더 선택 → 인터뷰 요청 순서를 짧게 적는다. 서버 실행과 호스트 설정을 구분하는 [MCP 공식 README](https://github.com/modelcontextprotocol/servers#readme), 대화 예시를 보여 주는 [Aider Usage](https://aider.chat/docs/usage.html), 기존 [Folio 연결 안내](../connect.md)를 따른다.
6. **현재 지원과 한계.** 호스트 AI/이미지 도구가 생성한다는 점, 실제 작가 승인, 자기검토 표시, draft export, 선택 임베딩 설치, 온라인 공동 편집 미제공을 작게 묶는다. 현재 기능을 넘어서는 DB/Wiki/영상 약속은 하지 않는다. [Folio 호환성](../compatibility.md), [MCP reference 범위 표시](https://github.com/modelcontextprotocol/servers#readme)를 참고한다.
7. **문서와 도움.** 첫 작품·그림·자료 / 연결·복구 / 기여·테스트 / 보안·라이선스로 나눈다. 운영할 준비가 된 GitHub Issues와 SECURITY 문서를 사용하며 새 Discord·포럼이 있는 듯 쓰지 않는다. 사용 문서와 기여·문제 해결 경로를 나누는 [Joplin](https://github.com/laurent22/joplin#readme)과 [Aider](https://github.com/Aider-AI/aider#readme)를 참고한다.

## 첫 실행 예시 제안

아래는 현재 문서에 있는 명령을 조합한 제안이다. README에 넣기 전에 새 복사본에서 실제 명령과 출력 폴더를 검증해야 한다. `story` 명령이 작품별 하위 폴더를 만드는지 확인하고 Studio 인수는 실제 출력과 일치시킨다. [합성 예시 안내](../../examples/README.md), [Studio 설치 안내](../production.md)

```sh
npm run setup
node examples/run.js story --out ./my-first-example
npm run viewer -- "./my-first-example/story"
```

예상 결과도 짧게 적는다: “터미널에 표시된 주소를 열면 원고와 검토 기록을 볼 수 있습니다. 이 예시의 글과 AI 응답은 미리 정해져 있고 승인은 모의 처리입니다.” 승인 상태 설명은 기존 [예시 정책](../examples.md)을 유지한다.

호스트 연결 후 첫 요청 예시는 다음처럼 사람이 원하는 작업을 말하게 한다. 이 문장은 도구 호출 성공을 보장하는 테스트가 아니라 사용법 제안이다. 위치를 먼저 확인하고 인터뷰부터 시작하는 기존 [연결 안내](../connect.md)와 [첫 작품 쓰기](../writing-guide.md)의 흐름을 따른다.

> Folio로 짧은 이야기를 쓰고 싶어. 사용할 새 작품 폴더를 먼저 확인하고, 독자와 주인공, 분위기를 질문해 줘. 정한 설정과 원고를 함께 관리하고 초안을 화면에서 보여 줘. 채택 여부는 내가 결정할게.

## 문체 제안

다음은 조사자가 작성한 Folio 문장 예시다. 비교 프로젝트의 문구를 복사한 것이 아니다. 내용 근거는 [현재 README](../../README.md), [자료 관리](../resources.md), [그림 관리](../assets.md), [Studio](../studio.md)에 둔다.

| 현재 표현 | 바꿀 표현 | 이유 |
|---|---|---|
| “범용 확장은 … 첫 수직 경로를 구현했다” | “글·그림·자료의 원본과 수정본을 함께 관리합니다.” | 개발 단계를 사용 결과로 바꾼다. 범용 기능은 상세 문서로 연결한다. |
| “Folio의 목표는 … 도구다” | “Folio는 AI와 작업할 때 쓰는 원고·그림·자료를 정리하는 로컬 도구입니다.” | 목표 대신 현재 쓰임을 말한다. |
| “호스트 AI가 … 요청에 답하고” | “연결한 AI 프로그램이 글을 쓰고 그림을 만듭니다. Folio는 결과와 검토 기록을 보관합니다.” | 사람에게 생소한 ‘호스트’를 첫 문장에 두지 않는다. 실제 생성 가능 범위는 호스트에 달린다는 단서를 유지한다. |
| “검사한 본문과 영수증” | “어떤 글을 검사했고 무엇을 승인했는지 함께 기록합니다.” | 영수증 비유를 먼저 정의해야 하는 부담을 줄인다. 상세 도구 문서에서는 정확한 용어를 유지한다. |
| “최첨단 AI-native Creative Data & Execution Platform” 같은 새 소개 | 사용하지 않는다. | 검증하지 않은 미래 기능과 홍보 느낌을 동시에 늘린다. |

한 문장에서 세 가지 이상을 나열하지 않고, “원본 등록 → Projection stale → reindex”는 “자료를 바꾸면 다시 확인해야 할 부분을 표시합니다”로 먼저 설명한다. 그 뒤 필요한 사용자가 [자료 관리 계약](../resources.md)이나 [변경·추적 안내](../tracking.md)를 읽게 한다. 추상 명사와 근거 없는 ‘자동으로 알아서’, ‘완벽’, ‘모든 호환’을 줄이고 실제 행동·출력·승인 경계를 쓴다. 이는 문체 편집 제안이지 비교 OSS의 객관적 우수성 주장이나 품질 측정이 아니다.

## 반영 뒤 확인할 것

- README의 첫 실행을 빈 폴더에서 그대로 따라 하고 Studio까지 연다. 명령에 표시된 폴더가 실제 출력과 일치해야 한다. [예시 실행 계약](../../examples/README.md)
- 공개 주소가 생긴 뒤 릴리스 다운로드와 버그 신고 링크를 열어 확인한다. 게시 전 내부 준비본 주소를 공개 다운로드처럼 표시하지 않는다. [Folio 예시 배포 정책](../examples.md)
- 영어/한국어의 지원 범위, 설치 명령, 승인 한계, 버전이 같은지 비교한다. 번역하지 않은 상세 문서는 언어를 표시한다. [현재 Folio README](../../README.md), [UI 용어 안내](../user-language.md)
- 문서 첫 화면의 이미지는 합성 입력만 사용한다. 사용자 작품·실제 생성 결과를 문서 이미지라는 이유로 Git에 포함하지 않는다. [저장소 규칙](../../AGENTS.md)
- source install과 준비된 tarball install을 섞지 않는다. 준비된 패키지에서는 viewer 빌드 setup을 반복하지 않는다. [Folio 설치 문서](../production.md)
- “API 키 불필요”는 Folio 엔진 설정에 관한 설명임을 명시한다. 연결한 AI 프로그램의 구독·키·이미지 도구 조건은 별개다. [Folio 연결 문서](../connect.md)

README·코드·Git·릴리스 파일은 이 조사 작업에서 수정하지 않았다. 본 파일의 제안 반영과 검증은 게시 전 점검 담당 작업에서 수행한다.
