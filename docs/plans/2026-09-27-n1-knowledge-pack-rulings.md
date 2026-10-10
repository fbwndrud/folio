# N1 지식 책 팩 — SDD 기록과 판정 (2026-09-28)

계획: `docs/plans/2026-09-27-n1-knowledge-pack.md`. 이 파일은 실행 기록장(`.superpowers/sdd/.../progress.md`)을 옮긴 것이다. `Ruling:` 줄은 계획과 다르게 또는 계획을 넘어 정한 것, `minor (deferred)`는 미룬 사소한 문제다. 최종 리뷰(opus)는 모든 판정과 미룬 항목을 "병합 전 수정 불필요"로 분류했다.

## 결과

- `npm run check` 669/669 (시작 621, 계획 예상 650 + 판정으로 더한 테스트 19).
- `test/acceptance/n1.test.js` 6/6 (N1-1 ~ N1-6).
- 후속 과제: 코어 `stamp`가 팩 검사기 지적의 `severity`를 그대로 따른다. 제3자·AI 팩을 들이기 전에 코어에서 advisory/block으로 제한한다.

## 기록장


Start: branch feat/n1-knowledge-pack @ 13358b1, npm run check 621/621 (2026-09-28).
Spec: 정본 아티팩트 §14 지식 책 팩 표·§03·§12 읽음 — 계획 "설계 요약"과 일치. 범위 결정 docs/plans/2026-09-27-scope-nonfiction-decision.md, M4 판정 docs/plans/2026-09-27-m4-occurrences-rulings.md 계속 유효.

## Pre-flight scan (task interfaces)

| Pair / task | Produces → consumes | Found |
|---|---|---|
| A1 → A2 | definitions.js `draftDefinitions`, `priorDefinitions`, `prerequisitesOf` → prerequisite-order.js | 이름·시그니처 일치 |
| A1 → A3 | `namesOf` → term-consistency.js | 일치 |
| A2 core → A2 checker | gatherScope `prerequisiteIds` → priorEvents(선수 개념 앞 정의) | 일치. 검사기는 prerequisiteIds를 직접 읽지 않고 priorEvents만 씀 |
| A2 core ↔ M4 scope | scope.js `known`, `fromEvents`, `uniqueSorted` 기존 식별자 사용 | 계획 코드가 기존 식별자에 기댐 — 구현자가 실제 이름 확인 필요(임시 사본에서 돌았음) |
| A3 ↔ core/util/fences.js | `fencedRanges`, `maskRanges` (M4 A2) | 존재, 시그니처 일치 |
| A1/A2/A3 → B1 | `definedBeforeUse`/`prerequisiteOrder`/`termConsistency` → KNOWLEDGE_CHECKERS 이름 → pack.yaml `run:` | 세 이름 일치 |
| B1 → B2 | loadBuiltinPacks 순서 novel, knowledge → packPresets 순서 | 일치 |
| B1/B2 → C1 | preset textbook, sets, check ids, packs:['knowledge'] init | 일치. N1-1 appliedChecks 목록 = leaf 파이프라인의 basic 검사 |
| B1 ↔ novel-pack.test.js:15 | 내장 팩 목록 | 계획이 한 줄 변경 명시(결정 15) |
| A1 self | 테스트 6개 인용 경우 ↔ quotedInDraft trim≥2 + quoteNames | 일치 |
| A2 self | scope 테스트 entityIds ['membrane'] (세포막 먼저 가림) ↔ 이름 스캔 긴 이름 우선 | 계획 주석대로 |
| A3 self | 테스트 `'세포 막 ```\n안'` 줄 중간 울타리 → 울타리 아님 ↔ fences 규칙 | 일치(M4 A2) |
| B1 self | 파일 목록 ↔ git add `packs/knowledge` 통째 | 일치 |
| B2 self | skill-docs 새 테스트 ↔ references 폴더 모든 파일 링크 | 기존 references가 전부 링크돼 있어야 함 — 임시 사본에서 통과 |
| C1 self | N1-2 revise 3회 ↔ loop max 3 | 일치 |
| Global vs user brief | 계획 Global Constraints의 server 가드 목록에 file-tx-journal.js 없음 | 아래 Ruling |

Ruling: server 가드 목록에 core/util/file-tx-journal.js 포함(implementer-common.md) — 사용자 지시와 M4 가드가 이미 금지; N1은 server 쓰기 경로를 안 건드려 코드 변경 없음 — 틀리면 비용: 없음(더 엄격할 뿐).
Ruling: 태스크별 리뷰 모델 — A1·A2·A3·B1 opus + 공격 스크립트(세션 scratchpad), B2·C1 sonnet, 최종 opus — 사용자 지시 — 틀리면 비용: 리뷰 비용 차이뿐.

## Tasks
Task A1: implementer a799f356e920e8da5, BASE 13358b1, HEAD b238f6a, 626/626
Task A1: review 1 — spec ✅, quality Needs fixes. Important (plan-mandated): 결정 3 이름 조건이 이름만 인용('세포')·이름+조사 인용으로 뚫림.
Ruling: 결정 3 강화 — 인용에서 그 엔티티 이름·별칭을 모두 지운 뒤 공백 아닌 글자가 2자 이상 남아야 정의로 인정(이름만·이름+조사 한 글자 거부). "사용 문장 인용"은 결정론으로 못 막는 한계로 docstring에 적음 — 결정 3의 취지(아무 인용으로 지적 끄기 방지)를 싸게 지킴, 계획 테스트 인용은 모두 통과 — 틀리면 비용: 짧은 정의 인용("ATP는 X") 일부를 거부해 거짓 advisory, 작가가 인용을 늘리면 풀림.
Ruling: namesOf가 이름·별칭을 trim하고 빈 값 제외 — 작가가 ' ' 별칭을 적으면 공백 든 아무 인용이 정의가 되는 구멍 — 틀리면 비용: 없음.
Ruling: priorDefinitions는 계획대로 앞 노드 term.defined를 인용 없이도 믿음(⚠️ 항목) — 앞 노드 사건은 작가 승인 게이트·커밋을 거침, 계획 결정·A2/C1 테스트가 이 전제 — 틀리면 비용: 앞 노드에 위조된 무인용 정의가 승인되면 뒤 노드 지적이 사라짐. 최종 리뷰에 넘김.
Ruling: core stamp가 finding.severity를 따르는 것(⚠️)은 N1 범위 밖 — 소설 dead-on-stage가 per-finding severity 'block'을 씀(기존 M3 동작), 지식 팩 검사기는 severity를 안 내고 테스트가 고정 — 틀리면 비용: 제3자 팩 검사기가 hard를 낼 수 있음(내장 팩만 있으므로 현재 노출 없음). 최종 리뷰에 넘김.
Task A1: ⚠️ parseEvents는 NFC 없이 인용 대조 — 코어가 앞단에서 더 엄격하게 거부할 뿐, 검사기 쪽 구멍 아님. 기록만.
Task A1: minor (deferred): ctx.work 없으면 block에서도 passed(운영 경로에선 checkContext가 항상 work 넣음).
Task A1: fix round 1/5 (3 addressed, 0 open; commits b238f6a..ea3597c)
Task A1: minor (deferred): 다른 엔티티의 진짜 정의 문장(이 이름 포함) 인용, 합성어 속 이름(열/열역학)은 결정론 한계로 docstring에 명시만.
Task A1: complete (commits 13358b1..ea3597c, review clean) — 632/632 (계획 예상 626 + 추가 테스트 6). 이후 예상 수 +6.
Task A2: implementer af8f5c50febf53654, BASE ea3597c, HEAD 5623736, 637/637. 커밋 attribution 'Sonnet 5' 잘못 — 수정 라운드에서 amend.
Task A2: review 1 — spec ✅, quality Approved. Minors M1–M7.
Ruling: M1 커밋 트레일러 'Sonnet 5' → 'Opus 5.5'로 amend(아직 HEAD, push 안 함) — 사용자 저장소 규칙이 정확한 줄을 요구 — 틀리면 비용: 없음(로컬 SHA만 바뀜).
Ruling: M2·M3 싸게 정리 — 검사기가 prerequisites가 목록이 아니거나 문자열 아닌/빈 원소, 자기 자신을 가리키면 PREREQUISITE_INVALID로 알림(결정 6 "오타를 조용히 넘기지 않는다" 취지). 코어 scope는 그대로 무시 — 틀리면 비용: 새 지적 코드 하나, advisory.
Ruling: M4 docstring에 결정론 한계(X 이름 든 뒤 문장을 X 정의로 인용) 명시. M5 두 prerequisitesOf에 서로 가리키는 동기화 주석.
Task A2: minor (deferred): M6 basePayload priorEvents에 선수 개념 사건이 들어가지만 entities에 그 설명 없음(payload.js) — 최종 리뷰 판단.
Task A2: minor (deferred): M7 선수 개념 앞 정의 변경 → stale 직접 테스트 없음(공격 6a·6b로 동작 확인).
Task A2: fix round 1/5 (5 addressed, 0 open; 5623736 amended → f0c9f02, fix b9964ed)
Task A2: complete (commits ea3597c..b9964ed, review clean) — 640/640.
Task A3: implementer a1ca950b5bbf2c813, BASE b9964ed, HEAD 2732c44, 644/644
Task A3: review 1 — spec ✅, quality Needs fixes. Important ×2 (plan-mandated).
Ruling: avoid 표기는 trim 후 NFC, 중복 제거 — ' 세포 막 '이 안 걸리고 같은 표기가 두 번 지적되던 구멍; namesOf trim 판정과 일치 — 틀리면 비용: 없음.
Ruling: 결정 7 "이름 안에 든 avoid는 세지 않음"을 원고 선가림 대신 위치 포함으로 구현 — avoid가 나온 자리가 어떤 엔티티(자기 포함 전체)의 이름·별칭이 나온 자리 안에 완전히 들 때만 건너뜀. 선가림은 이름·별칭을 품은 avoid(이름 세포막+별칭 막+avoid '세포 막')를 조용히 무력화했고, 다른 엔티티 이름 속 avoid(아데노신 ⊂ 아데노신 이인산)에 거짓 지적을 냈다 — 결정 7의 취지 그대로, 계획 테스트 통과 — 틀리면 비용: 다른 엔티티 이름 안의 avoid 표기는 지적 안 됨(의도된 동작).
Ruling: avoid가 목록이 아니거나 문자열 아닌 원소, 또는 avoid가 그 엔티티 이름·별칭과 같으면 TERM_AVOID_INVALID로 알림(A2 PREREQUISITE_INVALID와 일관, 조용한 무력화 방지). 빈·공백 문자열은 계획 테스트대로 조용히 무시 — 틀리면 비용: 새 지적 코드 하나, advisory.
Task A3: minor (deferred): avoid 값에 NUL이 들면 울타리 가림과 맞물려 거짓 지적 가능(YAML "\0"로만 가능).
Task A3: ⚠️ 지적 quote는 NFC 표기 — 코어 quoteSupported가 NFC 비교라 문제 없음. 기록만.
Task A3: fix round 1/5 (4 addressed, 0 open; commits 2732c44..de97c70)
Task A3: minor (deferred): 포함 검사 O(avoid 등장 × 이름 등장) — 병적 입력(500엔티티 avoid '가', 63k자) 9.3s, 현실 조건 64ms.
Task A3: minor (deferred): 겹쳐 나오는 이름(ABA in ABABA) 위치 누락 → avoid 'BA' 거짓 지적.
Task A3: minor (deferred): 자기 이름과 같은 avoid의 TERM_AVOID_INVALID quote가 trim·NFC 값(String(원값) 아님). `avoid:` 빈 키(null)도 INVALID.
Task A3: minor (deferred): 다른 엔티티 이름과 똑같은 avoid는 영원히 지적 안 되고 INVALID도 아님.
Task A3: complete (commits b9964ed..de97c70, review clean) — 651/651. B1에 TERM_AVOID_INVALID·PREREQUISITE_INVALID 존재 알림.
Task B1: implementer ad255a9e38876b3b4, BASE de97c70, HEAD d124849, 657/657
Task B1: review 1 — spec ✅ (17 files byte-identical to brief), quality Needs fixes. Important (plan-mandated): leaf-plan.md·draft.md가 payload에 없는 데이터(entities의 prerequisites·avoid, plan/draft 단계 priorEvents)를 쓰라고 지시 — core payload.js는 {id,kind,name,aliases,body}만 보내고 plan/draft 범위는 대개 비어 있음.
Ruling: 프롬프트를 고친다(코어 payload는 안 바꿈) — 프롬프트는 실제로 오는 필드만 가리키고, 선수 개념·avoid 규칙은 엔진 검사가 원고 뒤에 본다고 적으며, 호스트가 필요하면 folio_find로 엔티티를 확인하게 안내 — 코어 최소 변경 원칙(계획 설계 요약), 결정론 검사가 여전히 잡음 — 틀리면 비용: 호스트가 사전 예방을 덜 해 advisory가 더 자주 뜸; payload 확장은 N2 이후 검토 거리.
Ruling: extract.md "인용 없는 정의는 인정되지 않는다" → "이 원고의 정의로 인정되지 않는다"로 좁힘(앞 노드 무인용 정의는 믿는다는 A1 Ruling과 일치) — 틀리면 비용: 없음.
Ruling: knowledge-pack.test.js에 7개 프롬프트 키 전부가 올바른 파일 내용과 같은지 확인하는 assert 추가(싸고 경로 뒤바뀜을 잡음) — 틀리면 비용: 없음.
Task B1: minor (deferred): 지식 팩 전용 digest 테스트 없음(리뷰어 공격 D0–D6로 확인).
Task B1: ⚠️ 코어가 commit 단계 없는 팩·core.promise-order를 담은 세트를 받아들임 — 잠금 우회 아님, 기록만.
Task B1: fix round 1/5 (3 addressed, 0 open; commits d124849..91be754)
Task B1: complete (commits de97c70..91be754, review clean) — 657/657.
Task B2: implementer a22a13bffc3fe2bdb, BASE 91be754, HEAD ee6e6fb, 660/660
Task B2: complete (commits 91be754..ee6e6fb, review clean) — 660/660.
Task C1: implementer a480e8e3a83506015, BASE ee6e6fb, HEAD ae64190, 666/666, n1 6/6
Task C1: complete (commits ee6e6fb..ae64190, review clean) — 666/666.
Final review (13358b1..ae64190, opus): 병합 가능. Important 1 = C1 Step 5 판정 문서·현재 상태 미작성(컨트롤러가 함). 모든 Ruling·deferred minor "둬도 됨" 분류.
Ruling: 최종 수정 1회에 싼 minor만 묶음 — (a) 선수 개념 앞 정의 변경 → stale + 커밋 refsDigest 테스트(M7), (b) prerequisite-order 객체 값 표시를 JSON으로, (c) 다른 엔티티 이름·별칭과 똑같은 avoid도 TERM_AVOID_INVALID, (d) knowledge.md: 잘못된 avoid가 모든 절에서 되풀이됨(block이면 전부 막힘) 한 줄, term.redefined quote 문구를 실제 강제 여부에 맞춤 — 사용자 지시("미뤄 둔 사소한 문제 정리"), 전부 작고 테스트 가능 — 틀리면 비용: 작음.
Ruling: 나머지 deferred minor(O(n·m) 성능, ABA 겹침, NUL, 결정론 인용 한계, ctx.work 없음, digest 전용 테스트, scope.js가 모든 팩의 prerequisites를 읽음)는 그대로 둠 — 최종 리뷰가 병합 무관 판정 — 틀리면 비용: 드문 거짓 advisory·병적 입력 지연.
Ruling: 코어 stamp가 지적 severity를 따르는 문제는 제3자/AI 팩을 들이기 전 후속 과제로 남김(N1 범위 밖) — 틀리면 비용: 외부 팩이 hard를 낼 수 있음(현재 내장 팩만).
Final fix wave: commits ae64190..14137f6 (db90f5d stale 테스트, 14137f6 검사기·문서). 재리뷰: a·b·c ADDRESSED, d 부분 — knowledge.md가 잘못된 prerequisites도 "모든 절"에서 알린다고 일반화(실제는 그 엔티티를 정의하는 절에서만).
Ruling: d 잔여는 두 번째 수정 없이 컨트롤러가 판정 문서 커밋에서 한 문장 고침(avoid는 모든 절, prerequisites는 정의하는 절만) — 재리뷰어가 코드로 확인한 사실을 그대로 적는 문서 한 줄, 수정 라운드는 1회 제한 — 틀리면 비용: 문서 한 줄, 리뷰 안 거침.
Final: 669/669.
