import { FolioError } from '../errors.js';
import { DELEGATION_ACTIONS } from './plan.js';

/** 호출자는 입력 계획이 아닌 정본 기록장에서 재생한 활성 계획을 전달한다. */
export function assertDelegation(plan, action, grantId) {
  if (!plan || !DELEGATION_ACTIONS.includes(action) || typeof grantId !== 'string' || !grantId
    || plan.grantId !== grantId || plan.delegation?.[action] !== true) {
    throw new FolioError('TRACKING_DELEGATION_REQUIRED', `active user grant does not permit ${action}`);
  }
}
