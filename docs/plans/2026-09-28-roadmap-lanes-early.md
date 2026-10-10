# 레인 착수 조건과 세션 프롬프트 — 앞쪽 (S · M5 · N3 · N5 · M6)

총괄: `2026-09-28-roadmap-parallel.md`. 뒤쪽 레인은 `2026-09-28-roadmap-lanes-late.md`.

N2처럼 계획이 없는 마일스톤은 두 세션으로 나눈다.

1. **계획 세션**: 설계를 승인받고 `docs/plans/`에 계획을 쓴다. 이때 superpowers:brainstorming → superpowers:writing-plans를 쓴다.
2. **실행 세션**: 계획을 SDD로 실행한다.

아래 프롬프트는 1번 세션용이다. 2번 세션 프롬프트는 계획서의 "현재 상태" 절을 가리키면 된다(N2와 같은 방식).

## 공통 블록 (모든 레인 프롬프트 끝에 그대로 붙인다)

```text
## 시작 확인
- git worktree list, git branch --show-current, git log --oneline -5 로 기준을 확인한다. 기준 브랜치가 레인 표와 다르면 멈추고 묻는다.
- npm ci 뒤 npm run check 가 초록인지, 테스트 수가 몇인지 적는다.
- docs/plans/2026-09-28-roadmap-parallel.md 의 핫스팟 표에서 이 레인이 소유하는 파일과 추가만 하는 파일을 다시 확인한다.

## SDD 실행 방법 (실행 세션)
- superpowers:subagent-driven-development. 태스크마다 구현 → 스펙 리뷰 → 품질 리뷰.
- 잠금·검사·범위·기록장·작품 밖 경로를 건드리는 태스크는 가장 강한 리뷰어 모델에 맡기고 "공격해 볼 것"을 시도하게 한다.
- 판정(Ruling)과 미룬 minor는 docs/plans/<날짜>-<마일스톤>-rulings.md 에 모은다. 계획서 "현재 상태" 절의 "진행" 줄에 커밋 범위와 테스트 수를 적는다.
- 마일스톤 완료 기준 테스트가 끝나면 결과를 보여 주고 멈춘다.

## 절대 규칙
- 잠금 규칙(hash 일치, 영수증, hard 차단, 추가만 되는 기록장, 자기검토 표기, soft 비자동수정, core.promise-order 항상 돎)은 설정·팩·세트·기능 토글 어느 것으로도 끌 수 없다.
- 엔진은 모델을 부르지 않는다. core/ 와 packs/ 는 모델이나 네트워크를 부르지 않는다.
- 검사 세트는 작가가 고른다. 새 검사는 experimental, 기본 advisory.
- 새 기능은 work.yaml features 로 켜고 끌 수 있어야 한다.
- 테스트는 합성 fixture만. 원본 fixture는 고치지 않는다.
- 파일이 300줄을 넘으면 나눈다.
- /path/to/vibelore 는 읽기 전용이다.
- 병합, push, PR, 정본 수정 전에는 반드시 사용자에게 묻는다.

## 저장소 규칙
- 소통은 한국어, 코드 식별자는 영어. 말투는 짧게.
- 커밋: 영어 Conventional Commits. 끝에 정확히 "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
- 런타임 dependencies 는 yaml, @modelcontextprotocol/sdk 둘뿐이다. 늘리지 않는다. 네이티브 모듈 금지.
- 도구 목록, features, 팩 목록, 가드 목록은 끝에만 추가한다. 목록 테스트는 같은 커밋에서 고친다. 기존 assert 는 약화하지 않는다.
- .superpowers/ 는 커밋하지 않는다. 설계는 다시 열지 않는다(정본 + 범위 결정 기록이 기준).
```

worktree는 저장소 밖 형제 폴더에 둔다. `.gitignore`를 고칠 필요가 없다.

```bash
git worktree add ../folio-worktrees/<lane> -b <branch> main
```

만들 때는 superpowers:using-git-worktrees 절차를 따른다. 메인 체크아웃(`/path/to/folio`)은 코어 레인(지금 `feat/n3-blocks`)이 쓴다. 다른 레인은 여기서 브랜치를 바꾸지 않는다.

---

## L1 S — 코어 `stamp` 제한 (a)

- 기준: main(`0bf95e1` 이후). 브랜치 `fix/stamp-severity`. worktree 사용.
- 소유: `core/checks/run-checks.js`, 새 테스트 `test/checks/stamp-severity.test.js`(또는 `test/run/` 아래), 필요하면 `packs/novel/checkers/dead-on-stage.js`의 주석만.
- 계약: `stamp` 뒤 등급 = `check.severityOverride ?? clamp(finding.severity, check.severity)`. 지적은 advisory·block만 가능하고 선언 등급보다 높일 수 없다(D5 A). 모델 검사 경로(`parseModelCheckAnswer`)는 지금처럼 모델 등급을 버린다.
- 첫 착수 조건: D1과 D5가 정해짐. N2와 같은 파일을 쓰지 않으므로 N2 실행 중에도 된다.
- 크기: 태스크 1~2개. 계획 세션 없이 짧은 계획을 프롬프트 안에서 바로 쓴다.

```text
/superpowers:using-superpowers

Folio 코어 stamp 가 팩 검사기 지적의 severity 를 그대로 따르는 문제를 고친다. 저장소 /path/to/folio, worktree ../folio-worktrees/stamp, 브랜치 fix/stamp-severity(main 기준).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(D5, 핫스팟 표)
- docs/plans/2026-09-27-n1-knowledge-pack-rulings.md 9·47·91줄, docs/plans/2026-09-28-n2-sources.md 결정 22
- core/checks/run-checks.js(stamp :23-31, failClosedSeverity, parseModelCheckAnswer), core/ledger/receipts.js isBlocking
- packs/novel/checkers/dead-on-stage.js(지적마다 severity block), packs/*/pack.yaml

## 할 일
1. superpowers:test-driven-development. 실패 테스트부터 쓴다.
   - 결정론 검사기가 hard 를 적어도 선언 등급을 넘지 않는다.
   - advisory 검사의 block 지적은 advisory 로 남는다.
   - hard 선언 검사의 block 지적은 block 이다(dead-on-stage 동작 유지).
   - 알 수 없는 값은 선언 등급이다.
   - severityOverride 는 지금처럼 앞선다.
   - 크래시 fail-closed 경로는 바뀌지 않는다.
2. 구현하고 npm run check 전부 초록.
3. 리뷰는 가장 강한 모델에 맡기고 우회 공격을 시도하게 한다(지적 객체의 getter, 대소문자, 'HARD', null 등).
4. 커밋: "fix(checks): cap checker finding severity at the declared check severity"
5. 결과를 보여 주고 멈춘다. main 병합은 묻는다.
```

(공통 블록을 붙인다.)

---

## L2 M5 — 판정 맞추기 (계획 세션)

- 기준: main + S 병합 뒤. 브랜치 `feat/m5-parity`. worktree 사용.
- 소유: `packs/novel/**`, `core/promise.js`, 새 fixture `test/fixtures/parity-*`, 판정 비교 스크립트(`scripts/parity/` 제안. 이 스크립트는 vibelore를 읽기만 한다).
- 추가만: `packs/index.js`(바꿀 일이 없어야 한다), `core/pack/yaml-schema.js`(필드 추가만), `features.js`(필요할 때만).
- 계약: 코어 핫스팟(`scope.js`, `payload.js`, `runner.js`, `index/*`)은 건드리지 않는다. 약속 휴면 판정은 회차 번호 대신 읽는 순서 위치로 한다. 새 검사는 모두 experimental advisory다. hard는 vibelore에서 hard였던 사실 충돌만 허용하고, 판정 맞추기 3항목에 근거를 둔다.
- 첫 착수 조건: D10 결정. 계획 세션은 지금 시작할 수 있고, 실행은 S 병합 뒤. N2 미룬 minor 중 `packPresets` 필터를 여기서 다룬다.

```text
/superpowers:using-superpowers

Folio M5 판정 맞추기(vibelore 검사기 이식)를 설계하고 계획서를 쓴다. 이번 세션은 계획만 한다. 저장소 /path/to/folio, worktree ../folio-worktrees/m5, 브랜치 feat/m5-parity(main 기준, S 병합 뒤).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(D10, 핫스팟, 미룬 minor 중 M3 몫), 이 파일의 L2 절
- 정본 https://claude.ai/artifact/WjJzcsjnQZnVxyyJZaxvcX 는 Artifact 도구 action "read"로 읽는다. §11·§12·§14(이식 지도, 판정 맞추기 3항목)·§20 M5를 본다.
- docs/plans/2026-09-27-scope-nonfiction-decision.md, docs/plans/2026-09-27-locks-levels-m3.md 79·2092·4227줄, docs/plans/2026-09-26-m0-m2.md 32줄
- packs/novel/**, core/promise.js, core/checks/{builtin,run-checks,user-checks,user-check-draft}.js
- vibelore(읽기 전용): engine/src/continuity/*(32 파일, checker-registry.js 불변식 그룹), src/tools/{check,check-contract,style-anchor,writer-skill}.js, engine/src/core/mention-scan.js, ledger.js의 plantedAtChapter/lastMovedChapter, engine/test/continuity/*, test/fixtures/synthetic-prose.js

## 할 일
1. superpowers:brainstorming. 검사기를 셋으로 나눈 표를 먼저 보여 준다.
   - 원고만 보는 것(문체·통계·사전)
   - 회차 번호에 묶인 것(사건 기록으로 전환)
   - 이식하지 않는 것(이유와 함께)
2. 판정 비교 방법(D10)을 정하고, 합성 fixture와 기대 판정 JSON을 설계한다. 실제 작품(works/*)은 읽기만 하고 커밋하지 않는다.
3. 소설 세트 기본·웹소설 연재·문체 유지, 떡밥 사건·검사, 판정 맞추기 3항목 완료 기준 테스트(MCP stdio).
4. 설계를 승인받으면 superpowers:writing-plans 로 docs/plans/<날짜>-m5-parity.md 를 쓴다. 계획 코드는 scratch worktree 에서 시험 실행한다(N2 계획과 같은 방식).
5. 계획 문서만 커밋: "docs(plans): M5 parity implementation plan". 요약을 보여 주고 멈춘다.
```

(공통 블록을 붙인다.)

---

## L3 N3 — 블록·상호 참조 (계획 세션, 코어 레인 첫 마일스톤)

- 기준: main `0bf95e1`(J1 끝). 브랜치 `feat/n3-blocks`는 이미 있다. 메인 체크아웃을 쓴다. S 없이 시작해도 된다(새 검사기는 지적에 `severity`를 적지 않는다).
- 미룬 minor: N1의 싼 것과 N2의 코어 경로 항목(총괄 문서 표)을 계획서에 넣는다.
- 소유: `core/store/blocks.js`, `store/work.js`, `index/{rebuild,schema,query}.js`, `status.js`, `server/tools/find.js`. 코어 레인이 N7까지 계속 소유한다.
- 추가만: `definitions.js`(`folio_find` query enum 끝에 추가), `features.js`, `packs/knowledge/pack.yaml`(검사·세트 추가만).
- 계약: 블록 번호와 색인은 파일에서 다시 만들 수 있는 투영이다(`index.db`처럼). 저장 정본은 본문 앵커다. 참고문헌은 N2 근거 기록장과 자료 설명서를 읽기만 한다. M6가 쓸 조회 함수는 `core/index/query.js`에서 이름을 고정해 내보낸다.
- 첫 착수 조건: 충족(J1 끝, N2 판정 기록이 main에 있음). 다른 세션이 계획을 쓰는 중이다.

```text
/superpowers:using-superpowers

Folio N3 블록·상호 참조(번호, 각주, 참고문헌, 색인)를 설계하고 계획서를 쓴다. 이번 세션은 계획만 한다. 저장소 /path/to/folio, 브랜치 feat/n3-blocks(main 기준, J1 뒤).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(L3, 핫스팟, 미룬 minor 중 N1 몫), 이 파일의 L3 절
- 정본(Artifact read) §03(과학책·사전 행), §04 블록 id, §05 블록, §15, §20 "v0.1 이후" 표
- docs/plans/2026-09-27-scope-nonfiction-decision.md, docs/plans/2026-09-28-n2-sources.md(범위 밖: 인용 형식·각주·참고문헌은 N3), N2 판정 기록
- core/store/blocks.js(parseBlocks, validateBlocks — problems 를 아무도 보고하지 않음), core/index/{rebuild,schema,query}.js(blocks, block_refs 표), core/status.js, server/tools/find.js
- test/fixtures/knowledge-book(fig-1-1, tbl-2-1, 깨진 fig-9-9)

## 할 일
1. superpowers:brainstorming. 번호 규칙(장별·전체), 각주 문법, 참고문헌 원천(자료 설명서), 색인(엔티티·용어 등장 위치 재사용)을 정한다. 상호 참조 유효성 검사를 어디에 둘지 정한다(코어 잠금 아님, 팩 검사, experimental advisory).
2. features 토글(예: blocks, numbering, bibliography)을 끝에만 추가하도록 설계한다.
3. M6 가 쓸 조회 함수 이름을 계약으로 적는다.
4. superpowers:writing-plans 로 docs/plans/<날짜>-n3-blocks.md. scratch worktree 에서 시험 실행한다.
5. 계획 문서만 커밋: "docs(plans): N3 blocks and cross-references implementation plan". 멈춘다.
```

(공통 블록을 붙인다.)

---

## L4 N5 — 브랜드 세트 (계획 세션)

- 기준: main + J1 뒤. 브랜치 `feat/n5-brand`. worktree 사용.
- 소유: 새 팩 `packs/brand/**`(둘째 팩 방식. 검사·세트만), `skill/folio/references/brand.md`.
- 추가만: `packs/index.js`, 팩 목록 테스트, `SKILL.md` 한 줄.
- 계약: 코어는 건드리지 않는 것이 목표다. 수치 대조는 N2 `sources.numbers-match`와 evidence 범위(`claims`)를 재사용한다. 추출 주장은 작품에 `sources` 팩이 있을 때만 요청되므로, 브랜드 작품도 `packs: [<첫 팩>, sources, brand]`처럼 `sources` 팩을 함께 켜야 한다. `numbers-match`의 NFKC 오탐(N2 미룬 minor)을 여기서 다룬다. 코어 변경이 필요하면 멈추고 코어 레인에 넘긴다. 어조는 모델 검사, 금지 표현은 사용자 검사 `words`·`pattern` 방식을 쓴다.
- 첫 착수 조건: J1 끝(N2의 둘째 팩 방식과 `sources` 팩이 main에 있음).

```text
/superpowers:using-superpowers

Folio N5 브랜드 세트(어조, 금지 표현, 수치 대조)를 설계하고 계획서를 쓴다. 이번 세션은 계획만 한다. 저장소 /path/to/folio, worktree ../folio-worktrees/n5, 브랜치 feat/n5-brand(main 기준, J1 뒤).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(L4), 이 파일의 L4 절
- 정본(Artifact read) §03(회사 제품 소개서·브로셔 행), §12(검사 세트 "회사 문서: 브랜드 어조 · 수치 대조"), §14
- docs/plans/2026-09-28-n2-sources.md(둘째 팩 결정 9, numbers-match 결정 11, 세트 추천 결정 14), N2 판정 기록
- packs/sources/**, core/checks/{user-checks,recommend,check-set}.js, packs/knowledge/pack.yaml(프리셋 모양)

## 할 일
1. superpowers:brainstorming. 둘째 팩 packs/brand 의 검사·세트·추천(recommendedFor)과 회사 문서 프리셋 필요 여부를 정한다. 프리셋은 첫 팩 몫이니 knowledge 에 둘지, 새 첫 팩이 필요한지 설계에서 답한다.
2. 코어 변경 0 을 목표로 하고, 필요하면 목록을 만들어 코어 레인 인계 항목으로 둔다.
3. superpowers:writing-plans 로 docs/plans/<날짜>-n5-brand.md. 시험 실행.
4. 계획 문서만 커밋: "docs(plans): N5 brand check sets implementation plan". 멈춘다.
```

(공통 블록을 붙인다.)

---

## L5 M6 — 뷰어 (계획 세션, M6a·M6b 두 단계)

- 기준: main + J1 뒤. 브랜치 `feat/m6-viewer`. worktree 사용.
- 소유: `viewer/**`, 새 `core/view/*`(읽기 전용 조회 층. 모델·네트워크 없음), `server/view/*`(`node:http` 정적 서버), `handlers.js`의 `folio_view` 항목.
- 추가만: `definitions.js`(`folio_view` 설명문만 고침), `features.js`(예: `viewer`, `viewerToggles`), 가드 목록.
- 계약:
  - 단계 토글 쓰기는 기존 `work.yaml` 검증 경로를 거친다. 잠금 단계는 화면과 서버 양쪽에서 거부한다.
  - M6a: 조회 층, 뼈대, 읽기·엔티티·영수증·단계 토글 화면.
  - M6b: J2 뒤. 관계도, 떡밥 보드(M5), 근거(N2), 블록(N3), 정적 내보내기.
  - 루트 `dependencies`는 바뀌지 않는다(D6).
- 첫 착수 조건: J1 끝. D6 결정. 떡밥 보드는 M5 병합 뒤.

```text
/superpowers:using-superpowers

Folio M6 뷰어를 설계하고 계획서를 쓴다(M6a 조회 층·뼈대, M6b 나머지 화면). 이번 세션은 계획만 한다. 저장소 /path/to/folio, worktree ../folio-worktrees/m6, 브랜치 feat/m6-viewer(main 기준, J1 뒤).

## 먼저 읽을 것
- AGENTS.md, docs/plans/2026-09-28-roadmap-parallel.md(D6, L5, 핫스팟, 미룬 minor 중 M3 서버 몫), 이 파일의 L5 절
- 정본(Artifact read) §06 전체 구조(뷰어 API), §11 떡밥 보드, §17 뷰어, §19 기술 선택, §20 M6 완료 기준
- server/tools/handlers.js(folio_view 는 VIEWER_NOT_BUILT), core/index/query.js, core/status.js, core/work/config.js(단계 토글 쓰기 경로)
- package.json(런타임 의존성 두 개)

## 할 일
1. superpowers:brainstorming. D6(뷰어 의존성 자리), 빌드 결과를 커밋할지, folio_view 가 서버를 띄우는 방식(포트, 종료, 루트 제한)을 정한다.
2. core/view/* 조회 계약을 화면별로 적는다. 뒤 마일스톤(N3·M5)의 데이터는 J2 뒤 M6b 에서 붙인다.
3. 잠금 단계 토글 거부를 서버 쪽 테스트로 고정한다.
4. superpowers:writing-plans 로 docs/plans/<날짜>-m6-viewer.md(M6a, M6b 절 나눔). 시험 실행.
5. 계획 문서만 커밋: "docs(plans): M6 viewer implementation plan". 멈춘다.
```

(공통 블록을 붙인다.)
