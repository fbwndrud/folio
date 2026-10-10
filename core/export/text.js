import { FolioError } from '../errors.js';
/** XML 1.0에 실을 수 없는 문자를 버리지 않고 거부한다. */
export function xml(value) {
  const text = String(value ?? '');
  for (const char of text) {
    const code = char.codePointAt(0);
    if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 0xd800 && code <= 0xdfff) || [0xfffe, 0xffff].includes(code)) throw new FolioError('EXPORT_TEXT_INVALID', 'XML에 실을 수 없는 문자가 있다');
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export const htmlDocument = (title, body, lang, css = 'style.css', extra = '') => `<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xml(lang)}" xml:lang="${xml(lang)}"><head><meta charset="utf-8"/><title>${xml(title)}</title><link rel="stylesheet" href="${css}"/>${extra}</head><body>${body}</body></html>`;
