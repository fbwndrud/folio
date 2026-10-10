# 소설 검사 (novel 팩, M5)

소설 팩의 검사 세트 셋과 작가가 채우는 엔티티 필드, 추출 답에 넣는 사건 모양이다. 검사는 작가가 고른다 — 호스트는 추천만 하고 work.yaml 을 직접 고치지 않는다.

## 세트

| 세트 | 담는 것 | 기본 |
|---|---|---|
| `novel.basic`(소설 기본) | 죽은 인물 등장(hard), 고정 설정 위반(hard, 모델), 원고 검토, 윗계획 맞춤(block), 계획 이행, 파괴된 물건 재등장, 호칭과 성별, 내부 메타데이터 노출, 근거 없는 약속 해소, 약속 흐름 | 예 |
| `novel.serial`(웹소설 연재) | 회차 끝 당김(모델), 회차 끝 절단, 시간 도약 없음, 웹소설 문단 형식, 분량 부족, 설정 되풀이, 민감 표현, 잠든 약속 | 연재 프리셋 |
| `novel.style`(문체 유지) | 문장 리듬, 운율, 보여주기와 말하기, 상투 표현, 발화 동사 단조, 대사 비율, 시점 누설, 문체 기준 이탈 | 아니오(추천만) |

- M5 에서 옮겨 온 검사는 모두 실험(`experimental`)이고 참고 의견(advisory)이다. 작가만 `checks.<id>.severity: block` 으로 올릴 수 있다. hard 는 원래 있던 검사(`novel.dead-on-stage`, `novel.fixed-facts`)와 코어 잠금(`core.promise-order`, 심기 전 해소)뿐이다.
- 참고 의견은 자동 수정 사유가 아니다. 작가에게 보여 주고 판단을 맡긴다.
- 한국어 전용 검사: 운율, 보여주기와 말하기, 발화 동사 단조, 시점 누설, 호칭과 성별, 민감 표현, 시간 도약, 회차 끝 절단, 설정 되풀이.

## 엔티티 필드 (작가가 `entities/<종류>/<id>.md` 앞머리에 쓴다)

| 필드 | 어디에 | 쓰는 검사 |
|---|---|---|
| `gender: male` · `female` | 인물 | 호칭과 성별 |
| `narrator: true` | 시점 인물 하나 | 시점 누설(없으면 돌지 않는다) |
| `horizon: next` · `soon` · `arc` · `long` · `finale` | 약속 | 잠든 약속 — 읽는 순서로 2 · 5 · 10 · 16 · 24칸(맨 아래 칸 수) 움직이지 않으면 알린다. 없으면 10칸, `core: true` 면 8칸. 미뤄 둔(`parked`) 약속은 10칸 |
| `facts: [문장, ...]` | 아무 엔티티 | 설정 되풀이 |
| `styleAnchor: true` | 노드 앞머리(1~3개) | 문체 기준 이탈 — 표시한 노드의 문단 호흡·대사 비율이 기준이다. 없으면 돌지 않는다 |

## 추출 답의 사건 (`produces: events`)

- `state` + `data.exists: destroyed | restored` — 물건·장소가 부서지거나 되돌아옴. `quote` 필수. 인용 없는 되돌림은 인정되지 않는다.
- `state` + `data.gender` — 인물의 성별이 바뀜.
- `address` + `data.term` — 이 인물(`entityId`)을 성별이 드러나는 호칭으로 부름. `quote` 필수.
- `promise.reopened` — 닫힌 약속을 다시 엶. `promise.mentioned` — 지나가는 언급(단계는 그대로, 움직임으로 치지 않음).
- `promise.resolved` 는 갚은 장면을 8자 이상 `quote` 로 적는다.

## 잠든 약속과 `promiseScope`

- `work.yaml` `features.promiseScope`(기본 켜짐)는 이 노드에 안 나온 약속의 앞 사건도 검사와 요청에 싣는다. 그래서 오래 잊힌 떡밥을 알릴 수 있다.
- 끄면 잠든 약속은 이 노드에 나온 약속만 본다. 심기 전 해소 잠금(`core.promise-order`)은 어느 설정에서도 돈다.
- 약속이 움직여도 다른 노드가 "다시 확인 필요"가 되지는 않는다(범위와 참고 버전은 넓히지 않는다).

## 작품별 검사 설정 (`checks.<id>.config`)

- 팩 검사에 설정(`config`)이 있으면 work.yaml `checks.<id>.config`로 작품마다 바꾼다. 팩 값 위에 겹친다 — 지도는 키마다 겹치고, 목록은 통째로 바꾼다. 적은 검사는 세트에 없어도 켜진다.
- 바꿀 수 있는 키는 팩 설정에 있는 키뿐이다. 지금 값은 `folio_config`의 `checks[].config`에서 본다. 값이 틀리면(예: 목표가 양의 정수가 아님) 검사가 `*_CONFIG_INVALID` 지적 하나를 낸다.
- 거부되는 것(`CONFIG_INVALID`): 모르는 필드(`CHECK_FIELD_UNKNOWN`), 팩 설정에 없는 키(`CHECK_CONFIG_KEY_UNKNOWN`), 설정이 없는 검사·모델 검사(`CHECK_CONFIG_UNSUPPORTED`), hard 검사(`HARD_CHECK_CONFIG_LOCKED`), 잠긴 코어 검사(`LOCKED_CHECK_OVERRIDE`), `features.checkConfig: false`인 작품(`CHECK_CONFIG_DISABLED`).
- 설정은 검사 digest에 든다. 바꾸면 그 검사를 거친 커밋 노드가 `folio_status`의 `recheck`에 뜬다.

| 검사 | 키 | 값 |
|---|---|---|
| `novel.length` | `target`, `unit` | 목표 분량(양의 정수, 기본 없음 = 검사 안 함). `graphemes`(기본) · `chars` |
| `novel.sensitive` | `mode` | `adult`(기본) · `youth`(청소년 기준) |
| `novel.cliffhanger` | `when` | `always`(기본) · `arc-end`(아크 마지막 화만) |
| `novel.prosody` | `level` | `loose` · `normal`(기본) · `strict` |
| `novel.cliche` | `genre` | 없음(기본, 공통 목록) 또는 장르 id(`action`, `comedy`, `historical`, `mystery-thriller` 등) |
| `novel.dialogue-ratio` | `genre`, `range` | 장르 id 또는 `[최소, 최대]` 비율 |
| `novel.promise-dormant` | `spans`, `defaults` | 기한별 칸 수(`next` 2 · `soon` 5 · `arc` 10 · `long` 16 · `finale` 24), 기본 칸 수 |

```yaml
checks:
  novel.length: { config: { target: 5500 } }
  novel.sensitive: { config: { mode: youth }, severity: block }
  novel.promise-dormant: { config: { spans: { next: 3 } } }   # 나머지 기한은 팩 값 그대로
```

## `novel.style-drift` 는 `styleAnchor` 노드만 본다

- 기준 노드(`styleAnchor: true`)를 고쳐도 이미 검사를 마친 다른 노드가 "다시 확인 필요"로 바뀌지 않는다.
- 기준 노드가 읽는 순서로 더 뒤에 와도 된다.
