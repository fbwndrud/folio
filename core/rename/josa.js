const PARTICLES = [['은', '는'], ['이', '가'], ['을', '를'], ['과', '와'], ['으로', '로'], ['아', '야'], ['이랑', '랑']];

/** 한글 음절의 종성(받침) 인덱스(0~27, 0은 받침 없음). 한글이 아니면 null(판단하지 않음). */
function jongseongIndex(char) {
  const code = char?.codePointAt(0) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28;
}

const hasBatchim = (char) => {
  const idx = jongseongIndex(char);
  return idx === null ? null : idx !== 0;
};

/** 종성이 정확히 ㄹ인가(겹받침 아닌 홑 ㄹ만 — 종성 인덱스 8). '으로'가 아니라 '로'가 맞는 경우다. */
const isRieulBatchim = (char) => jongseongIndex(char) === 8;

/**
 * 이름 바로 뒤가 조사이고, 옛 이름과 새 이름의 받침 유무가 달라 그 조사가 어색해지면 그 조사를 돌려준다.
 * 고치지 않는다 — 계획에 경고로만 싣는다(작가 몫). 종성이 ㄹ이면 '로'가 원래 맞는 조사라 예외로 둔다
 * (Ruling C2-5) — '으로'와 짝지어 받침 유무만으로는 못 가리는 유일한 조사쌍이다.
 * @param {string} oldName
 * @param {string} newName
 * @param {string} following
 * @returns {string|null}
 */
export function josaWarning(oldName, newName, following) {
  const was = hasBatchim(oldName.at(-1));
  const now = hasBatchim(newName.at(-1));
  if (was === null || now === null || was === now) return null;
  const all = PARTICLES.flat().sort((a, b) => b.length - a.length);
  const particle = all.find((p) => following.startsWith(p)) ?? null;
  if (particle === '로' && isRieulBatchim(newName.at(-1))) return null;
  return particle;
}
