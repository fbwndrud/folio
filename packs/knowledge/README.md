# knowledge pack

지식 책(교재·역사서·안내서) 팩. 선언은 `pack.yaml`, 글은 `prompts/`·`checks/`, 결정론 검사기는 `checkers/`(이름으로 등록).

- 프리셋: `textbook`(part → chapter → section), `history`(era → chapter → section), `guide`(chapter → section), `sourcebook`(자료 책: part → chapter → section, 작품 `packs: [knowledge, sources]` 필요, 세트 `knowledge.basic` + `sources.citations`), `reference`(사전·매뉴얼: part → entry, `order: none`, 세트 `knowledge.basic` + `knowledge.unordered`, N4).
- 엔티티 종류(관례): `concept`, `term`, `example`. 선택 필드 `prerequisites: [id...]`, `avoid: [표기...]`. 약속은 코어 `promise`.
- 사건: `term.defined`, `term.redefined`(원고 인용 필수).
- 세트: `knowledge.basic`(기본) — 정의 전 사용·선수 개념 순서(실험, 참고), 윗계획 맞춤(block), 원고 검토(참고), 학습 목표 다룸(참고). `knowledge.terms` — 용어 통일(실험, 참고). `knowledge.exercises` — 연습문제와 목표(실험, 참고). `knowledge.references` — 상호 참조: 블록 참조·앵커·각주·자료 인용(실험, 참고, N3). `knowledge.unordered` — 사전·매뉴얼(순서 없음): 노드 링크, 상호 참조, 용어 통일, 연결 항목과 맞춤(`requiresOrder: none`, 모델)(실험, 참고, N4).
- `scopeFields: [prerequisites]`: 코어 검사 범위가 선수 개념을 한 단계 읽는다(이 팩을 쓰는 작품만, N4).
- 잠금 단계와 `core.promise-order`는 코어가 정한다. 세트를 꺼도 코어 잠금은 그대로다.
