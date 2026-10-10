import { FolioError } from '../errors.js';
import { normalizeSubject } from './subject-schema.js';
import { invalid } from './schema.js';

/** 기록장 정의를 파일 엔티티와 합친 읽기 투영. 본문 재작성은 과거 발견 정의를 지우지 않는다. */
export function mergeManagedSubjects(legacyEntities, subjects, subjectKinds) {
  if (!(legacyEntities instanceof Map) || !Array.isArray(subjects)) throw invalid('entity map and subject array are required');
  /** @type {Map<string, any>} */
  const entities = new Map([...legacyEntities].map(([key, entity]) => [key, { ...entity, managed: false, storage: 'file' }]));
  const definitions = [];
  for (const input of subjects) {
    if (input && entities.has(input.id)) throw new FolioError('TRACKING_ENTITY_COLLISION', `entity ID already exists: ${input.id}`);
    const subject = normalizeSubject(input, { subjectKinds, legacyEntities, subjects: definitions });
    definitions.push(subject);
    entities.set(subject.id, { ...subject, managed: true, path: null, storage: 'tracking' });
  }
  return entities;
}
