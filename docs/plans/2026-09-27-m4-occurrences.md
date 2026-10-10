# Folio M4 등장 위치 목록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트가 제출한 등장 위치(엔티티 · 등장/언급 · 인용문 · 앞뒤 문맥)를 본문과 대조해 추가만 되는 기록장에 쌓는다. 본문이 바뀐 뒤에는 다시 찾고, 못 찾으면 stale로 둔다. 이름 바꾸기는 메모리에서 계획 → 작가 승인 → 한 번에 쓰기로 한다(중간 실패 시 파일 변화 없음). 이름 바꾸기로 바뀐 커밋 원고는 `recommit` 실행으로 다시 검사·커밋한다. 모든 기능은 `work.yaml` `features`로 켜고 끈다.

**Architecture:** 새 폴더 `core/occurrences/`가 표면(노드 본문·엔티티 설명·그림 설명서·자료 글 필드) 읽기, 인용문 대조·다시 찾기(`anchor.js`), 제출 검증, 기록장(`.folio/ledger/occurrences.jsonl`), 지금 위치 계산을 맡는다. index.db는 계산 결과를 `marks` 표로 투영한다(지워도 다시 만듦). 이름 바꾸기는 `core/rename/`의 순수 계획 함수와 `core/util/file-tx.js`(journal + 백업, 작업 잠금을 잡을 때 복구)를 쓰는 적용 함수로 나눈다. `recommit`은 실행기의 새 모드다. 파일 본문을 원고로 채우고, 나머지 단계(추출·검사·게이트·커밋)와 잠금은 보통 실행과 같다. 도구는 `folio_occurrences`(제출·적용) 하나를 더하고, `folio_find`에 `candidates`·`rename`(계획)을 더한다.

**Tech Stack:** Node ESM + JSDoc, `node:test`, `node:sqlite`, `yaml`, `@modelcontextprotocol/sdk`(1.x, stdio, 저수준 `Server`), ESLint 9 + TypeScript(`checkJs`).

**Spec:** 착수 계획서 아티팩트 https://claude.ai/artifact/WjJzcsjnQZnVxyyJZaxvcX (유일한 설계 정본 — §15 등장 위치 목록, §10 검사 범위, §09 잠금, §16 MCP 도구, §20 M4). 범위 변경 결정: `docs/plans/2026-09-27-scope-nonfiction-decision.md`. 앞 계획·판정: `docs/plans/2026-09-27-locks-levels-m3.md`, `docs/plans/2026-09-27-locks-levels-m3-rulings.md`.

## Global Constraints

- 이름 `Folio`, MCP 도구 접두어 `folio_`, 작품 내부 폴더 `.folio/`.
- `package.json` `"engines": { "node": "^22.13.0 || ^24.0.0 || ^26.0.0" }`, `"type": "module"`. 런타임 의존성은 `yaml`과 `@modelcontextprotocol/sdk` 둘뿐이다. 늘리지 않는다. 네이티브 모듈은 금지다.
- `core/`와 `packs/`는 모델·네트워크를 부르지 않는다(`test/core/no-model-calls.test.js`). `server/`만 SDK를 import한다.
- `server/`는 `core/run/commit.js`, `core/run/recheck-commit.js`, `core/structure/ops.js`, `core/ledger/ledger.js`, `core/store/tree.js`를 import하지 않는다(`test/server/tools.test.js` 가드). 이 계획에서 새로 생기는 쓰기 경로 `core/rename/apply.js`, `core/util/file-tx.js`도 가드 목록에 넣는다. 서버는 `applyRename`·`submitOccurrences`를 부른다 — 둘 다 작업 잠금을 스스로 잡는 공개 함수다.
- 잠금 규칙(설정·팩·기능 토글로 끌 수 없음): 커밋 원고 hash = 검사 원고 hash · 영수증 없이 커밋 금지 · 켜 둔 검사의 hard 판정은 커밋을 막고 승인으로 넘길 수 없음 · 기록장은 추가만 · 같은 호스트 자기검토를 독립 평가로 표기 금지 · soft·참고 의견은 자동 수정 사유 아님 · 엔진은 `needs_model`/`needs_user`를 돌려주고 resume으로 이어감.
- **기능 토글은 기능만 없앤다.** 어떤 `features` 값도 잠금을 약하게 하지 않는다. 꺼진 기능을 부르면 `FEATURE_DISABLED`로 분명히 거부한다(조용히 무시하지 않는다).
- 테스트 데이터는 전부 합성 fixture다. 임시 폴더는 `test/support/fixtures.js`의 `tempDir`/`copyFixture`만 쓴다. 원본 fixture 파일을 고치지 않는다.
- 파일 하나에 한 책임. 300줄을 넘기면 나눈다.
- 문서·주석 설명은 한국어, 코드 식별자는 영어. 커밋 메시지는 영어 Conventional Commits, 끝에 정확히 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `.superpowers/`는 커밋하지 않는다. 각 Task는 자기 파일만 커밋한다.
- TDD: 실패하는 테스트 → 실패 확인 → 구현 → 통과 → `npm run check` 전부 초록 → 커밋. 기존 테스트의 assert를 약화하지 않는다. 기존 테스트를 바꾸는 곳은 이 계획이 이유와 함께 적은 곳뿐이다.
- 머신 부하가 높으면 전체 테스트가 몇 분 걸릴 수 있다. 느려졌다고 회귀로 단정하지 말고 같은 조건에서 기준 커밋과 비교한다.
- 마일스톤 정지: Task D3(M4 완료 기준)이 끝나면 결과를 보여 주고 멈춘다. main 병합·push·PR은 사용자에게 묻는다.

---

## 현재 상태 (2026-09-27, M4 구현 끝, 사용자 인수 대기)

- M4의 태스크 A1~D3와 최종 수정 한 번을 모두 마쳤다. `npm run check` 621/621, `test/acceptance/m4.test.js` 14/14.
- 계획과 다르게 판정한 내용과 미뤄 둔 사소한 항목은 `docs/plans/2026-09-27-m4-occurrences-rulings.md`에 있다. 그 판정이 이 계획의 해당 부분보다 앞선다. 주요 판정은 A3-1, A3-4, C1-3~7, C2-1~4, C3-1~2, C4-1~4, F-1~5이다.
- 다음 단계: 사용자가 확인한 뒤 N1(지식 팩)을 시작한다. main 병합, push, PR은 사용자에게 묻고 한다.

## 현재 상태 — 시작 시점 기록 (이 계획을 시작하는 시점, HEAD `d777c41`, 브랜치 `feat/m4-occurrences`)

새 세션이 이전 대화 없이 이어받을 수 있게 적는다.

### 끝난 일

- M0~M3 끝남. 브랜치 `feat/locks-levels-m3`(main 미병합, push 안 함)에서 `feat/m4-occurrences`를 땄다. `npm run check` 470/470.
- 이 브랜치의 첫 커밋 `d777c41`은 범위 변경 결정 기록(`docs/plans/2026-09-27-scope-nonfiction-decision.md`)이다. 비문학(지식 책·자료 근거·상호 참조·순서 없음·브랜드·판본·분기·지면·내보내기)도 이번 흐름에서 만든다. 순서: M4 → N1 → N2 → N3 → N4 → M5 → M6 → M7 → N5 → N6 → N7 → N8.
- MCP 서버 `folio`(`bin/folio-mcp.js`)와 스킬 `skill/folio`는 등록돼 있다. 도구 9개: 기본 8 + `folio_config`.
- 코어에는 비문학 자리가 있다: 자료 저장, 약속, 블록 앵커, `role`, `order`, 판본 키 `main`. knowledge-book fixture는 가짜 팩 테스트만 통과한다. 실제 비문학 팩은 없다(N1부터).

### 모듈 지도 (이 계획이 건드리는 것)

| 파일 | 하는 일 |
|---|---|
| `core/work/config.js` | `validateWorkConfig(raw)` → `{config, errors, warnings}`. `options`는 알려진 불리언만(`WORK_OPTIONS`) |
| `core/store/work.js` | `openWork(root)` → `{config, tree, positions, entities, sources, assets, blocks, warnings}` |
| `core/store/blocks.js` | `parseBlocks(body)` — 코드 블록 안도 읽는다(넘긴 항목, Task A2가 고친다) |
| `core/index/scan.js` | `scanMentions(text, entities)` → `Map<entityId, count>`. 이름·별칭 정확 일치 |
| `core/index/{schema,rebuild,query}.js` | index.db. `occurrences` 표는 scan·declared 결과(count)다. 호스트 제출은 아직 없다 |
| `core/scope/scope.js` | `gatherScope({work, events, nodeId, draftText, extracted})` → `{entityIds, refs, ...}` |
| `core/run/steps/generate.js` | `parseEvents(answer, work, draft)` → `{events, appearances, mentions}` |
| `core/run/steps/commit-step.js` | 커밋 단계. `commitNode` 호출 |
| `core/run/runner.js` | `createRunner` → `{run, resume, decide}`. `RUN_MODES = ['normal', 'recheck']`. `run.mode`는 `open`·`derive`·`recheck` |
| `core/run/sync.js` | `outOfSync(run, ctx)`: 파이프라인·검사 digest·order가 바뀌었는가 |
| `core/run/work-lock.js` | `withWorkLock(root, fn)` |
| `core/run/receipt-builder.js` · `core/ledger/receipts.js` | 영수증 만들기·검증 |
| `core/scope/stale.js` · `stale-checks.js` | `findStale`, 이유(`check`·`order`·`structure`) |
| `core/status.js` | `workStatus(root, {packs})` |
| `server/tools/{definitions,handlers,find,config}.js`, `server/toolbox.js`, `server/validate-input.js` | 도구 층 |
| `packs/novel/prompts/extract.md` | 추출 답 모양(`events`, `appearances`, `mentions`) |
| `test/support/*` | `fake-pack.js`(`fakePacks()`), `fake-host.js`(`createFakeHost`, `driveToEnd`, `label`), `fixtures.js`(`copyFixture`, `useFakePack`, `seedEvents`, `tempDir`), `mcp-client.js`(`connectFolio`), `crash.js`·`child-runner.js`(SIGKILL 시나리오) |

### 이 계획이 처리하는 넘긴 항목

- `parseBlocks`의 코드 블록 건너뛰기 → Task A2. 스캔·인용문 대조도 같은 코드 블록 범위를 쓴다.
- 도구 오류 메시지 다듬기(C6 minor): `INTERNAL_ERROR`에 raw Node 메시지, FolioError 메시지가 사용자 입력을 무한히 되돌림(자르기), `folio_structure` `index` 상한 없음 → Task D1.
- scan 기반 범위가 대명사·호칭으로만 나온 등장을 못 봄(C4 minor) → Task B3(추출 occurrences가 appearances에 들어감), Task B4(`occurrenceScope`).

### 이 계획에서 하지 않는 것 (계속 넘김)

- 본문 주장 ↔ 자료 구간 **근거 연결**: N2의 정의 범위다. N2는 이 계획의 `resolveQuote`/`reanchor`/표면 모듈을 그대로 쓴다.
- 묶기 도중 죽었을 때 복구(doctor), 기록장 찢어진 마지막 줄 분류, Windows EPERM 재시도.
- 한국어 조사 자동 교정: 이름 바꾸기 계획이 받침이 달라지는 곳에 경고만 단다. 고치는 것은 작가 몫이다.
- 그림 생성 자체(M7), 뷰어(M6).

---

## 결정 (이 계획에서 정한 것)

| # | 문제 | 결정 |
|---|---|---|
| 1 | 등장 위치를 어디 저장하나 | 호스트 제출은 파일에서 다시 만들 수 없다 → 추가만 되는 기록장 `.folio/ledger/occurrences.jsonl`. 기록 하나 = 표면 하나(`{kind, id, field}`) × 그때 표면 글 hash × 항목들. 같은 표면의 새 기록이 앞 기록을 대신한다(지우지 않음). 글자 번호는 저장하지 않는다. 위치는 읽을 때 계산한다 |
| 2 | 표면 | `node`(본문), `entity`(설명 본문), `asset`(brief의 글 leaf, `field`=JSON Pointer), `source`(설명서의 글 leaf, `id`·`file`·`date`·`reliability`·`/spans/N/id` 제외). 자료 원본 파일은 표면이 아니다 |
| 3 | 제출 대조 | `{entityId, kind: appearance\|mention, quote, before?, after?}`. 인용문은 1~500자이고 코드 블록 밖에 정확히 있어야 한다. 한 곳이면 엔진이 앞뒤 30자를 잘라 저장한다. 여러 곳이면 호스트가 준 before/after로 한 곳으로 좁혀야 한다. 하나라도 틀리면 전부 거부(`OCCURRENCES_INVALID`, 기록 없음). 인용문에 이름이 없어도 된다(대명사·호칭) |
| 4 | 다시 찾기 | 코드 블록 밖의 인용문 위치마다 (앞 문맥 공통 꼬리 + 뒤 문맥 공통 머리) 점수를 매긴다. 가장 높은 곳이 하나면 문맥이 온전할 때 `located`, 아니면 `relocated`. 동점이면 `stale`(`AMBIGUOUS`). 인용문이 없으면 `stale`(`QUOTE_MISSING`), 표면이 없으면 `SURFACE_MISSING`, 엔티티가 없으면 `ENTITY_MISSING` |
| 5 | stale 알리기 | `folio_status`의 새 키 `occurrences: { stale: [...], total }`(기능이 꺼져 있으면 `null`). 노드 단위 "다시 확인 필요"(영수증 참고 버전)와 섞지 않는다. 호스트가 다시 제출한다 |
| 6 | 추출 단계 제출 | `occurrencesInExtract`가 켜져 있으면 추출 요청 payload에 `occurrences: { wanted: true }`를 싣는다. 답의 `occurrences`는 **선택**이다. 없으면 기록 없음(기존 호스트·테스트 호환). 있는데 틀리면 기존 재요청 규칙(3회 → 사람, 승인 불가). 맞으면 appearance/mention이 `appearances`/`mentions`에 합쳐진다. 커밋이 끝난 뒤 origin `extract`, `receiptId`와 함께 기록한다(같은 receiptId로 두 번 쓰지 않음) |
| 7 | 기능 토글 | `work.yaml` `features`: `occurrences: true`, `occurrencesInExtract: true`, `occurrenceScope: false`, `rename: true`, `recommit: true`. `occurrencesInExtract`·`occurrenceScope`·`rename`은 `occurrences`가 켜져 있어야 한다(`FEATURE_REQUIRES`). 모르는 키는 `FEATURE_UNKNOWN`, 불리언이 아니면 `FEATURE_INVALID`. 실행 결과를 바꾸는 두 기능(`occurrencesInExtract`, `occurrenceScope`)의 digest를 실행 파일(`featuresDigest`)에 두고, 바뀌면 `outOfSync` → 검사부터 다시 돈다(`ANSWER_STALE` 포함) |
| 8 | `occurrenceScope` | 켜면 검사 범위가 기록된 등장 위치(stale 아닌 것)도 본다. (a) 이 노드의 본문이 파일과 같을 때(재검사·recommit) 이 노드 표면의 등장, (b) 위층 계획(`upperMentions`), (c) 그림(엔티티 등장으로 이어짐). 영수증·재검사 기록에 선택 필드 `features: { occurrenceScope }`를 남긴다. 지금 값과 다르면 `findStale`이 `{kind:'feature', id:'occurrenceScope'}` 이유를 낸다(재검사로 풀린다). 옛 영수증(필드 없음)은 `false`로 본다 |
| 9 | 이름 바꾸기 대상 | 엔티티 파일(`name`, `keepOldName`이면 옛 이름을 `aliases`에 추가), 노드 본문, 엔티티 설명, 그림 brief 글 leaf. 자료는 바꾸지 않고 계획의 `untouched`에 `SOURCE_IMMUTABLE`로 적는다. 바뀔 곳 = stale 아닌 등장 위치 인용문 안의 옛 이름(`source: 'occurrence'`, 기본 포함) + 그 밖에서 scan으로 찾은 옛 이름(`source: 'scan'`, 기본 제외, `include`로 고른다 — "하나"처럼 흔한 낱말 보호). 코드 블록 안은 제외 |
| 10 | 이름 바꾸기 쓰기 | `folio_find query:rename`이 계획과 `planDigest`를 준다(읽기 전용). `folio_occurrences op:rename`은 같은 인자 + `planDigest`로 작업 잠금 안에서 계획을 다시 만들고, digest가 다르면 `RENAME_PLAN_STALE`로 거부한다(아무것도 안 씀). 열린 실행이 있으면 `RENAME_RUN_OPEN`. 쓰기는 `core/util/file-tx.js`: 백업 → journal → 파일마다 원자적 쓰기. 실패하면 백업으로 되돌린다. 프로세스가 죽으면 다음 `withWorkLock` 진입이 journal로 되돌린다. 쓴 뒤 바뀐 표면의 등장 위치를 origin `rename`으로 다시 기록한다 |
| 11 | 커밋 원고를 이름 바꾸기가 고치면 | 잠금 때문에 조용히 다시 커밋하지 않는다. 바뀐 커밋 노드는 기존 `HAND_EDITED` drift가 된다. 적용 결과의 `recommit: [nodeId...]`로 알린다 |
| 12 | `recommit` 모드 | `run({ node, mode: 'recommit' })`. 커밋 기록이 있고 지금 본문 hash가 커밋 hash와 다르거나(`HAND_EDITED`), 앞머리만 committed이고 커밋 기록이 없는(`COMMITTED_WITHOUT_RECORD`) 노드만 받는다. 아니면 `RECOMMIT_NOT_NEEDED`. 본문이 비면 `RECOMMIT_EMPTY`. 기능이 꺼져 있으면 `FEATURE_DISABLED`. 파이프라인 전체를 돌되, 루프 아닌 `plan`·`draft` 생성 단계는 파일 본문으로 채우고 `passed`(`source: 'file'`)로 적는다. `children` 단계는 `not_needed`(`source: 'recommit'`). 추출·검사·수정 루프·게이트·커밋·영수증·판정 대조는 보통 실행과 같다 — 호스트가 draft 요청에 파일 본문을 그대로 답한 것과 같은 힘이다 |
| 13 | 도구 | 새 도구 `folio_occurrences`(`op: submit \| rename`). `folio_find`에 `candidates`(표면의 scan 후보 + 인용문·문맥), `rename`(계획)을 더하고, `usages`에 `marks`를 더한다. `folio_run` `mode`에 `recommit`. `folio_init`에 `features`. `folio_config`에 `features` 그림. 도구 10개 |
| 14 | 도구 오류 | FolioError 메시지는 300자로 자른다(`…`). 그 밖의 오류는 `INTERNAL_ERROR`에 메시지를 300자로 잘라 싣고 `details.errno`(있으면 Node 오류 코드)를 준다. `validate-input`에 `maxLength`·`maxItems`·`maximum`을 더하고, `index`는 `maximum: 100000`, 인용문 `maxLength: 500`, 항목 `maxItems: 500`, 이름 `maxLength: 200` |

## 파일 구조

```
core/
  work/features.js           (새)  FEATURES, FEATURE_PARENTS, RUN_FEATURES, readFeatures, featuresDigest, assertFeature
  work/config.js             (수정) config.features
  work/init.js               (수정) initWork(..., { features })
  util/fences.js             (새)  fencedRanges, fencedLines, inRanges, maskRanges
  store/blocks.js            (수정) 코드 블록 안 줄은 건너뜀
  index/scan.js              (수정) 코드 블록 가림
  occurrences/surfaces.js    (새)  SURFACE_KINDS, stringLeaves, surfaceFields, surfaceText, surfaceKey, allSurfaces
  occurrences/anchor.js      (새)  CONTEXT_CHARS, MAX_QUOTE, matchesOf, resolveQuote, reanchor
  occurrences/records.js     (새)  OCCURRENCES_LEDGER, OCCURRENCE_KINDS, MAX_ITEMS, latestBySurface
  occurrences/validate.js    (새)  validateItems
  occurrences/state.js       (새)  occurrenceStates, staleOccurrences, liveMarks
  occurrences/submit.js      (새)  submitOccurrences
  occurrences/candidates.js  (새)  candidatesFor
  occurrences/record-run.js  (새)  recordRunOccurrences
  index/schema.js · rebuild.js · query.js (수정) marks 표, marksOf
  run/workspace.js           (수정) featuresDigest
  run/runner.js              (수정) featuresDigest, occurrences 기록장, recommit 모드
  run/sync.js                (수정) featuresDigest 비교·갱신
  run/steps/generate.js      (수정) occurrences 대조, recommit 채우기
  run/steps/children.js      (수정) recommit 에서 not_needed
  run/steps/commit-step.js   (수정) 커밋 뒤 recordRunOccurrences
  run/recommit-plan.js       (새)  RECOMMIT_MODE, assertRecommitNeeded, newRecommitRun
  run/payload.js             (수정) scopeFor 가 marks 를 넘김, extract 요청 occurrences.wanted
  run/receipt-builder.js     (수정) features
  run/steps/recheck-step.js  (수정) features
  ledger/receipts.js         (수정) FEATURES_INVALID
  scope/scope.js             (수정) marks(선택)
  scope/stale.js · stale-checks.js (수정) featureReason
  run/work-lock.js           (수정) 잠금 뒤 recoverFileTx
  util/file-tx.js            (새)  TX_DIR, writeFilesTx, recoverFileTx, pendingFileTx
  rename/plan.js             (새)  planRename
  rename/josa.js             (새)  josaWarning
  rename/apply.js            (새)  applyRename
  status.js                  (수정) occurrences, TX_INTERRUPTED 경고
server/
  tools/definitions.js       (수정) folio_occurrences, find·run·init·structure 인자
  tools/handlers.js          (수정)
  tools/find.js              (수정) marks, candidates, rename
  tools/occurrences.js       (새)  occurrencesTool
  tools/config.js            (수정) features
  toolbox.js                 (수정) 오류 자르기
  validate-input.js          (수정) maxLength, maxItems, maximum
packs/novel/prompts/extract.md (수정) occurrences
skill/folio/SKILL.md · references/occurrences.md (새) · references/checks.md (수정)
test/
  core/{features,fences,anchor,surfaces,occurrences,occurrence-index,file-tx,rename-plan,rename-apply}.test.js
  run/{extract-occurrences,occurrence-scope,recommit}.test.js
  server/{occurrence-tools,tool-errors}.test.js
  support/child-tx.js
  acceptance/m4.test.js
```

**데이터 흐름 한 줄:** 호스트 → (추출 답 `occurrences` | `folio_occurrences submit`) → `validateItems`(인용문 대조) → occurrences 기록장 → (`occurrenceStates` = `reanchor`) → index `marks`·`folio_find usages`·`folio_status`·(`occurrenceScope`) 검사 범위. 이름 바꾸기: `planRename`(메모리) → 작가 → `applyRename`(작업 잠금 · digest 대조 · `writeFilesTx`) → drift → `recommit` 실행 → 커밋.

---

# Part A — 기반

### Task A1: `features` — 작가가 켜고 끄는 기능

**Files:**
- Create: `core/work/features.js`
- Modify: `core/work/config.js` (`validateWorkConfig`에 `features`), `core/work/init.js`, `core/run/workspace.js`, `server/tools/config.js`
- Test: `test/core/features.test.js`

**Interfaces:**
- Produces: `FEATURES`(기본값, frozen), `FEATURE_PARENTS`, `RUN_FEATURES`, `readFeatures(input, errors) → Record<string, boolean>`, `featuresDigest(features) → string`, `assertFeature(config, name)` → 꺼져 있으면 `FolioError('FEATURE_DISABLED', …, {feature, hint})`. `config.features`는 늘 모든 키를 가진다. `openWorkspace(...)`의 반환에 `featuresDigest`. `initWork(root, { title, packs, preset, available, features })`. `describeConfig`의 반환에 `features: { values, defaults, parents }`.

- [ ] **Step 1: 실패하는 테스트**

```js
// test/core/features.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateWorkConfig } from '../../core/work/config.js';
import { FEATURES, assertFeature, featuresDigest } from '../../core/work/features.js';
import { initWork } from '../../core/work/init.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { copyFixture, fakePacks, tempDir, useFakePack } from '../support/fixtures.js';
import { parseYaml } from '../../core/util/yaml.js';

const base = { levels: [{ name: 'scene', leaf: true }] };

test('features default to the documented values and every key is always present', () => {
  const { config, errors } = validateWorkConfig(base);
  assert.deepEqual(errors, []);
  assert.deepEqual(config.features, { occurrences: true, occurrencesInExtract: true, occurrenceScope: false, rename: true, recommit: true });
  assert.deepEqual(config.features, FEATURES);
  assert.ok(Object.isFrozen(FEATURES));
});

test('features accept known booleans and reject unknown keys, non-booleans and orphaned children', () => {
  assert.equal(validateWorkConfig({ ...base, features: { occurrenceScope: true } }).config.features.occurrenceScope, true);
  const codes = (features) => validateWorkConfig({ ...base, features }).errors.map((e) => e.code);
  assert.deepEqual(codes('yes'), ['FEATURES_INVALID']);
  assert.deepEqual(codes({ teleport: true }), ['FEATURE_UNKNOWN']);
  assert.deepEqual(codes({ rename: 'on' }), ['FEATURE_INVALID']);
  assert.deepEqual(codes({ __proto__: { rename: false } }), []);
  assert.deepEqual(codes({ occurrences: false }), ['FEATURE_REQUIRES', 'FEATURE_REQUIRES']);
  const detail = validateWorkConfig({ ...base, features: { occurrences: false, occurrencesInExtract: false, rename: false } }).errors;
  assert.deepEqual(detail, []);
  assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false, occurrencesInExtract: false, occurrenceScope: true, rename: false } }).errors,
    [{ code: 'FEATURE_REQUIRES', feature: 'occurrenceScope', requires: 'occurrences' }]);
});

test('featuresDigest covers only the features that change what a run asks or checks', () => {
  const d = (f) => featuresDigest({ ...FEATURES, ...f });
  assert.equal(d({ rename: false }), d({}));
  assert.equal(d({ recommit: false }), d({}));
  assert.notEqual(d({ occurrenceScope: true }), d({}));
  assert.notEqual(d({ occurrencesInExtract: false }), d({}));
});

test('assertFeature refuses a feature that is off with a hint, and passes one that is on', () => {
  const { config } = validateWorkConfig({ ...base, features: { recommit: false } });
  assert.doesNotThrow(() => assertFeature(config, 'rename'));
  assert.throws(() => assertFeature(config, 'recommit'), (e) => e.code === 'FEATURE_DISABLED' && e.details.feature === 'recommit' && /features\.recommit/.test(e.details.hint));
});

test('the workspace carries the features digest, and initWork writes chosen features', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const ws = await openWorkspace(root, { packs: fakePacks() });
  assert.equal(ws.featuresDigest, featuresDigest(FEATURES));
  const dir = join(await tempDir(), 'new');
  await initWork(dir, { title: 't', packs: ['fake'], preset: 'scene', available: fakePresetPacks(), features: { occurrenceScope: true } });
  assert.deepEqual(parseYaml(await readFile(join(dir, 'work.yaml'), 'utf8')).features, { occurrenceScope: true });
  await assert.rejects(initWork(join(await tempDir(), 'bad'), { title: 't', packs: ['fake'], preset: 'scene', available: fakePresetPacks(), features: { nope: true } }), { code: 'CONFIG_INVALID' });
});

/** 가짜 팩에 프리셋 하나를 더한 것(initWork 는 프리셋이 필요하다). */
function fakePresetPacks() {
  const packs = fakePacks();
  const fake = packs.get('fake');
  packs.set('fake', { ...fake, presets: { scene: { title: '장면', levels: [{ name: 'scene', leaf: true }], checkSets: ['fake.basic'] } } });
  return packs;
}
```


- [ ] **Step 2: 실패 확인** — Run: `node --test test/core/features.test.js` · Expected: FAIL (`Cannot find module .../features.js`)

- [ ] **Step 3: 구현**

```js
// core/work/features.js
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';

/**
 * 작가가 켜고 끄는 기능과 기본값(설계 결정 M4 #7). 잠금 규칙은 여기 없다 — 어떤 값도 잠금을 약하게 하지 않는다.
 * 명시적 행동(이름 바꾸기, 다시 커밋)과 기록은 켜 두고, 검사 범위를 바꾸는 occurrenceScope 만 꺼 둔다.
 */
export const FEATURES = Object.freeze({
  occurrences: true,
  occurrencesInExtract: true,
  occurrenceScope: false,
  rename: true,
  recommit: true,
});

/** 켜려면 부모 기능도 켜져 있어야 하는 기능. */
export const FEATURE_PARENTS = Object.freeze({ occurrencesInExtract: 'occurrences', occurrenceScope: 'occurrences', rename: 'occurrences' });

/** 실행이 묻는 것·검사 범위를 바꾸는 기능. 이것이 바뀌면 열린 실행은 검사부터 다시 돈다. */
export const RUN_FEATURES = Object.freeze(['occurrencesInExtract', 'occurrenceScope']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** features: 알려진 불리언만. 빠진 것은 기본값. 부모가 꺼졌는데 켜진 자식은 오류. */
export function readFeatures(input, errors) {
  const features = { ...FEATURES };
  if (input === undefined) return features;
  if (!isPlainObject(input)) { errors.push({ code: 'FEATURES_INVALID' }); return features; }
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(FEATURES, key)) errors.push({ code: 'FEATURE_UNKNOWN', feature: key });
    else if (typeof value !== 'boolean') errors.push({ code: 'FEATURE_INVALID', feature: key });
    else features[key] = value;
  }
  for (const [child, parent] of Object.entries(FEATURE_PARENTS)) {
    if (features[child] && !features[parent]) errors.push({ code: 'FEATURE_REQUIRES', feature: child, requires: parent });
  }
  return features;
}

/** 실행에 걸리는 기능 값의 digest. 실행 파일의 featuresDigest 와 견준다. */
export const featuresDigest = (features) => sha256(canonicalJson(Object.fromEntries(RUN_FEATURES.map((key) => [key, Boolean(features?.[key])]))));

export function assertFeature(config, name) {
  if (config?.features?.[name]) return;
  throw new FolioError('FEATURE_DISABLED', `${name} is turned off in work.yaml`, {
    feature: name, hint: `the author can turn it on with work.yaml features.${name}: true`,
  });
}
```

`core/work/config.js`: `import { readFeatures } from './features.js';` 그리고 `config` 객체에 `options: …` 다음 줄로 `features: readFeatures(input.features, errors),`를 넣는다.

`core/work/init.js`: JSDoc 옵션에 `features?: Record<string, boolean>`, 함수 인자에 `features = undefined`, config 만들기에 `...(features !== undefined ? { features: { ...features } } : {}),`를 `packs` 다음에 넣는다(`validateWorkConfig`가 검증한다).

`core/run/workspace.js`: `import { featuresDigest } from '../work/features.js';`, 반환 객체에 `featuresDigest: featuresDigest(work.config.features),`.

`server/tools/config.js`: `import { FEATURES, FEATURE_PARENTS } from '../../core/work/features.js';`, 반환에 `options: config.options,` 다음 `features: { values: config.features, defaults: FEATURES, parents: FEATURE_PARENTS },`.

- [ ] **Step 4: 통과 확인** — Run: `node --test test/core/features.test.js && npm run check` · Expected: PASS (470 + 5)

- [ ] **Step 5: 커밋**

```bash
git add core/work/features.js core/work/config.js core/work/init.js core/run/workspace.js server/tools/config.js test/core/features.test.js
git commit -m "feat(config): add author-toggled features with defaults, parents and a run digest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A2: 코드 블록 건너뛰기 (넘긴 항목)

**Files:**
- Create: `core/util/fences.js`
- Modify: `core/store/blocks.js`, `core/index/scan.js`
- Test: `test/core/fences.test.js`

**Interfaces:**
- Produces: `fencedRanges(text) → Array<[start, end]>`(글자 위치, end 제외, 닫는 울타리 줄 포함), `fencedLines(text) → Set<number>`(1부터), `inRanges(ranges, start, end)`, `maskRanges(text, ranges) → string`(범위 안 글자를 `\u0000`으로, 길이 그대로). Task A3·B2·C2가 쓴다.

- [ ] **Step 1: 실패하는 테스트**

```js
// test/core/fences.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fencedLines, fencedRanges, inRanges, maskRanges } from '../../core/util/fences.js';
import { parseBlocks } from '../../core/store/blocks.js';
import { scanMentions } from '../../core/index/scan.js';

const TEXT = ['앞 {#fig-1}', '```js', 'const a = "{#fig-2} [[block:fig-9]] 마라";', '```', '뒤 [[block:fig-1]] 마라', '~~~~', '안 마라', '~~~', '여전히 안 마라'].join('\n');

test('fenced ranges cover backtick and tilde fences, need a closing fence at least as long, and run to the end if unclosed', () => {
  assert.deepEqual([...fencedLines(TEXT)], [2, 3, 4, 6, 7, 8, 9]);
  const ranges = fencedRanges(TEXT);
  assert.equal(ranges.length, 2);
  assert.equal(TEXT.slice(ranges[0][0], ranges[0][1]), '```js\nconst a = "{#fig-2} [[block:fig-9]] 마라";\n```');
  assert.equal(ranges[1][1], TEXT.length);
  assert.equal(inRanges(ranges, ranges[0][0], ranges[0][0] + 1), true);
  assert.equal(inRanges(ranges, 0, 2), false);
  assert.equal(maskRanges('ab```\nx\n```', fencedRanges('ab```\nx\n```')), 'ab```\nx\n```');
  assert.equal(maskRanges('```\nx\n```\ny', fencedRanges('```\nx\n```\ny')), '\u0000'.repeat(9) + '\ny');
});

test('parseBlocks skips anchors and refs inside code fences', () => {
  assert.deepEqual(parseBlocks(TEXT), { anchors: [{ id: 'fig-1', line: 1 }], refs: [{ target: 'fig-1', line: 5 }] });
});

test('scanMentions ignores names inside code fences', () => {
  assert.deepEqual(Object.fromEntries(scanMentions(TEXT, [{ id: 'mara', name: '마라', aliases: [] }])), { mara: 1 });
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/core/fences.test.js` · Expected: FAIL (module not found)

- [ ] **Step 3: 구현**

```js
// core/util/fences.js
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * 코드 블록(``` 또는 ~~~ 울타리) 범위. 여는 울타리와 같은 글자로, 길이가 같거나 긴 줄(뒤에 공백만)이 닫는다.
 * 닫는 줄이 없으면 글 끝까지. 반환: [start, end) 글자 위치 목록(울타리 줄 포함).
 * 블록 앵커·등장 인용문·이름 스캔은 이 범위 안을 보지 않는다.
 */
export function fencedRanges(text) {
  const source = String(text);
  const ranges = [];
  let offset = 0;
  let open = null;
  for (const line of source.split('\n')) {
    const match = FENCE.exec(line);
    if (open) {
      if (match && match[1][0] === open.char && match[1].length >= open.len && line.slice(match[0].length).trim() === '') {
        ranges.push([open.start, offset + line.length]);
        open = null;
      }
    } else if (match) {
      open = { char: match[1][0], len: match[1].length, start: offset };
    }
    offset += line.length + 1;
  }
  if (open) ranges.push([open.start, source.length]);
  return ranges;
}

/** 코드 블록에 걸친 줄 번호(1부터). */
export function fencedLines(text) {
  const lines = new Set();
  let open = null;
  String(text).split('\n').forEach((line, index) => {
    const match = FENCE.exec(line);
    if (open) {
      lines.add(index + 1);
      if (match && match[1][0] === open.char && match[1].length >= open.len && line.slice(match[0].length).trim() === '') open = null;
    } else if (match) {
      open = { char: match[1][0], len: match[1].length };
      lines.add(index + 1);
    }
  });
  return lines;
}

/** [start, end) 가 어느 범위와 겹치는가. */
export const inRanges = (ranges, start, end = start + 1) => ranges.some(([a, b]) => start < b && end > a);

/** 범위 안 글자를 NUL 로 가린다(길이·위치는 그대로). */
export function maskRanges(text, ranges) {
  let out = String(text);
  for (const [a, b] of ranges) out = out.slice(0, a) + '\u0000'.repeat(b - a) + out.slice(b);
  return out;
}
```

`core/store/blocks.js` `parseBlocks`: 첫 줄에 `const fenced = fencedLines(body);`, `forEach` 안 첫 줄에 `if (fenced.has(index + 1)) return;`. import `import { fencedLines } from '../util/fences.js';`. 주석 한 줄: `코드 블록 안의 앵커·참조는 읽지 않는다.`

`core/index/scan.js`: `let masked = maskRanges(String(text), fencedRanges(text));`로 바꾸고 import한다. 머리 주석의 "M4 에서 … 보강한다"를 `호스트가 제출한 등장 위치(core/occurrences)가 이것을 보강한다. 코드 블록 안은 세지 않는다.`로 바꾼다.

- [ ] **Step 4: 통과 확인** — Run: `node --test test/core/fences.test.js test/core/blocks.test.js test/core/index.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/util/fences.js core/store/blocks.js core/index/scan.js test/core/fences.test.js
git commit -m "fix(store): skip code fences when reading block anchors and scanning names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A3: 표면과 인용문 대조·다시 찾기

**Files:**
- Create: `core/occurrences/surfaces.js`, `core/occurrences/anchor.js`
- Test: `test/core/surfaces.test.js`, `test/core/anchor.test.js`

**Interfaces:**
- Consumes: `fencedRanges`, `inRanges` (A2), `preorder` (`core/store/tree.js`).
- Produces:
  - `SURFACE_KINDS = ['node','entity','asset','source']`
  - `stringLeaves(value, pointer='') → Array<[pointer, string]>` (JSON Pointer, `~`→`~0`, `/`→`~1`)
  - `surfaceFields(work, kind, id) → Map<field, text> | null`
  - `surfaceText(work, {kind, id, field=''}) → string | null`
  - `surfaceKey({kind, id, field=''}) → string`
  - `allSurfaces(work) → Array<{kind, id, field, text}>` (노드 읽는 순서 → 엔티티 id 순 → 그림 id 순 → 자료 id 순)
  - `CONTEXT_CHARS = 30`, `MAX_QUOTE = 500`
  - `matchesOf(text, quote) → number[]` (코드 블록 밖)
  - `resolveQuote(text, {quote, before?, after?}) → {ok:true, start, before, after} | {ok:false, code, count?}`
  - `reanchor(text, {quote, before='', after=''}) → {status:'located'|'relocated'|'stale', start:number|null, reason?:'QUOTE_MISSING'|'AMBIGUOUS'}`

- [ ] **Step 1: 실패하는 테스트**

```js
// test/core/surfaces.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { allSurfaces, stringLeaves, surfaceFields, surfaceKey, surfaceText } from '../../core/occurrences/surfaces.js';
import { copyFixture } from '../support/fixtures.js';

test('stringLeaves walks objects and arrays with escaped JSON pointers', () => {
  assert.deepEqual(stringLeaves({ a: 'x', 'b/c': ['y', { d: 'z', n: 3 }] }), [['/a', 'x'], ['/b~1c/0', 'y'], ['/b~1c/1/d', 'z']]);
});

test('surfaces: node body, entity body, asset brief text leaves and source text leaves', async () => {
  const root = await copyFixture('knowledge-book');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'assets', 'cell.yaml'), 'id: cell\nbrief:\n  show: [ATP 분자 모형]\n  avoid: 글자\n  entities: [atp]\n');
  const work = await openWork(root);
  assert.equal(surfaceText(work, { kind: 'node', id: 'atp-section' }), 'ATP는 세포가 쓰는 에너지 화폐다. {#tbl-2-1}\n');
  assert.equal(surfaceText(work, { kind: 'entity', id: 'energy-detail' }), '막 수송의 에너지 원리를 에너지 장에서 설명한다.\n');
  assert.deepEqual([...surfaceFields(work, 'asset', 'cell')], [['/brief/show/0', 'ATP 분자 모형'], ['/brief/avoid', '글자']]);
  assert.deepEqual([...surfaceFields(work, 'source', 'cell-notes')], [['/title', '세포 강의 메모'], ['/spans/0/quote', 'ATP는 세포의 에너지 화폐로 불린다.']]);
  assert.equal(surfaceText(work, { kind: 'node', id: 'nope' }), null);
  assert.equal(surfaceText(work, { kind: 'asset', id: 'cell', field: '/brief/entities/0' }), null);
  assert.equal(surfaceText(work, { kind: 'wat', id: 'x' }), null);
  assert.equal(surfaceKey({ kind: 'node', id: 'a' }), 'node:a:');
  const kinds = allSurfaces(work).map((s) => `${s.kind}:${s.id}`);
  assert.equal(kinds[0], 'node:preface');
  assert.ok(kinds.indexOf('node:glossary') < kinds.indexOf('entity:atp'));
  assert.ok(kinds.indexOf('entity:membrane') < kinds.indexOf('asset:cell'));
  assert.equal(kinds.at(-1), 'source:cell-notes');
});
```

```js
// test/core/anchor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_CHARS, matchesOf, reanchor, resolveQuote } from '../../core/occurrences/anchor.js';

const NOVEL = '비가 그친 옥상에서 하나는 잠긴 문을 보았다. 도윤이 뒤에서 불렀다. 하나는 대답하지 않았다.';
const BOOK = '세포막은 바깥 경계다. 막을 지나는 물질은 ATP를 쓴다. 자세한 원리는 에너지 장에서 다룬다.';

test('resolveQuote: a unique quote gets engine-cut context of 30 chars each side', () => {
  const found = resolveQuote(BOOK, { quote: 'ATP를 쓴다' });
  assert.equal(found.ok, true);
  assert.equal(BOOK.slice(found.start, found.start + 'ATP를 쓴다'.length), 'ATP를 쓴다');
  assert.equal(found.before, BOOK.slice(Math.max(0, found.start - CONTEXT_CHARS), found.start));
  assert.equal(found.after.length <= CONTEXT_CHARS, true);
});

test('resolveQuote: a repeated quote needs context, and wrong context or a missing quote is refused', () => {
  assert.deepEqual(resolveQuote(NOVEL, { quote: '하나는' }), { ok: false, code: 'OCCURRENCE_AMBIGUOUS', count: 2 });
  const second = resolveQuote(NOVEL, { quote: '하나는', before: '불렀다. ' });
  assert.equal(second.ok, true);
  assert.equal(second.start, NOVEL.lastIndexOf('하나는'));
  assert.equal(resolveQuote(NOVEL, { quote: '하나는', after: ' 잠긴' }).start, NOVEL.indexOf('하나는'));
  assert.deepEqual(resolveQuote(NOVEL, { quote: '하나는', before: '없는 문맥' }), { ok: false, code: 'OCCURRENCE_CONTEXT_MISMATCH' });
  assert.deepEqual(resolveQuote(NOVEL, { quote: '마라' }), { ok: false, code: 'OCCURRENCE_QUOTE_NOT_FOUND' });
  for (const bad of [{ quote: '' }, { quote: 5 }, { quote: 'x'.repeat(501) }, { quote: '하나는', before: 3 }]) {
    assert.deepEqual(resolveQuote(NOVEL, bad), { ok: false, code: 'OCCURRENCE_QUOTE_INVALID' });
  }
});

test('matchesOf ignores quotes inside code fences', () => {
  assert.deepEqual(matchesOf('```\n하나는\n```\n하나는', '하나는'), [12]);
});

const stored = (text, quote, nth = 0) => {
  const starts = matchesOf(text, quote);
  const found = resolveQuote(text, { quote, before: text.slice(Math.max(0, starts[nth] - CONTEXT_CHARS), starts[nth]) });
  return { quote, before: found.before, after: found.after };
};

test('reanchor after edits: same text, text added far away, context edited, quote deleted, quote duplicated', () => {
  for (const text of [NOVEL, BOOK]) {
    const quote = text === NOVEL ? '잠긴 문을' : 'ATP를 쓴다';
    const occ = stored(text, quote);
    assert.deepEqual(reanchor(text, occ), { status: 'located', start: text.indexOf(quote) });
    const prefixed = `새로 넣은 첫 문단.\n\n${text}`;
    assert.deepEqual(reanchor(prefixed, occ), { status: 'located', start: prefixed.indexOf(quote) });
    const edited = text.replace(text === NOVEL ? '하나는 잠긴' : '물질은 ATP', text === NOVEL ? '하나가 잠긴' : '분자는 ATP');
    assert.equal(reanchor(edited, occ).status, 'relocated');
    assert.deepEqual(reanchor(text.replace(quote, '다른 말'), occ), { status: 'stale', start: null, reason: 'QUOTE_MISSING' });
    assert.deepEqual(reanchor(`${text}\n${text}`, occ), { status: 'stale', start: null, reason: 'AMBIGUOUS' });
  }
});

test('reanchor picks the copy whose context survives when a quote appears twice', () => {
  const occ = stored(NOVEL, '하나는', 1);
  const moved = NOVEL.replace('비가 그친', '눈이 쌓인');
  assert.deepEqual(reanchor(moved, occ), { status: 'located', start: moved.lastIndexOf('하나는') });
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/core/surfaces.test.js test/core/anchor.test.js` · Expected: FAIL (modules not found)

- [ ] **Step 3: 구현**

```js
// core/occurrences/surfaces.js
import { preorder } from '../store/tree.js';

/** 등장 위치를 달 수 있는 글(표면)의 종류. 자료 원본 파일은 표면이 아니다(설명서의 글 필드만). */
export const SURFACE_KINDS = Object.freeze(['node', 'entity', 'asset', 'source']);
const SOURCE_SKIPPED = new Set(['/id', '/file', '/date', '/reliability']);
const escape = (key) => String(key).replace(/~/g, '~0').replace(/\//g, '~1');

/** 객체·배열 속 문자열 leaf 들을 [JSON Pointer, 글] 로. 숫자·불리언은 글이 아니다. */
export function stringLeaves(value, pointer = '') {
  if (typeof value === 'string') return [[pointer, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => stringLeaves(item, `${pointer}/${index}`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => stringLeaves(item, `${pointer}/${escape(key)}`));
  return [];
}

/**
 * 표면 하나의 글 필드들. node·entity 는 본문 하나(field ''), asset 은 brief 의 글 leaf(엔티티 목록 제외),
 * source 는 설명서의 글 leaf(id·file·date·reliability·구간 id 제외). 없으면 null.
 * @returns {Map<string, string> | null}
 */
export function surfaceFields(work, kind, id) {
  switch (kind) {
    case 'node': { const node = work.tree.nodes.get(id); return node ? new Map([['', node.body]]) : null; }
    case 'entity': { const entity = work.entities.get(id); return entity ? new Map([['', entity.body]]) : null; }
    case 'asset': {
      const asset = work.assets.get(id);
      if (!asset) return null;
      return new Map(stringLeaves(asset.brief, '/brief').filter(([pointer]) => !pointer.startsWith('/brief/entities/')));
    }
    case 'source': {
      const source = work.sources.get(id);
      if (!source) return null;
      return new Map(stringLeaves(source.meta).filter(([pointer]) => !SOURCE_SKIPPED.has(pointer) && !/^\/spans\/\d+\/id$/.test(pointer)));
    }
    default: return null;
  }
}

export function surfaceText(work, { kind, id, field = '' }) {
  return surfaceFields(work, kind, id)?.get(field) ?? null;
}

export const surfaceKey = ({ kind, id, field = '' }) => `${kind}:${id}:${field}`;

/** 작품의 모든 표면 글. 노드(읽는 순서) → 엔티티 → 그림 → 자료(각각 id 순). */
export function allSurfaces(work) {
  const out = [];
  const push = (kind, id) => { for (const [field, text] of surfaceFields(work, kind, id) ?? []) out.push({ kind, id, field, text }); };
  for (const id of preorder(work.tree)) push('node', id);
  for (const kind of ['entity', 'asset', 'source']) {
    const map = kind === 'entity' ? work.entities : kind === 'asset' ? work.assets : work.sources;
    for (const id of [...map.keys()].sort()) push(kind, id);
  }
  return out;
}
```

```js
// core/occurrences/anchor.js
import { fencedRanges, inRanges } from '../util/fences.js';

/** 저장하는 앞뒤 문맥 길이(글자). */
export const CONTEXT_CHARS = 30;
export const MAX_QUOTE = 500;

/** 코드 블록 밖에서 인용문이 시작하는 위치들. */
export function matchesOf(text, quote) {
  if (typeof quote !== 'string' || quote === '') return [];
  const source = String(text);
  const ranges = fencedRanges(source);
  const out = [];
  let at = source.indexOf(quote);
  while (at !== -1) {
    if (!inRanges(ranges, at, at + quote.length)) out.push(at);
    at = source.indexOf(quote, at + 1);
  }
  return out;
}

const contextAt = (text, start, quote) => ({
  before: text.slice(Math.max(0, start - CONTEXT_CHARS), start),
  after: text.slice(start + quote.length, start + quote.length + CONTEXT_CHARS),
});
const optionalString = (value) => value === undefined || typeof value === 'string';

/**
 * 제출된 인용문을 본문에서 한 곳으로 정한다. 앞뒤 문맥을 주면 그것으로 좁힌다.
 * 문맥은 엔진이 본문에서 다시 잘라 돌려준다(호스트가 준 문맥을 그대로 저장하지 않는다).
 */
export function resolveQuote(text, { quote, before, after }) {
  if (typeof quote !== 'string' || quote === '' || quote.length > MAX_QUOTE || !optionalString(before) || !optionalString(after)) {
    return { ok: false, code: 'OCCURRENCE_QUOTE_INVALID' };
  }
  const source = String(text);
  let found = matchesOf(source, quote);
  if (!found.length) return { ok: false, code: 'OCCURRENCE_QUOTE_NOT_FOUND' };
  if (before !== undefined || after !== undefined) {
    found = found.filter((start) => (before === undefined || source.slice(0, start).endsWith(before))
      && (after === undefined || source.slice(start + quote.length).startsWith(after)));
    if (!found.length) return { ok: false, code: 'OCCURRENCE_CONTEXT_MISMATCH' };
  }
  if (found.length > 1) return { ok: false, code: 'OCCURRENCE_AMBIGUOUS', count: found.length };
  return { ok: true, start: found[0], ...contextAt(source, found[0], quote) };
}

function commonSuffix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}
function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

/**
 * 바뀐 본문에서 저장된 인용문 + 앞뒤 문맥으로 다시 찾는다(설계 §15).
 * 인용문 위치마다 (앞 문맥이 맞는 꼬리 길이 + 뒤 문맥이 맞는 머리 길이)로 점수를 매기고, 가장 높은 곳이 하나일 때만 받는다.
 * 문맥이 온전하면 located, 일부만 맞으면 relocated. 못 찾거나 동점이면 stale — 추측해서 엉뚱한 곳을 가리키지 않는다.
 */
export function reanchor(text, { quote, before = '', after = '' }) {
  const source = String(text);
  const found = matchesOf(source, quote);
  if (!found.length) return { status: 'stale', start: null, reason: 'QUOTE_MISSING' };
  const scored = found.map((start) => {
    const b = commonSuffix(source.slice(0, start), before);
    const a = commonPrefix(source.slice(start + quote.length), after);
    return { start, score: b + a, full: b === before.length && a === after.length };
  });
  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best);
  if (top.length > 1) return { status: 'stale', start: null, reason: 'AMBIGUOUS' };
  return { status: top[0].full ? 'located' : 'relocated', start: top[0].start };
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test test/core/surfaces.test.js test/core/anchor.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/occurrences/surfaces.js core/occurrences/anchor.js test/core/surfaces.test.js test/core/anchor.test.js
git commit -m "feat(occurrences): add surfaces and quote resolution with context re-anchoring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Part B — 기록

### Task B1: 등장 위치 기록장 · 제출 · 지금 위치 · 상태

**Files:**
- Create: `core/occurrences/records.js`, `core/occurrences/validate.js`, `core/occurrences/state.js`, `core/occurrences/submit.js`
- Modify: `core/status.js`
- Test: `test/core/occurrences.test.js`

**Interfaces:**
- Consumes: A1 `assertFeature`, A3 전부, `withWorkLock`, `openLedger`, `openWork`, `sha256`.
- Produces:
  - `OCCURRENCES_LEDGER = 'occurrences'`, `OCCURRENCE_KINDS = ['appearance','mention']`, `MAX_ITEMS = 500`
  - `latestBySurface(records) → Map<surfaceKey, record>`
  - 기록 모양: `{ type:'occurrences', surface:{kind,id,field}, textHash, items:[{entityId, kind, quote, before, after}], origin:'tool'|'extract'|'rename', receiptId? }`
  - `validateItems(work, text, items) → { items, errors: [{index, code, ...}] }`
  - `occurrenceStates(work, records) → Array<{entityId, kind, surface, quote, before, after, origin, seq, status, start, reason?}>`
  - `staleOccurrences(states) → Array<{entityId, kind, surface, quote, reason}>`
  - `liveMarks(states) → states.filter(status !== 'stale')`
  - `submitOccurrences(root, { surface, items }, { now? }) → { surface, textHash, accepted, seq }`
  - `workStatus` 반환에 `occurrences: { stale, total } | null`

- [ ] **Step 1: 실패하는 테스트**

```js
// test/core/occurrences.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { OCCURRENCES_LEDGER, latestBySurface } from '../../core/occurrences/records.js';
import { validateItems } from '../../core/occurrences/validate.js';
import { occurrenceStates, staleOccurrences } from '../../core/occurrences/state.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { workStatus } from '../../core/status.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { stringifyYaml, parseYaml } from '../../core/util/yaml.js';

const EP1 = join('tree', '01-arc-awakening', '01-ep-001.md');
const ATP = join('tree', '01-part-basics', '02-chapter-energy', '01-atp.md');

async function edit(root, path, from, to) {
  const text = await readFile(join(root, path), 'utf8');
  assert.ok(text.includes(from), `${path} has ${from}`);
  await writeFile(join(root, path), text.replace(from, to));
}

test('validateItems accepts pronoun quotes, dedupes, and reports every bad item by index', async () => {
  const work = await openWork(await copyFixture('serial-2level'));
  const text = '하나는 문을 보았다. 그녀는 돌아섰다.';
  const out = validateItems(work, text, [
    { entityId: 'hana', kind: 'appearance', quote: '하나는' },
    { entityId: 'hana', kind: 'appearance', quote: '그녀는' },
    { entityId: 'hana', kind: 'mention', quote: '하나는' },
    { entityId: 'ghost', kind: 'appearance', quote: '문을' },
    { entityId: 'hana', kind: 'cameo', quote: '문을' },
    { entityId: 'doyun', kind: 'mention', quote: '도윤' },
    null,
  ]);
  assert.deepEqual(out.items.map((i) => i.quote), ['하나는', '그녀는']);
  assert.deepEqual(out.errors.map((e) => [e.index, e.code]), [
    [3, 'OCCURRENCE_ENTITY_UNKNOWN'], [4, 'OCCURRENCE_KIND_INVALID'], [5, 'OCCURRENCE_QUOTE_NOT_FOUND'], [6, 'OCCURRENCE_INVALID'],
  ]);
  assert.deepEqual(validateItems(work, text, 'x').errors, [{ index: null, code: 'OCCURRENCES_SHAPE_INVALID' }]);
  assert.equal(validateItems(work, text, Array.from({ length: 501 }, () => ({}))).errors[0].code, 'OCCURRENCES_SHAPE_INVALID');
});

test('submit records a whole surface or nothing; the latest record for a surface wins', async () => {
  const root = await copyFixture('serial-2level');
  const surface = { kind: 'node', id: 'ep-001' };
  const first = await submitOccurrences(root, { surface, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  assert.equal(first.accepted, 1);
  await assert.rejects(submitOccurrences(root, { surface, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }, { entityId: 'hana', kind: 'appearance', quote: '없는 글' }] }),
    (e) => e.code === 'OCCURRENCES_INVALID' && e.details.errors[0].index === 1);
  await submitOccurrences(root, { surface, items: [{ entityId: 'locked-door', kind: 'mention', quote: '잠긴 문' }] });
  const records = await openLedger(root, OCCURRENCES_LEDGER).readAll();
  assert.equal(records.length, 2);
  assert.deepEqual(latestBySurface(records).get('node:ep-001:').items.map((i) => i.entityId), ['locked-door']);
  await assert.rejects(submitOccurrences(root, { surface: { kind: 'node', id: 'nope' }, items: [] }), { code: 'SURFACE_NOT_FOUND' });
  await assert.rejects(submitOccurrences(root, { surface: { kind: 'blob', id: 'x' }, items: [] }), { code: 'SURFACE_KIND_INVALID' });
});

test('submit is refused when the occurrences feature is off', async () => {
  const root = await copyFixture('serial-2level');
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { occurrences: false, occurrencesInExtract: false, rename: false } }));
  await assert.rejects(submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [] }), { code: 'FEATURE_DISABLED' });
});

test('states re-anchor after edits for a character (novel) and a term (knowledge book); what is lost is stale', async () => {
  const novel = await copyFixture('serial-2level');
  await submitOccurrences(novel, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }, { entityId: 'locked-door', kind: 'mention', quote: '잠긴 문을' }] });
  await edit(novel, EP1, '하나는 지하실', '어느 밤, 하나는 지하실');
  await edit(novel, EP1, '잠긴 문을', '낡은 문을');
  const states = occurrenceStates(await openWork(novel), await openLedger(novel, OCCURRENCES_LEDGER).readAll());
  assert.deepEqual(states.map((s) => [s.entityId, s.status]), [['hana', 'relocated'], ['locked-door', 'stale']]);
  assert.deepEqual(staleOccurrences(states), [{ entityId: 'locked-door', kind: 'mention', surface: { kind: 'node', id: 'ep-001', field: '' }, quote: '잠긴 문을', reason: 'QUOTE_MISSING' }]);

  const book = await copyFixture('knowledge-book');
  await submitOccurrences(book, { surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'atp', kind: 'appearance', quote: 'ATP는' }] });
  await submitOccurrences(book, { surface: { kind: 'source', id: 'cell-notes', field: '/spans/0/quote' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP는' }] });
  await edit(book, ATP, 'ATP는 세포가', '> 요약\n\nATP는 세포가');
  const bookStates = occurrenceStates(await openWork(book), await openLedger(book, OCCURRENCES_LEDGER).readAll());
  // 인용문이 본문 맨 앞이라 저장된 앞 문맥이 비어 있다 → 앞에 글을 더해도 문맥이 온전하다(located)
  assert.deepEqual(bookStates.map((s) => [s.surface.kind, s.status]), [['node', 'located'], ['source', 'located']]);
  await edit(book, ATP, '세포가 쓰는', '세포 안에서 쓰는');
  const edited = occurrenceStates(await openWork(book), await openLedger(book, OCCURRENCES_LEDGER).readAll());
  assert.equal(edited[0].status, 'relocated');
});

test('a deleted node or entity makes its marks stale with the reason', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'entity', id: 'locked-door' }, items: [{ entityId: 'hana', kind: 'mention', quote: '문 너머' }] });
  const work = await openWork(root);
  work.entities.delete('locked-door');
  const records = await openLedger(root, OCCURRENCES_LEDGER).readAll();
  assert.equal(occurrenceStates(work, records)[0].reason, 'SURFACE_MISSING');
  const work2 = await openWork(root);
  work2.entities.delete('hana');
  assert.equal(occurrenceStates(work2, records)[0].reason, 'ENTITY_MISSING');
});

test('status lists stale occurrences, and says null when the feature is off', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  assert.deepEqual((await workStatus(root, { packs: fakePacks() })).occurrences, { stale: [], total: 1 });
  await edit(root, EP1, '하나는', '그 아이는');
  assert.equal((await workStatus(root, { packs: fakePacks() })).occurrences.stale.length, 1);
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { occurrences: false, occurrencesInExtract: false, rename: false } }));
  assert.equal((await workStatus(root, { packs: fakePacks() })).occurrences, null);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/core/occurrences.test.js` · Expected: FAIL (modules not found)

- [ ] **Step 3: 구현**

```js
// core/occurrences/records.js
import { surfaceKey } from './surfaces.js';

/** 등장 위치 기록장 이름(.folio/ledger/occurrences.jsonl). 추가만 된다. */
export const OCCURRENCES_LEDGER = 'occurrences';
/** 등장(장면에 직접 나옴)과 언급(이름·회상으로만 나옴). 언급은 사망 같은 등장 검사에 걸리지 않는다. */
export const OCCURRENCE_KINDS = Object.freeze(['appearance', 'mention']);
export const MAX_ITEMS = 500;

/** 표면마다 가장 최근 기록. 같은 표면의 새 기록이 앞 기록을 대신한다(앞 기록은 지우지 않는다). */
export function latestBySurface(records) {
  const latest = new Map();
  for (const record of records) if (record.type === 'occurrences') latest.set(surfaceKey(record.surface), record);
  return latest;
}
```

```js
// core/occurrences/validate.js
import { resolveQuote } from './anchor.js';
import { MAX_ITEMS, OCCURRENCE_KINDS } from './records.js';

const clip = (value) => String(value).slice(0, 100);

/**
 * 제출 항목을 본문과 대조한다. 엔티티가 있고, 종류가 appearance|mention 이고, 인용문이 본문에 한 곳으로 정해져야 한다.
 * 인용문에 이름이 없어도 된다(대명사·호칭). 같은 엔티티·같은 위치는 한 번만 받는다. 문맥은 엔진이 자른 것으로 바꾼다.
 */
export function validateItems(work, text, items) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return { items: [], errors: [{ index: null, code: 'OCCURRENCES_SHAPE_INVALID' }] };
  const errors = [];
  const accepted = [];
  const seen = new Set();
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push({ index, code: 'OCCURRENCE_INVALID' }); return; }
    if (typeof item.entityId !== 'string' || !work.entities.has(item.entityId)) { errors.push({ index, code: 'OCCURRENCE_ENTITY_UNKNOWN', entityId: clip(item.entityId) }); return; }
    if (!OCCURRENCE_KINDS.includes(item.kind)) { errors.push({ index, code: 'OCCURRENCE_KIND_INVALID', entityId: item.entityId }); return; }
    const found = resolveQuote(text, item);
    if (!found.ok) { errors.push({ index, code: found.code, entityId: item.entityId, ...(found.count ? { count: found.count } : {}) }); return; }
    const key = `${item.entityId}@${found.start}`;
    if (seen.has(key)) return;
    seen.add(key);
    accepted.push({ entityId: item.entityId, kind: item.kind, quote: item.quote, before: found.before, after: found.after });
  });
  return { items: accepted, errors };
}
```

```js
// core/occurrences/state.js
import { reanchor } from './anchor.js';
import { latestBySurface } from './records.js';
import { surfaceText } from './surfaces.js';

/**
 * 기록된 등장 위치가 지금 글에서 어디 있는지 계산한다. 파일이 정본이고 이 결과는 매번 새로 만든다.
 * 표면이 없으면 SURFACE_MISSING, 엔티티가 없으면 ENTITY_MISSING 으로 stale.
 */
export function occurrenceStates(work, records) {
  const out = [];
  for (const record of latestBySurface(records).values()) {
    const text = surfaceText(work, record.surface);
    for (const item of record.items) {
      let at;
      if (text === null) at = { status: 'stale', start: null, reason: 'SURFACE_MISSING' };
      else if (!work.entities.has(item.entityId)) at = { status: 'stale', start: null, reason: 'ENTITY_MISSING' };
      else at = reanchor(text, item);
      out.push({
        entityId: item.entityId, kind: item.kind, surface: record.surface, quote: item.quote, before: item.before, after: item.after,
        origin: record.origin, seq: record.seq, ...at,
      });
    }
  }
  return out;
}

export const staleOccurrences = (states) => states.filter((s) => s.status === 'stale')
  .map(({ entityId, kind, surface, quote, reason }) => ({ entityId, kind, surface, quote, reason }));

export const liveMarks = (states) => states.filter((s) => s.status !== 'stale');
```

```js
// core/occurrences/submit.js
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { openWork } from '../store/work.js';
import { withWorkLock } from '../run/work-lock.js';
import { assertFeature } from '../work/features.js';
import { sha256 } from '../util/hash.js';
import { OCCURRENCES_LEDGER } from './records.js';
import { SURFACE_KINDS, surfaceText } from './surfaces.js';
import { validateItems } from './validate.js';

/**
 * 호스트가 표면 하나의 등장 위치 목록을 낸다(설계 §15). 모두 맞아야 기록하고, 하나라도 틀리면 아무것도 쓰지 않는다.
 * 빈 목록은 "이 표면에는 등장이 없다"는 기록이다. 작업 잠금 안에서 돈다.
 * @param {string} root
 * @param {{ surface: { kind: string, id: string, field?: string }, items: any[] }} input
 */
export async function submitOccurrences(root, { surface, items }, { now } = {}) {
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    assertFeature(work.config, 'occurrences');
    if (!SURFACE_KINDS.includes(surface?.kind)) throw new FolioError('SURFACE_KIND_INVALID', String(surface?.kind).slice(0, 100), { kinds: SURFACE_KINDS });
    const target = { kind: surface.kind, id: String(surface.id), field: surface.field ?? '' };
    const text = surfaceText(work, target);
    if (text === null) throw new FolioError('SURFACE_NOT_FOUND', `${target.kind}:${target.id}${target.field}`.slice(0, 200), { surface: target });
    const { items: accepted, errors } = validateItems(work, text, items);
    if (errors.length) {
      throw new FolioError('OCCURRENCES_INVALID', `${errors.length} item(s) refused; nothing was recorded`, { errors: errors.slice(0, 50) });
    }
    const ledger = openLedger(root, OCCURRENCES_LEDGER, now ? { now } : {});
    const record = await ledger.append({ type: 'occurrences', surface: target, textHash: sha256(text), items: accepted, origin: 'tool' });
    return { surface: target, textHash: record.textHash, accepted: accepted.length, seq: record.seq };
  });
}
```

`core/status.js`: import `OCCURRENCES_LEDGER`, `occurrenceStates`, `staleOccurrences`. 짧은 반환(기록장이 깨진 경우)은 그대로 둔다. 마지막 반환 객체에 `drift` 다음으로 `occurrences: await occurrencesStatus(root, work),`를 넣고 파일 안에 다음 함수를 더한다.

```js
/** 등장 위치: 다시 찾지 못한 것(stale)과 전체 수. 기능이 꺼져 있으면 null. 기록장이 깨졌으면 ledgerOk:false 만. */
async function occurrencesStatus(root, work) {
  if (!work.config.features.occurrences) return null;
  const ledger = openLedger(root, OCCURRENCES_LEDGER);
  const verified = await ledger.verify();
  if (!verified.ok) return { ledger: verified, stale: [], total: 0 };
  const states = occurrenceStates(work, await ledger.readAll());
  return { stale: staleOccurrences(states), total: states.length };
}
```

(테스트의 `{ stale: [], total: 1 }`은 정상 경로 모양이다. 깨진 경우는 `ledger` 키가 붙는다.)

- [ ] **Step 4: 통과 확인** — Run: `node --test test/core/occurrences.test.js test/core/status.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/occurrences/records.js core/occurrences/validate.js core/occurrences/state.js core/occurrences/submit.js core/status.js test/core/occurrences.test.js
git commit -m "feat(occurrences): record host-submitted occurrences in an append-only ledger and report stale ones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B2: index `marks` 표 · 사용처 · 후보

**Files:**
- Create: `core/occurrences/candidates.js`
- Modify: `core/index/schema.js`, `core/index/rebuild.js`, `core/index/query.js`
- Test: `test/core/occurrence-index.test.js`

**Interfaces:**
- Consumes: B1 `occurrenceStates`, `OCCURRENCES_LEDGER`; A3 `allSurfaces`, `surfaceFields`, `matchesOf`, `CONTEXT_CHARS`; A2 `fencedRanges`.
- Produces:
  - `TABLES`에 `'marks'`. 열: `entity_id, surface_kind, surface_id, field, kind, quote, start, status, origin`(`start`는 NULL 가능).
  - `marksOf(db, entityId) → Array<{surfaceKind, surfaceId, field, kind, quote, start, status, origin}>`(노드는 읽는 순서, 그다음 표면 종류·id, start 순).
  - `candidatesFor(work, records, {kind, id}) → Array<{entityId, field, quote, before, after, start, recorded:boolean}>`: 표면의 모든 필드에서 이름·별칭 정확 일치(긴 말 먼저, 코드 블록 밖). 같은 위치에 기록된 등장이 있으면 `recorded: true`.

- [ ] **Step 1: 실패하는 테스트**

```js
// test/core/occurrence-index.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rebuildIndex } from '../../core/index/rebuild.js';
import { dumpIndex, marksOf, openIndex } from '../../core/index/query.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { candidatesFor } from '../../core/occurrences/candidates.js';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { copyFixture } from '../support/fixtures.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

const read = async (root, fn) => { await rebuildIndex(root); const db = openIndex(root); try { return fn(db); } finally { db.close(); } };

test('marks come from the ledger with their current status, in reading order, and rebuild is stable', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-003' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'arc-hunt' }, items: [{ entityId: 'hana', kind: 'mention', quote: '하나가' }] });
  const marks = await read(root, (db) => marksOf(db, 'hana'));
  // 읽는 순서: arc-awakening, ep-001, ep-002, ep-003, arc-hunt, ...
  assert.deepEqual(marks.map((m) => [m.surfaceId, m.kind, m.status]), [['ep-001', 'appearance', 'located'], ['ep-003', 'appearance', 'located'], ['arc-hunt', 'mention', 'located']]);
  assert.equal(marks[0].start, 0);
  const first = await read(root, dumpIndex);
  const second = await read(root, dumpIndex);
  assert.deepEqual(first.marks, second.marks);
});

test('marks are empty when the occurrences feature is off, even with a ledger', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { occurrences: false, occurrencesInExtract: false, rename: false } }));
  assert.deepEqual(await read(root, (db) => marksOf(db, 'hana')), []);
});

test('candidates list name and alias hits outside code fences with context, marking what is already recorded', async () => {
  const root = await copyFixture('serial-2level');
  const path = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('하나는 지하실 끝에서 잠긴 문을 발견했다.', '하나는 지하실 끝에서 잠긴 문을 발견했다. 도윤도 왔다.\n```\n하나\n```\n'));
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  const work = await openWork(root);
  const list = candidatesFor(work, await openLedger(root, OCCURRENCES_LEDGER).readAll(), { kind: 'node', id: 'ep-001' });
  assert.deepEqual(list.map((c) => [c.entityId, c.quote, c.recorded]), [['hana', '하나', true], ['locked-door', '잠긴 문', false], ['doyun', '도윤', false]]);
  assert.equal(list[2].before.endsWith('발견했다. '), true);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/core/occurrence-index.test.js` · Expected: FAIL

- [ ] **Step 3: 구현**

`core/index/schema.js`: `TABLES` 끝에 `'marks'`, SQL 끝에

```sql
CREATE TABLE marks(entity_id TEXT NOT NULL, surface_kind TEXT NOT NULL, surface_id TEXT NOT NULL, field TEXT NOT NULL,
  kind TEXT NOT NULL, quote TEXT NOT NULL, start INTEGER, status TEXT NOT NULL, origin TEXT NOT NULL);
```

`core/index/rebuild.js`: import `OCCURRENCES_LEDGER`, `occurrenceStates`. 함수 머리에서 기록장을 읽는다(`const occurrenceRecords = work.config.features.occurrences ? await openLedger(root, OCCURRENCES_LEDGER).readAll() : [];`). 커밋 기록 루프 뒤, `db.exec('COMMIT')` 앞에:

```js
    const markRow = st('INSERT INTO marks VALUES (?,?,?,?,?,?,?,?,?)');
    for (const m of occurrenceStates(work, occurrenceRecords)) {
      markRow.run(m.entityId, m.surface.kind, m.surface.id, m.surface.field, m.kind, m.quote, m.start, m.status, m.origin);
    }
```

`core/index/query.js`:

```js
/** 호스트가 제출한 등장 위치(기록장 투영). 노드 표면은 읽는 순서로, 그 뒤 엔티티·그림·자료. */
export function marksOf(db, entityId) {
  return plain(db.prepare(`
    SELECT m.surface_kind AS surfaceKind, m.surface_id AS surfaceId, m.field, m.kind, m.quote, m.start, m.status, m.origin
    FROM marks m LEFT JOIN nodes n ON m.surface_kind = 'node' AND n.id = m.surface_id
    WHERE m.entity_id = ?
    ORDER BY CASE m.surface_kind WHEN 'node' THEN 0 WHEN 'entity' THEN 1 WHEN 'asset' THEN 2 ELSE 3 END,
      COALESCE(n.ordinal, -1), m.surface_id, m.field, COALESCE(m.start, -1), m.kind`).all(entityId));
}
```

```js
// core/occurrences/candidates.js
import { fencedRanges, maskRanges } from '../util/fences.js';
import { CONTEXT_CHARS } from './anchor.js';
import { surfaceFields } from './surfaces.js';
import { occurrenceStates } from './state.js';

/**
 * 제출을 돕는 후보(설계 §15의 mention-scan): 표면의 이름·별칭 정확 일치. 긴 말부터 가려서 두 번 세지 않는다.
 * 후보일 뿐 기록이 아니다 — 대명사·호칭은 호스트가 직접 찾아 낸다. 이미 같은 자리에 기록된 등장이 있으면 recorded.
 */
export function candidatesFor(work, records, surface) {
  const fields = surfaceFields(work, surface.kind, surface.id);
  if (!fields) return [];
  const terms = [];
  for (const entity of work.entities.values()) for (const term of [entity.name, ...entity.aliases]) if (term) terms.push({ term, entityId: entity.id });
  terms.sort((a, b) => b.term.length - a.term.length || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  const recorded = occurrenceStates(work, records)
    .filter((s) => s.status !== 'stale' && s.surface.kind === surface.kind && s.surface.id === surface.id);
  const out = [];
  for (const [field, text] of fields) {
    let masked = maskRanges(text, fencedRanges(text));
    for (const { term, entityId } of terms) {
      let at = masked.indexOf(term);
      while (at !== -1) {
        out.push({
          entityId, field, quote: term, start: at,
          before: text.slice(Math.max(0, at - CONTEXT_CHARS), at), after: text.slice(at + term.length, at + term.length + CONTEXT_CHARS),
          recorded: recorded.some((s) => s.surface.field === field && s.entityId === entityId && s.start <= at && at < s.start + s.quote.length),
        });
        masked = masked.slice(0, at) + '\u0000'.repeat(term.length) + masked.slice(at + term.length);
        at = masked.indexOf(term, at + term.length);
      }
    }
  }
  return out.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : a.start - b.start));
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test test/core/occurrence-index.test.js test/core/index.test.js test/acceptance/m1.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/index/schema.js core/index/rebuild.js core/index/query.js core/occurrences/candidates.js test/core/occurrence-index.test.js
git commit -m "feat(index): project recorded occurrences into marks and offer scan candidates per surface

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B3: 추출 단계의 occurrences · 커밋 뒤 기록 · 기능 digest 동기화

> 리뷰어: 가장 강한 모델. 추출·커밋 경로와 실행 동기화를 건드린다. 공격 스크립트로 확인한다: 위조 occurrences로 hard 검사(사망 등장)를 피하려는 시도, 실행 파일만 고쳐 기록장에 다른 글 기준 기록을 넣으려는 시도, 기능 토글로 열린 실행의 옛 답을 받게 하려는 시도.

**Files:**
- Create: `core/occurrences/record-run.js`
- Modify: `core/run/steps/generate.js`, `core/run/steps/commit-step.js`, `core/run/runner.js`, `core/run/sync.js`, `core/run/recheck-plan.js`, `packs/novel/prompts/extract.md`
- Test: `test/run/extract-occurrences.test.js`

**Interfaces:**
- Consumes: B1 `validateItems`, `OCCURRENCES_LEDGER`; A1 `featuresDigest`, `ctx.featuresDigest`.
- Produces:
  - 추출 요청 payload(`produces: 'events'`)에 `occurrences: { wanted: boolean }`.
  - `run.outputs.events.occurrences`(검증된 항목, 없으면 `[]`), `run.outputs.events.submittedOccurrences: boolean`.
  - `recordRunOccurrences({ ledger, ctx, run, receiptId }) → Promise<record|null>`.
  - 실행 파일 `featuresDigest`. `outOfSync`는 `run.featuresDigest !== undefined && run.featuresDigest !== ctx.featuresDigest`도 바뀐 것으로 본다. `syncPipeline`이 갱신한다.
  - 실행기 `env.ledgers.occurrences`.

- [ ] **Step 1: 실패하는 테스트**

```js
// test/run/extract-occurrences.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

const makeRunner = (root) => () => createRunner({ root, packs: fakePacks() });
async function setFeatures(root, features) {
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
}
const occ = (root) => openLedger(root, OCCURRENCES_LEDGER).readAll();

test('the extract request asks for occurrences; valid ones are recorded after the commit with the receipt id', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const host = createFakeHost({
    drafts: { 'ep-001': '하나는 문 앞에 섰다. 그녀는 숨을 골랐다.' },
    events: { 'ep-001': { events: [], appearances: [], mentions: [], occurrences: [{ entityId: 'hana', kind: 'appearance', quote: '그녀는' }] } },
  });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  assert.equal(host.calls.find((c) => c.stepId === 'extract').payload.occurrences.wanted, true);
  const records = await occ(root);
  assert.equal(records.length, 1);
  assert.deepEqual([records[0].origin, records[0].receiptId, records[0].surface], ['extract', trail.at(-1).receiptId, { kind: 'node', id: 'ep-001', field: '' }]);
  assert.equal(records[0].items[0].before, '하나는 문 앞에 섰다. ');
});

test('an answer without occurrences records nothing; a wrong quote is asked again and then blocked', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await driveToEnd(makeRunner(root), createFakeHost(), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  assert.deepEqual(await occ(root), []);
  const bad = createFakeHost({ events: { '*': { events: [], occurrences: [{ entityId: 'hana', kind: 'appearance', quote: '없는 인용' }] } } });
  const trail = await driveToEnd(makeRunner(root), bad, { start: { node: 'ep-002' }, until: (o) => o.status === 'needs_user' });
  assert.deepEqual(trail.map(label).filter((l) => l === 'model:extract').length, 3);
  assert.equal(trail.at(-1).question.code, 'EXTRACT_FAILED');
  assert.match(trail.at(-1).question.blocking[0].message, /OCCURRENCE_QUOTE_NOT_FOUND/);
  assert.equal(trail.at(-1).question.canApprove, false);
});

test('an appearance occurrence feeds the dead-on-stage check even when the name is not in the text', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level'); // ep-002: doyun dead
  const host = createFakeHost({
    drafts: { 'ep-003': '그는 문을 두드렸다.' },
    events: { 'ep-003': { events: [], occurrences: [{ entityId: 'doyun', kind: 'appearance', quote: '그는' }] } },
  });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-003' }, until: (o) => o.status === 'needs_user' });
  assert.equal(trail.at(-1).question.kind, 'blocked');
  assert.ok(trail.at(-1).question.blocking.some((f) => f.code === 'DEAD_ON_STAGE'));
  const mention = createFakeHost({
    drafts: { 'ep-003': '그는 도윤을 떠올렸다.' },
    events: { 'ep-003': { events: [], occurrences: [{ entityId: 'doyun', kind: 'mention', quote: '도윤을' }] } },
  });
  await makeRunner(root)().decide({ runId: trail.at(-1).runId, action: 'skip', reason: '다시 쓰기' });
  const again = await driveToEnd(makeRunner(root), mention, { start: { node: 'ep-003' }, until: (o) => o.status === 'done' || o.status === 'needs_user' });
  // 언급(mention)만 있으면 사망 검사가 막지 않는다: 승인 질문이거나 끝까지 간다
  assert.ok(again.at(-1).status === 'done' || again.at(-1).question.kind === 'approve', JSON.stringify(again.at(-1)));
});

test('with occurrencesInExtract off the request does not ask, and occurrences in the answer are ignored', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await setFeatures(root, { occurrencesInExtract: false });
  const host = createFakeHost({ events: { '*': { events: [], occurrences: [{ entityId: 'hana', kind: 'appearance', quote: '없는 인용' }] } } });
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  assert.equal(host.calls.find((c) => c.stepId === 'extract').payload.occurrences.wanted, false);
  assert.deepEqual(await occ(root), []);
});

test('changing a run feature while a request is open makes the answer stale and restarts from extract', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const host = createFakeHost();
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => label(o) === 'model:critic' });
  await setFeatures(root, { occurrenceScope: true });
  await assert.rejects(makeRunner(root)().resume({ runId: trail.at(-1).runId, answers: host.answer(trail.at(-1)) }), { code: 'ANSWER_STALE' });
  const next = await makeRunner(root)().run({ node: 'ep-001' });
  assert.equal(label(next), 'model:extract');
});

test('turning rename or recommit off does not disturb an open run', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const host = createFakeHost();
  const trail = await driveToEnd(makeRunner(root), host, { start: { node: 'ep-001' }, until: (o) => label(o) === 'model:critic' });
  await setFeatures(root, { rename: false, recommit: false });
  const out = await makeRunner(root)().resume({ runId: trail.at(-1).runId, answers: host.answer(trail.at(-1)) });
  assert.equal(label(out), 'user:approve');
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/run/extract-occurrences.test.js` · Expected: FAIL (`payload.occurrences` undefined, 기록 없음)

- [ ] **Step 3: 구현**

`core/run/steps/generate.js`:

```js
import { validateItems } from '../../occurrences/validate.js';
// ...
function parseEvents(answer, work, draft) {
  // (기존 앞부분 그대로)
  const ids = (list) => (Array.isArray(list) ? list.filter((id) => work.entities.has(id)) : []);
  const value = { events, appearances: ids(data.appearances), mentions: ids(data.mentions), occurrences: [], submittedOccurrences: false };
  // 등장 위치(M4): 기능이 켜져 있고 답에 있으면 원고와 대조한다. 없으면 제출하지 않은 것이다(옛 호스트 호환).
  if (work.config.features.occurrencesInExtract && data.occurrences !== undefined) {
    const checked = validateItems(work, draft, data.occurrences);
    if (checked.errors.length) {
      const first = checked.errors[0];
      return { error: `${first.code}:${first.index ?? '-'}` };
    }
    value.occurrences = checked.items;
    value.submittedOccurrences = true;
    const add = (list, kind) => [...new Set([...list, ...checked.items.filter((i) => i.kind === kind).map((i) => i.entityId)])];
    value.appearances = add(value.appearances, 'appearance');
    value.mentions = add(value.mentions, 'mention');
  }
  return { value };
}
```

같은 파일 `generateStep`: 추출 요청에 기능 표시를 싣는다. 요청과 digest 재료가 같아야 하므로 둘 다 같은 `extra`를 쓴다.

```js
  const wanted = step.produces === 'events' ? { occurrences: { wanted: Boolean(ctx.work.config.features.occurrencesInExtract) } } : {};
  const request = (extra) => requestModel(run, env, [{ stepId: step.id, purpose: 'generate', produces: step.produces, ...packRequest(ctx, run, step, { ...wanted, ...extra }) }]);
  const entry = takeAnswer(run, step.id, rawPackPayload(ctx, run, step, wanted));
```

(`retryOrGiveUp`이 `request({ retryReason })`로 부르고, `requestDigest`는 `retryReason`을 빼므로 digest는 `wanted`만으로 같다.)

`core/run/recheck-plan.js` `committedEvents`: 반환에 `occurrences: [], submittedOccurrences: false`를 더한다(재검사는 기록하지 않는다 — 결정 6은 커밋 뒤 기록).

```js
// core/occurrences/record-run.js
import { sha256 } from '../util/hash.js';
import { validateItems } from './validate.js';

/**
 * 커밋이 끝난 실행의 추출 등장 위치를 기록장에 남긴다(origin extract). 같은 영수증으로 두 번 쓰지 않는다(커밋 재개 멱등).
 * 실행 파일의 항목은 믿지 않는다: 커밋된 원고(draft, hash = 영수증 draftHash)와 다시 대조해 맞는 것만 쓴다.
 * 기능이 꺼져 있거나 호스트가 내지 않았으면 쓰지 않는다. 등장 위치는 잠금 판단에 쓰이지 않는다.
 */
export async function recordRunOccurrences({ ledger, ctx, run, receiptId }) {
  const events = run.outputs.events;
  if (!ctx.work.config.features.occurrences || !events?.submittedOccurrences) return null;
  const text = run.outputs.draft;
  if (typeof text !== 'string' || sha256(text) !== run.draftHash) return null;
  const records = await ledger.readAll();
  if (records.some((r) => r.type === 'occurrences' && r.receiptId === receiptId)) return null;
  const { items, errors } = validateItems(ctx.work, text, events.occurrences);
  if (errors.length) return null;
  return ledger.append({ type: 'occurrences', surface: { kind: 'node', id: run.nodeId, field: '' }, textHash: run.draftHash, items, origin: 'extract', receiptId });
}
```

`core/run/steps/commit-step.js`: import `recordRunOccurrences`. `commit` 함수 안 `commitNode` 결과 뒤, `run.results[step.id] = …` 앞에:

```js
    await recordRunOccurrences({ ledger: env.ledgers.occurrences, ctx, run, receiptId: result.receiptId });
```

`core/run/runner.js`:
- import `OCCURRENCES_LEDGER`. `ledgers`에 `occurrences: openLedger(root, OCCURRENCES_LEDGER, { now })`.
- `newRun`의 반환에 `featuresDigest: ctx.featuresDigest,`(`checksDigest` 다음).

`core/run/recheck-plan.js` `newRecheckRun`: 반환에 `featuresDigest: ctx.featuresDigest,`.

`core/run/sync.js` `outOfSync`:

```js
  const sameFeatures = run.featuresDigest === undefined || run.featuresDigest === ctx.featuresDigest;
  return !(run.pipelineDigest === pipelineFor(ctx, run).digest && run.checksDigest === checksDigestFor(ctx, run) && sameOrder && sameFeatures);
```

`syncPipeline`의 갱신 줄들(`run.checksDigest = …` 다음)에 `run.featuresDigest = ctx.featuresDigest;`. 주석의 "레벨 파이프라인·검사 digest, 앞뒤 판정 여부"에 ", 실행에 걸리는 기능(featuresDigest)"을 더한다.

`packs/novel/prompts/extract.md`: 예시 JSON에 `"occurrences": [{ "entityId": "doyun", "kind": "appearance", "quote": "원고 속 짧은 인용" }]`을 더하고, 끝에 다음 줄들을 더한다.

```
- 요청의 `occurrences.wanted`가 true면 `occurrences`에 등장 위치를 적는다. 없으면 적지 않는다.
  - `kind`는 `appearance`(장면에 직접 나옴) 또는 `mention`(이름·회상으로만 나옴).
  - `quote`는 원고에 그대로 있는 짧은 인용이다. 대명사·호칭("그녀는", "선장")도 된다. 같은 인용이 원고에 여러 번 있으면 `before`(바로 앞 글) 또는 `after`(바로 뒤 글)를 더해 한 곳을 가리킨다.
  - 틀린 인용이 하나라도 있으면 다시 묻는다.
```

- [ ] **Step 4: 통과 확인** — Run: `node --test test/run/extract-occurrences.test.js test/pack/novel-pack.test.js test/acceptance/m3.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/occurrences/record-run.js core/run/steps/generate.js core/run/steps/commit-step.js core/run/runner.js core/run/sync.js core/run/recheck-plan.js packs/novel/prompts/extract.md test/run/extract-occurrences.test.js
git commit -m "feat(run): verify extract-step occurrences against the draft, record them after commit, resync on feature change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B4: `occurrenceScope` — 기록된 등장 위치를 검사 범위에

> 리뷰어: 가장 강한 모델. 검사 범위(`refs`)와 영수증·stale을 건드린다. 공격: 토글로 stale 이유를 없애기, 영수증 `features` 위조, 범위를 줄여 hard 검사를 피하기(기록은 더하기만 하는지).

**Files:**
- Modify: `core/scope/scope.js`, `core/run/payload.js`, `core/run/runner.js`(context), `core/run/receipt-builder.js`, `core/run/steps/recheck-step.js`, `core/ledger/receipts.js`, `core/scope/stale-checks.js`, `core/scope/stale.js`, `core/status.js`
- Test: `test/run/occurrence-scope.test.js`

**Interfaces:**
- Consumes: B1 `occurrenceStates`, `liveMarks`, `OCCURRENCES_LEDGER`.
- Produces:
  - `gatherScope({ ..., marks = null })`: `marks`는 `liveMarks(...)` 결과이거나 null(기능 꺼짐).
  - 실행기 `ctx.marks`(기능 켜짐일 때 배열, 아니면 null). `scopeFor`가 넘긴다.
  - 영수증·재검사 기록 선택 필드 `features: { occurrenceScope: boolean }`. `validateReceipt`가 모양이 틀리면 `FEATURES_INVALID`.
  - `featureReason({ work, had }) → {kind:'feature', id:'occurrenceScope', was, now} | null`.
  - `findStale`이 `featureReason`을 이유로 든다(재검사 기록이 있으면 그것 기준).

- [ ] **Step 1: 실패하는 테스트**

```js
// test/run/occurrence-scope.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { gatherScope } from '../../core/scope/scope.js';
import { openWork } from '../../core/store/work.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { occurrenceStates, liveMarks } from '../../core/occurrences/state.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { validateReceipt } from '../../core/ledger/receipts.js';
import { findStale } from '../../core/scope/stale.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { makeReceipt } from '../support/receipts.js';

const makeRunner = (root) => () => createRunner({ root, packs: fakePacks() });
async function setFeatures(root, features) {
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features }));
}
const marksOf = async (root, work) => liveMarks(occurrenceStates(work, await openLedger(root, OCCURRENCES_LEDGER).readAll()));

test('marks add entities to the scope: this node when its text is the file text, and upper plans; never remove', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-005' }, items: [{ entityId: 'locked-door', kind: 'mention', quote: '열쇠공을' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'arc-awakening' }, items: [{ entityId: 'doyun', kind: 'mention', quote: '하나가' }] });
  const work = await openWork(root);
  const marks = await marksOf(root, work);
  const body = work.tree.nodes.get('ep-005').body;
  const off = gatherScope({ work, events: [], nodeId: 'ep-005', draftText: body });
  const on = gatherScope({ work, events: [], nodeId: 'ep-005', draftText: body, marks });
  assert.deepEqual(off.entityIds, ['hana']);
  assert.deepEqual(on.entityIds, ['hana', 'locked-door']);
  assert.ok(off.entityIds.every((id) => on.entityIds.includes(id)));
  const otherDraft = gatherScope({ work, events: [], nodeId: 'ep-005', draftText: '다른 원고의 하나', marks });
  assert.deepEqual(otherDraft.entityIds, ['hana']);
  const ep3 = gatherScope({ work, events: [], nodeId: 'ep-003', draftText: '도윤이 왔다.', marks });
  assert.deepEqual(ep3.upperMentions, []);
  const ep6 = gatherScope({ work, events: [], nodeId: 'ep-006', draftText: '도윤이 왔다.', marks });
  assert.deepEqual(ep6.upperMentions, [{ nodeId: 'arc-awakening', entityIds: ['doyun'] }]);
});

test('the receipt records occurrenceScope; toggling it later marks the node stale with a feature reason', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const trail = await driveToEnd(makeRunner(root), createFakeHost(), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  const receipts = await openLedger(root, 'receipts').readAll();
  assert.deepEqual(receipts.find((r) => r.type === 'receipt' && r.receiptId === trail.at(-1).receiptId).features, { occurrenceScope: false });
  await setFeatures(root, { occurrenceScope: true });
  const stale = findStale({ work: await openWork(root), receiptRecords: receipts, events: [] });
  assert.deepEqual(stale.find((s) => s.nodeId === 'ep-001').reasons, [{ kind: 'feature', id: 'occurrenceScope', was: false, now: true }]);
  const recheck = await driveToEnd(makeRunner(root), createFakeHost(), { start: { node: 'ep-001', mode: 'recheck' }, until: (o) => o.status === 'done' });
  assert.equal(recheck.at(-1).mode, 'recheck');
  const after = findStale({ work: await openWork(root), receiptRecords: await openLedger(root, 'receipts').readAll(), events: [] });
  assert.equal(after.find((s) => s.nodeId === 'ep-001'), undefined);
});

test('a receipt with a malformed features field is invalid; an old receipt without it counts as off', async () => {
  assert.deepEqual(validateReceipt(makeReceipt({ features: { occurrenceScope: 'yes' } })).map((p) => p.code), ['FEATURES_INVALID']);
  assert.deepEqual(validateReceipt(makeReceipt({ features: null })).map((p) => p.code), ['FEATURES_INVALID']);
  assert.deepEqual(validateReceipt(makeReceipt({})).map((p) => p.code), []);
});
```

`makeReceipt(overrides)`가 `test/support/receipts.js`에 있는지 먼저 확인한다. 이름·인자가 다르면 이 테스트를 그 도우미에 맞춘다. 없으면 이 테스트 파일 안에 최소 유효 영수증 도우미를 만든다(`test/core/receipts.test.js`의 유효 영수증 모양을 그대로 쓴다).

- [ ] **Step 2: 실패 확인** — Run: `node --test test/run/occurrence-scope.test.js` · Expected: FAIL

- [ ] **Step 3: 구현**

`core/scope/scope.js` `gatherScope` 인자에 `marks = null`. 몸체에서:

```js
  const nodeText = node.body;
  // occurrenceScope(M4): 기록된 등장 위치는 범위를 더하기만 한다. 이 노드의 기록은 지금 원고가 파일 본문과 같을 때만(재검사·다시 커밋) 쓴다.
  const markedHere = (marks ?? []).filter((m) => m.surface.kind === 'node' && m.surface.id === nodeId && draftText === nodeText).map((m) => m.entityId);
  const entityIds = uniqueSorted([...appearances, ...scanned, ...(extracted?.mentions ?? []), ...fromEvents, ...markedHere].filter(known));
```

`upperMentions`의 `entityIds` 계산을 scan + 그 노드 표면의 기록으로 넓힌다:

```js
    .map((n) => {
      const marked = (marks ?? []).filter((m) => m.surface.kind === 'node' && m.surface.id === n.id).map((m) => m.entityId);
      const found = new Set([...scanMentions(n.body, work.entities.values()).keys(), ...marked]);
      return { nodeId: n.id, entityIds: [...found].filter((id) => entityIds.includes(id)).sort() };
    })
```

그림: `a.entities.some(...)` 조건을 `a.entities.some((id) => entityIds.includes(id)) || (marks ?? []).some((m) => m.surface.kind === 'asset' && m.surface.id === a.id && entityIds.includes(m.entityId))`로 바꾼다.

주의: 테스트의 ep-006 `upperMentions` 기대값은 arc-awakening이 ep-006의 조상이 아니라서 들어간다(ep-006은 arc-hunt 아래). ep-003은 arc-awakening 아래라 `ancestorIds`에 걸려 빠진다. 구현 후 기대값이 다르면 트리 관계를 다시 확인하고 테스트를 바로잡는다(트리 사실에 맞춘다).

`core/run/runner.js` `context()`:

```js
    const occurrenceRecords = workspace.work.config.features.occurrenceScope ? await ledgers.occurrences.readAll() : null;
    const marks = occurrenceRecords ? liveMarks(occurrenceStates(workspace.work, occurrenceRecords)) : null;
    return { ...workspace, receiptRecords, events, marks };
```

`core/run/payload.js` `scopeFor`: `gatherScope({ ..., marks: ctx.marks ?? null })`.

`core/status.js`·`core/scope/*`에서 `gatherScope`를 부르는 다른 곳이 있으면(`grep -rn gatherScope core`) marks를 넘기지 않는다(null) — 상태 계산은 영수증 refs 기준이라 영향 없다.

`core/run/receipt-builder.js`: 반환에 `order` 다음 `features: { occurrenceScope: Boolean(work.config.features.occurrenceScope) },`.
`core/run/steps/recheck-step.js` `buildRecord`: `order` 다음 같은 줄(`ctx.work.config.features.occurrenceScope`).

`core/ledger/receipts.js`:

```js
/** features(선택): { occurrenceScope: boolean }. 옛 영수증에는 없다(끈 것으로 본다). */
export function pushFeaturesProblems(features, push) {
  if (features === undefined) return;
  if (!features || typeof features !== 'object' || Array.isArray(features) || typeof features.occurrenceScope !== 'boolean') push('FEATURES_INVALID');
}
```

`validateReceipt`에서 `pushStructureProblems` 다음에 `pushFeaturesProblems(receipt.features, push);`.

`core/scope/stale-checks.js`:

```js
/**
 * 커밋(또는 재검사) 때와 occurrenceScope 가 달라졌으면 이유를 돌려준다. 옛 기록(features 없음)은 끈 것으로 본다.
 * 재검사로 풀린다(범위를 새로 모아 다시 검사하므로).
 */
export function featureReason({ work, had }) {
  const was = Boolean(had?.occurrenceScope);
  const now = Boolean(work.config.features.occurrenceScope);
  return was === now ? null : { kind: 'feature', id: 'occurrenceScope', was, now };
}
```

`core/scope/stale.js`: import `featureReason`. `order` 이유 다음에 `const feature = featureReason({ work, had: recheck?.features ?? receipt.features }); if (feature) reasons.push(feature);`.

`core/scope/rechecks.js`의 `pendingRechecks`가 이유 종류를 걸러 재검사 대상을 고른다면(`grep -n kind core/scope/rechecks.js`), `feature`도 재검사로 풀리는 이유로 넣는다(`check`·`order`와 같은 쪽).

- [ ] **Step 4: 통과 확인** — Run: `node --test test/run/occurrence-scope.test.js test/run/scope.test.js test/core/receipts.test.js test/run/recheck*.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/scope/scope.js core/run/payload.js core/run/runner.js core/run/receipt-builder.js core/run/steps/recheck-step.js core/ledger/receipts.js core/scope/stale-checks.js core/scope/stale.js core/scope/rechecks.js test/run/occurrence-scope.test.js
git commit -m "feat(scope): let recorded occurrences widen the check scope behind occurrenceScope, and stale on toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`core/scope/rechecks.js`를 바꾸지 않았으면 `git add`에서 뺀다.)

---

# Part C — 이름 바꾸기 · 다시 커밋

### Task C1: 여러 파일을 한 번에 쓰기 (`file-tx`) + 작업 잠금에서 복구

> 리뷰어: 가장 강한 모델. 공격: 중간 실패 뒤 파일이 하나라도 바뀌었는지, SIGKILL 뒤 복구, journal·백업 경로로 작품 밖에 쓰기(`..`, 절대 경로, 심볼릭 링크), 복구가 기록장(`.folio/ledger`)을 건드릴 수 있는지.

**Files:**
- Create: `core/util/file-tx.js`, `test/support/child-tx.js`
- Modify: `core/run/work-lock.js`, `core/status.js`, `test/support/crash.js`
- Test: `test/core/file-tx.test.js`

**Interfaces:**
- Produces:
  - `TX_DIR = '.folio/tx'`
  - `writeFilesTx(root, files, { hooks }) → Promise<{ written: number }>`. `files`: `Array<{ path: string (작품 기준 상대, '/' 구분), beforeHash: string, text: string }>`. 쓰기 전에 모든 파일의 지금 hash를 대조한다(`TX_FILE_CHANGED`, 아무것도 안 씀). 경로 규칙 위반은 `TX_PATH_INVALID`. 허용 최상위 폴더: `tree`, `entities`, `assets`. `hooks.beforeWrite?(index)`가 던지면 되돌리고 `TX_FAILED`(`details.cause`)를 던진다.
  - `recoverFileTx(root) → Promise<{ recovered: boolean, files: string[] }>`: journal이 있으면 백업으로 되돌리고 tx 폴더를 지운다. journal 없이 남은 백업은 지운다.
  - `pendingFileTx(root) → Promise<boolean>`.
  - `withWorkLock`: 잠금을 잡은 직후 `recoverFileTx(key)`.
  - `workStatus` 경고에 `{ code: 'TX_INTERRUPTED' }`(journal이 있으면).
  - `runChild(root, scenario)`가 `test/support/child-tx.js`도 부를 수 있도록 `runTxChild(root, scenario)`를 `crash.js`에 더한다.

- [ ] **Step 1: 실패하는 테스트**

```js
// test/core/file-tx.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pendingFileTx, recoverFileTx, writeFilesTx, TX_DIR } from '../../core/util/file-tx.js';
import { withWorkLock } from '../../core/run/work-lock.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, tempDir } from '../support/fixtures.js';
import { runTxChild, wasKilled } from '../support/crash.js';
import { applyRename } from '../../core/rename/apply.js';

const A = 'tree/01-arc-awakening/01-ep-001.md';
const B = 'tree/01-arc-awakening/02-ep-002.md';
const E = 'entities/character/hana.md';
const read = (root, path) => readFile(join(root, path), 'utf8');
async function plan(root, edits) {
  return Promise.all(Object.entries(edits).map(async ([path, fn]) => {
    const text = await read(root, path);
    return { path, beforeHash: sha256(text), text: fn(text) };
  }));
}
const snapshot = async (root) => Object.fromEntries(await Promise.all([A, B, E].map(async (p) => [p, await read(root, p)])));

test('all files are written and the tx folder is gone afterwards', async () => {
  const root = await copyFixture('serial-2level');
  const files = await plan(root, { [A]: (t) => t.replace('하나는', '세라는'), [E]: (t) => t.replace('하나', '세라') });
  assert.deepEqual(await writeFilesTx(root, files), { written: 2 });
  assert.match(await read(root, A), /세라는/);
  assert.equal(await pendingFileTx(root), false);
  await assert.rejects(stat(join(root, TX_DIR)), { code: 'ENOENT' });
});

test('a failure in the middle restores every file; a changed file or a bad path refuses before any write', async () => {
  const root = await copyFixture('serial-2level');
  const before = await snapshot(root);
  const files = await plan(root, { [A]: (t) => `${t}x`, [B]: (t) => `${t}y`, [E]: (t) => `${t}z` });
  await assert.rejects(writeFilesTx(root, files, { hooks: { beforeWrite: (i) => { if (i === 2) throw new Error('disk full'); } } }),
    (e) => e.code === 'TX_FAILED' && /disk full/.test(e.details.cause));
  assert.deepEqual(await snapshot(root), before);
  assert.equal(await pendingFileTx(root), false);
  await writeFile(join(root, B), 'someone else');
  await assert.rejects(writeFilesTx(root, files), (e) => e.code === 'TX_FILE_CHANGED' && e.details.path === B);
  assert.equal(await read(root, A), before[A]);
  for (const path of ['../x.md', '/etc/x', '.folio/ledger/receipts.jsonl', 'work.yaml', 'tree/../work.yaml', 'sources/cell.yaml', 'tree\\a.md']) {
    await assert.rejects(writeFilesTx(root, [{ path, beforeHash: 'sha256:0', text: '' }]), { code: 'TX_PATH_INVALID' }, path);
  }
});

test('a symlinked file inside the work is refused', async () => {
  const root = await copyFixture('serial-2level');
  const outside = join(await tempDir(), 'outside.md');
  await writeFile(outside, 'x');
  await symlink(outside, join(root, 'tree', 'link.md'));
  await assert.rejects(writeFilesTx(root, [{ path: 'tree/link.md', beforeHash: sha256('x'), text: 'y' }]), { code: 'TX_PATH_INVALID' });
  assert.equal(await readFile(outside, 'utf8'), 'x');
});

test('after a SIGKILL in the middle, the next work lock restores every file', async () => {
  const root = await copyFixture('serial-2level');
  const before = await snapshot(root);
  const child = runTxChild(root, 'kill-after-second-write');
  assert.ok(wasKilled(child), child.stderr);
  assert.notDeepEqual(await snapshot(root), before);
  assert.equal(await pendingFileTx(root), true);
  await withWorkLock(root, async () => {});
  assert.deepEqual(await snapshot(root), before);
  assert.equal(await pendingFileTx(root), false);
  assert.deepEqual(await recoverFileTx(root), { recovered: false, files: [] });
  assert.equal((await readdir(join(root, '.folio'))).includes('tx'), false);
});
```

```js
// test/support/child-tx.js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFilesTx } from '../../core/util/file-tx.js';
import { sha256 } from '../../core/util/hash.js';

const [root, scenario] = process.argv.slice(2);
/** 시나리오 → 쓸 파일(fixture 별). 두 파일을 쓴 뒤 세 번째 앞에서 SIGKILL 로 죽는다. */
const PATHS = {
  'kill-after-second-write': ['tree/01-arc-awakening/01-ep-001.md', 'tree/01-arc-awakening/02-ep-002.md', 'entities/character/hana.md'],
  'kill-after-second-write-book': ['tree/01-part-basics/02-chapter-energy/01-atp.md', 'tree/01-part-basics/01-chapter-cells/02-membranes.md', 'entities/term/atp.md'],
};
const paths = PATHS[scenario];
if (!paths) throw new Error(`unknown scenario ${scenario}`);
const files = await Promise.all(paths.map(async (path) => {
  const text = await readFile(join(root, path), 'utf8');
  return { path, beforeHash: sha256(text), text: `${text}!` };
}));
await writeFilesTx(root, files, { hooks: { beforeWrite: (i) => { if (i === 2) process.kill(process.pid, 'SIGKILL'); } } });
```

`test/support/crash.js`에 더한다:

```js
const TX_CHILD = join(import.meta.dirname, 'child-tx.js');
/** 여러 파일 쓰기를 자식 프로세스에서 돌리다 scenario 시점에 SIGKILL 로 죽인다. */
export function runTxChild(root, scenario) {
  return spawnSync(process.execPath, [TX_CHILD, root, scenario], { encoding: 'utf8', timeout: 60_000 });
}
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/core/file-tx.test.js` · Expected: FAIL (module not found)

- [ ] **Step 3: 구현**

```js
// core/util/file-tx.js
import { lstat, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FolioError } from '../errors.js';
import { readTextOrNull, writeFileAtomic } from './fs.js';
import { sha256 } from './hash.js';

/** 여러 파일 쓰기의 journal·백업 자리. 작품 안 .folio/tx. */
export const TX_DIR = '.folio/tx';
const JOURNAL = 'journal.json';
/** 이 쓰기가 닿을 수 있는 최상위 폴더. 기록장·실행 파일·work.yaml·자료 원본은 여기로 쓸 수 없다. */
const ALLOWED_TOP = new Set(['tree', 'entities', 'assets']);

async function assertSafe(root, path) {
  const parts = typeof path === 'string' ? path.split('/') : [];
  const bad = !parts.length || path.includes('\\') || path.includes('\0') || path.startsWith('/')
    || parts.some((p) => p === '' || p === '.' || p === '..' || p.startsWith('.')) || !ALLOWED_TOP.has(parts[0]);
  if (bad) throw new FolioError('TX_PATH_INVALID', String(path).slice(0, 200), { path: String(path).slice(0, 200) });
  let at = root;
  for (const part of parts) {
    at = join(at, part);
    const info = await lstat(at).catch((error) => { if (error?.code === 'ENOENT') return null; throw error; });
    if (info?.isSymbolicLink()) throw new FolioError('TX_PATH_INVALID', `${path} goes through a symbolic link`, { path });
  }
}

/**
 * 여러 파일을 한 번에 쓴다(설계 §15 "한 번에 쓰기"). 중간에 실패하면 아무것도 안 바뀐다.
 * 1) 모든 파일의 지금 hash 를 계획의 beforeHash 와 대조한다(다르면 쓰기 전에 거부).
 * 2) 원래 글을 백업하고 journal 을 쓴다. 3) 파일마다 원자적으로 쓴다.
 * 4) 실패하면 백업으로 되돌리고 TX_FAILED. 프로세스가 죽으면 다음 withWorkLock 이 recoverFileTx 로 되돌린다.
 * 5) 끝나면 journal·백업을 지운다. 부르는 쪽이 작업 잠금을 쥐고 있어야 한다.
 */
export async function writeFilesTx(root, files, { hooks = {} } = {}) {
  for (const file of files) await assertSafe(root, file.path);
  const originals = [];
  for (const file of files) {
    const text = await readTextOrNull(join(root, file.path));
    if (text === null || sha256(text) !== file.beforeHash) throw new FolioError('TX_FILE_CHANGED', `${file.path} changed since the plan`, { path: file.path });
    originals.push(text);
  }
  const dir = join(root, TX_DIR);
  await rm(dir, { recursive: true, force: true });
  const entries = files.map((file, index) => ({ path: file.path, backup: `backup-${index}` }));
  for (const [index, entry] of entries.entries()) await writeFileAtomic(join(dir, entry.backup), originals[index]);
  await writeFileAtomic(join(dir, JOURNAL), JSON.stringify({ id: randomUUID(), files: entries }));
  try {
    for (const [index, file] of files.entries()) {
      await hooks.beforeWrite?.(index);
      await writeFileAtomic(join(root, file.path), file.text);
    }
  } catch (error) {
    await restore(root);
    throw new FolioError('TX_FAILED', 'writing stopped in the middle; every file was restored', { cause: String(error?.message ?? error).slice(0, 300) });
  }
  await rm(dir, { recursive: true, force: true });
  return { written: files.length };
}

async function restore(root) {
  const dir = join(root, TX_DIR);
  const journal = await readTextOrNull(join(dir, JOURNAL));
  const restored = [];
  if (journal !== null) {
    const { files } = JSON.parse(journal);
    for (const entry of files) {
      await assertSafe(root, entry.path);
      await writeFileAtomic(join(root, entry.path), await readFile(join(dir, entry.backup), 'utf8'));
      restored.push(entry.path);
    }
  }
  await rm(dir, { recursive: true, force: true });
  return restored;
}

/** 끝나지 않은 쓰기가 남았으면 되돌린다. withWorkLock 이 잠금을 잡은 직후 부른다. */
export async function recoverFileTx(root) {
  const pending = await pendingFileTx(root);
  const files = await restore(root);
  return { recovered: pending, files };
}

export async function pendingFileTx(root) {
  return (await readTextOrNull(join(root, TX_DIR, JOURNAL))) !== null;
}
```

journal을 쓰기 전에 죽으면 백업만 남는다. 파일은 아직 안 바뀌었으니 `restore`가 journal 없이 폴더만 지운다. journal에 적힌 파일 중 아직 안 쓴 것은 원래 글 그대로라 되돌려 써도 같다.

`core/run/work-lock.js`: import `recoverFileTx`. `withWorkLock`의 `const lock = await acquire(...)` 다음 `try` 안, `held.run(...)` 앞에 `await recoverFileTx(key);`를 넣는다. 주석: `여러 파일 쓰기(이름 바꾸기)가 죽으며 남긴 반쪽 상태는 잠금을 잡은 쪽이 먼저 되돌린다.`

`core/status.js`: import `pendingFileTx`. `warnings`를 만든 뒤 `if (await pendingFileTx(root)) warnings.push({ code: 'TX_INTERRUPTED' });`.

- [ ] **Step 4: 통과 확인** — Run: `node --test test/core/file-tx.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/util/file-tx.js core/run/work-lock.js core/status.js test/core/file-tx.test.js test/support/child-tx.js test/support/crash.js
git commit -m "feat(util): write several work files all-or-nothing with a journal, and recover on the next work lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task C2: 이름 바꾸기 계획 (메모리에서만)

**Files:**
- Create: `core/rename/plan.js`, `core/rename/josa.js`
- Test: `test/core/rename-plan.test.js`

**Interfaces:**
- Consumes: B1 `occurrenceStates`; A3 `surfaceFields`, `surfaceKey`, `allSurfaces`, `CONTEXT_CHARS`; A2 `fencedRanges`, `inRanges`, `maskRanges`; `parseDoc`, `serializeDoc`; `stringifyYaml`; `sha256`, `canonicalJson`.
- Produces:
  - `planRename(work, occurrenceRecords, { entityId, newName, keepOldName = true, include = [] }) → Plan`
  - `Plan = { entityId, oldName, newName, keepOldName, changes: Change[], candidates: Change[], untouched: Array<{surface, field, count, reason:'SOURCE_IMMUTABLE'}>, files: Array<{path, beforeHash, text}>, occurrenceUpdates: Array<{surface, textHash, items}>, committed: string[] (바뀌는 커밋 노드 id), warnings: Array<{changeId, code:'JOSA_MISMATCH', particle}>, planDigest }`
  - `Change = { id, surface:{kind,id,field}, start, before, after, source:'occurrence'|'scan' }`. `id = "<kind>:<id>:<field>@<start>"`. `changes`는 적용할 것(occurrence + include로 고른 scan), `candidates`는 고르지 않은 scan.
  - 오류: `ENTITY_NOT_FOUND`, `RENAME_NAME_INVALID`(빈 이름, 200자 초과, 줄바꿈, 옛 이름과 같음), `RENAME_NAME_TAKEN`(다른 엔티티의 이름·별칭), `RENAME_INCLUDE_UNKNOWN`(없는 후보 id).
  - `josaWarning(oldName, newName, following) → string|null`

- [ ] **Step 1: 실패하는 테스트**

```js
// test/core/rename-plan.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { planRename } from '../../core/rename/plan.js';
import { josaWarning } from '../../core/rename/josa.js';
import { copyFixture } from '../support/fixtures.js';

const records = (root) => openLedger(root, OCCURRENCES_LEDGER).readAll();

test('josa warning when the final consonant changes before a particle', () => {
  assert.equal(josaWarning('하나', '세린', '는 웃었다'), '는');
  assert.equal(josaWarning('하나', '세라', '는 웃었다'), null);
  assert.equal(josaWarning('도윤', '하나', '이 왔다'), '이');
  assert.equal(josaWarning('ATP', '아데노신삼인산', '는'), null);
  assert.equal(josaWarning('하나', '세린', ' 씨'), null);
});

test('a character rename changes recorded occurrences by default and offers scan hits as candidates', async () => {
  const root = await copyFixture('serial-2level');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
  const plan = planRename(await openWork(root), await records(root), { entityId: 'hana', newName: '세라' });
  assert.equal(plan.oldName, '하나');
  assert.deepEqual(plan.changes.map((c) => [c.id, c.source]), [['node:ep-001:@0', 'occurrence']]);
  assert.ok(plan.candidates.some((c) => c.id === 'node:ep-003:@0' && c.source === 'scan'));
  assert.ok(plan.candidates.some((c) => c.surface.id === 'arc-awakening'));
  assert.deepEqual(plan.files.map((f) => f.path), ['entities/character/hana.md', 'tree/01-arc-awakening/01-ep-001.md']);
  assert.match(plan.files[1].text, /^---\nid: ep-001\nlevel: episode\ntitle: 1화\n---\n세라는 지하실/);
  assert.match(plan.files[0].text, /name: 세라\naliases:\n {2}- 하나\n/);
  assert.deepEqual(plan.occurrenceUpdates[0].items.map((i) => i.quote), ['세라는']);
  assert.deepEqual(plan.committed, []);
  assert.match(plan.planDigest, /^sha256:/);
});

test('include picks scan candidates; unknown ids and taken or bad names are refused; the digest follows every choice', async () => {
  const root = await copyFixture('serial-2level');
  const work = await openWork(root);
  const base = planRename(work, [], { entityId: 'hana', newName: '세라' });
  const picked = planRename(work, [], { entityId: 'hana', newName: '세라', include: ['node:ep-003:@0'] });
  assert.deepEqual(picked.changes.map((c) => c.id), ['node:ep-003:@0']);
  assert.notEqual(picked.planDigest, base.planDigest);
  assert.notEqual(planRename(work, [], { entityId: 'hana', newName: '세라', keepOldName: false }).planDigest, base.planDigest);
  assert.throws(() => planRename(work, [], { entityId: 'hana', newName: '세라', include: ['node:ep-003:@99'] }), { code: 'RENAME_INCLUDE_UNKNOWN' });
  for (const name of ['', '하나', 'a\nb', 'x'.repeat(201)]) assert.throws(() => planRename(work, [], { entityId: 'hana', newName: name }), { code: 'RENAME_NAME_INVALID' }, name);
  assert.throws(() => planRename(work, [], { entityId: 'hana', newName: '도윤' }), { code: 'RENAME_NAME_TAKEN' });
  assert.throws(() => planRename(work, [], { entityId: 'nobody', newName: 'x' }), { code: 'ENTITY_NOT_FOUND' });
});

test('a term rename in a knowledge book: bodies, asset briefs change; sources stay and are listed as untouched', async () => {
  const root = await copyFixture('knowledge-book');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'assets', 'cell.yaml'), 'id: cell\nbrief:\n  show: [ATP 분자 모형]\n  entities: [atp]\n');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'atp', kind: 'appearance', quote: 'ATP는' }] });
  await submitOccurrences(root, { surface: { kind: 'asset', id: 'cell', field: '/brief/show/0' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP 분자' }] });
  await submitOccurrences(root, { surface: { kind: 'source', id: 'cell-notes', field: '/spans/0/quote' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP는' }] });
  const plan = planRename(await openWork(root), await records(root), { entityId: 'atp', newName: '아데노신삼인산', keepOldName: true });
  assert.deepEqual(plan.files.map((f) => f.path).sort(), ['assets/cell.yaml', 'entities/term/atp.md', 'tree/01-part-basics/02-chapter-energy/01-atp.md']);
  assert.match(plan.files.find((f) => f.path === 'assets/cell.yaml').text, /아데노신삼인산 분자 모형/);
  assert.deepEqual(plan.untouched, [{ surface: { kind: 'source', id: 'cell-notes' }, field: '/spans/0/quote', count: 1, reason: 'SOURCE_IMMUTABLE' }]);
  assert.ok(plan.candidates.some((c) => c.surface.id === 'glossary'));
  assert.equal(plan.warnings.length, 0);
});

test('names inside code fences are never changed or offered', async () => {
  const root = await copyFixture('serial-2level');
  const path = join(root, 'tree', '01-arc-awakening', '03-ep-003.md');
  await writeFile(path, '---\nid: ep-003\nlevel: episode\ntitle: 3화\n---\n```\n하나\n```\n');
  const plan = planRename(await openWork(root), [], { entityId: 'hana', newName: '세라' });
  assert.equal(plan.candidates.some((c) => c.surface.id === 'ep-003'), false);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test test/core/rename-plan.test.js` · Expected: FAIL

- [ ] **Step 3: 구현**

```js
// core/rename/josa.js
const PARTICLES = [['은', '는'], ['이', '가'], ['을', '를'], ['과', '와'], ['으로', '로'], ['아', '야'], ['이랑', '랑']];

/** 한글 음절이면 받침이 있는가. 한글이 아니면 null(판단하지 않음). */
function hasBatchim(char) {
  const code = char?.codePointAt(0) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 이름 바로 뒤가 조사이고, 옛 이름과 새 이름의 받침 유무가 달라 그 조사가 어색해지면 그 조사를 돌려준다.
 * 고치지 않는다 — 계획에 경고로만 싣는다(작가 몫).
 */
export function josaWarning(oldName, newName, following) {
  const was = hasBatchim(oldName.at(-1));
  const now = hasBatchim(newName.at(-1));
  if (was === null || now === null || was === now) return null;
  const all = PARTICLES.flat().sort((a, b) => b.length - a.length);
  return all.find((p) => following.startsWith(p)) ?? null;
}
```

```js
// core/rename/plan.js
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { stringifyYaml } from '../util/yaml.js';
import { fencedRanges, maskRanges } from '../util/fences.js';
import { serializeDoc } from '../store/frontmatter.js';
import { TREE_DIR } from '../store/tree.js';
import { CONTEXT_CHARS, resolveQuote } from '../occurrences/anchor.js';
import { occurrenceStates } from '../occurrences/state.js';
import { allSurfaces, surfaceFields, surfaceKey } from '../occurrences/surfaces.js';
import { josaWarning } from './josa.js';

/** 이름 바꾸기가 고칠 수 있는 표면. 자료(source)는 원본 불변이라 고치지 않는다. */
const EDITABLE = new Set(['node', 'entity', 'asset']);

function assertName(work, entity, newName) {
  if (typeof newName !== 'string' || !newName.trim() || newName.length > 200 || /[\r\n]/.test(newName) || newName === entity.name) {
    throw new FolioError('RENAME_NAME_INVALID', String(newName).slice(0, 200));
  }
  for (const other of work.entities.values()) {
    if (other.id !== entity.id && (other.name === newName || other.aliases.includes(newName))) {
      throw new FolioError('RENAME_NAME_TAKEN', `${newName} is used by ${other.id}`, { by: other.id });
    }
  }
}

/** 글에서 옛 이름이 시작하는 위치들(코드 블록 밖, 겹치지 않게). */
function hitsIn(text, name) {
  const masked = maskRanges(text, fencedRanges(text));
  const out = [];
  let at = masked.indexOf(name);
  while (at !== -1) { out.push(at); at = masked.indexOf(name, at + name.length); }
  return out;
}

/** 뒤에서부터 바꿔서 앞 위치가 흔들리지 않게 한다. */
const replaceAt = (text, starts, from, to) => [...starts].sort((a, b) => b - a)
  .reduce((out, start) => out.slice(0, start) + to + out.slice(start + from.length), text);

/** JSON Pointer 로 가리킨 문자열 하나만 바꾼 사본. */
function setPointer(value, pointer, text) {
  const copy = structuredClone(value);
  const keys = pointer.split('/').slice(1).map((k) => k.replace(/~1/g, '/').replace(/~0/g, '~'));
  let at = copy;
  for (const key of keys.slice(0, -1)) at = at[key];
  at[keys.at(-1)] = text;
  return copy;
}

/** frontmatter 는 그대로 두고 본문만 바꾼 파일 글. 본문은 파일 끝 바이트 그대로라(parseDoc) 앞부분이 frontmatter 다. */
const withBody = (fileText, body, newBody) => fileText.slice(0, fileText.length - body.length) + newBody;

/**
 * 이름 바꾸기 계획(설계 §15). 파일은 읽기만 한다 — 쓰기는 applyRename 이 같은 인자로 계획을 다시 만들어 digest 를 대조한 뒤 한다.
 * 바꿀 곳: 기록된 등장 위치(stale 아님) 인용문 안의 옛 이름(기본 포함) + scan 으로 찾은 옛 이름(include 로 고름).
 * 자료는 바꾸지 않는다 — untouched 로 알린다. 코드 블록 안은 보지 않는다.
 */
export function planRename(work, occurrenceRecords, { entityId, newName, keepOldName = true, include = [] }) {
  const entity = work.entities.get(entityId);
  if (!entity) throw new FolioError('ENTITY_NOT_FOUND', String(entityId).slice(0, 200));
  assertName(work, entity, newName);
  const oldName = entity.name;
  const states = occurrenceStates(work, occurrenceRecords).filter((s) => s.status !== 'stale');

  const all = [];
  const untouched = [];
  for (const { kind, id, field, text } of allSurfaces(work)) {
    const hits = hitsIn(text, oldName);
    if (!hits.length) continue;
    if (!EDITABLE.has(kind)) { untouched.push({ surface: { kind, id }, field, count: hits.length, reason: 'SOURCE_IMMUTABLE' }); continue; }
    const key = surfaceKey({ kind, id, field });
    const marks = states.filter((s) => s.entityId === entityId && surfaceKey(s.surface) === key);
    for (const start of hits) {
      const inMark = marks.some((m) => m.start <= start && start + oldName.length <= m.start + m.quote.length);
      all.push({
        id: `${key}@${start}`, surface: { kind, id, field }, start,
        before: text.slice(Math.max(0, start - CONTEXT_CHARS), start),
        after: text.slice(start + oldName.length, start + oldName.length + CONTEXT_CHARS),
        source: inMark ? 'occurrence' : 'scan',
      });
    }
  }
  const scanIds = new Set(all.filter((c) => c.source === 'scan').map((c) => c.id));
  const unknown = include.filter((id) => !scanIds.has(id));
  if (unknown.length) throw new FolioError('RENAME_INCLUDE_UNKNOWN', unknown.join(', ').slice(0, 200), { unknown: unknown.slice(0, 50) });
  const chosen = new Set([...all.filter((c) => c.source === 'occurrence').map((c) => c.id), ...include]);
  const changes = all.filter((c) => chosen.has(c.id));
  const candidates = all.filter((c) => !chosen.has(c.id));
  const warnings = changes.map((c) => ({ changeId: c.id, code: 'JOSA_MISMATCH', particle: josaWarning(oldName, newName, c.after) }))
    .filter((w) => w.particle);

  // 표면마다 새 글
  const startsBySurface = new Map();
  for (const change of changes) {
    const key = surfaceKey(change.surface);
    if (!startsBySurface.has(key)) startsBySurface.set(key, { surface: change.surface, starts: [] });
    startsBySurface.get(key).starts.push(change.start);
  }
  const newTexts = new Map();
  for (const [key, { surface, starts }] of startsBySurface) {
    newTexts.set(key, replaceAt(surfaceFields(work, surface.kind, surface.id).get(surface.field), starts, oldName, newName));
  }

  // 파일: 노드·다른 엔티티는 본문만, 그림은 brief 글 leaf 만, 대상 엔티티는 이름·별칭 + 본문
  const files = [];
  const committed = [];
  const assetBriefs = new Map();
  for (const [key, { surface }] of startsBySurface) {
    const text = newTexts.get(key);
    if (surface.kind === 'node') {
      const node = work.tree.nodes.get(surface.id);
      files.push({ path: `${TREE_DIR}/${node.path}`, beforeHash: sha256(node.fileText), text: withBody(node.fileText, node.body, text) });
      if (node.status === 'committed') committed.push(node.id);
    } else if (surface.kind === 'entity' && surface.id !== entityId) {
      const other = work.entities.get(surface.id);
      files.push({ path: other.path, beforeHash: other.rev, text: withBody(other.fileText, other.body, text) });
    } else if (surface.kind === 'asset') {
      const asset = work.assets.get(surface.id);
      const brief = assetBriefs.get(asset.id) ?? asset.brief;
      assetBriefs.set(asset.id, setPointer(brief, surface.field.replace(/^\/brief/, ''), text));
    }
  }
  for (const [assetId, brief] of assetBriefs) {
    const asset = work.assets.get(assetId);
    files.push({ path: asset.path, beforeHash: sha256(asset.metaText), text: stringifyYaml({ ...asset.meta, brief }) });
  }
  const aliases = keepOldName
    ? [...entity.aliases.filter((a) => a !== newName), ...(entity.aliases.includes(oldName) ? [] : [oldName])]
    : entity.aliases.filter((a) => a !== newName && a !== oldName);
  const data = { ...entity.data, name: newName };
  if (aliases.length) data.aliases = aliases; else delete data.aliases;
  const ownBody = newTexts.get(surfaceKey({ kind: 'entity', id: entityId, field: '' })) ?? entity.body;
  files.push({ path: entity.path, beforeHash: entity.rev, text: serializeDoc({ data, body: ownBody }) });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const occurrenceUpdates = movedOccurrences({ states, newTexts, oldName, newName });
  const planDigest = sha256(canonicalJson({
    entityId, newName, keepOldName, include: [...include].sort(),
    files: files.map((f) => ({ path: f.path, beforeHash: f.beforeHash, afterHash: sha256(f.text) })), occurrenceUpdates,
  }));
  return { entityId, oldName, newName, keepOldName, changes, candidates, untouched, files, occurrenceUpdates, committed: committed.sort(), warnings, planDigest };
}

/**
 * 바뀌는 표면의 등장 위치 새 기록. 그 표면의 모든 엔티티 기록을 옮긴다(다른 엔티티 인용문의 문맥도 바뀌므로).
 * 인용문·앞 문맥의 옛 이름을 새 이름으로 바꿔 새 글에서 다시 대조하고, 앞 문맥으로 안 되면 인용문만으로 한 번 더 본다.
 * 그래도 한 곳으로 정해지지 않는 항목은 뺀다 — 새 기록에 없으면 다시 제출 대상이 된다(엉뚱한 곳을 가리키지 않는다).
 */
function movedOccurrences({ states, newTexts, oldName, newName }) {
  const swap = (value) => value.split(oldName).join(newName);
  const updates = [];
  for (const [key, text] of newTexts) {
    const onSurface = states.filter((s) => surfaceKey(s.surface) === key);
    if (!onSurface.length) continue;
    const items = [];
    for (const s of onSurface) {
      const quote = swap(s.quote);
      let found = resolveQuote(text, { quote, before: swap(s.before) });
      if (!found.ok) found = resolveQuote(text, { quote });
      if (found.ok) items.push({ entityId: s.entityId, kind: s.kind, quote, before: found.before, after: found.after });
    }
    updates.push({ surface: onSurface[0].surface, textHash: sha256(text), items });
  }
  return updates;
}
```

계획이 파일 원문을 알아야 하므로 저장소 모델에 원문 필드를 더한다(값을 더할 뿐 기존 필드는 그대로다).

- `core/store/tree.js` `toNode`: 반환 객체에 `fileText: text`. `TreeNode` typedef에 `fileText: string`. `writeNode`/`updateNode`는 이 필드를 쓰지 않는다(쓴 뒤에는 다음 `openWork`가 다시 읽는다).
- `core/store/entities.js`: push 객체에 `fileText: text`. `Entity` typedef에 `fileText: string`(`rev`는 이미 `sha256(text)`).
- `core/store/assets.js`: set 객체에 `metaText: text`.

노드·엔티티 객체 전체를 `deepEqual`하는 기존 테스트가 있으면(`grep -rn "deepEqual(.*nodes.get\|deepEqual(.*entities.get" test`) 그 기대값에 새 필드를 더하고, 커밋 메시지에 이유("저장소 모델에 원문 필드 추가")를 적는다.

- [ ] **Step 4: 통과 확인** — Run: `node --test test/core/rename-plan.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/rename/plan.js core/rename/josa.js core/store/tree.js core/store/entities.js core/store/assets.js test/core/rename-plan.test.js
git commit -m "feat(rename): plan a rename in memory from recorded occurrences with scan candidates and josa warnings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task C3: 이름 바꾸기 적용

> 리뷰어: 가장 강한 모델. 공격: 옛 digest로 적용, 계획 뒤 파일 수정, 열린 실행 중 적용, 기능 꺼짐, 실패 주입 뒤 파일 변화, 커밋 노드가 조용히 "커밋됨"으로 남는지(drift로 드러나야 함), 기록장 되쓰기.

**Files:**
- Create: `core/rename/apply.js`
- Test: `test/core/rename-apply.test.js`

**Interfaces:**
- Consumes: C1 `writeFilesTx`; C2 `planRename`; B1 `OCCURRENCES_LEDGER`; A1 `assertFeature`; `createRunStore`, `OPEN_STATES`; `detectDrift`.
- Produces: `applyRename(root, { entityId, newName, keepOldName, include, planDigest }, { hooks, now }) → { applied: true, files: string[], recommit: string[], occurrences: number, warnings }`. 오류: `FEATURE_DISABLED`, `RENAME_RUN_OPEN`, `RENAME_PLAN_STALE`(details `{ expected, actual }`), `TX_*`.

- [ ] **Step 1: 실패하는 테스트**

```js
// test/core/rename-apply.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { OCCURRENCES_LEDGER } from '../../core/occurrences/records.js';
import { occurrenceStates } from '../../core/occurrences/state.js';
import { planRename } from '../../core/rename/plan.js';
import { applyRename } from '../../core/rename/apply.js';
import { detectDrift } from '../../core/store/drift.js';
import { createRunner } from '../../core/run/runner.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

const EP1 = join('tree', '01-arc-awakening', '01-ep-001.md');
const records = (root) => openLedger(root, OCCURRENCES_LEDGER).readAll();
async function planFor(root, args) { return planRename(await openWork(root), await records(root), args); }
async function tree(root) {
  const work = await openWork(root);
  return Object.fromEntries([...work.tree.nodes.values()].map((n) => [n.id, n.fileText]).concat([...work.entities.values()].map((e) => [e.id, e.fileText])));
}

async function committedEp1(root) {
  await useFakePack(root);
  const host = createFakeHost({ drafts: { 'ep-001': '하나는 지하실 끝에서 잠긴 문을 발견했다.\n' } });
  await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] });
}

test('apply writes every file, re-records occurrences, and reports committed nodes that now need a recommit', async () => {
  const root = await copyFixture('serial-2level');
  await committedEp1(root);
  const plan = await planFor(root, { entityId: 'hana', newName: '세라' });
  const out = await applyRename(root, { entityId: 'hana', newName: '세라', planDigest: plan.planDigest });
  assert.deepEqual(out.recommit, ['ep-001']);
  assert.match(await readFile(join(root, EP1), 'utf8'), /세라는 지하실/);
  const work = await openWork(root);
  assert.equal(work.entities.get('hana').name, '세라');
  assert.deepEqual(work.entities.get('hana').aliases, ['하나']);
  const states = occurrenceStates(work, await records(root));
  assert.deepEqual(states.map((s) => [s.quote, s.status, s.origin]), [['세라는', 'located', 'rename']]);
  const drift = detectDrift(work, await openLedger(root, 'receipts').readAll());
  assert.deepEqual(drift.map((d) => [d.nodeId, d.code]), [['ep-001', 'HAND_EDITED']]);
});

test('a stale digest, an open run, or the feature off refuses and writes nothing', async () => {
  const root = await copyFixture('serial-2level');
  await committedEp1(root);
  const plan = await planFor(root, { entityId: 'hana', newName: '세라' });
  const before = await tree(root);
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', include: ['node:ep-003:@0'], planDigest: plan.planDigest }), { code: 'RENAME_PLAN_STALE' });
  const path = join(root, 'tree', '01-arc-awakening', '02-ep-002.md');
  const text = await readFile(path, 'utf8');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'ep-002' }, items: [] });
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', planDigest: 'sha256:00' }), { code: 'RENAME_PLAN_STALE' });
  const trail = await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost(), { start: { node: 'ep-002' }, until: (o) => label(o) === 'model:critic' });
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', planDigest: plan.planDigest }), (e) => e.code === 'RENAME_RUN_OPEN' && e.details.runId === trail.at(-1).runId);
  await createRunner({ root, packs: fakePacks() }).decide({ runId: trail.at(-1).runId, action: 'skip', reason: 't' }).catch(() => {});
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { rename: false } }));
  await assert.rejects(applyRename(root, { entityId: 'hana', newName: '세라', planDigest: plan.planDigest }), { code: 'FEATURE_DISABLED' });
  assert.equal(await readFile(path, 'utf8'), text);
  const after = await tree(root);
  assert.deepEqual(after, before);
});

test('a failure injected in the middle of writing leaves every file and the occurrences ledger unchanged', async () => {
  const root = await copyFixture('knowledge-book');
  await submitOccurrences(root, { surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'atp', kind: 'appearance', quote: 'ATP는' }] });
  await submitOccurrences(root, { surface: { kind: 'node', id: 'membranes' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP를' }] });
  const plan = await planFor(root, { entityId: 'atp', newName: '아데노신삼인산' });
  assert.equal(plan.files.length, 3);
  const before = await tree(root);
  const ledgerBefore = (await records(root)).length;
  await assert.rejects(applyRename(root, { entityId: 'atp', newName: '아데노신삼인산', planDigest: plan.planDigest }, { hooks: { beforeWrite: (i) => { if (i === 2) throw new Error('boom'); } } }), { code: 'TX_FAILED' });
  assert.deepEqual(await tree(root), before);
  assert.equal((await records(root)).length, ledgerBefore);
});
```

(두 번째 테스트에서 `critic` 요청에 멈춘 실행은 `decide skip`으로 버릴 수 없다 — `.catch`로 무시한다. 기능 검사가 열린 실행 검사보다 먼저라 마지막 거부는 `FEATURE_DISABLED`다.)

- [ ] **Step 2: 실패 확인** — Run: `node --test test/core/rename-apply.test.js` · Expected: FAIL

- [ ] **Step 3: 구현**

```js
// core/rename/apply.js
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { openWork } from '../store/work.js';
import { withWorkLock } from '../run/work-lock.js';
import { createRunStore, OPEN_STATES } from '../run/run-store.js';
import { assertFeature } from '../work/features.js';
import { writeFilesTx } from '../util/file-tx.js';
import { OCCURRENCES_LEDGER } from '../occurrences/records.js';
import { planRename } from './plan.js';

/**
 * 작가가 본 계획(planDigest)을 그대로 적용한다(설계 §15 계획 → 보여주기 → 한 번에 쓰기).
 * 작업 잠금 안에서 계획을 다시 만들어 digest 가 같을 때만 쓴다. 열린 실행이 있으면 거부한다.
 * 파일은 writeFilesTx 로 모두 쓰거나 하나도 쓰지 않는다. 파일을 다 쓴 뒤에만 등장 위치를 새로 기록한다(origin rename).
 * 커밋된 노드의 원고가 바뀌면 그 노드는 손수정(drift)이 된다 — 조용히 다시 커밋하지 않는다. recommit 으로 알린다.
 */
export async function applyRename(root, { entityId, newName, keepOldName = true, include = [], planDigest }, { hooks = {}, now } = {}) {
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    assertFeature(work.config, 'rename');
    const open = (await createRunStore(root).list()).find((r) => !r.error && OPEN_STATES.has(r.state));
    if (open) throw new FolioError('RENAME_RUN_OPEN', `${open.runId} for ${open.nodeId} is not finished`, { runId: open.runId, nodeId: open.nodeId });
    const ledger = openLedger(root, OCCURRENCES_LEDGER, now ? { now } : {});
    const plan = planRename(work, await ledger.readAll(), { entityId, newName, keepOldName, include });
    if (plan.planDigest !== planDigest) {
      throw new FolioError('RENAME_PLAN_STALE', 'the work changed since the plan was shown; show the new plan to the author', { expected: String(planDigest).slice(0, 100), actual: plan.planDigest });
    }
    await writeFilesTx(root, plan.files.map(({ path, beforeHash, text }) => ({ path, beforeHash, text })), { hooks });
    for (const update of plan.occurrenceUpdates) {
      await ledger.append({ type: 'occurrences', surface: update.surface, textHash: update.textHash, items: update.items, origin: 'rename' });
    }
    return { applied: true, files: plan.files.map((f) => f.path), recommit: plan.committed, occurrences: plan.occurrenceUpdates.length, warnings: plan.warnings };
  });
}
```

`OPEN_STATES`에 `waiting_children`이 들어 있지 않은지 확인한다(`core/run/run-store.js`). 자식을 기다리는 가지 실행은 열린 실행이 아니다(M3 결정 6과 같다).

- [ ] **Step 4: 통과 확인** — Run: `node --test test/core/rename-apply.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/rename/apply.js test/core/rename-apply.test.js
git commit -m "feat(rename): apply an approved rename plan all-or-nothing under the work lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task C4: `recommit` 모드 — 지금 파일 본문을 다시 검사·커밋

> 리뷰어: 가장 강한 모델 + 공격 스크립트. 잠금 경로다. 공격: recommit으로 hard 지적을 넘기기, 검사 뒤 파일을 바꿔 다른 글을 커밋하기, 커밋 안 된 노드·손수정 없는 노드를 recommit으로 커밋하기, 실행 파일의 `mode`를 바꿔 보통 실행을 recommit처럼 굴리기(또는 그 반대), `children` 단계를 건너뛰어 가지의 자식 검사를 피하기, 기능 꺼짐 상태에서 열린 recommit 실행 이어가기.

**Files:**
- Create: `core/run/recommit-plan.js`
- Modify: `core/run/runner.js`, `core/run/steps/generate.js`, `core/run/steps/children.js`, `core/run/steps/revise.js`(확인만, 필요하면), `core/status.js`
- Test: `test/run/recommit.test.js`

**Interfaces:**
- Consumes: A1 `assertFeature`; `lastCommits`; `detectDrift`; `pipelineFor`, `checksDigestFor`, `checkPlanFor`; `setDraft`.
- Produces:
  - `RECOMMIT_MODE = 'recommit'`, `isRecommit(run)`
  - `assertRecommitNeeded(ctx, node)` → 오류 `RECOMMIT_NOT_NEEDED`(details `{ nodeId }`), `RECOMMIT_EMPTY`
  - `newRecommitRun(ctx, node, { newId, now })` → 실행(`mode: 'recommit'`, `outputs.draft = node.body`, 가지는 `outputs.plan`도, `draftHash = sha256(body)`, `baseHash`: 커밋 기록의 hash 또는 null)
  - 실행기 `run({ node, mode: 'recommit' })`. `RUN_MODES = ['normal', 'recheck', 'recommit']`. `node`는 id여야 한다(`next`·`next-recheck`는 `RUN_MODE_INVALID`).
  - generate 단계: `isRecommit(run)`이고 루프가 아닌 `produces: plan|draft` 단계면 요청하지 않고 `run.results[id] = { status: 'passed', source: 'file' }`. 단, 실행 중 파일 본문이 `run.outputs.draft`와 달라졌으면 `RECOMMIT_TEXT_CHANGED`로 멈춘다(needs_user, 승인 불가, 건너뛰기만).
  - children 단계: recommit이면 `{ status: 'not_needed', reason: 'recommit keeps the existing children', source: 'recommit' }`.
  - `workStatus`의 drift 항목(`HAND_EDITED`, `COMMITTED_WITHOUT_RECORD`)에 `recommit: true`(기능이 켜져 있을 때).

- [ ] **Step 1: 실패하는 테스트**

```js
// test/run/recommit.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { detectDrift } from '../../core/store/drift.js';
import { workStatus } from '../../core/status.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

const EP1 = join('tree', '01-arc-awakening', '01-ep-001.md');
const runner = (root) => createRunner({ root, packs: fakePacks() });
async function commitEp1(root) {
  await useFakePack(root);
  await driveToEnd(() => runner(root), createFakeHost({ drafts: { 'ep-001': '하나는 문을 보았다.\n' } }), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
}
async function handEdit(root, from, to) {
  const text = await readFile(join(root, EP1), 'utf8');
  await writeFile(join(root, EP1), text.replace(from, to));
}

test('recommit checks and commits the file text without asking for a plan or a draft, and clears the drift', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const status = await workStatus(root, { packs: fakePacks() });
  assert.deepEqual(status.drift.map((d) => [d.nodeId, d.code, d.recommit]), [['ep-001', 'HAND_EDITED', true]]);
  const host = createFakeHost();
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'ep-001', mode: 'recommit' }, until: (o) => o.status === 'done' });
  assert.deepEqual(trail.map(label), ['model:extract', 'model:critic', 'user:approve', 'done']);
  const receipts = await openLedger(root, 'receipts').readAll();
  const receipt = receipts.find((r) => r.type === 'receipt' && r.receiptId === trail.at(-1).receiptId);
  assert.deepEqual(receipt.steps.filter((s) => s.kind === 'generate' && s.id !== 'extract' && s.id !== 'revise').map((s) => [s.id, s.status, s.source]), [['plan', 'passed', 'file'], ['draft', 'passed', 'file']]);
  assert.deepEqual(detectDrift(await openWork(root), receipts), []);
  assert.match(await readFile(join(root, EP1), 'utf8'), /세라는 문을 보았다/);
});

test('recommit keeps every lock: a hard finding blocks and cannot be approved', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level'); // doyun dies in ep-002
  await driveToEnd(() => runner(root), createFakeHost({ drafts: { 'ep-003': '하나는 문양을 베꼈다.\n' } }), { start: { node: 'ep-003' }, until: (o) => o.status === 'done' });
  const path = join(root, 'tree', '01-arc-awakening', '03-ep-003.md');
  await writeFile(path, (await readFile(path, 'utf8')).replace('하나는', '도윤은'));
  const host = createFakeHost({ events: { 'ep-003': { events: [], appearances: ['doyun'] } } });
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'ep-003', mode: 'recommit' }, until: (o) => o.status === 'needs_user' && o.question.kind === 'blocked' });
  const question = trail.at(-1).question;
  assert.equal(question.canApprove, false);
  await assert.rejects(runner(root).decide({ runId: trail.at(-1).runId, action: 'approve', reason: '괜찮다' }), (e) => /HARD|hard/.test(`${e.code} ${e.message}`));
});

test('recommit is refused for a node that needs none, an empty body, next, or when the feature is off', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'RECOMMIT_NOT_NEEDED' });
  await assert.rejects(runner(root).run({ node: 'ep-002', mode: 'recommit' }), { code: 'RECOMMIT_NOT_NEEDED' });
  await assert.rejects(runner(root).run({ node: 'next', mode: 'recommit' }), { code: 'RUN_MODE_INVALID' });
  await handEdit(root, '하나는 문을 보았다.\n', '');
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'RECOMMIT_EMPTY' });
  const text = await readFile(join(root, EP1), 'utf8');
  await writeFile(join(root, EP1), `${text}세라는 문을 보았다.\n`);
  const config = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  await writeFile(join(root, 'work.yaml'), stringifyYaml({ ...config, features: { recommit: false } }));
  await assert.rejects(runner(root).run({ node: 'ep-001', mode: 'recommit' }), { code: 'FEATURE_DISABLED' });
});

test('if the file changes again during a recommit run, the run stops and asks; it cannot commit the older text', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const host = createFakeHost();
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'ep-001', mode: 'recommit' }, until: (o) => label(o) === 'user:approve' });
  await handEdit(root, '세라는', '미오는');
  const out = await runner(root).decide({ runId: trail.at(-1).runId, action: 'approve' });
  assert.equal(out.status, 'needs_user');
  assert.equal(out.question.code, 'RECOMMIT_TEXT_CHANGED');
  assert.equal(out.question.canApprove, false);
  assert.match(await readFile(join(root, EP1), 'utf8'), /미오는/);
  const skipped = await runner(root).decide({ runId: out.runId, action: 'skip', reason: '다시 돌린다' });
  assert.equal(skipped.status, 'skipped');
});

test('a normal run request does not continue an open recommit run, and the run file mode cannot turn a normal run into one', async () => {
  const root = await copyFixture('serial-2level');
  await commitEp1(root);
  await handEdit(root, '하나는', '세라는');
  const first = await runner(root).run({ node: 'ep-001', mode: 'recommit' });
  await assert.rejects(runner(root).run({ node: 'ep-001' }), { code: 'RUN_IN_PROGRESS' });
  const store = createRunStore(root);
  const saved = await store.load(first.runId);
  assert.equal(saved.mode, 'recommit');
});
```

네 번째 테스트: 파일이 실행 도중 또 바뀌면 커밋 단계 앞 점검(`recommitTextChanged`)이 사람 질문(`blocked`, `RECOMMIT_TEXT_CHANGED`, 승인 불가)을 낸다. 엔진은 파일의 새 글("미오는")을 덮어쓰지 않는다. 작가는 건너뛰고 recommit을 다시 돌린다.

- [ ] **Step 2: 실패 확인** — Run: `node --test test/run/recommit.test.js` · Expected: FAIL (`RUN_MODE_INVALID` for recommit)

- [ ] **Step 3: 구현**

```js
// core/run/recommit-plan.js
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';
import { lastCommits } from '../ledger/receipts.js';
import { assertFeature } from '../work/features.js';
import { checkPlanFor } from './sync.js';
import { checksDigestFor, pipelineFor } from './level-pipeline.js';

export const RECOMMIT_MODE = 'recommit';
export const isRecommit = (run) => run?.mode === RECOMMIT_MODE;

/**
 * 다시 커밋이 필요한 노드인가: 커밋 기록이 있는데 지금 본문이 커밋 원고와 다르거나(손수정·이름 바꾸기),
 * 앞머리만 committed 이고 커밋 기록이 없는 노드. 그 밖(커밋 안 된 노드, 바뀌지 않은 노드)은 보통 실행으로 돈다.
 */
export function assertRecommitNeeded(ctx, node) {
  assertFeature(ctx.work.config, 'recommit');
  const commit = lastCommits(ctx.receiptRecords).get(node.id);
  const drifted = commit ? sha256(node.body) !== commit.committedHash : node.status === 'committed';
  if (!drifted) throw new FolioError('RECOMMIT_NOT_NEEDED', `${node.id} has no changed committed text; use a normal run`, { nodeId: node.id });
  if (!node.body.trim()) throw new FolioError('RECOMMIT_EMPTY', `${node.id} has no text to commit`, { nodeId: node.id });
}

/**
 * 지금 파일 본문을 원고로 삼는 실행. 파이프라인은 보통 실행과 같다 — 원고(가지는 계획)를 모델에 묻지 않고 파일에서 채울 뿐이다.
 * 추출·검사·수정 루프·게이트·커밋·영수증·판정 대조·hash 잠금은 그대로다.
 */
export function newRecommitRun(ctx, node, { newId, now }) {
  const at = now();
  const ref = { nodeId: node.id, level: node.level, nodeKind: node.kind };
  const pipeline = pipelineFor(ctx, ref);
  return {
    runId: newId('run'), nodeId: node.id, variant: 'main', nodeKind: node.kind, level: node.level, mode: RECOMMIT_MODE,
    pipelineDigest: pipeline.digest, checksDigest: checksDigestFor(ctx, ref), featuresDigest: ctx.featuresDigest,
    cursor: 0, state: 'active',
    outputs: { draft: node.body, ...(node.kind === 'branch' ? { plan: node.body } : {}) }, draftHash: sha256(node.body),
    fileHash: sha256(node.body), results: {}, attempts: 0, retries: {}, inbox: {}, pending: null,
    approval: null, overridden: [], receipt: null, checkPlan: checkPlanFor(ctx, pipeline), deactivated: [], createdAt: at, updatedAt: at, history: [],
  };
}

/**
 * 다시 커밋 실행의 원고가 아직 파일 본문과 같은가. 수정 루프가 원고를 바꿨다면 그 원고가 커밋되고(보통 실행과 같다) 파일은 커밋이 쓴다.
 * 수정 루프 없이 파일만 그 사이 바뀌었으면(fileHash 가 다름) 옛 글을 커밋하지 않고 멈춘다.
 */
export function recommitTextChanged(ctx, run) {
  if (!isRecommit(run)) return false;
  const node = ctx.work.tree.nodes.get(run.nodeId);
  return !node || sha256(node.body) !== run.fileHash;
}
```

`core/run/runner.js`:
- import `RECOMMIT_MODE`, `assertRecommitNeeded`, `newRecommitRun`, `isRecommit`, `recommitTextChanged`; `awaitUser`(common.js).
- `const RUN_MODES = ['normal', RECHECK_MODE, RECOMMIT_MODE];`
- `run()` 첫 검사: `(node === 'next-recheck' && mode !== RECHECK_MODE) || (mode === RECOMMIT_MODE && (node === 'next' || node === 'next-recheck'))`이면 `RUN_MODE_INVALID`.
- `sameRequest`: `node === 'next' || (isRecheck(open) === (mode === RECHECK_MODE) && isRecommit(open) === (mode === RECOMMIT_MODE) && (node === open.nodeId || node === 'next-recheck'))`. `next`는 그대로 무엇이든 이어간다(열린 recommit 실행 포함).
- recheck 분기 다음에:

```js
    if (mode === RECOMMIT_MODE) {
      const target = ctx.work.tree.nodes.get(node);
      if (!target) throw new FolioError('NODE_NOT_FOUND', node);
      assertRecommitNeeded(ctx, target);
      assertChildrenDone(ctx.work, target, ctx.receiptRecords);
      return settle(await drive(newRecommitRun(ctx, target, { newId, now })));
    }
```

- `drive()` 안, `const step = steps[run.cursor];` 다음에 커밋 단계 앞 점검:

```js
      // 다시 커밋: 파일이 실행 도중 또 바뀌었으면 옛 글을 커밋하지 않는다(승인 불가, 건너뛰기만).
      if (step?.kind === 'commit' && run.state !== 'committing' && recommitTextChanged(ctx, run)) {
        const outcome = awaitUser(run, {
          kind: 'blocked', code: 'RECOMMIT_TEXT_CHANGED', stepId: step.id, draft: run.outputs.draft ?? '', advisories: [], canApprove: false,
          blocking: [{ checkId: 'recommit', severity: 'hard', code: 'RECOMMIT_TEXT_CHANGED', message: 'the file changed during this recommit run; skip it and run recommit again' }],
        });
        run.updatedAt = now();
        await runs.save(run);
        return outcome;
      }
```

  수정 루프가 원고를 바꾼 경우는 `fileHash`가 파일과 같으니 막지 않는다(커밋이 새 원고를 쓴다).
- 이 질문에 `approve`가 오면 `decide`의 기존 규칙(hard가 있으면 승인 불가)이 거부하는지 확인한다. 거부하지 않으면 `applyDecision`이 `code === 'RECOMMIT_TEXT_CHANGED'` 질문의 approve를 `LOCK_HARD_VIOLATION`과 같은 방식으로 거부하도록 한 줄을 더한다(`core/run/decide.js`). 이때 `core/run/decide.js`를 이 Task의 Files에 더한다.
- `decide`가 recommit 실행을 skip으로 버리는 것은 기존 흐름 그대로다.
- **실행 파일을 믿지 않는다:** `run.mode === 'recommit'`은 실행 파일 값이다. 위조로 보통 실행을 recommit처럼 만들면 plan/draft를 모델 없이 "파일에서 채움"으로 적게 된다. 그런데 그 경우 `outputs.draft`가 파일 본문이 아니면 무의미하다. 그래서 generate 단계의 채우기는 **파일 본문을 그 자리에서 다시 읽어** `setDraft(run, node.body)`로 넣는다(실행 파일의 draft를 쓰지 않는다). 그러면 위조해도 결과는 "호스트가 파일 본문을 draft로 답함"과 같고, 모든 검사·게이트·커밋 잠금을 그대로 거친다. 커밋이 쓰는 글은 검사한 글(hash 잠금)이다.

`core/run/steps/generate.js` `generateStep` 앞부분(`if (step.mode === 'off') …` 다음):

```js
  // 다시 커밋(M4): 원고(가지는 계획)는 모델에 묻지 않고 지금 파일 본문에서 채운다. 수정 루프(loop)는 보통대로 모델에 묻는다.
  if (isRecommit(run) && !step.loop && (step.produces === 'plan' || step.produces === 'draft')) {
    const node = ctx.work.tree.nodes.get(run.nodeId);
    if (step.produces === 'plan') run.outputs.plan = node.body;
    if (step.produces === 'draft' || run.nodeKind === 'branch') setDraft(run, node.body);
    run.results[step.id] = { status: 'passed', source: 'file' };
    run.cursor += 1;
    return null;
  }
```

`core/run/steps/children.js` `childrenStep` 첫 부분:

```js
  if (isRecommit(run)) {
    run.results[step.id] = { status: 'not_needed', reason: 'recommit keeps the existing children', source: 'recommit' };
    run.cursor += 1;
    return null;
  }
```

`not_needed`가 영수증 검증과 커밋 잠금을 지나는지 확인한다. `children` 단계는 잠긴 단계가 아니므로(`coreLockedIds`) `LOCKED_OK`에 걸리지 않는다. 팩이 `children`을 잠근 경우는 없다(잠금은 코어가 계산). `buildReceipt`가 `reason`·`source`를 싣는다.

`core/status.js`: `drift: detectDrift(work, receiptRecords).map((d) => (work.config.features.recommit && (d.code === 'HAND_EDITED' || d.code === 'COMMITTED_WITHOUT_RECORD') ? { ...d, recommit: true } : d)),`. `status.test.js`가 drift를 `deepEqual`하는 곳이 있으면(`grep -n drift test/core/status.test.js test/run/*.test.js`) 기대값에 `recommit: true`를 더하고 이유를 커밋 메시지에 적는다("drift 항목에 다시 커밋 안내 추가").

- [ ] **Step 4: 통과 확인** — Run: `node --test test/run/recommit.test.js test/run/runner-locks.test.js test/run/committed-without-record.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add core/run/recommit-plan.js core/run/runner.js core/run/steps/generate.js core/run/steps/children.js core/status.js test/run/recommit.test.js
git commit -m "feat(run): add a recommit mode that checks and commits the current file text under the same locks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`core/run/decide.js`를 바꿨으면 함께 `git add`.)

---

# Part D — 도구 · 문서 · 완료 기준

### Task D1: 도구 — `folio_occurrences`, `folio_find` 확장, `recommit`, `features`, 오류 다듬기

**Files:**
- Create: `server/tools/occurrences.js`
- Modify: `server/tools/definitions.js`, `server/tools/handlers.js`, `server/tools/find.js`, `server/toolbox.js`, `server/validate-input.js`, `test/server/tools.test.js`
- Test: `test/server/occurrence-tools.test.js`, `test/server/tool-errors.test.js`

**Interfaces:**
- Consumes: B1 `submitOccurrences`; B2 `marksOf`, `candidatesFor`; C2 `planRename`; C3 `applyRename`.
- Produces:
  - `folio_occurrences`: `{ root, op: 'submit'|'rename', surface?: {kind, id, field?}, items?: [...], entityId?, newName?, keepOldName?, include?, planDigest? }`. submit에는 `surface`·`items`가, rename에는 `entityId`·`newName`·`planDigest`가 필요하다(`OCCURRENCES_ARGS_INVALID`).
  - `folio_find`: `query` enum에 `candidates`, `rename`. `candidates`는 `id` + 선택 `kind`(기본 `node`). `rename`은 `id`(엔티티) + `newName` + 선택 `keepOldName`, `include`. 반환은 계획에서 `files`의 `text`를 빼고 `path`·`beforeHash`만 준다(글 전체를 호스트에 돌려주지 않는다). `usages`는 `{ entityId, usages, marks }`.
  - `folio_run` `mode` enum에 `recommit`. `folio_init`에 `features`.
  - `validateInput`: `maxLength`, `maxItems`, `maximum`.
  - 오류 모양: FolioError `message`는 300자까지(넘으면 297자 + `…`). 그 밖의 오류는 `{ code: 'INTERNAL_ERROR', message: <300자로 자른 메시지>, details: { errno: <error.code 문자열 또는 null> } }`.
  - 가드: `test/server/tools.test.js`의 "server code never imports ..." 목록에 `core/util/file-tx.js`를 더한다(서버는 `applyRename`만 부른다).

- [ ] **Step 1: 실패하는 테스트**

```js
// test/server/occurrence-tools.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { TOOLS } from '../../server/tools/definitions.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';

const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => out.error?.code;

test('ten tools, and folio_occurrences is one of them', () => {
  assert.equal(TOOLS.length, 10);
  assert.ok(TOOLS.some((t) => t.name === 'folio_occurrences'));
});

test('submit, usages with marks, candidates, rename plan and apply through the toolbox', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const tools = createToolbox({ packs: fakePacks() });
  ok(await tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: '하나는' }] }));
  const usages = ok(await tools.call('folio_find', { root, query: 'usages', id: 'hana' }));
  assert.deepEqual(usages.marks.map((m) => [m.surfaceId, m.status]), [['ep-001', 'located']]);
  const candidates = ok(await tools.call('folio_find', { root, query: 'candidates', id: 'ep-003' }));
  assert.deepEqual(candidates.candidates.map((c) => c.entityId), ['hana']);
  const plan = ok(await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' }));
  assert.equal(plan.files.every((f) => !('text' in f)), true);
  assert.equal(code(await tools.call('folio_occurrences', { root, op: 'rename', entityId: 'hana', newName: '세라', planDigest: 'sha256:00' })), 'RENAME_PLAN_STALE');
  const applied = ok(await tools.call('folio_occurrences', { root, op: 'rename', entityId: 'hana', newName: '세라', planDigest: plan.planDigest }));
  assert.equal(applied.applied, true);
  assert.match(await readFile(join(root, 'entities', 'character', 'hana.md'), 'utf8'), /name: 세라/);
});

test('argument shapes are checked per op, and schema limits apply', async () => {
  const root = await copyFixture('serial-2level');
  const tools = createToolbox({ packs: fakePacks() });
  assert.equal(code(await tools.call('folio_occurrences', { root, op: 'submit', items: [] })), 'OCCURRENCES_ARGS_INVALID');
  assert.equal(code(await tools.call('folio_occurrences', { root, op: 'rename', entityId: 'hana', newName: 'x' })), 'OCCURRENCES_ARGS_INVALID');
  assert.equal(code(await tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'ep-001' }, items: [{ entityId: 'hana', kind: 'appearance', quote: 'x'.repeat(501) }] })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_structure', { root, op: 'move', nodeId: 'ep-001', index: 100001 })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_find', { root, query: 'rename', id: 'hana' })), 'FIND_ARGS_INVALID');
});

test('folio_run accepts recommit and folio_init accepts features', () => {
  const run = TOOLS.find((t) => t.name === 'folio_run');
  assert.deepEqual(run.inputSchema.properties.mode.enum, ['normal', 'recheck', 'recommit']);
  const init = TOOLS.find((t) => t.name === 'folio_init');
  assert.deepEqual(init.inputSchema.properties.features, { type: 'object', additionalProperties: { type: 'boolean' } });
});
```

```js
// test/server/tool-errors.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox } from '../../server/toolbox.js';
import { FolioError } from '../../core/errors.js';
import { validateInput } from '../../server/validate-input.js';

const handlers = (fn) => ({ folio_status: fn });

test('long FolioError messages are cut to 300 characters, keeping the code and details', async () => {
  const tools = createToolbox({ packs: new Map(), handlers: handlers(async () => { throw new FolioError('X_BAD', 'y'.repeat(5000), { hint: 'h' }); }) });
  const out = await tools.call('folio_status', { root: '/w' });
  assert.equal(out.error.code, 'X_BAD');
  assert.equal(out.error.message.length, 300);
  assert.ok(out.error.message.endsWith('…'));
  assert.deepEqual(out.error.details, { hint: 'h' });
});

test('non-Folio errors become INTERNAL_ERROR with a cut message and the errno', async () => {
  const error = Object.assign(new Error(`ENOTDIR: not a directory, stat '${'/p'.repeat(400)}'`), { code: 'ENOTDIR' });
  const tools = createToolbox({ packs: new Map(), handlers: handlers(async () => { throw error; }) });
  const out = await tools.call('folio_status', { root: '/w' });
  assert.equal(out.error.code, 'INTERNAL_ERROR');
  assert.ok(out.error.message.length <= 300);
  assert.deepEqual(out.error.details, { errno: 'ENOTDIR' });
});

test('validateInput knows maxLength, maxItems and maximum', () => {
  assert.deepEqual(validateInput({ type: 'string', maxLength: 2 }, 'abc').map((e) => e.message), ['must have at most 2 characters']);
  assert.deepEqual(validateInput({ type: 'array', maxItems: 1 }, [1, 2]).map((e) => e.message), ['must have at most 1 items']);
  assert.deepEqual(validateInput({ type: 'integer', maximum: 3 }, 4).map((e) => e.message), ['must be <= 3']);
});
```

`test/server/tools.test.js`의 바꿀 곳(이유: 이 계획 결정 14가 INTERNAL_ERROR 모양을 바꾼다):
- 155행 `{ code: 'INTERNAL_ERROR', message: 'boom', details: {} }` → `{ code: 'INTERNAL_ERROR', message: 'boom', details: { errno: null } }`.
- 도구 수를 세는 assert가 있으면 9 → 10.
- "server code never imports …" 가드의 금지 목록에 `core/util/file-tx.js`를 더한다.

- [ ] **Step 2: 실패 확인** — Run: `node --test test/server/occurrence-tools.test.js test/server/tool-errors.test.js` · Expected: FAIL

- [ ] **Step 3: 구현**

`server/validate-input.js`(지원 목록 주석에 `maxLength, maxItems, maximum` 추가):

```js
  if (schema.maxLength !== undefined && typeof value === 'string' && value.length > schema.maxLength) push(`must have at most ${schema.maxLength} characters`);
  if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) push(`must be <= ${schema.maximum}`);
  // (배열 블록 안)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) push(`must have at most ${schema.maxItems} items`);
```

`server/toolbox.js`:

```js
const MAX_MESSAGE = 300;
const cut = (text) => (text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text);

/** 오류를 값으로. 메시지는 300자까지 자른다(사용자 입력·경로가 끝없이 되돌아오지 않게). FolioError 가 아니면 INTERNAL_ERROR + errno. */
const failure = (error) => (error instanceof FolioError
  ? { ok: false, error: { code: error.code, message: cut(error.message), details: error.details ?? {} } }
  : { ok: false, error: { code: 'INTERNAL_ERROR', message: cut(String(error?.message ?? error)), details: { errno: typeof error?.code === 'string' ? error.code : null } } });
```

`server/tools/definitions.js`:

```js
const QUOTE = { type: 'string', minLength: 1, maxLength: 500 };
const NAME = { type: 'string', minLength: 1, maxLength: 200 };
const SURFACE = {
  type: 'object', additionalProperties: false, required: ['kind', 'id'],
  properties: { kind: { type: 'string', enum: ['node', 'entity', 'asset', 'source'] }, id: ID, field: TEXT },
};
const ITEM = {
  type: 'object', additionalProperties: false, required: ['entityId', 'kind', 'quote'],
  properties: { entityId: ID, kind: { type: 'string', enum: ['appearance', 'mention'] }, quote: QUOTE, before: TEXT, after: TEXT },
};
```

- `folio_init`: 설명 끝에 ` features 로 기능(등장 위치·이름 바꾸기·다시 커밋 등)을 켜고 끈다.`, 속성 `features: { type: 'object', additionalProperties: { type: 'boolean' } }`.
- `folio_run`: `mode` enum `['normal', 'recheck', 'recommit']`, 설명에 ` recommit 은 손수정·이름 바꾸기로 바뀐 커밋 노드의 지금 본문을 검사해 다시 커밋한다(node 는 id).`
- `folio_structure`: `index: { type: 'integer', minimum: 0, maximum: 100000 }`.
- `folio_find`: 설명 `찾는다. query: node, entity(정의), usages(엔티티가 나오는 곳 + 기록된 등장 위치 marks), events(사건 이력), candidates(표면 id 의 이름 후보, kind 기본 node), rename(이름 바꾸기 계획 — 읽기 전용, newName 필요).`, 속성 `query` enum 6개, `kind: SURFACE.properties.kind`, `newName: NAME`, `keepOldName: { type: 'boolean' }`, `include: { type: 'array', items: ID, maxItems: 500 }`.
- 새 도구(`folio_config` 앞):

```js
  tool('folio_occurrences', '등장 위치를 쓴다. submit { surface, items }: 표면 하나의 등장 위치 목록(인용문이 본문에 있어야 하고, 하나라도 틀리면 아무것도 기록하지 않는다). rename { entityId, newName, keepOldName?, include?, planDigest }: folio_find rename 으로 작가에게 보여 준 계획을 그대로 한 번에 적용한다(작가 승인 뒤에만). 커밋된 노드가 바뀌면 recommit 목록을 돌려준다.',
    {
      op: { type: 'string', enum: ['submit', 'rename'] }, surface: SURFACE, items: { type: 'array', items: ITEM, maxItems: 500 },
      entityId: ID, newName: NAME, keepOldName: { type: 'boolean' }, include: { type: 'array', items: ID, maxItems: 500 }, planDigest: ID,
    }, ['op']),
```

`server/tools/occurrences.js`:

```js
import { FolioError } from '../../core/errors.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { applyRename } from '../../core/rename/apply.js';

const ARGS = {
  submit: { required: ['surface', 'items'], allowed: ['surface', 'items'] },
  rename: { required: ['entityId', 'newName', 'planDigest'], allowed: ['entityId', 'newName', 'keepOldName', 'include', 'planDigest'] },
};

/** folio_occurrences. 제출과 이름 바꾸기 적용. 둘 다 작업 잠금을 스스로 잡는다. */
export async function occurrencesTool(root, { op, ...args }) {
  const rule = ARGS[op];
  const missing = rule.required.filter((key) => args[key] === undefined);
  const extra = Object.keys(args).filter((key) => !rule.allowed.includes(key));
  if (missing.length || extra.length) throw new FolioError('OCCURRENCES_ARGS_INVALID', `${op}: missing ${missing.join(',') || '-'}, not allowed ${extra.join(',') || '-'}`, { op, missing, extra });
  if (op === 'submit') return submitOccurrences(root, { surface: args.surface, items: args.items });
  return applyRename(root, args);
}
```

`server/tools/find.js`: import `marksOf`, `candidatesFor`, `planRename`, `OCCURRENCES_LEDGER`, `openLedger`(← 서버 가드가 `core/ledger/ledger.js` import를 막는다). 그래서 기록장 읽기는 코어에 읽기 도우미를 둔다: `core/occurrences/records.js`에 `export const readOccurrences = (root) => openLedger(root, OCCURRENCES_LEDGER).readAll();`를 더하고(Task B1 파일, 이 Task에서 수정 — Files에 더한다) 서버는 그것을 부른다.

```js
export async function findInWork(root, { query, id, kind = 'node', newName, keepOldName, include }) {
  if (query === 'node' || query === 'entity') { /* 기존 */ }
  if (query === 'rename' && newName === undefined) throw new FolioError('FIND_ARGS_INVALID', 'rename needs newName', { query });
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    if (query === 'candidates') {
      return { surface: { kind, id }, candidates: candidatesFor(work, work.config.features.occurrences ? await readOccurrences(root) : [], { kind, id }) };
    }
    if (!work.entities.has(id)) throw new FolioError('ENTITY_NOT_FOUND', id);
    if (query === 'rename') {
      assertFeature(work.config, 'rename');
      const plan = planRename(work, await readOccurrences(root), { entityId: id, newName, keepOldName, include });
      return { ...plan, files: plan.files.map(({ path, beforeHash }) => ({ path, beforeHash })) };
    }
    await rebuildIndex(root);
    const db = openIndex(root);
    try {
      return query === 'usages' ? { entityId: id, usages: usagesOf(db, id), marks: marksOf(db, id) } : { entityId: id, events: eventsFor(db, id) };
    } finally { db.close(); }
  });
}
```

`candidates`의 `id`가 없는 표면이면 `SURFACE_NOT_FOUND`를 던진다(`surfaceFields`가 null이면).

`server/tools/handlers.js`:
- import `occurrencesTool`.
- `folio_init: ({ root, title, preset, packs: names = ['novel'], features }) => initWork(root, { title, preset, packs: names, available: packs, features })`
- `folio_find: ({ root, ...args }) => findInWork(root, args)`
- `folio_occurrences: ({ root, ...args }) => occurrencesTool(root, args)`

- [ ] **Step 4: 통과 확인** — Run: `node --test test/server/*.test.js && npm run check` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add server core/occurrences/records.js test/server/occurrence-tools.test.js test/server/tool-errors.test.js test/server/tools.test.js
git commit -m "feat(server): add folio_occurrences, find candidates and rename plans, recommit runs, and cut tool error messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D2: 스킬 문서

**Files:**
- Create: `skill/folio/references/occurrences.md`
- Modify: `skill/folio/SKILL.md`, `skill/folio/references/checks.md`
- Test: 기존 `test/server/skill-docs.test.js`(모든 도구가 문서에 나와야 한다 — `folio_occurrences`)

- [ ] **Step 1: 실패 확인** — Run: `node --test test/server/skill-docs.test.js` · Expected: FAIL (`folio_occurrences` not mentioned)

- [ ] **Step 2: 문서 쓰기**

`skill/folio/SKILL.md`:
- 도구 표: `folio_find` 줄을 `노드·엔티티 정의, 엔티티가 나오는 곳(usages + 기록된 등장 위치 marks), 사건 이력(events), 표면의 이름 후보(candidates), 이름 바꾸기 계획(rename, 읽기 전용)`으로 바꾼다. `folio_run` 줄에 `mode: recommit`을 더한다. 새 줄 `| folio_occurrences | 등장 위치 제출(submit), 작가가 승인한 이름 바꾸기 적용(rename). [references/occurrences.md](references/occurrences.md) |`.
- 흐름 3의 `needs_model` 설명에 한 줄: `추출(extract) 요청의 occurrences.wanted가 true면 답에 등장 위치를 넣는다([references/occurrences.md](references/occurrences.md)).`
- 흐름 4 뒤에 한 항목: `folio_status`의 `drift`에 `recommit: true`가 있으면 작가에게 알리고, 작가가 원하면 `folio_run { root, node, mode: 'recommit' }`으로 지금 본문을 검사해 다시 커밋한다. `occurrences.stale`이 있으면 그 표면의 등장 위치를 다시 제출한다.
- 오류 절에 `FEATURE_DISABLED`(작가가 끈 기능 — 켤지 작가에게 묻는다, 직접 work.yaml을 고치지 않는다), `RENAME_PLAN_STALE`(계획을 다시 받아 작가에게 다시 보여 준다), `RENAME_RUN_OPEN`, `RECOMMIT_NOT_NEEDED`, `RECOMMIT_TEXT_CHANGED`(건너뛰고 다시 recommit), `OCCURRENCES_INVALID`(`details.errors`의 index마다 인용문을 고쳐 다시 낸다), `TX_FAILED`(파일은 그대로다)를 더한다.

`skill/folio/references/occurrences.md`(새, 전체):

```markdown
# 등장 위치와 이름 바꾸기

엔진은 등장 위치를 스스로 찾지 않는다. 호스트가 인용문으로 내고, 엔진은 본문에 정말 있는지만 대조한다.

## 원칙

- 인용문은 본문에 **그대로** 있는 짧은 글이다. 대명사·호칭("그녀는", "선장")도 된다.
- `appearance`는 장면에 직접 나옴, `mention`은 이름·회상으로만 나옴. 언급은 사망 같은 등장 검사에 걸리지 않는다.
- 같은 인용이 본문에 여러 번 있으면 `before`(바로 앞 글)나 `after`(바로 뒤 글)를 더해 한 곳을 가리킨다.
- 하나라도 틀리면 아무것도 기록되지 않는다(`OCCURRENCES_INVALID`). `details.errors`의 `index`로 틀린 항목을 고친다.
- 한 표면의 새 제출은 그 표면의 앞 제출을 대신한다. 빈 목록은 "등장 없음"이다.

## 언제 내나

1. **쓰는 중**: 추출 요청에 `occurrences.wanted: true`가 있으면 답 JSON에 `occurrences`를 넣는다. 커밋이 끝나면 기록된다.
2. **그 밖의 글**: 위층 계획, 엔티티 설명, 그림 설명서, 자료 설명서 → `folio_occurrences { root, op: 'submit', surface: { kind, id, field? }, items }`.
   - 그림·자료는 `field`(JSON Pointer, 예: `/brief/show/0`, `/spans/0/quote`)가 필요하다.
   - `folio_find { root, query: 'candidates', id, kind }`가 이름·별칭 후보와 앞뒤 문맥을 준다. 후보는 참고일 뿐이다.
3. **본문을 고친 뒤**: 엔진이 인용문 + 앞뒤 문맥으로 다시 찾는다. 못 찾은 것은 `folio_status`의 `occurrences.stale`에 나온다. 그 표면을 다시 낸다.

## 이름 바꾸기

1. 작가에게 새 이름을 받는다.
2. `folio_find { root, query: 'rename', id: <엔티티>, newName }`으로 계획을 받는다(아무것도 쓰지 않는다).
3. 작가에게 보여 준다:
   - `changes`: 바꿀 곳(기록된 등장 위치 안의 이름).
   - `candidates`: 이름과 같은 글이지만 등장으로 기록되지 않은 곳. 흔한 낱말일 수 있다("하나"). 작가가 고른 것만 `include`에 넣어 계획을 다시 받는다.
   - `untouched`: 자료(원본 불변)라 바꾸지 않는 곳.
   - `warnings`: 받침이 달라 조사가 어색해지는 곳(`JOSA_MISMATCH`). 엔진은 고치지 않는다 — 작가가 정한다.
   - `committed`: 커밋된 원고가 바뀌는 노드. 적용 뒤 다시 커밋해야 한다.
4. 작가가 승인하면 **같은 인자**와 `planDigest`로 `folio_occurrences { root, op: 'rename', entityId, newName, keepOldName?, include?, planDigest }`.
   - 그 사이 작품이 바뀌었으면 `RENAME_PLAN_STALE` → 2부터 다시.
   - 중간에 실패하면 파일은 하나도 바뀌지 않는다(`TX_FAILED`).
5. 결과의 `recommit` 노드마다 작가에게 알리고, 원하면 `folio_run { root, node, mode: 'recommit' }`으로 다시 검사·커밋한다. 검사·승인·잠금은 보통 실행과 같다.

## 기능 켜고 끄기 (`work.yaml` `features`)

| 키 | 기본 | 뜻 |
|---|---|---|
| `occurrences` | 켬 | 등장 위치 기록. 끄면 제출이 거부되고 사용처는 이름 스캔만 |
| `occurrencesInExtract` | 켬 | 추출 요청이 등장 위치를 청한다 |
| `occurrenceScope` | 끔 | 기록된 등장 위치를 검사 범위에 더한다. 바꾸면 커밋된 노드가 "다시 확인 필요"(재검사로 풀림) |
| `rename` | 켬 | 이름 바꾸기 계획·적용 |
| `recommit` | 켬 | 바뀐 커밋 원고 다시 커밋 |

- 앞의 셋과 `rename`은 `occurrences`가 켜져 있어야 한다.
- 꺼진 기능을 부르면 `FEATURE_DISABLED`. 켤지는 작가가 정한다. 호스트가 작가 승인 없이 work.yaml을 고치지 않는다.
- 어떤 값도 잠금 규칙을 끄지 않는다.
```

`skill/folio/references/checks.md`의 첫 설정 인터뷰 절에 한 줄: `기능(features)도 이때 보여 준다 — 기본값과 뜻은 [occurrences.md](occurrences.md)의 표. 바꾸고 싶은 것만 folio_init의 features로 넘긴다.`

- [ ] **Step 3: 통과 확인** — Run: `node --test test/server/skill-docs.test.js && npm run check` · Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add skill/folio
git commit -m "docs(skill): explain occurrences, rename plans, recommit and feature toggles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D3: M4 완료 기준 + 정지

**Files:**
- Create: `test/acceptance/m4.test.js`
- Test: 그 파일

완료 기준(정본 §20 M4 + 사용자 주의):
1. fixture 본문을 여러 방식으로 고친 뒤 다시 찾기가 통과하고, 못 찾은 것은 전부 stale이다 — 서사 인물(serial-2level `hana`)과 비문학 용어(knowledge-book `atp`) 모두.
2. 등장/언급 구분: 언급은 사망 검사에 걸리지 않고 등장은 걸린다.
3. 이름 바꾸기 도중 실패하면 파일 변화가 없다(주입 실패 + SIGKILL 뒤 복구).
4. MCP stdio 위에서: 추출 occurrences 제출 → 커밋 → `usages` marks → 이름 바꾸기 계획·적용 → drift → `recommit` → 커밋 → drift 없음.
5. 기능 토글: 꺼진 기능은 `FEATURE_DISABLED`, 켜고 끔이 잠금을 바꾸지 않는다(끈 상태에서도 hard 차단 유지).

- [ ] **Step 1: 테스트 쓰기**

```js
// test/acceptance/m4.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { createToolbox } from '../../server/toolbox.js';
import { copyFixture, fakePacks, seedEvents, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { createRunner } from '../../core/run/runner.js';
import { runTxChild, wasKilled } from '../support/crash.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}
const EDITS = [
  ['prepend a paragraph', (t, q) => `새 문단.\n\n${t}`, ['located', 'relocated']],
  ['edit the words next to the quote', (t, q) => t.replace(q, `아주 ${q}`), ['relocated', 'located']],
  ['delete the quote', (t, q) => t.replace(q, '다른 말'), ['stale']],
  ['duplicate the whole text', (t) => `${t}\n${t}`, ['stale']],
];

for (const [fixture, nodeFile, surfaceId, entityId, quote] of [
  ['serial-2level', join('tree', '01-arc-awakening', '01-ep-001.md'), 'ep-001', 'hana', '하나는'],
  ['knowledge-book', join('tree', '01-part-basics', '02-chapter-energy', '01-atp.md'), 'atp-section', 'atp', 'ATP는'],
]) {
  for (const [name, edit, allowed] of EDITS) {
    test(`M4-1 ${fixture}: re-find after "${name}"`, async () => {
      const root = await copyFixture(fixture);
      await useFakePack(root);
      const tools = createToolbox({ packs: fakePacks() });
      await ok(tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: surfaceId }, items: [{ entityId, kind: 'appearance', quote }] }));
      const path = join(root, nodeFile);
      const text = await readFile(path, 'utf8');
      const body = text.slice(text.indexOf('---\n', 4) + 4);
      await writeFile(path, text.replace(body, edit(body, quote)));
      const marks = (await ok(tools.call('folio_find', { root, query: 'usages', id: entityId }))).marks;
      assert.ok(allowed.includes(marks[0].status), `${marks[0].status} not in ${allowed}`);
      const status = await ok(tools.call('folio_status', { root }));
      assert.equal(status.occurrences.stale.length, marks[0].status === 'stale' ? 1 : 0);
    });
  }
}

test('M4-2 an appearance of a dead character blocks; a mention does not', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level');
  const make = () => createRunner({ root, packs: fakePacks() });
  const appear = createFakeHost({ drafts: { 'ep-003': '그는 문을 두드렸다.' }, events: { 'ep-003': { events: [], occurrences: [{ entityId: 'doyun', kind: 'appearance', quote: '그는' }] } } });
  const blocked = await driveToEnd(make, appear, { start: { node: 'ep-003' }, until: (o) => o.status === 'needs_user' });
  assert.ok(blocked.at(-1).question.blocking.some((f) => f.code === 'DEAD_ON_STAGE'));
  await make().decide({ runId: blocked.at(-1).runId, action: 'skip', reason: '다시' });
  const mention = createFakeHost({ drafts: { 'ep-003': '하나는 도윤을 떠올렸다.' }, events: { 'ep-003': { events: [], occurrences: [{ entityId: 'doyun', kind: 'mention', quote: '도윤을' }] } } });
  const done = await driveToEnd(make, mention, { start: { node: 'ep-003' }, until: (o) => o.status === 'done' });
  assert.equal(done.at(-1).status, 'done');
});

test('M4-3 a rename that fails in the middle or is killed leaves the files as they were', async () => {
  const root = await copyFixture('knowledge-book');
  const BOOK_FILES = ['tree/01-part-basics/02-chapter-energy/01-atp.md', 'tree/01-part-basics/01-chapter-cells/02-membranes.md', 'entities/term/atp.md'];
  const readAll = async (dir) => Promise.all(BOOK_FILES.map((p) => readFile(join(dir, p), 'utf8')));
  const before = await readAll(root);
  const child = runTxChild(root, 'kill-after-second-write-book');
  assert.ok(wasKilled(child), child.stderr);
  // 다음 작업 잠금이 되돌린다(folio_find usages 는 작업 잠금을 잡는다)
  await useFakePack(root);
  const tools = createToolbox({ packs: fakePacks() });
  await ok(tools.call('folio_find', { root, query: 'usages', id: 'atp' }));
  assert.deepEqual(await readAll(root), before);
  // 주입 실패도 같은 결과: 계획을 적용하다 세 번째 파일 앞에서 실패
  await ok(tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'atp-section' }, items: [{ entityId: 'atp', kind: 'appearance', quote: 'ATP는' }] }));
  await ok(tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'membranes' }, items: [{ entityId: 'atp', kind: 'mention', quote: 'ATP를' }] }));
  const plan = await ok(tools.call('folio_find', { root, query: 'rename', id: 'atp', newName: '아데노신삼인산' }));
  await assert.rejects(applyRename(root, { entityId: 'atp', newName: '아데노신삼인산', planDigest: plan.planDigest }, { hooks: { beforeWrite: (i) => { if (i === 2) throw new Error('boom'); } } }), { code: 'TX_FAILED' });
  assert.deepEqual(await readAll(root), before);
});

test('M4-4 over MCP stdio: extract occurrences → commit → marks → rename → recommit → no drift', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await copyFixture('serial-2level');
  const answer = (r) => {
    const p = r.payload;
    if (r.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
    if (r.purpose === 'revise' || r.purpose === 'user_revision') return p.draft;
    if (p.produces === 'plan') return `${p.node.title} 계획`;
    if (p.produces === 'draft') return '하나는 지하실 끝에서 잠긴 문을 발견했다. 그녀는 숨을 골랐다.\n';
    if (p.produces === 'events') {
      // 이름을 바꾼 뒤(recommit)에는 원고에 새 이름이 있다 — 인용문은 늘 지금 원고에서 뽑는다
      const name = p.draft.includes('세라는') ? '세라는' : '하나는';
      return JSON.stringify({ events: [], appearances: [], mentions: [], occurrences: p.occurrences?.wanted ? [{ entityId: 'hana', kind: 'appearance', quote: name }, { entityId: 'hana', kind: 'appearance', quote: '그녀는' }] : undefined });
    }
    throw new Error(`no answer for ${r.purpose}/${p.produces}`);
  };
  async function drive(start) {
    const labels = [];
    let out = await ok(folio.call('folio_run', { root, ...start }));
    for (let i = 0; i < 40 && out.status !== 'done'; i += 1) {
      labels.push(label(out));
      if (out.status === 'needs_model') out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
      else if (out.status === 'needs_user') out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
      else throw new Error(`unexpected ${out.status}`);
    }
    labels.push(label(out));
    return labels;
  }
  assert.equal((await drive({ node: 'ep-001' })).at(-1), 'done');
  const marks = (await ok(folio.call('folio_find', { root, query: 'usages', id: 'hana' }))).marks;
  assert.deepEqual(marks.map((m) => [m.quote, m.status, m.origin]), [['하나는', 'located', 'extract'], ['그녀는', 'located', 'extract']]);
  const plan = await ok(folio.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' }));
  assert.deepEqual(plan.committed, ['ep-001']);
  const applied = await ok(folio.call('folio_occurrences', { root, op: 'rename', entityId: 'hana', newName: '세라', planDigest: plan.planDigest }));
  assert.deepEqual(applied.recommit, ['ep-001']);
  const drifted = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(drifted.drift.map((d) => [d.nodeId, d.code, d.recommit]), [['ep-001', 'HAND_EDITED', true]]);
  const labels = await drive({ node: 'ep-001', mode: 'recommit' });
  assert.deepEqual(labels, ['model:extract', 'model:critic', 'user:approve', 'done']);
  const clean = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(clean.drift, []);
  assert.deepEqual(clean.occurrences.stale, []);
  assert.match(await readFile(join(root, 'tree', '01-arc-awakening', '01-ep-001.md'), 'utf8'), /세라는 지하실/);
  assert.equal(folio.stderr(), '');
});

test('M4-5 feature toggles remove features but never locks', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  await seedEvents(root, 'serial-2level');
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml({ ...parseYaml(await readFile(path, 'utf8')), features: { occurrences: false, occurrencesInExtract: false, rename: false, recommit: false } }));
  const tools = createToolbox({ packs: fakePacks() });
  assert.equal((await tools.call('folio_occurrences', { root, op: 'submit', surface: { kind: 'node', id: 'ep-001' }, items: [] })).error.code, 'FEATURE_DISABLED');
  assert.equal((await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' })).error.code, 'FEATURE_DISABLED');
  const host = createFakeHost({ drafts: { 'ep-003': '도윤이 문을 두드렸다.' }, events: { 'ep-003': { events: [], appearances: ['doyun'] } } });
  const trail = await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, { start: { node: 'ep-003' }, until: (o) => o.status === 'needs_user' });
  assert.equal(trail.at(-1).question.canApprove, false);
});
```

`M4-3`는 Task C1의 `kill-after-second-write-book` 시나리오(knowledge-book 세 파일)를 쓴다. 세 파일 모두 원래 글과 같아야 한다.

`M4-4`에서 fixture work.yaml의 `packs: [novel]`이 그대로 실제 소설 팩이다(MCP 서버는 내장 팩을 쓴다). `critic` 단계 외에 소설 팩의 다른 모델 검사(fixed-facts, episode-hook 등)가 켜져 있으면 레이블이 달라진다. 그러면 기대 레이블을 실제 소설 팩 파이프라인(`packs/novel/pack.yaml`, serial의 `checkSets`)에 맞춘다 — `model:critic`이 한 번에 여러 검사를 묶어 묻는지 먼저 `test/acceptance/m3.test.js`의 레이블로 확인한다(M3는 `'model:extract', 'model:critic', 'user:approve', 'done'`이다).

- [ ] **Step 2: 실행** — Run: `node --test test/acceptance/m4.test.js` · Expected: PASS(Part A~D가 끝났으므로). 실패하면 테스트가 아니라 원인을 고친다(`superpowers:systematic-debugging`).

- [ ] **Step 3: 전체** — Run: `npm run check` · Expected: 전부 PASS. 테스트 수를 적는다.

- [ ] **Step 4: 커밋**

```bash
git add test/acceptance/m4.test.js
git commit -m "test(acceptance): M4 re-find, appearance vs mention, all-or-nothing rename, recommit over MCP, feature toggles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 정지** — 완료 기준 테스트 결과(M4-1 ~ M4-5 각각, 전체 수)를 사용자에게 보여 주고 멈춘다. SDD ledger를 `docs/plans/2026-09-27-m4-occurrences-rulings.md`로 복사해 커밋한다. N1은 사용자 확인 전에 시작하지 않는다.

---

## 범위 밖 (이 계획에서 하지 않음)

- 본문 주장 ↔ 자료 구간 근거 연결(N2). 이 계획의 대조·표면 모듈을 N2가 쓴다.
- 한국어 조사 자동 교정(경고만).
- doctor(묶기 도중 죽음 복구), 기록장 찢어진 마지막 줄, Windows EPERM.
- 뷰어의 등장 위치 화면(M6).

## 자기 점검 결과

**설계 대조(정본·사용자 요청 → Task):**

| 요청 | Task |
|---|---|
| 제출·대조(인용문이 본문에 정확히 있나, 아니면 거부하고 이유) | A3 `resolveQuote`, B1 `validateItems`/`submitOccurrences` |
| 등장/언급 구분(언급은 사망 검사 밖) | B1 `OCCURRENCE_KINDS`, B3 appearances/mentions, D3 M4-2 |
| 인용문 + 앞뒤 문맥 저장, 글자 번호만 저장하지 않음 | 결정 1, A3, B1 |
| 본문 변경 후 다시 찾기, 못 찾으면 stale | A3 `reanchor`, B1 `occurrenceStates`/status, D3 M4-1 |
| 모든 글이 대상(본문·위층 계획·엔티티 설명·그림 설명서·자료 요약) | A3 표면 4종 |
| mention-scan 후보가 제출을 돕는다 | B2 `candidatesFor`, D1 `candidates` |
| `folio_find`: 정의, 사용처, 사건 이력, 이름 바꾸기 계획 | D1 |
| 이름 바꾸기: 메모리 계획 → 보여주기 → 한 번에 쓰기, 중간 실패 시 변화 없음, 본문 속 이름까지 | C1, C2, C3, D3 M4-3 |
| 소설 인물과 비문학 용어 둘 다 | A3·B1·C2·C3·D3 테스트가 serial-2level `hana`와 knowledge-book `atp` 둘 다 |
| 모든 기능 옵션(사용자 결정) | A1, 각 Task의 `assertFeature`, D3 M4-5 |
| 범위 밖이던 그림·자료 표면, 기록된 등장 위치를 검사 범위에 | A3, B4 |
| 커밋 원고를 바꾼 뒤 잠금을 지키며 다시 커밋 | 결정 11·12, C4 |
| 넘긴 항목: parseBlocks 코드 블록, 도구 오류 메시지 | A2, D1 |
| 스킬 참조 문서 | D2 |
| 완료 기준·정지 | D3 |

**빈칸 검사:** `TBD`·`TODO`·"나중에" 없음. 구현자가 HEAD를 보고 확인할 곳은 확인 방법과 함께 적었다: B4 `makeReceipt` 도우미·`rechecks.js`의 이유 거르기·트리 관계, C2 노드·엔티티 객체를 통째로 비교하는 기존 테스트, C3 `OPEN_STATES`, C4 hard 질문 승인 거부 경로(`decide.js`)·drift 비교 테스트, D1 기존 도구 수 assert, D3 소설 팩 레이블(M3와 같은지).

**이름 일치:** `FEATURES`·`assertFeature`·`featuresDigest`(A1) → B3 `outOfSync`·C3·C4·D1. `fencedRanges`·`fencedLines`·`inRanges`·`maskRanges`(A2) → A3·B2·C2. `surfaceFields`·`surfaceText`·`surfaceKey`·`allSurfaces`(A3) → B1·B2·C2. `resolveQuote`·`reanchor`·`matchesOf`·`CONTEXT_CHARS`(A3) → B1·B2·C2. `OCCURRENCES_LEDGER`·`latestBySurface`·`validateItems`·`occurrenceStates`·`liveMarks`·`staleOccurrences`·`submitOccurrences`(B1) → B2·B3·B4·C2·C3·D1. `readOccurrences`(D1에서 `records.js`에 더함) → D1 find. `marksOf`·`candidatesFor`(B2) → D1. `recordRunOccurrences`(B3) → commit-step. `writeFilesTx`·`recoverFileTx`·`pendingFileTx`·`runTxChild`(C1) → C3·D3. `planRename`·`josaWarning`(C2) → C3·D1. `applyRename`(C3) → D1. `RECOMMIT_MODE`·`isRecommit`·`newRecommitRun`·`assertRecommitNeeded`·`recommitTextChanged`(C4) → runner·generate·children.
