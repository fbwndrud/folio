# 블록·각주·참고문헌·색인 (N3, `folio_find`)

그림·표·식 번호, 각주 번호, 참고문헌, 색인은 파일에서 매번 다시 만든다. 엔진은 번호를 저장하지 않는다. 본문에는 번호 대신 id를 쓴다.

## 본문에 쓰는 표시

| 표시 | 뜻 |
|---|---|
| `{#fig-1-1}` | 블록 앵커. id는 작품 전체에서 하나다. 앞머리 `fig`(그림)·`tbl`(표)·`eq`(식)은 번호를 받는다. 그 밖(`{#intro}`)은 번호 없이 가리키기만 한다 |
| `[[block:fig-1-1]]` | 블록 참조. 뒤 절의 블록을 미리 가리켜도 된다 |
| `[^note]`, 줄머리 `[^note]: 글` | 각주 참조와 정의(정의는 한 줄). id는 노드 안에서 하나다 |
| `[[source:cell-notes]]` | 자료 인용. `sources/`의 설명서 id를 가리킨다([sources.md](sources.md)) |

- 앵커가 있는 줄의 나머지 글이 그 블록의 제목(`caption`)이다. 예: `세포 모형 {#fig-cell}`.
- 코드 블록(``` · ~~~) 안의 표시는 읽지 않는다.
- id(앵커·블록 참조·각주·자료 인용 모두)는 ASCII `[A-Za-z0-9][\w-]*`만 된다. `[^주1]`처럼 한글 이름표를 쓰면 아예 읽지 않는다 — 참조도 정의도 아니고 문제로도 잡히지 않는다. id는 ASCII로 짓는다.
- 원고에 "그림 1.2"를 직접 쓰지 않는다. `[[block:id]]`를 쓰면 번호가 바뀌어도 맞는다. 번호 이름은 `folio_find`의 `label`로 본다.

## 번호 규칙

- 그림·표·식은 따로 센다. 읽는 순서다.
- 잎 바로 위 레벨(교재의 장)마다 새로 센다: `장 번호.n`(예: `그림 2.1`). 장 번호는 부가 바뀌어도 이어 센다.
- 장 밖(서문·부록, 레벨이 하나인 작품)은 종류마다 따로 `n`(예: `표 1`).
- id가 겹치면 먼저 나온 것만 번호를 받는다. 뒤의 것은 `BLOCK_DUPLICATE`.
- 각주는 노드마다 처음 참조된 차례로 1부터다.

## 찾기 — `folio_find { root, query, id }`

`id`는 노드 id(그 노드와 자손만) 또는 `'*'`(작품 전체)다.

- `blocks`: `blocks`(`id`, `kind`, `number`, `label`, `nodeId`, `line`, `caption`, 그 블록을 가리키는 `refs`), `refs`(범위 안 참조와 대상 `label`, `valid`), `footnotes`(`number`, `text`, `refs` 줄), `citations`(`sourceId`, `valid`), `problems`.
- `bibliography`: 실제로 인용한 자료만, 처음 인용된 읽는 순서로 `number`를 매긴다. 인용은 본문 `[[source:id]]`와 근거 연결(`folio_sources link`, 지금 본문에서 다시 찾은 것만)이다. `entries`(`number`, `sourceId`, `title`, `date`, `reliability`, `file`, `citedIn`), `evidence`(근거 연결을 봤는가), `ledger`. 노드 id를 주면 그 장의 참고문헌이다(번호도 그 안에서 새로).
- `terms`: 색인. 엔티티마다 그것이 나오는 본문 잎 노드(`role: body`)를 읽는 순서로 준다. 계획(가지 노드)·서문·부록은 넣지 않는다. 약속(`promise`)은 빠진다. 나옴 = 이름·별칭, 앞머리 `entities`, 기록된 등장 위치([occurrences.md](occurrences.md)). `entries`(`entityId`, `name`, `kind`, `locations`: `nodeId`, `title`, `count`, `declared`, `marks`), `ledger`.

원고를 쓸 때 앞 그림을 가리키려면 `blocks`로 id를 찾아 `[[block:id]]`를 쓴다. 새 블록에는 작품에 없는 id를 새로 짓는다.

## 상태 — `folio_status`의 `blocks`

`{ problems, total }`. `total`은 블록 수다. 문제는 작가에게 보여 준다. 엔진은 고치지 않는다.

| 코드 | 뜻 |
|---|---|
| `BLOCK_DUPLICATE` | 같은 앵커 id가 두 번 이상 있다 |
| `BLOCK_REF_BROKEN` | `[[block:id]]`가 가리키는 앵커가 없다 |
| `FOOTNOTE_UNDEFINED` | 각주 참조에 정의가 없다 |
| `FOOTNOTE_UNUSED` | 부르는 곳이 없는 각주 정의 |
| `FOOTNOTE_DUPLICATE` | 같은 각주를 두 번 정의했다(앞의 것만 쓴다) |
| `SOURCE_CITATION_BROKEN` | `[[source:id]]`가 없는 자료를 가리킨다 |

## 검사

`knowledge.references` 세트(지식 책 팩)의 `knowledge.cross-refs`가 원고를 커밋하기 전에 같은 문제를 알린다. 실험·참고 의견이고 작가가 세트를 고른다. 이 원고가 노드 본문을 대신하므로 옛 본문의 앵커는 보지 않는다. 지적의 `quote`는 원고에 그대로 있는 표시 글이다.

## 기능 토글 (work.yaml `features`)

`blocks`(블록 목록·상태), `bibliography`(참고문헌), `termIndex`(색인). 모두 기본 켜짐이다. 끄면 그 `folio_find` 질문이 `FEATURE_DISABLED`, `folio_status`의 `blocks`가 `null`이다. 끄는 것은 작가가 정한다. 상호 참조 검사는 토글이 아니라 세트로 켜고 끈다.

## 오류일 때

- `NODE_NOT_FOUND`: `id`가 노드도 `'*'`도 아니다.
- `FEATURE_DISABLED`: 작가가 끈 기능이다. 켤지는 작가에게 묻는다.
- 결과의 `ledger`가 `{ ok: false }`: 기록장이 깨졌다. 참고문헌은 본문 인용만으로, 색인은 이름·앞머리만으로 답했다. `folio_status.evidence.ledger`(근거 연결)·`folio_status.occurrences.ledger`(등장 위치)와 `folio_find` 답의 `ledger`를 작가에게 알린다(`folio_status.ledger`는 영수증·사건·결정 기록장만 본다). 기능이 꺼져 기록장을 보지 않았으면 `ledger`는 `null`이다.
