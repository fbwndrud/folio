import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { openWork } from '../store/work.js';
import { withWorkLock } from '../run/work-lock.js';
import { createRunStore, OPEN_STATES } from '../run/run-store.js';
import { assertFeature } from '../work/features.js';
import { writeFilesTx } from '../util/file-tx.js';
import { OCCURRENCES_LEDGER } from '../occurrences/records.js';
import { planRename } from './plan.js';

/**
 * 작가가 본 계획(planDigest)을 그대로 적용한다(설계 §15 계획 → 보여주기 → 한 번에 쓰기).
 * 작업 잠금 안에서 계획을 다시 만들어 digest 가 같을 때만 쓴다. 열린 실행이 있으면 거부한다.
 * 파일은 writeFilesTx 로 모두 쓰거나 하나도 쓰지 않는다. 파일을 다 쓴 뒤에만 등장 위치를 새로 기록한다(origin rename).
 * 커밋된 노드의 원고가 바뀌면 그 노드는 손수정(drift)이 된다 — 조용히 다시 커밋하지 않는다. recommit 으로 알린다.
 * @param {string} root
 * @param {{ entityId: string, newName: string, keepOldName?: boolean, include?: string[], exclude?: string[], planDigest: string }} options
 * @param {{ hooks?: { beforeWrite?: (i:number) => any }, now?: () => string }} [context]
 */
export async function applyRename(root, { entityId, newName, keepOldName = true, include = [], exclude = [], planDigest }, { hooks = {}, now } = {}) {
  return withWorkLock(root, async () => {
    const work = await openWork(root);
    assertFeature(work.config, 'rename');
    const runs = (await createRunStore(root).list()).filter((r) => !r.error);
    const open = runs.find((r) => OPEN_STATES.has(r.state));
    if (open) throw new FolioError('RENAME_RUN_OPEN', `${open.runId} for ${open.nodeId} is not finished`, { runId: open.runId, nodeId: open.nodeId });
    const ledger = openLedger(root, OCCURRENCES_LEDGER, now ? { now } : {});
    const plan = planRename(work, await ledger.readAll(), { entityId, newName, keepOldName, include, exclude });
    if (plan.planDigest !== planDigest) {
      throw new FolioError('RENAME_PLAN_STALE', 'the work changed since the plan was shown; show the new plan to the author', { expected: String(planDigest).slice(0, 100), actual: plan.planDigest });
    }
    // waiting_children 은 OPEN_STATES 에 없어 위 검사를 지나가지만, 그 실행이 자식을 다 채운 뒤 다시 이어지면
    // run.outputs.draft(옛 이름이 든 글)를 그대로 파일에 써서 이 이름 바꾸기를 조용히 되돌릴 수 있다.
    // 그 실행의 노드가 이번 계획이 바꾸는 노드 표면 중 하나일 때만 거부한다(안 바뀌는 노드의 대기는 막지 않는다).
    const changedNodeIds = new Set(plan.changes.filter((c) => c.surface.kind === 'node').map((c) => c.surface.id));
    const waiting = runs.find((r) => r.state === 'waiting_children' && changedNodeIds.has(r.nodeId));
    if (waiting) throw new FolioError('RENAME_RUN_OPEN', `${waiting.runId} for ${waiting.nodeId} is not finished`, { runId: waiting.runId, nodeId: waiting.nodeId });
    await writeFilesTx(root, plan.files.map(({ path, beforeHash, text }) => ({ path, beforeHash, text })), { hooks });
    const files = plan.files.map((f) => f.path);
    let recorded = 0;
    try {
      for (const update of plan.occurrenceUpdates) {
        await ledger.append({ type: 'occurrences', surface: update.surface, textHash: update.textHash, items: update.items, origin: 'rename' });
        recorded += 1;
      }
    } catch (error) {
      // 파일은 이미 커밋된 tx라 되돌리지 않는다(TX_FAILED 와 다르다) — 원인을 분명히 드러낸다.
      // 아직 새로 기록되지 않은 표면은 옛 등장 위치 기준으로 stale 로 읽혀 안전하다.
      throw new FolioError('RENAME_OCCURRENCES_NOT_RECORDED',
        'the rename was written to every file, but the occurrence ledger was not fully updated; affected surfaces will read as stale until it is retried',
        { applied: true, files, recommit: plan.committed, recorded, cause: error?.code ?? 'ERROR' });
    }
    return { applied: true, files, recommit: plan.committed, occurrences: plan.occurrenceUpdates.length, warnings: plan.warnings };
  });
}
