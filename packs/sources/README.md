# sources pack

자료 근거 팩(둘째 팩). `work.yaml`에 `packs: [knowledge, sources]`처럼 첫 팩 뒤에 둔다(소설에도 붙일 수 있다). 단계·프롬프트·프리셋은 첫 팩이 주고, 이 팩은 검사와 세트만 보탠다.

- 주장과 근거 연결은 코어가 한다: 추출 답의 `claims`(요청의 `evidence.wanted`가 true일 때), 도구 `folio_sources link`. 기록장 `.folio/ledger/evidence.jsonl`(추가만).
- 결정론 검사(실험, 참고): `sources.claim-supported`(근거 없는 주장), `sources.numbers-match`(자료에 없는 숫자·연도), `sources.reliability`(신뢰도 낮은 자료에만 기댐).
- 숫자 읽기(`checkers/claims.js`): 아라비아 숫자만 읽는다(전각 숫자 포함). ㎡·²·① 같은 기호는 숫자로 읽지 않는다. 천 단위 쉼표는 빼고, 그 밖의 쉼표와 둘 이상의 마침표(날짜·판 번호)는 나눈다. `1.50`과 `1.5`는 같다. 한글 숫자는 읽지 않는다. 팩 digest는 `checkers/index.js`에서 정적 import로 닿는 도우미 파일의 내용까지 묶는다(`core/pack/module-graph.js`). 규칙의 뜻이 바뀌면 `pack.yaml` `version`도 올린다.
- 모델 검사(실험, 참고): `sources.conflict`(자료끼리 어긋남), `sources.claims-found`(표시 안 된 주장).
- 세트: `sources.citations`(결정론 셋), `sources.review`(모델 둘). 기본 세트는 없다 — 추천만 한다. 작가가 `block`으로 올릴 수 있고 `hard`는 안 된다.
- 잠금 단계와 `core.promise-order`는 코어가 정한다. 세트를 꺼도 코어 잠금은 그대로다.
