# M5 판정 맞추기 — SDD 기록과 판정 (2026-09-29~)

계획: `docs/plans/2026-09-29-m5-parity.md`.

## 계획 시험 실행에서 알게 된 것

- 의도한 차이(intendedDiffs)
  - advisory-start: 새 검사의 vibelore hard 판정은 advisory로 시작한다(사용자 결정).
    - LEDGER_UPDATE_AFTER_DESTROY, LEDGER_RESTORE_NOTE_REQUIRED, GENDER_HONORIFIC_MISMATCH
    - POV_VIOLATION, QUALITY_GATE_LENGTH, METADATA_LEAK
    - WEBNOVEL_SOFT_LINEBREAKS, WEBNOVEL_DIALOGUE_NOT_ISOLATED, WEBNOVEL_DIALOGUE_BURIED
    - SENSITIVE_*
  - core-refusal: INTRINSIC_VIOLATION:structural(모르는 인물 사건)은 Folio 추출 거부 EVENT_INVALID에 대응한다.
  - folio-stricter: PROMISE_RESOLVED_BEFORE_PLANT는 Folio 코어 잠금이다(vibelore는 soft LEDGER_UNKNOWN_ID).
  - folded: destroyed-updated 사례에서 Folio는 DESTROYED_UPDATED 하나만 내고 DESTROYED_MENTIONED를 겹쳐 내지 않는다.
  - not-ported: vibelore 모드 B는 대명사 "그"를 남성 호칭으로 센다. Folio는 기본으로 뺀다(`proseSkipTerms: ['그']`).
- vibelore 파이프라인은 `scanLexicon`에 hints를 주지 않는다. 그래서 GENDER_HONORIFIC_MISMATCH 모드 A(hard)는 실제로는 한 번도 나오지 않았다. 스크립트는 `scanLexicon`을 직접 불러 확인한다.
- 짧은 합성 원고에서는 운율(PROSODY_LOW / QUALITY_GATE_PROSODY)이 양쪽 모두 자주 나온다. 깨끗한 사례는 문장 끝을 다양하게 써야 통과한다.
- 알릴 것(M5 범위 밖, 코어 레인 판단): 처음 커밋하는 노드를 승인 대기 중에 작가가 파일로 직접 고치면, 거절이나 경고 없이 실행 원고로 덮인다. `folio_status` drift도 비어 있다. 이미 커밋된 노드는 recommit 경로가 막는다. 의도인지 사용자에게 묻는다.
- minor (deferred)
  - `packs/novel/checkers/text/style-prose.js`와 `serial-prose.js`가 겹친다(합칠 수 있음).
  - 사전 부분 문자열 일치의 오탐("흔들" ⊂ "흔들리는").
  - 팩 digest가 도우미·사전 파일을 보지 않는다. README에 적었고, 바꿀 때는 `pack.yaml` `version`을 올린다.

## 기록장

- Ruling: 공식 task-brief 대신 python 추출 brief 사용 — 스크립트가 숫자 태스크·4-backtick 펜스를 처리 못함 — 틀리면 brief 에 빠진 절이 생김(재생에서 쓴 것과 같은 태스크 경계라 위험 낮음).
- Ruling: 리뷰어 Global constraints 는 brief 맨 앞 절(계획 원문 그대로)로 가리킴 — 컨텍스트 절약 — 틀리면 리뷰어가 제약을 덜 봄.
- Task A1: minor (deferred): 기존 기록장에 promise.reopened 가 있으면 이제 접어 읽음(더 엄격해질 뿐). recheck 에서 과거 노드가 새로 hard 될 수 있음 — M5 판정 기록에 적을 것
- Task A1: minor (deferred): dormantPromises 는 atNodeId 이후 사건을 거르지 않음(JSDoc 계약). 부르는 쪽이 eventsBefore 류로 걸러야 함
- Task A1: minor (deferred): spanFor '__proto__'/'constructor'/'NEXT '/core:'true' 테스트로 고정 안 됨(동작은 맞음)
- Task A1: minor (deferred): leafDistance O(nodes) per call → dormantPromises O(promises×nodes)
- Task A1: complete (commits 73f2306..18c14b6, review clean)
- Task A2: ⚠️ refs 좁게 유지 → 앞 약속 사건이 바뀌어도 노드가 "다시 확인 필요"가 안 됨(휴면 판정 stale 가능). Ruling: 그대로 둔다 — 사용자 결정 Q1 A(entityIds·refs 불변)가 명시함, 휴면은 advisory 뿐 — 틀리면 휴면 참고 의견이 오래된 채 남음(잠금 영향 없음)
- Task A2: minor (deferred): scope.test 'extracted events…' 의 priorEvents assert 가 이제 promiseScope 덕에 통과 → fromEvents 경로 구별력 잃음. withoutPromiseScope 로 돌리면 됨
- Task A2: minor (deferred): 순서 없는 노드 + promiseScope + 약속 사건 조합 테스트 없음(구조상 안전)
- Task A2: minor (deferred): scope.js promiseIds 배열 includes → Set 이 깔끔
- Task A2: complete (commits 18c14b6..e9c8049, review clean)
- Task A3: minor (deferred): memberErrors 가 readChecks 가 버린 검사를 가리키는 세트에 연쇄 오류를 더함(소음만)
- Task A3: minor (deferred): packErrorPath checkId 비문자열 fallback 'pipelines' 도달 불가
- Task A3: minor (deferred): yaml-schema.js → core/work/config.js import (plan-mandated, 순환 없음)
- Task A3: minor (deferred): packErrorPath 테스트가 코어 코드 ~12 중 4만 고정(checkSets.<set>, name 추가 권장)
- Task A3: complete (commits e9c8049..5811eda, review clean)
- Task B1: Ruling: EXISTS_UNKNOWN 의 quote(원고에 없는 exists 값, 빈 문자열 가능)를 뺀다. 값은 message 에만 — Part B 공통 규칙 "quote 는 원고에 그대로 있는 2자 이상"이 태스크 코드보다 우선, parity 대응(LEDGER_INVALID_STATUS→EXISTS_UNKNOWN)은 코드만 봄 — 틀리면 작가가 지적에서 원래 값을 인용으로 못 봄(message 엔 있음)
- Task B1: Ruling: honorific-gender 에 설정 검증 추가(HONORIFIC_GENDER_CONFIG_INVALID 하나 내고 멈춤) — 같은 공통 규칙, B3 이후 검사기들도 이 패턴 — 틀리면 검사기 코드 몇 줄 늘고 팩 digest 가 계획 재생본과 달라짐(값 고정 테스트 없음)
- Task B1: minor (deferred): withCheckConfig 가 locked/hard 검사에 config 금지를 명시 안 함(digest 로 묶여 우회 아님)
- Task B1: minor (deferred): loadBuiltinPacks 경유 통합 테스트 없음(B5 novel-pack-sets 가 advisory·length config 일부 고정)
- Task B1: minor (deferred): destroyed-object 복원 인용 한 글자 사례 테스트 없음
- Task B1: minor (deferred): metadata-leak NFC 정규화 안 함
- Task B1: fix round 1/5 (2 addressed, 0 open — EXISTS_UNKNOWN quote 제거, honorific-gender 설정 검증; commits a49c282..20d9d78)
- Task B1: complete (commits 5811eda..20d9d78, review clean after 1 fix round)
- Task B2: Ruling: promise-evidence·promise-dormant 에도 설정 검증(*_CONFIG_INVALID 하나 내고 멈춤). 계획 테스트의 "minQuote 0 → 8 로 대체"는 CONFIG_INVALID 기대로 바꾼다 — B1 판정·Part B 공통 규칙과 일관 — 틀리면 잘못된 설정이 조용히 기본값 대신 지적 하나를 냄(작가에게 더 잘 보임)
- Task B2: minor (deferred): closed→advanced→resolved 가 flow·core 모두에서 안 걸림(core 는 advanced 를 재활성으로 봄). flow/core/dormant 의 closed 뒤 상태 해석이 셋 다 다름 — D1/최종 리뷰에서 판단
- Task B2: minor (deferred): 7자/8자 인용 경계 테스트 없음
- Task B2: minor (deferred): promise-flow 가 NFC 비교 후 원 quote 반환(생산 경로는 generate.js 가 보장)
- Task B2: minor (deferred): pack.yaml 휴면 span 이 core 상수 중복(plan-mandated)
- Task B2: fix round 1/5 (1 addressed, 0 open — evidence·dormant 설정 검증; commits 5b94a96..5fdc92f)
- Task B2: complete (commits 20d9d78..5fdc92f, review clean after 1 fix round)
- Task B3a: minor (deferred): info-restate·sensitive 가 proseOf 대신 draft 읽기 인라인 재구현
- Task B3a: complete (commits 5fdc92f..1c67cf4, review clean)
- Ruling: 구현자는 이후 전체 파일을 plan-files.py 로 기계 추출, 커밋 전 compare SAME 필수 — 재타이핑이 문자를 바꿈 — 틀릴 일 적음
- Task B3b: fix round 1/5 (2 addressed, 0 open — 곡선 따옴표 복원, time-skip 문구 복원, 회귀 테스트 +1; commits 82769fd..24f302f)
- Task B3b: complete (commits 1c67cf4..24f302f, review clean after 1 fix round)
- Task B4a: minor (deferred): FIRST_PERSON_MARKERS '내' 부분 일치 오탐(내일·국내), simile '같이' 부사 오탐 — vibelore 그대로, 문서화됨
- Task B4a: minor (deferred): 계획 B4a Interfaces 의 style-prose.js export 목록이 실제 코드와 다름(문서 오류)
- Task B4a: complete (commits 24f302f..b92f1ba, review clean)
- Task B4b: Ruling: style-fingerprint.js 의 paragraphsOf 가 serial-prose.js 와 같은 줄(plan-mandated) → serial-prose.js 에서 import 로 바꾼다 — 한 줄, 두 정의가 따로 바뀔 위험 제거 — 틀리면 문체 도우미가 연재 도우미에 기대게 됨(같은 팩 안이라 영향 적음)
- Task B4b: minor (deferred): strip-dialogue.js 와 dialogue-ratio.js 의 QUOTE_PAIRS 가 거의 같음(내용은 다름)
- Task B4b: minor (deferred): pov 비화자 인물의 같은 엔티티 이름⊂별칭 겹침 직접 테스트 없음
- Task B4b: fix round 1/5 (1 addressed, 0 open — paragraphsOf import; commits 8e134de..833a015)
- Task B4b: complete (commits b92f1ba..833a015, review clean after 1 fix round)
- Task B5: complete (commits 833a015..37a4bc2, review clean)
- Task C1: minor (deferred): 계획 C1 Step 4 의 `npx eslint scripts test/fixtures` 는 ESLint 9 에서 exit 2(fixtures 전부 ignore) — 계획 문구 오류, 코드 문제 아님
- Task C1: complete (commits 37a4bc2..8085838, review clean)
- Task C2: Ruling: 격리 가드의 정규식이 계산된 경로·`import(/* c */ '…')` 를 못 잡음(plan-mandated) — 그대로 둔다. 사용자 결정 4번이 "import 경로(정적 from, 동적 import())만 본다"로 범위를 정함; 가드는 실수로 생긴 결합을 막는 용도이고 의도적 우회는 리뷰가 막음; AST 파서는 의존성 금지, 비문자열 import() 전면 금지는 기존 테스트 오탐 위험 — 틀리면 누군가 계산된 경로로 vibelore 를 테스트에 끌어와도 가드가 통과함
- Task C2: minor (deferred): parity-verdicts 거부 비교가 refusals 있을 때 크기 비교 안 함(추가 거부 못 잡음)
- Task C2: complete (commits 8085838..aa697fb, review clean — 1 Important 판정으로 유지)
- Ruling: D1 Step 8(쇼케이스 3화를 새 엔진으로 써서 나란히 비교)은 구현 subagent 가 하지 않고 사용자 수동 확인으로 남긴다 — 사용자 결정 D10 "수동 확인, 커밋 안 함", 모델로 3화를 쓰는 일은 테스트 실행 범위 밖 — 틀리면 M5 완료 기준 중 쇼케이스 비교가 미완으로 남음(최종 보고에 명시)
- Ruling: D1 Step 10(정지)은 controller 가 처리 — 구현자는 커밋까지만
- Ruling: 원본 13 파일을 계획 작성 때 subagent 기록(agent-a848c7d3e11a4102f)의 생성 명령으로 복원(orig/), D1 구현자가 그대로 복사하고 계획서 work.yaml 블록 뒤에 같은 블록을 넣는다 — 계획 재생 검증 때 쓴 바로 그 파일이라 875 재생 결과와 일치 — 틀리면 fixture 가 재생본과 달라 완료 기준 의미가 바뀜(기록 명령 그대로라 위험 낮음)
- 쇼케이스 3화 나란히 비교(D1 Step 8): 사용자 수동 확인으로 남음.

## 최종 브랜치 리뷰 (a50beb5..f714f44, 가장 강한 모델)

- 결과: 수정 후 병합 가능. `npm run check` 879/879, lint·tsc 깨끗. 잠금·계층 순수성·핫스팟(scope.js 하나)·의존성 확인.
- 병합 전 고친 것
  - 커밋 두 개의 trailer 가 `Claude Haiku 4.5` 였다 → `Claude Opus 5.5` 로 다시 썼다(로컬 기록, 원격 없음). 그 뒤 SHA 가 바뀌어 이 문서와 계획 "진행" 줄의 SHA 를 새 값으로 고쳤다.
  - `test/run/scope.test.js` 'extracted events…' 를 `withoutPromiseScope` 로 돌려 fromEvents 경로 판별력을 되살렸다.
  - `skill/folio/references/novel.md`: 검사 설정은 아직 작품별로 못 정함, style-drift 기준 노드 한계를 적었다.
  - `test/support/parity.js` caseContext 주석: 판정 비교 ctx 는 priorEvents 를 범위로 거르지 않는다.
- 후속 태스크(이번 범위 밖)
  - 약속 상태 기계 통일: `closed→advanced→resolved` 에서 foldPromise·promiseMovement·promise-flow 가 다르게 읽는다. `core/promise.js` 에 `stepPromise` 하나를 두고 flow·movement 가 같이 쓴다. foldPromise(잠금) 변경은 과거 재검사를 바꾸므로 따로 판정.
  - work.yaml 에서 알려진 검사의 `config`(분량 목표, youth, genre, level, when)를 받는 설계(코어 check-set).
  - 팩 digest 가 도우미·사전을 보지 않는 한계를 가드 테스트로 묶기.
- 사용자에게 알릴 것
  - 쇼케이스 3화 나란히 비교(D1 Step 8)는 미완, 수동 확인으로 남음.
  - 처음 커밋하는 노드를 승인 대기 중 작가가 직접 고치면 실행 원고로 덮인다(main 에 원래 있던 동작, 코어 레인 판단).
  - `/path/to/vibelore` 작업 트리에 다른 세션의 쇼케이스 변경이 있다(이 브랜치와 무관).
