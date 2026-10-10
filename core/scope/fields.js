/**
 * 팩이 pack.yaml scopeFields 로 켜는 엔티티 필드(N4 — N1 미룬 minor "scope.js 가 모든 팩의 prerequisites 를 읽음").
 * 코어는 필드의 뜻을 모른다. 켠 팩이 작품에 있을 때만 그 필드의 엔티티 id 로 검사 범위를 한 단계 넓힌다.
 * - prerequisites: 이 원고의 사건이 가리키는 엔티티의 data.prerequisites(선수 개념, 지식 책 팩)
 */
export const SCOPE_FIELDS = Object.freeze(['prerequisites']);
