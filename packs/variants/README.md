# variants pack

판본 팩(둘째 팩). `work.yaml`에 `packs: [novel, variants]`처럼 첫 팩 뒤에 두고, `variants`에 판본을 선언한다(`{ id: en, kind: translation, lang: en }`). 단계는 코어의 판본 파이프라인이 준다(`core/variants/pipeline.js`: draft → variant-checks → variant-review → revise → approve → commit).

- 검사는 판본 실행(`folio_run { variant }`)에서만 돈다. stage 가 `variant-checks`·`variant-review`라 원본(main) 파이프라인에는 자리가 없다.
- 검사 ctx 에 코어가 넣는 것: `original`(원본 커밋 원고), `draft`(판본 원고), `variant`(`{ id, kind, lang }`), `terms`(`variants/<id>/terms.yaml`의 `{ from, to }` 쌍), `current`(지금 판본 파일 글, 없으면 null).
- 결정론 검사(실험, 참고): `variants.blocks-kept`(블록 표시), `variants.numbers-kept`(숫자, sources 팩의 숫자 읽기를 쓴다), `variants.paragraphs`(번역 문단 수, 요약 분량), `variants.terms`(용어 대응표).
- 모델 검사(실험, 참고): `variants.fidelity`(원본 대비 누락·추가·뜻 바뀜). 빠진 내용은 판본에 인용할 글이 없어 `requireQuote`를 두지 않는다.
- 세트: `variants.basic`(다섯 다, 기본 세트). 판본을 선언해야 판본 파이프라인이 생기므로 원본 실행에는 아무 영향이 없다.
- 판본별 hash 일치·영수증·판정 대조 잠금은 코어가 정한다. 세트를 꺼도 잠금은 그대로다. 팩 digest 는 `checkers/index.js`에서 정적 import 로 닿는 파일(sources 팩 `claims.js`, 코어 `core/blocks/syntax.js` 포함)까지 묶는다.
