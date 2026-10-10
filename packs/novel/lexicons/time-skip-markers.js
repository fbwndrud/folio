/**
 * 시간 도약 표지 47개 — 원고 어디서든 하나라도 나오면 시간이 건너뛴 것으로 본다.
 * vibelore engine/src/continuity/gap-skip-detector.js:8-60 GAP_SKIP_MARKERS 를 그대로 옮김(같은 저자, Apache-2.0).
 * patternSource 는 RegExp 원문이다.
 */
export const TIME_SKIP_MARKERS = Object.freeze([
  // === short-skip ===
  Object.freeze({ patternSource: '몇\\s?시간\\s?(?:후|뒤)', kind: 'short-skip' }),
  Object.freeze({ patternSource: '몇\\s?시간이\\s?흘러', kind: 'short-skip' }),
  Object.freeze({ patternSource: '그날\\s?저녁', kind: 'short-skip' }),
  Object.freeze({ patternSource: '그날\\s?밤', kind: 'short-skip' }),
  Object.freeze({ patternSource: '잠시\\s?후', kind: 'short-skip' }),
  Object.freeze({ patternSource: '잠시\\s?뒤', kind: 'short-skip' }),
  Object.freeze({ patternSource: '한참\\s?후', kind: 'short-skip' }),
  Object.freeze({ patternSource: '한참\\s?뒤', kind: 'short-skip' }),
  Object.freeze({ patternSource: '얼마\\s?후', kind: 'short-skip' }),
  Object.freeze({ patternSource: '얼마\\s?지나지\\s?않아', kind: 'short-skip' }),
  Object.freeze({ patternSource: '곧이어', kind: 'short-skip' }),
  Object.freeze({ patternSource: '이윽고', kind: 'short-skip' }),
  // === day-skip ===
  Object.freeze({ patternSource: '다음\\s?날', kind: 'day-skip' }),
  Object.freeze({ patternSource: '이튿날', kind: 'day-skip' }),
  Object.freeze({ patternSource: '그\\s?다음\\s?날', kind: 'day-skip' }),
  Object.freeze({ patternSource: '며칠\\s?후', kind: 'day-skip' }),
  Object.freeze({ patternSource: '며칠\\s?뒤', kind: 'day-skip' }),
  Object.freeze({ patternSource: '몇\\s?날\\s?며칠', kind: 'day-skip' }),
  Object.freeze({ patternSource: '사흘\\s?뒤', kind: 'day-skip' }),
  Object.freeze({ patternSource: '일주일\\s?후', kind: 'day-skip' }),
  Object.freeze({ patternSource: '일주일\\s?뒤', kind: 'day-skip' }),
  Object.freeze({ patternSource: '보름\\s?후', kind: 'day-skip' }),
  // === long-skip ===
  Object.freeze({ patternSource: '몇\\s?주\\s?후', kind: 'long-skip' }),
  Object.freeze({ patternSource: '몇\\s?주\\s?뒤', kind: 'long-skip' }),
  Object.freeze({ patternSource: '한\\s?달\\s?후', kind: 'long-skip' }),
  Object.freeze({ patternSource: '한\\s?달\\s?뒤', kind: 'long-skip' }),
  Object.freeze({ patternSource: '몇\\s?달\\s?후', kind: 'long-skip' }),
  Object.freeze({ patternSource: '몇\\s?달\\s?뒤', kind: 'long-skip' }),
  Object.freeze({ patternSource: '일\\s?년\\s?후', kind: 'long-skip' }),
  Object.freeze({ patternSource: '일\\s?년\\s?뒤', kind: 'long-skip' }),
  Object.freeze({ patternSource: '몇\\s?년\\s?후', kind: 'long-skip' }),
  Object.freeze({ patternSource: '몇\\s?년\\s?뒤', kind: 'long-skip' }),
  Object.freeze({ patternSource: '십\\s?년\\s?후', kind: 'long-skip' }),
  Object.freeze({ patternSource: '십\\s?년\\s?뒤', kind: 'long-skip' }),
  Object.freeze({ patternSource: '수년\\s?후', kind: 'long-skip' }),
  Object.freeze({ patternSource: '수년\\s?뒤', kind: 'long-skip' }),
  Object.freeze({ patternSource: '수십\\s?년\\s?후', kind: 'long-skip' }),
  // === scene-cut ===
  Object.freeze({ patternSource: '시간이\\s?흘러', kind: 'scene-cut' }),
  Object.freeze({ patternSource: '시간이\\s?지나', kind: 'scene-cut' }),
  Object.freeze({ patternSource: '세월이\\s?흘러', kind: 'scene-cut' }),
  Object.freeze({ patternSource: '세월이\\s?지나', kind: 'scene-cut' }),
  Object.freeze({ patternSource: '어느\\s?새', kind: 'scene-cut' }),
  Object.freeze({ patternSource: '어느덧', kind: 'scene-cut' }),
  Object.freeze({ patternSource: '그렇게\\s?\\S+일이\\s?지났다', kind: 'scene-cut' }),
  Object.freeze({ patternSource: '그로부터', kind: 'scene-cut' }),
  Object.freeze({ patternSource: '그\\s?후', kind: 'scene-cut' }),
  Object.freeze({ patternSource: '훗날', kind: 'scene-cut' }),
]);
