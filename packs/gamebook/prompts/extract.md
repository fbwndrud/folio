원고(draft)에서 사건과 등장을 뽑아 JSON 하나로만 답한다.

```json
{
  "events": [
    { "entityId": "doyun", "kind": "state", "data": { "vital": "dead" }, "quote": "원고 속 문장 그대로" },
    { "entityId": "hana", "kind": "address", "data": { "term": "아가씨" }, "quote": "원고 속 문장 그대로" }
  ],
  "appearances": ["doyun"],
  "mentions": ["hana"],
  "occurrences": [{ "entityId": "doyun", "kind": "appearance", "quote": "원고 속 짧은 인용" }]
}
```


- `entityId`는 entities 목록의 id만 쓴다. 없는 인물은 적지 않는다.
- `kind`:
  - `state` — 생사·상태 변화. `data.vital`은 `dead` 또는 `alive`. 물건·장소가 부서지거나 사라지면 `data.exists: destroyed`, 되돌아오면 `data.exists: restored`. 인물의 성별이 바뀌면 `data.gender`.
  - `address` — 누가 이 인물을 성별이 드러나는 호칭(도련님, 아가씨, 형, 누나 등)으로 불렀다. `entityId`는 불린 인물, `data.term`은 호칭 그대로.
  - `promise.planted` · `promise.advanced` · `promise.misdirected` · `promise.resolved` · `promise.closed` · `promise.parked` · `promise.reopened` — 약속(떡밥)의 단계. `promise.mentioned` — 약속을 지나가며 언급만 함(단계는 그대로).
  - 약속을 갚았으면(`promise.resolved`) 갚은 장면을 8자 이상 `quote`로 적는다.
- `state`(생사·존재) 사건과 `address` 사건에는 `quote`를 반드시 적는다. 인용 없는 되살림(`alive`)·되돌림(`restored`)은 인정되지 않는다.
- `quote`를 적으면 원고에 그대로 있는 문장이어야 한다.
- `appearances`는 장면에 직접 나오는 인물, `mentions`는 이름만 나오는 인물이다.
- 사건이 없으면 `"events": []`.
- 요청의 `occurrences.wanted`가 true면 `occurrences`에 등장 위치를 적는다. 없으면 적지 않는다.
  - `kind`는 `appearance`(장면에 직접 나옴) 또는 `mention`(이름·회상으로만 나옴).
  - `quote`는 원고에 그대로 있는 짧은 인용이다. 대명사·호칭("그녀는", "선장")도 된다. 같은 인용이 원고에 여러 번 있으면 `before`(바로 앞 글) 또는 `after`(바로 뒤 글)를 더해 한 곳을 가리킨다.
  - 틀린 인용이 하나라도 있으면 다시 묻는다.

선택 경로의 사건은 서로 합치지 않는다. complete가 false이거나 경로 자료가 미검증이면 한계를 명시한다. links·branching 앞머리는 작가가 적으며 원고에 포함하지 않는다.
