원고(draft)에서 사건과 등장을 뽑아 JSON 하나로만 답한다.

```json
{
  "events": [
    { "entityId": "atp", "kind": "term.defined", "quote": "ATP는 세포가 쓰는 에너지 화폐다" }
  ],
  "appearances": ["atp"],
  "mentions": ["cell"],
  "occurrences": [{ "entityId": "atp", "kind": "appearance", "quote": "ATP는" }],
  "claims": [{ "quote": "ATP는 세포가 쓰는 에너지 화폐다", "sources": [{ "sourceId": "cell-notes", "quote": "ATP는 세포의 에너지 화폐로 불린다." }] }]
}
```

- `entityId`는 알려진 entities/catalog의 id 또는 아래 discoveries로 검증할 신규 대상의 id만 쓴다.
- `kind`:
  - `term.defined` — 이 원고가 개념·용어를 처음 정의한다.
  - `term.redefined` — 앞에서 정의한 것을 다시 설명한다.
  - `promise.planted` · `promise.advanced` · `promise.misdirected` · `promise.resolved` · `promise.closed` · `promise.parked` — 약속("5장에서 자세히", 학습 목표)의 단계.
- `term.defined`·`term.redefined`에는 `quote`를 반드시 적는다. 원고에 그대로 있고 그 개념의 이름(또는 별칭)이 든 정의 문장이다. 인용 없는 정의는 이 원고의 정의로 세지 않는다.
- `quote`를 적으면 원고에 그대로 있는 문장이어야 한다.
- `appearances`는 이 절이 설명하거나 쓰는 개념, `mentions`는 이름만 나오는 개념이다.
- 사건이 없으면 `"events": []`.
- 요청의 `occurrences.wanted`가 true면 `occurrences`에 등장 위치를 적는다. 없으면 적지 않는다.
  - `kind`는 `appearance`(설명하거나 씀) 또는 `mention`(이름만 나옴).
  - `quote`는 원고에 그대로 있는 짧은 인용이다. 같은 인용이 원고에 여러 번 있으면 `before`(바로 앞 글) 또는 `after`(바로 뒤 글)를 더해 한 곳을 가리킨다.
  - 코드 블록 안은 적지 않는다.
  - 틀린 인용이 하나라도 있으면 다시 묻는다.
- 요청의 `evidence.wanted`가 true면 `claims`에 이 원고의 사실 주장(숫자·연도·인과·남의 말처럼 근거가 필요한 문장)을 적는다. false거나 없으면 적지 않는다.
  - `quote`는 원고에 그대로 있는 주장 문장이다(코드 블록 밖). 원고에 여러 번 있으면 `before`·`after`로 한 곳을 가리킨다.
  - `sources`는 그 주장을 받치는 자료 인용 목록이다. `sourceId`는 요청 `sources`의 id(다른 자료는 `folio_sources list`로 찾는다), `quote`는 그 자료에 그대로 있는 문장이다. 글이 아닌 자료(PDF 등)는 자료 설명의 `spans` 인용을 그대로 쓴다.
  - 받치는 자료가 없으면 `"sources": []`로 적는다. 지어내지 않는다 — 근거 없는 주장은 엔진이 참고 의견으로 알려 준다.
  - 원고나 자료에 없는 인용이 하나라도 있으면 다시 묻는다.

- 요청에 `tracking`이 있으면 답에 `tracking`을 반드시 포함한다. 없으면 추가 추적을 하지 않는다.
  - `planRev`는 요청의 `tracking.plan.rev`다. 작품 목적·독자·우선순위·subjectKinds·criteria의 선언을 따라 관찰한다.
  - `discoveries: { subjects: [], criteria: [] }`, `observations: []`, `checked: []`를 모두 명시한다. 관찰이 없더라도 실제로 확인한 criterion ID는 checked에 적는다.
  - 신규 subject는 `{id,kind,name,aliases,body,data,evidence}`로 선언한다. catalog는 제한된 이름/ID 목록이며 incomplete면 전체 목록이 아니다. 기존 대상은 재발견하지 않는다.
  - 신규 criterion은 `{id,title,instruction,subjectKinds,valueType,behavior,appliesTo}`로 선언한다. 허용된 별도 위임만 쓰고 fixed 기준은 별도 사용자 결정에 맡긴다.
  - observation은 `{subjectId,criterionId,value,basis,evidence}`다. basis는 `explicit|attributed|inferred`이며 attributed에는 알려진 `perspectiveId`가 필수다. 관점·추정을 확정 사실로 승격하지 않는다.
  - evidence는 `{nodeId,textHash,quote,before?,after?}`다. nodeId는 요청 노드, textHash는 draft의 SHA-256, quote는 원고에 그대로 있는 1~500자다. 중복 인용은 바로 앞/뒤 문맥으로 한 곳을 가리킨다.
  - 선언의 valueType과 appliesTo를 따른다. entity/entity-list 값은 알려진 ID 또는 검증할 신규 대상 ID만 쓴다. 기준의 의미·위임 범위·사용자 결정을 만들어 넣지 않는다.
  - observation을 기존 events로 자동 변환하거나 새 검사를 만들지 않는다. 자산/이미지 검토는 기존 assets 경로를 쓰며 그림에서 본 내용에 가짜 본문 인용을 붙이지 않는다.
