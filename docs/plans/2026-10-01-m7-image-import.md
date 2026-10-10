# Folio M7 그림 팩과 vibelore 가져오기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** M7a — 그림 한 장을 설명서 → 생성 전 점검 → 생성(호스트) → 검토(모델, 자기검토 표기) → 승인 → 영수증·커밋 순서로 만드는 그림 팩과 `folio_image` 도구. M7b — vibelore 작품 폴더를 읽기만 해서 새 Folio 작품으로 가져오는 `folio_import_vibelore`. 가져온 노드는 `imported`이고 "검사 통과"로 보이지 않는다.

**Architecture:**
- M7a는 노드 실행기(`core/run/runner.js`)를 **건드리지 않는다.** 그림 실행은 따로 도는 단위다(`core/image/*`). 실행 파일은 `.folio/image-runs/`, 기록은 새 기록장 `assets`(`.folio/ledger/assets.jsonl`). 작업 잠금(`withWorkLock`)과 모델 요청 묶기(`requestModel`·`takeAnswer`)는 노드 실행과 같은 것을 쓴다.
- 그림 stage 검사(`image-precheck`·`image-review`)는 보통 검사 세트로 고르고, 노드 파이프라인 배치(`checkPlacement`)에서는 건너뛴다(`core/pipeline/resolve.js` 한 줄). 그림을 본문에 놓는 것은 작가가 `![[asset:id]]`를 넣고 `folio_run mode: recommit` — 그림 커밋은 `assets/`만 쓴다.
- M7b는 원본을 읽는 모듈(`core/import/read-source.js`), 순수 매핑(`map-source.js`), 새 작품을 옆 임시 폴더에 다 쓰고 이름을 바꿔 들이는 쓰기(`import-work.js`)로 나눈다. 가져오기 기록은 영수증 기록장의 `type: import`이고 커밋 기록이 아니다. 코어 변경은 `core/run/done.js`(가져온 노드는 끝남), `core/run/recommit-plan.js`(가져온 노드는 recommit 가능), `core/view/receipt-view.js`(`imported` 필드) 셋이다.

**Tech Stack:** Node ESM + JSDoc, `node:test`, `yaml`, `@modelcontextprotocol/sdk`(1.x, stdio), ESLint 9 + TypeScript(`checkJs`).

**Spec:** 이 계획의 "설계 요약"과 "결정" 표가 설계다(계획 세션 2026-10-01, 사용자 부재 — 모든 결정은 "추천 채택(사용자 확인 필요)"). 별도 spec 파일은 없다.
- 설계 정본: 아티팩트 https://claude.ai/artifact/WjJzcsjnQZnVxyyJZaxvcX §07 그림 두는 두 방법, §14 그림 팩, §18 가져오기, §20 M7.
- 범위와 순서: `docs/plans/2026-09-28-roadmap-parallel.md`(핫스팟, 병합 순서 J3: M6b → M7a → N6, J4: M7b → N7), `docs/plans/2026-09-28-roadmap-lanes-late.md` L6, `docs/plans/2026-09-28-roadmap-lanes-early.md` 공통 블록.
- 계속 유효한 판정: N3·N4·C0·M5·M6 판정 기록(`docs/plans/2026-09-30-*-rulings.md`, `2026-09-29-m5-parity-rulings.md`). 특히 M6 A7 minor(그림 파일 크기 상한 없음)는 이 계획 밖이다.

## 현재 상태 (이 계획을 시작하는 시점)

새 세션이 이전 대화 없이 이어받을 수 있게 적는다.

- **worktree·브랜치:** `/path/to/folio-worktrees/m7`, 브랜치 `feat/m7a-image`(main `c8223aa`에서 만듦: S, M5, N5, M6a, C0, N3, N4 포함). M7b는 M7a 병합 뒤 `feat/m7b-import`로 새로 딴다.
- **시작 시 테스트:** `npm ci` 후 `npm run check` 1069/1069.
- **메인 체크아웃 금지:** `/path/to/folio`(`feat/n3-blocks`)는 건드리지 않는다. `/path/to/folio-worktrees/m6`(M6b 실행 중), `n6`·`n6-scratch`(N6)도 건드리지 않는다.
- **병합·push 없음.** 계획 문서만 커밋했다.
- **runner.js:** M7a·M7b 모두 `core/run/runner.js`를 건드리지 않는다(결정 1). M7a가 건드리는 공유 코어 파일은 `core/work/features.js`(끝에 추가), `core/pipeline/resolve.js`(한 줄), `core/store/assets.js`(M7 소유), `packs/index.js`(끝에 추가)다.
- **병합 순서와 겹침**
  - J3: M6b → M7a → N6. M6b가 features 끝(`linkScope` 뒤)에 `viewerExport`를 더한다. M7a를 그 뒤에 rebase하면 `images`·`imageReferences`·`imageReview`는 **`viewerExport` 뒤**에 둔다. 그때 A1의 테스트 기대값 목록에도 `viewerExport` 값을 같은 자리에 넣는다(목록 끝 순서 = FEATURES 키 순서).
  - J4: M7b → N7. M7b는 N6이 소유한 `core/run/recommit-plan.js`(한 줄)와 `core/run/done.js`를 건드린다. N6 병합 **뒤에** 시작하고, N6이 이 두 파일을 판본별로 바꿨으면 같은 뜻(가져온 노드: 끝남, recommit 가능)을 그 판본 규칙 위에 다시 적는다. 그때는 멈추고 판정 기록에 적는다.
- **계획 코드 시험:** 이 계획의 코드는 scratch worktree(`c8223aa`에서 detach)에서 태스크 순서대로 모두 돌렸다. 각 태스크 뒤 `npm run check` 수는 "계획 시험 실행" 절에 있다. 태스크 순서대로 적용하면 같은 결과가 나와야 한다(M6b·N6 병합 뒤라면 그만큼 더해진다).
- **진행 기록:** 태스크를 마칠 때마다 아래 "진행" 줄에 커밋 범위와 테스트 수를 적는다. 판정은 `docs/plans/2026-10-01-m7-image-import-rulings.md`에 모은다(A8·B5의 마지막 단계).

사용자 승인: 중단 전 “묻지 말고 끝까지” 지시로 추천 결정 19건을 모두 승인했다.

진행:
- M7a A1~A8 완료(2026-10-02): `c8223aa..e7ccff5`. Node24 루트 검사 1136/1136, 그림 집중 62/62, MCP 수용 2/2 통과. 독립 최종 검토·단일 수정·재검토 승인. 기록은 `docs/plans/2026-10-01-m7a-image-rulings.md`에 보존. 당시 M7b는 미착수였으며 M7a는 이후 J3에서 main에 병합됐다.
- M7b B1~B5 완료(2026-10-02, 기반 main `f12c66b`, `codex/m7b-import`, 실행 소스 `c83b2f3`). 태스크별 독립 검토와 최종 단일 수정·범위 재검토 명세 PASS·품질 Approved. Node24 lint·typecheck·전체 1279/1279, MCP 포함 집중 23/23 통과. 합성 원본 hash 불변, 1~4화 본문·1화 SVG 둘·가져옴 표시와 검사 전 커밋 기록 없음 확인. 실제 작품·Windows·원격 CI는 미검증. 사용자 메뉴 1 승인으로 로컬 main에 병합했고 통합 후에도 전체 1279/1279 통과. push·PR은 하지 않았으며 기록은 `docs/plans/2026-10-02-m7b-import-rulings.md`에 보존한다.

### 모듈 지도 (이 계획이 건드리는 것)

| 파일 | 하는 일 |
|---|---|
| `core/work/features.js` | `FEATURES`·`FEATURE_PARENTS`. A1이 `images`, `imageReferences`, `imageReview`를 끝에 더한다. `RUN_FEATURES`에는 넣지 않는다 |
| `core/pipeline/resolve.js` | `checkPlacement`가 검사 stage가 레벨 파이프라인에 있는지 본다(`CHECK_STAGE_MISSING`). A4가 그림 stage를 건너뛰게 한다 |
| `core/store/assets.js` | `readAssets`, `assetRefsInBody`(이미 있음). A3이 `assertAssetsDirSafe`, `ASSET_WRITE_NAME`, `writeAssetOnce`를 더한다 |
| `core/image/*`(새) | 그림 실행: 설명서(`brief.js`), 기준 그림(`references.js`), 호스트 그림 읽기(`intake.js`), stage 이름(`stages.js`), 실행 파일(`run-store.js`), 설정 digest(`context.js`), 요청(`requests.js`), 단계(`steps.js`), 결정(`decide.js`), 실행기(`runner.js`), 영수증(`receipt.js`), 커밋(`commit.js`) |
| `packs/image/*` | 둘째 팩(단계 없음). 검사 여섯, 세트 둘(`image.basic`, `image.placement`) |
| `packs/index.js` | 내장 팩 목록 끝에 `image` |
| `server/tools/image.js`(새), `definitions.js`, `handlers.js` | `folio_image`(A7), `folio_import_vibelore`(B4) — 도구 목록 끝에 |
| `core/import/*`(새) | vibelore 읽기(`read-source.js`), 매핑(`map-source.js`), 가져오기 기록(`records.js`), 쓰기(`import-work.js`) |
| `core/run/done.js` | `doneNodes` — B3이 가져온 노드(앞머리 `imported` + 가져오기 기록)를 끝남에 넣는다 |
| `core/run/recommit-plan.js` | `assertRecommitNeeded` — B3이 가져온 노드를 recommit 대상으로 받는다 |
| `core/view/receipt-view.js` | B3이 목록·노드 영수증에 `imported` 필드를 더한다(UI는 이 계획 밖) |
| `skill/folio/references/{image,import}.md` | 호스트 안내 |

이미 있는 것(바꾸지 않음): `core/store/tree.js`의 `NODE_STATUSES`에 `imported`가 있고, 뷰어 `viewer/src/components/Status.jsx`는 `imported`를 "가져옴"으로 보인다. 뷰어 서버는 그림 파일을 `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`로 내준다(SVG 스크립트가 돌지 않는다). 노드 앞머리 `assets`는 뷰어 노드 화면의 `assets.attached`로, 본문 `![[asset:id]]`는 `assets.inline`으로 나온다.

## 설계 요약

### 그림 실행 단위 (M7a) — 세 가지 중 B

| 안 | 내용 | 판단 |
|---|---|---|
| A | 노드 파이프라인 안의 그림 단계(생성·검사 단계에 그림 종류를 더함) | `generate.js`·`commit*.js`·`runner.js`를 건드린다. N6 핫스팟과 겹치고, 노드 영수증 모양이 바뀐다. 버림 |
| B | 그림 설명서 단위의 별도 실행(`core/image/*`, 자기 실행 파일·기록장) | 코어 핫스팟을 건드리지 않는다. 잠금은 그림 영수증에서 따로 성립한다. **채택** |
| C | 노드 실행기에 새 mode(`image`) | `runner.js`를 건드린다(N6 소유). 버림 |

그림 한 장의 단계는 코어가 정한다: `brief`(generate) → `precheck`(check, stage `image-precheck`) → `generate`(호스트가 그린 파일 경로) → `review`(model check, stage `image-review`) → `approve`(사람) → `commit`.

- **설명서**(`brief.js`): `mustShow`, `mustNotShow`, `entities`(작품 엔티티 id), `continuity`, `dialogue`(`{ speaker, text }`), `reference`(기준 그림이면 true). 모르는 필드·엔티티는 다시 묻는다(세 번 뒤 `image_blocked`).
- **기준 그림**(`references.js`): 설명서 엔티티마다 그 엔티티가 나온 그림(`reference: true` 먼저), 엔티티당 셋까지, 파일이 실제로 있는 것만. 생성·검토 요청에 절대 경로로 싣는다(`imageReferences`).
- **그림 받기**(`intake.js`): 호스트가 답한 절대 경로의 파일을 읽기만 한다. 링크를 따라가지 않고(O_NOFOLLOW), 보통 파일, 20MiB까지, 첫 바이트로 png·jpg·gif·webp만. 바이트는 실행 폴더로 옮겨(`image-<n>.<ext>`) 그 hash가 이후 모든 단계의 기준이다.
- **검토**(`review`): 모델 검사(`buildModelCheckRequest`·`parseModelCheckAnswer`)를 그대로 쓴다 — 검토자는 언제나 `{ sameHost: true, independent: false }`. `imageReview`가 꺼지면 `skipped`와 이유·출처를 남긴다. 옮긴 그림이 손으로 바뀌었으면 검토하지 않고 생성부터 다시.
- **승인**: 막는 지적(block)은 이유가 있어야 넘고, hard는 넘지 못한다. 고쳐 달라는 요청은 설명서·그림 각각 세 번까지.
- **커밋**(`commit.js`): 실행 파일은 믿지 않는다. 옮긴 바이트를 다시 hash하고, 점검·검토·승인 결과가 `assets` 기록장의 마지막 `image_result` digest와 같은지 본다. 영수증(`asset_receipt`)을 먼저 남기고 `assets/<id>.<ext>`, `assets/<id>.yaml`을 한 번만 쓴 뒤 `asset_commit`. 끊기면 `resume`이 같은 영수증으로 끝맺는다.

### 가져오기 (M7b)

| vibelore | Folio |
|---|---|
| `chapters/<n>.md` | 회차 `ep-<n>`(세 자리), 제목: 회차 앞머리 → 아크 계획 회차 제목 → `<n>화` |
| `.vibelore/arcs/<n>.json`(`status: rejected`·`rejectedAt` 제외) | 아크 `arc-<n>`, 본문 = 약속(promise). 한 회차는 처음 적은 아크에. 아크에 없는 회차는 `arc-imported` |
| `characters/*.md` | 인물 엔티티(이름·별칭·성별·역할 + 본문) |
| `world/*.md` | `world` 엔티티 |
| `webtoon/episodes/<회차>-<id>/episode.svg` | 그림 `ep-<n>-webtoon[-k]`, 회차 앞머리 `assets` |
| `.vibelore/check-receipts/*.json` | 판정은 읽어 들이지 않는다. 그 회차 가져오기 기록에 파일 경로·hash만 |

- 작품: 프리셋 `serial`, 팩 `[novel, image]`, 검사 세트는 프리셋 그대로.
- 노드는 모두 `status: imported`. 영수증 기록장에 노드마다 `{ type: 'import', importId, nodeId, status: 'imported', importedHash, origin }` — `lastCommits`는 이것을 세지 않는다. Folio 검사는 노드마다 recommit으로 받는다.

### 결정 (모두 추천 채택 — 사용자 확인 필요)

| # | 물음 | 채택 | 상태 |
|---|---|---|---|
| 1 | 그림 실행을 어디에 두나 | B: 별도 그림 실행(`core/image/*`), `runner.js` 무변경 | 추천 채택(사용자 확인 필요) |
| 2 | 그림 stage 검사를 어떻게 고르나 | 보통 `checkSets`로 고르고 노드 `checkPlacement`에서만 건너뜀 | 추천 채택(사용자 확인 필요) |
| 3 | 그림을 본문에 어떻게 놓나 | 작가가 `![[asset:id]]`를 넣고 recommit. 그림 커밋은 노드 파일을 쓰지 않음 | 추천 채택(사용자 확인 필요) |
| 4 | 그림 바이트를 어떻게 받나 | 호스트가 그린 로컬 파일의 절대 경로를 답하고 엔진은 읽기만. png·jpg·gif·webp, 20MiB. SVG 생성은 받지 않음(가져오기만 SVG) | 추천 채택(사용자 확인 필요) |
| 5 | 그림 검토의 표기 | 언제나 `sameHost: true, independent: false`. 영수증 검증이 `independent: true`를 `SELF_REVIEW_MISLABELED`로 거부 | 추천 채택(사용자 확인 필요) |
| 6 | 기능 토글 | `images`(부모), `imageReferences`, `imageReview`(자식). `RUN_FEATURES` 밖 — 그림 실행이 자기 digest(`imageSpecDigest`)로 묶음 | 추천 채택(사용자 확인 필요) |
| 7 | 그림 기록을 어디에 | 새 기록장 `assets`(결과·결정·영수증·커밋) | 추천 채택(사용자 확인 필요) |
| 8 | 그림 실행 동시성 | 작품에 열린 그림 실행 하나(`IMAGE_RUN_IN_PROGRESS`), 노드 실행과 같은 작업 잠금 | 추천 채택(사용자 확인 필요) |
| 9 | 읽을 수 없는 답·수정 요청 한도 | 답은 세 번 뒤 `image_blocked`(skip만), 수정 요청은 설명서·그림 각각 3번(`MAX_LOOP`) | 추천 채택(사용자 확인 필요) |
| 10 | 커밋 잠금이 실패하면 | 아무것도 쓰지 않고 `LOCK_*` 오류. 실행은 `active`로 남고 `skip`만 받는다 | 추천 채택(사용자 확인 필요) |
| 11 | 가져오기 대상 폴더 | `root`는 아직 없어야 함. 옆 숨김 임시 폴더에 다 쓰고 작품이 열리면 이름을 바꿔 들임. 원본 안이면 거부 | 추천 채택(사용자 확인 필요) |
| 12 | 가져온 영수증 | `type: import`, `status: imported`, 판정 없음. vibelore 검사 영수증은 경로·hash만 | 추천 채택(사용자 확인 필요) |
| 13 | 가져온 노드의 끝남 | 앞머리 `imported` + 가져오기 기록이면 끝남(다음 노드로 다시 고르지 않음). recommit은 손수정 없이도 받음 | 추천 채택(사용자 확인 필요) |
| 14 | 버린 아크·빈 아크·한 회차 두 아크·그림 폴더 여럿 | 버린 아크는 빼고, 빈 아크는 경고, 첫 아크가 가짐, 그림은 모두 가져오고 경고 | 추천 채택(사용자 확인 필요) |
| 15 | 인물 앞머리 | 이름·별칭·성별·역할만(그 밖 vibelore 계약 필드는 버림) | 추천 채택(사용자 확인 필요) |
| 16 | 가져오기 기능 토글 | 없음. 작품이 생기기 전 도구라 `work.yaml`이 없다. 도구 호출 자체가 작가의 선택 | 추천 채택(사용자 확인 필요) |
| 17 | 가져온 작품의 검사 세트 | 프리셋 그대로. `image.basic`은 `folio_config`가 추천만 | 추천 채택(사용자 확인 필요) |
| 18 | 모듈 이름 | import 경로에 `vibelore`를 쓰지 않음(`test/core/parity-isolation.test.js`가 테스트의 그런 import를 막는다 — 가드를 약화하지 않는다) | 추천 채택(사용자 확인 필요) |
| 19 | 서버 가드(BANNED) | `core/store/assets.js`, `core/image/commit.js`를 더함. 가져오기는 쓰기 입구(`importVibelore`)를 서버가 직접 부르므로 더하지 않음 | 추천 채택(사용자 확인 필요) |

## Global Constraints

- 이름 `Folio`, MCP 도구 접두어 `folio_`, 작품 내부 폴더 `.folio/`.
- `package.json` `"engines": { "node": "^22.13.0 || ^24.0.0 || ^26.0.0" }`, `"type": "module"`. 런타임 의존성은 `yaml`과 `@modelcontextprotocol/sdk` 둘뿐이다. 늘리지 않는다.
- 엔진은 모델을 부르지 않는다. `core/`와 `packs/`는 모델·네트워크를 부르지 않고 동적 `import()`도 쓰지 않는다. 그림을 그리는 것은 호스트다.
- 잠금 규칙은 설정·팩·세트·기능 토글 어느 것으로도 끌 수 없다.
  - 커밋 원고 hash = 검사 원고 hash (그림: 커밋 바이트 hash = 검토·승인한 그림 hash)
  - 영수증 없이 커밋 금지 (그림: `asset_receipt` 없이 `assets/` 쓰기 금지)
  - hard 차단
  - 기록장은 추가만
  - 같은 호스트 자기검토를 독립 평가로 표기 금지
  - soft·참고 의견은 자동 수정 사유 아님 (그림을 저절로 다시 그리지 않음)
  - `core.promise-order`는 어떤 세트·토글에서도 돈다
- 가져온 영수증은 `imported`다. "검사 통과"로 보이게 하지 않는다. vibelore 판정을 옮기지 않는다.
- 새 검사는 `experimental: true`, `severity: advisory`. 작가만 block으로 올린다(hard 불가).
- 검사 세트는 작가가 고른다(추천만). 새 기능은 `work.yaml` `features`로 켜고 끈다.
- 도구 목록, features, 팩 목록, 가드 목록은 끝에만 추가한다. 목록 테스트는 같은 커밋에서 고친다. 기존 assert는 약화하지 않는다.
- 테스트 데이터는 전부 합성이다. 원본 fixture는 고치지 않는다. 새 fixture는 `test/fixtures/vibelore-work/`(vibelore 모양 합성)뿐이다. `/path/to/vibelore`는 읽기 전용이고 그 안의 실제 작품은 읽지도 커밋하지도 않는다.
- 파일 하나에 한 책임. 300줄을 넘기면 나눈다.
- 문서·주석 설명은 한국어, 코드 식별자는 영어. 커밋 메시지는 영어 Conventional Commits이고 끝에 정확히 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `.superpowers/`는 커밋하지 않는다. 각 태스크는 자기 파일만 커밋한다.
- TDD: 실패하는 테스트 → 실패 확인 → 구현 → 통과 → `npm run check` 전부 초록 → 커밋. 전체 검사는 머신 부하에 따라 몇 분 걸린다. 백그라운드로 돌렸다면 무한정 기다리지 않는다 — 15분이 넘으면 멈추고 원인을 본다.
- 리뷰
  - 가장 강한 리뷰어 모델("공격해 볼 것" 표시): A3, A5, A6, B1, B3
  - 보통 모델: A1, A2, A4, A7, A8, B2, B4, B5
- 마일스톤 정지: A8(M7a 완료 기준) 뒤 멈추고 결과를 보인다. B5(M7b 완료 기준) 뒤 다시 멈춘다. main 병합·push·PR·정본 수정은 사용자에게 묻는다(완료 레인 자동 ff 병합 규칙이 있으면 그 규칙을 따른다).

## 공격 목록 (리뷰어가 시도할 것)

1. **잠금을 설정으로 끄기**
   - `features: { imageReview: false }` → 검토가 `skipped`로 남고 이유·출처(`work.yaml#features.imageReview`)가 영수증에 있는가. 승인·영수증·hash 잠금은 그대로인가.
   - `checks: { image.review: { severity: hard } }`처럼 팩 밖에서 hard를 만들 수 없는가(기존 규칙).
   - 설정을 질문 뒤 바꾸면 옛 답을 받지 않고 다시 묻는가(`imageSpecDigest`).
2. **작품 밖 경로 — 그림 쓰기·읽기**
   - `assets`가 링크면 `ASSETS_DIR_INVALID`. 쓰는 이름은 `ASSET_WRITE_NAME`만(경로 조각·숨김 이름 불가). 같은 이름의 다른 파일은 덮지 않음(`ASSET_IMMUTABLE`, link 배타 쓰기).
   - 실행 id·옮긴 그림 이름은 정규식으로만(`IMAGE_RUN_ID_INVALID`), 실행 폴더 밖 경로를 만들 수 없다.
   - 호스트 그림 경로: 상대 경로·NUL·링크·FIFO·폴더·20MiB 초과·그림이 아닌 바이트 → 다시 묻기. 원본 파일은 읽기만.
3. **작품 밖 경로 — 가져오기**
   - `from`이 링크·파일이면 거부. 그 안의 폴더 링크·파일 링크·FIFO·이름 규칙 밖·큰 파일은 열지 않고 경고.
   - `root`가 `from` 안(링크 경유 포함, realpath 비교)이면 거부. `root`가 이미 있으면 거부. 실패하면 임시 폴더를 지우고 `root`를 만들지 않는다.
   - 원본 폴더 바이트가 가져오기 전후 같다(테스트가 hash 전부를 비교).
4. **영수증 위조**
   - 실행 파일을 손으로 고침(지적 지우기, `independent: true`, 검토를 skipped로 바꾸기, 승인 지어내기) → `LOCK_LEDGER_MISMATCH`, 아무것도 쓰지 않음.
   - 승인 뒤 옮긴 그림을 바꿈 → `LOCK_IMAGE_HASH_MISMATCH`.
   - 영수증 검증: 예약 필드, 단계 목록·차례, 건너뛴 단계 이유, 단계 hash = 영수증 hash, 승인 없음, 알 수 없는 severity.
   - 가져오기 기록이 커밋으로 세어지지 않는가(`lastCommits`). 앞머리만 `committed`로 바꾸면 `COMMITTED_WITHOUT_RECORD`. 앞머리만 `imported`로 바꾸면(기록 없음) 끝나지 않은 노드로 다시 골라진다.
   - vibelore 판정(`verdict`)이 기록·결과 어디에도 들어오지 않는가. 가져오기 기록은 새 작품을 만들 때만 쓰인다(기존 작품의 기록장에 쓰는 길이 없다).

## 파일 구조

M7a
- Create: `core/image/{brief,references,intake,stages,run-store,context,requests,steps,decide,runner,receipt,commit}.js`
- Create: `packs/image/{pack.yaml,index.js,checks/review.md,checkers/{index,asset-refs,dialogue-in-text,entities-in-node,references-present,show-conflict}.js}`
- Create: `server/tools/image.js`, `skill/folio/references/image.md`
- Modify: `core/work/features.js`, `core/pipeline/resolve.js`, `core/store/assets.js`, `packs/index.js`, `packs/image/README.md`, `server/tools/{definitions,handlers}.js`, `skill/folio/SKILL.md`
- Test: `test/image/*.test.js`, `test/pack/image-pack.test.js`, `test/server/image-tool.test.js`, `test/acceptance/m7a.test.js`, `test/support/{images,image-work}.js`, 목록 테스트 고침

M7b
- Create: `core/import/{read-source,map-source,records,import-work}.js`, `skill/folio/references/import.md`, `test/fixtures/vibelore-work/**`
- Modify: `core/run/done.js`, `core/run/recommit-plan.js`, `core/view/receipt-view.js`, `server/tools/{definitions,handlers}.js`, `skill/folio/SKILL.md`
- Test: `test/import/*.test.js`, `test/server/import-tool.test.js`, `test/acceptance/m7b.test.js`, `test/support/import-source.js`, 목록 테스트 고침

---

# M7a 그림 팩

### Task A1: 기능 `images`, `imageReferences`, `imageReview`

**Files:**
- Modify: `core/work/features.js`
- Modify (테스트): `test/core/features.test.js`, `test/server/feature-toggles.test.js`

**Interfaces:**
- Produces: `FEATURES.images = true`, `FEATURES.imageReferences = true`, `FEATURES.imageReview = true`(끝에, 이 순서). `FEATURE_PARENTS.imageReferences = 'images'`, `FEATURE_PARENTS.imageReview = 'images'`. `RUN_FEATURES`·`featuresDigest`는 그대로.

- [ ] **Step 1: 실패하는 테스트 작성**

N4의 "마지막 두 키" assert는 `links` 위치 기준으로 바꾼다(같은 것을 본다 — 약화 아님). 새 테스트가 마지막 세 키를 본다.

`test/core/features.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/core/features.test.js b/test/core/features.test.js
index fc533ff..cb280e8 100644
--- a/test/core/features.test.js
+++ b/test/core/features.test.js
@@ -17,6 +17,7 @@ test('features default to the documented values and every key is always present'
   assert.deepEqual(config.features, {
     occurrences: true, occurrencesInExtract: true, occurrenceScope: false, rename: true, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
     viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true,
+    images: true, imageReferences: true, imageReview: true,
   });
   assert.deepEqual(config.features, FEATURES);
   assert.ok(Object.isFrozen(FEATURES));
@@ -33,7 +34,8 @@ test('features accept known booleans and reject unknown keys, non-booleans and e
   assert.deepEqual(codes({ occurrences: false }), []);
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false } }).config.features,
     { occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true, promiseScope: true,
-      viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true });
+      viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true,
+      images: true, imageReferences: true, imageReview: true });
   assert.deepEqual(validateWorkConfig({ ...base, features: { occurrences: false, rename: true } }).errors,
     [{ code: 'FEATURE_REQUIRES', feature: 'rename', requires: 'occurrences' }]);
   const detail = validateWorkConfig({ ...base, features: { occurrences: false, occurrencesInExtract: false, rename: false } }).errors;
@@ -115,7 +117,7 @@ test('N3 features: blocks, bibliography and termIndex are on by default, appende

 test('N4 features: links and linkScope are on by default and appended after termIndex; linkScope follows links and changes the run digest', () => {
   const keys = Object.keys(FEATURES);
-  assert.deepEqual(keys.slice(-2), ['links', 'linkScope']);
+  assert.deepEqual(keys.slice(keys.indexOf('links'), keys.indexOf('links') + 2), ['links', 'linkScope']);
   assert.equal(keys.indexOf('links'), keys.indexOf('termIndex') + 1);
   assert.deepEqual([FEATURES.links, FEATURES.linkScope, FEATURE_PARENTS.links, FEATURE_PARENTS.linkScope], [true, true, undefined, 'links']);
   assert.deepEqual([RUN_FEATURES.includes('links'), RUN_FEATURES.at(-1)], [false, 'linkScope']);
@@ -136,3 +138,19 @@ function fakePresetPacks() {
   packs.set('fake', { ...fake, presets: { scene: { title: '장면', levels: [{ name: 'scene', leaf: true }], checkSets: ['fake.basic'] } } });
   return packs;
 }
+
+test('M7a features: images, imageReferences and imageReview are on by default and appended last; the two children follow images; none changes the node run digest', () => {
+  const keys = Object.keys(FEATURES);
+  assert.deepEqual(keys.slice(-3), ['images', 'imageReferences', 'imageReview']);
+  assert.deepEqual([FEATURES.images, FEATURES.imageReferences, FEATURES.imageReview], [true, true, true]);
+  assert.deepEqual([FEATURE_PARENTS.images, FEATURE_PARENTS.imageReferences, FEATURE_PARENTS.imageReview], [undefined, 'images', 'images']);
+  const eff = (features) => validateWorkConfig({ ...base, features });
+  assert.deepEqual(eff({ images: false }).config.features, { ...FEATURES, images: false, imageReferences: false, imageReview: false });
+  assert.deepEqual(eff({ images: false }).errors, []);
+  assert.deepEqual(eff({ images: false, imageReview: true }).errors, [{ code: 'FEATURE_REQUIRES', feature: 'imageReview', requires: 'images' }]);
+  const d = (f) => featuresDigest({ ...FEATURES, ...f });
+  for (const key of ['images', 'imageReferences', 'imageReview']) {
+    assert.ok(!RUN_FEATURES.includes(key), key);
+    assert.equal(d({ [key]: false }), d({}), key);
+  }
+});
```

`test/server/feature-toggles.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/server/feature-toggles.test.js b/test/server/feature-toggles.test.js
index aed86c1..aa60e58 100644
--- a/test/server/feature-toggles.test.js
+++ b/test/server/feature-toggles.test.js
@@ -29,6 +29,7 @@ test('F-2: features { occurrences: false } alone gives a working work; the child
   assert.deepEqual(values, {
     occurrences: false, occurrencesInExtract: false, occurrenceScope: false, rename: false, recommit: true, sources: true, evidence: true, evidenceInExtract: true,
     promiseScope: true, viewer: true, viewerToggles: true, checkConfig: true, blocks: true, bibliography: true, termIndex: true, links: true, linkScope: true,
+    images: true, imageReferences: true, imageReview: true,
   });
   const renamed = await tools.call('folio_find', { root, query: 'rename', id: 'hana', newName: '세라' });
   assert.equal(code(renamed), 'FEATURE_DISABLED');
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/core/features.test.js test/server/feature-toggles.test.js`
Expected: FAIL — 기본값 목록에 `images`가 없다.

- [ ] **Step 3: 구현**

`core/work/features.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/core/work/features.js b/core/work/features.js
index 858eb20..748bda7 100644
--- a/core/work/features.js
+++ b/core/work/features.js
@@ -21,6 +21,11 @@ import { isPlainObject } from '../util/plain.js';
  * - links: 노드 연결 표(folio_find links)와 folio_status 의 links(깨진 링크·자기 링크)(N4). 읽기 전용 투영이다(RUN_FEATURES 밖). 끄면 FEATURE_DISABLED·null.
  * - linkScope: 순서 없는(none) 노드의 검사 범위가 연결된 노드의 사건(linkedEvents)을 모은다(N4, 정본 §10 끝). links 필요.
  *   검사가 보는 것을 바꾸므로 RUN_FEATURES 에 든다. 앞뒤 판정(ordered)·priorEvents·core.promise-order 는 이 값과 상관없다.
+ * - images: folio_image 로 그림 한 장을 설명서 → 생성 전 점검 → 생성 → 검토 → 승인 → 커밋 순서로 만든다(M7a). 끄면 FEATURE_DISABLED.
+ * - imageReferences: 그림 실행이 설명서 엔티티의 기준 그림(그 엔티티가 나온 그림 파일)을 찾아 생성·검토 요청에 싣는다(images 필요).
+ * - imageReview: 그림 실행의 모델 검토 단계(image-review 검사)를 돈다(images 필요). 끄면 그 단계는 이유와 출처를 남기고 건너뛴다.
+ *   셋 다 노드 실행이 묻는 것·검사 범위를 바꾸지 않는다(RUN_FEATURES 밖). 그림 실행은 자기 digest(core/image/context.js 의 imageSpecDigest)로 이 값을 묶는다.
+ *   잠금(커밋 그림 hash = 검토한 그림 hash, 영수증 없이 커밋 금지, 자기검토 표기)은 이 값과 상관없다.
  */
 export const FEATURES = Object.freeze({
   occurrences: true,
@@ -40,12 +45,15 @@ export const FEATURES = Object.freeze({
   termIndex: true,
   links: true,
   linkScope: true,
+  images: true,
+  imageReferences: true,
+  imageReview: true,
 });

 /** 켜려면 부모 기능도 켜져 있어야 하는 기능. 부모가 꺼지면 (명시적으로 true 가 아닌 한) 저절로 꺼진다. */
 export const FEATURE_PARENTS = Object.freeze({
   occurrencesInExtract: 'occurrences', occurrenceScope: 'occurrences', rename: 'occurrences', evidenceInExtract: 'evidence',
-  viewerToggles: 'viewer', linkScope: 'links',
+  viewerToggles: 'viewer', linkScope: 'links', imageReferences: 'images', imageReview: 'images',
 });

 /** 실행이 묻는 것·검사 범위를 바꾸는 기능. 이것이 바뀌면 열린 실행은 검사부터 다시 돈다. */
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/core/features.test.js test/server/feature-toggles.test.js` → PASS. `npm run check` → 1070/1070.

- [ ] **Step 5: 커밋**

```bash
git add core/work/features.js test/core/features.test.js test/server/feature-toggles.test.js
git commit -m "$(cat <<'EOF'
feat(features): images, imageReferences and imageReview toggles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task A2: 그림 설명서와 기준 그림

**Files:**
- Create: `core/image/brief.js`, `core/image/references.js`
- Test: `test/image/brief-references.test.js`

**Interfaces:**
- Produces: `BRIEF_FIELDS`, `readBrief(work, raw) → { brief } | { errors: [{ code, field, index? }] }`(코드 `BRIEF_INVALID`·`BRIEF_FIELD_UNKNOWN`·`BRIEF_FIELD_INVALID`·`BRIEF_ENTITY_UNKNOWN`), `briefHash(brief) → 'sha256:…'`, `briefText(brief) → string`. `MAX_REFERENCES = 3`, `referencesFor(work, entityIds, { exclude?, limit? }) → [{ entityId, assets: [{ assetId, file, reference }] }]`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/image/brief-references.test.js` (42줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWork } from '../../core/store/work.js';
import { readBrief, briefHash, briefText } from '../../core/image/brief.js';
import { referencesFor } from '../../core/image/references.js';
import { copyFixture } from '../support/fixtures.js';

test('a brief is normalised with every field, and unknown fields, bad shapes and unknown entities are refused', async () => {
  const work = await openWork(await copyFixture('novel-3level'));
  const { brief } = readBrief(work, { mustShow: ['난간의 마라'], entities: ['mara'], dialogue: [{ speaker: 'mara', text: '늦었어.' }] });
  assert.deepEqual(brief, {
    mustShow: ['난간의 마라'], mustNotShow: [], entities: ['mara'], continuity: '', dialogue: [{ speaker: 'mara', text: '늦었어.' }], reference: false,
  });
  assert.equal(briefHash(brief), briefHash({ ...brief }));
  assert.notEqual(briefHash(brief), briefHash({ ...brief, reference: true }));
  assert.equal(briefText(brief), '난간의 마라\n늦었어.');
  const codes = (raw) => (readBrief(work, raw).errors ?? []).map((e) => `${e.code}:${e.field}${e.index === undefined ? '' : `:${e.index}`}`);
  assert.deepEqual(codes('x'), ['BRIEF_INVALID:']);
  assert.deepEqual(codes({ style: 'noir' }), ['BRIEF_FIELD_UNKNOWN:style']);
  assert.deepEqual(codes({ entities: ['ghost', 'mara', 'mara'] }), ['BRIEF_ENTITY_UNKNOWN:entities:0', 'BRIEF_FIELD_INVALID:entities:2']);
  assert.deepEqual(codes({ mustShow: ['', 'x'.repeat(301)] }), ['BRIEF_FIELD_INVALID:mustShow:0', 'BRIEF_FIELD_INVALID:mustShow:1']);
  assert.deepEqual(codes({ dialogue: [{ speaker: 'ghost', text: '누구' }, { text: '좋아', tone: 'soft' }] }), ['BRIEF_FIELD_INVALID:dialogue:0', 'BRIEF_FIELD_INVALID:dialogue:1']);
  assert.deepEqual(codes({ reference: 'yes', continuity: 3 }), ['BRIEF_FIELD_INVALID:continuity', 'BRIEF_FIELD_INVALID:reference']);
  assert.deepEqual(codes({ mustShow: Array.from({ length: 21 }, () => 'a') }), ['BRIEF_FIELD_INVALID:mustShow']);
});

test('references: assets that list the entity and have a readable file; reference-marked first, then id; the asset being made is left out', async () => {
  const root = await copyFixture('novel-3level');
  await writeFile(join(root, 'assets', 'mara-sheet.yaml'), 'id: mara-sheet\nfile: mara-sheet.svg\nreference: true\nbrief:\n  entities: [mara]\n');
  await writeFile(join(root, 'assets', 'mara-sheet.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(root, 'assets', 'no-file.yaml'), 'id: no-file\nfile: no-file.png\nbrief:\n  entities: [mara]\n');
  const work = await openWork(root);
  assert.deepEqual(referencesFor(work, ['mara', 'junho']), [
    { entityId: 'mara', assets: [{ assetId: 'mara-sheet', file: 'mara-sheet.svg', reference: true }, { assetId: 'img-rooftop', file: 'img-rooftop.svg', reference: false }] },
    { entityId: 'junho', assets: [] },
  ]);
  assert.deepEqual(referencesFor(work, ['mara'], { exclude: 'mara-sheet', limit: 1 })[0].assets.map((a) => a.assetId), ['img-rooftop']);
  await rm(join(root, 'assets', 'img-rooftop.svg'));
  assert.deepEqual(referencesFor(await openWork(root), ['rooftop']), [{ entityId: 'rooftop', assets: [] }]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/image/brief-references.test.js`
Expected: FAIL — `Cannot find module '../../core/image/brief.js'`.

- [ ] **Step 3: 구현**

`core/image/brief.js` (67줄):

```js
import { canonicalJson, sha256 } from '../util/hash.js';
import { isPlainObject } from '../util/plain.js';

/** 그림 설명서 필드(정본 §14): 꼭 보여줄 것, 보여주면 안 될 것, 나오는 엔티티, 연속성 메모, 대사(작품 언어 원문), 기준 그림 여부. */
export const BRIEF_FIELDS = Object.freeze(['mustShow', 'mustNotShow', 'entities', 'continuity', 'dialogue', 'reference']);
const MAX_ITEMS = 20;
const MAX_LINE = 300;
const MAX_NOTE = 2000;

const isLine = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_LINE;

/**
 * 호스트가 준 설명서를 검증해 정규화한다. 모르는 필드, 틀린 모양, 작품에 없는 엔티티는 오류다(조용히 버리지 않는다).
 * 엔티티는 작품에 있어야 하고 한 번씩만. 대사의 speaker 는 null 또는 작품 엔티티 id. 돌려주는 설명서는 늘 모든 필드를 갖는다.
 * @param {{ entities: Map<string, any> }} work
 * @param {unknown} raw
 * @returns {{ brief: { mustShow: string[], mustNotShow: string[], entities: string[], continuity: string, dialogue: Array<{ speaker: string|null, text: string }>, reference: boolean } } | { errors: Array<{ code: string, field: string, index?: number }> }}
 */
export function readBrief(work, raw) {
  const errors = [];
  const push = (code, field, index) => errors.push(index === undefined ? { code, field } : { code, field, index });
  if (!isPlainObject(raw)) return { errors: [{ code: 'BRIEF_INVALID', field: '' }] };
  for (const key of Object.keys(raw)) if (!BRIEF_FIELDS.includes(key)) push('BRIEF_FIELD_UNKNOWN', key);
  const lines = (field) => {
    const value = raw[field] ?? [];
    if (!Array.isArray(value) || value.length > MAX_ITEMS) { push('BRIEF_FIELD_INVALID', field); return []; }
    value.forEach((item, index) => { if (!isLine(item)) push('BRIEF_FIELD_INVALID', field, index); });
    return value.filter(isLine);
  };
  const mustShow = lines('mustShow');
  const mustNotShow = lines('mustNotShow');
  const entityList = raw.entities ?? [];
  const entities = [];
  if (!Array.isArray(entityList) || entityList.length > MAX_ITEMS) push('BRIEF_FIELD_INVALID', 'entities');
  else {
    entityList.forEach((id, index) => {
      if (typeof id !== 'string' || !work.entities.has(id)) push('BRIEF_ENTITY_UNKNOWN', 'entities', index);
      else if (entities.includes(id)) push('BRIEF_FIELD_INVALID', 'entities', index);
      else entities.push(id);
    });
  }
  const continuity = raw.continuity ?? '';
  if (typeof continuity !== 'string' || continuity.length > MAX_NOTE) push('BRIEF_FIELD_INVALID', 'continuity');
  const dialogueList = raw.dialogue ?? [];
  const dialogue = [];
  if (!Array.isArray(dialogueList) || dialogueList.length > MAX_ITEMS) push('BRIEF_FIELD_INVALID', 'dialogue');
  else {
    dialogueList.forEach((line, index) => {
      const speaker = isPlainObject(line) ? (line.speaker ?? null) : undefined;
      const valid = isPlainObject(line) && Object.keys(line).every((key) => key === 'speaker' || key === 'text') && isLine(line.text)
        && (speaker === null || (typeof speaker === 'string' && work.entities.has(speaker)));
      if (!valid) push('BRIEF_FIELD_INVALID', 'dialogue', index);
      else dialogue.push({ speaker, text: line.text });
    });
  }
  const reference = raw.reference ?? false;
  if (typeof reference !== 'boolean') push('BRIEF_FIELD_INVALID', 'reference');
  if (errors.length) return { errors };
  return { brief: { mustShow, mustNotShow, entities, continuity: /** @type {string} */ (continuity), dialogue, reference: /** @type {boolean} */ (reference) } };
}

/** 설명서 hash. 그림 실행은 이 값으로 점검한 설명서와 커밋하는 설명서가 같은지 본다. */
export const briefHash = (brief) => sha256(canonicalJson(brief));

/** 설명서의 글(검토 인용을 대조할 글). 줄마다 하나. */
export const briefText = (brief) => [...brief.mustShow, ...brief.mustNotShow, brief.continuity, ...brief.dialogue.map((d) => d.text)]
  .filter((line) => line).join('\n');
```

`core/image/references.js` (26줄):

```js
/** 엔티티 하나에 실어 보내는 기준 그림 수. */
export const MAX_REFERENCES = 3;
const UNREADABLE = new Set(['ASSET_FILE_MISSING', 'ASSET_FILE_NOT_REGULAR']);

/**
 * 엔티티 기준 그림(정본 §14 "나오는 엔티티의 기준 그림을 등장 위치 목록에서 찾아 참조로 넘긴다").
 * 그림 설명서의 entities(그림의 등장 목록)에 그 엔티티가 있고 이미지 파일을 읽을 수 있는 그림만 고른다.
 * 기준 그림으로 표시한 것(meta.reference: true)이 먼저, 그다음 id 차례. 엔티티마다 MAX_REFERENCES 장까지.
 * exclude: 빼는 그림 id(지금 만드는 그림 자신). 파일을 읽지 않는다 — openWork 의 그림 목록과 경고만 본다.
 * @param {{ assets: Map<string, any>, warnings: Array<{ code: string, id?: string }> }} work
 * @param {string[]} entityIds
 * @param {{ exclude?: string|null, limit?: number }} [options]
 * @returns {Array<{ entityId: string, assets: Array<{ assetId: string, file: string, reference: boolean }> }>}
 */
export function referencesFor(work, entityIds, { exclude = null, limit = MAX_REFERENCES } = {}) {
  const unreadable = new Set(work.warnings.filter((w) => UNREADABLE.has(w.code)).map((w) => w.id));
  const readable = [...work.assets.values()].filter((a) => a.id !== exclude && typeof a.file === 'string' && !unreadable.has(a.id));
  const isReference = (asset) => asset.meta?.reference === true;
  return entityIds.map((entityId) => ({
    entityId,
    assets: readable.filter((a) => a.entities.includes(entityId))
      .sort((a, b) => Number(isReference(b)) - Number(isReference(a)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, limit)
      .map((a) => ({ assetId: a.id, file: a.file, reference: isReference(a) })),
  }));
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/image/brief-references.test.js` → PASS. `npm run check` → 1072/1072.

- [ ] **Step 5: 커밋**

```bash
git add core/image/brief.js core/image/references.js test/image/brief-references.test.js
git commit -m "$(cat <<'EOF'
feat(image): picture brief and entity reference pictures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task A3: 호스트 그림 받기와 assets 한 번 쓰기

> 리뷰: **가장 강한 모델**. 공격해 볼 것:
> - `writeAssetOnce`로 `assets/` 밖(`../x.png`, `a/b.png`, `.hidden.png`, 대문자·공백)을 쓸 수 있는가. `assets`가 다른 폴더로 가는 링크일 때 쓰는가.
> - 같은 이름이 이미 있으면 덮는가(링크·폴더·다른 바이트). 반쯤 쓴 파일이 남는가.
> - `readHostImage`가 링크·FIFO·폴더·상대 경로·NUL·20MiB+1·그림 아닌 바이트를 받아들이는가. 원본 파일을 바꾸는가.

**Files:**
- Create: `core/image/intake.js`, `test/support/images.js`
- Modify: `core/store/assets.js`
- Test: `test/image/intake-assets.test.js`

**Interfaces:**
- Produces: `MAX_IMAGE_BYTES`, `imageFormatOf(bytes) → { ext, type } | null`, `readHostImage(path) → { bytes, ext, type, hash }`(오류 `IMAGE_PATH_INVALID`·`IMAGE_TOO_LARGE`·`IMAGE_TYPE_UNSUPPORTED`). `assertAssetsDirSafe(root)`(`ASSETS_DIR_INVALID`), `ASSET_WRITE_NAME`, `writeAssetOnce(root, name, bytes) → { written: boolean }`(`ASSET_NAME_INVALID`·`ASSET_IMMUTABLE`). 테스트 도우미 `PNG_A`, `PNG_B`, `placeImage(dir, name, bytes?)`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/support/images.js` (13줄):

```js
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 합성 그림: 1×1 PNG 두 장(색만 다름). 실제 생성 결과물이 아니다. */
export const PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const PNG_B = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** dir/name 에 바이트를 쓰고 그 절대 경로를 돌려준다(호스트가 그림을 만들어 둔 자리 흉내). */
export async function placeImage(dir, name, bytes = PNG_A) {
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
}
```

`test/image/intake-assets.test.js` (53줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, symlink, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { readHostImage, MAX_IMAGE_BYTES } from '../../core/image/intake.js';
import { writeAssetOnce } from '../../core/store/assets.js';
import { sha256 } from '../../core/util/hash.js';
import { tempDir } from '../support/fixtures.js';
import { PNG_A, PNG_B, placeImage } from '../support/images.js';

const posixOnly = process.platform === 'win32' && 'symlinks need privileges on Windows';

test('a host image is read only when it is an absolute path to a regular PNG, JPEG, GIF or WebP file of at most 20 MiB', { skip: posixOnly }, async () => {
  const dir = await tempDir('folio-intake-');
  const png = await placeImage(dir, 'out.png');
  const read = await readHostImage(png);
  assert.deepEqual([read.ext, read.type, read.hash, read.bytes.equals(PNG_A)], ['.png', 'image/png', sha256(PNG_A), true]);
  assert.deepEqual(await readFile(png), PNG_A, 'the original is only read');
  const jpeg = await placeImage(dir, 'x.bin', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]));
  assert.equal((await readHostImage(jpeg)).ext, '.jpg', 'the format comes from the bytes, not the name');
  const code = async (path) => readHostImage(path).then(() => 'ok', (e) => e.code);
  assert.equal(await code('relative/out.png'), 'IMAGE_PATH_INVALID');
  assert.equal(await code(join(dir, 'missing.png')), 'IMAGE_PATH_INVALID');
  assert.equal(await code(dir), 'IMAGE_PATH_INVALID');
  await symlink(png, join(dir, 'link.png'));
  assert.equal(await code(join(dir, 'link.png')), 'IMAGE_PATH_INVALID');
  assert.equal(await code(await placeImage(dir, 'notes.png', Buffer.from('hello'))), 'IMAGE_TYPE_UNSUPPORTED');
  assert.equal(await code(await placeImage(dir, 'x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))), 'IMAGE_TYPE_UNSUPPORTED');
  const big = await placeImage(dir, 'big.png');
  await truncate(big, MAX_IMAGE_BYTES + 1);
  assert.equal(await code(big), 'IMAGE_TOO_LARGE');
});

test('writeAssetOnce writes assets/<name> once: the same bytes again pass, other bytes, bad names, linked folders and links in the way are refused', { skip: posixOnly }, async () => {
  const root = await tempDir('folio-assets-');
  assert.deepEqual(await writeAssetOnce(root, 'pic.png', PNG_A), { written: true });
  assert.deepEqual(await readFile(join(root, 'assets', 'pic.png')), PNG_A);
  assert.deepEqual(await writeAssetOnce(root, 'pic.png', PNG_A), { written: false });
  const code = async (r, name, bytes = PNG_B) => writeAssetOnce(r, name, bytes).then(() => 'ok', (e) => e.code);
  assert.equal(await code(root, 'pic.png'), 'ASSET_IMMUTABLE');
  assert.deepEqual(await readFile(join(root, 'assets', 'pic.png')), PNG_A, 'never overwritten');
  for (const name of ['../out.png', 'a/b.png', '.hidden.png', 'pic.exe', 'Pic.png']) assert.equal(await code(root, name), 'ASSET_NAME_INVALID', name);
  const outside = await tempDir('folio-outside-');
  await symlink(join(outside, 'target.png'), join(root, 'assets', 'dangling.png'));
  assert.equal(await code(root, 'dangling.png'), 'ASSET_IMMUTABLE');
  assert.deepEqual(await readdir(outside), [], 'nothing written through the link');
  assert.deepEqual((await readdir(join(root, 'assets'))).filter((n) => n.endsWith('.tmp')), []);
  const linked = await tempDir('folio-linked-');
  await mkdir(join(outside, 'assets'));
  await symlink(join(outside, 'assets'), join(linked, 'assets'));
  assert.equal(await code(linked, 'pic.png'), 'ASSETS_DIR_INVALID');
  assert.deepEqual(await readdir(join(outside, 'assets')), []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/image/intake-assets.test.js`
Expected: FAIL — `core/image/intake.js` 없음.

- [ ] **Step 3: 구현**

`core/image/intake.js` (52줄):

```js
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';

/** 호스트가 만든 그림 한 장의 크기 한도(뷰어가 내주는 한도와 같다). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** 받는 그림 형식: 내용 앞머리(magic bytes)로 판정한다. 파일 이름 확장자는 믿지 않는다. SVG 는 받지 않는다(스크립트를 품을 수 있다). */
const FORMATS = Object.freeze([
  { ext: '.png', type: 'image/png', test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.jpg', type: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', type: 'image/gif', test: (b) => b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { ext: '.webp', type: 'image/webp', test: (b) => b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
]);

const cut = (value) => String(value).slice(0, 300);

/** 바이트의 그림 형식. 모르는 형식이면 null. */
export const imageFormatOf = (bytes) => FORMATS.find((f) => f.test(bytes)) ?? null;

/**
 * 호스트가 만든 그림 파일 하나를 읽는다(folio_sources add 의 로컬 파일 읽기와 같은 규칙, N2 결정 17).
 * 절대 경로, 링크가 아닌 보통 파일(O_NOFOLLOW·O_NONBLOCK, 연 손잡이의 fstat 으로 다시 확인), 20MiB 까지, PNG·JPEG·GIF·WebP 내용만.
 * 원본은 읽기만 한다. 돌려준 바이트만 작품 안(.folio/image-runs)에 옮겨 쓴다 — 그 뒤 원본이 바뀌어도 그림 실행은 옮긴 바이트를 본다.
 * @param {unknown} path
 * @returns {Promise<{ bytes: Buffer, ext: string, type: string, hash: string }>}
 */
export async function readHostImage(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    throw new FolioError('IMAGE_PATH_INVALID', 'path must be the absolute path of one image file', { path: cut(path) });
  }
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    throw new FolioError('IMAGE_PATH_INVALID', 'cannot open the image (missing, a link, or not readable)', { path: cut(path), errno: error?.code ?? null });
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new FolioError('IMAGE_PATH_INVALID', 'not a regular file', { path: cut(path) });
    if (info.size > MAX_IMAGE_BYTES) throw new FolioError('IMAGE_TOO_LARGE', `${info.size} bytes`, { bytes: info.size, max: MAX_IMAGE_BYTES });
    const bytes = await handle.readFile();
    if (bytes.length > MAX_IMAGE_BYTES) throw new FolioError('IMAGE_TOO_LARGE', `${bytes.length} bytes`, { bytes: bytes.length, max: MAX_IMAGE_BYTES });
    const format = imageFormatOf(bytes);
    if (!format) throw new FolioError('IMAGE_TYPE_UNSUPPORTED', 'only PNG, JPEG, GIF and WebP images are accepted', { path: cut(path) });
    return { bytes, ext: format.ext, type: format.type, hash: sha256(bytes) };
  } finally {
    await handle.close();
  }
}
```

`core/store/assets.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/core/store/assets.js b/core/store/assets.js
index b3f9303..416e69c 100644
--- a/core/store/assets.js
+++ b/core/store/assets.js
@@ -1,6 +1,8 @@
 import { constants } from 'node:fs';
 import { join } from 'node:path';
-import { open, readFile, stat } from 'node:fs/promises';
+import { randomUUID } from 'node:crypto';
+import { link, lstat, mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
+import { FolioError } from '../errors.js';
 import { listEntries, writeFileAtomic } from '../util/fs.js';
 import { sha256 } from '../util/hash.js';
 import { parseYaml, stringifyYaml } from '../util/yaml.js';
@@ -92,3 +94,55 @@ export async function writeAssetMeta(root, asset) {
   assertSafePath(asset.path, 'asset.path');
   await writeFileAtomic(join(root, asset.path ?? `${ASSETS_DIR}/${asset.id}.yaml`), stringifyYaml(asset.meta));
 }
+
+/**
+ * assets/ 가 있다면 링크가 아닌 보통 폴더여야 한다(그림 쓰기가 작품 밖으로 나가지 않는다 — 자료의 sources/ 규칙과 같다).
+ * lstat 으로 본다(링크를 따라가지 않음). 없으면 ok — 쓰기 쪽이 그 뒤 mkdir 로 새로 만든다.
+ * @param {string} root
+ */
+export async function assertAssetsDirSafe(root) {
+  let info;
+  try { info = await lstat(join(root, ASSETS_DIR)); } catch (error) {
+    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return;
+    throw error;
+  }
+  if (!info.isDirectory()) throw new FolioError('ASSETS_DIR_INVALID', `${ASSETS_DIR} must be a plain directory, not a link or other entry`);
+}
+
+/** 그림 실행이 쓰는 이름: assets/ 바로 아래, 작품 id 규칙 + 그림·설명서 확장자. 경로 조각·숨김 이름은 만들 수 없다. */
+export const ASSET_WRITE_NAME = /^[a-z0-9][a-z0-9-]*\.(png|jpg|gif|webp|svg|yaml)$/;
+
+/** 링크를 따라가지 않고 보통 파일만 읽는다. 그 밖이면 null. */
+async function readRegularOrNull(path) {
+  let handle;
+  try { handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); } catch { return null; }
+  try { return (await handle.stat()).isFile() ? await handle.readFile() : null; } finally { await handle.close(); }
+}
+
+/**
+ * assets/<name> 을 딱 한 번만 쓴다: 같은 폴더의 임시 파일에 쓰고 link 로 옮긴다(이미 있으면 EEXIST — 덮지 않고, 반쯤 쓴 파일도 남지 않는다).
+ * 이미 있으면 내용이 같을 때만 통과한다(이어서 커밋하는 길, written: false). 다르거나 링크·보통 파일이 아니면 ASSET_IMMUTABLE.
+ * @param {string} root
+ * @param {string} name
+ * @param {Uint8Array|string} bytes
+ * @returns {Promise<{ written: boolean }>}
+ */
+export async function writeAssetOnce(root, name, bytes) {
+  if (typeof name !== 'string' || !ASSET_WRITE_NAME.test(name)) throw new FolioError('ASSET_NAME_INVALID', String(name).slice(0, 200));
+  await assertAssetsDirSafe(root);
+  await mkdir(join(root, ASSETS_DIR), { recursive: true });
+  const target = join(root, ASSETS_DIR, name);
+  const tmp = join(root, ASSETS_DIR, `.${name}.${randomUUID().slice(0, 8)}.tmp`);
+  await writeFile(tmp, bytes, { flag: 'wx' });
+  try {
+    await link(tmp, target);
+    return { written: true };
+  } catch (error) {
+    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
+    const existing = await readRegularOrNull(target);
+    if (existing && sha256(existing) === sha256(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes)) return { written: false };
+    throw new FolioError('ASSET_IMMUTABLE', `${name} already exists with other content`, { name });
+  } finally {
+    await unlink(tmp).catch(() => {});
+  }
+}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/image/intake-assets.test.js` → PASS. `npm run check` → 1074/1074.

- [ ] **Step 5: 커밋**

```bash
git add core/image/intake.js core/store/assets.js test/support/images.js test/image/intake-assets.test.js
git commit -m "$(cat <<'EOF'
feat(image): read host pictures safely and write assets exactly once

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task A4: image 팩 — 검사 여섯, 세트 둘, 그림 stage

**Files:**
- Create: `core/image/stages.js`, `packs/image/pack.yaml`, `packs/image/index.js`, `packs/image/checks/review.md`, `packs/image/checkers/{index,asset-refs,dialogue-in-text,entities-in-node,references-present,show-conflict}.js`
- Modify: `core/pipeline/resolve.js`, `packs/index.js`, `packs/image/README.md`
- Modify (테스트): `test/pack/{novel-pack,knowledge-pack,sources-pack,pack-module-digest}.test.js`(팩 목록 끝에 `image`)
- Test: `test/pack/image-pack.test.js`

**Interfaces:**
- Consumes: `assetRefsInBody`(이미 있음), `scanMentions`(이미 있음).
- Produces: `IMAGE_STAGES = { precheck: 'image-precheck', review: 'image-review' }`, `IMAGE_STAGE_NAMES`, `IMAGE_PACK = 'image'`. 검사기 문맥(그림 stage): `{ work, node, nodeText, brief, references }`. 세트 `image.basic`(점검 넷 + `image.review`), `image.placement`(`image.asset-refs`).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/pack/image-pack.test.js` (67줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { IMAGE_CHECKERS } from '../../packs/image/checkers/index.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { openWork } from '../../core/store/work.js';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { IMAGE_STAGE_NAMES } from '../../core/image/stages.js';
import { copyFixture } from '../support/fixtures.js';

async function illustrated(checkSets) {
  const root = await copyFixture('novel-3level');
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml({ ...config, checkSets }));
  return root;
}

test('the image pack is a second pack: checks and sets only, all advisory and experimental, no locks, no default sets', async () => {
  const packs = await loadBuiltinPacks();
  const pack = packs.get('image');
  assert.deepEqual([pack.pipelines, pack.presets, pack.prompts, pack.defaultCheckSets], [undefined, {}, {}, []]);
  assert.deepEqual(pack.checks.map((c) => [c.id, c.tier, c.stage]), [
    ['image.asset-refs', 'deterministic', 'facts'], ['image.dialogue-in-text', 'deterministic', 'image-precheck'],
    ['image.entities-in-node', 'deterministic', 'image-precheck'], ['image.references-present', 'deterministic', 'image-precheck'],
    ['image.show-conflict', 'deterministic', 'image-precheck'], ['image.review', 'model', 'image-review'],
  ]);
  for (const check of pack.checks) assert.deepEqual([check.severity, check.experimental, check.locked ?? false], ['advisory', true, false], check.id);
  assert.deepEqual(Object.fromEntries(Object.entries(pack.checkSets).map(([id, set]) => [id, set.checks])), {
    'image.basic': ['image.dialogue-in-text', 'image.entities-in-node', 'image.references-present', 'image.show-conflict', 'image.review'],
    'image.placement': ['image.asset-refs'],
  });
  assert.match(pack.checks.find((c) => c.id === 'image.review').instruction, /자기검토/);
});

test('image-stage checks are chosen like any check but never land in a node pipeline; image.asset-refs runs in facts', async () => {
  const packs = await loadBuiltinPacks();
  const plain = await openWorkspace(await copyFixture('novel-3level'), { packs });
  assert.ok(!plain.checks.some((c) => c.id.startsWith('image.')), 'nothing chosen, nothing runs');
  const ws = await openWorkspace(await illustrated(['novel.basic', 'image.basic', 'image.placement']), { packs });
  assert.deepEqual(ws.checks.filter((c) => IMAGE_STAGE_NAMES.includes(c.stage)).map((c) => c.id).sort(),
    ['image.dialogue-in-text', 'image.entities-in-node', 'image.references-present', 'image.review', 'image.show-conflict']);
  const appliedIds = Object.values(ws.applied.byLevel).flatMap((list) => list.map((a) => a.checkId));
  assert.ok(appliedIds.includes('image.asset-refs'));
  assert.ok(!appliedIds.some((id) => ['image.review', 'image.show-conflict'].includes(id)));
});

test('image checkers: unknown or unreadable pictures in the draft, dialogue not in the text, entities outside the node, missing references, show/forbid overlap', async () => {
  const work = await openWork(await copyFixture('novel-3level'));
  const codes = (findings) => findings.map((f) => f.code);
  assert.deepEqual(codes(IMAGE_CHECKERS['asset-refs']({ draft: '![[asset:img-rooftop]] ![[asset:ghost]] ![[asset:ghost]]', work })), ['ASSET_UNKNOWN']);
  const missing = { ...work, warnings: [{ code: 'ASSET_FILE_MISSING', id: 'img-rooftop' }] };
  assert.deepEqual(codes(IMAGE_CHECKERS['asset-refs']({ draft: '![[asset:img-rooftop]]', work: missing })), ['ASSET_FILE_MISSING']);
  const brief = { mustShow: ['붉은 편지', '난간'], mustNotShow: [' 붉은 편지 '], entities: ['mara', 'junho'], dialogue: [{ speaker: 'mara', text: '늦었어.' }, { speaker: null, text: '바람' }], reference: false };
  const node = { entities: ['mara'] };
  assert.deepEqual(codes(IMAGE_CHECKERS['dialogue-in-text']({ nodeText: '바람이 불었다.', brief })), ['DIALOGUE_NOT_IN_TEXT']);
  assert.deepEqual(IMAGE_CHECKERS['dialogue-in-text']({ nodeText: null, brief }), []);
  assert.deepEqual(IMAGE_CHECKERS['entities-in-node']({ node, nodeText: '마라가 웃었다.', work, brief }).map((f) => f.message), ['junho 가 이 노드에 나오지 않는다']);
  assert.deepEqual(IMAGE_CHECKERS['entities-in-node']({ node, nodeText: '준호와 마라.', work, brief }), []);
  const references = [{ entityId: 'mara', assets: [{}] }, { entityId: 'junho', assets: [] }];
  assert.deepEqual(codes(IMAGE_CHECKERS['references-present']({ brief, references })), ['REFERENCE_MISSING']);
  assert.deepEqual(IMAGE_CHECKERS['references-present']({ brief, references: null }), [], 'imageReferences off');
  assert.deepEqual(IMAGE_CHECKERS['references-present']({ brief: { ...brief, reference: true }, references }), [], 'making a reference itself');
  assert.deepEqual(IMAGE_CHECKERS['show-conflict']({ brief }).map((f) => f.quote), ['붉은 편지']);
});
```

`test/pack/novel-pack.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/pack/novel-pack.test.js b/test/pack/novel-pack.test.js
index aae832f..1e037ec 100644
--- a/test/pack/novel-pack.test.js
+++ b/test/pack/novel-pack.test.js
@@ -12,7 +12,7 @@ import { createFakeHost, driveToEnd, label } from '../support/fake-host.js';

 test('the novel pack loads and opens the serial fixture with its sets and the core locks', async () => {
   const packs = await loadBuiltinPacks();
-  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand']);
+  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image']);
   const novel = packs.get('novel');
   assert.deepEqual(Object.keys(novel.presets), ['serial', 'novel', 'scene']);
   assert.deepEqual(novel.defaultCheckSets, ['novel.basic']);
```

`test/pack/knowledge-pack.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/pack/knowledge-pack.test.js b/test/pack/knowledge-pack.test.js
index 925765a..7c4d38e 100644
--- a/test/pack/knowledge-pack.test.js
+++ b/test/pack/knowledge-pack.test.js
@@ -30,7 +30,7 @@ async function runMembranes(root, until = (o) => o.status === 'needs_user') {

 test('the knowledge pack loads with three presets, three sets and advisory experimental deterministic checks', async () => {
   const packs = await loadBuiltinPacks();
-  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand']);
+  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image']);
   const pack = packs.get('knowledge');
   assert.deepEqual(Object.keys(pack.presets), ['textbook', 'history', 'guide', 'sourcebook', 'reference']);
   assert.deepEqual(Object.values(pack.presets).map((p) => [p.levels.map((l) => l.name), p.checkSets]), [
```

`test/pack/sources-pack.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/pack/sources-pack.test.js b/test/pack/sources-pack.test.js
index 3ea939d..7779bb8 100644
--- a/test/pack/sources-pack.test.js
+++ b/test/pack/sources-pack.test.js
@@ -35,7 +35,7 @@ async function runMembranes(root) {

 test('the sources pack is a second pack: checks and sets only, advisory experimental checks, no default sets, no locks', async () => {
   const packs = await loadBuiltinPacks();
-  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand']);
+  assert.deepEqual([...packs.keys()], ['novel', 'knowledge', 'sources', 'brand', 'image']);
   const pack = packs.get('sources');
   assert.deepEqual([pack.pipelines, pack.presets, pack.prompts, pack.defaultCheckSets], [undefined, {}, {}, []]);
   assert.deepEqual(Object.fromEntries(Object.entries(pack.checkSets).map(([id, set]) => [id, set.checks])), {
```

`test/pack/pack-module-digest.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/pack/pack-module-digest.test.js b/test/pack/pack-module-digest.test.js
index fbf187d..de5a0c2 100644
--- a/test/pack/pack-module-digest.test.js
+++ b/test/pack/pack-module-digest.test.js
@@ -25,7 +25,7 @@ async function jsFiles(dir) {
 }

 test('C0 guard: every .js file under a built-in pack checkers/ and lexicons/ is in its module graph, so the pack digest sees it', async () => {
-  for (const name of ['novel', 'knowledge', 'sources', 'brand']) {
+  for (const name of ['novel', 'knowledge', 'sources', 'brand', 'image']) {
     const dir = join(PACKS_DIR, name);
     const graph = new Map(await moduleGraph(dir, ['checkers/index.js']));
     const files = [...await jsFiles(join(dir, 'checkers')), ...await jsFiles(join(dir, 'lexicons'))].map((f) => relative(dir, f).split(sep).join('/'));
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/pack/image-pack.test.js test/pack/novel-pack.test.js`
Expected: FAIL — 내장 팩 목록에 `image`가 없다.

- [ ] **Step 3: 구현**

`core/image/stages.js` (8줄):

```js
/**
 * 그림 실행(M7a)이 검사를 돌리는 stage. 이 stage 의 검사는 노드 파이프라인에 자리가 없다 — 노드 실행은 돌리지 않고,
 * 그림 실행(core/image)만 돌린다. 검사 세트로 고르고 work.yaml checks 로 켜고 끄는 길은 다른 검사와 같다.
 */
export const IMAGE_STAGES = Object.freeze({ precheck: 'image-precheck', review: 'image-review' });
export const IMAGE_STAGE_NAMES = Object.freeze(Object.values(IMAGE_STAGES));
/** 그림 실행을 쓰려면 작품 packs 에 있어야 하는 팩 이름. */
export const IMAGE_PACK = 'image';
```

`core/pipeline/resolve.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/core/pipeline/resolve.js b/core/pipeline/resolve.js
index 25be823..8885555 100644
--- a/core/pipeline/resolve.js
+++ b/core/pipeline/resolve.js
@@ -1,6 +1,7 @@
 import { canonicalJson } from '../util/hash.js';
 import { resolvePipeline } from './define.js';
 import { mergeOverrides, splitOverrides } from './levels.js';
+import { IMAGE_STAGE_NAMES } from '../image/stages.js';

 const stageOf = (step) => step.stage ?? step.id;
 const unique = (pipelines) => [...new Set(pipelines.filter(Boolean))];
@@ -55,10 +56,12 @@ function customConflicts(pipelines, errors) {
   }
 }

-/** 모든 검사가 들어갈 단계가 있는지, 잠긴 검사는 맨 아래 칸의 모든 파이프라인에서 잠긴 단계에 있는지 본다. */
+/** 모든 검사가 들어갈 단계가 있는지(그림 실행 stage 의 검사는 빼고), 잠긴 검사는 맨 아래 칸의 모든 파이프라인에서 잠긴 단계에 있는지 본다. */
 function checkPlacement({ checks, all, leafish, includeAllHardChecks, errors }) {
   const checkSteps = all.flatMap((p) => p.steps).filter((s) => s.kind === 'check');
   for (const check of checks) {
+    // 그림 실행 stage(M7a)의 검사는 노드 파이프라인에 자리가 없다 — 그림 실행(core/image)이 돌린다.
+    if (IMAGE_STAGE_NAMES.includes(check.stage)) continue;
     const homes = checkSteps.filter((s) => stageOf(s) === check.stage);
     if (!homes.length) errors.push({ code: 'CHECK_STAGE_MISSING', checkId: check.id, stage: check.stage });
     else if (homes.some((s) => s.tier !== check.tier)) errors.push({ code: 'CHECK_TIER_MISMATCH', checkId: check.id, stage: check.stage });
```

`packs/image/pack.yaml` (64줄):

```yaml
name: image
version: 1
title: 그림
description: 삽화·웹툰 그림을 노드에 붙이는 둘째 팩. 그림 한 장을 설명서 → 생성 전 점검 → 생성 → 검토 → 승인 → 커밋 순서로 만든다(folio_image). 단계·프리셋은 첫 팩이 준다.
checks:
  image.asset-refs:
    title: 본문 그림 참조
    description: 원고의 ![[asset:id]] 가 작품에 없는 그림이나 이미지 파일이 없는 그림을 가리키면 알린다(실험).
    tier: deterministic
    stage: facts
    severity: advisory
    experimental: true
    run: asset-refs
  image.dialogue-in-text:
    title: 대사 원문 대조
    description: 설명서의 대사가 그림이 붙는 노드 본문에 그대로 있는지 본다(작품 언어 원문, 실험).
    tier: deterministic
    stage: image-precheck
    severity: advisory
    experimental: true
    run: dialogue-in-text
  image.entities-in-node:
    title: 장면 밖 엔티티
    description: 설명서에 적은 엔티티가 그림이 붙는 노드에 나오지 않으면 알린다(앞머리 entities 또는 본문 속 이름, 실험).
    tier: deterministic
    stage: image-precheck
    severity: advisory
    experimental: true
    run: entities-in-node
  image.references-present:
    title: 기준 그림 없음
    description: 설명서 엔티티에 실어 보낼 기준 그림이 하나도 없으면 알린다(imageReferences 가 켜졌을 때만, 실험).
    tier: deterministic
    stage: image-precheck
    severity: advisory
    experimental: true
    run: references-present
  image.show-conflict:
    title: 보여줄 것과 금지가 겹침
    description: 꼭 보여줄 것과 보여주면 안 될 것에 같은 항목이 있으면 알린다(실험).
    tier: deterministic
    stage: image-precheck
    severity: advisory
    experimental: true
    run: show-conflict
  image.review:
    title: 그림 검토
    description: 호스트 모델이 그림 파일을 직접 열어 설명서와 비교한다. 같은 호스트의 자기검토이며 독립 평가가 아니다(실험, 참고 의견).
    tier: model
    stage: image-review
    severity: advisory
    experimental: true
    instruction: checks/review.md
checkSets:
  image.basic:
    title: 그림 기본
    description: 생성 전 점검 넷(대사 원문, 장면 밖 엔티티, 기준 그림, 보여줄 것·금지 겹침)과 그림 검토(실험, 참고 의견).
    checks: [image.dialogue-in-text, image.entities-in-node, image.references-present, image.show-conflict, image.review]
    recommendedFor: { kinds: [webtoon, illustrated] }
  image.placement:
    title: 본문 그림 배치
    description: 원고 속 그림 참조(![[asset:id]])가 작품의 그림을 가리키는지 본다(실험, 참고 의견).
    checks: [image.asset-refs]
    recommendedFor: { kinds: [webtoon, illustrated] }
```

`packs/image/checks/review.md` (4줄):

```markdown
첨부한 그림 파일(image.path)을 직접 열어 본 뒤에 판정한다. 프롬프트가 요청한 것이 아니라 그림에 실제로 보이는 것을 본다.
설명서(brief)의 꼭 보여줄 것(mustShow)이 보이지 않거나, 보여주면 안 될 것(mustNotShow)이 보이거나, 대사(dialogue) 글자가 원문과 다르거나,
기준 그림(references)과 인물 외형이 어긋나면 지적한다. 지적마다 code 와 message 에 무엇이 보이는지(또는 보이지 않는지) 구체적으로 적는다.
이 검토는 같은 호스트의 자기검토다. 독립 평가라고 쓰지 않는다. 지적은 참고 의견이며 그림을 저절로 다시 만들지 않는다.
```

`packs/image/checkers/asset-refs.js` (21줄):

```js
import { assetRefsInBody } from '../../../core/store/assets.js';

const UNREADABLE = new Set(['ASSET_FILE_MISSING', 'ASSET_FILE_NOT_REGULAR']);

/**
 * 본문 그림 참조(image.asset-refs, 노드 facts 단계). 원고의 ![[asset:id]] 가 작품에 없는 그림이면 ASSET_UNKNOWN,
 * 설명서는 있는데 이미지 파일을 읽을 수 없으면 ASSET_FILE_MISSING. 그림마다 한 번 알린다.
 * @param {{ draft?: unknown, work?: { assets: Map<string, any>, warnings?: Array<{ code: string, id?: string }> } }} ctx
 */
export function assetRefs(ctx) {
  const draft = typeof ctx?.draft === 'string' ? ctx.draft : '';
  const assets = ctx?.work?.assets ?? new Map();
  const unreadable = new Set((ctx?.work?.warnings ?? []).filter((w) => UNREADABLE.has(w.code)).map((w) => w.id));
  const findings = [];
  for (const id of new Set(assetRefsInBody(draft))) {
    const quote = `![[asset:${id}]]`;
    if (!assets.has(id)) findings.push({ code: 'ASSET_UNKNOWN', quote, message: `그림 ${id} 가 작품에 없다(assets/${id}.yaml)` });
    else if (typeof assets.get(id).file !== 'string' || unreadable.has(id)) findings.push({ code: 'ASSET_FILE_MISSING', quote, message: `그림 ${id} 의 이미지 파일을 읽을 수 없다` });
  }
  return findings;
}
```

`packs/image/checkers/dialogue-in-text.js` (11줄):

```js
/**
 * 대사 원문 대조(image.dialogue-in-text, 그림 생성 전 점검). 설명서 대사(dialogue[].text)가 그림이 붙는 노드 본문(NFC)에
 * 그대로 있어야 한다 — 그림 속 글자는 작품 언어 원문이어야 한다(정본 §14). 노드가 없는 그림은 대조할 글이 없어 지적하지 않는다.
 * @param {{ nodeText?: string|null, brief?: { dialogue?: Array<{ text: string }> } }} ctx
 */
export function dialogueInText(ctx) {
  if (typeof ctx?.nodeText !== 'string') return [];
  const text = ctx.nodeText.normalize('NFC');
  return (ctx.brief?.dialogue ?? []).filter((line) => !text.includes(line.text.normalize('NFC')))
    .map((line) => ({ code: 'DIALOGUE_NOT_IN_TEXT', quote: line.text, message: `대사 "${line.text}" 가 노드 본문에 없다` }));
}
```

`packs/image/checkers/entities-in-node.js` (13줄):

```js
import { scanMentions } from '../../../core/index/scan.js';

/**
 * 장면 밖 엔티티(image.entities-in-node, 그림 생성 전 점검). 설명서 엔티티가 노드 앞머리 entities 에도, 본문 속 이름·별칭에도 없으면 알린다.
 * 노드가 없는 그림(작품 전체 그림, 기준 그림)은 지적하지 않는다.
 * @param {{ node?: { entities: string[] } | null, nodeText?: string|null, work?: { entities: Map<string, any> }, brief?: { entities?: string[] } }} ctx
 */
export function entitiesInNode(ctx) {
  if (!ctx?.node || typeof ctx.nodeText !== 'string') return [];
  const named = scanMentions(ctx.nodeText, ctx.work?.entities.values() ?? []);
  return (ctx.brief?.entities ?? []).filter((id) => !ctx.node?.entities.includes(id) && !named.has(id))
    .map((id) => ({ code: 'ENTITY_NOT_IN_NODE', message: `${id} 가 이 노드에 나오지 않는다` }));
}
```

`packs/image/checkers/references-present.js` (10줄):

```js
/**
 * 기준 그림 없음(image.references-present, 그림 생성 전 점검). 설명서 엔티티마다 실어 보낼 기준 그림(core/image/references.js)이
 * 하나도 없으면 알린다. imageReferences 가 꺼져 references 가 null 이면 지적하지 않는다. 기준 그림 자신을 만드는 실행(brief.reference)도 그렇다.
 * @param {{ brief?: { reference?: boolean }, references?: Array<{ entityId: string, assets: unknown[] }> | null }} ctx
 */
export function referencesPresent(ctx) {
  if (!Array.isArray(ctx?.references) || ctx.brief?.reference === true) return [];
  return ctx.references.filter((entry) => entry.assets.length === 0)
    .map((entry) => ({ code: 'REFERENCE_MISSING', message: `${entry.entityId} 의 기준 그림이 없다 — 외형이 그림마다 달라질 수 있다` }));
}
```

`packs/image/checkers/show-conflict.js` (11줄):

```js
const norm = (value) => String(value).normalize('NFC').trim().toLowerCase();

/**
 * 보여줄 것과 금지가 겹침(image.show-conflict, 그림 생성 전 점검). mustShow 와 mustNotShow 에 같은 항목(NFC·앞뒤 공백·대소문자 무시)이 있으면 알린다.
 * @param {{ brief?: { mustShow?: string[], mustNotShow?: string[] } }} ctx
 */
export function showConflict(ctx) {
  const banned = new Set((ctx?.brief?.mustNotShow ?? []).map(norm));
  return [...new Set((ctx?.brief?.mustShow ?? []).filter((item) => banned.has(norm(item))))]
    .map((item) => ({ code: 'SHOW_CONFLICT', quote: item, message: `"${item}" 가 꼭 보여줄 것과 보여주면 안 될 것에 함께 있다` }));
}
```

`packs/image/checkers/index.js` (11줄):

```js
import { assetRefs } from './asset-refs.js';
import { dialogueInText } from './dialogue-in-text.js';
import { entitiesInNode } from './entities-in-node.js';
import { referencesPresent } from './references-present.js';
import { showConflict } from './show-conflict.js';

/** pack.yaml 의 run: <이름> 이 가리키는 결정론 검사기. 이름을 바꾸면 팩 digest 가 바뀐다. */
export const IMAGE_CHECKERS = Object.freeze({
  'asset-refs': assetRefs, 'dialogue-in-text': dialogueInText, 'entities-in-node': entitiesInNode,
  'references-present': referencesPresent, 'show-conflict': showConflict,
});
```

`packs/image/index.js` (8줄):

```js
import { loadYamlPack } from '../../core/pack/yaml-pack.js';
import { withCheckConfig } from '../../core/pack/check-config.js';
import { IMAGE_CHECKERS } from './checkers/index.js';

export const IMAGE_PACK_DIR = import.meta.dirname;

/** 그림 팩(둘째 팩): pack.yaml + 검토 지시 글 + 이름으로 등록한 검사기. 단계·프리셋은 없다. 그림 실행은 core/image 가 돈다. */
export const loadImagePack = async () => withCheckConfig(await loadYamlPack(IMAGE_PACK_DIR, { name: 'image', checkers: IMAGE_CHECKERS, modules: ['checkers/index.js'] }));
```

`packs/index.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/packs/index.js b/packs/index.js
index 909a9a3..55b2015 100644
--- a/packs/index.js
+++ b/packs/index.js
@@ -2,9 +2,10 @@ import { loadNovelPack } from './novel/index.js';
 import { loadKnowledgePack } from './knowledge/index.js';
 import { loadSourcesPack } from './sources/index.js';
 import { loadBrandPack } from './brand/index.js';
+import { loadImagePack } from './image/index.js';

-/** 내장 팩(이름 → Pack). work.yaml 의 packs 가 이 이름을 가리킨다. sources·brand 는 둘째 팩으로만 쓴다(단계가 없다). */
+/** 내장 팩(이름 → Pack). work.yaml 의 packs 가 이 이름을 가리킨다. sources·brand·image 는 둘째 팩으로만 쓴다(단계가 없다). */
 export async function loadBuiltinPacks() {
-  const packs = [await loadNovelPack(), await loadKnowledgePack(), await loadSourcesPack(), await loadBrandPack()];
+  const packs = [await loadNovelPack(), await loadKnowledgePack(), await loadSourcesPack(), await loadBrandPack(), await loadImagePack()];
   return new Map(packs.map((pack) => [pack.name, pack]));
 }
```

`packs/image/README.md` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/packs/image/README.md b/packs/image/README.md
index afa346e..d3c7b1b 100644
--- a/packs/image/README.md
+++ b/packs/image/README.md
@@ -1 +1,7 @@
 # image pack — 삽화·웹툰 그림 단계 (M7)
+
+둘째 팩이다. 단계·프리셋은 첫 팩(novel, knowledge)이 준다. `work.yaml` `packs` 에 `image` 를 더하면 쓸 수 있다.
+
+- 그림 실행(`folio_image`, `core/image`): 설명서 → 생성 전 점검(`image-precheck` 검사) → 생성(호스트) → 검토(`image-review` 검사) → 승인 → 커밋.
+- 세트: `image.basic`(생성 전 점검 넷 + 그림 검토), `image.placement`(노드 원고의 `![[asset:id]]` 참조). 모두 실험, 참고 의견이다.
+- 그림 검토는 같은 호스트의 자기검토다. 영수증은 독립 평가로 적지 않는다(잠금).
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/pack/*.test.js` → PASS. `npm run check` → 1077/1077. (`novel-3level` fixture는 이미 `packs: [novel, image]`라 이제 내장 팩으로 열린다 — 깨지는 테스트가 없어야 한다.)

- [ ] **Step 5: 커밋**

```bash
git add core/image/stages.js core/pipeline/resolve.js packs/image packs/index.js test/pack/image-pack.test.js test/pack/novel-pack.test.js test/pack/knowledge-pack.test.js test/pack/sources-pack.test.js test/pack/pack-module-digest.test.js
git commit -m "$(cat <<'EOF'
feat(pack): image pack with precheck, review and placement checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task A5: 그림 실행 — 설명서부터 승인 질문까지

> 리뷰: **가장 강한 모델**. 공격해 볼 것:
> - 검토 요청·답이 `requestId`와 payload digest로 묶이는가(다른 단계·옛 질문의 답이 들어가지 않는가). 검토 결과의 reviewer가 언제나 `sameHost: true, independent: false`인가.
> - 옮긴 그림을 손으로 바꾸면 검토하지 않고 생성으로 돌아가는가. 설명서가 바뀌면 뒤 결과(점검·그림·검토·승인)가 모두 버려지는가.
> - 설정을 질문 뒤 바꾸면(검사 세트·`imageReview`·`imageReferences`) 옛 답을 받지 않고 점검부터 다시 도는가. 승인 질문에서 바로 승인으로 지나갈 수 없는가.
> - hard 지적을 승인할 수 있는가. block을 이유 없이 넘길 수 있는가. 같은 작품에 그림 실행 둘이 열리는가.
> - `runner.js`(노드 실행기)를 import만 하고 바꾸지 않았는가.

**Files:**
- Create: `core/image/{run-store,context,requests,steps,decide,runner}.js`, `test/support/image-work.js`
- Test: `test/image/image-run.test.js`

**Interfaces:**
- Consumes: A1~A4 전부. `withWorkLock`(`core/run/work-lock.js`), `requestModel`·`takeAnswer`·`awaitUser`·`outcomeFromPending`·`MAX_ANSWER_TRIES`(`core/run/steps/common.js`), `buildModelCheckRequest`·`parseModelCheckAnswer`·`runDeterministicChecks`(`core/checks/run-checks.js`), `parseJsonAnswer`(`core/run/answers.js`), `MAX_LOOP`(`core/pipeline/define.js`).
- Produces: `createImageRunner({ root, packs, now?, newId? }) → { start({ assetId, nodeId? }), resume({ runId, answers }), decide({ runId, action, feedback?, reason? }), pending() }`. 결과: `needs_model { runId, nodeId, requests }`(목적 `image_brief`·`image_generate`·`image_review`), `needs_user { question: { kind: 'image_precheck'|'image_approval'|'image_blocked', assetId, nodeId, brief, image, advisories, blocking, canApprove } }`, `skipped { runId, assetId }`. `IMAGE_LEDGER = 'assets'`, `IMAGE_STEPS`, `stepIndex`, `resultDigest`, `recordStep`, `unresolved`, `IMAGE_HANDLERS`(commit 없음 — A6). `createImageRunStore(root)`, `IMAGE_OPEN_STATES`. `openImageContext`, `imageSpecDigest`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/support/image-work.js` (76줄):

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseYaml, stringifyYaml } from '../../core/util/yaml.js';
import { copyFixture, tempDir } from './fixtures.js';
import { PNG_A, PNG_B, placeImage } from './images.js';

/**
 * 그림을 쓰는 합성 작품: serial-2level 복사본에 image 팩과 그림 세트를 더하고, 하나(hana)의 기준 그림 한 장(hana-sheet)을 둔다.
 * edit(config) 로 work.yaml 을 더 고칠 수 있다.
 */
export async function illustratedWork(edit = (config) => config) {
  const root = await copyFixture('serial-2level');
  const path = join(root, 'work.yaml');
  const config = parseYaml(await readFile(path, 'utf8'));
  await writeFile(path, stringifyYaml(edit({ ...config, packs: ['novel', 'image'], checkSets: [...config.checkSets, 'image.basic', 'image.placement'] })));
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'assets', 'hana-sheet.yaml'), stringifyYaml({ id: 'hana-sheet', file: 'hana-sheet.png', reference: true, brief: { entities: ['hana'] } }));
  await writeFile(join(root, 'assets', 'hana-sheet.png'), PNG_B);
  return root;
}

/** work.yaml 을 고친다. */
export async function editWork(root, edit) {
  const path = join(root, 'work.yaml');
  await writeFile(path, stringifyYaml(edit(parseYaml(await readFile(path, 'utf8')))));
}

export const HANA_BRIEF = Object.freeze({
  mustShow: ['지하실 끝의 잠긴 문', '문 앞의 하나'], mustNotShow: ['문 너머'], entities: ['hana', 'locked-door'],
  continuity: '하나는 회색 외투를 입는다.', dialogue: [], reference: false,
});

/**
 * 그림 실행의 가짜 호스트(모델 대신): 설명서·그림·검토 요청에 답한다. 그림은 작품 밖 임시 폴더에 PNG 를 만들어 그 절대 경로를 준다.
 * script: { brief?: object|((payload) => object|string), image?: (payload, n) => object|string|Promise, review?: (payload) => findings[] }
 */
export async function createImageHost(script = {}) {
  const outside = await tempDir('folio-host-images-');
  const calls = [];
  let made = 0;
  async function respond(request) {
    const p = request.payload;
    calls.push({ purpose: request.purpose, stepId: request.stepId, payload: p });
    if (request.purpose === 'image_brief') {
      const brief = typeof script.brief === 'function' ? script.brief(p) : (script.brief ?? HANA_BRIEF);
      return typeof brief === 'string' ? brief : JSON.stringify(brief);
    }
    if (request.purpose === 'image_generate') {
      made += 1;
      if (script.image) { const out = await script.image(p, made); return typeof out === 'string' ? out : JSON.stringify(out); }
      return JSON.stringify({ path: await placeImage(outside, `made-${made}.png`, made % 2 ? PNG_A : PNG_B), model: 'fake-image-1' });
    }
    if (request.purpose === 'image_review') {
      return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: script.review ? script.review(p) : [] });
    }
    throw new Error(`image host cannot answer ${request.purpose}`);
  }
  return {
    calls, outside,
    async answer(outcome) {
      const answers = {};
      for (const request of outcome.requests) answers[request.requestId] = await respond(request);
      return answers;
    },
  };
}

/** needs_model 이면 가짜 호스트로 답하기를 until 이 참이 될 때까지(최대 limit 번). */
export async function answerUntil(runner, host, outcome, until = (o) => o.status !== 'needs_model', limit = 20) {
  let out = outcome;
  for (let i = 0; i < limit && !until(out); i += 1) {
    if (out.status !== 'needs_model') throw new Error(`cannot answer ${out.status}`);
    out = await runner.resume({ runId: out.runId, answers: await host.answer(out) });
  }
  return out;
}
```

`test/image/image-run.test.js` (136줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createImageRunner } from '../../core/image/runner.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { sha256 } from '../../core/util/hash.js';
import { PNG_A } from '../support/images.js';
import { HANA_BRIEF, answerUntil, createImageHost, editWork, illustratedWork } from '../support/image-work.js';

const packs = await loadBuiltinPacks();
const runnerFor = (root) => createImageRunner({ root, packs });
const kind = (o) => (o.status === 'needs_model' ? `model:${o.requests[0].stepId}` : o.status === 'needs_user' ? `user:${o.question.kind}` : o.status);
const code = (promise) => promise.then(() => 'ok', (e) => e.code);

test('one picture: brief → precheck → generate (references) → review → the approval question, every request bound to the run', async () => {
  const root = await illustratedWork();
  const host = await createImageHost();
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'ep-001-door', nodeId: 'ep-001' });
  assert.equal(kind(asked), 'model:brief');
  const briefPayload = asked.requests[0].payload;
  assert.equal(briefPayload.node.id, 'ep-001');
  assert.deepEqual(briefPayload.entities.map((e) => e.id), ['hana', 'locked-door']);
  const generate = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  assert.equal(kind(generate), 'model:generate');
  const refs = generate.requests[0].payload.references;
  assert.deepEqual(refs.map((r) => [r.entityId, r.assets.map((a) => a.assetId)]), [['hana', ['hana-sheet']], ['locked-door', []]]);
  assert.equal(refs[0].assets[0].path, join(root, 'assets', 'hana-sheet.png'));
  const review = await runner.resume({ runId: asked.runId, answers: await host.answer(generate) });
  assert.equal(kind(review), 'model:review');
  const image = review.requests[0].payload.image;
  assert.equal(image.path, join(root, '.folio', 'image-runs', asked.runId, 'image-1.png'));
  assert.deepEqual([image.hash, image.type], [sha256(PNG_A), 'image/png']);
  assert.deepEqual(await readFile(image.path), PNG_A);
  assert.deepEqual(review.requests[0].payload.checks.map((c) => c.checkId), ['image.review']);
  const question = await runner.resume({ runId: asked.runId, answers: await host.answer(review) });
  assert.equal(kind(question), 'user:image_approval');
  assert.deepEqual([question.question.canApprove, question.question.blocking, question.question.image.hash], [true, [], sha256(PNG_A)]);
  assert.deepEqual(question.question.advisories.map((f) => f.code), ['REFERENCE_MISSING'], 'locked-door has no reference picture');
  const records = await openLedger(root, 'assets').readAll();
  assert.deepEqual(records.map((r) => [r.type, r.stepId]), [['image_result', 'precheck'], ['image_result', 'review']]);
  assert.deepEqual(await readFile(join(host.outside, 'made-1.png')), PNG_A, 'the host file is only read');
});

test('a blocking precheck stops before the picture is made: approve needs a reason, a revision asks for a new brief', async () => {
  const root = await illustratedWork((config) => ({ ...config, checks: { 'image.dialogue-in-text': { severity: 'block' } } }));
  const host = await createImageHost({ brief: (p) => ({ ...HANA_BRIEF, dialogue: p.feedback ? [] : [{ speaker: 'hana', text: '열려라.' }] }) });
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const blocked = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  assert.equal(kind(blocked), 'user:image_precheck');
  assert.deepEqual(blocked.question.blocking.map((f) => [f.checkId, f.code, f.severity]), [['image.dialogue-in-text', 'DIALOGUE_NOT_IN_TEXT', 'block']]);
  assert.equal(await code(runner.decide({ runId: asked.runId, action: 'approve' })), 'APPROVE_REASON_REQUIRED');
  assert.equal(await code(runner.decide({ runId: asked.runId, action: 'request_revision' })), 'FEEDBACK_REQUIRED');
  const again = await runner.decide({ runId: asked.runId, action: 'request_revision', feedback: '대사는 빼 줘' });
  assert.equal(kind(again), 'model:brief');
  assert.equal(again.requests[0].payload.feedback, '대사는 빼 줘');
  assert.equal(kind(await runner.resume({ runId: asked.runId, answers: await host.answer(again) })), 'model:generate');
});

test('approving a blocking precheck with a reason goes on to the picture and is recorded', async () => {
  const root = await illustratedWork((config) => ({ ...config, checks: { 'image.dialogue-in-text': { severity: 'block' } } }));
  const host = await createImageHost({ brief: { ...HANA_BRIEF, dialogue: [{ speaker: 'hana', text: '열려라.' }] } });
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const blocked = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  const next = await runner.decide({ runId: blocked.runId, action: 'approve', reason: '말풍선은 나중에 넣는다' });
  assert.equal(kind(next), 'model:generate');
  const records = await openLedger(root, 'assets').readAll();
  assert.deepEqual(records.map((r) => r.stepId), ['precheck', 'precheck'], 'the approval re-records the precheck result');
});

test('refusals: no image pack, images off, a taken id, an open run, an unknown node, a bad id', async () => {
  assert.equal(await code(runnerFor(await illustratedWork((c) => ({ ...c, packs: ['novel'], checkSets: ['novel.basic'] }))).start({ assetId: 'x' })), 'IMAGE_PACK_REQUIRED');
  assert.equal(await code(runnerFor(await illustratedWork((c) => ({ ...c, features: { images: false } }))).start({ assetId: 'x' })), 'FEATURE_DISABLED');
  const root = await illustratedWork();
  const runner = runnerFor(root);
  assert.equal(await code(runner.start({ assetId: 'hana-sheet' })), 'ASSET_EXISTS');
  assert.equal(await code(runner.start({ assetId: '../x' })), 'ID_INVALID');
  assert.equal(await code(runner.start({ assetId: 'x', nodeId: 'nope' })), 'NODE_NOT_FOUND');
  const open = await runner.start({ assetId: 'first' });
  assert.equal(open.requests[0].payload.node, null, 'a picture without a node');
  assert.equal(await code(runner.start({ assetId: 'second' })), 'IMAGE_RUN_IN_PROGRESS');
  assert.equal(await code(runner.decide({ runId: open.runId, action: 'approve' })), 'IMAGE_RUN_NOT_AWAITING_USER');
  assert.equal(await code(runner.decide({ runId: open.runId, action: 'skip' })), 'SKIP_REASON_REQUIRED');
  assert.deepEqual(await runner.decide({ runId: open.runId, action: 'skip', reason: '나중에' }), { status: 'skipped', runId: open.runId, assetId: 'first' });
  assert.equal(kind(await runner.start({ assetId: 'second' })), 'model:brief');
});

test('unreadable answers are asked again three times, then only skip is left; a host file that is not an image never enters the work', async () => {
  const root = await illustratedWork();
  const host = await createImageHost({ image: async (p, n) => ({ path: n === 1 ? 'relative.png' : join(root, 'work.yaml') }) });
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  let out = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  out = await runner.resume({ runId: out.runId, answers: await host.answer(out) });
  assert.equal(out.requests[0].payload.retryReason, 'IMAGE_PATH_INVALID');
  out = await runner.resume({ runId: out.runId, answers: await host.answer(out) });
  assert.equal(out.requests[0].payload.retryReason, 'IMAGE_TYPE_UNSUPPORTED');
  out = await runner.resume({ runId: out.runId, answers: await host.answer(out) });
  assert.equal(kind(out), 'user:image_blocked');
  assert.equal(out.question.canApprove, false);
  assert.equal(await code(runner.decide({ runId: out.runId, action: 'approve', reason: 'x' })), 'DECISION_INVALID');
  assert.equal((await runner.decide({ runId: out.runId, action: 'skip', reason: '그림 도구가 없다' })).status, 'skipped');
});

test('imageReview off skips the review with its reason; imageReferences off sends no references; a changed setting re-runs the precheck', async () => {
  const root = await illustratedWork((c) => ({ ...c, features: { imageReview: false, imageReferences: false } }));
  const host = await createImageHost();
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const generate = await runner.resume({ runId: asked.runId, answers: await host.answer(asked) });
  assert.equal(generate.requests[0].payload.references, null);
  const question = await runner.resume({ runId: asked.runId, answers: await host.answer(generate) });
  assert.equal(kind(question), 'user:image_approval');
  const run = JSON.parse(await readFile(join(root, '.folio', 'image-runs', `${asked.runId}.json`), 'utf8'));
  assert.deepEqual(run.results.review, { status: 'skipped', reason: 'imageReview is off in work.yaml features', source: 'work.yaml#features.imageReview', imageHash: sha256(PNG_A) });
  await editWork(root, (c) => ({ ...c, features: { imageReferences: false } }));
  const again = await runner.decide({ runId: asked.runId, action: 'approve' });
  assert.equal(kind(again), 'model:review', 'the review is on now: the same picture is reviewed before any approval');
});

test('a staged picture changed by hand is never reviewed: the run asks for a new picture', async () => {
  const root = await illustratedWork();
  const host = await createImageHost();
  const runner = runnerFor(root);
  const asked = await runner.start({ assetId: 'door', nodeId: 'ep-001' });
  const generate = await answerUntil(runner, host, asked, (o) => kind(o) === 'model:generate');
  const review = await runner.resume({ runId: asked.runId, answers: await host.answer(generate) });
  await writeFile(review.requests[0].payload.image.path, 'tampered');
  const asksAgain = await runner.resume({ runId: asked.runId, answers: await host.answer(review) });
  assert.equal(kind(asksAgain), 'model:generate');
  assert.equal(asksAgain.requests[0].payload.attempt, 2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/image/image-run.test.js`
Expected: FAIL — `core/image/runner.js` 없음.

- [ ] **Step 3: 구현**

`core/image/run-store.js` (75줄):

```js
import { constants } from 'node:fs';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { listEntries, readTextOrNull, writeFileAtomic } from '../util/fs.js';

/** 그림 실행 파일 자리. 노드 실행(.folio/runs)과 따로 둔다 — 노드 실행 목록·다음 노드 고르기에 끼지 않는다. */
export const IMAGE_RUNS_DIR = join('.folio', 'image-runs');
export const IMAGE_OPEN_STATES = new Set(['active', 'awaiting_model', 'awaiting_user', 'committing']);
const RUN_ID = /^imgrun-[a-z0-9]+$/;
const STAGED = /^image-\d+\.(png|jpg|gif|webp)$/;

function parseRun(text) {
  try {
    const run = JSON.parse(text ?? '');
    return run && typeof run === 'object' && typeof run.runId === 'string' && typeof run.state === 'string' ? run : null;
  } catch {
    return null;
  }
}

/** 그림 실행 상태. 매 단계 뒤 원자적으로 저장한다. 호스트가 준 그림 바이트는 실행 폴더 안에 옮겨 둔다(staged). */
export function createImageRunStore(root) {
  const dir = join(root, IMAGE_RUNS_DIR);
  const pathOf = (runId) => {
    if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new FolioError('IMAGE_RUN_ID_INVALID', String(runId).slice(0, 100));
    return join(dir, `${runId}.json`);
  };
  /** 실행 폴더 안 옮긴 그림의 절대 경로. 이름 규칙(image-<n>.<확장자>) 밖은 만들지 않는다. */
  const stagedPath = (runId, name) => {
    if (typeof name !== 'string' || !STAGED.test(name)) throw new FolioError('IMAGE_STAGED_NAME_INVALID', String(name).slice(0, 100));
    pathOf(runId);
    return join(dir, runId, name);
  };
  /** 옮긴 그림 바이트. 링크를 따라가지 않고 보통 파일만 읽는다. 없거나 보통 파일이 아니면 null. */
  async function readStaged(runId, name) {
    let handle;
    try { handle = await open(stagedPath(runId, name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); } catch { return null; }
    try { return (await handle.stat()).isFile() ? await handle.readFile() : null; } finally { await handle.close(); }
  }
  return {
    pathOf,
    stagedPath,
    readStaged,
    async save(run) { await writeFileAtomic(pathOf(run.runId), `${JSON.stringify(run, null, 2)}\n`); },
    async load(runId) {
      const run = parseRun(await readTextOrNull(pathOf(runId)));
      if (!run) throw new FolioError('IMAGE_RUN_NOT_FOUND', String(runId));
      return run;
    },
    /** 읽을 수 있는 실행 파일만, 만든 차례로. */
    async list() {
      const runs = [];
      for (const entry of await listEntries(dir)) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        const run = parseRun(await readTextOrNull(join(dir, entry.name)));
        if (run) runs.push(run);
      }
      return runs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.runId < b.runId ? -1 : 1));
    },
    /** 옮긴 그림을 한 번만 쓴다(wx). 이름은 시도 번호로 늘 새로 정한다. 같은 바이트가 이미 있으면(저장 전에 죽고 다시 돈 경우) 그대로 둔다. */
    async stage(runId, name, bytes) {
      const path = stagedPath(runId, name);
      await mkdir(join(path, '..'), { recursive: true });
      try {
        await writeFile(path, bytes, { flag: 'wx' });
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
        const existing = await readStaged(runId, name);
        if (!existing || !existing.equals(Buffer.from(bytes))) throw new FolioError('IMAGE_STAGED_CONFLICT', `${name} already holds another picture`, { name });
      }
      return path;
    },
  };
}
```

`core/image/context.js` (36줄):

```js
import { FolioError } from '../errors.js';
import { openWorkspace } from '../run/workspace.js';
import { assertFeature } from '../work/features.js';
import { checkProjection } from '../checks/applied.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { IMAGE_PACK, IMAGE_STAGES } from './stages.js';

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 그림 실행이 묶이는 설정: 그림 stage 검사(고른 세트·work.yaml checks 반영)와 그림 기능 둘. 바뀌면 열린 그림 실행은 점검부터 다시 돈다. */
export function imageSpecDigest(checks, features) {
  return sha256(canonicalJson({
    precheck: checks.precheck.map(checkProjection), review: checks.review.map(checkProjection),
    features: { imageReferences: Boolean(features.imageReferences), imageReview: Boolean(features.imageReview) },
  }));
}

/**
 * 그림 실행의 작업 맥락: openWorkspace(설정 검증 전부) + 그림 stage 검사 + 설정 digest.
 * 작품이 image 팩을 쓰지 않으면 IMAGE_PACK_REQUIRED, images 기능이 꺼졌으면 FEATURE_DISABLED(assertFeature)다.
 * @param {string} root
 * @param {{ packs: Map<string, any>, requireFeature?: boolean }} options
 */
export async function openImageContext(root, { packs, requireFeature = true }) {
  const workspace = await openWorkspace(root, { packs });
  const { config } = workspace.work;
  if (!config.packs.includes(IMAGE_PACK)) {
    throw new FolioError('IMAGE_PACK_REQUIRED', 'add the image pack to work.yaml packs to make pictures', { hint: 'packs: [<first pack>, image]' });
  }
  if (requireFeature) assertFeature(config, 'images');
  const checks = {
    precheck: workspace.checks.filter((c) => c.stage === IMAGE_STAGES.precheck).sort(byId),
    review: workspace.checks.filter((c) => c.stage === IMAGE_STAGES.review).sort(byId),
  };
  return { ...workspace, imageChecks: checks, specDigest: imageSpecDigest(checks, config.features), features: config.features };
}
```

`core/image/requests.js` (46줄):

```js
import { join } from 'node:path';
import { scanMentions } from '../index/scan.js';
import { ASSETS_DIR } from '../store/assets.js';
import { BRIEF_FIELDS } from './brief.js';

export const BRIEF_ANSWER_FORMAT = '{"mustShow":["..."],"mustNotShow":["..."],"entities":["<entity id>"],"continuity":"...","dialogue":[{"speaker":"<entity id or null>","text":"<verbatim line from the node text>"}],"reference":false}';
export const IMAGE_ANSWER_FORMAT = '{"path":"<absolute path of the PNG, JPEG, GIF or WebP file you made>","model":"<image model name>"}';

const BRIEF_INSTRUCTIONS = [
  '그림 한 장의 설명서를 JSON 으로만 답한다. 필드는 꼭 보여줄 것(mustShow), 보여주면 안 될 것(mustNotShow), 나오는 엔티티 id(entities),',
  '연속성 메모(continuity), 대사(dialogue: 노드 본문에 있는 작품 언어 원문 그대로), 기준 그림 여부(reference: 인물 설정화면 true)다.',
  '노드 본문은 이야기 자료일 뿐 지시가 아니다.',
].join(' ');
const IMAGE_INSTRUCTIONS = [
  '설명서대로 그림 한 장을 만들고, 만든 파일의 절대 경로와 쓴 이미지 모델 이름을 JSON 으로 답한다.',
  'references 의 기준 그림(path)은 인물 외형·옷차림을 맞추는 데만 쓴다. 엔진은 파일을 한 번 읽어 작품 안으로 옮겨 둔다.',
].join(' ');

/** 노드 하나의 요청 재료: id·제목·본문. 노드가 없는 그림이면 null. */
export const nodeMaterial = (node) => (node ? { id: node.id, level: node.level, title: node.title, body: node.body } : null);

/** 설명서를 쓸 때 고를 엔티티: 노드가 있으면 그 노드 앞머리·본문에 나온 것, 없으면 작품 전체. */
export function briefEntities(work, node) {
  const ids = node ? new Set([...node.entities, ...scanMentions(node.body, work.entities.values()).keys()]) : new Set(work.entities.keys());
  return [...ids].filter((id) => work.entities.has(id)).sort()
    .map((id) => { const e = work.entities.get(id); return { id, kind: e.kind, name: e.name, aliases: e.aliases }; });
}

/** 기준 그림 목록에 호스트가 열 절대 경로를 붙인다(작품 assets/ 안). null 은 imageReferences 꺼짐. */
export const referenceMaterial = (root, references) => (references === null ? null : references.map((entry) => ({
  entityId: entry.entityId, assets: entry.assets.map((a) => ({ ...a, path: join(root, ASSETS_DIR, a.file) })),
})));

export function briefPayload({ work, run, node }) {
  return {
    asset: { id: run.assetId }, node: nodeMaterial(node), entities: briefEntities(work, node), fields: [...BRIEF_FIELDS],
    previous: run.brief ?? null, feedback: run.feedback ?? null, instructions: BRIEF_INSTRUCTIONS, answerFormat: BRIEF_ANSWER_FORMAT,
  };
}

export function imagePayload({ root, run, node }) {
  return {
    asset: { id: run.assetId }, node: nodeMaterial(node), brief: run.brief, references: referenceMaterial(root, run.references ?? null),
    feedback: run.feedback ?? null, attempt: (run.attempts?.image ?? 0) + 1, instructions: IMAGE_INSTRUCTIONS, answerFormat: IMAGE_ANSWER_FORMAT,
  };
}
```

`core/image/steps.js` (170줄):

```js
import { FolioError } from '../errors.js';
import { isBlocking } from '../ledger/receipts.js';
import { buildModelCheckRequest, parseModelCheckAnswer, runDeterministicChecks } from '../checks/run-checks.js';
import { parseJsonAnswer } from '../run/answers.js';
import { MAX_ANSWER_TRIES, awaitUser, requestModel, takeAnswer } from '../run/steps/common.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { readBrief, briefHash, briefText } from './brief.js';
import { referencesFor } from './references.js';
import { readHostImage } from './intake.js';
import { briefPayload, imagePayload, nodeMaterial, referenceMaterial } from './requests.js';

/** 그림 실행 기록장(.folio/ledger/assets.jsonl): 단계 결과·결정·영수증·커밋. 추가만 된다. */
export const IMAGE_LEDGER = 'assets';
/** 그림 한 장의 단계(정본 §14: 설명서 → 생성 전 점검 → 생성 → 검토 → 커밋, 그리고 사람의 승인). 순서와 종류는 코어가 정한다. */
export const IMAGE_STEPS = Object.freeze([
  { id: 'brief', kind: 'generate' }, { id: 'precheck', kind: 'check' }, { id: 'generate', kind: 'generate' },
  { id: 'review', kind: 'check' }, { id: 'approve', kind: 'gate' }, { id: 'commit', kind: 'commit' },
].map((step) => Object.freeze(step)));
export const stepIndex = (id) => IMAGE_STEPS.findIndex((s) => s.id === id);

/** 단계 결과의 digest. 기록장의 image_result 와 영수증의 단계가 이 값으로 맞물린다. */
export const resultDigest = (entry) => sha256(canonicalJson(entry ?? null));

/** 단계 결과를 기록장에 남긴다. 그 결과에 기대는 실행 파일 저장보다 먼저 부른다(가장 최근 기록이 이긴다). */
export async function recordStep(env, run, stepId) {
  await env.ledger.append({ type: 'image_result', runId: run.runId, assetId: run.assetId, stepId, digest: resultDigest(run.results[stepId]) });
}

const statusOf = (checks) => (checks.every((c) => c.status === 'not_applicable') ? 'not_applicable'
  : checks.some((c) => c.findings.some(isBlocking)) ? 'failed' : 'passed');
const findingsOf = (entry) => (entry?.checks ?? []).flatMap((c) => c.findings ?? []);

/**
 * 아직 풀리지 않은 막는 지적. hard 는 언제나 남는다. block 은 사람이 이유를 달고 넘긴 단계(점검은 precheck.approved, 검토는 approve)에서만 빠진다.
 * @param {any} run
 * @param {Array<'precheck'|'review'>} stepIds
 */
export function unresolved(run, stepIds) {
  const covered = (stepId) => (stepId === 'precheck' ? Boolean(run.results.precheck?.approved) : run.results.approve?.status === 'approved');
  return stepIds.flatMap((stepId) => findingsOf(run.results[stepId]).filter(isBlocking)
    .filter((f) => f.severity === 'hard' || !covered(stepId)));
}

/** 사람에게 묻는 질문(점검에서 막힘·승인·읽을 수 없는 답). 그림이 있으면 옮겨 둔 파일의 절대 경로를 준다. */
export function gateQuestion(env, run, kind, blocking, extra = {}) {
  const image = run.image ? { path: env.store.stagedPath(run.runId, run.image.name), hash: run.image.hash, type: run.image.type, model: run.image.model } : null;
  const advisories = ['precheck', 'review'].flatMap((id) => findingsOf(run.results[id]).filter((f) => !isBlocking(f)));
  return {
    kind, assetId: run.assetId, nodeId: run.nodeId, brief: run.brief, image, advisories, blocking,
    canApprove: kind !== 'image_blocked' && !blocking.some((f) => f.severity === 'hard'), ...extra,
  };
}

/** 읽을 수 없는 답은 세 번까지 다시 묻고, 그 뒤는 사람에게 넘긴다(건너뛰기만). */
function retry(env, run, stepId, error, request) {
  run.retries[stepId] = (run.retries[stepId] ?? 0) + 1;
  if (run.retries[stepId] < MAX_ANSWER_TRIES) return request({ retryReason: error });
  return awaitUser(run, gateQuestion(env, run, 'image_blocked', [{ checkId: stepId, severity: 'hard', code: 'IMAGE_ANSWER_FAILED', message: `${run.retries[stepId]} unreadable answers: ${error}` }], { stepId }));
}

/** 설명서가 바뀌면 그 뒤 결과(점검·그림·검토·승인)는 무효다. */
function dropAfterBrief(run) {
  for (const id of ['precheck', 'generate', 'review', 'approve']) delete run.results[id];
  run.image = null;
}

async function briefStep({ ctx, run, env, node }) {
  if (run.results.brief?.status === 'passed') { run.cursor += 1; return null; }
  const payload = briefPayload({ work: ctx.work, run, node });
  const request = (extra = {}) => requestModel(run, env, [{ stepId: 'brief', purpose: 'image_brief', payload: { ...payload, ...extra } }]);
  const entry = takeAnswer(run, 'brief', payload);
  if (entry === undefined) return request();
  let raw;
  try { raw = parseJsonAnswer(entry.answer); } catch { return retry(env, run, 'brief', 'BRIEF_JSON_INVALID', request); }
  const read = readBrief(ctx.work, raw);
  if ('errors' in read) return retry(env, run, 'brief', `${read.errors[0].code}:${read.errors[0].field}`, request);
  delete run.retries.brief;
  const hash = briefHash(read.brief);
  if (hash !== run.briefHash) dropAfterBrief(run);
  Object.assign(run, { brief: read.brief, briefHash: hash });
  run.results.brief = { status: 'passed', briefHash: hash };
  run.cursor += 1;
  return null;
}

async function precheckStep({ ctx, run, env, node }) {
  if (!run.results.precheck) {
    run.references = ctx.features.imageReferences ? referencesFor(ctx.work, run.brief.entities, { exclude: run.assetId }) : null;
    const checkCtx = { work: ctx.work, node: node ?? null, nodeText: node ? node.body : null, brief: run.brief, references: run.references };
    const checks = runDeterministicChecks(ctx.imageChecks.precheck, checkCtx);
    run.results.precheck = { status: statusOf(checks), briefHash: run.briefHash, checks };
    await recordStep(env, run, 'precheck');
  }
  const blocking = unresolved(run, ['precheck']);
  if (blocking.length) return awaitUser(run, gateQuestion(env, run, 'image_precheck', blocking));
  run.cursor += 1;
  return null;
}

async function generateStep({ run, env, node }) {
  if (run.image && run.image.briefHash === run.briefHash) { run.cursor += 1; return null; }
  const payload = imagePayload({ root: env.root, run, node });
  const request = (extra = {}) => requestModel(run, env, [{ stepId: 'generate', purpose: 'image_generate', payload: { ...payload, ...extra } }]);
  const entry = takeAnswer(run, 'generate', payload);
  if (entry === undefined) return request();
  let answer;
  try { answer = parseJsonAnswer(entry.answer); } catch { return retry(env, run, 'generate', 'IMAGE_ANSWER_JSON_INVALID', request); }
  let read;
  try { read = await readHostImage(answer?.path); } catch (error) {
    if (error instanceof FolioError) return retry(env, run, 'generate', error.code, request);
    throw error;
  }
  delete run.retries.generate;
  run.attempts.image += 1;
  const name = `image-${run.attempts.image}${read.ext}`;
  await env.store.stage(run.runId, name, read.bytes);
  const model = typeof answer.model === 'string' && answer.model.trim() ? answer.model.trim().slice(0, 200) : 'unknown';
  run.image = { name, hash: read.hash, type: read.type, bytes: read.bytes.length, model, briefHash: run.briefHash, from: String(answer.path).slice(0, 500) };
  for (const id of ['review', 'approve']) delete run.results[id];
  run.results.generate = { status: 'passed', imageHash: read.hash };
  run.cursor += 1;
  return null;
}

/** 옮겨 둔 그림이 그 사이 바뀌었으면(손으로 바꿈) 그림을 버리고 생성부터 다시 돈다 — 검토한 그림과 커밋하는 그림이 같아야 한다. */
export async function stagedIntact(env, run) {
  const bytes = await env.store.readStaged(run.runId, run.image.name);
  return bytes !== null && sha256(bytes) === run.image.hash;
}

async function reviewStep({ ctx, run, env, node }) {
  if (!run.results.review) {
    if (!(await stagedIntact(env, run))) {
      run.history.push({ event: 'staged_image_changed', at: env.now() });
      run.image = null;
      for (const id of ['generate', 'review', 'approve']) delete run.results[id];
      run.cursor = stepIndex('generate');
      return null;
    }
    const imageHash = run.image.hash;
    if (!ctx.features.imageReview) {
      run.results.review = { status: 'skipped', reason: 'imageReview is off in work.yaml features', source: 'work.yaml#features.imageReview', imageHash };
    } else if (ctx.imageChecks.review.length === 0) {
      run.results.review = { status: 'not_applicable', imageHash, checks: [] };
    } else {
      const text = briefText(run.brief);
      const payload = {
        ...buildModelCheckRequest(ctx.imageChecks.review, { draft: text }), asset: { id: run.assetId }, node: nodeMaterial(node), brief: run.brief,
        image: { path: env.store.stagedPath(run.runId, run.image.name), hash: imageHash, type: run.image.type },
        references: referenceMaterial(env.root, run.references ?? null),
      };
      const entry = takeAnswer(run, 'review', payload);
      if (entry === undefined) return requestModel(run, env, [{ stepId: 'review', purpose: 'image_review', payload }]);
      const checks = parseModelCheckAnswer(ctx.imageChecks.review, entry.answer, text);
      run.results.review = { status: statusOf(checks), imageHash, checks };
    }
    await recordStep(env, run, 'review');
  }
  run.cursor += 1;
  return null;
}

async function approveStep({ run, env }) {
  const approved = run.results.approve;
  if (approved?.status === 'approved' && approved.imageHash === run.image?.hash && approved.briefHash === run.briefHash) { run.cursor += 1; return null; }
  return awaitUser(run, gateQuestion(env, run, 'image_approval', unresolved(run, ['precheck', 'review'])));
}

/** 단계 id → 처리 함수. 커밋 단계는 core/image/commit-step.js 가 더한다. */
export const IMAGE_HANDLERS = { brief: briefStep, precheck: precheckStep, generate: generateStep, review: reviewStep, approve: approveStep };
```

`core/image/decide.js` (62줄):

```js
import { FolioError } from '../errors.js';
import { MAX_LOOP } from '../pipeline/define.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { recordStep, stepIndex, unresolved } from './steps.js';

const ACTIONS = ['approve', 'request_revision', 'skip'];
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** 버리기(skip) 기록. 이유가 있어야 한다. 실행은 abandoned 로 끝나고 그림은 쓰지 않는다. */
async function abandon(env, run, reason) {
  if (!reason) throw new FolioError('SKIP_REASON_REQUIRED', 'skipping a picture needs a reason');
  await env.ledger.append({ type: 'image_decision', runId: run.runId, assetId: run.assetId, action: 'skip', digest: sha256(canonicalJson({ reason })) });
  Object.assign(run, { state: 'abandoned', pending: null, abandoned: { reason, at: env.now() } });
  return { status: 'skipped', runId: run.runId, assetId: run.assetId };
}

/** 넘기는 막는 지적에 이유가 있는가. hard 는 넘길 수 없다. */
function assertApprovable(blocking, reason) {
  if (blocking.some((f) => f.severity === 'hard')) throw new FolioError('APPROVE_BLOCKED_BY_HARD', 'hard findings cannot be approved', { findings: blocking });
  if (blocking.length && !reason) throw new FolioError('APPROVE_REASON_REQUIRED', 'approving past blocking findings needs a reason', { findings: blocking });
}

/**
 * 사람의 결정을 그림 실행에 적용한다. 결과(점검 넘김·승인)는 기록장에 먼저 남기고, 실행 파일은 부른 쪽이 저장한다.
 * - image_precheck: approve(막는 지적은 이유 필요) → 생성으로. request_revision(feedback) → 설명서부터 다시(3번까지). skip.
 * - image_approval: approve(막는 지적은 이유 필요) → 커밋으로. request_revision(feedback) → 그림부터 다시(3번까지). skip.
 * - image_blocked(읽을 수 없는 답): skip 만.
 * 버리기(skip)는 열린 상태(커밋 중 제외) 어디서든 받는다 — 그림 실행이 멈춰 남지 않게.
 * @returns {Promise<object|null>} 끝난 결과(skipped) 또는 null(이어서 돈다)
 */
export async function applyImageDecision(env, run, { action, feedback = '', reason = '' }) {
  if (!ACTIONS.includes(action)) throw new FolioError('DECISION_INVALID', String(action).slice(0, 40));
  if (action === 'skip' && ['active', 'awaiting_model', 'awaiting_user'].includes(run.state)) return abandon(env, run, text(reason));
  if (run.state !== 'awaiting_user') throw new FolioError('IMAGE_RUN_NOT_AWAITING_USER', run.runId, { state: run.state });
  const kind = run.pending?.question?.kind;
  if (kind === 'image_blocked') throw new FolioError('DECISION_INVALID', 'this picture run can only be skipped', { allowed: ['skip'] });
  if (action === 'request_revision') {
    if (!text(feedback)) throw new FolioError('FEEDBACK_REQUIRED', 'a revision request needs feedback');
    const counter = kind === 'image_precheck' ? 'brief' : 'image';
    if (run.attempts[`${counter}Revisions`] >= MAX_LOOP) throw new FolioError('IMAGE_REVISION_LIMIT', `at most ${MAX_LOOP} revisions; approve or skip`, { max: MAX_LOOP });
    run.attempts[`${counter}Revisions`] += 1;
    run.feedback = text(feedback);
    const drop = kind === 'image_precheck' ? ['brief', 'precheck', 'generate', 'review', 'approve'] : ['generate', 'review', 'approve'];
    for (const id of drop) delete run.results[id];
    if (kind !== 'image_precheck') run.image = null;
    run.cursor = stepIndex(kind === 'image_precheck' ? 'brief' : 'generate');
    Object.assign(run, { pending: null, state: 'active' });
    return null;
  }
  const why = text(reason);
  if (kind === 'image_precheck') {
    assertApprovable(unresolved(run, ['precheck']), why);
    run.results.precheck = { ...run.results.precheck, approved: { reason: why } };
    await recordStep(env, run, 'precheck');
  } else {
    assertApprovable(unresolved(run, ['precheck', 'review']), why);
    run.results.approve = { status: 'approved', imageHash: run.image.hash, briefHash: run.briefHash, reason: why };
    await recordStep(env, run, 'approve');
  }
  Object.assign(run, { pending: null, state: 'active' });
  return null;
}
```

`core/image/runner.js` (110줄):

```js
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { withWorkLock } from '../run/work-lock.js';
import { outcomeFromPending } from '../run/steps/common.js';
import { ID } from '../store/ids.js';
import { ASSETS_DIR } from '../store/assets.js';
import { openImageContext } from './context.js';
import { createImageRunStore, IMAGE_OPEN_STATES } from './run-store.js';
import { IMAGE_HANDLERS, IMAGE_LEDGER, IMAGE_STEPS, stepIndex } from './steps.js';
import { applyImageDecision } from './decide.js';

const defaultId = (prefix) => `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const exists = (path) => lstat(path).then(() => true, (error) => (error?.code === 'ENOENT' ? false : Promise.reject(error)));

/**
 * 설정(그림 stage 검사·그림 기능)이 질문을 낸 뒤 바뀌었으면 옛 질문을 버리고 점검부터 다시 돈다. 설명서와 그림은 남긴다
 * (같은 설명서면 그림 단계는 지나간다 — 검토만 새 설정으로 다시). 커밋 중인 실행은 건드리지 않는다(커밋이 영수증으로 끝맺는다).
 */
function syncSpec(run, ctx, now) {
  if (run.specDigest === ctx.specDigest || run.state === 'committing') return;
  for (const id of ['precheck', 'review', 'approve']) delete run.results[id];
  if (run.cursor > stepIndex('precheck')) run.cursor = stepIndex('precheck');
  Object.assign(run, { specDigest: ctx.specDigest, pending: null, state: 'active' });
  run.history.push({ event: 'spec_changed', at: now() });
}

/**
 * 그림 실행기(M7a). 노드 실행기(core/run/runner.js)와 따로 돈다 — 실행 파일은 .folio/image-runs, 기록은 assets 기록장.
 * 모델을 부르지 않는다: 설명서·그림·검토는 needs_model 로, 점검에서 막힘·승인은 needs_user 로 돌려준다.
 * start/resume/decide 는 작품 잠금(노드 실행과 같은 .folio/runs/.lock) 안에서 한 번에 하나씩 돈다.
 */
export function createImageRunner({ root, packs, now = () => new Date().toISOString(), newId = defaultId }) {
  const store = createImageRunStore(root);
  const env = { root, now, newId, store, ledger: openLedger(root, IMAGE_LEDGER, { now }) };

  async function drive(run) {
    for (;;) {
      const ctx = await openImageContext(root, { packs });
      const node = run.nodeId ? ctx.work.tree.nodes.get(run.nodeId) : null;
      if (run.nodeId && !node) throw new FolioError('NODE_NOT_FOUND', run.nodeId);
      syncSpec(run, ctx, now);
      const step = IMAGE_STEPS[run.cursor];
      const handler = step ? IMAGE_HANDLERS[step.id] : undefined;
      if (!handler) throw new FolioError('IMAGE_STEP_UNAVAILABLE', `${run.runId} cursor ${run.cursor}`);
      const outcome = await handler({ ctx, run, env, node });
      run.updatedAt = now();
      await store.save(run);
      if (outcome) return outcome;
    }
  }

  /** 새 그림 한 장. assetId 는 작품에 없는 새 id(assets/<id>.yaml 도 없어야 함), nodeId 는 그림이 붙을 노드(없어도 됨). */
  async function start({ assetId, nodeId = null }) {
    if (typeof assetId !== 'string' || !ID.test(assetId) || assetId.length > 100) throw new FolioError('ID_INVALID', `asset id: ${String(assetId).slice(0, 100)}`);
    const ctx = await openImageContext(root, { packs });
    if (nodeId !== null && !ctx.work.tree.nodes.has(nodeId)) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
    if (ctx.work.assets.has(assetId) || await exists(join(root, ASSETS_DIR, `${assetId}.yaml`))) throw new FolioError('ASSET_EXISTS', assetId, { assetId });
    const open = (await store.list()).find((r) => IMAGE_OPEN_STATES.has(r.state));
    if (open) throw new FolioError('IMAGE_RUN_IN_PROGRESS', `${open.runId} for ${open.assetId} is not finished`, { runId: open.runId, assetId: open.assetId });
    const at = now();
    const run = {
      runId: newId('imgrun'), assetId, nodeId, state: 'active', cursor: 0, specDigest: ctx.specDigest,
      brief: null, briefHash: null, image: null, references: null, results: {}, attempts: { image: 0, briefRevisions: 0, imageRevisions: 0 },
      retries: {}, feedback: null, inbox: {}, issued: {}, pending: null, receipt: null, createdAt: at, updatedAt: at, history: [],
    };
    return drive(run);
  }

  async function resume({ runId, answers = {} }) {
    const run = await store.load(runId);
    if (run.state !== 'awaiting_model') throw new FolioError('IMAGE_RUN_NOT_AWAITING_MODEL', runId, { state: run.state });
    const ctx = await openImageContext(root, { packs });
    // 질문을 낸 뒤 설정이 바뀌었으면 답을 받지 않고 새 설정으로 다시 묻는다(그 질문이 돌아간다).
    if (run.specDigest !== ctx.specDigest) return drive(run);
    const requests = run.pending.requests;
    const missing = requests.filter((r) => !(r.requestId in answers)).map((r) => r.requestId);
    if (missing.length) throw new FolioError('ANSWERS_INCOMPLETE', missing.join(', '), { missing });
    const unknown = Object.keys(answers).filter((id) => !requests.some((r) => r.requestId === id));
    if (unknown.length) throw new FolioError('ANSWER_UNKNOWN_REQUEST', unknown.join(', '), { unknown });
    run.inbox = Object.fromEntries(requests.map((r) => [r.stepId, { requestId: r.requestId, purpose: r.purpose, answer: answers[r.requestId] }]));
    Object.assign(run, { pending: null, state: 'active' });
    await store.save(run);
    return drive(run);
  }

  async function decide({ runId, action, feedback = '', reason = '' }) {
    const run = await store.load(runId);
    // 버리기는 기능이 꺼져 있어도 받는다 — 그림 실행이 멈춰 남지 않게. 그 밖은 기능·설정을 먼저 본다.
    if (action !== 'skip') {
      const ctx = await openImageContext(root, { packs });
      if (run.specDigest !== ctx.specDigest && IMAGE_OPEN_STATES.has(run.state)) return drive(run);
    }
    const done = await applyImageDecision(env, run, { action, feedback, reason });
    run.updatedAt = now();
    await store.save(run);
    return done ?? drive(run);
  }

  /** 열린 그림 실행의 지금 질문(없으면 null). */
  async function pending() {
    const open = (await store.list()).find((r) => IMAGE_OPEN_STATES.has(r.state));
    return open ? { runId: open.runId, assetId: open.assetId, state: open.state, outcome: outcomeFromPending(open) } : null;
  }

  const serial = (fn) => (args) => withWorkLock(root, () => fn(args));
  return { start: serial(start), resume: serial(resume), decide: serial(decide), pending: serial(pending) };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/image/*.test.js` → PASS. `npm run check` → 1084/1084.

- [ ] **Step 5: 커밋**

```bash
git add core/image/run-store.js core/image/context.js core/image/requests.js core/image/steps.js core/image/decide.js core/image/runner.js test/support/image-work.js test/image/image-run.test.js
git commit -m "$(cat <<'EOF'
feat(image): picture run from brief to the approval question

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task A6: 그림 영수증과 커밋 잠금

> 리뷰: **가장 강한 모델**. 공격해 볼 것:
> - 실행 파일(`.folio/image-runs/<id>.json`)을 손으로 고쳐 커밋을 통과시킬 수 있는가: 지적 지우기, reviewer `independent: true`, 검토를 `skipped`로, 승인 지어내기, `state: committing`으로 바꾸고 `resume`.
> - 커밋되는 바이트가 검토·승인한 바이트와 다를 수 있는가(옮긴 그림 바꿔치기, 같은 이름 파일이 미리 있음).
> - 영수증 없이 `assets/`에 쓰는 길이 있는가. 끊긴 커밋을 이어서 부르면 영수증·커밋 기록이 두 번 남는가. 이미 커밋한 그림을 덮는가.
> - `validateAssetReceipt`가 막는 것: 예약 필드, 단계 차례, 건너뛴 이유, hash 불일치, 승인 없음, 모르는 severity, 자기검토 오표기.

**Files:**
- Create: `core/image/receipt.js`, `core/image/commit.js`
- Modify: `core/image/runner.js`(커밋 단계 연결, 커밋 중 이어 부르기), `core/image/steps.js`(주석 한 줄)
- Test: `test/image/image-commit.test.js`

**Interfaces:**
- Consumes: A5의 `IMAGE_STEPS`, `resultDigest`, `unresolved`, `stepIndex`. A3의 `writeAssetOnce`. `FINDING_SEVERITIES`·`HASH`·`RESERVED_RECEIPT_FIELDS`·`STEP_STATUSES`·`isBlocking`(`core/ledger/receipts.js`).
- Produces: `ASSET_RECEIPT_VERSION`, `SAME_HOST`, `RECEIPT_STEP_IDS`, `buildAssetReceipt(run, { receiptId })`, `validateAssetReceipt(receipt) → errors[]`. `commitStep({ ctx, run, env })` → `done { status, runId, assetId, nodeId, receiptId, file }`, `assetMeta(run, receipt)`. 기록장 `assets`에 `asset_receipt`(영수증 전체), `asset_commit { runId, assetId, receiptId, file, fileHash }`. 오류 `LOCK_IMAGE_HASH_MISMATCH`, `LOCK_APPROVAL_MISSING`, `LOCK_BRIEF_HASH_MISMATCH`, `LOCK_REVIEW_MISSING`, `LOCK_HARD_FINDING`, `LOCK_BLOCK_UNRESOLVED`, `LOCK_OVERRIDE_REASON_MISSING`, `LOCK_LEDGER_MISMATCH`, `LOCK_RECEIPT_MISMATCH`, `RECEIPT_INVALID`, `ASSET_EXISTS`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/image/image-commit.test.js` (122줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { createImageRunner } from '../../core/image/runner.js';
import { buildAssetReceipt, validateAssetReceipt } from '../../core/image/receipt.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { sha256 } from '../../core/util/hash.js';
import { parseYaml } from '../../core/util/yaml.js';
import { PNG_A } from '../support/images.js';
import { answerUntil, createImageHost, illustratedWork } from '../support/image-work.js';

const packs = await loadBuiltinPacks();
const code = (promise) => promise.then(() => 'ok', (e) => e.code);
const runPath = (root, runId) => join(root, '.folio', 'image-runs', `${runId}.json`);
const readRun = async (root, runId) => JSON.parse(await readFile(runPath(root, runId), 'utf8'));
const writeRun = (root, run) => writeFile(runPath(root, run.runId), JSON.stringify(run));

/** 승인 질문까지 간 그림 실행. */
async function toApproval(edit, script = {}) {
  const root = await illustratedWork(edit);
  const runner = createImageRunner({ root, packs });
  const host = await createImageHost(script);
  const question = await answerUntil(runner, host, await runner.start({ assetId: 'ep-001-door', nodeId: 'ep-001' }));
  assert.equal(question.question.kind, 'image_approval');
  return { root, runner, host, runId: question.runId };
}

test('approve commits the reviewed bytes: receipt first, then the picture, its yaml and the commit record', async () => {
  const { root, runner, runId } = await toApproval();
  const done = await runner.decide({ runId, action: 'approve' });
  assert.deepEqual(Object.keys(done), ['status', 'runId', 'assetId', 'nodeId', 'receiptId', 'file']);
  assert.deepEqual([done.status, done.assetId, done.nodeId, done.file], ['done', 'ep-001-door', 'ep-001', 'ep-001-door.png']);
  assert.deepEqual(await readFile(join(root, 'assets', 'ep-001-door.png')), PNG_A);
  const meta = parseYaml(await readFile(join(root, 'assets', 'ep-001-door.yaml'), 'utf8'));
  assert.deepEqual(meta.review, { receiptId: done.receiptId, status: 'passed', reviewer: { sameHost: true, independent: false } });
  assert.deepEqual([meta.id, meta.file, meta.nodeId, meta.generation], ['ep-001-door', 'ep-001-door.png', 'ep-001', { model: 'fake-image-1', references: ['hana-sheet'] }]);
  const records = await openLedger(root, 'assets').readAll();
  assert.deepEqual(records.map((r) => r.stepId ?? r.type), ['precheck', 'review', 'approve', 'asset_receipt', 'asset_commit']);
  const receipt = records[3];
  assert.deepEqual([receipt.fileHash, receipt.reviewer, receipt.hard], [sha256(PNG_A), { sameHost: true, independent: false }, 0]);
  assert.deepEqual(receipt.advisories.map((f) => f.code), ['REFERENCE_MISSING']);
  assert.deepEqual(records[4], { ...records[4], runId, assetId: 'ep-001-door', receiptId: done.receiptId, file: 'ep-001-door.png', fileHash: sha256(PNG_A) });
  const { work } = await openWorkspace(root, { packs });
  assert.deepEqual(work.assets.get('ep-001-door').entities, ['hana', 'locked-door']);
  assert.equal((await readRun(root, runId)).state, 'done');
  assert.equal(await code(runner.start({ assetId: 'ep-001-door' })), 'ASSET_EXISTS');
  assert.equal(await code(runner.decide({ runId, action: 'approve' })), 'IMAGE_RUN_NOT_AWAITING_USER');
});

test('a run file changed by hand is not trusted: findings dropped, the reviewer marked independent, or the approval forged are refused', async () => {
  for (const tamper of [
    (run) => { run.results.precheck.checks = run.results.precheck.checks.map((c) => ({ ...c, findings: [] })); },
    (run) => { run.results.review.checks[0].reviewer = { sameHost: false, independent: true }; },
    (run) => { run.results.review = { status: 'skipped', reason: 'x', source: 'y', imageHash: run.image.hash }; },
  ]) {
    const { root, runner, runId } = await toApproval();
    const run = await readRun(root, runId);
    tamper(run);
    await writeRun(root, run);
    assert.equal(await code(runner.decide({ runId, action: 'approve' })), 'LOCK_LEDGER_MISMATCH');
    assert.deepEqual((await readdir(join(root, 'assets'))).sort(), ['hana-sheet.png', 'hana-sheet.yaml'], 'nothing was written');
    assert.ok(!(await openLedger(root, 'assets').readAll()).some((r) => r.type === 'asset_receipt'));
  }
  const { root, runner, runId } = await toApproval();
  const run = await readRun(root, runId);
  Object.assign(run, { state: 'active', pending: null, cursor: 5, results: { ...run.results, approve: { status: 'approved', imageHash: run.image.hash, briefHash: run.briefHash, reason: '' } } });
  await writeRun(root, run);
  assert.equal(await code(runner.resume({ runId })), 'IMAGE_RUN_NOT_AWAITING_MODEL', 'an active run is not resumed by hand');
  run.state = 'committing';
  await writeRun(root, run);
  assert.equal(await code(runner.resume({ runId })), 'LOCK_LEDGER_MISMATCH', 'an approval missing from the ledger is not an approval');
});

test('the staged picture changed after approval is never committed', async () => {
  const { root, runner, runId } = await toApproval();
  const run = await readRun(root, runId);
  await writeFile(join(root, '.folio', 'image-runs', runId, run.image.name), 'tampered');
  assert.equal(await code(runner.decide({ runId, action: 'approve' })), 'LOCK_IMAGE_HASH_MISMATCH');
  assert.deepEqual((await readdir(join(root, 'assets'))).sort(), ['hana-sheet.png', 'hana-sheet.yaml']);
});

test('a commit cut off midway finishes with the same receipt and no second record', async () => {
  const { root, runner, runId } = await toApproval();
  const done = await runner.decide({ runId, action: 'approve' });
  const run = await readRun(root, runId);
  await writeRun(root, { ...run, state: 'committing', cursor: 5 });
  assert.deepEqual(await runner.resume({ runId }), done);
  const types = (await openLedger(root, 'assets').readAll()).map((r) => r.type);
  assert.deepEqual(types.filter((t) => t !== 'image_result'), ['asset_receipt', 'asset_commit']);
  await writeFile(join(root, 'assets', 'ep-001-door.png'), 'other');
  await writeRun(root, { ...run, state: 'committing', cursor: 5 });
  assert.equal(await code(runner.resume({ runId })), 'ASSET_IMMUTABLE', 'a committed picture is never overwritten');
});

test('imageReview off: the receipt says the review was skipped and why; the yaml says so too', async () => {
  const { root, runner, runId } = await toApproval((c) => ({ ...c, features: { imageReview: false } }));
  const done = await runner.decide({ runId, action: 'approve' });
  const receipt = (await openLedger(root, 'assets').readAll()).find((r) => r.type === 'asset_receipt');
  assert.deepEqual(receipt.steps.find((s) => s.id === 'review'), { id: 'review', kind: 'check', status: 'skipped', reason: 'imageReview is off in work.yaml features', source: 'work.yaml#features.imageReview', imageHash: sha256(PNG_A) });
  assert.equal(parseYaml(await readFile(join(root, 'assets', `${done.assetId}.yaml`), 'utf8')).review.status, 'skipped');
});

test('validateAssetReceipt: the self-review label, reserved fields, skip reasons and hashes are locks', async () => {
  const { root, runId } = await toApproval();
  const run = await readRun(root, runId);
  run.results.approve = { status: 'approved', imageHash: run.image.hash, briefHash: run.briefHash, reason: '' };
  const receipt = buildAssetReceipt(run, { receiptId: 'imgrcpt-1' });
  assert.deepEqual(validateAssetReceipt(receipt), []);
  const codes = (edit) => { const r = structuredClone(receipt); edit(r); return validateAssetReceipt(r).map((e) => e.code); };
  assert.deepEqual(codes((r) => { r.reviewer.independent = true; }), ['SELF_REVIEW_MISLABELED']);
  assert.deepEqual(codes((r) => { r.steps[3].checks[0].reviewer.independent = true; }), ['SELF_REVIEW_MISLABELED']);
  assert.deepEqual(codes((r) => { r.hash = 'x'; }), ['RECEIPT_FIELD_RESERVED']);
  assert.deepEqual(codes((r) => { r.steps[3] = { id: 'review', kind: 'check', status: 'skipped', imageHash: r.fileHash }; }), ['STEP_SKIP_REASON_MISSING']);
  assert.deepEqual(codes((r) => { r.steps[3].imageHash = r.briefHash; }), ['CHECK_HASH_MISMATCH']);
  assert.deepEqual(codes((r) => { r.steps[4].status = 'passed'; }), ['APPROVAL_MISSING']);
  assert.deepEqual(codes((r) => { r.steps[1].checks[0].findings.push({ severity: 'fatal' }); }), ['FINDING_SEVERITY_INVALID']);
  assert.deepEqual(codes((r) => { r.steps.pop(); }), ['RECEIPT_STEPS_INVALID', 'APPROVAL_MISSING']);
  assert.deepEqual(codes((r) => { r.fileHash = 'sha256:0'; }), ['RECEIPT_HASH_INVALID', 'CHECK_HASH_MISMATCH', 'CHECK_HASH_MISMATCH', 'CHECK_HASH_MISMATCH', 'APPROVAL_MISSING'], 'generate, review and approve all name the picture');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/image/image-commit.test.js`
Expected: FAIL — `core/image/receipt.js` 없음.

- [ ] **Step 3: 구현**

`core/image/receipt.js` (66줄):

```js
import { FINDING_SEVERITIES, HASH, RESERVED_RECEIPT_FIELDS, STEP_STATUSES, isBlocking } from '../ledger/receipts.js';
import { IMAGE_STEPS } from './steps.js';

export const ASSET_RECEIPT_VERSION = 1;
/** 그림 검토는 언제나 같은 호스트의 자기검토다. 영수증은 이것만 적을 수 있다(잠금: 자기검토 표기). */
export const SAME_HOST = Object.freeze({ sameHost: true, independent: false });
/** 영수증에 오르는 단계(커밋 자신은 빼고). */
export const RECEIPT_STEP_IDS = Object.freeze(IMAGE_STEPS.filter((s) => s.kind !== 'commit').map((s) => s.id));

const findingsOf = (step) => (step?.checks ?? []).flatMap((c) => c.findings ?? []);

/**
 * 그림 실행 → 그림 영수증. 단계 항목은 실행의 결과 그대로이고(기록장 image_result 와 digest 로 맞물린다), 그 밖은 실행이 아니라
 * 결과에서 다시 계산한다: hard 수, 넘긴 막는 지적(overridden), 참고 의견(advisories). 검토자는 늘 SAME_HOST 다.
 * @param {any} run
 * @param {{ receiptId: string }} options
 */
export function buildAssetReceipt(run, { receiptId }) {
  const steps = RECEIPT_STEP_IDS.map((id) => ({ id, kind: IMAGE_STEPS.find((s) => s.id === id)?.kind, ...structuredClone(run.results[id] ?? { status: 'not_run' }) }));
  const all = steps.flatMap(findingsOf);
  return {
    receiptVersion: ASSET_RECEIPT_VERSION, receiptId, runId: run.runId, assetId: run.assetId, nodeId: run.nodeId ?? null,
    file: `${run.assetId}${run.image.name.slice(run.image.name.lastIndexOf('.'))}`, mediaType: run.image.type, model: run.image.model,
    briefHash: run.briefHash, fileHash: run.image.hash, specDigest: run.specDigest,
    references: (run.references ?? []).flatMap((entry) => entry.assets.map((a) => a.assetId)).filter((id, i, list) => list.indexOf(id) === i),
    steps, hard: all.filter((f) => f.severity === 'hard').length,
    overridden: all.filter((f) => f.severity === 'block'), advisories: all.filter((f) => !isBlocking(f)), reviewer: { ...SAME_HOST },
  };
}

/**
 * 그림 영수증의 형식 잠금. 빈 배열이면 유효.
 * - 기록장 예약 필드 금지, 필수 필드·hash 모양, 단계는 정해진 다섯이 정해진 차례로.
 * - 건너뛴 단계는 이유와 출처, 실제로 본 단계(점검·검토·승인)는 그 설명서·그림 hash 가 영수증 hash 와 같아야 한다.
 * - 검토자는 SAME_HOST 만. 어느 검사 결과든 independent: true 면 SELF_REVIEW_MISLABELED.
 * @param {any} receipt
 */
export function validateAssetReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return [{ code: 'RECEIPT_MISSING' }];
  const errors = [];
  const push = (code, extra = {}) => errors.push({ code, ...extra });
  for (const field of RESERVED_RECEIPT_FIELDS) if (field in receipt) push('RECEIPT_FIELD_RESERVED', { field });
  for (const field of ['receiptId', 'runId', 'assetId', 'file', 'specDigest']) if (typeof receipt[field] !== 'string' || !receipt[field]) push('RECEIPT_FIELD_MISSING', { field });
  for (const field of ['briefHash', 'fileHash']) if (!HASH.test(receipt[field] ?? '')) push('RECEIPT_HASH_INVALID', { field });
  if (!Number.isInteger(receipt.hard) || receipt.hard < 0) push('RECEIPT_FIELD_MISSING', { field: 'hard' });
  if (receipt.reviewer?.sameHost !== true || receipt.reviewer?.independent !== false) push('SELF_REVIEW_MISLABELED', { field: 'reviewer' });
  const steps = Array.isArray(receipt.steps) ? receipt.steps : [];
  if (steps.map((s) => s?.id).join() !== RECEIPT_STEP_IDS.join()) push('RECEIPT_STEPS_INVALID');
  for (const step of steps) {
    if (!STEP_STATUSES.includes(step?.status)) { push('STEP_STATUS_INVALID', { stepId: step?.id }); continue; }
    if (step.status === 'skipped' && (typeof step.reason !== 'string' || typeof step.source !== 'string')) push('STEP_SKIP_REASON_MISSING', { stepId: step.id });
    if ('briefHash' in step && step.briefHash !== receipt.briefHash) push('CHECK_HASH_MISMATCH', { stepId: step.id });
    if ('imageHash' in step && step.imageHash !== receipt.fileHash) push('CHECK_HASH_MISMATCH', { stepId: step.id });
    for (const check of step.checks ?? []) {
      if (check?.reviewer?.independent === true) push('SELF_REVIEW_MISLABELED', { stepId: step.id, checkId: check.checkId });
      for (const finding of [...(check?.findings ?? []), ...(check?.unsupported ?? [])]) {
        if (!FINDING_SEVERITIES.includes(finding?.severity)) push('FINDING_SEVERITY_INVALID', { stepId: step.id, checkId: check.checkId });
      }
    }
  }
  const byId = new Map(steps.map((s) => [s?.id, s]));
  if (!('briefHash' in (byId.get('precheck') ?? {}))) push('CHECK_HASH_MISMATCH', { stepId: 'precheck' });
  if (!('imageHash' in (byId.get('review') ?? {}))) push('CHECK_HASH_MISMATCH', { stepId: 'review' });
  if (byId.get('approve')?.status !== 'approved' || byId.get('approve')?.imageHash !== receipt.fileHash) push('APPROVAL_MISSING');
  return errors;
}
```

`core/image/commit.js` (95줄):

```js
import { FolioError } from '../errors.js';
import { RESERVED_RECEIPT_FIELDS } from '../ledger/receipts.js';
import { writeAssetOnce } from '../store/assets.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { stringifyYaml } from '../util/yaml.js';
import { buildAssetReceipt, SAME_HOST, validateAssetReceipt } from './receipt.js';
import { resultDigest, stepIndex, unresolved } from './steps.js';

/** 영수증·커밋 기록과 대조하는 단계: 그 결과가 기록장의 가장 최근 image_result 와 같아야 한다. */
const LEDGER_STEPS = ['precheck', 'review', 'approve'];
const REVIEW_OK = new Set(['passed', 'failed', 'skipped', 'not_applicable']);
const strip = (record) => Object.fromEntries(Object.entries(record).filter(([key]) => !RESERVED_RECEIPT_FIELDS.includes(key)));

/** 그림 커밋이 쓰는 설명서(yaml). 같은 실행이면 언제 다시 만들어도 같은 바이트다(이어서 커밋할 때 writeAssetOnce 가 통과). */
export function assetMeta(run, receipt) {
  const meta = { id: run.assetId, file: receipt.file };
  if (run.nodeId) meta.nodeId = run.nodeId;
  meta.brief = run.brief;
  meta.generation = { model: receipt.model, references: receipt.references };
  meta.review = { receiptId: receipt.receiptId, status: receipt.steps.find((s) => s.id === 'review').status, reviewer: { ...SAME_HOST } };
  return meta;
}

/**
 * 커밋 전 잠금. 실행 파일은 손으로 고칠 수 있으므로 믿지 않는다 — 기록장과 옮겨 둔 바이트로 다시 본다.
 * 하나라도 어긋나면 FolioError(LOCK_*) 로 거부하고 아무것도 쓰지 않는다.
 */
async function assertCommitLocks(env, run, records) {
  const fail = (code, message, extra = {}) => { throw new FolioError(code, message, { runId: run.runId, ...extra }); };
  const bytes = await env.store.readStaged(run.runId, run.image?.name);
  if (!bytes || sha256(bytes) !== run.image.hash) fail('LOCK_IMAGE_HASH_MISMATCH', 'the staged picture is not the reviewed picture');
  const approve = run.results.approve;
  if (approve?.status !== 'approved' || approve.imageHash !== run.image.hash || approve.briefHash !== run.briefHash) fail('LOCK_APPROVAL_MISSING', 'the picture was not approved as it is');
  if (run.image.briefHash !== run.briefHash || run.results.precheck?.briefHash !== run.briefHash) fail('LOCK_BRIEF_HASH_MISMATCH', 'the picture was made or checked for another brief');
  const review = run.results.review;
  if (!review || !REVIEW_OK.has(review.status) || review.imageHash !== run.image.hash) fail('LOCK_REVIEW_MISSING', 'the picture was not reviewed (nor skipped with a reason)');
  if (review.status === 'skipped' && !(review.reason && review.source)) fail('LOCK_REVIEW_MISSING', 'a skipped review needs its reason and source');
  const findings = ['precheck', 'review'].flatMap((id) => (run.results[id]?.checks ?? []).flatMap((c) => c.findings ?? []));
  if (findings.some((f) => f.severity === 'hard')) fail('LOCK_HARD_FINDING', 'hard findings are never committed');
  if (unresolved(run, ['precheck', 'review']).length) fail('LOCK_BLOCK_UNRESOLVED', 'blocking findings were not approved');
  // 넘긴 block 은 이유가 있어야 한다: 점검의 block 은 precheck.approved.reason, 검토의 block 은 승인 이유.
  const precheckBlocks = (run.results.precheck?.checks ?? []).flatMap((c) => c.findings ?? []).filter((f) => f.severity === 'block');
  const reviewBlocks = (review.checks ?? []).flatMap((c) => c.findings ?? []).filter((f) => f.severity === 'block');
  if (precheckBlocks.length && !run.results.precheck.approved?.reason) fail('LOCK_OVERRIDE_REASON_MISSING', 'a passed-over precheck block needs a reason');
  if (reviewBlocks.length && !approve.reason) fail('LOCK_OVERRIDE_REASON_MISSING', 'a passed-over review block needs a reason');
  for (const stepId of LEDGER_STEPS) {
    const latest = records.filter((r) => r.type === 'image_result' && r.runId === run.runId && r.stepId === stepId).at(-1);
    if (!latest || latest.digest !== resultDigest(run.results[stepId])) fail('LOCK_LEDGER_MISMATCH', `${stepId} differs from the recorded result`, { stepId });
  }
}

/** 이 실행의 영수증(기록장). 이미 남겼으면 그것을, 아니면 잠금을 보고 새로 만들어 남긴다. */
async function receiptFor(env, run, records) {
  const recorded = records.filter((r) => r.type === 'asset_receipt' && r.runId === run.runId).at(-1);
  if (recorded) {
    const stored = strip(recorded);
    const rebuilt = buildAssetReceipt(run, { receiptId: stored.receiptId });
    if (canonicalJson(rebuilt) !== canonicalJson(stored)) throw new FolioError('LOCK_RECEIPT_MISMATCH', `${stored.receiptId} differs from this run`, { runId: run.runId });
    return stored;
  }
  if (records.some((r) => r.type === 'asset_commit' && r.assetId === run.assetId)) throw new FolioError('ASSET_EXISTS', run.assetId, { assetId: run.assetId });
  await assertCommitLocks(env, run, records);
  const receipt = buildAssetReceipt(run, { receiptId: env.newId('imgrcpt') });
  const errors = validateAssetReceipt(receipt);
  if (errors.length) throw new FolioError('RECEIPT_INVALID', errors.map((e) => e.code).join(', '), { errors });
  await env.ledger.append({ type: 'asset_receipt', ...receipt });
  return receipt;
}

/**
 * 커밋 단계: 잠금 → 영수증(assets 기록장) → assets/<id>.<ext> → assets/<id>.yaml → asset_commit 기록.
 * 노드 파일은 쓰지 않는다 — 본문에 놓기는 작가가 ![[asset:id]] 를 넣고 다시 커밋(recommit)한다.
 * 중간에 끊겨도 이어서 부르면 같은 영수증·같은 바이트로 끝맺는다(쓰기는 한 번만, 같은 내용이면 통과).
 */
export async function commitStep({ ctx, run, env }) {
  if (run.state !== 'committing') {
    const existing = ctx.work.assets.get(run.assetId);
    if (existing) throw new FolioError('ASSET_EXISTS', run.assetId, { assetId: run.assetId });
  }
  const records = await env.ledger.readAll();
  run.state = 'committing';
  const receipt = await receiptFor(env, run, records);
  run.receipt = { receiptId: receipt.receiptId };
  await env.store.save(run);
  const bytes = await env.store.readStaged(run.runId, run.image.name);
  if (!bytes || sha256(bytes) !== receipt.fileHash) throw new FolioError('LOCK_IMAGE_HASH_MISMATCH', 'the staged picture is not the receipt picture', { runId: run.runId });
  await writeAssetOnce(env.root, receipt.file, bytes);
  await writeAssetOnce(env.root, `${run.assetId}.yaml`, stringifyYaml(assetMeta(run, receipt)));
  if (!records.some((r) => r.type === 'asset_commit' && r.receiptId === receipt.receiptId)) {
    await env.ledger.append({ type: 'asset_commit', runId: run.runId, assetId: run.assetId, receiptId: receipt.receiptId, file: receipt.file, fileHash: receipt.fileHash });
  }
  Object.assign(run, { state: 'done', pending: null, cursor: stepIndex('commit') + 1 });
  run.history.push({ event: 'committed', receiptId: receipt.receiptId, at: env.now() });
  return { status: 'done', runId: run.runId, assetId: run.assetId, nodeId: run.nodeId, receiptId: receipt.receiptId, file: receipt.file };
}
```

`core/image/runner.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/core/image/runner.js b/core/image/runner.js
index 08e2171..c834ec5 100644
--- a/core/image/runner.js
+++ b/core/image/runner.js
@@ -10,8 +10,10 @@ import { ASSETS_DIR } from '../store/assets.js';
 import { openImageContext } from './context.js';
 import { createImageRunStore, IMAGE_OPEN_STATES } from './run-store.js';
 import { IMAGE_HANDLERS, IMAGE_LEDGER, IMAGE_STEPS, stepIndex } from './steps.js';
+import { commitStep } from './commit.js';
 import { applyImageDecision } from './decide.js';

+const HANDLERS = Object.freeze({ ...IMAGE_HANDLERS, commit: commitStep });
 const defaultId = (prefix) => `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
 const exists = (path) => lstat(path).then(() => true, (error) => (error?.code === 'ENOENT' ? false : Promise.reject(error)));

@@ -43,7 +45,7 @@ export function createImageRunner({ root, packs, now = () => new Date().toISOStr
       if (run.nodeId && !node) throw new FolioError('NODE_NOT_FOUND', run.nodeId);
       syncSpec(run, ctx, now);
       const step = IMAGE_STEPS[run.cursor];
-      const handler = step ? IMAGE_HANDLERS[step.id] : undefined;
+      const handler = step ? HANDLERS[step.id] : undefined;
       if (!handler) throw new FolioError('IMAGE_STEP_UNAVAILABLE', `${run.runId} cursor ${run.cursor}`);
       const outcome = await handler({ ctx, run, env, node });
       run.updatedAt = now();
@@ -71,6 +73,8 @@ export function createImageRunner({ root, packs, now = () => new Date().toISOStr

   async function resume({ runId, answers = {} }) {
     const run = await store.load(runId);
+    // 커밋 중에 끊긴 실행은 이어서 부르면 같은 영수증·같은 바이트로 끝맺는다.
+    if (run.state === 'committing') return drive(run);
     if (run.state !== 'awaiting_model') throw new FolioError('IMAGE_RUN_NOT_AWAITING_MODEL', runId, { state: run.state });
     const ctx = await openImageContext(root, { packs });
     // 질문을 낸 뒤 설정이 바뀌었으면 답을 받지 않고 새 설정으로 다시 묻는다(그 질문이 돌아간다).
```

`core/image/steps.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/core/image/steps.js b/core/image/steps.js
index a2aebfc..0dbad0b 100644
--- a/core/image/steps.js
+++ b/core/image/steps.js
@@ -166,5 +166,5 @@ async function approveStep({ run, env }) {
   return awaitUser(run, gateQuestion(env, run, 'image_approval', unresolved(run, ['precheck', 'review'])));
 }

-/** 단계 id → 처리 함수. 커밋 단계는 core/image/commit-step.js 가 더한다. */
+/** 단계 id → 처리 함수. 커밋 단계는 core/image/commit.js 의 commitStep 을 실행기(runner.js)가 더한다(서로 부르지 않게). */
 export const IMAGE_HANDLERS = { brief: briefStep, precheck: precheckStep, generate: generateStep, review: reviewStep, approve: approveStep };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/image/*.test.js` → PASS. `npm run check` → 1090/1090.

- [ ] **Step 5: 커밋**

```bash
git add core/image/receipt.js core/image/commit.js core/image/runner.js core/image/steps.js test/image/image-commit.test.js
git commit -m "$(cat <<'EOF'
feat(image): asset receipt and locked commit of the reviewed bytes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task A7: 도구 `folio_image`와 스킬 문서

**Files:**
- Create: `server/tools/image.js`, `skill/folio/references/image.md`
- Modify: `server/tools/definitions.js`(목록 끝), `server/tools/handlers.js`, `skill/folio/SKILL.md`
- Modify (테스트): `test/server/tools.test.js`(이름 목록 끝, BANNED 끝), `test/server/occurrence-tools.test.js`(11 → 12)
- Test: `test/server/image-tool.test.js`

**Interfaces:**
- Consumes: `createImageRunner`(A5·A6).
- Produces: 도구 `folio_image { root, op: 'start'|'resume'|'decide'|'pending', assetId?, nodeId?, runId?, answers?, action?, feedback?, reason? }`. 인자 오류 `IMAGE_ARGS_INVALID`. 서버는 `core/store/assets.js`·`core/image/commit.js`를 import하지 않는다(BANNED).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/server/image-tool.test.js` (39줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { PNG_A } from '../support/images.js';
import { createImageHost, illustratedWork } from '../support/image-work.js';

const packs = await loadBuiltinPacks();
const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
const code = (out) => out.error?.code;

test('folio_image start → resume → decide commits one picture through the toolbox; pending shows the open run', async () => {
  const root = await illustratedWork();
  const tools = createToolbox({ packs });
  const host = await createImageHost();
  assert.equal(ok(await tools.call('folio_image', { root, op: 'pending' })), null);
  let out = ok(await tools.call('folio_image', { root, op: 'start', assetId: 'ep-001-door', nodeId: 'ep-001' }));
  const pending = ok(await tools.call('folio_image', { root, op: 'pending' }));
  assert.deepEqual([pending.runId, pending.assetId, pending.state, pending.outcome.requests[0].purpose], [out.runId, 'ep-001-door', 'awaiting_model', 'image_brief']);
  while (out.status === 'needs_model') out = ok(await tools.call('folio_image', { root, op: 'resume', runId: out.runId, answers: await host.answer(out) }));
  assert.equal(out.question.kind, 'image_approval');
  const done = ok(await tools.call('folio_image', { root, op: 'decide', runId: out.runId, action: 'approve' }));
  assert.equal(done.status, 'done');
  assert.deepEqual(await readFile(join(root, 'assets', 'ep-001-door.png')), PNG_A);
});

test('folio_image refuses wrong arguments per op and works only with the image pack and the images feature', async () => {
  const root = await illustratedWork();
  const tools = createToolbox({ packs });
  assert.equal(code(await tools.call('folio_image', { root, op: 'start' })), 'IMAGE_ARGS_INVALID');
  assert.equal(code(await tools.call('folio_image', { root, op: 'start', assetId: 'a', runId: 'x' })), 'IMAGE_ARGS_INVALID');
  assert.equal(code(await tools.call('folio_image', { root, op: 'decide', runId: 'imgrun-x' })), 'IMAGE_ARGS_INVALID');
  assert.equal(code(await tools.call('folio_image', { root, op: 'resume', runId: '../x', answers: {} })), 'IMAGE_RUN_ID_INVALID');
  assert.equal(code(await tools.call('folio_image', { root, op: 'paint' })), 'TOOL_INPUT_INVALID');
  const off = await illustratedWork((c) => ({ ...c, features: { images: false } }));
  assert.equal(code(await tools.call('folio_image', { root: off, op: 'start', assetId: 'a' })), 'FEATURE_DISABLED');
});
```

`test/server/tools.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/server/tools.test.js b/test/server/tools.test.js
index eddf22e..192b3cd 100644
--- a/test/server/tools.test.js
+++ b/test/server/tools.test.js
@@ -26,7 +26,7 @@ async function* walk(dir) {

 test('the tool list: eight base tools, folio_occurrences and one advanced tool, each needing an absolute root and nothing else', () => {
   assert.deepEqual(BASE_TOOL_NAMES, ['folio_init', 'folio_status', 'folio_run', 'folio_resume', 'folio_decide', 'folio_structure', 'folio_find', 'folio_view']);
-  assert.deepEqual(TOOLS.map((t) => t.name), [...BASE_TOOL_NAMES, 'folio_occurrences', 'folio_sources', 'folio_config']);
+  assert.deepEqual(TOOLS.map((t) => t.name), [...BASE_TOOL_NAMES, 'folio_occurrences', 'folio_sources', 'folio_config', 'folio_image']);
   for (const tool of TOOLS) {
     assert.ok(tool.inputSchema.required.includes('root'), tool.name);
     assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
@@ -117,6 +117,8 @@ const BANNED = [
   'core/run/commit.js', 'core/run/recheck-commit.js', 'core/structure/ops.js', 'core/ledger/ledger.js', 'core/store/tree.js', 'core/util/file-tx.js', 'core/util/file-tx-journal.js',
   // N2: 자료 원본·설명서 쓰기와 잠금 없이 근거 기록장에 쓰는 길. 서버는 스스로 작업 잠금을 잡는 addSource·submitEvidence 만 부른다.
   'core/store/sources.js', 'core/evidence/record-run.js',
+  // M7a: 그림 파일·설명서 쓰기와 그림 커밋. 서버는 스스로 작업 잠금을 잡는 그림 실행기(core/image/runner.js)만 부른다.
+  'core/store/assets.js', 'core/image/commit.js',
 ];

 test('server code never imports the commit path, the structure writers, the ledgers or the tree store directly', async () => {
```

`test/server/occurrence-tools.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/server/occurrence-tools.test.js b/test/server/occurrence-tools.test.js
index a5c9e08..4efda7f 100644
--- a/test/server/occurrence-tools.test.js
+++ b/test/server/occurrence-tools.test.js
@@ -9,8 +9,8 @@ import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
 const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
 const code = (out) => out.error?.code;

-test('eleven tools, and folio_occurrences is one of them', () => {
-  assert.equal(TOOLS.length, 11);
+test('twelve tools, and folio_occurrences is one of them', () => {
+  assert.equal(TOOLS.length, 12);
   assert.ok(TOOLS.some((t) => t.name === 'folio_occurrences'));
 });

```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/server/image-tool.test.js test/server/tools.test.js test/server/occurrence-tools.test.js`
Expected: FAIL — `folio_image`가 목록에 없다(`TOOL_UNKNOWN`).

- [ ] **Step 3: 구현**

`server/tools/image.js` (28줄):

```js
import { FolioError } from '../../core/errors.js';
import { createImageRunner } from '../../core/image/runner.js';

const ARGS = {
  start: { required: ['assetId'], allowed: ['assetId', 'nodeId'] },
  resume: { required: ['runId'], allowed: ['runId', 'answers'] },
  decide: { required: ['runId', 'action'], allowed: ['runId', 'action', 'feedback', 'reason'] },
  pending: { required: [], allowed: [] },
};

/**
 * folio_image. 그림 실행기(core/image/runner.js)만 부르고, 실행기가 작업 잠금을 스스로 잡는다.
 * 서버는 그림 커밋·assets 쓰기 함수를 import 하지 않는다(test/server/tools.test.js 가드).
 * @param {string} root
 * @param {Map<string, any>} packs
 * @param {{ op: 'start'|'resume'|'decide'|'pending', [x: string]: any }} input
 */
export async function imageTool(root, packs, { op, ...args }) {
  const rule = ARGS[op];
  const missing = rule.required.filter((key) => args[key] === undefined);
  const extra = Object.keys(args).filter((key) => !rule.allowed.includes(key));
  if (missing.length || extra.length) throw new FolioError('IMAGE_ARGS_INVALID', `${op}: missing ${missing.join(',') || '-'}, not allowed ${extra.join(',') || '-'}`, { op, missing, extra });
  const runner = createImageRunner({ root, packs });
  if (op === 'start') return runner.start({ assetId: args.assetId, nodeId: args.nodeId ?? null });
  if (op === 'resume') return runner.resume({ runId: args.runId, answers: args.answers ?? {} });
  if (op === 'decide') return runner.decide({ runId: args.runId, action: args.action, feedback: args.feedback ?? '', reason: args.reason ?? '' });
  return runner.pending();
}
```

`server/tools/definitions.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/server/tools/definitions.js b/server/tools/definitions.js
index 1cf01e1..464cfbd 100644
--- a/server/tools/definitions.js
+++ b/server/tools/definitions.js
@@ -66,4 +66,9 @@ export const TOOLS = Object.freeze([
     }, ['op']),
   tool('folio_config', '고급: 레벨별 단계(잠금 포함), 검사 세트와 추천, 검사 목록, 검사를 둘 수 있는 단계를 보여 준다. workKind 를 주면 작품 단위 추천에 그 종류 이유를 더한다. node(노드 id)를 주면 그 노드 기준 추천을 nodeRecommendations 로 더한다. checkDraft 를 주면 사용자 검사 초안을 이 작품 기준으로 검증한다. 읽기 전용이다.',
     { checkDraft: { type: 'object' }, workKind: ID, node: ID }),
+  tool('folio_image', '그림 한 장을 만든다(image 팩·images 기능). 노드 실행과 따로 돈다. start { assetId, nodeId? }: 새 그림 id(작품에 없는 것)와 붙일 노드. needs_model 로 설명서(image_brief) → 그림(image_generate: 호스트가 그린 그림 파일의 절대 경로를 답한다. 파일은 읽기만 하고 실행 폴더로 옮긴다. png·jpg·gif·webp, 20MiB까지, 링크가 아닌 보통 파일) → 검토(image_review: 같은 호스트의 자기검토로 표기) 를 묻고, 생성 전 점검에서 막히면·승인은 needs_user 로 묻는다. resume { runId, answers }: 요청에 답한다. decide { runId, action, feedback?, reason? }: approve(block 을 넘길 때 reason) · request_revision(feedback) · skip(reason). 승인하면 영수증을 남기고 assets/<id>.<확장자> 와 assets/<id>.yaml 을 한 번만 쓴다(노드 본문은 바꾸지 않는다 — 본문에 ![[asset:id]] 를 넣고 folio_run mode recommit). 커밋 중 끊겼으면 resume { runId } 가 끝맺는다. pending: 열린 그림 실행과 그 질문.',
+    {
+      op: { type: 'string', enum: ['start', 'resume', 'decide', 'pending'] }, assetId: ID, nodeId: ID, runId: ID,
+      answers: { type: 'object', additionalProperties: { type: 'string' } }, action: { type: 'string', enum: ['approve', 'request_revision', 'skip'] }, feedback: TEXT, reason: TEXT,
+    }, ['op']),
 ]);
```

`server/tools/handlers.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/server/tools/handlers.js b/server/tools/handlers.js
index b95cf0a..87dce86 100644
--- a/server/tools/handlers.js
+++ b/server/tools/handlers.js
@@ -8,6 +8,7 @@ import { initWork } from '../../core/work/init.js';
 import { findInWork } from './find.js';
 import { occurrencesTool } from './occurrences.js';
 import { sourcesTool } from './sources.js';
+import { imageTool } from './image.js';
 import { describeConfig } from './config.js';
 import { createViewerRegistry } from '../view/registry.js';

@@ -49,5 +50,6 @@ export function createHandlers({ packs, viewer = createViewerRegistry({ packs })
     folio_occurrences: ({ root, op, ...args }) => occurrencesTool(root, { op, ...args }),
     folio_sources: ({ root, op, ...args }) => sourcesTool(root, { op, ...args }),
     folio_config: ({ root, checkDraft, workKind, node }) => describeConfig(root, { packs, checkDraft, workKind, node }),
+    folio_image: ({ root, op, ...args }) => imageTool(root, packs, { op, ...args }),
   };
 }
```

`skill/folio/references/image.md` (54줄):

```markdown
# 그림 (image 팩, `folio_image`)

엔진은 그림을 그리지 않는다. 호스트(나)가 그림 도구로 그리고, 엔진은 설명서·점검·검토·승인·영수증의 순서와 잠금만 지킨다.

## 준비

- 작품 `packs`에 `image`를 둔다: `packs: [novel, image]`. 검사 세트는 작가가 고른다: `image.basic`(점검 넷 + 검토 하나), `image.placement`(본문의 `![[asset:id]]`가 실제 그림을 가리키는가). 웹툰·삽화 작품에 추천된다. 모두 실험·참고 의견이다.
- 기능 토글(work.yaml `features`): `images`(그림 실행), `imageReferences`(기준 그림을 그림 요청에 싣기), `imageReview`(그림 검토). 뒤 둘은 `images`가 꺼지면 같이 꺼진다. 잠금은 어떤 토글과도 상관없다.
- 기준 그림: 인물·장소의 기준 그림은 `assets/<id>.yaml`에 `reference: true`와 `brief.entities: [엔티티 id]`를 적은 그림이다. 그림 요청의 `references`에 그 그림의 절대 경로가 실린다 — 그 파일을 보고 같은 모습으로 그린다.

## 한 장 그리기

1. `folio_image { root, op: 'start', assetId, nodeId? }`: `assetId`는 작품에 없는 새 id, `nodeId`는 그림이 붙을 노드. 한 번에 그림 실행 하나만 열린다(`IMAGE_RUN_IN_PROGRESS`).
2. `needs_model` 요청마다 답하고 `folio_image { root, op: 'resume', runId, answers }`(답은 모두 문자열):

| 요청 | 답 |
|---|---|
| `purpose: image_brief` | JSON `{ "mustShow": [...], "mustNotShow": [...], "entities": [엔티티 id], "continuity": "...", "dialogue": [{ "speaker", "text" }], "reference": false }` — 노드 본문에 있는 것만. 대사는 본문 문장 그대로 |
| `purpose: image_generate` | JSON `{ "path": "<그린 그림 파일의 절대 경로>", "model": "<그림 모델 이름>" }`. png·jpg·gif·webp, 20MiB까지, 링크가 아닌 보통 파일. 엔진은 그 파일을 읽기만 하고 실행 폴더로 옮긴다 |
| `purpose: image_review` | JSON `{ "checked": [검사 id 모두], "findings": [...] }` — `payload.image.path`의 그림을 직접 열어 설명서·기준 그림과 비교한다 |

3. `needs_user` 질문(`question.kind`)을 작가에게 보여 주고 결정을 받아 `folio_image { root, op: 'decide', runId, action, feedback?, reason? }`:
   - `image_precheck`: 그리기 전 점검에서 막혔다. `approve`(넘길 이유 `reason`) · `request_revision`(`feedback`, 설명서부터 다시) · `skip`.
   - `image_approval`: 그림(`question.image.path`)과 참고 의견을 작가에게 보여 준다. `approve` · `request_revision`(`feedback`, 그림부터 다시) · `skip`. 고쳐 달라는 요청은 세 번까지다.
   - `image_blocked`: 읽을 수 없는 답이 세 번 왔다. `skip`만 된다.
4. 승인하면 `done { assetId, receiptId, file }`. 엔진이 영수증을 남기고 `assets/<id>.<확장자>`와 `assets/<id>.yaml`을 한 번만 쓴다. 노드 본문은 바꾸지 않는다 — 본문에 놓으려면 작가가 본문에 `![[asset:<id>]]`를 넣고 `folio_run { root, node, mode: 'recommit' }`으로 다시 커밋한다.

- 그림 검토는 언제나 같은 호스트의 자기검토로 기록된다. "독립 검토"라고 부르지 않는다. 참고 의견으로 그림을 스스로 다시 그리지 않는다 — 작가가 `request_revision`할 때만 다시 그린다.
- 대화가 끊겼으면 `folio_image { root, op: 'pending' }`이 열린 그림 실행과 그 질문을 준다(`folio_status`의 `pending`은 노드 실행만 본다). 커밋 도중 끊겼으면(`state: committing`) `folio_image { op: 'resume', runId }`가 끝맺는다.
- 실행 폴더의 그림이나 `.folio/`를 손으로 고치지 않는다. 고친 그림은 검토하지 않고 다시 그리라고 묻고, 커밋 때 바뀌었으면 잠금이 거부한다.

## 검사

| 검사 | 언제 | 알리는 것 |
|---|---|---|
| `image.entities-in-node` | 그리기 전 | 설명서의 엔티티가 노드 본문에 안 나옴(`ENTITY_NOT_IN_NODE`) |
| `image.dialogue-in-text` | 그리기 전 | 설명서의 대사가 본문에 없음(`DIALOGUE_NOT_IN_TEXT`) |
| `image.references-present` | 그리기 전 | 엔티티에 기준 그림이 없음(`REFERENCE_MISSING`) |
| `image.show-conflict` | 그리기 전 | 보여야 할 것과 보이면 안 될 것이 겹침(`SHOW_CONFLICT`) |
| `image.review` | 그린 뒤(모델) | 설명서·기준 그림과 어긋남 |
| `image.asset-refs` | 노드 사실 단계 | 본문의 `![[asset:id]]`가 없는 그림·파일을 가리킴(`ASSET_UNKNOWN`·`ASSET_FILE_MISSING`) |

작가가 원하면 `checks: { image.dialogue-in-text: { severity: block } }`처럼 올린다(`hard`는 안 된다). 그러면 넘기려면 이유가 필요하다.

## 오류일 때

- `IMAGE_PACK_REQUIRED`: 작품 `packs`에 `image`가 없다. 넣을지는 작가가 정한다.
- `ASSET_EXISTS`: 그 그림 id가 이미 있다. 다른 id를 작가에게 받는다. `ASSET_IMMUTABLE`: 같은 이름의 다른 그림 파일이 있다 — 덮지 않는다.
- `IMAGE_RUN_IN_PROGRESS`: 다른 그림 실행이 열려 있다. `pending`으로 이어가거나 작가의 이유를 받아 `skip`.
- `IMAGE_RUN_NOT_AWAITING_MODEL`·`IMAGE_RUN_NOT_AWAITING_USER`: 지금 그 실행이 기다리는 것이 아니다. `pending`으로 지금 질문을 본다.
- 그림 요청의 `retryReason`: `IMAGE_PATH_INVALID`(절대 경로가 아님·없음·링크·보통 파일 아님), `IMAGE_TOO_LARGE`, `IMAGE_TYPE_UNSUPPORTED`(png·jpg·gif·webp만), `BRIEF_*`(설명서 형식). 고쳐 다시 답한다.
- `IMAGE_REVISION_LIMIT`: 고쳐 달라는 요청을 세 번 했다. 승인하거나 `skip`.
- `LOCK_*`(`LOCK_IMAGE_HASH_MISMATCH`·`LOCK_LEDGER_MISMATCH`·`LOCK_APPROVAL_MISSING` 등): 실행 파일이나 옮긴 그림이 손으로 바뀌어 커밋을 거부했다. 아무것도 쓰이지 않았다. 작가에게 알리고 이유를 받아 `skip`한 뒤 새로 그린다.
- `ASSETS_DIR_INVALID`: `assets`가 보통 폴더가 아니다(링크 등). 작가가 고친다.
```

`skill/folio/SKILL.md` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/skill/folio/SKILL.md b/skill/folio/SKILL.md
index ede7197..6e33553 100644
--- a/skill/folio/SKILL.md
+++ b/skill/folio/SKILL.md
@@ -29,6 +29,7 @@ description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재
 | `folio_occurrences` | 등장 위치 제출(`submit`), 작가가 승인한 이름 바꾸기 적용(`rename`). [references/occurrences.md](references/occurrences.md) |
 | `folio_sources` | 자료 넣기(`add`: 글 또는 작가가 고른 파일 하나), 목록(`list`), 자료와 걸린 주장(`get`), 커밋된 노드의 주장 잇기(`link`). [references/sources.md](references/sources.md) |
 | `folio_config` | 고급. 레벨별 단계·검사 세트·검사 목록, `workKind`·`node`로 추천, 사용자 검사 초안 검증. 읽기 전용 |
+| `folio_image` | 그림 한 장(`start`·`resume`·`decide`·`pending`). 노드 실행과 따로 돈다. [references/image.md](references/image.md) |

 `root`는 언제나 작가가 고른 작품 폴더의 절대 경로다. 엔진은 절대 경로인지만 확인하고 어느 폴더든 막지 않는다(허용 목록 없음). 그러니 작가가 고르거나 확인해 준 폴더만 넘긴다. 짐작한 경로나 작품과 상관없는 폴더를 넘기지 않는다.

@@ -54,6 +55,7 @@ description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재
 7. **회사 문서**: 제품 소개서·브로셔의 브랜드 어조·금지 표현·수치 대조 세트(`packs: ['knowledge', 'sources', 'brand']`)는 [references/brand.md](references/brand.md).
 8. **블록·각주·참고문헌·색인**: 그림·표·식 앵커(`{#fig-1-1}`), 블록 참조(`[[block:id]]`), 각주(`[^id]`), 자료 인용(`[[source:id]]`)과 `folio_find`의 `blocks`·`bibliography`·`terms`는 [references/blocks.md](references/blocks.md).
 9. **순서 없는 작품**: 사전·매뉴얼(`order: none`, 지식 책 `reference` 프리셋), 노드 링크(앞머리 `links`), `folio_find`의 `links`, `folio_status.links`는 [references/order.md](references/order.md).
+10. **그림**: 웹툰·삽화의 그림 한 장(설명서 → 점검 → 그림 → 검토 → 승인 → 영수증), 기준 그림, 본문에 놓기(`![[asset:id]]`)는 [references/image.md](references/image.md).

 ## 답하는 법 (`needs_model`)

```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/server/*.test.js` → PASS(`skill-docs`가 모든 도구가 문서에 나오는지 본다). `npm run check` → 1092/1092.

- [ ] **Step 5: 커밋**

```bash
git add server/tools/image.js server/tools/definitions.js server/tools/handlers.js skill/folio/references/image.md skill/folio/SKILL.md test/server/image-tool.test.js test/server/tools.test.js test/server/occurrence-tools.test.js
git commit -m "$(cat <<'EOF'
feat(server): folio_image tool and image skill reference

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task A8: M7a 완료 기준 (MCP stdio)과 정지

**Files:**
- Test: `test/acceptance/m7a.test.js`
- Create: `docs/plans/2026-10-01-m7-image-import-rulings.md`(실행 중 판정 기록)

**Interfaces:**
- Consumes: 모든 M7a 산출물, `connectFolio`(`test/support/mcp-client.js`), `label`(`test/support/fake-host.js`).

- [ ] **Step 1: 완료 기준 테스트 작성**

완료 기준(정본 §20 M7): 새 장면 하나에 그림 한 장을 설명서부터 커밋까지 돌리고, 본문에 놓아 recommit한 뒤 뷰어가 그 그림을 보인다. 엉뚱한 참조는 `image.asset-refs`가 알린다.

`test/acceptance/m7a.test.js` (99줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { label } from '../support/fake-host.js';
import { PNG_A } from '../support/images.js';
import { createImageHost, illustratedWork } from '../support/image-work.js';

/** MCP 너머의 가짜 호스트 모델(노드 실행): 검사는 지적 없이, 원고는 ep-001 fixture 본문과 같은 문장. */
function answer(request) {
  const p = request.payload;
  if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
  if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
  if (p.produces === 'plan') return `${p.node.title || p.node.id} 계획`;
  if (p.produces === 'draft') return '하나는 지하실 끝에서 잠긴 문을 발견했다.\n';
  if (p.produces === 'events') return JSON.stringify({ events: [], appearances: [], mentions: [] });
  throw new Error(`no answer for ${request.purpose}/${p.produces}`);
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

/** folio_run 을 done 까지. needs_user 는 그 질문을 모아 두고 승인한다. */
async function drive(folio, root, start) {
  const labels = [];
  const questions = [];
  let out = await ok(folio.call('folio_run', { root, ...start }));
  for (let i = 0; i < 40 && out.status !== 'done'; i += 1) {
    labels.push(label(out));
    if (out.status === 'needs_model') out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    else if (out.status === 'needs_user') { questions.push(out.question); out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' })); } else throw new Error(`unexpected ${out.status}`);
  }
  labels.push(label(out));
  return { labels, questions };
}

const codes = (questions) => questions.flatMap((q) => [...(q.blocking ?? []), ...(q.advisories ?? [])]).map((f) => f.code);

test('M7a over MCP stdio: a scene is committed, one picture is briefed → checked → drawn → reviewed → approved, placed with ![[asset:id]] by recommit, and shown inline by the viewer', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await illustratedWork();
  assert.equal((await drive(folio, root, { node: 'ep-001' })).labels.at(-1), 'done');

  const host = await createImageHost();
  let out = await ok(folio.call('folio_image', { root, op: 'start', assetId: 'ep-001-door', nodeId: 'ep-001' }));
  const purposes = [];
  while (out.status === 'needs_model') {
    purposes.push(out.requests[0].purpose);
    out = await ok(folio.call('folio_image', { root, op: 'resume', runId: out.runId, answers: await host.answer(out) }));
  }
  assert.deepEqual(purposes, ['image_brief', 'image_generate', 'image_review']);
  assert.equal(out.question.kind, 'image_approval');
  assert.deepEqual(out.question.advisories.map((f) => f.code), ['REFERENCE_MISSING']);
  const review = host.calls.find((c) => c.purpose === 'image_review').payload;
  assert.deepEqual(await readFile(review.image.path), PNG_A, 'the review request points at the staged picture');
  const done = await ok(folio.call('folio_image', { root, op: 'decide', runId: out.runId, action: 'approve' }));
  assert.deepEqual([done.status, done.file], ['done', 'ep-001-door.png']);
  assert.deepEqual(await readFile(join(root, 'assets', 'ep-001-door.png')), PNG_A);
  const scene = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
  assert.doesNotMatch(await readFile(scene, 'utf8'), /asset:/, 'the image commit never writes the node');

  // 작가가 본문에 그림을 놓는다(손 작업) → recommit 이 image.asset-refs 를 지나 다시 커밋한다
  await writeFile(scene, `${await readFile(scene, 'utf8')}\n![[asset:ep-001-door]]\n`);
  const drifted = await ok(folio.call('folio_status', { root }));
  assert.deepEqual(drifted.drift.map((d) => [d.nodeId, d.recommit]), [['ep-001', true]]);
  const recommit = await drive(folio, root, { node: 'ep-001', mode: 'recommit' });
  assert.equal(recommit.labels.at(-1), 'done');
  assert.ok(!codes(recommit.questions).some((c) => c.startsWith('ASSET_')), JSON.stringify(codes(recommit.questions)));
  assert.deepEqual((await ok(folio.call('folio_status', { root }))).drift, []);

  const view = await ok(folio.call('folio_view', { root, nodeId: 'ep-001' }));
  const url = new URL(view.url);
  const headers = { 'x-folio-token': url.searchParams.get('token') };
  const node = await (await fetch(new URL('/api/nodes/ep-001', url), { headers })).json();
  assert.deepEqual(node.assets.inline, [{ id: 'ep-001-door', known: true, hasFile: true, entities: ['hana', 'locked-door'] }]);
  const file = await fetch(new URL('/api/assets/ep-001-door', url), { headers });
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG_A);
  assert.equal(folio.stderr(), '');
});

test('M7a a picture pointing nowhere is caught by image.asset-refs on recommit; images off refuses folio_image but never the locks', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const root = await illustratedWork();
  await drive(folio, root, { node: 'ep-001' });
  const scene = join(root, 'tree', '01-arc-awakening', '01-ep-001.md');
  await writeFile(scene, `${await readFile(scene, 'utf8')}\n![[asset:nowhere]]\n`);
  const recommit = await drive(folio, root, { node: 'ep-001', mode: 'recommit' });
  assert.ok(codes(recommit.questions).includes('ASSET_UNKNOWN'), JSON.stringify(codes(recommit.questions)));
  const off = await illustratedWork((c) => ({ ...c, features: { images: false } }));
  assert.equal((await folio.call('folio_image', { root: off, op: 'start', assetId: 'x' })).error.code, 'FEATURE_DISABLED');
  assert.equal((await drive(folio, off, { node: 'ep-001' })).labels.at(-1), 'done', 'node runs do not need the images feature');
});
```

- [ ] **Step 2: 실행**

Run: `node --test test/acceptance/m7a.test.js` → PASS(이 태스크는 앞 태스크의 통합 확인이라 처음부터 통과해야 한다. 실패하면 앞 태스크의 결함이다 — 판정 기록에 적고 고친다). `npm run check` → 1094/1094.

- [ ] **Step 3: 판정 기록 파일 시작**

`docs/plans/2026-10-01-m7-image-import-rulings.md`:

````markdown
# M7 그림 팩·vibelore 가져오기 판정 기록

계획: `docs/plans/2026-10-01-m7-image-import.md`. 결정 표의 "추천 채택(사용자 확인 필요)" 항목은 사용자가 확인하면 여기 적는다.

## M7a

(태스크마다 `Task <id>: review …` / `Ruling: …` / `minor (deferred): …` 줄)

## M7b

## 다른 레인에 알릴 것
````

- [ ] **Step 4: 진행 줄 쓰고 커밋**

```bash
git add test/acceptance/m7a.test.js docs/plans/2026-10-01-m7-image-import-rulings.md docs/plans/2026-10-01-m7-image-import.md
git commit -m "$(cat <<'EOF'
test(acceptance): M7a one picture from brief to viewer over MCP stdio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: M7a 정지**

`npm run check` 결과, `test/acceptance/m7a.test.js` 결과, 판정 기록 요약, 결정 표에서 사용자 확인이 필요한 항목을 보여 주고 멈춘다.

---

# M7b vibelore 가져오기

시작 조건: M7a·M6b·N6이 main에 병합된 뒤 `feat/m7b-import`를 main에서 딴다(현재 상태 "병합 순서와 겹침").

### Task B1: vibelore 안전 읽기와 합성 fixture

> 리뷰: **가장 강한 모델**. 공격해 볼 것:
> - `from` 안의 링크(파일·폴더), FIFO, 소켓, 이름 규칙 밖 파일, 너무 큰 파일, 파일 수 폭주로 작품 밖을 읽거나 멈출 수 있는가.
> - `.vibelore/` 의 다른 상태(실행 기록, 메모리 DB 등)를 여는가. 검사 영수증의 판정이 결과에 들어오는가.
> - 원본 폴더의 바이트·mtime을 바꾸는가(읽기 전용).
> - fixture가 실제 작품 내용을 담지 않은 합성인가.

**Files:**
- Create: `core/import/read-source.js`, `test/support/import-source.js`, `test/fixtures/vibelore-work/**`
- Test: `test/import/read-source.test.js`

**Interfaces:**
- Produces: `VIBELORE_LIMITS`, `readVibelore(from) → { chapters: [{ number, path, text, sha256 }], characters: [{ path, text, sha256 }], world: [...], arcs: [{ number, path, json, sha256 }], receipts: [{ path, sha256, chapter }], pictures: [{ episode, path, bytes, sha256 }], warnings }`. 오류 `IMPORT_FROM_INVALID`, `IMPORT_FROM_EMPTY`. 경고 `IMPORT_ENTRY_SKIPPED { path, reason }`, `IMPORT_FILE_TOO_LARGE`, `IMPORT_JSON_INVALID`, `IMPORT_TOO_MANY_FILES`. 테스트 도우미 `VIBELORE_FIXTURE`, `vibeloreCopy()`, `importTarget(name?)`, `treeHashes(dir)`.

- [ ] **Step 1: 합성 fixture 만들기**

모두 합성이다(등대 이야기). vibelore 작품 폴더의 모양만 흉내 낸다.

`test/fixtures/vibelore-work/.vibelore/arcs/1.json` (14줄):

```json
{
  "workId": "synthetic-lighthouse",
  "arcNumber": 1,
  "title": "버린 계획",
  "promise": "이 아크는 버려졌다.",
  "startChapter": 1,
  "estimatedEpisodes": 2,
  "status": "rejected",
  "episodes": [
    { "index": 1, "chapter": 1, "title": "버린 1화", "goal": "버림" },
    { "index": 2, "chapter": 2, "title": "버린 2화", "goal": "버림" }
  ],
  "rejectedAt": "2026-01-02T00:00:00.000Z"
}
```

`test/fixtures/vibelore-work/.vibelore/arcs/2.json` (17줄):

```json
{
  "workId": "synthetic-lighthouse",
  "arcNumber": 2,
  "title": "꺼진 등대",
  "promise": "세린은 꺼진 등불의 이유를 찾아 바다의 돌길을 건넌다.",
  "type": "mystery",
  "startChapter": 1,
  "estimatedEpisodes": 5,
  "status": "active",
  "episodes": [
    { "index": 1, "chapter": 1, "title": "등불", "goal": "꺼진 등불을 발견한다" },
    { "index": 2, "chapter": 2, "title": "일지", "beat": "찢긴 일지" },
    { "index": 3, "chapter": 3, "title": "돌길", "goal": "돌길이 열린다" },
    { "index": 4, "chapter": 5, "title": "아직 안 쓴 화", "goal": "미정" }
  ],
  "createdAt": "2026-01-03T00:00:00.000Z"
}
```

`test/fixtures/vibelore-work/.vibelore/check-receipts/check-0001aaaa.json` (11줄):

```json
{
  "checkId": "check-0001aaaa",
  "workflowId": "wf-0001",
  "workId": "synthetic-lighthouse",
  "chapter": 1,
  "proseHash": "sha256:0000000000000000000000000000000000000000000000000000000000000001",
  "verdict": "passed",
  "hardViolations": 0,
  "advisories": [],
  "checkedAt": "2026-01-04T00:00:00.000Z"
}
```

`test/fixtures/vibelore-work/.vibelore/check-receipts/check-0002bbbb.json` (11줄):

```json
{
  "checkId": "check-0002bbbb",
  "workflowId": "wf-0002",
  "workId": "synthetic-lighthouse",
  "chapter": 2,
  "proseHash": "sha256:0000000000000000000000000000000000000000000000000000000000000002",
  "verdict": "failed",
  "hardViolations": 1,
  "advisories": [],
  "checkedAt": "2026-01-05T00:00:00.000Z"
}
```

`test/fixtures/vibelore-work/.vibelore/runs/run-1.json` (1줄):

```json
{ "runId": "run-1", "note": "vibelore 내부 상태 — 가져오지 않는다" }
```

`test/fixtures/vibelore-work/README.md` (9줄):

```markdown
# vibelore-work (합성 fixture)

vibelore 작품 폴더 모양만 흉내 낸 합성 자료다. 실제 작품 글이 아니다. M7b 가져오기 테스트가 읽기만 한다 — 고치지 않는다.

- `chapters/001.md`~`004.md`: 회차. 004 는 어느 아크에도 없다(가져온 회차 아크로 간다).
- `.vibelore/arcs/1.json`: 버린(rejected) 아크 — 가져오지 않는다. `2.json`: 1~3화 아크(5화까지 계획, 4·5화 글은 없음).
- `.vibelore/check-receipts/`: 1화(passed)·2화(failed) 검사 영수증. 판정은 가져오지 않고 파일 hash 만 남긴다.
- `webtoon/episodes/`: 1화 그림 폴더 둘(둘 다 가져오고 경고), 2화는 svg 없이 계획만.
- `.vibelore/runs/`: 가져오지 않는 내부 상태.
```

`test/fixtures/vibelore-work/chapters/001.md` (8줄):

```markdown
---
chapter: 1
title: 꺼진 등불
---

세린은 등대 계단 끝에서 꺼진 등불을 들어 올렸다.

"오늘 밤엔 배가 안 들어와." 무진이 말했다.
```

`test/fixtures/vibelore-work/chapters/002.md` (7줄):

```markdown
---
chapter: 2
---

등대지기의 일지는 마지막 장이 찢겨 있었다.

세린은 찢긴 자리를 손끝으로 쓸었다.
```

`test/fixtures/vibelore-work/chapters/003.md` (6줄):

```markdown
---
chapter: 3
title: 바다로 난 길
---

썰물이 빠지자 바다 한가운데로 돌길이 드러났다.
```

`test/fixtures/vibelore-work/chapters/004.md` (5줄):

```markdown
---
chapter: 4
---

무진은 돌길 끝에서 오래된 종을 찾았다.
```

`test/fixtures/vibelore-work/characters/c1.md` (13줄):

```markdown
---
id: c1
name: 세린
aliases: [등대지기]
role: protagonist
gender: female
genderLabel: 여성
appearance: 짧은 머리, 바랜 남색 외투
registeredAtChapter: 1
---

## 모순
혼자 등대를 지키려 하지만, 등불을 다시 켜려면 남의 손이 필요하다.
```

`test/fixtures/vibelore-work/characters/c2.md` (10줄):

```markdown
---
id: c2
name: 무진
aliases: []
role: ally
gender: male
---

## 모순
떠나려 하면서도 매일 등대로 돌아온다.
```

`test/fixtures/vibelore-work/webtoon/episodes/1-wt-aaaa1111/episode.svg` (1줄):

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120" viewBox="0 0 80 120"><rect width="80" height="120" fill="white"/><circle cx="40" cy="40" r="12" fill="#f2c94c"/><text x="40" y="100" text-anchor="middle" font-size="10">1화</text></svg>
```

`test/fixtures/vibelore-work/webtoon/episodes/1-wt-aaaa1111/plan.json` (1줄):

```json
{ "episode": 1, "note": "가져오지 않는다" }
```

`test/fixtures/vibelore-work/webtoon/episodes/1-wt-bbbb2222/episode.svg` (1줄):

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120" viewBox="0 0 80 120"><rect width="80" height="120" fill="white"/><rect x="28" y="28" width="24" height="24" fill="#2d9cdb"/><text x="40" y="100" text-anchor="middle" font-size="10">1화 다시</text></svg>
```

`test/fixtures/vibelore-work/webtoon/episodes/2-wt-cccc3333/plan.json` (1줄):

```json
{ "episode": 2, "note": "svg 가 없다 — 그림을 가져오지 않는다" }
```

`test/fixtures/vibelore-work/world/setting.md` (7줄):

```markdown
---
workId: synthetic-lighthouse
genre: fantasy
---

## 세계 사실
- 등불이 꺼진 밤에는 바다의 돌길이 열린다.
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/support/import-source.js` (33줄):

```js
import { cp, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../../core/util/hash.js';
import { fixturePath, tempDir } from './fixtures.js';

/** 합성 vibelore 작품(test/fixtures/vibelore-work)의 경로. 테스트는 이 원본을 읽기만 한다. */
export const VIBELORE_FIXTURE = fixturePath('vibelore-work');

/** 합성 vibelore 작품을 임시 폴더로 복사한다(링크·FIFO 같은 손상을 넣어 볼 때). */
export async function vibeloreCopy() {
  const dir = join(await tempDir('folio-vibelore-'), 'source');
  await cp(VIBELORE_FIXTURE, dir, { recursive: true });
  return dir;
}

/** 가져오기 대상: 아직 없는 새 폴더의 절대 경로. */
export async function importTarget(name = 'work') {
  return join(await tempDir('folio-import-'), name);
}

/** 폴더 안 모든 보통 파일의 상대 경로 → hash(원본이 바뀌지 않았는지 보는 데 쓴다). */
export async function treeHashes(dir) {
  const out = {};
  async function walk(rel) {
    for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) out[path] = sha256(await readFile(join(dir, path)));
    }
  }
  await walk('');
  return out;
}
```

`test/import/read-source.test.js` (69줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readVibelore, VIBELORE_LIMITS } from '../../core/import/read-source.js';
import { tempDir } from '../support/fixtures.js';
import { treeHashes, VIBELORE_FIXTURE, vibeloreCopy } from '../support/import-source.js';

const code = (promise) => promise.then(() => 'ok', (e) => e.code);
const posix = { skip: process.platform === 'win32' ? 'links and FIFOs are POSIX-only' : false };

test('readVibelore reads only the known places and names, and never changes the source', async () => {
  const before = await treeHashes(VIBELORE_FIXTURE);
  const read = await readVibelore(VIBELORE_FIXTURE);
  assert.deepEqual(read.chapters.map((c) => [c.number, c.path]), [[1, 'chapters/001.md'], [2, 'chapters/002.md'], [3, 'chapters/003.md'], [4, 'chapters/004.md']]);
  assert.match(read.chapters[0].sha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(read.characters.map((c) => c.path), ['characters/c1.md', 'characters/c2.md']);
  assert.deepEqual(read.world.map((c) => c.path), ['world/setting.md']);
  assert.deepEqual(read.arcs.map((a) => [a.number, a.json.status]), [[1, 'rejected'], [2, 'active']]);
  assert.deepEqual(read.receipts.map((r) => [r.chapter, r.path]), [[1, '.vibelore/check-receipts/check-0001aaaa.json'], [2, '.vibelore/check-receipts/check-0002bbbb.json']]);
  assert.deepEqual(Object.keys(read.receipts[0]), ['path', 'sha256', 'chapter'], 'the verdict is never read into the import');
  assert.deepEqual(read.pictures.map((p) => [p.episode, p.path]), [[1, 'webtoon/episodes/1-wt-aaaa1111/episode.svg'], [1, 'webtoon/episodes/1-wt-bbbb2222/episode.svg']]);
  assert.deepEqual(read.warnings, []);
  assert.deepEqual(await treeHashes(VIBELORE_FIXTURE), before);
});

test('readVibelore refuses a relative, missing, linked or chapterless source', async () => {
  assert.equal(await code(readVibelore('relative/source')), 'IMPORT_FROM_INVALID');
  assert.equal(await code(readVibelore(join(await tempDir(), 'nope'))), 'IMPORT_FROM_INVALID');
  const empty = await tempDir('folio-vibelore-empty-');
  await mkdir(join(empty, 'chapters'));
  assert.equal(await code(readVibelore(empty)), 'IMPORT_FROM_EMPTY');
  if (process.platform !== 'win32') {
    const link = join(await tempDir(), 'link');
    await symlink(VIBELORE_FIXTURE, link);
    assert.equal(await code(readVibelore(link)), 'IMPORT_FROM_INVALID');
  }
});

test('links, FIFOs, odd names and oversized files inside the source are skipped with a warning, never followed', posix, async () => {
  const source = await vibeloreCopy();
  const outside = await tempDir('folio-outside-');
  await writeFile(join(outside, 'secret.md'), '---\nchapter: 9\n---\n작품 밖 비밀\n');
  await rm(join(source, 'chapters', '002.md'));
  await symlink(join(outside, 'secret.md'), join(source, 'chapters', '002.md'));
  await rm(join(source, 'characters'), { recursive: true });
  await mkdir(join(outside, 'people'));
  await writeFile(join(outside, 'people', 'x.md'), '---\nid: x\nname: 밖\n---\n');
  await symlink(join(outside, 'people'), join(source, 'characters'));
  execFileSync('mkfifo', [join(source, 'chapters', '005.md')]);
  await writeFile(join(source, 'chapters', '006.md'), 'x'.repeat(VIBELORE_LIMITS.text + 1));
  await writeFile(join(source, 'chapters', 'notes.md'), '이름 규칙 밖');
  const svg = join(source, 'webtoon', 'episodes', '1-wt-bbbb2222', 'episode.svg');
  await rm(svg);
  await symlink(join(outside, 'secret.md'), svg);
  const read = await readVibelore(source);
  assert.deepEqual(read.chapters.map((c) => c.number), [1, 3, 4]);
  assert.deepEqual(read.characters, []);
  assert.deepEqual(read.pictures.map((p) => p.path), ['webtoon/episodes/1-wt-aaaa1111/episode.svg']);
  assert.deepEqual(read.warnings.map((w) => [w.code, w.path, w.reason ?? null]), [
    ['IMPORT_ENTRY_SKIPPED', 'chapters/002.md', 'link'],
    ['IMPORT_ENTRY_SKIPPED', 'chapters/005.md', 'not a file'],
    ['IMPORT_FILE_TOO_LARGE', 'chapters/006.md', null],
    ['IMPORT_ENTRY_SKIPPED', 'characters', 'link'],
    ['IMPORT_ENTRY_SKIPPED', 'webtoon/episodes/1-wt-bbbb2222/episode.svg', 'link'],
  ]);
  assert.ok(!JSON.stringify(read.chapters).includes('비밀'));
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/import/read-source.test.js`
Expected: FAIL — `core/import/read-source.js` 없음.

- [ ] **Step 4: 구현**

`core/import/read-source.js` (120줄):

```js
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { FolioError } from '../errors.js';
import { sha256 } from '../util/hash.js';

/** 한 파일·전체의 상한. 넘는 파일은 읽지 않고 경고로 남긴다. */
export const VIBELORE_LIMITS = Object.freeze({ text: 2 * 1024 * 1024, json: 1024 * 1024, svg: 20 * 1024 * 1024, files: 5000 });

/** 읽는 자리와 이름 규칙. 이 밖의 파일(.vibelore 의 다른 상태, 실행 기록, 그림 계획)은 열지 않는다. */
const CHAPTER = /^(\d{1,5})\.md$/;
const DOC = /^[A-Za-z0-9][\w-]{0,99}\.md$/;
const ARC = /^(\d{1,4})\.json$/;
const RECEIPT = /^[A-Za-z0-9][\w-]{0,99}\.json$/;
const EPISODE_DIR = /^(\d{1,5})-[A-Za-z0-9][\w-]{0,99}$/;

/**
 * 폴더 하나의 이름 목록. 그 폴더가 없으면 빈 목록, 링크·보통 폴더가 아니면 경고와 빈 목록(따라가지 않는다).
 * @param {{ from: string, warnings: any[] }} state
 * @param {string} rel  from 기준 상대 경로('/' 구분)
 */
async function listDir(state, rel) {
  const path = join(state.from, ...rel.split('/'));
  let info;
  try { info = await lstat(path); } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return [];
    throw error;
  }
  if (!info.isDirectory()) { state.warnings.push({ code: 'IMPORT_ENTRY_SKIPPED', path: rel, reason: info.isSymbolicLink() ? 'link' : 'not a directory' }); return []; }
  return (await readdir(path, { withFileTypes: true })).map((entry) => entry.name).sort();
}

/**
 * 파일 하나를 읽는다: 링크를 따라가지 않고(O_NOFOLLOW), FIFO 에 멈추지 않고(O_NONBLOCK), 연 손잡이로 보통 파일·크기를 본다.
 * 그 밖이면 경고를 남기고 null.
 */
async function readFileSafe(state, rel, limit) {
  if (state.count >= VIBELORE_LIMITS.files) { state.warnings.push({ code: 'IMPORT_TOO_MANY_FILES', path: rel }); return null; }
  state.count += 1;
  let handle;
  try {
    handle = await open(join(state.from, ...rel.split('/')), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    state.warnings.push({ code: 'IMPORT_ENTRY_SKIPPED', path: rel, reason: error?.code === 'ELOOP' ? 'link' : 'unreadable' });
    return null;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) { state.warnings.push({ code: 'IMPORT_ENTRY_SKIPPED', path: rel, reason: 'not a file' }); return null; }
    if (info.size > limit) { state.warnings.push({ code: 'IMPORT_FILE_TOO_LARGE', path: rel, limit }); return null; }
    const bytes = await handle.readFile();
    if (bytes.length > limit) { state.warnings.push({ code: 'IMPORT_FILE_TOO_LARGE', path: rel, limit }); return null; }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function readText(state, rel) {
  const bytes = await readFileSafe(state, rel, VIBELORE_LIMITS.text);
  return bytes ? { path: rel, text: bytes.toString('utf8'), sha256: sha256(bytes) } : null;
}

async function readJson(state, rel) {
  const bytes = await readFileSafe(state, rel, VIBELORE_LIMITS.json);
  if (!bytes) return null;
  try {
    const json = JSON.parse(bytes.toString('utf8'));
    if (json && typeof json === 'object' && !Array.isArray(json)) return { path: rel, json, sha256: sha256(bytes) };
  } catch { /* 아래 경고 */ }
  state.warnings.push({ code: 'IMPORT_JSON_INVALID', path: rel });
  return null;
}

/**
 * vibelore 작품 폴더를 읽기만 한다. 쓰지 않는다. 정해진 자리의 정해진 이름만 연다:
 * chapters/<n>.md, characters/*.md, world/*.md, .vibelore/arcs/<n>.json, .vibelore/check-receipts/*.json,
 * webtoon/episodes/<회차>-<id>/episode.svg. from 자신이 링크이거나 폴더가 아니면 IMPORT_FROM_INVALID, 회차가 없으면 IMPORT_FROM_EMPTY.
 * @param {string} from  절대 경로
 */
export async function readVibelore(from) {
  if (typeof from !== 'string' || !isAbsolute(from) || from.includes('\0')) throw new FolioError('IMPORT_FROM_INVALID', 'from must be an absolute path');
  const info = await lstat(from).catch(() => null);
  if (!info?.isDirectory()) throw new FolioError('IMPORT_FROM_INVALID', 'from must be a directory, not a link or a file', { reason: info?.isSymbolicLink() ? 'link' : info ? 'not a directory' : 'missing' });
  const state = { from, warnings: [], count: 0 };
  const out = { chapters: [], characters: [], world: [], arcs: [], receipts: [], pictures: [], warnings: state.warnings };
  for (const name of await listDir(state, 'chapters')) {
    const match = CHAPTER.exec(name);
    const read = match ? await readText(state, `chapters/${name}`) : null;
    if (read) out.chapters.push({ number: Number(match[1]), ...read });
  }
  out.chapters.sort((a, b) => a.number - b.number);
  for (const [dir, list] of /** @type {Array<[string, any[]]>} */ ([['characters', out.characters], ['world', out.world]])) {
    for (const name of await listDir(state, dir)) {
      const read = DOC.test(name) ? await readText(state, `${dir}/${name}`) : null;
      if (read) list.push(read);
    }
  }
  for (const name of await listDir(state, '.vibelore/arcs')) {
    const match = ARC.exec(name);
    const read = match ? await readJson(state, `.vibelore/arcs/${name}`) : null;
    if (read) out.arcs.push({ number: Number(match[1]), ...read });
  }
  out.arcs.sort((a, b) => a.number - b.number);
  for (const name of await listDir(state, '.vibelore/check-receipts')) {
    const read = RECEIPT.test(name) ? await readJson(state, `.vibelore/check-receipts/${name}`) : null;
    // 판정(verdict)·점수는 들고 오지 않는다 — 어느 회차의 영수증인지와 파일 hash 만.
    if (read && Number.isInteger(read.json.chapter)) out.receipts.push({ path: read.path, sha256: read.sha256, chapter: read.json.chapter });
  }
  for (const name of await listDir(state, 'webtoon/episodes')) {
    const match = EPISODE_DIR.exec(name);
    if (!match) continue;
    const rel = `webtoon/episodes/${name}`;
    if (!(await listDir(state, rel)).includes('episode.svg')) continue;
    const bytes = await readFileSafe(state, `${rel}/episode.svg`, VIBELORE_LIMITS.svg);
    if (bytes) out.pictures.push({ episode: Number(match[1]), path: `${rel}/episode.svg`, bytes, sha256: sha256(bytes) });
  }
  if (out.chapters.length === 0) throw new FolioError('IMPORT_FROM_EMPTY', 'no chapters/<n>.md to import', { warnings: state.warnings.slice(0, 20) });
  return out;
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/import/read-source.test.js test/core/parity-isolation.test.js` → PASS(가드: 테스트의 import 경로에 `vibelore`가 없어야 한다). `npm run check` → 1097/1097.

- [ ] **Step 6: 커밋**

```bash
git add core/import/read-source.js test/support/import-source.js test/import/read-source.test.js test/fixtures/vibelore-work
git commit -m "$(cat <<'EOF'
feat(import): read a vibelore work folder safely, with a synthetic fixture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task B2: vibelore → Folio 매핑 (순수)

**Files:**
- Create: `core/import/map-source.js`
- Test: `test/import/map-source.test.js`

**Interfaces:**
- Consumes: `readVibelore` 결과(B1), `parseDoc`(`core/store/frontmatter.js`), `ID`(`core/store/ids.js`).
- Produces: `FALLBACK_ARC = { id: 'arc-imported', title: '가져온 회차' }`, `CHARACTER_FIELDS`, `episodeId(number)`, `mapVibelore(read) → { arcs: [{ id, title, body, origin, episodes: [{ id, number, title, body, origin: { path, sha256, receipts: [{ path, sha256 }] }, pictures: [{ id, file, bytes, origin }] }] }], entities: [{ id, kind, data, body, origin }], warnings }`. 경고 `IMPORT_CHAPTER_IN_TWO_ARCS`, `IMPORT_ARC_EMPTY`, `IMPORT_FRONTMATTER_INVALID`, `IMPORT_ENTITY_ID_INVALID`, `IMPORT_ENTITY_NAME_MISSING`, `IMPORT_ENTITY_DUPLICATE`, `IMPORT_PICTURES_MULTIPLE`, `IMPORT_PICTURE_NO_CHAPTER`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/import/map-source.test.js` (50줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVibelore } from '../../core/import/read-source.js';
import { episodeId, FALLBACK_ARC, mapVibelore } from '../../core/import/map-source.js';
import { VIBELORE_FIXTURE } from '../support/import-source.js';

test('mapVibelore: kept arcs in number order, chapters without an arc under the fallback arc, titles from the chapter then the arc plan', async () => {
  const plan = mapVibelore(await readVibelore(VIBELORE_FIXTURE));
  assert.deepEqual(plan.arcs.map((a) => [a.id, a.title, a.episodes.map((e) => [e.id, e.title])]), [
    ['arc-2', '꺼진 등대', [['ep-001', '꺼진 등불'], ['ep-002', '일지'], ['ep-003', '바다로 난 길']]],
    [FALLBACK_ARC.id, FALLBACK_ARC.title, [['ep-004', '4화']]],
  ]);
  assert.equal(plan.arcs[0].body, '세린은 꺼진 등불의 이유를 찾아 바다의 돌길을 건넌다.\n');
  assert.deepEqual(plan.arcs[0].origin.path, '.vibelore/arcs/2.json');
  const [first, second] = plan.arcs[0].episodes;
  assert.equal(first.body, '세린은 등대 계단 끝에서 꺼진 등불을 들어 올렸다.\n\n"오늘 밤엔 배가 안 들어와." 무진이 말했다.\n');
  assert.deepEqual(first.origin.receipts.map((r) => r.path), ['.vibelore/check-receipts/check-0001aaaa.json']);
  assert.deepEqual(Object.keys(first.origin.receipts[0]), ['path', 'sha256']);
  assert.deepEqual(first.pictures.map((p) => [p.id, p.file, p.origin.path]), [
    ['ep-001-webtoon', 'ep-001-webtoon.svg', 'webtoon/episodes/1-wt-aaaa1111/episode.svg'],
    ['ep-001-webtoon-2', 'ep-001-webtoon-2.svg', 'webtoon/episodes/1-wt-bbbb2222/episode.svg'],
  ]);
  assert.deepEqual(second.pictures, []);
  assert.deepEqual(plan.warnings.map((w) => w.code), ['IMPORT_PICTURES_MULTIPLE']);
  assert.ok(!JSON.stringify(plan).includes('verdict') && !JSON.stringify(plan).includes('버린'), 'no verdict, no rejected arc');
});

test('mapVibelore: characters keep only name, aliases, gender and role; world files become world entities', async () => {
  const plan = mapVibelore(await readVibelore(VIBELORE_FIXTURE));
  assert.deepEqual(plan.entities.map((e) => [e.kind, e.id, e.data]), [
    ['character', 'c1', { id: 'c1', kind: 'character', name: '세린', aliases: ['등대지기'], gender: 'female', role: 'protagonist' }],
    ['character', 'c2', { id: 'c2', kind: 'character', name: '무진', aliases: [], gender: 'male', role: 'ally' }],
    ['world', 'setting', { id: 'setting', kind: 'world', name: 'setting' }],
  ]);
  assert.equal(plan.entities[0].body, '## 모순\n혼자 등대를 지키려 하지만, 등불을 다시 켜려면 남의 손이 필요하다.\n');
});

test('mapVibelore on hand-made reads: a chapter in two arcs stays in the first, an empty arc and a broken frontmatter warn, ids pad to three digits', () => {
  const file = (path, text) => ({ path, text, sha256: `sha256:${'0'.repeat(64)}` });
  const arc = (number, chapters, extra = {}) => ({ number, path: `.vibelore/arcs/${number}.json`, sha256: `sha256:${'1'.repeat(64)}`, json: { title: `${number}부`, episodes: chapters.map((chapter) => ({ chapter })), ...extra } });
  const plan = mapVibelore({
    chapters: [{ number: 7, ...file('chapters/007.md', '---\nchapter: [\n---\n본문\n') }, { number: 1200, ...file('chapters/1200.md', '긴 연재\n') }],
    characters: [file('characters/x.md', '---\nid: Bad Id\nname: 이상\n---\n'), file('characters/y.md', '---\nid: y\n---\n')], world: [],
    arcs: [arc(1, [7]), arc(2, [7, 1200]), arc(3, [99])], receipts: [], pictures: [{ episode: 50, path: 'webtoon/episodes/50-wt-x/episode.svg', bytes: Buffer.from('<svg/>'), sha256: 'x' }], warnings: [],
  });
  assert.deepEqual(plan.arcs.map((a) => [a.id, a.episodes.map((e) => e.id)]), [['arc-1', ['ep-007']], ['arc-2', ['ep-1200']]]);
  assert.equal(plan.arcs[0].episodes[0].body, '---\nchapter: [\n---\n본문\n');
  assert.deepEqual(plan.warnings.map((w) => w.code), ['IMPORT_CHAPTER_IN_TWO_ARCS', 'IMPORT_ARC_EMPTY', 'IMPORT_FRONTMATTER_INVALID', 'IMPORT_ENTITY_ID_INVALID', 'IMPORT_ENTITY_NAME_MISSING', 'IMPORT_PICTURE_NO_CHAPTER']);
  assert.equal(episodeId(7), 'ep-007');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/import/map-source.test.js`
Expected: FAIL — `core/import/map-source.js` 없음.

- [ ] **Step 3: 구현**

`core/import/map-source.js` (103줄):

```js
import { parseDoc } from '../store/frontmatter.js';
import { ID } from '../store/ids.js';

/** 가져온 회차 중 어느 아크에도 없는 것을 모으는 아크. */
export const FALLBACK_ARC = Object.freeze({ id: 'arc-imported', title: '가져온 회차' });
/** 인물 앞머리에서 가져오는 필드. 그 밖(외모·호칭 규칙 등 vibelore 내부 계약)은 본문과 함께 남기지 않는다. */
export const CHARACTER_FIELDS = Object.freeze(['gender', 'role']);

const text = (value, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
export const episodeId = (number) => `ep-${String(number).padStart(3, '0')}`;

/** 앞머리를 읽는다. 깨진 앞머리는 경고를 남기고 앞머리 없이(글 전체를 본문으로) 둔다. */
function readDoc(file, warnings) {
  try { return parseDoc(file.text, { source: file.path }); } catch {
    warnings.push({ code: 'IMPORT_FRONTMATTER_INVALID', path: file.path });
    return { data: {}, body: file.text };
  }
}

const trimBody = (body) => `${body.replace(/^\s*\n/, '').trimEnd()}\n`;

/** 버리지 않은 아크(번호 순). 한 회차는 그 회차를 처음 적은 아크에 간다. 글이 없는 회차는 빠지고, 회차가 하나도 없는 아크도 빠진다. */
function arcsOf(read, chapters, warnings) {
  const taken = new Map();
  const arcs = [];
  for (const arc of read.arcs) {
    const json = arc.json;
    if (json.status === 'rejected' || json.rejectedAt) continue;
    const listed = Array.isArray(json.episodes) ? json.episodes.filter((e) => Number.isInteger(e?.chapter)) : [];
    const id = `arc-${arc.number}`;
    const episodes = [];
    for (const entry of listed) {
      if (!chapters.has(entry.chapter)) continue;
      if (taken.has(entry.chapter)) { warnings.push({ code: 'IMPORT_CHAPTER_IN_TWO_ARCS', chapter: entry.chapter, kept: taken.get(entry.chapter), path: arc.path }); continue; }
      taken.set(entry.chapter, id);
      episodes.push({ number: entry.chapter, plannedTitle: text(entry.title) });
    }
    if (episodes.length === 0) { warnings.push({ code: 'IMPORT_ARC_EMPTY', path: arc.path }); continue; }
    arcs.push({ id, title: text(json.title) ?? `${arc.number}부`, body: text(json.promise, 4000) ? `${text(json.promise, 4000)}\n` : '', origin: { path: arc.path, sha256: arc.sha256 }, episodes });
  }
  const rest = [...chapters.keys()].filter((n) => !taken.has(n)).map((number) => ({ number, plannedTitle: null }));
  if (rest.length) arcs.push({ id: FALLBACK_ARC.id, title: FALLBACK_ARC.title, body: '', origin: null, episodes: rest });
  return arcs;
}

/** 회차의 그림: 같은 회차 폴더가 여럿이면 모두 가져오고 경고한다(어느 것이 승인본인지 짐작하지 않는다). */
function picturesOf(read, number, warnings) {
  const found = read.pictures.filter((p) => p.episode === number);
  if (found.length > 1) warnings.push({ code: 'IMPORT_PICTURES_MULTIPLE', chapter: number, paths: found.map((p) => p.path) });
  return found.map((picture, index) => {
    const id = `${episodeId(number)}-webtoon${index ? `-${index + 1}` : ''}`;
    return { id, file: `${id}.svg`, bytes: picture.bytes, origin: { path: picture.path, sha256: picture.sha256 } };
  });
}

function entityOf(file, kind, warnings) {
  const { data, body } = readDoc(file, warnings);
  const base = file.path.split('/').pop().replace(/\.md$/, '').toLowerCase();
  const id = kind === 'character' && typeof data.id === 'string' ? data.id.toLowerCase() : base;
  if (!ID.test(id) || id.length > 100) { warnings.push({ code: 'IMPORT_ENTITY_ID_INVALID', path: file.path }); return null; }
  const name = kind === 'character' ? text(data.name) : id;
  if (!name) { warnings.push({ code: 'IMPORT_ENTITY_NAME_MISSING', path: file.path }); return null; }
  const fields = { id, kind, name };
  if (kind === 'character') {
    fields.aliases = Array.isArray(data.aliases) ? data.aliases.map((a) => text(a)).filter(Boolean).slice(0, 50) : [];
    for (const key of CHARACTER_FIELDS) if (text(data[key])) fields[key] = text(data[key]);
  }
  return { id, kind, data: fields, body: trimBody(body), origin: { path: file.path, sha256: file.sha256 } };
}

/**
 * 읽은 vibelore 작품 → Folio 작품 계획(쓰지 않는다). 아크·회차 노드는 모두 status: imported 이고, 출처(파일 경로·hash)와
 * 그 회차의 vibelore 검사 영수증 파일(경로·hash)만 기록할 거리로 남긴다. 판정·점수는 옮기지 않는다.
 * @param {Awaited<ReturnType<typeof import('./read-source.js').readVibelore>>} read
 */
export function mapVibelore(read) {
  const warnings = [...read.warnings];
  const chapters = new Map(read.chapters.map((c) => [c.number, c]));
  const arcs = arcsOf(read, chapters, warnings).map((arc) => ({
    ...arc,
    episodes: arc.episodes.map(({ number, plannedTitle }) => {
      const file = chapters.get(number);
      const { data, body } = readDoc(file, warnings);
      return {
        id: episodeId(number), number, title: text(data.title) ?? plannedTitle ?? `${number}화`, body: trimBody(body),
        origin: { path: file.path, sha256: file.sha256, receipts: read.receipts.filter((r) => r.chapter === number).map((r) => ({ path: r.path, sha256: r.sha256 })) },
        pictures: picturesOf(read, number, warnings),
      };
    }),
  }));
  const entities = [];
  for (const [kind, files] of [['character', read.characters], ['world', read.world]]) {
    for (const file of files) {
      const entity = entityOf(file, kind, warnings);
      if (!entity) continue;
      if (entities.some((e) => e.id === entity.id)) { warnings.push({ code: 'IMPORT_ENTITY_DUPLICATE', id: entity.id, path: file.path }); continue; }
      entities.push(entity);
    }
  }
  const covered = new Set(arcs.flatMap((a) => a.episodes.map((e) => e.number)));
  for (const picture of read.pictures) if (!covered.has(picture.episode)) warnings.push({ code: 'IMPORT_PICTURE_NO_CHAPTER', path: picture.path });
  return { arcs, entities, warnings };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/import/map-source.test.js` → PASS. `npm run check` → 1100/1100.

- [ ] **Step 5: 커밋**

```bash
git add core/import/map-source.js test/import/map-source.test.js
git commit -m "$(cat <<'EOF'
feat(import): map a vibelore work onto arcs, episodes, entities and pictures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task B3: 가져오기 쓰기, 가져오기 기록, 끝남·recommit·영수증 화면

> 리뷰: **가장 강한 모델**. 공격해 볼 것:
> - 가져오기 기록으로 "검사 통과"를 흉내 낼 수 있는가: `lastCommits`가 세는가, 영수증 목록이 `committed: true`나 `receiptId`를 주는가, vibelore `verdict`가 어디든 들어가는가.
> - 앞머리 `status`만 손으로 바꿔 끝남을 만들 수 있는가(`committed` → `COMMITTED_WITHOUT_RECORD`, `imported` 기록 없음 → 끝나지 않음).
> - `root`가 원본 안(직접·링크 경유), 이미 있음, 부모 없음, 실패 중간 — 원본이나 다른 폴더에 쓰는가, 임시 폴더가 남는가.
> - recommit이 가져온 본문을 원고로 삼고 다시 쓰지 않는가. 그 뒤 영수증은 보통 잠금(hash 일치·hard 차단)을 그대로 지나는가.
> - `done.js`·`recommit-plan.js` 변경이 기존 노드(커밋·초안)의 동작을 한 글자도 바꾸지 않는가.

**Files:**
- Create: `core/import/records.js`, `core/import/import-work.js`
- Modify: `core/run/done.js`, `core/run/recommit-plan.js`, `core/view/receipt-view.js`
- Test: `test/import/import-work.test.js`

**Interfaces:**
- Consumes: B1·B2, `initWork`, `writeNode`, `writeEntity`, `writeAssetOnce`(A3), `openLedger`, `openWorkspace`, `entryName`.
- Produces: `IMPORT_RECORD = 'import'`, `IMPORTED = 'imported'`, `importRecord({ importId, nodeId, importedHash, origin })`, `lastImports(records) → Map`. `IMPORT_PACKS`, `IMPORT_PRESET`, `importVibelore(root, { from, title?, packs, now?, newId? }) → { root, importId, status: 'imported', imported: { arcs, episodes, entities, assets }, warnings }`. 오류 `ROOT_NOT_ABSOLUTE`, `IMPORT_ROOT_EXISTS`, `IMPORT_ROOT_INVALID`, `IMPORT_ROOT_INSIDE_SOURCE`. `doneNodes`가 가져온 노드를 센다. `viewReceiptList` 노드마다 `imported: { importId, status, at, from, path } | null`, `viewNodeReceipts`에 `imported`(+ `importedHash`, `origin`).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/import/import-work.test.js` (89줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadBuiltinPacks } from '../../packs/index.js';
import { importVibelore } from '../../core/import/import-work.js';
import { lastImports } from '../../core/import/records.js';
import { openLedger } from '../../core/ledger/ledger.js';
import { lastCommits } from '../../core/ledger/receipts.js';
import { doneNodes } from '../../core/run/done.js';
import { createRunner } from '../../core/run/runner.js';
import { openWorkspace } from '../../core/run/workspace.js';
import { workStatus } from '../../core/status.js';
import { viewNodeReceipts, viewReceiptList } from '../../core/view/receipt-view.js';
import { sha256 } from '../../core/util/hash.js';
import { parseYaml } from '../../core/util/yaml.js';
import { createFakeHost, driveToEnd } from '../support/fake-host.js';
import { tempDir } from '../support/fixtures.js';
import { importTarget, treeHashes, VIBELORE_FIXTURE, vibeloreCopy } from '../support/import-source.js';

const packs = await loadBuiltinPacks();
const code = (promise) => promise.then(() => 'ok', (e) => e.code);
const ids = () => { let n = 0; return (prefix) => `${prefix}-${++n}`; };

test('importVibelore makes a new work: imported nodes, entities, webtoon pictures, and import records that are not receipts', async () => {
  const before = await treeHashes(VIBELORE_FIXTURE);
  const root = await importTarget();
  const out = await importVibelore(root, { from: VIBELORE_FIXTURE, title: '등대', packs, newId: ids(), now: () => '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(out, { root, importId: 'import-1', status: 'imported', imported: { arcs: 2, episodes: 4, entities: 3, assets: 2 }, warnings: [out.warnings[0]] });
  assert.equal(out.warnings[0].code, 'IMPORT_PICTURES_MULTIPLE');
  assert.deepEqual(await treeHashes(VIBELORE_FIXTURE), before, 'the source is only read');
  const { work } = await openWorkspace(root, { packs });
  assert.deepEqual([work.config.title, work.config.packs], ['등대', ['novel', 'image']]);
  assert.deepEqual([...work.tree.nodes.values()].map((n) => [n.id, n.status, n.path]), [
    ['arc-2', 'imported', '01-arc-2/_node.md'], ['ep-001', 'imported', '01-arc-2/01-ep-001.md'], ['ep-002', 'imported', '01-arc-2/02-ep-002.md'],
    ['ep-003', 'imported', '01-arc-2/03-ep-003.md'], ['arc-imported', 'imported', '02-arc-imported/_node.md'], ['ep-004', 'imported', '02-arc-imported/01-ep-004.md'],
  ]);
  assert.deepEqual(work.tree.nodes.get('ep-001').assets, ['ep-001-webtoon', 'ep-001-webtoon-2']);
  assert.deepEqual(await readFile(join(root, 'assets', 'ep-001-webtoon.svg')), await readFile(join(VIBELORE_FIXTURE, 'webtoon', 'episodes', '1-wt-aaaa1111', 'episode.svg')));
  assert.deepEqual(parseYaml(await readFile(join(root, 'assets', 'ep-001-webtoon.yaml'), 'utf8')).imported.path, 'webtoon/episodes/1-wt-aaaa1111/episode.svg');
  assert.deepEqual([...work.entities.keys()], ['c1', 'c2', 'setting']);
  const records = await openLedger(root, 'receipts').readAll();
  assert.deepEqual(records.map((r) => [r.type, r.nodeId, r.status]), [...work.tree.nodes.keys()].map((id) => ['import', id, 'imported']));
  const ep1 = records.find((r) => r.nodeId === 'ep-001');
  assert.equal(ep1.importedHash, sha256(work.tree.nodes.get('ep-001').body));
  assert.deepEqual(ep1.origin.receipts.map((r) => r.path), ['.vibelore/check-receipts/check-0001aaaa.json']);
  assert.ok(!JSON.stringify(records).match(/verdict|passed|failed/), 'no vibelore verdict is carried over');
  assert.equal(lastCommits(records).size, 0, 'an import record is never a commit');
  assert.deepEqual([...doneNodes(work, records)].sort(), [...work.tree.nodes.keys()].sort());
  const status = await workStatus(root, { packs });
  assert.deepEqual([status.next, status.drift], [null, []]);
  const list = await viewReceiptList(root, { packs });
  assert.deepEqual(list.nodes.map((n) => [n.nodeId, n.committed, n.receiptId, n.imported?.status]), [...work.tree.nodes.keys()].map((id) => [id, false, null, 'imported']));
  const one = await viewNodeReceipts(root, { packs }, 'ep-002');
  assert.deepEqual([one.receipt, one.imported.status, one.imported.path, one.imported.origin.receipts.length], [null, 'imported', 'chapters/002.md', 1]);
});

test('importVibelore refuses an existing root, a root inside the source, a missing parent, and leaves nothing behind', async () => {
  const exists = await tempDir('folio-import-exists-');
  assert.equal(await code(importVibelore(exists, { from: VIBELORE_FIXTURE, packs })), 'IMPORT_ROOT_EXISTS');
  const source = await vibeloreCopy();
  const before = await treeHashes(source);
  assert.equal(await code(importVibelore(join(source, 'folio'), { from: source, packs })), 'IMPORT_ROOT_INSIDE_SOURCE');
  assert.equal(await code(importVibelore(join(source, 'chapters', 'x'), { from: source, packs })), 'IMPORT_ROOT_INSIDE_SOURCE');
  assert.deepEqual(await treeHashes(source), before, 'nothing was written into the source');
  assert.equal(await code(importVibelore(join(await tempDir(), 'a', 'b'), { from: VIBELORE_FIXTURE, packs })), 'IMPORT_ROOT_INVALID');
  assert.equal(await code(importVibelore('relative/work', { from: VIBELORE_FIXTURE, packs })), 'ROOT_NOT_ABSOLUTE');
  const root = await importTarget();
  assert.equal(await code(importVibelore(root, { from: VIBELORE_FIXTURE, packs: new Map() })), 'PACK_UNKNOWN');
  assert.deepEqual(await readdir(dirname(root)), [], 'a failed import removes its temporary folder and makes no root');
});

test('an imported node is checked by Folio only through recommit: the receipt then follows the normal locks', async () => {
  const root = await importTarget();
  await importVibelore(root, { from: VIBELORE_FIXTURE, packs, newId: ids() });
  const host = createFakeHost();
  const trail = await driveToEnd(() => createRunner({ root, packs }), host, { start: { node: 'ep-001', mode: 'recommit' }, until: (o) => o.status === 'done' });
  assert.equal(trail.at(-1).status, 'done');
  assert.ok(!host.calls.some((c) => c.payload.produces === 'draft'), 'the imported text is the draft; it is never rewritten');
  const records = await openLedger(root, 'receipts').readAll();
  assert.equal(lastCommits(records).get('ep-001').committedHash, lastImports(records).get('ep-001').importedHash);
  const one = await viewNodeReceipts(root, { packs }, 'ep-001');
  assert.deepEqual([typeof one.receipt.receiptId, one.imported.status], ['string', 'imported']);
  const { work } = await openWorkspace(root, { packs });
  assert.equal(work.tree.nodes.get('ep-001').status, 'committed');
  await writeFile(join(root, 'tree', '01-arc-2', '02-ep-002.md'), (await readFile(join(root, 'tree', '01-arc-2', '02-ep-002.md'), 'utf8')).replace('status: imported', 'status: committed'));
  const status = await workStatus(root, { packs });
  assert.deepEqual(status.drift.map((d) => [d.nodeId, d.code]), [['ep-002', 'COMMITTED_WITHOUT_RECORD']], 'a hand-made "committed" is not a commit');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/import/import-work.test.js`
Expected: FAIL — `core/import/import-work.js` 없음.

- [ ] **Step 3: 구현**

`core/import/records.js` (21줄):

```js
import { HASH } from '../ledger/receipts.js';

/** 가져오기 기록의 type. 영수증(receipt)·커밋(commit)과 다른 종류다 — 검사를 지난 기록이 아니다. */
export const IMPORT_RECORD = 'import';
/** 가져온 노드의 상태. 이 값만 적는다("검사 통과"가 아니다). */
export const IMPORTED = 'imported';

/**
 * 노드 하나의 가져오기 기록(영수증 기록장에 남긴다). 판정·점수는 담지 않는다 — 출처 파일과 그 hash, 원본 쪽 검사 영수증 파일의 hash 만.
 * @param {{ importId: string, nodeId: string, importedHash: string, origin: Record<string, any> }} input
 */
export const importRecord = ({ importId, nodeId, importedHash, origin }) => ({ type: IMPORT_RECORD, importId, nodeId, status: IMPORTED, importedHash, origin });

/** 노드 id → 마지막 가져오기 기록. 모양이 틀린 기록(상태가 imported 가 아니거나 hash 가 없음)은 세지 않는다. */
export function lastImports(records) {
  const imports = new Map();
  for (const record of records) {
    if (record.type === IMPORT_RECORD && record.status === IMPORTED && typeof record.nodeId === 'string' && HASH.test(record.importedHash ?? '')) imports.set(record.nodeId, record);
  }
  return imports;
}
```

`core/import/import-work.js` (93줄):

```js
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { openWorkspace } from '../run/workspace.js';
import { writeAssetOnce } from '../store/assets.js';
import { writeEntity } from '../store/entities.js';
import { NODE_FILE, TREE_DIR, writeNode } from '../store/tree.js';
import { entryName } from '../structure/naming.js';
import { sha256 } from '../util/hash.js';
import { stringifyYaml } from '../util/yaml.js';
import { initWork } from '../work/init.js';
import { importRecord, IMPORTED } from './records.js';
import { mapVibelore } from './map-source.js';
import { readVibelore } from './read-source.js';

/** 가져온 작품의 팩과 프리셋. 검사 세트는 프리셋 그대로다 — 그림 세트(image.basic)는 작가가 고른다(folio_config 가 추천). */
export const IMPORT_PACKS = Object.freeze(['novel', 'image']);
export const IMPORT_PRESET = 'serial';

const width = (count) => Math.max(2, String(count).length);
const inside = (parent, child) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && rel.split(sep)[0] !== '..'); };

/** root 는 아직 없는 절대 경로, 그 부모는 있는 폴더, 그리고 원본(from) 안이 아니어야 한다(원본에 쓰지 않는다). */
async function assertTarget(root, from) {
  if (typeof root !== 'string' || !isAbsolute(root) || root.includes('\0')) throw new FolioError('ROOT_NOT_ABSOLUTE', 'root must be an absolute path');
  if (await lstat(root).then(() => true, (e) => (e?.code === 'ENOENT' ? false : Promise.reject(e)))) throw new FolioError('IMPORT_ROOT_EXISTS', 'import makes a new work folder; root must not exist yet', { root });
  const parent = await realpath(dirname(root)).catch(() => null);
  if (!parent || !(await lstat(parent)).isDirectory()) throw new FolioError('IMPORT_ROOT_INVALID', 'the folder that will hold root must exist', { root });
  const source = await realpath(from);
  if (inside(source, join(parent, basename(root)))) throw new FolioError('IMPORT_ROOT_INSIDE_SOURCE', 'root must not be inside the vibelore folder');
}

/** 계획을 빈 작품 폴더(temp)에 쓴다. 노드는 모두 status: imported, 그림은 assets/ 에 한 번만, 가져오기 기록은 영수증 기록장에. */
async function writePlan(temp, plan, { importId, now }) {
  const ledger = openLedger(temp, 'receipts', { now });
  const records = [];
  for (const [arcIndex, arc] of plan.arcs.entries()) {
    const arcDir = entryName(arcIndex, arc.id, width(plan.arcs.length));
    await writeNode(temp, { path: `${arcDir}/${NODE_FILE}`, data: { id: arc.id, level: 'arc', title: arc.title, status: IMPORTED }, body: arc.body });
    records.push(importRecord({ importId, nodeId: arc.id, importedHash: sha256(arc.body), origin: { from: 'vibelore', ...(arc.origin ?? { path: null }) } }));
    for (const [index, episode] of arc.episodes.entries()) {
      const assets = [];
      for (const picture of episode.pictures) {
        await writeAssetOnce(temp, picture.file, picture.bytes);
        const meta = { id: picture.id, file: picture.file, nodeId: episode.id, imported: { from: 'vibelore', path: picture.origin.path, sha256: picture.origin.sha256 } };
        await writeAssetOnce(temp, `${picture.id}.yaml`, stringifyYaml(meta));
        assets.push({ assetId: picture.id, path: picture.origin.path, sha256: picture.origin.sha256 });
      }
      const data = { id: episode.id, level: 'episode', title: episode.title, status: IMPORTED, ...(assets.length ? { assets: assets.map((a) => a.assetId) } : {}) };
      await writeNode(temp, { path: `${arcDir}/${entryName(index, `${episode.id}.md`, width(arc.episodes.length))}`, data, body: episode.body });
      records.push(importRecord({ importId, nodeId: episode.id, importedHash: sha256(episode.body), origin: { from: 'vibelore', ...episode.origin, assets } }));
    }
  }
  for (const entity of plan.entities) await writeEntity(temp, { id: entity.id, kind: entity.kind, data: entity.data, body: entity.body });
  for (const record of records) await ledger.append(record);
  return records;
}

/**
 * vibelore 작품 폴더(from) → 새 Folio 작품(root). from 은 읽기만 한다. root 는 아직 없어야 하고, 옆에 숨긴 임시 폴더를 만들어
 * 다 쓰고 작품이 열리는 것까지 본 뒤 이름을 바꿔 들인다 — 실패하면 임시 폴더만 지우고 root 는 생기지 않는다.
 * 가져온 노드는 status: imported 이고 가져오기 기록만 있다(영수증·커밋 기록이 아니다 — 검사를 지난 것이 아니다).
 * Folio 의 검사를 받으려면 노드마다 folio_run mode recommit 으로 다시 커밋한다.
 * @param {string} root
 * @param {{ from: string, title?: string, packs: Map<string, any>, now?: () => string, newId?: (prefix: string) => string }} options
 */
export async function importVibelore(root, { from, title, packs, now = () => new Date().toISOString(), newId = (p) => `${p}-${randomUUID().replace(/-/g, '').slice(0, 12)}` }) {
  const read = await readVibelore(from);
  await assertTarget(root, from);
  const plan = mapVibelore(read);
  const temp = join(dirname(root), `.${basename(root)}.import-${randomUUID().slice(0, 8)}`);
  await mkdir(temp);
  try {
    const name = typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : basename(from);
    await initWork(temp, { title: name, packs: [...IMPORT_PACKS], preset: IMPORT_PRESET, available: packs });
    await mkdir(join(temp, TREE_DIR), { recursive: true });
    const importId = newId('import');
    const records = await writePlan(temp, plan, { importId, now });
    await openWorkspace(temp, { packs });
    if (await lstat(root).then(() => true, () => false)) throw new FolioError('IMPORT_ROOT_EXISTS', 'root appeared while importing', { root });
    await rename(temp, root);
    return {
      root, importId, status: IMPORTED,
      imported: { arcs: plan.arcs.length, episodes: plan.arcs.reduce((n, a) => n + a.episodes.length, 0), entities: plan.entities.length, assets: records.reduce((n, r) => n + (r.origin.assets?.length ?? 0), 0) },
      warnings: plan.warnings,
    };
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}
```

`core/run/done.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/core/run/done.js b/core/run/done.js
index 8d0b7c8..632dee3 100644
--- a/core/run/done.js
+++ b/core/run/done.js
@@ -1,13 +1,18 @@
 import { lastCommits } from '../ledger/receipts.js';
+import { lastImports } from '../import/records.js';

 /**
- * 끝난(커밋된) 노드 id 모음. 앞머리 status 가 committed 이고 영수증 기록장에 그 노드의 커밋 기록이 있어야 한다.
- * 앞머리만 committed 인 노드(첫 커밋 도중 죽고 버린 실행, 손으로 고친 앞머리)는 끝나지 않았다 — 영수증 없이 커밋 금지.
+ * 끝난 노드 id 모음. 앞머리 status 가 committed 이고 영수증 기록장에 그 노드의 커밋 기록이 있거나,
+ * 앞머리 status 가 imported 이고 가져오기 기록이 있어야 한다(M7b — 다음 노드로 다시 고르지 않는다. 검사를 지난 것은 아니다).
+ * 앞머리만 committed(또는 imported) 인 노드는 끝나지 않았다 — 기록 없이 끝냄 금지.
  * 기록장은 부르는 쪽이 한 번 읽어 넘긴다.
  */
 export function doneNodes(work, receiptRecords) {
   const commits = lastCommits(receiptRecords);
+  const imports = lastImports(receiptRecords);
   const done = new Set();
-  for (const node of work.tree.nodes.values()) if (node.status === 'committed' && commits.has(node.id)) done.add(node.id);
+  for (const node of work.tree.nodes.values()) {
+    if ((node.status === 'committed' && commits.has(node.id)) || (node.status === 'imported' && imports.has(node.id))) done.add(node.id);
+  }
   return done;
 }
```

`core/run/recommit-plan.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/core/run/recommit-plan.js b/core/run/recommit-plan.js
index 7d30b5a..e8f9686 100644
--- a/core/run/recommit-plan.js
+++ b/core/run/recommit-plan.js
@@ -11,13 +11,14 @@ export const isRecommit = (run) => run?.mode === RECOMMIT_MODE;

 /**
  * 다시 커밋이 필요한 노드인가: 커밋 기록이 있는데 지금 본문이 커밋 원고와 다르거나(손수정·이름 바꾸기),
- * 앞머리만 committed 이고 커밋 기록이 없는 노드. 그 밖(커밋 안 된 노드, 바뀌지 않은 노드)은 보통 실행으로 돈다.
+ * 앞머리만 committed 이고 커밋 기록이 없는 노드, 가져온(imported) 노드. 그 밖(커밋 안 된 노드, 바뀌지 않은 노드)은 보통 실행으로 돈다.
  * 자식 없는 가지는(구조가 온전하지 않다) 다시 커밋 대상이 아니다 — 자식 단계가 자식 검사를 건너뛸 길을 만들지 않는다.
  */
 export function assertRecommitNeeded(ctx, node) {
   assertFeature(ctx.work.config, 'recommit');
   const commit = lastCommits(ctx.receiptRecords).get(node.id);
-  const drifted = commit ? sha256(node.body) !== commit.committedHash : node.status === 'committed';
+  // 가져온 노드(M7b)는 커밋 기록이 없다 — recommit 이 그 노드를 Folio 의 검사에 처음 거는 길이다.
+  const drifted = commit ? sha256(node.body) !== commit.committedHash : node.status === 'committed' || node.status === 'imported';
   if (!drifted) throw new FolioError('RECOMMIT_NOT_NEEDED', `${node.id} has no changed committed text; use a normal run`, { nodeId: node.id });
   if (!node.body.trim()) throw new FolioError('RECOMMIT_EMPTY', `${node.id} has no text to commit`, { nodeId: node.id });
   if (node.kind === 'branch' && node.children.length === 0) {
```

`core/view/receipt-view.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/core/view/receipt-view.js b/core/view/receipt-view.js
index f21b7bf..d17baaa 100644
--- a/core/view/receipt-view.js
+++ b/core/view/receipt-view.js
@@ -3,6 +3,7 @@ import { openWork } from '../store/work.js';
 import { preorder } from '../store/tree.js';
 import { workStatus } from '../status.js';
 import { lastCommits, receiptsById } from '../ledger/receipts.js';
+import { lastImports } from '../import/records.js';
 import { latestRecheck } from '../scope/stale-checks.js';
 import { readLedgerView } from './ledgers.js';

@@ -29,6 +30,9 @@ const stepSummary = (receipt) => ({
   hard: receipt.hard,
 });

+/** 가져오기 기록 요약(M7b). 판정이 아니라 어디서 왔는지만 — 화면은 "가져옴"으로 보여 주고 "검사 통과"로 보여 주지 않는다. */
+const importedOf = (record) => (record ? { importId: record.importId, status: record.status, at: record.at, from: record.origin?.from ?? null, path: record.origin?.path ?? null } : null);
+
 /**
  * 영수증 목록: 읽는 순서의 노드마다 마지막 커밋의 영수증 요약(건너뛴 단계, 실패·오류, 넘긴 지적, 참고 의견 수)과
  * 다시 확인 필요(stale)·되채우기(recheck)·막힘(flagged)·손수정(drift). "critic 을 건너뛴 장면만 보기"는 skipped 로 거른다.
@@ -43,6 +47,7 @@ export async function viewReceiptList(root, { packs }) {
   const status = await statusOrNull(root, packs);
   const commits = lastCommits(records);
   const receipts = receiptsById(records);
+  const imports = lastImports(records);
   const has = (list, nodeId) => (list ? list.some((item) => item.nodeId === nodeId) : null);
   const nodes = preorder(work.tree).map((nodeId) => {
     const node = work.tree.nodes.get(nodeId);
@@ -50,7 +55,7 @@ export async function viewReceiptList(root, { packs }) {
     const receipt = commit ? receipts.get(commit.receiptId) : null;
     return {
       nodeId, title: node.title, level: node.level, kind: node.kind, status: node.status,
-      committed: Boolean(receipt), receiptId: receipt?.receiptId ?? null, at: commit?.at ?? null,
+      committed: Boolean(receipt), receiptId: receipt?.receiptId ?? null, at: commit?.at ?? null, imported: importedOf(imports.get(nodeId)),
       ...(receipt ? stepSummary(receipt) : { skipped: [], failed: [], overridden: 0, advisories: 0, hard: 0 }),
       stale: has(status?.stale, nodeId), recheck: has(status?.recheck, nodeId), flagged: has(status?.flagged, nodeId),
       drift: status ? (status.drift.find((d) => d.nodeId === nodeId)?.code ?? null) : null,
@@ -71,7 +76,7 @@ export async function viewNodeReceipts(root, { packs }, nodeId) {
   const node = work.tree.nodes.get(nodeId);
   if (!node) throw new FolioError('NODE_NOT_FOUND', String(nodeId).slice(0, 200));
   const { records, ledger } = await readLedgerView(root, 'receipts');
-  if (!records) return { ledger, nodeId, commits: [], receipt: null, recheck: null, stale: null, drift: null };
+  if (!records) return { ledger, nodeId, commits: [], receipt: null, imported: null, recheck: null, stale: null, drift: null };
   const status = await statusOrNull(root, packs);
   const commits = records.filter((r) => r.type === 'commit' && r.nodeId === nodeId);
   const last = commits.at(-1) ?? null;
@@ -85,6 +90,7 @@ export async function viewNodeReceipts(root, { packs }, nodeId) {
       pipelineDigest: receipt.pipelineDigest, steps: receipt.steps, refs: receipt.refs, hard: receipt.hard,
       advisories: receipt.advisories ?? [], overridden: receipt.overridden ?? [], attempts: receipt.attempts, order: receipt.order ?? null,
     } : null,
+    imported: (() => { const record = lastImports(records).get(nodeId); return record ? { ...importedOf(record), importedHash: record.importedHash, origin: record.origin } : null; })(),
     recheck: recheck ? { recheckId: recheck.recheckId, at: recheck.at, hard: recheck.hard, steps: recheck.steps } : null,
     stale: status ? (status.stale.find((s) => s.nodeId === nodeId)?.reasons ?? []) : null,
     drift: status ? (status.drift.find((d) => d.nodeId === nodeId) ?? null) : null,
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/import/*.test.js test/view/*.test.js test/run/*.test.js` → PASS. `npm run check` → 1103/1103.

- [ ] **Step 5: 커밋**

```bash
git add core/import/records.js core/import/import-work.js core/run/done.js core/run/recommit-plan.js core/view/receipt-view.js test/import/import-work.test.js
git commit -m "$(cat <<'EOF'
feat(import): write the imported work with import records, never receipts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task B4: 도구 `folio_import_vibelore`와 스킬 문서

**Files:**
- Create: `skill/folio/references/import.md`
- Modify: `server/tools/definitions.js`(목록 끝), `server/tools/handlers.js`, `skill/folio/SKILL.md`
- Modify (테스트): `test/server/tools.test.js`(이름 목록 끝), `test/server/occurrence-tools.test.js`(12 → 13)
- Test: `test/server/import-tool.test.js`

**Interfaces:**
- Consumes: `importVibelore`(B3).
- Produces: 도구 `folio_import_vibelore { root, from, title? }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/server/import-tool.test.js` (21줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox } from '../../server/toolbox.js';
import { loadBuiltinPacks } from '../../packs/index.js';
import { tempDir } from '../support/fixtures.js';
import { importTarget, VIBELORE_FIXTURE } from '../support/import-source.js';

const packs = await loadBuiltinPacks();
const code = (out) => out.error?.code;

test('folio_import_vibelore imports through the toolbox and refuses an existing root or a relative from', async () => {
  const tools = createToolbox({ packs });
  const root = await importTarget();
  const out = await tools.call('folio_import_vibelore', { root, from: VIBELORE_FIXTURE, title: '등대' });
  assert.equal(out.ok, true, JSON.stringify(out.error));
  assert.deepEqual([out.result.status, out.result.imported.episodes], ['imported', 4]);
  assert.equal((await tools.call('folio_status', { root })).result.next, null);
  assert.equal(code(await tools.call('folio_import_vibelore', { root, from: VIBELORE_FIXTURE })), 'IMPORT_ROOT_EXISTS');
  assert.equal(code(await tools.call('folio_import_vibelore', { root: await importTarget(), from: 'relative/source' })), 'IMPORT_FROM_INVALID');
  assert.equal(code(await tools.call('folio_import_vibelore', { root: await tempDir(), from: VIBELORE_FIXTURE, extra: 1 })), 'TOOL_INPUT_INVALID');
});
```

`test/server/tools.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/server/tools.test.js b/test/server/tools.test.js
index 192b3cd..f4385c7 100644
--- a/test/server/tools.test.js
+++ b/test/server/tools.test.js
@@ -26,7 +26,7 @@ async function* walk(dir) {

 test('the tool list: eight base tools, folio_occurrences and one advanced tool, each needing an absolute root and nothing else', () => {
   assert.deepEqual(BASE_TOOL_NAMES, ['folio_init', 'folio_status', 'folio_run', 'folio_resume', 'folio_decide', 'folio_structure', 'folio_find', 'folio_view']);
-  assert.deepEqual(TOOLS.map((t) => t.name), [...BASE_TOOL_NAMES, 'folio_occurrences', 'folio_sources', 'folio_config', 'folio_image']);
+  assert.deepEqual(TOOLS.map((t) => t.name), [...BASE_TOOL_NAMES, 'folio_occurrences', 'folio_sources', 'folio_config', 'folio_image', 'folio_import_vibelore']);
   for (const tool of TOOLS) {
     assert.ok(tool.inputSchema.required.includes('root'), tool.name);
     assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
```

`test/server/occurrence-tools.test.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/test/server/occurrence-tools.test.js b/test/server/occurrence-tools.test.js
index 4efda7f..748f154 100644
--- a/test/server/occurrence-tools.test.js
+++ b/test/server/occurrence-tools.test.js
@@ -9,8 +9,8 @@ import { copyFixture, fakePacks, useFakePack } from '../support/fixtures.js';
 const ok = (out) => { assert.equal(out.ok, true, JSON.stringify(out.error)); return out.result; };
 const code = (out) => out.error?.code;

-test('twelve tools, and folio_occurrences is one of them', () => {
-  assert.equal(TOOLS.length, 12);
+test('thirteen tools, and folio_occurrences is one of them', () => {
+  assert.equal(TOOLS.length, 13);
   assert.ok(TOOLS.some((t) => t.name === 'folio_occurrences'));
 });

```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/server/import-tool.test.js test/server/tools.test.js`
Expected: FAIL — `TOOL_UNKNOWN`.

- [ ] **Step 3: 구현**

`server/tools/definitions.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/server/tools/definitions.js b/server/tools/definitions.js
index 464cfbd..2975cd9 100644
--- a/server/tools/definitions.js
+++ b/server/tools/definitions.js
@@ -71,4 +71,6 @@ export const TOOLS = Object.freeze([
       op: { type: 'string', enum: ['start', 'resume', 'decide', 'pending'] }, assetId: ID, nodeId: ID, runId: ID,
       answers: { type: 'object', additionalProperties: { type: 'string' } }, action: { type: 'string', enum: ['approve', 'request_revision', 'skip'] }, feedback: TEXT, reason: TEXT,
     }, ['op']),
+  tool('folio_import_vibelore', 'vibelore 작품 폴더(from: 작가가 고른 절대 경로)를 새 Folio 작품(root: 아직 없는 폴더)으로 가져온다. from 은 읽기만 한다(링크는 따라가지 않고, 정해진 자리의 회차·인물·세계·아크 계획·검사 영수증 hash·승인된 웹툰 episode.svg 만). 연재 프리셋(아크→회차), 팩 novel·image. 모든 노드는 status imported 이고 가져오기 기록만 남는다 — Folio 의 검사를 지난 것이 아니다(vibelore 판정은 옮기지 않는다). Folio 검사를 받으려면 노드마다 folio_run mode recommit. root 가 있으면 IMPORT_ROOT_EXISTS, root 가 from 안이면 IMPORT_ROOT_INSIDE_SOURCE. 결과의 warnings 에 건너뛴 파일이 온다.',
+    { from: { type: 'string', minLength: 1, maxLength: 4096 }, title: { type: 'string', maxLength: 200 } }, ['from']),
 ]);
```

`server/tools/handlers.js` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/server/tools/handlers.js b/server/tools/handlers.js
index 87dce86..6bf3d05 100644
--- a/server/tools/handlers.js
+++ b/server/tools/handlers.js
@@ -5,6 +5,7 @@ import { outcomeFromPending } from '../../core/run/steps/common.js';
 import { changeStructure } from '../../core/structure/locked.js';
 import { workStatus } from '../../core/status.js';
 import { initWork } from '../../core/work/init.js';
+import { importVibelore } from '../../core/import/import-work.js';
 import { findInWork } from './find.js';
 import { occurrencesTool } from './occurrences.js';
 import { sourcesTool } from './sources.js';
@@ -51,5 +52,6 @@ export function createHandlers({ packs, viewer = createViewerRegistry({ packs })
     folio_sources: ({ root, op, ...args }) => sourcesTool(root, { op, ...args }),
     folio_config: ({ root, checkDraft, workKind, node }) => describeConfig(root, { packs, checkDraft, workKind, node }),
     folio_image: ({ root, op, ...args }) => imageTool(root, packs, { op, ...args }),
+    folio_import_vibelore: ({ root, from, title }) => importVibelore(root, { from, title, packs }),
   };
 }
```

`skill/folio/references/import.md` (42줄):

```markdown
# vibelore 작품 가져오기 (`folio_import_vibelore`)

vibelore로 쓰던 연재를 새 Folio 작품으로 옮긴다. 원본 폴더는 읽기만 한다.

## 언제

작가가 "vibelore 작품 가져와", "옛 연재 옮기자"처럼 말할 때. 원본 폴더(`from`)와 새 작품 폴더(`root`)는 둘 다 작가에게 받는다. 짐작한 경로를 넘기지 않는다.

## 부르기 — `folio_import_vibelore { root, from, title? }`

- `from`: vibelore 작품 폴더의 절대 경로(그 안에 `chapters/`가 있다). 링크가 아닌 폴더여야 한다.
- `root`: **아직 없는** 새 폴더의 절대 경로. 그 부모 폴더는 있어야 하고, `from` 안이면 안 된다. 엔진은 옆에 숨긴 임시 폴더에 다 쓴 뒤 이름을 바꿔 들인다 — 실패하면 `root`는 생기지 않는다.
- `title`: 작품 제목(없으면 `from` 폴더 이름).

## 가져오는 것

| vibelore | Folio |
|---|---|
| `chapters/<n>.md` | 회차 노드 `ep-<n>`(세 자리). 제목은 회차 앞머리 `title` → 아크 계획의 회차 제목 → `<n>화` |
| `.vibelore/arcs/<n>.json`(버린 아크 제외) | 아크 노드 `arc-<n>`. 제목·약속(본문). 어느 아크에도 없는 회차는 `arc-imported`(가져온 회차) 아래 |
| `characters/*.md` | 인물 엔티티. 이름·별칭·성별·역할과 본문만(그 밖 앞머리는 옮기지 않는다) |
| `world/*.md` | `world` 엔티티 |
| `webtoon/episodes/<회차>-<id>/episode.svg` | 그림 `ep-<n>-webtoon`(같은 회차 폴더가 여럿이면 모두, 경고와 함께). 회차 앞머리 `assets`에 붙는다 |
| `.vibelore/check-receipts/*.json` | 판정은 옮기지 않는다. 그 회차의 가져오기 기록에 파일 경로와 hash만 |

그 밖(.vibelore의 실행 기록·상태, 그림 계획 등)은 열지 않는다. 링크·보통 파일이 아닌 것·이름 규칙 밖·너무 큰 파일은 건너뛰고 결과 `warnings`에 남긴다(`IMPORT_ENTRY_SKIPPED`, `IMPORT_FILE_TOO_LARGE` 등). 작가에게 보여 준다.

## 가져온 뒤

- 모든 노드는 `status: imported`("가져옴")다. 영수증 기록장에는 가져오기 기록(`type: import`)만 있다 — **Folio의 검사를 지난 것이 아니다.** 작가에게 "검사 통과"라고 말하지 않는다. vibelore 쪽 판정도 옮겨 말하지 않는다.
- 가져온 노드는 끝난 것으로 쳐서 `folio_run`의 다음 노드로 다시 고르지 않는다. 새 회차는 `folio_structure { op: 'add' }`로 더해 이어 쓴다.
- Folio의 검사를 받으려면 작가가 원하는 노드마다 `folio_run { root, node, mode: 'recommit' }`. 지금 본문을 원고로 삼아 추출·검사·승인·영수증을 거친다(글을 다시 쓰지 않는다). 그 뒤 그 노드는 `committed`다.
- 뷰어(`folio_view`)의 영수증 화면은 가져온 노드를 `imported`(어디서 왔는지)로 보여 준다.
- 그림 검사 세트(`image.basic`·`image.placement`)는 켜져 있지 않다. 작가가 고른다([checks.md](checks.md), [image.md](image.md)).

## 오류일 때

- `IMPORT_ROOT_EXISTS`: `root`가 이미 있다. 가져오기는 새 폴더만 만든다 — 다른 경로를 받는다.
- `IMPORT_ROOT_INSIDE_SOURCE`: `root`가 원본 안이다. 원본 밖 경로를 받는다.
- `IMPORT_ROOT_INVALID`: `root`의 부모 폴더가 없다.
- `IMPORT_FROM_INVALID`: `from`이 절대 경로가 아니거나, 없거나, 링크·파일이다.
- `IMPORT_FROM_EMPTY`: `chapters/<n>.md`가 하나도 없다. vibelore 작품 폴더(작품 하나)를 맞게 골랐는지 작가에게 묻는다.
```

`skill/folio/SKILL.md` — 아래 diff 를 적용한다(`git apply` 또는 손으로):

```diff
diff --git a/skill/folio/SKILL.md b/skill/folio/SKILL.md
index 6e33553..478fbea 100644
--- a/skill/folio/SKILL.md
+++ b/skill/folio/SKILL.md
@@ -30,6 +30,7 @@ description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재
 | `folio_sources` | 자료 넣기(`add`: 글 또는 작가가 고른 파일 하나), 목록(`list`), 자료와 걸린 주장(`get`), 커밋된 노드의 주장 잇기(`link`). [references/sources.md](references/sources.md) |
 | `folio_config` | 고급. 레벨별 단계·검사 세트·검사 목록, `workKind`·`node`로 추천, 사용자 검사 초안 검증. 읽기 전용 |
 | `folio_image` | 그림 한 장(`start`·`resume`·`decide`·`pending`). 노드 실행과 따로 돈다. [references/image.md](references/image.md) |
+| `folio_import_vibelore` | vibelore 작품 폴더를 새 작품으로 가져온다(원본은 읽기만). 노드는 모두 `imported`. [references/import.md](references/import.md) |

 `root`는 언제나 작가가 고른 작품 폴더의 절대 경로다. 엔진은 절대 경로인지만 확인하고 어느 폴더든 막지 않는다(허용 목록 없음). 그러니 작가가 고르거나 확인해 준 폴더만 넘긴다. 짐작한 경로나 작품과 상관없는 폴더를 넘기지 않는다.

@@ -56,6 +57,7 @@ description: Folio 엔진(MCP 도구 folio_*)으로 구조 있는 작품(연재
 8. **블록·각주·참고문헌·색인**: 그림·표·식 앵커(`{#fig-1-1}`), 블록 참조(`[[block:id]]`), 각주(`[^id]`), 자료 인용(`[[source:id]]`)과 `folio_find`의 `blocks`·`bibliography`·`terms`는 [references/blocks.md](references/blocks.md).
 9. **순서 없는 작품**: 사전·매뉴얼(`order: none`, 지식 책 `reference` 프리셋), 노드 링크(앞머리 `links`), `folio_find`의 `links`, `folio_status.links`는 [references/order.md](references/order.md).
 10. **그림**: 웹툰·삽화의 그림 한 장(설명서 → 점검 → 그림 → 검토 → 승인 → 영수증), 기준 그림, 본문에 놓기(`![[asset:id]]`)는 [references/image.md](references/image.md).
+11. **vibelore 가져오기**: 옛 연재를 옮기고, 가져온 노드를 recommit으로 Folio 검사에 거는 법은 [references/import.md](references/import.md).

 ## 답하는 법 (`needs_model`)

```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/server/*.test.js` → PASS. `npm run check` → 1104/1104.

- [ ] **Step 5: 커밋**

```bash
git add server/tools/definitions.js server/tools/handlers.js skill/folio/references/import.md skill/folio/SKILL.md test/server/import-tool.test.js test/server/tools.test.js test/server/occurrence-tools.test.js
git commit -m "$(cat <<'EOF'
feat(server): folio_import_vibelore tool and import skill reference

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

### Task B5: M7b 완료 기준 (MCP stdio), 수동 확인, 정지

**Files:**
- Test: `test/acceptance/m7b.test.js`
- Modify: `docs/plans/2026-10-01-m7-image-import-rulings.md`, 이 계획서 "진행" 줄

- [ ] **Step 1: 완료 기준 테스트 작성**

완료 기준(정본 §20 M7, 레인 L6): 가져온 작품이 "뷰어에서 글+그림으로 열림". 영수증 화면은 `imported`이고 검사 통과가 아니다. recommit 뒤에만 Folio 영수증이 생긴다.

`test/acceptance/m7b.test.js` (62줄):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectFolio } from '../support/mcp-client.js';
import { label } from '../support/fake-host.js';
import { importTarget, treeHashes, VIBELORE_FIXTURE } from '../support/import-source.js';

/** MCP 너머의 가짜 호스트 모델: 검사는 지적 없이, 사건은 없음. recommit 은 원고를 묻지 않는다. */
function answer(request) {
  const p = request.payload;
  if (request.purpose === 'check') return JSON.stringify({ checked: p.checks.map((c) => c.checkId), findings: [] });
  if (request.purpose === 'revise' || request.purpose === 'user_revision') return p.draft;
  if (p.produces === 'events') return JSON.stringify({ events: [], appearances: [], mentions: [] });
  throw new Error(`no answer for ${request.purpose}/${p.produces}`);
}

async function ok(promise) {
  const out = await promise;
  assert.equal(out.ok, true, JSON.stringify(out.error));
  return out.result;
}

test('M7b over MCP stdio: a vibelore work is imported, opens in the viewer as text + picture, shows as imported (never as passed), and recommit gives a real receipt', async (t) => {
  const folio = await connectFolio();
  t.after(() => folio.close());
  const before = await treeHashes(VIBELORE_FIXTURE);
  const root = await importTarget('lighthouse');
  const imported = await ok(folio.call('folio_import_vibelore', { root, from: VIBELORE_FIXTURE, title: '등대' }));
  assert.deepEqual([imported.status, imported.imported], ['imported', { arcs: 2, episodes: 4, entities: 3, assets: 2 }]);
  assert.deepEqual(await treeHashes(VIBELORE_FIXTURE), before, 'the vibelore folder is only read');
  assert.equal((await ok(folio.call('folio_status', { root }))).next, null, 'imported nodes are not picked again');

  const view = await ok(folio.call('folio_view', { root, nodeId: 'ep-001' }));
  const url = new URL(view.url);
  const headers = { 'x-folio-token': url.searchParams.get('token') };
  const get = async (path) => (await fetch(new URL(path, url), { headers })).json();
  const node = await get('/api/nodes/ep-001');
  assert.equal(node.node.status, 'imported');
  assert.match(node.segments.map((s) => s.text ?? '').join(''), /꺼진 등불을 들어 올렸다/);
  assert.deepEqual(node.assets.attached.map((a) => [a.id, a.known, a.hasFile]), [['ep-001-webtoon', true, true], ['ep-001-webtoon-2', true, true]]);
  const picture = await fetch(new URL('/api/assets/ep-001-webtoon', url), { headers });
  assert.equal(picture.headers.get('content-type'), 'image/svg+xml');
  assert.match(picture.headers.get('content-security-policy') ?? '', /sandbox/);
  assert.deepEqual(Buffer.from(await picture.arrayBuffer()), await readFile(join(VIBELORE_FIXTURE, 'webtoon', 'episodes', '1-wt-aaaa1111', 'episode.svg')));
  const list = await get('/api/receipts');
  const row = list.nodes.find((n) => n.nodeId === 'ep-001');
  assert.deepEqual([row.status, row.committed, row.receiptId, row.imported.status, row.imported.path], ['imported', false, null, 'imported', 'chapters/001.md']);

  const labels = [];
  let out = await ok(folio.call('folio_run', { root, node: 'ep-001', mode: 'recommit' }));
  for (let i = 0; i < 40 && out.status !== 'done'; i += 1) {
    labels.push(label(out));
    if (out.status === 'needs_model') out = await ok(folio.call('folio_resume', { root, runId: out.runId, answers: Object.fromEntries(out.requests.map((r) => [r.requestId, answer(r)])) }));
    else out = await ok(folio.call('folio_decide', { root, runId: out.runId, action: 'approve' }));
  }
  assert.equal(out.status, 'done', labels.join(' → '));
  const receipt = await get('/api/receipts/ep-001');
  assert.deepEqual([typeof receipt.receipt.receiptId, receipt.imported.status, receipt.imported.origin.receipts.length], ['string', 'imported', 1]);
  assert.equal((await get('/api/nodes/ep-001')).node.status, 'committed');
  assert.equal(folio.stderr(), '');
});
```

- [ ] **Step 2: 실행**

Run: `node --test test/acceptance/m7b.test.js` → PASS. `npm run check` → 1105/1105.

- [ ] **Step 3: 실제 작품 가져오기 (수동, 커밋하지 않음)**

1. vibelore 작품 폴더 하나(`/path/to/vibelore/works/<작품>`)를 **읽기만** 한다. 대상은 저장소 밖 임시 폴더(예: `/tmp/folio-import-check/work`)다. 다른 세션이 그 폴더를 쓰는 중일 수 있으니 git 명령은 부르지 않는다.
2. Claude Code에서 `folio_import_vibelore { root, from }`, 이어 `folio_view`로 1~5화를 연다. 글과 웹툰 그림이 보이는지, 영수증 화면이 "가져옴"인지 본다.
3. 원본 폴더의 파일 hash가 전후 같은지 확인한다(`shasum -a 256`을 앞뒤로).
4. 결과를 판정 기록에 세 줄 이내로 적는다. 원고·그림·결과물은 커밋하지 않는다.

- [ ] **Step 4: 진행 줄 쓰고 커밋**

```bash
git add test/acceptance/m7b.test.js docs/plans/2026-10-01-m7-image-import-rulings.md docs/plans/2026-10-01-m7-image-import.md
git commit -m "$(cat <<'EOF'
test(acceptance): M7b vibelore import opens as text and pictures, shown as imported

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: M7b 정지**

`npm run check` 결과, `test/acceptance/m7b.test.js` 결과, 수동 확인 요약, "다른 레인에 알릴 것"을 보여 주고 멈춘다.

---

## 계획 시험 실행

scratch worktree(`c8223aa`에서 detach)에 태스크 순서대로 적용하고 태스크마다 `npm run check`(lint + typecheck + 전체 테스트)를 따로 돌렸다. 위 코드 블록은 그 커밋에서 기계적으로 뽑았다(손으로 다시 치지 않음). 시험 뒤 scratch worktree는 지웠다.

| 태스크 | `npm run check` |
|---|---|
| 시작 | 1069 |
| A1 `2901c7a` | 1070 |
| A2 `12ab33c` | 1072 |
| A3 `1baef22` | 1074 |
| A4 `eeff071` | 1077 |
| A5 `87a422a` | 1084 |
| A6 `e0a997e` | 1090 |
| A7 `126406a` | 1092 |
| A8 `d01a31a` | 1094 |
| B1 `73c3d93` | 1097 |
| B2 `988bd2d` | 1100 |
| B3 `d151ddd` | 1103 |
| B4 `0be1a48` | 1104 |
| B5 `a9575be` | 1105 |

표의 sha는 scratch 커밋이다(worktree를 지워 이제 없다). 시험 중 A1의 주석 한 줄(파일 이름)을 고쳐 커밋을 다시 쌓았고, 그 뒤 A1(`2901c7a`)과 끝(`a9575be`)을 다시 돌려 1070·1105를 확인했다. 나머지 태스크의 수는 주석만 다른 앞 커밋에서 잰 값이다.

시험 중 알게 된 것:
- `test/core/parity-isolation.test.js`는 테스트의 import 경로에 `vibelore`라는 글자가 있으면 막는다. 처음 이름(`core/import/vibelore*.js`)이 걸려 `read-source`·`map-source`·`import-work`로 바꿨다(결정 18). 가드는 약화하지 않았다.
- 영수증 필드 이름 `type`은 기록장 예약 필드다. 그림 영수증은 `mediaType`을 쓴다.
- A1의 N4 assert("마지막 두 키")는 features 끝에 키를 더하면 깨진다. `links` 위치 기준으로 같은 것을 보게 바꿨다. M6b의 `viewerExport`가 먼저 들어오면 같은 식으로 맞춘다.
- `novel-3level` fixture는 이미 `packs: [novel, image]`를 적어 두었다. A4 뒤 이 fixture가 내장 팩으로 열리지만 깨지는 테스트는 없었다.
- 커밋 잠금이 실패하면 실행 파일은 마지막 저장 상태(`active`)로 남는다. 받는 결정은 `skip`뿐이다(결정 10).

## 다른 레인에 알릴 것

- **M6b·뷰어 소유자:** 영수증 API(`/api/receipts`, `/api/receipts/:id`)에 `imported` 필드가 생겼다(B3). 화면에 출처(vibelore 파일 경로)와 "가져옴"을 보이는 UI는 이 계획 밖이다. 그림 영수증(`assets` 기록장)을 보이는 화면도 없다.
- **M6 A7 minor(그림 파일 크기 상한):** `readAssets`의 hash 읽기에는 여전히 크기 상한이 없다. 가져오기는 SVG를 20MiB까지 받는다(실제 웹툰 SVG가 15MB대). 뷰어 쪽 상한은 `MAX_ASSET_BYTES`(20MiB) 그대로.
- **N6:** M7b가 `core/run/done.js`(가져온 노드 끝남)와 `core/run/recommit-plan.js`(가져온 노드 recommit) 각 한 곳을 바꾼다. 판본 규칙이 들어오면 가져온 노드는 `main` 판본으로 본다.
- **C 레인(`folio_status`):** 열린 그림 실행은 `folio_status`의 `pending`에 나오지 않는다(`folio_image op: pending`만). 합칠지는 그 레인 판단이다.
- **가드:** BANNED에 `core/store/assets.js`, `core/image/commit.js`가 더해졌다(A7).

## 기록장

(실행 중 태스크마다 `Task <id>: review …` / `Ruling: …` / `minor (deferred): …` 줄을 판정 기록 파일에 쌓는다.)

## 자기 점검

### 1. 설계 → 태스크
- 정본 §14 그림 팩(설명서, 기준 그림, 점검, 생성, 검토, 승인, 영수증): A2~A6. 이미지 검토의 자기검토 표기 잠금: A5(검토 결과)·A6(영수증 검증과 커밋 잠금).
- 정본 §07 그림 두는 두 방법(앞머리 `assets` 붙이기, 본문 `![[asset:id]]`): B3(가져온 그림은 앞머리), A8(새 그림은 본문 + `image.asset-refs`).
- 정본 §18 가져오기(읽기 전용, `imported` 영수증): B1~B5.
- 정본 §20 M7 완료 기준: A8, B5.
- 기능 토글: A1(그림). 가져오기는 토글 없음(결정 16).

### 2. 자리표시자 검사
모든 코드 단계는 시험한 커밋의 파일 전체 또는 diff 전체다. "TBD"·"비슷하게" 없음.

### 3. 이름 일관성
`createImageRunner`·`IMAGE_LEDGER`·`IMAGE_HANDLERS`(A5) → A6이 `commitStep`을 실행기에서 더한다. `writeAssetOnce`(A3) → A6·B3. `readVibelore`(B1) → `mapVibelore`(B2) → `importVibelore`(B3) → 도구(B4). `lastImports`(B3) → `done.js`·`receipt-view.js`.

### 4. 계획 코드 시험 실행
위 "계획 시험 실행" 표. 시험하지 못한 것:
- M6b·N6 병합 뒤의 main(시험은 `c8223aa` 기준). features 키 순서와 `done.js`·`recommit-plan.js` 겹침은 "현재 상태"에 적었다.
- 실제 vibelore 작품 가져오기(B5 Step 3, 수동).
- 뷰어 화면(UI)에서 그림·"가져옴"이 보이는 것(API까지만 시험).
- Windows(링크·FIFO 테스트는 POSIX에서만 돈다).
- 같은 `root`로 동시에 두 번 가져오기(마지막 이름 바꾸기 직전의 경합 — 빈 폴더가 그 사이 생기면 덮일 수 있다. 결정 11의 남은 위험).
- 실제 그림 모델이 그린 큰 그림(시험은 1×1 PNG).

### 5. 규칙 점검
- runner.js 무변경(M7a·M7b). `core/`·`packs/`에 모델·네트워크·동적 import 없음.
- 목록은 끝에만: features(`images`…), 팩(`image`), 도구(`folio_image`, `folio_import_vibelore`), BANNED.
- 300줄 넘는 새 파일 없음(가장 긴 것 `core/image/steps.js` 170줄).
- fixture는 합성(`test/fixtures/vibelore-work/README.md`).
