import { FolioError } from '../errors.js';
import { resolveQuote } from '../occurrences/anchor.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { assertJson, fields, HASH, id, invalid, object, strings, text as meaningful } from './schema.js';

/** 근거는 저장 위치나 발견 시점과 분리해서 보존한다. */
export function normalizeDiscoveryEvidence(input, { nodeId = undefined, text = undefined, nodes = null } = {}) {
  fields(input, ['nodeId', 'textHash', 'quote', 'before', 'after'], 'discovery evidence');
  id(input.nodeId, 'evidence.nodeId');
  if (!HASH.test(input.textHash) || typeof input.quote !== 'string' || !input.quote.length || input.quote.length > 500
    || ['before', 'after'].some((key) => input[key] !== undefined && typeof input[key] !== 'string')) throw invalid('invalid discovery evidence');
  if (nodes) {
    const node = nodes.get(input.nodeId);
    if (!node || node.status !== 'committed') throw invalid('subject discovery requires a committed node');
    text = node.body; nodeId = node.id;
  }
  if (text !== undefined) {
    if (input.nodeId !== nodeId || input.textHash !== sha256(text)) throw invalid('discovery evidence hash or node mismatch');
    const found = resolveQuote(text, input);
    if (found.ok === false) throw invalid(`discovery evidence: ${found.code}`);
  }
  return { nodeId: input.nodeId, textHash: input.textHash, quote: input.quote,
    ...(input.before !== undefined ? { before: input.before } : {}), ...(input.after !== undefined ? { after: input.after } : {}) };
}

const entries = (value) => value instanceof Map ? [...value.values()] : value ?? [];
const nameKey = (value) => value.normalize('NFC').toLowerCase();

/** 후보/정본에 공통인 선언 검증. rev는 선언 내용만 포함한다. */
export function normalizeSubject(input, /** @type {any} */ context = {}) {
  assertJson(input);
  fields(input, ['id', 'kind', 'name', 'aliases', 'body', 'data', 'evidence', 'rev'], 'subject');
  const kind = meaningful(input.kind, 'subject.kind', 200);
  if (!context.subjectKinds?.includes(kind)) throw invalid('subject kind must be declared by the plan');
  if (typeof input.body !== 'string' || input.body.length > 100000 || !object(input.data)) throw invalid('subject requires text body and declarative data');
  const content = { id: id(input.id, 'subject.id'), kind, name: meaningful(input.name, 'subject.name', 200),
    aliases: strings(input.aliases, 'subject.aliases'), body: input.body, data: input.data };
  const names = [content.name, ...content.aliases].map(nameKey);
  if (new Set(names).size !== names.length) throw new FolioError('TRACKING_ENTITY_COLLISION', 'subject name and aliases collide');
  for (const other of [...entries(context.legacyEntities), ...entries(context.subjects)]) {
    if (other.id === content.id) {
      if (entries(context.legacyEntities).includes(other)) throw new FolioError('TRACKING_ENTITY_COLLISION', `legacy ID already exists: ${content.id}`);
      continue;
    }
    if ([other.name, ...(other.aliases ?? [])].some((name) => names.includes(nameKey(name)))) throw new FolioError('TRACKING_ENTITY_COLLISION', `subject name or alias collides with ${other.id}`);
  }
  const evidence = normalizeDiscoveryEvidence(input.evidence, context);
  return { ...content, evidence, rev: sha256(canonicalJson(content)) };
}
