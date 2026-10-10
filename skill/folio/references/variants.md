# 판본 (번역·개정·요약, `folio_run { variant }`)

판본은 커밋된 원본 잎 하나에서 만든 다른 글이다. 엔진은 판본을 원본과 견주고, 판본마다 따로 영수증을 남긴다. 원본 파일은 판본 커밋이 건드리지 않는다.

## 준비 (작가가 work.yaml에 적는다)

```yaml
packs: [novel, variants]          # 판본 검사를 쓰려면 둘째 팩으로 variants
checkSets: [novel.basic, variants.basic]
variants:
  - main
  - { id: en, kind: translation, lang: en }
  - { id: brief, kind: summary, lang: ko }
```

- `kind`: `translation`(번역)·`revision`(개정)·`summary`(요약). `id`는 소문자로 시작하는 영문·숫자·`-`(40자까지). `main`은 원본이다.
- 판본마다 `steps`로 판본 단계(`draft`·`variant-checks`·`variant-review`·`revise`·`approve`)의 `mode` 등을 바꿀 수 있다. 없는 단계를 적으면 `VARIANT_STEP_UNKNOWN`. `commit`은 잠겨 있다.
- 판본 글은 `variants/<id>/<노드 id>.md`에 있다. 노드를 옮기거나 묶어도 그대로다. 번역가가 먼저 둔 파일이 있으면 요청의 `current`로 실린다.
- 용어 대응표는 `variants/<id>/terms.yaml`: `terms: [{ from: 하나, to: Hana }]`. 요청의 `terms`로 실리고 `variants.terms` 검사가 본다.
- 기능 토글 `features.variants`(기본 켜짐). 끄면 `folio_run { variant }`가 `FEATURE_DISABLED`이고 `folio_status.variants`는 `null`이다. 이 상태 조회는 판본 파일을 읽지 않아 판본 글의 변화도 추정하지 않는다. 잠금은 토글과 상관없다.

## 돌리기

1. 원본 잎을 먼저 커밋한다. 판본은 원본의 마지막 커밋 원고에서 시작한다.
2. `folio_run { root, variant: 'en' }`(다음 판본 노드) 또는 `{ root, node, variant: 'en' }`. 잎만, `mode`는 `normal`만 된다.
3. 요청에 답한다. 원고 요청(`produces: draft`)의 payload에는 `variant`(id·종류·언어), `original`(원본 글), `terms`, `current`, `instructions`가 있다. `instructions`대로 **판본 본문만** 답한다. 원본에 없는 사실·숫자를 더하지 않는다.
4. 검사 요청(`variant-review`)은 원본과 판본을 함께 본다(`variants.fidelity`). 지적에 판본 원고 인용이 있으면 넣는다(이 검사는 인용을 꼭 요구하지 않는다).
5. 승인하면 판본 파일만 쓰고 그 판본의 영수증이 남는다. 영수증에는 그때 본 원본 커밋(`original`)이 적힌다.

## 상태 — `folio_status`의 `variants`

`{ <판본 id>: { committed, stale, drift, missing } }`

- `missing`: 원본은 끝났는데 이 판본 커밋이 없는 잎(읽는 순서).
- `stale`: 원본 **본문의 커밋 hash**가 달라졌거나(`reasons[].kind: original`) 용어 대응표가 바뀜(`terms`), 또는 판본 검사가 바뀜. 원본을 같은 본문으로 다시 커밋해 영수증 ID만 바뀐 경우는 오래된 판본으로 표시하지 않는다. 판본을 다시 돌린다. 엔진은 판본을 스스로 고치지 않는다.
- `drift`: 판본 파일을 손으로 고쳤거나(`HAND_EDITED`) 없어짐(`VARIANT_FILE_MISSING`), 노드가 트리에 없음(`NODE_MISSING`). 작가에게 알린다.
- 열린 판본 실행 중 파일을 손으로 바꾸면 최상위 `drift`에 `CHANGED_DURING_RUN`과 `variant`가 함께 뜬다. 커밋된 판본 파일의 손수정은 위 `variants[id].drift`에서 본다.
- 한 판본의 커밋·상태는 다른 판본이나 원본의 상태에 섞이지 않는다.

## 검사 (`variants.basic`, 실험·참고 의견)

| 검사 | 종류 | 알리는 것 |
|---|---|---|
| `variants.blocks-kept` | 결정론 | 블록 앵커·참조·각주·자료 인용이 빠지거나 더해짐(요약은 빼도 된다) |
| `variants.numbers-kept` | 결정론 | 원본 숫자가 빠지거나 원본에 없는 숫자가 더해짐(요약은 빼도 된다) |
| `variants.paragraphs` | 결정론 | 번역의 문단 수가 다름, 요약이 원본보다 짧지 않음 |
| `variants.terms` | 결정론 | 용어 대응표를 따르지 않은 곳 |
| `variants.fidelity` | 모델 | 원본 대비 누락·추가·뜻 바뀜 |

- 판본 검사는 판본 실행에서만, 원본 검사는 원본 실행에서만 돈다. 참고 의견으로 판본을 고치지 않는다.

## 오류일 때

- `VARIANT_UNKNOWN`: work.yaml `variants`에 없는 판본이다. 선언은 작가가 한다.
- `VARIANT_ORIGINAL_NOT_COMMITTED`: 원본 잎을 먼저 커밋한다. `VARIANT_ORIGINAL_DRIFTED`: 원본 파일이 커밋 원고와 다르다 — `folio_run { mode: 'recommit' }`으로 원본을 다시 커밋하거나 작가가 되돌린다.
- `VARIANT_LEAF_ONLY`: 판본은 잎 글에만 만든다. `VARIANT_MODE_UNSUPPORTED`: 판본의 재검사·다시 커밋은 없다 — `mode: normal`로 판본을 다시 돌린다.
- `VARIANT_ORIGINAL_CHANGED`(질문 `blocking`): 판본 실행 도중 원본 커밋 영수증이나 본문 hash가 바뀌었다. 같은 본문으로 다시 커밋했더라도 승인·고쳐 쓰기는 안 되고 `skip`만 된다. 그 뒤 판본을 다시 돌린다.
- `LOCK_ORIGINAL_CHANGED`(`folio_run`): 판본 영수증을 기록한 뒤 그 영수증이 가리키는 원본 커밋이 마지막 커밋과 달라졌다. 같은 본문으로 다시 커밋했더라도 작가의 이유를 받아 `folio_decide`의 `skip`으로 버리고 다시 돌린다. 원본 커밋을 다른 영수증으로 바꿔 끼우지 않는다.
- `CONFIG_INVALID`의 `VARIANTS_INVALID`·`VARIANT_UNSUPPORTED`(종류 없는 문자열 판본)·`VARIANT_ID_INVALID`·`VARIANT_DUPLICATE`·`VARIANT_KIND_INVALID`·`VARIANT_LANG_INVALID`·`VARIANT_FIELD_UNKNOWN`·`VARIANT_STEPS_INVALID`·`VARIANT_STEP_UNKNOWN`: work.yaml의 `variants`를 작가에게 고치게 한다.
- `WORK_INVALID`의 `VARIANTS_DIR_INVALID`·`VARIANT_DIR_INVALID`·`VARIANT_FILE_INVALID`·`VARIANT_TERMS_INVALID`: `variants/`나 그 안이 링크거나 용어 대응표 모양이 틀렸다. 작가에게 보통 폴더·보통 파일로 고치게 한다. 경고 `VARIANT_DIR_UNDECLARED`·`VARIANT_FILE_STRAY`·`VARIANT_NODE_MISSING`은 알리기만 한다.
