/**
 * 문체 지문과 기준 대역 — 문단 밀도·문단 길이·대사 문단 비율·문장 길이 등을 재고, 기준 원고 여러 편의 중앙값으로 허용 대역을 만든다.
 * vibelore src/core/style-continuity.js(proseStyleFingerprint, buildStyleAnchor 의 aggregateFingerprints) 의 뜻을 옮김.
 * 대사 문단은 따옴표(“ “ 「 『)로 시작하는 문단이다. 1인칭 표지(나는·내가…)만 한국어 전용이고 대역 판정에는 쓰지 않는다.
 */

import { paragraphsOf } from './serial-prose.js';

const sentenceLengths = (text) => [...text.matchAll(/[^.!?。…]+[.!?。…]+/g)].map((m) => m[0].trim().length).filter(Boolean);

/** 가운데 값(짝수 개면 위쪽 가운데 — vibelore 와 같다). */
const median = (values) => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : 0);

const rounded = (value, digits = 3) => Number(Number(value || 0).toFixed(digits));

/** @param {string} prose */
export function styleFingerprint(prose) {
  const text = String(prose ?? '').replace(/\r\n/g, '\n').trim();
  const paragraphs = paragraphsOf(text);
  const lengths = paragraphs.map((p) => p.length);
  const perParagraph = (count) => rounded(count / Math.max(1, paragraphs.length));
  const firstPerson = (text.match(/(?:^|\s)(?:나는|내가|나를|나의|내게)(?=\s|[,.!?]|$)/g) ?? []).length;
  return {
    chars: text.length,
    paragraphs: paragraphs.length,
    paragraphsPer1k: rounded(paragraphs.length / Math.max(1, text.length) * 1000, 1),
    medianParagraphChars: median(lengths),
    p90ParagraphChars: lengths.length ? [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length * 0.9)] : 0,
    shortParagraphRatio: perParagraph(paragraphs.filter((p) => p.length <= 40).length),
    dialogueParagraphRatio: perParagraph(paragraphs.filter((p) => /^[“"「『]/.test(p)).length),
    medianSentenceChars: median(sentenceLengths(text)),
    firstPersonMarkersPer1k: rounded(firstPerson / Math.max(1, text.length) * 1000, 1),
  };
}

/**
 * 기준 지문들의 중앙값과 허용 대역(tolerance). 대역: 문단 밀도 ×0.65~×1.35, 문단 중앙값 ×0.55~×1.8, 대사 문단 비율 ±0.2.
 * @param {ReturnType<typeof styleFingerprint>[]} fingerprints
 */
export function styleBaseline(fingerprints) {
  const numeric = (key) => median(fingerprints.map((item) => item[key]));
  const density = numeric('paragraphsPer1k');
  const paragraphChars = numeric('medianParagraphChars');
  const dialogue = numeric('dialogueParagraphRatio');
  return {
    paragraphsPer1k: density,
    medianParagraphChars: paragraphChars,
    dialogueParagraphRatio: dialogue,
    medianSentenceChars: numeric('medianSentenceChars'),
    tolerance: {
      paragraphsPer1k: [rounded(Math.max(1, density * 0.65), 1), rounded(density * 1.35, 1)],
      medianParagraphChars: [Math.max(1, Math.floor(paragraphChars * 0.55)), Math.ceil(paragraphChars * 1.8)],
      dialogueParagraphRatio: [rounded(Math.max(0, dialogue - 0.2)), rounded(Math.min(1, dialogue + 0.2))],
    },
  };
}
