// 출판 안내는 원래 경고 코드와 별개로 사람이 이해할 문장을 쓴다.
const LABELS = {
  EXPORT_SOURCE_CHANGED: 'The original section changed after this edition was reviewed.',
  EXPORT_TERMS_CHANGED: 'The term map changed after this edition was reviewed.',
  EXPORT_UNVERIFIED: 'This section has not completed a Folio review.',
  EXPORT_BODY_CHANGED: 'This section was edited after its last review.',
  EXPORT_BLOCK_TARGET_NOT_EXPORTED: 'A referenced item is not included in this edition.',
  LAYOUT_TEXT_BUDGET: 'Text exceeds the planned space. Check the print preview.',
  LAYOUT_OUTSIDE_PAGE: 'An item extends beyond the page.',
  LAYOUT_MARGIN: 'An item enters the page margin.',
  LAYOUT_OVERLAP: 'Items overlap on the page.',
  LAYOUT_UNPLACED: 'This section has no page placement and is included at the end.',
  LAYOUT_PROBLEMS_TRUNCATED: 'There are more layout issues than can be listed here.',
  LAYOUT_DISABLED: 'Page layout is turned off for this work.',
  EPUB_LAYOUT_REFLOW: 'Fixed page positions do not apply to EPUB.',
};

const KOREAN = {
  EXPORT_SOURCE_CHANGED: '이 판본을 검토한 뒤 원본이 바뀌었습니다.',
  EXPORT_TERMS_CHANGED: '이 판본을 검토한 뒤 용어 대응표가 바뀌었습니다.',
  EXPORT_UNVERIFIED: '이 절은 Folio 검토를 완료하지 않았습니다.',
  EXPORT_BODY_CHANGED: '마지막 검토 이후 이 절의 본문이 바뀌었습니다.',
  EXPORT_BLOCK_TARGET_NOT_EXPORTED: '참조한 항목이 이 판본에 포함되지 않았습니다.',
  LAYOUT_TEXT_BUDGET: '원고가 계획한 공간을 넘습니다. 인쇄 미리보기를 확인하세요.',
  LAYOUT_OUTSIDE_PAGE: '항목이 페이지 밖으로 나갑니다.',
  LAYOUT_MARGIN: '항목이 페이지 여백을 침범합니다.',
  LAYOUT_OVERLAP: '페이지 안에서 항목이 겹칩니다.',
  LAYOUT_UNPLACED: '지면에 배치하지 않은 절을 끝에 보존했습니다.',
  LAYOUT_PROBLEMS_TRUNCATED: '표시한 것보다 더 많은 지면 문제가 있습니다.',
  LAYOUT_DISABLED: '이 작품의 지면 배치가 꺼져 있습니다.',
  EPUB_LAYOUT_REFLOW: 'EPUB에는 고정 지면 좌표를 적용하지 않습니다.',
};
export const warningLabel = (code, language = 'en') => String(language).split('-')[0].toLowerCase() === 'ko'
  ? KOREAN[code] ?? '출판 전에 검토할 항목입니다.' : LABELS[code] ?? 'This item needs review before publication.';
