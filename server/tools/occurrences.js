import { OPERATION_ARGUMENTS } from './input-contracts.js';
import { FolioError } from '../../core/errors.js';
import { submitOccurrences } from '../../core/occurrences/submit.js';
import { applyRename } from '../../core/rename/apply.js';

const ARGS = OPERATION_ARGUMENTS.folio_occurrences;

/**
 * folio_occurrences. 제출과 이름 바꾸기 적용. 둘 다 작업 잠금을 스스로 잡는다.
 * @param {string} root
 * @param {{ op: 'submit'|'rename', [x: string]: any }} input
 */
export async function occurrencesTool(root, { op, ...args }) {
  const rule = ARGS[op];
  const missing = rule.required.filter((key) => args[key] === undefined);
  const extra = Object.keys(args).filter((key) => !rule.allowed.includes(key));
  if (missing.length || extra.length) throw new FolioError('OCCURRENCES_ARGS_INVALID', `${op}: missing ${missing.join(',') || '-'}, not allowed ${extra.join(',') || '-'}`, { op, missing, extra });
  if (op === 'submit') return submitOccurrences(root, { surface: args.surface, items: args.items });
  return applyRename(root, { entityId: args.entityId, newName: args.newName, keepOldName: args.keepOldName, include: args.include, exclude: args.exclude, planDigest: args.planDigest });
}
