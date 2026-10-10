/**
 * 판본(N6, 정본 §04): 같은 노드의 다른 본문(번역·개정·요약). 원본은 늘 main 이다.
 * 기록(영수증·커밋·재검사·실행 파일)에 variant 키가 없으면 main 으로 읽는다 — N6 전 기록과 호환.
 * 새로 만드는 영수증은 늘 variant 를 적는다(validateReceipt 가 문자열을 요구한다).
 */
export const MAIN = 'main';
/** 판본 id: 폴더 이름(variants/<id>/)이 되므로 소문자·숫자·'-'만, 40자까지. main 은 원본 자리라 선언할 수 없다. */
export const VARIANT_ID = /^[a-z][a-z0-9-]{0,39}$/;
export const VARIANT_KINDS = Object.freeze(['translation', 'revision', 'summary']);

/** 기록·실행의 판본. 키가 없으면 main. */
export const variantOf = (record) => (record?.variant === undefined ? MAIN : record.variant);
/** 잘못된 JSON 값도 사용자 메서드를 실행하거나 문자열 변환 예외를 내지 않고 짧게 표시한다. */
export const variantLabel = (variant) => (typeof variant === 'string' ? variant.slice(0, 60) : `<${variant === null ? 'null' : typeof variant}>`);
/** main 이 아닌 판본의 실행인가. */
export const isVariantRun = (run) => variantOf(run) !== MAIN;
