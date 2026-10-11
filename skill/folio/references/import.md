# vibelore 작품 가져오기 (`folio_import_vibelore`)

작가가 옛 연재를 옮기려 할 때 `from`(원본 작품)과 `root`(새 작품) 절대 경로를 받는다. 경로를 짐작하지 않는다. 원본은 읽기만 한다.

## 부르기

`folio_import_vibelore { root, from, title? }`

- `from`: `chapters/`가 있는 vibelore 작품 폴더. 폴더 자체가 링크이면 거부한다.
- `root`: 아직 없는 새 폴더. 부모 폴더는 이미 있어야 하고 원본 안이면 안 된다. 성공 결과의 `root`는 실제 경로로 정규화되므로 이후 도구에 그 값을 쓴다.
- `title`: 작품 제목. 생략하거나 빈 값이면 원본 폴더 이름을 쓴다.

엔진은 옆의 숨김 임시 폴더에 작품을 만들고 열 수 있는지 확인한다. 이어 대상 폴더를 배타적으로 예약하고 파일을 배타 hard link로 게시하며 `work.yaml`을 마지막에 놓는다. 호출이 잡은 실패는 자신이 만든 항목만 확인해 정리한다. 다른 프로세스가 항목을 추가하거나 바꾸면 보존한다. 오류의 `details.cleanupPending`이 true이면 `details.target`과 `details.temp` 중 반환된 경로를 각각 확인해 작가에게 알린다. 두 경로가 항상 함께 반환되지는 않는다. 프로세스가 게시 도중 강제 종료되면 `work.yaml` 없는 미완성 폴더가 남을 수 있으므로 작가가 확인해 수동 정리해야 한다.

## 가져오는 것

| vibelore | Linivera |
|---|---|
| `chapters/<n>.md` | 회차 `ep-<n>`(최소 세 자리). 제목은 회차 앞머리 → 아크 계획 → `<n>화` |
| `.vibelore/arcs/<n>.json` | 버린 아크를 제외한 `arc-<n>`(본문은 약속). 빈 아크는 경고 후 제외한다. 아크에 없는 회차는 `arc-imported` 아래에 둔다 |
| `characters/*.md` | 인물 엔티티. 이름·별칭·성별·역할과 본문만 옮긴다 |
| `world/*.md` | `world` 엔티티 |
| `webtoon/episodes/<회차>-<id>/episode.svg` | 해당 회차 그림과 회차 앞머리 `assets`. 폴더가 여럿이면 모두 가져오고 경고한다 |
| `.vibelore/check-receipts/*.json` | 회차의 가져오기 기록에 파일 경로와 hash만 남긴다. 판정은 옮기지 않는다 |

그 밖의 실행 기록·상태·그림 계획은 열지 않는다. 링크, 이름 규칙 밖 항목, 너무 큰 파일 등은 `warnings`에 남긴다. 합계 64MiB, 열거 항목 10,000개, 읽는 파일 5,000개, 읽기부터 성공 응답까지 경고 200개가 한도다. 넘친 경고 상세는 `IMPORT_WARNINGS_TRUNCATED`로 집약한다. 게시 뒤 임시 폴더 정리가 실패하면 경고 상세 하나를 양보해서라도 `IMPORT_TEMP_CLEANUP_PENDING`과 경로를 보여 준다. 개별 글은 2MiB, JSON은 1MiB, SVG는 20MiB까지 읽는다. 총 바이트가 넘으면 `IMPORT_SOURCE_TOO_LARGE`로 중단한다. 작가에게 경고를 보여 준다.

## 가져온 뒤

- 작품은 `serial` 프리셋과 `novel`·`image` 팩을 쓴다. 검사 세트는 프리셋 그대로이고 그림 검사 세트는 작가가 고른다.
- 모든 노드는 `imported`다. `type: import` 기록은 출처 기록이며 Linivera 검사 통과나 커밋 영수증이 아니다. vibelore 판정도 옮겨 말하지 않는다.
- 가져온 노드는 완료한 것으로 쳐서 다음 노드로 다시 고르지 않는다. 새 회차는 `folio_structure { op: 'add' }`로 더한다.
- 작가가 Linivera 검사를 원하는 노드마다 `folio_run { root, node, mode: 'recommit' }`을 쓴다. 현재 본문에 추출·검사·승인·영수증을 거친 뒤 `committed`가 된다.
- 뷰어에서 노드 상태는 "가져옴"으로 보인다. 현재 영수증 상세 화면은 가져오기 출처 필드를 그리지 않고 "커밋 기록이 없다"고 표시한다. 가져오기 기록을 검사 영수증으로 해석하지 않는다.

## 오류일 때

- `IMPORT_ROOT_EXISTS`: 대상이 이미 있다. 새 경로를 받는다.
- `IMPORT_ROOT_INSIDE_SOURCE`: 대상이 원본 안이다. 원본 밖 경로를 받는다.
- `IMPORT_ROOT_INVALID`: 대상의 부모가 없거나 게시 전에 바뀌었다. 부모 경로를 확인한다.
- `TOOL_INPUT_INVALID`: 필수 `from`이 누락됐거나 입력 형식·길이가 맞지 않는다. 오류의 입력 경로를 확인한다.
- `IMPORT_FROM_INVALID`: 준 `from`이 상대 경로이거나 가리키는 폴더가 없고, 링크 또는 파일일 때도 해당한다.
- `IMPORT_FROM_EMPTY`: 가져올 `chapters/<n>.md`가 없다. 원본 작품 폴더를 다시 확인한다.
- `IMPORT_CHAPTER_DUPLICATE`, `IMPORT_ARC_DUPLICATE`: 같은 번호로 해석되는 파일이 둘이다. 오류의 두 출처를 보여 주고 원본을 직접 정리할지 작가가 결정하게 한다.
- `IMPORT_PUBLISH_FAILED`, `IMPORT_TEMP_UNVERIFIED`: `details.cleanupPending: true`이면 반환된 `details.target`(게시 대상)과 `details.temp`(임시 폴더)를 각각 작가에게 알린다. 대상만 남고 임시 폴더는 이미 정리됐을 수도 있다. 경로를 확인하기 전에는 재호출하거나 지우지 않는다.
- 성공 결과의 `IMPORT_TEMP_CLEANUP_PENDING` 경고: 작품은 이미 게시됐다. 남은 임시 폴더 경로를 작가에게 알린다.
