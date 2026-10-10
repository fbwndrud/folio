# N8·J5 통합 결과

N8 소스 최종 커밋은 `23fb790`이다. 지면 검증, 읽기 전용 웹·EPUB 출판, 도구·기능·안내를 세 태스크로 구현하고 각각 독립 검토했다. 기존 13개 도구 뒤에 `folio_export`를 14번째로 추가했고 `layout`·`export`는 기본 활성화했다. 원고·설정·index·기록장은 바꾸지 않고 작품 밖의 새 폴더에만 출판한다. 선택 판본 누락은 main으로 채우지 않는다.

태스크 검토에서 CRLF 제목과 SVG 미정의 엔티티 승인 결함을 수정했다. 최종 전체 검토에서는 XML 숫자 참조/공백과 Unicode 제목의 경계 결함을 마지막 한 수정 wave로 바로잡았다. EPUB 도구 호출의 실제 book 파일과 원본 불변 검사도 보강했다. 한 번의 최종 범위 재검토에서 모두 해결됐고 미해결 Critical/Important 및 보류 minor는 없다.

Node 24 린트·타입 검사와 전체 **1331/1331** 검사가 통과했다. M7b 기존 가져오기 회귀는 별도 36/36 통과했고 도구 집중 검사는 33/33, 최종 수정 집중 검사는 18/18 통과했다. root 의존성 변경 없음, 모든 변경 JS는 300줄 이하이고 runner는 195줄로 유지했다. 합성 fixture만 사용했고 실제 작품/출판 결과물은 커밋하지 않았다.

최종 소스로 만든 일반·지면 합성 웹/EPUB 모두 내보내기 전후 파일 hash가 동일했다. EPUB 두 개는 독립 unzip CRC와 XML 파서의 container/OPF/metadata/nav/spine/ID/그림·링크 검사를 통과했다. 브라우저에서는 웹 텍스트·각주·자료·그림·장면 링크와 좌/우 지면·미배치 원고 보존을 확인했다. @page 및 인쇄 CSS가 브라우저에 로드되는 것도 확인했다.

PDF는 웹 결과를 브라우저 인쇄로 저장하는 방식이다. Codex native앱 접근은 도구 정책으로 차단됐고 Chrome 컴퓨터 제어 권한이 없어 실제 인쇄 대화상자·PDF 페이지 나눔은 검증하지 못했다. CSSOM 확인을 실물 PDF 확인으로 표시하지 않는다. EPUBCheck·실제 리더·Windows·원격 CI도 검증하지 않았다. 지면 maxChars는 문자 예산이며 글꼴/그림으로 인한 실제 넘침 보장이 아니다. 인쇄 전 작가의 미리보기 확인이 필요하다.

## J5 통합

로컬 main을 `cb70b2b`에서 `dd09767`으로 ff 통합했다. 병합 후 Node24 `npm run check`도 린트·타입 검사와 **1331/1331** 통과(exit0)했다. **J5 완료.** 최종 기록 커밋이 이 결과를 보존한다. 원래 `/path/to/folio` checkout 및 사용자 미추적 문서, 읽기 전용 vibelore는 보존한다. 이번 범위의 마지막 개발 레인은 N8이며 M8 공개 준비·원격 배포는 포함하지 않는다.

증거는 main `.superpowers/sdd/n8-layout-export-evidence/` 및 `j5-main-check.log`에 보존한다. 설계/전체 코드 계획/판정은 같은 docs/plans의 N8 문서, 사용 안내는 docs/export.md이다.

## 내가 내린 판정 전체와 비용

아래는 실행 ledger의 모든 Ruling을 순서대로 옮긴 것이다. 정본 외부 아티팩트는 접근 불가했으므로 로컬 설계·로드맵 근거의 판정은 잠정적이다.

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

Ruling: Task2의 “N8은 true를 고정한다”는 singleLink:true를 뜻한다. openWork hashAssetFiles는 기존 기본true를 유지하고 N8만 false로 호출한다 — 설계의 선택 그림 안전 읽기 계약과 일치 — 문구를 달리 이해한 외부 구현은 불필요한 전체 그림 읽기를 다시 할 수 있음.

Ruling: Task2 검증 명령의 잘못된 test/core/import-*.test.js를 실제 test/import/*.test.js로 바로잡아 M7b 회귀 검사를 보완한다 — 공유 게시 유틸 추출 검증 누락 방지 — 검사 시간 추가, source 동작은 변경 없음.

Ruling: Task2 CRLF 제목 TypeError와 SVG 미정의 엔티티 승인은 제공 계획 코드의 결함이다. 정상 CRLF를 렌더하고 XML named entity를 own whitelist로 제한한다 — 허용 원고/안전 출판 계약 복원 — 잘못된 SVG는 이제 명시 거부되며 회귀 검사 추가 비용.

Ruling: 브라우저 지면 화면·로드된 인쇄 CSS를 확인하고 실제 인쇄 대화상자/PDF는 미검증으로 남긴다 — native Codex 접근 차단 및 Chrome 컴퓨터 제어 권한 부재, 권한 우회하지 않음 — 실물 PDF 페이지 나눔은 저자의 인쇄 미리보기 확인이 남음.

Ruling: 최종 검토의 SVG 잘못된 hex 접두사·XML 공백/금지 문자와 Unicode 제목 null 매치를 마지막 한 수정 wave에서 바로잡고 EPUB 도구 수용 근거도 보강한다 — 정상 원문 보존과 잘못된 그림 거부 계약 — 숫자 개체·공백 지원이 XML 문법으로 좁혀지고 추가 회귀 검사 비용.
