import { assertFeature } from '../work/features.js';
import { isVariantRun } from '../variants/model.js';
import { isRecommit, recommitLocked } from './recommit-plan.js';
import { variantLocked } from './variant-plan.js';

/**
 * 열린 실행을 이어가는 길목(run/resume/decide)마다 그 실행이 기대는 기능이 켜져 있는지 본다: 다시 커밋(recommit, M4), 판본(variants, N6).
 * 이미 잠긴 실행(committing + 영수증 기록됨)만 예외다 — 잠금대로 끝맺는다(기능 끄기가 커밋 잠금을 흔들지 않는다).
 */
export function assertRunFeatures(ctx, run) {
  if (isRecommit(run) && !recommitLocked(ctx, run)) assertFeature(ctx.work.config, 'recommit');
  if (isVariantRun(run) && !variantLocked(ctx, run)) assertFeature(ctx.work.config, 'variants');
}

/** 기능이 꺼져 막힌 열린 실행인가 — 그런 실행은 어느 열린 상태에서든 skip 만은 받는다(작품이 멈추지 않게). */
export function runFeatureOff(ctx, run) {
  const features = ctx.work.config.features;
  return (isRecommit(run) && !recommitLocked(ctx, run) && !features.recommit) || (isVariantRun(run) && !variantLocked(ctx, run) && !features.variants);
}
