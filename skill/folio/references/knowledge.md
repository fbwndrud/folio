# 지식 책 (knowledge 팩)

교재·역사서·안내서를 쓴다. 소설과 같은 순서(계획 → 원고 → 사건 추출 → 검사 → 승인 → 커밋)로 돈다.

## 새 작품

`folio_init { root, title, packs: ['knowledge'], preset }`. `packs`를 빼면 소설 팩이다.

| 프리셋 | 레벨 | 기본 세트 |
|---|---|---|
| `textbook`(교재) | part → chapter → section | `knowledge.basic` |
| `history`(역사) | era → chapter → section | `knowledge.basic` |
| `guide`(안내서) | chapter → section | `knowledge.basic` |
| `sourcebook`(자료 책) | part → chapter → section | `knowledge.basic`, `sources.citations` — `packs: ['knowledge', 'sources']`로 만든다. 자료는 `folio_sources`로 넣고 맨 위 노드 앞머리 `sources`에 적으면 위층 계획 요청에 실린다([sources.md](sources.md)) |
| `reference`(사전·매뉴얼) | part → entry, `order: none` | `knowledge.basic`, `knowledge.unordered` — 앞뒤 검사는 해당 없음, 항목은 앞머리 `links`로 잇는다([order.md](order.md)) |

프리셋을 틀리게 주면 오류 `PRESET_UNKNOWN`의 `details.packPresets`에 팩별 프리셋이 온다. 작가에게 보여 주고 고르게 한다.

## 엔티티 (작가가 `entities/<종류>/<id>.md`로 쓴다)

- 종류(관례): `concept`(개념), `term`(용어), `example`(예제). 약속("5장에서 자세히", 학습 목표)은 `promise`.
- 선택 필드: `prerequisites: [id, ...]` — 이 개념을 정의하기 전에 먼저 정의돼야 하는 것. 이 팩을 쓰는 작품에서만 검사 범위를 넓힌다(팩 `scopeFields`). `avoid: [표기, ...]` — 쓰지 않기로 한 표기(용어 통일).
- `prerequisites`가 배열이 아니거나, 원소가 빈 값이 아닌 문자열이 아니거나, 자기 자신을 적었으면 `PREREQUISITE_INVALID`로 알린다. 없는 엔티티 id를 적었으면 `PREREQUISITE_UNKNOWN`으로 알린다.
- `avoid`가 배열이 아니거나 문자열 아닌 값을 담거나 그 엔티티의 이름·별칭, 또는 **다른** 엔티티의 이름·별칭과 같은 표기를 담으면 `TERM_AVOID_INVALID`로 알린다(다른 엔티티 이름과 같으면 이름 스캔에 항상 가려 결코 지적될 수 없기 때문이다).
- 잘못된 `avoid`는 용어 통일이 도는 모든 절에서 매번 `TERM_AVOID_INVALID`로 알린다(작품 전체 엔티티를 보기 때문). 잘못된 `prerequisites`는 그 엔티티를 정의(인용 있는 `term.defined`)하는 절에서만 `PREREQUISITE_INVALID`로 알린다. severity를 block으로 올렸다면 엔티티 파일을 고치기 전까지 그 절들이 막힌다.
- `folio_find { query: 'entity', ... }`로 이 필드들을 그대로 볼 수 있다(호스트가 지금 설정을 확인하는 법).

```markdown
---
id: membrane
kind: term
name: 세포막
prerequisites: [cell]
avoid: [세포 막]
---
세포의 바깥 경계.
```

## 추출 답 (`produces: events`)

- `term.defined`(처음 정의), `term.redefined`(다시 설명). `quote`는 둘 다 적는 게 좋다(그 문장이 근거가 된다). 다만 코어는 `quote`를 강제하지 않고,
  적었는데 원고에 그대로 없으면 코어가 거부한다(추출 답 자체가 오류가 된다). 검사(정의 전 사용·선수 개념 순서)는 `term.defined`의 인용만 정의로
  본다 — `term.redefined`는 보지 않는다. `term.defined`로 치는 인용은 그 개념의 이름(또는 별칭)이 들어 있어야 하고, 이름·별칭을 지우고도
  공백 아닌 글자가 2개 이상 남아야 한다(이름만 인용하면 정의로 치지 않는다).
- `promise.*` 사건은 소설과 같다. 심기 전에 거두면(`core.promise-order`) hard로 막히고 승인할 수 없다.
- `appearances`·`mentions`, `occurrences.wanted`는 소설과 같다([occurrences.md](occurrences.md)).

## 검사 세트 (작가가 고른다)

| 세트 | 검사 | 등급 |
|---|---|---|
| `knowledge.basic`(기본) | 정의 전 사용·선수 개념 순서(실험), 윗계획 맞춤, 원고 검토, 학습 목표 다룸 | 참고, 윗계획 맞춤만 block |
| `knowledge.terms` | 용어 통일(`avoid` 표기, 코드 블록 안은 안 봄, 실험) | 참고 |
| `knowledge.exercises` | 연습문제가 학습 목표를 덮는지(실험) | 참고 |
| `knowledge.references`(상호 참조, 추천: textbook·history·guide) | 상호 참조(블록 참조·앵커·각주·자료 인용)(`knowledge.cross-refs`, 실험) | 참고 |
| `knowledge.unordered`(사전·매뉴얼, 추천: reference) | 노드 링크(`knowledge.links`), 상호 참조, 용어 통일, 연결 항목과 맞춤(`knowledge.linked-consistency`, 모델, 순서 없는 노드만)(모두 실험) | 참고 |

- 새 검사는 참고 의견(advisory)으로 시작한다. 승인 질문의 `advisories`에 나온다. 참고 의견으로 원고를 고치지 않는다.
- 작가가 더 세게 원하면 work.yaml에 `checks: { knowledge.defined-before-use: { severity: block } }`처럼 올린다(`hard`는 안 된다). 그러면 지적이 막는 지적이 되고, 넘기려면 작가의 이유가 필요하다.
- 세트를 빼거나 `mode: off`로 끄면 그 검사는 돌지 않는다(영수증의 `appliedChecks`에서 빠진다). 코어 잠금(`core.promise-order`, 원고 hash, 영수증)은 세트와 상관없이 그대로다.
- 서문·부록(`role: front`·`back`)은 순서 검사(정의 전 사용·선수 개념 순서)를 건너뛴다. 용어 통일은 돈다.

세트 고르기와 work.yaml 쓰기 절차는 [checks.md](checks.md)를 따른다.
