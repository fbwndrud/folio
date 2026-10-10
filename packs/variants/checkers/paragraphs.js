import { kindOf } from './marks.js';

/** 빈 줄로 나눈 문단(공백뿐인 것은 빼고). */
const paragraphs = (text) => String(text ?? '').replace(/\r\n/g, '\n').split(/\n\s*\n/).filter((p) => p.trim() !== '');

/**
 * 문단·분량(variants.paragraphs). 번역은 문단 수가 원본과 같아야 하고(PARAGRAPH_COUNT), 요약은 원본보다 짧아야 한다(SUMMARY_NOT_SHORTER).
 * 개정판은 문단을 고칠 수 있어 보지 않는다.
 * @param {{ original?: string, draft?: string, variant?: { kind?: string } }} ctx
 */
export function paragraphCount(ctx) {
  const kind = kindOf(ctx);
  if (kind === 'translation') {
    const was = paragraphs(ctx.original).length;
    const now = paragraphs(ctx.draft).length;
    return was === now ? [] : [{ code: 'PARAGRAPH_COUNT', was, now, message: `문단 수가 원본 ${was}, 판본 ${now}` }];
  }
  if (kind === 'summary') {
    const was = String(ctx.original).trim().length;
    const now = String(ctx.draft ?? '').trim().length;
    return now < was ? [] : [{ code: 'SUMMARY_NOT_SHORTER', was, now, message: `요약(${now}자)이 원본(${was}자)보다 짧지 않다` }];
  }
  return [];
}
