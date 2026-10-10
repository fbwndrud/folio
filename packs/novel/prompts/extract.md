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

- `entityId`는 알려진 entities/catalog의 id 또는 아래 discoveries로 검증할 신규 대상의 id만 쓴다.
- `kind`:
  - `state` — 생사·상태 변화. `data.vital`은 `dead` 또는 `alive`. 물건·장소가 부서지거나 사라지면 `data.exists: destroyed`, 되돌아오면 `data.exists: restored`. 인물의 성별이 바뀌면 `data.gender`.
  - `address` — 누가 이 인물을 성별이 드러나는 호칭(도련님, 아가씨, 형, 누나 등)으로 불렀다. `entityId`는 불린 인물, `data.term`은 호칭 그대로.
  - `promise.planted` · `promise.advanced` · `promise.misdirected` · `promise.resolved` · `promise.closed` · `promise.parked` · `promise.reopened` — 약속(떡밥)의 단계. `promise.mentioned` — 약속을 지나가며 언급만 함(단계는 그대로).
  - 약속을 갚았으면(`promise.resolved`) 갚은 장면을 8자 이상 `quote`로 적는다.
- `state`(생사·존재) 사건과 `address` 사건에는 `quote`를 반드시 적는다. 인용 없는 되살림(`alive`)·되돌림(`restored`)은 인정되지 않는다.
- `quote`를 적으면 원고에 그대로 있는 문장이어야 한다.
- `appearances`는 장면에 직접 나오는 인물, `mentions`는 이름만 나오는 인물이다.
- 사건이 없으면 `"events": []`.
- 펼침면의 `그림 설명`은 제작 지시다. 그 지시를 이미 일어난 사건이나 생성된
  삽화 자산 기록으로 바꾸지 않는다. 사건·등장은 읽을 글의 실제 서술에 근거한다.
- 요청의 `occurrences.wanted`가 true면 `occurrences`에 등장 위치를 적는다. 없으면 적지 않는다.
  - `kind`는 `appearance`(장면에 직접 나옴) 또는 `mention`(이름·회상으로만 나옴).
  - `quote`는 원고에 그대로 있는 짧은 인용이다. 대명사·호칭("그녀는", "선장")도 된다. 같은 인용이 원고에 여러 번 있으면 `before`(바로 앞 글) 또는 `after`(바로 뒤 글)를 더해 한 곳을 가리킨다.
  - 틀린 인용이 하나라도 있으면 다시 묻는다.

- 요청에 `tracking`이 있으면 답에 `tracking`을 반드시 포함한다. 없으면 추가 추적을 하지 않는다.
  - `planRev`는 요청의 `tracking.plan.rev`다. 작품 목적·독자·우선순위·subjectKinds·criteria의 선언을 따라 관찰한다.
  - `discoveries: { subjects: [], criteria: [] }`, `observations: []`, `checked: []`를 모두 명시한다. 관찰이 없더라도 실제로 확인한 criterion ID는 checked에 적는다.
  - 신규 subject는 `{id,kind,name,aliases,body,data,evidence}`로 선언한다. catalog는 제한된 이름/ID 목록이며 incomplete면 전체 목록이 아니다. 기존 대상은 재발견하지 않는다.
  - 신규 criterion은 `{id,title,instruction,subjectKinds,valueType,behavior,appliesTo}`로 선언한다. 허용된 별도 위임만 쓰고 fixed 기준은 별도 사용자 결정에 맡긴다.
  - observation은 `{subjectId,criterionId,value,basis,evidence}`다. basis는 `explicit|attributed|inferred`이며 attributed에는 알려진 `perspectiveId`가 필수다. 관점·추정을 확정 사실로 승격하지 않는다.
  - evidence는 `{nodeId,textHash,quote,before?,after?}`다. nodeId는 요청 노드, textHash는 draft의 SHA-256, quote는 원고에 그대로 있는 1~500자다. 중복 인용은 바로 앞/뒤 문맥으로 한 곳을 가리킨다.
  - 선언의 valueType과 appliesTo를 따른다. entity/entity-list 값은 알려진 ID 또는 검증할 신규 대상 ID만 쓴다. 기준의 의미·위임 범위·사용자 결정을 만들어 넣지 않는다.
  - observation을 기존 events로 자동 변환하거나 새 검사를 만들지 않는다. 자산/이미지 검토는 기존 assets 경로를 쓰며 그림에서 본 내용에 가짜 본문 인용을 붙이지 않는다.
