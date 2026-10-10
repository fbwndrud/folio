# Studio 전체 화면·데이터 표시 재점검

사용자의 지적: JSON 자료가 남아 있고 Story threads 제목이 겹친다. 주요 신규 화면의 기능 검사만으로 전체 디자인 완성을 보고한 이전 판정은 부정확했다.

이번 승인 범위: 실제 메뉴와 상세 화면을 전수 확인하여 데이터 표현·배치·빈 상태·오류 안내를 수정한다. 원본 작품과 승인 기록은 수정하지 않는다.

## 수용 기준

- Overview, Manuscript/reader/details, Story threads, Evidence desk, Changes, Review records/detail, Check groups, Publish, Resources/detail, Sources/detail, Figures & references, Connections, Settings를 화면별로 확인한다.
- 시스템 metadata나 객체 observation/event/version은 JSON dump 대신 항목명/값/상태/근거로 보여 준다. 배열·nested object·false/0/null/empty 및 사용자 정의 필드의 데이터는 버리지 않는다. hash/ID는 필요한 버전 상세에 보존한다.
- Story threads의 긴 장면 제목은 겹치지 않는다. 실제 사건이 기록된 구간과 현재 읽기 시점을 구분한다. 빈 데이터는 설명과 다음 행동을 제공한다.
- 비어 있는 표는 그리지 않는다. 빈 모듈을 반복해 화면을 채우지 않는다. 긴 목록은 검색/접기/범위 선택을 제공한다. 기술 문제와 작가 원문은 구분한다.
- Connections의 기본 화면은 읽을 수 있는 실제 연결과 제목이다. 전체 그래프를 강제로 축소하지 않는다.
- 데스크톱·390px·dark/light, 실제 중편/안내서 및 객체값·자료·이미지·복수 사건이 포함된 합성 fixture를 확인한다. 펼친 상세도 검사한다.
- 메뉴 화면 확인과 모든 가능한 데이터 조합 검증은 구별한다. 확인한 경로/데이터/이슈/수정 후 증거를 기록한다. 미확인 사항을 완성으로 보고하지 않는다.

## 구현·이전·롤백

읽기 표시 모듈만 수정한다. 가능한 한 현재 core 응답/정적 사본 호환성을 유지한다. Story threads의 출처 제목은 additive 읽기 필드로 보완한다. 이전 사본은 기존 leaf 제목 또는 ID fallback을 사용한다. 신규 화면을 되돌려도 ledger/원고/자산 파일 변화는 없다.
