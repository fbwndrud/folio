/**
 * 감정 동사 사전 — 감정을 직접 말하는 과거형 서술(했다/었다/았다).
 * show-dont-tell(보여주기 비율·1인칭 감정 과잉)과 pov(다른 인물 감정 누설)가 함께 쓴다.
 * vibelore engine/src/continuity/emotion-verb-lexicon.js 의 KO_EMOTION_VERB_SEED 를 그대로 옮김(한국어 전용).
 * 찾기는 원고 안 부분 문자열 일치다.
 */
export const EMOTION_VERB_ENTRIES = Object.freeze([
  // === sadness ===
  Object.freeze({ verb: '슬펐다', emotion: 'sadness', register: 'narrative' }),
  Object.freeze({ verb: '울었다', emotion: 'sadness', register: 'narrative' }),
  Object.freeze({ verb: '눈물이 났다', emotion: 'sadness', register: 'narrative' }),
  Object.freeze({ verb: '눈물을 흘렸다', emotion: 'sadness', register: 'narrative' }),
  Object.freeze({ verb: '가슴이 미어졌다', emotion: 'sadness', register: 'narrative' }),
  Object.freeze({ verb: '가슴이 아팠다', emotion: 'sadness', register: 'narrative' }),
  Object.freeze({ verb: '흐느꼈다', emotion: 'sadness', register: 'narrative' }),
  Object.freeze({ verb: '비통했다', emotion: 'sadness', register: 'formal' }),
  Object.freeze({ verb: '서글펐다', emotion: 'sadness', register: 'narrative' }),
  // === joy ===
  Object.freeze({ verb: '기뻤다', emotion: 'joy', register: 'narrative' }),
  Object.freeze({ verb: '환호했다', emotion: 'joy', register: 'narrative' }),
  Object.freeze({ verb: '미소 지었다', emotion: 'joy', register: 'narrative' }),
  Object.freeze({ verb: '웃었다', emotion: 'joy', register: 'narrative' }),
  Object.freeze({ verb: '함박웃음을 지었다', emotion: 'joy', register: 'narrative' }),
  Object.freeze({ verb: '즐거웠다', emotion: 'joy', register: 'narrative' }),
  Object.freeze({ verb: '행복했다', emotion: 'joy', register: 'narrative' }),
  Object.freeze({ verb: '신이 났다', emotion: 'joy', register: 'casual' }),
  Object.freeze({ verb: '들떴다', emotion: 'joy', register: 'narrative' }),
  // === anger ===
  Object.freeze({ verb: '분노했다', emotion: 'anger', register: 'narrative' }),
  Object.freeze({ verb: '화가 났다', emotion: 'anger', register: 'narrative' }),
  Object.freeze({ verb: '화가 치밀었다', emotion: 'anger', register: 'narrative' }),
  Object.freeze({ verb: '이를 갈았다', emotion: 'anger', register: 'narrative' }),
  Object.freeze({ verb: '주먹을 쥐었다', emotion: 'anger', register: 'narrative' }),
  Object.freeze({ verb: '눈을 부릅떴다', emotion: 'anger', register: 'narrative' }),
  Object.freeze({ verb: '격노했다', emotion: 'anger', register: 'formal' }),
  Object.freeze({ verb: '성을 냈다', emotion: 'anger', register: 'narrative' }),
  Object.freeze({ verb: '짜증이 났다', emotion: 'anger', register: 'casual' }),
  // === fear ===
  Object.freeze({ verb: '두려웠다', emotion: 'fear', register: 'narrative' }),
  Object.freeze({ verb: '무서웠다', emotion: 'fear', register: 'narrative' }),
  Object.freeze({ verb: '떨렸다', emotion: 'fear', register: 'narrative' }),
  Object.freeze({ verb: '몸이 떨렸다', emotion: 'fear', register: 'narrative' }),
  Object.freeze({ verb: '식은땀이 흘렀다', emotion: 'fear', register: 'narrative' }),
  Object.freeze({ verb: '심장이 내려앉았다', emotion: 'fear', register: 'narrative' }),
  Object.freeze({ verb: '오싹했다', emotion: 'fear', register: 'narrative' }),
  Object.freeze({ verb: '겁이 났다', emotion: 'fear', register: 'narrative' }),
  Object.freeze({ verb: '간담이 서늘했다', emotion: 'fear', register: 'narrative' }),
  // === shame ===
  Object.freeze({ verb: '부끄러웠다', emotion: 'shame', register: 'narrative' }),
  Object.freeze({ verb: '얼굴이 붉어졌다', emotion: 'shame', register: 'narrative' }),
  Object.freeze({ verb: '얼굴이 화끈거렸다', emotion: 'shame', register: 'narrative' }),
  Object.freeze({ verb: '수치스러웠다', emotion: 'shame', register: 'formal' }),
  Object.freeze({ verb: '낯이 뜨거웠다', emotion: 'shame', register: 'narrative' }),
  Object.freeze({ verb: '민망했다', emotion: 'shame', register: 'narrative' }),
  Object.freeze({ verb: '쥐구멍에 숨고 싶었다', emotion: 'shame', register: 'narrative' }),
  // === loneliness ===
  Object.freeze({ verb: '외로웠다', emotion: 'loneliness', register: 'narrative' }),
  Object.freeze({ verb: '쓸쓸했다', emotion: 'loneliness', register: 'narrative' }),
  Object.freeze({ verb: '허전했다', emotion: 'loneliness', register: 'narrative' }),
  Object.freeze({ verb: '공허했다', emotion: 'loneliness', register: 'narrative' }),
  Object.freeze({ verb: '고독했다', emotion: 'loneliness', register: 'formal' }),
  Object.freeze({ verb: '적막했다', emotion: 'loneliness', register: 'narrative' }),
  // === love ===
  Object.freeze({ verb: '사랑했다', emotion: 'love', register: 'narrative' }),
  Object.freeze({ verb: '마음에 들었다', emotion: 'love', register: 'narrative' }),
  Object.freeze({ verb: '설렜다', emotion: 'love', register: 'narrative' }),
  Object.freeze({ verb: '심장이 뛰었다', emotion: 'love', register: 'narrative' }),
  Object.freeze({ verb: '두근거렸다', emotion: 'love', register: 'narrative' }),
  Object.freeze({ verb: '애틋했다', emotion: 'love', register: 'narrative' }),
  Object.freeze({ verb: '연모했다', emotion: 'love', register: 'formal' }),
  // === hate ===
  Object.freeze({ verb: '싫었다', emotion: 'hate', register: 'narrative' }),
  Object.freeze({ verb: '미웠다', emotion: 'hate', register: 'narrative' }),
  Object.freeze({ verb: '증오했다', emotion: 'hate', register: 'narrative' }),
  Object.freeze({ verb: '혐오스러웠다', emotion: 'hate', register: 'narrative' }),
  Object.freeze({ verb: '치를 떨었다', emotion: 'hate', register: 'narrative' }),
  Object.freeze({ verb: '진절머리가 났다', emotion: 'hate', register: 'narrative' }),
  // === surprise ===
  Object.freeze({ verb: '놀랐다', emotion: 'surprise', register: 'narrative' }),
  Object.freeze({ verb: '깜짝 놀랐다', emotion: 'surprise', register: 'narrative' }),
  Object.freeze({ verb: '입을 벌렸다', emotion: 'surprise', register: 'narrative' }),
  Object.freeze({ verb: '눈이 휘둥그레졌다', emotion: 'surprise', register: 'narrative' }),
  Object.freeze({ verb: '기겁했다', emotion: 'surprise', register: 'narrative' }),
  Object.freeze({ verb: '경악했다', emotion: 'surprise', register: 'formal' }),
  Object.freeze({ verb: '얼어붙었다', emotion: 'surprise', register: 'narrative' }),
  // === disgust ===
  Object.freeze({ verb: '역겨웠다', emotion: 'disgust', register: 'narrative' }),
  Object.freeze({ verb: '토할 것 같았다', emotion: 'disgust', register: 'narrative' }),
  Object.freeze({ verb: '구역질이 났다', emotion: 'disgust', register: 'narrative' }),
  Object.freeze({ verb: '눈살을 찌푸렸다', emotion: 'disgust', register: 'narrative' }),
  Object.freeze({ verb: '인상을 찌푸렸다', emotion: 'disgust', register: 'narrative' }),
  Object.freeze({ verb: '메스꺼웠다', emotion: 'disgust', register: 'narrative' }),
  // === longing ===
  Object.freeze({ verb: '그리웠다', emotion: 'longing', register: 'narrative' }),
  Object.freeze({ verb: '보고 싶었다', emotion: 'longing', register: 'narrative' }),
  Object.freeze({ verb: '사무쳤다', emotion: 'longing', register: 'narrative' }),
  Object.freeze({ verb: '간절했다', emotion: 'longing', register: 'narrative' }),
  Object.freeze({ verb: '애타게 기다렸다', emotion: 'longing', register: 'narrative' }),
  Object.freeze({ verb: '아련했다', emotion: 'longing', register: 'narrative' }),
  // === pride ===
  Object.freeze({ verb: '자랑스러웠다', emotion: 'pride', register: 'narrative' }),
  Object.freeze({ verb: '뿌듯했다', emotion: 'pride', register: 'narrative' }),
  Object.freeze({ verb: '가슴이 벅찼다', emotion: 'pride', register: 'narrative' }),
  Object.freeze({ verb: '으쓱했다', emotion: 'pride', register: 'casual' }),
  Object.freeze({ verb: '의기양양했다', emotion: 'pride', register: 'narrative' }),
  // === guilt ===
  Object.freeze({ verb: '죄책감을 느꼈다', emotion: 'guilt', register: 'narrative' }),
  Object.freeze({ verb: '미안했다', emotion: 'guilt', register: 'narrative' }),
  Object.freeze({ verb: '가책을 느꼈다', emotion: 'guilt', register: 'formal' }),
  Object.freeze({ verb: '후회했다', emotion: 'guilt', register: 'narrative' }),
  Object.freeze({ verb: '자책했다', emotion: 'guilt', register: 'narrative' }),
  // === envy ===
  Object.freeze({ verb: '부러웠다', emotion: 'envy', register: 'narrative' }),
  Object.freeze({ verb: '시샘했다', emotion: 'envy', register: 'narrative' }),
  Object.freeze({ verb: '질투했다', emotion: 'envy', register: 'narrative' }),
  Object.freeze({ verb: '샘이 났다', emotion: 'envy', register: 'casual' }),
  Object.freeze({ verb: '배가 아팠다', emotion: 'envy', register: 'casual' }),
  // === relief ===
  Object.freeze({ verb: '안도했다', emotion: 'relief', register: 'narrative' }),
  Object.freeze({ verb: '한숨을 내쉬었다', emotion: 'relief', register: 'narrative' }),
  Object.freeze({ verb: '안심했다', emotion: 'relief', register: 'narrative' }),
  Object.freeze({ verb: '마음이 놓였다', emotion: 'relief', register: 'narrative' }),
  Object.freeze({ verb: '가슴을 쓸어내렸다', emotion: 'relief', register: 'narrative' }),
  // === contempt ===
  Object.freeze({ verb: '경멸했다', emotion: 'contempt', register: 'narrative' }),
  Object.freeze({ verb: '비웃었다', emotion: 'contempt', register: 'narrative' }),
  Object.freeze({ verb: '코웃음을 쳤다', emotion: 'contempt', register: 'narrative' }),
  Object.freeze({ verb: '하찮게 여겼다', emotion: 'contempt', register: 'narrative' }),
  Object.freeze({ verb: '깔보았다', emotion: 'contempt', register: 'narrative' }),
  Object.freeze({ verb: '멸시했다', emotion: 'contempt', register: 'formal' }),
]);

/** 감정 동사 표면형만. */
export const EMOTION_VERBS = Object.freeze(EMOTION_VERB_ENTRIES.map((entry) => entry.verb));
