# vibelore-work (합성 fixture)

vibelore 작품 폴더 모양만 흉내 낸 합성 자료다. 실제 작품 글이 아니다. M7b 가져오기 테스트가 읽기만 한다 — 고치지 않는다.

- `chapters/001.md`~`004.md`: 회차. 004 는 어느 아크에도 없다(가져온 회차 아크로 간다).
- `.vibelore/arcs/1.json`: 버린(rejected) 아크 — 가져오지 않는다. `2.json`: 1~3화 아크(5화까지 계획, 4·5화 글은 없음).
- `.vibelore/check-receipts/`: 1화(passed)·2화(failed) 검사 영수증. 판정은 가져오지 않고 파일 hash 만 남긴다.
- `webtoon/episodes/`: 1화 그림 폴더 둘(둘 다 가져오고 경고), 2화는 svg 없이 계획만.
- `.vibelore/runs/`: 가져오지 않는 내부 상태.
