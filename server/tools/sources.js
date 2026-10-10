import { OPERATION_ARGUMENTS } from './input-contracts.js';
import { FolioError } from '../../core/errors.js';
import { addSource } from '../../core/sources/add.js';
import { getSource, listSources } from '../../core/sources/view.js';
import { submitEvidence } from '../../core/evidence/submit.js';

const ARGS = OPERATION_ARGUMENTS.folio_sources;

/**
 * folio_sources. 네 가지 모두 코어의 공개 함수를 부르고, 그 함수가 작업 잠금을 스스로 잡는다(서버는 쓰기 경로를 import 하지 않는다).
 * @param {string} root
 * @param {{ op: 'add'|'list'|'get'|'link', [x: string]: any }} input
 */
export async function sourcesTool(root, { op, ...args }) {
  const rule = ARGS[op];
  const missing = rule.required.filter((key) => args[key] === undefined);
  const extra = Object.keys(args).filter((key) => !rule.allowed.includes(key));
  if (missing.length || extra.length) throw new FolioError('SOURCES_ARGS_INVALID', `${op}: missing ${missing.join(',') || '-'}, not allowed ${extra.join(',') || '-'}`, { op, missing, extra });
  if (op === 'add') return addSource(root, args);
  if (op === 'list') return listSources(root);
  if (op === 'get') return getSource(root, args.id);
  return submitEvidence(root, { nodeId: args.nodeId, claims: args.claims });
}
