## Task 3 화면에서 원본·결과·최신성과 근거 보기

Create: viewer/src/screens/Resources.jsx, viewer/src/lib/resource-labels.js, viewer/test/resources.test.js.
Modify: viewer/src/App.jsx, lib/route.js, lib/workspace.js, lib/static-api.js, 필요한 styles.
Interfaces: Library의 Resources 목록과 resource/:revisionId 상세, Task2 두 API 및 정적 snapshot을 소비한다.

- [ ] UI 시험에서 미색인·낡음·external unknown·손상·선택 원본/승인 결과·재검토 필요·정적 export를 red로 확인한다.
```javascript
// 기존 Node test runner에서 Vite ssrLoadModule과 ReactDOM/server를 사용한다.
const html = renderToStaticMarkup(React.createElement(ResourcesContent, { data: fixture }));
assert.match(html, /Review needed/);
// 순수 내용 컴포넌트로 상태·escaping·상세 링크를 검사한다.
```
- [ ] 기본 화면에는 사람이 읽는 제목/종류/확정 역할/상태를 표시하고 hash·checkpoint·exact IDs는 펼치는 상세에 둔다.
- [ ] 원문 preview는 React text로 렌더링한다. 외부 링크 자동 열기, 모델 실행, 후보 승인 버튼은 만들지 않는다.
- [ ] 같은 revision의 source/복수 output entry를 grouping하거나 역할·receipt·operation을 명확히 연결한다. 단수 detail.entry를 그 판본의 유일한 근거로 가정하지 않고, 검증 목록의 모든 관련 근거를 유지한다. direct detail URL와 static export에서도 확인한다. 복수 근거의 API/SSR 합성 회귀를 추가한다.
- [ ] selectionCurrent=false인 source는 과거 선택 원본으로 표시한다.
- [ ] 전체 목록 상태는 부분/낡음과 완전함을 구분한다. 현재 generation이어도 old result의 reviewRequired를 숨기지 않는다.
- [ ] resource-only 모드는 집필 전용 화면을 사용 가능한 것처럼 표시하지 않는다. 기존 writing nav/reader/ReadingSettings를 유지한다.
- [ ] 모바일·키보드·빈 화면·HTTP 오류 및 static fallback을 확인한다. controller가 built UI를 실제 브라우저에서 320~390px/736px로 확인한다. 순수 렌더 시험만으로 전체 UI 확인을 주장하지 않는다.
- [ ] viewer test/build와 HTTP/export 회귀 후 커밋·독립 리뷰한다.
