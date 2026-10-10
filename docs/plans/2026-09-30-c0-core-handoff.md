# Folio C0 코어 인계 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** M4~M6a·N2·N5가 남긴 코어 인계 항목을 한 번에 정리한다.
- 작품별 검사 설정(`checks.<id>.config`)을 받는다.
- 팩 digest가 가져온 도우미·사전 파일을 본다.
- 약속 단계 읽기를 한 함수로 모은다.
- 서버 오류가 작품 밖 경로를 흘리지 않게 한다.
- 실행 도중 손으로 고친 노드를 조용히 덮지 않는다.
- 작은 정리(YAML 1.1 지도, 자산 파일, 뷰어 끄기, 후보 설정, CI, 범위 Set, 자료 하드 링크).

**Architecture:**
- 새 모듈은 여섯이다. 모두 `core/`에 있고 모델·네트워크를 부르지 않는다.
  - `core/util/plain.js`: `isPlainObject` 하나(9벌을 모은다).
  - `core/pack/check-config.js`: 팩·작품 검사 설정을 검사기에 묶는다(`withCheckConfig`를 소설 팩에서 코어로 옮김).
  - `core/checks/known-check-spec.js`: `work.yaml checks.<알려진 id>` 한 줄의 모양 검사.
  - `core/pack/module-graph.js`: 팩 검사기가 정적으로 가져오는 상대 경로 파일의 hash 목록.
  - `core/run/text-guard.js`: 실행 도중 손수정 점검(커밋·자식 단계).
  - `core/util/yaml.js`(기존)에 `YAML_INVALID`를 더한다.
- 잠금 경로는 더 엄격해지기만 한다.
  - `foldPromise`는 경고만 늘고 hard 판정은 그대로다.
  - 손수정 점검은 승인 불가, 건너뛰기만 받는다.
  - hard·locked 검사는 작품 설정을 받지 않는다.
- 새 기능 토글은 `checkConfig` 하나다(끝에 추가). 손수정 점검은 잠금 곁이라 토글이 없다.

**Tech Stack:** Node ESM + JSDoc, `node:test`, `yaml`, `@modelcontextprotocol/sdk`(1.x, stdio), ESLint 9 + TypeScript(`checkJs`). 뷰어는 `viewer/`(vite 8, React 19, 개발 의존성만).

**Spec:** 이 계획의 "설계 요약" 절이 C0 설계다. 사용자 브레인스토밍 없이 계획 세션이 추천안을 골랐다. 고른 것은 모두 결정 표에 "추천 채택(사용자 확인 필요)"로 적었다.
- 설계 정본: 착수 계획서 아티팩트 §09(설정은 조정, 잠금은 못 끔), §11(닫힌 떡밥이 다시 해소됨 → 경고), §12(검사에는 설정값이 있다).
- 인계 출처
  - `docs/plans/2026-09-28-roadmap-parallel.md`: 코어 레인, 핫스팟
  - `docs/plans/2026-09-29-m5-parity-rulings.md`: 손수정 덮어쓰기, 약속 읽기 셋
  - `docs/plans/2026-09-30-n5-brand-rulings.md`: H2(`withCheckConfig` 위치), H4(`brand.figures` 추천)
  - `docs/plans/2026-09-30-m6-viewer-rulings.md`: 뷰어 인계(자산 읽기, 기능 끄기, 후보 설정, CI)
  - `docs/plans/2026-09-28-n2-sources-rulings.md`: 자료 링크 항목

## 현재 상태 (이 계획을 시작하는 시점)

새 세션이 이전 대화 없이 이어받을 수 있게 적는다.

- **브랜치:** `feat/c0-core-handoff`. worktree는 `/path/to/folio-worktrees/c0`이다. main `f641366`에서 만들었다.
- **시작 시 테스트:** `npm run check` 937/937.
- **메인 체크아웃 금지:** `/path/to/folio`(`feat/n3-blocks`)는 N3 세션이 쓴다. 거기서 브랜치를 바꾸거나 파일을 고치지 않는다. `/path/to/folio-worktrees/m6`는 M6b 몫이다. 건드리지 않는다.
- **병합·push 없음:** 아무것도 main에 병합하지 않았고 push도 하지 않았다. 원격이 없다.
- **계획 코드 시험:** 이 계획의 코드는 scratch worktree(`f641366`에서 detach)에서 태스크 순서대로 적용하고 태스크마다 `npm run check`를 돌렸다. 결과는 "자기 점검" 절에 있다.
- **진행 기록:** 태스크를 마칠 때마다 아래 "진행" 줄에 커밋 범위와 테스트 수를 적는다. 판정은 `docs/plans/2026-09-30-c0-core-handoff-rulings.md`에 모은다(실행 세션이 만든다).

진행:
- 2026-09-30 사용자 승인: 코어 레인 인계를 먼저 처리하고, 묻지 말고 끝까지 가라고 했다. 결정 1–20("추천 채택(사용자 확인 필요)")을 모두 쓰인 대로 승인한 것으로 본다.
- A1~D1 완료, 최종 브랜치 리뷰와 고침 물결·재리뷰 완료. 커밋 `f2ed0b9..aab8c50`(18개). `npm run check` 992/992(lint·typecheck 통과). 뷰어 테스트 6/6, 빌드 성공.
- 판정·미룬 minor·다른 레인 인계는 `docs/plans/2026-09-30-c0-core-handoff-rulings.md`. B2는 계획 글("없는 import는 건너뛴다")과 달리 없는 import를 `PACK_FILE_MISSING`으로 막는다.
- 병합·push·PR·정본 수정은 하지 않았다(사용자에게 묻는다).

### 모듈 지도 (이 계획이 건드리는 것)

| 파일 | 하는 일 |
|---|---|
| `core/util/plain.js` (새) | `isPlainObject(value)`: `Object.prototype.toString` 태그가 `[object Object]`인가. Map·Set·Date·바이트·배열·null은 아니다 |
| `core/util/yaml.js` | `parseYaml(text, { source })`: YAML 문법 오류를 `YAML_INVALID`(파일·줄·칸)로 바꾼다 |
| `server/toolbox.js` | MCP 도구 결과 모양. Folio 오류가 아닌 것은 `INTERNAL_ERROR`(errno만)로, 원문은 `onError`(stderr)로. `assertRootUsable`이 파일인 root를 `WORK_ROOT_INVALID`로 막는다 |
| `core/pack/check-config.js` (새) | `withCheckConfig(pack)`(소설 팩에서 옮김), `takesWorkConfig`, `mergeCheckConfig`, `bindCheckConfig` |
| `core/checks/known-check-spec.js` (새) | `KNOWN_CHECK_FIELDS`, `readKnownCheckSpec`: 알려진 검사 한 줄의 필드·mode·config 검사 |
| `core/checks/check-set.js` | `applyToKnown`이 잠금 → hard config → 모양 → hard 규칙 → 설정 묶기 순서로 본다 |
| `core/pack/module-graph.js` (새) | `moduleGraph(dir, entries)`: 정적 상대 import를 따라간 `[경로, sha256]` 목록 |
| `core/pack/yaml-pack.js` | `loadYamlPack(dir, { modules })`: 선언 digest에 모듈 그래프를 넣는다 |
| `core/promise.js` | `stepPromise(stage, next)`: 약속 단계 한 걸음. `foldPromise`(잠금), `promiseMovement`, 소설 `promise-flow`가 같이 쓴다 |
| `core/checks/recommend.js` | 이 작품에 없는 검사를 부르는 세트는 추천하지 않는다. `describeCheckSets`에 `missingChecks` |
| `core/store/assets.js` | `readAssets(root, { hashFiles })`. 파일을 `O_NONBLOCK`으로 열고 fstat. 폴더·FIFO는 `ASSET_FILE_NOT_REGULAR` 경고 |
| `core/view/asset-file.js`, `core/view/viewer-target.js`, `server/view/api.js` | 그림 요청은 자기 파일만 읽는다. `viewerStillOn`이 꺼지면 서버가 `FEATURE_DISABLED`로 답하고 닫힌다 |
| `core/run/workspace.js`, `core/store/work.js`, `core/work/config.js`, `core/view/stage-toggle.js` | `openWorkspace(root, { packs, workYaml })`, `resolveWorkspaceConfig`. 단계 토글이 쓰기 전에 후보 설정으로 작품을 열어 본다 |
| `core/run/text-guard.js` (새) | `nodeTextChanged`, `commitLocked`, `writesNodeBody`, `textChangedQuestion`, `runTextDrift` |
| `core/run/runner.js`, `core/run/steps/children.js`, `core/run/decide.js`, `core/status.js` | 실행은 시작할 때 `fileHash`를 적는다. 커밋·자식 단계 전에 손수정이면 `NODE_TEXT_CHANGED`(건너뛰기만). 상태 `drift`에 `CHANGED_DURING_RUN` |
| `core/scope/scope.js` | 앞 사건 거르기를 Set 하나로 |
| `core/store/sources.js` | 이름이 둘 이상인 원본(하드 링크)을 `SOURCE_FILE_INVALID`로 |
| `.github/workflows/ci.yml` | 뷰어 `ci`·`test`·`build` 단계 |

## 설계 요약

### 항목별 확인 결과 (코드에서 확인)

| # | 항목 | 확인 | 태스크 |
|---|---|---|---|
| 1 | 작품별 검사 설정 | 진짜. `applyToKnown`은 `mode`·`severity`만 읽고 나머지 필드(`config`, `words`, `locked`)를 조용히 버렸다. `novel.md`·`brand.md`는 "아직 못 정한다"고 적었다 | B1 |
| 2 | `withCheckConfig`를 `core/pack`으로 | 필요. 작품 설정을 다시 묶으려면 원래 검사기 함수가 필요하고, 코어(`check-set.js`)가 팩을 import할 수 없다 | B1 |
| 3 | 팩 digest가 도우미·사전을 안 봄 | 진짜. 선언 digest는 yaml 글, 파일 목록, 검사기 함수 소스만 본다. `packs/novel/lexicons/*.js`나 `core/promise.js`가 바뀌어도 digest가 같다 | B2 |
| 4 | 약속 단계 읽기 셋 | 진짜. `foldPromise`, `promiseMovement`, 소설 `promise-flow`가 닫힌 뒤 사건을 서로 다르게 읽었다 | B3 |
| 5 | `brand.figures`를 `sources` 팩 없이 추천 | 진짜. 추천은 세트 멤버가 등록됐는지 보지 않았다 | B4 |
| 6 | `readAssets` 자산 읽기 | 진짜 셋. 요청마다 모든 그림을 다시 읽어 hash, 폴더 자산은 `EISDIR`로 `INTERNAL_ERROR`, FIFO는 작품 열기를 멈춘다 | C1 |
| 7 | YAML 1.1, `isPlainObject`의 Map | 진짜. `!!omap`(Map)·`!!set`·`!!timestamp`는 `%YAML 1.1` 지시 없이도 나온다. 9벌 중 대부분이 Map을 평범한 지도로 받아 빈 지도처럼 읽었다 | A1 |
| 8 | 파일인 root → `INTERNAL_ERROR` | 진짜. `ENOTDIR`가 날것으로 나갔다 | A2 |
| 9 | `INTERNAL_ERROR`가 Node 메시지를 흘림 | 진짜(MCP 쪽). M4는 Folio 오류 메시지만 300자로 잘랐고 M6a(V15)는 HTTP 쪽만 막았다. 도구 결과에는 절대 경로가 든 Node 메시지와 긴 입력이 그대로 나갔다 | A2 |
| 10 | `openWorkspace`가 메모리 설정을 못 받음 | 진짜. 단계 토글은 후보 설정을 따로 풀어서 봤고, 쓰기 전에 작품을 열어 보지 못했다 | C2 |
| 11 | 뷰어 기능을 꺼도 떠 있는 서버가 산다 | 진짜 | C1 |
| 12 | 승인 대기 중 첫 커밋 노드 손수정이 덮임 | 진짜. `fileHash` 점검은 다시 커밋 실행에만 있었다 | C3 |
| 13 | CI에 뷰어 테스트·빌드 없음 | 진짜 | D1 |
| 14 | 작은 정리 | `promiseIds` 배열 → Set, 순서 없는 노드 + promiseScope 테스트 빈칸은 진짜. 자료 하드 링크는 진짜(심볼릭 링크만 막았다). 자료 TOCTOU·중간 링크는 뺀다(아래 "뺀 것") | D1 |

### 잠금에 닿는 변화

- **B1:** hard 검사와 locked 검사는 `config`를 받지 않는다(`HARD_CHECK_CONFIG_LOCKED`, `LOCKED_CHECK_OVERRIDE`). `checkConfig`를 꺼도 잠금은 그대로다. 설정은 검사 digest(`CHECK_DIGEST_FIELDS`의 `config`)에 들어가 바뀌면 재검사 대상이 된다. 지적 등급은 여전히 선언 등급을 넘지 못한다(`stamp`).
- **B2:** 팩 digest가 더 많은 것을 본다. 더 자주 바뀔 뿐 덜 바뀌지 않는다. 결과: 이 태스크가 들어가면 내장 팩 digest가 한 번 바뀌므로 열린 실행은 검사를 한 번 다시 돈다(`ANSWER_STALE`/재동기화, 기존 동작).
- **B3:** `foldPromise`의 hard 판정은 그대로다(길이 4까지 모든 순서 4680개를 옛 fold와 비교). 닫힌 뒤 `advanced`·`misdirected`·`parked`·`resolved`는 이제 단계를 바꾸지 않는다. 그래서 닫힌 → 진전 → 해소가 경고 `PROMISE_RESOLVED_AFTER_CLOSE`를 새로 낸다(§11). 지난 노드에 미치는 결과:
  - 경고만 늘고 차단은 없다.
  - `core.promise-order`의 검사 digest는 그대로라 지난 노드가 자동으로 "다시 확인 필요"가 되지 않는다. 경고는 그 노드를 다시 검사하거나 다음 실행 때 보인다.
  - 뷰어 약속판은 그 약속을 `closed`로 보인다. 휴면 판정(`promise-dormant`)은 닫힌 약속의 진전을 움직임으로 세지 않는다.
  - 소설 팩 digest는 B2 모듈 그래프에 `core/promise.js`가 들어 있어 바뀐다(위 B2와 같은 한 번의 재동기화).
- **C3:** 새 점검은 쓰기를 멈추기만 한다. 승인 불가, 고쳐 쓰기 불가, 건너뛰기만. 영수증까지 기록된 커밋(`committing` + 영수증)은 잠금대로 끝내야 하므로 점검하지 않는다.

### 결정

| # | 결정 | 고른 것 | 다른 안 | 상태 |
|---|---|---|---|---|
| 1 | `isPlainObject` 기준 | `toString` 태그 `[object Object]`. 한 파일(`core/util/plain.js`)로 모은다 | 프로토타입 검사(`{ __proto__: ... }` 입력을 받는 기존 테스트가 깨진다) | 추천 채택(사용자 확인 필요) |
| 2 | YAML 1.1 태그(`!!omap` 등) | 거부. 그 자리의 기존 `*_INVALID` 코드로 알린다(features, checks, options, overrides.levels). `%YAML 1.1` 작품의 단계 토글은 `CONFIG_INVALID`로 쓰지 않는다 | `YAML.parse`에 `schema: 'core'` 강제(모든 읽기 경로를 바꿔야 한다) | 추천 채택(사용자 확인 필요) |
| 3 | YAML 문법 오류 | `YAML_INVALID`(파일 이름, 줄, 칸, `yamlCode`). work.yaml·노드·엔티티·자산·자료 모두 | 그대로 `INTERNAL_ERROR`(결정 4 뒤에는 작가가 어느 파일인지 모른다) | 추천 채택(사용자 확인 필요) |
| 4 | Folio 오류가 아닌 예외 | 도구 결과는 `INTERNAL_ERROR` 고정 메시지 + `details.errno`. 원문은 서버 stderr 한 줄(`folio-mcp: ...`). 큰 details(JSON 4000자 넘음)는 `{ truncated: true }` | 메시지만 자르기(절대 경로가 여전히 나간다) | 추천 채택(사용자 확인 필요) |
| 5 | 파일인 root | 도구 상자가 모든 도구 앞에서 `WORK_ROOT_INVALID`('root is not a folder' + hint). 없는 root(ENOENT)는 지나간다(`folio_init`이 만든다) | 도구마다 점검 | 추천 채택(사용자 확인 필요) |
| 6 | 알려진 검사 한 줄의 필드 | `mode`, `severity`, `config`만. 그 밖은 `CHECK_FIELD_UNKNOWN`, mode는 on·off만(`CHECK_MODE_INVALID`), 지도가 아니면 `CHECK_SPEC_INVALID`. **호환:** 예전에 조용히 무시되던 필드(예: 브랜드 검사에 `words:`)가 있는 work.yaml은 이제 열리지 않고 코드를 받는다 | 모르는 필드 경고만(조용히 약해진 설정을 작가가 모른다) | 추천 채택(사용자 확인 필요) |
| 7 | config 겹치기 | 팩 config 위에 깊은 병합. 지도끼리는 키마다, 배열은 작품 값으로 바꾼다. 팩 config에 없는 최상위 키는 `CHECK_CONFIG_KEY_UNKNOWN`. JSON 값만(깊이 8), 아니면 `CHECK_CONFIG_INVALID`. 값의 뜻은 검사기가 본다 | 얕은 병합(중첩 설정 `targets.*`를 통째로 바꿔야 한다) | 추천 채택(사용자 확인 필요) |
| 8 | 기능 토글 | `features.checkConfig`(기본 켜짐, 부모 없음, 실행 digest 밖 — 설정 자체가 검사 digest에 든다). 끄면 config 줄은 `CHECK_CONFIG_DISABLED` | 토글 없음(메모리 규칙: 새 기능은 토글) | 추천 채택(사용자 확인 필요) |
| 9 | hard·locked 검사의 config | 거부(`HARD_CHECK_CONFIG_LOCKED`, `LOCKED_CHECK_OVERRIDE`). 설정을 받지 않는 검사(모델 검사, 팩 config가 없는 검사)는 `CHECK_CONFIG_UNSUPPORTED` | hard도 "더 엄격한" 설정만 허용(엄격함을 코어가 판정할 수 없다) | 추천 채택(사용자 확인 필요) |
| 10 | `withCheckConfig` 위치 | `core/pack/check-config.js`로 옮긴다. 소설 팩은 다시 내보낸다(기존 import 호환), 브랜드 팩은 코어에서 가져온다 | 팩에 둠(코어가 원래 검사기를 못 찾는다) | 추천 채택(사용자 확인 필요) |
| 11 | 팩 digest | 정적 상대 import를 따라간 파일 hash 목록을 선언 digest에 넣는다(`modules`가 빈 목록이면 넣지 않아 기존 팩 digest는 그대로). 내장 팩 넷은 `checkers/index.js`에서 시작. 500파일 넘으면 `PACK_INVALID` | 폴더 전체 hash(팩 밖 `core/` 파일을 못 본다) | 추천 채택(사용자 확인 필요) |
| 12 | 약속 한 걸음 | `stepPromise`로 모은다. `foldPromise`는 엄격해지기만 한다(결정 근거: §11, 모든 4길이 순서 비교) | `foldPromise`는 그대로, 나머지 둘만 맞춤(셋이 계속 다르게 읽는다) | 추천 채택(사용자 확인 필요) |
| 13 | 멤버가 없는 세트 추천 | 추천(`recommendCheckSets`, `recommendForNode`)에서 뺀다. `describeCheckSets`는 그대로 보이고 `missingChecks`를 단다. 알려진 것 = 레지스트리 검사 + 코어 검사 + work.yaml `checks` 키 | 세트 목록(`describeCheckSets`)에서도 숨김(고르면 이미 `CHECK_UNKNOWN`으로 알린다. 목록에서 사라지면 작가가 이유를 모른다) | 추천 채택(사용자 확인 필요) |
| 14 | 자산 파일 | `readAssets(root, { hashFiles })`. 뷰어 그림 요청은 `hashFiles: false`로 목록만 읽고 자기 파일만 연다. 파일은 `O_RDONLY | O_NONBLOCK` + fstat. 폴더·FIFO·`ENOTDIR`는 경고 `ASSET_FILE_NOT_REGULAR`/없음 | 요청마다 캐시(무효화가 새 문제) | 추천 채택(사용자 확인 필요) |
| 15 | 뷰어 기능 끄기 | 요청마다 `viewerStillOn(root)`. 꺼졌으면 `FEATURE_DISABLED`(403)로 답하고 서버를 닫는다. `/api/shutdown`은 늘 받는다. work.yaml을 못 읽으면 켜진 것으로 보고 화면이 제 오류를 보인다 | 파일 감시(플랫폼마다 다르다) | 추천 채택(사용자 확인 필요) |
| 16 | 후보 설정 | `openWorkspace(root, { packs, workYaml })`, `openWork(root, { workYaml })`, `loadWorkConfig(root, { text })`. 단계 토글은 쓰기 전에 후보로 작품을 열어 보고, 쓴 뒤 다시 열어 보는 되돌림은 그대로 둔다 | 새 함수 `probeWorkspace` | 추천 채택(사용자 확인 필요) |
| 17 | 실행 도중 손수정 | 모든 실행이 시작할 때 `fileHash`를 적고, 커밋·자식 단계 전에 비교한다. 바뀌었으면 `NODE_TEXT_CHANGED`(blocked, `canApprove: false`, 고쳐 쓰기 `REVISION_UNAVAILABLE`, 건너뛰기만). 지금 본문이 이 실행의 원고와 같으면 바뀐 것으로 치지 않는다. 상태 `drift`에 `CHANGED_DURING_RUN`. 토글 없음(잠금 곁 — 덮어쓰기를 켤 길을 두지 않는다) | 경고만 내고 덮기(작가 글이 사라진다) | 추천 채택(사용자 확인 필요) |
| 18 | 실행 전부터 있던 손 글 | 그대로 덮는다(한계로 적는다). fixture의 잎 노드는 커밋 전 본문을 가진 채로 실행하는 흐름이 많다 | 실행 시작 때 막기(기존 흐름이 깨진다) | 추천 채택(사용자 확인 필요) |
| 19 | CI | `npm run check` 뒤에 `npm --prefix viewer ci`, `npm --prefix viewer test`, `npm --prefix viewer run build`. 행렬은 그대로 | 뷰어 따로 job(설치가 두 번) | 추천 채택(사용자 확인 필요) |
| 20 | 자료 하드 링크 | 원본 fstat의 `nlink > 1`이면 `SOURCE_FILE_INVALID`(작품이 열리지 않는다, 심볼릭 링크와 같다) | 경고만 | 추천 채택(사용자 확인 필요) |

### 뺀 것

- **자료 TOCTOU(N2):** 이미 한 번 연 손잡이에서만 읽는다. 남은 틈(폴더 바꿔치기)은 작품 폴더에 쓸 수 있는 공격자가 있어야 하고, 막으려면 Node에 없는 `openat`이 필요하다.
- **자료 중간 링크(N2):** macOS의 `/tmp`처럼 root 위 경로에 링크가 흔하다. N2 최종 리뷰도 두기로 했다. `sources/` 자체가 링크인 것은 이미 `SOURCES_DIR_INVALID`다.
- **실행 전부터 있던 손 글 막기:** 결정 18.
- **C0 전에 연 실행 파일:** `fileHash`가 없으면 손수정 점검을 하지 않는다(호환). 다음 실행부터 적용된다.

## Global Constraints

- 이름 `Folio`, MCP 도구 접두어 `folio_`, 작품 내부 폴더 `.folio/`.
- `package.json` `"engines": { "node": "^22.13.0 || ^24.0.0 || ^26.0.0" }`, `"type": "module"`. 런타임 의존성은 `yaml`과 `@modelcontextprotocol/sdk` 둘뿐이다. 늘리지 않는다. 네이티브 모듈은 금지다. `viewer/`는 개발 의존성만 쓴다.
- 엔진은 모델을 부르지 않는다. `core/`와 `packs/`는 모델·네트워크를 부르지 않고, 동적 `import()`도 쓰지 않는다(`test/core/no-model-calls.test.js`). `core/pack/module-graph.js`는 파일을 읽기만 하고 import하지 않는다.
- `server/view`는 `core/view/index.js`와 `core/errors.js`만 import한다(가드 테스트).
- 잠금 규칙은 설정·팩·세트·기능 토글 어느 것으로도 끌 수 없다.
  - 커밋 원고 hash = 검사 원고 hash
  - 영수증 없이 커밋 금지
  - hard 차단
  - 기록장은 추가만
  - 같은 호스트 자기검토를 독립 평가로 표기 금지
  - soft·참고 의견은 자동 수정 사유 아님
  - `core.promise-order`는 어떤 세트·토글에서도 돈다
- 이 계획의 잠금 경로 변경은 더 엄격해지기만 한다(B3 `foldPromise`, C3 손수정 점검, B1 hard·locked config 거부).
- 새 기능은 `work.yaml` `features`로 켜고 끈다(`checkConfig`). 잠금은 토글이 없다(C3).
- 검사 세트는 작가가 고른다. 추천만 한다(B4).
- 도구 목록, features, 팩 목록, 가드 목록은 끝에만 추가한다. 목록 테스트는 같은 커밋에서 고친다. 기존 assert는 약화하지 않는다. 테스트 준비를 바꾼 곳(C3 `decisions-replay`의 옛 실행 모양)은 주석으로 이유를 적는다.
- 테스트 데이터는 전부 합성이다. 원본 fixture(`test/fixtures/*`)는 고치지 않는다. 테스트는 복사본을 고친다.
- 파일 하나에 한 책임. 300줄을 넘기면 나눈다.
- 문서·주석 설명은 한국어, 코드 식별자는 영어. 커밋 메시지는 영어 Conventional Commits이고, 끝에 정확히 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`을 붙인다.
- `.superpowers/`는 커밋하지 않는다. 각 태스크는 자기 파일만 커밋한다. `/path/to/vibelore`는 읽기 전용이다.
- TDD: 실패하는 테스트 → 실패 확인 → 구현 → 통과 → `npm run check` 전부 초록 → 커밋.
- FIFO·권한 테스트는 win32(권한은 root 사용자도)에서 건너뛴다.
- 머신 부하가 높으면 전체 테스트가 몇 분 걸릴 수 있다. 느려졌다고 회귀로 단정하지 않는다.
- 리뷰
  - 가장 강한 리뷰어 모델에 맡기고 "공격해 볼 것"을 시도하게 할 태스크: A2(서버, 작품 밖 경로), B1(잠금·검사 등급), B2(팩 digest = 파이프라인 잠금), B3(잠금 `foldPromise`), C1(서버, 작품 밖 파일), C2(설정 검증·쓰기), C3(잠금·기록장·실행 경로), D1(범위, 자료 경로)
  - 보통 모델: A1, B4
- 마일스톤 정지: D1이 끝나면 결과를 보여 주고 멈춘다. main 병합·push·PR·정본 수정은 사용자에게 묻는다.

### 다른 레인과의 인계

- **N3(`feat/n3-blocks`):** 이 계획은 `core/run/runner.js`, `core/status.js`, `core/scope/scope.js`, `core/run/steps/children.js`, `core/store/tree.js`, `core/store/frontmatter.js`를 고친다. N3는 C0 병합 뒤 rebase한다. N3가 새 검사를 더하면 `checks.<id>.config`는 팩이 `withCheckConfig`(이제 `core/pack/check-config.js`)로 감싸야 받는다. N3가 팩 검사기 도우미를 더하면 `moduleGraph`가 자동으로 digest에 넣는다.
- **M6b(`feat/m6-viewer`):** 이 계획은 `server/view/api.js`(맨 앞 `viewerStillOn` 한 줄), `core/view/index.js`(내보내기 하나), `core/work/features.js`(끝에 `checkConfig`)를 고친다. M6b가 `viewerExport`를 features 끝에 더하면 순서만 맞추면 된다(목록 테스트 둘). 새 뷰어 라우트도 기능이 꺼지면 같은 길로 닫힌다.
- **팩 digest 한 번 바뀜(B2·B3):** 열린 실행은 검사를 한 번 다시 돈다. 병합 공지에 적는다.

---

## 파일 구조

태스크별로 만들고(C) 고치는(M) 파일이다. 줄 수는 그 태스크를 마친 때의 모습이다.

- **A1**
  - `core/checks/user-check-draft.js` M 79
  - `core/evidence/records.js` M 34
  - `core/evidence/scope.js` M 33
  - `core/evidence/validate.js` M 49
  - `core/occurrences/records.js` M 48
  - `core/pack/yaml-schema.js` M 206
  - `core/pipeline/levels.js` M 35
  - `core/util/plain.js` C 9
  - `core/work/config.js` M 143
  - `core/work/features.js` M 77
  - `test/core/plain-object.test.js` C 50
- **A2**
  - `core/store/assets.js` M 44
  - `core/store/entities.js` M 44
  - `core/store/frontmatter.js` M 30
  - `core/store/sources.js` M 125
  - `core/store/tree.js` M 119
  - `core/util/yaml.js` M 22
  - `core/work/config.js` M 143
  - `server/toolbox.js` M 70
  - `test/server/tool-errors.test.js` M 92
  - `test/server/tools.test.js` M 166
- **B1**
  - `core/checks/check-set.js` M 100
  - `core/checks/known-check-spec.js` C 50
  - `core/pack/check-config.js` C 65
  - `core/work/features.js` M 80
  - `packs/brand/README.md` M 10
  - `packs/brand/checkers/banned-phrases.js` M 38
  - `packs/brand/index.js` M 8
  - `packs/novel/README.md` M 10
  - `packs/novel/index.js` M 11
  - `server/tools/config.js` M 40
  - `skill/folio/references/brand.md` M 53
  - `skill/folio/references/checks.md` M 135
  - `skill/folio/references/novel.md` M 68
  - `test/core/features.test.js` M 108
  - `test/run/work-check-config.test.js` C 99
  - `test/server/feature-toggles.test.js` M 64
- **B2**
  - `core/pack/module-graph.js` C 40
  - `core/pack/yaml-pack.js` M 102
  - `packs/brand/README.md` M 10
  - `packs/brand/index.js` M 8
  - `packs/knowledge/index.js` M 7
  - `packs/novel/README.md` M 10
  - `packs/novel/index.js` M 11
  - `packs/sources/README.md` M 10
  - `packs/sources/index.js` M 7
  - `test/pack/pack-module-digest.test.js` C 88
- **B3**
  - `core/promise.js` M 140
  - `packs/novel/checkers/promise-flow.js` M 46
  - `test/core/promise-step.test.js` C 73
- **B4**
  - `core/checks/recommend.js` M 74
  - `skill/folio/references/brand.md` M 53
  - `skill/folio/references/checks.md` M 135
  - `test/core/recommend-available.test.js` C 39
- **C1**
  - `core/store/assets.js` M 75
  - `core/view/asset-file.js` M 51
  - `core/view/index.js` M 12
  - `core/view/viewer-target.js` M 30
  - `server/view/api.js` M 54
  - `skill/folio/references/viewer.md` M 17
  - `test/core/assets-files.test.js` C 59
  - `test/server/view-lifecycle.test.js` C 59
- **C2**
  - `core/run/workspace.js` M 60
  - `core/store/work.js` M 39
  - `core/view/stage-toggle.js` M 123
  - `core/work/config.js` M 148
  - `test/core/workspace-candidate.test.js` C 40
- **C3**
  - `core/run/decide.js` M 85
  - `core/run/runner.js` M 212
  - `core/run/steps/children.js` M 92
  - `core/run/text-guard.js` C 44
  - `core/status.js` M 68
  - `skill/folio/SKILL.md` M 94
  - `test/run/decisions-replay.test.js` M 73
  - `test/run/hand-edit-guard.test.js` C 102
- **D1**
  - `.github/workflows/ci.yml` M 35
  - `core/scope/scope.js` M 85
  - `core/store/sources.js` M 126
  - `skill/folio/references/sources.md` M 55
  - `test/core/source-hardlink.test.js` C 25
  - `test/run/scope.test.js` M 126

---

# Part A — 입력과 오류 모양

### Task A1: `isPlainObject` 하나로, YAML 1.1 지도 거부

> 리뷰: 보통 모델. 확인할 것: 9벌이 모두 한 import로 바뀌었는가, 남은 로컬 정의가 없는가(`grep -rn "const isPlainObject" core`).

**Files:**
- Create: `core/util/plain.js`, `test/core/plain-object.test.js`
- Modify: `core/occurrences/records.js`, `core/pipeline/levels.js`, `core/evidence/records.js`, `core/evidence/validate.js`, `core/evidence/scope.js`, `core/pack/yaml-schema.js`, `core/work/config.js`, `core/checks/user-check-draft.js`, `core/work/features.js`

**Interfaces:**
- Produces: `isPlainObject(value): value is Record<string, any>` (`core/util/plain.js`).
- `core/work/config.js` `readOrder`: `order.levels`가 지도가 아니면 `ORDER_MODE_INVALID`(`value: 'levels'`).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/core/plain-object.test.js` (50줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isPlainObject } from '../../core/util/plain.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { parseYaml } from '../../core/util/yaml.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { viewStages } from '../../core/view/stages-view.js';
import { setStageMode } from '../../core/view/stage-toggle.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';

const LEVELS = 'levels:\n  - name: arc\n  - name: episode\n    leaf: true\n';
const codes = (text) => validateWorkConfig(parseYaml(text)).errors.map((e) => e.code);

test('isPlainObject takes plain maps only: not arrays, null, Map, Set, Date or bytes', () => {
  for (const yes of [{}, { a: 1 }, Object.create(null), JSON.parse('{"a":{"b":1}}'), parseYaml('a: 1')]) assert.equal(isPlainObject(yes), true);
  for (const no of [null, undefined, 1, 'x', [], new Map(), new Set(), new Date(0), new Uint8Array(1), parseYaml('a: !!omap [ { b: 1 } ]').a]) assert.equal(isPlainObject(no), false, String(no));
});

test('YAML tags that make a Map, Set or Date are refused with a code in work.yaml maps, not silently read as empty', () => {
  assert.deepEqual(codes(`%YAML 1.1\n---\n${LEVELS}features: !!omap\n  - viewer: false\n`), ['FEATURES_INVALID']);
  assert.deepEqual(codes(`${LEVELS}features: !!set\n  ? viewer\n`), ['FEATURES_INVALID']);
  assert.deepEqual(codes(`${LEVELS}checks: !!omap\n  - x: { mode: off }\n`), ['CHECKS_INVALID']);
  assert.deepEqual(codes(`${LEVELS}options: !!omap\n  - includeAllHardChecks: true\n`), ['OPTIONS_INVALID']);
  assert.deepEqual(codes(`${LEVELS}order:\n  default: linear\n  levels: !!omap\n    - episode: none\n`), ['ORDER_MODE_INVALID']);
  assert.deepEqual(codes(`${LEVELS}userCheckSets:\n  mine: !!omap\n    - checks: [x]\n`), ['USER_CHECK_SET_INVALID']);
  assert.deepEqual(codes(`${LEVELS}features:\n  viewer: false\n`), [], 'a plain map still works');
});

test('an !!omap under overrides.levels makes the work refuse to open instead of ignoring the override', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const path = join(root, 'work.yaml');
  const text = (await readFile(path, 'utf8')).replace('overrides: {}\n', 'overrides:\n  levels: !!omap\n    - episode:\n        critic: { mode: off }\n');
  assert.match(text, /!!omap/);
  await writeFile(path, text);
  await assert.rejects(openWorkspace(root, { packs: fakePacks() }), (error) => error.code === 'CONFIG_INVALID' && error.details.errors.some((e) => e.code === 'OVERRIDE_LEVELS_INVALID'));
});

test('in a %YAML 1.1 work.yaml the viewer toggle is refused as CONFIG_INVALID and nothing is written (it no longer answers success)', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const path = join(root, 'work.yaml');
  await writeFile(path, `%YAML 1.1\n---\n${await readFile(path, 'utf8')}`);
  const before = await readFile(path, 'utf8');
  const { digest } = await viewStages(root, { packs: fakePacks() });
  await assert.rejects(setStageMode(root, { packs: fakePacks() }, { level: 'episode', stepId: 'critic', mode: 'off', baseDigest: digest }), { code: 'CONFIG_INVALID' });
  assert.equal(await readFile(path, 'utf8'), before);
});
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/core/plain-object.test.js`
Expected: FAIL — `core/util/plain.js`가 없다(ERR_MODULE_NOT_FOUND)

- [ ] **Step 3: 구현**

`core/util/plain.js` (9줄):

````js
/**
 * YAML·JSON 에서 읽은 평범한 객체(키-값 지도)인가. 객체 꼬리표가 `[object Object]` 인 것만 그렇다.
 * 배열·null 은 물론, YAML 태그가 만드는 Map(!!omap)·Set(!!set)·Date(!!timestamp)·Uint8Array(!!binary)도 아니다 —
 * 그런 값을 지도로 받으면 Object.entries 가 비어 안의 설정이 조용히 사라진다(`%YAML 1.1` work.yaml 의 토글 등).
 * 엔진 코어의 모든 "지도인가" 판단이 이 함수 하나를 쓴다.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';
````

`core/occurrences/records.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/occurrences/records.js b/core/occurrences/records.js
index 2f8d241..69bc15c 100644
--- a/core/occurrences/records.js
+++ b/core/occurrences/records.js
@@ -1,5 +1,6 @@
 import { openLedger } from '../ledger/ledger.js';
 import { surfaceKey } from './surfaces.js';
+import { isPlainObject } from '../util/plain.js';

 /** 등장 위치 기록장 이름(.folio/ledger/occurrences.jsonl). 추가만 된다. */
 export const OCCURRENCES_LEDGER = 'occurrences';
@@ -7,9 +8,6 @@ export const OCCURRENCES_LEDGER = 'occurrences';
 export const OCCURRENCE_KINDS = Object.freeze(['appearance', 'mention']);
 export const MAX_ITEMS = 500;

-/** @param {unknown} value @returns {value is Record<string, unknown>} */
-const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
-
 /**
  * 표면 모양이 올바른지: 평범한 객체이고 kind·id 가 문자열, field 는 있으면 문자열.
  * @param {unknown} surface
````

`core/pipeline/levels.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/pipeline/levels.js b/core/pipeline/levels.js
index 7627e97..e2707cd 100644
--- a/core/pipeline/levels.js
+++ b/core/pipeline/levels.js
@@ -1,4 +1,4 @@
-const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
+import { isPlainObject } from '../util/plain.js';

 /**
  * work.yaml overrides 를 전체 덮어쓰기와 레벨별 덮어쓰기로 나눈다.
````

`core/evidence/records.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/evidence/records.js b/core/evidence/records.js
index 489e5f7..641a350 100644
--- a/core/evidence/records.js
+++ b/core/evidence/records.js
@@ -1,4 +1,5 @@
 import { openLedger } from '../ledger/ledger.js';
+import { isPlainObject } from '../util/plain.js';

 /** 근거 연결 기록장 이름(.folio/ledger/evidence.jsonl). 추가만 된다. */
 export const EVIDENCE_LEDGER = 'evidence';
@@ -6,8 +7,6 @@ export const EVIDENCE_LEDGER = 'evidence';
 export const MAX_CLAIMS = 200;
 export const MAX_LINKS = 20;

-/** @param {unknown} value @returns {value is Record<string, any>} */
-const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
 const isLink = (link) => isPlainObject(link) && typeof link.sourceId === 'string' && typeof link.quote === 'string';
 const isClaim = (claim) => isPlainObject(claim) && typeof claim.quote === 'string' && Array.isArray(claim.sources) && claim.sources.every(isLink);

````

`core/evidence/validate.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/evidence/validate.js b/core/evidence/validate.js
index 5efc54f..612820e 100644
--- a/core/evidence/validate.js
+++ b/core/evidence/validate.js
@@ -1,9 +1,8 @@
 import { MAX_QUOTE, resolveQuote } from '../occurrences/anchor.js';
 import { MAX_CLAIMS, MAX_LINKS } from './records.js';
 import { checkSourceQuote } from './source-quote.js';
+import { isPlainObject } from '../util/plain.js';

-/** @param {unknown} value @returns {value is Record<string, any>} */
-const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
 const clip = (value) => String(value).slice(0, 100);

 /**
````

`core/evidence/scope.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/evidence/scope.js b/core/evidence/scope.js
index a18a62d..36aba63 100644
--- a/core/evidence/scope.js
+++ b/core/evidence/scope.js
@@ -1,8 +1,8 @@
 import { reanchor } from '../occurrences/anchor.js';
 import { latestByNode } from './records.js';
 import { checkSourceQuote } from './source-quote.js';
+import { isPlainObject } from '../util/plain.js';

-const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
 /** @param {unknown} link */
 const isLink = (link) => isPlainObject(link) && typeof (/** @type {any} */ (link)).sourceId === 'string' && typeof (/** @type {any} */ (link)).quote === 'string';
 /** 모양이 틀린 주장(객체가 아님, sources 가 배열이 아님)은 짐작하지 않고 건너뛴다 — 실행 파일을 믿지 않는다(record-run.js 와 같은 태도). @param {unknown} claim */
````

`core/pack/yaml-schema.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/pack/yaml-schema.js b/core/pack/yaml-schema.js
index c854cc8..3853866 100644
--- a/core/pack/yaml-schema.js
+++ b/core/pack/yaml-schema.js
@@ -1,8 +1,8 @@
 import { FINDING_SEVERITIES } from '../ledger/receipts.js';
 import { CHECK_TIERS, LOCKED_STAGES, MAX_LOOP, STEP_KINDS, STEP_MODES } from '../pipeline/define.js';
 import { validateWorkConfig } from '../work/config.js';
+import { isPlainObject } from '../util/plain.js';

-const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
 const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
 const str = (value) => (typeof value === 'string' ? value : '');
 const TOP = ['name', 'version', 'title', 'description', 'presets', 'pipelines', 'prompts', 'checks', 'checkSets', 'defaultCheckSets'];
````

`core/work/config.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/work/config.js b/core/work/config.js
index f203946..0aa1b2d 100644
--- a/core/work/config.js
+++ b/core/work/config.js
@@ -3,11 +3,11 @@ import { FolioError } from '../errors.js';
 import { readTextOrNull } from '../util/fs.js';
 import { parseYaml } from '../util/yaml.js';
 import { readFeatures } from './features.js';
+import { isPlainObject } from '../util/plain.js';

 export const ORDER_MODES = ['linear', 'none', 'branching'];
 export const SUPPORTED_VARIANTS = ['main'];
 const LEVEL_NAME = /^[a-z][a-z0-9-]*$/;
-const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
 const isRange = (value) => Array.isArray(value) && value.length === 2
   && value.every((n) => Number.isInteger(n) && n >= 0) && value[0] <= value[1];

@@ -45,6 +45,7 @@ function readOrder(input, levelNames, errors) {
   }
   const order = { default: input.default ?? 'linear', levels: {} };
   if (!ORDER_MODES.includes(order.default)) errors.push({ code: 'ORDER_MODE_INVALID', value: order.default });
+  if (input.levels !== undefined && !isPlainObject(input.levels)) { errors.push({ code: 'ORDER_MODE_INVALID', value: 'levels' }); return order; }
   for (const [level, mode] of Object.entries(input.levels ?? {})) {
     if (!levelNames.includes(level)) errors.push({ code: 'ORDER_LEVEL_UNKNOWN', level });
     else if (!ORDER_MODES.includes(mode)) errors.push({ code: 'ORDER_MODE_INVALID', value: mode });
````

`core/checks/user-check-draft.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/checks/user-check-draft.js b/core/checks/user-check-draft.js
index d6f4bd7..59c8e1b 100644
--- a/core/checks/user-check-draft.js
+++ b/core/checks/user-check-draft.js
@@ -1,6 +1,7 @@
 import { posix } from 'node:path';
 import { USER_SEVERITIES } from './user-checks.js';
 import { CHECKS_DIR } from './check-sources.js';
+import { isPlainObject } from '../util/plain.js';

 const ID = /^[a-z][a-z0-9-]*$/;
 const FIELDS = ['id', 'title', 'description', 'rule', 'source', 'samples', 'words', 'pattern', 'severity', 'stage', 'experimental', 'requireQuote'];
@@ -21,8 +22,6 @@ export function stagesByTier(pipelines) {
   return out;
 }

-const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
-
 /** checks/ 아래 상대 경로인가(.. 로 빠져나가지 않는가). */
 function insideChecks(path) {
   if (typeof path !== 'string' || path.startsWith('/')) return false;
````

`core/work/features.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/work/features.js b/core/work/features.js
index a5d93d8..8a69cf9 100644
--- a/core/work/features.js
+++ b/core/work/features.js
@@ -1,5 +1,6 @@
 import { FolioError } from '../errors.js';
 import { canonicalJson, sha256 } from '../util/hash.js';
+import { isPlainObject } from '../util/plain.js';

 /**
  * 작가가 켜고 끄는 기능과 기본값(설계 결정 M4 #7, N2 §5). 잠금 규칙은 여기 없다 — 어떤 값도 잠금을 약하게 하지 않는다.
@@ -34,8 +35,6 @@ export const FEATURE_PARENTS = Object.freeze({
 /** 실행이 묻는 것·검사 범위를 바꾸는 기능. 이것이 바뀌면 열린 실행은 검사부터 다시 돈다. */
 export const RUN_FEATURES = Object.freeze(['occurrencesInExtract', 'occurrenceScope', 'sources', 'evidence', 'evidenceInExtract', 'promiseScope']);

-const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
-
 /**
  * features: 알려진 불리언만. 빠진 것은 기본값.
  * 부모가 꺼지면 자식도 저절로 꺼진다(작가가 부모만 꺼도 작품이 막히지 않는다 — 기능은 빼는 것이지 막는 것이 아니다).
````

- [ ] **Step 4: 통과 확인**

Run: `node --test test/core/plain-object.test.js test/core/features.test.js`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: lint·typecheck 통과, 테스트 941/941

- [ ] **Step 6: 커밋**

```bash
git add core/checks/user-check-draft.js core/evidence/records.js core/evidence/scope.js core/evidence/validate.js core/occurrences/records.js core/pack/yaml-schema.js core/pipeline/levels.js core/util/plain.js core/work/config.js core/work/features.js test/core/plain-object.test.js
git commit -m "$(cat <<'EOF'
refactor(util): one strict isPlainObject; refuse YAML 1.1 maps in work.yaml

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task A2: 도구 오류가 작품 밖 경로를 흘리지 않게, 파일인 root, `YAML_INVALID`

> 리뷰: **가장 강한 모델**(서버, 작품 밖 경로). 공격해 볼 것:
> - 어떤 도구 입력으로든 절대 경로, 홈 폴더 이름, Node 메시지 원문이 도구 결과에 나오는가(`ENOENT`, `EACCES`, `EISDIR`, `ELOOP`, 문자열 throw, `null` throw).
> - 거대한 입력(긴 root, 긴 id, 거대한 details)이 잘리지 않고 되돌아오는가.
> - 파일인 root, 파일 아래 root(`file.txt/sub`), 권한 없는 root, 링크 root가 `INTERNAL_ERROR`인가. 없는 root로 `folio_init`은 여전히 되는가.
> - `YAML_INVALID`의 `source`가 작품 밖 경로를 싣는가(작품 안 상대 경로만이어야 한다).
> - `onError`가 stdout에 쓰는가(stdio MCP를 깨뜨린다).

**Files:**
- Modify: `server/toolbox.js`, `core/util/yaml.js`, `core/work/config.js`, `core/store/assets.js`, `core/store/sources.js`, `core/store/frontmatter.js`, `core/store/tree.js`, `core/store/entities.js`
- Test: `test/server/tool-errors.test.js`(다시 씀), `test/server/tools.test.js`

**Interfaces:**
- `createToolbox({ packs, handlers?, onError? })`: `onError(error)`는 Folio 오류가 아닌 예외의 원문을 받는다. 기본은 stderr 한 줄.
- 도구 결과: `INTERNAL_ERROR`는 `message: 'internal error (see the folio-mcp server log)'`, `details: { errno }`(있을 때만 코드 문자열).
- `WORK_ROOT_INVALID`: root가 폴더가 아니다(`details.hint`), 또는 stat이 ENOENT 밖의 오류(`details.errno`).
- `parseYaml(text, { source })`: 문법 오류는 `FolioError('YAML_INVALID', '<source> is not valid YAML (<code>) at line L, column C', { source, line, column, yamlCode })`.
- `parseDoc(text, { source })`: `FRONTMATTER_UNCLOSED`에도 `source`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/server/tool-errors.test.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/test/server/tool-errors.test.js b/test/server/tool-errors.test.js
index 4a38af5..02f1cd1 100644
--- a/test/server/tool-errors.test.js
+++ b/test/server/tool-errors.test.js
@@ -1,8 +1,13 @@
 import { test } from 'node:test';
 import assert from 'node:assert/strict';
+import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { dirname, join } from 'node:path';
 import { createToolbox } from '../../server/toolbox.js';
 import { FolioError } from '../../core/errors.js';
 import { validateInput } from '../../server/validate-input.js';
+import { loadBuiltinPacks } from '../../packs/index.js';
+import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';

 const handlers = (fn) => ({ folio_status: fn });

@@ -15,13 +20,69 @@ test('long FolioError messages are cut to 300 characters, keeping the code and d
   assert.deepEqual(out.error.details, { hint: 'h' });
 });

-test('non-Folio errors become INTERNAL_ERROR with a cut message and the errno', async () => {
+test('non-Folio errors become INTERNAL_ERROR with the errno only; the Node message and its path stay in the server log', async () => {
   const error = Object.assign(new Error(`ENOTDIR: not a directory, stat '${'/p'.repeat(400)}'`), { code: 'ENOTDIR' });
-  const tools = createToolbox({ packs: new Map(), handlers: handlers(async () => { throw error; }) });
+  const logged = [];
+  const tools = createToolbox({ packs: new Map(), handlers: handlers(async () => { throw error; }), onError: (e) => { logged.push(e); } });
   const out = await tools.call('folio_status', { root: '/w' });
   assert.equal(out.error.code, 'INTERNAL_ERROR');
-  assert.ok(out.error.message.length <= 300);
+  assert.doesNotMatch(out.error.message, /ENOTDIR|\/p\/p/);
   assert.deepEqual(out.error.details, { errno: 'ENOTDIR' });
+  assert.deepEqual(logged, [error]);
+});
+
+test('C0: huge details and a huge relative root are not echoed back uncut', async () => {
+  const tools = createToolbox({ packs: new Map(), handlers: handlers(async () => { throw new FolioError('X_BIG', 'big', { list: 'z'.repeat(5000) }); }) });
+  assert.deepEqual((await tools.call('folio_status', { root: '/w' })).error.details, { truncated: true });
+  const relative = await tools.call('folio_status', { root: `w${'x'.repeat(5000)}` });
+  assert.equal(relative.error.code, 'ROOT_NOT_ABSOLUTE');
+  assert.ok(relative.error.message.length <= 300 && relative.error.details.root.length <= 300);
+});
+
+test('C0: a root that is a file, or sits under a file, is WORK_ROOT_INVALID for every tool — never INTERNAL_ERROR', async () => {
+  const dir = await mkdtemp(join(tmpdir(), 'folio-root-file-'));
+  const file = join(dir, 'not-a-folder.md');
+  await writeFile(file, '# 파일\n');
+  const logged = [];
+  const tools = createToolbox({ packs: await loadBuiltinPacks(), onError: (e) => { logged.push(e); } });
+  const calls = [
+    ['folio_status', {}], ['folio_config', {}], ['folio_run', {}], ['folio_find', { query: 'node', id: 'x' }], ['folio_view', {}],
+    ['folio_sources', { op: 'list' }], ['folio_init', { title: 't', preset: 'serial' }],
+  ];
+  for (const root of [file, join(file, 'inside')]) {
+    for (const [name, args] of calls) {
+      const out = await tools.call(name, { root, ...args });
+      assert.equal(out.error?.code, 'WORK_ROOT_INVALID', `${name} ${root}`);
+      assert.ok(!out.error.message.includes(dir), 'the path is not echoed');
+    }
+  }
+  assert.deepEqual(logged, []);
+  const missing = join(dir, 'new-work');
+  assert.equal((await tools.call('folio_status', { root: missing })).error.code, 'WORK_NOT_FOUND', 'a missing root is left to the tool');
+  await mkdir(join(dir, 'empty'));
+  assert.equal((await tools.call('folio_status', { root: join(dir, 'empty') })).error.code, 'WORK_NOT_FOUND');
+});
+
+test('C0: broken YAML in work.yaml, a node, an entity, an asset or a source is YAML_INVALID naming the file and line — not INTERNAL_ERROR', async () => {
+  const cases = {
+    'work.yaml': 'levels: [\n',
+    'tree/01-arc-awakening/01-ep-001.md': '---\nid: [\n---\n본문\n',
+    'entities/character/hana.md': '---\nid: [\n---\n',
+    'assets/x.yaml': 'id: [\n',
+    'sources/x.yaml': 'id: [\n',
+  };
+  for (const [file, text] of Object.entries(cases)) {
+    const root = await copyFixture('serial-2level');
+    await useFakePack(root);
+    await mkdir(dirname(join(root, file)), { recursive: true });
+    await writeFile(join(root, file), text);
+    const tools = createToolbox({ packs: fakePacks(), onError: () => { throw new Error('no internal error expected'); } });
+    const out = await tools.call('folio_status', { root });
+    assert.equal(out.error?.code, 'YAML_INVALID', file);
+    assert.equal(out.error.details.source, file);
+    assert.equal(typeof out.error.details.line, 'number');
+    assert.ok(!out.error.message.includes('id: ['), 'the text is not echoed');
+  }
 });

 test('validateInput knows maxLength, maxItems and maximum', () => {
````

`test/server/tools.test.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/test/server/tools.test.js b/test/server/tools.test.js
index 3857018..eddf22e 100644
--- a/test/server/tools.test.js
+++ b/test/server/tools.test.js
@@ -145,8 +145,10 @@ test('only server/ imports the MCP SDK', async () => {

 test('core error details such as hints pass through, and anything else becomes INTERNAL_ERROR', async () => {
   const { FolioError } = await import('../../core/errors.js');
+  const logged = [];
   const tools = createToolbox({
     packs: new Map(),
+    onError: (error) => { logged.push(String(error?.message ?? error)); },
     handlers: {
       folio_resume: async () => { throw new FolioError('ANSWER_STALE', 'config changed', { runId: 'run-1', hint: 'run folio_run again' }); },
       folio_status: async () => { throw new TypeError('boom'); },
@@ -156,8 +158,9 @@ test('core error details such as hints pass through, and anything else becomes I
   const stale = await tools.call('folio_resume', { root: '/w', runId: 'run-1', answers: {} });
   assert.deepEqual(stale.error.details, { runId: 'run-1', hint: 'run folio_run again' });
   assert.equal(stale.error.code, 'ANSWER_STALE');
-  assert.deepEqual((await tools.call('folio_status', { root: '/w' })).error, { code: 'INTERNAL_ERROR', message: 'boom', details: { errno: null } });
+  assert.deepEqual((await tools.call('folio_status', { root: '/w' })).error, { code: 'INTERNAL_ERROR', message: 'internal error (see the folio-mcp server log)', details: { errno: null } });
   assert.equal(code(await tools.call('folio_find', { root: '/w', query: 'node', id: 'x' })), 'INTERNAL_ERROR');
+  assert.deepEqual(logged, ['boom', 'not an error'], 'the raw message stays on the server side');
   assert.equal(code(await tools.call('folio_status', 'not an object')), 'TOOL_INPUT_INVALID');
   assert.equal(code(await tools.call('folio_status', null)), 'TOOL_INPUT_INVALID');
 });
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/server/tool-errors.test.js test/server/tools.test.js`
Expected: FAIL — `INTERNAL_ERROR` 메시지가 Node 원문이고, 파일 root가 `INTERNAL_ERROR`, YAML 오류에 `YAML_INVALID`가 없다

- [ ] **Step 3: 구현**

`server/toolbox.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/server/toolbox.js b/server/toolbox.js
index 250c5ae..6676cc3 100644
--- a/server/toolbox.js
+++ b/server/toolbox.js
@@ -1,3 +1,4 @@
+import { stat } from 'node:fs/promises';
 import { isAbsolute } from 'node:path';
 import { FolioError } from '../core/errors.js';
 import { TOOLS } from './tools/definitions.js';
@@ -5,31 +6,64 @@ import { createHandlers } from './tools/handlers.js';
 import { validateInput } from './validate-input.js';

 const MAX_MESSAGE = 300;
+const MAX_DETAILS = 4000;
 const cut = (text) => (text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text);

-/** 오류를 값으로. 메시지는 300자까지 자른다(사용자 입력·경로가 끝없이 되돌아오지 않게). FolioError 가 아니면 INTERNAL_ERROR + errno. */
-const failure = (error) => (error instanceof FolioError
-  ? { ok: false, error: { code: error.code, message: cut(error.message), details: error.details ?? {} } }
-  : { ok: false, error: { code: 'INTERNAL_ERROR', message: cut(String(error?.message ?? error)), details: { errno: typeof error?.code === 'string' ? error.code : null } } });
+/** @param {unknown} error */
+const logToStderr = (error) => {
+  process.stderr.write(`folio-mcp: ${String(/** @type {any} */ (error)?.message ?? error).replace(/\s+/g, ' ').slice(0, MAX_MESSAGE)}\n`);
+};
+
+/**
+ * 오류를 값으로.
+ * - FolioError: 코드, 300자로 자른 메시지, details(JSON 4000자가 넘으면 싣지 않고 `{ truncated: true }`) — 사용자 입력·경로가 끝없이 되돌아오지 않게.
+ * - 그 밖(Node 오류 등): INTERNAL_ERROR + errno 만. Node 원문(경로·입력이 섞임)은 호스트에 돌려주지 않고 onError(기본 stderr 한 줄)로만 남긴다.
+ * @param {unknown} error
+ * @param {(error: unknown) => void} onError
+ */
+function failure(error, onError) {
+  if (error instanceof FolioError) {
+    const details = error.details ?? {};
+    return { ok: false, error: { code: error.code, message: cut(error.message), details: JSON.stringify(details).length <= MAX_DETAILS ? details : { truncated: true } } };
+  }
+  onError(error);
+  const errno = /** @type {any} */ (error)?.code;
+  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'internal error (see the folio-mcp server log)', details: { errno: typeof errno === 'string' ? errno : null } } };
+}
+
+/**
+ * root 가 있는데 폴더가 아니면(파일 등) 도구마다 다른 Node 오류(ENOTDIR 등) 대신 WORK_ROOT_INVALID 하나로 거부한다.
+ * 없으면 여기서 막지 않는다 — 도구가 정한다(folio_init 은 만들고, 나머지는 WORK_NOT_FOUND).
+ * @param {string} root
+ */
+async function assertRootUsable(root) {
+  let info;
+  try { info = await stat(root); } catch (error) {
+    if (/** @type {any} */ (error)?.code === 'ENOENT') return;
+    throw new FolioError('WORK_ROOT_INVALID', 'root cannot be used as a work folder', { errno: /** @type {any} */ (error)?.code ?? null });
+  }
+  if (!info.isDirectory()) throw new FolioError('WORK_ROOT_INVALID', 'root is not a folder', { hint: 'give the absolute path of the work folder (the one with work.yaml)' });
+}

 /**
  * 도구 상자: 이름과 인자로 부르고, 결과나 오류를 값으로 돌려준다(던지지 않는다). MCP 서버와 테스트가 같은 것을 쓴다.
- * @param {{ packs: Map<string, any>, handlers?: Record<string, (args: any) => Promise<any>> }} options
+ * @param {{ packs: Map<string, any>, handlers?: Record<string, (args: any) => Promise<any>>, onError?: (error: unknown) => void }} options
  */
-export function createToolbox({ packs, handlers = createHandlers({ packs }) }) {
+export function createToolbox({ packs, handlers = createHandlers({ packs }), onError = logToStderr }) {
   const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
   async function call(name, args = {}) {
     try {
       const tool = byName.get(name);
-      if (!tool) return failure(new FolioError('TOOL_UNKNOWN', String(name), { tools: [...byName.keys()] }));
+      if (!tool) return failure(new FolioError('TOOL_UNKNOWN', String(name), { tools: [...byName.keys()] }), onError);
       const input = args ?? {};
       const errors = validateInput(tool.inputSchema, input);
-      if (errors.length) return failure(new FolioError('TOOL_INPUT_INVALID', errors.map((e) => `${e.path} ${e.message}`).join('; '), { errors }));
-      if (!isAbsolute(input.root)) return failure(new FolioError('ROOT_NOT_ABSOLUTE', input.root, { root: input.root }));
+      if (errors.length) return failure(new FolioError('TOOL_INPUT_INVALID', errors.map((e) => `${e.path} ${e.message}`).join('; '), { errors }), onError);
+      if (!isAbsolute(input.root)) return failure(new FolioError('ROOT_NOT_ABSOLUTE', input.root, { root: cut(input.root) }), onError);
+      await assertRootUsable(input.root);
       return { ok: true, result: await handlers[name](input) };
     } catch (error) {
       // 검증·조회·처리 어디서 무엇이 던져져도 값으로 돌려준다. FolioError 의 details(hint 등)는 그대로 싣는다.
-      return failure(error);
+      return failure(error, onError);
     }
   }
   return { tools: TOOLS, call };
````

`core/util/yaml.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/util/yaml.js b/core/util/yaml.js
index a76bdc1..b3775f9 100644
--- a/core/util/yaml.js
+++ b/core/util/yaml.js
@@ -1,4 +1,22 @@
 import YAML from 'yaml';
+import { FolioError } from '../errors.js';
+
+/**
+ * YAML 글 → 값(빈 글은 {}). 문법 오류는 FolioError YAML_INVALID(어느 파일, 줄·칸, 라이브러리 오류 코드)로 바꾼다 —
+ * 도구가 INTERNAL_ERROR 로 원문을 싣지 않아도 작가가 어디가 틀렸는지 안다. 글 조각은 되풀이하지 않는다.
+ * @param {string} text
+ * @param {{ source?: string }} [options] source: 작품 폴더 기준 파일 이름(알 때만)
+ */
+export function parseYaml(text, { source } = {}) {
+  try {
+    return YAML.parse(text) ?? {};
+  } catch (error) {
+    if (!(error instanceof YAML.YAMLError)) throw error;
+    const at = error.linePos?.[0];
+    throw new FolioError('YAML_INVALID', `${source ?? 'YAML'} is not valid YAML (${error.code}) at line ${at?.line ?? '?'}, column ${at?.col ?? '?'}`, {
+      source: source ?? null, line: at?.line ?? null, column: at?.col ?? null, yamlCode: error.code,
+    });
+  }
+}

-export const parseYaml = (text) => YAML.parse(text) ?? {};
 export const stringifyYaml = (value) => YAML.stringify(value, { lineWidth: 0 });
````

`core/work/config.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/work/config.js b/core/work/config.js
index 0aa1b2d..752a8d1 100644
--- a/core/work/config.js
+++ b/core/work/config.js
@@ -134,7 +134,7 @@ export function validateWorkConfig(raw) {
 export async function loadWorkConfig(root) {
   const text = await readTextOrNull(join(root, 'work.yaml'));
   if (text === null) throw new FolioError('WORK_NOT_FOUND', `no work.yaml in ${root}`);
-  const { config, errors, warnings } = validateWorkConfig(parseYaml(text));
+  const { config, errors, warnings } = validateWorkConfig(parseYaml(text, { source: 'work.yaml' }));
   if (errors.length) throw new FolioError('CONFIG_INVALID', errors.map((e) => e.code).join(', '), { errors });
   return { config, warnings };
 }
````

`core/store/assets.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/store/assets.js b/core/store/assets.js
index ce9cbe2..cb77df9 100644
--- a/core/store/assets.js
+++ b/core/store/assets.js
@@ -19,7 +19,7 @@ export async function readAssets(root) {
     if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
     const path = `${ASSETS_DIR}/${entry.name}`;
     const text = await readFile(join(root, path), 'utf8');
-    const meta = parseYaml(text);
+    const meta = parseYaml(text, { source: path });
     if (typeof meta.id !== 'string') { errors.push({ code: 'ASSET_META_INVALID', path }); continue; }
     let fileHash = null;
     if (typeof meta.file === 'string') {
````

`core/store/sources.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/store/sources.js b/core/store/sources.js
index 5667ba2..6cc08a3 100644
--- a/core/store/sources.js
+++ b/core/store/sources.js
@@ -77,7 +77,7 @@ export async function readSources(root) {
     if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
     const path = `${SOURCES_DIR}/${entry.name}`;
     const text = await readFile(join(root, path), 'utf8');
-    const meta = parseYaml(text);
+    const meta = parseYaml(text, { source: path });
     // file 은 sources/ 바로 아래 이름이어야 한다 — 설명서 한 줄로 작품 밖 파일을 읽어 오지 못하게 한다(N2 결정 3).
     if (!meta || typeof meta !== 'object' || typeof meta.id !== 'string' || !isSourceFileName(meta.file)) { errors.push({ code: 'SOURCE_META_INVALID', path }); continue; }
     let original;
````

`core/store/frontmatter.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/store/frontmatter.js b/core/store/frontmatter.js
index daa54a9..560f75a 100644
--- a/core/store/frontmatter.js
+++ b/core/store/frontmatter.js
@@ -8,16 +8,19 @@ const CLOSE = /\r?\n---\r?\n/;
  * `---\n<yaml>---\n<body>` 를 나눈다. frontmatter가 없으면 전체가 본문이다.
  * 여는/닫는 울타리 줄과 YAML 안의 CRLF(Windows 체크아웃)도 받는다.
  * 본문은 저장된 바이트 그대로 돌려준다(줄바꿈을 고치지 않아야 drift hash가 정직하다).
+ * source(작품 폴더 기준 파일 이름)를 주면 오류(FRONTMATTER_UNCLOSED, YAML_INVALID)가 어느 파일인지 알린다.
+ * @param {string} text
+ * @param {{ source?: string }} [options]
  */
-export function parseDoc(text) {
+export function parseDoc(text, { source } = {}) {
   const open = OPEN.exec(text);
   if (!open) return { data: {}, body: text };
   const rest = text.slice(open[0].length - 1);
   const close = CLOSE.exec(rest);
-  if (!close) throw new FolioError('FRONTMATTER_UNCLOSED', 'frontmatter closing fence is missing');
+  if (!close) throw new FolioError('FRONTMATTER_UNCLOSED', `${source ?? 'a file'}: frontmatter closing fence is missing`, { source: source ?? null });
   const inner = rest.slice(1, close.index).replace(/\r\n/g, '\n');
   const yaml = inner === '' ? '' : `${inner}\n`;
-  return { data: parseYaml(yaml), body: rest.slice(close.index + close[0].length) };
+  return { data: parseYaml(yaml, { source }), body: rest.slice(close.index + close[0].length) };
 }

 /** 쓰기는 항상 LF 다. */
````

`core/store/tree.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/store/tree.js b/core/store/tree.js
index 5437e21..8d25519 100644
--- a/core/store/tree.js
+++ b/core/store/tree.js
@@ -32,7 +32,7 @@ function readLinks(raw, path, errors) {
 const stringList = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);

 function toNode(text, path, kind, parentId, errors) {
-  const { data, body } = parseDoc(text);
+  const { data, body } = parseDoc(text, { source: `${TREE_DIR}/${path}` });
   if (typeof data.id !== 'string' || !ID.test(data.id)) { errors.push({ code: 'NODE_ID_INVALID', path }); return null; }
   if (typeof data.level !== 'string') { errors.push({ code: 'NODE_LEVEL_MISSING', path, id: data.id }); return null; }
   const role = data.role ?? 'body';
````

`core/store/entities.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/store/entities.js b/core/store/entities.js
index b99879e..8ab23a4 100644
--- a/core/store/entities.js
+++ b/core/store/entities.js
@@ -19,7 +19,7 @@ export async function readEntities(root) {
       if (!file.isFile() || !file.name.endsWith('.md')) continue;
       const path = `${ENTITIES_DIR}/${kindDir.name}/${file.name}`;
       const text = await readFile(join(root, path), 'utf8');
-      const { data, body } = parseDoc(text);
+      const { data, body } = parseDoc(text, { source: path });
       if (typeof data.id !== 'string' || !ID.test(data.id)) { errors.push({ code: 'ENTITY_ID_INVALID', path }); continue; }
       if (data.kind !== kindDir.name) { errors.push({ code: 'ENTITY_KIND_MISMATCH', path, id: data.id }); continue; }
       if (typeof data.name !== 'string' || !data.name) { errors.push({ code: 'ENTITY_NAME_MISSING', path, id: data.id }); continue; }
````

- [ ] **Step 4: 통과 확인**

Run: `node --test test/server/`
Expected: PASS

- [ ] **Step 5: 전체 확인**

Run: `npm run check`
Expected: lint·typecheck 통과, 테스트 944/944

- [ ] **Step 6: 커밋**

```bash
git add core/store/assets.js core/store/entities.js core/store/frontmatter.js core/store/sources.js core/store/tree.js core/util/yaml.js core/work/config.js server/toolbox.js test/server/tool-errors.test.js test/server/tools.test.js
git commit -m "$(cat <<'EOF'
fix(server): keep raw internal errors and outside paths out of tool results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part B — 검사와 팩

### Task B1: 작품별 검사 설정 `checks.<id>.config`, `withCheckConfig`를 코어로

> 리뷰: **가장 강한 모델**(잠금·검사 등급). 공격해 볼 것:
> - hard 검사(`core.*`, 팩 hard)에 `config`를 적어 약하게 만들 수 있는가(`mode: on` + `config`, `severity` 없이 `config`만, null config).
> - locked 검사에 `config`·`words`·`locked: false`를 적으면 `LOCKED_CHECK_OVERRIDE`인가.
> - `includeAllHardChecks: true` 작품에서 새 길로 hard를 끌 수 있는가.
> - `config: { __proto__: ... }`, `constructor`, `!!omap`, `!!timestamp`, 깊이 9, `NaN`/`Infinity`, 긴 키 — 조용히 받거나 프로토타입을 바꾸는가.
> - 작품 설정이 다른 작품·다른 실행에 새는가(검사기가 설정을 고치면? 얼린 복사본).
> - `checkConfig: false`에서 config가 조용히 무시되는가(거부여야 한다).
> - config를 바꿨는데 검사 digest가 같은가(재검사 누락).
> - 모델 검사·팩 config가 없는 검사에 config를 주면 `CHECK_CONFIG_UNSUPPORTED`인가. 사용자 검사 줄의 `config`는 어떻게 되는가.

**Files:**
- Create: `core/pack/check-config.js`, `core/checks/known-check-spec.js`, `test/run/work-check-config.test.js`
- Modify: `core/checks/check-set.js`, `core/work/features.js`, `packs/novel/index.js`, `packs/brand/index.js`, `packs/brand/checkers/banned-phrases.js`, `server/tools/config.js`, `packs/novel/README.md`, `packs/brand/README.md`, `skill/folio/references/novel.md`, `skill/folio/references/brand.md`, `skill/folio/references/checks.md`
- Test: `test/core/features.test.js`, `test/server/feature-toggles.test.js`

**Interfaces:**
- `core/pack/check-config.js`: `withCheckConfig(pack)`(소설 팩에서 옮김, 동작 같음), `takesWorkConfig(check) → boolean`, `mergeCheckConfig(base, patch)`, `bindCheckConfig(check, workConfig)`.
- `core/checks/known-check-spec.js`: `KNOWN_CHECK_FIELDS = ['mode', 'severity', 'config']`, `readKnownCheckSpec({ id, spec, existing, features }) → { spec | null, errors }`.
- 새 오류 코드(`CONFIG_INVALID`의 `details.errors`): `CHECK_SPEC_INVALID`, `CHECK_FIELD_UNKNOWN`, `CHECK_MODE_INVALID`, `CHECK_CONFIG_DISABLED`, `CHECK_CONFIG_UNSUPPORTED`, `CHECK_CONFIG_INVALID`, `CHECK_CONFIG_KEY_UNKNOWN`, `HARD_CHECK_CONFIG_LOCKED`.
- `features.checkConfig`(기본 true, 끝에 추가, `RUN_FEATURES` 밖).
- `folio_config` 검사 보기에 `config`(팩 검사의 실제 설정, 없으면 null).
- 소설 팩 `import { withCheckConfig } from './index.js'`는 그대로 된다(다시 내보냄).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/run/work-check-config.test.js` (99줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveChecks } from '../../core/checks/check-set.js';
import { checkDigest } from '../../core/checks/applied.js';
import { runDeterministicChecks } from '../../core/checks/run-checks.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { describeConfig } from '../../server/tools/config.js';
import { copyFixture } from '../support/fixtures.js';

const packs = await loadBuiltinPacks();
const LEVELS = [{ name: 'arc' }, { name: 'episode', leaf: true }];

/** 팩과 work.yaml checks(·features)로 검사를 푼다. 설정 형식 오류가 없어야 한다. */
function resolve(checks, { names = ['novel'], features } = {}) {
  const { config, errors } = validateWorkConfig({ levels: LEVELS, packs: names, checkSets: [], checks, ...(features ? { features } : {}) });
  assert.deepEqual(errors, []);
  return resolveChecks({ registry: resolvePacks(names, packs), config });
}
const byId = (resolved, id) => resolved.checks.find((c) => c.id === id);
const codes = (resolved) => resolved.errors.map((e) => e.code);
const run = (check, draft) => runDeterministicChecks([check], { nodeId: 'ep-001', ordered: true, draft, draftEvents: [], priorEvents: [] })[0];

test('C0: checks.<pack check>.config reaches the checker over the pack config, and turns the check on', () => {
  const plain = resolve({});
  assert.equal(byId(plain, 'novel.length'), undefined, 'not in any chosen set');
  const tuned = resolve({ 'novel.length': { config: { target: 50 } } });
  assert.deepEqual(codes(tuned), []);
  const check = byId(tuned, 'novel.length');
  assert.deepEqual(check.config, { target: 50, unit: 'graphemes' });
  assert.deepEqual(run(check, '짧은 원고.').findings.map((f) => [f.code, f.severity]), [['LENGTH_SHORT', 'advisory']]);
  assert.deepEqual(run(check, '가'.repeat(60)).findings, []);
  const pack = packs.get('novel').checks.find((c) => c.id === 'novel.length');
  assert.deepEqual(pack.config, { target: null, unit: 'graphemes' }, 'the pack check is not changed');
  assert.notEqual(checkDigest(check), checkDigest(pack), 'the config is part of the check digest');
});

test('C0: nested config maps merge key by key; lists are replaced; severity and config go together', () => {
  const dormant = byId(resolve({ 'novel.promise-dormant': { config: { spans: { next: 3 } } } }), 'novel.promise-dormant');
  assert.deepEqual(dormant.config.spans, { next: 3, soon: 5, arc: 10, long: 16, finale: 24 });
  assert.deepEqual(dormant.config.defaults, { core: 8, other: 10, parked: 10 });
  const both = byId(resolve({ 'novel.length': { severity: 'block', config: { target: 50, unit: 'chars' } } }), 'novel.length');
  assert.equal(both.severityOverride, 'block');
  assert.deepEqual(run(both, '짧다').findings.map((f) => [f.code, f.severity]), [['LENGTH_SHORT', 'block']]);
  const brand = resolve({ 'brand.banned-phrases': { config: { words: ['경쟁사A'] } } }, { names: ['knowledge', 'brand'] });
  assert.deepEqual(codes(brand), []);
  const banned = byId(brand, 'brand.banned-phrases');
  assert.deepEqual(banned.config.words, ['경쟁사A']);
  assert.ok(banned.config.allow.includes('최고경영자'), 'keys the work did not give keep the pack value');
  assert.deepEqual(run(banned, '업계 최고라는 경쟁사A 보다 낫다.').findings.map((f) => f.quote), ['경쟁사A']);
});

test('C0: fields a pack check does not take are refused with a code, never silently ignored', () => {
  const brand = (spec) => codes(resolve({ 'brand.banned-phrases': spec }, { names: ['knowledge', 'brand'] }));
  assert.deepEqual(brand({ words: ['경쟁사A'] }), ['CHECK_FIELD_UNKNOWN']);
  assert.deepEqual(brand({ locked: false }), ['CHECK_FIELD_UNKNOWN']);
  assert.deepEqual(brand({ mode: 'maybe' }), ['CHECK_MODE_INVALID']);
  assert.deepEqual(brand({ config: { nope: 1 } }), ['CHECK_CONFIG_KEY_UNKNOWN']);
  assert.deepEqual(brand({ config: ['x'] }), ['CHECK_CONFIG_INVALID']);
  assert.deepEqual(brand({ config: { words: [new Date(0)] } }), ['CHECK_CONFIG_INVALID']);
  assert.deepEqual(brand(false), ['CHECK_SPEC_INVALID']);
  assert.deepEqual(brand(null), [], 'an empty entry still just turns the check on');
  assert.deepEqual(brand({ mode: 'on' }), []);
  const flow = resolve({ 'novel.promise-flow': { config: { minQuote: 2 } } });
  assert.deepEqual(codes(flow), ['CHECK_CONFIG_UNSUPPORTED'], 'a check without pack config takes none');
  assert.deepEqual(codes(resolve({ 'novel.critic': { config: {} } })), ['CHECK_CONFIG_UNSUPPORTED'], 'model checks take none');
});

test('C0: locked and hard checks never get weaker through config; the checkConfig feature turns work config off', () => {
  assert.deepEqual(codes(resolve({ 'core.promise-order': { config: {} } })), ['LOCKED_CHECK_OVERRIDE']);
  assert.deepEqual(codes(resolve({ 'novel.dead-on-stage': { config: {} } })), ['HARD_CHECK_CONFIG_LOCKED']);
  assert.deepEqual(codes(resolve({ 'novel.dead-on-stage': { mode: 'off', config: {} } })), ['HARD_CHECK_CONFIG_LOCKED']);
  assert.deepEqual(codes(resolve({ 'novel.dead-on-stage': { words: [] } })), ['CHECK_FIELD_UNKNOWN']);
  const off = resolve({ 'novel.length': { config: { target: 50 } } }, { features: { checkConfig: false } });
  assert.deepEqual(codes(off), ['CHECK_CONFIG_DISABLED']);
  assert.deepEqual(codes(resolve({ 'novel.length': { severity: 'block' } }, { features: { checkConfig: false } })), [], 'without config the line still works');
  const promiseOrder = byId(resolve({}), 'core.promise-order');
  assert.equal(promiseOrder.locked, true);
});

test('C0: a work.yaml config changes the checks digest, opens through openWorkspace, and folio_config shows the effective config', async () => {
  const root = await copyFixture('serial-2level');
  const path = join(root, 'work.yaml');
  const before = await openWorkspace(root, { packs });
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, checks: { 'novel.length': { config: { target: 1200 } } } }));
  const after = await openWorkspace(root, { packs });
  assert.notEqual(after.checksDigest.byLevel.episode, before.checksDigest.byLevel.episode);
  const shown = (await describeConfig(root, { packs })).checks;
  assert.deepEqual(shown.find((c) => c.id === 'novel.length').config, { target: 1200, unit: 'graphemes' });
  assert.equal(shown.find((c) => c.id === 'core.promise-order').config, null);
  await writeFile(path, stringifyYaml({ ...config, checks: { 'novel.length': { config: { goal: 1200 } } } }));
  await assert.rejects(openWorkspace(root, { packs }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors[0].code === 'CHECK_CONFIG_KEY_UNKNOWN');
});
````

`test/core/features.test.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/test/core/features.test.js b/test/core/features.test.js
index d14942f..beac93f 100644
--- a/test/core/features.test.js
+++ b/test/core/features.test.js
@@ -16,7 +16,7 @@ test('features default to the documented values and every key is always present'
   assert.deepEqual(errors, []);
   assert.deepEqual(config.features, {
     occurrences: true, occurrencesInExtract: true, occurrenceScope: false, rename: true, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
-    viewer: true, viewerToggles: true,
+    viewer: true, viewerToggles: true, checkConfig: true,
   });
   assert.deepEqual(config.features, FEATURES);
   assert.ok(Object.isFrozen(FEATURES));
@@ -33,7 +33,7 @@ test('features accept known booleans and reject unknown keys, non-booleans and e
   assert.deepEqual(codes({ occurrences: false }), []);
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false } }).config.features,
     { occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
-      viewer: true, viewerToggles: true });
+      viewer: true, viewerToggles: true, checkConfig: true });
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false, rename: true } }).errors,
     [{ code: 'FEATURE_REQUIRES', feature: 'rename', requires: 'occurrences' }]);
   const detail = validateWorkConfig({ ...base, features: { occurrences: false, occurrencesInExtract: false, rename: false } }).errors;
@@ -91,6 +91,14 @@ test('M6 features: viewerToggles follows viewer, and neither changes what a run
   for (const key of ['viewer', 'viewerToggles']) assert.equal(d({ [key]: false }), d({}), key);
 });

+test('C0 feature: checkConfig is on by default, has no parent, and does not change the run digest (the config itself is in the checks digest)', () => {
+  assert.equal(FEATURES.checkConfig, true);
+  assert.equal(Object.keys(FEATURES).at(-1), 'checkConfig');
+  assert.deepEqual(validateWorkConfig({ ...base, features: { checkConfig: false } }).errors, []);
+  const d = (f) => featuresDigest({ ...FEATURES, ...f });
+  assert.equal(d({ checkConfig: false }), d({}));
+});
+
 /** 가짜 팩에 프리셋 하나를 더한 것(initWork 는 프리셋이 필요하다). */
 function fakePresetPacks() {
   const packs = fakePacks();
````

`test/server/feature-toggles.test.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/test/server/feature-toggles.test.js b/test/server/feature-toggles.test.js
index 720f819..51ad549 100644
--- a/test/server/feature-toggles.test.js
+++ b/test/server/feature-toggles.test.js
@@ -28,7 +28,7 @@ test('F-2: features { occurrences: false } alone gives a working work; the child
   const values = ok(await tools.call('folio_config', { root })).features.values;
   assert.deepEqual(values, {
     occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true,
-    promiseScope: true, viewer: true, viewerToggles: true,
+    promiseScope: true, viewer: true, viewerToggles: true, checkConfig: true,
   });
   const renamed = await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' });
   assert.equal(code(renamed), 'FEATURE_DISABLED');
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/run/work-check-config.test.js test/core/features.test.js test/server/feature-toggles.test.js`
Expected: FAIL — `core/pack/check-config.js`가 없고, features 목록에 `checkConfig`가 없다

- [ ] **Step 3: 구현**

`core/pack/check-config.js` (65줄):

````js
import { isPlainObject } from '../util/plain.js';

/** 설정값을 얼려 복사한다(검사기가 고쳐도 다른 실행에 새지 않는다). */
const frozenCopy = (value) => {
  const copy = structuredClone(value);
  const freeze = (item) => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } };
  freeze(copy);
  return copy;
};

/** 설정을 받는 검사기의 원래 함수(run(ctx, config)). 감싼 run → 원래 함수. 작품 설정으로 다시 묶을 때 쓴다. */
const RAW_RUN = new WeakMap();

/** 원래 검사기에 얼린 설정을 둘째 인자로 묶은 run. 코어는 run(ctx)만 부른다. */
function bound(raw, config) {
  const frozen = frozenCopy(config);
  const run = (ctx) => raw(ctx, frozen);
  RAW_RUN.set(run, raw);
  return run;
}

/**
 * 팩의 checks.<id>.config 를 결정론 검사기의 둘째 인자로 넘긴다(모든 팩이 같이 쓴다 — N5 인계 H2).
 * config 가 없거나 run 이 함수가 아닌 검사는 그대로 둔다. config 는 checksDigest(CHECK_DIGEST_FIELDS)에 든다.
 * @template {{ checks: any[] }} P
 * @param {P} pack
 * @returns {P}
 */
export function withCheckConfig(pack) {
  const checks = pack.checks.map((check) => {
    if (typeof check.run !== 'function' || check.config === undefined) return check;
    return { ...check, run: bound(check.run, check.config) };
  });
  return { ...pack, checks };
}

/** 이 검사가 작품 설정(work.yaml checks.<id>.config)을 받을 수 있는가: withCheckConfig 로 묶였고 팩 config 가 지도다. */
export const takesWorkConfig = (check) => typeof check?.run === 'function' && RAW_RUN.has(check.run) && isPlainObject(check.config);

/**
 * 팩 설정 위에 작품 설정을 겹친다. 둘 다 지도인 자리는 안으로 들어가 겹치고, 나머지(배열 포함)는 작품 값으로 바꾼다.
 * 키는 자기 속성으로만 쓴다(`__proto__` 같은 키가 프로토타입을 바꾸지 못한다).
 * @param {Record<string, any>} base
 * @param {Record<string, any>} patch
 * @returns {Record<string, any>}
 */
export function mergeCheckConfig(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const next = isPlainObject(base?.[key]) && isPlainObject(value) && Object.hasOwn(base, key) ? mergeCheckConfig(base[key], value) : value;
    Object.defineProperty(out, key, { value: next, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/**
 * 팩 검사를 작품 설정으로 다시 묶는다: config = 팩 config + 작품 config(겹침), run 은 원래 검사기에 새 설정을 넘긴다.
 * takesWorkConfig(check) 가 참인 검사만 받는다. 새 config 가 검사 digest 에 들어가 바뀌면 재검사된다.
 * @param {any} check
 * @param {Record<string, any>} workConfig
 */
export function bindCheckConfig(check, workConfig) {
  const config = mergeCheckConfig(check.config, workConfig);
  return { ...check, config, run: bound(RAW_RUN.get(check.run), config) };
}
````

`core/checks/known-check-spec.js` (50줄):

````js
import { isPlainObject } from '../util/plain.js';
import { takesWorkConfig } from '../pack/check-config.js';

/** work.yaml checks.<알려진 팩·코어 검사 id> 에 적을 수 있는 필드. 그 밖(words, locked, title 등)은 CHECK_FIELD_UNKNOWN. */
export const KNOWN_CHECK_FIELDS = Object.freeze(['mode', 'severity', 'config']);
const MODES = ['on', 'off'];
const MAX_DEPTH = 8;

/** JSON 으로 옮길 수 있는 값인가(문자열·유한수·불리언·null·배열·평범한 지도). YAML 태그가 만든 Date·Map 등은 아니다. */
function jsonLike(value, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => jsonLike(item, depth + 1));
  return isPlainObject(value) && Object.values(value).every((item) => jsonLike(item, depth + 1));
}

/**
 * checks.<id>.config 가 받을 수 있는 값인지. 오류 목록을 돌려준다(없으면 빈 목록).
 * - features.checkConfig 가 꺼져 있으면 CHECK_CONFIG_DISABLED
 * - 팩이 config 를 선언하지 않았거나 설정을 검사기에 넘기지 않는 검사(모델 검사 등)는 CHECK_CONFIG_UNSUPPORTED
 * - 지도가 아니거나 JSON 값이 아니면 CHECK_CONFIG_INVALID, 팩 config 에 없는 키는 CHECK_CONFIG_KEY_UNKNOWN
 * 값의 뜻(목표가 양의 정수인지 등)은 검사기가 본다(*_CONFIG_INVALID 지적).
 */
function configErrors(id, config, existing, features) {
  if (features?.checkConfig === false) return [{ code: 'CHECK_CONFIG_DISABLED', checkId: id }];
  if (!takesWorkConfig(existing)) return [{ code: 'CHECK_CONFIG_UNSUPPORTED', checkId: id }];
  if (!isPlainObject(config) || !jsonLike(config)) return [{ code: 'CHECK_CONFIG_INVALID', checkId: id }];
  return Object.keys(config).filter((key) => !Object.hasOwn(existing.config, key))
    .map((key) => ({ code: 'CHECK_CONFIG_KEY_UNKNOWN', checkId: id, key: key.slice(0, 100) }));
}

/**
 * work.yaml checks.<id> 한 줄(이미 알려진 팩 검사)의 모양을 본다. 잠금·hard 판단은 부르는 쪽(check-set.js)이 한다.
 * - 값이 없으면(null) 켜기다(예전과 같다). 지도가 아니면 CHECK_SPEC_INVALID.
 * - 필드는 KNOWN_CHECK_FIELDS 만, mode 는 on·off 만(CHECK_MODE_INVALID).
 * - config 는 configErrors 를 지나야 한다.
 * @returns {{ spec: { mode?: string, severity?: string, config?: Record<string, any> } | null, errors: Array<Record<string, unknown>> }}
 */
export function readKnownCheckSpec({ id, spec, existing, features }) {
  if (spec === null || spec === undefined) return { spec: {}, errors: [] };
  if (!isPlainObject(spec)) return { spec: null, errors: [{ code: 'CHECK_SPEC_INVALID', checkId: id }] };
  /** @type {Array<Record<string, unknown>>} */
  const errors = Object.keys(spec).filter((field) => !KNOWN_CHECK_FIELDS.includes(field))
    .map((field) => ({ code: 'CHECK_FIELD_UNKNOWN', checkId: id, field: field.slice(0, 100) }));
  if (spec.mode !== undefined && !MODES.includes(spec.mode)) errors.push({ code: 'CHECK_MODE_INVALID', checkId: id });
  // hard 검사의 config 는 check-set.js 가 HARD_CHECK_CONFIG_LOCKED 로 먼저 막는다 — 여기서는 hard 가 아닐 때만 본다.
  if (spec.config !== undefined && existing.severity !== 'hard') errors.push(...configErrors(id, spec.config, existing, features));
  return errors.length ? { spec: null, errors } : { spec, errors };
}
````

`core/checks/check-set.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/checks/check-set.js b/core/checks/check-set.js
index 3c9c550..e57b242 100644
--- a/core/checks/check-set.js
+++ b/core/checks/check-set.js
@@ -1,6 +1,8 @@
 import { BUILTIN_CHECKS } from './builtin.js';
 import { userCheck, USER_SEVERITIES } from './user-checks.js';
 import { resolveUserCheckSets } from './user-check-sets.js';
+import { readKnownCheckSpec } from './known-check-spec.js';
+import { bindCheckConfig } from '../pack/check-config.js';

 /** 고른 세트 id: work.yaml checkSets, 키가 없으면(null) 팩 기본 세트. */
 export const chosenSetIds = (registry, config) => config.checkSets ?? registry.defaultCheckSets ?? [];
@@ -14,13 +16,21 @@ export function allCheckSets(registry, config) {
   return { sets: { ...registry.checkSets, ...user.sets }, errors: user.errors };
 }

-/** 이미 있는(팩·코어) 검사에 work.yaml checks 한 줄을 적용한다. */
-function applyToKnown({ id, spec, existing, selected, includeAllHard, errors }) {
+/**
+ * 이미 있는(팩·코어) 검사에 work.yaml checks 한 줄을 적용한다.
+ * 잠금 검사는 무엇을 적어도 거부하고, 모양(필드·mode·config)이 틀리면 거부한다(조용히 무시하지 않는다 — C0).
+ * config 는 hard 가 아닌, 설정을 받는 팩 검사만 받는다. hard 검사는 설정으로도 약해지지 않는다(HARD_CHECK_CONFIG_LOCKED).
+ */
+function applyToKnown({ id, spec: raw, existing, selected, includeAllHard, errors, features }) {
   if (existing.locked) { errors.push({ code: 'LOCKED_CHECK_OVERRIDE', checkId: id }); return; }
+  if (existing.severity === 'hard' && raw?.config !== undefined) { errors.push({ code: 'HARD_CHECK_CONFIG_LOCKED', checkId: id }); return; }
+  const read = readKnownCheckSpec({ id, spec: raw, existing, features });
+  if (!read.spec) { errors.push(...read.errors); return; }
+  const spec = read.spec;
   if (existing.severity === 'hard') {
     // hard 검사가 도는 동안 그 지적은 hard 다 — 등급을 조용히 낮출 수 없다. 끄려면 mode: off 로 분명히 끈다.
-    if (spec?.severity !== undefined) { errors.push({ code: 'HARD_CHECK_SEVERITY_LOCKED', checkId: id }); return; }
-    if (spec?.mode === 'off') {
+    if (spec.severity !== undefined) { errors.push({ code: 'HARD_CHECK_SEVERITY_LOCKED', checkId: id }); return; }
+    if (spec.mode === 'off') {
       // includeAllHardChecks 를 켠 작품은 hard 검사를 어떤 길로도 끌 수 없다.
       if (includeAllHard) errors.push({ code: 'HARD_CHECK_OVERRIDE', checkId: id });
       else selected.delete(id);
@@ -29,12 +39,13 @@ function applyToKnown({ id, spec, existing, selected, includeAllHard, errors })
     selected.set(id, existing);
     return;
   }
-  if (spec?.mode === 'off') { selected.delete(id); return; }
-  if (spec?.severity !== undefined && !USER_SEVERITIES.includes(spec.severity)) {
+  if (spec.mode === 'off') { selected.delete(id); return; }
+  if (spec.severity !== undefined && !USER_SEVERITIES.includes(spec.severity)) {
     errors.push({ code: 'USER_CHECK_SEVERITY_INVALID', checkId: id, severity: spec.severity });
     return;
   }
-  selected.set(id, spec?.severity ? { ...existing, severityOverride: spec.severity } : existing);
+  const configured = spec.config !== undefined ? bindCheckConfig(existing, spec.config) : existing;
+  selected.set(id, spec.severity ? { ...configured, severityOverride: spec.severity } : configured);
 }

 /**
@@ -74,7 +85,7 @@ export function resolveChecks({ registry, config }) {
   }
   for (const [id, spec] of Object.entries(config.checks ?? {})) {
     const existing = known.get(id);
-    if (existing) { applyToKnown({ id, spec, existing, selected, includeAllHard, errors }); continue; }
+    if (existing) { applyToKnown({ id, spec, existing, selected, includeAllHard, errors, features: config.features }); continue; }
     if (reservedCheckId(id, registry)) { errors.push({ code: 'USER_CHECK_ID_RESERVED', checkId: id }); continue; }
     if (spec?.mode === 'off') continue;
     // 사용자 세트에 든 사용자 검사는 그 세트 중 하나를 골랐을 때만 돈다.
````

`core/work/features.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/work/features.js b/core/work/features.js
index 8a69cf9..3f7020b 100644
--- a/core/work/features.js
+++ b/core/work/features.js
@@ -11,6 +11,8 @@ import { isPlainObject } from '../util/plain.js';
  * - promiseScope: 약속(promise) 엔티티의 앞 사건을 검사 ctx·요청의 priorEvents 에 늘 싣는다(M5 휴면 판정). 범위(entityIds)·참고 버전(refs)은 넓히지 않는다.
  * - viewer: folio_view 가 이 작품의 로컬 뷰어를 띄운다(M6). 끄면 FEATURE_DISABLED.
  * - viewerToggles: 뷰어에서 단계 켜고 끄기를 work.yaml 에 쓴다(viewer 필요). 끄면 뷰어는 읽기만 한다. 잠금 단계는 이 값과 상관없이 늘 거부한다.
+ * - checkConfig: work.yaml checks.<팩 검사>.config 로 팩 검사 설정(분량 목표 등)을 작품마다 겹친다(C0). 끄면 config 를 적은 줄이 CHECK_CONFIG_DISABLED.
+ *   잠금·hard 검사는 이 값과 상관없이 설정을 받지 않는다. 설정 자체가 검사 digest 에 들어가므로 RUN_FEATURES 에는 넣지 않는다.
  */
 export const FEATURES = Object.freeze({
   occurrences: true,
@@ -24,6 +26,7 @@ export const FEATURES = Object.freeze({
   promiseScope: true,
   viewer: true,
   viewerToggles: true,
+  checkConfig: true,
 });

 /** 켜려면 부모 기능도 켜져 있어야 하는 기능. 부모가 꺼지면 (명시적으로 true 가 아닌 한) 저절로 꺼진다. */
````

`packs/novel/index.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/novel/index.js b/packs/novel/index.js
index 5838c73..5ab9631 100644
--- a/packs/novel/index.js
+++ b/packs/novel/index.js
@@ -1,29 +1,11 @@
 import { loadYamlPack } from '../../core/pack/yaml-pack.js';
+import { withCheckConfig } from '../../core/pack/check-config.js';
 import { NOVEL_CHECKERS } from './checkers/index.js';

 export const NOVEL_PACK_DIR = import.meta.dirname;

-/** 설정값을 얼려 복사한다(검사기가 고쳐도 다른 실행에 새지 않는다). */
-const frozenCopy = (value) => {
-  const copy = structuredClone(value);
-  const freeze = (item) => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } };
-  freeze(copy);
-  return copy;
-};
+/** pack.yaml checks.<id>.config 를 검사기 둘째 인자로 넘기는 로더 도우미. 코어(core/pack/check-config.js)로 옮겼고 예전 경로도 그대로 쓸 수 있다. */
+export { withCheckConfig };

-/**
- * pack.yaml checks.<id>.config 를 결정론 검사기의 둘째 인자로 넘긴다. 코어는 run(ctx)만 부른다.
- * 팩 digest 는 로더가 원래 검사기 소스로 이미 만들었고, config 는 checksDigest(CHECK_DIGEST_FIELDS)에 든다.
- */
-export function withCheckConfig(pack) {
-  const checks = pack.checks.map((check) => {
-    if (typeof check.run !== 'function' || check.config === undefined) return check;
-    const run = check.run;
-    const config = frozenCopy(check.config);
-    return { ...check, run: (ctx) => run(ctx, config) };
-  });
-  return { ...pack, checks };
-}
-
-/** 소설 팩: pack.yaml + 글 + 이름으로 등록한 검사기. */
+/** 소설 팩: pack.yaml + 글 + 이름으로 등록한 검사기. 검사 config 는 작품 work.yaml checks.<id>.config 로 겹칠 수 있다(C0). */
 export const loadNovelPack = async () => withCheckConfig(await loadYamlPack(NOVEL_PACK_DIR, { name: 'novel', checkers: NOVEL_CHECKERS }));
````

`packs/brand/index.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/brand/index.js b/packs/brand/index.js
index d8a3c6b..0d00bb3 100644
--- a/packs/brand/index.js
+++ b/packs/brand/index.js
@@ -1,8 +1,8 @@
 import { loadYamlPack } from '../../core/pack/yaml-pack.js';
-import { withCheckConfig } from '../novel/index.js';
+import { withCheckConfig } from '../../core/pack/check-config.js';
 import { BRAND_CHECKERS } from './checkers/index.js';

 export const BRAND_PACK_DIR = import.meta.dirname;

-/** 브랜드 팩(둘째 팩): pack.yaml + 검사 지시 글 + 이름으로 등록한 검사기. 단계·프리셋은 없다. 검사 config 는 소설 팩과 같은 길로 넘긴다. */
+/** 브랜드 팩(둘째 팩): pack.yaml + 검사 지시 글 + 이름으로 등록한 검사기. 단계·프리셋은 없다. 검사 config 는 소설 팩과 같은 코어 도우미로 넘긴다. */
 export const loadBrandPack = async () => withCheckConfig(await loadYamlPack(BRAND_PACK_DIR, { name: 'brand', checkers: BRAND_CHECKERS }));
````

`packs/brand/checkers/banned-phrases.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/brand/checkers/banned-phrases.js b/packs/brand/checkers/banned-phrases.js
index 15a314e..c61b833 100644
--- a/packs/brand/checkers/banned-phrases.js
+++ b/packs/brand/checkers/banned-phrases.js
@@ -18,7 +18,7 @@ const DIGIT = /[0-9０-９]/;
  * 금지 표현(brand.banned-phrases). 사용자 검사의 words 와 같은 방식이다: 원고(NFC)에 그 표현이 그대로 있으면 표현마다 한 번 알린다.
  * 목록은 pack.yaml config.words(과장·단정 표현 기본 목록), 허용 표현은 config.allow 다. 허용 표현 안에 든 자리는 세지 않는다.
  * 표현의 첫 글자가 숫자(전각 포함)이면, 바로 앞 글자도 숫자일 때는 세지 않는다(예: `11위` 속의 `1위`).
- * 작품마다 다른 금지 표현은 사용자 검사(words·pattern)로 더한다 — 팩 검사의 설정은 작품별로 바꿀 수 없다.
+ * 작품마다 다른 목록은 work.yaml checks.brand.banned-phrases.config(words·allow, 통째로 바꿈)나 사용자 검사(words·pattern)로 준다.
  * 등급은 pack.yaml(advisory)과 작가 설정이 정한다. 지적에 severity 를 적지 않는다.
  * @param {{ draft?: unknown }} ctx
  * @param {{ words?: unknown, allow?: unknown }} [config]
````

`server/tools/config.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/server/tools/config.js b/server/tools/config.js
index 0b1aff7..e38fa5c 100644
--- a/server/tools/config.js
+++ b/server/tools/config.js
@@ -7,9 +7,11 @@ const stepView = (step) => ({
   id: step.id, kind: step.kind, tier: step.tier ?? null, stage: step.kind === 'check' ? (step.stage ?? step.id) : null,
   mode: step.mode ?? 'on', locked: Boolean(step.locked), custom: Boolean(step.custom), reason: step.reason ?? null,
 });
+/** config: 팩 검사의 지금 설정(팩 config 위에 work.yaml checks.<id>.config 를 겹친 값). 사용자 검사는 null(자기 spec 이 곧 설정이다). */
 const checkView = (check) => ({
   id: check.id, title: check.title ?? check.id, tier: check.tier, stage: check.stage, severity: check.severityOverride ?? check.severity,
   origin: check.origin ?? null, locked: Boolean(check.locked), experimental: Boolean(check.experimental),
+  config: check.origin === 'pack' && check.config !== undefined ? check.config : null,
 });

 /**
````

- [ ] **Step 4: 문서**

`skill/folio/references/novel.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/skill/folio/references/novel.md b/skill/folio/references/novel.md
index 26cc984..5f509da 100644
--- a/skill/folio/references/novel.md
+++ b/skill/folio/references/novel.md
@@ -38,10 +38,29 @@
 - 끄면 잠든 약속은 이 노드에 나온 약속만 본다. 심기 전 해소 잠금(`core.promise-order`)은 어느 설정에서도 돈다.
 - 약속이 움직여도 다른 노드가 "다시 확인 필요"가 되지는 않는다(범위와 참고 버전은 넓히지 않는다).

-## 아직 작품별로 못 정하는 검사 설정
+## 작품별 검사 설정 (`checks.<id>.config`)

-- `work.yaml` 의 `checks.<id>` 는 `mode` 와 `severity` 만 받는다. 검사마다 있는 `config`(분량 목표, 청소년 기준, 장르, 운율 단계, 절단 위치 등)는 작품별로 넣을 자리가 아직 없다.
-- 그래서 `novel.length` 는 목표(`target`)를 줄 방법이 없어 계속 조용히 넘어간다. 작품별 목표는 후속 과제다.
+- 팩 검사에 설정(`config`)이 있으면 work.yaml `checks.<id>.config`로 작품마다 바꾼다. 팩 값 위에 겹친다 — 지도는 키마다 겹치고, 목록은 통째로 바꾼다. 적은 검사는 세트에 없어도 켜진다.
+- 바꿀 수 있는 키는 팩 설정에 있는 키뿐이다. 지금 값은 `folio_config`의 `checks[].config`에서 본다. 값이 틀리면(예: 목표가 양의 정수가 아님) 검사가 `*_CONFIG_INVALID` 지적 하나를 낸다.
+- 거부되는 것(`CONFIG_INVALID`): 모르는 필드(`CHECK_FIELD_UNKNOWN`), 팩 설정에 없는 키(`CHECK_CONFIG_KEY_UNKNOWN`), 설정이 없는 검사·모델 검사(`CHECK_CONFIG_UNSUPPORTED`), hard 검사(`HARD_CHECK_CONFIG_LOCKED`), 잠긴 코어 검사(`LOCKED_CHECK_OVERRIDE`), `features.checkConfig: false`인 작품(`CHECK_CONFIG_DISABLED`).
+- 설정은 검사 digest에 든다. 바꾸면 그 검사를 거친 커밋 노드가 `folio_status`의 `recheck`에 뜬다.
+
+| 검사 | 키 | 값 |
+|---|---|---|
+| `novel.length` | `target`, `unit` | 목표 분량(양의 정수, 기본 없음 = 검사 안 함). `graphemes`(기본) · `chars` |
+| `novel.sensitive` | `mode` | `adult`(기본) · `youth`(청소년 기준) |
+| `novel.cliffhanger` | `when` | `always`(기본) · `arc-end`(아크 마지막 화만) |
+| `novel.prosody` | `level` | `loose` · `normal`(기본) · `strict` |
+| `novel.cliche` | `genre` | 없음(기본, 공통 목록) 또는 장르 id(`action`, `comedy`, `historical`, `mystery-thriller` 등) |
+| `novel.dialogue-ratio` | `genre`, `range` | 장르 id 또는 `[최소, 최대]` 비율 |
+| `novel.promise-dormant` | `spans`, `defaults` | 기한별 칸 수(`next` 2 · `soon` 5 · `arc` 10 · `long` 16 · `finale` 24), 기본 칸 수 |
+
+```yaml
+checks:
+  novel.length: { config: { target: 5500 } }
+  novel.sensitive: { config: { mode: youth }, severity: block }
+  novel.promise-dormant: { config: { spans: { next: 3 } } }   # 나머지 기한은 팩 값 그대로
+```

 ## `novel.style-drift` 는 `styleAnchor` 노드만 본다

````

`skill/folio/references/brand.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/skill/folio/references/brand.md b/skill/folio/references/brand.md
index 11facad..57fb380 100644
--- a/skill/folio/references/brand.md
+++ b/skill/folio/references/brand.md
@@ -34,8 +34,10 @@
 - 허용 표현 안에 든 자리는 세지 않는다: `최고경영자`, `최고기술책임자`, `최고재무책임자`, `최고운영책임자`, `최대한`.
 - 숫자로 시작하는 표현은 바로 앞 글자가 숫자(전각 포함)이면 세지 않는다 — `11위`는 `1위`로, `1100%`는 `100%`로 세지 않는다.
 - 표현마다 한 번, 몇 번 나왔는지(`count`)와 함께 알린다.
-- 작품마다 다른 금지 표현(경쟁사 이름, 쓰지 않는 제품명)은 팩 목록을 고칠 수 없으니 자기 id를 가진 사용자 검사로 더한다. 초안을 `folio_config { root, checkDraft }`로 검증하고 작가 승인 뒤 work.yaml에 넣는다.
-- `checks.brand.banned-phrases`에는 `mode`와 `severity`만 적는다. `words`를 적어도 엔진이 받지 않고 조용히 무시한다 — 팩 목록에 더해지지 않는다.
+- 작품마다 다른 금지 표현(경쟁사 이름, 쓰지 않는 제품명)은 두 가지로 넣는다.
+  - 팩 목록을 바꾼다: `checks: { brand.banned-phrases: { config: { words: [...] } } }`. 목록은 통째로 바뀐다 — 기본 목록도 쓰려면 위 목록을 함께 적는다. 허용 표현은 `config.allow`다. 지금 값은 `folio_config`의 `checks[].config`에서 본다.
+  - 따로 더한다: 자기 id를 가진 사용자 검사(아래 예). 초안을 `folio_config { root, checkDraft }`로 검증하고 작가 승인 뒤 work.yaml에 넣는다.
+- `checks.brand.banned-phrases`에는 `mode`, `severity`, `config`만 적는다. 그 밖의 필드(`words` 등)를 바로 적으면 `CONFIG_INVALID`(`CHECK_FIELD_UNKNOWN`)로 거부된다. 설정 키는 팩 설정에 있는 `words`·`allow`뿐이다(`CHECK_CONFIG_KEY_UNKNOWN`).

 ```yaml
 checks:
````

`skill/folio/references/checks.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/skill/folio/references/checks.md b/skill/folio/references/checks.md
index 40a1f59..937811f 100644
--- a/skill/folio/references/checks.md
+++ b/skill/folio/references/checks.md
@@ -26,12 +26,14 @@ checks:
   no-cliche: { words: [숨이 멎을 듯, 심장이 쿵], severity: advisory, experimental: true }
   voice-samples: { samples: checks/voice-samples/, severity: advisory, experimental: true, requireQuote: true }
   serial.word-count: { mode: off }
+  serial.length: { config: { target: 5500 } }   # 팩 검사 설정을 작품마다 겹친다(키는 folio_config 의 checks[].config)
 options:
   includeAllHardChecks: false
 ```

 - 사용자 검사 id와 세트 id는 둘 다 `core.`이나 팩 접두어(예: `novel.`)로 시작할 수 없다(검사는 `USER_CHECK_ID_RESERVED`, 세트는 `USER_CHECK_SET_ID_RESERVED`).
 - 규칙 파일과 예시 폴더는 `checks/` 안에만 둔다.
+- 팩 검사 줄(`checks.<팩 검사 id>`)에는 `mode`(`on`·`off`), `severity`, `config`만 적는다. 다른 필드나 팩 설정에 없는 키는 `CONFIG_INVALID`로 거부된다(조용히 무시하지 않는다). hard 검사와 잠긴 코어 검사는 `config`를 받지 않는다. 설정 키와 값은 팩별 안내([novel.md](novel.md), [brand.md](brand.md))에 있다. 작가가 원하지 않으면 `features.checkConfig: false`로 작품별 설정을 막는다.

 ## 1. 첫 설정 인터뷰 (짧게)

````

`packs/novel/README.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/novel/README.md b/packs/novel/README.md
index 71974bf..12638e5 100644
--- a/packs/novel/README.md
+++ b/packs/novel/README.md
@@ -6,5 +6,5 @@
 - 세트: `novel.basic`(기본), `novel.serial`(웹소설 연재), `novel.style`(문체 유지). 세트별 검사·엔티티 필드·사건 모양은 `skill/folio/references/novel.md`.
 - 잠금 단계는 코어가 정한다. `pack.yaml`에 `locked`를 적을 수 없다.
 - M5 에서 vibelore 검사기를 옮겼다. 옮긴 검사는 모두 `experimental`, `advisory`이고, 검사기는 지적의 severity 를 낮추기만 한다(코어 stamp 가 선언 등급으로 막는다).
-- `pack.yaml` `checks.<id>.config` 는 로더(`index.js` `withCheckConfig`)가 검사기의 둘째 인자로 넘긴다. 검사기는 기본값 위에 합친다.
+- `pack.yaml` `checks.<id>.config` 는 로더(`index.js` → 코어 `withCheckConfig`)가 검사기의 둘째 인자로 넘긴다. 검사기는 기본값 위에 합친다. 작품은 work.yaml `checks.<id>.config` 로 그 위에 겹친다(`skill/folio/references/novel.md`).
 - 알려진 한계: 팩 digest 는 검사기 함수 소스만 묶는다. 검사기가 import 하는 도우미(`checkers/text/*`)와 사전(`lexicons/*`)을 바꾸면 digest 가 바뀌지 않는다 — 바꿀 때는 `pack.yaml` `version`을 올린다.
````

`packs/brand/README.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/brand/README.md b/packs/brand/README.md
index 0d0d030..a4490b9 100644
--- a/packs/brand/README.md
+++ b/packs/brand/README.md
@@ -5,6 +5,6 @@
 - 모델 검사(실험, 참고): `brand.tone` — 윗계획·brief의 어조 지침과 어긋나는 문장(원고 인용 필수).
 - 결정론 검사(실험, 참고): `brand.banned-phrases` — 과장·단정 표현 기본 목록(`pack.yaml` `config.words`, 허용 표현 `config.allow`). `brand.figure-units` — 주장의 숫자가 자료 인용에는 다른 단위로만 있음(`config.units`).
 - 세트: `brand.voice`(어조 + 금지 표현), `brand.figures`(`sources.claim-supported`, `sources.numbers-match`, `brand.figure-units`). `brand.figures`는 `sources` 팩이 있어야 한다. 기본 세트는 없다 — `recommendedFor` kinds `company`·`brochure`로 추천만 한다.
-- 검사 `config`는 소설 팩과 같은 `withCheckConfig`로 검사기 둘째 인자에 넘긴다. 작품별로는 바꿀 수 없다 — 작품마다 다른 금지 표현은 사용자 검사(`words`·`pattern`)로 더한다.
+- 검사 `config`는 코어 `withCheckConfig`(`core/pack/check-config.js`)로 검사기 둘째 인자에 넘긴다. 작품마다 work.yaml `checks.<id>.config`로 겹칠 수 있다(예: `brand.banned-phrases`의 `words`). 따로 더할 금지 표현은 사용자 검사(`words`·`pattern`)로도 된다.
 - 숫자 읽기는 `packs/sources/checkers/claims.js`(`numberMatches`)를 그대로 쓴다. 팩 digest는 brand 검사기 소스만 보고 가져다 쓰는 `packs/sources/checkers/claims.js`는 보지 않는다 — claims.js를 고치면 `sources` 팩 `version`과 `brand` 팩 `version`을 함께 올린다.
 - 잠금 단계와 `core.promise-order`는 코어가 정한다. 세트를 꺼도 코어 잠금은 그대로다.
````

- [ ] **Step 5: 통과·전체 확인**

Run: `node --test test/run/work-check-config.test.js && npm run check`
Expected: PASS, 테스트 950/950

- [ ] **Step 6: 커밋**

```bash
git add core/checks/check-set.js core/checks/known-check-spec.js core/pack/check-config.js core/work/features.js packs/brand/README.md packs/brand/checkers/banned-phrases.js packs/brand/index.js packs/novel/README.md packs/novel/index.js server/tools/config.js skill/folio/references/brand.md skill/folio/references/checks.md skill/folio/references/novel.md test/core/features.test.js test/run/work-check-config.test.js test/server/feature-toggles.test.js
git commit -m "$(cat <<'EOF'
feat(checks): per-work config for non-locked pack checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task B2: 팩 digest가 가져온 도우미·사전 파일을 본다

> 리뷰: **가장 강한 모델**(팩 digest = 파이프라인 잠금·영수증). 공격해 볼 것:
> - 도우미·사전 한 글자를 바꿔도 digest가 같은 길이 있는가(동적 import, `import()` 문자열, 재내보내기 `export * from`, 주석 속 import, 템플릿 문자열).
> - 모듈 그래프가 팩·저장소 밖(`../../../`) 파일을 읽는가, 링크를 따라가는가, 순환 import에서 멈추는가.
> - 경로 구분자·정렬이 OS마다 달라 digest가 달라지는가(win32).
> - 없는 import가 조용히 빠져 digest가 약해지는가(가드 테스트가 checkers·lexicons의 모든 .js를 요구한다).
> - `modules`를 안 주는 외부 팩의 digest가 바뀌는가(바뀌면 안 된다).

**Files:**
- Create: `core/pack/module-graph.js`, `test/pack/pack-module-digest.test.js`
- Modify: `core/pack/yaml-pack.js`, `packs/novel/index.js`, `packs/brand/index.js`, `packs/knowledge/index.js`, `packs/sources/index.js`, `packs/novel/README.md`, `packs/brand/README.md`, `packs/sources/README.md`

**Interfaces:**
- `moduleGraph(dir, entries) → Promise<Array<[posixRelPath, sha256]>>`(정렬). 없는 입구는 `PACK_FILE_MISSING`, 500파일 넘으면 `PACK_INVALID`. 없는 import는 건너뛴다.
- `loadYamlPack(dir, { name, checkers, modules = [] })`. `modules`가 비어 있지 않을 때만 선언 digest에 든다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/pack/pack-module-digest.test.js` (88줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { moduleGraph } from '../../core/pack/module-graph.js';
import { stringifyYaml } from '../../core/util/yaml.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { tempDir } from '../support/fixtures.js';
import { NOVEL_CHECKERS } from '../../packs/novel/checkers/index.js';
import { KNOWLEDGE_CHECKERS } from '../../packs/knowledge/checkers/index.js';
import { SOURCES_CHECKERS } from '../../packs/sources/checkers/index.js';
import { BRAND_CHECKERS } from '../../packs/brand/checkers/index.js';

const PACKS_DIR = join(import.meta.dirname, '..', '..', 'packs');

async function jsFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await jsFiles(path));
    else if (entry.name.endsWith('.js')) out.push(path);
  }
  return out;
}

test('C0 guard: every .js file under a built-in pack checkers/ and lexicons/ is in its module graph, so the pack digest sees it', async () => {
  for (const name of ['novel', 'knowledge', 'sources', 'brand']) {
    const dir = join(PACKS_DIR, name);
    const graph = new Map(await moduleGraph(dir, ['checkers/index.js']));
    const files = [...await jsFiles(join(dir, 'checkers')), ...await jsFiles(join(dir, 'lexicons'))].map((f) => relative(dir, f).split(sep).join('/'));
    assert.ok(files.length > 0, name);
    for (const file of files) assert.ok(graph.has(file), `${name}: ${file} is not reached from checkers/index.js`);
  }
  assert.ok(new Map(await moduleGraph(join(PACKS_DIR, 'brand'), ['checkers/index.js'])).has('../sources/checkers/claims.js'), 'another pack helper counts');
  assert.ok(new Map(await moduleGraph(join(PACKS_DIR, 'novel'), ['checkers/index.js'])).has('../../core/promise.js'), 'a core helper counts');
});

const SPEC = {
  name: 'demo', checks: { 'demo.nobody': { tier: 'deterministic', stage: 'facts', severity: 'advisory', experimental: true, run: 'nobody' } },
  checkSets: { 'demo.basic': { title: '기본', checks: ['demo.nobody'] } },
  pipelines: {
    leaf: [
      { id: 'draft', kind: 'generate', produces: 'draft' }, { id: 'extract', kind: 'generate', produces: 'events', requires: ['draft'] },
      { id: 'facts', kind: 'check', tier: 'deterministic', stage: 'facts', requires: ['extract'] }, { id: 'commit', kind: 'commit' },
    ],
    branch: [{ id: 'plan', kind: 'generate', produces: 'plan' }, { id: 'children', kind: 'generate', produces: 'children' }, { id: 'commit', kind: 'commit' }],
  },
};
const CHECKERS = { nobody: () => [] };

async function writePack(files) {
  const dir = await tempDir('folio-graph-');
  await writeFile(join(dir, 'pack.yaml'), stringifyYaml(SPEC));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}
const MODULES = {
  'checkers/index.js': "import { nobody } from './nobody.js';\nexport { lexicon } from '../lexicons/words.js';\nexport const CHECKERS = { nobody };\n",
  'checkers/nobody.js': "import './text/helper.js';\nimport { readFile } from 'node:fs/promises';\nexport const nobody = () => [];\n",
  'checkers/text/helper.js': 'export const helper = 1;\n',
  'lexicons/words.js': "export const lexicon = ['가'];\n// import './missing.js' 같은 주석 속 경로는 없는 파일이라 건너뛴다\n",
};

test('C0: the pack digest changes when an imported helper or lexicon changes, even though the checker function text does not', async () => {
  const load = (dir) => loadYamlPack(dir, { checkers: CHECKERS, modules: ['checkers/index.js'] });
  const base = await load(await writePack(MODULES));
  assert.equal((await load(await writePack(MODULES))).digest, base.digest, 'same files, same digest on another folder');
  assert.notEqual((await load(await writePack({ ...MODULES, 'checkers/text/helper.js': 'export const helper = 2;\n' }))).digest, base.digest);
  assert.notEqual((await load(await writePack({ ...MODULES, 'lexicons/words.js': "export const lexicon = ['나'];\n" }))).digest, base.digest);
  const graph = await moduleGraph(await writePack(MODULES), ['checkers/index.js']);
  assert.deepEqual(graph.map(([path]) => path), ['checkers/index.js', 'checkers/nobody.js', 'checkers/text/helper.js', 'lexicons/words.js']);
  const without = await loadYamlPack(await writePack(MODULES), { checkers: CHECKERS });
  assert.notEqual(without.digest, base.digest, 'packs that name no modules keep the old digest recipe');
  await assert.rejects(loadYamlPack(await writePack({}), { checkers: CHECKERS, modules: ['checkers/index.js'] }), { code: 'PACK_FILE_MISSING' });
});

test('C0: every built-in pack loads with its module graph in the declared digest', async () => {
  const packs = await loadBuiltinPacks();
  const loaders = { novel: NOVEL_CHECKERS, knowledge: KNOWLEDGE_CHECKERS, sources: SOURCES_CHECKERS, brand: BRAND_CHECKERS };
  for (const [name, checkers] of Object.entries(loaders)) {
    const withoutGraph = await loadYamlPack(join(PACKS_DIR, name), { name, checkers });
    assert.notEqual(packs.get(name).digest, withoutGraph.digest, name);
  }
});
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/pack/pack-module-digest.test.js`
Expected: FAIL — `core/pack/module-graph.js`가 없다

- [ ] **Step 3: 구현**

`core/pack/module-graph.js` (40줄):

````js
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';

/** 정적 `import … from '…'`, `export … from '…'`, `import '…'` 의 상대 경로(./ 또는 ../). node:·패키지 이름은 보지 않는다. */
const SPECIFIER = /(?:\bfrom|\bimport)\s*(['"])(\.{1,2}\/[^'"\n]+)\1/g;
const MAX_FILES = 500;

/** 팩 폴더 기준 POSIX 상대 경로(기계·OS 가 달라도 같은 글자). */
const keyOf = (dir, file) => relative(dir, file).split(sep).join('/');

/**
 * 팩 검사기 모듈이 정적으로 import 하는 파일 전부의 내용 hash(모듈 그래프). 시작 모듈부터 상대 import 를 따라간다 —
 * 같은 팩의 도우미·사전, 다른 팩의 도우미(예: brand → sources/checkers/claims.js), 코어 파일(예: core/promise.js)까지.
 * 팩 digest 가 검사기 함수 글자만 보면 이런 파일을 바꿔도 digest 가 그대로라 열린 실행이 검사를 다시 하지 않는다(N2·M5·N5 인계 H3).
 * 파일을 import 하지 않고 글로만 읽는다(코어는 동적 import 를 쓰지 않는다). 주석 속 경로도 잡힐 수 있지만 없는 파일은 건너뛴다.
 * @param {string} dir 팩 폴더
 * @param {string[]} entries 팩 폴더 기준 시작 모듈(예: ['checkers/index.js']). 없으면 PACK_FILE_MISSING.
 * @returns {Promise<Array<[string, string]>>} [팩 폴더 기준 상대 경로, 내용 sha256], 경로 순
 */
export async function moduleGraph(dir, entries) {
  const hashes = new Map();
  const queue = entries.map((entry) => ({ file: resolve(dir, entry), entry: true }));
  while (queue.length) {
    const { file, entry } = /** @type {{ file: string, entry: boolean }} */ (queue.shift());
    const key = keyOf(dir, file);
    if (hashes.has(key)) continue;
    let text;
    try { text = await readFile(file, 'utf8'); } catch (error) {
      if (/** @type {any} */ (error)?.code !== 'ENOENT') throw error;
      if (entry) throw new FolioError('PACK_FILE_MISSING', `module ${key} is missing`, { path: key });
      continue;
    }
    hashes.set(key, sha256(text));
    if (hashes.size > MAX_FILES) throw new FolioError('PACK_INVALID', `the checker modules import more than ${MAX_FILES} files`, { path: key });
    for (const match of text.matchAll(SPECIFIER)) queue.push({ file: resolve(dirname(file), match[2]), entry: false });
  }
  return [...hashes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
````

`core/pack/yaml-pack.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/pack/yaml-pack.js b/core/pack/yaml-pack.js
index c08792c..95bea5f 100644
--- a/core/pack/yaml-pack.js
+++ b/core/pack/yaml-pack.js
@@ -5,6 +5,7 @@ import { canonicalJson, sha256 } from '../util/hash.js';
 import { parseYaml } from '../util/yaml.js';
 import { readPackSpec } from './yaml-schema.js';
 import { packErrorPath, validatePack } from './validate.js';
+import { moduleGraph } from './module-graph.js';

 export const PACK_FILE = 'pack.yaml';
 const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);
@@ -35,7 +36,7 @@ const hasSource = (fn) => typeof fn === 'function' && !Function.prototype.toStri

 const refuse = (pack, errors) => new FolioError('PACK_INVALID', errors.map((e) => `${e.code}@${e.path ?? ''}`).join(', '), { pack, errors });

-function assemble(spec, texts, checkers, yamlText) {
+function assemble(spec, texts, checkers, yamlText, modules) {
   const used = [...new Set(spec.checks.filter((c) => c.run).map((c) => c.run))].sort();
   const checks = spec.checks.map(({ run, instruction, ...check }) => ({
     ...check, origin: 'pack',
@@ -55,6 +56,7 @@ function assemble(spec, texts, checkers, yamlText) {
     },
     digest: sha256(canonicalJson({
       yaml: yamlText, files: [...texts.entries()].sort(byKey), checkers: used.map((id) => [id, Function.prototype.toString.call(checkers[id])]),
+      ...(modules.length ? { modules } : {}),
     })),
   };
   return pack;
@@ -65,12 +67,13 @@ function assemble(spec, texts, checkers, yamlText) {
  * - pack.yaml: 선언(단계·검사·세트·프리셋·프롬프트 경로). 알 수 없는 키는 거부한다.
  * - *.md: 팩 폴더 안의 글. 모델 검사의 instruction 은 글 내용이 된다(checksDigest 에 든다).
  * - 결정론 검사는 checkers(코드로 등록한 이름 → 함수)에서 이름으로만 찾는다. 소스 없는 함수(바인드·네이티브)는 PACK_CHECKER_UNSUPPORTED.
- * - digest: pack.yaml·읽은 글·쓰는 검사기 소스. 파이프라인 digest 에 들어간다(바뀌면 열린 실행은 검사부터 다시).
+ * - digest: pack.yaml·읽은 글·쓰는 검사기 소스, 그리고 modules(검사기 시작 모듈, 예: ['checkers/index.js'])에서 정적 import 로 닿는
+ *   모든 파일의 내용(module-graph.js — 도우미·사전·다른 팩·코어 파일). 파이프라인 digest 에 들어간다(바뀌면 열린 실행은 검사부터 다시).
  * 마지막으로 코어 팩 규칙(validatePack: 잠금·접두어·중복)을 통과해야 한다.
  * @param {string} dir
- * @param {{ name?: string|null, checkers?: Record<string, (ctx: any) => any[]> }} [options]
+ * @param {{ name?: string|null, checkers?: Record<string, (ctx: any) => any[]>, modules?: string[] }} [options]
  */
-export async function loadYamlPack(dir, { name = null, checkers = {} } = {}) {
+export async function loadYamlPack(dir, { name = null, checkers = {}, modules = [] } = {}) {
   const top = await readInside(dir, PACK_FILE, '.yaml');
   if (top.error) throw refuse(name, [{ code: top.error, path: PACK_FILE }]);
   const yamlText = top.text;
@@ -92,7 +95,7 @@ export async function loadYamlPack(dir, { name = null, checkers = {} } = {}) {
     else if (!hasSource(checkers[check.run])) errors.push({ code: 'PACK_CHECKER_UNSUPPORTED', path });
   }
   if (errors.length) throw refuse(spec.name, errors);
-  const pack = assemble(spec, texts, checkers, yamlText);
+  const pack = assemble(spec, texts, checkers, yamlText, await moduleGraph(dir, modules));
   const core = validatePack(pack);
   if (core.length) throw refuse(spec.name, core.map((e) => ({ path: packErrorPath(e), ...e })));
   return pack;
````

`packs/novel/index.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/novel/index.js b/packs/novel/index.js
index 5ab9631..df4a670 100644
--- a/packs/novel/index.js
+++ b/packs/novel/index.js
@@ -8,4 +8,4 @@ export const NOVEL_PACK_DIR = import.meta.dirname;
 export { withCheckConfig };

 /** 소설 팩: pack.yaml + 글 + 이름으로 등록한 검사기. 검사 config 는 작품 work.yaml checks.<id>.config 로 겹칠 수 있다(C0). */
-export const loadNovelPack = async () => withCheckConfig(await loadYamlPack(NOVEL_PACK_DIR, { name: 'novel', checkers: NOVEL_CHECKERS }));
+export const loadNovelPack = async () => withCheckConfig(await loadYamlPack(NOVEL_PACK_DIR, { name: 'novel', checkers: NOVEL_CHECKERS, modules: ['checkers/index.js'] }));
````

`packs/brand/index.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/brand/index.js b/packs/brand/index.js
index 0d00bb3..ce4973e 100644
--- a/packs/brand/index.js
+++ b/packs/brand/index.js
@@ -5,4 +5,4 @@ import { BRAND_CHECKERS } from './checkers/index.js';
 export const BRAND_PACK_DIR = import.meta.dirname;

 /** 브랜드 팩(둘째 팩): pack.yaml + 검사 지시 글 + 이름으로 등록한 검사기. 단계·프리셋은 없다. 검사 config 는 소설 팩과 같은 코어 도우미로 넘긴다. */
-export const loadBrandPack = async () => withCheckConfig(await loadYamlPack(BRAND_PACK_DIR, { name: 'brand', checkers: BRAND_CHECKERS }));
+export const loadBrandPack = async () => withCheckConfig(await loadYamlPack(BRAND_PACK_DIR, { name: 'brand', checkers: BRAND_CHECKERS, modules: ['checkers/index.js'] }));
````

`packs/knowledge/index.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/knowledge/index.js b/packs/knowledge/index.js
index 335e460..5167812 100644
--- a/packs/knowledge/index.js
+++ b/packs/knowledge/index.js
@@ -4,4 +4,4 @@ import { KNOWLEDGE_CHECKERS } from './checkers/index.js';
 export const KNOWLEDGE_PACK_DIR = import.meta.dirname;

 /** 지식 책 팩: pack.yaml + 글 + 이름으로 등록한 검사기. */
-export const loadKnowledgePack = () => loadYamlPack(KNOWLEDGE_PACK_DIR, { name: 'knowledge', checkers: KNOWLEDGE_CHECKERS });
+export const loadKnowledgePack = () => loadYamlPack(KNOWLEDGE_PACK_DIR, { name: 'knowledge', checkers: KNOWLEDGE_CHECKERS, modules: ['checkers/index.js'] });
````

`packs/sources/index.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/sources/index.js b/packs/sources/index.js
index 467ec22..1beb616 100644
--- a/packs/sources/index.js
+++ b/packs/sources/index.js
@@ -4,4 +4,4 @@ import { SOURCES_CHECKERS } from './checkers/index.js';
 export const SOURCES_PACK_DIR = import.meta.dirname;

 /** 자료 근거 팩(둘째 팩): pack.yaml + 검사 지시 글 + 이름으로 등록한 검사기. 단계는 없다. */
-export const loadSourcesPack = () => loadYamlPack(SOURCES_PACK_DIR, { name: 'sources', checkers: SOURCES_CHECKERS });
+export const loadSourcesPack = () => loadYamlPack(SOURCES_PACK_DIR, { name: 'sources', checkers: SOURCES_CHECKERS, modules: ['checkers/index.js'] });
````

`packs/novel/README.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/novel/README.md b/packs/novel/README.md
index 12638e5..4605071 100644
--- a/packs/novel/README.md
+++ b/packs/novel/README.md
@@ -7,4 +7,4 @@
 - 잠금 단계는 코어가 정한다. `pack.yaml`에 `locked`를 적을 수 없다.
 - M5 에서 vibelore 검사기를 옮겼다. 옮긴 검사는 모두 `experimental`, `advisory`이고, 검사기는 지적의 severity 를 낮추기만 한다(코어 stamp 가 선언 등급으로 막는다).
 - `pack.yaml` `checks.<id>.config` 는 로더(`index.js` → 코어 `withCheckConfig`)가 검사기의 둘째 인자로 넘긴다. 검사기는 기본값 위에 합친다. 작품은 work.yaml `checks.<id>.config` 로 그 위에 겹친다(`skill/folio/references/novel.md`).
-- 알려진 한계: 팩 digest 는 검사기 함수 소스만 묶는다. 검사기가 import 하는 도우미(`checkers/text/*`)와 사전(`lexicons/*`)을 바꾸면 digest 가 바뀌지 않는다 — 바꿀 때는 `pack.yaml` `version`을 올린다.
+- 팩 digest 는 검사기 함수 소스와 함께 `checkers/index.js` 에서 정적 import 로 닿는 파일 전부(도우미 `checkers/text/*`, 사전 `lexicons/*`, 코어 `core/promise.js`)의 내용을 묶는다(`core/pack/module-graph.js`). 도우미나 사전을 고치면 digest 가 바뀌고 열린 실행은 검사부터 다시 돈다. 검사기는 동적 `import()` 나 계산한 경로로 모듈을 불러오지 않는다(그런 파일은 digest 에 들지 않는다).
````

`packs/brand/README.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/brand/README.md b/packs/brand/README.md
index a4490b9..9559b35 100644
--- a/packs/brand/README.md
+++ b/packs/brand/README.md
@@ -6,5 +6,5 @@
 - 결정론 검사(실험, 참고): `brand.banned-phrases` — 과장·단정 표현 기본 목록(`pack.yaml` `config.words`, 허용 표현 `config.allow`). `brand.figure-units` — 주장의 숫자가 자료 인용에는 다른 단위로만 있음(`config.units`).
 - 세트: `brand.voice`(어조 + 금지 표현), `brand.figures`(`sources.claim-supported`, `sources.numbers-match`, `brand.figure-units`). `brand.figures`는 `sources` 팩이 있어야 한다. 기본 세트는 없다 — `recommendedFor` kinds `company`·`brochure`로 추천만 한다.
 - 검사 `config`는 코어 `withCheckConfig`(`core/pack/check-config.js`)로 검사기 둘째 인자에 넘긴다. 작품마다 work.yaml `checks.<id>.config`로 겹칠 수 있다(예: `brand.banned-phrases`의 `words`). 따로 더할 금지 표현은 사용자 검사(`words`·`pattern`)로도 된다.
-- 숫자 읽기는 `packs/sources/checkers/claims.js`(`numberMatches`)를 그대로 쓴다. 팩 digest는 brand 검사기 소스만 보고 가져다 쓰는 `packs/sources/checkers/claims.js`는 보지 않는다 — claims.js를 고치면 `sources` 팩 `version`과 `brand` 팩 `version`을 함께 올린다.
+- 숫자 읽기는 `packs/sources/checkers/claims.js`(`numberMatches`)를 그대로 쓴다. 팩 digest는 `checkers/index.js`에서 정적 import로 닿는 파일(다른 팩의 claims.js 포함)의 내용까지 묶는다 — claims.js를 고치면 두 팩의 digest가 함께 바뀐다(`core/pack/module-graph.js`). 규칙의 뜻이 바뀌면 `version`도 올린다.
 - 잠금 단계와 `core.promise-order`는 코어가 정한다. 세트를 꺼도 코어 잠금은 그대로다.
````

`packs/sources/README.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/sources/README.md b/packs/sources/README.md
index 1b0cac8..f55a429 100644
--- a/packs/sources/README.md
+++ b/packs/sources/README.md
@@ -4,7 +4,7 @@

 - 주장과 근거 연결은 코어가 한다: 추출 답의 `claims`(요청의 `evidence.wanted`가 true일 때), 도구 `folio_sources link`. 기록장 `.folio/ledger/evidence.jsonl`(추가만).
 - 결정론 검사(실험, 참고): `sources.claim-supported`(근거 없는 주장), `sources.numbers-match`(자료에 없는 숫자·연도), `sources.reliability`(신뢰도 낮은 자료에만 기댐).
-- 숫자 읽기(`checkers/claims.js`): 아라비아 숫자만 읽는다(전각 숫자 포함). ㎡·²·① 같은 기호는 숫자로 읽지 않는다. 천 단위 쉼표는 빼고, 그 밖의 쉼표와 둘 이상의 마침표(날짜·판 번호)는 나눈다. `1.50`과 `1.5`는 같다. 한글 숫자는 읽지 않는다. 팩 digest는 도우미 파일을 보지 않으므로 규칙을 바꾸면 `pack.yaml` `version`을 올린다.
+- 숫자 읽기(`checkers/claims.js`): 아라비아 숫자만 읽는다(전각 숫자 포함). ㎡·²·① 같은 기호는 숫자로 읽지 않는다. 천 단위 쉼표는 빼고, 그 밖의 쉼표와 둘 이상의 마침표(날짜·판 번호)는 나눈다. `1.50`과 `1.5`는 같다. 한글 숫자는 읽지 않는다. 팩 digest는 `checkers/index.js`에서 정적 import로 닿는 도우미 파일의 내용까지 묶는다(`core/pack/module-graph.js`). 규칙의 뜻이 바뀌면 `pack.yaml` `version`도 올린다.
 - 모델 검사(실험, 참고): `sources.conflict`(자료끼리 어긋남), `sources.claims-found`(표시 안 된 주장).
 - 세트: `sources.citations`(결정론 셋), `sources.review`(모델 둘). 기본 세트는 없다 — 추천만 한다. 작가가 `block`으로 올릴 수 있고 `hard`는 안 된다.
 - 잠금 단계와 `core.promise-order`는 코어가 정한다. 세트를 꺼도 코어 잠금은 그대로다.
````

- [ ] **Step 4: 통과·전체 확인**

Run: `node --test test/pack/pack-module-digest.test.js && npm run check`
Expected: PASS, 테스트 953/953

- [ ] **Step 5: 커밋**

```bash
git add core/pack/module-graph.js core/pack/yaml-pack.js packs/brand/README.md packs/brand/index.js packs/knowledge/index.js packs/novel/README.md packs/novel/index.js packs/sources/README.md packs/sources/index.js test/pack/pack-module-digest.test.js
git commit -m "$(cat <<'EOF'
fix(pack): count imported checker helpers and lexicons in the pack digest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task B3: 약속 한 걸음 `stepPromise`

> 리뷰: **가장 강한 모델**(잠금 `core.promise-order`의 `foldPromise`). 공격해 볼 것:
> - hard 지적(`PROMISE_MOVED_BEFORE_PLANT`, `PROMISE_RESOLVED_BEFORE_PLANT`)이 하나라도 사라지거나 생기는 순서가 있는가(길이 5 이상, 같은 노드 안 여러 사건, `promise.mentioned` 섞음).
> - 닫힌 뒤 `reopened` → `resolved`가 여전히 경고 없는가.
> - `promiseMovement`의 `lastMovedAt`이 닫힌 약속에서 움직이는가(휴면 판정이 바뀐다).
> - 뷰어 약속판·`promise-flow`·`promise-dormant`가 같은 순서를 다르게 읽는 경우가 남았는가.

**Files:**
- Create: `test/core/promise-step.test.js`
- Modify: `core/promise.js`, `packs/novel/checkers/promise-flow.js`

**Interfaces:**
- `stepPromise(stage, next) → { stage, moved }`: `next`가 null이면 그대로. 심기 전에는 `planted`만 시작한다. `closed`는 `reopened`로만 나간다.
- `foldPromise`·`promiseMovement`·`promise-flow`가 이것을 쓴다. 공개 이름은 그대로다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/core/promise-step.test.js` (73줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMISE_MENTION, PROMISE_STAGES, foldPromise, promiseMovement, promiseStageOf, stepPromise } from '../../core/promise.js';
import { PROMISE_ORDER_CHECK } from '../../core/checks/builtin.js';
import { promiseFlow } from '../../packs/novel/checkers/promise-flow.js';

const ev = (kind, nodeId, entityId = 'key') => ({ entityId, kind: kind.includes('.') ? kind : `promise.${kind}`, nodeId, eventId: `${nodeId}-${kind}` });
const promiseEntities = new Map([['key', { kind: 'promise', name: '열쇠' }]]);

test('C0: stepPromise is the one promise step — planted starts it, closed stays closed until reopened, mentions never move it', () => {
  const cases = [
    [null, 'planted', 'planted', true], [null, 'advanced', null, false], [null, 'resolved', null, false], [null, null, null, false],
    ['planted', 'advanced', 'advanced', true], ['advanced', 'resolved', 'resolved', true], ['resolved', 'closed', 'closed', true],
    ['closed', 'advanced', 'closed', false], ['closed', 'resolved', 'closed', false], ['closed', 'planted', 'closed', false],
    ['closed', 'reopened', 'reopened', true], ['parked', 'advanced', 'advanced', true], ['advanced', null, 'advanced', false],
  ];
  for (const [stage, next, after, moved] of cases) assert.deepEqual(stepPromise(stage, next), { stage: after, moved }, `${stage} → ${next}`);
});

test('C0: closed → advanced → resolved reads the same everywhere — the core lock warns, dormancy sees it closed, the flow check flags the advance', () => {
  const events = [ev('planted', 'e1'), ev('closed', 'e2'), ev('advanced', 'e3'), ev('resolved', 'e4')];
  const folded = foldPromise(events);
  assert.equal(folded.stage, 'closed');
  assert.deepEqual(folded.problems.map((p) => [p.code, p.severity, p.nodeId]), [['PROMISE_RESOLVED_AFTER_CLOSE', 'warning', 'e4']]);
  assert.deepEqual(promiseMovement(events), { stage: 'closed', plantedAt: 'e1', lastMovedAt: 'e2' });
  const flow = promiseFlow({ draft: '', priorEvents: events.slice(0, 2), draftEvents: events.slice(2), work: { entities: promiseEntities } });
  assert.deepEqual(flow.map((f) => f.code), ['PROMISE_EVENT_AFTER_CLOSE'], 'the flow check flags the advance and leaves the resolve to the core warning');
  const reopened = [ev('planted', 'e1'), ev('closed', 'e2'), ev('reopened', 'e3'), ev('advanced', 'e4'), ev('resolved', 'e5')];
  assert.deepEqual(foldPromise(reopened).problems, []);
  assert.deepEqual(promiseMovement(reopened), { stage: 'resolved', plantedAt: 'e1', lastMovedAt: 'e5' });
  const withMention = [ev('planted', 'e1'), ev(PROMISE_MENTION, 'e2'), ev('closed', 'e3')];
  assert.deepEqual(promiseMovement(withMention).lastMovedAt, 'e3');
});

/** C0 전의 foldPromise(바꾸기 전 동작). 새 동작이 잠금을 약하게 하지 않는지 견주는 기준이다. */
function foldBefore(events) {
  let stage = null;
  const problems = [];
  for (const event of events) {
    const next = promiseStageOf(event);
    if (!next) continue;
    if (stage === null && next !== 'planted') problems.push({ code: next === 'resolved' ? 'PROMISE_RESOLVED_BEFORE_PLANT' : 'PROMISE_MOVED_BEFORE_PLANT', severity: 'hard', nodeId: event.nodeId });
    else if (stage === 'closed' && next === 'resolved') problems.push({ code: 'PROMISE_RESOLVED_AFTER_CLOSE', severity: 'warning', nodeId: event.nodeId });
    if (stage !== null || next === 'planted') stage = next;
  }
  return problems;
}

test('C0: over every sequence of up to four stage events the lock only gets stricter — the same hard findings, warnings only added', () => {
  const kinds = [...PROMISE_STAGES, 'mentioned'];
  let sequences = [[]];
  let compared = 0;
  for (let length = 1; length <= 4; length += 1) {
    sequences = sequences.flatMap((seq) => kinds.map((kind) => [...seq, kind]));
    for (const seq of sequences) {
      const events = seq.map((kind, i) => ev(kind === 'mentioned' ? PROMISE_MENTION : kind, `n${i}`));
      const before = foldBefore(events);
      const after = foldPromise(events).problems;
      const key = (p) => `${p.code}@${p.nodeId}`;
      assert.deepEqual(after.filter((p) => p.severity === 'hard').map(key), before.filter((p) => p.severity === 'hard').map(key), seq.join(' '));
      for (const warning of before.filter((p) => p.severity === 'warning')) assert.ok(after.some((p) => key(p) === key(warning)), seq.join(' '));
      compared += 1;
    }
  }
  assert.equal(compared, 8 + 64 + 512 + 4096);
});

test('C0: core.promise-order reports the new warning on the resolving node, and it does not block', () => {
  const work = { entities: promiseEntities };
  const priorEvents = [ev('planted', 'e1'), ev('closed', 'e2'), ev('advanced', 'e3')];
  const findings = PROMISE_ORDER_CHECK.run({ work, nodeId: 'e4', priorEvents, draftEvents: [ev('resolved', 'e4')] });
  assert.deepEqual(findings.map((f) => [f.code, f.severity]), [['PROMISE_RESOLVED_AFTER_CLOSE', 'warning']]);
});
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/core/promise-step.test.js`
Expected: FAIL — `stepPromise`를 내보내지 않는다

- [ ] **Step 3: 구현**

`core/promise.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/promise.js b/core/promise.js
index 307b0ee..7683d43 100644
--- a/core/promise.js
+++ b/core/promise.js
@@ -19,7 +19,28 @@ export function promiseStageOf(event) {
   return PROMISE_STAGES.includes(stage) ? stage : null;
 }

-/** 읽는 순서로 정렬된 한 약속의 사건을 접는다. */
+/**
+ * 약속 단계 한 걸음. foldPromise(잠금 core.promise-order), promiseMovement(휴면), novel.promise-flow 가 모두 이것 하나로 읽는다.
+ * - 심기 전(null)에는 planted 만 단계를 바꾼다.
+ * - 닫힌(closed) 뒤에는 reopened 만 단계를 바꾼다. 다른 단계 사건은 약속을 움직이지 않는다(닫힌 채 남는다).
+ * - 그 밖에는 새 단계로 간다. 단계가 아닌 사건(next 가 null, 예: promise.mentioned)은 아무것도 바꾸지 않는다.
+ * @param {string|null} stage 지금 단계
+ * @param {string|null} next 사건의 단계(promiseStageOf)
+ * @returns {{ stage: string|null, moved: boolean }} 사건 뒤 단계, 그 사건이 약속을 움직였는지
+ */
+export function stepPromise(stage, next) {
+  if (next === null) return { stage, moved: false };
+  if (stage === null) return next === 'planted' ? { stage: next, moved: true } : { stage, moved: false };
+  if (stage === 'closed' && next !== 'reopened') return { stage, moved: false };
+  return { stage: next, moved: true };
+}
+
+/**
+ * 읽는 순서로 정렬된 한 약속의 사건을 접는다(잠금 core.promise-order 가 쓴다).
+ * - 심기 전 단계 사건: hard(PROMISE_RESOLVED_BEFORE_PLANT, PROMISE_MOVED_BEFORE_PLANT).
+ * - 닫힌 약속의 해소: warning(PROMISE_RESOLVED_AFTER_CLOSE). 닫힌 뒤 다른 사건(advanced 등)은 stepPromise 대로 약속을 다시 열지 않으므로,
+ *   closed → advanced → resolved 도 이 경고를 낸다(C0: 예전에는 advanced 가 약속을 다시 열어 경고가 빠졌다). hard 판정은 예전과 같다.
+ */
 export function foldPromise(eventsInOrder) {
   let stage = null;
   const history = [];
@@ -33,7 +54,7 @@ export function foldPromise(eventsInOrder) {
     } else if (stage === 'closed' && next === 'resolved') {
       problems.push({ code: 'PROMISE_RESOLVED_AFTER_CLOSE', severity: 'warning', ...at });
     }
-    if (stage !== null || next === 'planted') stage = next;
+    stage = stepPromise(stage, next).stage;
     history.push({ stage: next, ...at });
   }
   return { stage, history, problems };
@@ -41,8 +62,8 @@ export function foldPromise(eventsInOrder) {

 /**
  * 한 약속의 지금 단계, 심은 노드, 마지막으로 움직인 노드. 사건은 읽는 순서로 정렬돼 있어야 한다.
- * 단계 사건은 모두 움직임이다. 언급(promise.mentioned)은 움직임이 아니다("지나가는 언급은 움직임이 아니다", vibelore ledger).
- * 심기 전 사건은 foldPromise 처럼 단계로 치지 않는다.
+ * stepPromise 가 움직였다고 한 사건만 움직임이다: 언급(promise.mentioned)은 움직임이 아니고("지나가는 언급은 움직임이 아니다", vibelore ledger),
+ * 심기 전 사건과 닫힌 뒤 reopened 가 아닌 사건도 약속을 움직이지 않는다.
  * @returns {{ stage: string|null, plantedAt: string|null, lastMovedAt: string|null }}
  */
 export function promiseMovement(eventsInOrder) {
@@ -50,10 +71,10 @@ export function promiseMovement(eventsInOrder) {
   let plantedAt = null;
   let lastMovedAt = null;
   for (const event of eventsInOrder) {
-    const next = promiseStageOf(event);
-    if (!next || (stage === null && next !== 'planted')) continue;
+    const step = stepPromise(stage, promiseStageOf(event));
+    if (!step.moved) continue;
     if (stage === null) plantedAt = event.nodeId;
-    stage = next;
+    stage = step.stage;
     lastMovedAt = event.nodeId;
   }
   return { stage, plantedAt, lastMovedAt };
````

`packs/novel/checkers/promise-flow.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/packs/novel/checkers/promise-flow.js b/packs/novel/checkers/promise-flow.js
index ab00df6..2e722f9 100644
--- a/packs/novel/checkers/promise-flow.js
+++ b/packs/novel/checkers/promise-flow.js
@@ -1,10 +1,11 @@
-import { PROMISE_KIND, PROMISE_MENTION, promiseStageOf } from '../../../core/promise.js';
+import { PROMISE_KIND, PROMISE_MENTION, promiseStageOf, stepPromise } from '../../../core/promise.js';

 /**
  * 약속 흐름(novel.promise-flow). 이 원고가 닫힌 약속을 다시 쓰거나, 심지 않은 약속을 언급하면 알린다.
  * vibelore engine/src/continuity/ledger.js(LEDGER_CLOSED_HOOK_EVENT·약속의 LEDGER_UNKNOWN_ID) 의 뜻을 옮김.
  * - 앞 사건과 이 원고의 사건을 읽는 순서로 접되, 지적은 이 원고의 사건에만 한다.
  * - 닫힌(closed) 약속은 reopened 로만 다시 열린다. 닫힌 뒤의 다른 사건은 약속을 움직이지 않는다(vibelore 와 같다).
+ *   단계 읽기는 코어 stepPromise 하나다 — core.promise-order(foldPromise)·잠든 약속과 같은 규칙이다(C0).
  * - 닫힌 뒤 resolved 는 core.promise-order 가 이미 경고하므로 여기서 다시 알리지 않는다.
  * - 심기 전 단계 사건은 core.promise-order 가 막는다. 여기서는 언급(promise.mentioned)만 본다.
  * - 실험 검사라 등급은 pack.yaml(advisory)이 정한다. 지적에 severity 를 적지 않는다.
@@ -18,7 +19,7 @@ export function promiseFlow(ctx) {
   const findings = [];
   for (const id of touched) {
     let stage = null;
-    for (const event of (ctx.priorEvents ?? []).filter((e) => e?.entityId === id && isPromiseEvent(e, entities))) stage = step(stage, event);
+    for (const event of (ctx.priorEvents ?? []).filter((e) => e?.entityId === id && isPromiseEvent(e, entities))) stage = stepPromise(stage, promiseStageOf(event)).stage;
     for (const event of draftEvents.filter((e) => e.entityId === id)) {
       const next = promiseStageOf(event);
       const what = next ?? 'mentioned';
@@ -31,7 +32,7 @@ export function promiseFlow(ctx) {
         // vibelore: LEDGER_UNKNOWN_ID(심지 않은 약속)
         findings.push({ code: 'PROMISE_MENTIONED_BEFORE_PLANT', entityId: id, ...(quote ? { quote } : {}), message: `${label}: 심지(planted) 않은 약속을 언급한다` });
       }
-      stage = step(stage, event);
+      stage = stepPromise(stage, next).stage;
     }
   }
   return findings;
@@ -43,12 +44,3 @@ function isPromiseEvent(event, entities) {
   const entity = entities.get(event.entityId);
   return !entity || entity.kind === PROMISE_KIND;
 }
-
-/** 한 사건 뒤의 단계. 심기 전에는 planted 만, 닫힌 뒤에는 reopened 만 단계를 바꾼다. 언급은 바꾸지 않는다. */
-function step(stage, event) {
-  const next = promiseStageOf(event);
-  if (next === null) return stage;
-  if (stage === null) return next === 'planted' ? next : null;
-  if (stage === 'closed') return next === 'reopened' ? next : stage;
-  return next;
-}
````

- [ ] **Step 4: 통과·전체 확인**

Run: `node --test test/core/promise-step.test.js && npm run check`
Expected: PASS, 테스트 957/957

- [ ] **Step 5: 커밋**

```bash
git add core/promise.js packs/novel/checkers/promise-flow.js test/core/promise-step.test.js
git commit -m "$(cat <<'EOF'
refactor(promise): one promise step for the lock fold, movement and promise-flow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task B4: 없는 검사를 부르는 세트는 추천하지 않는다

> 리뷰: 보통 모델. 확인할 것: 작가가 고른 세트의 오류 동작은 그대로인가, `describeCheckSets`는 모든 세트를 계속 보이는가.

**Files:**
- Create: `test/core/recommend-available.test.js`
- Modify: `core/checks/recommend.js`, `skill/folio/references/brand.md`, `skill/folio/references/checks.md`

**Interfaces:**
- `recommendCheckSets`, `recommendForNode`: 멤버가 하나라도 없는 세트를 뺀다.
- `describeCheckSets`: 각 세트에 `missingChecks: string[]`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/core/recommend-available.test.js` (39줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCheckSets, recommendCheckSets, recommendForNode } from '../../core/checks/recommend.js';
import { resolveChecks } from '../../core/checks/check-set.js';
import { resolvePacks } from '../../core/pack/registry.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { loadBuiltinPacks } from '../../packs/index.js';

const packs = await loadBuiltinPacks();
const setup = (names, patch = {}) => {
  const { config, errors } = validateWorkConfig({ levels: [{ name: 'doc' }, { name: 'section', leaf: true }], packs: names, checkSets: [], ...patch });
  assert.deepEqual(errors, []);
  return { registry: resolvePacks(names, packs), config };
};
const ids = (recs) => recs.map((r) => r.setId);

test('C0 (N5 H4): a set naming checks this work does not have is not recommended, and describe says which are missing', () => {
  const without = setup(['knowledge', 'brand']);
  assert.deepEqual(ids(recommendCheckSets({ ...without, workKind: 'company' })).filter((id) => id.startsWith('brand.')), ['brand.voice']);
  const figures = describeCheckSets(without.registry, without.config).find((s) => s.id === 'brand.figures');
  assert.deepEqual(figures.missingChecks, ['sources.claim-supported', 'sources.numbers-match']);
  const picked = resolveChecks({ ...without, config: { ...without.config, checkSets: ['brand.figures'] } });
  assert.deepEqual([...new Set(picked.errors.map((e) => e.code))], ['CHECK_UNKNOWN'], 'the refusal the recommendation now avoids');
  const withSources = setup(['knowledge', 'sources', 'brand']);
  assert.deepEqual(ids(recommendCheckSets({ ...withSources, workKind: 'company' })).filter((id) => id.startsWith('brand.')), ['brand.voice', 'brand.figures']);
  assert.deepEqual(describeCheckSets(withSources.registry, withSources.config).find((s) => s.id === 'brand.figures').missingChecks, []);
});

test('C0: user checks named in work.yaml count as known; a user set naming an unknown check is left out of node recommendations too', () => {
  const work = setup(['knowledge'], {
    checks: { 'my-words': { words: ['금지'] } },
    userCheckSets: { mine: { checks: ['my-words'] }, broken: { checks: ['ghost-check'] } },
  });
  const described = Object.fromEntries(describeCheckSets(work.registry, work.config).map((s) => [s.id, s.missingChecks]));
  assert.deepEqual([described.mine, described.broken], [[], ['ghost-check']]);
  const tree = { nodes: new Map([['s1', { id: 's1', level: 'section', role: 'body', kind: 'leaf' }]]) };
  const registry = { ...work.registry, checkSets: { ...work.registry.checkSets, 'x.node': { title: 'x', checks: ['ghost'], recommendedFor: { levels: ['section'] } } } };
  assert.ok(!recommendForNode({ registry, config: work.config, work: { tree }, nodeId: 's1' }).sets.some((s) => s.setId === 'x.node'));
});
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/core/recommend-available.test.js`
Expected: FAIL — `brand.figures`가 `sources` 팩 없이 추천되고, `missingChecks`가 없다

- [ ] **Step 3: 구현**

`core/checks/recommend.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/checks/recommend.js b/core/checks/recommend.js
index 913660b..62ad774 100644
--- a/core/checks/recommend.js
+++ b/core/checks/recommend.js
@@ -1,4 +1,5 @@
 import { FolioError } from '../errors.js';
+import { BUILTIN_CHECKS } from './builtin.js';
 import { allCheckSets, chosenSetIds } from './check-set.js';

 /**
@@ -12,26 +13,37 @@ function recommendedFor(set) {
   return { kinds: list(raw.kinds), levels: list(raw.levels), roles: list(raw.roles), positions: list(raw.positions) };
 }

+/**
+ * 세트마다: 골랐는지, 기본인지, 이 작품에서 알 수 없는 멤버(missing — 작품 packs 에 없는 팩의 검사 등).
+ * 알려진 검사 = 실린 팩의 검사 + 코어 검사 + work.yaml checks 의 사용자 검사. resolveChecks 가 CHECK_UNKNOWN 으로 거부할 멤버와 같다.
+ */
 function entries(registry, config) {
   const { sets } = allCheckSets(registry, config);
   const chosen = new Set(chosenSetIds(registry, config));
   const defaults = new Set(registry.defaultCheckSets ?? []);
-  return Object.entries(sets).map(([id, set]) => ({ id, set, selected: chosen.has(id), isDefault: defaults.has(id) }));
+  const known = new Set([...(registry.checks ?? []).map((c) => c.id), ...BUILTIN_CHECKS.map((c) => c.id), ...Object.keys(config.checks ?? {})]);
+  return Object.entries(sets).map(([id, set]) => ({
+    id, set, selected: chosen.has(id), isDefault: defaults.has(id), missing: (set.checks ?? []).filter((checkId) => !known.has(checkId)),
+  }));
 }

-/** 모든 세트(팩 + 사용자)와 그 검사, 골랐는지, 기본 세트인지. */
+/** 모든 세트(팩 + 사용자)와 그 검사, 골랐는지, 기본 세트인지, 이 작품에서 알 수 없는 검사(missingChecks — 고르면 CONFIG_INVALID). */
 export function describeCheckSets(registry, config) {
-  return entries(registry, config).map(({ id, set, selected, isDefault }) => ({
+  return entries(registry, config).map(({ id, set, selected, isDefault, missing }) => ({
     id, origin: set.origin === 'user' ? 'user' : 'pack', title: set.title ?? id, description: set.description ?? '',
-    checks: [...(set.checks ?? [])], selected, default: isDefault, recommendedFor: recommendedFor(set),
+    checks: [...(set.checks ?? [])], selected, default: isDefault, recommendedFor: recommendedFor(set), missingChecks: missing,
   }));
 }

-/** 작품 단위 추천: 기본 세트, 작품 종류, 작품에 있는 레벨. 이유가 하나라도 있는 세트만 돌려준다. */
+/**
+ * 작품 단위 추천: 기본 세트, 작품 종류, 작품에 있는 레벨. 이유가 하나라도 있는 세트만 돌려준다.
+ * 이 작품에서 알 수 없는 검사가 든 세트는 추천하지 않는다 — 고르면 CONFIG_INVALID(CHECK_UNKNOWN)가 된다(N5 인계 H4).
+ */
 export function recommendCheckSets({ registry, config, workKind = null }) {
   const levelNames = config.levels.map((level) => level.name);
   const out = [];
-  for (const { id, set, selected, isDefault } of entries(registry, config)) {
+  for (const { id, set, selected, isDefault, missing } of entries(registry, config)) {
+    if (missing.length) continue;
     const rf = recommendedFor(set);
     const reasons = [];
     if (isDefault) reasons.push({ kind: 'default' });
@@ -44,14 +56,15 @@ export function recommendCheckSets({ registry, config, workKind = null }) {

 /**
  * 노드 단위 추천: 레벨 / 역할(front·body·back) / 위치(leaf·branch). 세트가 적은 조건이 모두 맞아야 하고,
- * 노드 조건(levels·roles·positions)을 하나도 적지 않은 세트는 노드 추천에 나오지 않는다.
+ * 노드 조건(levels·roles·positions)을 하나도 적지 않은 세트는 노드 추천에 나오지 않는다. 알 수 없는 검사가 든 세트도 나오지 않는다.
  */
 export function recommendForNode({ registry, config, work, nodeId }) {
   const node = work.tree.nodes.get(nodeId);
   if (!node) throw new FolioError('NODE_NOT_FOUND', nodeId);
   const facts = [['levels', 'level', node.level], ['roles', 'role', node.role], ['positions', 'position', node.kind]];
   const sets = [];
-  for (const { id, set, selected } of entries(registry, config)) {
+  for (const { id, set, selected, missing } of entries(registry, config)) {
+    if (missing.length) continue;
     const rf = recommendedFor(set);
     const asked = facts.filter(([field]) => rf[field].length > 0);
     if (!asked.length || !asked.every(([field, , value]) => rf[field].includes(value))) continue;
````

`skill/folio/references/brand.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/skill/folio/references/brand.md b/skill/folio/references/brand.md
index 57fb380..28c2a41 100644
--- a/skill/folio/references/brand.md
+++ b/skill/folio/references/brand.md
@@ -7,7 +7,7 @@
 `folio_init { root, title, packs: ['knowledge', 'sources', 'brand'], preset: 'guide' }`. 회사 문서 전용 프리셋은 없다 — 안내서(`guide`: chapter → section)로 만들고 세트를 고른다.

 - `sources`는 수치 대조(`brand.figures`)에 필요하다. 추출 요청이 주장(`claims`)을 묻는 것도 `packs`에 `sources`가 있을 때뿐이다. 수치 대조를 안 쓰면 `packs: ['knowledge', 'brand']`도 된다.
-- 세트 추천은 `folio_config { root, workKind: 'company' }`(브로셔는 `'brochure'`)로 본다. 세트는 작가가 고른다([checks.md](checks.md)의 첫 설정 인터뷰). 추천은 `packs`에 `sources`가 없어도 `brand.figures`를 그대로 내놓는다 — 그 상태로 고르면 `CONFIG_INVALID`가 된다. `packs`에 `sources`를 먼저 넣거나(위 문단), `brand.voice`만 고른다.
+- 세트 추천은 `folio_config { root, workKind: 'company' }`(브로셔는 `'brochure'`)로 본다. 세트는 작가가 고른다([checks.md](checks.md)의 첫 설정 인터뷰). `packs`에 `sources`가 없으면 `brand.figures`는 추천에 나오지 않고, `checkSets`의 그 세트에 없는 검사가 `missingChecks`로 보인다 — 그 상태로 고르면 `CONFIG_INVALID`가 된다. 수치 대조를 원하면 `packs`에 `sources`를 먼저 넣는다(위 문단).
 - 회사 자료(보도자료·사실 자료)는 `folio_sources`로 넣고 맨 위 노드 앞머리 `sources`에 적는다([sources.md](sources.md)).

 ## 세트 (작가가 고른다)
````

`skill/folio/references/checks.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/skill/folio/references/checks.md b/skill/folio/references/checks.md
index 937811f..1967080 100644
--- a/skill/folio/references/checks.md
+++ b/skill/folio/references/checks.md
@@ -8,7 +8,7 @@

 ## 도구

-- 세트 설명·추천·검사 목록·단계: `folio_config { root }` — `checkSets`(세트, 골랐는지 `selected`, 기본 세트 `default`), `recommended`(작품 단위 추천과 이유), `checks`, `stages`. `workKind`(작가가 답한 작품 종류)를 주면 `recommended`에 그 이유가 더해진다. `node`(노드 id)를 주면 `nodeRecommendations`(그 노드 레벨·역할·위치에 맞는 세트)가 더해진다.
+- 세트 설명·추천·검사 목록·단계: `folio_config { root }` — `checkSets`(세트, 골랐는지 `selected`, 기본 세트 `default`, 이 작품에 없는 검사 `missingChecks` — 비어 있지 않으면 고를 수 없고 추천에도 나오지 않는다), `recommended`(작품 단위 추천과 이유), `checks`(검사마다 지금 `config`), `stages`. `workKind`(작가가 답한 작품 종류)를 주면 `recommended`에 그 이유가 더해진다. `node`(노드 id)를 주면 `nodeRecommendations`(그 노드 레벨·역할·위치에 맞는 세트)가 더해진다.
 - 사용자 검사 초안 검증: `folio_config { root, checkDraft }` — 결과 `checkDraft: { ok, spec, errors }`.
 - 되채우기 목록: `folio_status { root }`의 `recheck`, 막힌 노드는 `flagged`, 다시 확인 필요는 `stale`.
 - 재검사 실행: `folio_run { root, node: <id> 또는 'next-recheck', mode: 'recheck' }`.
````

- [ ] **Step 4: 통과·전체 확인**

Run: `node --test test/core/recommend-available.test.js && npm run check`
Expected: PASS, 테스트 959/959

- [ ] **Step 5: 커밋**

```bash
git add core/checks/recommend.js skill/folio/references/brand.md skill/folio/references/checks.md test/core/recommend-available.test.js
git commit -m "$(cat <<'EOF'
fix(checks): recommend only check sets whose checks this work has

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part C — 뷰어 인계와 실행

### Task C1: 자산 파일을 안전하게 읽고, 기능을 끄면 뷰어가 닫힌다

> 리뷰: **가장 강한 모델**(서버, 작품 밖 파일). 공격해 볼 것:
> - 그림 요청으로 작품 밖 파일을 읽을 수 있는가(자산 메타의 `file`이 `../`, 절대 경로, 링크, `assets/` 자체가 링크, 파일 아래 경로).
> - FIFO, 소켓, 장치 파일, 폴더가 작품 열기·그림 요청·`folio_status`를 멈추거나 `INTERNAL_ERROR`로 만드는가.
> - 그림 요청 하나가 다른 그림 파일을 여는가(`hashFiles: false`).
> - 기능을 끈 뒤에도 답하는 라우트가 있는가(정적 파일, 404, 405 길), `/api/shutdown`은 여전히 되는가, work.yaml이 깨졌을 때 서버가 닫혀 화면 오류를 잃는가.

**Files:**
- Create: `test/core/assets-files.test.js`, `test/server/view-lifecycle.test.js`
- Modify: `core/store/assets.js`, `core/view/asset-file.js`, `core/view/viewer-target.js`, `core/view/index.js`, `server/view/api.js`, `skill/folio/references/viewer.md`

**Interfaces:**
- `readAssets(root, { hashFiles = true })`: `hashFiles: false`면 `rev`가 null이고 파일을 열지 않는다. 새 경고 `ASSET_FILE_NOT_REGULAR`.
- `viewerStillOn(root) → Promise<boolean>`(`core/view/index.js`에서 내보냄).
- `routeApi`: `/api/shutdown` 밖의 요청에서 기능이 꺼졌으면 `ctx.close()` 후 `FEATURE_DISABLED`(403).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/core/assets-files.test.js` (59줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readAssets } from '../../core/store/assets.js';
import { openWork } from '../../core/store/work.js';
import { readAssetFile } from '../../core/view/asset-file.js';
import { copyFixture } from '../support/fixtures.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const posixOnly = process.platform === 'win32' ? 'needs POSIX files' : false;

/** 작품에 그림 설명서 하나를 더한다. file 자리에는 부르는 쪽이 무엇이든 둔다. */
async function addAsset(root, id, file) {
  await writeFile(join(root, 'assets', `${id}.yaml`), `id: ${id}\nfile: ${file}\nbrief: {}\n`);
}
/** 끝나지 않으면 실패한다(FIFO 에서 멈추는 회귀를 잡는다). */
const within = (promise, ms = 3000) => Promise.race([promise, new Promise((_, reject) => { setTimeout(() => reject(new Error('timed out')), ms).unref(); })]);

test('C0: an asset whose file is a folder, or sits under a file, opens as a warning — never EISDIR/ENOTDIR — and is not served', async () => {
  const root = await copyFixture('novel-3level');
  await mkdir(join(root, 'assets', 'shelf.png'));
  await addAsset(root, 'img-shelf', 'shelf.png');
  await writeFile(join(root, 'assets', 'flat.png'), PNG);
  await addAsset(root, 'img-under', 'flat.png/inner.png');
  const work = await openWork(root);
  assert.deepEqual(work.warnings.filter((w) => w.id === 'img-shelf' || w.id === 'img-under').map((w) => [w.id, w.code]), [
    ['img-shelf', 'ASSET_FILE_NOT_REGULAR'], ['img-under', 'ASSET_FILE_MISSING'],
  ]);
  await assert.rejects(readAssetFile(root, 'img-shelf'), (e) => e.code === 'ASSET_FILE_UNAVAILABLE' && e.details.reason === 'not a file');
  await assert.rejects(readAssetFile(root, 'img-under'), (e) => e.code === 'ASSET_FILE_UNAVAILABLE' && e.details.reason === 'missing');
  assert.equal((await readAssetFile(root, 'img-rooftop')).type, 'image/svg+xml');
});

test('C0: a FIFO in the asset file place neither hangs opening the work nor a picture request', { skip: posixOnly }, async () => {
  const root = await copyFixture('novel-3level');
  execFileSync('mkfifo', [join(root, 'assets', 'pipe.png')]);
  await addAsset(root, 'img-pipe', 'pipe.png');
  const work = await within(openWork(root));
  assert.ok(work.warnings.some((w) => w.id === 'img-pipe' && w.code === 'ASSET_FILE_NOT_REGULAR'));
  await assert.rejects(within(readAssetFile(root, 'img-pipe')), { code: 'ASSET_FILE_UNAVAILABLE' });
});

test('C0: a picture request reads only its own file — other image files are not re-read and hashed per request', { skip: posixOnly || (process.getuid?.() === 0 && 'root reads anything') }, async () => {
  const root = await copyFixture('novel-3level');
  const locked = join(root, 'assets', 'locked.png');
  await writeFile(locked, PNG);
  await addAsset(root, 'img-locked', 'locked.png');
  await chmod(locked, 0o000);
  try {
    await assert.rejects(readAssets(root), { code: 'EACCES' }, 'opening the work still hashes every image');
    const { assets } = await readAssets(root, { hashFiles: false });
    assert.equal(assets.get('img-locked').rev, null);
    assert.equal((await readAssetFile(root, 'img-rooftop')).type, 'image/svg+xml');
  } finally {
    await chmod(locked, 0o600);
  }
});
````

`test/server/view-lifecycle.test.js` (59줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startViewServer } from '../../server/view/http-server.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, fakePacks, fixturePath, useFakePack } from '../support/fixtures.js';

async function serve(root) {
  const server = await startViewServer({ root, packs: fakePacks(), distDir: fixturePath('viewer-dist'), onError: () => {} });
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(new URL(path, server.url), {
      method, headers: { 'x-folio-token': server.token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };
  return { server, call };
}
const waitClosed = (server) => new Promise((resolve, reject) => {
  const guard = setTimeout(() => reject(new Error('server did not close')), 5000);
  server.closed.then(() => { clearTimeout(guard); resolve(); });
});
async function setViewer(root, on) {
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, features: { ...(config.features ?? {}), viewer: on } }));
}

test('C0: turning the viewer feature off makes a running viewer refuse with FEATURE_DISABLED and close itself', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const { server, call } = await serve(root);
  try {
    assert.equal((await call('/api/work')).status, 200);
    await setViewer(root, false);
    const refused = await call('/api/nodes/ep-001');
    assert.deepEqual([refused.status, refused.json.error.code, refused.json.error.details.feature], [403, 'FEATURE_DISABLED', 'viewer']);
    await waitClosed(server);
  } finally { await server.close(); }
});

test('C0: an unreadable work.yaml reaches the screen error instead of closing the viewer; shutdown works with the feature off', async () => {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  const { server, call } = await serve(root);
  try {
    const good = await readFile(join(root, 'work.yaml'), 'utf8');
    await writeFile(join(root, 'work.yaml'), 'levels: [');
    const broken = await call('/api/work');
    assert.equal(broken.status >= 400, true);
    assert.notEqual(broken.json.error.code, 'FEATURE_DISABLED');
    await writeFile(join(root, 'work.yaml'), good);
    assert.equal((await call('/api/work')).status, 200, 'still running');
    await setViewer(root, false);
    assert.deepEqual((await call('/api/shutdown', { method: 'POST', body: {} })).json, { closing: true });
    await waitClosed(server);
  } finally { await server.close(); }
});
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/core/assets-files.test.js test/server/view-lifecycle.test.js`
Expected: FAIL — 폴더 자산이 `EISDIR`, FIFO 테스트가 시간 초과, `viewerStillOn`이 없다

- [ ] **Step 3: 구현**

`core/store/assets.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/store/assets.js b/core/store/assets.js
index cb77df9..fe98de2 100644
--- a/core/store/assets.js
+++ b/core/store/assets.js
@@ -1,5 +1,6 @@
+import { constants } from 'node:fs';
 import { join } from 'node:path';
-import { readFile } from 'node:fs/promises';
+import { open, readFile } from 'node:fs/promises';
 import { listEntries, writeFileAtomic } from '../util/fs.js';
 import { sha256 } from '../util/hash.js';
 import { parseYaml, stringifyYaml } from '../util/yaml.js';
@@ -10,8 +11,37 @@ const INLINE = /!\[\[asset:([A-Za-z0-9][\w-]*)\]\]/g;

 export const assetRefsInBody = (body) => [...String(body).matchAll(INLINE)].map((match) => match[1]);

-/** 그림 설명서(yaml). 이미지 파일이 없으면 경고만 한다(생성 전 상태가 정상일 수 있음). */
-export async function readAssets(root) {
+/**
+ * 그림 파일 내용의 hash. 보통 파일만 읽는다 — O_NONBLOCK 으로 열어 FIFO 에서 멈추지 않고, 연 손잡이의 fstat 으로
+ * 폴더·FIFO·장치를 거른다(검사와 읽기 사이 바꿔치기 없음). 없으면 missing, 보통 파일이 아니면 notFile.
+ * @param {string} path
+ * @returns {Promise<{ hash: string } | { missing: true } | { notFile: true }>}
+ */
+async function fileHashOf(path) {
+  let handle;
+  try {
+    handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
+  } catch (error) {
+    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return { missing: true };
+    if (error?.code === 'EISDIR') return { notFile: true };
+    throw error;
+  }
+  try {
+    if (!(await handle.stat()).isFile()) return { notFile: true };
+    return { hash: sha256(await handle.readFile()) };
+  } finally {
+    await handle.close();
+  }
+}
+
+/**
+ * 그림 설명서(yaml). 이미지 파일이 없으면 경고만 한다(생성 전 상태가 정상일 수 있음). 파일 자리가 폴더·FIFO 같은
+ * 보통 파일이 아닌 것이어도 작품 열기를 막지 않고 경고(ASSET_FILE_NOT_REGULAR)만 한다.
+ * hashFiles: false 면 이미지 파일을 읽지 않는다(rev 는 null) — 설명서만 필요한 곳(뷰어 그림 요청)이 요청마다 모든 그림을 다시 읽지 않게.
+ * @param {string} root
+ * @param {{ hashFiles?: boolean }} [options]
+ */
+export async function readAssets(root, { hashFiles = true } = {}) {
   const assets = new Map();
   const errors = [];
   const warnings = [];
@@ -22,16 +52,17 @@ export async function readAssets(root) {
     const meta = parseYaml(text, { source: path });
     if (typeof meta.id !== 'string') { errors.push({ code: 'ASSET_META_INVALID', path }); continue; }
     let fileHash = null;
-    if (typeof meta.file === 'string') {
-      try { fileHash = sha256(await readFile(join(root, ASSETS_DIR, meta.file))); }
-      catch (error) { if (error.code !== 'ENOENT') throw error; warnings.push({ code: 'ASSET_FILE_MISSING', id: meta.id, file: meta.file }); }
+    if (hashFiles && typeof meta.file === 'string') {
+      const found = await fileHashOf(join(root, ASSETS_DIR, meta.file));
+      if ('hash' in found) fileHash = found.hash;
+      else warnings.push({ code: 'missing' in found ? 'ASSET_FILE_MISSING' : 'ASSET_FILE_NOT_REGULAR', id: meta.id, file: meta.file });
     }
     const brief = meta.brief && typeof meta.brief === 'object' ? meta.brief : {};
     if (assets.has(meta.id)) { errors.push({ code: 'DUPLICATE_ASSET_ID', id: meta.id }); continue; }
     assets.set(meta.id, {
       id: meta.id, file: meta.file ?? null, brief,
       entities: Array.isArray(brief.entities) ? brief.entities.filter((e) => typeof e === 'string') : [],
-      meta, path, rev: sha256(`${text}\u0000${fileHash ?? ''}`), metaText: text,
+      meta, path, rev: hashFiles ? sha256(`${text}\u0000${fileHash ?? ''}`) : null, metaText: text,
     });
   }
   return { assets, errors, warnings };
````

`core/view/asset-file.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/view/asset-file.js b/core/view/asset-file.js
index 5b7cec1..e814f1e 100644
--- a/core/view/asset-file.js
+++ b/core/view/asset-file.js
@@ -15,13 +15,15 @@ const unavailable = (assetId, reason) => new FolioError('ASSET_FILE_UNAVAILABLE'
 /**
  * 그림 id → 이미지 바이트. 작품 폴더 밖은 읽지 않는다:
  * 설명서의 file 은 assets/ 기준 상대 경로여야 하고(절대 경로·빈 칸·`.`·`..` 거부), 지나는 폴더와 파일이 링크면 거부,
- * 보통 파일이어야 하고, 알려진 그림 종류(ASSET_TYPES)만, 20MiB 까지. 마지막 파일은 링크를 따라가지 않고 연다(O_NOFOLLOW, 되는 OS 에서).
+ * 보통 파일이어야 하고, 알려진 그림 종류(ASSET_TYPES)만, 20MiB 까지. 마지막 파일은 링크를 따라가지 않고(O_NOFOLLOW, 되는 OS 에서)
+ * FIFO 에서 멈추지 않게(O_NONBLOCK) 연다. 설명서는 그림 파일을 읽지 않고 찾는다(readAssets hashFiles: false — 요청마다 모든 그림을 다시 읽지 않는다).
+ * 지나는 자리가 파일이라 더 못 들어가면(ENOTDIR) missing 이다.
  * @param {string} root
  * @param {string} assetId
  * @returns {Promise<{ type: string, bytes: Buffer }>}
  */
 export async function readAssetFile(root, assetId) {
-  const { assets } = await readAssets(root);
+  const { assets } = await readAssets(root, { hashFiles: false });
   const asset = assets.get(assetId);
   if (!asset) throw new FolioError('ASSET_NOT_FOUND', String(assetId).slice(0, 200));
   const file = asset.file;
@@ -33,11 +35,11 @@ export async function readAssetFile(root, assetId) {
   let at = root;
   for (const part of [ASSETS_DIR, ...parts]) {
     at = join(at, part);
-    const info = await lstat(at).catch((error) => { if (error?.code === 'ENOENT') return null; throw error; });
+    const info = await lstat(at).catch((error) => { if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null; throw error; });
     if (!info) throw unavailable(assetId, 'missing');
     if (info.isSymbolicLink()) throw unavailable(assetId, 'link');
   }
-  const handle = await open(at, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
+  const handle = await open(at, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
   try {
     const info = await handle.stat();
     if (!info.isFile()) throw unavailable(assetId, 'not a file');
````

`core/view/viewer-target.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/view/viewer-target.js b/core/view/viewer-target.js
index 21644a1..777eb26 100644
--- a/core/view/viewer-target.js
+++ b/core/view/viewer-target.js
@@ -1,5 +1,6 @@
 import { FolioError } from '../errors.js';
 import { openWork } from '../store/work.js';
+import { loadWorkConfig } from '../work/config.js';
 import { assertFeature } from '../work/features.js';

 /**
@@ -13,3 +14,17 @@ export async function viewerTarget(root, nodeId) {
   if (nodeId !== undefined && !work.tree.nodes.has(nodeId)) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
   return { title: work.config.title };
 }
+
+/**
+ * 떠 있는 뷰어 서버가 요청마다 본다: work.yaml 에서 viewer 기능이 꺼졌는가. 꺼졌으면 false — 서버는 답하지 않고 닫힌다.
+ * work.yaml 을 읽을 수 없으면 true 를 돌려준다 — 그 오류는 각 화면 요청이 제 코드로 알린다.
+ * @param {string} root
+ */
+export async function viewerStillOn(root) {
+  try {
+    const { config } = await loadWorkConfig(root);
+    return config.features.viewer !== false;
+  } catch {
+    return true;
+  }
+}
````

`core/view/index.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/view/index.js b/core/view/index.js
index b3cf084..93c106f 100644
--- a/core/view/index.js
+++ b/core/view/index.js
@@ -9,4 +9,4 @@ export { viewNodeReceipts, viewReceiptList } from './receipt-view.js';
 export { viewStages } from './stages-view.js';
 export { setStageMode } from './stage-toggle.js';
 export { readAssetFile } from './asset-file.js';
-export { viewerTarget } from './viewer-target.js';
+export { viewerStillOn, viewerTarget } from './viewer-target.js';
````

`server/view/api.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/server/view/api.js b/server/view/api.js
index ced9f47..3c47e56 100644
--- a/server/view/api.js
+++ b/server/view/api.js
@@ -1,6 +1,6 @@
 import { FolioError } from '../../core/errors.js';
 import {
-  readAssetFile, setStageMode, viewEntity, viewNode, viewNodeReceipts, viewOutline, viewReceiptList, viewStages,
+  readAssetFile, setStageMode, viewEntity, viewNode, viewNodeReceipts, viewOutline, viewReceiptList, viewStages, viewerStillOn,
 } from '../../core/view/index.js';

 const MAX_ID = 200;
@@ -36,6 +36,11 @@ const ROUTES = [
  * @returns {Promise<ApiResult>}
  */
 export async function routeApi({ method, pathname, body, ctx }) {
+  // 작가가 work.yaml 에서 viewer 기능을 끄면 떠 있던 서버도 더 답하지 않고 닫힌다(닫기 요청은 그대로 받는다) — M6 인계.
+  if (pathname !== '/api/shutdown' && !(await viewerStillOn(ctx.root))) {
+    ctx.close();
+    throw new FolioError('FEATURE_DISABLED', 'viewer is turned off in work.yaml; this viewer is closing', { feature: 'viewer' });
+  }
   let known = false;
   for (const [verb, pattern, handler] of ROUTES) {
     const match = /** @type {RegExp} */ (pattern).exec(pathname);
````

`skill/folio/references/viewer.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/skill/folio/references/viewer.md b/skill/folio/references/viewer.md
index 98e8d09..003f567 100644
--- a/skill/folio/references/viewer.md
+++ b/skill/folio/references/viewer.md
@@ -7,7 +7,7 @@
 - 같은 작품을 다시 부르면 떠 있는 뷰어를 다시 쓴다(`reused: true`). 30분 동안 쓰지 않거나, 화면의 "뷰어 닫기", 이 MCP 서버가 끝나면 닫힌다. 닫힌 뒤에는 다시 부르면 된다.
 - `built: false`면 화면 파일이 아직 빌드되지 않았다. 주소는 열리지만 안내 글만 보인다. `hint`의 명령(`npm --prefix viewer ci && npm --prefix viewer run build`)을 작가에게 알린다 — 설치·빌드는 작가가 고른다.
 - 뷰어가 쓰는 것은 단계 켜고 끄기뿐이다(work.yaml `overrides.levels.<레벨>.<단계>.mode`, 끌 때 남긴 이유는 `reason`). 잠금 단계는 화면에 자물쇠만 있고, 서버도 `STEP_LOCKED`로 거부한다. 단계를 바꾸면 열린 실행은 검사부터 다시 돈다([steps.md](steps.md)).
-- 작가가 뷰어를 끄고 싶으면 work.yaml `features.viewer: false`(도구가 `FEATURE_DISABLED`), 읽기만 하게 하려면 `features.viewerToggles: false`. 호스트가 직접 work.yaml을 고치지 않는다.
+- 작가가 뷰어를 끄고 싶으면 work.yaml `features.viewer: false`(도구가 `FEATURE_DISABLED`, 이미 떠 있는 뷰어도 다음 화면 요청에 `FEATURE_DISABLED`로 답하고 닫힌다), 읽기만 하게 하려면 `features.viewerToggles: false`. 호스트가 직접 work.yaml을 고치지 않는다.

 ## 오류일 때

````

- [ ] **Step 4: 통과·전체 확인**

Run: `node --test test/core/assets-files.test.js test/server/view-lifecycle.test.js && npm run check`
Expected: PASS, 테스트 964/964

- [ ] **Step 5: 커밋**

```bash
git add core/store/assets.js core/view/asset-file.js core/view/index.js core/view/viewer-target.js server/view/api.js skill/folio/references/viewer.md test/core/assets-files.test.js test/server/view-lifecycle.test.js
git commit -m "$(cat <<'EOF'
fix(assets,view): open asset files safely and close the viewer when it is turned off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task C2: `openWorkspace`가 후보 work.yaml을 받는다

> 리뷰: **가장 강한 모델**(설정 검증·쓰기). 공격해 볼 것:
> - 단계 토글이 후보 검사를 통과했지만 실제로는 열리지 않는 work.yaml을 쓸 수 있는가(팩 오류, 검사 오류, 레벨 오류).
> - 후보 텍스트가 디스크의 work.yaml·다른 파일을 건드리는가.
> - 쓴 뒤 다시 열기와 되돌림이 여전히 도는가.
> - `resolveWorkspaceConfig`와 `openWorkspace`가 같은 텍스트에 다른 오류를 내는 경우.

**Files:**
- Create: `test/core/workspace-candidate.test.js`
- Modify: `core/run/workspace.js`, `core/store/work.js`, `core/work/config.js`, `core/view/stage-toggle.js`

**Interfaces:**
- `loadWorkConfig(root, { text })`, `openWork(root, { workYaml })`, `openWorkspace(root, { packs, workYaml })`: 텍스트를 주면 디스크의 work.yaml 대신 쓴다.
- `resolveWorkspaceConfig(config, { packs }) → { registry, resolved, pipelines, errors }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/core/workspace-candidate.test.js` (40줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWorkspace, resolveWorkspaceConfig } from '../../core/run/workspace.js';
import { candidateErrors, withStageMode } from '../../core/view/stage-toggle.js';
import { validateWorkConfig } from '../../core/work/config.js';
import { parseYaml } from '../../core/util/yaml.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';

const packs = fakePacks();
async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  return root;
}
const criticMode = (workspace) => workspace.pipelines.byLevel.episode.steps.find((s) => s.id === 'critic').mode;

test('C0 (M6 hand-off): openWorkspace opens an in-memory work.yaml text without touching the file', async () => {
  const root = await serial();
  const path = join(root, 'work.yaml');
  const text = await readFile(path, 'utf8');
  const candidate = withStageMode(text, { level: 'episode', stepId: 'critic', mode: 'off' });
  assert.equal(criticMode(await openWorkspace(root, { packs, workYaml: candidate })), 'off');
  assert.equal(await readFile(path, 'utf8'), text);
  assert.equal(criticMode(await openWorkspace(root, { packs })), 'on');
  const locked = withStageMode(text, { level: 'episode', stepId: 'commit', mode: 'off' });
  await assert.rejects(openWorkspace(root, { packs, workYaml: locked }), (e) => e.code === 'CONFIG_INVALID' && e.details.errors.some((x) => x.code === 'LOCKED_STEP_OVERRIDE'));
  await assert.rejects(openWorkspace(root, { packs, workYaml: 'levels: [' }), (e) => e.code === 'YAML_INVALID' && e.details.source === 'work.yaml');
});

test('C0: the toggle candidate check and openWorkspace share one config resolver — the same errors for the same text', async () => {
  const root = await serial();
  const text = await readFile(join(root, 'work.yaml'), 'utf8');
  for (const [stepId, mode] of [['commit', 'off'], ['facts', 'off'], ['critic', 'off'], ['approve', 'auto']]) {
    const next = withStageMode(text, { level: 'episode', stepId, mode });
    const shared = resolveWorkspaceConfig(validateWorkConfig(parseYaml(next)).config, { packs }).errors.map((e) => e.code);
    assert.deepEqual(candidateErrors(next, { packs }).map((e) => e.code), shared, stepId);
  }
});
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/core/workspace-candidate.test.js`
Expected: FAIL — `resolveWorkspaceConfig`가 없고 `workYaml`을 무시한다

- [ ] **Step 3: 구현**

`core/work/config.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/work/config.js b/core/work/config.js
index 752a8d1..df8b257 100644
--- a/core/work/config.js
+++ b/core/work/config.js
@@ -131,8 +131,13 @@ export function validateWorkConfig(raw) {
   return { config, errors, warnings };
 }

-export async function loadWorkConfig(root) {
-  const text = await readTextOrNull(join(root, 'work.yaml'));
+/**
+ * 작품의 work.yaml 을 읽어 검증한다. text 를 주면 파일 대신 그 글을 본다(쓰기 전 후보 검증 — 뷰어 단계 토글).
+ * @param {string} root
+ * @param {{ text?: string }} [options]
+ */
+export async function loadWorkConfig(root, { text: given } = {}) {
+  const text = typeof given === 'string' ? given : await readTextOrNull(join(root, 'work.yaml'));
   if (text === null) throw new FolioError('WORK_NOT_FOUND', `no work.yaml in ${root}`);
   const { config, errors, warnings } = validateWorkConfig(parseYaml(text, { source: 'work.yaml' }));
   if (errors.length) throw new FolioError('CONFIG_INVALID', errors.map((e) => e.code).join(', '), { errors });
````

`core/store/work.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/store/work.js b/core/store/work.js
index 6f71a52..7ba190a 100644
--- a/core/store/work.js
+++ b/core/store/work.js
@@ -10,9 +10,14 @@ import { readAssets } from './assets.js';

 /** @typedef {Awaited<ReturnType<typeof openWork>>} Work */

-/** 작품 폴더 전체를 읽어 한 모델로 묶는다. 파일이 정본이고 이 객체는 매번 새로 만든다. */
-export async function openWork(root) {
-  const { config, warnings: configWarnings } = await loadWorkConfig(root);
+/**
+ * 작품 폴더 전체를 읽어 한 모델로 묶는다. 파일이 정본이고 이 객체는 매번 새로 만든다.
+ * workYaml 을 주면 work.yaml 파일 대신 그 글로 연다(쓰기 전에 후보 설정이 작품과 맞는지 보는 데만 쓴다).
+ * @param {string} root
+ * @param {{ workYaml?: string }} [options]
+ */
+export async function openWork(root, { workYaml } = {}) {
+  const { config, warnings: configWarnings } = await loadWorkConfig(root, { text: workYaml });
   const tree = await readTree(root);
   const levels = validateTreeLevels(tree, config);
   const entities = await readEntities(root);
````

`core/run/workspace.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/run/workspace.js b/core/run/workspace.js
index f17e959..15cd994 100644
--- a/core/run/workspace.js
+++ b/core/run/workspace.js
@@ -16,16 +16,32 @@ export function checksDigest(checks, pipeline) {
   return sha256(canonicalJson(pipelineChecks(checks, pipeline).map(checkProjection)));
 }

-/** 작품 + 팩 + 검사 + 단계(레벨별 포함). 잠금 덮어쓰기를 포함한 설정 오류는 여기서 전부 거부된다. */
-export async function openWorkspace(root, { packs }) {
-  const work = await openWork(root);
-  const registry = resolvePacks(work.config.packs, packs);
-  const resolved = resolveChecks({ registry, config: work.config });
+/**
+ * 정규화된 설정 + 팩 → 레지스트리·검사·단계와 설정 오류(잠금 덮어쓰기 포함). 파일을 읽지 않는 순수 부분이다.
+ * openWorkspace 와 뷰어 토글의 후보 검증(core/view/stage-toggle.js candidateErrors)이 이것 하나를 같이 쓴다.
+ * 팩 이름이 틀리면(PACK_UNKNOWN 등) FolioError 를 던진다.
+ * @param {any} config validateWorkConfig 의 config
+ * @param {{ packs: Map<string, any> }} options
+ */
+export function resolveWorkspaceConfig(config, { packs }) {
+  const registry = resolvePacks(config.packs, packs);
+  const resolved = resolveChecks({ registry, config });
   const pipelines = resolvePipelines({
-    primary: registry.primary, overrides: work.config.overrides, checks: resolved.checks, levels: work.config.levels,
-    includeAllHardChecks: work.config.options.includeAllHardChecks, packDigest: registry.digest,
+    primary: registry.primary, overrides: config.overrides, checks: resolved.checks, levels: config.levels,
+    includeAllHardChecks: config.options.includeAllHardChecks, packDigest: registry.digest,
   });
-  const errors = [...resolved.errors, ...pipelines.errors];
+  return { registry, resolved, pipelines, errors: [...resolved.errors, ...pipelines.errors] };
+}
+
+/**
+ * 작품 + 팩 + 검사 + 단계(레벨별 포함). 잠금 덮어쓰기를 포함한 설정 오류는 여기서 전부 거부된다.
+ * workYaml 을 주면 work.yaml 파일 대신 그 글로 연다 — 쓰기 전에 후보 설정을 여는 길 그대로(검사 글 파일까지) 본다.
+ * @param {string} root
+ * @param {{ packs: Map<string, any>, workYaml?: string }} options
+ */
+export async function openWorkspace(root, { packs, workYaml }) {
+  const work = await openWork(root, { workYaml });
+  const { registry, resolved, pipelines, errors } = resolveWorkspaceConfig(work.config, { packs });
   const loaded = await loadCheckSources(root, [...resolved.checks, ...customStepChecks(pipelines)]);
   errors.push(...loaded.errors);
   const { checks } = loaded;
````

`core/view/stage-toggle.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/view/stage-toggle.js b/core/view/stage-toggle.js
index 7f4284e..1b03178 100644
--- a/core/view/stage-toggle.js
+++ b/core/view/stage-toggle.js
@@ -1,11 +1,8 @@
 import { join } from 'node:path';
 import YAML from 'yaml';
 import { FolioError } from '../errors.js';
-import { openWorkspace } from '../run/workspace.js';
+import { openWorkspace, resolveWorkspaceConfig } from '../run/workspace.js';
 import { withWorkLock } from '../run/work-lock.js';
-import { resolvePacks } from '../pack/registry.js';
-import { resolveChecks } from '../checks/check-set.js';
-import { resolvePipelines } from '../pipeline/resolve.js';
 import { STEP_MODES } from '../pipeline/define.js';
 import { validateWorkConfig } from '../work/config.js';
 import { assertFeature } from '../work/features.js';
@@ -51,9 +48,9 @@ export function withStageMode(text, { level, stepId, mode, reason = '' }) {
 }

 /**
- * 후보 work.yaml 글을 작품을 열 때와 같은 검증 경로(core/run/workspace.js openWorkspace 의 설정 부분)로 본다:
- * 설정 형식 → 팩 → 검사 세트 → 레벨별 단계(잠금 덮어쓰기는 LOCKED_STEP_OVERRIDE, hard 검사 단계 끄기는 HARD_CHECK_OVERRIDE).
- * 검사 글 파일은 단계 모드와 상관이 없어 읽지 않는다 — 쓴 뒤 openWorkspace 로 한 번 더 연다.
+ * 후보 work.yaml 글의 설정 오류(파일을 읽지 않는 부분): 설정 형식 → 팩 → 검사 세트 → 레벨별 단계
+ * (잠금 덮어쓰기는 LOCKED_STEP_OVERRIDE, hard 검사 단계 끄기는 HARD_CHECK_OVERRIDE). 작품을 열 때와 같은 함수
+ * (core/run/workspace.js resolveWorkspaceConfig)를 쓴다 — 따로 다시 짜지 않는다(C0, M6 인계).
  * @param {string} text
  * @param {{ packs: Map<string, any> }} options
  * @returns {Array<{ code: string, [key: string]: unknown }>}
@@ -61,19 +58,12 @@ export function withStageMode(text, { level, stepId, mode, reason = '' }) {
 export function candidateErrors(text, { packs }) {
   const { config, errors } = validateWorkConfig(parseYaml(text));
   if (errors.length) return errors;
-  let registry;
   try {
-    registry = resolvePacks(config.packs, packs);
+    return resolveWorkspaceConfig(config, { packs }).errors;
   } catch (error) {
     if (error instanceof FolioError) return [{ code: error.code }];
     throw error;
   }
-  const resolved = resolveChecks({ registry, config });
-  const pipelines = resolvePipelines({
-    primary: registry.primary, overrides: config.overrides, checks: resolved.checks, levels: config.levels,
-    includeAllHardChecks: config.options.includeAllHardChecks, packDigest: registry.digest,
-  });
-  return [...resolved.errors, ...pipelines.errors];
 }

 /** @param {unknown} request */
@@ -93,8 +83,8 @@ function readRequest(request) {
  * 1) 뷰어가 읽은 work.yaml(baseDigest)이 지금과 같아야 한다(WORK_YAML_CHANGED).
  * 2) 지금 작품이 열려야 하고, viewerToggles 가 켜져 있어야 한다(FEATURE_DISABLED).
  * 3) 잠금 단계는 기능·설정과 상관없이 거부한다(STEP_LOCKED). 모드는 그 단계가 받는 것만.
- * 4) 바꾼 글을 기존 검증 경로로 본다(candidateErrors). 오류가 하나라도 있으면 아무것도 쓰지 않는다(CONFIG_INVALID).
- * 5) 원자적으로 쓰고 openWorkspace 로 다시 연다. 열리지 않으면 원래 글로 되돌리고 그 오류를 던진다.
+ * 4) 바꾼 글을 작품을 여는 길 그대로 본다 — openWorkspace 에 후보 글을 넘겨(검사 글 파일까지) 연다. 열리지 않으면 아무것도 쓰지 않는다(CONFIG_INVALID 등).
+ * 5) 원자적으로 쓰고 openWorkspace 로 다시 연다. 열리지 않으면(그 사이 다른 파일이 바뀐 경우) 원래 글로 되돌리고 그 오류를 던진다.
  * 열린 실행이 있어도 쓴다 — 실행기는 단계 digest 가 바뀐 것을 보고 검사부터 다시 돈다(core/run/sync.js).
  * @param {string} root
  * @param {{ packs: Map<string, any> }} options
@@ -115,8 +105,7 @@ export async function setStageMode(root, { packs }, request) {
     if (step.locked) throw new FolioError('STEP_LOCKED', `${stepId} is a locked step; it cannot be turned off or changed`, { level, stepId });
     if (!allowedModes(step).includes(mode)) throw new FolioError('STEP_MODE_INVALID', `${stepId} does not take ${mode}`, { level, stepId, modes: allowedModes(step) });
     const next = withStageMode(text, { level, stepId, mode, reason });
-    const errors = candidateErrors(next, { packs });
-    if (errors.length) throw new FolioError('CONFIG_INVALID', errors.map((e) => e.code).join(', '), { errors });
+    await openWorkspace(root, { packs, workYaml: next });
     const path = join(root, 'work.yaml');
     // 검증한 글을 쓰기 바로 전에 한 번 더 확인한다: 잠금 안이라도, 잠금 밖에서 work.yaml 을 손으로 고친
     // 경우를 놓치지 않기 위해서다(예: 다른 도구가 파일을 직접 덮어썼을 때).
````

- [ ] **Step 4: 통과·전체 확인**

Run: `node --test test/core/workspace-candidate.test.js && npm run check`
Expected: PASS, 테스트 966/966

- [ ] **Step 5: 커밋**

```bash
git add core/run/workspace.js core/store/work.js core/view/stage-toggle.js core/work/config.js test/core/workspace-candidate.test.js
git commit -m "$(cat <<'EOF'
feat(run): open a workspace from a candidate work.yaml before writing it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task C3: 실행 도중 손으로 고친 노드를 덮지 않는다

> 리뷰: **가장 강한 모델**(잠금·기록장·실행 경로). 공격해 볼 것:
> - 승인 대기 중 손수정이 덮이는 길이 남았는가: 승인, 고쳐 쓰기, 재시도, `folio_resume`, 커밋 도중 죽고 되살림, 가지의 자식 단계, 다시 커밋 실행, 실행 파일을 손으로 고쳐 `fileHash` 지우기(→ C0 전 실행으로 보고 점검을 건너뛴다: 한계로 적었다).
> - 점검이 잠긴 커밋(`committing` + 영수증)을 막아 영원히 못 끝내는 실행이 생기는가.
> - 파일이 원고와 같을 때(쓰다 죽음) 막히는가(막히면 안 된다).
> - `NODE_TEXT_CHANGED` 질문에 승인이 되는가, `request_revision`이 되는가(`REVISION_UNAVAILABLE`이어야 한다), `skip`은 파일을 그대로 두는가.
> - `CHANGED_DURING_RUN`이 닫힌 실행이나 다른 노드에 뜨는가.
> - 테스트 준비를 바꾼 `decisions-replay` r1이 assert를 약하게 했는가(옛 실행 모양 재현일 뿐 assert는 같다).

**Files:**
- Create: `core/run/text-guard.js`, `test/run/hand-edit-guard.test.js`
- Modify: `core/run/runner.js`, `core/run/steps/children.js`, `core/run/decide.js`, `core/status.js`, `skill/folio/SKILL.md`
- Test: `test/run/decisions-replay.test.js`(준비만: 옛 실행 모양)

**Interfaces:**
- 실행 파일에 `fileHash`(시작 때 노드 본문 sha256, 자식 단계가 본문을 쓴 뒤 새로 적음).
- `core/run/text-guard.js`: `nodeTextChanged(work, run)`, `commitLocked(ctx, run)`, `writesNodeBody(step)`, `textChangedQuestion(run, step)`, `runTextDrift(work, run)`.
- 질문 `{ kind: 'blocked', code: 'NODE_TEXT_CHANGED', canApprove: false, blocking: [{ checkId: 'commit', severity: 'hard', code: 'NODE_TEXT_CHANGED' }] }`. 다시 커밋 실행은 예전 `RECOMMIT_TEXT_CHANGED` 그대로.
- `folio_status.drift`에 `{ nodeId, code: 'CHANGED_DURING_RUN', runId }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/run/hand-edit-guard.test.js` (102줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRunner } from '../../core/run/runner.js';
import { createRunStore } from '../../core/run/run-store.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWork } from '../../core/store/work.js';
import { nodeFilePath } from '../../core/store/tree.js';
import { changeStructure } from '../../core/structure/locked.js';
import { workStatus } from '../../core/status.js';
import { sha256 } from '../../core/util/hash.js';
import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';

const packs = fakePacks();
const runner = (root) => createRunner({ root, packs });
async function serial() {
  const root = await copyFixture('serial-2level');
  await useFakePack(root);
  return root;
}
async function fileOf(root, id) {
  const node = (await openWork(root)).tree.nodes.get(id);
  return nodeFilePath(root, node);
}
async function handEdit(root, id, append) {
  const path = await fileOf(root, id);
  await writeFile(path, `${await readFile(path, 'utf8')}${append}`);
}
const commits = async (root, id) => (await openLedger(root, 'receipts').readAll()).filter((r) => r.type === 'commit' && r.nodeId === id);
const toApproval = (root, node, host = createFakeHost({ drafts: { [node]: '엔진 원고.\n' } })) => driveToEnd(() => runner(root), host, {
  start: { node }, until: (o) => o.status === 'needs_user' && o.question.kind === 'approve',
});

test('C0 (M5 finding): a hand edit to a first-commit node while approval is pending is never overwritten — the commit stops and asks for skip', async () => {
  const root = await serial();
  const gate = (await toApproval(root, 'ep-001')).at(-1);
  await handEdit(root, 'ep-001', '작가가 직접 쓴 문장.\n');
  const status = await workStatus(root, { packs });
  assert.deepEqual(status.drift, [{ nodeId: 'ep-001', code: 'CHANGED_DURING_RUN', runId: gate.runId }]);
  const out = await runner(root).decide({ runId: gate.runId, action: 'approve' });
  assert.deepEqual([out.status, out.question.code, out.question.canApprove], ['needs_user', 'NODE_TEXT_CHANGED', false]);
  assert.match(await readFile(await fileOf(root, 'ep-001'), 'utf8'), /작가가 직접 쓴 문장/);
  assert.deepEqual(await commits(root, 'ep-001'), []);
  await assert.rejects(runner(root).decide({ runId: out.runId, action: 'approve', reason: '덮어도 된다' }), { code: 'APPROVE_BLOCKED_BY_HARD' });
  await assert.rejects(runner(root).decide({ runId: out.runId, action: 'request_revision', feedback: '고쳐 줘' }), { code: 'REVISION_UNAVAILABLE' });
  assert.equal((await runner(root).decide({ runId: out.runId, action: 'skip', reason: '작가 글을 살린다' })).status, 'skipped');
  assert.match(await readFile(await fileOf(root, 'ep-001'), 'utf8'), /작가가 직접 쓴 문장/);
  assert.deepEqual((await workStatus(root, { packs })).drift, []);
});

test('C0: without a hand edit, or when the file already holds the run draft, the commit goes through as before', async () => {
  const root = await serial();
  const gate = (await toApproval(root, 'ep-001')).at(-1);
  const done = await runner(root).decide({ runId: gate.runId, action: 'approve' });
  assert.equal(done.status, 'done');
  const second = await serial();
  const waiting = (await toApproval(second, 'ep-001')).at(-1);
  const path = await fileOf(second, 'ep-001');
  const text = await readFile(path, 'utf8');
  await writeFile(path, `${text.slice(0, text.indexOf('---\n', 4) + 4)}엔진 원고.\n`);
  assert.equal((await runner(second).decide({ runId: waiting.runId, action: 'approve' })).status, 'done', 'the file already equals the draft: nothing is lost');
  assert.equal((await commits(second, 'ep-001')).length, 1);
});

test('C0: a hand edit to a branch plan while its approval is pending is not overwritten by the children step', async () => {
  const root = await serial();
  await changeStructure(root, { op: 'add', level: 'arc', id: 'arc-three', title: '셋째 아크' });
  const host = createFakeHost({ plans: { 'arc-three': '셋째 아크 계획.' }, children: { 'arc-three': [{ id: 'ep-007', title: '7화', brief: '시작' }] } });
  const gate = (await toApproval(root, 'arc-three', host)).at(-1);
  await handEdit(root, 'arc-three', '작가 메모: 이 아크는 짧게.\n');
  const out = await runner(root).decide({ runId: gate.runId, action: 'approve' });
  assert.deepEqual([out.status, out.question.code, out.question.stepId], ['needs_user', 'NODE_TEXT_CHANGED', 'children']);
  assert.match(await readFile(await fileOf(root, 'arc-three'), 'utf8'), /작가 메모/);
  assert.equal((await openWork(root)).tree.nodes.has('ep-007'), false, 'no children were made');
});

test('C0: after the children step writes the plan, the run guards against edits from that point, not from its start', async () => {
  const root = await serial();
  await changeStructure(root, { op: 'add', level: 'arc', id: 'arc-three', title: '셋째 아크' });
  const host = createFakeHost({ plans: { 'arc-three': '셋째 아크 계획.' }, children: { 'arc-three': [{ id: 'ep-007', title: '7화', brief: '시작' }] } });
  const trail = await driveToEnd(() => runner(root), host, { start: { node: 'arc-three' }, until: (o) => o.status === 'waiting_children' || (o.status === 'needs_model' && o.nodeId === 'ep-007') });
  const parent = (await createRunStore(root).list()).find((r) => r.nodeId === 'arc-three');
  assert.equal(parent.fileHash, sha256((await openWork(root)).tree.nodes.get('arc-three').body));
  assert.ok(trail.length > 0);
});

test('C0: a finished run revived by editing its run file still cannot overwrite the newer committed text', async () => {
  const root = await serial();
  const write = (text) => driveToEnd(() => runner(root), createFakeHost({ drafts: { 'ep-001': text } }), { start: { node: 'ep-001' }, until: (o) => o.status === 'done' });
  const a = (await write('OLD X\n')).at(-1);
  await write('NEW Y\n');
  const path = createRunStore(root).pathOf(a.runId);
  const run = JSON.parse(await readFile(path, 'utf8'));
  Object.assign(run, { state: 'active', pending: null, receipt: null });
  delete run.results.commit;
  await writeFile(path, JSON.stringify(run));
  const out = await runner(root).run({ node: 'ep-001' });
  assert.equal(out.question?.code, 'NODE_TEXT_CHANGED');
  assert.match(await readFile(await fileOf(root, 'ep-001'), 'utf8'), /NEW Y/);
  assert.equal((await commits(root, 'ep-001')).length, 2);
});
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/run/hand-edit-guard.test.js`
Expected: FAIL — 커밋이 손 글을 원고로 덮는다(`done`), `CHANGED_DURING_RUN`이 없다

- [ ] **Step 3: 구현**

`core/run/text-guard.js` (44줄):

````js
import { sha256 } from '../util/hash.js';
import { OPEN_STATES } from './run-store.js';
import { receiptRecorded } from './steps/common.js';
import { isRecommit, recommitTextChangedQuestion } from './recommit-plan.js';

/**
 * 엔진이 노드 파일 본문을 쓰기 직전(커밋, 가지의 자식 단계): 이 실행이 본 뒤로 작가가 파일을 손으로 고쳤는가.
 * - 실행은 시작할 때(보통·다시 커밋 모두) 본문 hash 를 fileHash 로 적고, 엔진이 본문을 쓸 때마다(자식 단계) 새로 적는다.
 * - 지금 본문이 엔진이 쓰려는 글(run.outputs.draft)과 같으면 잃을 것이 없으므로 바뀐 것으로 치지 않는다(쓰다 죽은 뒤 이어가기 포함).
 * - fileHash 가 없는 실행(C0 전에 연 실행)은 보지 않는다.
 * 이것이 참이면 러너는 쓰지 않고 멈춘다(승인 불가, 건너뛰기만) — 작가 글이 조용히 덮이지 않는다(M5 판정 기록 인계).
 * @param {{ tree: { nodes: Map<string, any> } }} work
 * @param {any} run
 */
export function nodeTextChanged(work, run) {
  if (typeof run?.fileHash !== 'string') return false;
  const node = work.tree.nodes.get(run.nodeId);
  if (!node) return true;
  return sha256(node.body) !== run.fileHash && node.body !== run.outputs?.draft;
}

/** 이미 잠긴 커밋(committing + 기록장에 영수증) — 잠금(커밋 원고 hash = 검사 원고 hash)대로 끝맺어야 하므로 이 점검을 건너뛴다. */
export const commitLocked = (ctx, run) => run.state === 'committing' && receiptRecorded(ctx.receiptRecords, run);

/** 엔진이 이 단계에서 노드 본문을 쓰는가: 커밋, 가지의 자식 단계(계획을 본문에 쓴다). */
export const writesNodeBody = (step) => step?.kind === 'commit' || (step?.kind === 'generate' && step.produces === 'children');

/** 파일이 바뀌었을 때 내는 질문: 승인 불가, 건너뛰기만. 다시 커밋 실행은 예전 질문(RECOMMIT_TEXT_CHANGED)을 그대로 낸다. */
export function textChangedQuestion(run, step) {
  if (isRecommit(run)) return recommitTextChangedQuestion(run, step);
  return {
    kind: 'blocked', code: 'NODE_TEXT_CHANGED', stepId: step.id, draft: run.outputs.draft ?? '', advisories: [], canApprove: false,
    blocking: [{
      checkId: 'commit', severity: 'hard', code: 'NODE_TEXT_CHANGED',
      message: 'the node file was edited by hand while this run was open; the engine will not overwrite it — skip this run (the file keeps the edit), then run the node again',
    }],
  };
}

/** folio_status drift 에 싣는 줄: 열린 실행의 노드 파일이 실행 도중 손으로 바뀌었다. */
export function runTextDrift(work, run) {
  if (!run || !OPEN_STATES.has(run.state) || !nodeTextChanged(work, run)) return [];
  return [{ nodeId: run.nodeId, code: 'CHANGED_DURING_RUN', runId: run.runId }];
}
````

`core/run/runner.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/run/runner.js b/core/run/runner.js
index 15eef54..559f1f7 100644
--- a/core/run/runner.js
+++ b/core/run/runner.js
@@ -21,7 +21,9 @@ import { withWorkLock } from './work-lock.js';
 import { assertChildrenDone, parkForChildren } from './children-guard.js';
 import { recheckStep } from './steps/recheck-step.js';
 import { RECHECK_MODE, isRecheck, newRecheckRun, pickNextRecheck, recheckSteps } from './recheck-plan.js';
-import { RECOMMIT_MODE, assertRecommitNeeded, isRecommit, newRecommitRun, recommitLocked, recommitTextChanged, recommitTextChangedQuestion } from './recommit-plan.js';
+import { RECOMMIT_MODE, assertRecommitNeeded, isRecommit, newRecommitRun, recommitLocked } from './recommit-plan.js';
+import { commitLocked, nodeTextChanged, textChangedQuestion, writesNodeBody } from './text-guard.js';
+import { sha256 } from '../util/hash.js';
 import { assertFeature } from '../work/features.js';
 import { recheckOfRun } from '../ledger/recheck.js';
 import { occurrenceStates, liveMarks } from '../occurrences/state.js';
@@ -68,10 +70,10 @@ export function createRunner({ root, packs, now = () => new Date().toISOString()
       syncPipeline({ run, ctx, steps, now, finished: isRecheck(run) && Boolean(recheckOfRun(ctx.receiptRecords, run.runId)) });
       const step = steps[run.cursor];
       if (!step) throw new FolioError('RUN_CURSOR_INVALID', `${run.runId} cursor ${run.cursor}`);
-      // 다시 커밋: 파일이 실행 도중 또 바뀌었으면 옛 글을 커밋하지 않는다(승인 불가, 건너뛰기만). committing 이어도
-      // 영수증이 아직 기록장에 없으면(예: 커밋이 죽었다 되살아난 경우) 이 점검을 건너뛰지 않는다.
-      if (step?.kind === 'commit' && !recommitLocked(ctx, run) && recommitTextChanged(ctx, run)) {
-        const outcome = awaitUser(run, recommitTextChangedQuestion(run, step));
+      // 노드 파일이 실행 도중 손으로 바뀌었으면 본문을 쓰는 단계(커밋·자식)에서 덮지 않는다(승인 불가, 건너뛰기만 — C0, 다시 커밋도 같다).
+      // committing 이어도 영수증이 아직 기록장에 없으면(예: 커밋이 죽었다 되살아난 경우) 이 점검을 건너뛰지 않는다.
+      if (writesNodeBody(step) && !commitLocked(ctx, run) && nodeTextChanged(ctx.work, run)) {
+        const outcome = awaitUser(run, textChangedQuestion(run, step));
         run.updatedAt = now();
         await runs.save(run);
         return outcome;
@@ -95,7 +97,7 @@ export function createRunner({ root, packs, now = () => new Date().toISOString()
       runId: newId('run'), nodeId: node.id, variant: 'main', nodeKind: node.kind, level: node.level,
       mode: node.kind === 'branch' && node.children.length > 0 ? 'derive' : 'open',
       pipelineDigest: pipeline.digest, checksDigest: checksDigestFor(ctx, ref), featuresDigest: ctx.featuresDigest, cursor: 0, state: 'active',
-      outputs: {}, draftHash: null, results: {}, attempts: 0, retries: {}, inbox: {}, pending: null,
+      outputs: {}, draftHash: null, fileHash: sha256(node.body), results: {}, attempts: 0, retries: {}, inbox: {}, pending: null,
       approval: null, overridden: [], receipt: null, checkPlan: checkPlanFor(ctx, pipeline), deactivated: [], createdAt: at, updatedAt: at, history: [],
     };
   }
````

`core/run/steps/children.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/run/steps/children.js b/core/run/steps/children.js
index 325acf6..845d43c 100644
--- a/core/run/steps/children.js
+++ b/core/run/steps/children.js
@@ -1,6 +1,7 @@
 import { FolioError } from '../../errors.js';
 import { levelIndex } from '../../work/config.js';
 import { updateNode } from '../../store/tree.js';
+import { sha256 } from '../../util/hash.js';
 import { openWork } from '../../store/work.js';
 import { addNode } from '../../structure/ops.js';
 import { parseJsonAnswer } from '../answers.js';
@@ -75,6 +76,8 @@ export async function childrenStep({ ctx, run, step, env }) {
   }
   await updateNode(env.root, node, { data: { status: 'planned' }, body: run.outputs.draft ?? '' });
   let work = await openWork(env.root);
+  // 엔진이 방금 쓴 본문이 이제 이 실행이 본 글이다(커밋 전 손수정 점검의 기준 — core/run/text-guard.js).
+  run.fileHash = sha256(work.tree.nodes.get(node.id)?.body ?? '');
   for (const child of run.outputs.children) {
     const existing = work.tree.nodes.get(child.id);
     if (existing && existing.parentId === node.id) continue; // 중간에 죽기 전에 이미 만든 자식
````

`core/run/decide.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/run/decide.js b/core/run/decide.js
index 8dbda2e..ab25dac 100644
--- a/core/run/decide.js
+++ b/core/run/decide.js
@@ -59,6 +59,8 @@ export function applyDecision(run, steps, { action, feedback = '', reason = '' }
     if (!String(feedback).trim()) throw new FolioError('FEEDBACK_REQUIRED', 'a revision request needs feedback');
     // 다시 커밋 중 파일이 바뀐 질문은 건너뛰기만 받는다. 고쳐 쓰기로 넘어가면 계획·초안 단계가 비어 실행이 멈춘다.
     if (question.code === 'RECOMMIT_TEXT_CHANGED') throw new FolioError('REVISION_UNAVAILABLE', 'the file changed during this recommit run; skip it and run recommit again');
+    // 보통 실행 중 노드 파일이 손으로 바뀐 질문도 건너뛰기만 받는다 — 고쳐 써도 커밋이 그 파일을 덮게 된다(C0).
+    if (question.code === 'NODE_TEXT_CHANGED') throw new FolioError('REVISION_UNAVAILABLE', 'the node file was edited during this run; skip it and run the node again');
     const revise = steps.find((s) => s.loop);
     if (!revise) throw new FolioError('REVISION_UNAVAILABLE', 'this pipeline has no revise step');
     records.push(decided());
````

`core/status.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/status.js b/core/status.js
index 5f139bb..379f3cb 100644
--- a/core/status.js
+++ b/core/status.js
@@ -11,6 +11,7 @@ import { OCCURRENCES_LEDGER } from './occurrences/records.js';
 import { occurrenceStates, staleOccurrences } from './occurrences/state.js';
 import { evidenceStatus } from './evidence/status.js';
 import { pendingFileTxStatus, TX_DIR } from './util/file-tx.js';
+import { runTextDrift } from './run/text-guard.js';

 /**
  * 지금 상태·다음 할 일·다시 확인 필요·손수정. 기록장이 깨졌으면 그것만 알린다.
@@ -45,9 +46,10 @@ export async function workStatus(root, { packs }) {
     recheck: pendingRechecks(stale),
     flagged: flaggedNodes(work, receiptRecords),
     // recommit 힌트(M4): 기능이 켜져 있으면 HAND_EDITED · COMMITTED_WITHOUT_RECORD 는 recommit 실행으로 다시 커밋할 수 있다는 뜻이다.
-    drift: detectDrift(work, receiptRecords).map((d) => (
+    // 열린 실행의 노드 파일이 실행 도중 손으로 바뀌었으면 CHANGED_DURING_RUN(C0) — 커밋은 그 파일을 덮지 않고 멈춘다.
+    drift: [...detectDrift(work, receiptRecords).map((d) => (
       work.config.features.recommit && (d.code === 'HAND_EDITED' || d.code === 'COMMITTED_WITHOUT_RECORD') ? { ...d, recommit: true } : d
-    )),
+    )), ...runTextDrift(work, open)],
     occurrences: await occurrencesStatus(root, work),
     // 근거 연결(N2): 본문이 바뀌어 다시 찾지 못한 주장. 등장 위치와 같은 모양, evidence 기능이 꺼지면 null.
     evidence: await evidenceStatus(root, work),
````

- [ ] **Step 4: 옛 실행 모양 테스트 준비**

`decisions-replay` r1은 커밋이 끝난 실행 파일을 되살려 `LOCK_RUN_ALREADY_COMMITTED`를 본다. 새 점검이 먼저 막으므로 준비에서 `fileHash`를 지워 C0 전 실행 모양을 재현한다. assert는 그대로다. C0 모양(되살린 실행)은 `hand-edit-guard.test.js` 마지막 테스트가 본다.

`test/run/decisions-replay.test.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/test/run/decisions-replay.test.js b/test/run/decisions-replay.test.js
index 78a2aa0..5ca3544 100644
--- a/test/run/decisions-replay.test.js
+++ b/test/run/decisions-replay.test.js
@@ -33,6 +33,8 @@ for (const mode of ['plain', 'refs']) {
     const bRun = await readRun(root, b.runId);
     await editRun(root, a.runId, (r) => {
       r.state = 'active'; r.pending = null; r.receipt = null; delete r.results.commit;
+      // C0 전 모양의 실행 파일(fileHash 없음)로 되살린다 — 손수정 점검(NODE_TEXT_CHANGED) 없이도 커밋 잠금이 막는지 본다.
+      delete r.fileHash;
       if (mode === 'refs') for (const k of Object.keys(r.results)) if (bRun.results[k]?.refs) r.results[k].refs = bRun.results[k].refs;
       r.createdAt = new Date().toISOString();
     });
````

- [ ] **Step 5: 문서**

`skill/folio/SKILL.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/skill/folio/SKILL.md b/skill/folio/SKILL.md
index f504980..f125570 100644
--- a/skill/folio/SKILL.md
+++ b/skill/folio/SKILL.md
@@ -47,6 +47,7 @@ description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재
 4. **이어서 하기**: 대화가 끊겼으면 `folio_status`의 `pending`이 떠 있는 질문이다. 거기서 이어간다.
    - `folio_status`의 `drift`에 `code: 'COMMITTED_WITHOUT_RECORD'`인 노드가 있으면: 앞머리는 커밋됨인데 커밋 기록이 없어 아직 확정되지 않은 노드다(커밋 도중 멈춘 실행을 버렸거나 앞머리를 손으로 고침). 작가에게 이렇게 설명하고 `folio_run { root, node: <그 nodeId> }`로 그 노드를 다시 돌린다. 그전까지 위 가지는 `CHILDREN_PENDING`으로 막힌다.
    - `folio_status`의 `warnings`에 `code: 'TX_INTERRUPTED'`가 있으면: 여러 파일을 한 번에 쓰던 작업(이름 바꾸기)이 중간에 끊겼다. `valid: true`면 다음 도구 호출이 알아서 되돌린다. `valid: false`면 엔진이 추측으로 되돌리지 않고 모든 쓰기를 막는다 — journal이 망가졌거나(`TX_JOURNAL_INVALID`), 끊긴 뒤 작가가 고친 파일이 있어 되돌리면 그 글을 덮어쓰게 되는 경우다(`TX_CONFLICT`, `details.paths`에 그 파일들). 작가에게 알리고, 작가가 파일을 `.folio/tx`의 백업과 비교해 확인한 뒤 `dir`(`.folio/tx`)을 손으로 지우게 한다. 호스트가 대신 고르거나 지우지 않는다([references/occurrences.md](references/occurrences.md)).
+   - `folio_status`의 `drift`에 `code: 'CHANGED_DURING_RUN'`인 노드가 있으면: 열린 실행이 기다리는 사이 그 노드 파일이 손으로 바뀌었다. 그 실행은 `NODE_TEXT_CHANGED`로 막히니 작가에게 알리고 `skip`을 받는다.
    - `folio_status`의 `drift`에 `recommit: true`가 있으면 작가에게 알리고, 작가가 원하면 `folio_run { root, node, mode: 'recommit' }`으로 지금 본문을 검사해 다시 커밋한다. `occurrences.stale`이 있으면 그 표면의 등장 위치를 다시 제출한다([references/occurrences.md](references/occurrences.md)). `evidence.stale`이 있으면 그 노드의 주장을 `folio_sources { op: 'link' }`로 다시 잇는다([references/sources.md](references/sources.md)).
 5. **단계 설정**: 레벨마다 단계를 켜고 끄는 법은 [references/steps.md](references/steps.md).
 6. **소설 검사**: 소설 세트(기본·웹소설 연재·문체 유지), 작가가 채우는 엔티티 필드, 추출 사건 모양은 [references/novel.md](references/novel.md).
@@ -85,6 +86,7 @@ description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재
 - `RECOMMIT_NOT_NEEDED`: 다시 커밋할 손수정이 없다. 그대로 알린다.
 - `RECHECK_TEXT_DRIFTED`: 재검사하려는 노드의 원고가 손으로 바뀌었다. 재검사가 아니라 `folio_run { root, node, mode: 'recommit' }`으로 지금 본문을 검사해 다시 커밋한다(`recommit`이 꺼져 있으면 작가에게 알린다).
 - `RECOMMIT_TEXT_CHANGED`: recommit 도중 본문이 또 바뀌었다. 승인할 수 없고 `skip`만 된다 — 건너뛰고 다시 `folio_run { mode: 'recommit' }`.
+- `NODE_TEXT_CHANGED`(질문 `blocking`): 실행 도중(작가 결정을 기다리는 사이) 노드 파일을 손으로 고쳤다. 승인·고쳐쓰기는 안 되고 `skip`만 된다 — 파일은 작가 글 그대로 남는다. 작가 글을 원고로 쓰려면 다음 실행의 원고 답에 그 글을 준다.
 - `OCCURRENCES_INVALID`: 제출한 등장 위치 중 하나라도 본문과 안 맞아 아무것도 기록되지 않았다. `details.errors`의 `index`마다 인용문을 고쳐 다시 낸다([references/occurrences.md](references/occurrences.md)).
 - `TX_FAILED`: 이름 바꾸기 쓰기 도중 실패했다. 파일은 하나도 바뀌지 않았다 — 다시 시도한다.
 - `EVIDENCE_INVALID`, `SOURCE_EXISTS`, `SOURCE_IMMUTABLE`, `SOURCE_PATH_INVALID`, `SOURCE_TOO_LARGE`, `SOURCE_SPAN_NOT_FOUND`, `SOURCE_NOT_FOUND`: [references/sources.md](references/sources.md)의 "오류일 때".
````

- [ ] **Step 6: 통과·전체 확인**

Run: `node --test test/run/ && npm run check`
Expected: PASS, 테스트 971/971

- [ ] **Step 7: 커밋**

```bash
git add core/run/decide.js core/run/runner.js core/run/steps/children.js core/run/text-guard.js core/status.js skill/folio/SKILL.md test/run/decisions-replay.test.js test/run/hand-edit-guard.test.js
git commit -m "$(cat <<'EOF'
feat(run): refuse to overwrite a node edited by hand during its run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

# Part D — 정리

### Task D1: CI 뷰어 단계, 범위 Set, 자료 하드 링크

> 리뷰: **가장 강한 모델**(범위, 자료 경로 — 최종 브랜치 리뷰에 합쳐도 된다). 공격해 볼 것:
> - Set으로 바꾼 뒤 `priorEvents`가 달라지는 입력(promiseScope 켬·끔, 선수 개념, 순서 없는 노드).
> - 하드 링크 거절이 정상 작품을 막는가(`git checkout`, `cp`, `folio_sources add`는 이름 하나). Windows에서 `nlink`가 1인가.
> - CI에서 뷰어 설치가 루트 `npm ci`와 섞이는가(`--prefix viewer`).

**Files:**
- Create: `test/core/source-hardlink.test.js`
- Modify: `.github/workflows/ci.yml`, `core/scope/scope.js`, `core/store/sources.js`, `skill/folio/references/sources.md`
- Test: `test/run/scope.test.js`

**Interfaces:** 공개 모양은 그대로다. 하드 링크 원본은 `SOURCE_FILE_INVALID`(기존 코드).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/core/source-hardlink.test.js` (25줄):

````js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { link, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSources } from '../../core/store/sources.js';
import { copyFixture, tempDir } from '../support/fixtures.js';

// C0: 하드 링크는 심볼릭 링크와 달리 O_NOFOLLOW 로 못 막는다. 이름이 둘 이상인 원본은 작품 밖 글과 같은 파일일 수 있어 거절한다.
test('readSources refuses a source original that is a hard link to a file out of the work', async () => {
  const root = await copyFixture('knowledge-book');
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'secret.txt'), '작품 밖 글, 새면 안 된다.');
  await link(join(outside, 'secret.txt'), join(root, 'sources', 'leaked.txt'));
  await writeFile(join(root, 'sources', 'leaked.yaml'), 'id: leaked\nfile: leaked.txt\n');
  const { sources, errors } = await readSources(root);
  assert.deepEqual(errors, [{ code: 'SOURCE_FILE_INVALID', id: 'leaked', file: 'leaked.txt' }]);
  assert.equal(sources.has('leaked'), false);
});

test('a source original with a single name still reads', async () => {
  const root = await copyFixture('knowledge-book');
  const { sources, errors } = await readSources(root);
  assert.deepEqual(errors, []);
  assert.ok(sources.get('cell-notes').text.length > 0);
});
````

`test/run/scope.test.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/test/run/scope.test.js b/test/run/scope.test.js
index 2e003ac..ab0f62d 100644
--- a/test/run/scope.test.js
+++ b/test/run/scope.test.js
@@ -8,6 +8,7 @@ import { activeEvents } from '../../core/ledger/events.js';
 import { gatherScope, entityRevAt } from '../../core/scope/scope.js';
 import { findStale } from '../../core/scope/stale.js';
 import { sha256 } from '../../core/util/hash.js';
+import { computePositions } from '../../core/store/position.js';
 import { copyFixture, seedEvents } from '../support/fixtures.js';

 async function seeded(name) {
@@ -63,6 +64,17 @@ test('off-order nodes gather no earlier events', async () => {
   assert.deepEqual(scope.priorEvents, []);
 });

+test('promiseScope on: an off-order node still gathers no earlier events, promise events included (C0)', async () => {
+  const { work, events } = await seeded('novel-3level');
+  const config = { ...work.config, order: { ...work.config.order, default: 'none', levels: {} } };
+  const unordered = { ...work, config, positions: computePositions(work.tree, config) };
+  assert.equal(unordered.config.features.promiseScope, true);
+  assert.ok(events.some((e) => e.kind.startsWith('promise.')));
+  const scope = gatherScope({ work: unordered, events, nodeId: 'funeral', draftText: work.tree.nodes.get('funeral').body });
+  assert.equal(scope.ordered, false);
+  assert.deepEqual(scope.priorEvents, []);
+});
+
 test('an entity rev at a node changes only when earlier events or the entity file change', async () => {
   const { root, seeds, work, events } = await seeded('novel-3level');
   const at = (evts, w = work) => entityRevAt({ work: w, events: evts, entityId: 'mara', nodeId: 'funeral' });
````

- [ ] **Step 2: 실패 확인**

Run: `node --test test/core/source-hardlink.test.js test/run/scope.test.js`
Expected: FAIL 1 — 하드 링크 원본을 읽는다. 범위 테스트는 지금도 통과한다(빈칸을 막는 고정 테스트).

- [ ] **Step 3: 구현**

`core/store/sources.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/store/sources.js b/core/store/sources.js
index 6cc08a3..8d5e115 100644
--- a/core/store/sources.js
+++ b/core/store/sources.js
@@ -40,7 +40,7 @@ function notRegularFileError() {
 }

 /**
- * 원본 파일을 링크를 따라가지 않고 연다(N2 결정 3, 링크를 따라가지 않는다). 심볼릭 링크나 보통 파일이 아니면
+ * 원본 파일을 링크를 따라가지 않고 연다(N2 결정 3, 링크를 따라가지 않는다). 심볼릭 링크·하드 링크(이름이 둘 이상)나 보통 파일이 아니면
  * `NOT_REGULAR_FILE`을 던진다 — `sources/x.txt -> /etc/hosts` 같은 링크로 작품 밖 글이 새지 않게 한다.
  * 열린 손잡이에서만 읽어(경로를 다시 찾지 않음) 검사와 읽기 사이 바꿔치기를 막는다.
  * @param {string} path
@@ -55,7 +55,8 @@ async function readOriginalFile(path) {
   }
   try {
     const stat = await handle.stat();
-    if (!stat.isFile()) throw notRegularFileError();
+    // 하드 링크(C0): 이름이 둘 이상인 파일은 작품 밖 글과 같은 파일일 수 있다. 심볼릭 링크처럼 거절한다.
+    if (!stat.isFile() || stat.nlink > 1) throw notRegularFileError();
     return await handle.readFile();
   } finally {
     await handle.close();
````

`core/scope/scope.js` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/core/scope/scope.js b/core/scope/scope.js
index bc39147..3c3b68d 100644
--- a/core/scope/scope.js
+++ b/core/scope/scope.js
@@ -49,8 +49,9 @@ export function gatherScope({ work, events, nodeId, draftText = '', extracted =
   const scopedIds = uniqueSorted([...entityIds, ...prerequisiteIds]);
   const before = eventsBefore({ events, positions: work.positions, nodeId });
   // 약속(M5 promiseScope): 이 노드에 안 나온 약속도 앞 사건만 싣는다(휴면 판정). entityIds·refs 는 넓히지 않는다 — 떡밥이 움직여도 다른 노드가 다시 확인 필요가 되지 않는다.
-  const promiseIds = work.config?.features?.promiseScope ? [...work.entities.values()].filter((e) => e.kind === PROMISE_KIND).map((e) => e.id) : [];
-  const priorEvents = before.events.filter((e) => scopedIds.includes(e.entityId) || promiseIds.includes(e.entityId));
+  const inScope = new Set(scopedIds);
+  if (work.config?.features?.promiseScope) for (const e of work.entities.values()) if (e.kind === PROMISE_KIND) inScope.add(e.id);
+  const priorEvents = before.events.filter((e) => inScope.has(e.entityId));
   const ancestors = ancestorsOf(work.tree, nodeId);
   const ancestorIds = new Set(ancestors.map((a) => a.id));
   const upperPlans = ancestors.filter((a) => a.body.trim())
````

`skill/folio/references/sources.md` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/skill/folio/references/sources.md b/skill/folio/references/sources.md
index 42125cf..19eed5c 100644
--- a/skill/folio/references/sources.md
+++ b/skill/folio/references/sources.md
@@ -52,4 +52,4 @@
 - `SOURCE_SPAN_NOT_FOUND`·`SOURCE_SPANS_INVALID`·`SOURCE_INPUT_INVALID`: 입력을 고쳐 다시 낸다. 아무것도 쓰이지 않았다.
 - `SOURCE_NOT_FOUND`·`SOURCES_ARGS_INVALID`: id나 인자를 확인한다.
 - `FEATURE_DISABLED`: 작가가 끈 기능이다. 켤지는 작가에게 묻는다.
-- `SOURCES_DIR_INVALID`·`SOURCE_FILE_INVALID`·`SOURCE_META_INVALID`: `sources/`가 링크거나, 원본이 링크거나, 설명서(yaml) 모양이 틀렸다. `openWork`가 `WORK_INVALID`로 던져 **작품 전체**가 열리지 않는다 — `features.sources: false`로도 풀리지 않는다. 작가에게 `sources/`를 보통 폴더·보통 파일로 고치라고 알린다.
+- `SOURCES_DIR_INVALID`·`SOURCE_FILE_INVALID`·`SOURCE_META_INVALID`: `sources/`가 링크거나, 원본이 링크(하드 링크 포함 — 이름이 둘 이상인 파일)거나, 설명서(yaml) 모양이 틀렸다. `openWork`가 `WORK_INVALID`로 던져 **작품 전체**가 열리지 않는다 — `features.sources: false`로도 풀리지 않는다. 작가에게 `sources/`를 보통 폴더·보통 파일로 고치라고 알린다.
````

`.github/workflows/ci.yml` — 아래 diff를 적용한다(`git apply`):

````diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 456e79c..13723f5 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -30,3 +30,6 @@ jobs:
           node-version: ${{ matrix.node }}
       - run: npm ci
       - run: npm run check
+      - run: npm --prefix viewer ci
+      - run: npm --prefix viewer test
+      - run: npm --prefix viewer run build
````

- [ ] **Step 4: 통과·전체 확인**

Run:
```bash
node --test test/core/source-hardlink.test.js test/run/scope.test.js
npm run check
npm --prefix viewer ci && npm --prefix viewer test && npm --prefix viewer run build
```
Expected: PASS, 테스트 974/974, 뷰어 테스트 6/6, 빌드 성공(`viewer/dist`는 `.gitignore`)

- [ ] **Step 5: 커밋**

```bash
git add .github/workflows/ci.yml core/scope/scope.js core/store/sources.js skill/folio/references/sources.md test/core/source-hardlink.test.js test/run/scope.test.js
git commit -m "$(cat <<'EOF'
chore: viewer steps in CI, one scope set, refuse hard-linked source originals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: 멈춤**

결과(태스크별 커밋과 테스트 수, 판정)를 보여 주고 멈춘다. main 병합·push·PR·정본 수정은 사용자에게 묻는다.

---

## 자기 점검

### 1. 설계 → 태스크

| 설계 항목 | 태스크 |
|---|---|
| 1 작품별 검사 설정, 모르는 필드 거부, hard·locked 약화 금지, 문서 | B1 |
| 2 `withCheckConfig`를 `core/pack`으로 | B1(작품 설정을 다시 묶는 데 필요) |
| 3 팩 digest가 도우미·사전 파일을 본다 | B2 |
| 4 약속 한 걸음, `foldPromise`는 엄격해지기만, 지난 노드 결과 | B3, 설계 요약 "잠금에 닿는 변화" |
| 5 `brand.figures` 추천 | B4 |
| 6 `readAssets` 재읽기·EISDIR·FIFO | C1 |
| 7 YAML 1.1, `isPlainObject` 9벌 | A1 |
| 8 파일인 root | A2 |
| 9 `INTERNAL_ERROR` 원문·긴 입력(M6a는 HTTP만 고쳤다) | A2 |
| 10 `openWorkspace` 메모리 설정 | C2 |
| 11 뷰어 기능 끄기 | C1 |
| 12 승인 대기 중 손수정 | C3 |
| 13 CI 뷰어 단계 | D1 |
| 14 `promiseIds` Set, 범위 테스트 빈칸, 자료 하드 링크 | D1(TOCTOU·중간 링크는 "뺀 것") |

빠진 것 없음.

### 2. 자리표시자 검사

계획 전체에서 `TBD`, `TODO`, `FIXME`, `implement later`, `Similar to Task`, "나중에 구현"을 찾았다. 없다. 새 파일은 모두 전체 파일("`경로` (N줄):")로, 고친 파일은 모두 `git diff`로 싣는다. 코드 블록은 시험 실행 커밋에서 스크립트로 뽑았다(손으로 옮겨 적지 않았다).

### 3. 이름 일관성

- A1의 `isPlainObject`를 B1(`check-config.js`, `known-check-spec.js`)이 같은 경로에서 쓴다.
- B1의 `withCheckConfig`를 B2가 팩 `index.js`에서 같은 이름으로 쓴다. 소설 팩은 다시 내보낸다.
- B3의 `stepPromise`는 `core/promise.js`와 `promise-flow.js`에서 같은 이름이다.
- C2의 `workYaml`은 `openWork`, `openWorkspace`, `setStageMode`에서 같은 이름이다(`loadWorkConfig`만 `text`).
- C3의 `fileHash`는 `runner.js`(새 실행), `children.js`(자식 단계), `recommit-plan.js`(기존 다시 커밋)에서 같은 필드다.
- 오류 코드: `YAML_INVALID`, `WORK_ROOT_INVALID`, `CHECK_*`, `HARD_CHECK_CONFIG_LOCKED`, `ASSET_FILE_NOT_REGULAR`, `NODE_TEXT_CHANGED`, `CHANGED_DURING_RUN`은 코드·테스트·문서에서 같은 철자다.

### 4. 계획 코드 시험 실행

시험 실행은 새 worktree(`f641366`에서 detach)에서 했다. 이 계획 문서를 스크립트로 읽어, 태스크 순서대로 "`경로` (N줄):" 블록은 새 파일로 쓰고(줄 수 단언) `diff` 블록은 `git apply`로 적용했다. 태스크마다 커밋하고 `npm run check`(lint, typecheck, 전체 테스트)를 돌렸다.

| 태스크 | 적용 블록 | `npm run check` | 테스트 |
|---|---|---|---|
| 시작(`f641366`) | — | 통과 | 937 |
| A1 | 11 | 통과 | 941 |
| A2 | 10 | 통과 | 944 |
| B1 | 16 | 통과 | 950 |
| B2 | 10 | 통과 | 953 |
| B3 | 3 | 통과 | 957 |
| B4 | 4 | 통과 | 959 |
| C1 | 8 | 통과 | 964 |
| C2 | 5 | 통과 | 966 |
| C3 | 8 | 통과 | 971 |
| D1 | 6 | 통과 | 974 |

- 끝 모습과 코드를 만든 scratch 최종본의 `git diff`는 비어 있다(트리가 같다).
- 바뀐 파일은 모두 어느 한 태스크에 속한다. 생성 스크립트가 "모든 바뀐 파일이 정확히 한 블록으로 실렸다"를 단언했다.
- D1의 뷰어 단계(`npm --prefix viewer ci`·`test`·`build`)는 코드를 만든 worktree에서 로컬로 돌렸다: 뷰어 테스트 6/6, 빌드 성공.
- 코드를 만들며 고친 것(계획에 반영됨): 타입 술어 JSDoc 고아 줄(A1), `{ __proto__: ... }` 입력을 받는 기존 features 테스트 때문에 `toString` 태그 기준(A1), 결정 4 뒤에 YAML 문법 오류가 `INTERNAL_ERROR`로 숨는 문제 → `YAML_INVALID`(A2), `decisions-replay` r1의 옛 실행 모양(C3).

### 5. 규칙 점검

- 파일 크기: 가장 큰 고친 코드 파일은 `core/run/runner.js` 212줄, `core/pack/yaml-schema.js` 206줄이다. 300줄 넘는 파일 없음.
- 추가만 한 곳: `features.js`는 끝에 `checkConfig`. 목록 테스트(`features.test.js`, `feature-toggles.test.js`)는 같은 태스크에서 고친다. 기존 assert는 약화하지 않았다. `tools.test.js`의 `INTERNAL_ERROR` 메시지 assert는 새 고정 메시지로 바꾸고, 원문이 `onError`로 가는지 더 본다.
- 잠금
  - hard·locked 검사는 작품 config를 받지 않는다(B1). `checkConfig: false`는 config를 거부할 뿐 잠금을 건드리지 않는다.
  - `foldPromise`의 hard 판정은 모든 4길이 순서에서 같다(B3).
  - 손수정 점검은 토글이 없고, 승인·고쳐 쓰기를 막기만 한다(C3). 잠긴 커밋은 점검하지 않는다.
  - `core.promise-order`는 어떤 세트·토글에서도 돈다(변경 없음).
- 의존성: 런타임 dependencies는 그대로(`yaml`, `@modelcontextprotocol/sdk`)다. `core/`와 `packs/`는 모델·네트워크를 부르지 않는다. `server/view`의 import 가드는 그대로 통과한다(`viewerStillOn`은 `core/view/index.js`로 내보낸다).
- 시험하지 못한 것: GitHub Actions CI(원격 없음)와 Node 22·26·Windows 행렬. 로컬은 macOS, Node v23.11.0 하나다. FIFO·권한 테스트는 win32에서 건너뛴다.
