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
   - `staleCarried`: 다시 찾지 못해(stale) 이미 빠져 있던 등장 위치 중 옮기지 못한 것. 이름을 바꿔도 그대로 stale이다 — 본문을 확인해 다시 낸다.
   - `committed`: 커밋된 원고가 바뀌는 노드. 적용 뒤 다시 커밋해야 한다.
   - 반환된 `files`에는 `path`·`beforeHash`만 있다(글 전체는 주지 않는다) — 무엇이 바뀌는지는 `changes`·`candidates`의 인용·문맥으로 보여 준다.
4. `changes`에서 빼고 싶은 곳이 있으면 그 `id`를 `exclude`에 넣어 계획을 다시 받는다. `include`(후보 중 고른 것)와 `exclude`(변경에서 뺄 것)는 함께 쓸 수 있다.
5. 작가가 승인하면 **같은 인자**와 `planDigest`로 `folio_occurrences { root, op: 'rename', entityId, newName, keepOldName?, include?, exclude?, planDigest }`.
   - 그 사이 작품이 바뀌었으면 `RENAME_PLAN_STALE` → 2부터 다시.
   - 중간에 실패하면 파일은 하나도 바뀌지 않는다(`TX_FAILED`). 쓰는 도중 누가 파일을 고쳤으면 아무것도 덮어쓰지 않고 `TX_CONFLICT`로 멈춘다.
   - 이름 바꾸기가 옮기지 못하고 그대로 실어 온 등장 위치(`staleCarried`)는 적용 뒤 `occurrences.stale`에 `reason: 'CARRIED'`로 나온다. 그 표면을 다시 제출할 때까지 stale이다.
6. 결과의 `recommit` 노드마다 작가에게 알리고, 원하면 `folio_run { root, node, mode: 'recommit' }`으로 다시 검사·커밋한다. 검사·승인·잠금은 보통 실행과 같다.

## 기능 켜고 끄기 (`work.yaml` `features`)

| 키 | 기본 | 뜻 |
|---|---|---|
| `occurrences` | 켬 | 등장 위치 기록. 끄면 제출·후보 찾기(`candidates`)가 거부되고 사용처는 이름 스캔만 |
| `occurrencesInExtract` | 켬 | 추출 요청이 등장 위치를 청한다 |
| `occurrenceScope` | 끔 | 기록된 등장 위치를 검사 범위에 더한다. 바꾸면 커밋된 노드가 "다시 확인 필요"(재검사로 풀림) |
| `rename` | 켬 | 이름 바꾸기 계획·적용 |
| `recommit` | 켬 | 바뀐 커밋 원고 다시 커밋 |

- `occurrencesInExtract`·`occurrenceScope`·`rename`은 `occurrences`의 자식이다.
- `occurrences`를 끄면 세 자식도 **저절로 꺼진다**. `features: { occurrences: false }` 한 줄이면 된다 — 작품은 막히지 않는다.
- 다만 `occurrences`를 끈 채 자식을 work.yaml에 **명시적으로 `true`**로 적으면 `CONFIG_INVALID`(`FEATURE_REQUIRES`)다. 자식을 지우거나 `false`로 적는다.
- 꺼진 기능을 부르면 `FEATURE_DISABLED`. 켤지는 작가가 정한다. 호스트가 작가 승인 없이 work.yaml을 고치지 않는다.
- 어떤 값도 잠금 규칙을 끄지 않는다.
- `folio_init { root, title, preset, features }`로 처음부터 기본값과 다르게 켤 수 있다. 바꾸고 싶은 키만 넘긴다.

## 오류일 때

- `RENAME_OPTIONS_INVALID`: `include`나 `exclude`가 문자열 배열이 아니다. 계획에서 받은 `id` 문자열만 넣어 다시 부른다.
- `RENAME_INCLUDE_UNKNOWN`: `include`·`exclude`에 지금 계획에 없는 `id`가 있다(`details.unknown`). 작품이 바뀌어 id가 달라졌을 수 있다 — 계획을 다시 받아 작가에게 다시 고르게 한다.
- `RENAME_OCCURRENCES_NOT_RECORDED`(`details.applied: true`): **파일은 이미 모두 새 이름으로 바뀌었다.** 등장 위치 기록만 일부 남지 못했다. 되돌리지 않는다. 작가에게 "이름은 바뀌었고, 일부 등장 위치는 다시 확인이 필요하다"고 알린다. 그 표면들은 `occurrences.stale`에 나오니 다시 제출한다. `details.recommit`의 노드는 보통처럼 다시 커밋한다. 같은 이름 바꾸기를 다시 적용하지 않는다.
- `RECOMMIT_NO_CHILDREN`: 자식이 없는 가지 노드는 다시 커밋할 수 없다. 구조를 먼저 채우도록 작가에게 알린다.
- `TX_PENDING`: 앞선 여러 파일 쓰기가 끝나지 않았다. 다음 도구 호출이 먼저 되돌리려 한다. 그래도 남으면 `folio_status`의 `TX_INTERRUPTED` 경고를 본다.
- `TX_JOURNAL_INVALID`: `.folio/tx`의 기록(journal)이 망가졌거나 안전하지 않다(예전 형식 포함). 엔진은 되돌리지 않고 모든 쓰기를 막는다. 작가가 파일을 확인한 뒤 `.folio/tx`를 손으로 지운다. 호스트가 대신 지우지 않는다.
- `TX_CONFLICT`(`details.paths`): 쓰기가 끊긴 뒤 작가가 고친 파일이 있다. 엔진은 작가의 글을 덮어쓰지 않으려고 **아무것도 되돌리지 않는다.** `details.paths`의 파일을 작가에게 보여 주고, `.folio/tx`의 백업(`journal.json`이 경로와 백업 파일을 잇는다)과 비교해 남길 글을 정하게 한 뒤, 작가가 `.folio/tx`를 손으로 지운다. 호스트가 대신 고르거나 지우지 않는다.
