# N8 지면·내보내기 설계

기반: J4 완료 main `cb70b2b`. 사용자 “이후 다음 작업들도 끝까지 진행해”에 따라 설계·계획·합성 시험·구현·독립 검토·J5 로컬 main 통합을 진행한다. 정본 외부 아티팩트는 접근할 수 없어 로컬 로드맵·기존 N3/N6/M6/M7 구현을 근거로 한다. D9 선택 응답은 없으며 **추천 A를 가정**한다. 엔진은 웹·EPUB을 만들고 PDF는 웹 결과의 브라우저 인쇄로 저장한다. 엔진 PDF 생성이나 원격 공개를 완료로 표시하지 않는다.

## 비교와 선택

1. 뷰어 정적 내보내기를 확장: 검토 화면과 출판물을 섞고 EPUB·지면 요구가 UI 빌드에 묶인다.
2. 읽기 전용 출판 투영을 별도로 만들고 기존 블록·판본·그림 읽기를 재사용: 추천. 도구 하나가 추가되지만 UI 빌드와 무관하게 웹·EPUB을 만든다.
3. 출판 라이브러리/PDF 의존성을 추가: D9 의존성 제약을 위반하므로 선택하지 않는다.

`folio_export`를 기존 13개 뒤 14번째로 추가한다. `op: export|check`(기본 export), `format: web|epub`(기본 web), `variant`(기본 main), `language`(선택 언어 태그, 판본 lang 또는 원본 ko 기본), `output`(export는 작품 밖의 아직 없는 절대 경로 폴더, 부모는 존재해야 한다). check는 쓰지 않고 지면·투영의 문제를 보여 준다. format pdf는 받지 않는다. 기존 folio_view와 M6 정적 내보내기는 유지한다.

## 지면 정본

작가가 작품 루트의 `layout.yaml`을 직접 편집한다. version 1, page {widthMm,heightMm,marginMm}, pages [{id,spreadId?,side?:left|right,items:[{nodeId 또는 assetId,xMm,yMm,widthMm,heightMm,fit?:contain|cover,maxChars?}]}]. 숫자는 유한값, page 폭/높이 20..1000mm, margin 0 이상이며 양쪽 여백 합이 페이지보다 작아야 한다. 항목 폭·높이 양수, x/y는 0 이상. 페이지 500개, 전체 항목 5000개. 키·종류·대상 오류와 노드의 중복 배치는 LAYOUT_INVALID로 거부한다. 펼침 id는 같은 두 페이지의 left/right 쌍이어야 한다.

페이지 밖·여백 침범·항목 중첩·명시 maxChars(양의 정수) 초과는 advisory로 보고한다. 좌표·크기·원고를 자동 수정하지 않는다. maxChars는 명시 분량 예산이며 실제 글꼴 조판/넘침 보증은 아니다. 배치에서 빠진 잎 원고는 경고와 함께 부록 읽기 순서로 실어 조용히 잃지 않는다. layout.yaml이 없으면 트리 읽기 순서의 일반 출판물이다.

웹은 mm 단위 페이지와 펼침면, 인쇄 @page 규칙을 제공한다. 인쇄 화면에서 경고·도구 안내는 빠지며 지면 내용은 남는다. EPUB은 reflow 형식이고 명시 지면 위치를 적용하지 않는다는 경고를 낸다. 지면 전용 그림도 EPUB 그림 부록에 실어 빠뜨리지 않는다.

## 읽기 전용 출판 투영

잎 원고나 작품 제목이 비면 출판을 거부한다. 장면 제목이 비면 표시 제목은 id다. 출판 언어는 Intl이 인식하는 언어 태그 형식만 받는다. 모든 잎 원고(front/back 포함)를 읽는 순서로 실으며 가지 계획은 제외한다. 판본을 지정하면 모든 잎의 해당 판본이 있어야 한다. 선언되지 않은 판본, 꺼진 variants, 빠진 판본 원고는 거부하며 main으로 섞어 채우지 않는다. N3 blockCatalog/validateBlocks를 가상 트리에 적용해 번호·참조·각주·자료 인용을 재사용한다. 번호는 작품 전체 기준이며 출판물에 없는 대상은 연결 대신 표시와 경고를 남긴다. 게임북 choice는 실제 장면 앵커로 연결한다.

원문 HTML·외부 링크·스크립트는 실행하지 않고 글로 이스케이프한다. 제목·문단·울타리 코드와 Folio 블록·그림·각주·자료 표기를 렌더한다. 일반 Markdown 전체 구현은 범위 밖이며 미지원 문법의 원문은 보존한다. XML 금지 문자는 EXPORT_TEXT_INVALID로 거부한다.

그림은 M6의 readAssetFile을 재사용한다. 설명서·원고 참조·지면 그림만 복사하며 20MiB 제한, 안전 상대 경로·링크/특수 파일 거부를 유지한다. 읽은 assets catalog를 선택적으로 전달해 전체 설명서를 그림마다 다시 읽지 않는다. N8은 singleLink:true로 하드 링크도 거부하며 기존 뷰어 기본값은 유지한다. openWork에 선택적 hashAssetFiles:false를 추가해 불필요하거나 안전하지 않은 그림 전체 hash 읽기를 피한다(기본은 기존 그대로). SVG는 정적 지원 부분집합만 허용하고 스크립트·외부 참조·스타일시트·외부 개체·animation/foreignObject를 거부한다. 거부한 그림을 조용히 생략하지 않는다.

영수증 기록장은 검증하며 기존 lastCommits의 판본 필터를 재사용한다. manifest에 선택 판본·원고/그림 hash·기존 커밋/영수증 결속·경고를 기록한다. draft/imported/커밋 없는 원고·커밋 뒤 손수정은 경고한다. 내보내기는 검사 영수증이나 커밋을 만들지 않으며 검사 완료/최신성을 보증하지 않는다. 파일·기록장을 바꾸거나 index를 재구축하지 않는다.

## 결과와 자원 제한

작품 밖의 새로운 폴더만 지원한다. 실제 부모 경로를 정규화해 작품 내부·별칭을 거부하고 기존 폴더를 덮지 않는다. 임시 폴더에 완성한 뒤 manifest를 마지막에 배타 게시한다. M7b의 게시 로직을 일반 publishTree로 추출해 기존 IMPORT 기본 코드/marker 의미를 유지하고 N8은 EXPORT/manifest.json을 사용한다. 실패 시 이 호출이 만든 변경되지 않은 inode만 정리하고 타인이 만든 파일·바뀐 경로를 보존한다. 남은 정리는 cleanupPending과 정확한 target/temp로 알린다.

한 번에 5000개 잎/그림/결과 파일, 출력 총 64MiB. 지면 검사 진단 200개(절단 사유 포함). 상한을 넘으면 내보내기를 실패시키며 완료 파일을 남기지 않는다. SVG 문자열도 그림 바이트 한도 안에서 처리한다. ZIP64·암호화·원격 글꼴/리소스는 범위 밖이다.

웹: index.html, style.css, images/, manifest.json. EPUB: book.epub, manifest.json. EPUB ZIP은 node:zlib으로 직접 쓰고 mimetype을 첫 비압축 항목으로 둔다. container.xml, package.opf, nav.xhtml, book.xhtml, CSS, 그림 manifest/spine과 dc:identifier/title/language, UTC dcterms:modified를 제공한다. SVG 사용 시 XHTML manifest에 svg 속성을 표시한다. 시간은 주입 가능하며 동일 입력/시간은 같은 결과다.

## 기능·불변 규칙

FEATURES 끝에 layout:true, export:true를 추가한다. 둘은 RUN_FEATURES 밖이다. export off는 새 도구를 거부한다. layout off는 지면을 읽거나 적용하지 않고 명시 경고한다. check도 export 기능이 필요하다. 기존 features digest·열린 실행·잠금·기록장 의미를 바꾸지 않는다.

합성 fixture만, 실제 작품/생성물 커밋 금지. 모듈 책임 하나, JS 300줄 이하, runner 250줄 이하. core 모델·네트워크·런타임 dynamic import 금지. root 의존성 추가 금지. 원래 checkout과 vibelore 수정 금지. 한국어 안내/주석, 영어 식별자. 로컬 통합만 수행한다.

## 검증과 완료

지면 유효성·경고·펼침, 판본 누락, N3 번호·각주·자료, 그림·선택지, 원고 HTML 이스케이프, XML 금지 문자/SVG 외부 참조, 기능 토글과 기존 도구 순서, 출력 충돌·작품 내부 별칭·게시 실패/외부 파일 보존, 소스/기록장 바이트 불변을 합성 시험한다. 독립 unzip CRC 검사와 XML 파서로 EPUB 구조를 확인하고 브라우저로 웹/지면/인쇄 화면을 확인한다. 전체 lint/types/test, 태스크별 독립 검토, 최종 검토와 필요 시 한 번의 최종 수정·재검토, J5 ff 통합 후 main 전체 검사를 수행한다. 보고된 테스트를 검토자가 반복하지 않는다.

근거: [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/)의 OCF/metadata/navigation/media 규칙, [PKWARE ZIP 규격](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)의 파일 헤더/CRC/중앙 목록. EPUBCheck·실제 리더 전체 호환성 인증을 주장하지 않는다.
