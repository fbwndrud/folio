# novel pack

소설(장편·연재·단편·동화·그림책 원고) 팩. 프리셋·단계·세트는 `pack.yaml`, 검사 선언은 `checks.yaml`, 글은 `prompts/`·`checks/`, 결정론 검사기는 `checkers/`(이름으로 등록).

- 프리셋: `serial`(arc → episode), `novel`(book → chapter → scene), `scene`(scene), `picturebook`(book → spread), `fairytale`(chapter → scene).
- 세트: `novel.basic`(기본) — 죽은 인물 등장(hard), 고정 설정 위반(hard, 인용 필수), 원고 검토(참고), 윗계획 맞춤(block), 계획 이행(참고). `novel.serial` — 회차 끝 당김(실험, 참고).
- `novel.young-readers`: 어린 독자·읽기 방식·글과 그림의 역할 검토(실험, 참고, 인용 필수). 그림책·동화 프리셋이 기본 검사와 함께 선택한다. 실제 그림 생성·지면 제작은 포함하지 않는다.
- 추가 세트: `novel.serial`(웹소설 연재), `novel.style`(문체 유지). 한국어 사전은 `lexicons/`, 검사 선언은 `checks.yaml`이다.
- 잠금 단계는 코어가 정한다. `pack.yaml`에 `locked`를 적을 수 없다.
- M5 에서 vibelore 검사기를 옮겼다. 옮긴 검사는 모두 `experimental`, `advisory`이고, 검사기는 지적의 severity 를 낮추기만 한다(코어 stamp 가 선언 등급으로 막는다).
- `pack.yaml` `checks.<id>.config` 는 로더(`index.js` → 코어 `withCheckConfig`)가 검사기의 둘째 인자로 넘긴다. 검사기는 기본값 위에 합친다. 작품은 work.yaml `checks.<id>.config` 로 그 위에 겹친다(`skill/folio/references/novel.md`).
- 팩 digest 는 검사기 함수 소스와 함께 `checkers/index.js` 에서 정적 import 로 닿는 파일 전부(도우미 `checkers/text/*`, 사전 `lexicons/*`, 코어 `core/promise.js`)의 내용을 묶는다(`core/pack/module-graph.js`). 도우미나 사전을 고치면 digest 가 바뀌고 열린 실행은 검사부터 다시 돈다. 검사기는 동적 `import()` 나 계산한 경로로 모듈을 불러오지 않는다(그런 파일은 digest 에 들지 않는다).
