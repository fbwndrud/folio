# 레인 착수 조건과 세션 프롬프트 — 뒤쪽 (N4 · M7 · N6 · N7 · N8)

총괄: `2026-09-28-roadmap-parallel.md`. 공통 블록(시작 확인, SDD 실행 방법, 절대 규칙, 저장소 규칙)과 worktree 규칙은 `2026-09-28-roadmap-lanes-early.md` 앞머리에 있다. 아래 프롬프트마다 끝에 그 공통 블록을 그대로 붙인다.


---

## L3 N4 — 순서 없음 (계획 세션, 코어 레인 둘째)

- 기준: main + N3 병합 뒤. 브랜치 `feat/n4-order-none`. 코어 레인이 main 체크아웃을 이어 쓴다.
- 소유: `core/work/config.js`(order), `store/position.js`, `ledger/events.js`, `scope/scope.js`, `checks/builtin.js`, `run/next.js`, `store/tree.js`(links), `index/query.js`(links 조회), `server/tools/find.js`.
- 추가만: `core/pack/yaml-schema.js`(`requiresOrder` 값 추가), `definitions.js`(`folio_find` query 끝), `features.js`.
- 계약:
  - `none`과 `branching`은 지금 똑같이 "순서 없음"으로 다뤄진다. N4는 `none`의 동작만 정한다.
  - `branching`은 N7이 따로 정할 수 있게 갈림 자리를 남긴다.
  - `core.promise-order`는 비선형 노드에서 해당 없음으로 남는다. 잠금이 약해지는 곳은 없어야 한다.
  - 노드 연결 표 조회 함수 이름은 N7·M6b가 쓰므로 고정한다.
- 첫 착수 조건: N3 병합. 상호 참조 유효성 검사가 main에 있음.

```text
/superpowers:using-superpowers

Folio N4 순서 없음 방식(order: none)을 설계하고 계획서를 쓴다. 이번 세션은 계획만 한다. 저장소 /path/to/folio, 브랜치 feat/n4-order-none(main 기준, N3 병합 뒤).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(L3, 핫스팟, 미룬 minor 중 scope.js 몫), 이 파일의 L3 N4 절
- 정본(Artifact read) §03(사전·매뉴얼·요리책 행), §04 순서 방식과 달라지는 검사, §10 끝 문단
- N3 계획서와 판정 기록(상호 참조 유효성 검사, 조회 함수 계약)
- core/work/config.js readOrder·orderModeFor, core/store/position.js(ordered 조건), core/ledger/events.js eventsBefore, core/scope/scope.js, core/checks/{run-checks,builtin}.js(requiresOrder), core/run/next.js, core/store/tree.js links, core/index/{schema,rebuild,query}.js links 표
- test/fixtures/gamebook(branching, choice 링크 4개), knowledge-book(role front/back)

## 할 일
1. superpowers:brainstorming.
   - none 에서 앞쪽 범위가 "연결된 노드의 사건"을 어떻게 모으는지 정한다.
   - 상호 참조 중심 검사 목록과 링크 유효성(깨진 링크 보고) 검사를 정한다.
   - run next 의 순서를 정한다.
2. core.promise-order 와 hard 잠금이 비선형에서 약해지지 않는다는 공격 목록을 계획에 넣는다(가장 강한 리뷰어).
3. superpowers:writing-plans 로 docs/plans/<날짜>-n4-order-none.md. 시험 실행.
4. 계획 문서만 커밋: "docs(plans): N4 unordered works implementation plan". 멈춘다.
```

---

## L6 M7 — 그림 팩 + vibelore 가져오기 (계획 세션 하나, 실행 둘)

- 기준: main + J2 뒤. 브랜치 `feat/m7a-image`, 그 뒤 `feat/m7b-import`. worktree 사용.
- 소유: `packs/image/**`, `core/store/assets.js`, 새 `core/import/*`, `skill/folio/references/{image,import}.md`.
- 추가만: `packs/index.js`, `definitions.js`·`handlers.js`(`folio_import_vibelore` 끝에 추가), `features.js`(예: `images`, `import`), 가드 목록.
- 계약:
  - 그림 단계를 노드 파이프라인 안에 둘지, 그림 설명서 단위 실행으로 둘지 설계에서 정한다. 뒤쪽이면 `runner.js`를 건드린다. 그때는 N6과 같은 시기에 돌리지 않는다(핫스팟 규칙).
  - 가져온 영수증은 `imported`이고, "검사 통과"로 속이지 않는다(§18).
  - vibelore 작품 폴더는 읽기만 한다.
- 첫 착수 조건:
  - M7a: J2 끝. 코어 실행기를 건드리는 설계라면 N6 레인이 쉬는 중이어야 한다.
  - M7b: M5, M6 병합(완료 기준이 "뷰어에서 글+그림으로 열림").

```text
/superpowers:using-superpowers

Folio M7 그림 팩과 vibelore 가져오기를 설계하고 계획서를 쓴다(M7a 그림 팩, M7b 가져오기). 이번 세션은 계획만 한다. 저장소 /path/to/folio, worktree ../folio-worktrees/m7, 브랜치 feat/m7a-image(main 기준, J2 뒤).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(L6, 핫스팟), 이 파일의 L6 절
- 정본(Artifact read) §07 그림 두는 두 방법, §14 그림 팩, §18 가져오기, §20 M7
- core/store/assets.js, core/occurrences/surfaces.js(asset 표면), core/run/runner.js, core/pipeline/*, M5·M6 계획서
- vibelore(읽기 전용): src/tools/webtoon.js, webtoon-scene.js, 작품 폴더 모양(chapters/NNN.md, summaries/, characters/, world/, webtoon/). 실제 작품 내용은 커밋하지 않는다.

## 할 일
1. superpowers:brainstorming. 그림 실행 단위, 엔티티 기준 그림 참조, 설명서 필드, 이미지 검토(모델 검사, 자기검토 표기 잠금)를 정한다.
2. 가져오기 매핑(트리, 엔티티, 그림, imported 영수증)과 합성 vibelore 모양 fixture 를 설계한다.
3. superpowers:writing-plans 로 docs/plans/<날짜>-m7-image-import.md(M7a, M7b 절 나눔). 시험 실행.
4. 계획 문서만 커밋: "docs(plans): M7 image pack and vibelore import implementation plan". 멈춘다.
```

---

## L3 N6 — 판본 (계획 세션, 코어 레인 셋째)

- 기준: main + J2 뒤. 브랜치 `feat/n6-variants`. 코어 레인이 main 체크아웃을 쓴다.
- 소유: 코어 거의 전부. `config.js`(`SUPPORTED_VARIANTS`), `ledger/{receipts,recheck}.js`, `runner.js`, `recheck-plan.js`, `recommit-plan.js`, `receipt-builder.js`, `commit.js`, `steps/recheck-step.js`, `index/rebuild.js`, `store/tree.js`, `scope/stale.js`.
- 추가만: `features.js`(예: `variants`), `definitions.js`(인자 추가만).
- 계약:
  - 판본 키가 없는 기존 영수증과 기록은 `main`으로 읽는다.
  - hash 일치와 영수증 잠금은 판본마다 따로 성립한다. 한 판본의 영수증으로 다른 판본을 커밋할 수 없다.
  - 기록장은 추가만 한다.
- 첫 착수 조건: J2 끝. 이 레인이 도는 동안 `runner.js`를 건드리는 다른 레인(M7a 실행기 설계)은 쉰다.
- 먼저 할 일: `runner.js`가 250줄을 넘을 것 같으면 첫 태스크에서 나눈다. M4·N2의 미룬 minor 중 중복 제거(`isPlainObject`, record-run·status 뼈대)와 근거 기록장 손상 시 동작 검토도 여기서 한다(잠금 규칙은 약화하지 않는다).

```text
/superpowers:using-superpowers

Folio N6 판본(번역·개정·요약, 판본별 검사·영수증, 원본 대비 검사)을 설계하고 계획서를 쓴다. 이번 세션은 계획만 한다. 저장소 /path/to/folio, 브랜치 feat/n6-variants(main 기준, J2 뒤).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(L3, 핫스팟, 위험 표의 N6 줄, 미룬 minor 중 M4 몫), 이 파일의 L3 N6 절
- 정본(Artifact read) §03(번역본·개정판 행), §04 판본, §09 잠금 규칙
- core/work/config.js:8·114-120, core/ledger/{receipts,recheck}.js, core/run/{runner,recheck-plan,recommit-plan,receipt-builder,commit}.js, core/run/steps/recheck-step.js, core/index/{schema,rebuild}.js(variant 칼럼), core/scope/stale.js
- 모든 *-rulings.md 에서 영수증·hash·재검사 판정(M0-M2 T16·T17, M3 CWR, M4 C4)

## 할 일
1. superpowers:brainstorming.
   - 판본 본문을 어디에 저장할지 정한다(노드 파일 옆, frontmatter 키).
   - 판본별 파이프라인과 영수증, 원본 대비 누락·추가 검사(팩, experimental advisory), 용어 대응표를 정한다.
2. 잠금 공격 목록을 계획에 넣는다. 판본 사이 영수증 재사용, 판본 키 위조, 기존 영수증 호환이 들어가야 한다. 가장 강한 리뷰어에 맡긴다.
3. superpowers:writing-plans 로 docs/plans/<날짜>-n6-variants.md. 시험 실행.
4. 계획 문서만 커밋: "docs(plans): N6 variants implementation plan". 멈춘다.
```

---

## L3 N7 — 분기 + 게임북 팩 (계획 세션, 코어 레인 넷째)

- 기준: main + N6 병합 뒤. 브랜치 `feat/n7-branching`.
- 소유: N4가 소유한 순서·범위 파일 전부, 새 `packs/gamebook/**`(첫 팩: 프리셋, 단계, 경로별 검사).
- 추가만: `packs/index.js`, `features.js`(예: `branching`), `yaml-schema.js`(`requiresOrder` 값).
- 계약:
  - 경로별 검사는 팩 검사기(순수 함수)가 한다. 코어는 연결 표로 도달 경로를 계산해 ctx로 넘긴다.
  - 막다른 분기, 도달 불가 장면, 경로마다 사실 충돌은 experimental advisory로 시작한다.
  - `core.promise-order`의 뜻은 바꾸지 않는다.
- 첫 착수 조건: N4, N6 병합.

```text
/superpowers:using-superpowers

Folio N7 분기(order: branching)와 게임북 팩을 설계하고 계획서를 쓴다. 이번 세션은 계획만 한다. 저장소 /path/to/folio, 브랜치 feat/n7-branching(main 기준, N6 병합 뒤).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(L3, 핫스팟), 이 파일의 L3 N7 절
- 정본(Artifact read) §03(게임북 행), §04 순서 방식, §10 끝 문단
- N4·N6 계획서와 판정 기록(링크 조회 계약, 판본별 영수증)
- core/store/{tree,position}.js, core/ledger/events.js, core/scope/scope.js, core/checks/builtin.js, test/fixtures/gamebook

## 할 일
1. superpowers:brainstorming. 경로 계산(순환, 엔딩), 경로별 사건 모으기, 게임북 팩 프리셋·단계·검사·세트를 정한다.
2. 게임북 fixture 는 원본을 고치지 않는다. 새 fixture 를 만든다.
3. superpowers:writing-plans 로 docs/plans/<날짜>-n7-branching.md. 시험 실행.
4. 계획 문서만 커밋: "docs(plans): N7 branching and gamebook pack implementation plan". 멈춘다.
```

---

## L7 N8 — 지면 + 내보내기 (계획 세션, 마지막)

- 기준: main + J4 뒤. 브랜치 `feat/n8-layout-export`. worktree는 자유.
- 소유: 새 `core/layout/*`, `core/export/*`, `skill/folio/references/export.md`.
- 추가만: `definitions.js`·`handlers.js`(내보내기 도구 추가, 또는 `folio_view` 확장), `features.js`(예: `layout`, `export`).
- 계약:
  - 내보내기는 읽기만 한다. 작품 파일과 기록장을 바꾸지 않는다. 결과물은 작품 밖 또는 무시되는 폴더에 쓴다.
  - 런타임 의존성을 늘리지 않는다(D9).
  - 블록 번호(N3), 판본(N6), 그림(M7), 뷰어 정적 내보내기(M6)를 재사용한다.
- 첫 착수 조건: J4 끝. D9 결정.

```text
/superpowers:using-superpowers

Folio N8 지면(페이지·펼침면 배치)과 내보내기(웹·EPUB, PDF 는 D9)를 설계하고 계획서를 쓴다. 이번 세션은 계획만 한다. 저장소 /path/to/folio, 브랜치 feat/n8-layout-export(main 기준, J4 뒤).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(D9, L7), 이 파일의 L7 절
- 정본(Artifact read) §03(브로셔·소개서 행), §04 시집·그림책, §19, §20 "v0.1 이후"
- N3·N6·M6·M7 계획서와 판정 기록

## 할 일
1. superpowers:brainstorming. 지면 데이터 모양(작품 폴더 어디에), 분량 제한·그림 배치 검사, 형식별 내보내기와 의존성 없는 방법을 정한다.
2. 도구를 새로 둘지, folio_view 를 넓힐지 정한다(도구 수 원칙, 정본 §16).
3. superpowers:writing-plans 로 docs/plans/<날짜>-n8-layout-export.md. 시험 실행.
4. 계획 문서만 커밋: "docs(plans): N8 layout and export implementation plan". 멈춘다.
```
