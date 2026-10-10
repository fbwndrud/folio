### Spec Compliance

- ✅ Spec compliant. BASE `1ce53af` → HEAD `b205553`의 Task 4 요구를 충족한다. 필수 변경 파일(package.json, scripts/check-package.js, CI, README, connect, writing-guide, testing)과 신규 production 예제·시험·문서·build helper에 모두 대응 변경이 있다. 명시 build→tarball→독립 설치는 `package.json:22`, `scripts/build-package.js:9`, `scripts/check-package.js:22`; 공개 MCP→HTTP→정적/웹/EPUB 및 별도 Resource 전용 흐름은 `examples/production.js:25`, `examples/production.js:43`, `examples/production.js:66`; cleanup은 `examples/production.js:98`에서 확인했다.
- ✅ 새 설치 검증은 준비된 화면과 CLI bin/shim, 개발 의존성 부재, 설치 hook·weights 제외를 검사하며 기존 예제와 stdout JSON 계약을 보존한다(`scripts/check-package.js:23`, `scripts/check-package.js:36`, `scripts/check-package.js:54`, `scripts/build-package.js:9`). 설치본의 실제 MCP output schema 검증, runtime-unavailable, HTTP 내용·정적 snapshot 및 CLI 실행을 검사한다(`examples/production.js:25`, `examples/production.js:71`, `examples/production.js:92`, `examples/production-verify.js:36`).
- ✅ 이미지 판본은 snapshot summary가 실제 참조한 asset record로 고정되고, managed contentHash와 legacy metadata+bytes revision을 검사한다. 선언 파일의 오류를 정상 export로 숨기던 catch를 제거했으며 이미지 Buffer를 전부 미리 보유하는 구현을 추가하지 않았다(`core/view/node-view.js:21`, `core/view/snapshot-assets.js:13`, `core/view/snapshot-assets.js:30`, `server/view/export.js:52`).
- ✅ 기존 export를 먼저 삭제하지 않고 lock·target/marker identity 확인·backup·복구로 보호한다. 점유된 복구 대상은 덮지 않고 backup 경로를 반환한다(`server/view/export-target.js:17`, `server/view/export-target.js:35`, `server/view/export-target.js:43`). 비협력 프로세스의 portable rename 경쟁 한계는 허용된 로컬 cooperative 범위로 명시되어 있다(`docs/production.md:57`).
- ✅ SDK minimum ^1.32.1/lock 1.32.1, source-map-js lock 1.2.2, ESLint 10 및 recommended 유지, 제한적인 초기값 정리가 요구 범위에 맞는다(`package.json:46`, `viewer/package-lock.json:986`, `core/checks/run-checks.js:93`, `core/export/web.js:6`, `core/run/work-lock.js:26`, `docs/production.md:63`).
- ⚠️ Cannot verify from diff: 원격 CI matrix 실제 성공, 모든 지원 OS/Node 조합, 전원 손실·네트워크 파일시스템, 실제 전자책 리더 렌더링과 실제 모델/작가 품질은 이 diff와 로컬 증거로 확인할 수 없다. 구현은 이 범위를 통과했다고 주장하지 않는다(`docs/production.md:13`, `docs/production.md:57`, `docs/testing.md:76`). controller는 원격 CI 실행 시 별도 결과를 기록하면 된다.
- ⚠️ Cannot verify from diff: 모든 전역 잠금 불변식과 원본/Vibelore checkout 보존은 이번 diff만으로 전체 재인증할 수 없다. 변경된 core에 모델·네트워크 호출이나 잠금 완화는 없고, 합성 임시 작업만 생성한다(`examples/production.js:16`, `core/view/snapshot-assets.js:1`). 원본 checkout은 본 리뷰에서 접근·수정하지 않았다.

### Strengths

- `test/server/view-export-safety.test.js:19`: 공개 export seam에서 snapshot 이후 실제 same-ID put을 주입하고 이전 approved 표시와 이전 blue bytes가 함께 남는지 확인한다. 현재 자산은 미승인 red로 바뀌었다는 사실도 함께 검증해 피상적인 반환값 검사를 피했다.
- `test/server/view-export-safety.test.js:38`, `test/server/view-export-safety.test.js:50`, `test/server/view-export-safety.test.js:62`, `test/server/view-export-safety.test.js:92`: 손상·누락·legacy 변경·rename 실패·동시 export·점유된 복구 경로를 실제 파일 결과로 검사한다. 이전 사본과 새 author 파일을 동시에 보존하는 assertion이 특히 유효하다.
- `core/view/snapshot-assets.js:5`, `core/view/snapshot-assets.js:25`: private WeakMap은 HTTP/JSON에 로컬 경로를 추가하지 않으면서 판본 근거를 보존한다. 같은 ID의 혼합 revision과 provenance 소실을 실패로 처리한다. sequential generator는 추가적인 전체 이미지 Buffer 보유를 피한다.
- `examples/production-verify.js:8`: 실제 EPUB bytes의 ZIP 항목·CRC·길이·mimetype·본문·목차·합성 이미지를 확인한다. 외부 EPUB 인증/리더 검증과 구별하는 문서도 정확하다(`docs/production.md:13`).
- `scripts/build-package.js:9`: build 진단은 stderr에 유지하고 verification stdout은 JSON으로 보존한다. 기존 소비자 회귀를 숨기지 않고 수정했다. `docs/testing.md:63`에 첫 실패와 수정 후 전체 검증을 구별해 기록했다.
- `server/view/export-target.js:11`, `core/view/snapshot-assets.js:12`, `examples/production-verify.js:7`: export 대상 관리, snapshot 이미지 증거, 산출물 검증의 책임을 나눴다. 신규/변경 핵심 JS의 실제 줄 수를 확인했으며 모두 300줄 미만이다(신규 최대 116줄).

### Issues

#### Critical (Must Fix)

- 없음.

#### Important (Should Fix)

- 없음.

#### Minor (Nice to Have)

- M1 — `docs/testing.md:73`, `scripts/build-package.js:10`: 실제 최종 package build에 Graph chunk 1,613.44 kB(gzip 501.80 kB), 기본 500 kB 경고가 남아 있다. 설치 실패나 이번 변경으로 새로 생긴 correctness 결함은 아니며 Task 1의 기존 M2 후속 항목이다. 그래프 첫 진입의 다운로드·파싱·레이아웃 비용을 측정한 뒤 분할 여부를 결정해야 한다. 경고를 숨기거나 상한을 올리지 않은 현재 판정은 타당하다.

### Assessment

**Task quality:** Approved

**Reasoning:** 새 설치의 실제 실행 경로와 export 데이터 보존 요구를 충족한다. 핵심 실패 경로를 직접 주입하는 회귀 시험과 최종 설치/전체 검사 증거가 있으며, 미검증 범위와 기존 build 경고를 명확히 구분한다.

- 검토 방법: 제공된 review package를 처음부터 끝까지 연속 구간으로 한 번씩 나눠 읽었다. git diff 재생성·변경 source 재독·광범위 탐색·하위 agent·suite 재실행은 하지 않았다.
- 범위 밖 집중 확인 R1(WeakMap provenance가 실제 snapshot에 유지되는지, hash/경로 보호와 byte-retention이 유효한지): `core/view/snapshot.js:30`, `core/view/snapshot.js:63`, `core/view/entity-view.js:78`, `core/view/asset-file.js:31`, `core/store/assets.js:90`, `core/assets/records.js:62`, `core/store/work.js:32` 확인. summary를 clone하지 않고 전달하며 managed record는 Buffer를 보유하지 않는다. malformed catalog도 openWork에서 오류로 처리한다.
- 범위 밖 집중 확인 R2(기존 그림책 예제 재사용이 실제 public MCP 집필·검사·모의 승인인지): `examples/run.js:36`, `examples/run.js:44`, `examples/run.js:48`, `examples/run.js:55`, `examples/run.js:69` 확인. 실제 stdio 왕복과 최종 본문·ledger 상태 assertion이 있다.
- 범위 밖 집중 확인 R3(기존 export safety 회귀가 유지되는지): `test/server/view-export.test.js:30`, `test/server/view-export.test.js:46`, `test/server/view-export.test.js:68` 확인. 정상 교체·opaque SVG·raster 복사·비소유/linked target 거부가 기존 suite에 있다.
- 범위 밖 집중 확인 R4(새 recovery 오류의 backup 경로가 HTTP 경계에서 사라지는지): `server/view/http-server.js:56`, `server/view/respond.js:25` 확인. FolioError code/details를 전달하며 일반 Node 오류의 메시지·경로는 기존처럼 가린다.
- 범위 밖 집중 확인 R5(ESLint 업그레이드가 기존 기준을 낮추는지): `eslint.config.js:6`에서 upstream recommended와 기존 no-unused-vars 설정 유지 확인. 초기 4개 diagnostics와 수정 후 lint 성공 로그를 대조했다.
- 증거 확인: `/tmp/folio-task4-export-red.log` 4/4 실패, `/tmp/folio-task4-package-red.log` built screens assertion 실패, `/tmp/folio-task4-production-red.log` 신규 모듈 부재 실패를 읽었다. 최종 `/tmp/folio-production-task4-final-check.log`는 lint/typecheck와 1672/1672, fail/skip 0; `/tmp/folio-task4-final-focused.log` 20/20; `/tmp/folio-task4-viewer-test.log` 37/37이다.
- 증거 확인: `/tmp/folio-production-task4-package-final.json`은 독립 설치/개발 의존성 부재/502 files와 production required fields 및 resource-only/CLI/runtime-unavailable 성공을 담는다. `/tmp/folio-production-task4-build-final.log`는 build 성공과 위 Minor 경고를 담는다. `/tmp/folio-task4-setup.log` fresh root/viewer 설치 성공, root runtime/full·viewer runtime/full의 4개 audit JSON은 모두 total 0이다. 이전 계획의 814-test 로그는 근거로 사용하지 않았다.
