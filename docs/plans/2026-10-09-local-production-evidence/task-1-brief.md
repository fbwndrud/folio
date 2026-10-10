## Task 1 두 구현 이력 통합 및 회귀 보존

Files: 충돌하는 core/run/*, core/index/*, core/scope/*, core/store/*, server/tools/*,
package.json, .github/workflows/ci.yml, README.md, skill/folio/*, packs/novel/*와 관련 tests.
Create: test/acceptance/production-integration.test.js.
Interfaces: main의 viewer/image/variants/export + 신규 assets/tracking/resources/inputs/policy/operations/resource_query/embeddings 도구를 함께 등록한다.

- [ ] `git merge --no-commit --no-ff main`으로 실제 merge를 시작하고 충돌 목록을 기록한다.
- [ ] production-integration 시험에서 두 계열 공개 도구와 gamebook/picturebook 프리셋, tracking 모드·벡터/metadata 경로를 호출한다. 단순 export 이름 존재 시험만으로 완료하지 않는다.
```javascript
const listed = await client.listTools();
for (const name of ['folio_view','folio_export','folio_image','folio_assets','folio_tracking','folio_resources','folio_embeddings']) {
  assert.ok(listed.tools.some(tool => tool.name === name));
}
// 합성 원본 선택/refresh/query와 gamebook 초기화는 같은 stdio 실행 파일로 실행한다.
```
- [ ] main의 variant/branching/viewer 동작과 신규 immutable intent/최종 발행/추적 snapshot을 합친다. 한쪽 전체 파일 선택으로 기능을 버리지 않는다.
- [ ] 기존 scalar 사건과 variant 사건, 관리 자산 nullable path, writer gate, receipts alias·caller signatures를 소비자까지 대조한다.
- [ ] 신규 tool definitions도 main의 annotations/input/output schema와 structuredContent를 준수하게 한다.
- [ ] package는 setup/viewer/preview와 check/examples/assets/package scripts를 모두 보존한다. 모델 adapter는 선택 상태다.
- [ ] Node24로 npm ci, viewer ci/build/test, root check, examples/assets/package를 실행한다. 실제 실패는 분류·수정하고 검증 삭제로 숨기지 않는다.
- [ ] merge 이력 두 부모를 보존한 커밋과 보고서, 변경 파일별 책임·검증 근거를 남긴다.
