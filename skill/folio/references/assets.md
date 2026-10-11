# 호스트가 만든 그림을 Linivera에 등록하기

생성·편집·시각 검토는 호스트가 한다. Linivera는 데이터·버전·연결·검토·작가 결정을 관리한다.
사용 가능한 이미지 도구를 환경에서 확인한다. 제공자·모델·명령을 필수로 가정하지 않는다.
생성 도구가 없으면 설명서만 등록하고 미완료 상태를 설명한다.

## 흐름

1. 작가가 정한 용도·필수 내용·고정 시각 사실을 brief에 정리한다.
   brief.entities에 작품의 인물·물건 ID를 연결한다.
   `folio_assets { root, op: 'add', id, title?, brief }`. 생성 완료로 말하지 않는다.
2. 호스트의 이미지 도구로 생성·편집한다. 이미 받은 결과도 같은 방식으로 인계한다.
3. `folio_assets { root, op: 'put', id, expectedRev, path, mediaType, origin? }`.
   path는 Linivera 서버에서 읽을 수 있는 파일의 절대 경로다. 성공 뒤에만 보관 완료로 말한다.
   origin은 선택적인 `{ provider?, imageId?, model? }` 문자열 정보다.
   Linivera ID와 제공자 imageId는 별개다. 특정 개인의 경로를 가정하지 않는다.
4. output.file은 작품 assets/ 기준 상대 경로다. 그 사본을 보고 설명서·엔티티와 대조한다.
   보지 못하면 검토 대기라고 알린다. `folio_assets { op: 'review', root, id, expectedRev,
   contentHash: asset.output.contentHash, checked, findings }`로 실제 검토 결과를 제출한다.
5. 그림·지적·참고 의견을 작가에게 보여 준다. 사람이 결정한 뒤에만
   `folio_assets { op: 'decide', root, id, expectedRev, reviewId: asset.review.reviewId,
   action, reason?, feedback? }`. 대신 승인하거나 작가의 이유를 만들지 않는다.
6. `folio_assets { op: 'attach', root, id, expectedRev, nodeIds }`로 사용 위치를 잇는다.
   nodeIds는 현재 전체 목록이며 []은 해제다. 본문을 손으로 고칠 필요가 없다.

모든 쓰기의 expectedRev는 바로 앞 응답 asset.rev다. 조회·연결·검토 뒤 새 값을 사용한다.
현재 자산 도구는 needs_model/needs_user 질문을 만들지 않는다. 호스트가 이 흐름을 수행한다.

## 검토와 결정

asset.checks의 id와 instruction을 모두 수행하고 모든 ID를 checked에 한 번씩 넣는다.
findings는 `{ checkId, code, message, location? }`다. severity를 입력하지 않는다.

| id | 등급 | 기준 |
|---|---|---|
| asset.fixed-facts | hard | 고정 설정 충돌, 이유가 있어도 승인 불가 |
| asset.brief-fit | block | 필수 내용·용도 불충족, 승인에는 작가 reason 필요 |
| asset.quality | advisory | 시각 품질 참고 의견, 자동 재생성·교체 금지 |

수정 요청은 action: request_revision과 작가 feedback을 전달한다.
검토는 항상 같은 호스트의 자기검토다. 빈 findings는 실제로 검토해 지적이 없을 때만 낸다.

## 상태와 변경

- planned: 설명서만 있음. reference_only: URI만 있음. 둘 다 그림 승인 불가.
- ready: 사본의 바이트 확인. reviewed: 현재 버전의 자기검토 제출.
- approved: 현재 검토의 작가 승인. needs_revision: 작가의 수정 요청.
- content_changed/content_missing: 사본 변형/손실. 승인·관련 원고 저장 불가.

contentVerified는 hash 확인이다. 형식·해상도 디코딩이나 시각 품질 인증으로 설명하지 않는다.
mediaType은 호스트 정보다. 파일은 1바이트~20MiB 일반 파일이다.
path와 uri 중 하나만 인계한다. URI를 다운로드하거나 보고된 hash를 확인된 hash로 쓰지 않는다.
파일을 확보한 뒤 put한다. Linivera 내부에 제공자 API 키·SDK·폴링을 넣지 않는다.

update와 put은 새 버전으로 옛 검토·승인이 풀린다. 새 review도 옛 결정을 푼다.
같은 검토는 한 번만 결정한다. list/get으로 미완료·이력·사용 위치를 확인한다.
본문 앞머리 assets와 ![[asset:id]]도 호환한다. 엔티티·등장 위치는 원고 범위를 넓힌다.
payload.assets와 status.assets를 확인한다. 원고 완료와 그림 승인·책 제작 완료를 구분한다.
자산 변경 뒤 원고 stale은 recheck로 해소한다. 이것이 자산 승인을 대신하지는 않는다.

## 오류일 때

- ASSET_RUN_OPEN: 열린 원고 실행을 마치거나 작가가 넘긴 뒤 갱신한다.
- ASSET_REV_STALE/ASSET_REVIEW_STALE: get으로 새 상태를 읽고 바뀐 결과를 보여 준 뒤 결정한다.
- ASSET_ALREADY_DECIDED: 새 검토/버전과 작가 결정이 필요하다.
- ASSET_CONTENT_UNVERIFIED: 설명서/URI 상태다. 파일을 확보해 put한다.
- ASSET_HASH_MISMATCH/ASSET_CONTENT_CHANGED/ASSET_IMMUTABLE: 바이트가 다르다.
  오류를 알리고 백업 확인 또는 새 파일 인계를 돕는다. 저장 사본을 손으로 덮어쓰지 않는다.
- ASSET_LEGACY_READ_ONLY: 기존 YAML은 읽기 전용. 새 관리 ID로 등록한다.
- RENAME_MANAGED_ASSET: 해당 자산의 이름 변경 후보를 제외하고 update로 새 설명서를 기록한다.
- ASSET_DIRECTORY_INVALID/WORK_INVALID/LEDGER_TAMPERED/ASSET_RECORD_INVALID:
  오류와 백업 복구 필요를 알린다. 내부 기록을 고쳐 우회하지 않는다.
