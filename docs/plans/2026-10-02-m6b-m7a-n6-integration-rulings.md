# M6b·M7a·N6 통합 후보 — 완료와 판정

2026-10-02. `codex/j3-integration`에서 세 레인의 구현·독립 검토·통합 검증을 마친 뒤, 사용자가 로컬 main 병합(선택 1)을 승인했다. 검증 후보 `8856eba`를 공유 `main`에 fast-forward로 반영했다. 기존 `/path/to/folio`의 `feat/n3-blocks`·`0bf95e1` 및 비추적 로드맵 파일 3개는 그대로다. `/path/to/folio-integration`는 최신 `main` 작업 공간으로 유지한다.

## 로컬 main 반영 확인

- 사용자 선택 `1`은 검증 후보의 로컬 main 병합 승인이다. 원격 작업은 승인 범위가 아니며 수행하지 않았다.
- `main`은 `c8223aa`에서 `8856eba`로 fast-forward됐다. 세 레인의 완료 커밋이 모두 main의 조상임을 확인했다.
- 반영 직후 지원 Node v24.19.0에서 `npm run check`를 다시 실행해 lint·typecheck 및 **1240/1240** 통과를 확인했다. 이후 이 문서 기록만 보완하며 제품 소스는 바꾸지 않는다.
- 호스트가 관리하는 별도 작업 공간을 최신 main 체크아웃으로 계속 사용할 수 있도록 보존한다. 기존 checkout과 외부 레인 작업 공간은 정리하지 않는다. 완전히 병합된 임시 후보 브랜치는 삭제한다.
- 아래 후보 검토 기록의 “main 병합 전” 표기는 각 보고 작성 당시 상태다. 현재 반영 여부는 이 절을 따른다.

## 완료 범위와 검증

| 범위 | 완료 레인 | 후보 반영 |
| --- | --- | --- |
| M6b 뷰어·정적 내보내기 | d6403b7 | 정적 SVG 격리 및 조회/설정 보호 포함 |
| M7a 그림 A1~A8 | 81318cd | 그림 설명서·생성 응답·자기검토·승인·영수증, 경로 보호 포함 |
| N6 판본 A1~D1 | 7bdfb62 | 원본 결속·판본 격리·기능 꺼짐 복구·앞머리 보존 포함 |

통합 병합 `2ddbbf2`, 최종 실행 코드 `3a39ace`. 지원 Node v24.19.0에서 전체 lint·typecheck·테스트 **1240/1240**, 최종 조회/상태/스냅숏 집중 검사 **18/18** 통과. 변경하지 않은 뷰어 소스는 통합 병합 때 **13/13** 및 빌드 통과. 기존 Graph 청크 크기 경고는 남아 있다.

각 레인 전체 검토와 단일 최종 수정/범위 제한 재검토를 완료했다. 추가 독립 통합 검토에서 열린 판본 손수정 경고가 원본 뷰어로 새는 Important 1건을 찾아 단일 수정 파동으로 해결했다. 공유 상태의 판본 경고와 실제 원본 손수정 경고는 유지하며, 원본 전용 목차·영수증·정적 스냅숏에서만 판본 경고를 제외한다. 최종 범위 제한 재검토의 명세·품질 모두 PASS다.

실제 MCP stdio 합성 확인도 통과했다: 원본 커밋 → 합성 PNG 그림 승인 → 앵커 배치와 원본 recommit → en 판본 커밋. 원본 바이트 불변, 판본별 커밋 분리와 원본 영수증 화면의 main 이력 유지, 브라우저 PNG 로드를 확인했다. 모의 호스트/1×1 PNG fixture를 사용했으며 외부 모델 품질을 검증했다고 주장하지 않는다.

## 주요 판정과 남은 범위

- 목록은 M6b→M7a→N6 순서로 추가하고 기존 강한 순서·기본값 검사를 보존했다. image/variants 모두 공통 팩 모듈 digest 검사 대상이다.
- 선택되거나 strict 설정으로 포함된 hard 그림 검사는 현재 지원하지 않아 명시적으로 설정 오류를 낸다. 일반 참고 검토 off는 유지한다.
- 원본 결속 결정 기록이 없는 개발 중 미커밋 판본 실행은 fail-closed하여 다시 시작해야 한다. 과거 main 기록 읽기는 유지된다.
- N6 기능 off의 기록된 커밋은 안전하게 복구하며 실제 대상 앞머리 의미를 보존한다. YAML 주석·원래 직렬화 바이트 보존은 약속하지 않는다.
- M7a active crash는 승인된 skip 전용 계약이다. 모든 crash 시점의 완전 재개를 보장하지 않는다.
- 정적 링크 거부와 열린 handle 검사에도 부모 디렉터리의 악의적 동시 교체, Windows 동일 보장, 대규모 판본 성능은 미검증이다.
- M7b, 그림 판본, 판본 뷰어·내보내기는 시작하지 않았다. 정본 착수 계획서 아티팩트는 확인하지 못했으며 제공된 구현 계획과 승계 결정을 기준으로 검토했다.
- 사용자 승인 후 후보를 로컬 main에 반영했다. 원격은 없으며 push·PR은 수행하지 않았다. 후보 검증 단계와 실제 반영 단계는 위의 승인·확인 절에서 구분한다.

## 레인별 전체 판정

- [M6b 실행·판정](2026-09-30-m6-viewer-rulings.md)
- [M7a 실행·판정](2026-10-01-m7a-image-rulings.md)
- [N6 실행·판정](2026-10-01-n6-variants-rulings.md)

아래에는 후보 검증 시점의 통합 원장과 독립 검토/수정/확인 보고를 보존한다. 임시 SDD 자료는 최신 main 작업 공간에 보존한다.

## 전체 통합 원장

```text
# J3 병합 후보 검증

main 기준 c8223aa. 별도 Codex 작업 공간의 codex/j3-integration 브랜치에서 세 레인을 M6b→M7a→N6 순서로 합쳐 검증한다. main과 기존 체크아웃은 수정하지 않는다.

Ruling: 별도 로컬 후보에만 병합한다 — 공유 main 병합은 계획의 사용자 승인 단계이므로, 먼저 충돌 해결·검증으로 승인할 결과를 구체화한다 — 틀렸을 때 비용: 후보 작업 공간과 브랜치를 정리하면 되며 main에는 영향이 없다.
M6b 후보 반영: d6403b7 (fast-forward).
2026-10-01 checkpoint: M6b runtime+docs complete d6403b7. M7a A1-A8 complete389eef7; final Important3 onefix wave /root/m7_final_fix active, then scoped rereview and finaldocs. N6 B1-B5 complete84bbe59 (B5 fixreviewPASS); C1/C2/D1 remain. Single implementation agent at once perSDD. Root/viewer npmci supportedNode24 complete. Original checkout unchanged0bf95e1 with3untracked roadmap files.
M7a merging81318cd currently3feature/listconflicts. Ruling: concatenate reviewed viewerExport then images/imageReferences/imageReview; replace former trailing-key assertions with exactrelativeorder assertions, preserving strength — append-only ordering across completedlanes — cost if wrong: changed list order may affect clients; exactsuffix tests pin integration contract. /root/j3_m7_merge_impl dispatch next.
M6b+M7a merge2a72cdc parentsd6403b7/81318cd. Focused97+pack11/full1169/viewer13/build Node24. Independent resolution review next.
Ruling: append IMAGE_CHECKERS/image to common allbuiltin module digest loader traversal — new imagepack missed same actual guard asvariants source — cost if wrong: stronger coverage detects missing image module declarations; runtime unchanged.
M6b+M7a merge independentreview /root/j3_m7_merge_review specPASS/qualityPASS nofindings. Candidate2a72cdc complete, N6final merge pending.
Checkpoint2026-10-02: candidate2a72cdc M6b+M7a independentmergeReviewPASS, full1169/viewer13/build Node24. N6 C1 complete619d032, C2 draft8cf467d and /root/n6_c2_impl fixround1 active (statusonly featureofffalsealert); D1+finalreview remain. Singleimpl atonce. Candidate N6merge waits reviewed finalsource.

Checkpoint2026-10-02: N6 all tasks complete d19aeef, D1spec+qualityPASS; final wholebranch /root/n6_final_review running. Prepared task-n6-merge-brief.md; merge waits final lane gate. Candidate remains2a72cdc.
Ruling: 후보의 SDD scratch 하위에 로컬 .gitignore를 추가해 원장·브리프·검토 패키지를 커밋 대상에서 제외한다 — 임시 기록은 최종 판정 문서로 선별 보존하며 원본 체크아웃 설정은 바꾸지 않는다 — 틀렸을 때 비용: 숨겨진 scratch는 이 경로에서 직접 확인해야 한다.

N6 complete7bdfb62 runtime2fd0389; final1138+39 and independentrereviewPASS. N6merge /root/j3_n6_merge_impl dispatch BASE2a72cdc incoming7bdfb62.

N6 merge2ddbbf2 parents2a72cdc/7bdfb62. Focused81+view4/full1239/viewer13/build Node24 PASS, sourceclean. Independent finalintegration review next.
Ruling: preserve both image and variant discovery triggers/error pointers in shared SKILL frontmatter/reference list — independent image and variant requests must find their reviewed workflows after merge — cost if wrong: small alwaysloaded description expansion; runtime unchanged.
Ruling: add real main receipt-view regression after variant commit — merged reader must retain main filtering — cost if wrong: one synthetic integration test; preserves old assertions.

Combined actualMCP synthetic smoke +browser PASS2ddbbf2. Main/image/recommit/en variant separate, imgcomplete1x1, mainreceipt commitcount2 excludesen. Evidence combined-smoke-report.md +durable screenshots; ownserver/tab closed. Finalintegration reviewer /root/j3_final_review running.

Finalintegration review /root/j3_final_review complete: Critical0 Important1 Minor0. I1 variant-tagged open-run drift leaks into main-only outline/receipt/snapshot consumers. One finalintegration fix wave pending.
Ruling: main-only viewer projections filter variant drift while shared folio_status retains variant-tagged live warnings — main UI must not claim unchanged original handedited, variant viewer is excluded — cost if wrong: no variant handedit warning in main viewer; the warning remains available in folio_status.

Integration ONE final fix3a39ace completed: main projection filter only; new regression RED1fail→focused18/full1240 lint+typecheck Node24 PASS. Controller moved fixreport from strayroot to SDDworkspace, preserving contents. Command/output evidence supplement requested withoutsourcechanges orreruns before scopedreview. Own MCP closed/tabclosed/tempwork+tokencontext removed; harness retained onlyignoredscratch.

Final scoped integration rereview dispatch original /root/j3_final_review rejected with agent thread limit before running. Reused available independent nonauthor /root/n6_d1_review for the single scoped rereview, giving full findings/fix/evidence/diff files. No duplicate rereview launched. Exact evidence supplement complete; HEAD3a39ace clean, tests not rerun.

Final ONE scopedintegration rereview /root/n6_d1_review PASS I1ADDRESSED, spec+qualityPASS, nonewregressions. Runtimecandidate3a39ace finalfull1240/focused18 Node24. Viewerunchanged13/build. mainc8223aa/original0bf95e1 preserved. Completionreport docs next; await human integrationdecision. Scratch kept pendingdecision with complete rulings preserved.

```

## M6b+M7a 병합 보고

# J3 M6b + M7a 통합 후보 병합 보고

- 후보 브랜치: `codex/j3-integration`
- 병합 커밋: `2a72cdcee23cea1ec7a5ee0ec254e9d18458eb3f` (아래 공통 가드 보완을 같은 병합 커밋에 반영)
- 부모: M6b `d6403b77c9551175aa6e350808e770c085468a46`, M7a `81318cdf68757f0514c3ea39c2e0b9360b4d3c4f`
- `main` 병합·푸시와 두 원본 브랜치 수정은 하지 않았다. N6 작업도 포함하지 않았다.

## 충돌 해결

세 충돌 파일 `core/work/features.js`, `test/core/features.test.js`, `test/server/feature-toggles.test.js`를 해결했다. 기능 선언과 주석의 순서는 `links`, `linkScope`, `viewerExport`, `images`, `imageReferences`, `imageReview`다. `viewerExport → viewer`, `imageReferences/imageReview → images` 부모 관계를 모두 보존했고, `RUN_FEATURES`는 두 레인의 원래 의도대로 유지했다. 기본 기능값의 전체 목록을 검사하는 두 테스트는 어느 값도 생략하지 않았다. 종전 `viewerExport`가 마지막이라는 검사는 여섯 기능의 정확한 접미 순서로 갱신했고, M7a 검사도 `viewerExport` 바로 뒤의 그림 기능 세 개를 고정한다.

자동 병합된 `server/tools/definitions.js`, `server/tools/handlers.js`, `skill/folio/SKILL.md`에서 기존 뷰어/도구 흐름과 `folio_image` 등록·설명을 확인했다. `core/pipeline/resolve.js`, `core/store/assets.js`, `packs/index.js`의 M7a 추가 사항도 확인했다. 새 동작은 덧붙이지 않았다.

추가 통합 검토에서 `test/pack/pack-module-digest.test.js`의 첫 module graph 파일 목록에는 `image`가 있었으나, 별도 `every built-in pack loads with its module graph in the declared digest` 검사의 loader 목록에는 없었다. `IMAGE_CHECKERS`를 가져와 `image`를 해당 목록에 추가했다. M7a 개별 최종 검토에서 빠진 공통 가드를 통합 후보에서 보완한 것이며 제품 동작 변경은 없다.

## 검증

- Node 24: 기능·서버·M6/M7 수용 및 그림 관련 집중 검사 **97/97 통과**.
- 저장소 `npm run check`: lint, typecheck, 전체 테스트 **1,169/1,169 통과**.
- 공통 팩 digest·image 팩 집중 검사 **11/11 통과**. 가드 보완 뒤 저장소 전체 검사도 다시 **1,169/1,169 통과**.
- 뷰어 `npm test`: **13/13 통과**. `npm run build`: 성공.
- `git ls-files -u`: 없음. 병합 커밋 부모 둘 다 확인.

빌드는 기존 큰 번들 경고를 출력했으나 성공했다. `git diff --cached --check`는 M7a 원본의 계획 문서 두 파일에 이미 있던 끝 공백·말미 빈 줄만 보고했다. 충돌 해결 파일에는 공백 오류가 없고 원본 문서 내용은 변경하지 않았다.

보고서는 후보 작업트리의 `.superpowers`에 남겼으며 병합 커밋에는 넣지 않았다.

## M6b+M7a 병합 검토

# J3 M6b + M7a 병합 독립 검토

- 대상: `2a72cdcee23cea1ec7a5ee0ec254e9d18458eb3f` (부모 `d6403b7`, `81318cd`)
- 범위: 충돌 해결과 두 기능의 접점. 원본 브랜치의 개별 구현은 기존 검토 범위로 둠.

## 명세 판정: 통과

발견 사항 없음. `FEATURES` 접미 순서는 `links → linkScope → viewerExport → images → imageReferences → imageReview`이며, `viewerExport → viewer`, `imageReferences/imageReview → images` 부모 관계와 `RUN_FEATURES`의 기존 `linkScope` 끝값이 유지된다. 기본값 전체 객체 검사와 두 레인의 인접 순서 검사가 빠짐없이 갱신되었다. 자동 병합된 `folio_view` 설명과 정적 내보내기 안내, `folio_image` 도구 정의·핸들러·스킬 참조가 함께 남아 있다. 공통 내장 팩 module graph/digest 검사의 loader 목록에도 `image`가 추가되었다.

## 품질 판정: 통과

발견 사항 없음. 병합 전 부모와 각각 비교했을 때 충돌 해결은 기능 선언·테스트에 양쪽 내용을 보존했고, 추가 변경은 공통 digest 가드에 한정된다. 충돌 미해결 항목은 없고 검토 대상 파일의 공백 오류도 없다. 병합 커밋의 부모 둘과 현재 `feat/m6-viewer`, `feat/m7a-image`, `main` 참조가 보고서의 값과 일치한다. 기존 보고서에는 집중 검사 97/97, 전체 1,169/1,169, 뷰어 검사 13/13 및 빌드 성공이 기록되어 있다. 이번 독립 검토에서 같은 검사는 재실행하지 않았다.

## N6 병합 보고

# J3 N6 merge report

- Status: completed in `codex/j3-integration`; working tree clean. No main, source lane, remote, or other checkout changes.
- Merge commit: `2ddbbf2cb9faea25f632a7031d14aad6aeb5dc75` (`merge: integrate reviewed N6 variants into J3 candidate`), author `Codex <codex@openai.com>`.
- Parents: candidate `2a72cdcee23cea1ec7a5ee0ec254e9d18458eb3f` (M6b+M7a) and exact reviewed N6 `7bdfb62d2e329b2edf73652fd619e22805e0717c`. Incoming source range is `c8223aa2771d3687c2e841609888f8eaea9e597a..7bdfb62d2e329b2edf73652fd619e22805e0717c` (20 commits).

## Conflict resolutions

- `core/work/features.js`, `test/core/features.test.js`, `test/server/feature-toggles.test.js`: preserved every earlier exact default assertion and appended `variants` after `viewerExport, images, imageReferences, imageReview`; parent relationships stay `viewerExport → viewer` and `imageReferences/imageReview → images`. `RUN_FEATURES` remains unchanged. N4/M7a/N6 order and digest assertions remain strong.
- `packs/index.js`, `test/pack/{knowledge,novel,sources}-pack.test.js`, `test/pack/pack-module-digest.test.js`: retained image and appended variants in the built-in order. Both `IMAGE_CHECKERS` and `VARIANTS_CHECKERS` are covered by the module graph traversal and digest loader comparison.
- `skill/folio/SKILL.md`: preserved image workflow reference and viewer guidance, added variant workflow reference and error hint. The trigger description names both picture and variant requests; an image error hint points to the existing image reference.
- Added `test/view/receipt-view.test.js` regression: after a variant commits to a node, both viewer receipt views still report the original main receipt.

## Auto-merge inspection

- `core/pipeline/resolve.js` retains M7a image stage names, tier enforcement, hard check rejection and reserved stage IDs while N6 adds default and resolved variant pipelines as placement homes. `test/run/variant-pipeline.test.js` covers strict hard placement, and image pack/acceptance tests cover image routing.
- `core/run/{workspace,level-pipeline,runner}.js` selects per-variant pipelines and keeps the main path. Locked recorded variant recovery and path guards pass dedicated tests. `core/view/receipt-view.js` filters node commit history to main; `lastCommits(records)` also defaults to main.
- `server/tools/definitions.js` retains the M6 `folio_view` export description and M7 `folio_image` definition while adding N6 `folio_run.variant`; `server/tools/handlers.js` retains viewer/image dispatch. M6, M7a, N6 MCP acceptance tests pass.
- No image/viewer runtime files or package manifests changed in this merge.

## Validation

- Supported Node 24 runtime. Conflict/interface focus: 81 passed, 0 failed. New viewer receipt focus: 4 passed, 0 failed.
- `npm run check`: lint and typecheck passed; 1,239 tests passed, 0 failed, 0 skipped.
- `viewer npm test`: 13 passed, 0 failed. `viewer npm run build`: passed, 195 modules transformed.
- Warning: Vite reports the existing Graph chunk above 500 kB (1,613.41 kB before gzip). `git diff --check` reports trailing whitespace/extra final blank line only in the incoming, already reviewed N6 plan and rulings Markdown. Source files have no whitespace warnings.

## Limits

- No variant image workflow or variant viewer/export was added, per scope. Independent integration review remains with the controller.

## 실제 MCP·브라우저 합성 확인

# J3 실제 MCP + 브라우저 합성 확인

대상 codex/j3-integration 2ddbbf2, Node v24.19.0. 실제 bin/folio-mcp.js stdio로 합성 serial 복사본에 novel/image/variants를 함께 사용했다.

MCP 확인 통과: 원본 커밋, 합성 PNG 그림 brief→generate→same-host review→approve, asset 앵커 수동 배치와 main recommit, en normal 판본 커밋. 판본 커밋 후 원본 파일 불변, folio_status.variants.en.committed=1, main drift=[], main/en lastCommits 각1 확인. 그림/판본 답변은 모의 호스트이며 실제 외부 생성 품질·모델 공급자 연결 검증은 아니다.

숨김 인앱 브라우저 확인: URL의 token이 제거된 실제 원본 화면, 원본 한국어 문장과 엔티티 링크 및 ep-001-door img 확인. 합성 PNG는 1×1이며 DOM complete=true,naturalWidth=1,naturalHeight=1; 픽셀 fixture를 완성된 그림이라고 주장하지 않는다. 원본 영수증 화면은 main 커밋 2번(최초+recommit)을 표시하고, 이후 en 판본 커밋을 세 번째 원본 커밋으로 섞지 않는다. 원본 검사 단계 facts/critic 등을 유지한다.

화면 증거:
- /path/to/review-artifacts/folio-j3-reader.png
- /path/to/review-artifacts/folio-j3-receipt.png

직접 만든 탭은 닫고 MCP/뷰어 자식 프로세스는 close로 종료했다. 프로젝트에 합성 작품/그림을 추가하지 않았으며 실제 작품과 사용자 탭에는 접근하지 않았다. 판본 뷰어/그림 판본/판본 내보내기는 범위에 없다.

## 최종 독립 통합 검토

# J3 최종 통합 독립 검토

검토일: 2026-10-02. 기준 `c8223aa2771d3687c2e841609888f8eaea9e597a`, 후보 `2ddbbf2cb9faea25f632a7031d14aad6aeb5dc75`.

**명세 판정: 수정 필요. 품질 판정: 수정 필요. Ready to integrate: With fixes.**

새 발견은 **Critical 0, Important 1, Minor 0**이다. 원본 뷰어가 열린 판본의 손수정 경고를 원본의 경고로 표시하는 I1을 한 번의 수정 파동에서 해결하고, 해당 투영과 실제 main 손수정의 유지 여부를 범위 제한 재검토해야 한다. 데이터 쓰기나 잠금 우회는 발견하지 않았다.

## 범위와 방식

- 지정 브리프, AGENTS.md, senior code reviewer rubric, M6 설계·조회 계약, M7 Part A 설계·제약, N6 설계·목표·제약 및 세 rulings의 완료·수정·잔여 한계를 대조했다. 코드 리뷰 스킬의 명세/품질 두 축을 직접 적용했다. 하위 에이전트를 쓰지 않았다.
- 후보의 커밋 목록·전체 파일 통계, 두 부모 대비 변경 경로, combined merge diff, 공유 소스와 소비 경로, 관련 회귀 테스트를 나누어 읽었다. 거대한 계획 코드 블록을 현재 소스로 취급하지 않았다.
- 소스·index·HEAD·원본 레인·main은 변경하지 않았다. 새 실행 검증은 `/tmp` 합성 fixture 복사본 하나에서 수행하고 삭제했다. 이 보고서 외에 후보 작업트리 파일을 만들지 않았다.
- 세 레인의 이미 끝난 전체 브랜치 검토를 다시 열지 않고 실제 병합의 공유 계약과 신규 상호작용을 중심으로 판단했다.

## 잘 유지된 부분

- 후보 부모는 정확히 `2a72cdcee23cea1ec7a5ee0ec254e9d18458eb3f`와 `7bdfb62d2e329b2edf73652fd619e22805e0717c`다. 기준 대비 한쪽 레인에서만 바뀐 파일들은 모두 해당 부모의 최종 내용과 동일하다. 자동 병합이 단독 소유 파일의 수정 내용을 잃지 않았다.
- main과 판본 커밋은 같은 기록장을 사용하면서도 판본 키, 파이프라인 digest, 원본 영수증 pointer, 결정 기록을 검증한다. 그림 실행은 별도 실행 파일·assets 기록장과 승인/hash 잠금을 유지한다. 공용 작품 잠금 아래에서 각 쓰기 경로가 작동하며 판본 커밋의 곁 기록장 쓰기 차단도 남아 있다.
- 완료 판본 이후 main 커밋 이력 필터는 올바르다. 새 `viewer receipts keep the original after a variant commits to the same node` 검사는 원본 영수증·커밋 이력을 실제 실행기로 고정한다. 아래 I1은 완료된 커밋 이력과 다른, 진행 중 경고의 접점이다.

## Critical

없음.

## Important

### I1 — 열린 판본의 손수정이 원본 뷰어의 손수정으로 투영된다

- **위치:** `core/view/outline.js:22`, `core/view/receipt-view.js:57`, `core/view/receipt-view.js:92`.
- **발생 경로:** main `ep-001`을 커밋 → `folio_run`에 해당 노드와 `variant: en`을 주어 판본 실행을 열어 둠 → `variants/en/ep-001.md`만 손수정 → 뷰어 목차·영수증 API 조회.
- **원인:** N6의 `runTextDrift`는 공통 상태에 `{ nodeId, code: CHANGED_DURING_RUN, runId, variant: en }`을 내며, 이는 N6의 승인된 계약이다. 그러나 목차는 `variant`를 버려 원본 노드 링크만 남기고, 영수증 두 투영은 `nodeId`만 비교해 main 영수증에 그 경고를 붙인다. `Home.jsx`는 이를 원본 영수증 링크가 있는 ‘손수정’ 목록에 넣고 `Receipts.jsx`는 원본 행에 ‘손수정’을 표시한다. `buildSnapshot`도 같은 조회 함수를 써서 잘못된 투영을 정적 내보내기에 싣는다.
- **구체적인 영향:** 원본 바이트와 main 영수증이 그대로인데 원본에 손수정이 있다고 안내한다. 판본을 따로 유지하는 N6 계약과 원본만 보여 주는 현재 뷰어 범위에 어긋난다. 새 판본 화면을 구현할 필요는 없지만 원본 화면의 정확성은 유지해야 한다.
- **권장 수정:** main 전용 목차·영수증의 drift를 `variantOf(item) === MAIN`에 해당하는 항목으로 제한한다. 공통 `folio_status.drift`에서 판본 표기를 지우거나 경고 자체를 없애면 안 된다. 판본을 표시하기로 한다면 명시적인 판본 표기와 원본과 다른 의미가 필요하지만, 이번 범위에는 main 전용 필터가 작다.
- **집중 회귀:** 열린 en 실행 중 판본 파일만 변경했을 때 core 상태의 판본 경고는 유지되고 목차·영수증 목록·노드 영수증·스냅숏의 main drift는 비어야 한다. 같은 조건에서 실제 원본을 고치면 main 손수정이 계속 보여야 한다. 기존 완료 판본 뒤 main 영수증 이력 검사도 유지한다.

### 독립 합성 probe와 실제 출력

지원 Node `v24.19.0`에서 아래와 같은 공개 실행기·조회 경로를 직접 실행했다. 테스트 파일이나 제품 소스를 고치지 않았다.

```js
const root = await variantWork();
try {
  await commitMain(root, 'ep-001', 'Synthetic main text.\n');
  const mainPath = join(root, 'tree/01-arc-awakening/01-ep-001.md');
  const before = await readFile(mainPath, 'utf8');
  await createRunner({ root, packs: fakePacks() })
    .run({ node: 'ep-001', variant: 'en' });
  await putVariantFile(root, 'en', 'ep-001.md', 'Synthetic translator edit.\n');
  // readFile(mainPath), workStatus, viewOutline, viewNodeReceipts, viewReceiptList 대조
} finally {
  await rm(root, { recursive: true, force: true });
}
```

```json
{
  "mainUnchanged": true,
  "coreDrift": [{"nodeId":"ep-001","code":"CHANGED_DURING_RUN","runId":"run-2fb37df3959e","variant":"en"}],
  "outlineDrift": [{"nodeId":"ep-001","code":"CHANGED_DURING_RUN"}],
  "mainReceiptDrift": {"nodeId":"ep-001","code":"CHANGED_DURING_RUN","runId":"run-2fb37df3959e","variant":"en"},
  "mainReceiptListDrift": "CHANGED_DURING_RUN"
}
```

직접 확인한 것은 API 데이터와 원본 바이트 불변이다. 이 probe의 화면을 브라우저로 다시 관찰했다고 주장하지 않는다. 화면 영향과 정적 스냅숏 영향은 읽은 소비 소스에서 확인했다.

## Minor

새 통합 Minor 없음. 이미 승인·보류된 레인 한계를 새 발견 수에 중복 계산하지 않았다.

## 공유 계약 대조

| 접점 | 실제 후보 판정 |
|---|---|
| features | `links → linkScope → viewerExport → images → imageReferences → imageReview → variants` 순서, viewer/image 부모 관계, 기존 `RUN_FEATURES` 유지. 정확한 기본 객체 및 순서 테스트를 약화하지 않음. |
| packs | image 다음 variants. module graph 파일 순회와 loader digest 비교 양쪽 모두 image/variants를 포함. |
| pipeline resolve | image 전용 stage의 tier 확인·선택된 hard/locked 거부·custom 예약 ID 거부가 유지됨. N6 기본 home과 실제 variant home을 함께 검사하므로 엄격 hard 검사 단계 off가 기능 꺼짐으로 우회되지 않음. |
| run·commit | runner 분리와 195줄 제한 유지. 판본별 pipeline/check digest, 기존 main 기본값, 기록된 committing 실행의 feature-off 복구 예외, 원본 결속·앞머리 보존·곁 기록장 격리 유지. |
| main 기록 조회·index | `lastCommits` 기본 main, 노드 영수증 commit 필터 main, index receipt/commit 행의 variant 값 유지. 진행 중 drift 소비는 I1 수정 필요. |
| viewer·snapshot·image | M7 그림은 assets 저장 형식과 기존 읽기/인라인 앵커를 사용. N6 본문은 원본 tree와 분리. 정상 완료 경로는 통합 smoke가 뒷받침하며, snapshot의 drift 투영은 I1에 포함. SVG의 라이브/정적 격리 수정 유지. |
| server | `folio_view`의 내보내기 설명, `folio_image` 정의·핸들러, `folio_run.variant` 스키마·전달 모두 유지. 이미지 쓰기를 서버가 직접 호출하는 경로를 추가하지 않음. |
| skill | 이미지·판본의 발견 문구, 각 reference, 각 오류 안내가 함께 존재. 판본 뷰어·그림 판본 지원을 새로 약속하지 않음. |

## 명세와 품질 판단

**명세:** M6b/M7a/N6의 승인된 기능과 범위 경계는 대부분 지켜졌다. 이미지 A1–A8, 판본 normal 잎 변환, 원본 영수증 호환성 및 정적 뷰어가 공존한다. 다만 I1의 진행 중 판본 경고가 main 전용 조회에 새어 들어가 원본/판본 격리의 소비자 계약을 어긴다. 판본 뷰어 제외라는 범위 제한으로 원본에 거짓 경고를 표시하는 동작을 정당화할 수 없다.

**품질:** 명시적 레인 경계, 작은 모듈, 실제 기록장과 실행기를 거치는 회귀 검사가 유지된다. 변경된 JS/JSX 파일 중 300줄 초과는 없고 runner는 195줄이다. 루트 package manifest/lock 변경은 없으며 core/packs의 모델·네트워크 호출 경계 완화도 확인되지 않았다. I1은 새 상태 필드를 받는 조회층 계약과 회귀 검사의 누락이므로 병합 전 고칠 Important다. 명세/품질 양쪽에 해당하더라도 발견 수는 같은 I1 한 건이다.

## 기존 판정과 한계의 조정

- M6 정적 SVG 격리 수정은 보존됐다. 기존 export 폴더 삭제 뒤 rename 사이의 내구성 공백, 강제 종료 임시 폴더, rollback 강제 주입 검사 공백, Graph 크기 경고 등은 기존 비차단 판정을 유지한다.
- M7a 최종 I1/I2/I3의 hard/tier·실제 brief 검사·정적 실행 경로 링크 방어가 남아 있다. 참고 그림 metadata/확장자, advisory 오류 집계, active 상태 crash 복구, 동시 부모 경로 교체의 기존 제한을 해결됐다고 해석하지 않는다.
- N6 최종 I1/I2의 feature-off locked 복구와 기존 대상 앞머리 보존이 후보에 그대로 있다. 개발 중 형식의 미완료 판본 실행 재사용 제한, 부모 디렉터리 동시 교체, 플랫폼/규모 한계를 확대 보장하지 않는다.
- M7b 가져오기, 판본 그림, 판본 뷰어·내보내기는 제외했다. 정본 착수 계획서 아티팩트의 내용은 독립적으로 확인하지 못했으며 제공된 구현 계획 설계와 승계 rulings를 기준으로 판정했다.

## 검증 근거와 한계

- 병합 보고서의 exact candidate Node24 집중 81/81 + 영수증 뷰 4/4, 루트 lint/typecheck/1,239개 통과, viewer 13/13 및 build 성공을 검증 근거로 사용했다. 동일한 검사를 재실행하지 않았다.
- `combined-smoke-report.md`의 실제 MCP stdio 합성 흐름(main 커밋 → 그림 생성/검토/승인 → 앵커 수동 배치/recommit → en 커밋), main 바이트 불변, 원본 영수증 2회 및 PNG 브라우저 로드를 확인했다. 이는 제어 세션의 실행 근거이며 내가 직접 관찰한 브라우저 결과로 주장하지 않는다. 외부 모델 생성 품질 검증도 아니다.
- 직접 수행한 새 검증은 I1 합성 probe, Git 부모/경로 보존 비교, 크기·manifest 확인이다. 검사 시작 시 tracked 작업트리는 깨끗했다. 실제 작품·생성 결과물을 읽거나 커밋하지 않았다.

**Ready to integrate: With fixes — I1을 main 전용 조회층과 집중 회귀로 고친 뒤 한 번의 범위 제한 재검토가 필요하다.** 기존의 정상 완료 통합 증거는 유효하며, 전체 레인의 새 검토 파동이나 미룬 항목 확대를 요구하지 않는다.

## 단일 최종 통합 수정

# J3 최종 통합 I1 수정 보고

- 상태: DONE
- 기준: `2ddbbf2`; 수정 커밋: `3a39ace` (`fix(view): keep variant drift out of main projections`)
- 범위: `core/view/outline.js`, `core/view/receipt-view.js`, `test/view/variant-drift.test.js`만 커밋. `.superpowers`와 원본 검토 보고서, 제어 문서는 변경하지 않음.

## 실제 변경

`viewOutline`의 상태 요약과 `viewReceiptList`, `viewNodeReceipts`의 손수정 경고 선택에 `variantOf(d) === MAIN` 조건을 넣었다. 판본 표기가 없는 기존 경고는 `variantOf` 계약에 따라 main으로 남는다. 공유 `workStatus`/`folio_status`의 판본 경고와 잠금 규칙은 변경하지 않았다. `buildSnapshot`은 이 조회 함수들을 쓰므로 동일한 main 투영을 받는다.

## 검증

아래 Node/npm 명령은 작업트리 루트에서 `PATH=/path/to/node-runtime/bin:$PATH`를 앞에 붙여 실행했다. `node --version` 출력은 `v24.19.0`이었다.

| 단계 | 실제 실행 명령 | 실행 출력 요약 |
| --- | --- | --- |
| RED, 제품 코드 수정 전 | `node --test test/view/variant-drift.test.js` | 종료 코드 1, `tests 1`, `pass 0`, `fail 1`. `main viewer projections exclude an open variant edit but still show a real original edit` 실패. 기대한 원본 `outline: []`, `list: null`, `node: null`, `snapshotOutline: []`, `snapshotList: null`, `snapshotNode: null` 대신, 목차/스냅숏 목차에는 `CHANGED_DURING_RUN`이, 영수증 목록/스냅숏 목록에는 같은 코드가, 노드 영수증/스냅숏 노드에는 `variant: en`을 가진 경고 전체가 들어왔다. |
| GREEN, 수정 후 집중 검사 | `node --test test/view/variant-drift.test.js test/view/outline.test.js test/view/receipt-view.test.js test/view/snapshot.test.js test/core/variant-status.test.js` | 종료 코드 0, `tests 18`, `pass 18`, `fail 0`. 새 회귀와 기존 완료 판본 이후 원본 영수증 이력 검사를 포함한다. |
| 최종 전체 검사 | `npm run check` | 종료 코드 0. `npm run lint`의 `eslint .`, `npm run typecheck`의 `tsc -p tsconfig.json` 통과. 이어 `npm test` 출력은 `tests 1240`, `pass 1240`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`. |
| 소스 공백 확인 | `git diff --cached --check` | 종료 코드 0, 지적 출력 없음. 변경 파일 56/94/65줄로 모두 300줄 이내. |

새 회귀는 합성 main을 실제로 커밋하고 en 실행을 열어 판본 파일만 손수정한 뒤, 원본 바이트 불변과 공유 상태의 `variant: en` 경고 유지를 확인한다. 같은 실행에서 main 투영 네 경로(목차, 영수증 목록, 노드 영수증, 정적 스냅숏)에 판본 경고가 없는지 검사한다. 이어 실제 원본 파일을 손수정해 공유 상태의 `HAND_EDITED`와 모든 main 투영의 원본 경고 표시를 확인한다.

## 자기검토 및 한계

I1의 세 조회 지점 모두 동일한 main 판별 계약을 적용했다. status 원본 경고를 보존하면서 소비자 표시만 바로잡았고, 새 판본 UI나 기존 보류 항목은 건드리지 않았다. 합성 fixture만 사용하고 임시 복사본은 테스트 종료 때 삭제한다. 뷰어 소스 변경이 없어 별도 뷰어 build/test는 재실행하지 않았으며, 기존 13/13 및 build 통과 근거를 승계한다. 독립적인 범위 제한 재검토는 제어 세션에서 이 커밋을 대상으로 수행해야 한다.

## 단일 최종 통합 재검토

# J3 최종 통합 I1 범위 제한 재검토

기준 `2ddbbf2`, 수정 `3a39ace`.

**I1: ADDRESSED. 명세: PASS. 품질: PASS.** 이번 수정에서 새로 확인된 회귀는 없다.

`viewOutline`의 상태 요약과 `viewReceiptList`, `viewNodeReceipts`는 이제 공유 `status.drift`에서 `variantOf(d) === MAIN`인 경고만 원본 화면으로 투영한다. `variantOf`는 태그가 없는 이전 기록을 main으로 읽으므로 기존 원본 경고도 유지된다. 공유 `workStatus`의 판본 경고는 변경하지 않았다. `buildSnapshot`은 같은 세 조회 함수를 직접 호출하므로 정적 목차·목록·노드 영수증에도 같은 판정이 적용된다.

새 `test/view/variant-drift.test.js`는 합성 작품에 실제 main 커밋과 열린 en 실행을 만든다. 판본 파일만 고친 단계에서 원본 바이트 불변, 공유 상태의 `CHANGED_DURING_RUN` + `variant: en` 유지, 목차·영수증 목록·노드 영수증·스냅숏의 main drift 부재를 확인한다. 이어 원본을 실제로 고친 단계에서 공유 `HAND_EDITED`와 네 main 투영의 경고 유지를 확인한다. 수정 전 RED 1/1 실패, 수정 후 집중 18/18 및 전체 1,240/1,240 통과는 수정 보고서의 실제 명령 출력으로 확인했다. 통과한 검사를 반복하지 않았다.

차이는 조회 코드 두 파일과 회귀 테스트 한 파일뿐이다. 변경 파일은 모두 300줄 미만이며 `git diff --check 2ddbbf2..3a39ace`가 통과했다. 판본 UI, 이전 레인의 보류 항목, 뷰어 브라우저 렌더링은 이번 재검토 범위 밖이다. 뷰어 소스가 바뀌지 않아 이전 viewer 13/13 및 build 근거를 승계한다. 실제 외부 모델·호스트 흐름은 이 수정의 새 검증 대상이 아니다.
