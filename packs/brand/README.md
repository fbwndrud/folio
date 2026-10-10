# brand pack

브랜드 팩(둘째 팩). 회사 문서(제품 소개서·브로셔)에 쓴다. `work.yaml`에 `packs: [knowledge, sources, brand]`처럼 첫 팩 뒤에 둔다. 단계·프롬프트·프리셋은 첫 팩이 주고, 이 팩은 검사와 세트만 보탠다.

- 모델 검사(실험, 참고): `brand.tone` — 윗계획·brief의 어조 지침과 어긋나는 문장(원고 인용 필수).
- 결정론 검사(실험, 참고): `brand.banned-phrases` — 과장·단정 표현 기본 목록(`pack.yaml` `config.words`, 허용 표현 `config.allow`). `brand.figure-units` — 주장의 숫자가 자료 인용에는 다른 단위로만 있음(`config.units`).
- 세트: `brand.voice`(어조 + 금지 표현), `brand.figures`(`sources.claim-supported`, `sources.numbers-match`, `brand.figure-units`). `brand.figures`는 `sources` 팩이 있어야 한다. 기본 세트는 없다 — `recommendedFor` kinds `company`·`brochure`로 추천만 한다.
- 검사 `config`는 코어 `withCheckConfig`(`core/pack/check-config.js`)로 검사기 둘째 인자에 넘긴다. 작품마다 work.yaml `checks.<id>.config`로 겹칠 수 있다(예: `brand.banned-phrases`의 `words`). 따로 더할 금지 표현은 사용자 검사(`words`·`pattern`)로도 된다.
- 숫자 읽기는 `packs/sources/checkers/claims.js`(`numberMatches`)를 그대로 쓴다. 팩 digest는 `checkers/index.js`에서 정적 import로 닿는 파일(다른 팩의 claims.js 포함)의 내용까지 묶는다 — claims.js를 고치면 두 팩의 digest가 함께 바뀐다(`core/pack/module-graph.js`). 규칙의 뜻이 바뀌면 `version`도 올린다.
- 잠금 단계와 `core.promise-order`는 코어가 정한다. 세트를 꺼도 코어 잠금은 그대로다.
