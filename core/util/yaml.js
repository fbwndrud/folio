import YAML from 'yaml';
import { FolioError } from '../errors.js';

/**
 * YAML 글 → 값(빈 글은 {}). 문법 오류는 FolioError YAML_INVALID(어느 파일, 줄·칸, 라이브러리 오류 코드)로 바꾼다 —
 * 도구가 INTERNAL_ERROR 로 원문을 싣지 않아도 작가가 어디가 틀렸는지 안다. 글 조각은 되풀이하지 않는다.
 * @param {string} text
 * @param {{ source?: string }} [options] source: 작품 폴더 기준 파일 이름(알 때만)
 */
export function parseYaml(text, { source } = {}) {
  try {
    return YAML.parse(text) ?? {};
  } catch (error) {
    if (!(error instanceof YAML.YAMLError)) throw error;
    const at = error.linePos?.[0];
    throw new FolioError('YAML_INVALID', `${source ?? 'YAML'} is not valid YAML (${error.code}) at line ${at?.line ?? '?'}, column ${at?.col ?? '?'}`, {
      source: source ?? null, line: at?.line ?? null, column: at?.col ?? null, yamlCode: error.code,
    });
  }
}

export const stringifyYaml = (value) => YAML.stringify(value, { lineWidth: 0 });
