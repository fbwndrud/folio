# M7b 실행 판정 기록

계획: `docs/plans/2026-10-01-m7-image-import.md` B1~B5. 기반 main `f12c66b`. M7a A1~A8은 이미 main에 있어 다시 실행하지 않는다. 사용자 진행 승인 후 격리 작업 공간에서 실행한다.

- Ruling: 계획의 `feat/m7b-import` 대신 앱 기본 접두어 `codex/m7b-import`를 쓴다. 이유: 현재 작업 환경 지침. 틀릴 때 비용: 레인 이름 검색 차이뿐이며 기능은 같다.
- Ruling: 정본 아티팩트 URL은 읽기 도구에서 접근 불가였다. 승인된 M7 설계 요약·결정 19건·로드맵을 실행 근거로 쓴다. 틀릴 때 비용: 접근할 수 없는 정본과 차이가 있을 수 있으며 새 범위를 발명하지 않는다.
- Ruling: 실제 작품을 읽지 않는 Global Constraints가 B5 수동 단계보다 우선한다. 합성 가져온 작품을 브라우저에서 확인하고 실제 작품 호환은 미검증으로 표시한다. 틀릴 때 비용: 실제 원본 형식의 추가 차이를 아직 찾지 못한다.
- Ruling: B3 가져오기 기록과 완료·재커밋·영수증 조회는 main 판본에만 적용한다. N6의 main 커밋·손수정 필터를 보존한다. 틀릴 때 비용: 판본 분리 회귀이며 집중 테스트로 막는다.
- Ruling: 이미 구현된 B5 완료 기준은 PASS 확인이다. 가짜 RED를 만들지 않는다. B1~B4 신규 구현은 계획의 RED → GREEN 증거를 남긴다. 틀릴 때 비용: 완료 기준 자체의 기존 실패 증거는 없으나 MCP 실행 결과가 근거다.
- Ruling: Claude 계획 코드를 그대로 옮긴 부분의 기여 표기는 보존하고 Codex가 수정한 부분은 실제 작성자에 맞게 기록한다. 틀릴 때 비용: 기여 표기 차이이며 구현 의미는 없다.
- Ruling: 계획이 명시한 마지막 rename의 외부 빈 폴더 생성 경합은 재검토 대상이다. 먼저 새 기능을 계획대로 구현한 뒤 B3 공격 검토에서 강한 목적지 보존 방식을 판정한다. 틀릴 때 비용: 외부 프로세스 경합에서 기존 폴더 교체 가능성. 검토 종료 전에 잔여 여부를 명시한다.

## 착수 전 인터페이스 점검

| 생산자 | 소비자 | 계약 및 현재 기반 확인 |
|---|---|---|
| B1 readVibelore | B2 mapVibelore | chapters/characters/world/arcs/receipts/pictures/warnings. receipts는 path·hash·chapter만 |
| B2 mapVibelore | B3 importVibelore | arcs.episodes·entities·pictures bytes·origin. 원본 판정 제외 |
| A3 writeAssetOnce | B3 writePlan | 배타 쓰기·이름 검증·링크 거부가 main에 있음 |
| B3 lastImports | doneNodes·receipt-view | import는 lastCommits가 세지 않음. main 필터와 공존 |
| B3 importVibelore | B4 tools | 새 root만, 원본 내부 거부, 임시 폴더 실패 정리 |
| B1 fixture/helper | B3·B4·B5 tests | 합성 원본 snapshot, 신규 target만, 기존 fixture 무변경 |
| B3 receipt/import status | B5 API/recommit acceptance | imported와 committed·receiptId를 구분하며 실영수증은 recommit 뒤만 |
| B4 tool | B5 MCP acceptance | TOOLS 끝 추가·목록 기대값 동일 커밋. 뷰어 읽기와 recommit 실영수증 |

모든 B 태스크가 같은 함수·모양을 소비한다. B3의 구형 diff는 N6가 추가한 MAIN·variantOf 필터를 지우지 않고 같은 의도를 다시 적용한다. B4의 도구 목록은 현재 12개 뒤에 추가한다. runner.js·기존 fixture·런타임 의존성은 변경하지 않는다.

## 진행

B1~B5 구현·수정·태스크별 독립 검토 완료. 최종 단일 수정 `c83b2f3`에서 Node24 lint·typecheck·전체 1279/1279, MCP를 포함한 집중 23/23 통과. 최종 범위 재검토 명세 PASS·품질 Approved. 사용자 메뉴 1 승인으로 로컬 main 병합을 마쳤다. push·PR은 하지 않았다.

Ruling: B1 I1/I2/I4/I5와 minor 두 건은 수정한다 — 안전 읽기 계약이 계획 코드보다 우선한다 — 틀릴 때 비용: 추가 검증으로 이상한 원본을 더 거부한다.
Ruling: B1 총 원본 바이트 64MiB, 열거 항목 10,000, 경고 200 상한을 추가한다. 총 바이트 초과는 IMPORT_SOURCE_TOO_LARGE로 전체 읽기를 실패시키며 일부 작품을 성공처럼 반환하지 않는다. 기존 파일별/파일수 상한은 유지한다 — Node 메모리·열거를 제한하려는 계약 — 틀릴 때 비용: 큰 작품을 통째로 가져오지 못하며 후속 별도 스트리밍 설계가 필요하다.
Ruling: B1 I3는 경로 성분별 초기 inode/장치값을 보존해 파일을 열기 전과 읽기 전에 재검증하며 불일치 파일을 버리는 실패 폐쇄 검증으로 보강한다. 적대적 별도 OS 프로세스가 성분을 바꿨다가 모든 검사 사이 복원하는 경합은 Node 경로 API의 잔여로 명시 수용한다 — openat 상대 no-follow가 없는 런타임 제약이며 native 의존성 추가는 범위 밖 — 틀릴 때 비용: 악의적인 동시 원본 교체까지 완전한 읽기 격리를 보장하지 못한다. 수정 완료는 정적 링크 차단·실제 읽기 상한·탐지한 교체 거부를 의미하고 OS 격리 보증을 주장하지 않는다.
Task B1: review Needs fixes, Important I1–I5, Minor 이름 경고·mtime.
Task B1: fix round 1/5 dispatched.

Ruling: B2은 `1.md`와 `001.md`처럼 같은 회차 번호로 정규화되는 입력을 IMPORT_CHAPTER_DUPLICATE로 거부한다. 버리지 않은 아크가 같은 번호로 겹쳐도 IMPORT_ARC_DUPLICATE로 거부한다 — Map의 마지막값 치환이나 중복 node id로 자료를 조용히 잃지 않으려는 판단 — 틀릴 때 비용: 애매한 원본 파일 이름을 작가가 정리해야 한다. 오류에 두 출처를 포함하고 원본은 바꾸지 않는다.
Ruling: B4 도구 설명의 승인된 웹툰이라는 표현은 episode.svg 파일로 고친다 — B2는 여러 웹툰 폴더를 모두 가져오고 승인 판정을 추측하지 않는 설계 — 틀릴 때 비용: 문구 차이뿐이다.

Task B1: fix round 1/5 code complete 80e9364..292c6c3. Focused 12/12; npm run check 1249/1249; scoped review pending.

Task B1: complete 1d258d4..292c6c3; spec PASS and quality Approved (B1-rereview1.md). Node24 focused12/12 and full1249/1249. I3 OS adversarial swap/restore residual accepted as explicit ruling.
Task B2: BASE 8139866; dispatch pending.

Task B2: code complete 8139866..2ba08e7. Focused5/5 and full1254/1254. Independent task review pending.

Task B2: complete 8139866..2ba08e7. Spec PASS, quality Approved (B2-review.md), focused5/5 full1254/1254.
Task B2: minor (deferred): same arc repeated chapter gets IMPORT_CHAPTER_IN_TWO_ARCS wording; chapter still kept once in correct first arc. Final review must triage.
Task B3: BASE a038a7f; implementation dispatch pending.

Task B3: code complete a038a7f..60c8c2b. Focused7/7 full1260/1260; independent strongest attack review pending. Final rename external empty-root race not yet adjudicated.

Task B3: review Needs fixes, Important I1 dotdot-prefix inside, I2 external empty-root replacement, I3 discarded canonical parent.
Ruling: B3 I1은 relative가 정확히 '..' 또는 '..'+sep일 때만 부모 이동으로 분류한다. I3은 검증한 canonical parent/target을 끝까지 유지하고 응답 root도 실제 canonical target으로 낸다 — 원본 내부 쓰기를 금지하는 설계 계약 — 틀릴 때 비용: alias를 쓴 호출의 반환 경로가 정규화된다는 차이.
Ruling: B3 I2는 완성 디렉터리 rename 대신 배타 mkdir(root) 예약 후 임시 폴더의 디렉터리를 배타 생성하고 파일을 hard link로 배타 게시한다. work.yaml은 마지막에 게시하여 완성 전에는 작품으로 열리지 않게 한다 — Node portable rename에 no-replace 옵션이 없고 기존 목적지 보존이 우선 — 틀릴 때 비용: 게시 도중 폴더 자체는 보이며 프로세스 강제 종료면 work.yaml 없는 불완전 폴더가 남을 수 있다. 수동 확인·정리 필요를 문서화한다. 함수가 잡은 실패는 생성 파일/폴더의 소유 inode를 확인해 자기 생성물만 정리하며 타인이 추가·변경한 파일은 보존하고 cleanupPending을 오류 details로 알린다. 숨김 임시 폴더에서 전체 쓰기·openWorkspace 검증은 유지한다.
Ruling: canonical 부모 자체를 적대적 별도 프로세스가 검사 사이 교체/복원하는 OS 경합은 B1과 같은 native openat 부재의 잔여로 명시한다. 단순 부모 alias 재지정은 이번 수정으로 닫아야 한다 — 격리 보증 과장을 피함 — 틀릴 때 비용: OS 수준 동시 악의적 개입은 완전히 격리하지 못한다.
Task B3: fix round 1/5 dispatched.

Ruling: 게시 성공 뒤 숨김 임시 폴더 정리만 실패하면 이미 완성된 작품을 실패·미완성으로 되돌리지 않는다. 성공 결과 warnings에 IMPORT_TEMP_CLEANUP_PENDING과 경로를 남긴다. 게시 전 실패의 정리는 기존 실패 처리로 유지한다 — 완성 작품 재호출/삭제를 피하려는 단계 구분 — 틀릴 때 비용: 자기 임시 폴더가 남아 수동 정리가 필요하다.

Task B3: fix1 code 60c8c2b..bf308d8 (b01c6f2 publication, bf308d8 title false-positive correction). Focused19/19, parity-inclusive21/21, exactHEADfull1272/1272. First full1271/1272 false-positive title corrected without weakening guard. Scoped review pending.

- B3 수정 1 재검토: 기존 I1/I2/I3 해결. 새 I4(임시 폴더 조회 오류 때 잔여 안내 누락)는 수정 2에서 처리한다. ENOENT만 부재로 보고, 소유 확인 불가 시 삭제하지 않고 잔여 경로를 알린다.

- B3 수정 2 완료 `4fcc633`: 초기 임시 폴더 소유 확인 오류는 `IMPORT_TEMP_UNVERIFIED`와 `cleanupPending/temp`, 게시 후 조회·정리 오류는 성공과 `IMPORT_TEMP_CLEANUP_PENDING`으로 안내한다. 집중 23/23, 전체 1274/1274; 독립 재검토 명세·품질 승인.

## 합성 브라우저 확인

- 실행 소스 `4fcc633`: 원본 합성 fixture hash 전후 동일. 1~4화 본문·가져옴 표시와 1화 SVG 둘을 브라우저에서 확인했다. 영수증 목록의 커밋은 —, 상세는 “커밋 기록이 없다.”이며 출처 상세 UI는 범위 밖, API의 imported로만 제공한다.
- 브라우저 콘솔 오류·경고 없음. 검사 탭·서버 종료 및 임시 작품 삭제 확인. 스크린샷은 저장소 밖에 보존했고 실제 작품·생성 결과물은 커밋하지 않았다.
- 실제 작품·Windows·원격 CI는 미검증. 빌드는 완료했으며 기존 Graph 청크 크기 경고는 남는다.

## B4 독립 검토와 B5 완료 기준

- B4 첫 검토의 중요 1건(게시 실패 뒤 대상·임시 잔여 경로 안내)과 경미 1건(필수 `from` 누락 오류 코드)은 `fd3b61a`에서 설명과 스킬 안내를 고쳤다. `B4-rereview1.md`는 명세 PASS·품질 Approved, 새 지적 없음으로 판정했다. `cleanupPending: true`일 때 반환된 `details.target`과 `details.temp`를 각각 확인한다. 필수 `from` 누락은 `TOOL_INPUT_INVALID`, 전달한 경로의 문제는 `IMPORT_FROM_INVALID`다.
- B5 인수 검사(`test/acceptance/m7b.test.js`)는 합성 원본만 MCP stdio로 가져온다. 아크 2·회차 4·엔티티 3·SVG 2, 원본 파일 hash 불변, 다음 노드 없음, 1화 글·첨부 두 개·SVG 바이트와 CSP sandbox, 커밋 전 `imported`·영수증 없음, 재커밋 뒤 실제 Folio 영수증·`committed`를 확인했다. 가짜 호스트는 검사 지적과 사건을 빈 목록으로 답하고 새 본문 초안은 요구되지 않는다. stderr는 비어 있다. Node24 집중 1/1, `npm run check` ESLint·TypeScript·전체 1277/1277 통과. 기존 기능을 확인하는 완료 기준이므로 가짜 RED는 만들지 않았다.
- 게시에는 대상 `root`를 배타 예약하고 파일을 배타 hard link로 게시한 다음 `work.yaml`을 마지막에 둔다. 함수가 잡은 게시 실패는 소유가 확인된 자기 파일만 정리하고 잔여가 있으면 `cleanupPending`·경로를 반환한다. 게시 뒤 임시 폴더 정리 실패는 완성 작품을 성공으로 유지하고 `IMPORT_TEMP_CLEANUP_PENDING`을 경고한다. 강제 종료 중에는 `work.yaml` 없는 폴더가 남을 수 있으며 수동 확인이 필요하다.
- B1 원본 읽기는 개별 파일 크기·개수 제한에 더해 총 64MiB, 열거 항목 10,000, 경고 200 상한을 둔다. 총량 초과는 `IMPORT_SOURCE_TOO_LARGE`로 전체 실패한다. 경로 성분 교체를 감지하면 읽기를 거부하지만, 적대적 별도 OS 프로세스가 검사 사이 부모·원본 경로를 교체했다가 복원하는 경합은 남는다. native `openat` 없이 완전한 OS 격리를 주장하지 않는다.
- 실제 vibelore 작품은 읽지 않았다. 합성 브라우저 확인과 MCP 인수 검사까지만 완료했다. 실제 작품 호환성, Windows, 원격 CI는 미검증이다. B2의 같은 아크 내 중복 회차 오류 문구(`IMPORT_CHAPTER_IN_TWO_ARCS`)는 동작상 첫 소유 아크 유지와 별개인 경미 잔여로 최종 검토에 넘긴다. main 병합·push·PR은 아직 하지 않는다.


## 최종 단일 수정과 완료

- 최종 전체 검토의 Important I1: 읽기 단계의 경고 200개 상한이 매핑·응답에서 풀리는 것을 작은 합성 입력으로 재현했다. 수정 전 집중 20개 중 2개가 경고 204·206개로 실패했다. `c83b2f3`의 공통 15줄 경고 모듈로 추가 시점부터 전 단계를 제한했다. 상세 199개와 집약 1개를 유지하고, 임시 폴더 정리 경로는 상세 슬롯을 양보해서라도 남긴다. 비용: 개별 경고 상세 일부가 집약돼 모두 표시되지 않는다.
- 경미 지적은 모두 수정했다. 같은 아크 중복은 `IMPORT_CHAPTER_DUPLICATE_IN_ARC`, 서로 다른 아크는 기존 `IMPORT_CHAPTER_IN_TWO_ARCS`로 구별한다. SVG 수용 검사는 현재 CSP 전체 값과 비교해 스크립트 허용 회귀를 막는다. 도구 시험의 parent·alias는 자동 정리되는 공통 임시 폴더 아래에 둔다.
- 최종 집중 23/23, ESLint·TypeScript·전체 1279/1279(실패·건너뜀 0) 통과. 한 번의 최종 수정과 한 번의 범위 재검토를 마쳤으며 명세 PASS·품질 Approved, 새 지적 없음이다. 검증한 실행 소스는 `c83b2f3`; 이후에는 이 완료 기록과 진행 문서만 갱신한다.
- Graph 큰 청크 경고는 기존 항목으로 비차단 수용한다. 실제 작품·Windows·원격 CI는 후속 검증으로 보류한다. native openat 부재의 악의적 OS 교체/복원 경합과 게시 중 강제 종료의 불완전 폴더는 기존 명시 판정의 비용을 유지한다.
- N7은 `2026-10-02-n7-branching-design.md` 설계 초안만 작성했다. 명시 진입·종료점과 경로별 사건 검사 안을 추천하며, 설계 승인 후 상세 구현 계획을 작성한다. 이번 M7b 코드 검토 승인이 N7 구현 승인이나 main 병합 승인을 뜻하지 않는다.
- 로컬 `codex/m7b-import`에 결과를 보존한다. 원래 체크아웃·기존 레인·실제 원본을 수정하지 않았고 생성 결과물은 커밋하지 않았다. 개별 구현·검토·RED/GREEN 원시 증거는 무시되는 `.superpowers/sdd/2026-10-01-m7-image-import/`에 보존한다.


## 사용자 승인 로컬 main 통합

- 사용자 메뉴 1(로컬 main 병합) 승인으로 main 전용 체크아웃에서 `f12c66b..ea1743a`를 fast-forward했다. 충돌·소스 재작성 없이 검토 승인된 실행 소스가 그대로 main에 들어갔다. 원격은 없어 pull·push·PR을 하지 않았다.
- 병합 결과 `ea1743a`에서 Node24 `npm run check`를 다시 실행했다. ESLint·TypeScript·전체 1279/1279 통과, 실패·건너뜀 0. 이후에는 완료 기록만 갱신한다. 원시 로그는 main 작업 공간의 `.superpowers/sdd/m7b-main-integration/main-check.log`에 보존한다.
- 작업 공간 정리 전에 ignored 구현·검토·RED/GREEN 원시 증거를 main 작업 공간의 `.superpowers/sdd/m7b-import-evidence/`로 보존했다. 생성 작품·그림 결과물은 커밋하지 않았다. 기존 사용자 레인과 원래 체크아웃은 유지한다.
- 메뉴 1은 M7b의 main 병합 승인이다. N7 추천 설계 승인이나 구현 착수 승인을 포함하지 않으며, N7 초안은 main에 보존한 검토 자료다. J4의 N7 통합과 이후 N8/D9는 남아 있다.

- M7b 전용 managed worktree의 복구 가능한 아카이브 완료를 앱 목록과 Git worktree 목록에서 확인했다. main에 병합된 `codex/m7b-import` 브랜치는 안전 삭제했다. main 전용 작업 공간과 기존 사용자 레인은 유지한다.
