import { FolioError } from '../../core/errors.js';
import { changeAsset } from '../../core/assets/change.js';
import { viewAssets } from '../../core/assets/view.js';

/** 서버는 작업 잠금을 잡는 core 공개 입구만 부른다. */
export async function assetsTool(root, { op, ...args }) {
  if (op === 'list' || op === 'get') {
    const keys = Object.keys(args);
    if ((op === 'list' && keys.length) || (op === 'get' && (keys.length !== 1 || typeof args.id !== 'string'))) throw new FolioError('ASSET_INPUT_INVALID', `invalid arguments for ${op}`);
    return viewAssets(root, op === 'get' ? args.id : undefined);
  }
  return changeAsset(root, { op, ...args });
}
