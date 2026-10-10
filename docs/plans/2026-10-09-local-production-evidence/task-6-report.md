# Task 6 규모·경계 검증과 출시 판정 기록

작업 위치 `/path/to/folio`, BASE `f33381e`.
Task6 brief·AGENTS·설계 정본과 implementer template을 읽고 진행했다. subagent 없음.
실제 창작 결과·실작품·credentials는 사용하거나 커밋하지 않았다.
이 scratch 보고서는 커밋하지 않으며 controller의 계획 정리 관문까지 남긴다.

## 구현

- `scripts/benchmark-local.js`, `npm run benchmark:local`: 공개 stdio MCP로 합성 scene100개를
  고정 답변과 모의 승인으로 실제 commit하고 추적 관측100개·선택 Resource100개를 만든다.
  상태/추적 query/metadata refresh/Resource query/HTTP outline/list/detail100개/viewer·web
  export를 실제 측정한다. 작업별 wall milliseconds와 JSON output bytes, export 총bytes,
  환경·package/source commit·metadata generation/checkpoint·tracking plan revision을 기록한다.
  전체100개 결과, 근거·hash·본문·previewTruncated=false를 assert한다. AI 품질 점수 없음.
  성공·실패 모두 자체 임시 폴더와 MCP만 정리한다. 읽기 fixture는 source 안의 고정 합성
  `examples/tracking-host.js`이며 excluded `test/` import가 없다.
- `core/projections/vector-input-policy.js`: 고정100개·개별8MiB·합산32MiB 공통 검증.
  pin은 metadata/source evidence의 개별 bytes를 검증한 뒤 verified envelope.byteLength를
  합산하여 retained batch를 모으기 전에 거부한다. 검증 전 I/O가 없다고 주장하지 않는다.
  adapter 직접 입력은 실제 bytes.byteLength로 검증하고 임시 payload·worker 실행 전에 거부한다.
- profile의 `processorConfig.folioInputPolicy.maxInputBytes/maxInputs/maxBatchBytes`를 exact
  정책으로 강제한다. 실제 Python worker도 같은 필드를 반환한다. 정책 없는 이전
  profile은 VECTOR_PROFILE_INVALID이며 명시 index가 필요하다. 모델 revision 변경 없음.
- `test/acceptance/production-boundaries.test.js`: HTTP token/Host/POST Origin/GET no-CORS,
  candidate 숨김·path injection·XSS text·정적 export 정본 무변경,32MiB pin 성공과overflow,
  evidence의 개별5회 읽기 뒤 추가 batch읽기0, adapter worker전 거부·합성성공·legacy profile.
  POSIX 실행 fixture는 Windows에서 명시 skip하고 pin/overflow/profile은 플랫폼 공통이다.
- package 검사에 설치본 benchmark 모듈 전체 의존성 해석을 추가했다. 실제100개 측정은
  source 명령의 별도 실행이며 package 검사에서 설치본100개를 실행했다고 주장하지 않는다.
- production/testing/SECURITY·embedding 안내와 readiness를 갱신했다. HTTP의 실제 계약:
  fixed root, exact Host와token, POST만 Origin gate; GET은 Origin을거부하지 않지만
  CORS 허용도없다. 기존hash/receipt/hard/append-only/self-review/soft 비자동수정은 그대로다.

## 실행 환경·명령

모든 Node 명령은 다음 PATH로 Node24를 사용했다:
`PATH=/path/to/node/bin:$PATH`.
기존 준비된 root/viewer 의존성을 사용했다. 이 Task6에서 fresh setup/install을 실행했다고
주장하지 않는다. 시작시 가용 disk1.2GiB. user/cache/model·controller의cachedvenv 삭제 없음.
모든 log는 `/tmp/folio-production-task6-*`이며 이전 작업 log를 이번 실행으로 재사용하지 않았다.

| 명령 | 실제 출력·결과 | 로그 |
|---|---|---|
| `node --test test/acceptance/production-boundaries.test.js test/embedding/*.test.js test/acceptance/production-integration.test.js` | 초기12/12, fail/skip0,2247.8775ms, exit0 | focused.log |
| 같은 집중 명령, POSIX 분리 후 | 최종14/14, fail/skip0,2002.169291ms, exit0 | focused-final.log |
| `npm run lint` | diagnostics0,exit0 | lint.log |
| `npm run check` | lint·typecheck·1705/1705,fail/skip0,148732.821ms,exit0 | check.log |
| `npm --prefix viewer test` | 37/37,fail/skip0,1358.692458ms,exit0 | viewer-test.log |
| `npm --prefix viewer run build` | exit0,Graph1613.44kB(gzip501.80kB) 경고유지,기본JS291.09kB | viewer-build.log |
| `npm run examples:verify` | 4원고 및 mystery/cookbook/picturebook 추적,verified=true,exit0 | examples.log |
| `npm run assets:verify` | synthetic=true,verified=true,status=approved,version4,outputsRetained=false,exit0 | assets.log |
| `npm run production:verify` | synthetic/viewerResourceVisible/epubVerified/resourceOnlyVerified/installedCliReady=true,outputsRetained=false,exit0 | production.log |
| `npm run package:verify` | installedFromTarball/developmentDependenciesAbsent/benchmarkModuleVerified=true,entryCount509,doctor pureReadVerified=true,exit0 | package.log |
| `node --test test/diagnostics/restore.test.js` | writing·Resource-only 새폴더복원/두재연결2/2,4356.021375ms,exit0 | doctor-restore.log |

TDD는 이 brief의 요구가 아니어서 RED/GREEN 루프를 주장하지 않는다. 구현 후 focused,
fresh 전체, 필수 운영 명령을 실행했다. POSIX test 분리는 supported Windows에 새
fixture launch failure를 더하지 않기 위한 자체 검토 수정이며, 그래서 final focused와
새 fullcheck를 추가했다. 마지막 fullcheck 결과와 실제 benchmark는 아래 추가한다.

## 최초 benchmark 실패와 수정

`npm run benchmark:local`, `/tmp/folio-production-task6-benchmark-first.log`, exit1.
실제100개 원고·추적·Resource 생성과 조회/export 뒤 검증 스크립트가
`viewNode` snapshot에 없는 `node.body`를 검사해 undefined !=TEXT로 실패했다.
제품의 viewNode 계약은 `segments`이며 본문을 조각으로 제공한다. 모든 segments의
text를 이어 붙여 고정 TEXT와 비교하도록 수정했다. 실패 실행은 성능 근거로 삼지 않고
임시 작품은 finally에서 정리했다. 수정한 source로 전체100개를 새로 측정했다.

## 자체 검토와 남은 관문

새 책임별 모듈은 vector-input-policy14줄/benchmark112줄/boundaries128줄,
기존 수정 파일도300줄 이내다. core는 model/network 호출을 추가하지 않는다.
공통 고정 정책·verified lengths·actual adapter lengths·profile digest binding·legacy
명시 재색인·HTTP actual 계약·fixture 정리를 diff로 다시 확인했다.

POSIX 합성 worker는 실제 Google 모델 성공 증거가 아니다. cached 실제 Google adapter
smoke는 controller가 Task6 commit 뒤 실행할 관문으로 readiness에 미검증 기록했다.
종합 독립 리뷰·주요 지적 보완·최종 소스 재검증·scratch 정리는 controller 관문이며
완료라고 쓰지 않았다. 원격 OS/Node CI·실제 호스트 장기실사용·정전·remoteFS는미검증.
Graph1.61MiB lazy chunk 경고를 숨기지 않았다. controller가 별도로 제공한
Chrome154/합성novel13nodes/cold320px971.54ms/736px788.71ms,GraphJS1613441bytes,
첫일반화면Graph요청0,overflow/page/servererror0의 증거를 출처와좁은범위로기록했다.
종합리뷰 finaltriage가남아있으며100-node graph·저사양·SLA로확장해해석하지않는다.


## 성공 benchmark 실제 출력

수정 후 `npm run benchmark:local`, `/tmp/folio-production-task6-benchmark.log`, exit0.
실제 임시 benchmark 폴더가 남지 않았음도 확인했다. 출처commit은BASE이고 Task6 변경을
포함한 working tree 실행이라는 한계를 readiness에 명시했다. 일부 구간에 final fullcheck도
같은컴퓨터에서 진행되어 전용기계 실측으로 주장하지 않는다.

```json
{
  "synthetic": true,
  "verified": true,
  "outputsRetained": false,
  "environment": {
    "node": "v24.19.0",
    "platform": "darwin",
    "osRelease": "25.2.0",
    "arch": "arm64",
    "cpu": "Apple M1",
    "cpuCount": 8,
    "totalMemoryBytes": 8589934592
  },
  "version": {
    "package": "0.0.0",
    "sourceCommit": "f33381e03aaafad739bc18ba5492340972f67d56",
    "metadataGenerator": "folio-metadata-v1",
    "metadataGenerationId": "sha256:bf411165446d0bd83e694ee277d25ca508cd9ff2abb863bb5bde669c99ca80f2",
    "checkpoint": {
      "seq": 100,
      "hash": "sha256:8dc74dcc4ddcde42ec68738a9beba9642bedb482aab23b975515e3c4e5a029db"
    },
    "trackingPlanRevision": "sha256:8b573b3cf197b5be1d003e53d7d5bc96dd168c2b417a534efbb471b41ee0430c"
  },
  "scale": {
    "committedManuscripts": 100,
    "trackingObservations": 100,
    "selectedResources": 100,
    "fixedDraftBytes": 53,
    "resourceInputBytes": 7490
  },
  "operations": [
    {
      "name": "synthetic-setup",
      "milliseconds": 115557.627,
      "outputBytes": 128
    },
    {
      "name": "status",
      "milliseconds": 291.76,
      "outputBytes": 395
    },
    {
      "name": "tracking-query",
      "milliseconds": 43.49,
      "outputBytes": 37253
    },
    {
      "name": "metadata-refresh",
      "milliseconds": 79.265,
      "outputBytes": 2298
    },
    {
      "name": "resource-query",
      "milliseconds": 60.427,
      "outputBytes": 107192
    },
    {
      "name": "view-outline",
      "milliseconds": 345.664,
      "outputBytes": 19589
    },
    {
      "name": "view-resource-list",
      "milliseconds": 59.787,
      "outputBytes": 66172
    },
    {
      "name": "view-resource-details-100",
      "milliseconds": 5906.176,
      "outputBytes": 69883
    },
    {
      "name": "viewer-export",
      "milliseconds": 44513.683,
      "outputBytes": 45
    },
    {
      "name": "web-export",
      "milliseconds": 97.258,
      "outputBytes": 189
    }
  ],
  "exportBytes": {
    "viewer": 3148564,
    "web": 50492
  },
  "limits": [
    "single local run; no SLA",
    "fixed synthetic responses; no AI quality score",
    "no embedding inference benchmark",
    "not a power-loss or remote filesystem test"
  ]
}
```

이 결과의 viewer export44513.683ms를 생략하지 않았다. 작은 목록조회 성능과 정적
snapshot전체 export성능을 섞지 않는다. 내부 timeout 오류·결과 임의절단 없음,
전체100개·판본/receipt/text/hash근거·previewTruncated=false를 실제assert했다.


## 최종 fresh 검사와 commit 범위

POSIX fixture 분리 뒤 `npm run check`, `/tmp/folio-production-task6-check-final.log`:
lint·typecheck와1707/1707,fail/cancelled/skipped/todo0,duration_ms118421.055709,exit0.
`git diff --check`: exit0. 최종 source 검사와 최초1705개 검사를구분했다.

변경 파일: core/projections/{vector-input-policy.js,vectors.js,vector-profile.js},
adapters/embedding/{index.js,worker.py}, scripts/{benchmark-local.js,check-package.js},
package.json, test/acceptance/{production-boundaries.test.js,production-integration.test.js},
test/embedding/{vectors.test.js,tools.test.js}, SECURITY.md, docs/{production.md,testing.md,embeddings.md},
docs/plans/2026-10-09-production-readiness.md, skill/folio/references/embeddings.md.
자체 검토 후 미해결 correctness defect 없음. measured viewer export44.514초/100개는
종합 리뷰triage 대상으로 남겼으며 Graph chunk·controller 모델/최종 재검증도 pending이다.
최종 commit에는 위 production code/tests/docs만 포함한다. 이 scratch 보고서·합성 작품·
생성 export·모델·cache는 포함하지 않는다.

Commit: `25eb59b feat: verify local scale and fixed production boundaries`.
커밋 뒤 git status --short 출력 없음. controller gate와 scratch를 유지했다.
