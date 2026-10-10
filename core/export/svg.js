import { FolioError } from '../errors.js';
import { xml } from './text.js';
const tags = new Set('svg g defs path rect circle ellipse line polyline polygon text tspan title desc clipPath mask linearGradient radialGradient stop use'.split(' '));
const attributes = new Set('xmlns id viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width opacity fill-opacity stroke-opacity transform font-size font-family font-weight text-anchor dominant-baseline clip-path mask gradientUnits gradientTransform offset stop-color stop-opacity href preserveAspectRatio style'.split(' '));
const fail = () => { throw new FolioError('EXPORT_SVG_UNSAFE', '정적 SVG 지원 범위 밖의 요소·속성·외부 참조가 있다'); };
const decode = (text) => {
  if (text.replace(/&[^;]+;/g, '').includes('&') || text.includes(']]>')) fail();
  return text.replace(/&([^;]+);/g, (_whole, name) => {
  const known = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  if (Object.hasOwn(known, name)) return known[name];
  if (/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(name)) {
    const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    if (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) return String.fromCodePoint(code);
  }
  fail();
  });
};
/** 정적 SVG 부분집합만 허용한다. 바이트를 수정하거나 외부 리소스를 가져오지 않는다. */
export function assertStaticSvg(bytes) {
  let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(); }
  for (const char of text) {
    const code = char.codePointAt(0);
    if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 0xd800 && code <= 0xdfff) || [0xfffe, 0xffff].includes(code)) fail();
  }
  if (/<!|<\?(?!xml[ \t\r\n])/i.test(text) || !/^[ \t\r\n]*(?:<\?xml[^?]*\?>[ \t\r\n]*)?<svg[ \t\r\n]/.test(text)) fail();
  const stack = []; let position = 0, roots = 0;
  for (const match of text.matchAll(/<[^>]*>/g)) {
    const between = text.slice(position, match.index);
    if (between.includes('<') || (!stack.length && /[^ \t\r\n]/.test(between))) fail();
    xml(decode(between)); position = match.index + match[0].length;
    const token = match[0];
    if (token.startsWith('<?xml')) {
      if (roots || stack.length || match.index > text.indexOf('<?xml') || !/^<\?xml[ \t\r\n]+version=["']1\.0["'](?:[ \t\r\n]+encoding=["']UTF-8["'])?[ \t\r\n]*\?>$/.test(token)) fail();
      continue;
    }
    const close = /^<\/([A-Za-z][\w]*)[ \t\r\n]*>$/.exec(token);
    if (close) { if (stack.pop() !== close[1]) fail(); continue; }
    const open = /^<([A-Za-z][\w]*)[ \t\r\n]*([\s\S]*?)[ \t\r\n]*(\/?)>$/.exec(token);
    if (!open || !tags.has(open[1])) fail();
    if (!stack.length) { if (open[1] !== 'svg' || ++roots !== 1) fail(); }
    let rest = open[2], xmlns = false; const seen = new Set();
    while (/[^ \t\r\n]/.test(rest)) {
      if (seen.size && !/^[ \t\r\n]/.test(rest)) fail();
      const attr = /^[ \t\r\n]*([A-Za-z][\w:-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"]*)"|'([^']*)')/.exec(rest);
      if (!attr || !attributes.has(attr[1]) || seen.has(attr[1])) fail();
      seen.add(attr[1]); rest = rest.slice(attr[0].length);
      const value = decode(attr[2] ?? attr[3]);
      if (/[<\\]/.test(value) || [...value].some((char) => char.codePointAt(0) < 32)) fail();
      if (attr[1] === 'xmlns') { if (value !== 'http://www.w3.org/2000/svg') fail(); xmlns = true; }
      xml(value);
      if (/^(?:href|xlink:href)$/.test(attr[1]) && !/^#[A-Za-z0-9][\w-]*$/.test(value)) fail();
      if (/url\s*\(/i.test(value) && !/^(?:[^()]*|url\(#[A-Za-z0-9][\w-]*\))$/.test(value)) fail();
      if (attr[1] === 'style' && (/@|expression|-moz-binding|[{}]/i.test(value) || /url\s*\(/i.test(value))) fail();
    }
    if (open[1] === 'svg' && roots === 1 && !stack.length && !xmlns) fail();
    if (!open[3]) stack.push(open[1]);
  }
  if (stack.length || roots !== 1 || /[^ \t\r\n]/.test(text.slice(position))) fail();
}
