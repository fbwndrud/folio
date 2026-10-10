# 그림 (image 팩, `folio_image`)

엔진은 그림을 그리지 않는다. 호스트(나)가 그림 도구로 그리고, 엔진은 설명서·점검·검토·승인·영수증의 순서와 잠금만 지킨다.

## 준비

- 작품 `packs`에 `image`를 둔다: `packs: [novel, image]`. 검사 세트는 작가가 고른다: `image.basic`(점검 넷 + 검토 하나), `image.placement`(본문의 `![[asset:id]]`가 실제 그림을 가리키는가). 웹툰·삽화 작품에 추천된다. 모두 실험·참고 의견이다.
- 기능 토글(work.yaml `features`): `images`(그림 실행), `imageReferences`(기준 그림을 그림 요청에 싣기), `imageReview`(그림 검토). 뒤 둘은 `images`가 꺼지면 같이 꺼진다. 잠금은 어떤 토글과도 상관없다.
- 기준 그림: 인물·장소의 기준 그림은 `assets/<id>.yaml`에 `reference: true`와 `brief.entities: [엔티티 id]`를 적은 그림이다. 그림 요청의 `references`에 그 그림의 절대 경로가 실린다 — 그 파일을 보고 같은 모습으로 그린다.

## 한 장 그리기

1. `folio_image { root, op: 'start', assetId, nodeId? }`: `assetId`는 작품에 없는 새 id, `nodeId`는 그림이 붙을 노드. 한 번에 그림 실행 하나만 열린다(`IMAGE_RUN_IN_PROGRESS`).
2. `needs_model` 요청마다 답하고 `folio_image { root, op: 'resume', runId, answers }`(답은 모두 문자열):

| 요청 | 답 |
|---|---|
| `purpose: image_brief` | JSON `{ "mustShow": [...], "mustNotShow": [...], "entities": [엔티티 id], "continuity": "...", "dialogue": [{ "speaker", "text" }], "reference": false }` — 노드 본문에 있는 것만. 대사는 본문 문장 그대로 |
| `purpose: image_generate` | JSON `{ "path": "<그린 그림 파일의 절대 경로>", "model": "<그림 모델 이름>" }`. png·jpg·gif·webp, 20MiB까지, 링크가 아닌 보통 파일. 엔진은 그 파일을 읽기만 하고 실행 폴더로 옮긴다 |
| `purpose: image_review` | JSON `{ "checked": [검사 id 모두], "findings": [...] }` — `payload.image.path`의 그림을 직접 열어 설명서·기준 그림과 비교한다 |

3. `needs_user` 질문(`question.kind`)을 작가에게 보여 주고 결정을 받아 `folio_image { root, op: 'decide', runId, action, feedback?, reason? }`:
   - `image_precheck`: 그리기 전 점검에서 막혔다. `approve`(넘길 이유 `reason`) · `request_revision`(`feedback`, 설명서부터 다시) · `skip`.
   - `image_approval`: 그림(`question.image.path`)과 참고 의견을 작가에게 보여 준다. `approve` · `request_revision`(`feedback`, 그림부터 다시) · `skip`. 고쳐 달라는 요청은 세 번까지다.
   - `image_blocked`: 읽을 수 없는 답이 세 번 왔다. `skip`만 된다.
4. 승인하면 `done { assetId, receiptId, file }`. 엔진이 영수증을 남기고 `assets/<id>.<확장자>`와 `assets/<id>.yaml`을 한 번만 쓴다. 노드 본문은 바꾸지 않는다 — 본문에 놓으려면 작가가 본문에 `![[asset:<id>]]`를 넣고 `folio_run { root, node, mode: 'recommit' }`으로 다시 커밋한다.

- 그림 검토는 언제나 같은 호스트의 자기검토로 기록된다. "독립 검토"라고 부르지 않는다. 참고 의견으로 그림을 스스로 다시 그리지 않는다 — 작가가 `request_revision`할 때만 다시 그린다.
- 대화가 끊겼으면 `folio_image { root, op: 'pending' }`이 열린 그림 실행과 그 질문을 준다(`folio_status`의 `pending`은 노드 실행만 본다). 커밋 도중 끊겼으면(`state: committing`) `folio_image { op: 'resume', runId }`가 끝맺는다.
- 실행 폴더의 그림이나 `.folio/`를 손으로 고치지 않는다. 고친 그림은 검토하지 않고 다시 그리라고 묻고, 커밋 때 바뀌었으면 잠금이 거부한다.

## 검사

| 검사 | 언제 | 알리는 것 |
|---|---|---|
| `image.entities-in-node` | 그리기 전 | 설명서의 엔티티가 노드 본문에 안 나옴(`ENTITY_NOT_IN_NODE`) |
| `image.dialogue-in-text` | 그리기 전 | 설명서의 대사가 본문에 없음(`DIALOGUE_NOT_IN_TEXT`) |
| `image.references-present` | 그리기 전 | 엔티티에 기준 그림이 없음(`REFERENCE_MISSING`) |
| `image.show-conflict` | 그리기 전 | 보여야 할 것과 보이면 안 될 것이 겹침(`SHOW_CONFLICT`) |
| `image.review` | 그린 뒤(모델) | 설명서·기준 그림과 어긋남 |
| `image.asset-refs` | 노드 사실 단계 | 본문의 `![[asset:id]]`가 없는 그림·파일을 가리킴(`ASSET_UNKNOWN`·`ASSET_FILE_MISSING`) |

작가가 원하면 `checks: { image.dialogue-in-text: { severity: block } }`처럼 올린다(`hard`는 안 된다). 그러면 넘기려면 이유가 필요하다.

## 오류일 때

- `IMAGE_PACK_REQUIRED`: 작품 `packs`에 `image`가 없다. 넣을지는 작가가 정한다.
- `ASSET_EXISTS`: 그 그림 id가 이미 있다. 다른 id를 작가에게 받는다. `ASSET_IMMUTABLE`: 같은 이름의 다른 그림 파일이 있다 — 덮지 않는다.
- `IMAGE_RUN_IN_PROGRESS`: 다른 그림 실행이 열려 있다. `pending`으로 이어가거나 작가의 이유를 받아 `skip`.
- `IMAGE_RUN_NOT_AWAITING_MODEL`·`IMAGE_RUN_NOT_AWAITING_USER`: 지금 그 실행이 기다리는 것이 아니다. `pending`으로 지금 질문을 본다.
- 그림 요청의 `retryReason`: `IMAGE_PATH_INVALID`(절대 경로가 아님·없음·링크·보통 파일 아님), `IMAGE_TOO_LARGE`, `IMAGE_TYPE_UNSUPPORTED`(png·jpg·gif·webp만), `BRIEF_*`(설명서 형식). 고쳐 다시 답한다.
- `IMAGE_REVISION_LIMIT`: 고쳐 달라는 요청을 세 번 했다. 승인하거나 `skip`.
- `LOCK_*`(`LOCK_IMAGE_HASH_MISMATCH`·`LOCK_LEDGER_MISMATCH`·`LOCK_APPROVAL_MISSING` 등): 실행 파일이나 옮긴 그림이 손으로 바뀌어 커밋을 거부했다. 아무것도 쓰이지 않았다. 작가에게 알리고 이유를 받아 `skip`한 뒤 새로 그린다.
- `ASSETS_DIR_INVALID`: `assets`가 보통 폴더가 아니다(링크 등). 작가가 고친다.
