# N5 브랜드 세트 — SDD 기록과 판정 (2026-09-30~)

계획: `docs/plans/2026-09-30-n5-brand.md`.

## 계획 시험 실행에서 알게 된 것

- `folio_init`은 `preset`이 필수 입력이다. 빠지면 `PRESET_REQUIRED`가 아니라 도구 입력 오류(`TOOL_INPUT_INVALID`)다. 팩별 프리셋 목록(`packPresets`)은 없는 프리셋을 줄 때(`PRESET_UNKNOWN`) 본다.
- 승인 질문의 참고 의견 순서는 검사 순서를 따른다: 코어 → 고른 세트의 검사(세트 순서) → `work.yaml` `checks`의 사용자 검사 → 모델 검사.
- `folio_config`의 `checks`는 검사 `config`를 보여 주지 않는다. 그래서 금지 표현 기본 목록은 `skill/folio/references/brand.md`에 그대로 적고, 문서 테스트가 `pack.yaml`과 맞는지 본다.
- pack.yaml 설명 글에 `예: 30%`처럼 `: `이 들어가면 YAML이 깨진다(`PACK_YAML_INVALID`).

## 기록장

SDD 원장(`.superpowers/sdd/…/progress.md`)의 `Ruling:`·`minor (deferred)`·`complete (`·`fix round` 줄을 스크립트로 그대로 옮겼다(원장 말은 영어).

```text
Task A1: minor (deferred): `YYYY.MM` (2026.10) reads as a decimal and trailing-zero stripping makes it 2026.1 — claim 2026.10 vs source 2026.1 not flagged; 2026.09 vs "2026년 9월" still flagged (claims.js:24-37, plan-mandated)
Task A1: Ruling: keep the plan's split rule (only two+ dots split) for YYYY.MM — decision 9 was approved by the user and a year.month heuristic would misread real decimals like 2025.5; advisory-only — cost if wrong: an advisory numbers-match miss on 2026.10 vs 2026.1 and a false advisory on 2026.09 vs 2026년 9월, fixable later by a version-3 split rule
Task A1: minor (deferred): split dates become a bag of numbers — 2026.09.03 vs 2026.03.09 and 10.0.1 vs 10.1.0 pass (design-inherent; document)
Task A1: minor (deferred): canonical() `/0+$/` is quadratic on pathological input ('1.' + 30k zeros + '1' ≈ 1.9 s) (claims.js:26)
Task A1: minor (deferred): mixed comma forms lose the thousands value (`1,000,5` → 1, 0, 5; `1,000.5,2` → 1, 0.5, 2)
Task A1: minor (deferred): test gaps — full-width comma thousands (３，０００), `end` with full-width/surrogate pairs (B2 relies on it)
Task A1: minor (deferred): `.filter(Boolean)` in valuesOf is dead code (claims.js:36)
Task A1: complete (commits a0aae71..4c42875, review clean)
Task B1: minor (deferred): digit-leading banned phrases match inside numbers — `11위`/`21위` flag "1위", `1100%` flags "100%"; neutral 최대주주·최고치·보장성 also match (pack.yaml:25, banned-phrases.js:54, plan-mandated). Block-raised writers would get a revise loop on fine text
Task B1: minor (deferred): `bannedPhrases(ctx, null)` throws (default param covers only undefined) — unreachable via core (withCheckConfig passes a frozen object) (banned-phrases.js:49, plan-mandated)
Task B1: minor (deferred): phrasesOf filters on trim() but keeps the untrimmed phrase — ' 최고' never matches at line start (banned-phrases.js:29)
Task B1: minor (deferred): brand-pack.test `every(!c.locked)` is weak; the schema refusal of `locked` is not pinned for this pack (covered elsewhere)
Task B1: minor (deferred): work.yaml `checks.brand.banned-phrases.locked` / `.config` silently ignored (core; handoff H1 root)
Task B1: complete (commits 4c42875..36dc5bc, review clean)
Task B2: minor (deferred): unit after one space ignores word boundaries — `버전 3 개발` reads 3개, `3분기`/`3분의 1` read 분, `제3조` reads 조; source-side misreads also lift the unitless-number guard (figure-units.js:17-18, plan-mandated)
Task B2: minor (deferred): multiplier word hides the real unit — `30억 원` vs `30억 달러`, `30만 명` vs `30만 원` not flagged (one unit only, plan-mandated; decision 7 / brand.md "한계")
Task B2: minor (deferred): unit spellings are case-sensitive — `3%P` vs `3%p` false advisory (figure-units.js:18)
Task B2: minor (deferred): `figureUnits(ctx, null)` throws — unreachable via core (figure-units.js:32)
Task B2: minor (deferred): `folio_config` recommends brand.figures for company even when `packs` lacks sources; choosing it then fails CONFIG_INVALID (core/checks/recommend.js — core-lane handoff candidate)
Task B2: minor (deferred): pack digest does not bundle imported helper source (claims.js) — same as handoff H3
Task B2: minor (deferred): brand-pack integration date claim (`2026.09.30에`) passes even without the last-value rule; no `%p` vs `%` unit test (covered by unit tests / coverage only)
Task B2: complete (commits 36dc5bc..2b0399d, review clean)
Task B3: minor (deferred): brand-docs.test checks only brand's own ids, not the sources.* ids named in the brand.figures doc row (plan-mandated)
Task B3: complete (commits 2b0399d..9717b11, review clean)
Task C1: Ruling: C1 got its own sonnet task review even though the plan folds C1 into the final review — the user's dispatch requires a task review per task — cost if wrong: one extra review seat
Task C1: minor (deferred): progress line has no hash range for C1 itself (cannot quote own hash) — controller fills it in the final docs commit
Task C1: complete (commits 9717b11..2e0ce18, review clean)
Final: Ruling: Important 1 is handled by the controller's lesson-7 docs commit (ledger → rulings doc by script, C1 range, final review section), not by the fix wave — it is bookkeeping of this ledger — cost if wrong: none beyond one docs commit
Final: Ruling: fix wave takes minors 3 (brand.md limit line on unit misreads), 4 (pack.yaml unit spellings ％, %P, ％p + test), 5 (README version wording), 6 (brand.md: brand.figures is recommended even without sources; add sources first) and adds handoff H4 to the plan's core-lane table — brand v1 is unmerged so pack.yaml changes cost no version bump — cost if wrong: brand pack.yaml/brand.md/README/brand-checkers.test.js now differ from the plan text (compare exception)
Final: User decision (2026-09-30): fix minor 2 now while brand is v1 — a banned phrase starting with a digit (half- or full-width) does not match when the character before it is a digit (`11위` ≠ `1위`, `1100%` ≠ `100%`); `업계 1위`, `1위`, `(1위)`, `100%` still match. Done in 6b22217 (sonnet implementer, sonnet review Approved, 0 findings), brand stays version 1. Replaces the earlier ruling that left it unfixed.
Final: Ruling: all other ledger minors deferred per the final review's triage (A1 YYYY.MM, bag-of-numbers dates, quadratic canonical, mixed commas, A1 test gaps, dead filter; B1 null config, untrimmed phrase, weak locked assert, H1 ignore; B2 one-unit multiplier limit, null config, H3 digest; B3 docs test scope) — reasons in the final review triage — cost if wrong: advisory false positives/negatives only, no lock impact
Final: Ruling: the fix wave also changed test/pack/brand-pack.test.js:41 (units['%'] literal gains '％') — a direct consequence of the config change the brief missed; value mirrors pack.yaml, no assert weakened — cost if wrong: none
Final: minor (deferred): README.md:9 second mention of claims.js not in backticks (style nit)
```

## 최종 브랜치 리뷰 (opus, `a0aae71..2e0ce18`)

- 판정: 고쳐서 병합 가능. Critical 0. 잠금 우회·코어 변경·계획 이탈 없음(`core/` diff 비어 있음).
- 리뷰어가 직접 시험한 잠금: brand 검사 `severity: hard` → `USER_CHECK_SEVERITY_INVALID`, `core.promise-order` `mode: off`·`severity: advisory` → `LOCKED_CHECK_OVERRIDE`, 호스트가 `brand.tone` 지적에 `hard`를 적어도 advisory로 눌림, `core.promise-order` 사칭 모델 지적은 버려짐.
- Important 1: 이 판정 기록의 기록장이 비어 있고 진행 줄에 C1 범위·최종 리뷰가 없음 → 이 docs 커밋이 채운다.
- 한 번의 수정 묶음 `ab7012c`(sonnet): 전각·대문자 퍼센트 단위 표기(`％`, `%P`, `％p`, `％P`, `％포인트`)와 테스트 1개, README의 version 문구, `brand.md`의 단위 접두어 오독 한계·`sources` 없는 `brand.figures` 추천 경고, 계획 인계 표 H4. 범위 재리뷰(sonnet): 다섯 항목 모두 ADDRESSED, 새 결함 없음.
- 사용자 결정(2026-09-30): 숫자로 시작하는 금지 표현이 더 긴 숫자 안에서 잡히던 것(`11위` → `1위`, `1100%` → `100%`)을 병합 전에 고쳤다. 앞 글자가 숫자(전각 포함)면 세지 않는다. `6b22217`, brand는 version 1 그대로, 리뷰(sonnet) 승인.
- 나머지 미룬 minor는 모두 미뤄도 된다(참고 의견의 오탐·누락, 코어에 닿을 수 없는 null config, 코어 인계 H1·H3·H4).
- 병합 메모: `sources` 팩이 version 2로 올라 기존 sources 작품의 파이프라인 digest가 바뀐다. 열린 실행은 검사부터 다시 돈다(의도된 동작).
