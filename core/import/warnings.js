/** 읽기·매핑·성공 응답에서 함께 쓰는 경고 예산. */
export const IMPORT_WARNING_LIMIT = 200;

/** @param {object[]} warnings @param {object} warning */
export function addImportWarning(warnings, warning) {
  if (warnings.length < IMPORT_WARNING_LIMIT - 1) warnings.push(warning);
  else if (warnings.length === IMPORT_WARNING_LIMIT - 1) warnings.push({ code: 'IMPORT_WARNINGS_TRUNCATED' });
}

/** 게시된 작품의 남은 임시 경로는 경고 예산이 찼어도 보여 준다. */
export function addCleanupWarning(warnings, path) {
  const warning = { code: 'IMPORT_TEMP_CLEANUP_PENDING', path };
  if (warnings.length < IMPORT_WARNING_LIMIT) warnings.push(warning);
  else warnings.splice(IMPORT_WARNING_LIMIT - 2, 1, warning);
}
