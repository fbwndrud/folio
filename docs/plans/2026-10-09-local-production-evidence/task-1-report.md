# Task 1: 독립 이력의 실제 통합

## 범위와 이력

- 작업 공간: `/path/to/folio`, `codex/production-ready`.
- 병합 이전 HEAD `50b56c3`(신규 구조 구현 `c44b13c`의 후속 계획 커밋), 병합 대상 main `713b9d8`, 공통 조상 `0bf95e1`.
- `git merge --no-commit --no-ff main`으로 실제 병합을 시작했다. native Git의 `merge-tree --write-tree` 미지원은 실제 merge를 막지 않는다.
- 원본 `/path/to/folio`의 main과 사용자 dirty 파일, `/path/to/vibelore`는 수정하지 않았다. 합성 fixture/합성 그림/합성 embedding worker만 사용했다.
- resources 전용 UI, read-only resource query seam, doctor, 최종 배포 구성은 Task 2–6 범위로 남겼다. controller가 독립 리뷰한다. 하위 에이전트는 생성하지 않았다.

## 실제 충돌 목록과 해결

다음 35개 파일이 초기 충돌이었다. 양쪽 기능을 합성했으며 충돌 표시 제거 후 모두 stage하여 unresolved entry가 0개임을 확인했다.

```text
.github/workflows/ci.yml
.gitignore
README.md
core/index/rebuild.js
core/pack/yaml-pack.js
core/run/commit.js
core/run/payload.js
core/run/runner.js
core/run/steps/commit-step.js
core/run/steps/common.js
core/run/workspace.js
core/scope/rechecks.js
core/scope/stale.js
core/status.js
core/store/assets.js
core/store/work.js
core/work/features.js
docs/plans/2026-09-28-roadmap-lanes-early.md
docs/plans/2026-09-28-roadmap-lanes-late.md
docs/plans/2026-09-28-roadmap-parallel.md
package.json
packs/image/README.md
packs/novel/README.md
packs/novel/pack.yaml
server/tools/definitions.js
server/tools/find.js
server/tools/handlers.js
server/validate-input.js
skill/folio/SKILL.md
test/core/assets-files.test.js
test/core/features.test.js
test/server/feature-toggles.test.js
test/server/knowledge-init.test.js
test/server/occurrence-tools.test.js
test/server/tools.test.js
```

- 도구/기능/설치: main의 viewer/image/variants/export/gamebook/blocks와 신규 managed assets/tracking/resources/inputs/policy/operations/query/embeddings를 모두 유지했다. 총 22개 도구의 공개 schema·annotations·structuredContent 계약을 통일했다.
- 원고 커밋: main의 판본별 영수증, 원본 판본 결속, 가지/블록 잠금에 신규 immutable commit intent와 최종 발행 marker를 결합했다. 영수증을 기록한 후라도 파일이 before/after 바이트 어디에도 일치하지 않으면 COMMIT_TARGET_CONFLICT로 멈춘다. 판본은 독립 target 경로를 사용하고 main 사건·추적 기록을 쓰지 않는다.
- 추적/범위: tracking-backfill, trackingStateDigest, receiptRecords alias를 기존 variant/linked/branching scope와 결합했다. active tracking 작품에서도 정상 번역 판본은 완료되며 원문은 바뀌지 않는다.
- 자산: 하나의 assets 기록장에 저장되는 main 이미지 파이프라인 4종 기록과 신규 관리 자산 기록을 함께 읽는다. 알 수 없는 기록을 일반적으로 무시하지 않는다. nullable path, 별도 URI 참조, contentHash, approval 상태를 보존한다.
- 인덱스: 기존 블록/연결/판본 테이블과 신규 관리 엔티티/자산의 nullable path/storage를 함께 빌드한다. atomic generation/publish와 work lock은 유지한다.
- 팩: main의 moduleGraph/scopeFields/check sets/picturebook/fairytale 프리셋과 신규 codeFiles/checkerInputs/codeDigest를 보존했다. novel 선언이 300줄을 넘어서 checks.yaml 카탈로그로 단일 책임 분리했고 카탈로그 내용도 digest에 결속한다.
- 설명서/역사 계획: 현행 README·팩 README·skill에 두 기능군을 반영하고 오래된 미구현 안내 및 영수증 후 덮어쓰기 설명을 바로잡았다. 겹친 역사 roadmap은 서로 다른 완료 증거를 보존했다.

## 변경 파일별 책임

자동 병합된 main 기능 전체를 재작성하지 않았다. 아래는 충돌 해결 또는 소비자 통합으로 직접 바뀐 책임이다.

| 파일 | 책임 |
| --- | --- |
| package.json, package-lock.json, .github/workflows/ci.yml, .gitignore | 두 설치/검증 script 계열, viewer bin, 패키지 포함 목록과 CI 보존 |
| core/work/features.js, core/store/work.js | 기능 목록 합성 및 판본/관리 자산/추적 포함 작품 읽기 |
| core/store/assets.js, core/assets/records.js | legacy immutable 이미지 파일과 managed record replay 공존 |
| core/store/asset-bindings.js | 노드 앞머리와 managed nodeIds를 합친 첨부 자산 조회 |
| core/index/rebuild.js, core/index/generation.js | 잠긴 atomic 인덱스 발행과 두 계열 데이터 행 합성 |
| core/pack/yaml-pack.js | 모듈 그래프·코드 파일·외부 검사 카탈로그를 포함한 팩 읽기와 digest |
| core/run/runner.js, run-context.js, run-start.js, workspace.js | 실행 재개/판본/추적 모드 및 최종 발행 사건 읽기 |
| core/run/payload.js, steps/common.js, steps/commit-step.js | 판본·추적 payload, 영수증 조회, commit 단계 입력 결속 |
| core/run/commit.js, commit-target.js, commit-target-file.js, prepared-commit.js | main/판본의 정확한 파일 바이트 intent와 영수증·결정·원본 잠금 |
| core/run/text-guard.js, core/status.js | 손수정 drift와 별도 immutable intent 충돌 설명 |
| core/scope/rechecks.js, core/scope/stale.js | 판본과 추적 참조를 포함한 재검사/오래됨 투영 |
| core/tracking/commit.js, core/tracking/extract.js, core/ledger/receipts.js | 판본에서 main 추적 기록을 분리하고 scalar 사건 계약 유지 |
| core/view/ledgers.js, entity-view.js, promise-board.js | 최종 commit marker가 있는 사건만 조회; 미연결 legacy seed는 호환 |
| core/view/node-view.js, core/view/asset-file.js | 관리 자산 상태/연결 조회 및 실제 제공 바이트 hash 재검증 |
| core/view/receipt-view.js | 손상된 영수증을 작품 재구성 이전에 검증 결과로 반환 |
| core/export/source.js, core/export/assets.js | managed nodeIds 첨부를 정적 출력에 포함하고 누락/변조 그림 거부 |
| server/tools/definitions.js, find.js, handlers.js | 두 도구 계열 등록과 dispatch |
| server/tools/input-contracts.js, resource-contracts.js, metadata.js, resource-metadata.js, output-contracts.js | 신규 도구에도 strict 조건·설명·출력·annotations 부여 |
| server/validate-input.js | main JSON schema 조합과 nullable union 타입을 함께 검증 |
| packs/novel/pack.yaml, checks.yaml, README.md; packs/image/README.md; README.md; skill/folio/SKILL.md | 선언 분리, 합성된 프리셋/검사, 현행 사용자 안내 |
| test/acceptance/production-integration.test.js | 실제 단일 stdio 실행 파일의 양쪽 기능 호출 |
| test/acceptance/production-consumers.test.js | snapshot/export managed attachment, nullable path/변조, scalar/final publication 소비자 회귀 |
| test/core/assets-files.test.js, assets-immutable.test.js | 충돌한 두 자산 시험을 각각 보존 |
| test/core/features.test.js, test/server/{tools,feature-toggles,knowledge-init,occurrence-tools,export-tool,schema-contracts,schema-stdio,assets-tool,tracking-tool}.test.js | 22개 도구·프리셋 합집합과 strict 공통 입력 계약 검증 |
| test/run/{code-digest,gamebook-recovery,hand-edit-guard,recommit,scope-fields,scope-linked,order-none-checks}.test.js; test/pack/{code-digest,knowledge-links,novel-pack-sets,yaml-pack}.test.js | 실제 존재 코드 변조, immutable 재개 계약, 발행 가능한 합성 seed로 회귀 fixture 정합성 유지 |
| test/acceptance/n4.test.js, test/support/parity-serial.js | 실제 영수증 없이 receiptId를 날조하던 seed를 미연결 legacy fixture로 수정 |

검사 삭제 또는 skip으로 실패를 숨기지 않았다. 기존 main의 “영수증 이후 작가 손수정을 덮고 재개” 기대는 신규 immutable intent 계약과 양립하지 않아 충돌 거부·손수정 보존·명시적 skip/원상 복구 후 재개의 더 강한 계약으로 고쳤다. 불필요한 grantId/action 등은 handler 이전 공통 schema에서 TOOL_INPUT_INVALID가 되는 것이 정상이며 core 고유 오류는 도달 가능한 경우 그대로 검증한다.

## RED → GREEN 근거

모든 명령은 Node 24 PATH를 앞에 두고 이 worktree에서 실행했다. 로그는 repo 밖 `/tmp`에 남겨 결과물을 커밋하지 않았다.

1. **독립 main 공개 seam의 실제 RED**
   - `git archive main`으로 `/tmp/folio-production-red`에 main 실행 파일을 만들고 dependency symlink를 연결했다.
   - `FOLIO_INTEGRATION_BIN=/tmp/folio-production-red/bin/folio-mcp.js node --test test/acceptance/production-integration.test.js`
   - `/tmp/folio-production-red.log`: 1 test, 0 pass, 1 fail. `AssertionError: folio_assets is available in the same process`.
   - 앞선 merge 중 package JSON 문법 실패는 유효한 RED로 세지 않았다.
2. **통합 후 active tracking + variant의 의미 RED**
   - `/tmp/folio-variant-tracking-red.log`: 정상 번역 판본이 LOCK_TRACKING_INTEGRITY로 막힘.
   - main tracking baseline 결속을 main 실행에만 적용하고 판본의 tracking 주입은 별도로 거부했다.
   - `node --test test/acceptance/production-integration.test.js` → `/tmp/folio-production-green.log`: pass.
3. **snapshot/export 소비자 RED**
   - `node --test test/acceptance/production-consumers.test.js`
   - `/tmp/folio-consumers-red.log`: planned managed asset를 nodeIds로 연결해도 snapshot attached가 `[]`였다(expected `[['toy-image', false]]`). scalar publication의 추가 실패는 빈 steps를 가진 무효 합성 영수증 fixture였으며 유효 check step으로 보정했다.
   - 공통 attachedAssetIds 투영을 node view와 export source에 연결했다.
   - `node --test test/acceptance/production-consumers.test.js test/server/assets-tool.test.js test/server/tracking-tool.test.js` → `/tmp/folio-consumers-green.log`: 11 tests, 11 pass, 0 fail, 0 skipped.
4. **추가 focused 계약/복구**
   - `/tmp/folio-contracts.log`: production integration, resources e2e, schema contracts 6/6 pass.
   - `/tmp/folio-focus-final.log`: schema stdio의 22개 도구·structuredContent, variant index, receipts view, novel sets 등의 검증을 포함했다. 남은 2개 strict 오류 코드 기대값은 이후 위 11/11에서 통과했다.
   - `/tmp/folio-focused3.log`: 손수정/가지 복구/M5 parity 등을 포함해 51/52 pass였고 operations.review가 receiptId 문자열을 반환하는 출력 계약을 고친 뒤 위 contracts GREEN을 확인했다.

## 전체 검증

- `npm ci`: 성공, 178 packages added (`/tmp/folio-ci.log`). `npm --prefix viewer ci`: 성공, 41 packages added (`/tmp/folio-viewer-ci.log`).
- `npm --prefix viewer test`: 30 tests / 30 pass. `npm --prefix viewer run build`: 성공; graph chunk 크기 경고만 있음.
- 첫 `npm run check`는 lint/typecheck 통과 후 1642 tests / 1570 pass / 72 fail이었다(`/tmp/folio-check.log`). 잘못 합성한 scope/receipt/schema/seed 계약을 focused로 수정했다. 나머지 파일 쓰기 실패는 ENOSPC였다. 실패나 검증을 삭제하지 않았다.
- controller가 사용자 데이터 삭제 없이 디스크 여유가 회복된 것을 확인한 뒤, 이 작업 전용 `mktemp -d /tmp/folio-production-check.XXXXXX` 경로를 TMPDIR로 지정했다. Node 24는 `NODE_OPTIONS=--test-concurrency=2`를 허용하지 않으므로 그 시도는 exit 9였고 실제 테스트는 돌지 않았다. `npm run check`와 동일한 세 단계를 명시적으로 실행했다: `npm run lint && npm run typecheck && npm test -- --test-concurrency=2`.
- 첫 제한 병렬 실행(`/tmp/folio-check-final.log`): 1644 tests / 1642 pass / 2 fail / 0 skipped, 112.04초. 남은 실패는 immutable intent 충돌 오류 기대값과 도구 개수 14→22였다. 해당 시나리오의 본문 보존/skip/정적 출력 assertion을 유지한 채 실제 통합 계약으로 고쳤다.
- `node --test --test-concurrency=2 test/run/recommit.test.js test/server/export-tool.test.js test/pack/yaml-pack.test.js`: 30 tests / 30 pass / 0 fail / 0 skipped (`/tmp/folio-last-focused.log`). 새 checks.yaml의 digest 반영과 폴더 밖 경로 거부도 포함한다.
- **최종 root check 동등 명령** `npm run lint && npm run typecheck && npm test -- --test-concurrency=2`: 모두 통과. **1645 tests / 1645 pass / 0 fail / 0 skipped**, 102.45초 (`/tmp/folio-check-green.log`).
- `npm run examples:verify`: 합성 story/guide/picturebook/fairytale 4종 및 mystery/cookbook/picturebook tracking 3종 통과 (`/tmp/folio-production-examples.log`).
- `npm run assets:verify`: provider-neutral 합성 자산 put→review→approve 통과 (`/tmp/folio-production-assets.log`).
- `npm run package:verify`: npm pack tarball을 새 sandbox에 production dependency만 설치하고 동일 4개 집필·자산·추적 합성 흐름 통과 (`/tmp/folio-production-package.log`). 최종 viewer/dist 배포 검증은 Task 4 범위다.
- 변경 JS/JSX/YAML 모듈 중 300줄 초과 없음. 충돌 marker 없음. runtime/test/document 통합 변경의 whitespace 검사 통과. 전체 staged 검사에는 main에서 그대로 온 역사 docs/plans의 기존 trailing whitespace와 server/view/http-server.js 기존 EOF blank가 있어 관련 없는 역사 파일 정리는 하지 않았다.
- 임시 TMPDIR는 이 작업이 생성한 정확한 경로만 검증 후 삭제했다. 로그는 repo 밖에 있고 실제 작품·생성 결과물은 stage하지 않았다.

## 알려진 한계와 후속 책임

- `npm ci` root/viewer 및 `npm audit --omit=dev --json`에 high 1건: locked `@modelcontextprotocol/sdk` 1.30.1, GHSA-6qxp-vccf-f47h (affected >=1.12.0 <1.31.0). runtime audit 로그 `/tmp/folio-audit-runtime.json`. controller의 공식 advisory 확인에 따르면 OAuth HTTP client 범위이며 이 프로젝트 MCP server/stdio client는 해당 경로를 사용하지 않는다. 의존성 >=1.31.0/현행 1.32.1 정리는 controller Task 4에서 검증한다. 이번 병합에서 임의 업데이트하지 않았다.
- viewer 전체 audit high 1건은 dev dependency `source-map-js` <1.2.2, GHSA-68fv-2mgg-jv7q이다(`/tmp/folio-viewer-audit.json`). `npm --prefix viewer audit --omit=dev --json`은 0건이며 로그는 `/tmp/folio-viewer-audit-runtime.json`이다.
- viewer build의 graph chunk 약 1.61 MB 크기 경고는 기존 번들 구성이다. build는 성공했다.
- 최종 설치본 viewer/dist 포함, read-only resource-only workspace 진입/GET no-mutation, export 대상 publish 교체 안전성은 명시된 후속 Task 책임이다.
- 검증은 Node 24/macOS에서 수행했다. CI의 다른 OS/Node 조합은 로컬에서 실행하지 않았다.

## Fix round 1 — I1 이미지/관리 자산 ID 예약 충돌

- FIX_BASE: `49be509`; 수정 커밋: `1d65ec41ba4ef48660f92cf873c70f634e1f13b9`.
- 독립 리뷰의 I1 원문을 task-1-findings.md에서 읽고 같은 중단 경계(영수증 기록 후 YAML 쓰기 전)를 합성 PNG로 재현했다. active image, committing image, 캐시가 없어진 durable receipt, 이미 managed 버전이 끼어든 상태를 각각 검사했다.
- `core/assets/write-gate.js`: 원고 실행과 이미지 실행의 열린 writer를 같은 work lock 안에서 확인한다. asset_receipt가 예약한 ID는 이미지 실행 캐시가 사라져도 관리 자산이 가로채지 못한다. 기존 writing gate 책임을 이 helper로 이동했다.
- `core/image/run-store.js`: writer용 strict 목록 읽기를 추가했다. 깨진 JSON, 알 수 없는 state, 파일명/runId 불일치, 유효하지 않은 assetId는 `IMAGE_RUN_INVALID`이며 조용히 건너뛰지 않는다. 기존 경로 링크·파일 종류 검사도 계속 적용된다.
- `core/image/runner.js`: start/pending은 strict 예약 목록을 사용한다. run cache 없는 영수증의 ID로 새 이미지 실행을 시작하는 것도 `ASSET_EXISTS`로 거부한다.
- `core/image/commit.js`: committing 상태여도 managed 소유권을 우회하지 않는다. 기존 legacy 자산을 이어 쓰려면 같은 run/asset의 기록된 영수증이 있어야 하며, 이후 기존 receipt 재구성 일치/immutable bytes 검증으로 자신의 정확한 출력만 멱등 재개한다.
- `test/image/managed-reservations.test.js`: 4개 공개 동작 회귀. 불허 동작 전후 assets 기록장 동일성, metadata 미생성, openWork 정상 유지, 정상 재개/최종 marker 1개, abandoned 이전 예약 해제, 손상 상태의 managed add와 image start 동시 거부를 검증한다.

RED 명령(Node 24):

```text
node --test test/image/managed-reservations.test.js
ℹ tests 4
ℹ pass 0
ℹ fail 4
ℹ skipped 0
```

`/tmp/folio-fix1-red.log`에는 managed add가 성공하여 기대한 `ASSET_RUN_OPEN`/`IMAGE_RUN_INVALID`가 undefined인 실패, 충돌한 image resume에서 `Missing expected rejection`이 기록됐다. 수정 전 상태를 실제 호출한 RED이며 예외를 모의하지 않았다.

첫 GREEN 명령 및 실제 결과:

```text
node --test --test-concurrency=2 test/image/managed-reservations.test.js test/image/image-commit.test.js test/server/assets-tool.test.js test/server/image-tool.test.js test/image/image-run-paths.test.js
ℹ tests 32
ℹ pass 32
ℹ fail 0
ℹ skipped 0
```

로그: `/tmp/folio-fix1-green.log`.

자기검토 뒤 covering 검증 명령 및 실제 결과:

```text
npm run lint && npm run typecheck && node --test --test-concurrency=2 test/image/*.test.js test/server/assets-tool.test.js test/server/image-tool.test.js test/run/assets.test.js test/acceptance/production-integration.test.js test/acceptance/production-consumers.test.js
> eslint .
> tsc -p tsconfig.json
ℹ tests 81
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5882.455
```

로그: `/tmp/folio-fix1-verified.log`. 전체 root suite는 다시 실행하지 않았다. 이번 변경의 이미지 저장소/경로/잠금/검토/재개와 managed asset gate, 공개 stdio 및 snapshot/export 소비자를 위 81개 시험으로 검증했다.

자기검토: 모든 managed mutation은 공용 잠금을 잡은 뒤 gate를 거치며 gate 이전에 자산 바이트/기록을 쓰지 않는다. 예약 ID 보호는 feature 설정으로 끄지 못한다. 이미 충돌한 managed 자산이 있는 실행은 자동 삭제/수정하지 않고 `ASSET_EXISTS`로 멈춰 작품을 읽을 수 있는 상태와 추가만 되는 기록을 보존한다. 일반 이미지 완료 후 stale committing cache를 재개해도 영수증/marker가 증가하지 않는다. 모든 수정 모듈은 300줄 이하이며 git diff --check 통과. 모델/네트워크 호출을 core에 추가하지 않았다. M1/M2 의존성 및 번들 경고는 후속 Task 4 책임으로 그대로 두었다.

보고서의 디스크 설명은 controller가 정리한 것이 아니라 “사용자 데이터 삭제 없이 디스크 여유가 회복된 것을 확인”한 것으로 정정했다. controller 요청에 따라 fix 커밋에서 이 report 한 파일만 git rm --cached로 추적 해제했으며 실제 scratch 파일은 그대로 유지했다. 다른 plan 디렉터리는 변경하지 않았다. durable readiness report는 후속 Task 6 책임이다.
