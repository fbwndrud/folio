import { isVariantRun } from '../variants/model.js';
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { prepareTracking, trackingCandidateDigest, virtualTrackingWork } from './candidates.js';

export const trackingEffective = (work) => Boolean(work.tracking?.plan) && work.config.features.tracking !== false;

/** 실효 rev가 같은 위임 갱신도 열린 답을 무효화한다. */
export function trackingStateDigest(work) {
  const plan = work.tracking?.plan;
  return plan ? sha256(canonicalJson({ rev: plan.rev, version: plan.version, grantId: plan.grantId })) : null;
}

/** 요청한 추적 봉투만 검증한다. 재검사는 이 경로를 쓰지 않는다. */
export function extractTracking(work, run, data) {
  if (!data?.tracking) throw new FolioError('TRACKING_ANSWER_MISSING', 'the extraction answer requires tracking');
  return { ...prepareTracking(work, run, data.tracking, { nodeId: run.nodeId, text: run.outputs.draft ?? '', mode: run.mode === 'tracking-backfill' ? run.mode : 'normal' }), draftHash: run.draftHash };
}

/** 실행 파일은 캐시다. 저장한 후보를 현재 선언·본문으로 다시 검증한 뒤에만 읽는다. */
export function trackingCandidateFor(work, run) {
  const candidate = run.outputs.tracking;
  if (isVariantRun(run)) {
    if (candidate) throw new FolioError('LOCK_TRACKING_CANDIDATE_INVALID', 'edition runs cannot change original tracking');
    return null;
  }
  if (!candidate) {
    if (trackingEffective(work) && run.mode !== 'recheck' && run.outputs.events?.draftHash === run.draftHash) {
      throw new FolioError('LOCK_TRACKING_CANDIDATE_INVALID', 'the successful extraction is missing its tracking candidate');
    }
    return null;
  }
  const invalid = () => new FolioError('LOCK_TRACKING_CANDIDATE_INVALID', 'the stored tracking candidate does not match its draft, plan or snapshot');
  try {
    if (candidate.draftHash !== run.draftHash || sha256(run.outputs.draft) !== run.draftHash || candidate.grantId !== work.tracking?.plan?.grantId
      || candidate.batchDigest !== trackingCandidateDigest(candidate)) throw invalid();
    const normalized = prepareTracking(work, run, { planRev: candidate.basePlanRev,
      discoveries: { subjects: candidate.subjects, criteria: candidate.criteria }, observations: candidate.observations, checked: candidate.checked },
    { nodeId: run.nodeId, text: run.outputs.draft, mode: run.mode === 'tracking-backfill' ? run.mode : 'normal' });
    if (canonicalJson({ ...normalized, draftHash: run.draftHash }) !== canonicalJson(candidate)) throw invalid();
    return normalized;
  } catch (error) {
    if (error.code === 'LOCK_TRACKING_CANDIDATE_INVALID') throw error;
    throw invalid();
  }
}

export function trackingWorkFor(work, run) {
  const candidate = trackingCandidateFor(work, run);
  return candidate ? virtualTrackingWork(work, candidate) : work;
}
