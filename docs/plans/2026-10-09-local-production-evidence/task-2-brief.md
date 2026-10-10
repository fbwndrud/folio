## Task 2 검증된 자원 목록·근거의 로컬 읽기 API

Create: core/view/resources.js, server/view/resource-routes.js, test/view/resources.test.js, test/server/view-resources.test.js.
Modify: core/view/index.js, core/view/snapshot.js, core/view/viewer-target.js, core/view/outline.js,
core/query/resources.js 및 pure read helper, server/view/api.js, server/view/export.js의 snapshot 소비.
Interfaces: `viewResources(root) -> {entries,checkpoint,currentCheckpoint,freshness,coverage,unavailableReason}`;
`viewResource(root,revisionId) -> {entry,contentPreview,previewTruncated}`.
GET /api/resources, GET /api/resources/:revisionId. 외부 path/root/body 입력 없음.

- [ ] generation 없음·선택 원본·승인 결과·후보·낡음·손상·외부 unknown을 합성 fixture로 red 확인한다.
```javascript
assert.equal((await viewResources(root)).unavailableReason,'not-indexed');
await assert.rejects(viewResource(root,unselected.revisionId),{code:'RESOURCE_NOT_VISIBLE'});
```
- [ ] pure read seam에서 metadata query의 allowStale와 authoritative prefix/evidence 검증을 공유한다. 일반 queryResources의 work lock/recovery 경로는 GET에서 호출하지 않는다. generation 부재만 안전한 empty 이유로 변환하고 손상/기타 오류를 삼키지 않는다.
- [ ] 읽기 전후 workspace checkpoint가 달라지면 RESOURCE_VIEW_CHANGED로 재시도를 요구한다. GET 전후 전체 파일 snapshot이 같아야 한다.
- [ ] work.yaml 없이 Resource만 등록한 검증 가능한 Folio workspace도 viewer 진입과 /api/work 요약을 지원한다. 임의 폴더 탐색이나 소설 초기화를 요구하지 않는다. writing/resource 모드와 사용 가능한 화면을 명시한다.
- [ ] stale generation의 과거 정식 선택/승인 판본은 역사 근거로 읽되, source entry에 selectionCurrent를 표시한다. 현재 deselect/교체된 원본을 현재 선택된 것으로 표시하지 않는다. 한 번도 정식 선택/승인하지 않은 candidate는 숨긴다.
- [ ] detail은 목록에 실제 보이는 판본만 읽는다. text/plain·JSON escaped preview는 최대32768문자, 더 길면 previewTruncated=true; binary bytes는 응답에 넣지 않는다.
- [ ] 상태·근거·hash·selfReview·reviewRequired를 유지한다. 조회는 refresh/원본 선택/승인/모델 실행을 하지 않는다.
- [ ] 기존 token·Origin·Host·root 고정 경계와 잘못된 revision route의 거부 시험을 통과한다.
- [ ] 정적 검토 export의 resources/resourceDetails는 동일한 검증 generation/checkpoint에서 구성한다. 중간 state 변경은 RESOURCE_VIEW_CHANGED로 거부하여 서로 다른 세대의 목록/본문을 섞지 않는다.
- [ ] 정적 검토 export는 목록과 허용 detail snapshot을 담고 기존 export의 fallback을 유지한다. export는 새로운 승인 기록을 만들지 않는다.
- [ ] 관련 core/view·HTTP·export 회귀와 lint/typecheck 통과 후 커밋·독립 리뷰한다.
