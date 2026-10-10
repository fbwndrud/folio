/** 코어의 모든 오류. `code`로 판정하고 message는 사람용이다. */
export class FolioError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'FolioError';
    this.code = code;
    this.details = details;
  }
}
