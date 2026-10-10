### Spec Compliance

- ✅ Spec compliant. Library 목록·direct detail·정적 API가 연결되고 resource-only의 집필 화면은 차단된다 (`viewer/src/App.jsx:51`, `viewer/src/lib/route.js:2`, `viewer/src/lib/workspace.js:52`, `viewer/src/lib/static-api.js:20`). Missing/Extra/Misunderstood에 해당하는 차단 사항은 발견하지 않았다.
- ✅ 같은 revision의 source+복수 output 전체를 묶고, 상세도 singular entry와 별도로 검증 목록의 모든 근거를 렌더링한다. 목록→상세→목록 검증은 첫 근거가 그대로인 동시 승인 추가도 거부한다 (`viewer/src/lib/resource-labels.js:20`, `viewer/src/screens/Resources.jsx:28`, `viewer/src/screens/Resources.jsx:55`, `viewer/src/lib/resource-detail.js:4`, `viewer/test/resources.test.js:137`).
- ✅ 과거 선택·재검토·unknown·부분·낡음 상태가 노출되며 exact ID/checkpoint는 접힌 상세 안에 있다. preview/finding은 React text이며 승인·모델 실행·외부 링크 동작을 추가하지 않았다 (`viewer/src/lib/resource-labels.js:5`, `viewer/src/screens/Resources.jsx:17`, `viewer/src/components/ResourceEvidence.jsx:14`, `viewer/src/screens/Resources.jsx:64`).
- ✅ 실제 HTTP/export 합성 회귀가 source+2output, current generation의 Review needed, live/static 상세 동일성을 확인한다 (`viewer/test/resources.test.js:82`). controller QA 증거 `/tmp/folio-controller-resources-qa-final.log:1`에는 Chrome 154의 320/390/736px, old-static 포함 13화면, page errors 0, static API calls 0, multipleEvidence=true가 있다. controller는 skip-link/main focus와 명시 reload한 old snapshot 안내까지 최종 확인했다. suite는 재실행하지 않았다.
- ⚠️ core의 잠금 불변식 자체는 이 UI diff의 수정 대상이 아니므로 Task2/통합 검증 결과가 적용된다. 이번 diff는 core/server 또는 잠금 설정을 수정하지 않는다.

### Strengths

- 근거 표시를 ResourceEvidence로 공유하고 목록 상태·grouping·세 번의 읽기 일관성 검증을 별도 모듈로 분리했다 (`viewer/src/components/ResourceEvidence.jsx:14`, `viewer/src/lib/resource-labels.js:12`, `viewer/src/lib/resource-detail.js:4`). 변경한 14파일은 모두 300줄 이하(최대 `viewer/test/resources.test.js:144`).
- 정상 SSR만 확인하지 않고 실제 authenticated HTTP→export→static 소비와 XSS 문자열 escaping, missing snapshot, 불일치·동시 변경 거부를 검증한다 (`viewer/test/resources.test.js:33`, `viewer/test/resources.test.js:50`, `viewer/test/resources.test.js:82`, `viewer/test/resources.test.js:137`).
- 기존 exporter를 공유 컴포넌트로 옮겨 동작을 보존하고, resource-only에서 capability에 따라 노출한다 (`viewer/src/components/ExportButton.jsx:6`, `viewer/src/screens/Home.jsx:2`, `viewer/src/screens/Resources.jsx:10`).

### Issues

#### Critical (Must Fix)

- 없음.

#### Important (Should Fix)

- 없음.

#### Minor (Nice to Have)

- `docs/plans/2026-10-09-local-production-evidence/task-3-report.md:58`: build는 통과했지만 기존 lazy Graph chunk 1,613.44kB의 크기 경고가 남아 검증 출력이 완전히 깨끗하지는 않다. 이번 작업이 키운 결함은 아니며 Task3 승인 차단 사항은 아니다. 별도 번들 최적화 또는 의도한 경고 관리 대상으로 남긴다.

### Assessment

**Task quality:** Approved.

**Reasoning:** 전체 근거를 잃지 않는 소비 계약과 resource-only 탐색이 요구사항에 맞으며, 합성 HTTP/export 회귀와 controller의 실제 built UI 증거가 핵심 경계를 뒷받침한다. 수정이 필요한 correctness/구조 결함은 발견하지 않았다.

**검토 범위:** BASE dc2cda0 → HEAD b1ae840. 제공 diff를 한 번 검토했고 최초 도구 출력의 중간 잘림에 한해 누락된 앞부분을 읽었다. hunk가 잘린 함수의 정적/live 선택 경계만 `viewer/src/App.jsx:24–41`, `viewer/src/lib/static-api.js:29–48`에서 보완했다. 전체 파일 재독·광범위 탐색·git 재실행·시험 재실행은 하지 않았다.

**명명한 외부 확인:** (1) refresh 중 mode/data가 사라져 집필 route가 잠깐 열리는 위험: `viewer/src/api-context.jsx:12–23`의 기존 data 유지 및 비동기 alive guard를 확인했다. (2) list/detail의 직렬화 비교가 서버 계약과 어긋나거나 export가 다른 첫 근거를 제공하는 위험: `core/view/resources.js:11–26`, `core/view/resources.js:47–64`의 동일 응답 형태·첫 entry·한 generation export를 확인했다. (3) plain English 표기 위험: `docs/user-language.md:1–26`과 변경 표기를 대조했다. (4) 보고서의 QA/경고 주장: 보고서의 해당 위치와 controller의 실제 QA 로그를 읽었다.
