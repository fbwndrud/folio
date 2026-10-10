import { FolioError } from '../errors.js';
import { parseYaml, stringifyYaml } from '../util/yaml.js';

const OPEN = /^---\r?\n/;
const CLOSE = /\r?\n---\r?\n/;

/**
 * `---\n<yaml>---\n<body>` 를 나눈다. frontmatter가 없으면 전체가 본문이다.
 * 여는/닫는 울타리 줄과 YAML 안의 CRLF(Windows 체크아웃)도 받는다.
 * 본문은 저장된 바이트 그대로 돌려준다(줄바꿈을 고치지 않아야 drift hash가 정직하다).
 * source(작품 폴더 기준 파일 이름)를 주면 오류(FRONTMATTER_UNCLOSED, YAML_INVALID)가 어느 파일인지 알린다.
 * @param {string} text
 * @param {{ source?: string }} [options]
 */
export function parseDoc(text, { source } = {}) {
  const open = OPEN.exec(text);
  if (!open) return { data: {}, body: text };
  const rest = text.slice(open[0].length - 1);
  const close = CLOSE.exec(rest);
  if (!close) throw new FolioError('FRONTMATTER_UNCLOSED', `${source ?? 'a file'}: frontmatter closing fence is missing`, { source: source ?? null });
  const inner = rest.slice(1, close.index).replace(/\r\n/g, '\n');
  const yaml = inner === '' ? '' : `${inner}\n`;
  try {
    return { data: parseYaml(yaml, { source }), body: rest.slice(close.index + close[0].length) };
  } catch (error) {
    if (error instanceof FolioError && error.code === 'YAML_INVALID' && typeof error.details.line === 'number') {
      // YAML 파서는 YAML 내용부터 줄을 센다 — 여는 --- 울타리 줄(한 줄)만큼 더해야 한다
      const correctedLine = error.details.line + 1;
      const correctedMessage = `${source ?? 'YAML'} is not valid YAML (${error.details.yamlCode}) at line ${correctedLine}, column ${error.details.column ?? '?'}`;
      throw new FolioError('YAML_INVALID', correctedMessage, { ...error.details, line: correctedLine });
    }
    throw error;
  }
}

/** 쓰기는 항상 LF 다. */
export function serializeDoc({ data, body }) {
  if (!data || Object.keys(data).length === 0) return body;
  return `---\n${stringifyYaml(data)}---\n${body}`;
}
