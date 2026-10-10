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

- 잠금 단계는 코어가 정한다: `commit`, 잠긴 코어 검사가 도는 stage(`facts`), 그리고 그 둘이 (팩 파이프라인의 `requires`를 거슬러) 요구하는 단계. `folio_config`에서 `locked: true`로 보인다.
- novel 팩에서는 이렇게 거슬러 올라간 것이 `extract`·`draft`다 — 이건 novel 팩 파이프라인이 `facts`가 `extract`를, `extract`가 `draft`를 요구하도록(`requires`) 짰기 때문이다. 다른 팩은 파이프라인 모양에 따라 잠기는 단계 id가 다를 수 있다.
- 잠긴 단계를 끄거나 옮기면 어느 레벨에서든 `LOCKED_STEP_OVERRIDE`. 새 단계 id로 잠긴 stage 이름(예: `facts`)이나 `levels`는 쓸 수 없다(`STEP_ID_RESERVED`).
- hard 검사가 든 단계를 끄는 것은(예: `overrides`로 그 단계 `mode: off`) 원래 작가의 선택이지만, work.yaml `options.includeAllHardChecks: true`인 작품에서는 어느 레벨에서도 거부된다(`HARD_CHECK_OVERRIDE`).
- 잠금 규칙: 커밋 원고는 검사한 원고와 같아야 하고, 영수증 없이 커밋할 수 없고, hard 충돌은 커밋을 막고, 기록장은 추가만 된다.

## 바꾼 뒤

- 열린 실행이 있으면 다음 호출에서 검사부터 다시 돈다. 떠 있던 질문에 답하면 `ANSWER_STALE` — `folio_run`을 다시 부른다.
- 이미 커밋한 노드는 그대로다. 새로 켠 검사는 `folio_status`의 `recheck`로 되채운다(검사 관리 문서 4절).
