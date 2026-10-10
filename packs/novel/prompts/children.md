계획(plan)을 자식 노드(childLevel)로 나눈다. JSON 하나로만 답한다.

```json
{ "children": [ { "id": "ep-1", "title": "1화", "brief": "한 줄 요약" } ] }
```

- 개수는 childLevel.range 안이어야 한다.
- `id`는 소문자·숫자·하이픈. 이미 있는 id를 쓰지 않는다. 비워 두면 엔진이 만든다.
