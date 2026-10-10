# Folio

[English](README.md) · [다운로드](https://github.com/fbwndrud/folio/releases/tag/v0.1.0) · [첫 작품 쓰기](docs/writing-guide.md) · [문제 신고](https://github.com/fbwndrud/folio/issues)

Folio는 AI와 작업할 때 쓰는 원고·그림·자료와 수정·검토 기록을 함께 보관하는 도구입니다. Studio에서 글을 읽고, 근거를 따라가고, 다시 확인할 부분을 볼 수 있습니다. 완성한 원고는 웹이나 EPUB으로 내보냅니다.

**0.1.0은 로컬 사용을 위한 초기 버전입니다.** 집필하려면 stdio MCP를 지원하는 AI 프로그램이 필요합니다. 연결한 AI가 글을 쓰고, 이미지 도구를 지원하면 그림도 만듭니다. Folio는 파일과 기록을 관리합니다. 화면은 한국어와 영어를 선택할 수 있습니다.

![합성 예시를 연 Studio](https://github.com/fbwndrud/folio/releases/download/v0.1.0/folio-studio-preview.jpg)

*미리 정한 합성 입력·AI 응답과 모의 승인으로 만든 예시 화면입니다.*

## 먼저 열어 보기

Node.js 24를 권장합니다. 지원 범위는 22.13 이상인 22 버전과 24·26 버전입니다. 소스를 받아 다음을 실행합니다.

```sh
git clone https://github.com/fbwndrud/folio.git
cd folio
npm run setup
node examples/run.js story --out ./my-first-example
npm run viewer -- "./my-first-example/story"
```

터미널에 표시된 주소를 열면 원고와 검토 기록을 볼 수 있습니다. 예시 작품은 `my-first-example/story`에 남습니다. 이 시연은 고정 응답과 모의 승인을 사용하므로 AI 계정이나 모델 다운로드가 필요 없습니다. 화면 서버는 Ctrl+C로 종료합니다. 다시 실행할 때는 새 출력 폴더를 선택하세요.

빌드된 Studio를 포함한 `folio-0.1.0.tgz`도 [GitHub 릴리스](https://github.com/fbwndrud/folio/releases/tag/v0.1.0)에서 제공합니다. 개발 도구 없이 설치하려면 [설치 안내](docs/production.md)를 따르세요. npm에는 게시하지 않습니다.

## 내 작품 시작하기

사용하는 AI 프로그램에 `node /absolute/path/to/folio/bin/folio-mcp.js`를 stdio MCP 서버로 등록합니다. `skill/folio/`도 그 프로그램의 스킬 기능으로 연결하세요. 스킬을 지원하지 않으면 프로그램의 지침 설정 기능으로 같은 내용을 전달합니다. [연결 안내](docs/connect.md)에서 연결 확인과 작품 폴더 선택 방법을 설명합니다.

연결한 다음에는 원하는 작업을 말하면 됩니다.

> Folio로 짧은 이야기를 쓰고 싶어. 사용할 새 작품 폴더를 먼저 확인하고, 독자와 주인공, 분위기를 질문해 줘. 정한 설정과 원고를 함께 관리하고 초안을 화면에서 보여 줘. 채택 여부는 내가 결정할게.

Folio는 어떤 내용을 검사했고 어느 버전을 채택했는지 기록합니다. 관련 자료·설정·그림이 바뀌면 다시 검토할 부분을 표시합니다. 반드시 해결해야 하는 검사 결과가 있으면 채택을 막습니다. 참고 의견만으로 본문을 고치지 않으며, 같은 AI의 검토는 자기검토로 표시합니다.

## 할 수 있는 일

| 하고 싶은 일 | Folio가 제공하는 것 |
|---|---|
| 작품을 순서대로 쓰기 | 목차, 단계별 집필, 검사, 작가 결정. 이야기·안내서·그림책용 기본 팩 |
| 중요한 설정 추적하기 | 인물·관계·복선과 사용자 지정 추적 규칙, 원문 근거 |
| 자료 정리하기 | 원본·수정본·파생 결과·메타데이터, 키워드 검색과 선택형 로컬 텍스트·이미지 벡터 검색 |
| 삽화 관리하기 | 그림 ID, 파일 hash, 버전, 검토 상태, 사용 위치. 생성은 연결한 AI 프로그램에서 수행 |
| 한눈에 확인하기 | 원고·검토·출판 화면, 변경 영향, 근거, 관계도, 추적 타임라인 |
| 읽을 수 있는 사본 만들기 | 웹 ZIP, EPUB, 읽기 전용 Studio 사본. PDF는 브라우저 인쇄 사용 |

원고는 Markdown, 설정은 YAML로 저장합니다. 작업과 결정은 작품 폴더 안의 추가만 되는 기록장에 남습니다. 폴더 전체를 백업하면 원고와 기록을 함께 보존할 수 있습니다.

선택 기능인 [벡터 검색](docs/embeddings.md)은 별도 Python과 고정된 Google 멀티모달 모델 가중치가 필요합니다. 설치본에는 포함하지 않습니다. AI의 해석이나 검사 결과도 틀릴 수 있습니다. 채택 기록은 작가의 선택을 나타내며 내용의 진실성을 보증하지 않습니다.

## 완성된 형태의 예시 보기

릴리스에 단편, 그림책, 초보자 실습책, 중편, AI 동향 조사서를 별도 ZIP으로 제공합니다. 각 ZIP에는 작품 사본, 사용한 그림, 웹·EPUB 판본, 읽기 전용 Studio가 들어 있습니다. ZIP을 풀고 README를 읽은 뒤 `node serve.mjs`로 화면을 여세요. [예시 안내](docs/examples.md)를 참고하세요.

앞의 네 예시는 모의 승인이고, 조사서는 작가 승인 대기 중인 초안입니다. 검토는 같은 AI 호스트가 수행했습니다. 작업 흐름과 결과 형태를 보여 주는 예시이며 작품 완성도를 독립적으로 평가한 결과는 아닙니다. 생성 작품은 릴리스에서 따로 내려받습니다. 소스와 엔진 패키지에는 작은 합성 예시만 포함합니다.

## 중요한 작업에 쓰기 전에

Folio는 내 컴퓨터에서 실행합니다. 호스팅·인증·공동 편집·자동 게시 서비스는 제공하지 않습니다. MCP 서버는 절대 경로를 받으므로 연결한 AI 프로그램에서 접근을 내가 고른 폴더로 제한해야 합니다. Studio와 예시 서버는 내 컴퓨터의 loopback 주소에서 실행합니다.

중요한 작품은 먼저 백업하세요. [운영 안내](docs/operations.md)는 진단·복원·중단된 작업을, [호환성](docs/compatibility.md)은 확인한 환경과 검증 범위를 설명합니다. AI 구독과 생성 비용은 연결한 프로그램의 조건을 따릅니다.

## 더 읽기와 참여

- **집필:** [첫 작품](docs/writing-guide.md), [그림](docs/assets.md), [자료](docs/resources.md), [Studio](docs/studio.md), [내보내기](docs/export.md).
- **설치와 복구:** [연결](docs/connect.md), [설치](docs/production.md), [운영](docs/operations.md).
- **개발:** [기여 안내](CONTRIBUTING.md), [테스트](docs/testing.md), [보안](SECURITY.md). `npm run check`와 기여 안내의 검증을 실행하세요. 문제 신고에는 합성 재현 데이터를 사용하고 개인 작품이나 인증 정보를 올리지 마세요.

Folio 코드는 [Apache-2.0](LICENSE)입니다. 별도 예시의 자체 제작 원고·그림·노트는 CC0-1.0이며, 제3자 인용·코드·상표는 제외합니다. Studio에는 제3자 라이선스와 소스 위치를 적은 `THIRD-PARTY-NOTICES.txt`를 포함합니다. [NOTICE](NOTICE)를 참고하세요.
