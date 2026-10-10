# 회사 문서 (brand 팩)

제품 소개서·브로셔처럼 회사가 내는 글을 쓴다. brand 팩은 둘째 팩이다 — 단계·프롬프트·프리셋은 첫 팩(knowledge)이 주고, brand 팩은 검사와 세트만 보탠다.

## 새 작품

`folio_init { root, title, packs: ['knowledge', 'sources', 'brand'], preset: 'guide' }`. 회사 문서 전용 프리셋은 없다 — 안내서(`guide`: chapter → section)로 만들고 세트를 고른다.

- `sources`는 수치 대조(`brand.figures`)에 필요하다. 추출 요청이 주장(`claims`)을 묻는 것도 `packs`에 `sources`가 있을 때뿐이다. 수치 대조를 안 쓰면 `packs: ['knowledge', 'brand']`도 된다.
- 세트 추천은 `folio_config { root, workKind: 'company' }`(브로셔는 `'brochure'`)로 본다. 세트는 작가가 고른다([checks.md](checks.md)의 첫 설정 인터뷰). `packs`에 `sources`가 없으면 `brand.figures`는 추천에 나오지 않고, `checkSets`의 그 세트에 없는 검사가 `missingChecks`로 보인다 — 그 상태로 고르면 `CONFIG_INVALID`가 된다. 수치 대조를 원하면 `packs`에 `sources`를 먼저 넣는다(위 문단).
- 회사 자료(보도자료·사실 자료)는 `folio_sources`로 넣고 맨 위 노드 앞머리 `sources`에 적는다([sources.md](sources.md)).

## 세트 (작가가 고른다)

| 세트 | 검사 | 종류 |
|---|---|---|
| `brand.voice`(브랜드 어조) | `brand.tone`(어조), `brand.banned-phrases`(과장·단정 금지 표현) | 모델, 결정론 |
| `brand.figures`(수치 대조) | `sources.claim-supported`(근거 없는 주장), `sources.numbers-match`(자료에 없는 숫자), `brand.figure-units`(자료와 다른 단위) | 결정론. `packs`에 `sources`가 없으면 `CONFIG_INVALID`(`CHECK_UNKNOWN`) |

- 모두 실험(`experimental`)이고 참고 의견(advisory)이다. 참고 의견으로 원고를 고치지 않는다.
- 작가가 원하면 `checks: { brand.banned-phrases: { severity: block } }`처럼 올린다(`hard`는 안 된다). 끄려면 `mode: off`거나 세트를 뺀다.
- `core.promise-order`·원고 hash·영수증 잠금은 세트와 상관없이 그대로다.

## 어조 — `brand.tone`

- 기준은 요청의 윗계획(`upperPlans`)과 노드 `brief`에 적힌 어조 지침이다. 맨 위 노드 계획에 한 줄로 적어 두고 계획 승인 때 작가가 확인한다. 예: `어조: 존댓말(합니다체), 짧은 문장, 감탄 없이.`
- 지침이 없으면 높임 체 섞임, 반말, 겹친 감탄만 본다.
- 답할 때 지적마다 원고 문장을 그대로 `quote`로 적는다. 원고에 없는 인용은 지적으로 세지 않는다.
- 예시 글이나 긴 규칙이 있으면 사용자 검사로 따로 만든다: `source: checks/brand-voice.md` 또는 `samples: checks/brand-samples/`([checks.md](checks.md) 2절).

## 금지 표현 — `brand.banned-phrases`

- 팩 기본 목록은 근거 없이 쓰면 과장·단정이 되는 표현이다: `최고`, `최초`, `유일`, `1위`, `100%`, `완벽`, `무조건`, `보장`, `절대`, `최저가`, `최대`, `독보적`, `압도적`, `획기적`.
- 허용 표현 안에 든 자리는 세지 않는다: `최고경영자`, `최고기술책임자`, `최고재무책임자`, `최고운영책임자`, `최대한`.
- 숫자로 시작하는 표현은 바로 앞 글자가 숫자(전각 포함)이면 세지 않는다 — `11위`는 `1위`로, `1100%`는 `100%`로 세지 않는다.
- 표현마다 한 번, 몇 번 나왔는지(`count`)와 함께 알린다.
- 작품마다 다른 금지 표현(경쟁사 이름, 쓰지 않는 제품명)은 두 가지로 넣는다.
  - 팩 목록을 바꾼다: `checks: { brand.banned-phrases: { config: { words: [...] } } }`. 목록은 통째로 바뀐다 — 기본 목록도 쓰려면 위 목록을 함께 적는다. 허용 표현은 `config.allow`다. 지금 값은 `folio_config`의 `checks[].config`에서 본다.
  - 따로 더한다: 자기 id를 가진 사용자 검사(아래 예). 초안을 `folio_config { root, checkDraft }`로 검증하고 작가 승인 뒤 work.yaml에 넣는다.
- `checks.brand.banned-phrases`에는 `mode`, `severity`, `config`만 적는다. 그 밖의 필드(`words` 등)를 바로 적으면 `CONFIG_INVALID`(`CHECK_FIELD_UNKNOWN`)로 거부된다. 설정 키는 팩 설정에 있는 `words`·`allow`뿐이다(`CHECK_CONFIG_KEY_UNKNOWN`).

```yaml
checks:
  brand-words: { words: [경쟁사A, 구형 모델명], severity: advisory, experimental: true }
  brand-exclaim: { pattern: '!{2,}', severity: advisory, experimental: true }
```

## 수치 대조 — `brand.figures`

- 추출 요청의 `evidence.wanted`가 true면 숫자가 든 문장을 `claims`로 내고, 그 숫자를 받치는 자료 인용을 잇는다([sources.md](sources.md)의 "주장 잇기").
- 숫자 읽기: 아라비아 숫자만(전각 포함). ㎡·²·① 같은 기호는 숫자가 아니다. `1,000`은 1000, `2026.09.30`은 2026·9·30, `1.50`은 1.5다. 한글 숫자(삼십억)는 읽지 않는다.
- `brand.figure-units`는 숫자 바로 뒤(빈칸 하나까지)의 단위를 읽는다(%, %p, 조·억·만·천, 원·달러, 배, 명·곳·개·건, 위, 년·개월·월·일, 시간·분·초). 자료에 같은 숫자가 다른 단위로만 있을 때 알린다(`figures: [{ number, unit, sourceUnits }]`). 자료 쪽에 단위 없는 같은 숫자가 있으면 알리지 않는다.
- 한계: 단위는 숫자 바로 뒤 하나만 본다(`30억 원`은 `억`). 한글 숫자와 단위 환산(3천만 = 30,000,000)은 보지 않는다. 단위는 숫자 바로 뒤(빈칸 하나까지)를 그대로 읽으므로 평범한 낱말이 단위로 잘못 읽힐 수 있다 — 예: `버전 3 개발`은 3개로, `3분기`는 3분으로 읽는다. 이런 경우는 참고 의견으로 헛지적이 될 수 있으니 지적 내용을 보고 판단한다. 모델 검사 `sources.claims-found`(세트 `sources.review`)가 표시 안 된 주장을 보완한다.
