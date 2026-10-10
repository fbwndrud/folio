/** Publication language is independent from the Studio's saved UI language. */
const KOREAN = {
  Sources: '자료 목록', Contents: '목차', 'Items to review': '검토할 항목',
  'Technical details': '기술 정보', Version: '판본',
  'Read-only export. This is not a review record. Use your browser’s print menu to save a PDF.': '읽기 전용 내보내기입니다. 검토 영수증이 아닙니다. 브라우저 인쇄 메뉴에서 PDF로 저장할 수 있습니다.',
  'Draft edition — some sections have not completed review.': '검토용 초안 — 검토를 완료하지 않은 절이 포함되어 있습니다.',
};
export const publicationLabel = (text, language = 'en') => String(language).split('-')[0].toLowerCase() === 'ko' ? KOREAN[text] ?? text : text;
