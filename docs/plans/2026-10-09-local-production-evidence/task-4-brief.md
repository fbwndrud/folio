## Task 4 새 설치·배포 패키지·첫 작품의 전체 경로

Modify: package.json, scripts/check-package.js, .github/workflows/ci.yml, README.md, docs/connect.md, docs/writing-guide.md, docs/testing.md.
Create: examples/production.js, test/server/production-stdio.test.js, scripts/build-package.js(필요 시), docs/production.md.
Interfaces: `npm run production:verify`는 임시 합성 작품의 stdio→HTTP→export 결과를 JSON으로 반환하고 출력은 종료 시 정리한다.

- [ ] tarball 새 설치에서 viewer 준비 파일·folio-view 실행이 누락되는 실패를 red로 확인한다.
- [ ] 배포 전 viewer build를 명시 실행하고 package에 dist와 필요한 runtime 파일만 넣는다. source setup과 설치된 CLI를 구분한다.
- [ ] 합성 그림책을 공개 MCP로 작성·검토·모의 채택하고 합성 그림 등록·연결, selected Resource→metadata 조회→HTTP 목록/상세, 웹/EPUB과 정적 검토 export를 수행한다.
```javascript
assert.equal(summary.synthetic,true);
assert.equal(summary.viewerResourceVisible,true);
assert.equal(summary.epubVerified,true);
assert.equal(summary.outputsRetained,false);
```
- [ ] 별도 resource-only workspace를 folio_init 없이 만들어 stdio→HTTP→정적 export를 검증한다.
- [ ] 모델 런타임이 없을 때도 기본 흐름이 성공하고, embedding 호출만 명확한 runtime-unavailable가 되는지 검증한다.
- [ ] 설치 시 ESLint9 deprecation을 조사하고 지원되는 lint 도구로 갱신 가능한지 확인한다. 기존 lint 기준을 약화하지 않고, 새 recommended 규칙과 민감 정보 마스킹의 충돌은 근거와 판정을 기록한다. 관련 없는 core 리팩터링으로 확대하지 않는다.
- [ ] SDK minimum은 patched1.x로 올리고 lock은 검증한1.32.1을 사용한다. viewer source-map-js lock도 patched1.2.2로 갱신한다. installed stdio schema·viewer build 회귀와 root runtime/viewer full audit 결과를 구분해 확인한다.
- [ ] 정적 export 교체 중 실패 시 기존 export를 보존하거나 명시 복구 가능하게 한다. target을 먼저 삭제하지 않으며 교체 실패 주입 시험으로 계약을 확인한다. 이전 이미지 손상/누락도 정상 완전 export로 숨기지 않는다.
- [ ] snapshot 승인 상태와 실제 복사하는 이미지 bytes를 같은 판본에 결속한다. 합성 same-ID 교체를 snapshot 직후 주입해 이전 approved 표시와 새 미승인 이미지가 섞이는 것을 거부하거나 이전 exact bytes를 복사한다. 경로·hash·managed version과 legacy 파일의 처리 경계를 기록한다.
- [ ] docs/스킬의 첫 사용자 안내와 기능/한계를 최신 통합 코드로 맞춘다. PDF는 브라우저 인쇄, 자동 조판·클라우드 게시로 쓰지 않는다.
- [ ] CI에 root/viewer checks와 production/package 검증을 연결한다. 설정과 실제 실행 증거를 분리한다.
- [ ] fresh npm setup, root/viewer 검사, 전체 합성 example와 installed tarball 검증 후 커밋·독립 리뷰한다.
