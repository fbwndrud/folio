/**
 * 한국어 호칭 사전(씨앗). vibelore engine/src/continuity/honorific-lexicon.js 의 KO_HONORIFIC_SEED 를 그대로 옮김.
 * - genderImplication: 불리는 사람의 성별('도련님' → male, '아가씨' → female)
 * - speakerGenderImplication: 부르는 사람의 성별('오라버니' = 여성 화자)
 * - statusImplication: 신분·지위('각하', '전하', '소저')
 * - registers: 쓰이는 배경(가문, 궁중, 무협, 현대)
 * vibelore 의 자라는 캐시(append)는 옮기지 않는다. 팩 데이터는 얼린 배열이다.
 */
const entry = (value) => Object.freeze({ ...value, registers: Object.freeze([...value.registers]) });

export const KO_HONORIFIC_SEED = Object.freeze([
  // 가문 (상류귀족)
  entry({ term: '도련님', genderImplication: 'male', statusImplication: '상류귀족', registers: ['가문', '귀족'], confidence: 'lexicon' }),
  entry({ term: '아가씨', genderImplication: 'female', statusImplication: '상류귀족', registers: ['가문', '귀족'], confidence: 'lexicon' }),
  entry({ term: '영애', genderImplication: 'female', statusImplication: '상류귀족', registers: ['가문', '귀족'], confidence: 'lexicon' }),
  entry({ term: '도련', genderImplication: 'male', registers: ['가문'], confidence: 'lexicon' }),
  // 가족 (화자 성별 함의)
  entry({ term: '오라버니', genderImplication: 'male', speakerGenderImplication: 'female', registers: ['가족', '존중'], confidence: 'lexicon' }),
  entry({ term: '오빠', genderImplication: 'male', speakerGenderImplication: 'female', registers: ['가족'], confidence: 'lexicon' }),
  entry({ term: '언니', genderImplication: 'female', speakerGenderImplication: 'female', registers: ['가족'], confidence: 'lexicon' }),
  entry({ term: '누님', genderImplication: 'female', speakerGenderImplication: 'male', registers: ['가족', '존중'], confidence: 'lexicon' }),
  entry({ term: '누나', genderImplication: 'female', speakerGenderImplication: 'male', registers: ['가족'], confidence: 'lexicon' }),
  entry({ term: '형', genderImplication: 'male', speakerGenderImplication: 'male', registers: ['가족'], confidence: 'lexicon' }),
  entry({ term: '형님', genderImplication: 'male', speakerGenderImplication: 'male', registers: ['가족', '존중'], confidence: 'lexicon' }),
  // 궁중
  entry({ term: '전하', statusImplication: '왕족', registers: ['궁중'], confidence: 'lexicon' }),
  entry({ term: '폐하', statusImplication: '황제급', registers: ['궁중'], confidence: 'lexicon' }),
  entry({ term: '마마', genderImplication: 'female', statusImplication: '왕족여성', registers: ['궁중'], confidence: 'lexicon' }),
  entry({ term: '각하', statusImplication: '귀족고위', registers: ['궁중', '관청'], confidence: 'lexicon' }),
  // 무협
  entry({ term: '소저', genderImplication: 'female', statusImplication: '무림여성', registers: ['무협'], confidence: 'lexicon' }),
  entry({ term: '대협', genderImplication: 'male', statusImplication: '무림고수', registers: ['무협'], confidence: 'lexicon' }),
  entry({ term: '노협', genderImplication: 'male', registers: ['무협'], confidence: 'lexicon' }),
  entry({ term: '사부', statusImplication: '스승', registers: ['무협', '수련'], confidence: 'lexicon' }),
  entry({ term: '사형', genderImplication: 'male', registers: ['무협', '수련'], confidence: 'lexicon' }),
  entry({ term: '사매', genderImplication: 'female', registers: ['무협', '수련'], confidence: 'lexicon' }),
  // 주군
  entry({ term: '주군', genderImplication: 'male', statusImplication: '주군', registers: ['가문', '복종'], confidence: 'lexicon' }),
  // 대명사 (성별 표지)
  entry({ term: '그', genderImplication: 'male', registers: ['대명사'], confidence: 'lexicon' }),
  entry({ term: '그녀', genderImplication: 'female', registers: ['대명사'], confidence: 'lexicon' }),
]);

/** 호칭 → 사전 항목. 없으면 undefined. 앞뒤 공백을 떼고 NFC 로 찾는다. */
export function lookupHonorific(term, lexicon = KO_HONORIFIC_SEED) {
  if (typeof term !== 'string') return undefined;
  const key = term.trim().normalize('NFC');
  return lexicon.find((item) => item.term === key);
}
