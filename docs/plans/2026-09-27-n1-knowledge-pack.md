# Folio N1 지식 책 팩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교재·역사서·안내서를 쓰는 내장 팩 `packs/knowledge`를 더한다. 프리셋 셋(`textbook`, `history`, `guide`), 결정론 검사 셋(정의 전 사용, 선수 개념 순서, 용어 통일 — 모두 실험·참고 의견), 모델 검사 넷, 검사 세트 셋, 비문학 프롬프트를 담는다. 코어 잠금(`core.promise-order` 등)은 이 팩에서도 그대로 막는다.

**Architecture:** 소설 팩(`packs/novel`)과 같은 모양이다. `pack.yaml`에 선언을 두고, md 파일에 프롬프트와 모델 검사 지시를 두고, `checkers/`에 이름으로 부르는 결정론 검사기를 둔다. `packs/index.js`가 등록한다. 코어 변경은 두 곳만 한다. (1) `gatherScope`가 이 원고의 사건이 가리키는 엔티티의 선수 개념(`data.prerequisites`)을 한 단계만 `priorEvents`·`refs`에 더한다(선수 개념 순서 검사가 앞 정의를 볼 수 있게). (2) `initWork`의 프리셋 오류에 팩별 프리셋 목록을 싣는다. 새 사건 종류 `term.defined`/`term.redefined`는 코어 `parseEvents`가 이미 그대로 통과시킨다(종류 문자열 제한 없음, `quote`가 있으면 원고에 있어야 함).

**Tech Stack:** Node ESM + JSDoc, `node:test`, `yaml`, `@modelcontextprotocol/sdk`(1.x, stdio), ESLint 9 + TypeScript(`checkJs`).

**Spec:** 승인된 N1 설계(사용자 승인 2026-09-27 "ㅇㅇ ㄱ") — 세션 scratchpad의 `n1-design.md`. 이 계획의 "설계 요약" 절에 그대로 옮겨 두었다(세션이 바뀌어도 읽을 수 있게). 설계 정본 아티팩트 https://claude.ai/artifact/WjJzcsjnQZnVxyyJZaxvcX §14 지식 책 팩 표, §03 과학책·역사책 행, §12 검사 세트. 범위 결정: `docs/plans/2026-09-27-scope-nonfiction-decision.md`. 앞 계획의 판정 중 계속 유효한 것: `docs/plans/2026-09-27-m4-occurrences-rulings.md`(특히 A2 코드 블록 규칙, B3-3 재검사는 등장 위치를 읽지 않음, F-2 기능 토글은 잠금을 바꾸지 않음).

## 현재 상태 (이 계획을 시작하는 시점)

새 세션이 이전 대화 없이 이어받을 수 있게 적는다.

- 브랜치 `feat/n1-knowledge-pack`. `feat/m4-occurrences`의 `64069e9`(M4 판정 기록 커밋)에서 땄다. 시작 시 `npm run check` 621/621.
- 아무것도 main에 병합하지 않았고 push도 하지 않았다(M3·M4·N1 브랜치 모두 로컬).
- M0~M4 끝남. MCP 서버 `folio`(`bin/folio-mcp.js`)의 도구는 10개다: 기본 8, `folio_occurrences`, `folio_config`. 스킬은 `skill/folio`다.
- 내장 팩은 `novel` 하나다. `test/fixtures/knowledge-book/work.yaml`은 `packs: [knowledge]`, `checkSets: []`를 적고 있지만, 지금은 이 fixture를 여는 테스트가 전부 `useFakePack`(가짜 팩 `fake`)으로 바꾸거나 `openWork`만 쓴다. 팩이 생기면 이 fixture를 실제 팩으로 열 수 있다(Task B1이 확인한다).
- 태스크를 마칠 때마다 이 절 아래 "진행" 줄에 커밋 범위와 테스트 수를 적는다. 판정은 `docs/plans/2026-09-27-n1-knowledge-pack-rulings.md`에 모은다(Task C1 Step 5).

진행 (2026-09-28, SDD 완료 — 사용자 인수 확인 대기):
- A1 `13358b1..ea3597c` 632 · A2 `ea3597c..b9964ed` 640 · A3 `b9964ed..de97c70` 651 · B1 `de97c70..91be754` 657 · B2 `91be754..ee6e6fb` 660 · C1 `ee6e6fb..ae64190` 666 · 최종 리뷰 수정 `ae64190..14137f6` 669.
- `npm run check` 669/669, `test/acceptance/n1.test.js` 6/6. 계획 예상(650)보다 많은 것은 리뷰 판정으로 더한 테스트 때문이다.
- 계획과 달라진 판정(결정 3 인용 강화, 결정 7을 위치 포함으로 구현, `PREREQUISITE_INVALID`·`TERM_AVOID_INVALID`, 프롬프트가 실제 payload만 가리킴 등)은 `docs/plans/2026-09-27-n1-knowledge-pack-rulings.md`에 있다.
- main 병합·push 안 함. N2는 사용자 확인 뒤에 시작한다.

### 모듈 지도 (이 계획이 건드리는 것)

| 파일 | 하는 일 |
|---|---|
| `core/pack/yaml-pack.js` | `loadYamlPack(dir, { name, checkers })`. pack.yaml을 읽고 md를 붙이며 검사기를 이름으로 찾는다. digest는 yaml·글·검사기 함수 소스로 만든다 |
| `core/pack/yaml-schema.js` | pack.yaml 키 검증. 검사 필드: `title, description, tier, stage, severity, requiresOrder, requiresParentPlan, requireQuote, experimental, config, instruction, run` |
| `core/pack/validate.js` | 검사·세트 id 접두어(`knowledge.`), 잠긴 stage(`facts`)는 결정론 check 단계가 맡고 `extract`→`draft`를 요구해야 함 |
| `core/checks/check-set.js` | `resolveChecks`. `checks: { id: { severity: block } }` → `severityOverride`. 작가가 줄 수 있는 등급은 `advisory`·`block`뿐(`USER_SEVERITIES`). `core.promise-order`는 잠김(`LOCKED_CHECK_OVERRIDE`) |
| `core/checks/run-checks.js` | `runDeterministicChecks(checks, ctx)`. `applicability`: `requiresOrder: 'linear'`이고 `!ctx.ordered`면 `not_applicable`. `stamp`: 지적 등급 = `check.severityOverride ?? finding.severity ?? check.severity` |
| `core/run/steps/check.js` | `checkContext(ctx, run, scope)` = `{ ...scope, work, node, draft, draftEvents }`. scope 필드: `nodeId, ordered, appearances, entityIds, priorEvents, upperPlans, parentPlan, upperMentions, assets, sources, refs` |
| `core/scope/scope.js` | `gatherScope`. `entityIds` = 등장 ∪ 이름·별칭 스캔(코드 블록 밖) ∪ 추출 mentions ∪ 이 원고 사건의 엔티티 ∪ 기록된 등장 위치. `priorEvents`는 `entityIds`의 앞 사건만 |
| `core/store/position.js` | front/back 역할과 그 자손은 `ordered: false`다. 순서 검사는 코어가 이미 뺀다 |
| `core/run/steps/generate.js` | `parseEvents`: `kind`는 비어 있지 않은 문자열이면 받는다. `quote`가 있으면 `draft.includes(quote)`가 참이어야 한다. `term.defined`는 코어 변경 없이 통과한다 |
| `core/util/fences.js` | `fencedRanges(text)`, `maskRanges(text, ranges)` — M4 A2의 코드 블록 규칙 |
| `core/work/init.js` | `initWork`. `PRESET_REQUIRED`·`PRESET_UNKNOWN`의 details는 `presets`(첫 팩 것) |
| `packs/index.js`, `packs/novel/*` | 내장 팩 등록, 소설 팩(모양의 본보기) |
| `server/tools/definitions.js` | `folio_init` 설명 |
| `skill/folio/SKILL.md`, `references/*.md`, `test/server/skill-docs.test.js` | 스킬 문서와 그 검사 |
| `test/support/*` | `copyFixture`, `tempDir`, `fakePacks`, `useFakePack`, `createFakeHost`, `driveToEnd`, `label`, `connectFolio` |

`test/fixtures/knowledge-book`을 쓰는 테스트(원본을 고치면 깨질 수 있는 곳): `test/core/{position,work,recommend,surfaces,index,config,rename-apply,occurrences,rename-plan,sources-assets,blocks}.test.js`, `test/acceptance/{m1,m2,m4}.test.js`, `test/run/order-stale.test.js`, `test/fixtures.test.js`, `test/support/child-tx.js`. 이름 바꾸기·등장 위치·색인 테스트가 본문과 엔티티 파일의 정확한 글자에 기댄다. 그래서 이 계획은 원본 fixture를 고치지 않는다(결정 1).

---

## 설계 요약 (승인본에서 옮김)

- 구조: `packs/knowledge/` — 소설 팩과 같은 모양(pack.yaml + md + 이름 검사기 `checkers/index.js`), `packs/index.js`가 등록. 코어는 거의 안 바꾸고, 바꾸면 최소로 하고 이유를 적는다.
- 프리셋: textbook(교재) part → chapter → section, history(역사) era → chapter → section, guide(안내서) chapter → section. 각 프리셋 checkSets 기본값은 `knowledge.basic`(추천). 작가가 바꾼다.
- 파이프라인: 소설과 같은 모양. leaf plan → draft → extract(events, requires draft) → facts(deterministic) → critic(model) → revise(loop until facts, max 3) → approve → commit. branch plan → fit → revise → approve → children → review → commit.
- 엔티티 종류(관례, 문서화): concept, term, example. 약속은 코어 promise. 선택 필드 `prerequisites: [entityId...]`, `avoid: [표기...]`.
- 사건: `term.defined`, `term.redefined`. 원고 인용 quote 필수, 원고에 그대로 있어야 인정(dead-on-stage의 quotedInDraft와 같은 기준). 사용됨 = M4 등장 위치/appearances+mentions. promise.* 사건은 코어가 처리(core.promise-order, 잠금).
- 결정론 검사 3개 — experimental: true, severity advisory 기본(§12), 작가가 block으로 올릴 수 있음:
  1. `knowledge.defined-before-use` — concept|term 엔티티가 이 노드에 나오는데 앞선 term.defined 사건이 없고 이 원고에도 인용 있는 정의가 없으면 지적. requiresOrder: linear. front/back은 코어가 순서 검사에서 뺌.
  2. `knowledge.prerequisite-order` — 이 원고가 X를 정의하는데 X.prerequisites 중 앞에서 정의 안 된 것이 있으면 지적(같은 원고 안에서 인용 위치로 앞이면 인정). requiresOrder: linear.
  3. `knowledge.term-consistency` — 원고 본문에 avoid 표기가 있으면 인용과 함께 지적. 코드 블록 안은 건너뜀. 순서 무관.
- 모델 검사 4개: `knowledge.parent-fit`(block, fit, requiresParentPlan), `knowledge.critic`(advisory, critic), `knowledge.goals-covered`(branch review, advisory), `knowledge.exercises-cover-goals`(experimental, advisory, leaf critic).
- 세트: `knowledge.basic`(defined-before-use, prerequisite-order, parent-fit, critic, goals-covered), `knowledge.terms`(term-consistency), `knowledge.exercises`(exercises-cover-goals). `defaultCheckSets: [knowledge.basic]`. recommendedFor로 추천만.
- 프롬프트: 비문학용 한국어 leaf plan/draft/extract/revise, branch plan/revise-plan/children. extract는 term.defined/redefined(quote 필수), appearances/mentions, M4 occurrences(wanted일 때)를 요청.
- 덤: folio_init 프리셋 목록에 지식 책 프리셋, 스킬 참고 문서 `skill/folio/references/knowledge.md` + SKILL.md 링크, knowledge-book fixture가 실제 팩을 씀(기존 테스트 깨지지 않게), 합성 위반 하나(정의 전 사용).
- 완료 기준(`test/acceptance/n1.test.js`): 1 MCP stdio로 교재 작품을 만들고 절 하나를 커밋까지. 2 심어 둔 정의 전 사용을 잡음(advisory로 나옴, block으로 올리면 막힘). 3 선수 개념 순서 위반을 잡음. 4 avoid 표기를 잡음(코드 블록 안은 무시). 5 core.promise-order가 지식 책에서도 막힘(승인 불가). 6 검사 세트를 끄면 그 검사가 안 돎(영수증에 반영), 잠금은 그대로.
- 범위 밖: 상호 참조·그림 번호(N3), 주장 근거·논픽션 인용 세트(N2), 순서 없음(N4), AI 팩 만들기.
- 새 기능 토글: 없음 — 팩·검사 세트 선택이 곧 토글.

## Global Constraints

- 이름 `Folio`, MCP 도구 접두어 `folio_`, 작품 내부 폴더 `.folio/`.
- `package.json` `"engines": { "node": "^22.13.0 || ^24.0.0 || ^26.0.0" }`, `"type": "module"`. 런타임 의존성은 `yaml`과 `@modelcontextprotocol/sdk` 둘뿐이다. 늘리지 않는다. 네이티브 모듈은 금지다.
- `core/`와 `packs/`는 모델·네트워크를 부르지 않는다(`test/core/no-model-calls.test.js`). `server/`만 SDK를 import한다. 팩 검사기는 순수 함수다(파일도 읽지 않는다).
- `server/`는 `core/run/commit.js`, `core/run/recheck-commit.js`, `core/structure/ops.js`, `core/ledger/ledger.js`, `core/store/tree.js`, `core/util/file-tx.js`를 import하지 않는다(`test/server/tools.test.js` 가드).
- 잠금 규칙(설정·팩·검사 세트로 끌 수 없음): 커밋 원고 hash = 검사 원고 hash · 영수증 없이 커밋 금지 · 켜 둔 검사의 hard 판정은 커밋을 막고 승인으로 넘길 수 없음 · 기록장은 추가만 · 같은 호스트 자기검토를 독립 평가로 표기 금지 · soft·참고 의견은 자동 수정 사유 아님 · `core.promise-order`는 어떤 세트 선택에서도 돈다.
- 팩은 잠금을 선언할 수 없다(`pack.yaml`에 `locked` 없음). 팩 검사기는 지적에 `severity`를 적지 않는다 — 등급은 `pack.yaml`과 작가 설정(`severityOverride`)만 정한다.
- 새 검사는 `experimental: true`, `severity: advisory`로 시작한다(§12). 작가만 `block`으로 올린다. `hard`로는 올릴 수 없다.
- 검사 세트는 작가가 고른다. 추천만 하고 강제하지 않는다. 새 기능은 끄고 켤 수 있어야 한다 — 이 계획에서는 팩·검사 세트 선택이 그 토글이다(새 `features` 키 없음).
- 테스트 데이터는 전부 합성이다. 임시 폴더는 `test/support/fixtures.js`의 `tempDir`/`copyFixture`만 쓴다. 원본 fixture 파일을 고치지 않는다. 작가의 손 작업(엔티티 파일 쓰기, work.yaml 고치기)은 테스트가 복사본에 한다.
- 파일 하나에 한 책임. 300줄을 넘기면 나눈다.
- 문서·주석 설명은 한국어, 코드 식별자는 영어. 커밋 메시지는 영어 Conventional Commits, 끝에 정확히 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `.superpowers/`는 커밋하지 않는다. 각 Task는 자기 파일만 커밋한다. `/path/to/vibelore`는 읽기 전용이다(이 계획은 쓰지 않는다).
- TDD: 실패하는 테스트 → 실패 확인 → 구현 → 통과 → `npm run check` 전부 초록 → 커밋. 기존 테스트의 assert를 약화하지 않는다. 기존 테스트를 바꾸는 곳은 이 계획이 이유와 함께 적은 곳뿐이다(B1의 `novel-pack.test.js` 한 줄, B2의 `skill-docs.test.js` 테스트 추가).
- 머신 부하가 높으면 전체 테스트가 몇 분 걸릴 수 있다. 느려졌다고 회귀로 단정하지 말고 같은 조건에서 기준 커밋과 비교한다.
- 리뷰: 검사·잠금·범위 경로를 건드리는 Task(A1, A2, A3, B1)는 가장 강한 리뷰어 모델에 맡기고, 각 Task의 "공격해 볼 것"을 시도하게 한다.
- 마일스톤 정지: Task C1(N1 완료 기준)이 끝나면 결과를 보여 주고 멈춘다. main 병합·push·PR은 사용자에게 묻는다. N2는 사용자 확인 전에 시작하지 않는다.

---

## 결정 (이 계획에서 정한 것)

| # | 문제 | 결정 | 이유 |
|---|---|---|---|
| 1 | 합성 위반을 어디 심나 | `test/fixtures/knowledge-book`의 파일을 **고치지 않는다**. 이 fixture의 `membranes`(1장 2절) 본문 "막을 지나는 물질은 ATP를 쓴다"가 이미 합성 정의 전 사용이다 — ATP는 뒤의 `atp-section`(2장 1절)에서 정의된다. `prerequisites`·`avoid`가 필요한 시나리오는 테스트가 복사본에 엔티티 파일을 쓴다 | 이름 바꾸기·등장 위치·색인·위치 테스트 15개 이상이 이 fixture의 본문·엔티티 글자에 기댄다. 새 fixture 폴더를 만들 필요도 없다 |
| 2 | "사용됨"을 무엇으로 보나 | 검사 ctx의 `entityIds`(등장 ∪ 추출 mentions ∪ 코드 블록 밖 이름·별칭 스캔 ∪ 이 원고 사건의 엔티티 ∪ 살아 있는 등장 위치 표시)에서 kind가 `concept`·`term`인 것 | ctx에는 mentions만 따로 있지 않다. 이름 스캔은 결정론이라 추출 답이 등장을 빼먹어도 사용을 숨길 수 없다 |
| 3 | 이 원고의 정의를 언제 인정하나 | `kind: term.defined`이고, 인용이 다듬은 길이 2 이상이며 원고(NFC)에 그대로 있고, **인용에 그 엔티티의 이름이나 별칭이 들어 있을 때만** | 설계의 인용 기준에 조건 하나를 더했다: 인용에 이름이 있어야 한다. 원고의 아무 문장이나 인용해 "정의됨"을 흉내 내는 추출 답으로 지적을 끌 수 없게 한다(block으로 올린 작품에서 중요) |
| 4 | 선수 개념의 앞 정의가 ctx에 없다 | **코어 변경**: `gatherScope`가 `prerequisiteIds`를 계산한다 — 이 원고 사건이 가리키는 엔티티의 `data.prerequisites`를 한 단계만 본다(알려진 id만, `entityIds`에 이미 있는 것 제외). 이 id들은 `priorEvents`와 `refs`에 더하고 `entityIds`에는 넣지 않는다 | `priorEvents`는 범위 엔티티의 사건만 담는다. 원고가 선수 개념의 이름을 쓰지 않으면 그 앞 정의가 보이지 않아 거짓 지적이 난다. `refs`에 넣으면 선수 개념의 정의가 앞에서 바뀔 때 이 노드가 "다시 확인 필요"가 된다. `entityIds`에 넣으면 정의 전 사용이 쓰지도 않은 선수 개념을 지적하게 된다. 소설 엔티티에는 이 필드가 없어 기존 동작이 그대로다 |
| 5 | 같은 원고 안의 선수 개념 | 선수 개념의 첫 정의 인용 위치가 X의 첫 정의 인용 위치보다 **엄격히 앞**일 때만 인정한다(같은 인용은 인정 안 함) | 설계의 "인용 위치로 앞이면"을 그대로 읽었다 |
| 6 | 없는 엔티티를 선수 개념으로 적음 | `PREREQUISITE_UNKNOWN` 지적(등급은 검사 등급)을 낸다 | 오타를 조용히 넘기지 않는다 |
| 7 | 용어 통일이 볼 엔티티 | 작품의 모든 엔티티의 `avoid`를 본다. 그 엔티티의 이름·별칭 안에 든 avoid 표기는 세지 않는다(이름을 먼저 가림). NFC로 비교하고, (엔티티, 표기)마다 지적 하나에 횟수를 적는다. 인용(`quote`)은 그 표기다. 닫히지 않은 코드 울타리는 글 끝까지 코드 블록이다(M4 A2 규칙). 이 검사는 `refs`를 넓히지 않는다 | 피할 표기는 이름 스캔에 안 걸리므로 범위로 좁힐 수 없다. avoid 목록이 바뀌어도 이 노드가 다시 확인 필요가 되지는 않는다(참고 의견이고, 재검사로 다시 볼 수 있다) |
| 8 | 지적 등급 | 팩 검사기는 `severity`를 적지 않는다. 등급은 pack.yaml(advisory)과 작가의 `severity: block`만 정한다. `hard`는 `USER_CHECK_SEVERITY_INVALID`로 거부된다(기존 코어 규칙) | 검사기가 등급을 올려 잠금처럼 굴 수 없게 한다 |
| 9 | `term.redefined` | 정의로 치지 않는다(추출 문서에만 적는다). 검사 셋 모두 `term.defined`만 본다 | 설계가 "앞선 term.defined"라고 적었다 |
| 10 | `exercises-cover-goals`의 모양 | leaf `critic` stage, `requireQuote` 없음 | 연습문제가 아예 없다는 지적은 인용할 문장이 없다 |
| 11 | 세트 추천 | `knowledge.basic` → kinds textbook·history·guide, `knowledge.terms` → kinds textbook·guide, `knowledge.exercises` → kinds textbook + levels section | 추천만 한다(선택은 작가). 역사책은 용어 통일보다 표기 자유가 흔하다 |
| 12 | 레벨 자식 수 | textbook part [1,10], chapter [1,20] · history era [1,20], chapter [1,30] · guide chapter [1,30] | 설계에 없음. 소설 팩 범위와 비슷한 넉넉한 값 |
| 13 | folio_init 프리셋 목록 | 프리셋으로 팩을 짐작하지 않는다(`packs` 기본은 여전히 `['novel']`). **작은 코어 변경**: `PRESET_REQUIRED`·`PRESET_UNKNOWN` details에 `packPresets: { 팩: [프리셋...] }`를 더한다(기존 `presets` 그대로). 도구 설명에 두 팩의 프리셋을 적는다 | 호스트가 `preset: 'textbook'`만 주면 오류에서 바로 `packs: ['knowledge']`를 알 수 있다. 짐작하면 같은 이름 프리셋이 여러 팩에 생길 때 조용히 틀린다 |
| 14 | 팩 검사기가 코어 유틸을 부름 | `term-consistency`는 `core/util/fences.js`를 import한다. 검사기 digest는 검사기 함수 소스만 묶는다(`core/pack/digest.js`에 적힌 알려진 한계, 소설 dead-on-stage의 도우미 함수도 같다) | 코드 블록 규칙을 한 곳에 둔다 |
| 15 | 기존 테스트 변경 | `test/pack/novel-pack.test.js:15`의 내장 팩 이름 목록 `['novel']` → `['novel', 'knowledge']`. `skill-docs.test.js`에 "모든 참고 문서가 SKILL.md에서 링크됨" 테스트를 더한다 | 새 팩을 등록하면 목록이 바뀐다. 나머지 assert는 그대로 둔다 |
| 16 | 완료 기준 테스트의 길 | 여섯 항목 모두 MCP stdio(`connectFolio`)로 돈다. 2~6은 knowledge-book 복사본에서 돌고, work.yaml(세트·등급)과 엔티티 파일은 테스트가 작가 대신 쓴다 | 서버가 실제 내장 팩을 쓰는 길을 그대로 확인한다 |

## 파일 구조

```
packs/
  index.js                                (수정) novel + knowledge 등록
  knowledge/
    pack.yaml                             (새)  프리셋·파이프라인·프롬프트·검사·세트
    index.js                              (새)  KNOWLEDGE_PACK_DIR, loadKnowledgePack
    README.md                             (새)
    checkers/definitions.js               (새)  TERM_KINDS, DEFINED, quotedInDraft, namesOf, quoteNames, draftDefinitions, priorDefinitions, prerequisitesOf
    checkers/defined-before-use.js        (새)  definedBeforeUse
    checkers/prerequisite-order.js        (새)  prerequisiteOrder
    checkers/term-consistency.js          (새)  termConsistency
    checkers/index.js                     (새)  KNOWLEDGE_CHECKERS
    checks/{parent-fit,critic,goals-covered,exercises-cover-goals}.md (새)
    prompts/{leaf-plan,draft,extract,revise,branch-plan,revise-plan,children}.md (새)
core/
  scope/scope.js                          (수정) prerequisiteIds
  work/init.js                            (수정) packPresets
server/tools/definitions.js               (수정) folio_init 설명
skill/folio/SKILL.md                      (수정) 지식 책 링크
skill/folio/references/knowledge.md       (새)
test/
  pack/knowledge-defined-before-use.test.js  (새)
  pack/knowledge-prerequisite-order.test.js  (새)
  run/scope-prerequisites.test.js            (새)
  pack/knowledge-term-consistency.test.js    (새)
  pack/knowledge-pack.test.js                (새)
  pack/novel-pack.test.js                    (수정) 한 줄
  server/knowledge-init.test.js              (새)
  server/skill-docs.test.js                  (수정) 테스트 하나 추가
  acceptance/n1.test.js                      (새)
```

모든 새 파일은 120줄 안쪽이다(가장 긴 것: `n1.test.js` 약 170줄, `pack.yaml` 약 140줄).

**데이터 흐름 한 줄:** 호스트 추출 답(`term.defined` + 인용) → `parseEvents`(원고에 인용이 있는지) → `run.outputs.events` → `gatherScope`(`entityIds`, 선수 개념 `prerequisiteIds` → `priorEvents`·`refs`) → `checkContext` → 팩 검사기(`draftDefinitions` 인용 대조) → 지적(등급은 pack.yaml·작가 설정) → 승인 질문 `advisories`/`blocking` → 영수증 `appliedChecks`.

---

# Part A — 결정론 검사기

### Task A1: 정의 도우미와 `knowledge.defined-before-use` 검사기

> 리뷰: **가장 강한 모델**(검사·잠금 경로). 공격해 볼 것:
> - 가짜 추출 답: 인용 없는 `term.defined`, 빈 인용·공백 인용·한 글자 인용, 원고에 없는 인용, 원고의 **다른 문장**(이름 없음) 인용, 다른 엔티티 이름이 든 인용, `entityId`가 없는 엔티티.
> - NFD 원고와 NFC 인용(또는 반대)으로 인용 대조를 비껴가기.
> - `term.redefined`나 `promise.*` 사건으로 정의를 흉내 내기.
> - 지적이 `severity`를 들고 나와 `stamp`에서 등급이 올라가는지(`hard`가 되면 안 된다).
> - `ctx.work`·`ctx.entityIds`가 없을 때 던지지 않는지(던지면 advisory 검사도 `CHECK_CRASHED`가 된다 — 이 검사는 advisory라 fail-closed 등급이 없어 조용히 넘어가지만, block으로 올리면 block으로 막힌다).

**Files:**
- Create: `packs/knowledge/checkers/definitions.js`, `packs/knowledge/checkers/defined-before-use.js`
- Test: `test/pack/knowledge-defined-before-use.test.js`

**Interfaces:**
- Consumes: 검사 ctx(`core/run/steps/check.js` `checkContext`) — `{ entityIds: string[], priorEvents: {entityId, kind, ...}[], draftEvents: {entityId, kind, quote?, ...}[], draft: string, work: { entities: Map<string, {id, kind, name, aliases: string[], data: object}> } }`.
- Produces (`definitions.js`): `TERM_KINDS = ['concept', 'term']`, `DEFINED = 'term.defined'`, `quotedInDraft(quote, draft) → boolean`, `namesOf(entity) → string[]`, `quoteNames(quote, entity) → boolean`, `draftDefinitions(ctx) → Map<entityId, number>`(원고 NFC 안 첫 인용 위치), `priorDefinitions(ctx) → Set<entityId>`, `prerequisitesOf(entity) → string[]`. A2·A3가 쓴다.
- Produces (`defined-before-use.js`): `definedBeforeUse(ctx) → Array<{ code: 'USED_BEFORE_DEFINED', entityId, message }>`. B1이 `run: defined-before-use`로 등록한다.

- [ ] **Step 1: 실패하는 테스트**

<!-- file: test/pack/knowledge-defined-before-use.test.js -->
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definedBeforeUse } from '../../packs/knowledge/checkers/defined-before-use.js';
import { draftDefinitions } from '../../packs/knowledge/checkers/definitions.js';

const entity = (id, kind, name, extra = {}) => [id, { id, kind, name, aliases: [], data: {}, ...extra }];
const work = {
  entities: new Map([
    entity('cell', 'term', '세포'), entity('atp', 'term', 'ATP', { aliases: ['아데노신삼인산'] }),
    entity('diffusion', 'concept', '확산'), entity('ex-1', 'example', '예제 1'), entity('energy-detail', 'promise', '에너지 장에서 자세히'),
  ]),
};
const defined = (entityId, quote) => ({ entityId, kind: 'term.defined', ...(quote === undefined ? {} : { quote }) });
const codes = (findings) => findings.map((f) => [f.code, f.entityId, f.severity ?? null]);
const DRAFT = '세포는 생명의 단위다. ATP는 세포가 쓰는 에너지 화폐다. 확산이 일어난다.';

test('defined-before-use: a concept or term used here with no earlier and no quoted definition is flagged, without a severity', () => {
  const ctx = { work, entityIds: ['atp', 'cell', 'diffusion', 'energy-detail', 'ex-1'], priorEvents: [], draftEvents: [], draft: DRAFT };
  assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'atp', null], ['USED_BEFORE_DEFINED', 'cell', null], ['USED_BEFORE_DEFINED', 'diffusion', null]]);
  assert.match(definedBeforeUse(ctx)[0].message, /ATP\(atp\)/);
});

test('defined-before-use: an earlier term.defined event or a quoted definition in this draft clears it', () => {
  const ctx = {
    work, entityIds: ['atp', 'cell', 'diffusion'], draft: DRAFT,
    priorEvents: [{ ...defined('cell'), nodeId: 'intro', eventId: 'ev-1' }],
    draftEvents: [defined('atp', 'ATP는 세포가 쓰는 에너지 화폐다'), defined('diffusion', '확산이 일어난다')],
  };
  assert.deepEqual(definedBeforeUse(ctx), []);
});

test('defined-before-use: a definition without a quote, with a quote not in the draft, or quoting a sentence without the name does not count', () => {
  for (const quote of [undefined, '', ' ', 'A', '없는 문장이다', '세포는 생명의 단위다']) {
    const ctx = { work, entityIds: ['atp'], priorEvents: [], draft: DRAFT, draftEvents: [defined('atp', quote)] };
    assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'atp', null]], String(quote));
  }
  // 별칭도 이름이다
  const alias = { work, entityIds: ['atp'], priorEvents: [], draft: '아데노신삼인산은 에너지 화폐다.', draftEvents: [defined('atp', '아데노신삼인산은 에너지 화폐다')] };
  assert.deepEqual(definedBeforeUse(alias), []);
});

test('defined-before-use: term.redefined, other kinds and unknown ids are not definitions', () => {
  const ctx = {
    work, entityIds: ['atp', 'ghost'], draft: DRAFT, priorEvents: [{ entityId: 'atp', kind: 'term.redefined' }],
    draftEvents: [{ entityId: 'atp', kind: 'term.redefined', quote: 'ATP는 세포가 쓰는 에너지 화폐다' }],
  };
  assert.deepEqual(codes(definedBeforeUse(ctx)), [['USED_BEFORE_DEFINED', 'atp', null]]);
});

test('draftDefinitions keeps the earliest quoted position per entity, comparing in NFC', () => {
  const draft = 'ATP는 화폐다. 다시, ATP는 화폐다.'.normalize('NFD');
  const map = draftDefinitions({ work, draft, draftEvents: [defined('atp', '다시, ATP는 화폐다'), defined('atp', 'ATP는 화폐다')] });
  assert.deepEqual([...map], [['atp', 0]]);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/pack/knowledge-defined-before-use.test.js` · Expected: FAIL (`Cannot find module .../defined-before-use.js`)

- [ ] **Step 3: 구현**

<!-- file: packs/knowledge/checkers/definitions.js -->
```js
/** 정의 전 사용을 보는 엔티티 종류. example(예제)은 정의 대상이 아니다. */
export const TERM_KINDS = Object.freeze(['concept', 'term']);
export const DEFINED = 'term.defined';

const nfc = (text) => text.normalize('NFC');

/** 인용은 다듬은 길이 2 이상이고 원고(NFC)에 그대로 있어야 한다(코어 인용 규칙·소설 dead-on-stage 와 같은 기준). */
export function quotedInDraft(quote, draft) {
  if (typeof quote !== 'string' || quote.trim().length < 2) return false;
  return typeof draft === 'string' && nfc(draft).includes(nfc(quote));
}

/** 엔티티의 이름과 별칭(빈 값 제외). */
export const namesOf = (entity) => [entity?.name, ...(Array.isArray(entity?.aliases) ? entity.aliases : [])]
  .filter((name) => typeof name === 'string' && name.length > 0);

/** 인용 안에 그 엔티티의 이름이나 별칭이 있는가(NFC). 다른 문장을 인용해 정의를 흉내 내지 못하게 한다. */
export const quoteNames = (quote, entity) => namesOf(entity).some((name) => nfc(quote).includes(nfc(name)));

/**
 * 이 원고의 인용 있는 정의: kind 가 term.defined 이고, 인용이 원고에 그대로 있고, 인용에 그 엔티티 이름·별칭이 있는 사건.
 * 반환: Map<entityId, 원고(NFC) 안 인용 첫 위치>. 같은 엔티티를 여러 번 정의하면 가장 앞 위치.
 * @param {{ draft?: string, draftEvents?: any[], work?: { entities: Map<string, any> } }} ctx
 */
export function draftDefinitions(ctx) {
  const entities = ctx.work?.entities ?? new Map();
  const draft = typeof ctx.draft === 'string' ? nfc(ctx.draft) : '';
  const out = new Map();
  for (const event of ctx.draftEvents ?? []) {
    if (event?.kind !== DEFINED || !quotedInDraft(event.quote, draft)) continue;
    const entity = entities.get(event.entityId);
    if (!entity || !quoteNames(event.quote, entity)) continue;
    const at = draft.indexOf(nfc(event.quote));
    if (!out.has(event.entityId) || at < out.get(event.entityId)) out.set(event.entityId, at);
  }
  return out;
}

/** 앞 노드에서 정의된 엔티티 id. 기록장의 사건은 커밋(영수증)을 거쳤으므로 그대로 인정한다. */
export const priorDefinitions = (ctx) => new Set((ctx.priorEvents ?? []).filter((e) => e?.kind === DEFINED).map((e) => e.entityId));

/** 엔티티의 선수 개념 id 목록(문자열만, 중복 없이). */
export const prerequisitesOf = (entity) => [...new Set((Array.isArray(entity?.data?.prerequisites) ? entity.data.prerequisites : [])
  .filter((id) => typeof id === 'string' && id.length > 0))];
```

<!-- file: packs/knowledge/checkers/defined-before-use.js -->
```js
import { TERM_KINDS, draftDefinitions, priorDefinitions } from './definitions.js';

/**
 * 정의 전 사용(knowledge.defined-before-use). 이 노드에 나온(ctx.entityIds: 등장·언급·이름 스캔·사건·기록된 등장 위치) 개념·용어가
 * 앞 노드에서 정의(term.defined)되지 않았고 이 원고에도 인용 있는 정의가 없으면 지적한다.
 * - 이 원고의 정의는 인용이 원고에 그대로 있고 인용에 그 이름·별칭이 있어야 인정한다. 인용 없는 추출 한 줄로 지적이 꺼지면 안 된다.
 * - 등급은 pack.yaml(advisory)과 작가 설정(severityOverride)이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ entityIds?: string[], priorEvents?: any[], draftEvents?: any[], draft?: string, work?: { entities: Map<string, any> } }} ctx
 */
export function definedBeforeUse(ctx) {
  const entities = ctx.work?.entities ?? new Map();
  const defined = new Set([...priorDefinitions(ctx), ...draftDefinitions(ctx).keys()]);
  const findings = [];
  for (const id of ctx.entityIds ?? []) {
    const entity = entities.get(id);
    if (!entity || !TERM_KINDS.includes(entity.kind) || defined.has(id)) continue;
    findings.push({
      code: 'USED_BEFORE_DEFINED', entityId: id,
      message: `${entity.name}(${id}): 앞에서 정의되지 않았고 이 원고에도 인용 있는 정의(term.defined)가 없다`,
    });
  }
  return findings;
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test test/pack/knowledge-defined-before-use.test.js && npm run check` · Expected: PASS, 전체 626/626

- [ ] **Step 5: 커밋**

```bash
git add packs/knowledge/checkers/definitions.js packs/knowledge/checkers/defined-before-use.js test/pack/knowledge-defined-before-use.test.js
git commit -m "feat(knowledge): defined-before-use checker with quoted, name-bearing definitions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A2: 선수 개념 범위(코어)와 `knowledge.prerequisite-order` 검사기

> 리뷰: **가장 강한 모델**(검사 범위·다시 확인 필요 경로). 공격해 볼 것:
> - 선수 개념을 같은 원고에서 **뒤에** 정의하거나, 같은 인용 하나로 둘 다 정의해 순서를 속이기.
> - 인용 없는 선수 개념 정의, 이름 없는 인용.
> - 범위 넓히기가 소설 작품의 `entityIds`·`priorEvents`·`refs`를 바꾸는지(바뀌면 안 된다 — 기존 `test/run/scope.test.js`, `occurrence-scope.test.js`가 그대로 통과해야 한다).
> - `prerequisites`에 없는 id·숫자·객체·`__proto__`를 적어 코어를 던지게 하기(던지면 모든 실행이 멈춘다).
> - 선수 개념이 `entityIds`로 새어 들어가 정의 전 사용이 거짓 지적을 내는지.
> - 선수 개념의 앞 정의를 바꾼 뒤(`refs`) 커밋된 노드가 다시 확인 필요로 나오는지 — `findStale`은 `refs`를 하나씩 비교하므로 `entity:<선수 개념>` 항목이 있으면 된다.

**Files:**
- Modify: `core/scope/scope.js`
- Create: `packs/knowledge/checkers/prerequisite-order.js`
- Test: `test/pack/knowledge-prerequisite-order.test.js`, `test/run/scope-prerequisites.test.js`

**Interfaces:**
- Consumes: A1 `draftDefinitions`, `priorDefinitions`, `prerequisitesOf`.
- Produces: `gatherScope(...)`의 반환에 `prerequisiteIds: string[]`(정렬됨)을 더한다. `priorEvents`와 `refs`(`kind: 'entity'`)는 `entityIds ∪ prerequisiteIds`를 덮는다(id 순). `prerequisiteOrder(ctx) → Array<{ code: 'PREREQUISITE_NOT_DEFINED'|'PREREQUISITE_UNKNOWN', entityId, prerequisite, message }>`. B1이 `run: prerequisite-order`로 등록한다.

- [ ] **Step 1: 실패하는 테스트**

<!-- file: test/pack/knowledge-prerequisite-order.test.js -->
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prerequisiteOrder } from '../../packs/knowledge/checkers/prerequisite-order.js';

const entity = (id, name, prerequisites) => [id, { id, kind: 'concept', name, aliases: [], data: prerequisites ? { prerequisites } : {} }];
const work = {
  entities: new Map([
    entity('cell', '세포'), entity('membrane', '세포막', ['cell']), entity('diffusion', '확산', ['membrane', 'cell']), entity('osmosis', '삼투', ['ghost']),
  ]),
};
const defined = (entityId, quote) => ({ entityId, kind: 'term.defined', quote });
const codes = (findings) => findings.map((f) => [f.code, f.entityId, f.prerequisite, f.severity ?? null]);

test('prerequisite-order: defining X before its prerequisites are defined is flagged', () => {
  const draft = '확산은 물질이 퍼지는 것이다.';
  const findings = prerequisiteOrder({ work, draft, priorEvents: [], draftEvents: [defined('diffusion', '확산은 물질이 퍼지는 것이다')] });
  assert.deepEqual(codes(findings), [['PREREQUISITE_NOT_DEFINED', 'diffusion', 'membrane', null], ['PREREQUISITE_NOT_DEFINED', 'diffusion', 'cell', null]]);
  assert.match(findings[0].message, /세포막\(membrane\)/);
});

test('prerequisite-order: an earlier definition, or a quoted definition earlier in this draft, satisfies a prerequisite', () => {
  const draft = '세포막은 세포의 경계다. 확산은 물질이 퍼지는 것이다.';
  const ctx = {
    work, draft, priorEvents: [{ entityId: 'cell', kind: 'term.defined', nodeId: 'intro', eventId: 'ev-1' }],
    draftEvents: [defined('diffusion', '확산은 물질이 퍼지는 것이다'), defined('membrane', '세포막은 세포의 경계다')],
  };
  assert.deepEqual(prerequisiteOrder(ctx), []);
});

test('prerequisite-order: a prerequisite defined later in the same draft, or only by an unquoted event, does not count', () => {
  const draft = '확산은 물질이 퍼지는 것이다. 세포막은 세포의 경계다.';
  const later = { work, draft, priorEvents: [{ entityId: 'cell', kind: 'term.defined' }], draftEvents: [defined('diffusion', '확산은 물질이 퍼지는 것이다'), defined('membrane', '세포막은 세포의 경계다')] };
  assert.deepEqual(codes(prerequisiteOrder(later)), [['PREREQUISITE_NOT_DEFINED', 'diffusion', 'membrane', null]]);
  const unquoted = { ...later, draftEvents: [defined('diffusion', '확산은 물질이 퍼지는 것이다'), { entityId: 'membrane', kind: 'term.defined' }] };
  assert.deepEqual(codes(prerequisiteOrder(unquoted)), [['PREREQUISITE_NOT_DEFINED', 'diffusion', 'membrane', null]]);
});

test('prerequisite-order: only quoted definitions in this draft trigger it; an unknown prerequisite id is reported', () => {
  assert.deepEqual(prerequisiteOrder({ work, draft: '확산.', priorEvents: [], draftEvents: [{ entityId: 'diffusion', kind: 'term.defined' }] }), []);
  const draft = '삼투는 물이 막을 지나는 것이다.';
  assert.deepEqual(codes(prerequisiteOrder({ work, draft, priorEvents: [], draftEvents: [defined('osmosis', '삼투는 물이 막을 지나는 것이다')] })), [['PREREQUISITE_UNKNOWN', 'osmosis', 'ghost', null]]);
});
```

<!-- file: test/run/scope-prerequisites.test.js -->
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gatherScope } from '../../core/scope/scope.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { copyFixture } from '../support/fixtures.js';

test('gatherScope adds the prerequisites of entities named by this draft\'s events to priorEvents and refs, not to entityIds', async () => {
  const root = await copyFixture('knowledge-book');
  await writeFile(join(root, 'entities', 'term', 'cell.md'), '---\nid: cell\nkind: term\nname: 세포\n---\n');
  await writeFile(join(root, 'entities', 'term', 'membrane.md'), '---\nid: membrane\nkind: term\nname: 세포막\nprerequisites: [cell, ghost]\n---\n');
  const ledger = openLedger(root, 'events', { now: () => '2026-09-27T00:00:00.000Z' });
  await ledger.append({ type: 'event', eventId: 'seed-1', receiptId: 'seed', nodeId: 'what-is-a-cell', entityId: 'cell', kind: 'term.defined' });
  const work = await openWork(root);
  const events = activeEvents(await ledger.readAll());
  const draftText = '세포막은 바깥 경계다.';
  const plain = gatherScope({ work, events, nodeId: 'membranes', draftText });
  assert.deepEqual([plain.entityIds, plain.prerequisiteIds, plain.priorEvents.length], [['membrane'], [], 0]);
  const extracted = { events: [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 바깥 경계다' }], appearances: [], mentions: [] };
  const scope = gatherScope({ work, events, nodeId: 'membranes', draftText, extracted });
  assert.deepEqual(scope.entityIds, ['membrane']);
  assert.deepEqual(scope.prerequisiteIds, ['cell']);
  assert.deepEqual(scope.priorEvents.map((e) => `${e.nodeId}:${e.entityId}:${e.kind}`), ['what-is-a-cell:cell:term.defined']);
  assert.deepEqual(scope.refs.filter((r) => r.kind === 'entity').map((r) => r.id), ['cell', 'membrane']);
});
```

(`세포막`을 먼저 가리고 세므로 이름 스캔은 `세포`를 따로 세지 않는다 — `entityIds`는 `['membrane']`이다.)

- [ ] **Step 2: 실패 확인** — Run: `node --test test/pack/knowledge-prerequisite-order.test.js test/run/scope-prerequisites.test.js` · Expected: FAIL (`Cannot find module .../prerequisite-order.js`, 그리고 scope 테스트는 `actual: [ [ 'membrane' ], undefined, 0 ]`)

- [ ] **Step 3: 구현**

<!-- file: packs/knowledge/checkers/prerequisite-order.js -->
```js
import { draftDefinitions, prerequisitesOf, priorDefinitions } from './definitions.js';

/**
 * 선수 개념 순서(knowledge.prerequisite-order). 이 원고가 X 를 정의(인용 있는 term.defined)하는데
 * X 의 선수 개념(엔티티 data.prerequisites) 가운데 앞 노드에서도, 이 원고의 X 정의보다 앞(인용 위치)에서도 정의되지 않은 것이 있으면 지적한다.
 * - 선수 개념의 앞 사건은 코어 범위(gatherScope 의 prerequisiteIds)가 priorEvents 에 넣어 준다.
 * - 없는 엔티티 id 를 선수 개념으로 적었으면 PREREQUISITE_UNKNOWN 으로 알린다(조용히 넘기지 않는다).
 * - 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ priorEvents?: any[], draftEvents?: any[], draft?: string, work?: { entities: Map<string, any> } }} ctx
 */
export function prerequisiteOrder(ctx) {
  const entities = ctx.work?.entities ?? new Map();
  const prior = priorDefinitions(ctx);
  const here = draftDefinitions(ctx);
  const findings = [];
  for (const [id, at] of here) {
    const entity = entities.get(id);
    for (const need of prerequisitesOf(entity)) {
      if (!entities.has(need)) {
        findings.push({ code: 'PREREQUISITE_UNKNOWN', entityId: id, prerequisite: need, message: `${entity.name}(${id}): 선수 개념 "${need}"은(는) 없는 엔티티다` });
        continue;
      }
      if (prior.has(need) || (here.has(need) && here.get(need) < at)) continue;
      const name = entities.get(need).name;
      findings.push({
        code: 'PREREQUISITE_NOT_DEFINED', entityId: id, prerequisite: need,
        message: `${entity.name}(${id})을(를) 정의하기 전에 선수 개념 ${name}(${need})이(가) 정의되지 않았다`,
      });
    }
  }
  return findings;
}
```

`core/scope/scope.js`를 세 곳 고친다.

(1) import 줄들 바로 뒤(`const uniqueSorted = ...` 앞)에 더한다:

<!-- old: core/scope/scope.js -->
```js
import { canonicalJson, sha256 } from '../util/hash.js';
```
<!-- new: core/scope/scope.js -->
```js
import { canonicalJson, sha256 } from '../util/hash.js';

/** 엔티티 설정의 선수 개념 id(data.prerequisites 의 문자열). 코어는 뜻을 모른다 — 범위를 넓히는 데만 쓴다. */
const prerequisitesOf = (entity) => (Array.isArray(entity?.data?.prerequisites) ? entity.data.prerequisites.filter((id) => typeof id === 'string') : []);
```

(2) `priorEvents` 계산:

<!-- old: core/scope/scope.js -->
```js
  const before = eventsBefore({ events, positions: work.positions, nodeId });
  const priorEvents = before.events.filter((e) => entityIds.includes(e.entityId));
```
<!-- new: core/scope/scope.js -->
```js
  // 선수 개념(N1): 이 원고의 사건이 가리키는 엔티티의 선수 개념을 한 단계만 더한다. 등장(entityIds)으로 치지 않고,
  // 앞 사건(priorEvents)과 참고 버전(refs)에만 넣는다 — 선수 개념의 정의가 앞에서 바뀌면 이 노드도 다시 확인 필요가 된다.
  const prerequisiteIds = uniqueSorted(fromEvents.filter(known).flatMap((id) => prerequisitesOf(work.entities.get(id))))
    .filter((id) => known(id) && !entityIds.includes(id));
  const scopedIds = uniqueSorted([...entityIds, ...prerequisiteIds]);
  const before = eventsBefore({ events, positions: work.positions, nodeId });
  const priorEvents = before.events.filter((e) => scopedIds.includes(e.entityId));
```

(3) `refs`의 엔티티 줄과 반환값:

<!-- old: core/scope/scope.js -->
```js
    ...entityIds.map((id) => ({ kind: 'entity', id, rev: entityRevAt({ work, events, entityId: id, nodeId }) })),
```
<!-- new: core/scope/scope.js -->
```js
    ...scopedIds.map((id) => ({ kind: 'entity', id, rev: entityRevAt({ work, events, entityId: id, nodeId }) })),
```

<!-- old: core/scope/scope.js -->
```js
    nodeId, ordered: before.applicable, appearances, entityIds, priorEvents, upperPlans,
```
<!-- new: core/scope/scope.js -->
```js
    nodeId, ordered: before.applicable, appearances, entityIds, prerequisiteIds, priorEvents, upperPlans,
```

`gatherScope` JSDoc의 반환 설명은 없으므로 더 적지 않는다. `known`은 `work.entities.has`라 `__proto__` 같은 문자열도 거짓이다. 선수 개념이 없는 작품(소설)은 `prerequisiteIds = []`, `scopedIds = entityIds`라 결과가 이전과 같다.

- [ ] **Step 4: 통과 확인** — Run: `node --test test/pack/knowledge-prerequisite-order.test.js test/run/scope-prerequisites.test.js test/run/scope.test.js test/run/occurrence-scope.test.js && npm run check` · Expected: PASS, 전체 631/631

- [ ] **Step 5: 커밋**

```bash
git add core/scope/scope.js packs/knowledge/checkers/prerequisite-order.js test/pack/knowledge-prerequisite-order.test.js test/run/scope-prerequisites.test.js
git commit -m "feat(scope,knowledge): prerequisites widen prior events and refs; prerequisite-order checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A3: `knowledge.term-consistency` 검사기

> 리뷰: **가장 강한 모델**(울타리 우회). 공격해 볼 것:
> - 울타리 우회: 줄 중간의 ```` ``` ````, 들여쓰기 4칸 울타리, 짧은 닫는 울타리(```` ```` ```` 여닫이에 ```` ``` ````로 닫기), `~~~`와 ```` ``` ```` 섞기, CRLF. 결과는 `core/util/fences.js`의 규칙과 같아야 한다(A2 판정). 닫히지 않은 울타리가 글 끝까지 가리는 것은 규칙대로다(결정 7).
> - NFD로 쓴 표기, 앞뒤 공백만 다른 avoid 값, 빈 문자열 avoid(모든 곳에 걸리면 안 된다).
> - 엔티티 이름 안에 든 avoid 표기가 거짓 지적을 내는지.
> - 지적이 `severity`를 들고 나오는지.

**Files:**
- Create: `packs/knowledge/checkers/term-consistency.js`
- Test: `test/pack/knowledge-term-consistency.test.js`

**Interfaces:**
- Consumes: `core/util/fences.js` `fencedRanges(text) → Array<[start, end]>`, `maskRanges(text, ranges) → string`. A1 `namesOf(entity)`.
- Produces: `termConsistency(ctx) → Array<{ code: 'TERM_AVOIDED', entityId, quote, message }>`. B1이 `run: term-consistency`로 등록한다.

- [ ] **Step 1: 실패하는 테스트**

<!-- file: test/pack/knowledge-term-consistency.test.js -->
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { termConsistency } from '../../packs/knowledge/checkers/term-consistency.js';

const entity = (id, name, avoid, aliases = []) => [id, { id, kind: 'term', name, aliases, data: avoid ? { avoid } : {} }];
const work = { entities: new Map([entity('membrane', '세포막', ['세포 막', '셀 멤브레인']), entity('atp', '아데노신 삼인산', ['아데노신'], ['ATP']), entity('cell', '세포')]) };
const codes = (findings) => findings.map((f) => [f.code, f.entityId, f.quote, f.severity ?? null]);

test('term-consistency: an avoided spelling in the prose is flagged with the spelling as the quote, without a severity', () => {
  const findings = termConsistency({ work, draft: '세포 막은 경계다. 세포 막을 지나는 물질이 있다. 셀 멤브레인이라고도 한다.' });
  assert.deepEqual(codes(findings), [['TERM_AVOIDED', 'membrane', '세포 막', null], ['TERM_AVOIDED', 'membrane', '셀 멤브레인', null]]);
  assert.match(findings[0].message, /2번/);
});

test('term-consistency: spellings inside code fences are ignored, an unclosed fence runs to the end', () => {
  const fenced = ['세포막은 경계다.', '```text', '세포 막', '```', '~~~', '셀 멤브레인', '~~~'].join('\n');
  assert.deepEqual(termConsistency({ work, draft: fenced }), []);
  assert.deepEqual(termConsistency({ work, draft: '세포막.\n```\n세포 막' }), []);
  assert.deepEqual(codes(termConsistency({ work, draft: '세포 막 ```\n안' })), [['TERM_AVOIDED', 'membrane', '세포 막', null]]);
});

test('term-consistency: an avoided spelling inside the entity\'s own name or alias is not counted; NFD text still matches', () => {
  assert.deepEqual(termConsistency({ work, draft: '아데노신 삼인산(ATP)은 화폐다.' }), []);
  assert.deepEqual(codes(termConsistency({ work, draft: '아데노신은 화폐다.' })), [['TERM_AVOIDED', 'atp', '아데노신', null]]);
  assert.deepEqual(codes(termConsistency({ work, draft: '세포 막은 경계다.'.normalize('NFD') })), [['TERM_AVOIDED', 'membrane', '세포 막', null]]);
});

test('term-consistency: no avoid list, blank or non-string entries, or no draft give nothing', () => {
  const odd = { entities: new Map([entity('x', '엑스', ['', '  ', 3, null])]) };
  assert.deepEqual(termConsistency({ work: odd, draft: '엑스  3' }), []);
  assert.deepEqual(termConsistency({ work }), []);
  assert.deepEqual(termConsistency({ draft: '세포 막' }), []);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/pack/knowledge-term-consistency.test.js` · Expected: FAIL (module not found)

- [ ] **Step 3: 구현**

<!-- file: packs/knowledge/checkers/term-consistency.js -->
```js
import { fencedRanges, maskRanges } from '../../../core/util/fences.js';
import { namesOf } from './definitions.js';

const nfc = (text) => text.normalize('NFC');

/** 엔티티의 avoid 표기(다듬어 빈 것 제외, NFC, 중복 없이). */
const avoidOf = (entity) => [...new Set((Array.isArray(entity?.data?.avoid) ? entity.data.avoid : [])
  .filter((form) => typeof form === 'string' && form.trim().length > 0).map(nfc))];

/** text 에서 term 이 나온 곳을 모두 NUL 로 가린다(길이·위치 그대로). */
function maskAll(text, term) {
  let out = text;
  let at = out.indexOf(term);
  while (at !== -1) {
    out = out.slice(0, at) + '\u0000'.repeat(term.length) + out.slice(at + term.length);
    at = out.indexOf(term, at + term.length);
  }
  return out;
}

function count(text, term) {
  let n = 0;
  for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + term.length)) n += 1;
  return n;
}

/**
 * 용어 통일(knowledge.term-consistency). 원고 본문에 엔티티의 avoid 표기(쓰지 않기로 한 표기)가 있으면 그 표기를 인용해 지적한다.
 * - 코드 블록(``` ~~~ 울타리, core/util/fences.js) 안은 보지 않는다. 닫히지 않은 울타리는 글 끝까지 코드 블록이다(M4 A2 와 같은 규칙).
 * - 그 엔티티의 이름·별칭 안에 든 avoid 표기는 세지 않는다(예: 이름 "아데노신 삼인산", avoid "아데노신").
 * - 순서와 무관하다(requiresOrder 없음). 작품의 모든 엔티티를 본다 — 피할 표기는 이름 스캔에 걸리지 않으니 범위로 좁힐 수 없다.
 * - 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다.
 * @param {{ draft?: string, work?: { entities: Map<string, any> } }} ctx
 */
export function termConsistency(ctx) {
  const text = typeof ctx.draft === 'string' ? nfc(ctx.draft) : '';
  const prose = maskRanges(text, fencedRanges(text));
  const findings = [];
  for (const entity of ctx.work?.entities?.values() ?? []) {
    const forms = avoidOf(entity);
    if (forms.length === 0) continue;
    const names = namesOf(entity).map(nfc).sort((a, b) => b.length - a.length);
    const masked = names.reduce(maskAll, prose);
    for (const form of forms) {
      const times = count(masked, form);
      if (times === 0) continue;
      findings.push({
        code: 'TERM_AVOIDED', entityId: entity.id, quote: form,
        message: `${entity.name}(${entity.id}): 쓰지 않기로 한 표기 "${form}"이(가) ${times}번 나온다. "${entity.name}"(으)로 통일한다`,
      });
    }
  }
  return findings;
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test test/pack/knowledge-term-consistency.test.js && npm run check` · Expected: PASS, 전체 635/635

- [ ] **Step 5: 커밋**

```bash
git add packs/knowledge/checkers/term-consistency.js test/pack/knowledge-term-consistency.test.js
git commit -m "feat(knowledge): term-consistency checker skips code fences and the entity's own names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Part B — 팩 · 도구 · 문서

### Task B1: `packs/knowledge` 팩 조립과 등록

> 리뷰: **가장 강한 모델**(검사 세트·잠금·등급). 공격해 볼 것:
> - pack.yaml에 `locked`를 적거나, `facts` 단계를 `mode: off`로 두거나, `extract` 없이 `facts`를 두면 로더가 거부하는지(코어 `validatePack` — 이 팩은 그런 것을 적지 않는다).
> - 작가가 `severity: hard`로 올리기(거부), `core.promise-order`를 `mode: off`(거부), `checkSets: []`에서 promise 잠금이 빠지는지(빠지면 안 된다).
> - `requiresOrder: linear` 검사가 front/back 노드에서 `not_applicable`인지, 용어 통일은 도는지.
> - 팩 digest: 검사기 이름을 바꾸거나 md 글을 바꾸면 `pack.digest`가 바뀌는지(기존 `test/pack/pack-digest.test.js` 규칙).
> - 기존 knowledge-book 테스트(가짜 팩)가 그대로 통과하는지.

**Files:**
- Create: `packs/knowledge/pack.yaml`, `packs/knowledge/index.js`, `packs/knowledge/README.md`, `packs/knowledge/checkers/index.js`, `packs/knowledge/checks/{parent-fit,critic,goals-covered,exercises-cover-goals}.md`, `packs/knowledge/prompts/{leaf-plan,draft,extract,revise,branch-plan,revise-plan,children}.md`
- Modify: `packs/index.js`, `test/pack/novel-pack.test.js:15`
- Test: `test/pack/knowledge-pack.test.js`

**Interfaces:**
- Consumes: A1 `definedBeforeUse`, A2 `prerequisiteOrder`, A3 `termConsistency`. `loadYamlPack(dir, { name, checkers })`.
- Produces: `KNOWLEDGE_CHECKERS`(`'defined-before-use'`, `'prerequisite-order'`, `'term-consistency'`), `KNOWLEDGE_PACK_DIR`, `loadKnowledgePack() → Promise<Pack>`. `loadBuiltinPacks()`가 `Map { 'novel' → Pack, 'knowledge' → Pack }`(이 순서)를 돌려준다. 프리셋 `textbook`·`history`·`guide`, 세트 `knowledge.basic`·`knowledge.terms`·`knowledge.exercises`, 검사 id는 설계 요약과 같다. B2·C1이 쓴다.

- [ ] **Step 1: 실패하는 테스트**

<!-- file: test/pack/knowledge-pack.test.js -->
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { KNOWLEDGE_PACK_DIR } from '../../packs/knowledge/index.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const MEMBRANES = '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다. 막을 지나는 물질은 ATP를 쓴다. 자세한 원리는 에너지 장에서 다룬다.\n';
const DEFINES_MEMBRANE = { events: [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다' }], appearances: [], mentions: [] };

/** knowledge-book 복사본의 work.yaml 을 고친다(원본 fixture 는 그대로). */
async function book(edit = {}) {
  const root = await copyFixture('knowledge-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...edit }));
  return root;
}

async function runMembranes(root, until = (o) => o.status === 'needs_user') {
  const packs = await loadBuiltinPacks();
  const host = createFakeHost({ drafts: { membranes: MEMBRANES }, events: { membranes: DEFINES_MEMBRANE } });
  return (await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'membranes' }, until })).at(-1);
}

test('the knowledge pack loads with three presets, three sets and advisory experimental deterministic checks', async () => {
  const packs = await loadBuiltinPacks();
  assert.deepEqual([...packs.keys()], ['novel', 'knowledge']);
  const pack = packs.get('knowledge');
  assert.deepEqual(Object.keys(pack.presets), ['textbook', 'history', 'guide']);
  assert.deepEqual(Object.values(pack.presets).map((p) => [p.levels.map((l) => l.name), p.checkSets]), [
    [['part', 'chapter', 'section'], ['knowledge.basic']], [['era', 'chapter', 'section'], ['knowledge.basic']], [['chapter', 'section'], ['knowledge.basic']],
  ]);
  assert.deepEqual(pack.defaultCheckSets, ['knowledge.basic']);
  assert.deepEqual(Object.fromEntries(Object.entries(pack.checkSets).map(([id, set]) => [id, set.checks])), {
    'knowledge.basic': ['knowledge.defined-before-use', 'knowledge.prerequisite-order', 'knowledge.parent-fit', 'knowledge.critic', 'knowledge.goals-covered'],
    'knowledge.terms': ['knowledge.term-consistency'],
    'knowledge.exercises': ['knowledge.exercises-cover-goals'],
  });
  const view = (id) => { const c = pack.checks.find((x) => x.id === id); return [c.tier, c.stage, c.severity, Boolean(c.experimental), c.requiresOrder ?? null]; };
  assert.deepEqual(view('knowledge.defined-before-use'), ['deterministic', 'facts', 'advisory', true, 'linear']);
  assert.deepEqual(view('knowledge.prerequisite-order'), ['deterministic', 'facts', 'advisory', true, 'linear']);
  assert.deepEqual(view('knowledge.term-consistency'), ['deterministic', 'facts', 'advisory', true, null]);
  assert.deepEqual(view('knowledge.parent-fit'), ['model', 'fit', 'block', false, null]);
  assert.deepEqual(view('knowledge.critic'), ['model', 'critic', 'advisory', false, null]);
  assert.deepEqual(view('knowledge.goals-covered'), ['model', 'review', 'advisory', false, null]);
  assert.deepEqual(view('knowledge.exercises-cover-goals'), ['model', 'critic', 'advisory', true, null]);
  assert.equal(pack.checks.find((c) => c.id === 'knowledge.parent-fit').requiresParentPlan, true);
  assert.ok(pack.checks.every((c) => !c.locked), 'a pack cannot declare locks');
  assert.equal(pack.prompts['leaf.extract'], await readFile(join(KNOWLEDGE_PACK_DIR, 'prompts', 'extract.md'), 'utf8'));
  assert.match(pack.prompts['leaf.extract'], /term\.defined/);
  assert.match(pack.prompts['leaf.extract'], /occurrences\.wanted/);
});

test('the knowledge-book fixture now opens with the real knowledge pack; its empty checkSets still keep the core lock', async () => {
  const ws = await openWorkspace(await copyFixture('knowledge-book'), { packs: await loadBuiltinPacks() });
  assert.deepEqual(ws.registry.packs.map((p) => p.name), ['knowledge']);
  assert.deepEqual(ws.checks.map((c) => c.id), ['core.promise-order']);
  assert.deepEqual(ws.pipelines.leaf.steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
});

test('membranes (uses ATP before the ATP section defines it) gets an advisory at the approve question', async () => {
  const root = await book({ checkSets: ['knowledge.basic', 'knowledge.terms'] });
  const first = await createRunner({ root, packs: await loadBuiltinPacks() }).run({ node: 'membranes' });
  assert.equal(first.requests[0].payload.instructions, await readFile(join(KNOWLEDGE_PACK_DIR, 'prompts', 'leaf-plan.md'), 'utf8'));
  const last = await runMembranes(root);
  assert.equal(label(last), 'user:approve');
  assert.deepEqual(last.question.blocking, []);
  assert.deepEqual(last.question.advisories.map((f) => [f.checkId, f.code, f.entityId, f.severity]), [
    ['knowledge.defined-before-use', 'USED_BEFORE_DEFINED', 'atp', 'advisory'],
  ]);
});

test('the author can raise defined-before-use to block: the run stops and approving needs a reason; hard is refused', async () => {
  const root = await book({ checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { severity: 'block' } } });
  const last = await runMembranes(root);
  assert.equal(label(last), 'user:blocked');
  assert.equal(last.question.canApprove, true);
  assert.deepEqual(last.question.blocking.map((f) => [f.code, f.entityId, f.severity]), [['USED_BEFORE_DEFINED', 'atp', 'block']]);
  await assert.rejects(createRunner({ root, packs: await loadBuiltinPacks() }).decide({ runId: last.runId, action: 'approve' }), { code: 'OVERRIDE_REASON_REQUIRED' });
  const hard = await book({ checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { severity: 'hard' } } });
  await assert.rejects(openWorkspace(hard, { packs: await loadBuiltinPacks() }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'USER_CHECK_SEVERITY_INVALID'));
});

test('front and back matter skip the order checks; term consistency still runs there', async () => {
  const root = await book({ checkSets: ['knowledge.basic', 'knowledge.terms'], overrides: { approve: { mode: 'auto' } } });
  await writeFile(join(root, 'entities', 'term', 'membrane.md'), '---\nid: membrane\nkind: term\nname: 세포막\navoid: [세포 막]\n---\n');
  const packs = await loadBuiltinPacks();
  const host = createFakeHost({ drafts: { glossary: 'ATP: 에너지 화폐. 세포 막: 세포의 경계.' } });
  const last = (await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'glossary' }, until: (o) => o.status === 'done' })).at(-1);
  assert.equal(last.status, 'done');
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'glossary');
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.deepEqual(facts.checks.map((c) => [c.checkId, c.status, c.findings.map((f) => f.code)]), [
    ['core.promise-order', 'not_applicable', []], ['knowledge.defined-before-use', 'not_applicable', []],
    ['knowledge.prerequisite-order', 'not_applicable', []], ['knowledge.term-consistency', 'passed', ['TERM_AVOIDED']],
  ]);
});

test('turning the knowledge sets off is allowed; the core promise lock cannot be turned off', async () => {
  const packs = await loadBuiltinPacks();
  const off = await openWorkspace(await book({ checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { mode: 'off' } } }), { packs });
  assert.ok(!off.checks.some((c) => c.id === 'knowledge.defined-before-use'));
  assert.ok(off.checks.some((c) => c.id === 'core.promise-order' && c.locked));
  const lock = await book({ checkSets: [], checks: { 'core.promise-order': { mode: 'off' } } });
  await assert.rejects(openWorkspace(lock, { packs }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'LOCKED_CHECK_OVERRIDE'));
});
```

`book()` 복사본의 `membranes`는 fixture 본문 그대로의 원고다. ATP는 뒤 `atp-section`에서 정의되므로(결정 1) 정의 전 사용이 난다. 세포막은 추출 답의 인용 있는 정의로 풀린다.

- [ ] **Step 2: 실패 확인** — Run: `node --test test/pack/knowledge-pack.test.js` · Expected: FAIL (`Cannot find module .../packs/knowledge/index.js`)

- [ ] **Step 3: 팩 파일 쓰기**

<!-- file: packs/knowledge/pack.yaml -->
```yaml
name: knowledge
version: 1
title: 지식 책
description: 교재·역사서·안내서. 개념을 정의한 뒤에 쓰고, 선수 개념 순서와 용어 통일을 본다. 계획·원고·사건 추출 순서로 쓴다.
presets:
  textbook:
    title: 교재
    description: 부·장·절로 쓴다.
    levels:
      - { name: part, children: [1, 10] }
      - { name: chapter, children: [1, 20] }
      - { name: section, leaf: true }
    checkSets: [knowledge.basic]
  history:
    title: 역사
    description: 시대·장·절로 쓴다.
    levels:
      - { name: era, children: [1, 20] }
      - { name: chapter, children: [1, 30] }
      - { name: section, leaf: true }
    checkSets: [knowledge.basic]
  guide:
    title: 안내서
    description: 장·절로 쓴다.
    levels:
      - { name: chapter, children: [1, 30] }
      - { name: section, leaf: true }
    checkSets: [knowledge.basic]
pipelines:
  leaf:
    - { id: plan, kind: generate, produces: plan }
    - { id: draft, kind: generate, produces: draft }
    - { id: extract, kind: generate, produces: events, requires: [draft] }
    - { id: facts, kind: check, tier: deterministic, stage: facts, requires: [extract] }
    - { id: critic, kind: check, tier: model, stage: critic }
    - { id: revise, kind: generate, produces: draft, loop: { until: [facts], max: 3 } }
    - { id: approve, kind: gate }
    - { id: commit, kind: commit }
  branch:
    - { id: plan, kind: generate, produces: plan }
    - { id: fit, kind: check, tier: model, stage: fit }
    - { id: revise, kind: generate, produces: draft, loop: { until: [fit], max: 3 } }
    - { id: approve, kind: gate }
    - { id: children, kind: generate, produces: children }
    - { id: review, kind: check, tier: model, stage: review }
    - { id: commit, kind: commit }
prompts:
  leaf.plan: prompts/leaf-plan.md
  leaf.draft: prompts/draft.md
  leaf.extract: prompts/extract.md
  leaf.revise: prompts/revise.md
  branch.plan: prompts/branch-plan.md
  branch.revise: prompts/revise-plan.md
  branch.children: prompts/children.md
checks:
  knowledge.defined-before-use:
    title: 정의 전 사용
    description: 앞에서 정의하지 않은 개념·용어를 이 절이 쓰면 알린다. 이 원고의 정의는 원고 인용이 있어야 인정한다.
    tier: deterministic
    stage: facts
    severity: advisory
    experimental: true
    requiresOrder: linear
    run: defined-before-use
  knowledge.prerequisite-order:
    title: 선수 개념 순서
    description: 개념을 정의할 때 그 선수 개념이 먼저 정의됐는지 본다.
    tier: deterministic
    stage: facts
    severity: advisory
    experimental: true
    requiresOrder: linear
    run: prerequisite-order
  knowledge.term-consistency:
    title: 용어 통일
    description: 엔티티에 적은 쓰지 않을 표기(avoid)가 본문에 나오면 알린다. 코드 블록 안은 보지 않는다.
    tier: deterministic
    stage: facts
    severity: advisory
    experimental: true
    run: term-consistency
  knowledge.parent-fit:
    title: 윗계획 맞춤
    description: 이 계획이 윗계획의 학습 목표와 약속을 지키는지.
    tier: model
    stage: fit
    severity: block
    requiresParentPlan: true
    instruction: checks/parent-fit.md
  knowledge.critic:
    title: 원고 검토
    description: 배우는 사람 입장에서 걸리는 곳. 참고 의견일 뿐 자동으로 고치지 않는다.
    tier: model
    stage: critic
    severity: advisory
    instruction: checks/critic.md
  knowledge.goals-covered:
    title: 학습 목표 다룸
    description: 끝난 자식들이 이 장의 학습 목표를 다뤘는지.
    tier: model
    stage: review
    severity: advisory
    instruction: checks/goals-covered.md
  knowledge.exercises-cover-goals:
    title: 연습문제와 목표
    description: 연습문제가 학습 목표를 덮는지(실험).
    tier: model
    stage: critic
    severity: advisory
    experimental: true
    instruction: checks/exercises-cover-goals.md
checkSets:
  knowledge.basic:
    title: 교재 기본
    description: 정의 전 사용·선수 개념 순서를 알리고 계획·원고·학습 목표를 검토한다.
    checks: [knowledge.defined-before-use, knowledge.prerequisite-order, knowledge.parent-fit, knowledge.critic, knowledge.goals-covered]
    recommendedFor: { kinds: [textbook, history, guide] }
  knowledge.terms:
    title: 용어 통일
    description: 쓰지 않기로 한 표기를 알린다.
    checks: [knowledge.term-consistency]
    recommendedFor: { kinds: [textbook, guide] }
  knowledge.exercises:
    title: 연습문제(실험)
    description: 연습문제가 학습 목표를 덮는지 본다.
    checks: [knowledge.exercises-cover-goals]
    recommendedFor: { kinds: [textbook], levels: [section] }
defaultCheckSets: [knowledge.basic]
```

<!-- file: packs/knowledge/checks/parent-fit.md -->
```markdown
이 계획이 윗계획(upperPlans)의 학습 목표와 약속("뒤에서 설명" 등)을 지키는지 본다. 빠뜨리거나 어긋난 것만 적는다.
```

<!-- file: packs/knowledge/checks/critic.md -->
```markdown
배우는 사람 입장에서 걸리는 곳(설명 없이 건너뛴 단계, 뜻이 흐린 문장, 예가 없는 추상 설명)을 짧게 적는다.
참고 의견이다. 원고를 고치라고 요구하지 않는다.
```

<!-- file: packs/knowledge/checks/goals-covered.md -->
```markdown
이 장(묶음)의 계획에 적힌 학습 목표를 끝난 자식들(children)의 본문이 다뤘는지 본다. 다루지 않은 목표만 적는다.
```

<!-- file: packs/knowledge/checks/exercises-cover-goals.md -->
```markdown
원고의 연습문제가 이 절과 윗계획(upperPlans)의 학습 목표를 덮는지 본다. 연습문제가 없거나 덮지 못한 목표만 적는다.
```

<!-- file: packs/knowledge/prompts/leaf-plan.md -->
```markdown
이 절의 짧은 계획을 쓴다.

- 윗계획(upperPlans)의 학습 목표 가운데 이 절이 맡을 것을 고른다.
- 이 절에서 새로 정의할 개념·용어와, 앞 절에서 이미 정의된 것(priorEvents의 term.defined)을 나눈다. 선수 개념(entities의 prerequisites)이 먼저 정의됐는지 확인한다.
- 다섯 줄 안쪽: 학습 목표, 새로 정의할 것, 예제, 연습문제.

계획 글만 답한다.
```

<!-- file: packs/knowledge/prompts/draft.md -->
```markdown
계획(plan)대로 이 절의 원고를 쓴다.

- 새 개념·용어는 처음 쓰는 곳에서 정의한다. 앞 절에서 정의되지 않은 것을 설명 없이 쓰지 않는다.
- 엔티티 설정(entities)의 avoid 표기는 쓰지 않는다. 이름(name)으로 통일한다.
- 코드와 명령은 코드 블록(```)에 넣는다.
- 원고 본문만 답한다. 제목·설명·머리말을 붙이지 않는다.
```

<!-- file: packs/knowledge/prompts/extract.md -->
````markdown
원고(draft)에서 사건과 등장을 뽑아 JSON 하나로만 답한다.

```json
{
  "events": [
    { "entityId": "atp", "kind": "term.defined", "quote": "ATP는 세포가 쓰는 에너지 화폐다" }
  ],
  "appearances": ["atp"],
  "mentions": ["cell"],
  "occurrences": [{ "entityId": "atp", "kind": "appearance", "quote": "ATP는" }]
}
```

- `entityId`는 entities 목록의 id만 쓴다. 없는 개념은 적지 않는다.
- `kind`:
  - `term.defined` — 이 원고가 개념·용어를 처음 정의한다.
  - `term.redefined` — 앞에서 정의한 것을 다시 설명한다.
  - `promise.planted` · `promise.advanced` · `promise.misdirected` · `promise.resolved` · `promise.closed` · `promise.parked` — 약속("5장에서 자세히", 학습 목표)의 단계.
- `term.defined`·`term.redefined`에는 `quote`를 반드시 적는다. 원고에 그대로 있고 그 개념의 이름(또는 별칭)이 든 정의 문장이다. 인용 없는 정의는 인정되지 않는다.
- `quote`를 적으면 원고에 그대로 있는 문장이어야 한다.
- `appearances`는 이 절이 설명하거나 쓰는 개념, `mentions`는 이름만 나오는 개념이다.
- 사건이 없으면 `"events": []`.
- 요청의 `occurrences.wanted`가 true면 `occurrences`에 등장 위치를 적는다. 없으면 적지 않는다.
  - `kind`는 `appearance`(설명하거나 씀) 또는 `mention`(이름만 나옴).
  - `quote`는 원고에 그대로 있는 짧은 인용이다. 같은 인용이 원고에 여러 번 있으면 `before`(바로 앞 글) 또는 `after`(바로 뒤 글)를 더해 한 곳을 가리킨다.
  - 코드 블록 안은 적지 않는다.
  - 틀린 인용이 하나라도 있으면 다시 묻는다.
````

<!-- file: packs/knowledge/prompts/revise.md -->
```markdown
원고(draft)를 고친다.

- blocking에 있는 지적만 고친다. 참고 의견(advisory)은 이 단계의 사유가 아니다.
- feedback이 있으면 작가의 요청이다. 그것을 따른다.
- 나머지는 그대로 둔다. 고친 원고 전체만 답한다.
```

<!-- file: packs/knowledge/prompts/branch-plan.md -->
```markdown
이 묶음(부·시대·장)의 계획을 쓴다.

- 윗계획(upperPlans)이 있으면 그 학습 목표와 약속을 지킨다.
- 이미 있는 자식(children)이 있으면 그 흐름을 존중한다.
- 열 줄 안쪽: 학습 목표, 다룰 개념과 그 순서(선수 개념 먼저), 뒤로 미룰 설명("뒤에서 설명")과 거둘 곳.

계획 글만 답한다.
```

<!-- file: packs/knowledge/prompts/revise-plan.md -->
```markdown
이 묶음(부·시대·장)의 계획을 고친다.

- blocking에 있는 지적만 고친다. 참고 의견(advisory)은 이 단계의 사유가 아니다.
- feedback이 있으면 작가의 요청이다. 그것을 따른다.
- 윗계획(upperPlans)의 학습 목표와 이미 있는 자식(children)의 흐름은 지킨다.
- 나머지는 그대로 둔다. 고친 계획 글 전체만 답한다.
```

<!-- file: packs/knowledge/prompts/children.md -->
````markdown
계획(plan)을 자식 노드(childLevel)로 나눈다. JSON 하나로만 답한다.

```json
{ "children": [ { "id": "ch-1", "title": "1장 세포", "brief": "한 줄 요약" } ] }
```

- 개수는 childLevel.range 안이어야 한다.
- 선수 개념을 먼저 다루는 순서로 나눈다.
- `id`는 소문자·숫자·하이픈. 이미 있는 id를 쓰지 않는다. 비워 두면 엔진이 만든다.
````

<!-- file: packs/knowledge/README.md -->
```markdown
# knowledge pack

지식 책(교재·역사서·안내서) 팩. 선언은 `pack.yaml`, 글은 `prompts/`·`checks/`, 결정론 검사기는 `checkers/`(이름으로 등록).

- 프리셋: `textbook`(part → chapter → section), `history`(era → chapter → section), `guide`(chapter → section).
- 엔티티 종류(관례): `concept`, `term`, `example`. 선택 필드 `prerequisites: [id...]`, `avoid: [표기...]`. 약속은 코어 `promise`.
- 사건: `term.defined`, `term.redefined`(원고 인용 필수).
- 세트: `knowledge.basic`(기본) — 정의 전 사용·선수 개념 순서(실험, 참고), 윗계획 맞춤(block), 원고 검토(참고), 학습 목표 다룸(참고). `knowledge.terms` — 용어 통일(실험, 참고). `knowledge.exercises` — 연습문제와 목표(실험, 참고).
- 잠금 단계와 `core.promise-order`는 코어가 정한다. 세트를 꺼도 코어 잠금은 그대로다.
```

- [ ] **Step 4: 검사기 등록과 팩 로더**

<!-- file: packs/knowledge/checkers/index.js -->
```js
import { definedBeforeUse } from './defined-before-use.js';
import { prerequisiteOrder } from './prerequisite-order.js';
import { termConsistency } from './term-consistency.js';

/** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. */
export const KNOWLEDGE_CHECKERS = Object.freeze({
  'defined-before-use': definedBeforeUse, 'prerequisite-order': prerequisiteOrder, 'term-consistency': termConsistency,
});
```

<!-- file: packs/knowledge/index.js -->
```js
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { KNOWLEDGE_CHECKERS } from './checkers/index.js';

export const KNOWLEDGE_PACK_DIR = import.meta.dirname;

/** 지식 책 팩: pack.yaml + 글 + 이름으로 등록한 검사기. */
export const loadKnowledgePack = () => loadYamlPack(KNOWLEDGE_PACK_DIR, { name: 'knowledge', checkers: KNOWLEDGE_CHECKERS });
```

<!-- file: packs/index.js -->
```js
import { loadNovelPack } from './novel/index.js';
import { loadKnowledgePack } from './knowledge/index.js';

/** 내장 팩(이름 → Pack). work.yaml 의 packs 가 이 이름을 가리킨다. */
export async function loadBuiltinPacks() {
  const packs = [await loadNovelPack(), await loadKnowledgePack()];
  return new Map(packs.map((pack) => [pack.name, pack]));
}
```

`test/pack/novel-pack.test.js:15`의 한 줄을 바꾼다(결정 15 — 새 팩 등록으로 목록이 바뀐다. 나머지 assert는 그대로):

<!-- old: test/pack/novel-pack.test.js -->
```js
  assert.deepEqual([...packs.keys()], ['novel']);
```
<!-- new: test/pack/novel-pack.test.js -->
```js
  assert.deepEqual([...packs.keys()], ['novel', 'knowledge']);
```

- [ ] **Step 5: 통과 확인** — Run: `node --test test/pack/ && npm run check` · Expected: PASS, 전체 641/641. 기존 knowledge-book 테스트(가짜 팩)도 그대로 통과한다.

- [ ] **Step 6: 커밋**

```bash
git add packs/index.js packs/knowledge test/pack/knowledge-pack.test.js test/pack/novel-pack.test.js
git commit -m "feat(packs): knowledge pack with textbook, history and guide presets and advisory checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B2: `folio_init` 프리셋 목록과 스킬 문서

> 리뷰: 보통 모델. 확인할 것: 도구 설명과 스킬 문서가 실제 프리셋·세트 id와 같은지, 스킬이 없는 도구 이름을 지어내지 않는지(`skill-docs.test.js`), `packPresets`가 경로·사용자 입력을 되돌리지 않는지(팩·프리셋 id만).

**Files:**
- Modify: `core/work/init.js`, `server/tools/definitions.js`, `skill/folio/SKILL.md`, `test/server/skill-docs.test.js`
- Create: `skill/folio/references/knowledge.md`
- Test: `test/server/knowledge-init.test.js`, `test/server/skill-docs.test.js`

**Interfaces:**
- Consumes: B1 `loadBuiltinPacks()`(두 팩).
- Produces: `initWork`의 `PRESET_REQUIRED`·`PRESET_UNKNOWN` 오류 details = `{ presets: string[], packPresets: Record<packName, string[]> }`. C1이 `folio_init { packs: ['knowledge'], preset: 'textbook' }`을 쓴다.

- [ ] **Step 1: 실패하는 테스트**

<!-- file: test/server/knowledge-init.test.js -->
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { TOOLS } from '../../server/tools/definitions.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseYaml } from '../../core/util/yaml.js';
import { tempDir } from '../support/fixtures.js';

const box = async () => createToolbox({ packs: await loadBuiltinPacks() });

test('folio_init makes a textbook work from the knowledge pack preset', async () => {
  const tools = await box();
  const root = join(await tempDir('folio-n1-init-'), '처음 만나는 세포');
  const out = await tools.call('folio_init', { root, title: '처음 만나는 세포', preset: 'textbook', packs: ['knowledge'] });
  assert.equal(out.ok, true, JSON.stringify(out.error));
  assert.deepEqual(parseYaml(await readFile(join(root, 'work.yaml'), 'utf8')), {
    title: '처음 만나는 세포', levels: [{ name: 'part', children: [1, 10] }, { name: 'chapter', children: [1, 20] }, { name: 'section', leaf: true }],
    packs: ['knowledge'], checkSets: ['knowledge.basic'],
  });
});

test('an unknown preset lists every pack\'s presets, so the knowledge presets are discoverable', async () => {
  const tools = await box();
  const root = join(await tempDir('folio-n1-init-'), 'w');
  const out = await tools.call('folio_init', { root, title: 't', preset: 'textbook' });
  assert.equal(out.error.code, 'PRESET_UNKNOWN');
  assert.deepEqual(out.error.details.presets, ['serial', 'novel', 'scene']);
  assert.deepEqual(out.error.details.packPresets, { novel: ['serial', 'novel', 'scene'], knowledge: ['textbook', 'history', 'guide'] });
  assert.match(TOOLS.find((t) => t.name === 'folio_init').description, /textbook, history, guide/);
});
```

`test/server/skill-docs.test.js` 끝에 테스트 하나를 더한다(결정 15):

<!-- append: test/server/skill-docs.test.js -->
```js

test('every reference file is linked from SKILL.md', async () => {
  const text = await readFile(join(SKILL, 'SKILL.md'), 'utf8');
  for (const file of await readdir(join(SKILL, 'references'))) assert.match(text, new RegExp(`\\(references/${file.replace('.', '\\.')}\\)`), file);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/server/knowledge-init.test.js` · Expected: FAIL(첫 테스트는 통과할 수 있다 — 프리셋은 B1이 이미 만들었다. 두 번째가 `details.packPresets` undefined로 실패한다). skill-docs의 새 테스트는 knowledge.md가 없으므로 아직 통과한다. Step 4 뒤 knowledge.md를 만들고 SKILL.md에 링크하지 않으면 실패하는 것을 한 번 확인한다.

- [ ] **Step 3: 구현 — `core/work/init.js`, `server/tools/definitions.js`**

`initWork` 위(JSDoc `/** 새 작품 폴더를 만든다.` 바로 앞)에 도우미를 더한다:

<!-- old: core/work/init.js -->
```js
/**
 * 새 작품 폴더를 만든다.
```
<!-- new: core/work/init.js -->
```js
/** 팩 이름 → 프리셋 id 목록(팩 등록 순서). */
const presetsByPack = (available) => Object.fromEntries([...available].map(([name, pack]) => [name, Object.keys(pack.presets ?? {})]));

/**
 * 새 작품 폴더를 만든다.
```

프리셋 오류 두 줄:

<!-- old: core/work/init.js -->
```js
  if (!preset) throw new FolioError('PRESET_REQUIRED', 'choose a preset', { presets: Object.keys(presets) });
  if (!Object.hasOwn(presets, preset)) throw new FolioError('PRESET_UNKNOWN', preset, { presets: Object.keys(presets) });
```
<!-- new: core/work/init.js -->
```js
  // presets: 첫 팩의 프리셋. packPresets: 쓸 수 있는 모든 팩의 프리셋 — 다른 팩(예: knowledge 의 textbook)을 고를 수 있게 알린다.
  const listing = () => ({ presets: Object.keys(presets), packPresets: presetsByPack(available) });
  if (!preset) throw new FolioError('PRESET_REQUIRED', 'choose a preset', listing());
  if (!Object.hasOwn(presets, preset)) throw new FolioError('PRESET_UNKNOWN', preset, listing());
```

`server/tools/definitions.js`의 `folio_init` 설명 첫 문장을 바꾼다:

<!-- old: server/tools/definitions.js -->
```js
  tool('folio_init', '새 작품을 만든다. 팩 프리셋(예: serial, novel, scene)으로 레벨과 검사 세트를 정한다.
```
<!-- new: server/tools/definitions.js -->
```js
  tool('folio_init', '새 작품을 만든다. packs 의 첫 팩(기본 novel)의 프리셋으로 레벨과 검사 세트를 정한다. 소설(novel): serial, novel, scene. 지식 책(packs: [knowledge]): textbook, history, guide. 프리셋을 모르면 오류 details.packPresets 에 팩별 목록이 온다.
```

(같은 줄의 뒷부분 " work.yaml 이 이미 있으면 …"은 그대로 둔다. 바꾸는 것은 따옴표를 연 뒤 첫 두 문장뿐이다.)

- [ ] **Step 4: 구현 — 스킬 문서**

<!-- file: skill/folio/references/knowledge.md -->
````markdown
# 지식 책 (knowledge 팩)

교재·역사서·안내서를 쓴다. 소설과 같은 순서(계획 → 원고 → 사건 추출 → 검사 → 승인 → 커밋)로 돈다.

## 새 작품

`folio_init { root, title, packs: ['knowledge'], preset }`. `packs`를 빼면 소설 팩이다.

| 프리셋 | 레벨 | 기본 세트 |
|---|---|---|
| `textbook`(교재) | part → chapter → section | `knowledge.basic` |
| `history`(역사) | era → chapter → section | `knowledge.basic` |
| `guide`(안내서) | chapter → section | `knowledge.basic` |

프리셋을 틀리게 주면 오류 `PRESET_UNKNOWN`의 `details.packPresets`에 팩별 프리셋이 온다. 작가에게 보여 주고 고르게 한다.

## 엔티티 (작가가 `entities/<종류>/<id>.md`로 쓴다)

- 종류(관례): `concept`(개념), `term`(용어), `example`(예제). 약속("5장에서 자세히", 학습 목표)은 `promise`.
- 선택 필드: `prerequisites: [id, ...]` — 이 개념을 정의하기 전에 먼저 정의돼야 하는 것. `avoid: [표기, ...]` — 쓰지 않기로 한 표기(용어 통일).

```markdown
---
id: membrane
kind: term
name: 세포막
prerequisites: [cell]
avoid: [세포 막]
---
세포의 바깥 경계.
```

## 추출 답 (`produces: events`)

- `term.defined`(처음 정의), `term.redefined`(다시 설명). 둘 다 `quote`가 필요하다. 원고에 그대로 있고 그 개념의 이름(또는 별칭)이 든 정의 문장이다. 인용이 없거나 틀리면 정의로 치지 않는다.
- `promise.*` 사건은 소설과 같다. 심기 전에 거두면(`core.promise-order`) hard로 막히고 승인할 수 없다.
- `appearances`·`mentions`, `occurrences.wanted`는 소설과 같다([occurrences.md](occurrences.md)).

## 검사 세트 (작가가 고른다)

| 세트 | 검사 | 등급 |
|---|---|---|
| `knowledge.basic`(기본) | 정의 전 사용·선수 개념 순서(실험), 윗계획 맞춤, 원고 검토, 학습 목표 다룸 | 참고, 윗계획 맞춤만 block |
| `knowledge.terms` | 용어 통일(`avoid` 표기, 코드 블록 안은 안 봄, 실험) | 참고 |
| `knowledge.exercises` | 연습문제가 학습 목표를 덮는지(실험) | 참고 |

- 새 검사는 참고 의견(advisory)으로 시작한다. 승인 질문의 `advisories`에 나온다. 참고 의견으로 원고를 고치지 않는다.
- 작가가 더 세게 원하면 work.yaml에 `checks: { knowledge.defined-before-use: { severity: block } }`처럼 올린다(`hard`는 안 된다). 그러면 지적이 막는 지적이 되고, 넘기려면 작가의 이유가 필요하다.
- 세트를 빼거나 `mode: off`로 끄면 그 검사는 돌지 않는다(영수증의 `appliedChecks`에서 빠진다). 코어 잠금(`core.promise-order`, 원고 hash, 영수증)은 세트와 상관없이 그대로다.
- 서문·부록(`role: front`·`back`)은 순서 검사(정의 전 사용·선수 개념 순서)를 건너뛴다. 용어 통일은 돈다.

세트 고르기와 work.yaml 쓰기 절차는 [checks.md](checks.md)를 따른다.
````

`skill/folio/SKILL.md` 세 곳:

<!-- old: skill/folio/SKILL.md -->
```markdown
description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재·장편·단편)을 쓴다.
```
<!-- new: skill/folio/SKILL.md -->
```markdown
description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재·장편·단편·교재·역사서·안내서)을 쓴다.
```

<!-- old: skill/folio/SKILL.md -->
```markdown
| `folio_init` | 새 작품. `{ root, title, preset }`. 프리셋: `serial`(아크→회차), `novel`(권→장→장면), `scene`(장면). 이미 있으면 `created: false` |
```
<!-- new: skill/folio/SKILL.md -->
```markdown
| `folio_init` | 새 작품. `{ root, title, preset }`. 프리셋: `serial`(아크→회차), `novel`(권→장→장면), `scene`(장면). 지식 책은 `packs: ['knowledge']`와 `textbook`·`history`·`guide`([references/knowledge.md](references/knowledge.md)). 이미 있으면 `created: false` |
```

<!-- old: skill/folio/SKILL.md -->
```markdown
1. **새 작품**: 작가에게 제목과 형식(연재/장편/단편)을 묻고 `folio_init`.
```
<!-- new: skill/folio/SKILL.md -->
```markdown
1. **새 작품**: 작가에게 제목과 형식(연재/장편/단편/교재/역사/안내서)을 묻고 `folio_init`. 지식 책은 [references/knowledge.md](references/knowledge.md).
```

(frontmatter `description`은 한 줄로 남아야 한다 — `skill-docs.test.js`의 첫 테스트.)

- [ ] **Step 5: 통과 확인** — Run: `node --test test/server/knowledge-init.test.js test/server/skill-docs.test.js test/core/init.test.js && npm run check` · Expected: PASS, 전체 644/644

- [ ] **Step 6: 커밋**

```bash
git add core/work/init.js server/tools/definitions.js skill/folio/SKILL.md skill/folio/references/knowledge.md test/server/knowledge-init.test.js test/server/skill-docs.test.js
git commit -m "feat(init,skill): list every pack's presets on preset errors; knowledge book guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Part C — 완료 기준

### Task C1: N1 완료 기준 + 정지

> 리뷰: 최종 브랜치 리뷰(가장 강한 모델)에 합친다. 공격해 볼 것: 각 테스트가 정말 그 기준을 증명하는지(약한 assert, `includes`만으로 통과하는 곳), 테스트가 원본 fixture를 고치지 않는지, stderr에 오류가 없는지.

**Files:**
- Create: `test/acceptance/n1.test.js`
- Test: 그 파일

완료 기준(설계 "완료 기준"):
1. MCP stdio로 교재 작품(knowledge 팩 textbook 프리셋)을 만들고 절 하나를 커밋까지 → N1-1.
2. 심어 둔 정의 전 사용(knowledge-book `membranes`의 ATP)을 잡는다. 승인 질문에 advisory로 나오고, 작가가 block으로 올리면 막힌다 → N1-2.
3. 선수 개념 순서 위반을 잡는다 → N1-3.
4. avoid 표기를 잡고 코드 블록 안은 무시한다 → N1-4.
5. `core.promise-order`(hard)가 지식 책에서도 막는다(승인 불가) → N1-5.
6. 검사 세트를 끄면 그 검사가 안 돈다(영수증에 반영). 잠금은 그대로다 → N1-6(+ N1-5는 세트 없음에서 돈다).

- [ ] **Step 1: 테스트 쓰기**

<!-- file: test/acceptance/n1.test.js -->
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

const MEMBRANES = '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다. 막을 지나는 물질은 ATP를 쓴다. 자세한 원리는 에너지 장에서 다룬다.\n';
const MEMBRANE_DEF = { entityId: 'membrane', kind: 'term.defined', quote: '세포막은 [[block:fig-1-1]]에서 본 바깥 경계다' };

/** MCP 너머의 가짜 호스트 모델. script: 노드 id → { draft, events }. 검사는 지적 없이 모두 답한다. 수정 요청에는 같은 원고를 돌려준다. */
function answerer(script = {}) {
  return (request) => {
    const p = request.payload;
    const own = script[p.node.id] ?? {};
    if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
    if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획: 학습 목표와 다룰 개념`;
    if (p.produces === 'children') return JSON.stringify({ children: p.node.level === 'part' ? [{ id: 'ch-1', title: '1장 세포' }] : [{ id: 'sec-1', title: '1절 세포란' }] });
    if (p.produces === 'draft') return own.draft ?? `${p.node.title || p.node.id} 본문.`;
    if (p.produces === 'events') return JSON.stringify({ events: own.events ?? [], appearances: [], mentions: [] });
    throw new Error(`no answer for ${request.purpose}/${p.produces}`);
  };
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** until 을 만날 때까지 run/resume/decide(approve) 를 MCP 로 돌린다. 지나온 결과 이름을 모은다. */
async function drive(folio, root, start, answer, until = (o) => o.status === 'done') {
  const labels = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 60; i += 1) {
    labels.push(label(out));
    if (until(out)) return { labels, out };
    if (out.status === 'needs_model') {
      out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}`);
  }
  throw new Error('drive did not finish');
}

/** knowledge-book 복사본: work.yaml 고치기 + 엔티티 파일 쓰기(작가가 하는 일). 원본 fixture 는 그대로. */
async function book({ config = {}, entities = {} } = {}) {
  const root = await copyFixture('knowledge-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...config }));
  for (const [file, text] of Object.entries(entities)) await writeFile(join(root, 'entities', file), text);
  return root;
}

const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
const findingsOf = (out) => [...out.question.blocking, ...out.question.advisories].map((f) => [f.checkId, f.code, f.entityId ?? null, f.severity]);

test('N1-1 over MCP stdio a textbook work (knowledge pack) gets its first section committed', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = join(await tempDir('folio-n1-'), '처음 만나는 세포');
  assert.equal((await ok(folio.call('folio_init', { root, title: '처음 만나는 세포', preset: 'textbook', packs: ['knowledge'] }))).created, true);
  await ok(folio.call('folio_structure', { root, op: 'add', level: 'part', id: 'part-1', title: '1부 기초' }));
  const { labels, out } = await drive(folio, root, { node: 'next' }, answerer({ 'sec-1': { draft: '세포는 생명의 가장 작은 단위다.\n' } }));
  assert.deepEqual(labels, [
    'model:plan', 'user:approve', 'model:children',
    'model:plan', 'model:fit', 'user:approve', 'model:children',
    'model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve', 'done',
  ]);
  assert.equal(out.nodeId, 'sec-1');
  const sec = (await openWork(root)).tree.nodes.get('sec-1');
  assert.deepEqual([sec.status, sec.body.trim()], ['committed', '세포는 생명의 가장 작은 단위다.']);
  const applied = (await receiptOf(root, 'sec-1')).appliedChecks.map((a) => a.checkId);
  assert.deepEqual(applied, ['core.promise-order', 'knowledge.critic', 'knowledge.defined-before-use', 'knowledge.prerequisite-order']);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N1-2 the planted use-before-definition (membranes uses ATP) is an advisory; raised to block it stops the run', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const script = { membranes: { draft: MEMBRANES, events: [MEMBRANE_DEF] } };
  const root = await book({ config: { checkSets: ['knowledge.basic'] } });
  const { out } = await drive(folio, root, { node: 'membranes' }, answerer(script), (o) => o.status === 'needs_user');
  assert.equal(label(out), 'user:approve');
  assert.deepEqual(findingsOf(out), [['knowledge.defined-before-use', 'USED_BEFORE_DEFINED', 'atp', 'advisory']]);
  const done = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
  assert.equal(done.status, 'done');

  const strict = await book({ config: { checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { severity: 'block' } } } });
  const blocked = await drive(folio, strict, { node: 'membranes' }, answerer(script), (o) => o.status === 'needs_user');
  assert.equal(label(blocked.out), 'user:blocked');
  assert.equal(blocked.labels.filter((l) => l === 'model:revise').length, 3);
  assert.deepEqual(blocked.out.question.blocking.map((f) => [f.code, f.entityId, f.severity]), [['USED_BEFORE_DEFINED', 'atp', 'block']]);
  const refused = await folio.call('folio_decide', { root: strict, runId: blocked.out.runId, action: 'approve' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'OVERRIDE_REASON_REQUIRED']);
  assert.equal((await ok(folio.call('folio_status', { root: strict }))).pending.question.kind, 'blocked');
});

test('N1-3 defining a concept before its prerequisite is caught; defining the prerequisite first clears it', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const entities = {
    'term/cell.md': '---\nid: cell\nkind: term\nname: 세포\n---\n',
    'term/membrane.md': '---\nid: membrane\nkind: term\nname: 세포막\nprerequisites: [cell]\n---\n',
  };
  const root = await book({ config: { checkSets: ['knowledge.basic'] }, entities });
  const first = await drive(folio, root, { node: 'membranes' }, answerer({ membranes: { draft: MEMBRANES, events: [MEMBRANE_DEF] } }), (o) => o.status === 'needs_user');
  assert.deepEqual(findingsOf(first.out), [
    ['knowledge.defined-before-use', 'USED_BEFORE_DEFINED', 'atp', 'advisory'],
    ['knowledge.prerequisite-order', 'PREREQUISITE_NOT_DEFINED', 'membrane', 'advisory'],
  ]);
  await ok(folio.call('folio_decide', { root, runId: first.out.runId, action: 'skip', reason: '세포를 먼저 정의한다' }));
  const draft = '세포는 생명의 가장 작은 단위다. 세포막은 세포의 바깥 경계다.\n';
  const events = [{ entityId: 'cell', kind: 'term.defined', quote: '세포는 생명의 가장 작은 단위다' }, { entityId: 'membrane', kind: 'term.defined', quote: '세포막은 세포의 바깥 경계다' }];
  const second = await drive(folio, root, { node: 'membranes' }, answerer({ membranes: { draft, events } }), (o) => o.status === 'needs_user');
  assert.deepEqual(findingsOf(second.out), []);
});

test('N1-4 an avoided spelling is caught in the prose and ignored inside a code block', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const entities = { 'term/membrane.md': '---\nid: membrane\nkind: term\nname: 세포막\navoid: [세포 막]\n---\n' };
  const root = await book({ config: { checkSets: ['knowledge.basic', 'knowledge.terms'] }, entities });
  const draft = '세포막은 바깥 경계다. 세포 막을 지나는 물질이 있다.\n\n```text\n세포 막\n```\n';
  const events = [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 바깥 경계다' }];
  const { out } = await drive(folio, root, { node: 'membranes' }, answerer({ membranes: { draft, events } }), (o) => o.status === 'needs_user');
  const avoided = out.question.advisories.filter((f) => f.code === 'TERM_AVOIDED');
  assert.deepEqual(avoided.map((f) => [f.checkId, f.entityId, f.quote, f.severity]), [['knowledge.term-consistency', 'membrane', '세포 막', 'advisory']]);
  assert.match(avoided[0].message, /1번/);
});

test('N1-5 the core promise-order lock blocks a knowledge book too, with no check sets chosen', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await book();
  assert.deepEqual((await openWork(root)).config.checkSets, []);
  const events = [{ entityId: 'energy-detail', kind: 'promise.resolved', quote: 'ATP는 세포가 쓰는 에너지 화폐다' }];
  const script = { 'atp-section': { draft: 'ATP는 세포가 쓰는 에너지 화폐다.\n', events } };
  const { out } = await drive(folio, root, { node: 'atp-section' }, answerer(script), (o) => o.status === 'needs_user');
  assert.equal(label(out), 'user:blocked');
  assert.equal(out.question.canApprove, false);
  assert.deepEqual(out.question.blocking.map((f) => [f.checkId, f.code, f.severity]), [['core.promise-order', 'PROMISE_RESOLVED_BEFORE_PLANT', 'hard']]);
  const refused = await folio.call('folio_decide', { root, runId: out.runId, action: 'approve', reason: '괜찮다' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'APPROVE_BLOCKED_BY_HARD']);
});

test('N1-6 a check set turned off does not run (the receipt says so); the locks stay', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const script = answerer({ membranes: { draft: MEMBRANES, events: [MEMBRANE_DEF] } });
  const none = await book({ config: { checkSets: [] } });
  const { out } = await drive(folio, none, { node: 'membranes' }, script, (o) => o.status === 'needs_user');
  assert.deepEqual(findingsOf(out), []);
  await ok(folio.call('folio_decide', { root: none, runId: out.runId, action: 'approve' }));
  const receipt = await receiptOf(none, 'membranes');
  assert.deepEqual(receipt.appliedChecks.map((a) => a.checkId), ['core.promise-order']);
  assert.deepEqual(receipt.steps.find((s) => s.id === 'facts').checks.map((c) => c.checkId), ['core.promise-order']);

  const one = await book({ config: { checkSets: ['knowledge.basic'], checks: { 'knowledge.defined-before-use': { mode: 'off' } } } });
  const second = await drive(folio, one, { node: 'membranes' }, script);
  assert.equal(second.out.status, 'done');
  assert.deepEqual((await receiptOf(one, 'membranes')).appliedChecks.map((a) => a.checkId), ['core.promise-order', 'knowledge.critic', 'knowledge.prerequisite-order']);

  const locked = await book({ config: { checkSets: [], checks: { 'core.promise-order': { mode: 'off' } } } });
  const refused = await folio.call('folio_run', { root: locked, node: 'membranes' });
  assert.equal(refused.error.code, 'CONFIG_INVALID');
  assert.ok(refused.error.details.errors.some((e) => e.code === 'LOCKED_CHECK_OVERRIDE'));
});
```

읽는 법:
- N1-1: 첫 part는 윗계획이 없어 `fit`의 `parent-fit`이 `not_applicable` → 모델 요청 없음. chapter는 part 계획이 있어 `model:fit`이 한 번 나온다. leaf의 `critic` 단계는 `knowledge.critic` 하나만 묻는다(연습문제 세트는 안 골랐다). 영수증 `appliedChecks`에 branch 검사(parent-fit, goals-covered)는 없다 — leaf 파이프라인의 검사만 적힌다.
- N1-2: block으로 올리면 `facts`가 막고, 수정 루프가 3번(`model:revise` → `model:extract` → `model:critic`) 돈 뒤 `user:blocked`(`canApprove: true`)가 된다. 이유 없는 승인은 `OVERRIDE_REASON_REQUIRED`다.
- N1-5: knowledge-book의 기본 `checkSets: []` 그대로다. 앞 노드 `membranes`는 커밋되지 않아 약속 심기가 없으므로 `atp-section`의 `promise.resolved`가 hard다.

- [ ] **Step 2: 실행** — Run: `node --test test/acceptance/n1.test.js` · Expected: PASS 6/6(Part A·B가 끝났으므로). 실패하면 테스트가 아니라 원인을 고친다(`superpowers:systematic-debugging`). 레이블 순서가 다르면 먼저 `test/acceptance/m3.test.js`의 레이블(`'model:plan', 'user:approve', 'model:children', ...`)과 비교해 코어 흐름이 바뀌었는지 본다.

- [ ] **Step 3: 전체** — Run: `npm run check` · Expected: 전부 PASS, 650/650. 테스트 수를 적는다.

- [ ] **Step 4: 커밋**

```bash
git add test/acceptance/n1.test.js
git commit -m "test(acceptance): N1 textbook over MCP, defined-before-use, prerequisites, avoid, promise lock, sets off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 정지** — 완료 기준 테스트 결과(N1-1 ~ N1-6 각각, 전체 수)를 사용자에게 보여 주고 멈춘다. SDD 기록(BASE, 리뷰, 판정, 미룬 항목)을 `docs/plans/2026-09-27-n1-knowledge-pack-rulings.md`로 옮겨 커밋하고, 이 계획의 "현재 상태"에 결과를 적는다. main 병합·push·PR은 사용자에게 묻는다. N2는 사용자 확인 전에 시작하지 않는다.

---

## 범위 밖 (이 계획에서 하지 않음)

- 상호 참조 유효성·그림 번호·각주·색인(N3), 주장 근거·논픽션 인용 세트(N2), 순서 없음 방식(N4), AI로 팩 만들기.
- `term.redefined`를 쓰는 검사(예: 다시 설명이 앞 정의와 어긋남). 사건만 받아 둔다.
- 선수 개념의 여러 단계 전파(선수의 선수). 한 단계만 본다(결정 4).
- `avoid` 목록 변경을 "다시 확인 필요"로 알리기(결정 7).
- 정본 아티팩트 §20·§22 #7 고치기(범위 결정 기록대로 사용자에게 먼저 묻는다).

## 자기 점검 결과

**설계 대조(설계 → Task):**

| 설계 항목 | Task |
|---|---|
| `packs/knowledge` 소설 팩과 같은 모양, `packs/index.js` 등록 | B1 |
| 코어 최소 변경 + 이유 | A2(결정 4), B2(결정 13) |
| 프리셋 textbook·history·guide, 기본 세트 `knowledge.basic` | B1(pack.yaml, 테스트), B2(init) |
| 파이프라인 leaf·branch 소설과 같은 모양 | B1 pack.yaml, C1 N1-1 레이블 |
| 엔티티 종류 concept·term·example, `prerequisites`·`avoid` | A1(`TERM_KINDS`), A2, A3, B2 문서 |
| `term.defined`·`term.redefined`, 인용 필수 | A1(결정 3), B1 extract.md, 결정 9 |
| 사용됨 = 등장 + 언급(+ 등장 위치) | A1(결정 2) |
| promise.*는 코어가 처리 | C1 N1-5 |
| 결정론 검사 셋, experimental + advisory, block으로 올리기 | A1·A2·A3, B1(테스트: 올리기·hard 거부), C1 N1-2 |
| front/back은 순서 검사에서 빠짐(확인) | B1 테스트(glossary), 모듈 지도 |
| 코드 블록 안 건너뜀 | A3, C1 N1-4 |
| 모델 검사 넷(등급·stage·requiresParentPlan) | B1 pack.yaml, 테스트 `view(...)` |
| 세트 셋과 recommendedFor | B1, 결정 11 |
| 비문학 프롬프트, extract가 occurrences 요청 | B1 prompts, 테스트 `occurrences.wanted` |
| folio_init 프리셋 목록 | B2 |
| 스킬 참고 문서 + SKILL.md 링크 + skill-docs 테스트 | B2 |
| knowledge-book이 실제 팩을 씀, 기존 테스트 안 깨짐, 합성 위반 | B1(두 번째 테스트), 결정 1 |
| 완료 기준 1~6 | C1 N1-1 ~ N1-6 |
| 새 기능 토글 없음(세트가 토글) | Global Constraints, C1 N1-6 |

**빈칸 검사:** `TBD`·`TODO`·"나중에"·"비슷하게" 없음. 모든 새 파일은 전문을 적었고, 기존 파일 수정은 바꾸기 전·뒤 글을 그대로 적었다.

**이름 일치:** `TERM_KINDS`·`DEFINED`·`quotedInDraft`·`namesOf`·`quoteNames`·`draftDefinitions`·`priorDefinitions`·`prerequisitesOf`(A1) → A2 `prerequisiteOrder`는 `draftDefinitions`·`prerequisitesOf`·`priorDefinitions`, A3는 `namesOf`. `definedBeforeUse`(A1)·`prerequisiteOrder`(A2)·`termConsistency`(A3) → B1 `KNOWLEDGE_CHECKERS`의 이름 `defined-before-use`·`prerequisite-order`·`term-consistency` → pack.yaml `run:`. `prerequisiteIds`(A2 scope) → A2 검사기 주석·테스트. `loadKnowledgePack`·`KNOWLEDGE_PACK_DIR`(B1) → B1 테스트·`packs/index.js`. `packPresets`(B2) → B2 테스트·스킬 문서. 코어 scope 안의 `prerequisitesOf`는 팩의 같은 이름 함수와 별개인 모듈 내부 함수다(코어는 팩을 import하지 않는다).

**시험 실행:** 이 계획 파일의 코드 블록(`<!-- file/old/new/append: 경로 -->` 표시)을 저장소 복사본(scratchpad)에 그대로 뽑아 적용하고 돌렸다. `npm run lint`·`npm run typecheck` 깨끗함, 전체 테스트 650/650(시작 621 + 새 29). 태스크별 예상 수: A1 626, A2 631, A3 635, B1 641, B2 644, C1 650.
