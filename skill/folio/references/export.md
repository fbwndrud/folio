# 출판 내보내기

작가가 지면·웹·EPUB·인쇄 PDF를 원하면 이 절차를 따른다. 작품을 쓰거나 커밋하는 절차와 별개다.

1. 원하는 판본과 형식을 확인하고 `folio_export op:check`로 경고를 본다. 판본 원고가 빠지면 해당 판본을 완성해야 하며 원본으로 섞어 채우지 않는다.
2. 경고는 작가에게 설명한다. 지면은 작가의 layout.yaml을 정본으로 삼고 원고/좌표를 자동 수정하지 않는다. maxChars는 예산이며 실제 넘침은 인쇄 미리보기로 확인한다.
3. 작품 밖 새 폴더를 output으로 골라 `folio_export`한다. 부모 폴더가 있어야 하며 기존 출력은 덮지 않는다. 읽기 전용으로 원고와 기록장을 보존한다.
4. 웹은 index.html, EPUB은 book.epub을 연다. EPUB은 흐르는 지면이고 고정 배치가 적용되지 않는다는 경고를 알려 준다. PDF는 웹 결과의 브라우저 인쇄에서 저장한다. 엔진 PDF 생성으로 보고하지 않는다.
5. 결과 manifest는 출판 provenance이며 검사 영수증이나 최신성 보증이 아니다. imported/draft/손수정 경고가 있으면 새 검사 통과로 말하지 않는다. cleanupPending 또는 EXPORT_TEMP_CLEANUP_PENDING이면 반환된 정확한 경로를 확인한다.

자세한 데이터 모양·상한·지원 문법은 docs/export.md. 새 도구는 기존 13개 뒤 folio_export이며 기존 뷰어 정적 내보내기도 유지한다.
