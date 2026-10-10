
**I1. [P1] 중단된 이미지 커밋이 예약한 ID를 managed add가 가로채고, 재개가 중복 자산을 최종 발행한다.**

- 위치: `core/image/commit.js:78`–`:90`; 관련 미변경 소비자 `core/assets/change.js:40`–`:45`.
- 원인: 관리 자산 gate는 `.folio/runs`의 원고 실행만 확인한다. 이미지 실행은 별도 `.folio/image-runs`에 있으며 `asset_receipt`를 남기고 YAML을 쓰기 전에 중단될 수 있다. 그때 `openWork().assets`에는 아직 이미지 ID가 없으므로 같은 ID로 managed `asset_version`을 추가할 수 있다. 이미지 재개는 `run.state === 'committing'`이라는 이유로 ID 충돌 검사를 생략하고 `<id>.yaml`과 `asset_commit`을 쓴다.
- 영향: 재개는 `done`을 반환하지만 다음 `openWork`가 `DUPLICATE_ASSET_ID`로 실패한다. 관리 기록장은 추가만 되므로 단순 재시도나 일반 자산 수정으로 회복할 수 없다. 기존 어느 한 부모에서 따로 존재하던 두 기능을 합친 뒤 발생하는 소비자 통합 결함이다.
- 재현: Node 24의 단일 focused 실행으로 확인했다. 합성 `illustratedWork`/`createImageHost`로 `collision-image`를 승인 질문까지 진행한다. `assets/collision-image.yaml`에 다른 합성 ID의 설명서를 두면 기존 image recovery 시험과 동일하게 `ASSET_IMMUTABLE`에서 중단되고 영수증과 `committing` 실행이 남는다. 장애용 설명서를 제거한 뒤 `changeAsset(root,{op:'add',id:'collision-image',brief:{description:'synthetic managed asset',entities:[]}})`를 호출한다. 성공 후 이미지 `resume`을 호출하고 `openWork`를 호출한다.
- 관측 출력:

```text
interrupted image commit: ASSET_IMMUTABLE
image run state: committing
managed add while image committing: collision-image
resume: done
work: WORK_INVALID {"errors":[{"code":"DUPLICATE_ASSET_ID","id":"collision-image"}]}
asset records: image_result, image_result, image_result, asset_receipt, asset_version, asset_commit
```

- 수정: 이미지 실행/영수증의 예약 ID를 관리 자산 쓰기가 확인하도록 공통 gate를 만들거나, 두 체계의 active/committing writer를 함께 차단한다. 이미지 재개에서도 자신의 기존 YAML/영수증만 멱등 허용하고 같은 ID의 managed 자산은 최종 파일 쓰기 전에 거부해야 한다. 위 중단 경계의 회귀 시험을 추가하고, 실패 후에도 작품이 열리며 두 체계의 각 기록이 보존됨을 검증한다.
- 이 재현은 원고·실제 이미지·소스·HEAD/index/branch를 변경하지 않았다. 합성 임시 작품/PNG만 사용했고 생성한 임시 경로를 끝에 정리했다. 전체 suite는 재실행하지 않았다.
