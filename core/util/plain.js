/**
 * YAML·JSON 에서 읽은 평범한 객체(키-값 지도)인가. 객체 꼬리표가 `[object Object]` 인 것만 그렇다.
 * 배열·null 은 물론, YAML 태그가 만드는 Map(!!omap)·Set(!!set)·Date(!!timestamp)·Uint8Array(!!binary)도 아니다 —
 * 그런 값을 지도로 받으면 Object.entries 가 비어 안의 설정이 조용히 사라진다(`%YAML 1.1` work.yaml 의 토글 등).
 * 엔진 코어의 모든 "지도인가" 판단이 이 함수 하나를 쓴다.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';
