# 로컬 출시 후보 판정 기록

2026-10-09, 최종 판정은 **개인용 로컬 MCP+viewer 출시 후보 수용**이다.
종합 독립 리뷰의 Important 두 건을 보완하고 scoped 재리뷰와 최종 controller 실행을
통과했다. 알려진 성능 Minor와 미검증 환경은 아래에 그대로 공개한다.
공개 상용 안정성·원격 게시 완료를 뜻하지 않는다.

## 관문 상태

| 관문 | 상태 | 근거와 범위 |
|---|---|---|
| root lint·타입·전체 회귀 | 완료 | 최종 code5fc61bc, Node24.19.0, 1713/1713, 실패·skip0 |
| 새 규모·경계 회귀 | 완료 | 집중14/14, 실제32MiB pin/합성 worker·overflow·profile·HTTP·export |
| viewer 시험·빌드 | 완료 | 37/37, build 성공. Graph chunk 경고 유지 |
| 원고·추적·자산 예제 | 완료 | 실제 stdio와 고정 합성 답변, 출력 정리 |
| production stdio→HTTP→export | 완료 | 합성 그림책·Resource-only·웹/EPUB·정적 사본 |
| tarball 새 설치 | 완료 | 개발 의존성 없음, 설치 bin·진단·예제·production·benchmark 모듈 해석 |
| 백업 새 폴더 복원·재연결 | 완료 | writing/Resource-only 2/2, 파일·이력 보존 |
| 합성100개 실측 | 완료 | 검증된 전체 결과·근거·본문, measured milliseconds/bytes, 자체 출력 정리 |
| 실제 Google adapter smoke | 완료 | 최종 code commit의 cached text/image 연결·근거·긴 입력 거부 |
| 종합 독립 리뷰·주요 지적 보완 | 완료 | Critical0, Important2 수정·독립 scoped 재리뷰 완료; Minor2 수용 |
| 최종 소스 재검증·출시 판정 | 완료 | exact code commit의 controller 전체·설치·실측·실제 모델/UI |
| 원격 OS·Node CI | 미검증 | 설정 존재와 원격 통과는 다르다 |
| 실제 호스트 장기 집필·실작품 의미 정확도 | 미검증 | 합성 fixture·고정 응답으로 대신하지 않는다 |
| 정전·remote filesystem 복구 | 미검증 | 로컬 프로세스 중단·복원 시험 범위 밖 |

현재 알려진 blocker를 해결했다는 총괄 판정은 독립 리뷰 후에만 내린다. 자동 Wiki,
클라우드·협업·과금·모든 문서 해석·audio/video 임베딩은 이 출시 범위 밖이다.

## Task6 커밋 전 합성100개 측정 이력

`npm run benchmark:local`, `/tmp/folio-production-task6-benchmark.log`, exit0.
macOS(Darwin25.2.0)·arm64·AppleM1(8CPU)·8GiB·Node24.19.0에서 원고100개, 추적
관측100개와 선택Resource100개를 확인했다. 고정 draft53bytes·Resource 입력7490bytes다.
표의 output bytes는 각 작업이 반환한 JSON bytes이며 export 전체 파일 bytes는 별도다.

| 작업 | milliseconds | output bytes |
|---|---:|---:|
| synthetic-setup | 115557.627 | 128 |
| status | 291.760 | 395 |
| tracking-query | 43.490 | 37253 |
| metadata-refresh | 79.265 | 2298 |
| resource-query | 60.427 | 107192 |
| view-outline | 345.664 | 19589 |
| view-resource-list | 59.787 | 66172 |
| view-resource-details-100 | 5906.176 | 69883 |
| viewer-export | 44513.683 | 45 |
| web-export | 97.258 | 189 |

viewer export 전체3,148,564bytes, web50,492bytes. verified=true, outputsRetained=false.
metadata generation `sha256:bf411165446d0bd83e694ee277d25ca508cd9ff2abb863bb5bde669c99ca80f2`,
checkpoint seq100/hash `sha256:8dc74dcc4ddcde42ec68738a9beba9642bedb482aab23b975515e3c4e5a029db`,
tracking plan revision `sha256:8b573b3cf197b5be1d003e53d7d5bc96dd168c2b417a534efbb471b41ee0430c`.
package0.0.0, 출력 sourceCommit은 checkout BASE `f33381e03aaafad739bc18ba5492340972f67d56`다.
이번 측정은 Task6 변경이 적용된 commit 전 working tree에서 실행했으며 BASE만의 성능으로
해석하지 않는다. 최종 commit 상태의 재검증은 controller 관문이다.

한 로컬 실행값이고 일부 구간에 마지막 회귀 검사도 같은 컴퓨터에서 실행됐다.
setup에는 MCP 시작 이후100개 구성·고정 응답·모의 승인·commit·Resource 선택 비용이 포함된다.
전체 결과 수·근거·본문과 previewTruncated=false를 검사했으며 내부 timeout 오류나 임의
절단으로 성공시키지 않았다. viewer export44.514초는 snapshot의 전체 자료를 모은 실제
비용이며 작은 HTTP list59.787ms와 같다고 주장하지 않는다. 전용 기계·평균/백분위·장기
지연·메모리 peak·100-node Graph 렌더링·실제 모델 품질/추론 속도는 이 결과로 보증하지 않는다.
첫 측정의 검증 harness가 snapshot.body 대신 실제 segments 계약을 사용하도록 고친 뒤
전체100개를 새로 실행한 성공 결과다. 첫 실패와 자체 정리는 Task6 보고서에 남겼다.

## 새 입력·HTTP 경계

vector input의 개별8MiB·최대100개·합산32MiB는 core pin과 adapter 직접 호출의
같은 고정 정책이다. source evidence 검증은 개별 bytes를 읽는다. verified byteLength를
합산한 뒤에만 일괄 inputs buffer를 모으고, adapter는 실제 byteLength를 worker 호출
전에 검사한다. 이는 모델·decoding 전체 메모리가32MiB라는 뜻이 아니다.
processorConfig.folioInputPolicy의 maxInputBytes/maxInputs/maxBatchBytes가 profile
hash에 결속된다. 정책이 없는 이전 vector profile은 명시 reindex가 필요하다.
원고·Resource·영수증의 기존 형식은 변환하지 않는다.

HTTP는 fixed root, 정확한 Host와 token으로 API를 보호한다. Origin 검증은 POST에
적용하며 GET에 cross-origin CORS 허용을 주지 않는다. token을 아는 클라이언트가
외부 Origin을 붙인 GET은 응답할 수 있다. Resource 목록·상세는 정식 선택/승인
판본만 제공하며 후보·경로 주입은 거부한다. XSS 문자열은 text로 보존하고 escaped
snapshot JSON으로 내보낸다. 조회·export는 정본 선택·승인·영수증을 만들지 않는다.

## Graph 경고와 후속 판정

이번 viewer build는 Graph1,613.44kB(gzip501.80kB), 기본JS291.09kB다. 500kB 경고는
숨기거나 상한을 올리지 않았다. controller가 별도로 실행한
`/tmp/folio-production-controller-graph-qa.log`(exit0)의 Chrome154 작은 합성novel13nodes
측정은 cold Graph 첫 진입320px971.54ms/736px788.71ms, 실제JS1,613,441bytes,
일반 화면 최초Graph요청0, overflow·page/server error0이다. screenshot 두 장의 시각
확인도 controller 증거다. 이 문서를 작성한 implementer의 재실행으로 주장하지 않는다.

이는 현 로컬 컴퓨터와 작은 fixture의 지연 로딩 근거다. 100-node graph·저사양·SLA
근거가 아니다. 최종 독립 리뷰 M2에서 로컬 범위의 Minor로 수용했으며 경고는 유지한다.

## 이행과 롤백

표시 metadata는 명시 refresh 뒤 생성한다. 조회를 새 승인으로 해석하지 않는다.
모든 기록자를 종료한 뒤 작품 폴더 전체를 백업하고 별도 새 폴더에 복원한다.
이전 checkout의 writer를 원래 새 버전 폴더와 동시에 연결하지 않는다. rollback은
별도 복원 사본을 이전 checkout으로 읽는 방식이며 파일 손상 자동 수리가 아니다.

## Controller 최종 실행 — exact code commit

코드 commit `5fc61bc6a5ec5666253c7239bc455db8715a535b`. broad 독립 리뷰의 Important I1/I2 수정과 scoped 재리뷰 뒤
controller가 아래 명령을 새로 실행했다. 이전 작업의 성공 로그를 재사용하지 않았다.
문서/검증 기록을 남기는 후속 commit은 실행 코드를 바꾸지 않는다.

| 명령 | 실제 결과 |
|---|---|
| npm run check | lint·타입 검사, 1713/1713, fail/skip0 |
| npm --prefix viewer test | 37/37, fail/skip0 |
| viewer build | 성공, Graph 기존 크기 경고 유지 |
| examples:verify / assets:verify | 공개 stdio 합성 원고·추적·그림 검증 성공 |
| production:verify | 그림책·Resource-only·웹/EPUB·HTTP·정적 사본 성공 |
| package:verify | tarball 실제 새 설치, 개발 의존성 없음, 510개 항목, 설치 doctor·예제·production 성공 |
| benchmark:local | 원고/추적/자료 각100개, 전체 결과·근거·본문 확인, 자체 출력 삭제 |
| 실제 Google adapter | 오프라인 text/image128차원, 두 색상 검색 current·정확한 1위·근거, 긴 text 거부 |
| 실제 Chrome UI | 320/390/736px·복수 근거·stale·static·old-static·집필 화면, overflow/XSS/errors0·static API0 |

기본 흐름에서 Python/모델이 없어도 집필·화면·내보내기는 동작하고 embedding만
EMBEDDING_RUNTIME_UNAVAILABLE로 답했다. 선택 Google smoke는 별도 cached 런타임으로
실행했다. 고정 모델 revision `914f7f89142e33e77833254d9c9b90c3cef7303b`, profileDigest
`sha256:ed4eed5ae111b9c9dded46eb4d0f4568fbec13f78fd705a7332a1a295e70d33d`. 대용량/다국어 의미 정확도나 모델 품질을 이 두 색상
연결 시험으로 인증하지 않는다. 모든 작품 결정은 합성 사본의 모의 사용자 승인이다.

### 최종 commit의 규모 실측

환경: `{"node": "v24.19.0", "platform": "darwin", "osRelease": "25.2.0", "arch": "arm64", "cpu": "Apple M1", "cpuCount": 8, "totalMemoryBytes": 8589934592}`.
시간은 단일 로컬 실행이며 SLA·백분위·메모리 peak 또는 실제 모델 추론 벤치마크가 아니다.

| 작업 | milliseconds | 반환 JSON bytes |
|---|---:|---:|
| synthetic-setup | 113303.696 | 128 |
| status | 293.864 | 395 |
| tracking-query | 45.142 | 37253 |
| metadata-refresh | 67.309 | 2298 |
| resource-query | 58.635 | 107192 |
| view-outline | 352.375 | 19589 |
| view-resource-list | 60.756 | 66172 |
| view-resource-details-100 | 5906.605 | 69883 |
| viewer-export | 44279.739 | 45 |
| web-export | 71.521 | 189 |

전체 export bytes: `{"viewer": 3148564, "web": 50492}`.
세대 `sha256:07e65ccf9a8f8465bd2fea9cb22a79f74dd11d6452663acd079c7423ff1d05af`,
checkpoint `{"seq": 100, "hash": "sha256:576e7e9cdb47709bf4e1b6e04d477e2edc088a12cd5bb3507a318bf59ddf5638"}`.
목록 조회와 전체 정적 export의 대기 시간을 섞지 않는다. Graph 경고와 정적 export
대기는 독립 리뷰에서 로컬 개인용 범위의 Minor로 수용했으며 숨기지 않았다.

### 미검증과 차단

원격 OS/Node CI·실제 호스트 장기 집필·실작품 의미 품질·모든 EPUB reader·정전/remoteFS는
미검증이다. 자동 Wiki·자유 DAG/replan·audio/video embedding·클라우드 협업/과금은
이번 출시 범위 밖이다. Git remote가 없어서 push/PR 및 원격 CI는 실행하지 않았다.
모든 source/검증 기록과 준비된 tarball은 로컬로 제공한다.

원시 로컬 로그: /tmp/folio-production-final-{check,viewer-test,viewer-build,examples,assets,flow,package,benchmark,model-smoke,ui}.log.
합성 임시 작품/설치/cache는 각 helper가 종료 시 정리한다. 모델 런타임과 가중치는 패키지에
없으며 선택 runtime 자체를 삭제하지 않는다. raw log는 사용자 machine의 임시 근거이고
이 기록과 계획별 보고/리뷰는 Git에 영구 보존한다.

## 준비된 로컬 배포 파일

명시 package:build가 성공했다. 빌드 당시 문서 HEAD `ff7e5b9`, 검증된 runtime code `5fc61bc`다.
파일 `.local-output/releases/production-5fc61bc/folio-0.0.0.tgz`, 1151229bytes, 510항목.
SHA256 `df01960dcac5337436e2e34e64be400db57bfc677053690c5a663da9c855be5d`. 준비된 화면·doctor 포함, test/plans/모델가중치 제외.
타르 내부 runtime·pack·예제·화면 462파일의 bytes가 검증한 소스와 일치한다.
PR 설명 초안도 같은 ignored release 폴더의 PR.md에 준비했다. 버전은 private0.0.0이고
Git remote 미설정으로 push/PR·원격 CI·공개 게시를 수행하지 않았다.

검증 기록을 Git에 보존한 뒤 이 계획 scratch만 삭제했다. sibling 계획과 관리 작업 폴더,
원래 dirty checkout·main·이전 구현 브랜치는 보존한다.
