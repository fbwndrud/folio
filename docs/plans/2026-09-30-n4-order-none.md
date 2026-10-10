# Folio N4 순서 없음(order: none) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `order: none` 작품(사전·매뉴얼·요리책)의 동작을 정한다. 앞뒤를 따지는 검사는 순서 없는 노드에서 "해당 없음"으로 남기고, 앞쪽 검사 범위는 "앞선 모든 사건" 대신 "연결된 노드의 사건"(`linkedEvents`)을 모은다. 노드 연결 표(앞머리 `links`)를 읽는 조회 함수 이름을 N7·M6b 계약으로 고정하고, 깨진 링크를 상태·찾기·검사로 알린다. 지식 책 팩에 상호 참조 중심 세트와 사전 프리셋을 더한다. N1 미룬 minor(코어 범위가 모든 팩의 `prerequisites`를 읽음)를 고친다.

**Architecture:**
- `core/store/position.js`: 위치마다 순서 밖으로 빠진 까닭 `unorderedBy`(`'none'`·`'branching'`·`'role'`·`null`)를 더한다. `ordered` 계산은 그대로다.
- 새 `core/links/graph.js`: 노드 앞머리 `links`를 읽기만 하는 연결 표(`linkTable`, `linksFrom`, `linksTo`, `linkedNodeIds`, `linksStatus`). index.db·작업 잠금 없이 `openWork` 결과에서 계산한다.
- 새 `core/scope/linked.js`(`linkedScope`): 순서 없는 노드의 앞쪽 범위. `unorderedBy`로 갈린다. `none`이면 한 단계 링크 대상 노드의 사건, `branching`은 N7 자리(지금은 비움).
- `core/scope/scope.js`: `gatherScope`가 `unorderedBy`, `linkedNodeIds`, `linkedEvents`를 더한다. `linkedEvents`는 `priorEvents`와 섞지 않는다. `entityRevAt`은 연결 사건이 있을 때만 그것을 넣어 뒤쪽 전파(다시 확인 필요)가 된다.
- `core/checks/run-checks.js` `applicability`와 `core/pack/yaml-schema.js`: `requiresOrder: none`(순서 없는 노드에서만).
- 기능 토글 `links`(투영, 실행 digest 밖)와 `linkScope`(범위, `RUN_FEATURES`, 부모 `links`).
- `folio_find { query: 'links' }`, `folio_status.links`.
- 지식 책 팩: 결정론 검사 `knowledge.links`, 모델 검사 `knowledge.linked-consistency`(`requiresOrder: none`), 세트 `knowledge.unordered`, 프리셋 `reference`, 최상위 `scopeFields: [prerequisites]`.
- N1 minor: 팩이 `pack.yaml` `scopeFields`로 켠 필드만 코어 범위가 읽는다(`core/scope/fields.js`, 레지스트리 `scopeFields`).

**Tech Stack:** Node ESM + JSDoc, `node:test`, `node:sqlite`(기존 index만), `yaml`, `@modelcontextprotocol/sdk`(1.x, stdio), ESLint 9 + TypeScript(`checkJs`).

**Spec:** 이 계획의 "설계 요약" 절이 N4 설계다. 사용자가 바빠 묻지 말라고 해서, 계획 세션이 superpowers:brainstorming의 질문마다 추천안을 골랐다. 고른 것은 모두 결정 표에 "추천 채택(사용자 확인 필요)"로 적었다. 별도 spec 파일은 없다(레인 규칙: 계획 문서 하나만 커밋).
- 설계 정본: 아티팩트 https://claude.ai/artifact/WjJzcsjnQZnVxyyJZaxvcX
  - §03: 사전·매뉴얼·요리책 행(상호 참조 유효성, 표기 통일, 누락 항목)
  - §04: `order: linear | none | branching` + 트리 밖 노드 연결 표, "순서 방식에 따라 달라지는 검사"(앞뒤 검사는 `none`·`branching`에서 해당 없음)
  - §07: `order`는 작품 전체 또는 레벨마다
  - §10 끝: 순서가 없거나 갈리는 부분의 앞쪽 방향은 "연결된 노드의 사건"을 모은다
  - §20 "v0.1 이후": 순서 없음 방식 검사(상호 참조 중심)
- 범위와 순서
  - `docs/plans/2026-09-27-scope-nonfiction-decision.md`
  - `docs/plans/2026-09-28-roadmap-parallel.md`: L3 코어 레인, 핫스팟 표, 미룬 minor 표(N1 `scope.js` 몫)
  - `docs/plans/2026-09-28-roadmap-lanes-late.md`: L3 N4 절(계약 넷: none만 정함, branching 갈림 자리, promise-order 해당 없음·잠금 약화 없음, 연결 조회 이름 고정)
  - `docs/plans/2026-09-28-roadmap-lanes-early.md`: 공통 블록
- 계속 유효한 판정
  - `docs/plans/2026-09-30-n3-blocks.md`·`-rulings.md`: "다른 레인에 알릴 것"의 N4 몫(`find.js` 잠금 밖 조회·오류 순서 `FEATURE_DISABLED` → `NODE_NOT_FOUND`·`id`는 노드 id 또는 `'*'`, `query.js`의 N3 계약 주석은 건드리지 않음, `features.js` 끝 순서)
  - `docs/plans/2026-09-30-c0-core-handoff-rulings.md`: `scope.js`의 `inScope` Set, 팩 모듈 그래프 digest, `isPlainObject`
  - `docs/plans/2026-09-30-m6-viewer.md`·`-rulings.md`: V10(조회 층은 index.db·작업 잠금 없이), "넘길 것"의 N4·N7 행(`positions.ordered`를 그대로 씀)

## 현재 상태 (이 계획을 시작하는 시점)

새 세션이 이전 대화 없이 이어받을 수 있게 적는다.

- **브랜치:** `feat/n4-order-none`. worktree는 `/path/to/folio-worktrees/n4`다. main `4117bbb`(N3 판정 기록)에서 만들었다.
- **시작 시 테스트:** `npm run check` 1030/1030(lint·typecheck 통과, 약 92 s).
- **main에 이미 있는 것:** M0~M4, N1, N2, S, M5, N5, M6a, C0, N3.
  - MCP 도구 11개(`folio_config`까지). `folio_find` query enum 끝은 `terms`(N3).
  - 내장 팩 `novel`, `knowledge`, `sources`, `brand`
  - 기능 토글 끝은 `blocks`, `bibliography`, `termIndex`(N3)
  - `core/index/query.js` 끝에 N3 계약 다시 내보내기(`blockCatalog`, `bibliography`, `termIndex`, `parseNodeMarks`, `BLOCK_KINDS`)
- **옛 체크아웃 금지:** 메인 체크아웃 `/path/to/folio`의 `feat/n3-blocks`(`0bf95e1`)는 낡았다. 쓰지도 건드리지도 않는다. 레인 절의 "코어 레인이 main 체크아웃을 이어 쓴다" 문구는 이 줄이 대신한다.
- **다른 worktree 금지:** `/path/to/folio-worktrees/m6`는 M6b 몫이다. 건드리지 않는다.
- **병합·push 없음:** 아무것도 main에 병합하지 않았고 push도 하지 않았다. 원격이 없다.
- **계획 코드 시험:** 이 계획의 코드는 scratch worktree(`4117bbb`에서 detach)에서 태스크 순서대로 적용하고 태스크마다 `npm run check`를 돌렸다. 결과는 "자기 점검" 절에 있다.
- **진행 기록:** 태스크를 마칠 때마다 아래 "진행" 줄에 커밋 범위와 테스트 수를 적는다. 판정과 미룬 minor는 `docs/plans/2026-09-30-n4-order-none-rulings.md`에 모은다(실행 세션이 만든다).

진행:
- 사용자 승인(2026-09-30): "묻지 말고 끝까지". 결정 표 1–22("추천 채택(사용자 확인 필요)")를 모두 쓰인 대로 승인한 것으로 보고 실행했다.
- A1 `5487b76..081e68d` 1036, A2 `..54280dc` 1039, A3 `..2f1e6fc` 1046, A4 `..0f0d4eb` 1052, A5 `..8cb69a5` 1055, B1 `..4a20d4f` 1058, C1 `..3f7eef1` 1062, D1 `..01e503a` 1063(고침 1회), D2 `..60b3c1b` 1068.
- 최종 브랜치 리뷰(opus) 뒤 고침 물결 `60b3c1b..bc96025` 1069. 범위를 좁힌 재리뷰가 깨끗했다. `npm run check` lint·typecheck 통과, 1069/1069다.
- 판정(P1, D1-R1, F-R1~F-R3)과 미룬 minor는 `docs/plans/2026-09-30-n4-order-none-rulings.md`에 있다. 병합·push·PR·정본 수정은 하지 않았다.

### 모듈 지도 (이 계획이 건드리는 것)

| 파일 | 하는 일 |
|---|---|
| `core/store/position.js` | `computePositions`: 한 줄 순번·`ordered`. A1이 `unorderedBy`(빠진 까닭)를 더한다. `compareNodes`는 그대로 |
| `core/ledger/events.js` | `activeEvents`, `eventsBefore`(그대로). A1이 `eventsOn`(주어진 노드들의 사건, 앞뒤 무관)을 더한다 |
| `core/links/graph.js` (새, A1·A2) | `linkTable`, `linksFrom`, `linksTo`, `linkedNodeIds`, `linksStatus` |
| `core/index/query.js` | 기존 db 조회 + N3 계약. A2가 끝에 N4 계약 다시 내보내기(`linkTable`, `linksFrom`, `linksTo`)를 붙인다 |
| `core/status.js` | A2가 `links: linksStatus(work)` 한 줄(`blocks` 뒤) |
| `core/work/features.js` | A2가 `links`, `linkScope`를 끝에 더한다. `linkScope`는 부모 `links`, `RUN_FEATURES` 끝 |
| `core/scope/linked.js` (새, A3) | `linkedScope({ work, events, nodeId })` — 순서 없는 노드의 연결 사건. `branching` 갈림 자리 |
| `core/scope/scope.js` | `entityRevAt`·`gatherScope`. A3이 연결 사건, A5가 `scopeFields`(선수 개념) |
| `core/run/payload.js` | `scopeFor`·`basePayload`. A3이 `linkedEvents`(있을 때만), A5가 `scopeFields` 넘기기 |
| `core/checks/run-checks.js` | A4가 `applicability`에 `requiresOrder: none` 한 줄. `stamp`는 건드리지 않는다(S 규칙) |
| `core/pack/yaml-schema.js` | A4가 `requiresOrder` 값 `none`, A5가 최상위 `scopeFields`(추가만) |
| `core/scope/fields.js` (새, A5) | `SCOPE_FIELDS = ['prerequisites']` |
| `core/pack/yaml-pack.js`, `core/pack/registry.js` | A5: 팩의 `scopeFields`를 싣고, 레지스트리가 합친다 |
| `server/tools/find.js`, `server/tools/definitions.js` | B1: `folio_find` `links`. enum 끝에 추가, 설명문 끝에 한 문장 |
| `packs/knowledge/*` | C1: `checkers/links.js`, `checks/linked-consistency.md`, `pack.yaml`(검사 둘·세트·프리셋 끝에 추가), `checkers/index.js`, `README.md`. A5: `pack.yaml` `scopeFields` |
| `skill/folio/references/order.md` (새), `SKILL.md`, `references/knowledge.md` | D1: 호스트 안내 |
| `test/fixtures/reference-book/` (새, A1) | 합성 fixture(사전 2단, `order: none`, 링크 여섯 개 — 깨진 링크 하나와 자기 링크 하나를 일부러 심음). `FIXTURES` 목록에는 넣지 않는다 |

고치지 않는 소유 파일: `core/work/config.js`(`readOrder`·`orderModeFor` 그대로), `core/checks/builtin.js`(`core.promise-order`는 `requiresOrder: 'linear'` 그대로), `core/run/next.js`(트리 차례 그대로 — 결정 11), `core/store/tree.js`(`links` 모양 `{ to, kind, label }` 그대로 — 결정 10), `core/index/{schema,rebuild}.js`(index.db `links` 표 그대로 — 결정 21).

검사기 ctx(`core/run/steps/check.js` `checkContext`)는 `{ ...scope, work, node, draft, draftEvents }`다. 이 계획 뒤 scope에는 `unorderedBy`, `linkedNodeIds`, `linkedEvents`가 더 있다. 결정론 검사기가 던지면 코어가 `CHECK_CRASHED`(status `error`, 등급은 선언 등급 — block·hard면 막는다)로 남긴다.

---

## 설계 요약

### 순서 밖으로 빠진 까닭 (`unorderedBy`)

`computePositions`가 위치마다 `unorderedBy`를 더한다. `ordered` 계산(`윗노드 ordered && 레벨 방식 linear && role body`)은 그대로다.

| 값 | 뜻 |
|---|---|
| `null` | 읽는 순서 안(`ordered: true`) |
| `'none'` | 이 노드나 윗노드의 레벨이 `none` |
| `'branching'` | 이 노드나 윗노드의 레벨이 `branching`. `none`과 겹치면 `branching`이 앞선다(N7이 정할 몫을 N4가 먹지 않게) |
| `'role'` | 순서 방식은 linear인데 front·back 역할(또는 그 자손)이라 빠졌다 |

- 앞뒤 판정(`compareNodes`, `eventsBefore`, 영수증 `order`, `ORDER_MISMATCH`, `orderReason`)은 `ordered`만 본다. 이 계획은 그 길을 고치지 않는다.
- `unorderedBy`는 새 동작 둘만 가른다: 연결 사건 모으기(`linkedScope`)와 `requiresOrder: none`.

### 앞쪽 범위 — 연결된 노드의 사건 (정본 §10 끝)

- `unorderedBy === 'none'`인 노드만 모은다. 대상은 이 노드 앞머리 `links`의 `to` 중 작품에 있는 노드다. 한 단계, 나가는 링크만, 자기 자신 제외, 처음 적은 차례로 한 번씩.
- 그 노드들의 사건 중 이 원고 범위의 엔티티(`inScope`: 등장·선수 개념, `promiseScope`가 켜졌으면 약속)의 것만 `linkedEvents`로 준다. 읽는 순서 번호 → seq 순이다.
- `linkedEvents`는 `priorEvents`와 섞지 않는다. 순서 없는 노드의 `priorEvents`는 N4 전처럼 늘 비어 있다. 앞뒤를 따지는 검사(선언을 빠뜨린 팩 검사 포함)가 연결 사건을 "앞"으로 읽을 길이 없다.
- 읽는 순서 안 노드(`null`)와 역할로 빠진 노드(`'role'`)는 링크가 있어도 모으지 않는다. 뒤 노드로 가는 링크가 미래 사건을 끌어오지 못한다.
- `'branching'`은 지금 모으지 않는다. `core/scope/linked.js`의 `case 'branching'` 한 곳이 N7 갈림 자리다.
- 요청 payload: `linkedEvents`가 있을 때만 `basePayload`에 싣는다(`priorEvents` 뒤). 없는 노드의 요청과 그 digest는 N4 전과 같다.
- 검사 ctx: scope를 펼치므로 `unorderedBy`, `linkedNodeIds`, `linkedEvents`가 그대로 간다.

### 뒤쪽 전파 — 다시 확인 필요

- `entityRevAt(work, events, entityId, nodeId)`에 그 엔티티의 연결 사건을 넣는다. 연결 사건이 하나라도 있을 때만 hash 재료에 `linked` 키를 더한다. 연결 사건이 없는 노드(모든 linear 노드 포함)의 값은 N4 전과 같다. 업그레이드만으로 커밋 노드가 한꺼번에 `stale`이 되지 않는다.
- 커밋된 순서 없는 노드는, 링크로 가리키는 노드에 그 엔티티의 사건이 새로 쌓이거나 바뀌면 `stale`(`entity:<id>`)이 된다. 링크 밖 노드의 사건은 영향이 없다.
- `linkScope`를 끄면 연결 사건이 빠지므로 rev가 바뀐다 → 연결 사건이 있던 커밋 노드는 `stale`. 끄고 켜는 것도 검사 범위 변화라 알리는 것이 맞다.

### 검사

- `requiresOrder`(pack.yaml) 값: `linear`(그대로), `none`(새, 순서 없는 노드에서만). 그 밖은 `PACK_FIELD_INVALID`. `branching`은 N7이 더한다.
- `applicability`: `linear`이면 `ctx.ordered`, `none`이면 `ctx.unorderedBy === 'none'`. 해당 없음은 영수증에 `not_applicable`로 남는다(정본 §04).
- `core.promise-order`는 `requiresOrder: 'linear'`, `locked: true`, 얼린 객체 그대로다. 순서 없는 노드에서는 연결 노드가 심은 약속이 있어도 늘 `not_applicable`이다(통과로 적지 않는다). 작가는 known 검사에 `requiresOrder`를 적을 수 없다(`KNOWN_CHECK_FIELDS`: mode·severity·config).
- 상호 참조 중심 세트 `knowledge.unordered`(추천 `kinds: [reference]`, 팩 yaml 끝에 추가):

| 검사 | 종류 | 무엇 |
|---|---|---|
| `knowledge.links` (새) | 결정론, facts, advisory, 실험, `requiresOrder` 없음 | 이 노드 앞머리 `links`의 `LINK_BROKEN`(없는 노드)·`LINK_SELF`(자기 자신). quote 없음(링크는 원고 밖) |
| `knowledge.cross-refs` (N3) | 결정론 | 블록 참조·앵커·각주·자료 인용 |
| `knowledge.term-consistency` (N1) | 결정론 | 표기 통일(`avoid`) |
| `knowledge.linked-consistency` (새) | 모델, critic, advisory, 실험, `requiresOrder: none`, `requireQuote: true` | 원고가 `linkedEvents`와 어긋나는 곳 |

- 프리셋 `reference`(사전·매뉴얼): `part → entry`, `order: none`, 세트 `knowledge.basic`·`knowledge.unordered`. `knowledge.basic`의 순서 검사는 해당 없음으로 남고 원고 검토·윗계획 맞춤은 돈다.

### 링크 유효성

- 저장 정본은 노드 앞머리 `links`(M1 `readLinks`, `{ to, kind, label }`, `kind` 기본 `see-also`)다. 모양은 바꾸지 않는다. 깨진 링크로 작품 열기를 막지 않는다(`WORK_INVALID` 아님).
- 알리는 곳 셋: `folio_status.links`(`{ problems, total }`), `folio_find { query: 'links' }`, 검사 `knowledge.links`.
- 문제 코드: `LINK_BROKEN`(`valid: false`), `LINK_SELF`(자기 링크 — index.db `links.valid`는 1로 그대로).

### 다음 노드 (`run next`)

`pickNext`는 그대로다. 순서 없는 작품에서도 트리 전위 차례(폴더 순서)의 첫 끝나지 않은 노드다. 링크는 차례를 바꾸지 않는다. 다른 항목을 먼저 쓰려면 노드 id를 준다. N7(branching)이 경로 차례를 원하면 `core/run/next.js`의 `preorder` 자리를 바꾼다.

### N7·M6b 계약 — `core/index/query.js`

N7(분기·게임북)과 M6b(뷰어 읽기 화면·관계도)가 쓴다. 이름과 인자 모양은 바꾸지 않는다. 바꾸려면 쓰는 레인의 테스트와 같은 커밋에서 바꾼다. 모두 `openWork` 결과에서 바로 계산한다. index.db도 작업 잠금도 쓰지 않는다. 기능 확인(`links`)은 호출자가 한다.

| 이름 | 모양 |
|---|---|
| `linkTable(work, { nodeId? })` | `{ links: Link[], backlinks: Link[], problems: Problem[] }`. `links`: 범위 안 노드의 링크(읽는 순서 → 적은 차례). `backlinks`: 범위 안 노드를 가리키는 링크(범위 밖에서 온 것 포함, 자기 링크·깨진 링크 제외; 대상 읽는 순서 → 출발 읽는 순서 → 적은 차례). `problems`: 범위 안 링크의 문제(`links` 차례). `nodeId`를 주면 그 노드와 자손, 없는 노드는 `NODE_NOT_FOUND` |
| `linksFrom(work, nodeId)` | `Link[]` — 그 노드가 가리키는 링크(적은 차례). 없는 노드는 `NODE_NOT_FOUND` |
| `linksTo(work, nodeId)` | `Link[]` — 다른 노드에서 그 노드로 오는 링크(읽는 순서 → 적은 차례, 자기 링크 제외). 없는 노드는 `NODE_NOT_FOUND` |

- `Link = { from, to, kind, label, index, valid }`. `index`는 `from` 노드 `links` 안의 차례(0부터), `valid`는 `to` 노드가 작품에 있는가.
- `Problem = { code: 'LINK_BROKEN' | 'LINK_SELF', nodeId, to, kind, index }`.
- 계약 밖(코어 안에서만): `linkedNodeIds(work, nodeId)`(범위용), `linksStatus(work)`(상태용).

### 도구·상태·기능

- `folio_find { query: 'links', id }`: `{ scope: id, links, backlinks, problems }`. `id`는 노드 id 또는 `'*'`(N3와 같은 규칙). 파일에서 바로 계산한다(잠금 없음, `.folio`를 만들지 않음). 오류 순서 `FEATURE_DISABLED` → `NODE_NOT_FOUND`. enum 끝에 `links`, 설명문 끝에 한 문장. `required`는 그대로.
- `folio_status.links = { problems, total }`(`blocks` 뒤). `links` 기능이 꺼지면 `null`. 기록장이 깨져 일찍 돌아가는 모양에는 넣지 않는다(`blocks`와 같다).
- 기능 `links`: 기본 켜짐, 부모 없음, `RUN_FEATURES` 밖(읽기 전용 투영). 끄면 `folio_find links`가 `FEATURE_DISABLED`, 상태가 `null`, 그리고 자식 `linkScope`도 꺼진다.
- 기능 `linkScope`: 기본 켜짐, 부모 `links`, `RUN_FEATURES` 끝(검사가 보는 것을 바꾼다 — 바꾸면 열린 실행은 검사부터 다시). 끄면 `linkedEvents`를 모으지 않는다.

### 미룬 minor (N1 몫, 로드맵 표) — `scope.js`가 모든 팩의 `prerequisites`를 읽음

- 코어는 필드의 뜻을 모른다. `core/scope/fields.js`의 `SCOPE_FIELDS = ['prerequisites']`만 안다.
- 팩이 `pack.yaml` 최상위 `scopeFields: [prerequisites]`로 켠다(알 수 없는 값은 `PACK_FIELD_INVALID`). 지식 책 팩이 켠다. JS 팩은 `pack.scopeFields` 배열로 켠다(알 수 없는 값은 버린다).
- 레지스트리 `scopeFields`는 어느 팩이든 켠 필드(`SCOPE_FIELDS` 차례)다. `scopeFor`가 `gatherScope`에 넘기고, `gatherScope`는 기본 `[]`이면 선수 개념을 읽지 않는다.
- 소설 작품의 엔티티에 `prerequisites` 필드가 있어도 이제 범위를 넓히지 않는다. 지식 책 작품은 그대로다(N1 완료 기준 테스트 통과).
- `scopeFields`를 적지 않은 팩의 객체에는 키가 생기지 않는다. 소설·자료·브랜드 팩의 digest는 이 태스크로 바뀌지 않는다.

### 결정

사용자에게 묻지 않고 계획 세션이 고른 것이다. 모두 "추천 채택(사용자 확인 필요)"이다.

| # | 결정 | 고른 것 | 다른 안 | 상태 |
|---|---|---|---|---|
| 1 | none 앞쪽 범위의 대상 노드 | 앞머리 `links`의 `to`(한 단계, 나가는 링크만, 있는 노드, 자기 제외) | 들어오는 링크도 / 여러 단계 / 원고의 블록 참조 대상 노드도 | 추천 채택(사용자 확인 필요) |
| 2 | 연결 사건 자리 | 새 필드 `linkedEvents`. `priorEvents`는 순서 없는 노드에서 늘 비어 있다 | 정본 문구("대신")대로 `priorEvents`에 섞기 — 앞뒤 검사가 연결 사건을 "앞"으로 읽는다 | 추천 채택(사용자 확인 필요) |
| 3 | 연결 사건의 엔티티 | 이 원고 범위(`inScope`: 등장·선수 개념·`promiseScope` 약속)만 | 연결 노드의 모든 사건 | 추천 채택(사용자 확인 필요) |
| 4 | 뒤쪽 전파 | `entityRevAt`에 연결 사건(있을 때만 `linked` 키) — 연결 노드 사건이 바뀌면 `stale` | 넣지 않음(순서 없는 노드는 엔티티 파일 변화로만 `stale`) | 추천 채택(사용자 확인 필요) |
| 5 | 빠진 까닭 자리 | 위치에 `unorderedBy`(`none`·`branching`·`role`·`null`), branching이 none보다 앞섬 | 범위를 모을 때마다 윗노드를 거슬러 레벨 방식을 읽음 | 추천 채택(사용자 확인 필요) |
| 6 | branching 갈림 자리 | `linkedScope`의 `case 'branching'`(지금 비움), `REQUIRES_ORDER`에 N7이 `branching` 추가, `unorderedBy: 'branching'` | branching도 지금 none처럼 모음(N7 몫을 먹음) | 추천 채택(사용자 확인 필요) |
| 7 | 기능 토글 | `links`(투영, 부모 없음, 실행 digest 밖) + `linkScope`(부모 `links`, `RUN_FEATURES`). 둘 다 기본 켜짐 | 하나로 묶기 / `linkScope` 기본 꺼짐 | 추천 채택(사용자 확인 필요) |
| 8 | `requiresOrder` 새 값 | `none` — `unorderedBy === 'none'`에서만 해당 | 값 추가 없이 팩 검사기가 ctx를 보고 스스로 빈 결과 | 추천 채택(사용자 확인 필요) |
| 9 | 상호 참조 중심 검사 | 세트 `knowledge.unordered` = `knowledge.links`(새)·`knowledge.cross-refs`·`knowledge.term-consistency`·`knowledge.linked-consistency`(새, 모델, none만). 모두 실험·참고 | 누락 항목 검사까지(결정론으로 "누락"을 정의할 기준이 없다) / 코어 검사 | 추천 채택(사용자 확인 필요) |
| 10 | 링크 유효성 알림 | 상태·찾기·검사로 알림. `core/store/tree.js`는 그대로(깨진 링크로 작품 열기를 막지 않음) | `readLinks`가 `WORK_INVALID` | 추천 채택(사용자 확인 필요) |
| 11 | `run next` 차례 | 트리 차례 그대로(`core/run/next.js` 안 고침, 고정 테스트만) | 링크 따라가기 / 제목 가나다 | 추천 채택(사용자 확인 필요) |
| 12 | 연결 조회 계약 | `linkTable`, `linksFrom`, `linksTo`(위 표 모양), `core/index/query.js` 끝에서 다시 내보냄 | db를 받는 함수(뷰어는 index.db를 못 쓴다 — M6 V10) | 추천 채택(사용자 확인 필요) |
| 13 | `folio_find` 모양 | enum 끝에 `links`, `id`는 노드 id 또는 `'*'`, 잠금 없음 | 새 도구(도구 수 늘림) | 추천 채택(사용자 확인 필요) |
| 14 | 요청 payload | `linkedEvents`가 있을 때만 싣는다 | 늘 싣기(모든 열린 실행의 요청 digest가 바뀐다) | 추천 채택(사용자 확인 필요) |
| 15 | 사전 프리셋 | 지식 책 `reference`: `part → entry`, `order: none`, 세트 `knowledge.basic`·`knowledge.unordered` | 프리셋 없음(작가가 work.yaml을 고침) / 새 팩 | 추천 채택(사용자 확인 필요) |
| 16 | 세트 이름 | `knowledge.unordered` | `knowledge.reference`(N3 `knowledge.references`와 한 글자 차이) | 추천 채택(사용자 확인 필요) |
| 17 | N1 minor 고치는 법 | 팩 `scopeFields`(pack.yaml 최상위, 코어가 아는 값만) → 레지스트리 → `gatherScope` 인자 | 코어가 팩 이름(`knowledge`)을 보고 판단 / 기능 토글 | 추천 채택(사용자 확인 필요) |
| 18 | fixture | 새 `test/fixtures/reference-book/`(사전 2단, `order: none`). 공용 `FIXTURES` 목록 밖 | `knowledge-book` 복사본을 테스트마다 고치기 | 추천 채택(사용자 확인 필요) |
| 19 | 목록 테스트 | N3 "features `slice(-3)`" → `blocks` 기준 상대 자리로 옮김. `folio_find` enum 단언에 `links`. 지식 팩 프리셋·검사기·세트 목록 단언에 끝 항목 더함 | 단언 삭제(약화) | 추천 채택(사용자 확인 필요) |
| 20 | 설계 문서 자리 | 이 계획의 "설계 요약"이 설계다 | `docs/superpowers/specs/`에 따로(레인 규칙: 계획 문서 하나만 커밋) | 추천 채택(사용자 확인 필요) |
| 21 | 고치지 않는 소유 파일 | `config.js`, `builtin.js`, `next.js`, `tree.js`, index.db `links` 표 | index.db에 연결 조회 표 확장 | 추천 채택(사용자 확인 필요) |
| 22 | 리뷰 배정 | 가장 강한 모델(공격): A1~A5, B1, C1. 보통: D1. D2는 최종 브랜치 리뷰에 합침 | 모두 보통 모델 | 추천 채택(사용자 확인 필요) |

### 공격 목록 (가장 강한 리뷰어가 실제로 시도한다)

`core.promise-order`와 hard 잠금이 비선형 작품에서 약해지지 않아야 한다. 태스크마다 "공격해 볼 것"에 나눠 적었다. 모은 것:

1. 순서 없는 노드에서 `core.promise-order`가 `passed`·`failed`가 되게 만들기 — 연결 노드에 심기 사건을 두고 원고에서 해소(`not_applicable`이어야, A4·D2 N4-5).
2. 연결 사건을 `priorEvents`로 새게 하기 — 어떤 토글·레벨 조합에서도 순서 없는 노드의 `priorEvents`는 비어 있어야(A3).
3. 링크 세탁 — 읽는 순서 안 노드가 뒤 노드(심는 노드)를 링크해 해소를 통과시키기. `PROMISE_RESOLVED_BEFORE_PLANT` hard, 승인 불가(A4·D2 N4-5).
4. front·back 노드, branching 노드가 링크로 사건을 모으게 하기(A3).
5. `requiresOrder`로 잠금 끄기 — 팩이 `core.promise-order`를 다시 선언·덮어쓰기(`PACK_CHECK_ID_RESERVED`), 작가가 work.yaml `checks.<id>`에 `requiresOrder` 적기(팩 검사는 `CHECK_FIELD_UNKNOWN`, 잠금 검사는 `LOCKED_CHECK_OVERRIDE`), `requiresOrder: 'None'`·`true`·배열(`PACK_FIELD_INVALID`), JS 팩의 이상한 값(해당 있음으로 남는가 — 약해지지 않는 쪽)(A4).
6. hard 검사가 순서 없는 노드에서 막지 않게 되기 — `requiresOrder` 없는 hard 검사는 그대로 막고 승인 불가(A4).
7. `linkScope`·`links` 토글로 잠금·앞뒤 판정 바꾸기 — `ordered`, 영수증 `order`, `ORDER_MISMATCH`, `featuresDigest`(실행 도중 바꾸면 검사부터 다시)(A2·A3).
8. 커밋 직전 재검사(`assertCommitReady`)가 검사 때와 다른 범위를 보기 — 같은 `scopeFor`를 쓰는가(A3).
9. 업그레이드만으로 커밋 노드가 한꺼번에 `stale`이 되기 — linear 작품의 `entityRevAt`이 N4 전과 같은가(A3).
10. 조회가 index.db·`.folio`·작업 잠금을 만들거나, 기록장을 건드리기(A2·B1).
11. `scopeFields`로 범위를 몰래 넓히기 — 알 수 없는 필드, `__proto__`, 다른 팩이 켠 필드가 섞이는 경우(A5).
12. 팩 digest·모듈 그래프 — 새 검사기 `links.js`가 digest에 드는가, 소설·자료·브랜드 팩 digest가 그대로인가(A5·C1).

### 뺀 것

- `branching`의 경로별 범위·검사, 막다른 분기, 도달 불가 장면(N7).
- 들어오는 링크·여러 단계 링크로 범위 넓히기, 블록 참조 대상 노드를 범위에 넣기(결정 1).
- "누락 항목" 검사(결정 9).
- 링크 `kind` 값 제한, 링크 `to`의 id 문법 검사(M1 모양 그대로).
- index.db `links` 표 확장, SQL 연결 조회(결정 21).
- 순서 없는 작품의 `run next` 차례 바꾸기(결정 11).
- `folio_init` 설명문에 `reference` 프리셋 적기(도구 문구는 만든 레인 몫 — 대신 `PRESET_UNKNOWN`의 `details.packPresets`와 스킬 문서에 나온다).

### 다른 레인에 알릴 것

- **N7(코어 레인 넷째, 분기·게임북):**
  - 갈림 자리 넷: `core/scope/linked.js`의 `case 'branching'`(경로별 범위), `core/pack/yaml-schema.js`의 `REQUIRES_ORDER`(값 `branching` 추가), `core/checks/run-checks.js` `applicability`(`requiresOrder: 'branching'` 한 줄), `core/run/next.js`의 `preorder`(경로 차례를 원하면).
  - `unorderedBy`는 branching이 none보다 앞선다. branching 아래 none 레벨도 `'branching'`이다.
  - 연결 조회는 위 계약(`linkTable`, `linksFrom`, `linksTo`)을 쓴다. 게임북 fixture의 링크 네 개는 `kind: choice`다(`folio_find links`로 확인, D2 N4-2).
  - `linkedEvents`는 `priorEvents`와 따로 둔다는 원칙을 branching에서도 지키면 `core.promise-order`가 경로 사건을 "앞"으로 오해하지 않는다. branching의 경로 앞뒤를 잠금에 넣을지는 N7 설계 몫이다.
- **M6b(`feat/m6-viewer`):**
  - `core/work/features.js` 끝 순서: `termIndex`, `links`, `linkScope`. `viewerExport`는 그 뒤에 붙인다. 목록 테스트 둘(`test/core/features.test.js`, `test/server/feature-toggles.test.js`)과 "N4 features" 테스트(`keys.slice(-2)` → 새 키를 넣으면 `links`·`linkScope` 자리를 `termIndex` 기준으로 옮긴다)를 같은 커밋에서 맞춘다.
  - 읽기 화면의 "함께 보기"·관계도의 노드 링크는 `linksFrom`·`linksTo`·`linkTable`을 쓴다. 기능 확인(`links`)은 뷰어가 한다.
  - 위치에 `unorderedBy`가 생겼다. `positions.ordered`는 그대로다(M6 "넘길 것"의 N4 행).
- **N6(판본):** 지식 책 팩의 모듈 그래프가 이제 `core/links/graph.js` → `core/store/tree.js`·`core/blocks/subtree.js`를 품는다. `tree.js`를 고치면 지식 책 팩 digest가 바뀌어 열린 지식 책 실행이 검사를 한 번 다시 돈다(병합 공지).
- **M5·N7(`yaml-schema.js`):** 최상위 키 `scopeFields`와 상수 `REQUIRES_ORDER`가 생겼다. 필드는 추가만 한다.

### 호환이 바뀌는 것 (병합 공지)

- `RUN_FEATURES`에 `linkScope`가 붙어 모든 작품의 `featuresDigest`가 한 번 바뀐다. 열린 실행은 검사부터 한 번 다시 돌고, 대기 중인 모델 답은 `ANSWER_STALE`이 된다(M5 `promiseScope` 때와 같다). 커밋된 노드가 `stale`로 뜨지는 않는다.
- 지식 책 팩 digest가 한 번 바뀐다(`pack.yaml`, `checkers/links.js`, `checks/linked-consistency.md`, 모듈 그래프). 소설·자료·브랜드 팩 digest는 그대로다.
- `order: none` 작품에서 링크로 가리키는 노드에 같은 엔티티 사건이 있는 커밋 노드는 업그레이드 뒤 한 번 `stale`(`entity:<id>`)이 된다(rev에 연결 사건이 들어감). 재검사로 풀린다.
- 소설 등 `scopeFields`를 켜지 않은 팩의 작품: 엔티티 `prerequisites`가 더는 범위를 넓히지 않는다(지적이 줄 수 있다). 그 노드의 옛 영수증 `refs`는 rev 계산이 같아 `stale`이 되지 않는다.
- `folio_status`에 `links`(기본 켜짐, 모든 작품). `folio_config` `features`에 키 둘(`links`, `linkScope`) — 옛 엔진에서 이 키를 적은 work.yaml은 `FEATURE_UNKNOWN`.
- `folio_find` enum 끝에 `links`, 설명문 끝에 한 문장(도구 스키마가 바뀐다, 추가만).
- 순서 없는 노드의 요청 payload에 `linkedEvents`(있을 때만). 검사 ctx·scope에 `unorderedBy`, `linkedNodeIds`, `linkedEvents`. 위치에 `unorderedBy`.
- 지식 책 팩: 프리셋 `reference`, 검사 `knowledge.links`·`knowledge.linked-consistency`, 세트 `knowledge.unordered`(모두 끝에 추가). `PRESET_UNKNOWN`의 `packPresets.knowledge` 끝에 `reference`.

---

## Global Constraints

- 이름 `Folio`, MCP 도구 접두어 `folio_`, 작품 내부 폴더 `.folio/`.
- `package.json` `"engines": { "node": "^22.13.0 || ^24.0.0 || ^26.0.0" }`, `"type": "module"`. 런타임 의존성은 `yaml`과 `@modelcontextprotocol/sdk` 둘뿐이다. 늘리지 않는다. 네이티브 모듈은 금지다. 이 계획은 `package.json`을 바꾸지 않는다.
- 엔진은 모델을 부르지 않는다. `core/`와 `packs/`는 모델·네트워크를 부르지 않고, 동적 `import()`도 쓰지 않는다(`test/core/no-model-calls.test.js`). `core/links/*`와 `core/scope/linked.js`는 파일을 쓰지 않는다(읽기 전용 투영).
- 서버는 `test/server/tools.test.js` `BANNED` 목록(커밋 경로, 구조 쓰기, `core/ledger/ledger.js`, `core/store/tree.js`, file-tx, `core/store/sources.js`, `core/evidence/record-run.js`)을 직접 import하지 않는다. B1은 `core/index/query.js`의 계약 함수만 import한다.
- 잠금 규칙은 설정·팩·세트·기능 토글 어느 것으로도 끌 수 없다.
  - 커밋 원고 hash = 검사 원고 hash
  - 영수증 없이 커밋 금지
  - hard 차단
  - 기록장은 추가만
  - 같은 호스트 자기검토를 독립 평가로 표기 금지
  - soft·참고 의견은 자동 수정 사유 아님
  - `core.promise-order`는 어떤 세트·토글에서도 돈다(순서 밖 노드에서는 `not_applicable`로 영수증에 남는다 — 정본 §04)
- 이 계획은 잠금 경로(`runner.js`, `commit*.js`, `commit-guard.js`, `commit-locks.js`, 기록장, 영수증 형식, `stamp`)를 고치지 않는다. 범위(`scope.js`)는 순서 없는 노드에서 `linkedEvents`를 더하기만 하고, `priorEvents`·`ordered`는 그대로다. `applicability`는 `requiresOrder: none`일 때 해당을 좁히기만 한다.
- 새 검사는 `experimental: true`, `severity: advisory`다. 작가만 block으로 올린다. hard는 작가도 못 적는다(`USER_CHECK_SEVERITY_INVALID`). 검사기는 지적에 `severity`를 적지 않는다.
- 검사 세트는 작가가 고른다. `knowledge.unordered`는 추천만 한다. 새 기능은 `work.yaml` `features`로 켜고 끈다(`links`, `linkScope`).
- 도구 목록, features, 팩 목록, 가드 목록, `folio_find` query enum, 팩 yaml의 프리셋·검사·세트는 끝에만 추가한다. 목록 테스트는 같은 커밋에서 고친다. 기존 assert는 약화하지 않는다.
- 코어 핫스팟 중 이 계획이 고치는 것: `core/scope/scope.js`, `core/run/payload.js`, `core/checks/run-checks.js`(`applicability`만), `core/pack/yaml-schema.js`(추가만), `core/index/query.js`(끝에 다시 내보내기만, N3 계약 주석은 그대로), `core/status.js`(한 줄), `server/tools/find.js`, `core/work/features.js`(끝에 추가). `runner.js`, `index/rebuild.js`, `index/schema.js`, `store/tree.js`는 고치지 않는다.
- 테스트 데이터는 전부 합성이다. 원본 fixture(`test/fixtures/*`)는 고치지 않는다. 새 fixture는 `test/fixtures/reference-book/`에만 둔다. 테스트는 복사본을 고친다(링크·엔티티·사건을 테스트 안에서 더한다).
- 파일 하나에 한 책임. 300줄을 넘기면 나눈다(이 계획의 가장 긴 파일은 `core/pack/yaml-schema.js` 218줄, 테스트는 `test/acceptance/n4.test.js` 148줄).
- 문서·주석 설명은 한국어, 코드 식별자는 영어. 커밋 메시지는 영어 Conventional Commits이고, 끝에 정확히 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙인다.
- `.superpowers/`는 커밋하지 않는다. 각 태스크는 자기 파일만 커밋한다. `/path/to/vibelore`는 읽기 전용이다.
- TDD: 실패하는 테스트 → 실패 확인 → 구현 → 통과 → `npm run check` 전부 초록 → 커밋. 이미 있는 동작을 고정하는 테스트는 실패 확인에서 통과할 수 있다(태스크마다 적었다).
- 머신 부하가 높으면 전체 테스트가 몇 분 걸릴 수 있다. 느려졌다고 회귀로 단정하지 않는다. 배경 셸을 끝없이 기다리지 않는다. 테스트가 멈추면 끊고 원인을 본다.
- 리뷰
  - 가장 강한 리뷰어 모델에 맡기고 "공격해 볼 것"을 시도하게 할 태스크: A1(위치·사건), A2(기능·조회 계약·상태), A3(범위·payload·뒤쪽 전파), A4(검사 해당 여부·잠금), A5(범위·팩 스키마·digest), B1(찾기 도구), C1(새 팩 검사·세트·프리셋·digest)
  - 보통 모델: D1
  - D2는 최종 브랜치 리뷰(가장 강한 모델)에 합친다
- 마일스톤 정지: D2(N4 완료 기준)가 끝나면 결과를 보여 주고 멈춘다. main 병합·push·PR·정본 수정은 사용자에게 묻는다.

---

## 파일 구조

태스크별로 만들고(C) 고치는(M) 파일이다. 줄 수는 그 태스크를 마친 때의 모습이다. fixture 폴더는 파일 수로 적는다.

| 태스크 | 파일 | C/M | 줄 |
|---|---|---|---|
| A1 | `core/ledger/events.js` | M | 28 |
| A1 | `core/links/graph.js` | C | 67 |
| A1 | `core/store/position.js` | M | 49 |
| A1 | `test/core/links-graph.test.js` | C | 69 |
| A1 | `test/core/position.test.js` | M | 65 |
| A1 | `test/fixtures/reference-book/` | C | 파일 11개 |
| A2 | `core/index/query.js` | M | 80 |
| A2 | `core/links/graph.js` | M | 73 |
| A2 | `core/status.js` | M | 76 |
| A2 | `core/work/features.js` | M | 93 |
| A2 | `test/core/features.test.js` | M | 138 |
| A2 | `test/core/links-query.test.js` | C | 49 |
| A2 | `test/server/feature-toggles.test.js` | M | 64 |
| A3 | `core/run/payload.js` | M | 63 |
| A3 | `core/scope/linked.js` | C | 28 |
| A3 | `core/scope/scope.js` | M | 96 |
| A3 | `test/run/scope-linked.test.js` | C | 137 |
| A4 | `core/checks/run-checks.js` | M | 123 |
| A4 | `core/pack/yaml-schema.js` | M | 208 |
| A4 | `test/run/order-none-checks.test.js` | C | 121 |
| A5 | `core/pack/registry.js` | M | 56 |
| A5 | `core/pack/yaml-pack.js` | M | 103 |
| A5 | `core/pack/yaml-schema.js` | M | 218 |
| A5 | `core/run/payload.js` | M | 64 |
| A5 | `core/scope/fields.js` | C | 6 |
| A5 | `core/scope/scope.js` | M | 99 |
| A5 | `packs/knowledge/pack.yaml` | M | 150 |
| A5 | `test/run/scope-fields.test.js` | C | 65 |
| A5 | `test/run/scope-prerequisites.test.js` | M | 64 |
| B1 | `server/tools/definitions.js` | M | 69 |
| B1 | `server/tools/find.js` | M | 95 |
| B1 | `test/server/find-blocks.test.js` | M | 80 |
| B1 | `test/server/find-links.test.js` | C | 46 |
| C1 | `packs/knowledge/README.md` | M | 10 |
| C1 | `packs/knowledge/checkers/index.js` | M | 10 |
| C1 | `packs/knowledge/checkers/links.js` | C | 23 |
| C1 | `packs/knowledge/checks/linked-consistency.md` | C | 4 |
| C1 | `packs/knowledge/pack.yaml` | M | 181 |
| C1 | `test/pack/knowledge-cross-refs.test.js` | M | 76 |
| C1 | `test/pack/knowledge-links.test.js` | C | 74 |
| C1 | `test/pack/knowledge-pack.test.js` | M | 127 |
| C1 | `test/pack/knowledge-sourcebook.test.js` | M | 51 |
| C1 | `test/server/knowledge-init.test.js` | M | 32 |
| D1 | `skill/folio/SKILL.md` | M | 100 |
| D1 | `skill/folio/references/knowledge.md` | M | 63 |
| D1 | `skill/folio/references/order.md` | C | 65 |
| D1 | `test/server/order-docs.test.js` | C | 19 |
| D2 | `test/acceptance/n4.test.js` | C | 148 |

책임 나눔:
- `core/links/graph.js`만 노드 연결 표를 안다. 범위(`linked.js`), 상태, 찾기, 검사기(`packs/knowledge/checkers/links.js`)는 모두 이것을 부른다.
- `core/scope/linked.js`만 "순서 없는 노드가 무엇을 모으나"를 정한다(갈림 자리). `scope.js`는 그 결과를 `inScope`로 거르고 rev에 넣기만 한다.
- 앞뒤 판정은 여전히 `ordered` 하나다(`position.js`·`events.js` `eventsBefore`). `unorderedBy`는 새 동작 둘(연결 범위, `requiresOrder: none`)에만 쓴다.
- 코어는 `prerequisites`의 뜻을 모른다. 팩이 `scopeFields`로 켤 때만 읽는다(`core/scope/fields.js`).

---

## Task A1: 노드 연결 표, 위치의 `unorderedBy`, `eventsOn`

> **리뷰: 가장 강한 모델. 공격해 볼 것** — 공격 목록 4·9. `ordered` 값이 어떤 작품에서도 N4 전과 같은가(`unorderedBy`만 더해졌나). `branching`이 `none`보다 앞서는가(윗노드 none + 아래 레벨 branching, 반대 경우). front·back 아래 none 레벨은 `none`인가 `role`인가(설계: 순서 방식 까닭이 먼저). `eventsOn`이 positions에 없는 노드(지운 노드)의 사건을 흘리는가. `linkTable`이 index.db·`.folio`를 만드는가.

**Files:**
- Create: `core/links/graph.js`, `test/core/links-graph.test.js`, `test/fixtures/reference-book/`(파일 11개)
- Modify: `core/store/position.js`, `core/ledger/events.js`, `test/core/position.test.js`

**Interfaces:**
- Consumes: `core/store/tree.js` `preorder(tree)`, 노드 `links: { to, kind, label }[]`(M1 `readLinks` 그대로), `core/blocks/subtree.js` `subtreeOf(tree, nodeId)`(N3 — 없는 노드면 `NODE_NOT_FOUND`, `undefined`면 `null`), `core/work/config.js` `orderModeFor(config, level)`.
- Produces:
  - `computePositions(tree, config)` 위치 값에 `unorderedBy: 'none'|'branching'|'role'|null`(`ordered`면 `null`). 다른 키·`ordered`·`ordinal`·`key`는 그대로.
  - `eventsOn({ events, positions, nodeIds }) → event[]`(읽는 순서 번호 → seq, positions에 없는 노드 뺌).
  - `core/links/graph.js`: `linksFrom(work, nodeId)`, `linksTo(work, nodeId)`, `linkTable(work, { nodeId? })`, `linkedNodeIds(work, nodeId)`. 모양은 "N7·M6b 계약" 절.

- [ ] **Step 1: 실패하는 테스트와 fixture를 쓴다**

fixture(합성, 사전 2단). 링크 여섯 개 중 `ghost-entry`(깨진 링크)와 `nucleus → nucleus`(자기 링크)는 일부러 심었다.

`test/fixtures/reference-book/entities/term/atp.md` (6줄):

````markdown
---
id: atp
kind: term
name: ATP
---
세포의 에너지 화폐.
````

`test/fixtures/reference-book/entities/term/cell-membrane.md` (6줄):

````markdown
---
id: cell-membrane
kind: term
name: 세포막
---
세포의 바깥 경계.
````

`test/fixtures/reference-book/entities/term/mitochondrion.md` (6줄):

````markdown
---
id: mitochondrion
kind: term
name: 미토콘드리아
---
ATP를 만드는 세포 기관.
````

`test/fixtures/reference-book/tree/01-part-cell/01-cell.md` (9줄):

````markdown
---
id: cell
level: entry
title: 세포
links:
  - to: membrane
    label: 세포막
---
세포는 생명의 가장 작은 단위다. 바깥은 세포막이 싼다.
````

`test/fixtures/reference-book/tree/01-part-cell/02-membrane.md` (11줄):

````markdown
---
id: membrane
level: entry
title: 세포막
links:
  - to: cell
    label: 세포
  - to: ghost-entry
    label: 없는 항목
---
세포막은 세포의 바깥 경계다. 물질이 지나갈 때 ATP를 쓰기도 한다.
````

`test/fixtures/reference-book/tree/01-part-cell/03-nucleus.md` (9줄):

````markdown
---
id: nucleus
level: entry
title: 핵
links:
  - to: nucleus
    label: 핵
---
핵은 유전 정보를 담는다.
````

`test/fixtures/reference-book/tree/01-part-cell/_node.md` (6줄):

````markdown
---
id: part-cell
level: part
title: 세포
---
세포와 그 경계를 다루는 항목들.
````

`test/fixtures/reference-book/tree/02-part-energy/01-atp.md` (11줄):

````markdown
---
id: atp-entry
level: entry
title: ATP
links:
  - to: mitochondria
    kind: see-also
    label: 미토콘드리아
  - to: membrane
---
ATP는 세포의 에너지 화폐다.
````

`test/fixtures/reference-book/tree/02-part-energy/02-mitochondria.md` (6줄):

````markdown
---
id: mitochondria
level: entry
title: 미토콘드리아
---
미토콘드리아는 ATP를 만든다.
````

`test/fixtures/reference-book/tree/02-part-energy/_node.md` (6줄):

````markdown
---
id: part-energy
level: part
title: 에너지
---
에너지를 만들고 쓰는 항목들.
````

`test/fixtures/reference-book/work.yaml` (9줄):

````yaml
title: 작은 세포 사전
levels:
  - name: part
    children: [1, 10]
  - name: entry
    leaf: true
order: none
packs: [knowledge]
checkSets: []
````

`test/core/links-graph.test.js` (69줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { linkTable, linkedNodeIds, linksFrom, linksTo } from '../../core/links/graph.js';
import { eventsOn } from '../../core/ledger/events.js';
import { fixturePath } from '../support/fixtures.js';

const row = (link) => `${link.from}>${link.to}:${link.kind}:${link.label}:${link.index}:${link.valid}`;

test('the link table lists every link in reading order, with broken and self links as problems', async () => {
  const work = await openWork(fixturePath('reference-book'));
  const table = linkTable(work);
  assert.deepEqual(table.links.map(row), [
    'cell>membrane:see-also:세포막:0:true', 'membrane>cell:see-also:세포:0:true', 'membrane>ghost-entry:see-also:없는 항목:1:false',
    'nucleus>nucleus:see-also:핵:0:true', 'atp-entry>mitochondria:see-also:미토콘드리아:0:true', 'atp-entry>membrane:see-also::1:true',
  ]);
  assert.deepEqual(table.problems, [
    { code: 'LINK_BROKEN', nodeId: 'membrane', to: 'ghost-entry', kind: 'see-also', index: 1 },
    { code: 'LINK_SELF', nodeId: 'nucleus', to: 'nucleus', kind: 'see-also', index: 0 },
  ]);
  assert.deepEqual(table.backlinks.map(row), [
    'membrane>cell:see-also:세포:0:true', 'cell>membrane:see-also:세포막:0:true', 'atp-entry>membrane:see-also::1:true', 'atp-entry>mitochondria:see-also:미토콘드리아:0:true',
  ]);
});

test('a node id narrows the table to that branch; backlinks come from anywhere; unknown ids are NODE_NOT_FOUND', async () => {
  const work = await openWork(fixturePath('reference-book'));
  const energy = linkTable(work, { nodeId: 'part-energy' });
  assert.deepEqual(energy.links.map((l) => `${l.from}>${l.to}`), ['atp-entry>mitochondria', 'atp-entry>membrane']);
  assert.deepEqual(energy.backlinks.map((l) => `${l.from}>${l.to}`), ['atp-entry>mitochondria']);
  assert.deepEqual(energy.problems, []);
  assert.deepEqual(linkTable(work, { nodeId: 'membrane' }).backlinks.map((l) => `${l.from}>${l.to}`), ['cell>membrane', 'atp-entry>membrane']);
  for (const bad of ['nowhere', '*', '__proto__']) assert.throws(() => linkTable(work, { nodeId: bad }), { code: 'NODE_NOT_FOUND' }, bad);
});

test('linksFrom and linksTo give one node\'s outgoing and incoming links; linkedNodeIds keeps real targets once, never itself', async () => {
  const work = await openWork(fixturePath('reference-book'));
  assert.deepEqual(linksFrom(work, 'membrane').map(row), ['membrane>cell:see-also:세포:0:true', 'membrane>ghost-entry:see-also:없는 항목:1:false']);
  assert.deepEqual(linksTo(work, 'membrane').map((l) => l.from), ['cell', 'atp-entry']);
  assert.deepEqual(linksTo(work, 'nucleus'), []);
  assert.deepEqual(linksFrom(work, 'mitochondria'), []);
  assert.throws(() => linksFrom(work, 'ghost-entry'), { code: 'NODE_NOT_FOUND' });
  assert.throws(() => linksTo(work, 'ghost-entry'), { code: 'NODE_NOT_FOUND' });
  assert.deepEqual(linkedNodeIds(work, 'atp-entry'), ['mitochondria', 'membrane']);
  assert.deepEqual(linkedNodeIds(work, 'membrane'), ['cell']);
  assert.deepEqual(linkedNodeIds(work, 'nucleus'), []);
  assert.deepEqual(linkedNodeIds(work, 'ghost-entry'), []);
});

test('positions say why a node is outside the order: none, branching (wins over none) or role', async () => {
  const none = await openWork(fixturePath('reference-book'));
  assert.deepEqual([...none.positions.values()].map((p) => [p.orderMode, p.ordered, p.unorderedBy]).at(1), ['none', false, 'none']);
  assert.ok([...none.positions.values()].every((p) => p.unorderedBy === 'none'));
  const game = await openWork(fixturePath('gamebook'));
  assert.ok([...game.positions.values()].every((p) => p.unorderedBy === 'branching'));
  const book = await openWork(fixturePath('knowledge-book'));
  assert.deepEqual(['preface', 'membranes', 'glossary'].map((id) => book.positions.get(id).unorderedBy), ['role', null, 'role']);
});

test('eventsOn keeps only the given nodes\' events, in reading order then seq, whatever their place', async () => {
  const work = await openWork(fixturePath('reference-book'));
  const events = [
    { eventId: 'a', seq: 3, nodeId: 'mitochondria', entityId: 'atp' }, { eventId: 'b', seq: 1, nodeId: 'cell', entityId: 'cell-membrane' },
    { eventId: 'c', seq: 2, nodeId: 'nucleus', entityId: 'atp' }, { eventId: 'd', seq: 0, nodeId: 'mitochondria', entityId: 'mitochondrion' },
    { eventId: 'e', seq: 4, nodeId: 'gone', entityId: 'atp' },
  ];
  assert.deepEqual(eventsOn({ events, positions: work.positions, nodeIds: ['mitochondria', 'cell', 'gone'] }).map((e) => e.eventId), ['b', 'd', 'a']);
  assert.deepEqual(eventsOn({ events, positions: work.positions, nodeIds: [] }), []);
});
````

`test/core/position.test.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/test/core/position.test.js b/test/core/position.test.js
index 94e94f9..02dfb6a 100644
--- a/test/core/position.test.js
+++ b/test/core/position.test.js
@@ -56,3 +56,10 @@ test('unknown ids throw', async () => {
   const p = await positionsOf(fixturePath('novel-3level'));
   assert.throws(() => compareNodes(p, 'ghost', 'funeral'), { code: 'NODE_NOT_FOUND' });
 });
+
+test('a none level under a linear parent is unordered by none; a front node\'s children are unordered by role', async () => {
+  const p = await positionsOf(fixturePath('novel-3level'), { order: { default: 'linear', levels: { chapter: 'none' } } });
+  assert.deepEqual(['book-one', 'the-fall', 'rooftop-scene'].map((id) => p.get(id).unorderedBy), [null, 'none', 'none']);
+  const mixed = await positionsOf(fixturePath('novel-3level'), { order: { default: 'branching', levels: { chapter: 'none' } } });
+  assert.deepEqual(['book-one', 'the-fall', 'rooftop-scene'].map((id) => mixed.get(id).unorderedBy), ['branching', 'branching', 'branching']);
+});
````

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test test/core/links-graph.test.js test/core/position.test.js`
Expected: FAIL — `links-graph.test.js`는 `ERR_MODULE_NOT_FOUND`(`core/links/graph.js` 없음), `position.test.js`의 `a none level under a linear parent is unordered by none; a front node's children are unordered by role`가 실패(`unorderedBy`가 `undefined`). 기존 position 테스트 6개는 통과.

- [ ] **Step 3: 구현한다**

`core/store/position.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/store/position.js b/core/store/position.js
index 33355ad..f0d7788 100644
--- a/core/store/position.js
+++ b/core/store/position.js
@@ -1,24 +1,41 @@
 import { FolioError } from '../errors.js';
 import { orderModeFor } from '../work/config.js';

+/**
+ * 순서 방식으로 빠진 까닭을 윗노드에서 물려받아 이 노드 레벨의 방식과 합친다(N4). branching 이 none 보다 앞선다.
+ * @param {'branching'|'none'|null} parentReason
+ * @param {string} orderMode
+ * @returns {'branching'|'none'|null}
+ */
+function modeReasonOf(parentReason, orderMode) {
+  if (parentReason === 'branching' || orderMode === 'branching') return 'branching';
+  if (parentReason === 'none' || orderMode === 'none') return 'none';
+  return null;
+}
+
 /**
  * 깊이와 상관없는 한 줄 순번. 가지 노드(계획)는 자식보다 앞에 온다.
  * front/back 역할, linear가 아닌 레벨, 그리고 그 자손은 앞뒤 판정에서 빠진다.
+ * unorderedBy(N4)는 빠진 까닭이다. 앞뒤 판정 안이면 null.
+ * - 'branching': 이 노드나 윗노드의 레벨이 branching(N7 이 정한다). none 과 겹치면 branching 이 앞선다.
+ * - 'none': 이 노드나 윗노드의 레벨이 none.
+ * - 'role': 순서 방식은 linear 인데 front·back 역할(또는 그 자손)이라 빠졌다.
  */
 export function computePositions(tree, config) {
   const positions = new Map();
   let ordinal = 0;
-  const walk = (ids, prefix, parentOrdered) => {
+  const walk = (ids, prefix, parentOrdered, parentReason) => {
     ids.forEach((id, index) => {
       const node = tree.nodes.get(id);
       const key = [...prefix, String(index + 1).padStart(4, '0')];
       const orderMode = orderModeFor(config, node.level);
       const ordered = parentOrdered && orderMode === 'linear' && node.role === 'body';
-      positions.set(id, { ordinal: ordinal++, key: key.join('.'), orderMode, ordered });
-      walk(node.children, key, ordered);
+      const modeReason = modeReasonOf(parentReason, orderMode);
+      positions.set(id, { ordinal: ordinal++, key: key.join('.'), orderMode, ordered, unorderedBy: ordered ? null : modeReason ?? 'role' });
+      walk(node.children, key, ordered, modeReason);
     });
   };
-  walk(tree.rootIds, [], true);
+  walk(tree.rootIds, [], true, null);
   return positions;
 }

````

`core/ledger/events.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/ledger/events.js b/core/ledger/events.js
index ff31bb6..b43c8d4 100644
--- a/core/ledger/events.js
+++ b/core/ledger/events.js
@@ -15,3 +15,14 @@ export function eventsBefore({ events, positions, nodeId }) {
   earlier.sort((a, b) => positions.get(a.nodeId).ordinal - positions.get(b.nodeId).ordinal || a.seq - b.seq);
   return { applicable: true, events: earlier };
 }
+
+/**
+ * 주어진 노드들에 기록된 사건(N4 순서 없는 범위 — 연결된 노드의 사건). 앞인지 뒤인지 따지지 않는다.
+ * 읽는 순서 번호 → seq 순. positions 에 없는 노드의 사건은 뺀다.
+ */
+export function eventsOn({ events, positions, nodeIds }) {
+  const on = new Set(nodeIds);
+  const found = events.filter((event) => on.has(event.nodeId) && positions.has(event.nodeId));
+  found.sort((a, b) => positions.get(a.nodeId).ordinal - positions.get(b.nodeId).ordinal || a.seq - b.seq);
+  return found;
+}
````

`core/links/graph.js` (67줄):

````js
import { FolioError } from '../errors.js';
import { preorder } from '../store/tree.js';
import { subtreeOf } from '../blocks/subtree.js';

/**
 * 노드 연결 표(정본 §04 "트리 밖 노드 연결 표"). 저장 정본은 노드 앞머리 links 다(M1 core/store/tree.js readLinks).
 * 이 파일은 그것을 읽기만 한다 — index.db 도 작업 잠금도 쓰지 않는다. 링크 모양({ to, kind, label })은 바꾸지 않는다.
 * - 링크 한 줄: { from, to, kind, label, index, valid }. index 는 from 노드 links 안의 차례(0부터), valid 는 to 노드가 작품에 있는가.
 * - 문제: LINK_BROKEN(없는 노드를 가리킴), LINK_SELF(자기 자신을 가리킴). 작품 열기를 막지 않고 알리기만 한다.
 */

/** @param {any} work @param {any} node */
const entriesOf = (work, node) => node.links.map((link, index) => ({
  from: node.id, to: link.to, kind: link.kind, label: link.label, index, valid: work.tree.nodes.has(link.to),
}));

/** @param {{ from: string, to: string, kind: string, index: number, valid: boolean }} link */
function problemOf(link) {
  if (!link.valid) return { code: 'LINK_BROKEN', nodeId: link.from, to: link.to, kind: link.kind, index: link.index };
  if (link.to === link.from) return { code: 'LINK_SELF', nodeId: link.from, to: link.to, kind: link.kind, index: link.index };
  return null;
}

function nodeOf(work, nodeId) {
  const node = typeof nodeId === 'string' ? work.tree.nodes.get(nodeId) : undefined;
  if (!node) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
  return node;
}

/** 한 노드가 가리키는 링크(적은 차례). 없는 노드면 NODE_NOT_FOUND. */
export function linksFrom(work, nodeId) {
  return entriesOf(work, nodeOf(work, nodeId));
}

/** 한 노드를 가리키는 링크(다른 노드에서 온 것만, 읽는 순서 → 적은 차례). 없는 노드면 NODE_NOT_FOUND. */
export function linksTo(work, nodeId) {
  nodeOf(work, nodeId);
  return preorder(work.tree).flatMap((id) => entriesOf(work, work.tree.nodes.get(id)).filter((link) => link.to === nodeId && link.from !== nodeId));
}

/**
 * 연결 표(N4 계약 — core/index/query.js 가 이름을 고정해 내보낸다).
 * - links: 범위 안 노드의 링크(읽는 순서 → 적은 차례).
 * - backlinks: 범위 안 노드를 가리키는 링크(범위 밖에서 온 것 포함, 자기 링크·깨진 링크 제외). 대상의 읽는 순서 → 출발 노드의 읽는 순서 → 적은 차례.
 * - problems: 범위 안 링크의 LINK_BROKEN·LINK_SELF(links 와 같은 차례).
 * nodeId 를 주면 그 노드와 자손만(없는 노드는 NODE_NOT_FOUND).
 * @param {any} work openWork 결과
 * @param {{ nodeId?: string }} [options]
 */
export function linkTable(work, { nodeId } = {}) {
  const inScope = subtreeOf(work.tree, nodeId);
  const order = preorder(work.tree);
  const rank = new Map(order.map((id, index) => [id, index]));
  const all = order.flatMap((id) => entriesOf(work, work.tree.nodes.get(id)));
  const links = all.filter((link) => !inScope || inScope.has(link.from));
  const backlinks = all.filter((link) => link.valid && link.to !== link.from && (!inScope || inScope.has(link.to)))
    .sort((a, b) => rank.get(a.to) - rank.get(b.to) || rank.get(a.from) - rank.get(b.from) || a.index - b.index);
  return { links, backlinks, problems: links.map(problemOf).filter(Boolean) };
}

/** 순서 없는(none) 노드의 앞쪽 범위가 모을 노드: 이 노드가 가리키는 있는 노드(한 단계, 자기 자신 제외, 처음 적은 차례로 한 번씩). */
export function linkedNodeIds(work, nodeId) {
  const node = work.tree.nodes.get(nodeId);
  if (!node) return [];
  return [...new Set(node.links.map((link) => link.to).filter((to) => to !== nodeId && work.tree.nodes.has(to)))];
}

````

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test test/core/links-graph.test.js test/core/position.test.js`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: lint·typecheck 통과, 1036/1036(+6).

- [ ] **Step 6: 커밋**

```bash
git add core/links/graph.js core/store/position.js core/ledger/events.js test/core/links-graph.test.js test/core/position.test.js test/fixtures/reference-book
git commit -m "feat(links): node link table, unordered reasons in positions, and eventsOn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task A2: 기능 `links`·`linkScope`, 연결 조회 계약, `folio_status.links`

> **리뷰: 가장 강한 모델. 공격해 볼 것** — 공격 목록 7·10. `links: false`만 적으면 `linkScope`가 저절로 꺼지는가, `links: false, linkScope: true`는 거절되는가(기존 규칙 `FEATURE_REQUIRES`). `featuresDigest`가 `linkScope`에만 반응하고 `links`에는 반응하지 않는가. `query.js`의 N3 계약 주석과 내보내기를 건드리지 않았는가. `folio_status`가 `links: false`에서 다른 키를 그대로 내는가. 조회가 index.db·작업 잠금을 만들지 않는가.

**Files:**
- Create: `test/core/links-query.test.js`
- Modify: `core/work/features.js`, `core/links/graph.js`(`linksStatus`), `core/index/query.js`(끝에 다시 내보내기), `core/status.js`, `test/core/features.test.js`, `test/server/feature-toggles.test.js`

**Interfaces:**
- Consumes: A1 `linkTable`.
- Produces:
  - `FEATURES` 끝에 `links: true`, `linkScope: true`. `FEATURE_PARENTS.linkScope = 'links'`. `RUN_FEATURES` 끝에 `'linkScope'`.
  - `linksStatus(work) → { problems, total } | null`(links 꺼지면 `null`).
  - `core/index/query.js`: `export { linkTable, linksFrom, linksTo } from '../links/graph.js'`(N7·M6b 계약, 이름 고정).
  - `workStatus(...).links`(`blocks` 뒤, `warnings` 앞).

목록 테스트: N3가 쓴 `Object.keys(FEATURES).slice(-3)` 단언은 끝 기준이라 N4 뒤에 깨진다. `blocks` 자리 기준 상대 단언으로 옮기고(약화 아님 — 같은 세 이름·같은 차례를 본다), N4 두 이름은 새 테스트에서 끝을 본다(결정 19).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/core/features.test.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/test/core/features.test.js b/test/core/features.test.js
index 76ae1a0..fc533ff 100644
--- a/test/core/features.test.js
+++ b/test/core/features.test.js
@@ -16,7 +16,7 @@ test('features default to the documented values and every key is always present'
   assert.deepEqual(errors, []);
   assert.deepEqual(config.features, {
     occurrences: true, occurrencesInExtract: true, occurrenceScope: false, rename: true, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
-    viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true,
+    viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true,
   });
   assert.deepEqual(config.features, FEATURES);
   assert.ok(Object.isFrozen(FEATURES));
@@ -33,7 +33,7 @@ test('features accept known booleans and reject unknown keys, non-booleans and e
   assert.deepEqual(codes({ occurrences: false }), []);
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false } }).config.features,
     { occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
-      viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true });
+      viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true });
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false, rename: true } }).errors,
     [{ code: 'FEATURE_REQUIRES', feature: 'rename', requires: 'occurrences' }]);
   const detail = validateWorkConfig({ ...base, features: { occurrences: false, occurrencesInExtract: false, rename: false } }).errors;
@@ -100,7 +100,8 @@ test('C0 feature: checkConfig is on by default, has no parent, and does not chan
 });

 test('N3 features: blocks, bibliography and termIndex are on by default, appended after checkConfig, without parents and outside the run digest', () => {
-  assert.deepEqual(Object.keys(FEATURES).slice(-3), ['blocks', 'bibliography', 'termIndex']);
+  const keys = Object.keys(FEATURES);
+  assert.deepEqual(keys.slice(keys.indexOf('blocks'), keys.indexOf('blocks') + 3), ['blocks', 'bibliography', 'termIndex']);
   assert.equal(Object.keys(FEATURES).indexOf('blocks'), Object.keys(FEATURES).indexOf('checkConfig') + 1);
   const d = (f) => featuresDigest({ ...FEATURES, ...f });
   for (const key of ['blocks', 'bibliography', 'termIndex']) {
@@ -112,6 +113,22 @@ test('N3 features: blocks, bibliography and termIndex are on by default, appende
   }
 });

+test('N4 features: links and linkScope are on by default and appended after termIndex; linkScope follows links and changes the run digest', () => {
+  const keys = Object.keys(FEATURES);
+  assert.deepEqual(keys.slice(-2), ['links', 'linkScope']);
+  assert.equal(keys.indexOf('links'), keys.indexOf('termIndex') + 1);
+  assert.deepEqual([FEATURES.links, FEATURES.linkScope, FEATURE_PARENTS.links, FEATURE_PARENTS.linkScope], [true, true, undefined, 'links']);
+  assert.deepEqual([RUN_FEATURES.includes('links'), RUN_FEATURES.at(-1)], [false, 'linkScope']);
+  const eff = (features) => validateWorkConfig({ ...base, features });
+  assert.deepEqual(eff({ links: false }).config.features, { ...FEATURES, links: false, linkScope: false });
+  assert.deepEqual(eff({ links: false }).errors, []);
+  assert.deepEqual(eff({ links: false, linkScope: true }).errors, [{ code: 'FEATURE_REQUIRES', feature: 'linkScope', requires: 'links' }]);
+  const d = (f) => featuresDigest({ ...FEATURES, ...f });
+  assert.notEqual(d({ linkScope: false }), d({}));
+  assert.equal(d({ links: false }), d({}));
+  assert.notEqual(featuresDigest(eff({ links: false }).config.features), featuresDigest(eff({}).config.features));
+});
+
 /** 가짜 팩에 프리셋 하나를 더한 것(initWork 는 프리셋이 필요하다). */
 function fakePresetPacks() {
   const packs = fakePacks();
````

`test/server/feature-toggles.test.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/test/server/feature-toggles.test.js b/test/server/feature-toggles.test.js
index c8a676c..aed86c1 100644
--- a/test/server/feature-toggles.test.js
+++ b/test/server/feature-toggles.test.js
@@ -28,7 +28,7 @@ test('F-2: features { occurrences: false } alone gives a working work; the child
   const values = ok(await tools.call('folio_config', { root })).features.values;
   assert.deepEqual(values, {
     occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true,
-    promiseScope: true, viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true,
+    promiseScope: true, viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true,
   });
   const renamed = await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' });
   assert.equal(code(renamed), 'FEATURE_DISABLED');
````

`test/core/links-query.test.js` (49줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as query from '../../core/index/query.js';
import { indexPath } from '../../core/index/rebuild.js';
import { linkTable, linksFrom, linksTo } from '../../core/links/graph.js';
import { openWork } from '../../core/store/work.js';
import { workStatus } from '../../core/status.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture } from '../support/fixtures.js';

/** reference-book 복사본의 work.yaml features 를 바꾼다(작가가 하는 일). */
async function withFeatures(features) {
  const root = await copyFixture('reference-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
  return root;
}

test('N4 contract: core/index/query.js exports the link queries under fixed names, and they need no index.db', async () => {
  assert.equal(query.linkTable, linkTable);
  assert.equal(query.linksFrom, linksFrom);
  assert.equal(query.linksTo, linksTo);
  const root = await withFeatures({});
  const work = await openWork(root);
  assert.equal(query.linkTable(work).links.length, 6);
  assert.deepEqual(query.linksFrom(work, 'cell').map((l) => l.to), ['membrane']);
  assert.deepEqual(query.linksTo(work, 'cell').map((l) => l.from), ['membrane']);
  await assert.rejects(stat(indexPath(root)), { code: 'ENOENT' });
});

test('folio_status links lists broken and self links with the link count; turning links off makes it null and leaves the rest', async () => {
  const packs = await loadBuiltinPacks();
  const on = await workStatus(await withFeatures({}), { packs });
  assert.deepEqual(on.links, {
    problems: [
      { code: 'LINK_BROKEN', nodeId: 'membrane', to: 'ghost-entry', kind: 'see-also', index: 1 },
      { code: 'LINK_SELF', nodeId: 'nucleus', to: 'nucleus', kind: 'see-also', index: 0 },
    ],
    total: 6,
  });
  const off = await workStatus(await withFeatures({ links: false }), { packs });
  assert.equal(off.links, null);
  const { links: _on, ...restOn } = on;
  const { links: _off, ...restOff } = off;
  assert.deepEqual(restOff, restOn);
});
````

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test test/core/features.test.js test/server/feature-toggles.test.js test/core/links-query.test.js`
Expected: FAIL 6개 — `features default to the documented values and every key is always present`, `features accept known booleans and reject unknown keys, non-booleans and explicitly-on orphaned children`, `N4 features: links and linkScope are on by default ...`, `N4 contract: core/index/query.js exports the link queries ...`, `folio_status links lists broken and self links ...`, `F-2: features { occurrences: false } alone gives a working work ...`. 나머지 10개 통과.

- [ ] **Step 3: 구현한다**

`core/work/features.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/work/features.js b/core/work/features.js
index 0b97c5f..858eb20 100644
--- a/core/work/features.js
+++ b/core/work/features.js
@@ -18,6 +18,9 @@ import { isPlainObject } from '../util/plain.js';
  * - termIndex: 색인(folio_find terms). 이름 스캔·등장 위치 기록장을 읽기만 한다.
  *   셋 다 파일에서 다시 만드는 읽기 전용 투영이라 실행이 묻는 것·검사 범위를 바꾸지 않는다(RUN_FEATURES 밖, 부모 없음).
  *   상호 참조 검사(knowledge.cross-refs)는 기능이 아니라 검사 세트(knowledge.references)로 고른다.
+ * - links: 노드 연결 표(folio_find links)와 folio_status 의 links(깨진 링크·자기 링크)(N4). 읽기 전용 투영이다(RUN_FEATURES 밖). 끄면 FEATURE_DISABLED·null.
+ * - linkScope: 순서 없는(none) 노드의 검사 범위가 연결된 노드의 사건(linkedEvents)을 모은다(N4, 정본 §10 끝). links 필요.
+ *   검사가 보는 것을 바꾸므로 RUN_FEATURES 에 든다. 앞뒤 판정(ordered)·priorEvents·core.promise-order 는 이 값과 상관없다.
  */
 export const FEATURES = Object.freeze({
   occurrences: true,
@@ -35,16 +38,18 @@ export const FEATURES = Object.freeze({
   blocks: true,
   bibliography: true,
   termIndex: true,
+  links: true,
+  linkScope: true,
 });

 /** 켜려면 부모 기능도 켜져 있어야 하는 기능. 부모가 꺼지면 (명시적으로 true 가 아닌 한) 저절로 꺼진다. */
 export const FEATURE_PARENTS = Object.freeze({
   occurrencesInExtract: 'occurrences', occurrenceScope: 'occurrences', rename: 'occurrences', evidenceInExtract: 'evidence',
-  viewerToggles: 'viewer',
+  viewerToggles: 'viewer', linkScope: 'links',
 });

 /** 실행이 묻는 것·검사 범위를 바꾸는 기능. 이것이 바뀌면 열린 실행은 검사부터 다시 돈다. */
-export const RUN_FEATURES = Object.freeze(['occurrencesInExtract', 'occurrenceScope', 'sources', 'evidence', 'evidenceInExtract', 'promiseScope']);
+export const RUN_FEATURES = Object.freeze(['occurrencesInExtract', 'occurrenceScope', 'sources', 'evidence', 'evidenceInExtract', 'promiseScope', 'linkScope']);

 /**
  * features: 알려진 불리언만. 빠진 것은 기본값.
````

`core/links/graph.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/links/graph.js b/core/links/graph.js
index 23c5530..1a2ff33 100644
--- a/core/links/graph.js
+++ b/core/links/graph.js
@@ -65,3 +65,9 @@ export function linkedNodeIds(work, nodeId) {
   return [...new Set(node.links.map((link) => link.to).filter((to) => to !== nodeId && work.tree.nodes.has(to)))];
 }

+/** folio_status 의 links: { problems, total }(링크 수). links 기능이 꺼지면 null. */
+export function linksStatus(work) {
+  if (!work.config.features.links) return null;
+  const { links, problems } = linkTable(work);
+  return { problems, total: links.length };
+}
````

`core/index/query.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/index/query.js b/core/index/query.js
index afc8e58..99da689 100644
--- a/core/index/query.js
+++ b/core/index/query.js
@@ -69,3 +69,12 @@ export function compareInIndex(db, a, b) {
   if (pa.ordinal === pb.ordinal) return 'same';
   return pa.ordinal < pb.ordinal ? 'before' : 'after';
 }
+
+/**
+ * N4 계약 — N7(분기·게임북)과 M6b 뷰어가 쓰는 노드 연결 표 조회. 이 이름과 인자 모양은 바꾸지 않는다(바꾸려면 쓰는 레인의 테스트와 같은 커밋에서).
+ * 모두 openWork 결과(work)에서 바로 계산한다: index.db 도 작업 잠금도 쓰지 않는다. 기능 확인(`links`)은 호출자가 한다.
+ * - linkTable(work, { nodeId? }) → { links, backlinks, problems }(nodeId 를 주면 그 가지만, 없는 노드는 NODE_NOT_FOUND)
+ * - linksFrom(work, nodeId) → 그 노드가 가리키는 링크 / linksTo(work, nodeId) → 다른 노드에서 그 노드로 오는 링크
+ * - 링크 한 줄: { from, to, kind, label, index, valid }. 문제 한 줄: { code: 'LINK_BROKEN'|'LINK_SELF', nodeId, to, kind, index }
+ */
+export { linkTable, linksFrom, linksTo } from '../links/graph.js';
````

`core/status.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/status.js b/core/status.js
index 70bc2f5..16bccf9 100644
--- a/core/status.js
+++ b/core/status.js
@@ -13,6 +13,7 @@ import { evidenceStatus } from './evidence/status.js';
 import { pendingFileTxStatus, TX_DIR } from './util/file-tx.js';
 import { runTextDrift } from './run/text-guard.js';
 import { blocksStatus } from './blocks/catalog.js';
+import { linksStatus } from './links/graph.js';

 /**
  * 지금 상태·다음 할 일·다시 확인 필요·손수정. 기록장이 깨졌으면 그것만 알린다.
@@ -58,6 +59,8 @@ export async function workStatus(root, { packs }) {
     evidence: await evidenceStatus(root, work),
     // 블록(N3): 겹친 앵커·깨진 참조·각주·자료 인용 문제와 블록 수. 파일에서 바로 계산한다. blocks 기능이 꺼지면 null.
     blocks: blocksStatus(work),
+    // 노드 연결(N4): 없는 노드를 가리키거나(LINK_BROKEN) 자기 자신을 가리키는(LINK_SELF) 링크와 링크 수. links 기능이 꺼지면 null.
+    links: linksStatus(work),
     warnings,
   };
 }
````

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test test/core/features.test.js test/server/feature-toggles.test.js test/core/links-query.test.js`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: 1039/1039(+3).

- [ ] **Step 6: 커밋**

```bash
git add core/work/features.js core/links/graph.js core/index/query.js core/status.js test/core/features.test.js test/server/feature-toggles.test.js test/core/links-query.test.js
git commit -m "feat(links): links and linkScope toggles, link query contract and status links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task A3: 순서 없는 노드가 연결된 노드의 사건을 모은다(`linkedEvents`)

> **리뷰: 가장 강한 모델. 공격해 볼 것** — 공격 목록 2·4·8·9. 어떤 토글·레벨 조합에서도 순서 없는 노드의 `priorEvents`가 비어 있는가. linear·front·back·branching 노드가 링크만으로 사건을 모으는가. linear 작품의 `entityRevAt`이 N4 전과 바이트 단위로 같은가(업그레이드만으로 `stale` 없음). `assertCommitReady`가 검사 때와 같은 `scopeFor`를 쓰는가. `linkedEvents`가 없는 노드의 요청 digest가 그대로인가. 연결 사건이 이 원고 엔티티(`inScope`) 밖으로 새는가. `linkScope` 끔이 rev를 N4 전 값으로 되돌리는가.

**Files:**
- Create: `core/scope/linked.js`, `test/run/scope-linked.test.js`
- Modify: `core/scope/scope.js`, `core/run/payload.js`

**Interfaces:**
- Consumes: A1 `positions.unorderedBy`, `eventsOn`, `linkedNodeIds`. A2 `features.linkScope`.
- Produces:
  - `linkedScope({ work, events, nodeId }) → { nodeIds, events }`(얼린 빈 값 `NOTHING`을 돌려줄 수 있다 — 고치지 말고 복사해 쓴다). `case 'branching'`이 N7 갈림 자리다.
  - `gatherScope(...)` 결과에 `unorderedBy`, `linkedNodeIds`(복사본 배열), `linkedEvents`(이 원고 `inScope` 엔티티만). `ordered`·`priorEvents`는 그대로.
  - `entityRevAt(...)`: 연결 사건이 있을 때만 `linked` 키를 더한다.
  - 요청 payload: `linkedEvents`가 있을 때만 `linkedEvents: [{ eventId, nodeId, entityId, kind, data }]`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/run/scope-linked.test.js` (137줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { gatherScope, entityRevAt } from '../../core/scope/scope.js';
import { findStale } from '../../core/scope/stale.js';
import { pickNext } from '../../core/run/next.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';
import { createRunner } from '../../core/run/runner.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

/** 노드 파일 앞머리 맨 앞에 links 를 끼운다(작가가 하는 일). 원본 fixture 는 그대로. */
async function addLinks(root, path, targets) {
  const file = join(root, 'tree', path);
  const lines = targets.map((to) => `  - to: ${to}\n`).join('');
  await writeFile(file, (await readFile(file, 'utf8')).replace(/^---\n/, `---\nlinks:\n${lines}`));
}

/** reference-book 복사본 + 사건 몇 개(합성). features 를 주면 work.yaml 에 적는다. */
async function reference(features) {
  const root = await copyFixture('reference-book');
  if (features) {
    const path = join(root, 'work.yaml');
    await writeFile(path, `${await readFile(path, 'utf8')}features:\n${Object.entries(features).map(([k, v]) => `  ${k}: ${v}\n`).join('')}`);
  }
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  const seeds = [
    { nodeId: 'mitochondria', entityId: 'atp', kind: 'term.defined' }, { nodeId: 'nucleus', entityId: 'atp', kind: 'term.redefined' },
    { nodeId: 'cell', entityId: 'cell-membrane', kind: 'term.defined' }, { nodeId: 'mitochondria', entityId: 'mitochondrion', kind: 'term.defined' },
  ];
  for (const [index, seed] of seeds.entries()) await ledger.append({ type: 'event', eventId: `seed-${index + 1}`, receiptId: 'seed', ...seed });
  return { root, work: await openWork(root), events: activeEvents(await ledger.readAll()) };
}

const tag = (e) => `${e.nodeId}:${e.entityId}:${e.kind}`;

test('a none entry gathers the events of the nodes it links to, for its own entities only, apart from priorEvents', async () => {
  const { work, events } = await reference();
  const atp = gatherScope({ work, events, nodeId: 'atp-entry', draftText: 'ATP는 세포막을 지날 때 쓰인다.' });
  assert.deepEqual([atp.ordered, atp.unorderedBy, atp.priorEvents], [false, 'none', []]);
  assert.deepEqual(atp.entityIds, ['atp', 'cell-membrane']);
  assert.deepEqual(atp.linkedNodeIds, ['mitochondria', 'membrane']);
  assert.deepEqual(atp.linkedEvents.map(tag), ['mitochondria:atp:term.defined']);
  const membrane = gatherScope({ work, events, nodeId: 'membrane', draftText: '세포막은 바깥 경계다.' });
  assert.deepEqual([membrane.linkedNodeIds, membrane.linkedEvents.map(tag)], [['cell'], ['cell:cell-membrane:term.defined']]);
  const lonely = gatherScope({ work, events, nodeId: 'nucleus', draftText: 'ATP 이야기는 없다. 세포막도.' });
  assert.deepEqual([lonely.linkedNodeIds, lonely.linkedEvents], [[], []]);
});

test('linkScope off gathers nothing linked and the entity rev is the file and earlier events only', async () => {
  const on = await reference();
  const off = await reference({ linkScope: false });
  const scope = gatherScope({ work: off.work, events: off.events, nodeId: 'atp-entry', draftText: 'ATP.' });
  assert.deepEqual([scope.linkedNodeIds, scope.linkedEvents, scope.unorderedBy], [[], [], 'none']);
  const rev = (w, events) => entityRevAt({ work: w, events, entityId: 'atp', nodeId: 'atp-entry' });
  assert.equal(rev(off.work, off.events), sha256(canonicalJson({ file: off.work.entities.get('atp').rev, events: [] })));
  assert.notEqual(rev(on.work, on.events), rev(off.work, off.events));
  assert.equal(rev(on.work, []), rev(off.work, off.events));
});

test('linear, branching and front/back nodes never gather linked events, even when they link to later nodes', async () => {
  const novel = await copyFixture('novel-3level');
  await seedEvents(novel, 'novel-3level');
  await addLinks(novel, '01-book-one/01-the-fall/01-rooftop.md', ['post-office', 'last-night']);
  const work = await openWork(novel);
  const events = activeEvents(await openLedger(novel, 'events').readAll());
  const first = gatherScope({ work, events, nodeId: 'rooftop-scene', draftText: '붉은 편지를 태웠다. 마라가 웃었다.' });
  assert.deepEqual([first.ordered, first.unorderedBy, first.priorEvents, first.linkedNodeIds, first.linkedEvents], [true, null, [], [], []]);
  const game = await copyFixture('gamebook');
  await seedEvents(game, 'gamebook');
  const gw = await openWork(game);
  const left = gatherScope({ work: gw, events: activeEvents(await openLedger(game, 'events').readAll()), nodeId: 'left-path', draftText: '놋쇠 열쇠' });
  assert.deepEqual([left.unorderedBy, left.linkedNodeIds, left.linkedEvents, left.priorEvents], ['branching', [], [], []]);
  const book = await copyFixture('knowledge-book');
  await addLinks(book, '00-preface.md', ['membranes']);
  const bw = await openWork(book);
  const preface = gatherScope({ work: bw, events: [{ type: 'event', eventId: 'x', seq: 1, nodeId: 'membranes', entityId: 'membrane', kind: 'term.defined' }], nodeId: 'preface', draftText: '세포막' });
  assert.deepEqual([preface.unorderedBy, preface.linkedNodeIds, preface.linkedEvents], ['role', [], []]);
});

test('a linear work keeps the same entity revs whether linkScope is on or off', async () => {
  const root = await copyFixture('novel-3level');
  await seedEvents(root, 'novel-3level');
  await addLinks(root, '02-book-two/01-after/01-funeral.md', ['last-night']);
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const off = { ...work, config: { ...work.config, features: { ...work.config.features, linkScope: false } } };
  for (const nodeId of ['funeral', 'market', 'rooftop-scene']) {
    for (const entityId of ['mara', 'red-letter', 'junho']) assert.equal(entityRevAt({ work, events, entityId, nodeId }), entityRevAt({ work: off, events, entityId, nodeId }), `${nodeId}/${entityId}`);
  }
});

test('a new event on a linked node marks the committed none entry stale; an event on an unlinked node does not', async () => {
  const { root, work, events } = await reference();
  const node = work.tree.nodes.get('atp-entry');
  const scope = gatherScope({ work, events, nodeId: 'atp-entry', draftText: node.body });
  const receipts = openLedger(root, 'receipts');
  await receipts.append({ type: 'receipt', receiptId: 'rcpt-atp', nodeId: 'atp-entry', variant: 'main', draftHash: sha256(node.body), refs: scope.refs });
  await receipts.append({ type: 'commit', receiptId: 'rcpt-atp', nodeId: 'atp-entry', variant: 'main', committedHash: sha256(node.body) });
  const stale = async () => findStale({ work: await openWork(root), receiptRecords: await receipts.readAll(), events: activeEvents(await openLedger(root, 'events').readAll()) });
  assert.deepEqual(await stale(), []);
  const ledger = openLedger(root, 'events');
  await ledger.append({ type: 'event', eventId: 'far', receiptId: 'r', nodeId: 'cell', entityId: 'atp', kind: 'term.redefined' });
  assert.deepEqual(await stale(), []);
  await ledger.append({ type: 'event', eventId: 'near', receiptId: 'r', nodeId: 'mitochondria', entityId: 'atp', kind: 'term.redefined' });
  const marked = await stale();
  assert.deepEqual(marked.map((s) => [s.nodeId, s.reasons.map((r) => `${r.kind}:${r.id}`)]), [['atp-entry', ['entity:atp']]]);
});

test('run next in a none work stays tree order: the first unfinished node, whatever the links say', async () => {
  const root = await copyFixture('reference-book');
  await addLinks(root, '02-part-energy/02-mitochondria.md', ['nucleus', 'cell']);
  const work = await openWork(root);
  assert.equal(pickNext(work, [], []).id, 'cell');
  const receipts = [{ type: 'receipt', receiptId: 'r1', nodeId: 'cell', seq: 1 }, { type: 'commit', receiptId: 'r1', nodeId: 'cell', committedHash: sha256(work.tree.nodes.get('cell').body), seq: 2 }];
  work.tree.nodes.get('cell').status = 'committed';
  assert.equal(pickNext(work, receipts, []).id, 'membrane');
});

test('model requests of a none entry carry linkedEvents; a linear node\'s requests have no such key', async () => {
  const { root } = await reference();
  await useFakePack(root);
  const host = createFakeHost({ drafts: { 'atp-entry': 'ATP는 미토콘드리아가 만든다.' } });
  const critic = (await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, { start: { node: 'atp-entry' }, until: (o) => label(o) === 'model:critic' })).at(-1);
  assert.deepEqual(critic.requests[0].payload.linkedEvents.map(tag), ['mitochondria:atp:term.defined', 'mitochondria:mitochondrion:term.defined']);
  assert.deepEqual(critic.requests[0].payload.priorEvents, []);
  const novel = await copyFixture('novel-3level');
  await seedEvents(novel, 'novel-3level');
  await useFakePack(novel);
  const linear = (await driveToEnd(() => createRunner({ root: novel, packs: fakePacks() }), createFakeHost(), { start: { node: 'funeral' }, until: (o) => label(o) === 'model:critic' })).at(-1);
  assert.equal(Object.hasOwn(linear.requests[0].payload, 'linkedEvents'), false);
  assert.ok(linear.requests[0].payload.priorEvents.length > 0);
});
````

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test test/run/scope-linked.test.js`
Expected: FAIL 5개 — 1·2·3·5·7번(`linkedEvents`·`linkedNodeIds`가 `undefined`, 연결 사건이 rev에 없음, payload에 `linkedEvents` 없음). 4번(`a linear work keeps the same entity revs ...`)과 6번(`run next in a none work stays tree order ...`)은 지금 동작을 고정하는 테스트라 이미 통과한다.

- [ ] **Step 3: 구현한다**

`core/scope/linked.js` (28줄):

````js
import { eventsOn } from '../ledger/events.js';
import { linkedNodeIds } from '../links/graph.js';

const NOTHING = Object.freeze({ nodeIds: Object.freeze([]), events: Object.freeze([]) });

/**
 * 순서 밖 노드의 앞쪽 범위(정본 §10 끝): "앞선 모든 사건" 대신 "연결된 노드의 사건"(N4).
 * 읽는 순서 까닭(positions 의 unorderedBy)에 따라 갈린다.
 * - 'none': 이 노드의 links 가 가리키는 있는 노드(한 단계, 자기 자신 제외)의 사건.
 * - 'branching': N7 이 경로별로 정한다. 지금은 모으지 않는다(갈림 자리 — 이 case 만 바꾼다).
 * - null(읽는 순서 안)·'role'(front·back): 모으지 않는다. 앞 사건은 eventsBefore 몫이다.
 * linkScope 기능이 꺼지면 모으지 않는다. 결과는 priorEvents 와 섞지 않는다 — 앞뒤를 따지는 검사가 연결 사건을 "앞"으로 읽지 못하게.
 * @param {{ work: any, events: any[], nodeId: string }} input
 * @returns {{ nodeIds: readonly string[], events: readonly any[] }}
 */
export function linkedScope({ work, events, nodeId }) {
  if (!work.config?.features?.linkScope) return NOTHING;
  switch (work.positions.get(nodeId)?.unorderedBy ?? null) {
    case 'none': {
      const nodeIds = linkedNodeIds(work, nodeId);
      return { nodeIds, events: eventsOn({ events, positions: work.positions, nodeIds }) };
    }
    case 'branching':
      return NOTHING; // N7: 경로별 범위가 이 자리를 채운다.
    default:
      return NOTHING;
  }
}
````

`core/scope/scope.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/scope/scope.js b/core/scope/scope.js
index 3c3b68d..3d82942 100644
--- a/core/scope/scope.js
+++ b/core/scope/scope.js
@@ -5,6 +5,7 @@ import { eventsBefore } from '../ledger/events.js';
 import { scanMentions } from '../index/scan.js';
 import { canonicalJson, sha256 } from '../util/hash.js';
 import { PROMISE_KIND } from '../promise.js';
+import { linkedScope } from './linked.js';

 const uniqueSorted = (ids) => [...new Set(ids)].sort();

@@ -15,11 +16,17 @@ const uniqueSorted = (ids) => [...new Set(ids)].sort();
  */
 const prerequisitesOf = (entity) => (Array.isArray(entity?.data?.prerequisites) ? entity.data.prerequisites.filter((id) => typeof id === 'string') : []);

-/** 엔티티 파일 + 이 노드보다 앞선 그 엔티티의 사건. 뒤쪽 방향 전파의 기준값이다. */
+const eventKey = (e) => [e.eventId, e.kind, e.data ?? null];
+
+/**
+ * 엔티티 파일 + 이 노드보다 앞선 그 엔티티의 사건. 뒤쪽 방향 전파의 기준값이다.
+ * 순서 없는(none) 노드는 연결된 노드의 그 엔티티 사건(linkedScope)도 넣는다 — 있을 때만 키를 더해, 연결 사건이 없는 노드의 값은 N4 전과 같다.
+ */
 export function entityRevAt({ work, events, entityId, nodeId }) {
   const before = eventsBefore({ events, positions: work.positions, nodeId });
-  const relevant = before.events.filter((e) => e.entityId === entityId).map((e) => [e.eventId, e.kind, e.data ?? null]);
-  return sha256(canonicalJson({ file: work.entities.get(entityId)?.rev ?? null, events: relevant }));
+  const relevant = before.events.filter((e) => e.entityId === entityId).map(eventKey);
+  const linked = linkedScope({ work, events, nodeId }).events.filter((e) => e.entityId === entityId).map(eventKey);
+  return sha256(canonicalJson({ file: work.entities.get(entityId)?.rev ?? null, events: relevant, ...(linked.length ? { linked } : {}) }));
 }

 /**
@@ -52,6 +59,9 @@ export function gatherScope({ work, events, nodeId, draftText = '', extracted =
   const inScope = new Set(scopedIds);
   if (work.config?.features?.promiseScope) for (const e of work.entities.values()) if (e.kind === PROMISE_KIND) inScope.add(e.id);
   const priorEvents = before.events.filter((e) => inScope.has(e.entityId));
+  // 순서 없는 노드(N4): 연결된 노드의 사건. priorEvents 와 따로 둔다 — 앞뒤 판정(ordered)과 core.promise-order 는 이것을 보지 않는다.
+  const linked = linkedScope({ work, events, nodeId });
+  const linkedEvents = linked.events.filter((e) => inScope.has(e.entityId));
   const ancestors = ancestorsOf(work.tree, nodeId);
   const ancestorIds = new Set(ancestors.map((a) => a.id));
   const upperPlans = ancestors.filter((a) => a.body.trim())
@@ -79,7 +89,8 @@ export function gatherScope({ work, events, nodeId, draftText = '', extracted =
   ];
   const parent = upperPlans.find((p) => p.nodeId === node.parentId);
   return {
-    nodeId, ordered: before.applicable, appearances, entityIds, prerequisiteIds, priorEvents, upperPlans,
+    nodeId, ordered: before.applicable, unorderedBy: work.positions.get(nodeId)?.unorderedBy ?? null,
+    appearances, entityIds, prerequisiteIds, priorEvents, linkedNodeIds: [...linked.nodeIds], linkedEvents, upperPlans,
     parentPlan: parent?.text ?? null, upperMentions, assets, sources, claims, refs,
   };
 }
````

`core/run/payload.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/run/payload.js b/core/run/payload.js
index 711244b..7620ea0 100644
--- a/core/run/payload.js
+++ b/core/run/payload.js
@@ -17,6 +17,8 @@ const sourceView = ({ id, title, date, reliability, spans }) => ({
   id, title, date, reliability, spans: spans.map((span) => ({ id: span?.id ?? null, quote: span?.quote ?? null })),
 });

+const eventView = ({ eventId, nodeId, entityId, kind, data }) => ({ eventId, nodeId, entityId, kind, data: data ?? null });
+
 /** 호스트에 넘기는 공통 재료. 검토 결과(advisory)는 넣지 않는다 — 참고 의견은 자동 수정 사유가 아니다. */
 export function basePayload(ctx, run, step, scope = scopeFor(ctx, run)) {
   const { work } = ctx;
@@ -33,7 +35,9 @@ export function basePayload(ctx, run, step, scope = scopeFor(ctx, run)) {
       const entity = work.entities.get(id);
       return { id, kind: entity.kind, name: entity.name, aliases: entity.aliases, body: entity.body };
     }),
-    priorEvents: scope.priorEvents.map(({ eventId, nodeId, entityId, kind, data }) => ({ eventId, nodeId, entityId, kind, data: data ?? null })),
+    priorEvents: scope.priorEvents.map(eventView),
+    // 순서 없는 노드(N4)의 연결된 노드 사건. 있을 때만 싣는다 — 없는 노드의 요청(과 그 digest)은 N4 전과 같다.
+    ...(scope.linkedEvents.length ? { linkedEvents: scope.linkedEvents.map(eventView) } : {}),
     sources: work.config.features.sources ? scope.sources.map(sourceView) : [],
     children: node.children.map((id) => {
       const child = work.tree.nodes.get(id);
````

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test test/run/scope-linked.test.js`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: 1046/1046(+7). 기존 범위·payload·요청 digest 테스트가 그대로 초록이어야 한다(linear fixture에는 `linkedEvents`가 없다).

- [ ] **Step 6: 커밋**

```bash
git add core/scope/linked.js core/scope/scope.js core/run/payload.js test/run/scope-linked.test.js
git commit -m "feat(scope): unordered nodes gather the events of linked nodes (linkedEvents)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task A4: `requiresOrder: none`은 순서 없는 노드에만 해당한다

> **리뷰: 가장 강한 모델. 공격해 볼 것** — 공격 목록 1·3·5·6. 순서 없는 노드에서 `core.promise-order`가 `passed`·`failed`가 되게 만들어 본다(연결 노드에 심기 사건). linear 노드가 뒤 노드(심는 노드)를 링크해 해소를 통과시켜 본다 — `PROMISE_RESOLVED_BEFORE_PLANT` hard, 승인 불가여야 한다. 팩이 `core.promise-order`를 다시 선언하거나 작가가 `checks.core.promise-order.requiresOrder`를 적어 본다(`PACK_CHECK_ID_RESERVED`, `CHECK_FIELD_UNKNOWN`, `LOCKED_CHECK_OVERRIDE`). `requiresOrder` 없는 hard 검사가 순서 없는 노드에서 그대로 막는가. `stamp`·영수증 형식이 그대로인가.

**Files:**
- Create: `test/run/order-none-checks.test.js`
- Modify: `core/pack/yaml-schema.js`(`REQUIRES_ORDER`), `core/checks/run-checks.js`(`applicability` 한 줄과 주석)

**Interfaces:**
- Consumes: A3 검사 ctx의 `unorderedBy`(`checkContext`가 scope를 펼쳐 넘긴다).
- Produces:
  - `pack.yaml` 검사 `requiresOrder: linear | none`(그 밖은 `PACK_FIELD_INVALID`). N7이 `branching`을 끝에 더한다.
  - `applicability(check, ctx)`: `none`이면 `ctx.unorderedBy === 'none'`에서만 `applicable`. `linear` 줄은 그대로.
  - `core.promise-order`는 `core/checks/builtin.js`에서 `requiresOrder: 'linear'`, `locked`, hard 그대로(안 고침).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/run/order-none-checks.test.js` (121줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPackSpec } from '../../core/pack/yaml-schema.js';
import { applicability, runDeterministicChecks } from '../../core/checks/run-checks.js';
import { PROMISE_ORDER_CHECK } from '../../core/checks/builtin.js';
import { gatherScope } from '../../core/scope/scope.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { createRunner } from '../../core/run/runner.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const spec = (requiresOrder) => ({ name: 'demo', checks: { 'demo.x': { tier: 'deterministic', stage: 'facts', severity: 'advisory', run: 'x', requiresOrder } } });

test('pack.yaml requiresOrder takes linear or none; anything else is PACK_FIELD_INVALID', () => {
  for (const value of ['linear', 'none', undefined]) assert.deepEqual(readPackSpec(spec(value)).errors, [], String(value));
  for (const value of ['branching', 'NONE', 'None', ' none', '', true, ['none'], null]) {
    assert.deepEqual(readPackSpec(spec(value)).errors, [{ code: 'PACK_FIELD_INVALID', path: 'checks.demo.x.requiresOrder' }], String(value));
  }
});

test('requiresOrder none applies only where the node is unordered by none; linear only where it is ordered', () => {
  const none = { requiresOrder: 'none' };
  const linear = { requiresOrder: 'linear' };
  const at = (ordered, unorderedBy) => ({ ordered, unorderedBy });
  assert.equal(applicability(none, at(false, 'none')), 'applicable');
  for (const ctx of [at(false, 'branching'), at(false, 'role'), at(true, null), {}]) assert.equal(applicability(none, ctx), 'not_applicable', JSON.stringify(ctx));
  for (const ctx of [at(false, 'none'), at(false, 'branching'), at(false, 'role'), {}]) assert.equal(applicability(linear, ctx), 'not_applicable', JSON.stringify(ctx));
  assert.equal(applicability(linear, at(true, null)), 'applicable');
  assert.ok(Object.isFrozen(PROMISE_ORDER_CHECK));
  assert.deepEqual([PROMISE_ORDER_CHECK.requiresOrder, PROMISE_ORDER_CHECK.severity, PROMISE_ORDER_CHECK.locked], ['linear', 'hard', true]);
});

/** reference-book 복사본에 약속 엔티티 하나와 연결된 노드(mitochondria)의 심기 사건을 넣는다. */
async function referenceWithPromise() {
  const root = await copyFixture('reference-book');
  await mkdir(join(root, 'entities', 'promise'), { recursive: true });
  await writeFile(join(root, 'entities', 'promise', 'later.md'), '---\nid: later\nkind: promise\nname: 뒤에서\n---\n');
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  await ledger.append({ type: 'event', eventId: 'seed-1', receiptId: 'seed', nodeId: 'mitochondria', entityId: 'later', kind: 'promise.planted' });
  await ledger.append({ type: 'event', eventId: 'seed-2', receiptId: 'seed', nodeId: 'mitochondria', entityId: 'atp', kind: 'term.defined' });
  return root;
}

const ctxFor = async (root, nodeId, draft, draftEvents) => {
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const scope = gatherScope({ work, events, nodeId, draftText: draft });
  return { ...scope, work, node: work.tree.nodes.get(nodeId), draft, draftEvents: draftEvents.map((e, i) => ({ ...e, eventId: `draft-${i + 1}`, nodeId })) };
};

test('core.promise-order stays not applicable on a none entry even when a linked node planted the promise', async () => {
  const root = await referenceWithPromise();
  const ctx = await ctxFor(root, 'atp-entry', '뒤에서 말한 ATP를 이제 설명한다.', [{ entityId: 'later', kind: 'promise.resolved' }]);
  assert.deepEqual(ctx.linkedEvents.map((e) => `${e.nodeId}:${e.entityId}:${e.kind}`), ['mitochondria:later:promise.planted', 'mitochondria:atp:term.defined']);
  assert.deepEqual(ctx.priorEvents, []);
  assert.deepEqual(runDeterministicChecks([PROMISE_ORDER_CHECK], ctx), [{ checkId: 'core.promise-order', status: 'not_applicable', findings: [] }]);
});

test('a linear node linking to the later node that plants a promise still fails core.promise-order: links never count as earlier', async () => {
  const root = await copyFixture('novel-3level');
  await seedEvents(root, 'novel-3level');
  const file = join(root, 'tree', '01-book-one', '01-the-fall', '02-stairwell.md');
  await writeFile(file, (await readFile(file, 'utf8')).replace(/^---\n/, '---\nlinks:\n  - to: post-office\n'));
  const ctx = await ctxFor(root, 'stairwell', '붉은 편지의 주인을 밝혔다.', [{ entityId: 'red-letter', kind: 'promise.resolved' }]);
  assert.deepEqual([ctx.ordered, ctx.linkedEvents], [true, []]);
  const [result] = runDeterministicChecks([PROMISE_ORDER_CHECK], ctx);
  assert.deepEqual([result.status, result.findings.map((f) => [f.code, f.severity])], ['failed', [['PROMISE_RESOLVED_BEFORE_PLANT', 'hard']]]);
});

/** 가짜 팩 + 순서 없는 노드에서만 도는 검사(연결 사건을 알린다)와 어디서나 도는 hard 검사. */
function packsWithOrderChecks() {
  const linkedSeen = {
    id: 'fake.linked-seen', tier: 'deterministic', stage: 'facts', severity: 'advisory', requiresOrder: 'none', origin: 'pack',
    run: (ctx) => ctx.linkedEvents.map((e) => ({ code: 'LINKED_SEEN', message: `${e.nodeId}:${e.entityId}` })),
  };
  const noGhost = {
    id: 'fake.no-ghost', tier: 'deterministic', stage: 'facts', severity: 'hard', origin: 'pack',
    run: (ctx) => (String(ctx.draft).includes('유령') ? [{ code: 'GHOST', message: 'ghost in the draft', quote: '유령' }] : []),
  };
  const basic = fakePack.checkSets['fake.basic'];
  const pack = {
    ...fakePack, checks: [...fakePack.checks, linkedSeen, noGhost],
    checkSets: { ...fakePack.checkSets, 'fake.basic': { ...basic, checks: [...basic.checks, 'fake.linked-seen', 'fake.no-ghost'] } },
  };
  return new Map([['fake', pack]]);
}

test('on a none entry the receipt keeps order checks not applicable, runs the none-only check, and a hard check still blocks', async () => {
  const root = await referenceWithPromise();
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const packs = packsWithOrderChecks();
  const makeRunner = () => createRunner({ root, packs });
  const host = createFakeHost({ drafts: { 'atp-entry': 'ATP 항목.', cell: '유령 같은 세포.' } });
  await driveToEnd(makeRunner, host, { start: { node: 'atp-entry' }, until: (o) => o.status === 'done' });
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'atp-entry');
  assert.deepEqual(receipt.order, { mode: 'none', ordered: false });
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.deepEqual(facts.checks.map((c) => [c.checkId, c.status, c.findings.map((f) => f.message)]).sort(), [
    ['core.promise-order', 'not_applicable', []], ['fake.dead-on-stage', 'not_applicable', []], ['fake.defined-before-use', 'not_applicable', []],
    ['fake.linked-seen', 'passed', ['mitochondria:later', 'mitochondria:atp']], ['fake.no-ghost', 'passed', []],
  ]);
  const blocked = (await driveToEnd(makeRunner, host, { start: { node: 'cell' }, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.equal(label(blocked), 'user:blocked');
  assert.deepEqual([blocked.question.canApprove, blocked.question.blocking.map((f) => [f.code, f.severity])], [false, [['GHOST', 'hard']]]);
});

test('on a linear node the none-only check is not applicable', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const packs = packsWithOrderChecks();
  await driveToEnd(() => createRunner({ root, packs }), createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'stairwell');
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.deepEqual(facts.checks.filter((c) => c.checkId === 'fake.linked-seen' || c.checkId === 'core.promise-order').map((c) => [c.checkId, c.status]).sort(),
    [['core.promise-order', 'passed'], ['fake.linked-seen', 'not_applicable']]);
});
````

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test test/run/order-none-checks.test.js`
Expected: FAIL 3개 — `pack.yaml requiresOrder takes linear or none ...`(`none`이 `PACK_FIELD_INVALID`), `requiresOrder none applies only where the node is unordered by none ...`, `on a linear node the none-only check is not applicable`. promise-order 공격 두 개와 영수증 테스트는 지금도 통과한다(잠금이 이미 그렇게 동작함을 고정한다 — 약화되면 여기서 잡힌다).

- [ ] **Step 3: 구현한다**

`core/pack/yaml-schema.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/pack/yaml-schema.js b/core/pack/yaml-schema.js
index 3853866..9cda604 100644
--- a/core/pack/yaml-schema.js
+++ b/core/pack/yaml-schema.js
@@ -12,6 +12,8 @@ const CHECK = ['title', 'description', 'tier', 'stage', 'severity', 'requiresOrd
 const SET = ['title', 'description', 'checks', 'recommendedFor'];
 const RECOMMEND = ['kinds', 'levels', 'roles', 'positions'];
 const PRESET = ['title', 'description', 'levels', 'order', 'checkSets'];
+/** requiresOrder 값: linear(읽는 순서 안에서만), none(순서 없는 노드에서만, N4). branching 은 N7 이 더한다. */
+const REQUIRES_ORDER = ['linear', 'none'];
 const STEP_ID = /^[a-z][a-z0-9-]*$/;
 /** 세트·검사·프리셋 id: 점으로 이은 소문자 조각. __proto__ 같은 이름은 데이터로도 받지 않는다. */
 const SAFE_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;
@@ -85,7 +87,7 @@ function readCheck(id, check, push) {
   // 잠긴 코어 stage(facts)는 결정론 단계다. 모델 검사를 거기 두면 resolve 때 CHECK_TIER_MISMATCH 로 거부된다 — 로드 때 알린다(M3 C3).
   else if (check.tier === 'model' && LOCKED_STAGES.includes(check.stage)) push('PACK_FIELD_INVALID', `${at}.stage`);
   if (!FINDING_SEVERITIES.includes(check.severity)) push('PACK_FIELD_INVALID', `${at}.severity`);
-  if (check.requiresOrder !== undefined && check.requiresOrder !== 'linear') push('PACK_FIELD_INVALID', `${at}.requiresOrder`);
+  if (check.requiresOrder !== undefined && !REQUIRES_ORDER.includes(check.requiresOrder)) push('PACK_FIELD_INVALID', `${at}.requiresOrder`);
   for (const flag of ['requiresParentPlan', 'requireQuote', 'experimental']) {
     if (check[flag] !== undefined && typeof check[flag] !== 'boolean') push('PACK_FIELD_INVALID', `${at}.${flag}`);
   }
````

`core/checks/run-checks.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/checks/run-checks.js b/core/checks/run-checks.js
index 3156180..3075428 100644
--- a/core/checks/run-checks.js
+++ b/core/checks/run-checks.js
@@ -4,8 +4,13 @@ import { parseJsonAnswer } from '../run/answers.js';
 const SAME_HOST = Object.freeze({ sameHost: true, independent: false });
 const ANSWER_FORMAT = '{"checked":["<checkId>", ...],"findings":[{"checkId":"<id>","code":"<CODE>","message":"<why>","quote":"<verbatim text from the draft>"}]}';

+/**
+ * 검사가 이 노드에 해당하는가. requiresOrder: linear 는 읽는 순서 안(ordered)에서만, none 은 순서 없는(none) 노드에서만(N4, ctx.unorderedBy).
+ * 해당 없음은 실패가 아니라 영수증에 not_applicable 로 남는다. core.promise-order(linear)는 순서 밖 노드에서 늘 해당 없음이다.
+ */
 export function applicability(check, ctx) {
   if (check.requiresOrder === 'linear' && !ctx.ordered) return 'not_applicable';
+  if (check.requiresOrder === 'none' && ctx.unorderedBy !== 'none') return 'not_applicable';
   if (check.requiresParentPlan && !ctx.parentPlan) return 'not_applicable';
   return 'applicable';
 }
````

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test test/run/order-none-checks.test.js`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: 1052/1052(+6).

- [ ] **Step 6: 커밋**

```bash
git add core/pack/yaml-schema.js core/checks/run-checks.js test/run/order-none-checks.test.js
git commit -m "feat(checks): requiresOrder none applies only to unordered nodes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task A5: 팩이 `scopeFields`로 켤 때만 선수 개념을 읽는다 (N1 미룬 minor)

> **리뷰: 가장 강한 모델. 공격해 볼 것** — 공격 목록 11·12. `scopeFields`에 모르는 필드·`__proto__`·문자열이 아닌 값·목록 아닌 값을 넣어 본다(`PACK_FIELD_INVALID`, 중복은 한 번으로 줄인다). 지식 팩 없이(소설·브랜드) `data.prerequisites`를 가진 엔티티가 범위를 넓히는가 — 넓히면 안 된다. 지식 팩 작품의 범위·요청 digest가 N4 전과 같은가. `scopeFields`를 안 적은 팩의 팩 객체·digest가 그대로인가(키를 넣지 않는다). `registryDigest`가 `scopeFields` 변경에 반응하는가(팩 객체의 `scopeFields` 키와 선언 digest가 둘 다 든다).

**Files:**
- Create: `core/scope/fields.js`, `test/run/scope-fields.test.js`
- Modify: `core/pack/yaml-schema.js`(최상위 `scopeFields`), `core/pack/yaml-pack.js`, `core/pack/registry.js`, `core/scope/scope.js`, `core/run/payload.js`, `packs/knowledge/pack.yaml`, `test/run/scope-prerequisites.test.js`

**Interfaces:**
- Consumes: N1 `prerequisitesOf`(scope.js 안, 그대로).
- Produces:
  - `SCOPE_FIELDS = ['prerequisites']`(코어가 아는 범위 필드. 뒤에 더할 때는 끝에).
  - `pack.yaml` 최상위 `scopeFields: [prerequisites]`(선택). 팩 객체에 적었을 때만 `scopeFields` 키.
  - `resolvePacks(...).scopeFields`: `SCOPE_FIELDS` 차례로, 어느 팩이든 켠 것.
  - `gatherScope({ ..., scopeFields = [] })`: `'prerequisites'`가 있을 때만 `prerequisiteIds`를 채운다. `scopeFor`가 `ctx.registry?.scopeFields ?? []`를 넘긴다.

`test/run/scope-prerequisites.test.js`는 `gatherScope`를 바로 부르므로 `scopeFields: ['prerequisites']`를 더한다(같은 단언, 인자만 더함 — 약화 아님).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/run/scope-prerequisites.test.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/test/run/scope-prerequisites.test.js b/test/run/scope-prerequisites.test.js
index dde1d1d..f234928 100644
--- a/test/run/scope-prerequisites.test.js
+++ b/test/run/scope-prerequisites.test.js
@@ -19,10 +19,10 @@ test('gatherScope adds the prerequisites of entities named by this draft\'s even
   const work = await openWork(root);
   const events = activeEvents(await ledger.readAll());
   const draftText = '세포막은 바깥 경계다.';
-  const plain = gatherScope({ work, events, nodeId: 'membranes', draftText });
+  const plain = gatherScope({ work, events, nodeId: 'membranes', draftText, scopeFields: ['prerequisites'] });
   assert.deepEqual([plain.entityIds, plain.prerequisiteIds, plain.priorEvents.length], [['membrane'], [], 0]);
   const extracted = { events: [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 바깥 경계다' }], appearances: [], mentions: [] };
-  const scope = gatherScope({ work, events, nodeId: 'membranes', draftText, extracted });
+  const scope = gatherScope({ work, events, nodeId: 'membranes', draftText, extracted, scopeFields: ['prerequisites'] });
   assert.deepEqual(scope.entityIds, ['membrane']);
   assert.deepEqual(scope.prerequisiteIds, ['cell']);
   assert.deepEqual(scope.priorEvents.map((e) => `${e.nodeId}:${e.entityId}:${e.kind}`), ['what-is-a-cell:cell:term.defined']);
@@ -41,7 +41,7 @@ test('a leaf committed with a prerequisite in scope goes stale when the prerequi
   const events = activeEvents(await ledger.readAll());
   const draftText = work.tree.nodes.get('membranes').body;
   const extracted = { events: [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 바깥 경계다' }], appearances: [], mentions: [] };
-  const scope = gatherScope({ work, events, nodeId: 'membranes', draftText, extracted });
+  const scope = gatherScope({ work, events, nodeId: 'membranes', draftText, extracted, scopeFields: ['prerequisites'] });
   // membranes 본문이 "ATP"도 언급해 atp 도 entityIds 에 들어간다 — cell 은 entityIds 가 아니라 prerequisiteIds 로만 들어간다.
   assert.deepEqual(scope.refs.filter((r) => r.kind === 'entity').map((r) => r.id), ['atp', 'cell', 'membrane']);

````

`test/run/scope-fields.test.js` (65줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPackSpec } from '../../core/pack/yaml-schema.js';
import { SCOPE_FIELDS } from '../../core/scope/fields.js';
import { gatherScope } from '../../core/scope/scope.js';
import { openWork } from '../../core/store/work.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { activeEvents } from '../../core/ledger/events.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const DEFINES_MEMBRANE = { events: [{ entityId: 'membrane', kind: 'term.defined', quote: '세포막은 바깥 경계다' }], appearances: [], mentions: [] };

/** knowledge-book 복사본: 세포막의 선수 개념이 세포이고, 앞 절(what-is-a-cell)이 세포를 정의했다. */
async function bookWithPrerequisite() {
  const root = await copyFixture('knowledge-book');
  await writeFile(join(root, 'entities', 'term', 'cell.md'), '---\nid: cell\nkind: term\nname: 세포\n---\n');
  await writeFile(join(root, 'entities', 'term', 'membrane.md'), '---\nid: membrane\nkind: term\nname: 세포막\nprerequisites: [cell]\n---\n');
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  await ledger.append({ type: 'event', eventId: 'seed-1', receiptId: 'seed', nodeId: 'what-is-a-cell', entityId: 'cell', kind: 'term.defined' });
  return root;
}

test('without a pack that turns prerequisites on, the core scope does not read them', async () => {
  const root = await bookWithPrerequisite();
  const work = await openWork(root);
  const events = activeEvents(await openLedger(root, 'events').readAll());
  const input = { work, events, nodeId: 'membranes', draftText: '세포막은 바깥 경계다.', extracted: DEFINES_MEMBRANE };
  const off = gatherScope(input);
  assert.deepEqual([off.prerequisiteIds, off.priorEvents, off.refs.filter((r) => r.kind === 'entity').map((r) => r.id)], [[], [], ['membrane']]);
  const on = gatherScope({ ...input, scopeFields: SCOPE_FIELDS });
  assert.deepEqual([on.prerequisiteIds, on.priorEvents.map((e) => e.entityId), on.refs.filter((r) => r.kind === 'entity').map((r) => r.id)], [['cell'], ['cell'], ['cell', 'membrane']]);
});

test('pack.yaml scopeFields takes only fields the core knows; the registry keeps the fields some pack turned on', async () => {
  assert.deepEqual(SCOPE_FIELDS, ['prerequisites']);
  assert.deepEqual(readPackSpec({ name: 'demo', scopeFields: ['prerequisites', 'prerequisites'] }).spec.scopeFields, ['prerequisites']);
  assert.equal(Object.hasOwn(readPackSpec({ name: 'demo' }).spec, 'scopeFields'), false);
  for (const bad of [['avoid'], 'prerequisites', [1], {}, ['__proto__']]) {
    assert.deepEqual(readPackSpec({ name: 'demo', scopeFields: bad }).errors, [{ code: 'PACK_FIELD_INVALID', path: 'scopeFields' }], JSON.stringify(bad));
  }
  const packs = await loadBuiltinPacks();
  assert.deepEqual(packs.get('knowledge').scopeFields, ['prerequisites']);
  for (const name of ['novel', 'sources', 'brand']) assert.equal(Object.hasOwn(packs.get(name), 'scopeFields'), false, name);
  assert.deepEqual((await openWorkspace(await copyFixture('knowledge-book'), { packs })).registry.scopeFields, ['prerequisites']);
  assert.deepEqual((await openWorkspace(await copyFixture('serial-2level'), { packs })).registry.scopeFields, []);
});

test('a run widens the scope by prerequisites under the knowledge pack only', async () => {
  const critic = async (packs, fake) => {
    const root = await bookWithPrerequisite();
    if (fake) await useFakePack(root);
    else await writeFile(join(root, 'work.yaml'), (await readFile(join(root, 'work.yaml'), 'utf8')).replace('checkSets: []', 'checkSets: [knowledge.basic]'));
    const host = createFakeHost({ drafts: { membranes: '세포막은 바깥 경계다.' }, events: { membranes: DEFINES_MEMBRANE } });
    const trail = await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'membranes' }, until: (o) => label(o) === 'model:critic' });
    return trail.at(-1).requests[0].payload.priorEvents.map((e) => `${e.nodeId}:${e.entityId}`);
  };
  assert.deepEqual(await critic(await loadBuiltinPacks(), false), ['what-is-a-cell:cell']);
  assert.deepEqual(await critic(fakePacks(), true), []);
});
````

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test test/run/scope-prerequisites.test.js test/run/scope-fields.test.js`
Expected: FAIL — `scope-fields.test.js`가 `ERR_MODULE_NOT_FOUND`(`core/scope/fields.js` 없음). `scope-prerequisites.test.js` 2개는 통과한다(지금은 인자를 무시하고 늘 읽는다).

- [ ] **Step 3: 구현한다**

`core/scope/fields.js` (6줄):

````js
/**
 * 팩이 pack.yaml scopeFields 로 켜는 엔티티 필드(N4 — N1 미룬 minor "scope.js 가 모든 팩의 prerequisites 를 읽음").
 * 코어는 필드의 뜻을 모른다. 켠 팩이 작품에 있을 때만 그 필드의 엔티티 id 로 검사 범위를 한 단계 넓힌다.
 * - prerequisites: 이 원고의 사건이 가리키는 엔티티의 data.prerequisites(선수 개념, 지식 책 팩)
 */
export const SCOPE_FIELDS = Object.freeze(['prerequisites']);
````

`core/pack/yaml-schema.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/pack/yaml-schema.js b/core/pack/yaml-schema.js
index 9cda604..45da6d3 100644
--- a/core/pack/yaml-schema.js
+++ b/core/pack/yaml-schema.js
@@ -2,10 +2,11 @@ import { FINDING_SEVERITIES } from '../ledger/receipts.js';
 import { CHECK_TIERS, LOCKED_STAGES, MAX_LOOP, STEP_KINDS, STEP_MODES } from '../pipeline/define.js';
 import { validateWorkConfig } from '../work/config.js';
 import { isPlainObject } from '../util/plain.js';
+import { SCOPE_FIELDS } from '../scope/fields.js';

 const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
 const str = (value) => (typeof value === 'string' ? value : '');
-const TOP = ['name', 'version', 'title', 'description', 'presets', 'pipelines', 'prompts', 'checks', 'checkSets', 'defaultCheckSets'];
+const TOP = ['name', 'version', 'title', 'description', 'presets', 'pipelines', 'prompts', 'checks', 'checkSets', 'defaultCheckSets', 'scopeFields'];
 const STEP = ['id', 'kind', 'tier', 'stage', 'produces', 'requires', 'loop', 'mode'];
 const PRODUCES = ['plan', 'draft', 'events', 'children'];
 const CHECK = ['title', 'description', 'tier', 'stage', 'severity', 'requiresOrder', 'requiresParentPlan', 'requireQuote', 'experimental', 'config', 'instruction', 'run'];
@@ -197,12 +198,21 @@ export function readPackSpec(raw) {
     else push('PACK_FIELD_INVALID', 'defaultCheckSets');
   }
   const presets = readPresets(raw.presets, push);
+  // scopeFields(N4): 검사 범위를 넓히는 엔티티 필드. 코어가 아는 것(SCOPE_FIELDS)만. 적지 않으면 spec 에 키가 없다.
+  let scopeFields = null;
+  if (raw.scopeFields !== undefined) {
+    if (isStringList(raw.scopeFields) && raw.scopeFields.every((field) => SCOPE_FIELDS.includes(field))) scopeFields = [...new Set(raw.scopeFields)];
+    else push('PACK_FIELD_INVALID', 'scopeFields');
+  }
   // 프리셋은 첫 팩 몫이다. 단계가 없는 팩(둘째 팩)의 프리셋은 쓸 수 없다(N2 미룬 minor — initWork packPresets 와 같은 기준).
   if (pipelines === undefined && Object.keys(presets).length > 0) push('PACK_FIELD_INVALID', 'presets');
   memberErrors(raw.name, checks, checkSets, push);
   const files = [...new Set([...Object.values(prompts), ...checks.filter((c) => typeof c.instruction === 'string').map((c) => c.instruction)])].sort();
   return {
-    spec: { name: raw.name, version: raw.version ?? 1, title: str(raw.title), description: str(raw.description), presets, pipelines, prompts, checks, checkSets, defaultCheckSets },
+    spec: {
+      name: raw.name, version: raw.version ?? 1, title: str(raw.title), description: str(raw.description), presets, pipelines, prompts, checks, checkSets, defaultCheckSets,
+      ...(scopeFields ? { scopeFields } : {}),
+    },
     files, errors,
   };
 }
````

`core/pack/yaml-pack.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/pack/yaml-pack.js b/core/pack/yaml-pack.js
index 95bea5f..db22bd2 100644
--- a/core/pack/yaml-pack.js
+++ b/core/pack/yaml-pack.js
@@ -48,6 +48,7 @@ function assemble(spec, texts, checkers, yamlText, modules) {
   const pack = {
     name: spec.name, version: spec.version, title: spec.title, description: spec.description, presets: spec.presets,
     pipelines: spec.pipelines, checks, checkSets: spec.checkSets, defaultCheckSets: spec.defaultCheckSets, prompts,
+    ...(spec.scopeFields ? { scopeFields: spec.scopeFields } : {}),
     /** 팩 프롬프트는 요청 재료에 instructions 로 얹는다(요청 digest 는 얹기 전 재료로 만든다 — core/run/payload.js). */
     prompt(step, payload) {
       const key = `${payload?.node?.kind}.${step?.id}`;
````

`core/pack/registry.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/pack/registry.js b/core/pack/registry.js
index 3f3fa3c..5a71d48 100644
--- a/core/pack/registry.js
+++ b/core/pack/registry.js
@@ -1,6 +1,7 @@
 import { FolioError } from '../errors.js';
 import { validatePack } from './validate.js';
 import { registryDigest } from './digest.js';
+import { SCOPE_FIELDS } from '../scope/fields.js';

 /** 팩 하나가 코어 규칙에 맞지 않으면 첫 오류 코드로 던진다. 전체 목록은 details.errors. */
 function assertValid(pack) {
@@ -47,6 +48,8 @@ export function resolvePacks(names, available) {
     checkSets,
     // work.yaml 에 checkSets 키가 없을 때 쓰는 기본 세트(팩 순서대로, 중복 없이).
     defaultCheckSets: [...new Set(packs.flatMap((pack) => pack.defaultCheckSets ?? []))],
+    // 검사 범위를 넓히는 엔티티 필드(N4): 어느 팩이든 켠 것, 코어가 아는 것만(SCOPE_FIELDS 차례). 켠 팩이 없으면 빈 목록.
+    scopeFields: SCOPE_FIELDS.filter((field) => packs.some((pack) => Array.isArray(pack.scopeFields) && pack.scopeFields.includes(field))),
     // 팩 내용이 바뀌면 파이프라인 digest 가 바뀐다(열린 실행은 검사부터 다시, 옛 영수증은 커밋 못 함).
     digest: registryDigest(packs),
   };
````

`core/scope/scope.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/scope/scope.js b/core/scope/scope.js
index 3d82942..9d89f9b 100644
--- a/core/scope/scope.js
+++ b/core/scope/scope.js
@@ -11,6 +11,7 @@ const uniqueSorted = (ids) => [...new Set(ids)].sort();

 /**
  * 엔티티 설정의 선수 개념 id(data.prerequisites 의 문자열). 코어는 뜻을 모른다 — 범위를 넓히는 데만 쓴다.
+ * 작품의 팩이 pack.yaml scopeFields 에 prerequisites 를 적었을 때만 읽는다(N4, core/scope/fields.js).
  * packs/knowledge/checkers/definitions.js 의 같은 이름 함수와 "어떤 id 를 센다"는 기준이 같아야 한다
  * (코어는 팩을 import 할 수 없어 따로 둔 것뿐이다 — 하나를 고치면 다른 쪽도 맞춘다).
  */
@@ -34,11 +35,12 @@ export function entityRevAt({ work, events, entityId, nodeId }) {
  * 트리 이웃이 아니라 엔티티가 기준이다(계획서 §10).
  * @param {{ work: object, events: object[], nodeId: string, draftText?: string, extracted?: object|null,
  *   marks?: { surface: { kind: string, id: string }, entityId: string }[]|null,
- *   claims?: Array<{ quote: string, sources: Array<{ sourceId: string, quote: string }> }> }} input
+ *   claims?: Array<{ quote: string, sources: Array<{ sourceId: string, quote: string }> }>, scopeFields?: readonly string[] }} input
  *   marks: occurrenceScope 기능이 켜졌을 때 liveMarks(...) 결과. 범위를 더하기만 한다(null이면 기능 꺼짐).
  *   claims: 이 원고의 주장(core/evidence/scope.js claimsFor). 연결한 자료를 범위(sources·refs)에 더하고 검사 ctx 로 그대로 간다.
+ *   scopeFields: 팩이 켠 범위 필드(레지스트리 scopeFields, N4). 빈 목록(기본)이면 선수 개념을 읽지 않는다.
  */
-export function gatherScope({ work, events, nodeId, draftText = '', extracted = null, marks = null, claims = [] }) {
+export function gatherScope({ work, events, nodeId, draftText = '', extracted = null, marks = null, claims = [], scopeFields = [] }) {
   const node = work.tree.nodes.get(nodeId);
   if (!node) throw new FolioError('NODE_NOT_FOUND', nodeId);
   const known = (id) => work.entities.has(id);
@@ -51,8 +53,9 @@ export function gatherScope({ work, events, nodeId, draftText = '', extracted =
   const entityIds = uniqueSorted([...appearances, ...scanned, ...(extracted?.mentions ?? []), ...fromEvents, ...markedHere].filter(known));
   // 선수 개념(N1): 이 원고의 사건이 가리키는 엔티티의 선수 개념을 한 단계만 더한다. 등장(entityIds)으로 치지 않고,
   // 앞 사건(priorEvents)과 참고 버전(refs)에만 넣는다 — 선수 개념의 정의가 앞에서 바뀌면 이 노드도 다시 확인 필요가 된다.
-  const prerequisiteIds = uniqueSorted(fromEvents.filter(known).flatMap((id) => prerequisitesOf(work.entities.get(id))))
-    .filter((id) => known(id) && !entityIds.includes(id));
+  const prerequisiteIds = scopeFields.includes('prerequisites')
+    ? uniqueSorted(fromEvents.filter(known).flatMap((id) => prerequisitesOf(work.entities.get(id)))).filter((id) => known(id) && !entityIds.includes(id))
+    : [];
   const scopedIds = uniqueSorted([...entityIds, ...prerequisiteIds]);
   const before = eventsBefore({ events, positions: work.positions, nodeId });
   // 약속(M5 promiseScope): 이 노드에 안 나온 약속도 앞 사건만 싣는다(휴면 판정). entityIds·refs 는 넓히지 않는다 — 떡밥이 움직여도 다른 노드가 다시 확인 필요가 되지 않는다.
````

`core/run/payload.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/core/run/payload.js b/core/run/payload.js
index 7620ea0..1f273ab 100644
--- a/core/run/payload.js
+++ b/core/run/payload.js
@@ -9,6 +9,7 @@ export function scopeFor(ctx, run) {
   return gatherScope({
     work: ctx.work, events: ctx.events, nodeId: run.nodeId, draftText, extracted, marks: ctx.marks ?? null,
     claims: claimsFor({ work: ctx.work, records: ctx.evidenceRecords ?? null, nodeId: run.nodeId, draft: draftText, extracted }),
+    scopeFields: ctx.registry?.scopeFields ?? [],
   });
 }

````

`packs/knowledge/pack.yaml` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/packs/knowledge/pack.yaml b/packs/knowledge/pack.yaml
index 4c8e8b1..7b7b397 100644
--- a/packs/knowledge/pack.yaml
+++ b/packs/knowledge/pack.yaml
@@ -2,6 +2,7 @@ name: knowledge
 version: 1
 title: 지식 책
 description: 교재·역사서·안내서. 개념을 정의한 뒤에 쓰고, 선수 개념 순서와 용어 통일을 본다. 계획·원고·사건 추출 순서로 쓴다.
+scopeFields: [prerequisites]
 presets:
   textbook:
     title: 교재
````

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test test/run/scope-prerequisites.test.js test/run/scope-fields.test.js`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: 1055/1055(+3). 지식 팩의 digest는 pack.yaml이 바뀌어 달라진다(열린 실행은 검사부터 다시 — 병합 공지 "호환이 바뀌는 것").

- [ ] **Step 6: 커밋**

```bash
git add core/scope/fields.js core/pack/yaml-schema.js core/pack/yaml-pack.js core/pack/registry.js core/scope/scope.js core/run/payload.js packs/knowledge/pack.yaml test/run/scope-prerequisites.test.js test/run/scope-fields.test.js
git commit -m "fix(scope): read prerequisites only when a pack turns on scopeFields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task B1: `folio_find { query: 'links' }`

> **리뷰: 가장 강한 모델. 공격해 볼 것** — 공격 목록 10. `links`가 꺼졌을 때 없는 id를 주면 `FEATURE_DISABLED`가 `NODE_NOT_FOUND`보다 먼저인가(N3 오류 순서). `id: '*'`와 노드 id 밖의 값(빈 문자열, 긴 문자열, 엔티티 id)이 어떻게 되는가. 조회가 작업 잠금·index.db·`.folio`를 만드는가(`BANNED` import 없이 `query.js` 계약만 쓰는가). enum이 끝에만 더해졌는가, 설명문 앞부분이 그대로인가.

**Files:**
- Create: `test/server/find-links.test.js`
- Modify: `server/tools/find.js`, `server/tools/definitions.js`, `test/server/find-blocks.test.js`

**Interfaces:**
- Consumes: A2 `linkTable`(`core/index/query.js`에서 import), `assertFeature`, `scopeOf`(N3, find.js 안).
- Produces: `findInWork(root, { query: 'links', id })` → `{ scope: id, links, backlinks, problems }`. 잠금 없이 `openWork`만 쓴다. MCP `folio_find` query enum 끝에 `links`, 설명문 끝에 한 문장.

목록 테스트: N3의 `find-blocks.test.js` enum 단언은 끝 세 개를 정확히 보므로 `links`를 더해 고친다(같은 세 이름을 그대로 보고 하나를 더 본다 — 약화 아님, 결정 19).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/server/find-blocks.test.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/test/server/find-blocks.test.js b/test/server/find-blocks.test.js
index fa6609f..d997ac6 100644
--- a/test/server/find-blocks.test.js
+++ b/test/server/find-blocks.test.js
@@ -18,9 +18,9 @@ async function setFeatures(root, features) {
   await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
 }

-test('folio_find query enum ends with blocks, bibliography and terms (appended after rename)', () => {
+test('folio_find query enum has blocks, bibliography and terms appended after rename (then links, N4)', () => {
   const find = TOOLS.find((t) => t.name === 'folio_find');
-  assert.deepEqual(find.inputSchema.properties.query.enum, ['node', 'entity', 'usages', 'events', 'candidates', 'rename', 'blocks', 'bibliography', 'terms']);
+  assert.deepEqual(find.inputSchema.properties.query.enum, ['node', 'entity', 'usages', 'events', 'candidates', 'rename', 'blocks', 'bibliography', 'terms', 'links']);
   assert.deepEqual(find.inputSchema.required, ['root', 'query', 'id']);
   assert.match(find.description, /blocks\(블록 번호·각주·자료 인용·문제\), bibliography\(참고문헌\), terms\(색인\)/);
 });
````

`test/server/find-links.test.js` (46줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { TOOLS } from '../../server/tools/definitions.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture } from '../support/fixtures.js';

const box = async () => createToolbox({ packs: await loadBuiltinPacks() });
const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => (out.ok ? 'ok' : out.error.code);
const pair = (link) => `${link.from}>${link.to}`;

test('folio_find query enum ends with links (N4), and the description says links takes the same id rule', () => {
  const find = TOOLS.find((t) => t.name === 'folio_find');
  assert.equal(find.inputSchema.properties.query.enum.at(-1), 'links');
  assert.deepEqual(find.inputSchema.required, ['root', 'query', 'id']);
  assert.match(find.description, /links\(노드 연결 표: 링크·그 가지로 오는 링크·깨진 링크\)도 같은 id 규칙이다\.$/);
});

test('folio_find links: "*" gives the whole table, a node id one branch with the links coming into it, NODE_NOT_FOUND otherwise', async () => {
  const tools = await box();
  const root = await copyFixture('reference-book');
  const all = ok(await tools.call('folio_find', { root, query: 'links', id: '*' }));
  assert.equal(all.scope, '*');
  assert.deepEqual(all.links.map(pair), ['cell>membrane', 'membrane>cell', 'membrane>ghost-entry', 'nucleus>nucleus', 'atp-entry>mitochondria', 'atp-entry>membrane']);
  assert.deepEqual(all.problems.map((p) => [p.code, p.nodeId, p.to]), [['LINK_BROKEN', 'membrane', 'ghost-entry'], ['LINK_SELF', 'nucleus', 'nucleus']]);
  const one = ok(await tools.call('folio_find', { root, query: 'links', id: 'membrane' }));
  assert.deepEqual([one.scope, one.links.map(pair), one.backlinks.map(pair)], ['membrane', ['membrane>cell', 'membrane>ghost-entry'], ['cell>membrane', 'atp-entry>membrane']]);
  for (const id of ['nowhere', '**', '__proto__', 'ghost-entry']) assert.equal(code(await tools.call('folio_find', { root, query: 'links', id })), 'NODE_NOT_FOUND', id);
  await assert.rejects(stat(join(root, '.folio')), { code: 'ENOENT' });
});

test('folio_find links is FEATURE_DISABLED when links is off, before the id is looked at; the other queries still answer', async () => {
  const tools = await box();
  const root = await copyFixture('reference-book');
  const path = join(root, 'work.yaml');
  await writeFile(path, `${await readFile(path, 'utf8')}features:\n  links: false\n`);
  for (const id of ['*', 'nowhere']) {
    const refused = await tools.call('folio_find', { root, query: 'links', id });
    assert.deepEqual([refused.error.code, refused.error.details.feature], ['FEATURE_DISABLED', 'links'], id);
  }
  assert.equal(ok(await tools.call('folio_find', { root, query: 'node', id: 'cell' })).node.id, 'cell');
  assert.equal(ok(await tools.call('folio_status', { root })).links, null);
});
````

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test test/server/find-blocks.test.js test/server/find-links.test.js`
Expected: FAIL 4개 — `folio_find query enum has blocks, bibliography and terms appended after rename (then links, N4)`, `folio_find query enum ends with links (N4) ...`, `folio_find links: "*" gives the whole table ...`, `folio_find links is FEATURE_DISABLED when links is off ...`. 나머지 4개 통과.

- [ ] **Step 3: 구현한다**

`server/tools/find.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/server/tools/find.js b/server/tools/find.js
index 3e4b1fd..1c131f4 100644
--- a/server/tools/find.js
+++ b/server/tools/find.js
@@ -2,7 +2,7 @@ import { FolioError } from '../../core/errors.js';
 import { openWork } from '../../core/store/work.js';
 import { withWorkLock } from '../../core/run/work-lock.js';
 import { rebuildIndex } from '../../core/index/rebuild.js';
-import { bibliography, blockCatalog, eventsFor, marksOf, openIndex, termIndex, usagesOf } from '../../core/index/query.js';
+import { bibliography, blockCatalog, eventsFor, linkTable, marksOf, openIndex, termIndex, usagesOf } from '../../core/index/query.js';
 import { EVIDENCE_LEDGER } from '../../core/evidence/records.js';
 import { readLedgerView } from '../../core/view/ledgers.js';
 import { candidatesFor } from '../../core/occurrences/candidates.js';
@@ -32,8 +32,9 @@ const ledgerFor = (root, on, name) => (on ? readLedgerView(root, name) : Promise
  * rename 은 계획만 만든다 — 아무것도 쓰지 않는다. 글 전체(text)는 돌려주지 않고 path·beforeHash 만 준다.
  * blocks(N3)는 파일에서 바로 계산한다. bibliography·terms 는 기록장(근거 연결·등장 위치)도 읽으므로 작업 잠금 안에서 읽는다.
  * 셋 다 id 로 범위를 정한다(노드 id 또는 '*'). 기능(blocks·bibliography·termIndex)이 꺼지면 FEATURE_DISABLED.
+ * links(N4, 노드 연결 표)도 파일에서 바로 계산하고(잠금 없음) 같은 id 규칙을 쓴다. links 기능이 꺼지면 FEATURE_DISABLED.
  * @param {string} root
- * @param {{ query: 'node'|'entity'|'usages'|'events'|'candidates'|'rename'|'blocks'|'bibliography'|'terms', id: string, kind?: string,
+ * @param {{ query: 'node'|'entity'|'usages'|'events'|'candidates'|'rename'|'blocks'|'bibliography'|'terms'|'links', id: string, kind?: string,
  *   newName?: string, keepOldName?: boolean, include?: string[], exclude?: string[] }} request
  */
 export async function findInWork(root, { query, id, kind = 'node', newName, keepOldName, include, exclude }) {
@@ -42,6 +43,11 @@ export async function findInWork(root, { query, id, kind = 'node', newName, keep
     assertFeature(work.config, 'blocks');
     return { scope: id, ...blockCatalog(work, scopeOf(id)) };
   }
+  if (query === 'links') {
+    const work = await openWork(root);
+    assertFeature(work.config, 'links');
+    return { scope: id, ...linkTable(work, scopeOf(id)) };
+  }
   if (query === 'node' || query === 'entity') {
     const work = await openWork(root);
     if (query === 'node') {
````

`server/tools/definitions.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/server/tools/definitions.js b/server/tools/definitions.js
index 88b045a..1cf01e1 100644
--- a/server/tools/definitions.js
+++ b/server/tools/definitions.js
@@ -44,9 +44,9 @@ export const TOOLS = Object.freeze([
       op: { type: 'string', enum: ['add', 'move', 'wrap'] }, parentId: ID, level: ID, id: ID, title: TEXT, brief: TEXT,
       index: { type: 'integer', minimum: 0, maximum: 100000 }, nodeId: ID, nodeIds: { type: 'array', items: ID, minItems: 1 },
     }, ['op']),
-  tool('folio_find', '찾는다. query: node, entity(정의), usages(엔티티가 나오는 곳 + 기록된 등장 위치 marks), events(사건 이력), candidates(표면 id 의 이름 후보, kind 기본 node), rename(이름 바꾸기 계획 — 읽기 전용, newName 필요). blocks(블록 번호·각주·자료 인용·문제), bibliography(참고문헌), terms(색인)는 id 로 범위를 정한다: 노드 id(그 가지만) 또는 \'*\'(작품 전체).',
+  tool('folio_find', '찾는다. query: node, entity(정의), usages(엔티티가 나오는 곳 + 기록된 등장 위치 marks), events(사건 이력), candidates(표면 id 의 이름 후보, kind 기본 node), rename(이름 바꾸기 계획 — 읽기 전용, newName 필요). blocks(블록 번호·각주·자료 인용·문제), bibliography(참고문헌), terms(색인)는 id 로 범위를 정한다: 노드 id(그 가지만) 또는 \'*\'(작품 전체). links(노드 연결 표: 링크·그 가지로 오는 링크·깨진 링크)도 같은 id 규칙이다.',
     {
-      query: { type: 'string', enum: ['node', 'entity', 'usages', 'events', 'candidates', 'rename', 'blocks', 'bibliography', 'terms'] }, id: ID,
+      query: { type: 'string', enum: ['node', 'entity', 'usages', 'events', 'candidates', 'rename', 'blocks', 'bibliography', 'terms', 'links'] }, id: ID,
       kind: SURFACE.properties.kind, newName: NAME, keepOldName: { type: 'boolean' }, include: { type: 'array', items: ID, maxItems: 500 },
       exclude: { type: 'array', items: ID, maxItems: 500 },
     }, ['query', 'id']),
````

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test test/server/find-blocks.test.js test/server/find-links.test.js`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: 1058/1058(+3). `test/server/tools.test.js`(도구 11개·`BANNED` import) 그대로 초록.

- [ ] **Step 6: 커밋**

```bash
git add server/tools/find.js server/tools/definitions.js test/server/find-blocks.test.js test/server/find-links.test.js
git commit -m "feat(find): folio_find links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task C1: 지식 책 팩 — 링크 검사, 연결 항목 검사, `knowledge.unordered` 세트, `reference` 프리셋

> **리뷰: 가장 강한 모델. 공격해 볼 것** — 공격 목록 1·6·12. 새 검사 둘이 `experimental: true`, `severity: advisory`인가, 검사기가 `severity`를 적지 않는가. `knowledge.linked-consistency`가 linear 노드에서 요청조차 안 되는가(`not_applicable`). 세트를 골라도 `core.promise-order`가 영수증에 남는가(순서 없는 노드에서는 `not_applicable`). 팩 digest가 모듈 그래프(`checkers/links.js` → `core/links/graph.js` → `core/store/tree.js`)로 바뀌는가, 소설·자료·브랜드 팩 digest는 그대로인가. 프리셋·검사·세트가 pack.yaml 끝에만 더해졌는가. `reference` 프리셋이 첫 팩 규칙(N2)과 `ORDER_MISMATCH`에 걸리지 않는가.

**Files:**
- Create: `packs/knowledge/checkers/links.js`, `packs/knowledge/checks/linked-consistency.md`, `test/pack/knowledge-links.test.js`
- Modify: `packs/knowledge/checkers/index.js`, `packs/knowledge/pack.yaml`, `packs/knowledge/README.md`, `test/pack/knowledge-pack.test.js`, `test/pack/knowledge-cross-refs.test.js`, `test/pack/knowledge-sourcebook.test.js`, `test/server/knowledge-init.test.js`

**Interfaces:**
- Consumes: A1 `linksFrom`, A3 ctx `linkedEvents`(모델 요청 payload), A4 `requiresOrder: none`, 기존 `workEntities(ctx)`(ctx 검사).
- Produces:
  - 검사 `knowledge.links`(deterministic, facts, run `links`): `LINK_BROKEN`·`LINK_SELF`, `target` = 링크 `to`, quote 없음. 순서와 무관.
  - 검사 `knowledge.linked-consistency`(model, critic, `requiresOrder: none`, `requireQuote: true`).
  - 세트 `knowledge.unordered` = `[knowledge.links, knowledge.cross-refs, knowledge.term-consistency, knowledge.linked-consistency]`, `recommendedFor: { kinds: [reference] }`.
  - 프리셋 `reference`: `part(1~30) → entry(leaf)`, `order: none`, `checkSets: [knowledge.basic, knowledge.unordered]`.

목록 테스트: 지식 팩 검사기 키·프리셋 수(셋→넷)·세트 수와 `PRESET_UNKNOWN`의 `details.packPresets`를 단언하는 기존 테스트 넷을 같은 커밋에서 고친다(끝에 더한 이름을 더 보는 것뿐 — 약화 아님).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/pack/knowledge-pack.test.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/test/pack/knowledge-pack.test.js b/test/pack/knowledge-pack.test.js
index e13de60..925765a 100644
--- a/test/pack/knowledge-pack.test.js
+++ b/test/pack/knowledge-pack.test.js
@@ -32,17 +32,19 @@ test('the knowledge pack loads with three presets, three sets and advisory exper
   const packs = await loadBuiltinPacks();
   assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand']);
   const pack = packs.get('knowledge');
-  assert.deepEqual(Object.keys(pack.presets), ['textbook', 'history', 'guide', 'sourcebook']);
+  assert.deepEqual(Object.keys(pack.presets), ['textbook', 'history', 'guide', 'sourcebook', 'reference']);
   assert.deepEqual(Object.values(pack.presets).map((p) => [p.levels.map((l) => l.name), p.checkSets]), [
     [['part', 'chapter', 'section'], ['knowledge.basic']], [['era', 'chapter', 'section'], ['knowledge.basic']], [['chapter', 'section'], ['knowledge.basic']],
-    [['part', 'chapter', 'section'], ['knowledge.basic', 'sources.citations']],
+    [['part', 'chapter', 'section'], ['knowledge.basic', 'sources.citations']], [['part', 'entry'], ['knowledge.basic', 'knowledge.unordered']],
   ]);
+  assert.deepEqual(Object.values(pack.presets).map((p) => p.order ?? null), [null, null, null, null, 'none']);
   assert.deepEqual(pack.defaultCheckSets, ['knowledge.basic']);
   assert.deepEqual(Object.fromEntries(Object.entries(pack.checkSets).map(([id, set]) => [id, set.checks])), {
     'knowledge.basic': ['knowledge.defined-before-use', 'knowledge.prerequisite-order', 'knowledge.parent-fit', 'knowledge.critic', 'knowledge.goals-covered'],
     'knowledge.terms': ['knowledge.term-consistency'],
     'knowledge.exercises': ['knowledge.exercises-cover-goals'],
     'knowledge.references': ['knowledge.cross-refs'],
+    'knowledge.unordered': ['knowledge.links', 'knowledge.cross-refs', 'knowledge.term-consistency', 'knowledge.linked-consistency'],
   });
   const view = (id) => { const c = pack.checks.find((x) => x.id === id); return [c.tier, c.stage, c.severity, Boolean(c.experimental), c.requiresOrder ?? null]; };
   assert.deepEqual(view('knowledge.defined-before-use'), ['deterministic', 'facts', 'advisory', true, 'linear']);
@@ -53,6 +55,9 @@ test('the knowledge pack loads with three presets, three sets and advisory exper
   assert.deepEqual(view('knowledge.goals-covered'), ['model', 'review', 'advisory', false, null]);
   assert.deepEqual(view('knowledge.exercises-cover-goals'), ['model', 'critic', 'advisory', true, null]);
   assert.deepEqual(view('knowledge.cross-refs'), ['deterministic', 'facts', 'advisory', true, null]);
+  assert.deepEqual(view('knowledge.links'), ['deterministic', 'facts', 'advisory', true, null]);
+  assert.deepEqual(view('knowledge.linked-consistency'), ['model', 'critic', 'advisory', true, 'none']);
+  assert.equal(pack.checks.find((c) => c.id === 'knowledge.linked-consistency').requireQuote, true);
   assert.equal(pack.checks.find((c) => c.id === 'knowledge.parent-fit').requiresParentPlan, true);
   assert.ok(pack.checks.every((c) => !c.locked), 'a pack cannot declare locks');
   assert.equal(pack.prompts['leaf.extract'], await readFile(join(KNOWLEDGE_PACK_DIR, 'prompts', 'extract.md'), 'utf8'));
````

`test/pack/knowledge-cross-refs.test.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/test/pack/knowledge-cross-refs.test.js b/test/pack/knowledge-cross-refs.test.js
index cb33ef9..122e0df 100644
--- a/test/pack/knowledge-cross-refs.test.js
+++ b/test/pack/knowledge-cross-refs.test.js
@@ -60,7 +60,7 @@ test('cross-refs: the draft replaces the node body — its own old anchors are n
 test('knowledge.references: the pack registers cross-refs as an experimental advisory facts check, stamped by the core and recommended for books', async () => {
   const packs = await loadBuiltinPacks();
   assert.equal(KNOWLEDGE_CHECKERS['cross-refs'], crossRefs);
-  assert.deepEqual(Object.keys(KNOWLEDGE_CHECKERS), ['defined-before-use', 'prerequisite-order', 'term-consistency', 'cross-refs']);
+  assert.deepEqual(Object.keys(KNOWLEDGE_CHECKERS), ['defined-before-use', 'prerequisite-order', 'term-consistency', 'cross-refs', 'links']);
   const root = await copyFixture('blocks-book');
   const path = join(root, 'work.yaml');
   await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), checkSets: ['knowledge.references'] }));
````

`test/pack/knowledge-sourcebook.test.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/test/pack/knowledge-sourcebook.test.js b/test/pack/knowledge-sourcebook.test.js
index cfc1e08..4f8c600 100644
--- a/test/pack/knowledge-sourcebook.test.js
+++ b/test/pack/knowledge-sourcebook.test.js
@@ -25,7 +25,7 @@ test('folio_init makes a sourcebook work with packs [knowledge, sources]; withou
   assert.equal(refused.error.code, 'CONFIG_INVALID');
   assert.ok(refused.error.details.errors.some((e) => e.code === 'CHECK_SET_UNKNOWN' && e.set === 'sources.citations'));
   await assert.rejects(stat(join(alone, 'work.yaml')), { code: 'ENOENT' });
-  assert.deepEqual((await tools.call('folio_init', { root: alone, title: 't', preset: 'nope' })).error.details.packPresets.knowledge, ['textbook', 'history', 'guide', 'sourcebook']);
+  assert.deepEqual((await tools.call('folio_init', { root: alone, title: 't', preset: 'nope' })).error.details.packPresets.knowledge, ['textbook', 'history', 'guide', 'sourcebook', 'reference']);
 });

 test('the root plan request of a sourcebook work carries its sources, and the knowledge prompts point at sources and claims', async () => {
````

`test/server/knowledge-init.test.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/test/server/knowledge-init.test.js b/test/server/knowledge-init.test.js
index bd663a0..3eabf20 100644
--- a/test/server/knowledge-init.test.js
+++ b/test/server/knowledge-init.test.js
@@ -27,6 +27,6 @@ test('an unknown preset lists every pack\'s presets, so the knowledge presets ar
   const out = await tools.call('folio_init', { root, title: 't', preset: 'textbook' });
   assert.equal(out.error.code, 'PRESET_UNKNOWN');
   assert.deepEqual(out.error.details.presets, ['serial', 'novel', 'scene']);
-  assert.deepEqual(out.error.details.packPresets, { novel: ['serial', 'novel', 'scene'], knowledge: ['textbook', 'history', 'guide', 'sourcebook'] });
+  assert.deepEqual(out.error.details.packPresets, { novel: ['serial', 'novel', 'scene'], knowledge: ['textbook', 'history', 'guide', 'sourcebook', 'reference'] });
   assert.match(TOOLS.find((t) => t.name === 'folio_init').description, /textbook, history, guide/);
 });
````

`test/pack/knowledge-links.test.js` (74줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeLinks } from '../../packs/knowledge/checkers/links.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { openWork } from '../../core/store/work.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { initWork } from '../../core/work/init.js';
import { recommendCheckSets } from '../../core/checks/recommend.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, fixturePath, tempDir } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

/** 복사본의 work.yaml 에 설정을 더한다(작가가 하는 일). */
async function edited(fixture, config) {
  const root = await copyFixture(fixture);
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...config }));
  return root;
}

test('knowledge.links flags links to missing nodes and to the node itself, without severity or quote', async () => {
  const work = await openWork(fixturePath('reference-book'));
  const at = (id) => nodeLinks({ work, node: work.tree.nodes.get(id) });
  assert.deepEqual(at('membrane'), [{ code: 'LINK_BROKEN', target: 'ghost-entry', message: '링크 ghost-entry(없는 항목)가 가리키는 노드가 작품에 없다' }]);
  assert.deepEqual(at('nucleus'), [{ code: 'LINK_SELF', target: 'nucleus', message: '링크 nucleus(핵)가 이 노드 자신을 가리킨다' }]);
  assert.deepEqual([at('cell'), at('mitochondria')], [[], []]);
  assert.throws(() => nodeLinks({ node: work.tree.nodes.get('cell') }), TypeError);
  assert.throws(() => nodeLinks({ work }), TypeError);
});

test('a none entry run with knowledge.unordered: links advisory at approve, linked-consistency asked with linkedEvents, order checks not applicable', async () => {
  const root = await edited('reference-book', { checkSets: ['knowledge.unordered'] });
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  await ledger.append({ type: 'event', eventId: 'seed-1', receiptId: 'seed', nodeId: 'cell', entityId: 'cell-membrane', kind: 'term.defined' });
  const packs = await loadBuiltinPacks();
  const host = createFakeHost({ drafts: { membrane: '세포막은 세포의 바깥 경계다.' } });
  const trail = await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'membrane' }, until: (o) => o.status === 'needs_user' });
  assert.deepEqual(trail.map(label), ['model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve']);
  const critic = trail.find((o) => label(o) === 'model:critic').requests[0].payload;
  assert.deepEqual(critic.checks.map((c) => c.checkId), ['knowledge.linked-consistency']);
  assert.deepEqual(critic.linkedEvents.map((e) => `${e.nodeId}:${e.entityId}:${e.kind}`), ['cell:cell-membrane:term.defined']);
  const approve = trail.at(-1);
  assert.deepEqual(approve.question.advisories.map((f) => [f.checkId, f.code, f.severity]), [['knowledge.links', 'LINK_BROKEN', 'advisory']]);
  assert.equal((await createRunner({ root, packs }).decide({ runId: approve.runId, action: 'approve' })).status, 'done');
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'membrane');
  const facts = receipt.steps.find((s) => s.id === 'facts');
  assert.deepEqual(facts.checks.map((c) => [c.checkId, c.status]), [
    ['core.promise-order', 'not_applicable'], ['knowledge.links', 'passed'], ['knowledge.cross-refs', 'passed'], ['knowledge.term-consistency', 'passed'],
  ]);
});

test('on a linear textbook the none-only model check is not applicable and is not asked', async () => {
  const root = await edited('knowledge-book', { checkSets: ['knowledge.unordered'] });
  const packs = await loadBuiltinPacks();
  const trail = await driveToEnd(() => createRunner({ root, packs }), createFakeHost(), { start: { node: 'membranes' }, until: (o) => o.status === 'done' });
  assert.deepEqual(trail.map(label), ['model:plan', 'model:draft', 'model:extract', 'user:approve', 'done']);
  const receipt = (await openLedger(root, 'receipts').readAll()).find((r) => r.type === 'receipt' && r.nodeId === 'membranes');
  const critic = receipt.steps.find((s) => s.id === 'critic');
  assert.deepEqual(critic.checks.map((c) => [c.checkId, c.status]), [['knowledge.linked-consistency', 'not_applicable']]);
});

test('the reference preset makes an unordered work that recommends knowledge.unordered for the reference kind', async () => {
  const packs = await loadBuiltinPacks();
  const root = join(await tempDir(), 'dictionary');
  await initWork(root, { title: '작은 사전', packs: ['knowledge'], preset: 'reference', available: packs });
  const yaml = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  assert.deepEqual([yaml.order, yaml.levels.map((l) => l.name), yaml.checkSets], ['none', ['part', 'entry'], ['knowledge.basic', 'knowledge.unordered']]);
  const ws = await openWorkspace(root, { packs });
  assert.ok(recommendCheckSets({ registry: ws.registry, config: ws.work.config, workKind: 'reference' }).some((r) => r.setId === 'knowledge.unordered'));
});
````

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test test/pack/knowledge-pack.test.js test/pack/knowledge-cross-refs.test.js test/pack/knowledge-sourcebook.test.js test/server/knowledge-init.test.js test/pack/knowledge-links.test.js`
Expected: FAIL 5개 — `knowledge-links.test.js`가 `ERR_MODULE_NOT_FOUND`(`packs/knowledge/checkers/links.js` 없음), `the knowledge pack loads with three presets, three sets ...`, `knowledge.references: the pack registers cross-refs ...`, `folio_init makes a sourcebook work ...`, `an unknown preset lists every pack's presets ...`. 나머지 10개 통과.

- [ ] **Step 3: 구현한다**

`packs/knowledge/checkers/links.js` (23줄):

````js
import { linksFrom } from '../../../core/links/graph.js';
import { workEntities } from './definitions.js';

/**
 * 노드 링크 유효성(knowledge.links, N4). 이 노드 앞머리 links 가 가리키는 노드가 있는지 본다(core/links/graph.js 와 같은 규칙).
 * - LINK_BROKEN: 없는 노드를 가리킨다. LINK_SELF: 이 노드 자신을 가리킨다. target 은 링크의 to 다.
 * - 링크는 앞머리에 있고 원고에는 없으므로 quote 를 적지 않는다.
 * - 순서와 무관하다(requiresOrder 없음) — linear 작품의 "함께 보기" 링크도 본다.
 * - 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다. ctx.work·ctx.node 가 없으면 던진다.
 * @param {{ work?: any, node?: { id?: string } }} ctx
 */
export function nodeLinks(ctx) {
  workEntities(ctx);
  const nodeId = ctx.node?.id;
  if (typeof nodeId !== 'string') throw new TypeError('knowledge.links needs ctx.node (the core check context)');
  const findings = [];
  for (const link of linksFrom(ctx.work, nodeId)) {
    const name = link.label || link.kind;
    if (!link.valid) findings.push({ code: 'LINK_BROKEN', target: link.to, message: `링크 ${link.to}(${name})가 가리키는 노드가 작품에 없다` });
    else if (link.to === nodeId) findings.push({ code: 'LINK_SELF', target: link.to, message: `링크 ${link.to}(${name})가 이 노드 자신을 가리킨다` });
  }
  return findings;
}
````

`packs/knowledge/checkers/index.js` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/packs/knowledge/checkers/index.js b/packs/knowledge/checkers/index.js
index b0c35dd..a5575ed 100644
--- a/packs/knowledge/checkers/index.js
+++ b/packs/knowledge/checkers/index.js
@@ -2,8 +2,9 @@ import { definedBeforeUse } from './defined-before-use.js';
 import { prerequisiteOrder } from './prerequisite-order.js';
 import { termConsistency } from './term-consistency.js';
 import { crossRefs } from './cross-refs.js';
+import { nodeLinks } from './links.js';

 /** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. */
 export const KNOWLEDGE_CHECKERS = Object.freeze({
-  'defined-before-use': definedBeforeUse, 'prerequisite-order': prerequisiteOrder, 'term-consistency': termConsistency, 'cross-refs': crossRefs,
+  'defined-before-use': definedBeforeUse, 'prerequisite-order': prerequisiteOrder, 'term-consistency': termConsistency, 'cross-refs': crossRefs, links: nodeLinks,
 });
````

`packs/knowledge/checks/linked-consistency.md` (4줄):

````markdown
이 노드는 순서 없는 작품(사전·매뉴얼·요리책)의 한 항목이다. 앞뒤 순서가 없으니 "앞에서 정한 사실" 대신, 이 항목이 links 로 가리키는 항목에 기록된 사건(요청의 linkedEvents)을 기준으로 본다.
원고가 linkedEvents 와 어긋나는 곳만 짧게 적는다. 예: 연결된 항목이 정의한 뜻과 다르게 쓴 용어, 연결된 항목의 수치·단계·재료와 다른 서술.
지적마다 어긋난 원고 문장을 quote 로 그대로 적는다. linkedEvents 가 없거나 어긋난 곳이 없으면 지적하지 않는다.
참고 의견이다. 원고를 고치라고 요구하지 않는다.
````

`packs/knowledge/pack.yaml` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/packs/knowledge/pack.yaml b/packs/knowledge/pack.yaml
index 7b7b397..e9eb709 100644
--- a/packs/knowledge/pack.yaml
+++ b/packs/knowledge/pack.yaml
@@ -35,6 +35,14 @@ presets:
       - { name: chapter, children: [1, 20] }
       - { name: section, leaf: true }
     checkSets: [knowledge.basic, sources.citations]
+  reference:
+    title: 사전·매뉴얼
+    description: 부·항목으로 쓴다. 순서 없음(order none) — 앞뒤를 따지는 검사는 해당 없음이고, 항목끼리는 앞머리 links 로 잇는다.
+    levels:
+      - { name: part, children: [1, 30] }
+      - { name: entry, leaf: true }
+    order: none
+    checkSets: [knowledge.basic, knowledge.unordered]
 pipelines:
   leaf:
     - { id: plan, kind: generate, produces: plan }
@@ -126,6 +134,24 @@ checks:
     severity: advisory
     experimental: true
     run: cross-refs
+  knowledge.links:
+    title: 노드 링크
+    description: 이 노드 앞머리 links 가 없는 노드나 이 노드 자신을 가리키면 알린다.
+    tier: deterministic
+    stage: facts
+    severity: advisory
+    experimental: true
+    run: links
+  knowledge.linked-consistency:
+    title: 연결 항목과 맞춤
+    description: 순서 없는 작품에서 이 항목이 links 로 가리키는 항목의 사건(linkedEvents)과 어긋나는지 본다. 원고 인용이 있어야 한다.
+    tier: model
+    stage: critic
+    severity: advisory
+    experimental: true
+    requiresOrder: none
+    requireQuote: true
+    instruction: checks/linked-consistency.md
 checkSets:
   knowledge.basic:
     title: 교재 기본
@@ -147,4 +173,9 @@ checkSets:
     description: 블록 참조·앵커·각주·자료 인용이 가리키는 것이 있는지 알린다(실험, 참고).
     checks: [knowledge.cross-refs]
     recommendedFor: { kinds: [textbook, history, guide] }
+  knowledge.unordered:
+    title: 사전·매뉴얼
+    description: 순서 없는 작품의 상호 참조 중심 검사. 노드 링크, 블록 참조·각주·자료 인용, 용어 통일, 연결 항목과 맞춤(모두 실험, 참고).
+    checks: [knowledge.links, knowledge.cross-refs, knowledge.term-consistency, knowledge.linked-consistency]
+    recommendedFor: { kinds: [reference] }
 defaultCheckSets: [knowledge.basic]
````

`packs/knowledge/README.md` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/packs/knowledge/README.md b/packs/knowledge/README.md
index bae0737..dd8251b 100644
--- a/packs/knowledge/README.md
+++ b/packs/knowledge/README.md
@@ -2,8 +2,9 @@

 지식 책(교재·역사서·안내서) 팩. 선언은 `pack.yaml`, 글은 `prompts/`·`checks/`, 결정론 검사기는 `checkers/`(이름으로 등록).

-- 프리셋: `textbook`(part → chapter → section), `history`(era → chapter → section), `guide`(chapter → section), `sourcebook`(자료 책: part → chapter → section, 작품 `packs: [knowledge, sources]` 필요, 세트 `knowledge.basic` + `sources.citations`).
+- 프리셋: `textbook`(part → chapter → section), `history`(era → chapter → section), `guide`(chapter → section), `sourcebook`(자료 책: part → chapter → section, 작품 `packs: [knowledge, sources]` 필요, 세트 `knowledge.basic` + `sources.citations`), `reference`(사전·매뉴얼: part → entry, `order: none`, 세트 `knowledge.basic` + `knowledge.unordered`, N4).
 - 엔티티 종류(관례): `concept`, `term`, `example`. 선택 필드 `prerequisites: [id...]`, `avoid: [표기...]`. 약속은 코어 `promise`.
 - 사건: `term.defined`, `term.redefined`(원고 인용 필수).
-- 세트: `knowledge.basic`(기본) — 정의 전 사용·선수 개념 순서(실험, 참고), 윗계획 맞춤(block), 원고 검토(참고), 학습 목표 다룸(참고). `knowledge.terms` — 용어 통일(실험, 참고). `knowledge.exercises` — 연습문제와 목표(실험, 참고). `knowledge.references` — 상호 참조: 블록 참조·앵커·각주·자료 인용(실험, 참고, N3).
+- 세트: `knowledge.basic`(기본) — 정의 전 사용·선수 개념 순서(실험, 참고), 윗계획 맞춤(block), 원고 검토(참고), 학습 목표 다룸(참고). `knowledge.terms` — 용어 통일(실험, 참고). `knowledge.exercises` — 연습문제와 목표(실험, 참고). `knowledge.references` — 상호 참조: 블록 참조·앵커·각주·자료 인용(실험, 참고, N3). `knowledge.unordered` — 사전·매뉴얼(순서 없음): 노드 링크, 상호 참조, 용어 통일, 연결 항목과 맞춤(`requiresOrder: none`, 모델)(실험, 참고, N4).
+- `scopeFields: [prerequisites]`: 코어 검사 범위가 선수 개념을 한 단계 읽는다(이 팩을 쓰는 작품만, N4).
 - 잠금 단계와 `core.promise-order`는 코어가 정한다. 세트를 꺼도 코어 잠금은 그대로다.
````

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test test/pack/knowledge-pack.test.js test/pack/knowledge-cross-refs.test.js test/pack/knowledge-sourcebook.test.js test/server/knowledge-init.test.js test/pack/knowledge-links.test.js`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: 1062/1062(+4). `test/core/no-model-calls.test.js`가 새 검사기를 통과한다(모델·네트워크·동적 import 없음).

- [ ] **Step 6: 커밋**

```bash
git add packs/knowledge test/pack/knowledge-pack.test.js test/pack/knowledge-cross-refs.test.js test/pack/knowledge-sourcebook.test.js test/server/knowledge-init.test.js test/pack/knowledge-links.test.js
git commit -m "feat(knowledge): link check, linked-consistency check, unordered set and reference preset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task D1: 호스트 안내 — 순서 없는 작품

> **리뷰: 보통 모델.** 문서가 코드와 맞는지(문제 코드·도구 이름·토글·세트 이름), 잠금을 끌 수 있다고 읽히는 문장이 없는지만 본다.

**Files:**
- Create: `skill/folio/references/order.md`, `test/server/order-docs.test.js`
- Modify: `skill/folio/SKILL.md`(목록 끝에 9번), `skill/folio/references/knowledge.md`(프리셋 행·세트 행·선수 개념 한 줄)

**Interfaces:**
- Consumes: A1~C1의 이름(`LINK_BROKEN`, `LINK_SELF`, `folio_find` `links`, `folio_status.links`, `links`, `linkScope`, `knowledge.unordered`, `reference`, `linkedEvents`).
- Produces: 호스트가 읽는 안내. 코드 동작은 바꾸지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/server/order-docs.test.js` (19줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { linkTable } from '../../core/links/graph.js';
import { openWork } from '../../core/store/work.js';
import { fixturePath } from '../support/fixtures.js';

test('references/order.md names every link problem code, the links query, both toggles and the unordered set; SKILL.md and knowledge.md point at it', async () => {
  const text = await readFile(join('skill', 'folio', 'references', 'order.md'), 'utf8');
  const codes = new Set(linkTable(await openWork(fixturePath('reference-book'))).problems.map((p) => p.code));
  assert.deepEqual([...codes], ['LINK_BROKEN', 'LINK_SELF']);
  for (const code of codes) assert.match(text, new RegExp(`\`${code}\``), code);
  for (const word of ["query: 'links'", '`backlinks`', '`linkScope`', '`linkedEvents`', '`not_applicable`', '`knowledge.unordered`', '`knowledge.links`',
    '`knowledge.linked-consistency`', '`requiresOrder: none`', "preset: 'reference'", '`core.promise-order`']) assert.ok(text.includes(word), word);
  assert.match(await readFile(join('skill', 'folio', 'SKILL.md'), 'utf8'), /\[references\/order\.md\]\(references\/order\.md\)/);
  const knowledge = await readFile(join('skill', 'folio', 'references', 'knowledge.md'), 'utf8');
  for (const word of ['`reference`', '`knowledge.unordered`', '[order.md](order.md)']) assert.ok(knowledge.includes(word), word);
});
````

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test test/server/order-docs.test.js`
Expected: FAIL 1개 — `references/order.md names every link problem code ...`(`order.md` 없음).

- [ ] **Step 3: 문서를 쓴다**

`skill/folio/references/order.md` (65줄):

````markdown
# 순서 없는 작품 (N4, `order: none`)

사전·매뉴얼·요리책처럼 아무 데서나 펼쳐 읽는 작품이다. 앞뒤 순서가 없으니 "앞에서 정한 사실" 대신 항목끼리 잇는 링크를 기준으로 본다.

## 만들기

- 새 작품: `folio_init { root, title, packs: ['knowledge'], preset: 'reference' }`. 레벨은 part → entry, `order: none`, 세트는 `knowledge.basic`·`knowledge.unordered`다.
- 이미 있는 작품: work.yaml의 `order: none`(작품 전체) 또는 `order: { default: linear, levels: { entry: none } }`(레벨마다, 본문은 linear이고 용어집만 none). 순서를 바꿀지는 작가가 정한다. 호스트가 work.yaml을 고치지 않는다.
- 게임북의 `branching`은 아직 순서 없음과 똑같이 다룬다. 분기 경로 검사는 뒤 마일스톤이다.

## 항목 잇기 — 앞머리 `links`

```yaml
links:
  - to: membrane      # 가리키는 노드 id
    kind: see-also    # 없으면 see-also
    label: 세포막
```

- 가리키는 노드가 없으면 `LINK_BROKEN`, 자기 자신이면 `LINK_SELF`다. 작품은 그대로 열린다. 엔진은 알리기만 하고 고치지 않는다.

## 검사

- 앞뒤를 따지는 검사는 순서 없는 노드에서 `not_applicable`로 영수증에 남는다. `core.promise-order`, 정의 전 사용, 선수 개념 순서, 소설의 순서 검사가 여기에 든다. 실패도 통과도 아니다. 읽는 순서 안의 노드에서는 그대로 돈다. 잠금이 꺼진 것이 아니다.
- `knowledge.unordered` 세트(추천: `reference` 작품): `knowledge.links`(노드 링크), `knowledge.cross-refs`(블록 참조·각주·자료 인용), `knowledge.term-consistency`(용어 통일), `knowledge.linked-consistency`(연결 항목과 맞춤, 모델). 모두 실험·참고 의견이다. 작가가 세트를 고른다.
- 팩 검사의 `requiresOrder: none`은 순서 없는 노드에서만 돈다는 뜻이다. `knowledge.linked-consistency`가 그렇다.

## 검사 범위 — 연결된 노드의 사건

- 순서 없는 노드의 요청에는 앞 사건(`priorEvents`)이 비어 있다. 대신 이 노드가 `links`로 가리키는 노드(한 단계)의 사건이 `linkedEvents`로 온다. 이 원고에 나온 엔티티의 사건만 오고, 있을 때만 온다.
- `linkedEvents`는 "앞에서 일어난 일"이 아니다. 연결된 항목과 어긋나지 않게 맞추는 데만 쓴다.
- 연결된 노드의 사건이 바뀌면 커밋된 이 노드가 `folio_status`의 `stale`(다시 확인 필요)에 뜬다. 자동으로 고치지 않는다.

## 다음 노드

`folio_run { node: 'next' }`는 순서 없는 작품에서도 트리 차례(폴더 순서)로 다음 노드를 고른다. 링크는 차례를 바꾸지 않는다. 다른 항목을 먼저 쓰려면 노드 id를 준다.

## 찾기 — `folio_find { root, query: 'links', id }`

`id`는 노드 id(그 노드와 자손) 또는 `'*'`(작품 전체)다. 파일에서 바로 읽는다.

- `links`: 범위 안 노드의 링크. 한 줄은 `from`, `to`, `kind`, `label`, `index`(그 노드 links 안의 차례), `valid`(가리키는 노드가 있는가)다.
- `backlinks`: 범위 안 노드를 가리키는 다른 노드의 링크.
- `problems`: 범위 안 링크의 문제.

## 상태 — `folio_status`의 `links`

`{ problems, total }`. `total`은 링크 수다. 문제는 작가에게 보여 준다.

| 코드 | 뜻 |
|---|---|
| `LINK_BROKEN` | 링크가 없는 노드를 가리킨다 |
| `LINK_SELF` | 링크가 이 노드 자신을 가리킨다 |

## 기능 토글 (work.yaml `features`)

- `links`: `folio_find`의 `links`와 `folio_status.links`. 끄면 `FEATURE_DISABLED`·`null`이고 `linkScope`도 꺼진다.
- `linkScope`: 순서 없는 노드가 연결된 노드의 사건을 모은다(`links` 필요). 바꾸면 열린 실행은 검사부터 다시 돈다.

둘 다 기본 켜짐이다. 끄는 것은 작가가 정한다.

## 오류일 때

- `NODE_NOT_FOUND`: `id`가 노드도 `'*'`도 아니다.
- `FEATURE_DISABLED`: 작가가 끈 기능이다. 켤지는 작가에게 묻는다.
````

`skill/folio/SKILL.md` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/skill/folio/SKILL.md b/skill/folio/SKILL.md
index 47ce4ab..ede7197 100644
--- a/skill/folio/SKILL.md
+++ b/skill/folio/SKILL.md
@@ -53,6 +53,7 @@ description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재
 6. **소설 검사**: 소설 세트(기본·웹소설 연재·문체 유지), 작가가 채우는 엔티티 필드, 추출 사건 모양은 [references/novel.md](references/novel.md).
 7. **회사 문서**: 제품 소개서·브로셔의 브랜드 어조·금지 표현·수치 대조 세트(`packs: ['knowledge', 'sources', 'brand']`)는 [references/brand.md](references/brand.md).
 8. **블록·각주·참고문헌·색인**: 그림·표·식 앵커(`{#fig-1-1}`), 블록 참조(`[[block:id]]`), 각주(`[^id]`), 자료 인용(`[[source:id]]`)과 `folio_find`의 `blocks`·`bibliography`·`terms`는 [references/blocks.md](references/blocks.md).
+9. **순서 없는 작품**: 사전·매뉴얼(`order: none`, 지식 책 `reference` 프리셋), 노드 링크(앞머리 `links`), `folio_find`의 `links`, `folio_status.links`는 [references/order.md](references/order.md).

 ## 답하는 법 (`needs_model`)

````

`skill/folio/references/knowledge.md` — 아래 diff를 적용한다(`git apply` 또는 손으로):

````diff
diff --git a/skill/folio/references/knowledge.md b/skill/folio/references/knowledge.md
index 5cc479c..dd50262 100644
--- a/skill/folio/references/knowledge.md
+++ b/skill/folio/references/knowledge.md
@@ -12,13 +12,14 @@
 | `history`(역사) | era → chapter → section | `knowledge.basic` |
 | `guide`(안내서) | chapter → section | `knowledge.basic` |
 | `sourcebook`(자료 책) | part → chapter → section | `knowledge.basic`, `sources.citations` — `packs: ['knowledge', 'sources']`로 만든다. 자료는 `folio_sources`로 넣고 맨 위 노드 앞머리 `sources`에 적으면 위층 계획 요청에 실린다([sources.md](sources.md)) |
+| `reference`(사전·매뉴얼) | part → entry, `order: none` | `knowledge.basic`, `knowledge.unordered` — 앞뒤 검사는 해당 없음, 항목은 앞머리 `links`로 잇는다([order.md](order.md)) |

 프리셋을 틀리게 주면 오류 `PRESET_UNKNOWN`의 `details.packPresets`에 팩별 프리셋이 온다. 작가에게 보여 주고 고르게 한다.

 ## 엔티티 (작가가 `entities/<종류>/<id>.md`로 쓴다)

 - 종류(관례): `concept`(개념), `term`(용어), `example`(예제). 약속("5장에서 자세히", 학습 목표)은 `promise`.
-- 선택 필드: `prerequisites: [id, ...]` — 이 개념을 정의하기 전에 먼저 정의돼야 하는 것. `avoid: [표기, ...]` — 쓰지 않기로 한 표기(용어 통일).
+- 선택 필드: `prerequisites: [id, ...]` — 이 개념을 정의하기 전에 먼저 정의돼야 하는 것. 이 팩을 쓰는 작품에서만 검사 범위를 넓힌다(팩 `scopeFields`). `avoid: [표기, ...]` — 쓰지 않기로 한 표기(용어 통일).
 - `prerequisites`가 배열이 아니거나, 원소가 빈 값이 아닌 문자열이 아니거나, 자기 자신을 적었으면 `PREREQUISITE_INVALID`로 알린다. 없는 엔티티 id를 적었으면 `PREREQUISITE_UNKNOWN`으로 알린다.
 - `avoid`가 배열이 아니거나 문자열 아닌 값을 담거나 그 엔티티의 이름·별칭, 또는 **다른** 엔티티의 이름·별칭과 같은 표기를 담으면 `TERM_AVOID_INVALID`로 알린다(다른 엔티티 이름과 같으면 이름 스캔에 항상 가려 결코 지적될 수 없기 때문이다).
 - 잘못된 `avoid`는 용어 통일이 도는 모든 절에서 매번 `TERM_AVOID_INVALID`로 알린다(작품 전체 엔티티를 보기 때문). 잘못된 `prerequisites`는 그 엔티티를 정의(인용 있는 `term.defined`)하는 절에서만 `PREREQUISITE_INVALID`로 알린다. severity를 block으로 올렸다면 엔티티 파일을 고치기 전까지 그 절들이 막힌다.
@@ -52,6 +53,7 @@ avoid: [세포 막]
 | `knowledge.terms` | 용어 통일(`avoid` 표기, 코드 블록 안은 안 봄, 실험) | 참고 |
 | `knowledge.exercises` | 연습문제가 학습 목표를 덮는지(실험) | 참고 |
 | `knowledge.references`(상호 참조, 추천: textbook·history·guide) | 상호 참조(블록 참조·앵커·각주·자료 인용)(`knowledge.cross-refs`, 실험) | 참고 |
+| `knowledge.unordered`(사전·매뉴얼, 추천: reference) | 노드 링크(`knowledge.links`), 상호 참조, 용어 통일, 연결 항목과 맞춤(`knowledge.linked-consistency`, 모델, 순서 없는 노드만)(모두 실험) | 참고 |

 - 새 검사는 참고 의견(advisory)으로 시작한다. 승인 질문의 `advisories`에 나온다. 참고 의견으로 원고를 고치지 않는다.
 - 작가가 더 세게 원하면 work.yaml에 `checks: { knowledge.defined-before-use: { severity: block } }`처럼 올린다(`hard`는 안 된다). 그러면 지적이 막는 지적이 되고, 넘기려면 작가의 이유가 필요하다.
````

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test test/server/order-docs.test.js`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: 1063/1063(+1).

- [ ] **Step 6: 커밋**

```bash
git add skill/folio/references/order.md skill/folio/SKILL.md skill/folio/references/knowledge.md test/server/order-docs.test.js
git commit -m "docs(skill): unordered works reference

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task D2: N4 완료 기준 — MCP stdio 인수 테스트

> **리뷰: 최종 브랜치 리뷰(가장 강한 모델)에 합친다.** 인수 테스트가 실제 MCP stdio 서버로 도는가(함수 직접 호출이 아닌가), 복사본만 고치는가, 공격 목록 1·3·9가 끝에서 한 번 더 걸리는가.

**Files:**
- Create: `test/acceptance/n4.test.js`

**Interfaces:**
- Consumes: 앞 태스크 전부. 기존 도우미 `test/support/mcp-client.js` `connectFolio`, `test/support/fixtures.js` `copyFixture`·`tempDir`, `test/support/fake-host.js` `label`.
- Produces: N4 완료 기준 다섯 개.
  - N4-1: `reference` 프리셋으로 만든 작품이 `order: none`이고 `folio_config`가 `knowledge.unordered`를 추천한다.
  - N4-2: `folio_find links`·`folio_status.links`가 링크·들어오는 링크·깨진 링크·자기 링크를 보이고, `links: false`면 거절한다.
  - N4-3: 항목 실행이 앞뒤 검사를 해당 없음으로 남기고, `knowledge.linked-consistency`를 `linkedEvents`와 함께 묻고, 깨진 링크를 참고 의견으로 보이고, 커밋된다.
  - N4-4: 연결 항목에 새 사건이 생기면 커밋한 항목이 `stale`, 연결 안 된 항목은 그대로.
  - N4-5: `core.promise-order`는 순서 없는 항목에서 해당 없음이고, 뒤 노드(심는 노드)를 링크한 linear 노드는 여전히 막는다.

- [ ] **Step 1: 인수 테스트를 쓴다**

`test/acceptance/n4.test.js` (148줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openLedger } from '../../core/ledger/ledger.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

/** MCP 너머의 가짜 호스트 모델. drafts·events: 노드 id → 원고·추출 사건. 검사는 지적 없이 답하고, 수정 요청에는 같은 원고를 돌려준다. */
function answerer(drafts = {}, events = {}) {
  return (request) => {
    const p = request.payload;
    if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
    if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획`;
    if (p.produces === 'draft') return drafts[p.node.id] ?? `${p.node.title || p.node.id} 본문.`;
    if (p.produces === 'events') return JSON.stringify({ events: events[p.node.id] ?? [], appearances: [], mentions: [] });
    throw new Error(`no answer for ${request.purpose}/${p.produces}`);
  };
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** until 을 만날 때까지 run/resume/decide(approve) 를 MCP 로 돌린다. 요청은 모두 모아 돌려준다. */
async function drive(folio, root, start, answer, until) {
  const labels = [];
  const requests = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 60; i += 1) {
    labels.push(label(out));
    if (until(out)) return { labels, requests, out };
    if (out.status === 'needs_model') {
      requests.push(...out.requests);
      out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}`);
  }
  throw new Error('drive did not finish');
}

/** fixture 복사본의 work.yaml 에 설정을 더하고 합성 사건을 넣는다(작가·앞 실행이 한 일). 원본 fixture 는 그대로. */
async function work(fixture, config = {}, seeds = []) {
  const root = await copyFixture(fixture);
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), ...config }));
  const ledger = openLedger(root, 'events', { now: () => '2026-09-30T00:00:00.000Z' });
  for (const [index, seed] of seeds.entries()) await ledger.append({ type: 'event', eventId: `seed-${index + 1}`, receiptId: 'seed', ...seed });
  return root;
}

const receiptOf = async (root, nodeId) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === nodeId).at(-1);
const factsOf = async (root, nodeId) => (await receiptOf(root, nodeId)).steps.find((s) => s.id === 'facts').checks.map((c) => [c.checkId, c.status]);
const until = (status) => (o) => o.status === status;
const UNORDERED = { checkSets: ['knowledge.basic', 'knowledge.unordered'] };

test('N4-1 over MCP stdio the reference preset makes an unordered work and folio_config recommends the unordered set for it', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = join(await tempDir('folio-n4-'), 'dictionary');
  assert.equal((await ok(folio.call('folio_init', { root, title: '작은 사전', preset: 'reference', packs: ['knowledge'] }))).created, true);
  const yaml = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  assert.deepEqual([yaml.order, yaml.levels.map((l) => l.name), yaml.checkSets], ['none', ['part', 'entry'], ['knowledge.basic', 'knowledge.unordered']]);
  const config = await ok(folio.call('folio_config', { root, workKind: 'reference' }));
  const unordered = config.recommended.find((r) => r.setId === 'knowledge.unordered');
  assert.deepEqual([unordered.selected, unordered.reasons], [true, [{ kind: 'workKind', value: 'reference' }]]);
  assert.deepEqual((await ok(folio.call('folio_status', { root }))).links, { problems: [], total: 0 });
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N4-2 folio_find links and folio_status.links show every link, backlinks and broken or self links; turning links off refuses', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work('reference-book');
  const all = await ok(folio.call('folio_find', { root, query: 'links', id: '*' }));
  assert.deepEqual(all.links.map((l) => `${l.from}>${l.to}:${l.valid}`), [
    'cell>membrane:true', 'membrane>cell:true', 'membrane>ghost-entry:false', 'nucleus>nucleus:true', 'atp-entry>mitochondria:true', 'atp-entry>membrane:true',
  ]);
  const membrane = await ok(folio.call('folio_find', { root, query: 'links', id: 'membrane' }));
  assert.deepEqual(membrane.backlinks.map((l) => l.from), ['cell', 'atp-entry']);
  const status = await ok(folio.call('folio_status', { root }));
  assert.deepEqual([status.links.total, status.links.problems.map((p) => [p.code, p.nodeId, p.to])], [6, [['LINK_BROKEN', 'membrane', 'ghost-entry'], ['LINK_SELF', 'nucleus', 'nucleus']]]);
  const game = await work('gamebook');
  const choices = await ok(folio.call('folio_find', { root: game, query: 'links', id: '*' }));
  assert.deepEqual([choices.links.map((l) => `${l.from}>${l.to}:${l.kind}`), choices.problems], [['gate>left-path:choice', 'gate>right-path:choice', 'left-path>ending-key:choice', 'right-path>ending-trap:choice'], []]);
  const off = await work('reference-book', { features: { links: false } });
  const refused = await folio.call('folio_find', { root: off, query: 'links', id: '*' });
  assert.deepEqual([refused.error.code, refused.error.details.feature], ['FEATURE_DISABLED', 'links']);
  assert.equal((await ok(folio.call('folio_status', { root: off }))).links, null);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N4-3 an entry run keeps order checks not applicable, asks linked-consistency with linkedEvents, shows the broken link as advice and commits', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work('reference-book', UNORDERED, [{ nodeId: 'cell', entityId: 'cell-membrane', kind: 'term.defined' }]);
  const { out, labels, requests } = await drive(folio, root, { node: 'membrane' }, answerer({ membrane: '세포막은 세포의 바깥 경계다.' }), until('needs_user'));
  assert.deepEqual(labels, ['model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve']);
  const critic = requests.find((r) => r.stepId === 'critic').payload;
  assert.deepEqual(critic.checks.map((c) => c.checkId), ['knowledge.critic', 'knowledge.linked-consistency']);
  assert.deepEqual([critic.priorEvents, critic.linkedEvents.map((e) => `${e.nodeId}:${e.entityId}`)], [[], ['cell:cell-membrane']]);
  assert.deepEqual(out.question.advisories.map((f) => [f.checkId, f.code, f.severity]), [['knowledge.links', 'LINK_BROKEN', 'advisory']]);
  assert.equal((await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }))).status, 'done');
  assert.deepEqual(await factsOf(root, 'membrane'), [
    ['core.promise-order', 'not_applicable'], ['knowledge.defined-before-use', 'not_applicable'], ['knowledge.prerequisite-order', 'not_applicable'],
    ['knowledge.links', 'passed'], ['knowledge.cross-refs', 'passed'], ['knowledge.term-consistency', 'passed'],
  ]);
  assert.deepEqual((await receiptOf(root, 'membrane')).order, { mode: 'none', ordered: false });
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N4-4 a new event on a linked entry marks the committed entry stale; an unlinked entry stays clean', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await work('reference-book', { checkSets: ['knowledge.unordered'] });
  const drafts = { 'atp-entry': 'ATP는 세포의 에너지 화폐다.', nucleus: '핵은 ATP를 쓰지 않는다고 적는다.', mitochondria: '미토콘드리아는 ATP를 만든다.' };
  const events = { mitochondria: [{ entityId: 'atp', kind: 'term.redefined', quote: '미토콘드리아는 ATP를 만든다' }] };
  const answer = answerer(drafts, events);
  for (const node of ['atp-entry', 'nucleus', 'mitochondria']) await drive(folio, root, { node }, answer, until('done'));
  const status = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(status.stale.map((s) => [s.nodeId, s.reasons.map((r) => `${r.kind}:${r.id}`)]), [['atp-entry', ['entity:atp']]]);
  assert.doesNotMatch(folio.stderr(), /Error/);
});

test('N4-5 core.promise-order is not applicable on a none entry but still blocks a linear node that links to the later plant', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const resolve = (entityId) => [{ entityId, kind: 'promise.resolved' }];
  const none = await work('reference-book', { checkSets: [] }, [{ nodeId: 'mitochondria', entityId: 'later', kind: 'promise.planted' }]);
  await mkdir(join(none, 'entities', 'promise'), { recursive: true });
  await writeFile(join(none, 'entities', 'promise', 'later.md'), '---\nid: later\nkind: promise\nname: 뒤에서\n---\n');
  await drive(folio, none, { node: 'atp-entry' }, answerer({}, { 'atp-entry': resolve('later') }), until('done'));
  assert.deepEqual(await factsOf(none, 'atp-entry'), [['core.promise-order', 'not_applicable']]);
  const linear = await work('knowledge-book', { checkSets: [] }, [{ nodeId: 'membranes', entityId: 'energy-detail', kind: 'promise.planted' }]);
  const cell = join(linear, 'tree', '01-part-basics', '01-chapter-cells', '01-what-is-a-cell.md');
  await writeFile(cell, (await readFile(cell, 'utf8')).replace(/^---\n/, '---\nlinks:\n  - to: membranes\n'));
  const { out } = await drive(folio, linear, { node: 'what-is-a-cell' }, answerer({}, { 'what-is-a-cell': resolve('energy-detail') }), until('needs_user'));
  assert.deepEqual([label(out), out.question.canApprove, out.question.blocking.map((f) => [f.checkId, f.code, f.severity])],
    ['user:blocked', false, [['core.promise-order', 'PROMISE_RESOLVED_BEFORE_PLANT', 'hard']]]);
  assert.equal((await folio.call('folio_decide', { root: linear, runId: out.runId, action: 'approve' })).error.code, 'APPROVE_BLOCKED_BY_HARD');
  assert.doesNotMatch(folio.stderr(), /Error/);
});
````

- [ ] **Step 2: 돌려 본다**

Run: `node --test test/acceptance/n4.test.js`
Expected: PASS 5개. 인수 테스트는 A1~D1이 만든 동작을 끝에서 묶어 보는 것이라 처음부터 초록이다(빨강 단계 없음). 하나라도 빨강이면 앞 태스크 회귀다 — 여기서 고치지 말고 그 태스크로 돌아간다.

- [ ] **Step 3: 전체 확인**

Run: `npm run check`
Expected: 1068/1068(+5).

- [ ] **Step 4: 커밋**

```bash
git add test/acceptance/n4.test.js
git commit -m "test(acceptance): N4 unordered works over MCP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 마일스톤 정지**

결과(커밋 범위, 테스트 수, 판정 기록 `docs/plans/2026-09-30-n4-order-none-rulings.md`)를 사용자에게 보이고 멈춘다. main 병합·push·PR·정본 수정은 사용자에게 묻는다.

---

## 자기 점검

### 레인 절·프롬프트 대조

| 요구(레인 절 L3 N4·프롬프트) | 어디서 |
|---|---|
| none에서 앞쪽 범위가 "연결된 노드의 사건"을 모으는 법 | 설계 요약 "앞쪽 범위", 결정 1~4, A3 |
| 상호 참조 중심 검사 목록과 링크 유효성(깨진 링크 보고) 검사 | 결정 9·10, A2(`folio_status.links`), B1(`folio_find links`), C1(`knowledge.links`, `knowledge.unordered`) |
| run next의 순서 | 결정 11, A3 6번 테스트(트리 차례 고정), `core/run/next.js` 안 고침 |
| `none`과 `branching`을 지금 같이 다루되 N4는 `none`만 정함, `branching` 갈림 자리 | 결정 5·6, A1(`unorderedBy`, branching이 앞섬), A3(`linkedScope`의 `case 'branching'`), A4(`REQUIRES_ORDER` 끝에 N7이 더함) |
| `core.promise-order`는 비선형에서 해당 없음, 잠금 약화 없음 | 공격 목록 1~9, A4 테스트 3·4·5, C1 `knowledge-links` 2번, D2 N4-3·N4-5 |
| 노드 연결 표 조회 함수 이름 고정(N7·M6b) | 설계 요약 "N7·M6b 계약", 결정 12, A2(`query.js` 다시 내보내기와 계약 테스트) |
| 추가만: `yaml-schema.js`(`requiresOrder` 값), `definitions.js`(enum 끝), `features.js` | A4·A5, B1, A2 |
| 미룬 minor(N1): `scope.js`가 모든 팩의 `prerequisites`를 읽음 | 결정 17, A5 |
| 가장 강한 리뷰어의 공격 목록 | "공격 목록" 절과 A1~A5·B1·C1의 "공격해 볼 것" |

### 빈칸·이름 점검

- "TBD", "TODO", "나중에", "적당히" 없음. 모든 코드 단계는 scratch 커밋에서 기계적으로 꺼낸 전체 파일(새 파일) 또는 전체 diff(고치는 파일)다. 새 파일 머리에는 "`path` (N줄):"를 적었다.
- 이름 일치(계획 전체에서 같은 철자): `unorderedBy`, `linkedScope`, `linkedNodeIds`, `linkedEvents`, `eventsOn`, `linkTable`, `linksFrom`, `linksTo`, `linksStatus`, `SCOPE_FIELDS`, `scopeFields`, `LINK_BROKEN`, `LINK_SELF`, `knowledge.links`, `knowledge.linked-consistency`, `knowledge.unordered`, `reference`, 기능 `links`·`linkScope`.
- A1 `graph.js`는 A2에서 `linksStatus`를 더하고, A5 `scope.js`·`payload.js`·`yaml-schema.js`는 A3·A4 위에 쌓인다. 그래서 같은 파일이 두 태스크에 나오면 뒤 태스크 블록은 앞 태스크 결과에 대한 diff다. 태스크 순서를 바꾸지 않는다.
- 300줄: 가장 긴 코드 파일 `core/pack/yaml-schema.js` 218줄, `core/scope/scope.js` 99줄, 가장 긴 테스트 `test/acceptance/n4.test.js` 148줄.

### 시험 실행

scratch worktree(`main` `4117bbb`에서 detach, 이 계획의 블록을 태스크 순서대로 적용)에서 태스크마다 `npm run check`(lint·typecheck·test)를 돌렸다. 마친 뒤 scratch worktree는 지웠다. 빨강 단계는 따로 확인했다: 태스크마다 앞 태스크까지의 상태에 그 태스크의 테스트 파일(fixture 포함)만 올리고 Step 2 명령을 돌려, 각 Step 2의 "Expected"에 적은 실패 목록이 실제와 같음을 봤다.

| 태스크 | 적용한 블록(새 파일 / diff) | `npm run check` | 늘어난 테스트 | 걸린 시간 |
|---|---|---|---|---|
| 시작(`main` `4117bbb`) | — | 1030/1030 | — | — |
| A1 | 13 / 3 | 1036/1036 | +6 | 54 s |
| A2 | 1 / 6 | 1039/1039 | +3 | 56 s |
| A3 | 2 / 2 | 1046/1046 | +7 | 57 s |
| A4 | 1 / 2 | 1052/1052 | +6 | 56 s |
| A5 | 2 / 7 | 1055/1055 | +3 | 56 s |
| B1 | 1 / 3 | 1058/1058 | +3 | 56 s |
| C1 | 3 / 7 | 1062/1062 | +4 | 57 s |
| D1 | 2 / 2 | 1063/1063 | +1 | 60 s |
| D2 | 1 / 0 | 1068/1068 | +5 | 68 s |

- 블록은 이 계획서에서 기계적으로 꺼내 적용했다(새 파일은 줄 수를 대조하고 쓰기, diff는 `git apply`). 태스크마다 Step 6의 `git add`·`git commit`을 그대로 돌렸고, 커밋 뒤 작업 트리에 남은 파일이 없었다(add 목록이 빠짐없음).
- D2 뒤 트리는 계획을 만든 scratch 결과와 한 바이트도 다르지 않다(`git diff` 빈 결과).
- 시험 실행 때 머신 부하가 높았다(load average 약 27). 시간은 참고용이다.

- 팩 digest: 내장 팩 넷의 `packDigest`를 `main`과 D2 뒤에서 비교했다. `knowledge`만 바뀌고 `novel`·`sources`·`brand`는 같다(공격 목록 12, "호환이 바뀌는 것").

### 시험 실행하지 않은 것

- CI 매트릭스(Node 22·24·26, Windows). 로컬은 macOS, Node v23.11.0 하나만 돌렸다. `\` 경로·줄끝 차이는 기존 `tree.js`·fixture 복사 도우미가 맡고 새 코드는 경로를 만들지 않지만, Windows에서 돌려 보지 않았다.
- 실제 Claude Code 호스트로 사전 작품을 만들고 쓰는 사람 흐름. 인수 테스트(D2)는 가짜 호스트 모델로 MCP stdio를 돈다.
- `knowledge.linked-consistency`에 실제 모델이 답하는 품질. 지시문(`checks/linked-consistency.md`)은 가짜 답으로만 흐름을 봤다.
- N7·M6b가 연결 조회 계약을 실제로 쓰는 것. 계약 테스트(A2)는 이름·모양·index.db 없음만 고정한다.
- 다른 레인 브랜치(M6b 등)와의 병합. 핫스팟(`features.js` 끝, `query.js` 끝, `definitions.js` enum 끝, `status.js`)은 끝에 더하는 규칙대로 적었지만 실제 병합 충돌은 병합 때 본다.
- 큰 작품의 성능. `linksTo`·`linkTable`은 노드 수 × 링크 수로 돈다. 노드 2천 개·링크 6천 개 합성 트리(메모리 객체, 파일 읽기 제외)에서 한 번 재어 본 것뿐이다(`linkTable` 약 6 ms, `linksTo` 약 1.4 ms, macOS Node v23.11.0). 벤치마크 테스트는 두지 않았다.
