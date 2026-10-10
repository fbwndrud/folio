import { FolioError } from '../errors.js';

/** 호스트 답은 문자열 JSON 또는 객체다. 코드펜스는 벗긴다. */
export function parseJsonAnswer(answer) {
  if (answer !== null && typeof answer === 'object') return answer;
  const text = String(answer ?? '').replace(/^\s*`{3}(?:json)?\s*/i, '').replace(/\s*`{3}\s*$/, '').trim();
  try { return JSON.parse(text); }
  catch { throw new FolioError('ANSWER_JSON_INVALID', 'the answer is not valid JSON'); }
}
