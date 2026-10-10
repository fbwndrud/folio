import { OPERATION_ARGUMENTS } from './input-contracts.js';
import { FolioError } from '../../core/errors.js';
import { createImageRunner } from '../../core/image/runner.js';

const ARGS = OPERATION_ARGUMENTS.folio_image;

/**
 * folio_image. 그림 실행기(core/image/runner.js)만 부르고, 실행기가 작업 잠금을 스스로 잡는다.
 * 서버는 그림 커밋·assets 쓰기 함수를 import 하지 않는다(test/server/tools.test.js 가드).
 * @param {string} root
 * @param {Map<string, any>} packs
 * @param {{ op: 'start'|'resume'|'decide'|'pending', [x: string]: any }} input
 */
export async function imageTool(root, packs, { op, ...args }) {
  const rule = ARGS[op];
  const missing = rule.required.filter((key) => args[key] === undefined);
  const extra = Object.keys(args).filter((key) => !rule.allowed.includes(key));
  if (missing.length || extra.length) throw new FolioError('IMAGE_ARGS_INVALID', `${op}: missing ${missing.join(',') || '-'}, not allowed ${extra.join(',') || '-'}`, { op, missing, extra });
  const runner = createImageRunner({ root, packs });
  if (op === 'start') return runner.start({ assetId: args.assetId, nodeId: args.nodeId ?? null });
  if (op === 'resume') return runner.resume({ runId: args.runId, answers: args.answers ?? {} });
  if (op === 'decide') return runner.decide({ runId: args.runId, action: args.action, feedback: args.feedback ?? '', reason: args.reason ?? '' });
  return runner.pending();
}
