# N8·J5 판정 기록

# SDD ledger — plan: docs/plans/2026-10-02-n8-layout-export.md

Basecb70b2b; branchcodex/n8-layout-export. Design written, plan authoring in progress; no execution dispatched. J4complete.
Ruling: 사용자 끝까지 지시로 추천 설계·로컬 J5까지 진행한다 — 기존 승인 범위 — 의도가 다르면 로컬 수정 비용.
Ruling: 정본 외부 아티팩트 접근 불가, 로컬 설계/로드맵/기존 구현 근거 — 작업 지속 — 외부 세부 일치 검증 미완료.
Ruling: D9 응답 없어 추천A(브라우저 PDF)를 가정한다 — 의존성 불증가 계약 — 엔진 PDF 생성 미제공.
Ruling: EPUB은 reflow, 명시 지면 좌표 미적용을 경고하고 지면 전용 그림은 부록으로 보존한다 — 리더 호환 — 고정 지면은 웹 인쇄로 확인 필요.
Ruling: 출력은 작품 밖의 새 폴더로 한정한다 — 읽기 전용/덮어쓰기 방지 — 기존 폴더 교체 미지원.
Ruling: SVG 정적 부분집합을 엄격히 지원한다 — EPUB 외부 실행/참조 차단 — 일부 정당한 복잡한 SVG를 거부할 수 있음.
Ruling: M7b publishWork 로직을 공용 publishTree로 추출한다 — N8도 같은 배타/소유 정리를 재사용 — 기존 import 의미의 회귀 위험을 기존 공격 검사로 확인.
Ruling: 소스 복사본은 저장소 밖 임시 폴더에서 시험한다 — 루트 lint 침범 방지 — 실행 브랜치에서 다시 검증.
Ruling: 출력 부모는 존재해야 한다 — 실제 부모 정규화와 배타 게시 — 중간 폴더 자동 생성 미지원.
Ruling: 빈 원고/작품 제목은 출판하지 않고 빈 장면 제목은 id로 표시한다 — EPUB 목차와 메타데이터 — 빈 출판물 미지원.
Ruling: 출판 언어는 선택 language를 받고 Intl 형식으로 확인한다 — 원본 언어 명시와 EPUB 메타데이터 — 일부 희귀한 유효 언어 태그를 Intl이 거부할 수 있음.
Ruling: readAssetFile에 선택 assets catalog와 singleLink를 추가해 N8은 하드 링크도 거부한다 — 불필요한 전체 metadata 재조회/외부 파일 결속 방지 — 기존 뷰어 기본값은 유지하고 N8 하드 링크 그림은 일반 복사본으로 바꿔야 함.

Preflight — producer/consumer interface review:
| Pair | Checked relationship | Result |
|---|---|---|
| Task1 validate/read → Task2 source | work.tree.nodes/assets, layout nullable/problems; variant-projected body budget | matched |
| Task2 openWork → asset reader | hashAssetFiles defaulttrue; catalog optional; N8 singleLinktrue fixed, old defaults unchanged | matched |
| Task2 source → assets/render | nodes/catalog/layout/work/variant/title/lang/warnings/manifestNodes/receiptsHash | matched |
| Task2 render → web/EPUB | articles/toc/bibliography/nodeIds/image; one anchor per leaf, actual choices, safe relative assets | matched |
| Task2 ZIP → EPUB | mimetype firststored, UTCmodified, nav/spine/XML/CRC, deterministic clock | matched |
| Task2 publishTree → M7b/N8 | IMPORT work.yaml wrapper defaults vs EXPORT manifest.json, same fs injection/ownership checks | matched; existing import attacks in trial full |
| Task2 export/check → Task3 handlers | root/output/format/variant/language/now optional; check writesnothing; output newdir | matched |
| Task3 features → old runs | appendlayout/export defaults, RUN_FEATURES unchanged, old feature snapshots updated | matched; digest test |
| Task3 tool → definitions/tests/host docs | 14th appended, enumweb/epub opcheck/export, PDFbrowseronly, readonlyprovenance | matched |
| Task1 self-consistency | file1MiB; finite numeric/page/spread/nodeonly; cap200 reserved truncation; no mutation | checked |
| Task2 self-consistency | no mainfallback; hash/append ledgers unchanged; no overwrite; owned cleanup; caps; SVGsubset | checked |
| Task3 self-consistency | defaulttrue/sourcefeatureguards; counts14; all docsactualparameters; no manual approvals reintroduced | checked |

Plan self-review: 30files split3/16/11; complete diffs (fourbacktick fences preserve innerJSON/Markdown); no placeholders, matching imports/interfaces. Trial full Node24 check PASS1327/1327+lint/types; each task RED exit1 then GREEN exit0. Root production code untouched in planning; copies outside repo. Independent EPUB/browser verification remains required on implementation output.

Ruling: Task2의 “N8은 true를 고정한다”는 singleLink:true를 뜻한다. openWork hashAssetFiles는 기존 기본true를 유지하고 N8만 false로 호출한다 — 설계의 선택 그림 안전 읽기 계약과 일치 — 문구를 달리 이해한 외부 구현은 불필요한 전체 그림 읽기를 다시 할 수 있음.

Ruling: Task2 검증 명령의 잘못된 test/core/import-*.test.js를 실제 test/import/*.test.js로 바로잡아 M7b 회귀 검사를 보완한다 — 공유 게시 유틸 추출 검증 누락 방지 — 검사 시간 추가, source 동작은 변경 없음.

Ruling: Task2 CRLF 제목 TypeError와 SVG 미정의 엔티티 승인은 제공 계획 코드의 결함이다. 정상 CRLF를 렌더하고 XML named entity를 own whitelist로 제한한다 — 허용 원고/안전 출판 계약 복원 — 잘못된 SVG는 이제 명시 거부되며 회귀 검사 추가 비용.

Ruling: 브라우저 지면 화면·로드된 인쇄 CSS를 확인하고 실제 인쇄 대화상자/PDF는 미검증으로 남긴다 — native Codex 접근 차단 및 Chrome 컴퓨터 제어 권한 부재, 권한 우회하지 않음 — 실물 PDF 페이지 나눔은 저자의 인쇄 미리보기 확인이 남음.

Ruling: 최종 검토의 SVG 잘못된 hex 접두사·XML 공백/금지 문자와 Unicode 제목 null 매치를 마지막 한 수정 wave에서 바로잡고 EPUB 도구 수용 근거도 보강한다 — 정상 원문 보존과 잘못된 그림 거부 계약 — 숫자 개체·공백 지원이 XML 문법으로 좁혀지고 추가 회귀 검사 비용.
