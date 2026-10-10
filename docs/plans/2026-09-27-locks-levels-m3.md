# Folio 잠금 코어화 · 레벨별 단계 · M3 (MCP + 최소 소설 팩) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 잠금 규칙을 팩 표시가 아니라 코어가 정하게 하고(Part A), `work.yaml`에서 레벨마다 단계를 바꿀 수 있게 한 뒤(Part B), 공식 MCP SDK(stdio) 서버·최소 소설 팩·얇은 스킬 하나로 "새 작품 → 아크 계획 승인 → 1화 커밋"을 호스트에서 실제로 돌린다(Part C = M3).

**Architecture:** 코어(`core/`)는 그대로 모델·네트워크를 부르지 않는다. 팩은 코어가 검증하는 데이터다: 잠금 단계는 `core/pipeline/define.js`가 계산하고 `core/pack/validate.js`가 팩 선언과 대조하며, 팩 내용 digest는 파이프라인 digest에 들어간다. 파일 팩은 `core/pack/yaml-pack.js`가 `pack.yaml`(선언) + `*.md`(글) + 이름으로 등록한 검사기(JS)로 조립한다. 새 `server/`가 SDK의 저수준 `Server`로 도구 9개를 내고, 도구는 실행기(`createRunner`)·작업 잠금(`withWorkLock`)·읽기 함수만 부른다 — `commitNode`와 구조 함수는 직접 부르지 않는다.

**Tech Stack:** Node ESM + JSDoc, `node:test`, `node:sqlite`, `yaml`, `@modelcontextprotocol/sdk`(1.x, stdio, 저수준 `Server` — zod를 직접 쓰지 않는다), ESLint 9 + TypeScript(`checkJs`).

**Spec:** 착수 계획서 아티팩트 https://claude.ai/artifact/WjJzcsjnQZnVxyyJZaxvcX (유일한 설계 정본 — §09 단계 설정과 잠금, §12 검사 세트, §14 팩, §16 MCP 도구, §20 M3). 앞 계획: `docs/plans/2026-09-26-m0-m2.md`. vibelore(`/path/to/vibelore`)는 읽기 전용 참고.

## Global Constraints

- 이름 `Folio`, MCP 도구 접두어 `folio_`, 작품 내부 폴더 `.folio/`.
- `package.json` `"engines": { "node": "^22.13.0 || ^24.0.0 || ^26.0.0" }`, `"type": "module"`.
- 런타임 의존성은 `yaml`과 `@modelcontextprotocol/sdk` 둘. SDK가 끌고 오는 zod는 직접 import하지 않는다. 네이티브 모듈 금지.
- `core/`와 `packs/`는 모델·네트워크를 부르지 않는다 (`test/core/no-model-calls.test.js` 가드가 두 폴더를 모두 본다). `server/`만 SDK를 import한다.
- MCP 도구는 실행기(`createRunner`의 run/resume/decide), `changeStructure`(작업 잠금 안의 구조 바꾸기), `initWork`(새 작품, 이미 있으면 쓰지 않음), 읽기 함수만 부른다. `core/run/commit.js`, `core/run/recheck-commit.js`, `core/structure/ops.js`, `core/ledger/ledger.js`, `core/store/tree.js`를 `server/`에서 import하지 않는다(Task C6 가드 테스트).
- 잠금 규칙(설정·팩으로 끌 수 없음): 커밋 원고 hash = 검사 원고 hash · 영수증 없이 커밋 금지 · hard 충돌이면 커밋 차단 · 기록장은 추가만 · 같은 호스트 자기검토를 독립 평가로 표기 금지 · soft·참고 의견은 자동 수정 사유 아님 · 엔진은 `needs_model`/`needs_user`를 돌려주고 resume으로 이어감.
- 잠금 단계는 코어가 정한다: `commit` 단계 + 잠긴 코어 검사(`core.promise-order`, stage `facts`)가 도는 check 단계 + 그 단계가 (거슬러) 요구하는 단계. 팩의 `locked` 표시는 믿지 않는다(적었다면 코어 계산과 같아야 한다). YAML 팩은 `locked`를 적을 수 없다.
- 테스트 데이터는 전부 합성 fixture. 실제 작품·생성 결과물 금지. vibelore 파일은 읽기만 한다.
- 파일 하나에 한 책임. 300줄을 넘기면 나눈다.
- 문서·주석 설명은 한국어, 코드 식별자는 영어. 커밋 메시지는 영어 Conventional Commits, 끝에 정확히 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `.superpowers/`는 커밋하지 않는다. 각 Task는 자기 파일만 커밋한다.
- TDD: 실패하는 테스트 → 실패 확인 → 구현 → 통과 → `npm run check` 전부 초록 → 커밋. 기존 테스트의 assert를 약화하지 않는다. 기존 테스트를 바꾸는 곳은 이 계획이 이유와 함께 정확히 적은 곳뿐이다.
- 마일스톤 정지: Part A+B가 끝나면(Task B3, "M2.5") 완료 기준 테스트 결과를 보여 주고 멈춘다. Part C가 끝나면(Task C9, M3) 다시 보여 주고 멈춘다.

---

## 현재 상태 (이 계획을 시작하는 시점, HEAD `15d2013`)

새 세션이 이전 대화 없이 이어받을 수 있게 적는다.

### 끝난 일

- M0~M2(`5579d71`..`a016bcb`): 레포·CI, 합성 fixture 4개(`novel-3level`, `serial-2level`, `knowledge-book`, `gamebook`), 저장소(M1), 실행기(M2). 계획서 `docs/plans/2026-09-26-m0-m2.md`.
- M2 뒤 후속(`a6ed6bf`..`15d2013`):
  - `a6ed6bf` 깨진 실행 파일을 상태 경고로. `f27896e` CRLF. `d8c0d84` unsupported 지적은 hard 잠금에서 뺌. `16ac5f7`→이후 옵션화. `14235a8`·`91bf716`·`a016bcb` 가드 테스트 보강.
  - `2b5468c`·`ca77123` **decisions 기록장**: 검사 결과·승인·넘김을 판정 순간 해시 사슬 기록장(`.folio/ledger/decisions.jsonl`)에 남기고, 커밋이 영수증을 대조한다(`LOCK_DECISION_MISMATCH`). **한 실행은 한 번만 커밋**(`LOCK_RUN_ALREADY_COMMITTED`). check_result에 범위 digest(`refsDigest`).
  - `cc95141`(옵션으로 바뀜)·`5f6b4dc` **검사 세트는 작가가 고른다**: `checkSets` 키가 없으면 팩 기본 세트, `[]`이면 세트 없음. 추천(`describeCheckSets`, `recommendCheckSets`, `recommendForNode`)은 읽기 전용 — 자동으로 켜지 않는다. `options.includeAllHardChecks`(기본 false): true면 알려진 hard 검사를 모두 켜고 끌 수 없다. false면 hard 팩 검사도 `mode: off`로 끌 수 있다. hard 검사의 등급 바꾸기는 언제나 거부(`HARD_CHECK_SEVERITY_LOCKED`). 잠긴 코어 검사는 언제나 끌 수 없다(`LOCKED_CHECK_OVERRIDE`). `userCheckSets`, 사용자 검사 초안 검증(`validateUserCheckDraft`), 규칙 파일·예시는 `checks/` 안에만.
  - `f85d557` **끄기·다시 켜기·되채우기**: 영수증 `appliedChecks`. 실행 도중 끈 검사는 남은 단계에서 `skipped`(source `work.yaml`). 다시 켜면 `findStale`이 `{kind:'check'}` 이유를 내고 `run({ node, mode: 'recheck' })` 재검사 실행이 검사만 다시 돈다(원고 불변, hard면 `flagged`).
  - `5764b80` **순서 변경은 stale**: 영수증 `order: {mode, ordered}`. `ordered`가 바뀌면 `{kind:'order'}`.
  - `1ea385a`·`3f6d186` 스킬 `skill/folio-checks/SKILL.md`(이 계획 Task C8에서 `skill/folio/references/checks.md`로 옮긴다).
  - `15d2013` 모델 답은 낸 요청에 묶인다(`run.issued` id + payload digest, `takeAnswer`). 재계획 때 inbox·issued·pending을 비운다. error 결과는 적용으로 치지 않는다. 재검사도 extract부터.
- 테스트 354개 통과(`npm run check`).

### 모듈 지도 (HEAD 기준, 이 계획이 건드리는 것 위주)

| 파일 | 하는 일 |
|---|---|
| `core/pipeline/define.js` | `resolvePipeline(base, overrides)` → `{steps, errors, matched, digest}`. 지금은 팩 `locked` 표시에서 잠금을 씨앗으로 잡는다(`markLocked`) — Task A1이 바꾼다 |
| `core/pipeline/resolve.js` | `resolvePipelines({primary, overrides, checks, includeAllHardChecks})` → `{leaf, branch, errors}`. 같은 overrides를 leaf·branch에 건다 — Task B1이 레벨별로 바꾼다 |
| `core/pack/registry.js` | `resolvePacks(names, available)`. `checkSets`를 `Object.assign`으로 합쳐 조용히 덮는다 — Task A2가 막는다 |
| `core/checks/check-set.js` | `resolveChecks({registry, config})`. `known` Map이 조용히 덮는다 — Task A2 |
| `core/run/workspace.js` | `openWorkspace(root, {packs})` → `{work, registry, checks, pipelines:{leaf,branch}, checksDigest:{leaf,branch}, applied:{leaf,branch}}` |
| `core/run/runner.js` | `createRunner({root, packs, now, newId, hooks})` → `{run, resume, decide}` (작업 잠금 `withWorkLock` 안). 파이프라인은 `ctx.pipelines[run.nodeKind]` |
| `core/run/sync.js` | `checkPlanFor`, `outOfSync`, `dropPending`, `syncPipeline` |
| `core/run/steps/*.js` | 단계 처리기. `common.js` `requestModel`·`takeAnswer`·`requestDigest` |
| `core/run/payload.js` | `basePayload`, `packPayload`(팩 `prompt()`를 입힌 것), `scopeFor` |
| `core/run/commit.js` · `commit-locks.js` | 유일한 커밋 경로와 잠금 |
| `core/run/recheck-plan.js` · `steps/recheck-step.js` · `recheck-commit.js` | 재검사 |
| `core/structure/ops.js` | `addNode`, `moveNode`, `wrapNodes`. **작업 잠금 없음**(M3로 넘긴 항목) |
| `core/status.js` | `workStatus(root, {packs})` |
| `core/scope/stale.js` · `stale-checks.js` · `rechecks.js` | `findStale`, 이유 계산, 되채우기 목록 |
| `test/support/*` | `fake-pack.js`(fake 팩), `fake-host.js`(`createFakeHost`, `driveToEnd`, `label`), `fixtures.js`, `receipts.js`, `recheck.js`(`committedWith`, `editYaml`, ...) |

### 이 계획이 처리하는 넘긴 항목(parked)

- resume이 설정이 바뀐 뒤의 답을 일찍 거부(`ANSWER_STALE`) — Task C1
- 재계획 때 재검사 재시도 횟수 초기화 — Task C1
- 요청 digest를 팩 `prompt()` 앞 재료로 계산 — Task C1
- `node:sqlite` ExperimentalWarning 처리 — Task C7
- 구조 바꾸기를 작업 잠금 안에서 + 구조 변경이 커밋된 가지를 stale로 — Task C2

### 이 계획에서 하지 않는 것(계속 넘김)

- `parseBlocks`의 코드 블록 건너뛰기, 묶기 도중 죽었을 때 복구(doctor), 기록장 찢어진 마지막 줄 분류, Windows EPERM 재시도.
- vibelore 검사기 약 30개 이식(M5). 이 계획의 소설 팩은 M3에 필요한 hard 사실 검사만 가진다.
- AI로 팩 만들기(folio-pack) — v0.1 범위 밖. 뷰어(M6) — `folio_view`는 자리만.
- 등장 위치 제출·이름 바꾸기(M4) — `folio_find`는 정의·사용처·사건 이력만.

---

## 결정 (이 계획에서 정한 것)

| # | 문제 | 결정 |
|---|---|---|
| 1 | 팩이 `locked`를 잘못 적으면 잠금이 풀린다(`define.js`가 팩 표시를 믿음) | 코어가 잠금을 계산한다: `commit` + stage가 잠긴 코어 검사의 stage(`facts`)인 check 단계 + 그 둘이 (거슬러) `requires`하는 단계. 맨 아래 칸은 `facts` 결정론 단계가 `produces: events` 단계를, 그 단계가 `produces: draft` 단계를 요구해야 한다. 팩이 `locked`를 적었다면 코어 계산과 같아야 한다(`PACK_LOCK_MISMATCH`) |
| 2 | 검사 id·세트 id가 팩끼리 조용히 덮인다 | 팩 검사 id와 세트 id는 `<팩이름>.`으로 시작해야 한다. 한 팩 안·팩끼리 겹치면 오류. 같은 팩을 두 번 적거나 다른 이름으로 등록하면 오류 |
| 3 | 파일 팩이 바뀌어도 실행은 모른다 | 팩 digest(파일 팩은 `pack.yaml`·읽은 글·쓰는 검사기 소스, JS 팩은 내용 투영)를 모은 레지스트리 digest를 파이프라인 digest에 넣는다. 영수증 `pipelineDigest`에 그대로 담기고, 바뀌면 열린 실행은 검사부터 다시 |
| 4 | 레벨별 단계 설정이 없다 | `overrides.levels.<레벨>.<단계>: patch`. 전체 덮어쓰기 위에 필드 단위로 얹는다(레벨이 이긴다). 레벨 파이프라인·digest·검사 digest·적용 검사를 레벨마다 계산한다. 단계 id `levels`와 잠긴 stage 이름(`facts`)은 새 단계 id로 쓸 수 없다 |
| 5 | MCP SDK의 `McpServer.registerTool`은 zod 스키마를 요구한다 | 저수준 `Server` + `ListTools`/`CallTool` 핸들러 + 직접 만든 JSON Schema 부분 검증기(`server/validate-input.js`). 의존성은 yaml + SDK |
| 6 | 구조 바꾸기가 작업 잠금 밖이다 | `core/structure/locked.js` `changeStructure(root, {op, ...})`: `withWorkLock` 안에서, 열린 실행(active/awaiting_*/committing)이 있으면 `STRUCTURE_RUN_OPEN`. `waiting_children` 가지 실행은 열린 실행이 아니다 |
| 7 | 구조 변경이 커밋된 가지를 stale로 만들지 않는다 | 가지 영수증에 선택 필드 `structure: { children: [...] }`. `findStale`이 지금 자식 목록과 다르면 `{kind:'structure'}`. 커밋도 지금 자식 목록과 같아야 한다(`STRUCTURE_MISMATCH`). 재검사로는 풀리지 않는다(가지를 다시 돌린다) |
| 8 | 팩 프롬프트를 어디에 두나 | `pack.yaml` `prompts: { '<leaf|branch>.<단계>': prompts/x.md }`. 팩 `prompt(step, payload)`가 `payload.instructions`로 얹는다. 모델 검사 글은 검사 정의의 `instruction`이 된다(checksDigest에 든다) |
| 9 | `folio_view`, `folio_find`의 M3 범위 | `folio_view`는 `{status:'unavailable', code:'VIEWER_NOT_BUILT'}`. `folio_find`는 `node`·`entity`(정의), `usages`·`events`(작업 잠금 안에서 index.db를 다시 만들어 조회) |
| 10 | 고급 도구 | `folio_config` 하나(읽기 전용): 레벨별 단계·검사 세트·추천·검사 목록, 선택으로 사용자 검사 초안 검증. work.yaml 쓰기는 호스트가 작가 승인 뒤 파일로 한다 |

## 파일 구조

```
core/
  pipeline/define.js        (수정) LOCKED_STAGES, RESERVED_STEP_IDS, isCoreLockSeed, coreLockedIds, pipelineDigest(steps, packDigest)
  pipeline/levels.js        (새)  splitOverrides, mergeOverrides
  pipeline/resolve.js       (수정) resolvePipelines(... levels, packDigest) → { leaf, branch, byLevel, errors }
  pack/validate.js          (새)  validatePack, pipelineErrors
  pack/digest.js            (새)  packDigest, registryDigest
  pack/registry.js          (수정) 검증·중복·이름·digest
  pack/yaml-schema.js       (새)  readPackSpec (pack.yaml → 명세, 순수)
  pack/yaml-pack.js         (새)  loadYamlPack (파일 읽기·경로 가드·조립)
  checks/check-set.js       (수정) CHECK_ID_DUPLICATE
  checks/user-check-draft.js (수정) stagesByTier 가 byLevel 도 본다
  run/level-pipeline.js     (새)  levelOf, pipelineFor, checksDigestFor
  run/workspace.js          (수정) byLevel, packDigest
  run/runner.js             (수정) 레벨 파이프라인, ANSWER_STALE
  run/sync.js               (수정) 레벨 파이프라인, 재시도 초기화
  run/recheck-plan.js       (수정) 레벨 파이프라인
  run/payload.js            (수정) rawPackPayload, dressPayload
  run/steps/common.js       (수정) requestModel digestPayload
  run/steps/generate.js · children.js · revise.js (수정) 요청 digest 는 prompt() 앞 재료로
  run/receipt-builder.js    (수정) structure
  run/commit-locks.js · commit.js · recheck-commit.js (수정) packDigest, assertStructureMatches
  ledger/receipts.js        (수정) STRUCTURE_INVALID
  scope/stale-checks.js · stale.js (수정) structureReason, 레벨 적용 검사
  structure/locked.js       (새)  changeStructure
  work/init.js              (새)  initWork
packs/
  index.js                  (새)  loadBuiltinPacks
  novel/pack.yaml · index.js · prompts/*.md · checks/*.md · checkers/{index,dead-on-stage}.js (새), README.md (수정)
server/
  toolbox.js                (새)  createToolbox (이름 → 실행, 던지지 않음)
  validate-input.js         (새)  validateInput (JSON Schema 부분)
  tools/definitions.js      (새)  TOOLS, BASE_TOOL_NAMES
  tools/handlers.js         (새)  createHandlers
  tools/find.js             (새)  findInWork
  tools/config.js           (새)  describeConfig
  stdio.js                  (새)  createMcpServer, startStdioServer
  warnings.js               (새)  quietSqliteWarning
bin/folio-mcp.js            (새)  실행 파일
skill/folio/SKILL.md · references/checks.md · references/steps.md (새), skill/folio-checks/ (삭제), skill/README.md (수정)
test/
  pack/{pack-locks,pack-ids,pack-digest,yaml-pack,novel-pack}.test.js
  run/{pipeline-levels,level-overrides,parked-m3,structure-lock}.test.js
  core/init.test.js
  server/{tools,warnings,stdio,skill-docs}.test.js
  support/mcp-client.js
  acceptance/m2-5.test.js, acceptance/m3.test.js
```

**데이터 흐름 한 줄:** 호스트 → `server/stdio.js`(SDK) → `server/toolbox.js`(입력 검증) → 실행기·`changeStructure`·읽기 함수 → 코어. 코어는 여전히 `openWork` + 기록장만 보고 판단하고, 파일 쓰기는 `structure/ops.js`(구조, 이제 `changeStructure`와 실행기의 자식 단계만 부름)·`run/commit.js`(본문 확정)·`work/init.js`(새 작품)뿐이다.

---

# Part A — 잠금을 코어로

### Task A1: 잠금 단계는 코어가 계산한다

**Files:**
- Modify: `core/pipeline/define.js` (import, 잠금 계산, `addCustom` 예약 id)
- Create: `core/pack/validate.js`
- Modify: `core/pack/registry.js`
- Test: `test/pack/pack-locks.test.js`

**Interfaces:**
- Consumes: `BUILTIN_CHECKS`(`core/checks/builtin.js`), 기존 `resolvePipeline`.
- Produces:
  - `LOCKED_STAGES: string[]` — 잠긴 코어 검사의 stage(지금 `['facts']`).
  - `RESERVED_STEP_IDS: string[]` — `[...LOCKED_STAGES, 'levels']`. work.yaml 새 단계 id로 쓸 수 없다(`STEP_ID_RESERVED`).
  - `isCoreLockSeed(step): boolean` — `kind === 'commit'` 이거나 stage가 `LOCKED_STAGES`인 check 단계.
  - `coreLockedIds(steps): Set<string>` — 씨앗 + 거슬러 요구하는 단계.
  - `validatePack(pack): Array<{code, ...}>`, `pipelineErrors(pack)` — 코드 `PACK_PIPELINE_MISSING`, `PACK_STEP_ID_RESERVED`, `PACK_LOCK_MISMATCH`, `PACK_LOCKED_STAGE_MISSING`, `PACK_LOCKED_STAGE_TIER`, `PACK_FACTS_REQUIRES_EVENTS`, `PACK_EVENTS_REQUIRES_DRAFT`.
  - `resolvePacks`는 팩마다 `validatePack`을 돌려 첫 오류 코드로 `FolioError`를 던진다(`details: { pack, errors }`). 첫 팩에 `pipelines`가 없으면 `PACK_PIPELINE_MISSING`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/pack/pack-locks.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePacks } from '../../core/pack/registry.js';
import { validatePack } from '../../core/pack/validate.js';
import { resolvePipeline, coreLockedIds, LOCKED_STAGES } from '../../core/pipeline/define.js';
import { fakePack } from '../support/fake-pack.js';

const strip = (steps) => steps.map(({ locked: _locked, ...step }) => step);
const withLeaf = (leaf) => ({ ...fakePack, pipelines: { ...fakePack.pipelines, leaf } });
const codes = (pack) => validatePack(pack).map((e) => e.code);
const leaf = fakePack.pipelines.leaf;

test('core locks commit, the step hosting core.promise-order and what it requires, whatever the pack says', () => {
  assert.deepEqual(LOCKED_STAGES, ['facts']);
  assert.deepEqual([...coreLockedIds(strip(leaf))].sort(), ['commit', 'draft', 'extract', 'facts']);
  const { steps, errors } = resolvePipeline(strip(leaf), {});
  assert.deepEqual(errors, []);
  assert.deepEqual(steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  assert.deepEqual(resolvePipeline(strip(leaf), { facts: { mode: 'off' } }).errors.map((e) => e.code), ['LOCKED_STEP_OVERRIDE']);
  assert.deepEqual(resolvePipeline(strip(fakePack.pipelines.branch), {}).steps.filter((s) => s.locked).map((s) => s.id), ['commit']);
});

test('a pack without locked flags is valid, and flags that agree with core are accepted', () => {
  assert.deepEqual(codes({ ...fakePack, pipelines: { leaf: strip(leaf), branch: strip(fakePack.pipelines.branch) } }), []);
  assert.deepEqual(codes(fakePack), []);
});

test('a pack that contradicts the core locks is rejected', () => {
  const unlockCommit = withLeaf(leaf.map((s) => (s.id === 'commit' ? { ...s, locked: false } : s)));
  assert.deepEqual(codes(unlockCommit), ['PACK_LOCK_MISMATCH']);
  const lockCritic = withLeaf(leaf.map((s) => (s.id === 'critic' ? { ...s, locked: true } : s)));
  assert.deepEqual(codes(lockCritic), ['PACK_LOCK_MISMATCH']);
  assert.throws(() => resolvePacks(['fake'], new Map([['fake', unlockCommit]])),
    (e) => e.code === 'PACK_LOCK_MISMATCH' && e.details.errors[0].stepId === 'commit' && e.details.pack === 'fake');
});

test('a leaf pipeline must host the locked core stage after the extracted events and the draft', () => {
  assert.deepEqual(codes(withLeaf(leaf.filter((s) => s.id !== 'facts'))), ['PACK_LOCKED_STAGE_MISSING']);
  assert.deepEqual(codes(withLeaf(leaf.map((s) => (s.id === 'facts' ? { ...s, requires: [] } : s)))), ['PACK_FACTS_REQUIRES_EVENTS']);
  assert.deepEqual(codes(withLeaf(leaf.map((s) => (s.id === 'extract' ? { ...s, requires: [] } : s)))), ['PACK_EVENTS_REQUIRES_DRAFT']);
  assert.deepEqual(codes(withLeaf(leaf.map((s) => (s.id === 'facts' ? { ...s, tier: 'model' } : s)))), ['PACK_LOCKED_STAGE_TIER']);
});

test('a pack step cannot be called levels, and work.yaml cannot add a step named after a locked stage or levels', () => {
  assert.deepEqual(codes(withLeaf([{ id: 'levels', kind: 'gate' }, ...leaf])), ['PACK_STEP_ID_RESERVED']);
  for (const id of ['facts', 'levels']) {
    const { errors } = resolvePipeline(fakePack.pipelines.branch, { [id]: { after: 'fit', kind: 'check', tier: 'model' } });
    assert.deepEqual(errors.map((e) => e.code), ['STEP_ID_RESERVED'], id);
  }
});

test('the first pack must bring pipelines; a checks-only pack may follow it', () => {
  const extra = { name: 'extra', checks: [], checkSets: {} };
  assert.throws(() => resolvePacks(['extra'], new Map([['extra', extra]])), { code: 'PACK_PIPELINE_MISSING' });
  assert.doesNotThrow(() => resolvePacks(['fake', 'extra'], new Map([['fake', fakePack], ['extra', extra]])));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/pack/pack-locks.test.js`
Expected: FAIL — `Cannot find module '../../core/pack/validate.js'`

- [ ] **Step 3: `core/pipeline/define.js` — 코어가 잠금을 계산**

파일 머리 import에 한 줄 더한다:
```js
import { canonicalJson, sha256 } from '../util/hash.js';
import { BUILTIN_CHECKS } from '../checks/builtin.js';
```

`const STEP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;` 바로 아래에 더한다:
```js
/** 잠긴 코어 검사가 도는 stage. 이 stage 를 가진 check 단계는 코어가 잠근다(팩 표시와 무관). */
export const LOCKED_STAGES = Object.freeze([...new Set(BUILTIN_CHECKS.filter((c) => c.locked).map((c) => String(c.stage)))]);
/** work.yaml 로 새로 만들 수 없는 단계 id: 잠긴 stage 이름과 레벨별 덮어쓰기 자리(levels). */
export const RESERVED_STEP_IDS = Object.freeze([...LOCKED_STAGES, 'levels']);
const stageOfStep = (step) => step?.stage ?? step?.id;

/** 코어 잠금의 씨앗: commit 단계, 잠긴 코어 검사가 도는 check 단계. */
export const isCoreLockSeed = (step) => step?.kind === 'commit' || (step?.kind === 'check' && LOCKED_STAGES.includes(stageOfStep(step)));

/** 씨앗 + 씨앗이 (거슬러) requires 하는 단계. 팩의 locked 표시는 보지 않는다. */
export function coreLockedIds(steps) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const locked = new Set(steps.filter(isCoreLockSeed).map((s) => s.id));
  const queue = [...locked];
  while (queue.length) {
    for (const dep of byId.get(queue.pop())?.requires ?? []) {
      if (!locked.has(dep)) { locked.add(dep); queue.push(dep); }
    }
  }
  return locked;
}
```

기존 `markLocked` 함수 전체를 이것으로 바꾼다:
```js
function markLocked(steps) {
  const locked = coreLockedIds(steps);
  for (const step of steps) step.locked = locked.has(step.id);
}
```

`addCustom`의 첫 줄 앞에 예약 id 검사를 넣는다:
```js
function addCustom(steps, id, patch, errors) {
  if (RESERVED_STEP_IDS.includes(id)) { errors.push({ code: 'STEP_ID_RESERVED', stepId: id }); return; }
  if (!isValidCustomId(id)) { errors.push({ code: 'STEP_ID_INVALID', stepId: id }); return; }
```
(그 아래는 그대로.)

- [ ] **Step 4: `core/pack/validate.js` 작성**

```js
import { LOCKED_STAGES, coreLockedIds } from '../pipeline/define.js';

export const NODE_KINDS = ['leaf', 'branch'];
const stageOf = (step) => step?.stage ?? step?.id;

/** id 단계가 (거슬러) requires 하는 단계 id. 자기 자신은 빼고. */
function requiredBy(byId, id) {
  const out = new Set();
  const queue = [...(byId.get(id)?.requires ?? [])];
  while (queue.length) {
    const next = queue.pop();
    if (out.has(next)) continue;
    out.add(next);
    queue.push(...(byId.get(next)?.requires ?? []));
  }
  return out;
}

/** 맨 아래 칸: 잠긴 코어 stage 를 결정론 check 단계가 맡고, 그 단계는 사건 추출을, 추출은 원고를 (거슬러) 요구해야 한다. */
function leafErrors(steps) {
  const errors = [];
  const byId = new Map(steps.map((s) => [s.id, s]));
  const producer = (ids, produces) => [...ids].map((id) => byId.get(id)).find((s) => s?.kind === 'generate' && s.produces === produces);
  for (const stage of LOCKED_STAGES) {
    const host = steps.find((s) => s.kind === 'check' && stageOf(s) === stage);
    if (!host) { errors.push({ code: 'PACK_LOCKED_STAGE_MISSING', kind: 'leaf', stage }); continue; }
    if (host.tier !== 'deterministic') { errors.push({ code: 'PACK_LOCKED_STAGE_TIER', kind: 'leaf', stage, stepId: host.id }); continue; }
    const events = producer(requiredBy(byId, host.id), 'events');
    if (!events) { errors.push({ code: 'PACK_FACTS_REQUIRES_EVENTS', kind: 'leaf', stepId: host.id }); continue; }
    if (!producer(requiredBy(byId, events.id), 'draft')) errors.push({ code: 'PACK_EVENTS_REQUIRES_DRAFT', kind: 'leaf', stepId: events.id });
  }
  return errors;
}

/**
 * 팩 단계 정의가 코어 잠금 규칙과 맞는지 본다. 잠금은 코어가 정한다(commit, 잠긴 코어 검사가 도는 단계, 그 둘이 요구하는 단계).
 * 팩의 locked 표시는 믿지 않는다 — 적었다면 코어 계산과 같아야 하고, 다르면 PACK_LOCK_MISMATCH.
 * pipelines 가 없는 팩(검사만 주는 팩)은 여기서 통과한다. 첫 팩인지는 resolvePacks 가 본다.
 */
export function pipelineErrors(pack) {
  if (pack.pipelines === undefined) return [];
  const errors = [];
  for (const kind of NODE_KINDS) {
    const steps = pack.pipelines?.[kind];
    if (!Array.isArray(steps) || steps.length === 0 || !steps.every((s) => s && typeof s === 'object' && typeof s.id === 'string')) {
      errors.push({ code: 'PACK_PIPELINE_MISSING', kind });
      continue;
    }
    const locked = coreLockedIds(steps);
    for (const step of steps) {
      if (step.id === 'levels') errors.push({ code: 'PACK_STEP_ID_RESERVED', kind, stepId: step.id });
      if (step.locked !== undefined && step.locked !== locked.has(step.id)) {
        errors.push({ code: 'PACK_LOCK_MISMATCH', kind, stepId: step.id, declared: step.locked, core: locked.has(step.id) });
      }
    }
    if (kind === 'leaf') errors.push(...leafErrors(steps));
  }
  return errors;
}

/** 팩 하나를 코어 규칙으로 검증한다. 빈 배열이면 유효. */
export function validatePack(pack) {
  return pipelineErrors(pack);
}
```

- [ ] **Step 5: `core/pack/registry.js` — 팩마다 검증**

파일 전체를 이것으로 바꾼다:
```js
import { FolioError } from '../errors.js';
import { validatePack } from './validate.js';

/** 팩 하나가 코어 규칙에 맞지 않으면 첫 오류 코드로 던진다. 전체 목록은 details.errors. */
function assertValid(pack) {
  const errors = validatePack(pack);
  if (errors.length) throw new FolioError(errors[0].code, `pack ${pack.name}: ${errors.map((e) => e.code).join(', ')}`, { pack: pack.name, errors });
}

/**
 * work.yaml 의 packs 순서대로 팩을 모은다. 단계 정의와 프롬프트는 첫 팩(primary)이 준다.
 * 검사·검사 세트·기본 세트는 모든 팩에서 합친다. 모든 팩은 코어 잠금 규칙으로 먼저 검증한다.
 */
export function resolvePacks(names, available) {
  if (!names.length) throw new FolioError('PACK_REQUIRED', 'work.yaml must list at least one pack');
  const packs = names.map((name) => {
    const pack = available.get(name);
    if (!pack) throw new FolioError('PACK_UNKNOWN', name);
    return pack;
  });
  for (const pack of packs) assertValid(pack);
  if (!packs[0].pipelines) throw new FolioError('PACK_PIPELINE_MISSING', `${packs[0].name} brings no pipelines and cannot be the first pack`, { pack: packs[0].name });
  return {
    primary: packs[0],
    packs,
    checks: packs.flatMap((pack) => (pack.checks ?? []).map((check) => {
      if (check.id.startsWith('core.')) throw new FolioError('PACK_CHECK_ID_RESERVED', check.id);
      return { ...check, origin: 'pack' };
    })),
    checkSets: Object.assign({}, ...packs.map((pack) => pack.checkSets ?? {})),
    // work.yaml 에 checkSets 키가 없을 때 쓰는 기본 세트(팩 순서대로, 중복 없이).
    defaultCheckSets: [...new Set(packs.flatMap((pack) => pack.defaultCheckSets ?? []))],
  };
}
```

- [ ] **Step 6: 통과 확인**

Run: `node --test test/pack/pack-locks.test.js`
Expected: PASS (6 tests)

- [ ] **Step 7: 전체 확인과 커밋**

Run: `npm run check`
Expected: lint·typecheck 통과, 모든 테스트 PASS(기존 354 + 6).

```bash
git add core/pipeline/define.js core/pack/validate.js core/pack/registry.js test/pack/pack-locks.test.js
git commit -m "$(cat <<'EOF'
feat(core): let core decide which steps are locked and reject packs that disagree

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task A2: 팩 id는 팩 이름을 접두어로, 겹치면 오류

**Files:**
- Modify: `core/pack/validate.js` (id 규칙 추가)
- Modify: `core/pack/registry.js` (이름·중복·세트 합치기)
- Modify: `core/checks/check-set.js` (`known` 조용한 덮어쓰기 → 오류)
- Modify: `test/run/check-set.test.js:102-106` (세트 id를 접두어 규칙에 맞춤 — assert 동일)
- Test: `test/pack/pack-ids.test.js`

**Interfaces:**
- Consumes: Task A1 `validatePack`, `pipelineErrors`.
- Produces:
  - `validatePack` 추가 코드: `PACK_NAME_INVALID`(`/^[a-z][a-z0-9-]*$/` 아님 — 이때는 이것만 돌려준다), `PACK_NAME_RESERVED`(`core`), `PACK_CHECK_ID_RESERVED`(`core.`로 시작), `PACK_CHECK_ID_PREFIX`, `PACK_CHECK_ID_DUPLICATE`, `PACK_CHECK_SET_ID_PREFIX`, `PACK_DEFAULT_SET_UNKNOWN`.
  - `assertUniqueAcrossPacks(packs)` — 팩끼리 같은 검사 id → `PACK_CHECK_ID_DUPLICATE`(`details.checkId`, `details.packs`), 같은 세트 id → `PACK_CHECK_SET_DUPLICATE`(`details.set`).
  - `resolvePacks`: work.yaml에 같은 팩 두 번 → `PACK_DUPLICATE`, 등록 이름 ≠ `pack.name` → `PACK_NAME_MISMATCH`.
  - `resolveChecks`: 받은 레지스트리에 같은 검사 id가 둘이면 `CHECK_ID_DUPLICATE` 오류(덮지 않는다).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/pack/pack-ids.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePacks, assertUniqueAcrossPacks } from '../../core/pack/registry.js';
import { validatePack } from '../../core/pack/validate.js';
import { resolveChecks } from '../../core/checks/check-set.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { fakePack } from '../support/fake-pack.js';

const codes = (pack) => validatePack(pack).map((e) => e.code);
const one = (pack) => new Map([[pack.name, pack]]);
const extraCheck = (id) => ({ ...fakePack, checks: [...fakePack.checks, { id, tier: 'model', stage: 'critic', severity: 'advisory' }] });

test('pack check ids and check set ids carry the pack name as prefix', () => {
  assert.deepEqual(codes(fakePack), []);
  assert.deepEqual(codes(extraCheck('critic2')), ['PACK_CHECK_ID_PREFIX']);
  assert.deepEqual(codes(extraCheck('novel.critic')), ['PACK_CHECK_ID_PREFIX']);
  assert.deepEqual(codes(extraCheck('fake.')), ['PACK_CHECK_ID_PREFIX']);
  assert.deepEqual(codes({ ...fakePack, checkSets: { ...fakePack.checkSets, basic2: { checks: [] } } }), ['PACK_CHECK_SET_ID_PREFIX']);
  assert.throws(() => resolvePacks(['fake'], one(extraCheck('critic2'))), (e) => e.code === 'PACK_CHECK_ID_PREFIX' && e.details.errors[0].checkId === 'critic2');
});

test('core. stays reserved and is reported before the prefix rule', () => {
  assert.deepEqual(codes(extraCheck('core.promise-order')), ['PACK_CHECK_ID_RESERVED']);
});

test('a pack cannot repeat a check id or name a default set it does not have', () => {
  assert.deepEqual(codes({ ...fakePack, checks: [...fakePack.checks, fakePack.checks[0]] }), ['PACK_CHECK_ID_DUPLICATE']);
  assert.deepEqual(codes({ ...fakePack, defaultCheckSets: ['fake.nope'] }), ['PACK_DEFAULT_SET_UNKNOWN']);
});

test('pack names are lowercase identifiers and core is reserved', () => {
  assert.deepEqual(codes({ ...fakePack, name: 'Fake' }), ['PACK_NAME_INVALID']);
  assert.ok(codes({ ...fakePack, name: 'core' }).includes('PACK_NAME_RESERVED'));
});

test('the same check or set id from two packs is refused instead of silently overwritten', () => {
  const a = { name: 'a', checks: [{ id: 'a.x' }], checkSets: { 'a.s': { checks: [] } } };
  const b = { name: 'b', checks: [{ id: 'a.x' }], checkSets: {} };
  assert.throws(() => assertUniqueAcrossPacks([a, b]), (e) => e.code === 'PACK_CHECK_ID_DUPLICATE' && e.details.checkId === 'a.x' && e.details.packs.join() === 'a,b');
  const c = { name: 'c', checks: [], checkSets: { 'a.s': { checks: [] } } };
  assert.throws(() => assertUniqueAcrossPacks([a, c]), (e) => e.code === 'PACK_CHECK_SET_DUPLICATE' && e.details.set === 'a.s');
});

test('a work cannot list a pack twice, and a pack must be registered under its own name', () => {
  assert.throws(() => resolvePacks(['fake', 'fake'], one(fakePack)), { code: 'PACK_DUPLICATE' });
  assert.throws(() => resolvePacks(['other'], new Map([['other', fakePack]])), { code: 'PACK_NAME_MISMATCH' });
});

test('resolveChecks reports duplicate ids in the registry it was handed instead of overwriting', () => {
  const config = validateWorkConfig({ levels: [{ name: 'scene', leaf: true }], packs: ['fake'], checkSets: [] }).config;
  const critic = fakePack.checks.find((c) => c.id === 'fake.critic');
  const registry = { checks: [critic, { ...critic, severity: 'block' }], checkSets: {}, defaultCheckSets: [], packs: [fakePack] };
  assert.deepEqual(resolveChecks({ registry, config }).errors.map((e) => [e.code, e.checkId]), [['CHECK_ID_DUPLICATE', 'fake.critic']]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/pack/pack-ids.test.js`
Expected: FAIL — `assertUniqueAcrossPacks` is not exported / 접두어 규칙 없음.

- [ ] **Step 3: `core/pack/validate.js`에 id 규칙 추가**

`export function validatePack` 앞에 더한다:
```js
const PACK_NAME = /^[a-z][a-z0-9-]*$/;
const hasPrefix = (id, prefix) => typeof id === 'string' && id.startsWith(prefix) && id.length > prefix.length;

/** 팩 이름, 검사 id·세트 id 접두어(<팩이름>.), 팩 안 중복, 기본 세트 존재. core. 은 코어 몫이다. */
function idErrors(pack) {
  const errors = [];
  if (typeof pack.name !== 'string' || !PACK_NAME.test(pack.name)) return [{ code: 'PACK_NAME_INVALID', name: pack.name }];
  if (pack.name === 'core') errors.push({ code: 'PACK_NAME_RESERVED', name: pack.name });
  const prefix = `${pack.name}.`;
  const seen = new Set();
  for (const check of pack.checks ?? []) {
    const id = check?.id;
    if (typeof id === 'string' && id.startsWith('core.')) { errors.push({ code: 'PACK_CHECK_ID_RESERVED', checkId: id }); continue; }
    if (!hasPrefix(id, prefix)) errors.push({ code: 'PACK_CHECK_ID_PREFIX', checkId: id, prefix });
    if (seen.has(id)) errors.push({ code: 'PACK_CHECK_ID_DUPLICATE', checkId: id });
    seen.add(id);
  }
  const sets = pack.checkSets ?? {};
  for (const setId of Object.keys(sets)) if (!hasPrefix(setId, prefix)) errors.push({ code: 'PACK_CHECK_SET_ID_PREFIX', set: setId, prefix });
  for (const setId of pack.defaultCheckSets ?? []) if (!Object.hasOwn(sets, setId)) errors.push({ code: 'PACK_DEFAULT_SET_UNKNOWN', set: setId });
  return errors;
}
```

`validatePack`을 이것으로 바꾼다:
```js
/** 팩 하나를 코어 규칙으로 검증한다. 빈 배열이면 유효. 이름이 틀리면 그것만 알린다(접두어를 셀 수 없다). */
export function validatePack(pack) {
  const ids = idErrors(pack);
  if (ids.some((e) => e.code === 'PACK_NAME_INVALID')) return ids;
  return [...ids, ...pipelineErrors(pack)];
}
```

- [ ] **Step 4: `core/pack/registry.js` — 이름·중복·세트 합치기**

파일 전체를 이것으로 바꾼다:
```js
import { FolioError } from '../errors.js';
import { validatePack } from './validate.js';

/** 팩 하나가 코어 규칙에 맞지 않으면 첫 오류 코드로 던진다. 전체 목록은 details.errors. */
function assertValid(pack) {
  const errors = validatePack(pack);
  if (errors.length) throw new FolioError(errors[0].code, `pack ${pack.name}: ${errors.map((e) => e.code).join(', ')}`, { pack: pack.name, errors });
}

/** 팩끼리 검사 id·세트 id 가 겹치면 거부한다. 뒤 팩이 앞 팩의 것을 조용히 덮지 않는다. */
export function assertUniqueAcrossPacks(packs) {
  const owners = { check: new Map(), set: new Map() };
  const claim = (table, id, pack, code, key) => {
    if (table.has(id)) throw new FolioError(code, `${id} is declared by ${table.get(id)} and ${pack}`, { [key]: id, packs: [table.get(id), pack] });
    table.set(id, pack);
  };
  for (const pack of packs) {
    for (const check of pack.checks ?? []) claim(owners.check, check.id, pack.name, 'PACK_CHECK_ID_DUPLICATE', 'checkId');
    for (const id of Object.keys(pack.checkSets ?? {})) claim(owners.set, id, pack.name, 'PACK_CHECK_SET_DUPLICATE', 'set');
  }
}

/**
 * work.yaml 의 packs 순서대로 팩을 모은다. 단계 정의와 프롬프트는 첫 팩(primary)이 준다.
 * 검사·검사 세트·기본 세트는 모든 팩에서 합친다. 모든 팩은 코어 규칙으로 먼저 검증하고, 팩끼리 id 가 겹치면 거부한다.
 */
export function resolvePacks(names, available) {
  if (!names.length) throw new FolioError('PACK_REQUIRED', 'work.yaml must list at least one pack');
  const repeated = names.filter((name, index) => names.indexOf(name) !== index);
  if (repeated.length) throw new FolioError('PACK_DUPLICATE', repeated.join(', '), { packs: repeated });
  const packs = names.map((name) => {
    const pack = available.get(name);
    if (!pack) throw new FolioError('PACK_UNKNOWN', name);
    if (pack.name !== name) throw new FolioError('PACK_NAME_MISMATCH', `${name} is registered with a pack named ${pack.name}`, { name, packName: pack.name });
    return pack;
  });
  for (const pack of packs) assertValid(pack);
  if (!packs[0].pipelines) throw new FolioError('PACK_PIPELINE_MISSING', `${packs[0].name} brings no pipelines and cannot be the first pack`, { pack: packs[0].name });
  assertUniqueAcrossPacks(packs);
  const checkSets = {};
  for (const pack of packs) for (const [id, set] of Object.entries(pack.checkSets ?? {})) checkSets[id] = set;
  return {
    primary: packs[0],
    packs,
    checks: packs.flatMap((pack) => (pack.checks ?? []).map((check) => ({ ...check, origin: 'pack' }))),
    checkSets,
    // work.yaml 에 checkSets 키가 없을 때 쓰는 기본 세트(팩 순서대로, 중복 없이).
    defaultCheckSets: [...new Set(packs.flatMap((pack) => pack.defaultCheckSets ?? []))],
  };
}
```

- [ ] **Step 5: `core/checks/check-set.js` — 조용한 덮어쓰기 대신 오류**

`resolveChecks` 첫 두 줄
```js
  const known = new Map([...registry.checks, ...BUILTIN_CHECKS].map((check) => [check.id, check]));
  const { sets, errors } = allCheckSets(registry, config);
```
을 이것으로 바꾼다:
```js
  // 받은 레지스트리에 같은 id 가 둘이면 덮지 않고 알린다(resolvePacks 를 거친 레지스트리에서는 생기지 않는다).
  const known = new Map();
  const duplicates = [];
  for (const check of registry.checks) {
    if (known.has(check.id)) duplicates.push({ code: 'CHECK_ID_DUPLICATE', checkId: check.id });
    else known.set(check.id, check);
  }
  for (const check of BUILTIN_CHECKS) known.set(check.id, check);
  const { sets, errors } = allCheckSets(registry, config);
  errors.push(...duplicates);
```

- [ ] **Step 6: 기존 테스트 하나를 접두어 규칙에 맞춘다**

`test/run/check-set.test.js`의 `'a set naming a missing check is reported'` 테스트는 접두어 없는 세트 id `broken`을 쓴다. 이제 그 팩은 `PACK_CHECK_SET_ID_PREFIX`로 먼저 거부되므로 세트 id만 `fake.broken`으로 바꾸고(기본 세트도 비운다) assert는 그대로 둔다:
```js
test('a set naming a missing check is reported', () => {
  const pack = { ...fakePack, checkSets: { 'fake.broken': { checks: ['nope'] } }, defaultCheckSets: [] };
  const cfg = config({ checkSets: ['fake.broken'] });
  assert.deepEqual(resolveChecks({ registry: resolvePacks(['fake'], new Map([['fake', pack]])), config: cfg }).errors.map((e) => e.code), ['CHECK_UNKNOWN']);
});
```

- [ ] **Step 7: 통과 확인**

Run: `node --test test/pack/pack-ids.test.js test/run/check-set.test.js`
Expected: PASS

- [ ] **Step 8: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add core/pack/validate.js core/pack/registry.js core/checks/check-set.js test/pack/pack-ids.test.js test/run/check-set.test.js
git commit -m "$(cat <<'EOF'
feat(core): require pack-prefixed check ids and refuse duplicate ids across packs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task A3: 팩 내용 digest를 파이프라인 digest에

**Files:**
- Create: `core/pack/digest.js`
- Modify: `core/pack/registry.js` (`digest` 필드)
- Modify: `core/pipeline/define.js` (`pipelineDigest(steps, packDigest)`, `resolvePipeline(base, overrides, { packDigest })`)
- Modify: `core/pipeline/resolve.js` (`packDigest` 전달)
- Modify: `core/run/workspace.js` (`registry.digest` 전달)
- Modify: `core/run/commit-locks.js:27`, `core/run/recheck-commit.js:10` (다시 계산할 때 `pipeline.packDigest`)
- Test: `test/pack/pack-digest.test.js`

**Interfaces:**
- Produces:
  - `packDigest(pack): string` — `pack.digest`가 `sha256:<64hex>`이면 그 값(파일 팩 로더가 채움), 아니면 팩 내용 투영(함수는 소스 글자)의 sha256.
  - `registryDigest(packs): string` — `[{name, digest}]`의 sha256. `resolvePacks(...).digest`.
  - `pipelineDigest(steps, packDigest = null)` — packDigest가 있으면 `{ packs: packDigest, steps }`를 묶는다. 없으면 예전 값 그대로(기존 테스트 호환).
  - `resolvePipeline(base, overrides = {}, { packDigest = null } = {})` → `{ steps, errors, matched, digest, packDigest }`.
  - `resolvePipelines({ ..., packDigest = null })`.
  - `assertPipelineMatch`, `recordRecheck`: `pipelineDigest(pipeline.steps, pipeline.packDigest ?? null)`로 다시 계산.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/pack/pack-digest.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packDigest, registryDigest } from '../../core/pack/digest.js';
import { resolvePipeline, pipelineDigest } from '../../core/pipeline/define.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { commitNode } from '../../core/run/commit.js';
import { createRunner } from '../../core/run/runner.js';
import { sha256 } from '../../core/util/hash.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { makeReceipt, recordDecisions } from '../support/receipts.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const reprompted = () => new Map([['fake', { ...fakePack, prompt: (step, payload) => ({ ...payload, instructions: 'v2' }) }]]);

test('the pack digest changes with any pack content, including checker source', () => {
  const base = packDigest(fakePack);
  assert.match(base, /^sha256:[0-9a-f]{64}$/);
  assert.equal(packDigest({ ...fakePack }), base);
  const reworded = { ...fakePack, checks: fakePack.checks.map((c) => (c.id === 'fake.critic' ? { ...c, instruction: 'Review harder.' } : c)) };
  assert.notEqual(packDigest(reworded), base);
  const recoded = { ...fakePack, checks: fakePack.checks.map((c) => (c.id === 'fake.dead-on-stage' ? { ...c, run: () => [] } : c)) };
  assert.notEqual(packDigest(recoded), base);
  const declared = { ...fakePack, digest: `sha256:${'a'.repeat(64)}` };
  assert.equal(packDigest(declared), declared.digest);
  assert.notEqual(registryDigest([fakePack]), registryDigest([reworded]));
});

test('the pipeline digest carries the pack digest', () => {
  const plain = resolvePipeline(fakePack.pipelines.leaf, {});
  const withPack = resolvePipeline(fakePack.pipelines.leaf, {}, { packDigest: packDigest(fakePack) });
  assert.equal(plain.digest, pipelineDigest(plain.steps));
  assert.notEqual(withPack.digest, plain.digest);
  assert.equal(withPack.digest, pipelineDigest(withPack.steps, withPack.packDigest));
  assert.notEqual(resolvePipeline(fakePack.pipelines.leaf, {}, { packDigest: sha256('other') }).digest, withPack.digest);
});

test('a receipt made under another pack content does not commit', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const before = await openWorkspace(root, { packs: fakePacks() });
  const after = await openWorkspace(root, { packs: reprompted() });
  assert.equal(before.registry.digest, registryDigest([fakePack]));
  assert.equal(before.pipelines.leaf.packDigest, before.registry.digest);
  assert.notEqual(after.pipelines.leaf.digest, before.pipelines.leaf.digest);
  const ledgers = { receipts: openLedger(root, 'receipts'), events: openLedger(root, 'events'), decisions: openLedger(root, 'decisions') };
  const text = '검사한 원고';
  const receipt = makeReceipt({ nodeId: 'stairwell', text, pipeline: before.pipelines.leaf });
  await recordDecisions(ledgers.decisions, receipt);
  await assert.rejects(commitNode({ root, work: after.work, ledgers, pipeline: after.pipelines.leaf, receipt, text }), { code: 'LOCK_PIPELINE_MISMATCH' });
  await commitNode({ root, work: before.work, ledgers, pipeline: before.pipelines.leaf, receipt, text });
});

test('an open run re-checks when the pack content changes under it', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const gate = (await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost(), {
    start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user',
  })).at(-1);
  const next = await createRunner({ root, packs: reprompted() }).decide({ runId: gate.runId, action: 'approve' });
  assert.equal(label(next), 'model:extract');
  assert.equal(next.requests[0].payload.instructions, 'v2');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/pack/pack-digest.test.js`
Expected: FAIL — `Cannot find module '../../core/pack/digest.js'`

- [ ] **Step 3: `core/pack/digest.js` 작성**

```js
import { canonicalJson, sha256 } from '../util/hash.js';

const HASH = /^sha256:[0-9a-f]{64}$/;

/** 함수(결정론 검사기·prompt)는 소스 글자로 묶는다. 나머지는 그대로. */
function project(value) {
  if (typeof value === 'function') return `fn:${value.toString()}`;
  if (Array.isArray(value)) return value.map(project);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, project(item)]));
  return value;
}

/**
 * 팩 내용 digest. 파일 팩은 로더가 파일 내용으로 만든 pack.digest 를 쓴다.
 * 코드로 만든 팩(테스트 fake 등)은 내용 전체(단계·검사·세트·프롬프트·검사기 소스)를 묶는다.
 */
export function packDigest(pack) {
  if (typeof pack?.digest === 'string' && HASH.test(pack.digest)) return pack.digest;
  const { digest: _declared, ...rest } = pack ?? {};
  return sha256(canonicalJson(project(rest)));
}

/** 작품이 쓰는 팩 전체의 digest(순서 포함). 파이프라인 digest 에 들어간다. */
export const registryDigest = (packs) => sha256(canonicalJson(packs.map((pack) => ({ name: pack.name, digest: packDigest(pack) }))));
```

- [ ] **Step 4: `core/pack/registry.js`에 `digest`**

import에 `import { registryDigest } from './digest.js';`를 더하고, `resolvePacks`가 돌려주는 객체 마지막에 한 줄을 더한다:
```js
    defaultCheckSets: [...new Set(packs.flatMap((pack) => pack.defaultCheckSets ?? []))],
    // 팩 내용이 바뀌면 파이프라인 digest 가 바뀐다(열린 실행은 검사부터 다시, 옛 영수증은 커밋 못 함).
    digest: registryDigest(packs),
  };
```

- [ ] **Step 5: `core/pipeline/define.js` — digest에 팩 digest**

`pipelineDigest`와 `resolvePipeline`을 이것으로 바꾼다:
```js
/**
 * 파이프라인의 정본 다이제스트. commitNode 가 받은 pipeline.steps 로 다시 계산해 조작을 막는다.
 * packDigest(팩 내용)가 있으면 함께 묶는다 — 팩 파일(프롬프트·검사 글·검사기)이 바뀌면 다른 파이프라인이다.
 */
export function pipelineDigest(steps, packDigest = null) {
  const projected = steps.map(({ id, kind, tier, stage, produces, mode, locked, loop, requires, prompt }) => ({ id, kind, tier, stage, produces, mode, locked, loop, requires, prompt }));
  return sha256(canonicalJson(packDigest ? { packs: packDigest, steps: projected } : projected));
}

/** 팩 기본 단계 + work.yaml overrides. 잠금 단계는 어떤 필드도 바꿀 수 없다. */
export function resolvePipeline(base, overrides = {}, { packDigest = null } = {}) {
  const errors = [];
  const steps = base.map((step) => ({ mode: 'on', ...structuredClone(step), requires: [...(step.requires ?? [])] }));
  markLocked(steps);
  const lockedOrder = steps.filter((s) => s.locked).map((s) => s.id);
  const matched = new Set();
  for (const [id, patch] of Object.entries(overrides)) {
    const step = steps.find((s) => s.id === id);
    if (step) { matched.add(id); applyPatch(steps, step, patch, errors); continue; }
    if (patch?.kind && patch?.after && steps.some((s) => s.id === patch.after)) { matched.add(id); addCustom(steps, id, patch, errors); }
  }
  checkInvariants(steps, lockedOrder, errors);
  const digest = pipelineDigest(steps, packDigest);
  return { steps, errors, matched, digest, packDigest };
}
```

- [ ] **Step 6: `core/pipeline/resolve.js` — `packDigest` 전달**

`resolvePipelines`의 머리 세 줄을 바꾼다:
```js
export function resolvePipelines({ primary, overrides, checks, includeAllHardChecks = false, packDigest = null }) {
  const leaf = resolvePipeline(primary.pipelines.leaf, overrides, { packDigest });
  const branch = resolvePipeline(primary.pipelines.branch, overrides, { packDigest });
```

- [ ] **Step 7: `core/run/workspace.js` — 레지스트리 digest 전달**

`resolvePipelines({...})` 호출을 바꾼다:
```js
  const pipelines = resolvePipelines({
    primary: registry.primary, overrides: work.config.overrides, checks: resolved.checks,
    includeAllHardChecks: work.config.options.includeAllHardChecks, packDigest: registry.digest,
  });
```

- [ ] **Step 8: 커밋·재검사 잠금이 같은 식으로 다시 계산**

`core/run/commit-locks.js` `assertPipelineMatch` 첫 줄:
```js
  const digest = pipelineDigest(pipeline.steps, pipeline.packDigest ?? null);
```
`core/run/recheck-commit.js` `assertCheckSteps` 첫 조건:
```js
  if (pipelineDigest(pipeline.steps, pipeline.packDigest ?? null) !== pipeline.digest || record.pipelineDigest !== pipeline.digest) {
```
두 파일의 JSDoc `pipeline: { steps: object[], digest: string }`를 `pipeline: { steps: object[], digest: string, packDigest?: string|null }`로 고친다(`commit.js`의 `commitNode` JSDoc도 같이).

- [ ] **Step 9: 통과 확인**

Run: `node --test test/pack/pack-digest.test.js`
Expected: PASS (4 tests)

- [ ] **Step 10: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS. (기존 테스트는 영수증과 커밋에 같은 `pipeline`을 쓰므로 digest 값이 바뀌어도 그대로 통과한다.)

```bash
git add core/pack/digest.js core/pack/registry.js core/pipeline/define.js core/pipeline/resolve.js core/run/workspace.js core/run/commit-locks.js core/run/recheck-commit.js core/run/commit.js test/pack/pack-digest.test.js
git commit -m "$(cat <<'EOF'
feat(core): fold the pack content digest into the pipeline digest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part B — 레벨별 단계 설정

### Task B1: `overrides.levels`로 레벨마다 파이프라인 풀기

**Files:**
- Create: `core/pipeline/levels.js`
- Modify: `core/pipeline/resolve.js` (전체 교체)
- Modify: `core/run/workspace.js` (byLevel digest·적용 검사)
- Test: `test/run/pipeline-levels.test.js`

**Interfaces:**
- Consumes: Task A3 `resolvePipeline(base, overrides, { packDigest })`.
- Produces:
  - `splitOverrides(overrides, levelNames): { global, perLevel, errors }` — 오류 `OVERRIDE_LEVELS_INVALID`, `OVERRIDE_LEVEL_UNKNOWN`(`level`).
  - `mergeOverrides(global, levelPatches): object` — 같은 단계는 필드 단위로 합친다(레벨이 이긴다). `__proto__` 키도 자기 속성으로 남는다(`Object.fromEntries`).
  - `resolvePipelines({ primary, overrides, checks, levels = [], includeAllHardChecks = false, packDigest = null })` → `{ leaf, branch, byLevel: Record<levelName, pipeline>, errors }`. 레벨 덮어쓰기가 없는 레벨은 그 종류의 전체 파이프라인 객체를 그대로 공유한다. 레벨 파이프라인 오류에는 `level`이 붙는다. 서로 다른 레벨이 같은 id로 모양이 다른 새 단계를 만들면 `CUSTOM_STEP_CONFLICT`.
  - `customStepChecks({ leaf, branch, byLevel? })` — 모든 파이프라인의 새 검사 단계를 본다.
  - `openWorkspace(...)` → `pipelines: { leaf, branch, byLevel }`, `checksDigest: { leaf, branch, byLevel }`, `applied: { leaf, branch, byLevel }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/run/pipeline-levels.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePipelines, customStepChecks } from '../../core/pipeline/resolve.js';
import { mergeOverrides, splitOverrides } from '../../core/pipeline/levels.js';
import { BUILTIN_CHECKS } from '../../core/checks/builtin.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { parseYaml } from '../../core/util/yaml.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';

const levels = validateWorkConfig({ levels: [{ name: 'book' }, { name: 'chapter' }, { name: 'scene', leaf: true }], packs: ['fake'] }).config.levels;
const resolve = (overrides, extra = {}) => resolvePipelines({ primary: fakePack, overrides, checks: [...BUILTIN_CHECKS, ...fakePack.checks], levels, ...extra });
const codes = (overrides) => resolve(overrides).errors.map((e) => [e.code, e.level ?? null]);
const step = (pipeline, id) => pipeline.steps.find((s) => s.id === id);

test('without level overrides every level shares its kind pipeline', () => {
  const r = resolve({ critic: { mode: 'off' } });
  assert.deepEqual(r.errors, []);
  assert.equal(r.byLevel.scene, r.leaf);
  assert.equal(r.byLevel.book, r.branch);
  assert.equal(r.byLevel.chapter, r.branch);
});

test('a level override sits on top of the global overrides for that level only', () => {
  const r = resolve({ critic: { mode: 'off', reason: '속도' }, levels: { book: { approve: { mode: 'auto' } }, scene: { critic: { mode: 'on' } } } });
  assert.deepEqual(r.errors, []);
  assert.equal(step(r.byLevel.book, 'approve').mode, 'auto');
  assert.equal(step(r.byLevel.chapter, 'approve').mode, 'on');
  assert.equal(r.byLevel.chapter, r.branch);
  assert.equal(step(r.leaf, 'critic').mode, 'off');
  assert.equal(step(r.byLevel.scene, 'critic').mode, 'on');
  assert.notEqual(r.byLevel.book.digest, r.byLevel.chapter.digest);
  assert.notEqual(r.byLevel.scene.digest, r.leaf.digest);
});

test('a level can add its own custom check step; the step brings its advisory check once', () => {
  const r = resolve({ levels: { chapter: { tone: { after: 'fit', kind: 'check', tier: 'model', prompt: 'checks/tone.md' } } } });
  assert.deepEqual(r.errors, []);
  assert.ok(step(r.byLevel.chapter, 'tone'));
  assert.equal(step(r.byLevel.book, 'tone'), undefined);
  assert.deepEqual(customStepChecks(r).map((c) => [c.id, c.stage]), [['tone', 'tone']]);
  const clash = resolve({ levels: {
    book: { tone: { after: 'fit', kind: 'check', tier: 'model', prompt: 'checks/a.md' } },
    chapter: { tone: { after: 'fit', kind: 'check', tier: 'model', prompt: 'checks/b.md' } },
  } });
  assert.deepEqual(clash.errors.map((e) => e.code), ['CUSTOM_STEP_CONFLICT']);
});

test('lock rules are the same at every level', () => {
  assert.deepEqual(codes({ levels: { scene: { facts: { mode: 'off' } } } }), [['LOCKED_STEP_OVERRIDE', 'scene']]);
  assert.deepEqual(codes({ levels: { book: { commit: { mode: 'off' } } } }), [['LOCKED_STEP_OVERRIDE', 'book']]);
  assert.deepEqual(codes({ levels: { scene: { extract: { after: 'critic' } } } }), [['LOCKED_STEP_OVERRIDE', 'scene']]);
});

test('unknown levels, bad shapes and stray steps are reported with their level', () => {
  assert.deepEqual(codes({ levels: { volume: { approve: { mode: 'auto' } } } }), [['OVERRIDE_LEVEL_UNKNOWN', 'volume']]);
  assert.deepEqual(codes({ levels: [] }), [['OVERRIDE_LEVELS_INVALID', null]]);
  assert.deepEqual(codes({ levels: { book: 'auto' } }), [['OVERRIDE_LEVELS_INVALID', 'book']]);
  assert.deepEqual(codes({ levels: { book: { ghost: { mode: 'off' } } } }), [['STEP_UNKNOWN', 'book']]);
  assert.deepEqual(codes({ levels: { scene: { fit: { mode: 'off' } } } }), [['STEP_UNKNOWN', 'scene']]);
});

test('includeAllHardChecks also forbids switching off a hard check step at one level', () => {
  const hard = { id: 'fake.hard-critic', tier: 'model', stage: 'critic', severity: 'hard' };
  const r = resolvePipelines({ primary: fakePack, overrides: { levels: { scene: { critic: { mode: 'off', reason: 'r' } } } }, checks: [hard], levels, includeAllHardChecks: true });
  assert.deepEqual(r.errors.map((e) => [e.code, e.stepId]), [['HARD_CHECK_OVERRIDE', 'critic']]);
});

test('splitting and merging keep __proto__ keys as plain data', () => {
  const overrides = parseYaml('levels:\n  book:\n    __proto__:\n      mode: off\n');
  const split = splitOverrides(overrides, ['book']);
  assert.deepEqual(split.errors, []);
  const merged = mergeOverrides(split.global, split.perLevel.book);
  assert.ok(Object.prototype.hasOwnProperty.call(merged, '__proto__'));
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
});

test('the workspace keeps pipelines, check digests and applied checks per level', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { levels: { book: { approve: { mode: 'auto' } } } } });
  const ws = await openWorkspace(root, { packs: fakePacks() });
  assert.deepEqual(Object.keys(ws.pipelines.byLevel), ['book', 'chapter', 'scene']);
  assert.notEqual(ws.pipelines.byLevel.book.digest, ws.pipelines.byLevel.chapter.digest);
  assert.equal(ws.pipelines.byLevel.chapter, ws.pipelines.branch);
  assert.equal(ws.checksDigest.byLevel.scene, ws.checksDigest.leaf);
  assert.deepEqual(ws.applied.byLevel.scene, ws.applied.leaf);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/run/pipeline-levels.test.js`
Expected: FAIL — `Cannot find module '../../core/pipeline/levels.js'`

- [ ] **Step 3: `core/pipeline/levels.js` 작성**

```js
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * work.yaml overrides 를 전체 덮어쓰기와 레벨별 덮어쓰기로 나눈다.
 * overrides.levels.<레벨>.<단계>: patch — 그 레벨의 노드에만, 전체 덮어쓰기 위에 얹힌다.
 * @param {Record<string, any>} overrides
 * @param {string[]} levelNames
 */
export function splitOverrides(overrides = {}, levelNames = []) {
  const { levels, ...global } = overrides ?? {};
  const errors = [];
  /** @type {Record<string, Record<string, any>>} */
  const perLevel = {};
  if (levels !== undefined) {
    if (!isPlainObject(levels)) errors.push({ code: 'OVERRIDE_LEVELS_INVALID' });
    else {
      for (const [name, patches] of Object.entries(levels)) {
        if (!levelNames.includes(name)) { errors.push({ code: 'OVERRIDE_LEVEL_UNKNOWN', level: name }); continue; }
        if (!isPlainObject(patches)) { errors.push({ code: 'OVERRIDE_LEVELS_INVALID', level: name }); continue; }
        perLevel[name] = patches;
      }
    }
  }
  return { global, perLevel, errors };
}

/** 같은 단계에 전체·레벨 덮어쓰기가 둘 다 있으면 필드 단위로 합친다(레벨이 이긴다). 키는 데이터로만 다룬다. */
export function mergeOverrides(global, levelPatches = {}) {
  const merged = new Map(Object.entries(global));
  for (const [id, patch] of Object.entries(levelPatches)) {
    const base = merged.get(id);
    merged.set(id, isPlainObject(base) && isPlainObject(patch) ? { ...base, ...patch } : patch);
  }
  return Object.fromEntries(merged);
}
```

- [ ] **Step 4: `core/pipeline/resolve.js` 전체 교체**

```js
import { canonicalJson } from '../util/hash.js';
import { resolvePipeline } from './define.js';
import { mergeOverrides, splitOverrides } from './levels.js';

const stageOf = (step) => step.stage ?? step.id;
const unique = (pipelines) => [...new Set(pipelines.filter(Boolean))];

function dedupe(errors) {
  const seen = new Set();
  return errors.filter((error) => { const key = canonicalJson(error); if (seen.has(key)) return false; seen.add(key); return true; });
}

const strays = (patches, result, extra = {}) => Object.entries(patches)
  .filter(([id]) => !result.matched.has(id))
  .map(([id, patch]) => ({ code: patch?.kind ? 'STEP_AFTER_UNKNOWN' : 'STEP_UNKNOWN', stepId: id, ...extra }));

/**
 * 레벨마다 파이프라인. 레벨 덮어쓰기가 없으면 그 종류(leaf/branch)의 전체 파이프라인 객체를 그대로 쓴다.
 * 레벨 파이프라인의 오류는 그 레벨 덮어쓰기가 건드린 단계(또는 단계 없는 불변식 오류)만 level 을 붙여 알린다.
 */
function levelPipelines({ primary, levels, split, kinds, packDigest, errors }) {
  const byLevel = {};
  for (const level of levels) {
    const kind = level.leaf ? 'leaf' : 'branch';
    const patches = split.perLevel[level.name];
    if (!patches) { byLevel[level.name] = kinds[kind]; continue; }
    const result = resolvePipeline(primary.pipelines[kind], mergeOverrides(split.global, patches), { packDigest });
    const own = result.errors.filter((e) => e.stepId === undefined || Object.hasOwn(patches, e.stepId));
    errors.push(...own.map((e) => ({ ...e, level: level.name })), ...strays(patches, result, { level: level.name }));
    byLevel[level.name] = result;
  }
  return byLevel;
}

/** 같은 id 의 새 단계는 어느 레벨에서든 모양(종류·tier·prompt)이 같아야 한다 — 검사 id 가 단계 id 라서다. */
function customConflicts(pipelines, errors) {
  const seen = new Map();
  for (const step of pipelines.flatMap((p) => p.steps).filter((s) => s.custom)) {
    const shape = canonicalJson({ kind: step.kind, tier: step.tier ?? null, prompt: step.prompt ?? null });
    if (seen.has(step.id) && seen.get(step.id) !== shape) errors.push({ code: 'CUSTOM_STEP_CONFLICT', stepId: step.id });
    seen.set(step.id, shape);
  }
}

/** 모든 검사가 들어갈 단계가 있는지, 잠긴 검사는 맨 아래 칸의 모든 파이프라인에서 잠긴 단계에 있는지 본다. */
function checkPlacement({ checks, all, leafish, includeAllHardChecks, errors }) {
  const checkSteps = all.flatMap((p) => p.steps).filter((s) => s.kind === 'check');
  for (const check of checks) {
    const homes = checkSteps.filter((s) => stageOf(s) === check.stage);
    if (!homes.length) errors.push({ code: 'CHECK_STAGE_MISSING', checkId: check.id, stage: check.stage });
    else if (homes.some((s) => s.tier !== check.tier)) errors.push({ code: 'CHECK_TIER_MISMATCH', checkId: check.id, stage: check.stage });
    if (includeAllHardChecks && check.severity === 'hard') {
      for (const step of homes.filter((s) => s.mode === 'off')) errors.push({ code: 'HARD_CHECK_OVERRIDE', checkId: check.id, stepId: step.id });
    }
    if (check.locked && !leafish.every((p) => p.steps.some((s) => s.kind === 'check' && s.locked && stageOf(s) === check.stage))) {
      errors.push({ code: 'LOCKED_CHECK_UNGUARDED', checkId: check.id });
    }
  }
}

/**
 * leaf/branch 파이프라인(전체 덮어쓰기)과 레벨별 파이프라인(전체 + overrides.levels.<레벨>)을 만든다.
 * hard 검사가 든 단계를 끄는 것은 사용자의 선택이다. 다만 includeAllHardChecks 를 켠 작품에서는 어느 레벨에서든 거부한다(HARD_CHECK_OVERRIDE).
 * 잠금 단계는 어느 레벨에서도 끌 수 없다(LOCKED_STEP_OVERRIDE).
 */
export function resolvePipelines({ primary, overrides, checks, levels = [], includeAllHardChecks = false, packDigest = null }) {
  const split = splitOverrides(overrides, levels.map((l) => l.name));
  const errors = [...split.errors];
  const leaf = resolvePipeline(primary.pipelines.leaf, split.global, { packDigest });
  const branch = resolvePipeline(primary.pipelines.branch, split.global, { packDigest });
  errors.push(...leaf.errors, ...branch.errors);
  for (const [id, patch] of Object.entries(split.global)) {
    if (!leaf.matched.has(id) && !branch.matched.has(id)) errors.push({ code: patch?.kind ? 'STEP_AFTER_UNKNOWN' : 'STEP_UNKNOWN', stepId: id });
  }
  const byLevel = levelPipelines({ primary, levels, split, kinds: { leaf, branch }, packDigest, errors });
  const all = unique([leaf, branch, ...Object.values(byLevel)]);
  const leafish = unique([leaf, ...levels.filter((l) => l.leaf).map((l) => byLevel[l.name])]);
  customConflicts(all, errors);
  checkPlacement({ checks, all, leafish, includeAllHardChecks, errors });
  return { leaf, branch, byLevel, errors: dedupe(errors) };
}

/** work.yaml 로 추가한 검사 단계(prompt 파일 지정)는 같은 이름의 참고 의견 검사를 하나 갖는다. 모든 레벨을 본다. */
export function customStepChecks({ leaf, branch, byLevel = {} }) {
  const seen = new Set();
  const checks = [];
  for (const step of unique([leaf, branch, ...Object.values(byLevel)]).flatMap((p) => p.steps)) {
    if (!step.custom || step.kind !== 'check' || !step.prompt || seen.has(step.id)) continue;
    seen.add(step.id);
    checks.push({
      id: step.id, tier: step.tier, stage: step.id, severity: 'advisory', experimental: true, origin: 'user',
      requireQuote: step.tier === 'model', instruction: null, instructionSource: step.prompt,
      ...(step.tier === 'deterministic' ? { run: () => [] } : {}),
    });
  }
  return checks;
}
```

- [ ] **Step 5: `core/run/workspace.js` — 레벨마다 digest·적용 검사**

`openWorkspace`를 이것으로 바꾼다(`checksDigest` 함수는 그대로 둔다):
```js
/** 작품 + 팩 + 검사 + 단계(레벨별 포함). 잠금 덮어쓰기를 포함한 설정 오류는 여기서 전부 거부된다. */
export async function openWorkspace(root, { packs }) {
  const work = await openWork(root);
  const registry = resolvePacks(work.config.packs, packs);
  const resolved = resolveChecks({ registry, config: work.config });
  const pipelines = resolvePipelines({
    primary: registry.primary, overrides: work.config.overrides, checks: resolved.checks, levels: work.config.levels,
    includeAllHardChecks: work.config.options.includeAllHardChecks, packDigest: registry.digest,
  });
  const errors = [...resolved.errors, ...pipelines.errors];
  const loaded = await loadCheckSources(root, [...resolved.checks, ...customStepChecks(pipelines)]);
  errors.push(...loaded.errors);
  const { checks } = loaded;
  if (errors.length) throw new FolioError('CONFIG_INVALID', errors.map((e) => e.code).join(', '), { errors });
  /** leaf·branch(전체 덮어쓰기)와 레벨마다 같은 계산. */
  const each = (fn) => ({
    leaf: fn(pipelines.leaf), branch: fn(pipelines.branch),
    byLevel: Object.fromEntries(Object.entries(pipelines.byLevel).map(([level, pipeline]) => [level, fn(pipeline)])),
  });
  return {
    work, registry, checks, pipelines: { leaf: pipelines.leaf, branch: pipelines.branch, byLevel: pipelines.byLevel },
    checksDigest: each((pipeline) => checksDigest(checks, pipeline)),
    applied: each((pipeline) => appliedChecks(checks, pipeline)),
  };
}
```

- [ ] **Step 6: 통과 확인**

Run: `node --test test/run/pipeline-levels.test.js test/run/pipeline.test.js`
Expected: PASS (새 8개 + 기존 pipeline 테스트 전부)

- [ ] **Step 7: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS. (실행기는 아직 `pipelines.leaf/branch`를 쓰므로 동작은 그대로다.)

```bash
git add core/pipeline/levels.js core/pipeline/resolve.js core/run/workspace.js test/run/pipeline-levels.test.js
git commit -m "$(cat <<'EOF'
feat(core): resolve a pipeline per level from overrides.levels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task B2: 실행기·재검사·다시 확인 필요가 레벨 파이프라인을 따른다

**Files:**
- Create: `core/run/level-pipeline.js`
- Modify: `core/run/runner.js` (drive, newRun, decide)
- Modify: `core/run/sync.js` (전체 교체)
- Modify: `core/run/recheck-plan.js` (`newRecheckRun`)
- Modify: `core/scope/stale.js:34` (레벨 적용 검사)
- Modify: `core/checks/user-check-draft.js` (`stagesByTier`가 byLevel도)
- Test: `test/run/level-overrides.test.js`

**Interfaces:**
- Consumes: Task B1 `ctx.pipelines.byLevel`, `ctx.checksDigest.byLevel`, `ctx.applied.byLevel`.
- Produces:
  - `levelOf(ctx, run)` — `run.level`(새 실행 파일) 또는 노드 레벨(옛 실행 파일).
  - `pipelineFor(ctx, run)` — 레벨 파이프라인. 없으면 `ctx.pipelines[run.nodeKind]`, 그래도 없으면 `LEVEL_UNKNOWN`.
  - `checksDigestFor(ctx, run)`.
  - `checkPlanFor(ctx, pipeline)` — **인자가 nodeKind에서 pipeline으로 바뀐다.**
  - 새 실행 파일에 `level` 필드.
  - `findStale({ applied })`는 `applied.byLevel[node.level]`을 먼저 본다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/run/level-overrides.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { addNode } from '../../core/structure/ops.js';
import { createRunner } from '../../core/run/runner.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { workStatus } from '../../core/status.js';
import { stagesByTier } from '../../core/checks/user-check-draft.js';
import { copyFixture, emptyTreeCopy, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { editYaml, rechecksOf } from '../support/recheck.js';

const receiptsOf = async (root) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt');
const untilUser = (o) => o.status === 'needs_user';

test('a book plan is auto-approved by a level override while chapter and scene plans still ask the author', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root, { overrides: { levels: { book: { approve: { mode: 'auto' } } } } });
  await addNode(root, await openWork(root), { level: 'book', id: 'b1', title: '1권' });
  const host = createFakeHost({ children: { b1: [{ id: 'b1-c1', title: '가' }], 'b1-c1': [{ id: 'b1-c1-s1' }] } });
  const asked = [];
  const trail = await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, {
    user: (o) => { asked.push(`${o.nodeId}:${o.question.kind}`); return { action: 'approve' }; },
  });
  assert.equal(trail.at(-1).status, 'idle');
  assert.deepEqual(asked, ['b1-c1:approve', 'b1-c1-s1:approve']);
  const ws = await openWorkspace(root, { packs: fakePacks() });
  const receipts = await receiptsOf(root);
  const digestOf = (id) => receipts.find((r) => r.nodeId === id).pipelineDigest;
  assert.equal(digestOf('b1'), ws.pipelines.byLevel.book.digest);
  assert.equal(digestOf('b1-c1'), ws.pipelines.byLevel.chapter.digest);
  assert.equal(digestOf('b1-c1-s1'), ws.pipelines.byLevel.scene.digest);
  assert.equal(receipts.find((r) => r.nodeId === 'b1').steps.find((s) => s.id === 'approve').status, 'auto');
});

test('changing one level override re-plans only the runs at that level', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const mk = () => createRunner({ root, packs: fakePacks() });
  const gate = (await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: untilUser })).at(-1);
  await editYaml(root, (c) => { c.overrides = { levels: { chapter: { approve: { mode: 'auto' } } } }; });
  assert.equal((await mk().decide({ runId: gate.runId, action: 'approve' })).status, 'done', 'a chapter-only change leaves the scene run in sync');
  const gate2 = (await driveToEnd(mk, createFakeHost(), { start: { node: 'market' }, until: untilUser })).at(-1);
  await editYaml(root, (c) => { c.overrides = { levels: { chapter: { approve: { mode: 'auto' } }, scene: { critic: { mode: 'off', reason: '속도' } } } }; });
  assert.equal(label(await mk().decide({ runId: gate2.runId, action: 'approve' })), 'model:extract');
});

test('a level override cannot switch off a locked step: the work does not open', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { levels: { scene: { facts: { mode: 'off' } } } } });
  await assert.rejects(createRunner({ root, packs: fakePacks() }).run({ node: 'stairwell' }),
    (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'LOCKED_STEP_OVERRIDE' && x.level === 'scene'));
});

test('backfill and recheck runs follow the level pipeline', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' }, levels: { scene: { critic: { mode: 'off', reason: '속도' } } } } });
  const mk = () => createRunner({ root, packs: fakePacks() });
  await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell' }, until: (o) => o.status === 'done' });
  const receipt = (await receiptsOf(root)).at(-1);
  assert.equal(receipt.steps.find((s) => s.id === 'critic').status, 'skipped');
  const status = () => workStatus(root, { packs: fakePacks() });
  assert.deepEqual((await status()).recheck, []);
  await editYaml(root, (c) => { c.overrides = { approve: { mode: 'auto' } }; });
  assert.deepEqual((await status()).recheck, [{ nodeId: 'stairwell', checks: ['fake.critic'] }]);
  const done = (await driveToEnd(mk, createFakeHost(), { start: { node: 'stairwell', mode: 'recheck' }, until: (o) => o.status === 'done' })).at(-1);
  assert.equal(done.mode, 'recheck');
  assert.equal((await rechecksOf(root)).at(-1).pipelineDigest, (await openWorkspace(root, { packs: fakePacks() })).pipelines.byLevel.scene.digest);
  assert.deepEqual((await status()).recheck, []);
});

test('user check stages come from every level pipeline', () => {
  const stages = stagesByTier({
    leaf: { steps: [{ kind: 'check', tier: 'model', stage: 'critic' }] }, branch: { steps: [] },
    byLevel: { chapter: { steps: [{ kind: 'check', tier: 'model', id: 'tone' }] } },
  });
  assert.deepEqual(stages.model, ['critic', 'tone']);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/run/level-overrides.test.js`
Expected: FAIL — 첫 테스트에서 `asked`에 `b1:approve`가 들어간다(실행기가 아직 레벨 파이프라인을 모름), 마지막 테스트는 `['critic']`.

- [ ] **Step 3: `core/run/level-pipeline.js` 작성**

```js
import { FolioError } from '../errors.js';

/** 실행이 도는 노드의 레벨. 새 실행 파일은 level 을 갖고, 옛 실행 파일은 노드에서 읽는다. */
export const levelOf = (ctx, run) => run.level ?? ctx.work.tree.nodes.get(run.nodeId)?.level ?? null;

/** 이 실행이 따르는 파이프라인: 노드 레벨의 것(레벨 덮어쓰기 반영). */
export function pipelineFor(ctx, run) {
  const level = levelOf(ctx, run);
  const pipeline = (level !== null ? ctx.pipelines.byLevel?.[level] : undefined) ?? ctx.pipelines[run.nodeKind];
  if (!pipeline) throw new FolioError('LEVEL_UNKNOWN', `${run.nodeId}: ${level}`, { nodeId: run.nodeId, level });
  return pipeline;
}

/** 이 실행의 검사 digest: 노드 레벨 파이프라인의 검사 단계에 걸리는 검사. */
export function checksDigestFor(ctx, run) {
  const level = levelOf(ctx, run);
  return (level !== null ? ctx.checksDigest.byLevel?.[level] : undefined) ?? ctx.checksDigest[run.nodeKind];
}
```

- [ ] **Step 4: `core/run/sync.js` 전체 교체**

```js
import { activeChecks } from '../checks/applied.js';
import { invalidateFrom, recheckStart, receiptRecorded } from './steps/common.js';
import { nodeOrder } from '../scope/stale-checks.js';
import { checksDigestFor, pipelineFor } from './level-pipeline.js';

/** 실행이 따르는 검사 계획: 이 파이프라인에서 지금 켜진 검사 id 와 그 검사가 도는 단계(stage). */
export const checkPlanFor = (ctx, pipeline) => activeChecks(ctx.checks, pipeline).map(({ checkId, stage }) => ({ checkId, stage }));

/**
 * 실행 도중 꺼진 검사를 기억한다. 남은 검사 단계는 그 검사를 돌리지 않고, 영수증에는 work.yaml 이 끈 검사(skipped)로 남긴다.
 * 다시 켜지면 목록에서 빠진다.
 */
function trackDeactivated(run, plan) {
  const now = new Set(plan.map((c) => c.checkId));
  const removed = (run.checkPlan ?? []).filter((c) => !now.has(c.checkId));
  const kept = (run.deactivated ?? []).filter((c) => !now.has(c.checkId) && !removed.some((r) => r.checkId === c.checkId));
  run.deactivated = [...kept, ...removed];
  run.checkPlan = plan;
}

/** 실행이 만들어진(또는 마지막으로 맞춘) 설정과 지금 설정이 다른가: 레벨 파이프라인·검사 digest, 앞뒤 판정 여부. */
export function outOfSync(run, ctx) {
  const order = nodeOrder(ctx.work, run.nodeId);
  const sameOrder = !run.order || run.order.ordered === order.ordered;
  return !(run.pipelineDigest === pipelineFor(ctx, run).digest && run.checksDigest === checksDigestFor(ctx, run) && sameOrder);
}

/** 옛 설정에서 낸 질문과 받아 둔 답은 버린다(다시 묻는다). */
export function dropPending(run) {
  run.inbox = {};
  run.issued = {};
  run.pending = null;
  if (run.state === 'awaiting_model' || run.state === 'awaiting_user') run.state = 'active';
}

/**
 * 단계나 검사, 노드의 앞뒤 판정 여부(order)가 바뀌었으면 검사부터 다시. 영수증(또는 재검사 기록)이 이미 기록장에 있으면 그것으로 끝낸다.
 * steps: 이 실행이 도는 단계(보통 실행은 파이프라인 전체, 재검사는 검사 단계만).
 */
export function syncPipeline({ run, ctx, steps, now, finished = false }) {
  const pipeline = pipelineFor(ctx, run);
  const order = nodeOrder(ctx.work, run.nodeId);
  // 옛 실행 파일(order 없음)은 지금 순서로 본다.
  if (!outOfSync(run, ctx)) { run.order = order; return; }
  if (finished) return;
  if (run.state === 'committing' && receiptRecorded(ctx.receiptRecords, run)) return;
  if (run.state === 'committing') { run.receipt = null; run.state = 'active'; }
  dropPending(run);
  trackDeactivated(run, checkPlanFor(ctx, pipeline));
  const start = recheckStart(steps);
  run.pipelineDigest = pipeline.digest;
  run.checksDigest = checksDigestFor(ctx, run);
  run.order = order;
  if (run.cursor > start) { invalidateFrom(run, steps, start); run.cursor = start; }
  run.history.push({ at: now(), event: 'pipeline_changed' });
}
```

- [ ] **Step 5: `core/run/runner.js` — 레벨 파이프라인으로**

import 줄에 더한다:
```js
import { checksDigestFor, pipelineFor } from './level-pipeline.js';
```

`drive` 안의 한 줄:
```js
      const pipeline = ctx.pipelines[run.nodeKind];
```
→
```js
      const pipeline = pipelineFor(ctx, run);
```

`newRun` 함수 전체를 바꾼다:
```js
  function newRun(ctx, node) {
    const at = now();
    const ref = { nodeId: node.id, level: node.level, nodeKind: node.kind };
    const pipeline = pipelineFor(ctx, ref);
    return {
      runId: newId('run'), nodeId: node.id, variant: 'main', nodeKind: node.kind, level: node.level,
      mode: node.kind === 'branch' && node.children.length > 0 ? 'derive' : 'open',
      pipelineDigest: pipeline.digest, checksDigest: checksDigestFor(ctx, ref), cursor: 0, state: 'active',
      outputs: {}, draftHash: null, results: {}, attempts: 0, retries: {}, inbox: {}, pending: null,
      approval: null, overridden: [], receipt: null, checkPlan: checkPlanFor(ctx, pipeline), deactivated: [], createdAt: at, updatedAt: at, history: [],
    };
  }
```

`decide` 안의 한 줄:
```js
    const steps = stepsFor(current, ctx.pipelines[current.nodeKind]);
```
→
```js
    const steps = stepsFor(current, pipelineFor(ctx, current));
```

- [ ] **Step 6: `core/run/recheck-plan.js` — 재검사 실행도 레벨 파이프라인**

import에 `import { checksDigestFor, pipelineFor } from './level-pipeline.js';`를 더하고, `newRecheckRun`을 바꾼다:
```js
export function newRecheckRun(ctx, node, { newId, now }) {
  const commit = lastCommits(ctx.receiptRecords).get(node.id);
  if (!commit) throw new FolioError('RECHECK_NOT_COMMITTED', `${node.id} has no commit to recheck`);
  const draftHash = sha256(node.body);
  if (draftHash !== commit.committedHash) throw new FolioError('RECHECK_TEXT_DRIFTED', `${node.id} differs from its committed text; run it again instead`, { nodeId: node.id });
  const at = now();
  const ref = { nodeId: node.id, level: node.level, nodeKind: node.kind };
  const pipeline = pipelineFor(ctx, ref);
  return {
    runId: newId('run'), nodeId: node.id, variant: 'main', nodeKind: node.kind, level: node.level, mode: RECHECK_MODE,
    receiptId: commit.receiptId, pipelineDigest: pipeline.digest, checksDigest: checksDigestFor(ctx, ref),
    cursor: 0, state: 'active', draftHash, results: {}, attempts: 0, retries: {}, inbox: {}, pending: null,
    outputs: { draft: node.body, ...(node.kind === 'branch' ? { plan: node.body } : {}), events: committedEvents(ctx, node.id, draftHash) },
    approval: null, overridden: [], receipt: null, checkPlan: checkPlanFor(ctx, pipeline), deactivated: [],
    createdAt: at, updatedAt: at, history: [],
  };
}
```

- [ ] **Step 7: `core/scope/stale.js` — 레벨 적용 검사**

JSDoc의 `applied({ leaf, branch }: ...)`를 `applied({ leaf, branch, byLevel? }: ...)`로 고치고, 한 줄을 바꾼다:
```js
    if (applied) reasons.push(...checkReasons({ applied: applied[node.kind], had: recheck?.appliedChecks ?? receipt.appliedChecks }));
```
→
```js
    const now = applied ? (applied.byLevel?.[node.level] ?? applied[node.kind]) : null;
    if (now) reasons.push(...checkReasons({ applied: now, had: recheck?.appliedChecks ?? receipt.appliedChecks }));
```

- [ ] **Step 8: `core/checks/user-check-draft.js` — 모든 레벨의 검사 단계**

`stagesByTier`를 바꾼다:
```js
/** 풀린 파이프라인({ leaf, branch, byLevel? })에서 검사 단계를 tier 별로 모은다(초안 검사에 넘길 stages). */
export function stagesByTier(pipelines) {
  const out = { deterministic: [], model: [] };
  const all = [pipelines.leaf, pipelines.branch, ...Object.values(pipelines.byLevel ?? {})].filter(Boolean);
  for (const step of all.flatMap((pipeline) => pipeline.steps ?? [])) {
    if (step.kind !== 'check' || !out[step.tier]) continue;
    const stage = step.stage ?? step.id;
    if (!out[step.tier].includes(stage)) out[step.tier].push(stage);
  }
  return out;
}
```

- [ ] **Step 9: 통과 확인**

Run: `node --test test/run/level-overrides.test.js`
Expected: PASS (5 tests)

- [ ] **Step 10: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add core/run/level-pipeline.js core/run/runner.js core/run/sync.js core/run/recheck-plan.js core/scope/stale.js core/checks/user-check-draft.js test/run/level-overrides.test.js
git commit -m "$(cat <<'EOF'
feat(core): run, recheck and backfill each node under its level pipeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task B3: M2.5 완료 기준 테스트 + 정지

**Files:**
- Test: `test/acceptance/m2-5.test.js`

**Interfaces:**
- Consumes: Part A·B 전부. 새 코드 없음.

M2.5 완료 기준(이 계획이 정함):
1. 코어가 잠금을 정한다: 팩이 commit·facts의 잠금을 풀거나, facts가 사건 추출을 요구하지 않으면 작품이 열리지 않는다. 아무것도 기록되지 않는다.
2. 팩 검사·세트 id는 팩 이름 접두어를 갖고, 팩끼리 겹치지 않는다.
3. 팩 내용은 파이프라인 digest의 일부다: 바뀌면 열린 실행은 검사부터 다시 돈다.
4. 레벨별 단계: 위층 한 레벨만 자동 승인, 나머지는 묻는다. 영수증마다 제 레벨 digest.
5. 잠금 규칙은 모든 레벨에서 같다.

- [ ] **Step 1: 완료 기준 테스트 작성**

`test/acceptance/m2-5.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { addNode } from '../../core/structure/ops.js';
import { createRunner } from '../../core/run/runner.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, emptyTreeCopy, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

const leafWith = (fn) => new Map([['fake', { ...fakePack, pipelines: { ...fakePack.pipelines, leaf: fakePack.pipelines.leaf.map(fn) } }]]);

test('M2.5-1 core decides the locks: a pack that unlocks commit or facts, or cuts facts off its events, does not open', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const cases = [
    [leafWith((s) => (s.id === 'commit' ? { ...s, locked: false } : s)), 'PACK_LOCK_MISMATCH'],
    [leafWith((s) => (s.id === 'facts' ? { ...s, locked: false } : s)), 'PACK_LOCK_MISMATCH'],
    [leafWith((s) => (s.id === 'facts' ? { ...s, requires: [] } : s)), 'PACK_FACTS_REQUIRES_EVENTS'],
  ];
  for (const [packs, code] of cases) await assert.rejects(createRunner({ root, packs }).run({ node: 'stairwell' }), { code });
  assert.deepEqual(await openLedger(root, 'receipts').readAll(), []);
  assert.deepEqual(await openLedger(root, 'decisions').readAll(), []);
});

test('M2.5-2 pack ids carry the pack prefix and never collide', () => {
  const stray = { ...fakePack, checks: [...fakePack.checks, { id: 'critic', tier: 'model', stage: 'critic', severity: 'advisory' }] };
  assert.throws(() => resolvePacks(['fake'], new Map([['fake', stray]])), { code: 'PACK_CHECK_ID_PREFIX' });
  assert.throws(() => resolvePacks(['fake', 'fake'], fakePacks()), { code: 'PACK_DUPLICATE' });
});

test('M2.5-3 pack content is part of the pipeline digest: an open run checks again after it changes', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const gate = (await driveToEnd(() => createRunner({ root, packs: fakePacks() }), createFakeHost(), {
    start: { node: 'stairwell' }, until: (o) => o.status === 'needs_user',
  })).at(-1);
  const changed = new Map([['fake', { ...fakePack, checks: fakePack.checks.map((c) => (c.id === 'fake.critic' ? { ...c, instruction: 'Review harder.' } : c)) }]]);
  assert.equal(label(await createRunner({ root, packs: changed }).decide({ runId: gate.runId, action: 'approve' })), 'model:extract');
  assert.deepEqual((await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit'), []);
});

test('M2.5-4 per-level steps: only the book plan is auto-approved and each receipt carries its level digest', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root, { overrides: { levels: { book: { approve: { mode: 'auto' } } } } });
  await addNode(root, await openWork(root), { level: 'book', id: 'b1', title: '1권' });
  const asked = [];
  const host = createFakeHost({ children: { b1: [{ id: 'b1-c1' }], 'b1-c1': [{ id: 'b1-c1-s1' }] } });
  await driveToEnd(() => createRunner({ root, packs: fakePacks() }), host, { user: (o) => { asked.push(o.nodeId); return { action: 'approve' }; } });
  assert.deepEqual(asked, ['b1-c1', 'b1-c1-s1']);
  const { pipelines } = await openWorkspace(root, { packs: fakePacks() });
  const receipts = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt');
  const levelOfNode = { b1: 'book', 'b1-c1': 'chapter', 'b1-c1-s1': 'scene' };
  for (const receipt of receipts) assert.equal(receipt.pipelineDigest, pipelines.byLevel[levelOfNode[receipt.nodeId]].digest, receipt.nodeId);
  assert.equal(receipts.length, 3);
});

test('M2.5-5 lock rules hold at every level', async () => {
  const root = await copyFixture('novel-3level');
  for (const [level, stepId] of [['scene', 'facts'], ['scene', 'extract'], ['scene', 'draft'], ['book', 'commit'], ['chapter', 'commit']]) {
    await useFakePack(root, { overrides: { levels: { [level]: { [stepId]: { mode: 'off' } } } } });
    await assert.rejects(openWorkspace(root, { packs: fakePacks() }),
      (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'LOCKED_STEP_OVERRIDE' && x.level === level && x.stepId === stepId), `${level}.${stepId}`);
  }
});
```

- [ ] **Step 2: 실행**

Run: `node --test test/acceptance/m2-5.test.js`
Expected: PASS (5 tests). Part A·B가 이미 들어와 있으므로 처음부터 통과한다. 하나라도 실패하면 해당 Task로 돌아가 원인을 고친다(테스트를 약화하지 않는다).

- [ ] **Step 3: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add test/acceptance/m2-5.test.js
git commit -m "$(cat <<'EOF'
test: record the M2.5 acceptance checks for core-owned locks and per-level steps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: M2.5 정지 — 사용자에게 보고하고 멈춘다**

`node --test test/acceptance/m2-5.test.js` 출력(5 pass)과 `npm run check`의 마지막 요약(테스트 수, 실패 0)을 그대로 보여 주고, 결정표의 1~4번(잠금 계산 규칙, 접두어, 팩 digest, 레벨 덮어쓰기 문법)을 한 줄씩 요약해 확인을 받는다. 사용자가 이어가라고 할 때까지 Part C를 시작하지 않는다.

---

# Part C — M3: MCP 서버 + 최소 소설 팩 + 스킬

### Task C1: 넘긴 실행기 항목 — ANSWER_STALE, 재시도 초기화, prompt() 앞 요청 digest

**Files:**
- Modify: `core/run/runner.js` (`resume`)
- Modify: `core/run/sync.js` (`syncPipeline` 재계획 때 `run.retries = {}`)
- Modify: `core/run/payload.js` (`rawPackPayload`, `dressPayload`)
- Modify: `core/run/steps/common.js` (`requestModel`의 `digestPayload`)
- Modify: `core/run/steps/generate.js`, `core/run/steps/children.js`, `core/run/steps/revise.js`
- Modify: `test/run/answer-binding.test.js` (첫 두 테스트: resume이 이제 `ANSWER_STALE`로 거부 — 아래 Step 6)
- Test: `test/run/parked-m3.test.js`

**Interfaces:**
- Produces:
  - `resume`: 실행을 만든 설정(레벨 파이프라인·검사·순서·팩)이 바뀌었으면 답을 받지 않고 옛 질문을 버린 뒤 저장하고 `FolioError('ANSWER_STALE', …, { runId, hint })`. 다음 `run({ node: 'next' | id })`이 새 설정으로 다시 묻는다.
  - `syncPipeline`이 재계획할 때 `run.retries = {}`(재검사의 모델 검사 재시도 횟수도 새로 센다).
  - `rawPackPayload(ctx, run, step, extra)` — 팩 `prompt()`를 입히기 전 재료. `dressPayload(ctx, step, raw)` — 호스트에 보낼 모양. `packPayload`는 그대로(= `dressPayload(rawPackPayload(...))`).
  - `requestModel(run, env, requests)` — 요청마다 선택 필드 `digestPayload`(호스트에 보내지 않음). `run.issued[stepId].digest = requestDigest(digestPayload ?? payload)`.
  - generate·children·revise는 `takeAnswer(run, step.id, raw)`와 `digestPayload: raw`로 같은 재료를 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/run/parked-m3.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../../core/run/runner.js';
import { fakePack } from '../support/fake-pack.js';
import { copyFixture, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';
import { committedWith, editYaml } from '../support/recheck.js';

const RECHECK = { node: 'next-recheck', mode: 'recheck' };
const unanswered = (o) => ({ [o.requests[0].requestId]: JSON.stringify({ checked: [], findings: [] }) });

test('resume refuses answers to a question asked under settings that changed (ANSWER_STALE); the next run asks again', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const mk = () => createRunner({ root, packs: fakePacks() });
  const first = await mk().run({ node: 'stairwell' });
  assert.equal(label(first), 'model:plan');
  await editYaml(root, (c) => { c.overrides = { critic: { mode: 'off', reason: '속도' } }; });
  await assert.rejects(mk().resume({ runId: first.runId, answers: createFakeHost().answer(first) }),
    (e) => e.code === 'ANSWER_STALE' && e.details.runId === first.runId);
  await assert.rejects(mk().resume({ runId: first.runId, answers: createFakeHost().answer(first) }), { code: 'RUN_NOT_AWAITING_MODEL' });
  const again = await mk().run({ node: 'next' });
  assert.equal(label(again), 'model:plan');
  assert.notEqual(again.requests[0].requestId, first.requests[0].requestId);
});

test('a recheck that re-plans after a settings change gets a fresh set of tries', async () => {
  const { root, makeRunner } = await committedWith({ checks: { 'fake.critic': { mode: 'off' } } });
  await editYaml(root, (c) => { c.checks = {}; });
  let out = (await driveToEnd(makeRunner, createFakeHost(), { start: RECHECK, until: (o) => label(o) === 'model:critic' })).at(-1);
  for (let i = 0; i < 2; i += 1) out = await makeRunner().resume({ runId: out.runId, answers: unanswered(out) });
  assert.equal(label(out), 'model:critic');
  await editYaml(root, (c) => { c.checks = { quiet: { words: ['없는말'] } }; });
  out = (await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'next' }, until: (o) => label(o) === 'model:critic' })).at(-1);
  out = await makeRunner().resume({ runId: out.runId, answers: unanswered(out) });
  assert.equal(label(out), 'model:critic', 'tries used before the re-plan do not count');
});

test('an answer to a retried request is taken even when the pack prompt folds the retry reason into the request', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  const pack = { ...fakePack, prompt: (step, payload) => ({ ...payload, instructions: `${step.id}${payload.retryReason ? ` / retry: ${payload.retryReason}` : ''}` }) };
  const mk = () => createRunner({ root, packs: new Map([['fake', pack]]) });
  const host = createFakeHost();
  let out = (await driveToEnd(mk, host, { start: { node: 'stairwell' }, until: (o) => label(o) === 'model:extract' })).at(-1);
  out = await mk().resume({ runId: out.runId, answers: { [out.requests[0].requestId]: 'not json' } });
  assert.equal(label(out), 'model:extract');
  assert.match(out.requests[0].payload.instructions, /retry: EVENTS_JSON_INVALID/);
  assert.equal(out.requests[0].digestPayload, undefined, 'the digest source is not sent to the host');
  out = await mk().resume({ runId: out.runId, answers: host.answer(out) });
  assert.equal(label(out), 'model:critic', 'the retried extract answer was taken');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/run/parked-m3.test.js`
Expected: FAIL — 1: resume이 `needs_model`을 돌려준다(던지지 않음). 2: `needs_user`(RECHECK_INCOMPLETE). 3: `model:extract`(답이 버려짐).

- [ ] **Step 3: `core/run/runner.js` — resume이 옛 질문의 답을 일찍 거부**

`resume` 함수의 첫 두 줄 뒤(상태 검사 바로 다음)에 넣는다:
```js
  async function resume({ runId, answers = {} }) {
    const current = await runs.load(runId);
    if (current.state !== 'awaiting_model') throw new FolioError('RUN_NOT_AWAITING_MODEL', runId, { state: current.state });
    // 질문을 낸 뒤 설정(단계·검사·순서·팩)이 바뀌었으면 답을 받지 않는다. 옛 질문은 버리고 저장한다 — 다음 run 이 새 설정으로 다시 묻는다.
    if (outOfSync(current, await context())) {
      dropPending(current);
      current.updatedAt = now();
      await runs.save(current);
      throw new FolioError('ANSWER_STALE', `${runId} was asked under settings that have changed`, {
        runId, hint: 'call run (folio_run) again to get the requests for the current settings',
      });
    }
    const requests = current.pending.requests;
```
(그 아래 `missing`/`unknown` 검사와 나머지는 그대로.)

- [ ] **Step 4: `core/run/sync.js` — 재계획 때 재시도 횟수 초기화**

`syncPipeline`의 `dropPending(run);` 바로 다음 줄에 넣는다:
```js
  dropPending(run);
  run.retries = {}; // 새 설정의 요청은 처음 묻는 것이다(재검사 모델 검사·추출·자식 계획의 재시도 횟수를 새로 센다)
```

- [ ] **Step 5: 요청 digest는 팩 prompt() 앞 재료로**

`core/run/payload.js`의 `packPayload`를 세 함수로 바꾼다:
```js
/** 팩 프롬프트를 입히기 전 재료. 요청 digest(답을 요청에 묶는 값)는 이것으로 만든다 — prompt() 가 재요청 사유를 글에 넣어도 흔들리지 않는다. */
export const rawPackPayload = (ctx, run, step, extra = {}) => ({ ...basePayload(ctx, run, step), ...extra });

/** 호스트에 보낼 모양: 첫 팩의 prompt() 를 입힌다. */
export const dressPayload = (ctx, step, raw) => (ctx.registry.primary.prompt ? ctx.registry.primary.prompt(step, raw) : raw);

export function packPayload(ctx, run, step, extra = {}) {
  return dressPayload(ctx, step, rawPackPayload(ctx, run, step, extra));
}
```

`core/run/steps/common.js`의 `requestModel`을 바꾼다:
```js
/**
 * 엔진은 모델을 부르지 않는다. 요청을 기록하고 호스트에 돌려줄 뿐이다.
 * 단계마다 낸 요청의 id 와 내용 digest 를 run.issued 에 남긴다 — 답은 그 요청에 묶인다(takeAnswer).
 * digestPayload(선택): digest 를 만들 재료(팩 prompt() 앞). 호스트에는 보내지 않는다.
 */
export function requestModel(run, env, requests) {
  const issued = requests.map(({ digestPayload, ...request }) => ({
    request: { requestId: env.newId('req'), ...request }, digest: requestDigest(digestPayload ?? request.payload),
  }));
  run.pending = { kind: 'model', requests: issued.map((item) => item.request) };
  run.issued = run.issued ?? {};
  for (const { request, digest } of issued) run.issued[request.stepId] = { requestId: request.requestId, digest };
  run.state = 'awaiting_model';
  return outcomeFromPending(run);
}
```

`core/run/steps/generate.js`: import를 `import { dressPayload, rawPackPayload } from '../payload.js';`로 바꾸고, `generateStep` 안의 두 줄
```js
  const request = (extra) => requestModel(run, env, [{ stepId: step.id, purpose: 'generate', produces: step.produces, payload: packPayload(ctx, run, step, extra) }]);
  const entry = takeAnswer(run, step.id, packPayload(ctx, run, step));
```
을 이것으로 바꾼다:
```js
  const raw = (extra) => rawPackPayload(ctx, run, step, extra);
  const request = (extra) => requestModel(run, env, [{
    stepId: step.id, purpose: 'generate', produces: step.produces, payload: dressPayload(ctx, step, raw(extra)), digestPayload: raw(extra),
  }]);
  const entry = takeAnswer(run, step.id, raw());
```

`core/run/steps/children.js`: import를 `import { dressPayload, rawPackPayload } from '../payload.js';`로 바꾸고,
```js
  const request = (extra) => requestModel(run, env, [{ stepId: step.id, purpose: 'generate', produces: 'children', payload: packPayload(ctx, run, step, extra) }]);
```
→
```js
  const raw = (extra) => rawPackPayload(ctx, run, step, extra);
  const request = (extra) => requestModel(run, env, [{
    stepId: step.id, purpose: 'generate', produces: 'children', payload: dressPayload(ctx, step, raw(extra)), digestPayload: raw(extra),
  }]);
```
그리고
```js
    const entry = takeAnswer(run, step.id, packPayload(ctx, run, step));
```
→
```js
    const entry = takeAnswer(run, step.id, raw());
```

`core/run/steps/revise.js`: import를 `import { dressPayload, rawPackPayload } from '../payload.js';`로 바꾸고, 함수 본문의 해당 줄들을 바꾼다:
```js
  const current = rawPackPayload(ctx, run, step, run.userRevision ? { feedback: run.userRevision } : { blocking });
  const ask = (purpose) => requestModel(run, env, [{ stepId: step.id, purpose, payload: dressPayload(ctx, step, current), digestPayload: current }]);
  const entry = takeAnswer(run, step.id, current);
```
```js
  if (run.userRevision) return ask('user_revision');
```
```js
  return ask('revise');
```
(원래의 `const current = run.userRevision ? packPayload(...) : packPayload(...)`, `requestModel(... purpose: 'user_revision' ...)`, `requestModel(... purpose: 'revise' ...)` 세 곳이 이것으로 바뀐다. 나머지 흐름은 그대로.)

- [ ] **Step 6: 기존 테스트 두 개를 새 규칙에 맞춘다**

`test/run/answer-binding.test.js`의 첫 두 테스트는 "설정이 바뀐 뒤 resume하면 옛 답을 쓰지 않고 다시 묻는다"를 resume의 반환값으로 확인했다. 이제 resume은 `ANSWER_STALE`로 거부하고, 다시 묻는 것은 다음 run이 한다(넘긴 항목의 사용자 결정). 검증 내용(옛 답이 쓰이지 않음, NEW 지시로 다시 물음, 기록 없음)은 그대로 두고 경로만 바꾼다.

첫 테스트(`'an answer given before a check changed is not used for the changed check (recheck run)'`)의 마지막 네 줄을 바꾼다:
```js
  await editYaml(root, (c) => { c.checks = { mine: { rule: 'NEW rule', stage: 'critic', severity: 'block' } }; });
  await assert.rejects(makeRunner().resume({ runId: asked.runId, answers: { [asked.requests[0].requestId]: oldAnswer(asked) } }), { code: 'ANSWER_STALE' });
  const again = (await driveToEnd(makeRunner, createFakeHost(), { start: { node: 'next' }, until: at('critic') })).at(-1);
  assert.ok(instructions(again).includes('NEW rule'));
  assert.deepEqual(await rechecksOf(root), []);
```

둘째 테스트(`'... (branch run)'`)의 마지막 세 줄을 바꾼다:
```js
  await assert.rejects(mk().resume({ runId: asked.runId, answers: { [asked.requests[0].requestId]: oldAnswer(asked) } }), { code: 'ANSWER_STALE' });
  const out = await mk().run({ node: 'next' });
  assert.equal(label(out), 'model:fit');
  assert.ok(instructions(out).includes('NEW'));
```

- [ ] **Step 7: 통과 확인**

Run: `node --test test/run/parked-m3.test.js test/run/answer-binding.test.js`
Expected: PASS

- [ ] **Step 8: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add core/run/runner.js core/run/sync.js core/run/payload.js core/run/steps/common.js core/run/steps/generate.js core/run/steps/children.js core/run/steps/revise.js test/run/parked-m3.test.js test/run/answer-binding.test.js
git commit -m "$(cat <<'EOF'
fix(core): refuse stale answers early, reset retries on re-plan and bind requests before the pack prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C2: 구조 바꾸기는 작업 잠금 안에서, 구조 변경은 커밋된 가지를 stale로

**Files:**
- Create: `core/structure/locked.js`
- Modify: `core/run/receipt-builder.js` (가지 영수증 `structure`)
- Modify: `core/ledger/receipts.js` (`pushStructureProblems`)
- Modify: `core/run/commit-locks.js` (`assertStructureMatches`)
- Modify: `core/run/commit.js` (대조 호출)
- Modify: `core/scope/stale-checks.js` (`structureReason`)
- Modify: `core/scope/stale.js` (이유 추가)
- Test: `test/run/structure-lock.test.js`

**Interfaces:**
- Consumes: `withWorkLock`, `createRunStore`, `OPEN_STATES`, `addNode`/`moveNode`/`wrapNodes`.
- Produces:
  - `STRUCTURE_OPS = { add, move, wrap }`.
  - `changeStructure(root, { op, ...args }): Promise<{ op, outline: Array<{ id, level, kind, status, title, parentId }> }>` — 오류 `STRUCTURE_OP_UNKNOWN`, `STRUCTURE_RUN_OPEN`(`details: { runId, nodeId }`), 그 밖에 ops의 오류 그대로.
  - `outlineOf(work)` — 읽는 순서(preorder)의 노드 요약.
  - 영수증 선택 필드 `structure: { children: string[] }`(가지 노드만). 형식이 틀리면 `STRUCTURE_INVALID`.
  - `assertStructureMatches(work, record)` → `LOCK_RECEIPT_INVALID`(`problems: [{ code: 'STRUCTURE_MISMATCH' }]`).
  - `structureReason({ work, nodeId, had })` → `{ kind: 'structure', id, was, now } | null`. 재검사 대상(`pendingRechecks`)이 아니다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/run/structure-lock.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { validateReceipt } from '../../core/ledger/receipts.js';
import { withWorkLock } from '../../core/run/work-lock.js';
import { createRunner } from '../../core/run/runner.js';
import { workStatus } from '../../core/status.js';
import { assertStructureMatches } from '../../core/run/commit-locks.js';
import { changeStructure } from '../../core/structure/locked.js';
import { copyFixture, emptyTreeCopy, useFakePack, fakePacks } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';

test('structure changes refuse while a run is open and name the run', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  const first = await createRunner({ root, packs: fakePacks() }).run({ node: 'stairwell' });
  assert.equal(first.status, 'needs_model');
  await assert.rejects(changeStructure(root, { op: 'add', parentId: 'the-fall', level: 'scene', id: 'new-scene' }),
    (e) => e.code === 'STRUCTURE_RUN_OPEN' && e.details.runId === first.runId && e.details.nodeId === 'stairwell');
  assert.equal((await openWork(root)).tree.nodes.has('new-scene'), false);
});

test('structure changes wait for the work lock and return the new outline', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  /** @type {() => void} */
  let release = () => {};
  const held = withWorkLock(root, () => new Promise((done) => { release = done; }));
  let settled = false;
  const change = changeStructure(root, { op: 'add', parentId: 'the-fall', level: 'scene', id: 'new-scene', title: '새 장면' })
    .finally(() => { settled = true; });
  await new Promise((done) => setTimeout(done, 50));
  assert.equal(settled, false, 'waits for the work lock');
  release();
  await held;
  const result = await change;
  assert.equal(result.op, 'add');
  const added = result.outline.find((n) => n.id === 'new-scene');
  assert.deepEqual(added, { id: 'new-scene', level: 'scene', kind: 'leaf', status: 'draft', title: '새 장면', parentId: 'the-fall' });
});

test('unknown operations are refused, including prototype names', async () => {
  const root = await copyFixture('novel-3level');
  await useFakePack(root);
  for (const op of ['delete', '__proto__', 'constructor']) await assert.rejects(changeStructure(root, { op }), { code: 'STRUCTURE_OP_UNKNOWN' }, op);
});

test('adding a child under a committed branch marks the branch stale; a receipt with other children does not commit', async () => {
  const root = await emptyTreeCopy('novel-3level');
  await useFakePack(root, { overrides: { approve: { mode: 'auto' } } });
  for (const id of ['s1', 's2']) await changeStructure(root, { op: 'add', level: 'scene', id, title: id });
  const mk = () => createRunner({ root, packs: fakePacks() });
  await driveToEnd(mk, createFakeHost());
  await changeStructure(root, { op: 'wrap', nodeIds: ['s1', 's2'], level: 'chapter', id: 'c1' });
  await driveToEnd(mk, createFakeHost());
  const receipt = (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'receipt' && r.nodeId === 'c1').at(-1);
  assert.deepEqual(receipt.structure, { children: ['s1', 's2'] });
  const status = () => workStatus(root, { packs: fakePacks() });
  assert.ok(!(await status()).stale.some((s) => s.nodeId === 'c1'));
  await changeStructure(root, { op: 'add', parentId: 'c1', level: 'scene', id: 's3' });
  const now = await status();
  const stale = now.stale.find((s) => s.nodeId === 'c1');
  assert.deepEqual(stale.reasons.filter((r) => r.kind === 'structure'), [{ kind: 'structure', id: 'c1', was: ['s1', 's2'], now: ['s1', 's2', 's3'] }]);
  assert.ok(!now.recheck.some((r) => r.nodeId === 'c1'), 'a recheck cannot resolve a structure change; the branch is run again');
  const work = await openWork(root);
  assert.throws(() => assertStructureMatches(work, { nodeId: 'c1', structure: { children: ['s1', 's2'] } }),
    (e) => e.code === 'LOCK_RECEIPT_INVALID' && e.details.problems[0].code === 'STRUCTURE_MISMATCH');
  assert.doesNotThrow(() => assertStructureMatches(work, { nodeId: 'c1', structure: { children: ['s1', 's2', 's3'] } }));
  assert.doesNotThrow(() => assertStructureMatches(work, { nodeId: 'c1' }));
  const { type: _t, seq: _s, at: _a, prev: _p, hash: _h, ...plain } = receipt;
  assert.deepEqual(validateReceipt({ ...plain, structure: { children: [1] } }).map((p) => p.code), ['STRUCTURE_INVALID']);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/run/structure-lock.test.js`
Expected: FAIL — `Cannot find module '../../core/structure/locked.js'`

- [ ] **Step 3: `core/structure/locked.js` 작성**

```js
import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { preorder } from '../store/tree.js';
import { withWorkLock } from '../run/work-lock.js';
import { createRunStore, OPEN_STATES } from '../run/run-store.js';
import { addNode, moveNode, wrapNodes } from './ops.js';

export const STRUCTURE_OPS = Object.freeze({ add: addNode, move: moveNode, wrap: wrapNodes });

/** 읽는 순서(preorder)의 노드 요약. 구조를 바꾼 뒤 호스트에 보여 준다. */
export function outlineOf(work) {
  return preorder(work.tree).map((id) => {
    const node = work.tree.nodes.get(id);
    return { id, level: node.level, kind: node.kind, status: node.status, title: node.title, parentId: node.parentId };
  });
}

/**
 * 구조 바꾸기의 공개 입구(MCP folio_structure 가 부른다). 실행기와 같은 작업 잠금 안에서,
 * 열린 실행(active·awaiting_model·awaiting_user·committing)이 없을 때만 바꾼다 — 질문이 떠 있는 동안 트리가 바뀌면 그 질문의 범위가 틀어진다.
 * waiting_children 가지 실행은 열린 실행이 아니다(큰 틀부터 쓰는 중에도 자식을 더할 수 있다).
 * @param {string} root
 * @param {{ op: string, [key: string]: any }} request
 */
export async function changeStructure(root, { op, ...args }) {
  if (typeof op !== 'string' || !Object.hasOwn(STRUCTURE_OPS, op)) throw new FolioError('STRUCTURE_OP_UNKNOWN', String(op), { ops: Object.keys(STRUCTURE_OPS) });
  const apply = STRUCTURE_OPS[op];
  return withWorkLock(root, async () => {
    const open = (await createRunStore(root).list()).find((r) => !r.error && OPEN_STATES.has(r.state));
    if (open) throw new FolioError('STRUCTURE_RUN_OPEN', `${open.runId} for ${open.nodeId} is not finished; finish or skip it first`, { runId: open.runId, nodeId: open.nodeId });
    await apply(root, await openWork(root), args);
    return { op, outline: outlineOf(await openWork(root)) };
  });
}
```

- [ ] **Step 4: 가지 영수증에 자식 목록**

`core/run/receipt-builder.js` `buildReceipt`가 돌려주는 객체에서 `order: nodeOrder(work, run.nodeId),` 다음 줄에 넣는다:
```js
    // 가지는 커밋 때의 자식 목록을 남긴다. 나중에 자식이 더해지거나 옮겨지면 "다시 확인 필요"(structure)가 된다.
    ...(node.kind === 'branch' ? { structure: { children: [...node.children] } } : {}),
```

`core/ledger/receipts.js`에 `pushOrderProblems` 다음으로 더하고 `validateReceipt`에서 부른다:
```js
/** structure(선택, 가지 영수증): { children: string[] }. 옛 영수증·잎 영수증에는 없다. */
export function pushStructureProblems(structure, push) {
  if (structure === undefined) return;
  if (!structure || typeof structure !== 'object' || !Array.isArray(structure.children) || !structure.children.every((id) => typeof id === 'string')) push('STRUCTURE_INVALID');
}
```
```js
  pushOrderProblems(receipt.order, push);
  pushStructureProblems(receipt.structure, push);
```

- [ ] **Step 5: 커밋은 지금 자식 목록과 같아야 한다**

`core/run/commit-locks.js` 끝에 더한다:
```js
/** structure 가 있으면(가지 영수증) 지금 자식 목록과 같아야 한다 — 다른 자식들을 보고 한 돌아보기로 커밋할 수 없다. */
export function assertStructureMatches(work, record) {
  if (record.structure === undefined) return;
  const node = work.tree.nodes.get(record.nodeId);
  const now = node?.kind === 'branch' ? node.children : null;
  if (!now || canonicalJson(record.structure?.children ?? null) !== canonicalJson(now)) {
    throw new FolioError('LOCK_RECEIPT_INVALID', 'the recorded children are not the children now', { problems: [{ code: 'STRUCTURE_MISMATCH' }] });
  }
}
```

`core/run/commit.js`: import 목록에 `assertStructureMatches`를 더하고,
```js
  if (work?.tree?.nodes.has(receipt.nodeId)) assertOrderMatches(work, receipt);
```
→
```js
  if (work?.tree?.nodes.has(receipt.nodeId)) { assertOrderMatches(work, receipt); assertStructureMatches(work, receipt); }
```

- [ ] **Step 6: `findStale`이 구조 변경을 알린다**

`core/scope/stale-checks.js` 머리에 `import { canonicalJson } from '../util/hash.js';`를 더하고 끝에 더한다:
```js
/**
 * 가지 영수증의 자식 목록(structure)이 지금과 다르면 이유를 돌려준다(추가·이동·묶기).
 * 재검사로는 풀리지 않는다 — 돌아보기는 자식이 모두 끝난 뒤 가지를 다시 돌려야 한다. 옛 영수증(structure 없음)은 판단하지 않는다.
 */
export function structureReason({ work, nodeId, had }) {
  if (!had || !Array.isArray(had.children)) return null;
  const node = work.tree.nodes.get(nodeId);
  const now = node?.kind === 'branch' ? [...node.children] : [];
  return canonicalJson(had.children) === canonicalJson(now) ? null : { kind: 'structure', id: nodeId, was: had.children, now };
}
```

`core/scope/stale.js`: import를 `import { checkReasons, latestRecheck, orderReason, structureReason } from './stale-checks.js';`로 바꾸고, `if (order) reasons.push(order);` 다음에 넣는다:
```js
    const structure = structureReason({ work, nodeId, had: receipt.structure });
    if (structure) reasons.push(structure);
```

- [ ] **Step 7: 통과 확인**

Run: `node --test test/run/structure-lock.test.js`
Expected: PASS (4 tests)

- [ ] **Step 8: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add core/structure/locked.js core/run/receipt-builder.js core/ledger/receipts.js core/run/commit-locks.js core/run/commit.js core/scope/stale-checks.js core/scope/stale.js test/run/structure-lock.test.js
git commit -m "$(cat <<'EOF'
feat(core): change structure only under the work lock and mark committed branches stale when their children change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C3: 선언형 팩 로더 (`pack.yaml` + 글 + 이름으로 부르는 검사기)

**Files:**
- Create: `core/pack/yaml-schema.js`
- Create: `core/pack/yaml-pack.js`
- Test: `test/pack/yaml-pack.test.js`

**Interfaces:**
- Consumes: `validatePack`(Task A1·A2), `STEP_KINDS`, `CHECK_TIERS`, `STEP_MODES`, `MAX_LOOP`, `FINDING_SEVERITIES`.
- Produces:
  - `readPackSpec(raw): { spec, files, errors }` — 순수. 오류 `{ code, path }`: `PACK_YAML_INVALID`, `PACK_FIELD_UNKNOWN`, `PACK_FIELD_INVALID`, `PACK_FIELD_MISSING`, `PACK_PROMPT_STEP_UNKNOWN`.
  - `loadYamlPack(dir, { name?, checkers? }): Promise<Pack>` — 실패하면 `FolioError('PACK_INVALID', …, { pack, errors })`. 추가 오류 `PACK_PATH_INVALID`, `PACK_FILE_MISSING`, `PACK_CHECKER_UNKNOWN`, `PACK_NAME_MISMATCH`, 그리고 `validatePack`의 코어 규칙 오류.
  - 돌려주는 `Pack`: `{ name, version, title, description, presets, pipelines, checks, checkSets, defaultCheckSets, prompt(step, payload), digest }`. 결정론 검사는 `run`(함수)과 `checker`(이름), 모델 검사는 `instruction`(글 내용).

`pack.yaml` 스키마(느슨하게 얼림 — M5 검사기 이식 때 바뀔 수 있다):

| 키 | 모양 |
|---|---|
| `name` | 필수. 팩 이름 |
| `version`, `title`, `description` | 선택 |
| `presets.<id>` | `{ title?, description?, levels: [...](work.yaml levels 모양), order?, checkSets?: [] }` |
| `pipelines.leaf`, `pipelines.branch` | 단계 목록. 단계 키는 `id, kind, tier, stage, produces, requires, loop{until,max}, mode`만. **`locked`는 쓸 수 없다** |
| `prompts.<leaf|branch>.<단계>` | 팩 폴더 안 `.md` 경로. 그 종류의 generate 단계여야 한다 |
| `checks.<id>` | `{ title?, description?, tier, stage, severity, requiresOrder?, requiresParentPlan?, requireQuote?, experimental?, config?, run(결정론만) | instruction(모델만, .md 경로) }` |
| `checkSets.<id>` | `{ title?, description?, checks: [], recommendedFor?: { kinds?, levels?, roles?, positions? } }` |
| `defaultCheckSets` | 세트 id 목록 |

- [ ] **Step 1: 실패하는 테스트 작성**

`test/pack/yaml-pack.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { stringifyYaml } from '../../core/util/yaml.js';
import { tempDir } from '../support/fixtures.js';

const DEMO = {
  name: 'demo',
  pipelines: {
    leaf: [
      { id: 'plan', kind: 'generate', produces: 'plan' },
      { id: 'draft', kind: 'generate', produces: 'draft' },
      { id: 'extract', kind: 'generate', produces: 'events', requires: ['draft'] },
      { id: 'facts', kind: 'check', tier: 'deterministic', stage: 'facts', requires: ['extract'] },
      { id: 'critic', kind: 'check', tier: 'model', stage: 'critic' },
      { id: 'approve', kind: 'gate' },
      { id: 'commit', kind: 'commit' },
    ],
    branch: [
      { id: 'plan', kind: 'generate', produces: 'plan' },
      { id: 'approve', kind: 'gate' },
      { id: 'children', kind: 'generate', produces: 'children' },
      { id: 'commit', kind: 'commit' },
    ],
  },
  prompts: { 'leaf.plan': 'prompts/plan.md' },
  checks: {
    'demo.nobody': { tier: 'deterministic', stage: 'facts', severity: 'hard', run: 'nobody' },
    'demo.critic': { tier: 'model', stage: 'critic', severity: 'advisory', instruction: 'checks/critic.md' },
  },
  checkSets: { 'demo.basic': { title: '기본', checks: ['demo.nobody', 'demo.critic'] } },
  defaultCheckSets: ['demo.basic'],
};
const FILES = { 'prompts/plan.md': '계획을 쓴다.', 'checks/critic.md': '원고를 검토한다.' };
const CHECKERS = { nobody: () => [] };

async function writePack(spec = DEMO, files = FILES) {
  const dir = await tempDir('folio-pack-');
  await writeFile(join(dir, 'pack.yaml'), typeof spec === 'string' ? spec : stringifyYaml(spec));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}
const failure = async (promise) => {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected the pack to be refused');
};
const codesOf = (error) => error.details.errors.map((e) => [e.code, e.path]);
const edit = (fn) => { const spec = structuredClone(DEMO); fn(spec); return spec; };

test('a declarative pack loads into the core Pack shape', async () => {
  const pack = await loadYamlPack(await writePack(), { name: 'demo', checkers: CHECKERS });
  assert.equal(pack.name, 'demo');
  assert.deepEqual(pack.checks.map((c) => [c.id, c.origin, typeof c.run, c.checker ?? null, c.instruction ?? null]), [
    ['demo.nobody', 'pack', 'function', 'nobody', null],
    ['demo.critic', 'pack', 'undefined', null, '원고를 검토한다.'],
  ]);
  assert.match(pack.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(resolvePacks(['demo'], new Map([['demo', pack]])).primary, pack);
  const payload = { node: { kind: 'leaf', id: 'x' }, step: 'plan' };
  assert.deepEqual(pack.prompt({ id: 'plan' }, payload), { ...payload, instructions: '계획을 쓴다.' });
  assert.equal(pack.prompt({ id: 'draft' }, payload), payload);
  assert.equal(pack.prompt({ id: 'plan' }, { ...payload, node: { kind: 'branch', id: 'y' } }).instructions, undefined);
});

test('the pack digest follows the files it reads', async () => {
  const a = await loadYamlPack(await writePack(), { checkers: CHECKERS });
  assert.equal((await loadYamlPack(await writePack(), { checkers: CHECKERS })).digest, a.digest);
  const b = await loadYamlPack(await writePack(DEMO, { ...FILES, 'prompts/plan.md': '계획을 쓴다!' }), { checkers: CHECKERS });
  assert.notEqual(b.digest, a.digest);
  const c = await loadYamlPack(await writePack(), { checkers: { nobody: () => [{ code: 'X' }] } });
  assert.notEqual(c.digest, a.digest);
});

test('unknown keys are refused, including a locked flag (core decides locks)', async () => {
  const spec = edit((s) => {
    s.extra = 1;
    s.pipelines.leaf[6].locked = true;
    s.checks['demo.critic'].weight = 3;
  });
  const error = await failure(loadYamlPack(await writePack(spec), { checkers: CHECKERS }));
  assert.equal(error.code, 'PACK_INVALID');
  assert.deepEqual(codesOf(error), [
    ['PACK_FIELD_UNKNOWN', 'extra'], ['PACK_FIELD_UNKNOWN', 'pipelines.leaf[6].locked'], ['PACK_FIELD_UNKNOWN', 'checks.demo.critic.weight'],
  ]);
});

test('files must be .md files inside the pack folder', async () => {
  for (const bad of ['../outside.md', '/etc/hosts.md', 'prompts/plan.txt']) {
    const error = await failure(loadYamlPack(await writePack(edit((s) => { s.prompts['leaf.plan'] = bad; })), { checkers: CHECKERS }));
    assert.deepEqual(codesOf(error), [['PACK_PATH_INVALID', bad]], bad);
  }
  const missing = await failure(loadYamlPack(await writePack(edit((s) => { s.prompts['leaf.plan'] = 'prompts/missing.md'; })), { checkers: CHECKERS }));
  assert.deepEqual(codesOf(missing), [['PACK_FILE_MISSING', 'prompts/missing.md']]);
});

test('a link that points out of the pack folder is refused', { skip: process.platform === 'win32' }, async () => {
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'secret.md'), 'x');
  const dir = await writePack(edit((s) => { s.prompts['leaf.plan'] = 'prompts/link.md'; }));
  await symlink(join(outside, 'secret.md'), join(dir, 'prompts', 'link.md'));
  assert.deepEqual(codesOf(await failure(loadYamlPack(dir, { checkers: CHECKERS }))), [['PACK_PATH_INVALID', 'prompts/link.md']]);
});

test('deterministic checks name a registered checker; model checks bring an instruction', async () => {
  const spec = edit((s) => {
    s.checks['demo.nobody'].run = 'ghost';
    delete s.checks['demo.critic'].instruction;
  });
  const error = await failure(loadYamlPack(await writePack(spec), { checkers: CHECKERS }));
  assert.deepEqual(codesOf(error), [['PACK_FIELD_MISSING', 'checks.demo.critic.instruction'], ['PACK_CHECKER_UNKNOWN', 'checks.demo.nobody.run']]);
});

test('a prompt must belong to a generate step of that node kind', async () => {
  const error = await failure(loadYamlPack(await writePack(edit((s) => { s.prompts['branch.draft'] = 'prompts/plan.md'; })), { checkers: CHECKERS }));
  assert.deepEqual(codesOf(error), [['PACK_PROMPT_STEP_UNKNOWN', 'prompts.branch.draft']]);
});

test('the pack name must be the expected one, and core lock rules still apply', async () => {
  assert.deepEqual(codesOf(await failure(loadYamlPack(await writePack(), { name: 'novel', checkers: CHECKERS }))), [['PACK_NAME_MISMATCH', 'name']]);
  const cut = await failure(loadYamlPack(await writePack(edit((s) => { s.pipelines.leaf[3].requires = []; })), { checkers: CHECKERS }));
  assert.equal(codesOf(cut)[0][0], 'PACK_FACTS_REQUIRES_EVENTS');
});

test('broken YAML is reported as such', async () => {
  assert.deepEqual(codesOf(await failure(loadYamlPack(await writePack('name: [unclosed'), { checkers: CHECKERS }))), [['PACK_YAML_INVALID', 'pack.yaml']]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/pack/yaml-pack.test.js`
Expected: FAIL — `Cannot find module '../../core/pack/yaml-pack.js'`

- [ ] **Step 3: `core/pack/yaml-schema.js` 작성**

```js
import { FINDING_SEVERITIES } from '../ledger/receipts.js';
import { CHECK_TIERS, MAX_LOOP, STEP_KINDS, STEP_MODES } from '../pipeline/define.js';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const str = (value) => (typeof value === 'string' ? value : '');
const TOP = ['name', 'version', 'title', 'description', 'presets', 'pipelines', 'prompts', 'checks', 'checkSets', 'defaultCheckSets'];
const STEP = ['id', 'kind', 'tier', 'stage', 'produces', 'requires', 'loop', 'mode'];
const PRODUCES = ['plan', 'draft', 'events', 'children'];
const CHECK = ['title', 'description', 'tier', 'stage', 'severity', 'requiresOrder', 'requiresParentPlan', 'requireQuote', 'experimental', 'config', 'instruction', 'run'];
const SET = ['title', 'description', 'checks', 'recommendedFor'];
const RECOMMEND = ['kinds', 'levels', 'roles', 'positions'];
const PRESET = ['title', 'description', 'levels', 'order', 'checkSets'];
const STEP_ID = /^[a-z][a-z0-9-]*$/;
/** 세트·검사·프리셋 id: 점으로 이은 소문자 조각. __proto__ 같은 이름은 데이터로도 받지 않는다. */
const SAFE_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;
const PROMPT_KEY = /^(leaf|branch)\.[a-z][a-z0-9-]*$/;

function unknownKeys(object, allowed, path, push) {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) push('PACK_FIELD_UNKNOWN', path ? `${path}.${key}` : key);
}

function readStep(step, at, push) {
  if (!isPlainObject(step)) { push('PACK_FIELD_INVALID', at); return null; }
  unknownKeys(step, STEP, at, push);
  if (typeof step.id !== 'string' || !STEP_ID.test(step.id)) push('PACK_FIELD_INVALID', `${at}.id`);
  if (!STEP_KINDS.includes(step.kind)) push('PACK_FIELD_INVALID', `${at}.kind`);
  if (step.kind === 'check' && !CHECK_TIERS.includes(step.tier)) push('PACK_FIELD_INVALID', `${at}.tier`);
  if (step.kind === 'generate' && !PRODUCES.includes(step.produces)) push('PACK_FIELD_INVALID', `${at}.produces`);
  if (step.stage !== undefined && typeof step.stage !== 'string') push('PACK_FIELD_INVALID', `${at}.stage`);
  if (step.requires !== undefined && !isStringList(step.requires)) push('PACK_FIELD_INVALID', `${at}.requires`);
  if (step.mode !== undefined && !STEP_MODES.includes(step.mode)) push('PACK_FIELD_INVALID', `${at}.mode`);
  if (step.loop !== undefined) {
    if (!isPlainObject(step.loop)) push('PACK_FIELD_INVALID', `${at}.loop`);
    else {
      unknownKeys(step.loop, ['until', 'max'], `${at}.loop`, push);
      if (!isStringList(step.loop.until) || !Number.isInteger(step.loop.max) || step.loop.max < 0 || step.loop.max > MAX_LOOP) push('PACK_FIELD_INVALID', `${at}.loop`);
    }
  }
  const { mode, ...rest } = structuredClone(step);
  return mode === undefined ? rest : { ...rest, mode };
}

function readPipelines(input, push) {
  if (!isPlainObject(input)) { push('PACK_FIELD_MISSING', 'pipelines'); return { leaf: [], branch: [] }; }
  unknownKeys(input, ['leaf', 'branch'], 'pipelines', push);
  const read = (kind) => {
    const list = input[kind];
    if (!Array.isArray(list) || list.length === 0) { push('PACK_FIELD_MISSING', `pipelines.${kind}`); return []; }
    return list.map((step, index) => readStep(step, `pipelines.${kind}[${index}]`, push)).filter(Boolean);
  };
  return { leaf: read('leaf'), branch: read('branch') };
}

function readPrompts(input, pipelines, push) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) { push('PACK_FIELD_INVALID', 'prompts'); return {}; }
  const out = {};
  for (const [key, path] of Object.entries(input)) {
    if (!PROMPT_KEY.test(key) || typeof path !== 'string') { push('PACK_FIELD_INVALID', `prompts.${key}`); continue; }
    const [kind, stepId] = key.split('.');
    if (!pipelines[kind].some((s) => s.id === stepId && s.kind === 'generate')) { push('PACK_PROMPT_STEP_UNKNOWN', `prompts.${key}`); continue; }
    out[key] = path;
  }
  return out;
}

function readCheck(id, check, push) {
  const at = `checks.${id}`;
  unknownKeys(check, CHECK, at, push);
  if (!CHECK_TIERS.includes(check.tier)) push('PACK_FIELD_INVALID', `${at}.tier`);
  if (typeof check.stage !== 'string' || !check.stage) push('PACK_FIELD_INVALID', `${at}.stage`);
  if (!FINDING_SEVERITIES.includes(check.severity)) push('PACK_FIELD_INVALID', `${at}.severity`);
  if (check.requiresOrder !== undefined && check.requiresOrder !== 'linear') push('PACK_FIELD_INVALID', `${at}.requiresOrder`);
  for (const flag of ['requiresParentPlan', 'requireQuote', 'experimental']) {
    if (check[flag] !== undefined && typeof check[flag] !== 'boolean') push('PACK_FIELD_INVALID', `${at}.${flag}`);
  }
  if (check.config !== undefined && !isPlainObject(check.config)) push('PACK_FIELD_INVALID', `${at}.config`);
  if (check.tier === 'model') {
    if (typeof check.instruction !== 'string' || !check.instruction) push('PACK_FIELD_MISSING', `${at}.instruction`);
    if (check.run !== undefined) push('PACK_FIELD_INVALID', `${at}.run`);
  }
  if (check.tier === 'deterministic') {
    if (typeof check.run !== 'string' || !check.run) push('PACK_FIELD_MISSING', `${at}.run`);
    if (check.instruction !== undefined) push('PACK_FIELD_INVALID', `${at}.instruction`);
  }
  return { id, ...structuredClone(check) };
}

function readChecks(input, push) {
  if (input === undefined) return [];
  if (!isPlainObject(input)) { push('PACK_FIELD_INVALID', 'checks'); return []; }
  const out = [];
  for (const [id, check] of Object.entries(input)) {
    if (!SAFE_ID.test(id) || !isPlainObject(check)) { push('PACK_FIELD_INVALID', `checks.${id}`); continue; }
    out.push(readCheck(id, check, push));
  }
  return out;
}

function readSets(input, push) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) { push('PACK_FIELD_INVALID', 'checkSets'); return {}; }
  const out = {};
  for (const [id, set] of Object.entries(input)) {
    const at = `checkSets.${id}`;
    if (!SAFE_ID.test(id) || !isPlainObject(set) || !isStringList(set.checks)) { push('PACK_FIELD_INVALID', at); continue; }
    unknownKeys(set, SET, at, push);
    const rf = set.recommendedFor;
    if (rf !== undefined) {
      if (!isPlainObject(rf)) push('PACK_FIELD_INVALID', `${at}.recommendedFor`);
      else {
        unknownKeys(rf, RECOMMEND, `${at}.recommendedFor`, push);
        for (const [key, value] of Object.entries(rf)) if (!isStringList(value)) push('PACK_FIELD_INVALID', `${at}.recommendedFor.${key}`);
      }
    }
    out[id] = { title: str(set.title) || id, description: str(set.description), checks: [...set.checks], ...(isPlainObject(rf) ? { recommendedFor: structuredClone(rf) } : {}) };
  }
  return out;
}

function readPresets(input, push) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) { push('PACK_FIELD_INVALID', 'presets'); return {}; }
  const out = {};
  for (const [id, preset] of Object.entries(input)) {
    const at = `presets.${id}`;
    if (!SAFE_ID.test(id) || !isPlainObject(preset)) { push('PACK_FIELD_INVALID', at); continue; }
    unknownKeys(preset, PRESET, at, push);
    if (!Array.isArray(preset.levels) || preset.levels.length === 0) push('PACK_FIELD_MISSING', `${at}.levels`);
    if (preset.order !== undefined && typeof preset.order !== 'string') push('PACK_FIELD_INVALID', `${at}.order`);
    if (preset.checkSets !== undefined && !isStringList(preset.checkSets)) push('PACK_FIELD_INVALID', `${at}.checkSets`);
    out[id] = structuredClone(preset);
  }
  return out;
}

/**
 * pack.yaml 을 팩 명세로 바꾼다(순수 함수). 선언만 받는다: 알 수 없는 키는 거부하고, 읽어야 할 글 경로는 files 로 돌려준다.
 * 잠금(locked)은 적을 수 없다 — 코어가 정한다. 결정론 검사는 이름(run)으로만 검사기를 가리킨다.
 * @returns {{ spec: object|null, files: string[], errors: Array<{ code: string, path: string }> }}
 */
export function readPackSpec(raw) {
  const errors = [];
  const push = (code, path) => errors.push({ code, path });
  if (!isPlainObject(raw)) { push('PACK_YAML_INVALID', 'pack.yaml'); return { spec: null, files: [], errors }; }
  unknownKeys(raw, TOP, '', push);
  if (typeof raw.name !== 'string' || !raw.name) push('PACK_FIELD_MISSING', 'name');
  if (raw.version !== undefined && (!Number.isInteger(raw.version) || raw.version < 1)) push('PACK_FIELD_INVALID', 'version');
  const pipelines = readPipelines(raw.pipelines, push);
  const prompts = readPrompts(raw.prompts, pipelines, push);
  const checks = readChecks(raw.checks, push);
  const checkSets = readSets(raw.checkSets, push);
  let defaultCheckSets = [];
  if (raw.defaultCheckSets !== undefined) {
    if (isStringList(raw.defaultCheckSets)) defaultCheckSets = [...raw.defaultCheckSets];
    else push('PACK_FIELD_INVALID', 'defaultCheckSets');
  }
  const presets = readPresets(raw.presets, push);
  const files = [...new Set([...Object.values(prompts), ...checks.filter((c) => typeof c.instruction === 'string').map((c) => c.instruction)])].sort();
  return {
    spec: { name: raw.name, version: raw.version ?? 1, title: str(raw.title), description: str(raw.description), presets, pipelines, prompts, checks, checkSets, defaultCheckSets },
    files, errors,
  };
}
```

- [ ] **Step 4: `core/pack/yaml-pack.js` 작성**

```js
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { parseYaml } from '../util/yaml.js';
import { readPackSpec } from './yaml-schema.js';
import { validatePack } from './validate.js';

export const PACK_FILE = 'pack.yaml';
const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

/** 팩 폴더 안의 .md 파일만 읽는다. 절대 경로·..·역슬래시·링크로 밖을 가리키는 것은 거부한다. */
async function readInside(dir, rel) {
  if (typeof rel !== 'string' || !rel || isAbsolute(rel) || rel.includes('\\') || normalize(rel).split(/[\\/]/).includes('..') || !rel.endsWith('.md')) {
    return { error: 'PACK_PATH_INVALID' };
  }
  let base;
  let real;
  try {
    base = await realpath(dir);
    real = await realpath(resolve(dir, rel));
  } catch (error) {
    if (error?.code === 'ENOENT') return { error: 'PACK_FILE_MISSING' };
    throw error;
  }
  if (!real.startsWith(base + sep) || !(await stat(real)).isFile()) return { error: 'PACK_PATH_INVALID' };
  return { text: await readFile(real, 'utf8') };
}

const refuse = (pack, errors) => new FolioError('PACK_INVALID', errors.map((e) => `${e.code}@${e.path ?? ''}`).join(', '), { pack, errors });

function assemble(spec, texts, checkers, yamlText) {
  const used = [...new Set(spec.checks.filter((c) => c.run).map((c) => c.run))].sort();
  const checks = spec.checks.map(({ run, instruction, ...check }) => ({
    ...check, origin: 'pack',
    ...(run ? { checker: run, run: checkers[run] } : {}),
    ...(instruction ? { instruction: texts.get(instruction) } : {}),
  }));
  const prompts = new Map(Object.entries(spec.prompts).map(([key, path]) => [key, texts.get(path)]));
  return {
    name: spec.name, version: spec.version, title: spec.title, description: spec.description, presets: spec.presets,
    pipelines: spec.pipelines, checks, checkSets: spec.checkSets, defaultCheckSets: spec.defaultCheckSets,
    /** 팩 프롬프트는 요청 재료에 instructions 로 얹는다(요청 digest 는 얹기 전 재료로 만든다 — core/run/payload.js). */
    prompt(step, payload) {
      const text = prompts.get(`${payload?.node?.kind}.${step.id}`);
      return text === undefined ? payload : { ...payload, instructions: text };
    },
    digest: sha256(canonicalJson({
      yaml: yamlText, files: [...texts.entries()].sort(byKey), checkers: used.map((id) => [id, String(checkers[id])]),
    })),
  };
}

/**
 * 파일 팩을 읽어 코어 Pack 모양으로 조립한다.
 * - pack.yaml: 선언(단계·검사·세트·프리셋·프롬프트 경로). 알 수 없는 키는 거부한다.
 * - *.md: 팩 폴더 안의 글. 모델 검사의 instruction 은 글 내용이 된다(checksDigest 에 든다).
 * - 결정론 검사는 checkers(코드로 등록한 이름 → 함수)에서 이름으로만 찾는다.
 * - digest: pack.yaml·읽은 글·쓰는 검사기 소스. 파이프라인 digest 에 들어간다(바뀌면 열린 실행은 검사부터 다시).
 * 마지막으로 코어 팩 규칙(validatePack: 잠금·접두어·중복)을 통과해야 한다.
 * @param {string} dir
 * @param {{ name?: string|null, checkers?: Record<string, (ctx: any) => any[]> }} [options]
 */
export async function loadYamlPack(dir, { name = null, checkers = {} } = {}) {
  let yamlText;
  try { yamlText = await readFile(join(dir, PACK_FILE), 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') throw refuse(name, [{ code: 'PACK_FILE_MISSING', path: PACK_FILE }]);
    throw error;
  }
  let raw;
  try { raw = parseYaml(yamlText); } catch { throw refuse(name, [{ code: 'PACK_YAML_INVALID', path: PACK_FILE }]); }
  const { spec, files, errors } = readPackSpec(raw);
  if (!spec) throw refuse(name, errors);
  if (name && spec.name !== name) errors.push({ code: 'PACK_NAME_MISMATCH', path: 'name' });
  const texts = new Map();
  for (const file of files) {
    const read = await readInside(dir, file);
    if (read.error) errors.push({ code: read.error, path: file });
    else texts.set(file, read.text);
  }
  for (const check of spec.checks) {
    if (typeof check.run === 'string' && !Object.hasOwn(checkers, check.run)) errors.push({ code: 'PACK_CHECKER_UNKNOWN', path: `checks.${check.id}.run` });
  }
  if (errors.length) throw refuse(spec.name, errors);
  const pack = assemble(spec, texts, checkers, yamlText);
  const core = validatePack(pack);
  if (core.length) throw refuse(spec.name, core.map((e) => ({ path: 'pipelines', ...e })));
  return pack;
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/pack/yaml-pack.test.js`
Expected: PASS (9 tests; Windows에서는 링크 테스트 1개 skip)

- [ ] **Step 6: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add core/pack/yaml-schema.js core/pack/yaml-pack.js test/pack/yaml-pack.test.js
git commit -m "$(cat <<'EOF'
feat(core): load declarative packs from pack.yaml, markdown and named checkers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C4: 최소 소설 팩 (`packs/novel`)

**Files:**
- Create: `packs/novel/pack.yaml`
- Create: `packs/novel/prompts/leaf-plan.md`, `draft.md`, `extract.md`, `revise.md`, `branch-plan.md`, `children.md`
- Create: `packs/novel/checks/fixed-facts.md`, `critic.md`, `episode-hook.md`, `parent-fit.md`, `promise-kept.md`
- Create: `packs/novel/checkers/dead-on-stage.js`, `packs/novel/checkers/index.js`
- Create: `packs/novel/index.js`, `packs/index.js`
- Modify: `packs/novel/README.md`
- Modify: `test/core/no-model-calls.test.js` (`packs/`도 본다)
- Modify: `tsconfig.json` (`packs/**/*.js`)
- Test: `test/pack/novel-pack.test.js`

**Interfaces:**
- Consumes: `loadYamlPack`(Task C3).
- Produces:
  - `NOVEL_PACK_DIR`, `loadNovelPack(): Promise<Pack>` (`packs/novel/index.js`).
  - `loadBuiltinPacks(): Promise<Map<string, Pack>>` (`packs/index.js`) — 지금은 `novel` 하나. 서버·테스트가 쓴다.
  - `deadOnStage(ctx)` — 앞 노드에서 `state` 사건으로 죽은(`data.vital: dead`) 엔티티가 이 노드에 등장하면 `DEAD_ON_STAGE`. 뒤에 `alive` 사건이 있거나 이 원고에서 되살리면(`draftEvents`의 `state`/`alive`) 지적하지 않는다(vibelore `DEAD_CHARACTER_ON_STAGE`의 뜻을 옮김).
  - `NOVEL_CHECKERS = { 'dead-on-stage': deadOnStage }`.
  - 프리셋 `serial`(arc→episode), `novel`(book→chapter→scene), `scene`(scene 하나). 세트 `novel.basic`(기본), `novel.serial`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/pack/novel-pack.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { NOVEL_PACK_DIR } from '../../packs/novel/index.js';
import { deadOnStage } from '../../packs/novel/checkers/dead-on-stage.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { createRunner } from '../../core/run/runner.js';
import { copyFixture, seedEvents } from '../support/fixtures.js';
import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

test('the novel pack loads and opens the serial fixture with its sets and the core locks', async () => {
  const packs = await loadBuiltinPacks();
  assert.deepEqual([...packs.keys()], ['novel']);
  const novel = packs.get('novel');
  assert.deepEqual(Object.keys(novel.presets), ['serial', 'novel', 'scene']);
  assert.deepEqual(novel.defaultCheckSets, ['novel.basic']);
  const root = await copyFixture('serial-2level');
  const ws = await openWorkspace(root, { packs });
  assert.deepEqual(ws.checks.map((c) => c.id).filter((id) => id.startsWith('novel.')).sort(), [
    'novel.critic', 'novel.dead-on-stage', 'novel.episode-hook', 'novel.fixed-facts', 'novel.parent-fit', 'novel.promise-kept',
  ]);
  assert.ok(ws.checks.some((c) => c.id === 'core.promise-order'));
  assert.deepEqual(ws.pipelines.leaf.steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  assert.deepEqual(ws.pipelines.branch.steps.filter((s) => s.locked).map((s) => s.id), ['commit']);
});

test('dead-on-stage: a prior death blocks an appearance unless someone revives them', () => {
  const dead = { entityId: 'doyun', kind: 'state', data: { vital: 'dead' } };
  const base = { priorEvents: [dead], appearances: ['doyun', 'hana'], draftEvents: [] };
  assert.deepEqual(deadOnStage(base).map((f) => [f.code, f.entityId]), [['DEAD_ON_STAGE', 'doyun']]);
  assert.deepEqual(deadOnStage({ ...base, draftEvents: [{ entityId: 'doyun', kind: 'state', data: { vital: 'alive' } }] }), []);
  assert.deepEqual(deadOnStage({ ...base, priorEvents: [dead, { ...dead, data: { vital: 'alive' } }] }), []);
  assert.deepEqual(deadOnStage({ ...base, priorEvents: [] }), []);
});

test('with the novel pack, ep-004 (the dead doyun on stage) is blocked and cannot be approved', async () => {
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  const packs = await loadBuiltinPacks();
  const mk = () => createRunner({ root, packs });
  const first = await mk().run({ node: 'ep-004' });
  assert.equal(label(first), 'model:plan');
  assert.equal(first.requests[0].payload.instructions, await readFile(join(NOVEL_PACK_DIR, 'prompts', 'leaf-plan.md'), 'utf8'));
  const blocked = (await driveToEnd(mk, createFakeHost(), { from: first, until: (o) => o.status === 'needs_user' })).at(-1);
  assert.equal(label(blocked), 'user:blocked');
  assert.equal(blocked.question.canApprove, false);
  assert.deepEqual(blocked.question.blocking.map((f) => f.code), ['DEAD_ON_STAGE']);
  await assert.rejects(mk().decide({ runId: blocked.runId, action: 'approve', reason: '괜찮다' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
});
```

`test/core/no-model-calls.test.js`의 마지막 테스트를 `core`와 `packs`를 함께 보도록 바꾼다(assert는 약화하지 않는다):
```js
test('core and packs never call a model or the network', async () => {
  for (const dir of ['core', 'packs']) {
    const offenders = [];
    let files = 0;
    for await (const file of walk(dir)) {
      files += 1;
      const text = await readFile(file, 'utf8');
      const code = stripComments(text);
      for (const pattern of FORBIDDEN) if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
    }
    assert.ok(files > 0, `${dir}/ has no .js files`);
    assert.deepEqual(offenders, []);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/pack/novel-pack.test.js test/core/no-model-calls.test.js`
Expected: FAIL — `Cannot find module '../../packs/index.js'`, 그리고 `packs/ has no .js files`

- [ ] **Step 3: `packs/novel/pack.yaml` 작성**

```yaml
name: novel
version: 1
title: 소설
description: 장편·연재·단편 소설. 죽은 인물 등장 같은 사실 충돌을 막고, 계획·원고·사건 추출 순서로 쓴다.
presets:
  serial:
    title: 연재
    description: 아크 아래 회차를 쓴다.
    levels:
      - { name: arc, children: [1, 60] }
      - { name: episode, leaf: true }
    checkSets: [novel.basic, novel.serial]
  novel:
    title: 장편
    description: 권·장·장면으로 쓴다.
    levels:
      - { name: book, children: [1, 10] }
      - { name: chapter, children: [1, 40] }
      - { name: scene, leaf: true }
    checkSets: [novel.basic]
  scene:
    title: 단편
    description: 장면만 늘어놓는다.
    levels:
      - { name: scene, leaf: true }
    checkSets: [novel.basic]
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
  branch.revise: prompts/revise.md
  branch.children: prompts/children.md
checks:
  novel.dead-on-stage:
    title: 죽은 인물 등장
    description: 앞에서 죽은 인물이 되살아나는 사건 없이 다시 등장하면 막는다.
    tier: deterministic
    stage: facts
    severity: hard
    requiresOrder: linear
    run: dead-on-stage
  novel.fixed-facts:
    title: 고정 설정 위반
    description: 엔티티 설정 문서의 고정 사실과 원고가 어긋나면 막는다. 원고 인용이 있어야 한다.
    tier: model
    stage: critic
    severity: hard
    requireQuote: true
    instruction: checks/fixed-facts.md
  novel.critic:
    title: 원고 검토
    description: 읽는 사람 입장에서 걸리는 곳. 참고 의견일 뿐 자동으로 고치지 않는다.
    tier: model
    stage: critic
    severity: advisory
    instruction: checks/critic.md
  novel.episode-hook:
    title: 회차 끝 당김
    description: 회차 끝이 다음 화를 읽고 싶게 하는지.
    tier: model
    stage: critic
    severity: advisory
    experimental: true
    instruction: checks/episode-hook.md
  novel.parent-fit:
    title: 윗계획 맞춤
    description: 이 계획이 윗계획의 약속을 지키는지.
    tier: model
    stage: fit
    severity: block
    requiresParentPlan: true
    instruction: checks/parent-fit.md
  novel.promise-kept:
    title: 계획 이행
    description: 끝난 자식들이 이 계획을 지켰는지.
    tier: model
    stage: review
    severity: advisory
    instruction: checks/promise-kept.md
checkSets:
  novel.basic:
    title: 소설 기본
    description: 사실 충돌을 막고 원고·계획을 검토한다.
    checks: [novel.dead-on-stage, novel.fixed-facts, novel.critic, novel.parent-fit, novel.promise-kept]
    recommendedFor: { kinds: [novel, serial] }
  novel.serial:
    title: 연재 회차
    description: 회차 끝 당김(실험).
    checks: [novel.episode-hook]
    recommendedFor: { kinds: [serial], levels: [episode] }
defaultCheckSets: [novel.basic]
```

- [ ] **Step 4: 프롬프트와 검사 글 작성**

`packs/novel/prompts/leaf-plan.md`:
```md
이 노드(장면·회차)의 짧은 계획을 쓴다.

- 윗계획(upperPlans)이 약속한 것 가운데 이 노드가 맡을 것을 고른다.
- 등장할 인물과 그들의 지금 상태(priorEvents)를 확인한다. 죽은 인물은 되살리는 사건 없이 등장시키지 않는다.
- 다섯 줄 안쪽: 무엇이 일어나는지, 누가 나오는지, 끝에서 무엇이 바뀌는지.

계획 글만 답한다.
```

`packs/novel/prompts/draft.md`:
```md
계획(plan)대로 이 노드의 원고를 쓴다.

- 엔티티 설정(entities)의 고정 사실을 지킨다.
- 앞 노드의 사건(priorEvents)과 어긋나지 않게 쓴다.
- 원고 본문만 답한다. 제목·설명·머리말을 붙이지 않는다.
```

`packs/novel/prompts/extract.md`:
````md
원고(draft)에서 사건과 등장을 뽑아 JSON 하나로만 답한다.

```json
{
  "events": [
    { "entityId": "doyun", "kind": "state", "data": { "vital": "dead" }, "quote": "원고 속 문장 그대로" }
  ],
  "appearances": ["doyun"],
  "mentions": ["hana"]
}
```

- `entityId`는 entities 목록의 id만 쓴다. 없는 인물은 적지 않는다.
- `kind`:
  - `state` — 생사·상태 변화. `data.vital`은 `dead` 또는 `alive`.
  - `promise.planted` · `promise.advanced` · `promise.misdirected` · `promise.resolved` · `promise.closed` · `promise.parked` — 약속(떡밥)의 단계.
- `quote`를 적으면 원고에 그대로 있는 문장이어야 한다.
- `appearances`는 장면에 직접 나오는 인물, `mentions`는 이름만 나오는 인물이다.
- 사건이 없으면 `"events": []`.
````

`packs/novel/prompts/revise.md`:
```md
원고(draft)를 고친다.

- blocking에 있는 지적만 고친다. 참고 의견(advisory)은 이 단계의 사유가 아니다.
- feedback이 있으면 작가의 요청이다. 그것을 따른다.
- 나머지는 그대로 둔다. 고친 원고 전체만 답한다.
```

`packs/novel/prompts/branch-plan.md`:
```md
이 묶음(권·장·아크)의 계획을 쓴다.

- 윗계획(upperPlans)이 있으면 그 약속을 지킨다.
- 이미 있는 자식(children)이 있으면 그 흐름을 존중한다.
- 열 줄 안쪽: 시작 상태, 큰 사건, 끝 상태, 심을 약속과 거둘 약속.

계획 글만 답한다.
```

`packs/novel/prompts/children.md`:
````md
계획(plan)을 자식 노드(childLevel)로 나눈다. JSON 하나로만 답한다.

```json
{ "children": [ { "id": "ep-1", "title": "1화", "brief": "한 줄 요약" } ] }
```

- 개수는 childLevel.range 안이어야 한다.
- `id`는 소문자·숫자·하이픈. 이미 있는 id를 쓰지 않는다. 비워 두면 엔진이 만든다.
````

`packs/novel/checks/fixed-facts.md`:
```md
엔티티 설정 문서(entities의 body)에 적힌 고정 사실(나이, 관계, 능력, 과거 사건)과 원고가 어긋나는 곳을 찾는다.
지적마다 원고 문장을 그대로 인용한다(quote). 인용할 수 없으면 지적하지 않는다.
해석이나 취향은 지적하지 않는다.
```

`packs/novel/checks/critic.md`:
```md
읽는 사람 입장에서 걸리는 곳(흐름이 끊김, 동기가 흐림, 같은 말 반복)을 짧게 적는다.
참고 의견이다. 원고를 고치라고 요구하지 않는다.
```

`packs/novel/checks/episode-hook.md`:
```md
회차 마지막 몇 문장이 다음 화를 읽고 싶게 하는지 본다. 약하면 이유를 한 줄로 적는다.
```

`packs/novel/checks/parent-fit.md`:
```md
이 계획이 윗계획(upperPlans)의 약속을 지키는지 본다. 빠뜨리거나 어긋난 약속만 적는다.
```

`packs/novel/checks/promise-kept.md`:
```md
끝난 자식들(children)의 본문이 이 계획을 지켰는지 본다. 지키지 않은 항목만 적는다.
```

- [ ] **Step 5: 검사기·로더 작성**

`packs/novel/checkers/dead-on-stage.js`:
```js
/**
 * 죽은 인물 등장(vibelore DEAD_CHARACTER_ON_STAGE 의 뜻을 옮김).
 * 앞 노드의 state 사건으로 죽은(vital: dead) 엔티티가 이 노드에 등장하면 지적한다.
 * 뒤에 되살아났거나(vital: alive) 이 원고가 되살리면 지적하지 않는다. 등급(hard)은 pack.yaml 이 정한다.
 * @param {{ priorEvents: any[], draftEvents: any[], appearances: string[] }} ctx
 */
export function deadOnStage(ctx) {
  const dead = new Set();
  for (const event of ctx.priorEvents ?? []) {
    if (event.kind !== 'state') continue;
    if (event.data?.vital === 'dead') dead.add(event.entityId);
    if (event.data?.vital === 'alive') dead.delete(event.entityId);
  }
  const revived = new Set((ctx.draftEvents ?? []).filter((e) => e.kind === 'state' && e.data?.vital === 'alive').map((e) => e.entityId));
  return (ctx.appearances ?? []).filter((id) => dead.has(id) && !revived.has(id))
    .map((id) => ({ code: 'DEAD_ON_STAGE', message: `${id}: 앞에서 죽은 인물이 되살아나는 사건 없이 등장한다`, entityId: id }));
}
```

`packs/novel/checkers/index.js`:
```js
import { deadOnStage } from './dead-on-stage.js';

/** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. */
export const NOVEL_CHECKERS = Object.freeze({ 'dead-on-stage': deadOnStage });
```

`packs/novel/index.js`:
```js
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { NOVEL_CHECKERS } from './checkers/index.js';

export const NOVEL_PACK_DIR = import.meta.dirname;

/** 소설 팩: pack.yaml + 글 + 이름으로 등록한 검사기. */
export const loadNovelPack = () => loadYamlPack(NOVEL_PACK_DIR, { name: 'novel', checkers: NOVEL_CHECKERS });
```

`packs/index.js`:
```js
import { loadNovelPack } from './novel/index.js';

/** 내장 팩(이름 → Pack). work.yaml 의 packs 가 이 이름을 가리킨다. */
export async function loadBuiltinPacks() {
  const novel = await loadNovelPack();
  return new Map([[novel.name, novel]]);
}
```

`packs/novel/README.md` 전체를 바꾼다:
```md
# novel pack

소설(장편·연재·단편) 팩. 선언은 `pack.yaml`, 글은 `prompts/`·`checks/`, 결정론 검사기는 `checkers/`(이름으로 등록).

- 프리셋: `serial`(arc → episode), `novel`(book → chapter → scene), `scene`(scene).
- 세트: `novel.basic`(기본) — 죽은 인물 등장(hard), 고정 설정 위반(hard, 인용 필수), 원고 검토(참고), 윗계획 맞춤(block), 계획 이행(참고). `novel.serial` — 회차 끝 당김(실험, 참고).
- 잠금 단계는 코어가 정한다. `pack.yaml`에 `locked`를 적을 수 없다.
- vibelore 검사기 약 30개의 이식은 M5다.
```

`tsconfig.json`의 `include`를 바꾼다:
```json
  "include": ["core/**/*.js", "packs/**/*.js"]
```

- [ ] **Step 6: 통과 확인**

Run: `node --test test/pack/novel-pack.test.js test/core/no-model-calls.test.js`
Expected: PASS

- [ ] **Step 7: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add packs test/pack/novel-pack.test.js test/core/no-model-calls.test.js tsconfig.json
git commit -m "$(cat <<'EOF'
feat(packs): add the minimal novel pack with presets, prompts and the dead-on-stage checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C5: 새 작품 만들기 (`initWork`)

**Files:**
- Create: `core/work/init.js`
- Test: `test/core/init.test.js`

**Interfaces:**
- Consumes: `validateWorkConfig`, `resolvePacks`, `openWorkspace`, `stringifyYaml`, `writeFileAtomic`.
- Produces: `initWork(root, { title, packs, preset = null, available }): Promise<{ created: boolean, root, config? }>`.
  - `work.yaml`이 이미 있으면 아무것도 쓰지 않고 `{ created: false, root }`(덮어쓰지 않는다).
  - `preset`은 첫 팩의 `presets`에서 찾는다. 없으면 `PRESET_UNKNOWN`(`details.presets`: 고를 수 있는 id). 프리셋 없이 부르면 `PRESET_REQUIRED`.
  - 팩 이름이 틀리면 `resolvePacks`의 `PACK_UNKNOWN`/`PACK_REQUIRED`. 설정이 틀리면 `CONFIG_INVALID`.
  - `tree/`, `entities/`, `checks/`를 만들고 `work.yaml`에 `{ title, levels, order?, packs, checkSets? }`를 쓴다. 끝나면 `openWorkspace`로 한 번 열어 본다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/core/init.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initWork } from '../../core/work/init.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { parseYaml } from '../../core/util/yaml.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { tempDir } from '../support/fixtures.js';

test('initWork creates a work from a pack preset and it opens', async () => {
  const available = await loadBuiltinPacks();
  const root = join(await tempDir('folio-init-'), '유리 등대');
  const out = await initWork(root, { title: '유리 등대', packs: ['novel'], preset: 'serial', available });
  assert.equal(out.created, true);
  const yaml = parseYaml(await readFile(join(root, 'work.yaml'), 'utf8'));
  assert.deepEqual(yaml, {
    title: '유리 등대', levels: [{ name: 'arc', children: [1, 60] }, { name: 'episode', leaf: true }], packs: ['novel'], checkSets: ['novel.basic', 'novel.serial'],
  });
  for (const dir of ['tree', 'entities', 'checks']) assert.ok((await stat(join(root, dir))).isDirectory(), dir);
  const ws = await openWorkspace(root, { packs: available });
  assert.equal(ws.work.tree.nodes.size, 0);
});

test('initWork never overwrites an existing work', async () => {
  const available = await loadBuiltinPacks();
  const root = await tempDir('folio-init-');
  await writeFile(join(root, 'work.yaml'), 'title: 원래 작품\n');
  const out = await initWork(root, { title: '새 작품', packs: ['novel'], preset: 'serial', available });
  assert.deepEqual(out, { created: false, root });
  assert.equal(await readFile(join(root, 'work.yaml'), 'utf8'), 'title: 원래 작품\n');
});

test('initWork refuses unknown presets and packs before writing anything', async () => {
  const available = await loadBuiltinPacks();
  const root = join(await tempDir('folio-init-'), 'w');
  await assert.rejects(initWork(root, { title: 't', packs: ['novel'], preset: 'epic', available }),
    (e) => e.code === 'PRESET_UNKNOWN' && e.details.presets.join() === 'serial,novel,scene');
  await assert.rejects(initWork(root, { title: 't', packs: ['novel'], preset: null, available }), { code: 'PRESET_REQUIRED' });
  await assert.rejects(initWork(root, { title: 't', packs: ['poetry'], preset: 'serial', available }), { code: 'PACK_UNKNOWN' });
  await assert.rejects(initWork(root, { title: 't', packs: [], preset: 'serial', available }), { code: 'PACK_REQUIRED' });
  await assert.rejects(stat(root), { code: 'ENOENT' });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/core/init.test.js`
Expected: FAIL — `Cannot find module '../../core/work/init.js'`

- [ ] **Step 3: `core/work/init.js` 작성**

```js
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { writeFileAtomic } from '../util/fs.js';
import { stringifyYaml } from '../util/yaml.js';
import { resolvePacks } from '../pack/registry.js';
import { openWorkspace } from '../run/workspace.js';
import { validateWorkConfig } from './config.js';
import { ENTITIES_DIR } from '../store/entities.js';
import { TREE_DIR } from '../store/tree.js';
import { CHECKS_DIR } from '../checks/check-sources.js';

const exists = async (path) => stat(path).then(() => true, (error) => {
  if (error?.code === 'ENOENT') return false;
  throw error;
});

/**
 * 새 작품 폴더를 만든다. 레벨·순서·검사 세트는 첫 팩의 프리셋에서 가져온다(작가가 고른 것).
 * work.yaml 이 이미 있으면 아무것도 쓰지 않는다 — 덮어쓰지 않는다.
 * 쓰기 전에 팩·프리셋·설정을 모두 검증한다.
 * @param {string} root
 * @param {{ title: string, packs: string[], preset?: string|null, available: Map<string, any> }} options
 */
export async function initWork(root, { title, packs, preset = null, available }) {
  if (await exists(join(root, 'work.yaml'))) return { created: false, root };
  const registry = resolvePacks(packs, available);
  const presets = registry.primary.presets ?? {};
  if (!preset) throw new FolioError('PRESET_REQUIRED', 'choose a preset', { presets: Object.keys(presets) });
  if (!Object.hasOwn(presets, preset)) throw new FolioError('PRESET_UNKNOWN', preset, { presets: Object.keys(presets) });
  const chosen = presets[preset];
  const config = {
    title, levels: structuredClone(chosen.levels), ...(chosen.order !== undefined ? { order: chosen.order } : {}),
    packs: [...packs], ...(chosen.checkSets !== undefined ? { checkSets: [...chosen.checkSets] } : {}),
  };
  const { errors } = validateWorkConfig(config);
  if (errors.length) throw new FolioError('CONFIG_INVALID', errors.map((e) => e.code).join(', '), { errors });
  for (const dir of [TREE_DIR, ENTITIES_DIR, CHECKS_DIR]) await mkdir(join(root, dir), { recursive: true });
  await writeFileAtomic(join(root, 'work.yaml'), stringifyYaml(config));
  await openWorkspace(root, { packs: available });
  return { created: true, root, config };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/core/init.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add core/work/init.js test/core/init.test.js
git commit -m "$(cat <<'EOF'
feat(core): create a new work from a pack preset without overwriting an existing one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C6: 도구 층 (`server/toolbox.js` — 이름으로 부르고, 던지지 않는다)

**Files:**
- Create: `server/validate-input.js`
- Create: `server/tools/definitions.js`
- Create: `server/tools/handlers.js`
- Create: `server/tools/find.js`
- Create: `server/tools/config.js`
- Create: `server/toolbox.js`
- Test: `test/server/tools.test.js`

**Interfaces:**
- Consumes: `createRunner`, `workStatus`, `createRunStore`, `outcomeFromPending`, `changeStructure`(C2), `initWork`(C5), `loadBuiltinPacks`(C4), `openWorkspace`, `describeCheckSets`, `recommendCheckSets`, `stagesByTier`, `validateUserCheckDraft`, `openWork`, `withWorkLock`, `rebuildIndex`, `openIndex`/`usagesOf`/`eventsFor`.
- Produces:
  - `validateInput(schema, value, path = '$'): Array<{ path, message }>` — JSON Schema 부분(`type` object/array/string/integer/boolean, `properties`, `required`, `additionalProperties` false|schema, `enum`, `items`, `minLength`, `minItems`, `minimum`).
  - `BASE_TOOL_NAMES` = `folio_init, folio_status, folio_run, folio_resume, folio_decide, folio_structure, folio_find, folio_view`. `TOOLS` = 그 여덟 + `folio_config`(고급 도구 하나). 모든 도구가 `root`(절대 경로)를 요구하고 `additionalProperties: false`.
  - `createToolbox({ packs, handlers? }) → { tools, call(name, args) }`. `call`은 던지지 않는다: `{ ok: true, result }` 또는 `{ ok: false, error: { code, message, details } }`. 코드 `TOOL_UNKNOWN`, `TOOL_INPUT_INVALID`, `ROOT_NOT_ABSOLUTE`, 코어 오류 코드 그대로, 그 밖은 `INTERNAL_ERROR`.
  - `folio_status` 결과 = `workStatus` + `pending`(열린 실행의 지금 질문, `outcomeFromPending` 모양, 없으면 null).
  - `folio_structure` 인자: add `{ level, id, parentId?, title?, brief?, index? }`, move `{ nodeId, parentId?, index? }`, wrap `{ nodeIds, level, id, title? }`. 어긋나면 `STRUCTURE_ARGS_INVALID`(`details: { op, missing, extra }`).
  - `findInWork(root, { query, id })` — `node` → `{ node }`, `entity` → `{ entity }`, `usages` → `{ entityId, usages }`, `events` → `{ entityId, events }`. 뒤의 둘은 작업 잠금 안에서 `index.db`를 다시 만든 뒤 읽는다. `NODE_NOT_FOUND`, `ENTITY_NOT_FOUND`.
  - `describeConfig(root, { packs, checkDraft? })` → `{ title, levels, packs, pipelines: { <level>: { digest, steps } }, checkSets, recommended, checks, stages, options, checkDraft? }`. 읽기 전용.
  - `folio_view` → `{ status: 'unavailable', code: 'VIEWER_NOT_BUILT' }`(M6).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/server/tools.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { BASE_TOOL_NAMES, TOOLS } from '../../server/tools/definitions.js';
import { validateInput } from '../../server/validate-input.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { copyFixture, seedEvents, tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

const box = async () => createToolbox({ packs: await loadBuiltinPacks() });
const ok = (out) => {
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
};
const code = (out) => (out.ok ? 'ok' : out.error.code);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (path.endsWith('.js')) yield path;
  }
}

test('the tool list: eight base tools and one advanced tool, each needing an absolute root and nothing else', () => {
  assert.deepEqual(BASE_TOOL_NAMES, ['folio_init', 'folio_status', 'folio_run', 'folio_resume', 'folio_decide', 'folio_structure', 'folio_find', 'folio_view']);
  assert.deepEqual(TOOLS.map((t) => t.name), [...BASE_TOOL_NAMES, 'folio_config']);
  for (const tool of TOOLS) {
    assert.ok(tool.inputSchema.required.includes('root'), tool.name);
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    assert.ok(tool.description.length > 0, tool.name);
  }
});

test('input validation names the path of every problem', () => {
  const schema = TOOLS.find((t) => t.name === 'folio_resume').inputSchema;
  assert.deepEqual(validateInput(schema, { root: '/w', runId: 'r', answers: { a: 1 }, extra: true }).map((e) => e.path), ['$.answers.a', '$.extra']);
  assert.deepEqual(validateInput(schema, { root: '/w' }).map((e) => [e.path, e.message]), [['$.runId', 'is required'], ['$.answers', 'is required']]);
  assert.deepEqual(validateInput({ type: 'integer', minimum: 0 }, -1).map((e) => e.message), ['must be >= 0']);
  assert.deepEqual(validateInput({ type: 'string', enum: ['a'] }, 'b').map((e) => e.message), ['must be one of a']);
});

test('the toolbox never throws: unknown tools, bad input and relative roots come back as errors', async () => {
  const tools = await box();
  assert.equal(code(await tools.call('folio_write', { root: '/w' })), 'TOOL_UNKNOWN');
  assert.equal(code(await tools.call('folio_run', { root: '/w', mode: 'fast' })), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_status', {})), 'TOOL_INPUT_INVALID');
  assert.equal(code(await tools.call('folio_status', { root: 'relative/work' })), 'ROOT_NOT_ABSOLUTE');
  assert.equal(code(await tools.call('folio_status', { root: join(await tempDir('folio-none-'), 'missing') })), 'WORK_NOT_FOUND');
  assert.deepEqual(ok(await tools.call('folio_view', { root: '/w' })), { status: 'unavailable', code: 'VIEWER_NOT_BUILT', message: '뷰어는 아직 없다(M6).' });
});

test('init, structure, run and status work together; structure refuses while a question is open', async () => {
  const tools = await box();
  const root = join(await tempDir('folio-tools-'), 'work');
  assert.equal(ok(await tools.call('folio_init', { root, title: '유리 등대', preset: 'serial' })).created, true);
  assert.equal(ok(await tools.call('folio_init', { root, title: '다른 제목', preset: 'serial' })).created, false);
  assert.equal(code(await tools.call('folio_structure', { root, op: 'add', level: 'arc' })), 'STRUCTURE_ARGS_INVALID');
  assert.equal(code(await tools.call('folio_structure', { root, op: 'move', nodeId: 'x', level: 'arc' })), 'STRUCTURE_ARGS_INVALID');
  const added = ok(await tools.call('folio_structure', { root, op: 'add', level: 'arc', id: 'arc-1', title: '첫 아크' }));
  assert.deepEqual(added.outline.map((n) => n.id), ['arc-1']);
  const asked = ok(await tools.call('folio_run', { root }));
  assert.equal(label(asked), 'model:plan');
  assert.equal(asked.requests[0].payload.node.id, 'arc-1');
  const status = ok(await tools.call('folio_status', { root }));
  assert.deepEqual(status.activeRun, { runId: asked.runId, nodeId: 'arc-1', state: 'awaiting_model' });
  assert.deepEqual(status.pending, JSON.parse(JSON.stringify(asked)));
  assert.equal(code(await tools.call('folio_structure', { root, op: 'add', level: 'arc', id: 'arc-2' })), 'STRUCTURE_RUN_OPEN');
  assert.equal(code(await tools.call('folio_resume', { root, runId: asked.runId, answers: {} })), 'ANSWERS_INCOMPLETE');
});

test('find reads nodes and entities, and usages and events from a fresh index', async () => {
  const tools = await box();
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  assert.equal(ok(await tools.call('folio_find', { root, query: 'node', id: 'ep-004' })).node.title, '4화');
  assert.equal(ok(await tools.call('folio_find', { root, query: 'entity', id: 'doyun' })).entity.kind, 'character');
  assert.ok(ok(await tools.call('folio_find', { root, query: 'usages', id: 'doyun' })).usages.some((u) => u.surfaceId === 'ep-004'));
  assert.deepEqual(ok(await tools.call('folio_find', { root, query: 'events', id: 'doyun' })).events, [{ eventId: 'seed-2', nodeId: 'ep-002', kind: 'state' }]);
  assert.equal(code(await tools.call('folio_find', { root, query: 'node', id: 'ep-999' })), 'NODE_NOT_FOUND');
  assert.equal(code(await tools.call('folio_find', { root, query: 'usages', id: 'nobody' })), 'ENTITY_NOT_FOUND');
});

test('config shows steps per level, sets and checks, and validates a check draft against this work', async () => {
  const tools = await box();
  const root = await copyFixture('serial-2level');
  const config = ok(await tools.call('folio_config', { root }));
  assert.deepEqual(Object.keys(config.pipelines), ['arc', 'episode']);
  assert.deepEqual(config.pipelines.episode.steps.filter((s) => s.locked).map((s) => s.id), ['draft', 'extract', 'facts', 'commit']);
  assert.deepEqual(config.checkSets.filter((s) => s.selected).map((s) => s.id), ['novel.basic', 'novel.serial']);
  assert.ok(config.checks.some((c) => c.id === 'core.promise-order' && c.locked));
  assert.deepEqual(config.stages, { deterministic: ['facts'], model: ['critic', 'fit', 'review'] });
  assert.equal(config.checkDraft, undefined);
  const good = ok(await tools.call('folio_config', { root, checkDraft: { id: 'no-destiny', words: ['운명처럼'] } })).checkDraft;
  assert.equal(good.ok, true);
  const bad = ok(await tools.call('folio_config', { root, checkDraft: { id: 'no-destiny', words: ['운명처럼'], stage: 'critic' } })).checkDraft;
  assert.deepEqual(bad.errors.map((e) => e.code), ['USER_CHECK_STAGE_INVALID']);
});

const BANNED = ['core/run/commit.js', 'core/run/recheck-commit.js', 'core/structure/ops.js', 'core/ledger/ledger.js', 'core/store/tree.js'];

test('server code never imports the commit path, the structure writers, the ledgers or the tree store directly', async () => {
  const offenders = [];
  let files = 0;
  for (const dir of ['server']) {
    for await (const file of walk(dir)) {
      files += 1;
      const text = await readFile(file, 'utf8');
      for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        if (!spec.startsWith('.')) continue;
        const target = relative(process.cwd(), resolve(dirname(file), spec)).split(sep).join('/');
        if (BANNED.includes(target)) offenders.push(`${file} -> ${target}`);
      }
    }
  }
  assert.ok(files > 0);
  assert.deepEqual(offenders, []);
});

test('only server/ imports the MCP SDK', async () => {
  for (const dir of ['core', 'packs']) {
    for await (const file of walk(dir)) assert.doesNotMatch(await readFile(file, 'utf8'), /@modelcontextprotocol/, file);
  }
});
```

`bin/`은 Task C7이 만든다. 이 Task의 가드는 `server/`만 보고, Task C7 Step 1이 `bin/`까지 넓힌다.

- [ ] **Step 2: 실패 확인**

Run: `node --test test/server/tools.test.js`
Expected: FAIL — `Cannot find module '../../server/toolbox.js'`

- [ ] **Step 3: `server/validate-input.js` 작성**

```js
const TYPES = {
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: Array.isArray,
  string: (v) => typeof v === 'string',
  integer: Number.isInteger,
  boolean: (v) => typeof v === 'boolean',
};

/**
 * 도구 입력을 도구 정의의 JSON Schema(부분)로 검사한다. SDK 의 zod 를 쓰지 않으려고 직접 만든다.
 * 지원: type, properties, required, additionalProperties(false | schema), enum, items, minLength, minItems, minimum.
 * @returns {Array<{ path: string, message: string }>} 빈 배열이면 통과
 */
export function validateInput(schema, value, path = '$') {
  const errors = [];
  const push = (message, at = path) => errors.push({ path: at, message });
  if (schema.type && !TYPES[schema.type](value)) { push(`must be ${schema.type}`); return errors; }
  if (schema.enum && !schema.enum.includes(value)) push(`must be one of ${schema.enum.join(', ')}`);
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) push(`must have at least ${schema.minLength} characters`);
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) push(`must be >= ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) push(`must have at least ${schema.minItems} items`);
    if (schema.items) value.forEach((item, i) => errors.push(...validateInput(schema.items, item, `${path}[${i}]`)));
  }
  if (TYPES.object(value) && schema.type === 'object') {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) push('is required', `${path}.${key}`);
    for (const [key, item] of Object.entries(value)) {
      const at = `${path}.${key}`;
      if (schema.properties && Object.hasOwn(schema.properties, key)) errors.push(...validateInput(schema.properties[key], item, at));
      else if (schema.additionalProperties === false) push('is not allowed', at);
      else if (TYPES.object(schema.additionalProperties)) errors.push(...validateInput(schema.additionalProperties, item, at));
    }
  }
  return errors;
}
```

주의: `required`를 먼저 보고 그다음 키를 본다 — 테스트의 경로 순서(`$.answers.a`, `$.extra`)는 입력 키 순서다.

- [ ] **Step 4: `server/tools/definitions.js` 작성**

```js
const ROOT = { type: 'string', minLength: 1, description: '작품 폴더의 절대 경로' };
const ID = { type: 'string', minLength: 1 };
const TEXT = { type: 'string' };

const tool = (name, description, properties = {}, required = []) => ({
  name, description,
  inputSchema: { type: 'object', properties: { root: ROOT, ...properties }, required: ['root', ...required], additionalProperties: false },
});

/** 기본 도구 여덟 개(설계 §16). */
export const BASE_TOOL_NAMES = Object.freeze([
  'folio_init', 'folio_status', 'folio_run', 'folio_resume', 'folio_decide', 'folio_structure', 'folio_find', 'folio_view',
]);

export const TOOLS = Object.freeze([
  tool('folio_init', '새 작품을 만든다. 팩 프리셋(예: serial, novel, scene)으로 레벨과 검사 세트를 정한다. work.yaml 이 이미 있으면 건드리지 않고 created:false 를 돌려준다.',
    { title: ID, preset: ID, packs: { type: 'array', items: ID, minItems: 1 } }, ['title', 'preset']),
  tool('folio_status', '지금 상태: 다음 노드, 열린 실행과 그 질문(pending), 다시 확인 필요(stale·recheck), 막힌 노드(flagged), 손수정(drift), 기록장 검증.'),
  tool('folio_run', '노드 하나를 순서대로 돌린다. node 는 노드 id, next(기본), next-recheck. mode 는 normal(기본) 또는 recheck. needs_model, needs_user, done, idle, skipped 중 하나를 돌려준다.',
    { node: ID, mode: { type: 'string', enum: ['normal', 'recheck'] } }),
  tool('folio_resume', 'needs_model 요청에 답한다. answers 는 { requestId: 답 글 }이고 요청마다 하나씩 모두 있어야 한다.',
    { runId: ID, answers: { type: 'object', additionalProperties: { type: 'string' } } }, ['runId', 'answers']),
  tool('folio_decide', 'needs_user 질문에 작가의 결정을 전한다. approve(block 을 넘길 때는 reason 필요), request_revision(feedback 필요), skip(reason 필요). hard 충돌은 승인할 수 없다.',
    { runId: ID, action: { type: 'string', enum: ['approve', 'request_revision', 'skip'] }, feedback: TEXT, reason: TEXT }, ['runId', 'action']),
  tool('folio_structure', '구조를 바꾼다. add { level, id, parentId?, title?, brief?, index? } · move { nodeId, parentId?, index? } · wrap { nodeIds, level, id, title? }. 열린 실행이 있으면 거부한다.',
    {
      op: { type: 'string', enum: ['add', 'move', 'wrap'] }, parentId: ID, level: ID, id: ID, title: TEXT, brief: TEXT,
      index: { type: 'integer', minimum: 0 }, nodeId: ID, nodeIds: { type: 'array', items: ID, minItems: 1 },
    }, ['op']),
  tool('folio_find', '찾는다. query: node(노드 정의), entity(엔티티 정의), usages(엔티티가 나오는 곳), events(엔티티의 사건 이력).',
    { query: { type: 'string', enum: ['node', 'entity', 'usages', 'events'] }, id: ID }, ['query', 'id']),
  tool('folio_view', '뷰어(M6). 지금은 unavailable 을 돌려준다.', { nodeId: ID }),
  tool('folio_config', '고급: 레벨별 단계(잠금 포함), 검사 세트와 추천, 검사 목록, 검사를 둘 수 있는 단계를 보여 준다. checkDraft 를 주면 사용자 검사 초안을 이 작품 기준으로 검증한다. 읽기 전용이다.',
    { checkDraft: { type: 'object' } }),
]);
```

- [ ] **Step 5: `server/tools/find.js` 작성**

```js
import { FolioError } from '../../core/errors.js';
import { openWork } from '../../core/store/work.js';
import { withWorkLock } from '../../core/run/work-lock.js';
import { rebuildIndex } from '../../core/index/rebuild.js';
import { eventsFor, openIndex, usagesOf } from '../../core/index/query.js';

const nodeView = (node) => ({
  id: node.id, level: node.level, kind: node.kind, role: node.role, status: node.status, title: node.title,
  parentId: node.parentId, children: [...node.children], path: node.path, data: node.data, body: node.body,
});
const entityView = (entity) => ({ id: entity.id, kind: entity.kind, name: entity.name, aliases: entity.aliases, path: entity.path, data: entity.data, body: entity.body });

/**
 * folio_find. 정의(node·entity)는 파일에서 바로 읽는다.
 * 사용처·사건 이력은 index.db 에서 읽는다 — 작업 잠금 안에서 파일과 기록장으로 다시 만든 뒤 읽는다(파생 캐시라 언제든 다시 만들 수 있다).
 * @param {string} root
 * @param {{ query: 'node'|'entity'|'usages'|'events', id: string }} request
 */
export async function findInWork(root, { query, id }) {
  if (query === 'node' || query === 'entity') {
    const work = await openWork(root);
    if (query === 'node') {
      const node = work.tree.nodes.get(id);
      if (!node) throw new FolioError('NODE_NOT_FOUND', id);
      return { node: nodeView(node) };
    }
    const entity = work.entities.get(id);
    if (!entity) throw new FolioError('ENTITY_NOT_FOUND', id);
    return { entity: entityView(entity) };
  }
  return withWorkLock(root, async () => {
    if (!(await openWork(root)).entities.has(id)) throw new FolioError('ENTITY_NOT_FOUND', id);
    await rebuildIndex(root);
    const db = openIndex(root);
    try {
      return query === 'usages' ? { entityId: id, usages: usagesOf(db, id) } : { entityId: id, events: eventsFor(db, id) };
    } finally {
      db.close();
    }
  });
}
```

- [ ] **Step 6: `server/tools/config.js` 작성**

```js
import { openWorkspace } from '../../core/run/workspace.js';
import { describeCheckSets, recommendCheckSets } from '../../core/checks/recommend.js';
import { stagesByTier, validateUserCheckDraft } from '../../core/checks/user-check-draft.js';

const stepView = (step) => ({
  id: step.id, kind: step.kind, tier: step.tier ?? null, stage: step.kind === 'check' ? (step.stage ?? step.id) : null,
  mode: step.mode ?? 'on', locked: Boolean(step.locked), custom: Boolean(step.custom), reason: step.reason ?? null,
});
const checkView = (check) => ({
  id: check.id, title: check.title ?? check.id, tier: check.tier, stage: check.stage, severity: check.severityOverride ?? check.severity,
  origin: check.origin ?? null, locked: Boolean(check.locked), experimental: Boolean(check.experimental),
});

/**
 * folio_config(고급, 읽기 전용). 작가에게 보여 줄 설정 그림: 레벨별 단계와 잠금, 검사 세트·추천, 켜진 검사, 검사를 둘 수 있는 단계.
 * checkDraft 가 있으면 이 작품의 단계 기준으로 사용자 검사 초안을 검증한다. work.yaml 은 쓰지 않는다 — 쓰기는 작가 승인 뒤 호스트가 한다.
 * @param {string} root
 * @param {{ packs: Map<string, any>, checkDraft?: object }} options
 */
export async function describeConfig(root, { packs, checkDraft }) {
  const { work, registry, checks, pipelines } = await openWorkspace(root, { packs });
  const { config } = work;
  const stages = stagesByTier(pipelines);
  return {
    title: config.title, levels: config.levels, packs: config.packs,
    pipelines: Object.fromEntries(Object.entries(pipelines.byLevel).map(([level, p]) => [level, { digest: p.digest, steps: p.steps.map(stepView) }])),
    checkSets: describeCheckSets(registry, config),
    recommended: recommendCheckSets({ registry, config }),
    checks: checks.map(checkView),
    stages,
    options: config.options,
    ...(checkDraft !== undefined ? { checkDraft: validateUserCheckDraft(checkDraft, { stages }) } : {}),
  };
}
```

- [ ] **Step 7: `server/tools/handlers.js` 작성**

```js
import { FolioError } from '../../core/errors.js';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { outcomeFromPending } from '../../core/run/steps/common.js';
import { changeStructure } from '../../core/structure/locked.js';
import { workStatus } from '../../core/status.js';
import { initWork } from '../../core/work/init.js';
import { findInWork } from './find.js';
import { describeConfig } from './config.js';

const STRUCTURE_ARGS = {
  add: { required: ['level', 'id'], allowed: ['level', 'id', 'parentId', 'title', 'brief', 'index'] },
  move: { required: ['nodeId'], allowed: ['nodeId', 'parentId', 'index'] },
  wrap: { required: ['nodeIds', 'level', 'id'], allowed: ['nodeIds', 'level', 'id', 'title'] },
};

function structureArgs(op, args) {
  const rule = STRUCTURE_ARGS[op];
  const missing = rule.required.filter((key) => args[key] === undefined);
  const extra = Object.keys(args).filter((key) => !rule.allowed.includes(key));
  if (missing.length || extra.length) throw new FolioError('STRUCTURE_ARGS_INVALID', `${op}: missing ${missing.join(',') || '-'}, not allowed ${extra.join(',') || '-'}`, { op, missing, extra });
  return args;
}

/**
 * 도구 이름 → 처리 함수. 실행기(run/resume/decide), changeStructure, initWork, 읽기 함수만 부른다.
 * 커밋 함수·구조 함수·기록장·트리 쓰기를 직접 부르지 않는다(test/server/tools.test.js 가드).
 * @param {{ packs: Map<string, any> }} options
 */
export function createHandlers({ packs }) {
  const runner = (root) => createRunner({ root, packs });
  return {
    folio_init: ({ root, title, preset, packs: names = ['novel'] }) => initWork(root, { title, preset, packs: names, available: packs }),
    folio_status: async ({ root }) => {
      const status = await workStatus(root, { packs });
      const pending = status.activeRun ? outcomeFromPending(await createRunStore(root).load(status.activeRun.runId)) : null;
      return { ...status, pending };
    },
    folio_run: ({ root, node = 'next', mode = 'normal' }) => runner(root).run({ node, mode }),
    folio_resume: ({ root, runId, answers }) => runner(root).resume({ runId, answers }),
    folio_decide: ({ root, runId, action, feedback = '', reason = '' }) => runner(root).decide({ runId, action, feedback, reason }),
    folio_structure: ({ root, op, ...args }) => changeStructure(root, { op, ...structureArgs(op, args) }),
    folio_find: ({ root, query, id }) => findInWork(root, { query, id }),
    folio_view: async () => ({ status: 'unavailable', code: 'VIEWER_NOT_BUILT', message: '뷰어는 아직 없다(M6).' }),
    folio_config: ({ root, checkDraft }) => describeConfig(root, { packs, checkDraft }),
  };
}
```

- [ ] **Step 8: `server/toolbox.js` 작성**

```js
import { isAbsolute } from 'node:path';
import { FolioError } from '../core/errors.js';
import { TOOLS } from './tools/definitions.js';
import { createHandlers } from './tools/handlers.js';
import { validateInput } from './validate-input.js';

const failure = (error) => (error instanceof FolioError
  ? { ok: false, error: { code: error.code, message: error.message, details: error.details ?? {} } }
  : { ok: false, error: { code: 'INTERNAL_ERROR', message: String(error?.message ?? error), details: {} } });

/**
 * 도구 상자: 이름과 인자로 부르고, 결과나 오류를 값으로 돌려준다(던지지 않는다). MCP 서버와 테스트가 같은 것을 쓴다.
 * @param {{ packs: Map<string, any>, handlers?: Record<string, (args: any) => Promise<any>> }} options
 */
export function createToolbox({ packs, handlers = createHandlers({ packs }) }) {
  const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
  async function call(name, args = {}) {
    const tool = byName.get(name);
    if (!tool) return failure(new FolioError('TOOL_UNKNOWN', String(name), { tools: [...byName.keys()] }));
    const input = args ?? {};
    const errors = validateInput(tool.inputSchema, input);
    if (errors.length) return failure(new FolioError('TOOL_INPUT_INVALID', errors.map((e) => `${e.path} ${e.message}`).join('; '), { errors }));
    if (!isAbsolute(input.root)) return failure(new FolioError('ROOT_NOT_ABSOLUTE', input.root));
    try {
      return { ok: true, result: await handlers[name](input) };
    } catch (error) {
      return failure(error);
    }
  }
  return { tools: TOOLS, call };
}
```

`tsconfig.json`의 `include`를 바꾼다:
```json
  "include": ["core/**/*.js", "packs/**/*.js", "server/**/*.js"]
```

- [ ] **Step 9: 통과 확인**

Run: `node --test test/server/tools.test.js`
Expected: PASS (8 tests)

- [ ] **Step 10: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add server test/server/tools.test.js tsconfig.json
git commit -m "$(cat <<'EOF'
feat(server): add the folio tool layer with input validation and a guard against direct core writes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C7: MCP stdio 서버와 실행 파일 (SDK, sqlite 경고 처리)

**Files:**
- Modify: `package.json` (`dependencies`에 `@modelcontextprotocol/sdk`, `bin`)
- Modify: `package-lock.json` (`npm install`이 갱신)
- Modify: `tsconfig.json` (`bin/**/*.js`)
- Create: `server/stdio.js`
- Create: `server/warnings.js`
- Create: `bin/folio-mcp.js`
- Create: `test/support/mcp-client.js`
- Modify: `test/server/tools.test.js` (가드가 `bin/`도 본다)
- Test: `test/server/warnings.test.js`, `test/server/stdio.test.js`

**Interfaces:**
- Consumes: `createToolbox`(C6), `loadBuiltinPacks`(C4). SDK: `Server`(`@modelcontextprotocol/sdk/server/index.js`), `StdioServerTransport`(`.../server/stdio.js`), `ListToolsRequestSchema`·`CallToolRequestSchema`(`.../types.js`), `Client`(`.../client/index.js`), `StdioClientTransport`(`.../client/stdio.js`).
- Produces:
  - `createMcpServer(toolbox)` — 저수준 `Server`. `tools/list`는 `TOOLS`의 `{ name, description, inputSchema }`. `tools/call` 성공은 `content: [{ type: 'text', text: JSON.stringify(result) }]`, 실패는 `isError: true` + `JSON.stringify({ error })`.
  - `startStdioServer({ packs? })`.
  - `quietSqliteWarning(proc = process): () => void` — `ExperimentalWarning` 가운데 SQLite를 말하는 것만 버린다. 되돌리는 함수를 돌려준다.
  - `bin/folio-mcp.js` — 경고 필터를 건 **뒤에** 서버를 동적으로 읽는다(`node:sqlite`를 읽기 전에 필터가 있어야 한다).
  - `connectFolio(): Promise<{ client, call(name, args) → { ok, result | error }, stderr(): string, close() }>` (`test/support/mcp-client.js`).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/server/warnings.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quietSqliteWarning } from '../../server/warnings.js';

test('only the SQLite experimental warning is dropped, and the filter can be removed', () => {
  const seen = [];
  const proc = { emitWarning: (...args) => { seen.push(args); } };
  const restore = quietSqliteWarning(proc);
  proc.emitWarning('SQLite is an experimental feature and might change at any time', 'ExperimentalWarning');
  const error = Object.assign(new Error('SQLite is an experimental feature'), { name: 'ExperimentalWarning' });
  proc.emitWarning(error);
  proc.emitWarning('SQLite is an experimental feature', { type: 'ExperimentalWarning' });
  proc.emitWarning('Something else is experimental', 'ExperimentalWarning');
  proc.emitWarning('SQLite handle leaked', 'Warning');
  assert.deepEqual(seen.map((args) => args[0]), ['Something else is experimental', 'SQLite handle leaked']);
  restore();
  proc.emitWarning('SQLite is an experimental feature', 'ExperimentalWarning');
  assert.equal(seen.length, 3);
});
```

`test/support/mcp-client.js`:
```js
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const REPO = join(import.meta.dirname, '..', '..');
export const BIN = join(REPO, 'bin', 'folio-mcp.js');

/** 실제 실행 파일을 자식 프로세스로 띄우고 MCP(stdio)로 붙는 가짜 호스트. */
export async function connectFolio() {
  const transport = new StdioClientTransport({ command: process.execPath, args: [BIN], cwd: REPO, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  const client = new Client({ name: 'folio-test-host', version: '0.0.0' });
  await client.connect(transport);
  async function call(name, args) {
    const response = await client.callTool({ name, arguments: args });
    const body = JSON.parse(response.content[0].text);
    return response.isError ? { ok: false, error: body.error } : { ok: true, result: body };
  }
  return { client, call, stderr: () => stderr, close: () => client.close() };
}
```

`test/server/stdio.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { TOOLS } from '../../server/tools/definitions.js';
import { connectFolio } from '../support/mcp-client.js';
import { tempDir } from '../support/fixtures.js';

test('the stdio server lists the tools, answers calls and keeps stderr free of the SQLite warning', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const { tools } = await folio.client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), TOOLS.map((tool) => tool.name));
  assert.deepEqual(tools.find((tool) => tool.name === 'folio_run').inputSchema, TOOLS.find((tool) => tool.name === 'folio_run').inputSchema);
  const root = join(await tempDir('folio-mcp-'), 'work');
  const init = await folio.call('folio_init', { root, title: '유리 등대', preset: 'serial' });
  assert.equal(init.ok, true);
  assert.equal(init.result.created, true);
  const relative = await folio.call('folio_status', { root: 'relative/work' });
  assert.deepEqual([relative.ok, relative.error.code], [false, 'ROOT_NOT_ABSOLUTE']);
  const missing = await folio.call('folio_find', { root, query: 'node', id: 'ep-1' });
  assert.deepEqual([missing.ok, missing.error.code], [false, 'NODE_NOT_FOUND']);
  const status = await folio.call('folio_status', { root });
  assert.equal(status.result.next, null);
  assert.doesNotMatch(folio.stderr(), /ExperimentalWarning/);
});
```

`test/server/tools.test.js`의 가드 테스트 한 줄을 `bin/`까지 보도록 바꾼다:
```js
  for (const dir of ['server']) {
```
→
```js
  for (const dir of ['server', 'bin']) {
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/server/warnings.test.js test/server/stdio.test.js`
Expected: FAIL — `Cannot find module '../../server/warnings.js'`, `Cannot find package '@modelcontextprotocol/sdk'`

- [ ] **Step 3: 의존성 추가**

Run: `npm install @modelcontextprotocol/sdk@^1.30.0`
(네트워크가 필요하다. `package.json`과 `package-lock.json`이 바뀐다.)

`package.json`을 이 모양으로 맞춘다(`bin`을 더하고 `dependencies`를 확인한다):
```json
  "bin": { "folio-mcp": "bin/folio-mcp.js" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.30.0", "yaml": "^2.9.1" },
```

`tsconfig.json`의 `include`:
```json
  "include": ["core/**/*.js", "packs/**/*.js", "server/**/*.js", "bin/**/*.js"]
```

- [ ] **Step 4: `server/warnings.js` 작성**

```js
/**
 * node:sqlite 를 처음 읽을 때 나오는 ExperimentalWarning 만 조용히 한다(MCP 호스트의 stderr 를 어지럽히지 않게).
 * 다른 경고와 다른 ExperimentalWarning 은 그대로 낸다. 되돌리는 함수를 돌려준다.
 * @param {{ emitWarning: (...args: any[]) => any }} proc
 */
export function quietSqliteWarning(proc = process) {
  const original = proc.emitWarning;
  proc.emitWarning = function emitWarning(warning, ...rest) {
    const option = rest[0];
    const type = typeof option === 'string' ? option : option?.type;
    const name = typeof warning === 'string' ? type : (warning?.name ?? type);
    const message = typeof warning === 'string' ? warning : warning?.message;
    if (name === 'ExperimentalWarning' && /sqlite/i.test(String(message ?? ''))) return undefined;
    return original.call(proc, warning, ...rest);
  };
  return () => { proc.emitWarning = original; };
}
```

- [ ] **Step 5: `server/stdio.js` 작성**

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadBuiltinPacks } from '../packs/index.js';
import { createToolbox } from './toolbox.js';

export const SERVER_INFO = Object.freeze({ name: 'folio', version: '0.1.0' });

/**
 * 공식 SDK 의 저수준 Server 에 도구 상자를 붙인다. 입력 검증은 도구 상자가 한다(zod 를 쓰지 않는다).
 * 결과는 JSON 글 하나로 돌려준다. 오류도 JSON({ error: { code, message, details } })이고 isError 로 표시한다.
 * @param {{ tools: readonly any[], call: (name: string, args: any) => Promise<any> }} toolbox
 */
export function createMcpServer(toolbox) {
  const server = new Server({ ...SERVER_INFO }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolbox.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const out = await toolbox.call(request.params.name, request.params.arguments ?? {});
    if (out.ok) return { content: [{ type: 'text', text: JSON.stringify(out.result) }] };
    return { content: [{ type: 'text', text: JSON.stringify({ error: out.error }) }], isError: true };
  });
  return server;
}

/** stdio 로 붙는다. 호스트가 표준 입출력을 닫으면 끝난다. */
export async function startStdioServer({ packs = null } = {}) {
  const server = createMcpServer(createToolbox({ packs: packs ?? await loadBuiltinPacks() }));
  await server.connect(new StdioServerTransport());
  return server;
}
```

- [ ] **Step 6: `bin/folio-mcp.js` 작성**

```js
#!/usr/bin/env node
import { quietSqliteWarning } from '../server/warnings.js';

// 경고 필터를 먼저 건다. 서버(→ 코어 → node:sqlite)는 그 뒤에 읽어야 한다 — 정적 import 는 이 줄보다 먼저 실행되므로 동적으로 읽는다.
quietSqliteWarning(process);
const { startStdioServer } = await import('../server/stdio.js');
await startStdioServer();
```

Run: `chmod +x bin/folio-mcp.js`

- [ ] **Step 7: 통과 확인**

Run: `node --test test/server/warnings.test.js test/server/stdio.test.js test/server/tools.test.js`
Expected: PASS

- [ ] **Step 8: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add package.json package-lock.json tsconfig.json server/stdio.js server/warnings.js bin/folio-mcp.js test/support/mcp-client.js test/server/warnings.test.js test/server/stdio.test.js test/server/tools.test.js
git commit -m "$(cat <<'EOF'
feat(server): serve the folio tools over MCP stdio with the official SDK and quiet the SQLite warning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C8: 얇은 스킬 하나 (`skill/folio`)

**Files:**
- Create: `skill/folio/SKILL.md`
- Create: `skill/folio/references/checks.md` (옛 `skill/folio-checks/SKILL.md`를 MCP 도구 기준으로 다시 씀)
- Create: `skill/folio/references/steps.md`
- Delete: `skill/folio-checks/` (`git rm -r`)
- Modify: `skill/README.md`
- Test: `test/server/skill-docs.test.js`

**Interfaces:**
- Consumes: `TOOLS`(C6). 문서가 말하는 도구 이름은 전부 실제 도구여야 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/server/skill-docs.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { TOOLS } from '../../server/tools/definitions.js';

const SKILL = join('skill', 'folio');
const docs = async () => [join(SKILL, 'SKILL.md'), ...(await readdir(join(SKILL, 'references'))).map((f) => join(SKILL, 'references', f))];

test('the skill is one folder named folio and the old folio-checks skill is gone', async () => {
  const text = await readFile(join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(text, /^---\nname: folio\ndescription: .+\n---\n/);
  await assert.rejects(stat(join('skill', 'folio-checks')), { code: 'ENOENT' });
  assert.match(await readFile(join('skill', 'README.md'), 'utf8'), /folio\/SKILL\.md/);
});

test('every folio_* name the skill mentions is a real tool, and every tool is mentioned', async () => {
  const names = new Set(TOOLS.map((t) => t.name));
  const mentioned = new Set();
  for (const file of await docs()) {
    for (const [name] of (await readFile(file, 'utf8')).matchAll(/folio_[a-z_]+/g)) {
      assert.ok(names.has(name), `${file}: ${name}`);
      mentioned.add(name);
    }
  }
  assert.deepEqual([...names].filter((n) => !mentioned.has(n)), []);
});

test('the skill does not tell the host to call core functions', async () => {
  for (const file of await docs()) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /commitNode|createRunner|workStatus\(|core\/run\//, file);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/server/skill-docs.test.js`
Expected: FAIL — `ENOENT: ... skill/folio/SKILL.md`

- [ ] **Step 3: `skill/folio/SKILL.md` 작성**

````md
---
name: folio
description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재·장편·단편)을 쓴다. 새 작품 만들기, 다음 노드 쓰기, 계획 승인, 원고 커밋, 구조 바꾸기, 검사 설정에 쓴다. 예: "새 연재 시작하자", "다음 화 써줘", "아크 하나 더", "검사 설정해줘".
---

# folio — 작품 쓰기

## 원칙

- 순서와 잠금은 엔진이 지킨다. 이 스킬은 안내만 한다. 엔진이 거부하면 우회하지 말고 오류 `code`를 작가에게 그대로 설명한다.
- 모델 작업(계획·원고·사건 추출·검토)은 호스트(나)가 한다. 엔진은 `needs_model` 요청만 준다.
- 사람의 결정(승인·수정 요청·넘김)은 작가가 한다. 작가에게 묻지 않고 `folio_decide`를 부르지 않는다.
- 같은 호스트가 한 검토를 "독립 검토"라고 부르지 않는다. 참고 의견(advisory)을 근거로 원고를 고치지 않는다.
- 작품 파일을 손으로 고쳐 커밋을 흉내 내지 않는다. 커밋은 실행(`folio_run`)만 한다.

## 도구

| 도구 | 언제 |
|---|---|
| `folio_init` | 새 작품. `{ root, title, preset }`. 프리셋: `serial`(아크→회차), `novel`(권→장→장면), `scene`(장면). 이미 있으면 `created: false` |
| `folio_status` | 지금 상태. `next`(다음 노드), `activeRun`과 `pending`(떠 있는 질문), `stale`·`recheck`·`flagged` |
| `folio_run` | 다음 노드(또는 `node`)를 돈다 |
| `folio_resume` | `needs_model` 요청에 답한다 |
| `folio_decide` | `needs_user` 질문에 작가 결정을 전한다 |
| `folio_structure` | 구조 바꾸기(`add`·`move`·`wrap`). 열린 실행이 있으면 거부된다 |
| `folio_find` | 노드·엔티티 정의, 엔티티가 나오는 곳(`usages`), 사건 이력(`events`) |
| `folio_view` | 뷰어(아직 없음) |
| `folio_config` | 고급. 레벨별 단계·검사 세트·검사 목록, 사용자 검사 초안 검증. 읽기 전용 |

`root`는 언제나 작품 폴더의 절대 경로다.

## 흐름

1. **새 작품**: 작가에게 제목과 형식(연재/장편/단편)을 묻고 `folio_init`. 검사 세트는 [references/checks.md](references/checks.md)의 첫 설정 인터뷰로 맞춘다.
2. **큰 틀**: 맨 위 노드를 `folio_structure { op: 'add', level, id, title }`로 만든다(예: `arc-1`). 아래 노드는 위 노드의 `children` 단계가 만든다.
3. **쓰기 루프**: `folio_run { root }` → 결과에 따라
   - `needs_model`: `requests`마다 아래 "답하는 법"대로 답을 만들어 `folio_resume { root, runId, answers: { requestId: 답 } }`.
   - `needs_user`: `question`(원고·지적·참고 의견)을 작가에게 보여 주고 결정을 받아 `folio_decide`.
   - `done`: 한 노드가 커밋됐다. 작가에게 알리고 다음 `folio_run`.
   - `idle`: 할 일이 없다. 구조를 더하거나 끝낸다.
4. **이어서 하기**: 대화가 끊겼으면 `folio_status`의 `pending`이 떠 있는 질문이다. 거기서 이어간다.
5. **단계 설정**: 레벨마다 단계를 켜고 끄는 법은 [references/steps.md](references/steps.md).

## 답하는 법 (`needs_model`)

요청의 `payload.instructions`(팩 프롬프트)를 먼저 따른다. 답 형식:

| 요청 | 답 |
|---|---|
| `purpose: generate`, `produces: plan` | 계획 글 |
| `produces: draft` | 원고 본문만 |
| `produces: events` | JSON `{ "events": [...], "appearances": [...], "mentions": [...] }` |
| `produces: children` | JSON `{ "children": [{ "id", "title", "brief" }] }` — 개수는 `childLevel.range` 안 |
| `purpose: check` | JSON `{ "checked": [검사 id 모두], "findings": [{ "checkId", "code", "message", "quote" }] }` — `requireQuote` 검사는 원고 문장을 그대로 인용 |
| `purpose: revise` / `user_revision` | 고친 원고 전체. `blocking`(또는 작가 `feedback`)만 고친다 |

요청에 `retryReason`이 있으면 앞 답을 읽을 수 없었다는 뜻이다. 형식을 고쳐 다시 답한다.

## 오류일 때

- `ANSWER_STALE`: 질문을 낸 뒤 설정(단계·검사·팩)이 바뀌어 옛 질문을 버렸다. `folio_run`을 다시 불러 새 질문에 답한다.
- `RUN_IN_PROGRESS`: 다른 노드의 실행이 열려 있다. `folio_status`로 그 질문을 이어가거나, 작가가 원하면 `skip`한다.
- `STRUCTURE_RUN_OPEN`: 실행이 열려 있어 구조를 바꿀 수 없다. 먼저 그 실행을 끝내거나 넘긴다.
- `APPROVE_BLOCKED_BY_HARD`: hard 충돌은 승인할 수 없다. 작가에게 지적을 보여 주고 `request_revision`(고치기) 또는 `skip`을 고르게 한다.
- `OVERRIDE_REASON_REQUIRED`, `FEEDBACK_REQUIRED`, `SKIP_REASON_REQUIRED`: 작가에게 이유·요청을 받아 다시 부른다.
- `CONFIG_INVALID`: work.yaml이 틀렸다. `details.errors`를 작가에게 설명한다.
````

- [ ] **Step 4: `skill/folio/references/checks.md` 작성**

옛 `skill/folio-checks/SKILL.md`의 내용을 MCP 도구 기준으로 옮긴다(규칙은 그대로):

````md
# 검사 관리

## 원칙

- 귀찮은 검사 관리는 AI가 한다. 무엇을 돌릴지는 작가가 정한다.
- 강제는 엔진이 한다. 엔진이 거부하면 우회하지 말고 오류 코드를 작가에게 그대로 설명한다.
- work.yaml과 `checks/` 파일은 작가가 승인한 뒤에만 쓴다. 쓰기 전에 바뀔 내용을 diff로 보여 준다.

## 도구

- 세트 설명·추천·검사 목록·단계: `folio_config { root }` — `checkSets`(세트, 골랐는지 `selected`, 기본 세트 `default`), `recommended`(작품 단위 추천과 이유), `checks`, `stages`.
- 사용자 검사 초안 검증: `folio_config { root, checkDraft }` — 결과 `checkDraft: { ok, spec, errors }`.
- 되채우기 목록: `folio_status { root }`의 `recheck`, 막힌 노드는 `flagged`, 다시 확인 필요는 `stale`.
- 재검사 실행: `folio_run { root, node: <id> 또는 'next-recheck', mode: 'recheck' }`.
- 이 밖의 도구 이름을 지어내지 않는다.

## work.yaml에서 다루는 곳

아래 `serial.*` 세트 id는 설명용 예시다. 실제 id는 `folio_config`의 `checkSets`에서 가져온다.

```yaml
checkSets: [serial.continuity, my-voice]   # 키가 없으면 팩 기본 세트, [] 이면 세트 없음
userCheckSets:
  my-voice: { title: 내 문체, checks: [voice-samples, no-cliche] }
checks:
  no-cliche: { words: [숨이 멎을 듯, 심장이 쿵], severity: advisory, experimental: true }
  voice-samples: { samples: checks/voice-samples/, severity: advisory, experimental: true, requireQuote: true }
  serial.word-count: { mode: off }
options:
  includeAllHardChecks: false
```

- 사용자 세트 id는 `core.`이나 팩 접두어(예: `novel.`)로 시작할 수 없다.
- 규칙 파일과 예시 폴더는 `checks/` 안에만 둔다.

## 1. 첫 설정 인터뷰 (짧게)

질문은 한 번에 하나씩, 모두 합쳐 네 개 안쪽으로 한다.

1. 어떤 작품인가: 장편 소설, 연재, 교재, 게임북 등.
2. 가장 신경 쓰는 것은: 설정 모순, 시간 순서, 인물 말투, 분량 등.
3. 쓰면 안 되는 표현이 있나: 단어, 상투구, 호칭.
4. 문체 예시가 있나: 작가가 직접 쓴 짧은 글 두세 개.

그다음 `folio_config`로 보여 준다.

- 팩 기본 세트: `checkSets`에서 `default: true`인 세트. 키를 비워 두면 이것이 돈다고 말한다.
- 작품 단위 추천: `recommended`. 세트마다 이유(`default`, `workKind`, `level`)를 한 줄로 붙인다.
- 세트의 `recommendedFor`(레벨·역할·위치)를 보고 어느 노드에 맞는 세트인지 설명한다.
- 3·4번 답이 있으면 아래 2절의 사용자 검사 초안을 함께 제안한다.

작가가 고른다. 고른 결과를 work.yaml diff로 보여 주고, 승인받은 뒤에만 쓴다. 추천을 그대로 켜 두지 않는다.

## 2. 새 검사 만들기

세 형태 중 하나로 초안을 만든다.

| 형태 | 작가가 준 것 | 초안 | 엔진에서 |
|---|---|---|---|
| 규칙 | "주인공은 존댓말만 쓴다" | `source: checks/<id>.md` (또는 짧으면 `rule`) | 모델 검사, 인용 필수 |
| 예시 | 문체 예시 글 | `samples: checks/<id>/` 폴더 | 모델 검사, 인용 필수 |
| 패턴 | 금지 단어·정규식 | `words: [...]` 또는 `pattern` | 결정론 검사 |

순서는 다음과 같다.

1. 초안(id, title, description, 형태별 필드)과 `checks/<id>.md` 본문을 보여 준다.
2. `folio_config { root, checkDraft }`를 부른다. `checkDraft.ok`가 false면 `errors`를 설명하고 고쳐서 다시 부른다. `stage`는 `stages`에 있는 그 종류의 단계만 된다.
3. 작가가 승인하면 `checks/<id>.md`(또는 예시 폴더)를 쓰고, 돌려받은 `spec`을 work.yaml `checks.<id>`에 넣는다. 세트로 묶기를 원하면 `userCheckSets`에도 넣고 `checkSets`에 그 세트를 더한다.
4. 켠 뒤에는 4절의 되채우기를 제안한다.

지킬 것은 다음과 같다.

- 새 검사는 언제나 `experimental: true`, `severity: advisory`로 시작한다.
- `block`으로 올리는 것은 작가가 직접 요청할 때만 한다. 먼저 권하지 않는다.
- `hard`는 사용자 검사에 없다. 요청받으면 할 수 없다고 말한다.
- 패턴 검사는 작가의 예문 한두 개로 무엇이 걸리는지 먼저 보여 준다.

## 3. 검사 끄기

- 팩·사용자 검사는 `checks.<id>: { mode: off }`로 끄고, 세트는 `checkSets`에서 뺀다.
- hard 팩 검사도 작가가 원하면 `mode: off`로 끌 수 있다. 단, `includeAllHardChecks: true`면 엔진이 거부한다(`HARD_CHECK_OVERRIDE`). hard 검사의 등급만 낮추는 것은 안 된다(`HARD_CHECK_SEVERITY_LOCKED`).
- 실행 도중 끄면 남은 단계에서 그 검사는 돌지 않는다. 영수증에는 "통과"가 아니라 `skipped`(source `work.yaml`)로 남는다고 알려 준다. 질문이 떠 있었다면 다음 `folio_resume`이 `ANSWER_STALE`로 거부된다 — `folio_run`을 다시 부른다.
- 끈다고 이미 커밋한 원고를 다시 볼 일은 없다.

## 4. 검사 켜기와 되채우기

- 켜면(다시 켜도) 그 검사를 거치지 않은 커밋 노드가 `folio_status`의 `recheck`에 뜬다. 목록을 보여 주고 되채우기를 제안한다.
- 작가가 원하면 `folio_run { root, node: <id> 또는 'next-recheck', mode: 'recheck' }`로 돌린다. 재검사는 검사만 돈다. 원고는 바꾸지 않는다.
- 결과는 이렇게 설명한다.
  - 지적 없음: 그 노드의 되채우기가 끝난 것이다.
  - advisory 지적: 참고용으로 보여만 준다. 자동으로 고치지 않는다.
  - block 지적: 작가가 이유를 적어 넘길 수 있다(`folio_decide`의 `reason`, override 기록). 넘길지 고칠지는 작가가 정한다.
  - hard 지적: `folio_status`의 `flagged`에 뜨고 승인으로 넘길 수 없다(`canApprove: false`). 고치려면 그 노드를 보통 실행으로 다시 써야 한다고 알려 준다. 원고는 자동으로 바뀌지 않는다.
- 구조가 바뀐 가지(`stale`의 이유 `structure`)는 재검사로 풀리지 않는다. 그 가지를 보통 실행으로 다시 돌려야 한다.

## 하지 않는 것

- 잠긴 코어 검사(`core.*`, 예: `core.promise-order`)를 끄거나 바꾸려 하지 않는다.
- 같은 호스트가 한 검토를 "독립 검토"라고 부르지 않는다.
- advisory 지적을 근거로 원고를 자동으로 고치지 않는다.
- 커밋을 흉내 내지 않는다. 커밋은 `folio_run`만 한다.
- 승인 없이 work.yaml이나 `checks/`를 쓰지 않는다.

## 예시 (합성)

### 예시 1 — 첫 설정

> 작가: 새 연재 「유리 등대」 검사 좀 맞춰줘.

- AI가 네 가지를 묻는다. 답은 "연재 / 설정 모순이 제일 걱정 / '운명처럼' 금지 / 예시 없음"이다.
- `folio_config`의 `recommended`를 보여 준다. 예: "novel.basic — 기본 세트", "novel.serial — 작품에 episode 레벨이 있음".
- 금지어 검사 초안 `no-destiny`(`words: [운명처럼]`, advisory)를 `checkDraft`로 검증해 함께 제안한다.
- 작가가 novel.basic과 no-destiny만 고른다. AI가 diff를 보여 주고, 승인받은 뒤 work.yaml을 쓴다.

### 예시 2 — 문체 검사를 만들고 되채우기

> 작가: 내 예전 글처럼 짧게 끊어 쓰는지 봐줘. 예시 붙일게.

- AI가 `checks/short-voice/`에 예시 세 편을 두고 초안 `{ id: 'short-voice', samples: 'checks/short-voice/' }`을 만든다.
- `folio_config`의 `checkDraft`가 `experimental`, `advisory`, `requireQuote`를 붙인 spec을 돌려준다. 작가 승인 뒤 work.yaml에 넣는다.
- `folio_status`의 `recheck`에 커밋된 12개 노드가 뜬다. 작가가 "3화까지만"이라고 해서 세 노드만 재검사한다.
- 결과는 advisory 지적 두 개이다. 인용과 함께 보여 주고 원고는 그대로 둔다.

### 예시 3 — 끄기 요청과 거부

> 작가: 죽은 인물 검사 너무 시끄러워. 끄고, 대신 등급도 advisory로 내려줘.

- 이 검사(`novel.dead-on-stage`)는 hard 팩 검사라 등급만 낮출 수는 없다고 설명한다.
- 선택지는 둘이다. 그대로 두거나 `mode: off`로 끄는 것이다.
- 작가가 끄기를 고르면, 지금 열린 실행의 남은 단계에서는 skipped로 기록된다고 알려 준다.
- 작가가 `core.promise-order`도 꺼 달라고 하면, 잠긴 코어 검사라 끌 수 없다고 답한다.
````

- [ ] **Step 5: `skill/folio/references/steps.md` 작성**

````md
# 단계 설정 (레벨별)

`folio_config`의 `pipelines`가 레벨마다 지금 단계(모드·잠금)를 보여 준다. 바꾸는 곳은 work.yaml `overrides`다. 작가 승인 뒤에만 쓴다.

```yaml
overrides:
  critic: { mode: off, reason: 초고는 빠르게 }     # 모든 레벨
  levels:
    arc:
      approve: { mode: auto }                      # 아크 계획은 자동 승인
    episode:
      critic: { mode: on }                         # 회차에서는 다시 켠다(레벨이 이긴다)
      tone: { after: critic, kind: check, tier: model, prompt: checks/tone.md }   # 회차에만 새 검사 단계
```

- 전체 덮어쓰기 위에 레벨 덮어쓰기를 필드 단위로 얹는다. 같은 필드면 레벨이 이긴다.
- 바꿀 수 있는 필드: `mode`(on·off, 게이트는 auto도), `reason`, `max`(수정 반복 0~3), `after`, `prompt`. 새 단계는 `kind: check|gate`와 `after`가 필요하다.
- 레벨 이름은 work.yaml `levels`에 있어야 한다(`OVERRIDE_LEVEL_UNKNOWN`).
- 서로 다른 레벨이 같은 id로 모양이 다른 새 단계를 만들 수 없다(`CUSTOM_STEP_CONFLICT`).

## 잠금 (설정으로 끌 수 없음)

- 잠금 단계는 코어가 정한다: `commit`, 잠긴 코어 검사가 도는 `facts`, 그리고 그 둘이 요구하는 `extract`·`draft`. `folio_config`에서 `locked: true`로 보인다.
- 잠긴 단계를 끄거나 옮기면 어느 레벨에서든 `LOCKED_STEP_OVERRIDE`. 새 단계 id로 `facts`, `levels`는 쓸 수 없다(`STEP_ID_RESERVED`).
- 잠금 규칙: 커밋 원고는 검사한 원고와 같아야 하고, 영수증 없이 커밋할 수 없고, hard 충돌은 커밋을 막고, 기록장은 추가만 된다.

## 바꾼 뒤

- 열린 실행이 있으면 다음 호출에서 검사부터 다시 돈다. 떠 있던 질문에 답하면 `ANSWER_STALE` — `folio_run`을 다시 부른다.
- 이미 커밋한 노드는 그대로다. 새로 켠 검사는 `folio_status`의 `recheck`로 되채운다(검사 관리 문서 4절).
````

- [ ] **Step 6: 옛 스킬 지우고 목록 고치기**

Run: `git rm -r skill/folio-checks`

`skill/README.md` 전체를 바꾼다:
```md
# skill — 호스트용 사용 안내 스킬

- [folio](folio/SKILL.md): Folio MCP 도구(`folio_*`)로 작품을 만들고 쓰고 검사를 관리하는 스킬. 자세한 안내는 `folio/references/`(검사 관리 `checks.md`, 단계 설정 `steps.md`).
```

- [ ] **Step 7: 통과 확인**

Run: `node --test test/server/skill-docs.test.js`
Expected: PASS (3 tests)

- [ ] **Step 8: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add skill test/server/skill-docs.test.js
git commit -m "$(cat <<'EOF'
docs(skill): replace folio-checks with one thin folio skill built on the MCP tools

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task C9: M3 완료 기준 — stdio 위의 가짜 호스트로 "새 작품 → 아크 계획 승인 → 1화 커밋"

**Files:**
- Test: `test/acceptance/m3.test.js`

**Interfaces:**
- Consumes: `connectFolio`(C7), 소설 팩(C4), 모든 도구.

- [ ] **Step 1: 완료 기준 테스트 작성**

`test/acceptance/m3.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { DECISIONS_LEDGER } from '../../core/ledger/decisions.js';
import { connectFolio } from '../support/mcp-client.js';
import { copyFixture, seedEvents, tempDir } from '../support/fixtures.js';
import { label } from '../support/fake-host.js';

/** MCP 너머의 가짜 호스트 모델. 요청 모양만 보고 합성 답을 만든다. */
function answerFor(request) {
  const p = request.payload;
  if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
  if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
  if (p.produces === 'plan') return p.node.id === 'arc-1' ? '첫 아크 계획' : `${p.node.title} 계획`;
  if (p.produces === 'children') return JSON.stringify({ children: [{ id: 'ep-1', title: '1화' }, { id: 'ep-2', title: '2화' }] });
  if (p.produces === 'draft') return p.node.id === 'ep-1' ? '1화 본문' : `${p.node.title} 본문`;
  if (p.produces === 'events') return JSON.stringify({ events: [], appearances: [], mentions: [] });
  throw new Error(`no answer for ${request.purpose}/${p.produces}`);
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** until 을 만날 때까지 run/resume/decide 를 MCP 로 돌린다. 지나온 결과 이름을 모은다. */
async function drive(folio, root, start, until) {
  const labels = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 50; i += 1) {
    labels.push(label(out));
    if (until(out)) return { labels, out };
    if (out.status === 'needs_model') {
      out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answerFor(r)])) }));
    } else if (out.status === 'needs_user') {
      out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
    } else throw new Error(`unexpected ${out.status}`);
  }
  throw new Error('drive did not finish');
}

test('M3: over MCP stdio a new serial work gets an approved arc plan and a committed first episode', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = join(await tempDir('folio-m3-'), '유리 등대');
  assert.equal((await ok(folio.call('folio_init', { root, title: '유리 등대', preset: 'serial' }))).created, true);
  await ok(folio.call('folio_structure', { root, op: 'add', level: 'arc', id: 'arc-1', title: '첫 아크' }));
  const { labels, out } = await drive(folio, root, { node: 'next' }, (o) => o.status === 'done');
  assert.deepEqual(labels, [
    'model:plan', 'user:approve', 'model:children',
    'model:plan', 'model:draft', 'model:extract', 'model:critic', 'user:approve', 'done',
  ]);
  assert.equal(out.nodeId, 'ep-1');
  const status = await ok(folio.call('folio_status', { root }));
  assert.equal(status.next.nodeId, 'ep-2');
  assert.equal(status.activeRun, null);
  assert.deepEqual(status.waiting, ['arc-1']);
  assert.ok(status.ledger.receipts.ok && status.ledger.events.ok && status.ledger.decisions.ok);
  const work = await openWork(root);
  const ep1 = work.tree.nodes.get('ep-1');
  assert.deepEqual([ep1.status, ep1.body.trim()], ['committed', '1화 본문']);
  const arc = work.tree.nodes.get('arc-1');
  assert.deepEqual([arc.status, arc.body.trim()], ['planned', '첫 아크 계획']);
  const receipts = await openLedger(root, 'receipts').readAll();
  assert.deepEqual(receipts.filter((r) => r.type === 'commit').map((r) => r.nodeId), ['ep-1']);
  const decisions = await openLedger(root, DECISIONS_LEDGER).readAll();
  assert.deepEqual(decisions.filter((r) => r.type === 'approval').map((r) => r.nodeId), ['arc-1', 'ep-1']);
  assert.doesNotMatch(folio.stderr(), /ExperimentalWarning/);
});

test('M3: a hard conflict found by the novel pack cannot be approved over MCP', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await copyFixture('serial-2level');
  await seedEvents(root, 'serial-2level');
  const { out } = await drive(folio, root, { node: 'ep-004' }, (o) => o.status === 'needs_user');
  assert.equal(label(out), 'user:blocked');
  assert.deepEqual(out.question.blocking.map((f) => f.code), ['DEAD_ON_STAGE']);
  const refused = await folio.call('folio_decide', { root, runId: out.runId, action: 'approve', reason: '괜찮다' });
  assert.deepEqual([refused.ok, refused.error.code], [false, 'APPROVE_BLOCKED_BY_HARD']);
  const status = await ok(folio.call('folio_status', { root }));
  assert.equal(status.pending.question.kind, 'blocked');
});
```

- [ ] **Step 2: 돌려 보기**

Run: `node --test test/acceptance/m3.test.js`
Expected: PASS (2 tests). 실패하면 앞 Task로 돌아가 고친다 — 이 테스트의 기대값을 바꾸지 않는다. (결과 이름 목록이 다르면 소설 팩 단계·세트가 이 계획과 다른 것이다.)

- [ ] **Step 3: 전체 확인과 커밋**

Run: `npm run check`
Expected: 모두 PASS.

```bash
git add test/acceptance/m3.test.js
git commit -m "$(cat <<'EOF'
test(acceptance): M3 new work, approved arc plan and committed first episode over MCP stdio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 손으로 확인하는 목록 (작가 환경, 합성 작품으로)**

1. `cd /path/to/folio && npm install && npm run check` — 모두 초록.
2. `claude mcp add folio -- node /path/to/folio/bin/folio-mcp.js` — Claude Code에 서버 등록. `/mcp`에서 `folio`와 도구 9개가 보이는지.
3. `ln -s /path/to/folio/skill/folio ~/.claude/skills/folio` — 스킬 연결. 새 세션에서 "새 연재 시작하자"에 스킬이 불리는지.
4. 빈 임시 폴더(예: `/tmp/folio-manual/유리등대`)에 연재(`serial`)로 새 작품을 만든다. `work.yaml`에 `levels`(arc, episode)·`packs: [novel]`·`checkSets`가 들어갔는지.
5. 아크 하나를 만들고 계획을 승인하고 1화를 커밋한다. 승인 질문이 작가에게 보이고, 호스트가 묻지 않고 승인하지 않는지.
6. 확인: `tree/` 아래 1화 파일 본문과 `status: committed`, `.folio/ledger/receipts.jsonl`·`decisions.jsonl`에 기록, `folio_status`의 `ledger`가 모두 ok, 서버 stderr(`claude --debug` 또는 MCP 로그)에 `ExperimentalWarning`이 없는지.

- [ ] **Step 5: M3 정지**

`npm run check` 결과(테스트 수 포함), `test/acceptance/m3.test.js`의 결과 이름 목록, 손 확인 목록의 결과를 사용자에게 보여 주고 **멈춘다**. 사용자가 확인하기 전에는 M4로 넘어가지 않는다.

---

## 범위 밖 (이 계획에서 하지 않음)

- vibelore 검사기 약 30개 이식(M5). 이 계획의 소설 팩은 `novel.dead-on-stage` 하나의 결정론 검사기와 모델 검사 다섯 개뿐이다.
- 등장 위치 제출·이름 바꾸기·엔티티 편집 도구(M4). `folio_find`는 읽기만 한다.
- 뷰어(M6). `folio_view`는 자리만.
- AI로 팩 만들기(folio-pack), 팩 설치·배포, 사용자 팩 폴더 읽기(`available`은 지금 내장 팩만).
- work.yaml을 쓰는 도구. 설정 쓰기는 작가 승인 뒤 호스트가 파일로 한다(`folio_config`는 읽기 전용).
- `parseBlocks`의 코드 블록 건너뛰기, 묶기 도중 죽었을 때 복구(doctor), 기록장 찢어진 마지막 줄 분류, Windows EPERM 재시도.
- 구조 변경 뒤 가지 다시 돌리기의 자동화(지금은 `stale`의 `structure` 이유로 알리기만 한다).

## 자기 점검 결과

**설계 대조(요청서 항목 → Task):**

| 요청 | Task |
|---|---|
| 잠금을 코어가 계산, 팩 `locked` 불신 | A1 |
| 팩 id 접두어·중복 금지, 같은 팩 두 번·이름 불일치 | A2 |
| 팩 내용 digest를 파이프라인 digest에 | A3 |
| 레벨별 단계 덮어쓰기(`overrides.levels`) | B1 |
| 실행·재검사·stale이 레벨 파이프라인을 씀 | B2 |
| M2.5 완료 기준·정지 | B3 |
| 넘긴 항목: ANSWER_STALE, 재시도 초기화, prompt() 앞 digest | C1 |
| 넘긴 항목: 구조 바꾸기 작업 잠금, 구조 변경 stale | C2 |
| 선언형 팩(`pack.yaml` + md + 이름 검사기) | C3 |
| 최소 소설 팩, `packs/` 모델 호출 가드 | C4 |
| 새 작품 만들기 | C5 |
| 도구 9개(기본 8 + 고급 1), 직접 쓰기 import 가드 | C6 |
| 공식 SDK stdio 서버, sqlite 경고 | C7 |
| 얇은 스킬 하나, folio-checks 흡수 | C8 |
| M3 e2e(stdio 가짜 호스트)·손 확인·정지 | C9 |

**빈칸 검사:** `TBD`, `TODO`, "나중에", "적절히 처리" 없음. 모든 코드 단계에 코드가 있다. C6 가드 테스트는 `server/`만 보고, `bin/`을 만드는 C7 Step 1에서 `['server', 'bin']`로 넓힌다.

**이름 일치:** `coreLockedIds`·`LOCKED_STAGES`(A1) → C4 테스트의 잠금 목록 `['draft', 'extract', 'facts', 'commit']`. `validatePack`(A1·A2) → `loadYamlPack`(C3). `packDigest`는 `pack.digest`가 있으면 그것(A3) → `loadYamlPack`이 `digest`를 채움(C3). `pipelines.byLevel`(B1) → `describeConfig`(C6). `rawPackPayload`·`dressPayload`·`digestPayload`(C1)는 C1 안에서만 쓴다. `changeStructure`(C2) → `folio_structure`(C6). `initWork`(C5) → `folio_init`(C6). `loadBuiltinPacks`(C4) → C5 테스트·C6·C7. `TOOLS`·`BASE_TOOL_NAMES`(C6) → C7·C8 테스트. `connectFolio`(C7) → C9. `DECISIONS_LEDGER`는 기존 `core/ledger/decisions.js`의 것.
