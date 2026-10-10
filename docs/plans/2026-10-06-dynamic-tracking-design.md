# 인터뷰에서 시작하는 동적 작품 추적 — 구현 설계

상태: 구현 및 독립 최종 재검토 완료 — 2026-10-07 승인된 구현 계획의 로컬 합성 수용 A1–A20/A17b와 check 909/909 통과.
증거는 [추적 수용 검증](../tracking-verification.md)에 있다. 정본 아티팩트는 대체하지 않는다.
최종 수정의 I1·I2·I3·M1은 독립 재검토에서 모두 해결로 확인했고 커밋 후 컨트롤러의 새 전체 검사도 통과했다. 원격 CI·실제 AI 발견 정확도는 미검증이다.
작성일: 2026-10-06. Superpowers `brainstorming`의 architectural 경로로 작성했다.
저장 위치는 AGENTS.md의 `docs/plans/` 규칙을 따른다.
이 문서는 승인된 착수 계획서 아티팩트를 대체하지 않는다.

## 1. 목표와 성공 장면

작가가 만들 작품을 인터뷰하면 호스트 AI가 작품별 추적 계획을 구성한다.
AI는 그 계획으로 쓰고, 새 인물·물건·관계·개념·추적 항목을 발견하면 확장한다.
Folio는 계획·원문 근거·기록·변경·검토의 대응을 검증하고 보관한다.
장르별 프리셋은 출발점이다. 새 장르마다 새 실행 코드를 만드는 방식으로 제한하지 않는다.

완료 사례: 합성 추리 원고의 첫 장면에 나온 열쇠를 둘째 장면에서 중요한 물건으로 발견한다.
AI가 열쇠와 소유자 추적을 제안한다. 작가가 처음 위임한 범위 안에서 새 항목을 추가한다.
첫 장면의 원고를 바꾸지 않고 소유자 기록을 보충한다. 다음 장면 요청에는 그 근거와 이력이 전달된다.
등장인물의 주장과 실제 서술을 구분하며, 선택되지 않은 초안의 열쇠는 확정 기록에 남지 않는다.

## 2. 유지할 규칙과 범위

- `core/`와 팩은 모델·네트워크를 호출하지 않는다. 모든 판단·생성은 호스트가 한다.
- hash 일치, 영수증, hard 차단, 추가만 되는 기록장, 자기검토 표기, soft 비자동수정은 끌 수 없다.
- 검사 세트·새 검사의 강제 수준은 작가가 정한다. 동적 추적이 검사 선택을 대신하지 않는다.
- AI가 만든 새 모델 검사는 experimental/advisory이며 인용을 요구한다. block 상향은 작가 결정이다.
- 테스트는 합성 fixture만. 실제 작품·이미지·호스트 결과는 저장소에 커밋하지 않는다.
- 파일 하나에 책임 하나, 구현 파일 300줄 이하. 새 런타임 의존성을 추가하지 않는다.
- `/path/to/vibelore`는 읽기 전용이다. 기존 미커밋 변경을 보존한다.
- 실제 사용자 승인과 위임 아래 호스트가 한 행동의 출처를 구분한다. 사용자 결정을 만들어 넣지 않는다.

이번 범위: 인터뷰 결과의 기록, 선언형 추적 계획, 새 대상/항목 후보, 원고 확정과 연결된 반영,
근거가 있는 관찰 기록, 이전 원고 기록 보충, 영향 표시, 조회, 문서·합성 MCP 예제.
전체 작품 뷰어·관계도 화면·PDF/EPUB·제공자 연동·게임북 경로 해결기는 별도 범위다.
시간·관점·경로 표지는 기록할 수 있지만 경로별 도달 가능성이나 상태를 계산했다고 주장하지 않는다.

## 3. 현재 코드와 차이

| 위치 | 현재 동작 | 필요한 연결 |
|---|---|---|
| `skill/folio/references/checks.md` | 검사·문체 중심 인터뷰 | 목표·독자·관심 대상·추적 기준·위임 범위 인터뷰 |
| `core/work/config.js` | 프리셋 레벨·검사·기능 설정 | 추적 기능 토글만 추가, 계획 본문은 별도 정본 |
| `core/store/entities.js` | Markdown에 이미 등록된 엔티티 | 기록장 기반 관리 엔티티와 기존 파일 엔티티 병합 |
| `core/run/steps/generate.js` | 미등록 사건 대상 거부, 미등록 등장 ID 제외 | 후보 등록 후 현재 실행에서 검증·사용 |
| `core/run/payload.js` | 엔티티 body·사건·자료·자산 전달 | 추적 계획·후보·관찰·미완료 범위 전달 |
| `packs/*/prompts/extract.md` | 팩별 고정 사건 지침 | 작품별 기준을 적용하고 기존 사건/근거 규약 유지 |
| `core/run/commit.js` | 영수증→본문→사건→commit 기록 | 원고와 추적 batch가 함께 유효해지는 확정 경계 |
| `core/run/steps/recheck-step.js` | 검사 영수증 갱신 | 기존 재검사 유지, 기록 보충은 별도 실행 |
| `core/scope/stale.js` | 기존 참조·검사·자산 변화 감지 | 추적 기준·관찰 변화와 미보충 범위 구분 |
| `server/tools/definitions.js` | 엔티티 쓰기·추적 계획 도구 없음 | 추적 공통 도구 추가 |

## 4. 검토한 접근과 추천

| 접근 | 장점 | 한계 | 선택 |
|---|---|---|---|
| 선언형 추적 계획 + 검증된 기록장 + 실행 내 후보 | 작품별 확장, 근거·이력·재개를 엔진이 검증 | 실행·커밋 연결을 추가해야 함 | 추천 |
| 호스트 스킬·자유 메모만 확장 | 적은 코드 변경 | 누락·버전·위임·과거 보충 완료를 엔진이 확인할 수 없음 | 채택 안 함 |
| AI가 장르별 코드/팩을 계속 생성 | 특화 로직을 자유롭게 작성 | AI 팩 생성은 기존 범위 밖, 실행 코드 검증·호환 책임 증가 | 채택 안 함 |

추천안에서 AI는 선언형 데이터와 검토 답을 제출한다. Folio는 코드 실행 없이
형식·참조·원문 위치·버전·위임·기록 상태를 검증한다. 의미 판단의 정확성까지 인증하지 않는다.

## 5. 용어와 데이터 규약

### 5.1 TrackingPlan: 작품별 추적 계획

필드: `planId`, `version`, `rev`, `purpose`, `audience`, `priorities`, `subjectKinds`,
`criteria`, `delegation`. 인터뷰 답의 요약과 원문 답을 함께 보관하되 실행 코드나 비밀 설정은 받지 않는다.
`planId`는 작품 안에서 하나인 `main`이다. version은 적용할 때 증가하고 rev는 정규화 내용의 hash다.

각 criterion은 `id`, `title`, `instruction`, `subjectKinds`, `valueType`, `behavior`,
`appliesTo`를 갖는다. valueType은 `text`, `number`, `boolean`, `entity`, `entity-list` 중 하나다.
behavior는 `fixed`, `state`, `relation`, `note` 중 하나다. appliesTo는 전체 또는 존재하는 노드 ID 목록이다.
fixed에는 작가가 확정한 `expectedValue`가 필수다. 자동 추가는 state/relation/note만 허용한다.
호스트가 발견한 fixed 후보는 별도 사용자 제안으로 두고 승인 전 확정 설정처럼 적용하지 않는다.
임의 장르용 종류·항목 이름은 만들 수 있지만 값 형태와 근거 규약은 공통이다.
criterion ID는 안정적이다. ID 재사용으로 의미·자료형·대상 범위를 바꾸지 않는다.
변경은 새 버전·영향 목록을 만들며, 이전 계획은 남는다.
초기 계획과 승인된 변경, 확정된 batch의 추가 criterion을 같은 정규화 규약으로 접어 현재 계획을 만든다.
새 criterion과 그 대상 종류의 추가는 delegation의 새 항목 허용에 포함한다. 같은 기준의 확장은 변경이다.
추가 criterion이 있는 실행은 basePlanRev와 effectivePlanRev를 모두 보관한다. effectivePlanRev는
기준 계획에 검증된 후보를 합친 내용의 hash이며 모델 검사와 확정 후 조회에서 같은 값이어야 한다.

### 5.2 Subject: 추적 대상

기존 entity ID를 재사용한다. 새 대상은 `id`, `kind`, `name`, `aliases`, `body`, `data`와
발견 근거를 갖는다. kind와 criterion의 subjectKinds가 대응해야 한다.
이름이 같다는 이유로 같은 대상으로 병합하지 않는다. ID 충돌·별칭 중복은 호스트에 재판단을 요청한다.
새 관리 대상의 정본은 추적 기록장이다. 기존 Markdown entity는 계속 그 파일이 정본이다.
ID가 겹치면 자동 덮어쓰기·병합하지 않고 `TRACKING_ENTITY_COLLISION`으로 거부한다.
관리 대상은 `managed: true`, `path: null`로 조회한다. 파일 경로인 것처럼 가짜 경로를 반환하지 않는다.
SQLite entities.path를 nullable로 바꾸고 저장 출처를 추가한다. 기존 entity 조회의 나머지 필드는 유지한다.
기존 파일 기반 이름 바꾸기는 유지한다. 관리 대상 정의에 파일 쓰기를 시도하면
`RENAME_MANAGED_ENTITY`를 반환한다. 표시명/별칭 변경은 추적 계획 변경 경로에서 처리하며 ID는 유지한다.
본문의 일괄 이름 바꾸기까지 관리 대상에 확장하는 것은 이번 범위에 포함하지 않는다.

### 5.3 Observation: 원문에서 추출한 관찰

필드: `subjectId`, `criterionId`, `value`, `basis`, `perspectiveId`, `timeLabel`, `pathLabel`,
`evidence`. basis는 `explicit`, `attributed`, `inferred`다. attributed는 발언·믿음의 주체 perspectiveId가 필수다.
inferred/attributed를 사용자 확정 설정이나 실제 발생 사실로 자동 승격하지 않는다.
고정 설정은 plan의 fixed 항목과 연결한 사용자 확정 정보로 분리한다.
새 관찰로 기존 fixed 정보를 덮지 않는다. state/relation은 변화 관찰로 추가한다.
관찰 자체는 엔진의 의미 인증이 아니다. 새 criterion은 기존 검사 목록을 자동으로 늘리지 않으며,
호스트는 기본 원고 검토에서 그 기준과 관찰을 살핀다. 전용 검사 생성은 기존 검사 관리 흐름을 따른다.
고정 값의 구조적 대조는 공통 무결성 규칙이다. fixed 항목의 explicit 관찰 값이 expectedValue와
정규화 JSON 기준으로 다르면 `TRACKING_FIXED_VALUE_CONFLICT`로 반영을 차단한다.
문자열의 뜻·단위 변환을 엔진이 추측하지 않는다. attributed/inferred 관찰은 이 값 대조의 대상이 아니다.
이 반영 잠금은 기능 토글로 해제하지 않는다. 기존 사용자 검사에 hard를 새로 허용하는 변경도 아니다.

evidence는 `nodeId`, `textHash`, `quote`, 선택적인 `before`/`after`를 갖는다.
quote는 1~500자이며 본문에 존재해야 한다. 같은 quote가 여러 번 나오면 위치를 특정하는 문맥이 필요하다.
본문 hash와 참조 ID, valueType을 엔진이 확인한다. 사진에서 읽어 낸 사실을 본문 인용처럼 만들지 않는다.
이미지 관찰은 기존 자산 검토를 참조한다. 이미지 자체의 시각 판단은 계속 호스트 책임이다.

### 5.4 Coverage: 기록 보충 여부

`nodeId + committedHash + criterionId + criterionDigest` 단위로 `complete`, `pending`,
`blocked`, `drifted`를 계산한다. 발견된 관찰이 0개여도 해당 항목을 확인했다는 checked 목록을 기록한다.
원문 변경이나 새 기준을 적용하지 않은 구간을 ‘관찰 없음’ 또는 ‘검증 완료’로 표시하지 않는다.
활성 기준의 적용 범위에 든 커밋 노드 전체가 보충 후보이다. 이름 검색은 우선순위 힌트만 된다.
등장하지 않는다고 검색으로 추정한 노드를 완료로 처리하지 않는다. 전체 확인 후에만 전체 완료로 표시한다.

## 6. AI에 맡길 범위

초기 인터뷰에서 원고·삽화 채택과 별도로 delegation을 작가가 정한다.
추천 기본값: 새 대상·새 항목·원문 근거 관찰·기록 보충은 위임 가능, 확정 설정 수정은 작가 결정.
각 허용은 개별 불리언이다. 생략하면 false이며 스킬이 진행 지시만으로 true를 만들지 않는다.
위임은 실제 작가 결정 기록을 참조한다. 이후 호스트 행동은 `source: host`, `grantId`로 남긴다.
호스트 행동을 `source: user`로 위장하지 않는다. 위임을 철회하면 이후 자동 반영은 중지하고 기존 이력은 보존한다.

| 변경 | 위임 안에서 자동 처리 | 별도 작가 결정 |
|---|---|---|
| 새 대상·새 criterion·근거 관찰 추가 | 허용된 항목만 | 위임 밖의 추가 |
| 새 fixed 항목과 expectedValue | 불가 | 작가의 확정 정보로 결정 |
| 상태·관계의 새 관찰 | 기존 의미와 값 형태 안에서 | 확정 설정으로 승격 |
| 기존 criterion의 의미·자료형 변경, 삭제/중단 | 불가 | 변경안과 영향 범위 검토 |
| 확정 설정 변경·대상 병합·위임 확대 | 불가 | 실제 결정 필요 |
| 새 검사 추가·block 상향·원고/삽화 승인 | 추적 위임에 포함하지 않음 | 기존 작가 결정 규약 유지 |

관심 항목을 하나 더 발견할 때마다 승인을 되묻지 않도록 초기 위임을 명시적으로 받는다.
새 기준에 대한 이전 부분 보충이 남아 있어도 초고 집필은 가능하나 상태와 요청에서 미완료를 표시한다.
‘기록 정리 완료’는 해당 범위의 coverage가 모두 complete이고 미해결 hard가 없을 때만 보고한다.

## 7. 저장과 확정 경계

새 정본은 `.folio/ledger/tracking.jsonl` 하나다. 기존 openLedger와 작품 잠금을 재사용한다.
계획·위임·사용자 변경 결정은 `tracking_plan` 기록으로 적용한다.
추출 결과는 현재 run의 후보이며, 적용 전의 draftHash와 planRev에 묶는다.
새 대상/항목은 현재 실행의 가상 work에만 합쳐 모델 검토와 결정론 검사를 수행한다.
다른 원고 실행과 조회에서는 그 후보를 확정 대상으로 보지 않는다.

원고 영수증에 `trackingBatch`와 그 digest, 기준 planRev, 검사한 후보 snapshot digest를 넣는다.
검사·결정 기록의 refs에도 후보 digest를 포함해 검사 후 후보 바꿔치기를 거부한다.
기존 사건은 기존 events와 영수증 규약을 유지한다. 추적 observation을 소급 사건으로 자동 변환하지 않는다.

확정 순서: 검증된 영수증 기록 → 본문 쓰기 → 기존 사건 기록 → tracking batch 추가 → 기존 commit 기록.
tracking batch는 대응 commit이 존재할 때만 활성화된다. commit 없이 남은 준비 기록은 현재 사실로 읽지 않는다.
영수증에는 batch 전체를 보관하므로 중단 후 같은 내용으로 재개할 수 있다.
다른 batch로 같은 receiptId를 재사용하거나 commit 기록만 위조하면 잠금으로 거부한다.
원고 확정 뒤 선택 기록처럼 best-effort로 tracking 실패를 삼키지 않는다. 빠진 batch가 있으면 미완료다.
모든 단계를 멱등으로 구현하며 skip된 실행과 실패한 초안의 후보는 활성화되지 않는다.
한 번 확정된 대상 정의와 추가 criterion은 이후 원고 재작성만으로 지우지 않는다.
과거 원문이 대체되면 그 원문의 관찰만 현재 snapshot에서 제외하고 정의의 발견 이력은 남긴다.
대상 정리·criterion 중단은 별도 사용자 변경으로 기록한다.

plan 변경은 공개 도구로 실행 중 쓰지 않는다(`TRACKING_RUN_OPEN`).
집필 도중 후보는 folio_resume 답 안에서만 받으며, 일반 쓰기 도구로 잠금을 우회하지 않는다.
외부에서 원문·설정·계획이 바뀌면 기존 digest 규약대로 답을 무효화한다. draft 자체는 불필요하게 재생성하지 않는다.
기능을 꺼도 이미 확정된 추적 기록의 무결성과 영수증 대조는 해제되지 않는다.
관찰 batch가 달라도 같은 확정 원고를 재사용해 옛 snapshot을 활성화할 수 없다.
일반 재작성·recommit 뒤에는 최신 commit hash/receiptId의 batch만 활성 관찰로 읽는다.
관리 대상의 정의 rev는 저장 위치/기록장 seq가 아닌 정규화한 정의 내용으로 계산한다.
후보에서 관리 대상으로 넘어가도 같은 정의의 rev가 달라져 자기 원고를 무한 재검토시키지 않는다.

## 8. 제안하는 MCP와 호스트 흐름

새 도구는 `folio_tracking` 하나이며 내부 책임별 core 모듈을 나눈다.
모든 op는 알려진 필드만 받고 `root`는 작가가 선택한 작품 위치다.

| op | 입력 | 결과/조건 |
|---|---|---|
| get | planId 선택(기본 main) | 현재 계획·위임·버전·coverage 요약 |
| propose | expectedRev, plan 또는 changes | proposalId·proposalDigest·변경 diff·영향 구간. 아직 적용 안 함 |
| decide | proposalId, proposalDigest, action approve/request_revision, feedback? | 작가 결정 기록. 오래된 제안 거부 |
| apply | proposalId, proposalDigest, grantId | 위임 안의 추가만. source host로 기록, 의미 변경·확정 설정 변경 거부 |
| query | subjectId?/criterionId?/nodeId?, cursor?, limit? | 대상·관찰·근거·이력. limit 기본 50, 최대 200 |

제안은 별도 run과 다른 `.folio/tracking-proposals/` 재개 파일에 저장한다.
제안 파일은 정본이 아니며 적용 시 내용을 재검증하고 기록장 rev와 대조한다.
반영 여부는 기록장으로 확인하므로 적용 뒤 중단돼도 중복 적용하지 않는다.
최초 계획은 expectedRev가 null이며 실제 사용자 decide로 시작한다. plan 필드와 changes는 함께 받지 않는다.
decision과 apply는 동일 제안에 한 번만 가능하다. request_revision은 비어 있지 않은 feedback이 필수다.

보통 원고: 인터뷰 → 계획 제안/결정 → run → 집필 → 추출 답에 tracking → 후보 검증 → 검사 → 작가 승인 → 확정.
추출 답의 기존 events/appearances/mentions/occurrences/claims는 유지한다.
추가 tracking은 `planRev`, `discoveries: { subjects, criteria }`, `observations`, `checked`를 갖는다.
기능이 꺼져 있거나 계획이 없으면 tracking을 요구하지 않고 이전 호스트 답과 같은 흐름을 유지한다.
계획이 켜진 요청에서 tracking이나 checked가 빠지면 미실행으로 재요청하며 성공 처리하지 않는다.
등록되지 않은 ID를 그냥 허용하는 변경은 하지 않는다. discoveries로 검증된 후보만 가상 work에 들어간다.

호스트는 purpose·produces의 기존 종류를 유지하고 payload.tracking을 읽는다.
novel/knowledge 팩 프롬프트에 작품별 추적 지침을 추가한다. 사용자 규칙은 엔진 잠금보다 우선하지 않는다.
모델 요청·스냅샷 digest에 계획과 후보를 포함하며, entities에는 관리 대상의 선언형 data도 전달한다.
전체 엔티티 목록을 매번 통째로 보내지 않고 이름·ID 후보 목록과 해당 노드의 관련 정의를 구분한다.

## 9. 이전 원고 보충과 영향 전파

`folio_run { node, mode: tracking-backfill }`을 추가한다. 한 번에 커밋된 노드 하나를 처리한다.
같은 run 잠금과 needs_model/resume 흐름으로 기존 원문을 추출·검토한다.
일반 recheck는 바꾸지 않는다. backfill은 원고 생성·수정·원고 승인 단계를 실행하지 않는다.
계획에서 작가가 위임하지 않은 보충은 needs_user로 기록 반영 결정을 받고, 위임됐으면 검사 뒤 반영한다.
이 결정은 원고 승인과 구분한 추적 기록 반영 gate다. 수정 요청은 관찰 후보를 다시 추출할 뿐 본문을 고치지 않는다.
원문 hash는 시작·모델 답 접수·최종 기록 때 검사한다. 손수정은 TRACKING_TEXT_DRIFTED로 거부한다.
원문/계획/기준 변경, 잘못된 인용, 누락된 checked는 기존 영수증과 기록을 바꾸지 않는다.
미완료 모델 답의 최대 시도는 기존 MAX_ANSWER_TRIES와 같다. 실패는 blocked로 남는다.

보충 영수증은 receipts에 `tracking-backfill` 종류로 추가하고 planRev·본문 hash·batch digest·검사·refs를 남긴다.
이어서 tracking batch를 멱등 추가한다. 둘 다 일치할 때만 coverage를 complete로 계산한다.
hard 지적은 영수증에 남기되 관찰 batch를 활성화/완료 처리하지 않는다. advisory는 표시하고 본문은 그대로 둔다.
보충은 추적 observation의 새 snapshot이며 기존 events·occurrences·evidence를 덮거나 삭제하지 않는다.
현재 유효 snapshot은 해당 노드의 최신 커밋 hash와 적용 기준에 일치하는 snapshot만 읽는다.
같은 원문·기준으로 재시도할 때 같은 batch/영수증을 재사용하고 중복 관찰을 만들지 않는다.

새 criterion의 적용 구간과 새 대상의 발견 범위에 대해 backfillPending을 계산한다.
새 대상이 등장했을 가능성이 있는 이전 커밋 원고 전체를 기본 확인 대상으로 잡고 부분 완료를 표시한다.
보충 후 변경된 관찰을 참고한 이후 노드는 별도 tracking stale로 표시한다. 원고는 자동 수정하지 않는다.
일반 recheck가 최신 추적 refs로 재검토하면 그 stale은 해소되지만 미보충 coverage를 대신 완료하지 않는다.
기존 entity stale의 영수증 기준 판정은 변경하지 않고 tracking 전용 refs만 최신 재검사 기준으로 비교한다.
추적 기준·snapshot digest는 refs에 전용 kind로 넣고 backfill과 recheck의 역할을 혼동하지 않는다.
관찰 snapshot digest는 observations와 checked의 정규화 내용으로 계산한다. 새 seq/시각만으로는 바뀌지 않는다.
내용이 동일한 보충/재검토를 반복해 뒤쪽 원고가 계속 stale이 되는 것을 막는다.

## 10. 파일 책임과 구현 순서

| 단계 | 산출물/책임 | 새 파일 또는 주요 수정 |
|---|---|---|
| 1 | 계획·관찰·위임 입력 검증과 기록 재생 | `core/tracking/schema.js`, `plan.js`, `records.js`, `authority.js`, `store/work.js` |
| 2 | 계획 제안·결정·적용과 조회 MCP | `core/tracking/change.js`, `view.js`, `proposals.js`, `server/tools/tracking.js`, tools definitions/handlers |
| 3 | 관리 대상 병합과 원고 내 후보 | `core/tracking/subjects.js`, `candidates.js`, `core/store/entities.js`, index schema/rebuild, rename plan |
| 4 | 추출·검사 payload와 후보 digest | `core/tracking/extract.js`, `payload.js`, `core/run/steps/generate.js`, run payload/check/commit-guard, 두 팩 프롬프트 |
| 5 | 원고와 추적 batch의 확정·복구 | `core/tracking/commit.js`, `integrity.js`, run commit/receipt-builder, ledger receipts/decisions |
| 6 | 원문 보충 실행과 영수증 | `core/tracking/backfill.js`, `backfill-record.js`, `core/run/tracking-backfill-run.js`, runner 분기, ledger 검증 |
| 7 | coverage·영향·상태·조회 | `core/tracking/coverage.js`, `stale.js`, scope/scope 및 stale, core/status, query 조회 |
| 8 | 인터뷰·쉬운 사용법·실제 stdio 합성 예제 | `skill/folio/references/tracking.md`, SKILL/checks, `docs/tracking.md`, `examples/tracking.js`, CI/새 설치 검사 |

기존 210줄 runner는 새 모드를 작은 별도 run 모듈로 연결한다. schema·기록 재생이 커지면 책임별 분리한다.
모든 단계는 소비/생산 인터페이스가 고정된 뒤 실패 테스트→구현→통과 확인 순서로 상세 계획을 작성한다.
계획은 기반→MCP→후보→실행 통합→확정→보충→조회→사용성 순서로 진행하며 완성 전에 기능을 기본 활성화하지 않는다.
features 끝에 tracking을 추가한다. 선언값의 기본은 true지만 실제 작동은 승인된 계획이 있을 때만이다.
기존 작품에는 계획이 없으므로 기존 동작이다. 최초 계획 승인으로 켜지고 명시적 false로 추출/보충을 중지한다.
featuresDigest는 계획이 없는 작품에서 기존 projection을 유지하고, 계획이 있는 작품에서만
유효 tracking 값을 추가한다. 꺼도 정본 읽기·무결성·기존 미완료 표시는 유지한다.
계획 없음·기능 꺼짐·기존 호스트·기존 파일 엔티티 경로를 회귀 검증한다.

## 11. 수용 검증표

| ID | 합성 사례 | 통과 기준 |
|---|---|---|
| A1 | 추리·요리 안내서·그림책 인터뷰 | 같은 공통 규약으로 서로 다른 기준 생성·조회 |
| A2 | 새로운 장르/대상 종류 | 제공자나 새 JS 팩 없이 선언형 기준 등록 |
| A3 | 계획 변경·재연결 | 버전·사용자 결정·위임 출처·영향 구간 유지 |
| A4 | 위임 안/밖의 변경 | 허용된 추가만 host 적용, 확정 설정 변경·위임 확대 거부 |
| A5 | 추출 중 새 인물/물건 | 후보 ID로 검사 가능, 확정 전 다른 조회에는 없음 |
| A6 | 후보를 수정/폐기한 초안 | 후보가 현재 사실·영수증·후속 요청에 활성화되지 않음 |
| A7 | 이름/ID 충돌 | 자동 병합·덮어쓰기 없음, 오류 후 기록 불변 |
| A8 | 주장·추측·관계 변화 | basis·관점·근거 보존, 확정 사실로 승격하지 않음 |
| A9 | 엉뚱한 인용·동일 인용 두 곳·타입 오류 | 잘못된 batch 전체 거부, 위치가 모호하면 재요청 |
| A10 | 검사 후 후보/plan 바꿔치기 | 옛 답·승인 무효, 같은 본문이라도 잘못된 digest로 확정 불가 |
| A11 | 확정의 각 경계에서 프로세스 종료 | 재개 후 정확히 한 번 활성화, 반쪽 기록이 현재 사실로 노출 안 됨 |
| A12 | 사건/추적 기록장·head 링크 및 변조 | 쓰기/조회에서 거부, 내부 기록 우회 복구 없음 |
| A13 | 동시에 같은 expectedRev 적용 | 한 건만 성공, 패자는 상태 변경 없음 |
| A14 | 첫 장면의 열쇠를 둘째 장면에서 발견 | 첫 원문 hash 유지, 보충 후 다음 요청에 소유자 근거 전달 |
| A15 | 보충 중 원문/기준 변경 및 재시도 | 완료 표시 안 됨, 옛 기록 유지, 재개 중복 없음 |
| A16 | 관찰 0개/일부 노드만 보충 | 명시적 checked와 coverage, 미확인을 완료로 표시하지 않음 |
| A17 | 보충 hard/advisory | hard는 활성화/완료 차단, advisory는 본문 비수정 |
| A17b | 사용자 fixed 값과 explicit 관찰 충돌 | 위임·기능 토글과 무관하게 반영 거부, attributed/inferred는 분리 보관 |
| A18 | 관찰 변경→이후 원고 재검토 | tracking stale 발생·해소, 미보충 coverage는 별도로 유지 |
| A19 | 기존 장편/지식 책/자료/삽화/이름 변경 | 기존 동작과 잠금 회귀 없음, tracking false에서도 기존 기록 무결성 확인 |
| A20 | 실제 stdio·새 tarball 설치 | 인터뷰 계획→후보→확정→보충→재검토→재연결을 합성 데이터로 완료 |

각 단계의 의미 있는 실패 경로를 합성 테스트로 먼저 재현한다.
전체 lint·타입 검사·테스트, 기존 원고/자산 예제, 새 추적 예제, 개발 의존성 없는 새 설치를 최종 확인한다.
원격 CI는 실행 URL로 증명한다. 로컬 통과를 OS 매트릭스 통과로 확대하지 않는다.
실제 AI가 중요 대상을 잘 발견하는지는 별도 실사용 평가다. 합성 프로토콜 통과로 발견 정확도를 보장하지 않는다.

## 12. 설계 자기검토와 다음 단계

- 인터뷰/동적 확장/과거 보충/후속 반영이 각각 구현 단계와 A1·A5·A14·A18에 연결된다.
- 범용 데이터를 허용하되 형식·근거·권한·hash 규약을 공통으로 유지한다.
- 위임을 원고 승인으로 해석하지 않고 source host/user를 분리한다.
- 현재 파일 거래 함수는 기존 파일만 지원하므로 새 대상 등록에 재사용한다고 가정하지 않는다.
- 기록장 대상·계획·관찰의 정본을 하나로 두고 Markdown 이중 정본을 만들지 않는다.
- recheck와 backfill, 원고 확정과 관찰 활성화, 관찰 없음과 미확인을 구분했다.
- managed entity의 nullable 경로·기존 이름 변경 경계·SQLite 조회 변경을 파일 책임에 포함했다.
- 기존 사건을 소급 수정하지 않는다. 새 관찰을 이용한 동적 검토와 기존 결정론 사건 검사는 구분한다.
- 구현·회귀 테스트와 stdio·새 설치를 로컬 합성 입력으로 검증했다. 수용표의 실제 테스트명과 결과는 추적 수용 증거 문서에 있다.

상세 구현은 사용자 승인된 `2026-10-07-dynamic-tracking-implementation.md`의 단계에 따라 완료했다.
컨트롤러가 독립 검토와 전체 변경 diff를 확인한다. 실제 발견 품질 평가는 별도 사용자 승인 범위다.
