import { canonicalJson, sha256 } from '../util/hash.js';
import { isPlainObject } from '../util/plain.js';

/** 그림 설명서 필드(정본 §14): 꼭 보여줄 것, 보여주면 안 될 것, 나오는 엔티티, 연속성 메모, 대사(작품 언어 원문), 기준 그림 여부. */
export const BRIEF_FIELDS = Object.freeze(['mustShow', 'mustNotShow', 'entities', 'continuity', 'dialogue', 'reference']);
const MAX_ITEMS = 20;
const MAX_LINE = 300;
const MAX_NOTE = 2000;

const isLine = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_LINE;

/**
 * 호스트가 준 설명서를 검증해 정규화한다. 모르는 필드, 틀린 모양, 작품에 없는 엔티티는 오류다(조용히 버리지 않는다).
 * 엔티티는 작품에 있어야 하고 한 번씩만. 대사의 speaker 는 null 또는 작품 엔티티 id. 돌려주는 설명서는 늘 모든 필드를 갖는다.
 * @param {{ entities: Map<string, any> }} work
 * @param {unknown} raw
 * @returns {{ brief: { mustShow: string[], mustNotShow: string[], entities: string[], continuity: string, dialogue: Array<{ speaker: string|null, text: string }>, reference: boolean } } | { errors: Array<{ code: string, field: string, index?: number }> }}
 */
export function readBrief(work, raw) {
  const errors = [];
  const push = (code, field, index) => errors.push(index === undefined ? { code, field } : { code, field, index });
  if (!isPlainObject(raw)) return { errors: [{ code: 'BRIEF_INVALID', field: '' }] };
  for (const key of Object.keys(raw)) if (!BRIEF_FIELDS.includes(key)) push('BRIEF_FIELD_UNKNOWN', key);
  const lines = (field) => {
    const value = raw[field] ?? [];
    if (!Array.isArray(value) || value.length > MAX_ITEMS) { push('BRIEF_FIELD_INVALID', field); return []; }
    value.forEach((item, index) => { if (!isLine(item)) push('BRIEF_FIELD_INVALID', field, index); });
    return value.filter(isLine);
  };
  const mustShow = lines('mustShow');
  const mustNotShow = lines('mustNotShow');
  const entityList = raw.entities ?? [];
  const entities = [];
  if (!Array.isArray(entityList) || entityList.length > MAX_ITEMS) push('BRIEF_FIELD_INVALID', 'entities');
  else {
    entityList.forEach((id, index) => {
      if (typeof id !== 'string' || !work.entities.has(id)) push('BRIEF_ENTITY_UNKNOWN', 'entities', index);
      else if (entities.includes(id)) push('BRIEF_FIELD_INVALID', 'entities', index);
      else entities.push(id);
    });
  }
  const continuity = raw.continuity ?? '';
  if (typeof continuity !== 'string' || continuity.length > MAX_NOTE) push('BRIEF_FIELD_INVALID', 'continuity');
  const dialogueList = raw.dialogue ?? [];
  const dialogue = [];
  if (!Array.isArray(dialogueList) || dialogueList.length > MAX_ITEMS) push('BRIEF_FIELD_INVALID', 'dialogue');
  else {
    dialogueList.forEach((line, index) => {
      const speaker = isPlainObject(line) ? (line.speaker ?? null) : undefined;
      const valid = isPlainObject(line) && Object.keys(line).every((key) => key === 'speaker' || key === 'text') && isLine(line.text)
        && (speaker === null || (typeof speaker === 'string' && work.entities.has(speaker)));
      if (!valid) push('BRIEF_FIELD_INVALID', 'dialogue', index);
      else dialogue.push({ speaker, text: line.text });
    });
  }
  const reference = raw.reference ?? false;
  if (typeof reference !== 'boolean') push('BRIEF_FIELD_INVALID', 'reference');
  if (errors.length) return { errors };
  return { brief: { mustShow, mustNotShow, entities, continuity: /** @type {string} */ (continuity), dialogue, reference: /** @type {boolean} */ (reference) } };
}

/** 설명서 hash. 그림 실행은 이 값으로 점검한 설명서와 커밋하는 설명서가 같은지 본다. */
export const briefHash = (brief) => sha256(canonicalJson(brief));

/** 설명서의 글(검토 인용을 대조할 글). 줄마다 하나. */
export const briefText = (brief) => [...brief.mustShow, ...brief.mustNotShow, brief.continuity, ...brief.dialogue.map((d) => d.text)]
  .filter((line) => line).join('\n');
