import { openLedger } from '../../core/ledger/ledger.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';

export const trackingCriterion = (overrides = {}) => ({
  id: 'owner', title: '소유자', instruction: '물건의 소유자를 기록한다',
  subjectKinds: ['object'], valueType: 'text', behavior: 'state', appliesTo: 'all', ...overrides,
});
export const trackingPlan = (overrides = {}) => ({
  planId: 'main', purpose: '합성 추리 이야기의 단서를 추적한다', audience: '초보 독자',
  priorities: ['열쇠'], subjectKinds: ['object'], criteria: [trackingCriterion()], delegation: {}, ...overrides,
});
export async function appendPlan(root, plan, overrides = {}) {
  return openLedger(root, 'tracking').append({
    type: 'tracking_plan', proposalId: `proposal-${plan.version}`, proposalDigest: sha256(canonicalJson(plan)),
    source: 'user', grantId: `decision-${plan.version}`, plan, ...overrides,
  });
}
