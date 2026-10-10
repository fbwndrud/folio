# 순서 없는 작품 (N4, `order: none`)

사전·매뉴얼·요리책처럼 아무 데서나 펼쳐 읽는 작품이다. 앞뒤 순서가 없으니 "앞에서 정한 사실" 대신 항목끼리 잇는 링크를 기준으로 본다.

## 만들기

- 새 작품: `folio_init { root, title, packs: ['knowledge'], preset: 'reference' }`. 레벨은 part → entry, `order: none`, 세트는 `knowledge.basic`·`knowledge.unordered`다.
- 이미 있는 작품: work.yaml의 `order: none`(작품 전체) 또는 `order: { default: linear, levels: { entry: none } }`(레벨마다 — 예: 본문 레벨은 linear, entry 레벨만 none). 순서를 바꿀지는 작가가 정한다. 호스트가 work.yaml을 고치지 않는다.
- 게임북의 `branching`은 앞뒤를 따지는 검사가 순서 없음처럼 `not_applicable`이지만, 연결된 노드의 사건(`linkedEvents`)과 `requiresOrder: none` 검사(`knowledge.linked-consistency`)는 아직 없다. 분기 경로 검사는 뒤 마일스톤(N7)이다.

## 항목 잇기 — 앞머리 `links`

```yaml
links:
  - to: membrane      # 가리키는 노드 id
    kind: see-also    # 없으면 see-also
    label: 세포막
```

- 가리키는 노드가 없으면 `LINK_BROKEN`, 자기 자신이면 `LINK_SELF`다. 작품은 그대로 열린다. 엔진은 알리기만 하고 고치지 않는다.

## 검사

- 앞뒤를 따지는 검사는 순서 없는 노드에서 `not_applicable`로 영수증에 남는다. `core.promise-order`, 정의 전 사용, 선수 개념 순서, 소설의 순서 검사가 여기에 든다. 실패도 통과도 아니다. 읽는 순서 안의 노드에서는 그대로 돈다. 잠금이 꺼진 것이 아니다.
- `knowledge.unordered` 세트(추천: `reference` 작품): `knowledge.links`(노드 링크), `knowledge.cross-refs`(블록 참조·각주·자료 인용), `knowledge.term-consistency`(용어 통일), `knowledge.linked-consistency`(연결 항목과 맞춤, 모델). 모두 실험·참고 의견이다. 작가가 세트를 고른다.
- 팩 검사의 `requiresOrder: none`은 `order: none` 레벨(또는 그 아래)의 노드에서만 돈다는 뜻이다. `branching` 노드와 linear 작품의 앞머리·뒷부분 노드에서는 `not_applicable`이다. `knowledge.linked-consistency`가 그렇다.

## 검사 범위 — 연결된 노드의 사건

- 순서 없는 노드의 요청에는 앞 사건(`priorEvents`)이 비어 있다. 대신 이 노드가 `links`로 가리키는 노드(한 단계)의 사건이 `linkedEvents`로 온다. 이 원고 범위의 엔티티(나온 엔티티·선수 개념, `promiseScope`가 켜졌으면 약속)의 사건만 오고, 있을 때만 온다.
- `linkedEvents`는 "앞에서 일어난 일"이 아니다. 연결된 항목과 어긋나지 않게 맞추는 데만 쓴다.
- 연결된 노드의 사건이 바뀌면 커밋된 이 노드가 `folio_status`의 `stale`(다시 확인 필요)에 뜬다. 자동으로 고치지 않는다.

## 다음 노드

`folio_run { node: 'next' }`는 순서 없는 작품에서도 트리 차례(폴더 순서)로 다음 노드를 고른다. 링크는 차례를 바꾸지 않는다. 다른 항목을 먼저 쓰려면 노드 id를 준다.

## 찾기 — `folio_find { root, query: 'links', id }`

`id`는 노드 id(그 노드와 자손) 또는 `'*'`(작품 전체)다. 파일에서 바로 읽는다. 결과 필드는 다음과 같다.

- `links`: 범위 안 노드의 링크. 한 줄은 `from`, `to`, `kind`, `label`, `index`(그 노드 links 안의 차례), `valid`(가리키는 노드가 있는가)다.
- `backlinks`: 범위 안 노드를 가리키는 다른 노드의 링크.
- `problems`: 범위 안 링크의 문제.

## 상태 — `folio_status`의 `links`

`{ problems, total }`. `total`은 링크 수다. 문제는 작가에게 보여 준다.

| 코드 | 뜻 |
|---|---|
| `LINK_BROKEN` | 링크가 없는 노드를 가리킨다 |
| `LINK_SELF` | 링크가 이 노드 자신을 가리킨다 |

## 기능 토글 (work.yaml `features`)

- `links`: `folio_find`의 `links`와 `folio_status.links`. 끄면 `FEATURE_DISABLED`·`null`이고 `linkScope`도 꺼진다.
- `linkScope`: 순서 없는 노드가 연결된 노드의 사건을 모은다(`links` 필요). 바꾸면 열린 실행은 검사부터 다시 돈다.

둘 다 기본 켜짐이다. 끄는 것은 작가가 정한다.

## 오류일 때

- `NODE_NOT_FOUND`: `id`가 노드도 `'*'`도 아니다.
- `FEATURE_DISABLED`: 작가가 끈 기능이다. 켤지는 작가에게 묻는다.
