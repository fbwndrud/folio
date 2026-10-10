import { foldPromise, promiseStageOf, PROMISE_KIND } from '../promise.js';

/** 심기 전 해소는 잠금 규칙이다. 팩과 사용자 설정으로 끌 수 없다. */
export const PROMISE_ORDER_CHECK = Object.freeze({
  id: 'core.promise-order',
  tier: 'deterministic',
  stage: 'facts',
  severity: 'hard',
  requiresOrder: 'linear',
  locked: true,
  origin: 'core',
  run(ctx) {
    const isPromise = (id) => ctx.work.entities.get(id)?.kind === PROMISE_KIND;
    const own = ctx.draftEvents.filter((e) => isPromise(e.entityId) && promiseStageOf(e));
    const findings = [];
    for (const entityId of new Set(own.map((e) => e.entityId))) {
      const sequence = [...ctx.priorEvents.filter((e) => e.entityId === entityId), ...own.filter((e) => e.entityId === entityId)];
      for (const problem of foldPromise(sequence).problems) {
        if (problem.nodeId !== ctx.nodeId) continue;
        findings.push({ severity: problem.severity, code: problem.code, message: `${entityId}: ${problem.code}`, entityId });
      }
    }
    return findings;
  },
});

/** @type {Array<{ id: string, [key: string]: unknown }>} */
export const BUILTIN_CHECKS = [PROMISE_ORDER_CHECK];
