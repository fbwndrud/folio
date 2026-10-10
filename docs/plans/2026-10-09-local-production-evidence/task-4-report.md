# Task 4 구현 보고서

상태: DONE. Commit: b205553 feat: verify prepared installs and preserve review export versions. BASE 1ce53af; branch codex/production-ready; 작업 경로 /path/to/folio.

요구사항: task-4-brief.md 먼저, AGENTS.md, docs/user-language.md, 계획의 Global Constraints만 읽었다. implementer template과 Task2 API 계약, Task1 Minor M1/M2, next-contract-review의 Task4 named risks를 사용했다. 하위 agent/reviewer를 만들지 않았고 controller의 독립 gate를 기다린다.

## 구현 및 사용자 경로

- package.json의 명시적인 package:build/package:verify가 viewer build를 실행한 뒤 npm pack --ignore-scripts를 수행한다. files whitelist에 viewer/dist만 포함하고 viewer 소스/개발 의존성/테스트/계획/작품/상태/모델 가중치를 배포하지 않는다. version0.0.0/private:true 유지, 설치 hook·npm 게시·GitHub 작업 없음. 선택 embedding의 worker.py/requirements는 기존처럼 포함하지만 Python을 설치하거나 요구하는 기본 흐름은 없다.
- scripts/check-package.js가 독립 임시 설치·cache에서 --omit=dev --ignore-scripts로 설치하고 folio-view bin/shim·built screens·devDependencies absence·no hooks/weights를 확인한다. 기존 네 원고/자산/추적 시나리오 뒤 실제 설치본 production.js를 실행한다. 임시 tarball·설치본·npm cache는 finally에서 정리한다.
- examples/production.js는 실제 SDK stdio client와 public folio_*만으로 합성 그림책의 run/resume/check/simulated approve를 기존 picturebook 예제와 함께 수행한다. 합성 SVG add/put/review/decide/attach 후 Resources propose/decideSource/metadata refresh/query, folio_view의 HTTP 화면·JS·목록·상세·정적 export, folio_export web/EPUB과 실제 folio-view 프로세스를 확인한다.
- 별도 empty Resource workspace는 folio_init 없이 Resource 선택→metadata→HTTP→static export를 수행하며 work.yaml이 없음을 확인한다. FOLIO_EMBEDDING_PYTHON을 빈값으로 고정한 실제 서버에서 기본 흐름이 통과하고 embedding index만 EMBEDDING_RUNTIME_UNAVAILABLE로 실패한다. success/error structuredContent를 SDK의 Ajv validator로 확인한다. 실제 모델 실행·시각 품질·작가 승인으로 주장하지 않는다.
- production-verify.js는 EPUB ZIP을 독립적으로 읽어 CRC·길이·첫 비압축 mimetype·container·spine·nav·본문·합성 이미지 bytes를 검증한다. 외부 EPUBCheck 인증이나 실제 전자책 리더 렌더링 검사는 아니다. CLI를 별도 cwd에서 실행하고 실제 화면 HTTP200을 확인한다.
- JSON 계약은 synthetic/viewerResourceVisible/epubVerified/resourceOnlyVerified/installedCliReady:true, embeddingUnavailable:EMBEDDING_RUNTIME_UNAVAILABLE, outputsRetained:false. client 종료에 실패해도 임시 base 정리가 실행되도록 finally를 중첩했다.
- source setup/설치 CLI를 README·connect·writing-guide·production·compatibility와 호스트 connection/viewer 참조에 구분했다. Resources, 실제 web/EPUB/수동layout/branching 범위, PDF 브라우저 인쇄와 자동조판·클라우드 게시 한계를 정정했다. launcher/fallback도 설치본은 준비된 tarball을 받도록 설명한다.
- CI는 viewer install/test/build를 root check보다 먼저 실행하고 production/package 검증을 연결한다. root tests 기본 concurrency2로 제한한다. 로컬 disk/RAM 부담을 줄이며 테스트를 생략하지 않는다. 원격 CI 성공으로 주장하지 않는다.

## 정적 export 판본·교체 안전성

- controller의 same-ID race를 공개 exportViewer seam의 durable regression으로 옮겼다. dist app.js를 실제 읽은 직후 같은 ID에 red SVG를 put한다. 이전 버전 approved:true snapshot은 이전 blue bytes를 복사하며 현재 자산의 approved:false와 새 bytes를 혼합하지 않는다.
- assetSummary가 읽은 asset record를 module-private WeakMap으로 연결한다. JSON/HTTP summary 모양이나 local path 공개는 바꾸지 않는다. snapshotAssetFiles는 snapshot의 노드/엔티티 summary가 참조한 catalog 판본만 순차 사용한다. 같은 ID의 서로 다른 rev가 snapshot 안에 섞이면 ASSET_SNAPSHOT_CHANGED. provenance가 유실된 known summary도 실패한다.
- managed asset은 record의 immutable output.file 및 output.contentHash에 결속한 readAssetFile 검증을 사용한다. 후속 same-ID put이 새 file을 추가해도 이전 파일만 읽는다. legacy는 당시 metaText + NUL + sha256(actual bytes)의 rev와 비교하여 inplace 변경을 거부한다. 안전한 상대 경로·symlink 거부·regular file·20MiB 상한은 기존 readAssetFile 경계를 유지한다.
- 전체 그림 bytes를 미리 메모리에 유지하지 않고 한 장씩 읽어 복사한다. SVG를 base64 snapshot에 싣는 기존 메모리 비용은 유지한다. unknown reference 또는 명시적 file:null은 화면 placeholder이고, 파일이 선언돼 있는데 손상·누락된 경우는 더 이상 hasFile:false나 FolioError catch로 완전 export처럼 숨기지 않는다.
- export-target.js는 exports/.viewer-export.lock mkdir로 concurrent Folio exports를 거부한다. 기존 target/marker의 inode를 기록하고 publish 전에 재검사한다. 임시 결과를 완성한 뒤 기존 owned target을 고유 .backup으로 rename하고 새 결과를 publish한다. target 선삭제는 없다.
- 최종 rename 실패 시 이전 사본을 복구한다. 그 사이 target이 생기거나 복구 rename이 실패하면 새 target을 덮지 않고 EXPORT_RECOVERY_REQUIRED의 backup/target을 보고한다. 이전 사본은 백업에 남는다. 강제 종료 잔여 lock/backup/tmp는 자동 탈취/삭제하지 않고 문서의 수동 확인 절차로 처리한다.
- controller와 합의한 경계: 로컬 filesystem·cooperating export lock. portable Node directory rename은 no-replace를 지원하지 않으므로 최종 lstat→rename 사이 비협력 프로세스가 빈 target을 삽입하는 극미세 race를 원자 보장하지 않는다. 별도 OS primitive를 도입하지 않았다. 네트워크 filesystem·전원 손실 미검증이며 production.md에 명시했다.

## TDD 증거

1. `node --test test/server/view-export-safety.test.js`
   RED `/tmp/folio-task4-export-red.log`: tests4/pass0/fail4. approved snapshot의 copied bytes가 blue 대신 red; 손상 이미지 Missing expected rejection; 이전 previous.txt ENOENT; concurrent export Missing expected rejection.
   GREEN `/tmp/folio-task4-export-green.log`: 안전성4 + 기존view-export6 + snapshot2 =12/12. 명령 `node --test test/server/view-export-safety.test.js test/server/view-export.test.js test/view/snapshot.test.js`.
   추가 legacy mutation/occupied recovery target의 GREEN `/tmp/folio-task4-export-final.log`:6/6. 원래 output의 previous.txt와 새 target의 author.txt를 동시에 보존함을 검사한다.
2. `npm run package:verify`
   RED `/tmp/folio-task4-package-red.log`: AssertionError `installed folio-view needs built screens` (packed files에 viewer/dist/index.html 부재).
   GREEN `/tmp/folio-task4-package-green.log`: installedFromTarball:true, developmentDependenciesAbsent:true, entryCount501, production 모든 required boolean true/outputsRetained:false, story/guide/picturebook/fairytale + asset approved v4 + tracking mystery/cookbook/picturebook 통과.
3. `node --test test/server/production-stdio.test.js`
   RED `/tmp/folio-task4-production-red.log`: ERR_MODULE_NOT_FOUND examples/production.js, tests1/pass0/fail1.
   GREEN `/tmp/folio-task4-production-green.log`: tests1/pass1/fail0, 실제 stdio/HTTP/CLI/exports/Resource-only/no runtime 확인.

## 의존성 조사·판정

- SDK minimum ^1.32.1, lock1.32.1. [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h)의 OAuth client advisory를 확인했으며 upstream은 MCP server/stdio client를 영향에서 제외한다. 현재 Folio stdio의 exploitability를 주장하지 않는다. 설치본 production에서 새 SDK의 listTools 및 호출 input/output 스키마와 실제 결과를 확인했고 전체 root stdio 회귀도 수행한다.
- viewer source-map-js lock1.2.2, vite8.3.1→postcss8.5.28→source-map-js1.2.2. [maintainer release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2). runtime과 dev/full 감사 구분.
- ESLint9.39.5 deprecation의 registry 실측 `/tmp/folio-task4-eslint9-deprecation.log`; 지원 도구 eslint10.12.0/@eslint/js10.0.1으로 변경했다. engine ^20.19.0||^22.13.0||>=24는 Folio지원범위와 양립. [official migration](https://eslint.org/docs/latest/use/migrate-to-10.0.0)와 registry 확인.
- 새 recommended(no-unassigned-vars/no-useless-assignment/preserve-caught-error)를 모두 유지했고 기존 lint 기준을 끄지 않았다. 초기 실행 `/tmp/folio-task4-eslint10.log`는 no-useless-assignment3개 + 신규 export recovery의 generic Error1개=4 diagnostics. core/checks/run-checks.js의 parsed=null, core/export/web.js의 body='', core/run/work-lock.js의 info=null만 제거했다(모두 이후 성공/catch 분기에서 정해짐). 관계없는 core 구조 변경은 없다.
- preserve-caught-error 때문에 민감한 cause를 공개하지 않는다. 신규 내부 recovery 점유 오류를 의미 있는 FolioError로 바꿨으며 기존 FolioError 마스킹을 유지했다. 최종 recommended lint는 모두 통과하지만 그 규칙이 custom FolioError의 cause/마스킹 정책을 검증한다고 주장하지 않는다. 규칙 예외/disable은 추가하지 않았다.
- `/tmp/folio-task4-deps.log`, `/tmp/folio-task4-versions.log`에 실제 변경·정확한 설치 버전 기록.

## 실행 증거

모든 명령의 Node PATH=/path/to/node/bin (v24.19.0), macOS. 실제 작품·생성 결과물은 읽거나 커밋하지 않았다. original checkout/Vibelore read-only 유지.

- `npm run setup` `/tmp/folio-task4-setup.log`: root npm ci170packages/viewer npm ci41packages, 성공. eslint deprecation 없음.
- viewer build actual: index291.09kB(gzip89.00), Graph1613.44kB(gzip501.80), CSS13.94/15.41kB. Vite500kB threshold warning 유지. Graph는 App.jsx에서 이미 lazy import; 큰 ELK/ReactFlow chunk를 최초 기본화면에서 분리한 상태다. 경고 상한을 올리거나 숨기지 않았고 parse/load/layout 성능 최적화는 측정이 필요한 후속 작업으로 둔다. 실제 build log는 setup/package-green 파일에 있다.
- `npm audit --omit=dev --json` root runtime: total0(`/tmp/folio-task4-root-runtime-audit.json`).
- `npm audit --json` root full: total0(`/tmp/folio-task4-root-full-audit.json`).
- `npm --prefix viewer audit --json` viewer full: total0(`/tmp/folio-task4-viewer-full-audit.json`).
- `npm --prefix viewer audit --omit=dev --json` viewer runtime: total0(`/tmp/folio-task4-viewer-runtime-audit.json`).
- `npm --prefix viewer test` `/tmp/folio-task4-viewer-test.log`:37/37,0fail,0skip.
- `npm run examples:verify` `/tmp/folio-task4-examples.log`: 네 원고·추적 통과.
- `npm run assets:verify` `/tmp/folio-task4-assets.log`: approved/version4/synthetic/verified,outputsRetained:false.
- `npm run production:verify` `/tmp/folio-task4-production.log`: 모든 required boolean true, runtime-unavailable,outputsRetained:false.
- 첫 전체 `npm run check` `/tmp/folio-task4-check.log`: lint/typecheck 통과, tests1671/pass1670/fail1/skip0. test/server/tracking-package.test.js는 `npm run --silent package:verify`의 stdout을 JSON.parse하는데 새 viewer build 로그가 섞여 SyntaxError(Unexpected token v)로 실패했다. 실행시간169075.717375ms.
- 수정: scripts/build-package.js로 명시 build를 공통화하고 build의 stdout/stderr를 stderr로 전달했다. 검증 결과 stdout은 JSON만 유지하고 graph warning은 계속 드러낸다. package:build/verify가 이 helper를 호출한다.
- 해당 RED는 첫 전체 log이며 GREEN은 `node --test test/server/tracking-package.test.js`, `/tmp/folio-task4-package-contract-green.log`:1/1pass. 최신 code의 새 tarball 설치와 전체 production이 내부에서 다시 통과했다.
- self-review 보완 후 `node --test test/server/view-export-safety.test.js test/server/view-export.test.js test/server/view-launcher.test.js test/server/view-guard.test.js`, `/tmp/folio-task4-final-focused.log`:20/20pass. 새 regular-file target 거부까지 포함한 export 안전성7개.
- 실제 실패를 고친 뒤 최종 `npm run check` (내부 `node --test --test-concurrency=2 "test/**/*.test.js"`), `/tmp/folio-production-task4-final-check.log`: lint/typecheck exit0, tests1672/pass1672/fail0/cancelled0/skipped0/todo0, duration168382.23825ms, exit0. 이 production plan 고유 log를 최종 근거로 사용한다.

## Self-review 및 제한

공개 seam(exportViewer/real stdio/HTTP/CLI/installed package)을 검사했다. 파일별 responsibility와 300줄 상한, core 모델/네트워크 금지, JSON escaping, opaque SVG, current-ID 재조회 제거, export target 소유권/복구, no hooks/weights와 source/installed 구분을 self-review했다. 임시 cleanup finally와 known summary의 provenance loss 거부, marker 재검사, file target의 ENOTDIR 방지를 보완했다.

Task5 doctor와 Task6 32MiB cap은 구현하지 않았다. 합성 의사결정만 사용했다. 원격 저장소가 없어 GitHub Actions 실행 URL/성공은 없다. 그래프 chunk 경고 및 비협력 filesystem race·EPUB 실제리더 미검증은 위에 명시한 제한이다.

## 변경 파일

Create: core/view/snapshot-assets.js, server/view/export-target.js, examples/production.js, examples/production-verify.js, scripts/build-package.js, test/server/production-stdio.test.js, test/server/view-export-safety.test.js, docs/production.md.
Modify: package.json, package-lock.json, viewer/package-lock.json, scripts/check-package.js, .github/workflows/ci.yml, core/view/index.js, core/view/node-view.js, server/view/export.js, server/view/launcher.js, server/view/static.js, core/checks/run-checks.js, core/export/web.js, core/run/work-lock.js, README.md, docs/connect.md, docs/writing-guide.md, docs/testing.md, docs/compatibility.md, skill/folio/references/connection.md, skill/folio/references/viewer.md.
새/변경 JS 모듈은 모두300줄 이하, lock파일은 generated dependency metadata다. build output·합성 생성물·scratch report는 커밋하지 않는다. 복사한 호스트 스킬에서도 끊어진 repo-relative link를 만들지 않도록 설치 폴더의 docs/production.md를 명시한다.

## 최종 패키지 재확인

최종 문서와 build helper까지 포함한 `npm run --silent package:verify` exit0. JSON stdout은 `/tmp/folio-production-task4-package-final.json`, 실제 build 진단·500kB 경고는 `/tmp/folio-production-task4-build-final.log`에 별도로 보존했다. entryCount502, installedFromTarball/developmentDependenciesAbsent:true, production의 네 required 필드(synthetic:true, viewerResourceVisible:true, epubVerified:true, outputsRetained:false)와 Resource-only/CLI/runtime-unavailable 확인, 네 원고·assets·tracking까지 통과했다. build 성공997ms이며 Graph 크기는 위와 같다. git diff --check exit0. 알려진 미해결 correctness blocker는 없다.
