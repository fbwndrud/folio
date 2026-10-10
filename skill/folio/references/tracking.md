# 추적 계획·후보·과거 보충

이 파일은 추적 동작의 호스트 지침 정본이다. 사람에게 설명할 때는
[사람용 안내](../../../docs/tracking.md)의 인터뷰→개별 위임→원고 채택→미완료→보충→재검토 순서를 쓴다.
`root`는 작가가 선택·확인한 작품 폴더의 절대 경로다.

## 인터뷰와 실제 결정

1. 목적·독자·우선순위, 대상 종류, 고정 사실과 변하는 상태, 주장·관점을 묻는다.
2. 원래 답과 요약을 `interview: {summary, answers:[{question,answer}]}`로 보존한다.
3. 대상 종류와 기준, 적용 노드, 네 위임을 보여 준다. 각각 `addSubjects`, `addCriteria`,
   `addObservations`, `backfill`이며 기본 false다. “시작”을 네 true로 해석하지 않는다.
4. `get`으로 현재 계획을 읽고 `propose`한다. 작가가 실제로 승인한 제안에만 `decide`한다.
5. 이미 위임한 추가에는 현재 `grantId`로 `apply`한다. 기존 설정·고정 값·위임 변경과 고정 기준 신설은
   전체 계획 제안과 새 사용자 결정이다. source:user와 위임 아래 source:host를 구분한다.

계획은 `planId:'main'`, `purpose`, `audience`, `priorities`, `subjectKinds`, `criteria`,
`delegation`을 가진다. 기준은 `id,title,instruction,subjectKinds,valueType,behavior,appliesTo`다.
`appliesTo`는 `'all'` 또는 존재하는 노드 ID 배열이다.
`valueType`은 `text|number|boolean|entity|entity-list`, `behavior`는 `fixed|state|relation|note`다.
`fixed`만 `expectedValue`를 가진다. 다른 키와 실행 가능한 값은 허용되지 않는다.
추리의 소유 관계, 요리의 온도, 그림책 외투 색도 이 선언 형식으로 표현한다.
새 장르·대상 선언에는 제공자별 API나 새 팩 코드가 필요하지 않다.

## 공개 도구

모든 예의 `root`는 작가가 실제 선택한 위치로 바꾼다. 도구 응답의 ID/hash를 그대로 사용한다.

| op | 입력 | 결과·권한 |
|---|---|---|
| `get` | 선택 `planId:'main'` | `plan,subjects,observations,coverage,historyCount` |
| `propose` | `expectedRev`, `plan` 또는 `changes` 중 하나 | `proposalId,proposalDigest,proposal,diff` |
| `decide` | `proposalId,proposalDigest,action` | 실제 사용자 승인 `approve` 또는 `request_revision`+`feedback` |
| `apply` | `proposalId,proposalDigest,grantId` | 현재 위임으로 허용되는 추가만 host 반영 |
| `query` | 아래 조회 옵션 | `type,entries,nextCursor` |

초기 계획의 `expectedRev`는 null, 이후에는 `get`의 현재 `plan.rev`다.
`changes`는 `subjects:[]`, `criteria:[]`, 선택적 `plan`으로 제안한다.
제안을 보여 준 뒤 현재 버전이 바뀌면 다시 읽고 제안한다. 열린 집필 실행 동안 변경은 거부된다.
plan과 changes를 같이 보내거나 임의 권한·출처 필드를 입력하지 않는다.

조회 `type`은 `entities|observations|evidence|history`이고 기본은 history다.
`subjectId,criterionId,nodeId`로 필터한다. `limit` 기본50/최대200,
`cursor`는 기본 `'0'`이며 응답 `nextCursor`가 null일 때까지 같은 필터로 이어 간다.
조회 결과는 항상 하나의 `entries` 배열이다. 관찰에는 영수증 출처와 원문 근거가 있다.
근거의 `origin:'subject'`는 대상 등록 당시 증거, `origin:'observation'`은 현재 유효한 관찰이다.
이 둘을 현재 원고의 사실 증거로 혼동하지 않는다.
관리 대상은 `storage:'tracking',path:null`이다. 이름 바꾸기 파일 거래 대상으로 넘기지 않는다.

```js
// 실제 MCP 도구 입력 예. root는 작가가 고른 절대 경로다.
{root, op:'query', type:'observations', subjectId:'key', limit:50}
{root, op:'query', type:'evidence', nodeId:'scene-1'}
{root, op:'query', cursor:nextCursor, limit:50} // 기본 history
```

## needs_model 추출·검사

`payload.tracking`이 있을 때 현재 plan/catalog/observations/pendingRanges와 instructions를 읽는다.
카탈로그는 제한된 ID 목록이며 `incomplete`가 true면 전체 정의라고 가정하지 않는다.
관련 정의와 관찰은 payload에 별도로 들어온다. 불필요한 전체 기록을 복제하지 않는다.

사건 추출 답의 기존 봉투에 다음 tracking을 추가하고 문자열로 직렬화한다.

```js
{events:[], appearances:[], mentions:[], tracking:{
  planRev:payload.tracking.plan.rev,
  discoveries:{subjects:[], criteria:[]},
  observations:[], checked:['location']
}}
```

대상 후보는 `id,kind,name,aliases,body,data,evidence`다. kind는 선언한 종류여야 한다.
관찰은 `subjectId,criterionId,value,basis,evidence`, 선택 `perspectiveId,timeLabel,pathLabel`이다.
entity 값은 존재하는 대상 ID, entity-list 값은 대상 ID 배열이다.
basis는 `explicit|attributed|inferred`; attributed에는 존재하는 `perspectiveId`가 필요하다.
직접 정한 fixed 값과 explicit 관찰 충돌은 항상 거부된다. attributed/inferred는 분리한다.

근거는 `{nodeId,textHash,quote,before?,after?}`다. quote는 원문 그대로 1~500자다.
본문 hash는 요청의 값에 맞춰야 한다. 같은 quote가 둘 이상이면 앞뒤 문맥 before/after로 한 위치를 정한다.
임의 인용이나 잘못된 값 하나라도 있으면 batch 전체가 거부된다.
현재 노드에 적용되는 기준과 새 기준을 `checked`에 명시한다.
관찰0개와 checked0개는 서로 다르다. 확인하지 않은 기준은 완료로 표시하지 않는다.

검사는 후보의 가상 정의를 사용할 수 있다. 채택 전 후보는 다른 조회에서 활성 사실이 아니다.
검사 요청의 전체 후보와 관련 정의를 검토하고, 기존 답 형식의 checked/findings를 반환한다.
후보 변경 시 옛 검사·승인을 재사용하지 않는다. 정상 집필의 후보 binding과 의미 snapshot은
서로 다른 잠금이다. 호스트가 내부 hash나 영수증을 대신 만들지 않는다.
수정·포기한 후보는 버린다. 실제 원고 채택은 작가의 `folio_decide` 응답으로만 제출한다.

정상 집필에서 위임 밖 발견·관찰은 `TRACKING_DELEGATION_REQUIRED`로 추출 답이 거부되어
재추출을 요청하고, 반복 불완전 답은 차단된다. 이 가지에는 일회 메타데이터 승인 gate가 없다.
열린 실행·원고 후보·필요한 개별 권한을 작가에게 보여 준다. 위임을 true로 만들어 넣지 않는다.
작가가 원하면 실제 이유로 skip하여 실행을 끝내고, 계획·위임 변경을 제안해 실제 결정 후
새 실행을 시작한다. 이미 확정된 원고는 아래 backfill의 일회 승인을 사용할 수 있다.
열린 실행에서 계획을 바꾸면 `TRACKING_RUN_OPEN`이다.

## 미완료·보충·재검토

`folio_status.backfillPending`은 아직 현재 대상·기준으로 보충하지 못한 범위다.
`trackingStale`은 원고 검사 때 참고한 추적 근거가 달라졌다는 뜻이다.
`get.coverage`는 기준별 `complete|pending|blocked|drifted`를 보여 준다.
새 대상은 이전 노드 전체의 카탈로그 확인을 다시 요구할 수 있다.
`payload.tracking.pendingRanges`를 읽고 관찰이 없는 결과를 미확인과 구분한다.

보충은 `folio_run {root,node:'실제 확정 노드 ID',mode:'tracking-backfill'}`이다.
명시적인 확정 노드만 받는다. 원래 영수증·hash·현재 실제 본문 일치가 필요하다.
이 모드에서 본문 생성·수정·채택을 하지 않는다. `produces:'events'` 요청의
`payload.node.body` 원문을 읽고 사건과 tracking 후보를 답한다.
사건은 검사 입력용이며 새 사건·등장 위치·자료 주장을 소급 저장하는 작업이 아니다.

권한이 부족하면 `needs_user.question.kind:'tracking_metadata'`가 온다.
원문, 보충 대상·관찰, 근거, 부족한 권한과 검사 결과를 보여 주고 실제 응답을 기다린다.
`approve`는 이번 메타데이터에만, `request_revision`+feedback은 같은 원문 재추출에,
`skip`+reason은 실행 포기에 쓰인다. 장기 위임이 확대되지는 않는다.
권한이 이미 충분하면 host 출처·grant로 반영하며 사용자 결정을 만들어 넣지 않는다.
hard는 terminal flagged 또는 `canApprove:false` 질문이다. 활성화·완료되지 않는다.
advisory는 표시하고 본문을 유지한다. 허용되는 block override는 실제 작가 이유를 받는다.

이후 재검토는 `folio_run {root,node,mode:'recheck'}`다. 추적 stale을 해소할 수 있지만
과거 관찰을 보충하거나 coverage 완료를 대신하지 않는다. 두 목록을 다시 확인한다.
동일 보충 재시도는 원래 durable 결과를 복구하며 중복 활성화를 만들지 않는다.
그 성공 뒤 hard 실패가 기록되었다면 새 성공 영수증·batch를 남겨 blocked를 해소한다.
관련 known entity가 있으면 모든 유효 checked 원천 snapshot을 보수적으로 묶는다.
첫 관찰의 대상·관점·관계 값 연결을 놓치지 않도록 의미 변화 시 재검토 범위가 넓어질 수 있다.

## 재연결·오류

재연결하면 `folio_status`의 열린 실행·pending부터 이어가고 `get/query`로 실제 계획과 출처를 읽는다.
상태의 `ledger.tracking.ok:false`는 쓰기를 진행할 상태가 아니다. 내부 기록장을 수정하지 않는다.

| code | 다음 행동 |
|---|---|
| `TRACKING_REV_STALE`, `ANSWER_STALE` | 현재 계획·상태를 읽고 새 제안·요청 사용 |
| `TRACKING_RUN_OPEN` | 현재 열린 실행부터 완료 또는 실제 사용자 포기 |
| `TRACKING_DELEGATION_REQUIRED` | 부족한 개별 권한을 설명하고 사용자 결정 받기 |
| `TRACKING_INPUT_INVALID`, `TOOL_INPUT_INVALID` | 실제 스키마에 맞춰 입력 수정 |
| `TRACKING_NOT_COMMITTED` | 아직 채택되지 않은 노드 설명; 보충 시작하지 않음 |
| `TRACKING_TEXT_DRIFTED`, `RECHECK_TEXT_DRIFTED` | 원문 변경 확인, 필요하면 별도 recommit |
| `LOCK_TRACKING_PLAN_CHANGED`, `LOCK_TRACKING_CANDIDATE_INVALID` | 낡은 승인으로 반영하지 않고 오류·현재 상태 설명 |
| `LOCK_TRACKING_INTEGRITY`, `TRACKING_RECORD_INVALID` | 작업 중단, 백업·복구 안내 |

tracking false는 새 추적 작업을 끈다. 기록된 무결성·미완료·검토 필요를 지우지 않는다.
receipt 기록 뒤 재연결은 기능이 꺼져도 durable 복구가 가능하며 새 보충 승인은 불가하다.
그림 생성은 호스트가 맡고 이 규약은 ID와 검토 데이터를 다룬다. 실제 이미지 등록·승인은
[자산 흐름](assets.md)에서 수행한다. 제공자 API 구현을 이 추적 작업에 추가하지 않는다.
합성 검증은 프로토콜과 무결성만 확인한다. 실제 AI 발견 정확도나 모든 장르 의미 검증은 인증하지 않는다.
