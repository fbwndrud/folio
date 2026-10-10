## Task 5 읽기 전용 진단과 백업 복원 수용

Create: core/diagnostics/work.js, bin/folio-doctor.js, test/diagnostics/work.test.js, docs/operations.md.
Modify: package.json bin/scripts 및 package 검증, docs/recovery.md.
Interfaces: `inspectWork(root,{packs}) -> {ok,checks,actions}`; CLI `folio-doctor <work> --json`.
checks 항목은 name,status:ok|warning|error,message,details?이며 nonzero 종료는 error가 있을 때다.

- [ ] 정상·원고 손수정·자산 손실·기록장 변조·stale 자원·열린 run을 합성 사본으로 red 확인한다.
```javascript
const before=await snapshotFiles(root);
await inspectWork(root,{packs});
assert.deepEqual(await snapshotFiles(root),before);
```
- [ ] 상태/기록장 검증, 선택 source·승인 output 무결성 및 managed asset file 검증을 재사용한다. index 생성/복구/ledger 수정은 하지 않는다.
- [ ] pending은 warning과 안전한 다음 행동으로 표시한다. 경로/권한 오류도 거짓 정상으로 처리하지 않는다.
- [ ] 작품 전체 백업을 새 임시 폴더에 복사해 진단·조회·재연결하고 변경/승인 이력 보존을 검사한다. 실제 작품에는 적용하지 않는다.
- [ ] 사람이 읽는 출력과 --json, 잘못된 인자/없는 root/종료 코드/installed bin을 검증한다.
- [ ] 파일 상한·관련 보안/복구 회귀와 check/package 후 커밋·독립 리뷰한다.
