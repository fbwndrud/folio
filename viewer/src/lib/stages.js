/**
 * 화면에서 토글을 그릴 수 있는 단계인가: 뷰어 토글이 켜져 있고, 잠금이 아니고, 고를 모드가 둘 이상.
 * 잠금 단계는 여기서 막고, 서버도 따로 거부한다(STEP_LOCKED) — 화면만 믿지 않는다.
 * @param {{ locked: boolean, modes: string[] }} step
 * @param {boolean} toggles
 */
export const canToggle = (step, toggles) => Boolean(toggles) && !step.locked && step.modes.length > 1;

/**
 * POST /api/stages 본문. 뷰어가 읽은 digest 를 그대로 보낸다.
 * @param {{ digest: string }} stages
 * @param {string} level
 * @param {{ id: string, locked: boolean, modes: string[] }} step
 * @param {string} mode
 * @param {string} [reason]
 */
export function toggleRequest(stages, level, step, mode, reason = '') {
  if (step.locked) throw new Error(`${step.id} is locked`);
  if (!step.modes.includes(mode)) throw new Error(`${step.id} does not take ${mode}`);
  return { level, stepId: step.id, mode, baseDigest: stages.digest, ...(reason ? { reason } : {}) };
}

/** 모드 이름(화면 글). */
export const MODE_LABELS = Object.freeze({ on: 'On', off: 'Off', auto: 'Automatic approval' });
