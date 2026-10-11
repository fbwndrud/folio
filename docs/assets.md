# 그림을 작품에 연결하기

그림은 Linivera를 사용하는 AI 프로그램(호스트)이 만든다. Linivera는 그림의 설명서,
결과 파일, 버전, 검토와 작가의 결정을 보관한다. 제공자가 달라도 같은 도구를 사용한다.
제공자별 API 키나 모델은 호스트에서 설정한다.

## 작가는 이렇게 부탁한다

> 이 펼침면에 넣을 그림을 만들자. 먼저 꼭 나와야 할 것과 인물의 모습을 정리해 줘.
> 지금 프로그램에서 그림을 만들 수 있으면 그 기능을 써 줘.
> 결과를 Linivera에 등록하고, 설명과 다른 점을 보여 줘. 내가 보고 결정할게.

작가는 자산 ID나 hash를 외울 필요가 없다. 호스트가 도구 응답을 이어 사용한다.

1. **설명 정하기**: 용도, 꼭 보일 것, 인물·물건의 고정 모습과 피할 것을 적는다.
2. **그림 만들기**: 호스트가 자신의 이미지 도구를 사용한다.
3. **결과 보관하기**: 호스트가 Linivera 서버에서 읽을 수 있는 파일을 전달한다.
   Linivera는 작품 안에 사본을 저장한다. 제공자의 이미지 ID는 선택 사항이다.
4. **그림 확인하기**: 호스트가 그 사본을 보고 설정·필수 내용·시각적 품질을 검토한다.
5. **작가 결정하기**: 결과와 지적을 보고 승인하거나 고칠 점을 말한다.
6. **작품에 연결하기**: 사용할 펼침면·장면에 연결한다. 교체하면 다시 검토하고 결정한다.

그림 도구가 없으면 설명서만 남겨 다음에 이어간다. MCP 연결만으로 그림이 생기지는 않는다.
URI만 전달한 결과는 ‘외부 참조만 있음’이다. Linivera는 다운로드하지 않으며 승인도 받지 않는다.
호스트가 파일을 확보해 다시 등록해야 한다. 원고는 설명서만 있는 상태에서도 쓸 수 있다.
원고 저장, 그림 승인, 지면을 포함한 책 제작 완료는 각각 확인한다.

## 도구를 연결하는 사람을 위한 규약

`folio_assets`에 모든 작업이 있다. `root`는 작가가 선택한 작품 폴더다.
아래 자리표시자는 실제 환경에서 받은 값으로 바꾼다. 특정 컴퓨터 경로를 가정하지 않는다.

```json
{"root":"<작품 폴더>","op":"add","id":"spread-01-art","title":"첫 그림","brief":{"description":"창가에서 파란 공을 찾는 주인공","entities":[]}}
{"root":"<작품 폴더>","op":"put","id":"spread-01-art","expectedRev":"<add 응답 rev>","path":"<서버에서 읽을 수 있는 파일의 절대 경로>","mediaType":"image/png","origin":{"provider":"<선택적 출처>","imageId":"<선택적 제공자 ID>"}}
```

`brief.entities`는 작품에 존재하는 엔티티 ID 목록이다.
모든 쓰기는 **직전 응답의 `asset.rev`**를 `expectedRev`로 전달한다.
`path`와 `uri` 중 하나만 보낸다. 파일은 1바이트~20MiB 일반 파일이어야 한다.
지원 MIME 값은 `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `image/avif`다.
Linivera는 파일 형식·해상도를 디코딩해 검사하지 않는다. mediaType은 호스트가 전달한 정보다.
`contentVerified: true`는 저장한 바이트가 기록한 hash와 같다는 뜻이다.
그림의 품질·시각적 사실·정상 렌더링을 인증한다는 뜻이 아니다.
선택적인 입력 `contentHash`가 파일 hash와 다르면 인계를 거부한다.

`asset.output.file`은 작품의 `assets/` 기준 상대 경로다.
호스트는 그 사본과 설명서·엔티티를 확인한 다음 검토 결과를 제출한다.

```json
{"root":"<작품 폴더>","op":"review","id":"spread-01-art","expectedRev":"<put 응답 rev>","contentHash":"<output.contentHash>","checked":["asset.fixed-facts","asset.brief-fit","asset.quality"],"findings":[]}
{"root":"<작품 폴더>","op":"decide","id":"spread-01-art","expectedRev":"<review 응답 rev>","reviewId":"<review.reviewId>","action":"approve"}
{"root":"<작품 폴더>","op":"attach","id":"spread-01-art","expectedRev":"<decide 응답 rev>","nodeIds":["<존재하는 펼침면 ID>"]}
```

검토 목록은 고정이며 빠뜨리거나 중복 제출할 수 없다. 지적은 `checkId`, `code`, `message`,
선택적인 `location`을 담는다. 등급은 Linivera가 정한다.

| 검사 | 등급 | 작가 결정 |
|---|---|---|
| `asset.fixed-facts` | hard | 고정 설정 충돌은 이유가 있어도 승인 불가 |
| `asset.brief-fit` | block | 승인하려면 작가의 `reason` 필요 |
| `asset.quality` | advisory | 참고 의견 표시; 자동 교체·재생성하지 않음 |

수정 요청은 `action: request_revision`, 작가의 `feedback`으로 기록한다.
검토는 항상 같은 호스트의 자기검토다. `review` 호출이 검토를 대신 수행하지는 않는다.
그림을 실제로 볼 수 없으면 빈 지적을 보내 ‘문제 없음’으로 만들지 않는다.

## 바꾸고 이어가기

- `list`: 상태와 미완료 자산. `get { id }`: 설명서·결과·검토·결정·직접 사용 위치·이력.
- `update { id, expectedRev, brief, title? }`: 설명서 새 버전. 같은 그림이어도 옛 승인 해제.
- `put`: 결과 새 버전. 제공자가 달라도 같은 Linivera ID를 유지한다. 옛 파일과 기록은 남는다.
- `attach`: 현재 연결 목록을 통째로 기록한다. `[]`로 해제한다. 본문을 자동 수정하지 않는다.
  기존 원고 앞머리 `assets`와 `![[asset:id]]` 참조도 함께 읽는다.
- 자산 변경·새 연결·해제는 관련 커밋 원고의 `stale`에 표시된다.
  원고 재검사(`folio_run`, `mode: recheck`)를 마치면 최신 자산 참조를 기록한다.
  원고 재검사가 그림 승인까지 대신하지는 않는다.

열린 원고 실행이 있으면 자산 쓰기를 거부한다. 그 실행을 마친 뒤 진행한다.
오래된 rev·검토 ID는 현재 결과를 다시 읽고 작가에게 보여 준 후 갱신한다.
파일 손실·내용 변경은 승인을 풀고 연결된 원고 저장을 막는다. 도구를 꺼도 이 잠금은 유지된다.
손상된 사본을 덮어써 숨기지 말고 백업을 확인하거나 새 결과를 `put`한다.

기존 YAML 자산은 읽기 전용으로 호환한다. 관리하려면 새 ID로 등록한다.
관리 자산의 설명서는 일괄 이름 바꾸기로 직접 쓰지 않는다. 해당 변경 후보를 제외하고
`update`로 새 설명서를 기록한다. 엔티티 ID 연결은 이름 변경 뒤에도 유지된다.
백업에는 `assets/`와 `.folio/`를 함께 포함한다. 내부 기록장은 직접 수정하지 않는다.

[그림책·동화](storybooks.md) · [연결 안내](connect.md) · [합성 예제](../examples/README.md)
